/**
 * feature-review.ts
 *
 * The feature half of `/review-code --feature <feature>` — the counterpart of bug-review.ts,
 * on the same review machinery (the same command, `code-reviewer` + `performance-reviewer`,
 * `platform-review`, platform lanes, standards and severity model) and the same findings model,
 * record format and findings fingerprint, imported from bug-review.ts rather than restated:
 *
 *   context  read-only. Are the feature's planning documents approved and their chain current,
 *            and is every task the pull request's code belongs to complete (implemented and
 *            developer-tested)? Returns what the review reads — the documents, the scoped tasks'
 *            rows, acceptance criteria and developer-testing evidence, the design reference with
 *            its Figma file key and node id, the PR scope — and the binding: exactly what is
 *            being reviewed.
 *   record   writes the one review record for the feature, docs/reviews/<feature>/review.md,
 *            atomically. Refuses when the reviewed state moved since `context`, and refuses a
 *            UI-reference check that claims conformance unless the design read is proven by
 *            ENG-003 evidence of the exact Figma file and node (`verifyDesign`).
 *   verify   read-only. Is the record still about the PR's code, the approved documents, the
 *            design reference and the scoped tasks' state? `fresh` | `stale` | `missing` |
 *            `invalid`, with reasons.
 *
 * The review is bound to the intended pull request's code (scripts/pr-scope.ts) — its files and
 * their content, and the target branch's merge base — not to HEAD: a commit of exactly the
 * reviewed content keeps it fresh, any change to a reviewed file, a file added to or removed
 * from the PR, or a moved merge base makes it stale. The planning documents are bound
 * separately, by their bodies and approval, so writing the record (or any other Ono document)
 * never invalidates it; progress on a task outside the PR's scope does not either.
 *
 * The record approves nothing and introduces no approval: Blocking findings stop the flow
 * (/pre-pr and the PR-readiness contract refuse them), Major, Minor and Nit findings are reported.
 * Never writes task state, never commits, reads no clock — the caller supplies `generated_at`.
 *
 * Always exits 0 and prints one JSON object; callers branch on `outcome` / `status`.
 *
 *   node --no-warnings scripts/feature-review.ts context --root <TARGET_ROOT> --feature <feature> [--doc <path>] [--base <branch>]
 *   node --no-warnings scripts/feature-review.ts record  --root <TARGET_ROOT> --feature <feature> --review <review.json> [--design-evidence <evidence.json>] [--doc <path>] [--base <branch>]
 *   node --no-warnings scripts/feature-review.ts verify  --root <TARGET_ROOT> --feature <feature> [--doc <path>] [--base <branch>]
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { createHash } from "crypto";
import {
  SEVERITIES, CHECK_STATUSES, oneLine, normalizeFinding, normalizeCheck, compareFindings, renderFinding, parseFinding, findingProblem, findingsFingerprint,
  type Finding, type Check,
} from "./bug-review.ts";
import { canonical } from "./qa-release-gate.ts";
import { fingerprintBody, splitDocument } from "./migrate-planning-doc.ts";
import { chainStatus, rowCells, evidenceFingerprint, designReferenceState, loadEvidenceFile, isExternalRef } from "./task-resume.ts";
import { readTaskState, stateFilePath } from "./task-state.ts";
import { prScope, codeMap, diffMaps, attribute, fingerprintEntries, type PrScope } from "./pr-scope.ts";
import { resolveFeatureDocs, isFeatureDocPath, reviewRecordPath, type FeatureDoc, type ResolvedFeatureDocs } from "./feature-docs.ts";
import { nextCommand } from "./next-command.ts";
import { writeStdout } from "./write-output.ts";

const sha = (s: string | Buffer): string => `sha256:${createHash("sha256").update(s).digest("hex")}`;

export const FEATURE_REVIEW_SCHEMA = 1;
/** The four shared feature checks, and the rule id a finding raised by each one cites. */
export const FEATURE_CHECKS: Record<string, string> = {
  "acceptance-criteria": "FEATURE-CHECK-ACCEPTANCE",
  "design-conformance": "FEATURE-CHECK-DESIGN",
  "ui-reference": "FEATURE-CHECK-UI-REFERENCE",
  "developer-testing": "FEATURE-CHECK-TESTS",
};
const FEATURE_CHECK_STATUSES = [...CHECK_STATUSES, "not-applicable"];
export const DESIGN_ACCESS_STATUSES = ["retrieved", "unavailable", "denied", "not-attempted"] as const;
export { reviewRecordPath }; // owned by feature-docs.ts, which reads the record to resolve a reviewed Task Breakdown

const RECORD_FIELDS = [
  "review_schema", "work_type", "feature", "base_branch", "merge_base", "scope_fingerprint", "fa_fingerprint", "dd_fingerprint", "tb_fingerprint",
  "dev_plan_fingerprint", "design_fingerprint", "task_state_fingerprint", "scoped_tasks", "ui_conformance", "design_verification", "design_evidence_fingerprint", "base_ref", "findings_fingerprint",
  "blocking_count", "major_count", "minor_count", "nit_count", "reviewed_by", "generated_at",
] as const;
const BINDING_FIELDS = ["base_branch", "merge_base", "scope_fingerprint", "fa_fingerprint", "dd_fingerprint", "tb_fingerprint", "dev_plan_fingerprint", "design_fingerprint", "task_state_fingerprint", "scoped_tasks"] as const;
const DESIGN_KEYS = ["design_reference_status", "design_reference_type", "design_reference", "figma_link"] as const;

import { figmaTarget } from "./figma-ref.ts";
export { figmaTarget };

/* ------------------------------------------------------------------ state */

type Stop = { ok: false; outcome: string; reason: string; [k: string]: unknown };

interface Loaded {
  ok: true;
  docs: ResolvedFeatureDocs;
  scope: PrScope;
  binding: Record<(typeof BINDING_FIELDS)[number], string>;
  map: Record<string, string>;
  scoped: string[];
  unattributed: string[];
  byTask: Record<string, string[]>;
  rawTasks: Record<string, any>;
  view: ReturnType<typeof readTaskState>;
}

function readRawTasks(root: string, feature: string): Record<string, any> {
  const p = stateFilePath(root, feature);
  if (!existsSync(p)) return {};
  try {
    const j = JSON.parse(readFileSync(p, "utf-8"));
    return j && typeof j.tasks === "object" && j.tasks !== null ? j.tasks : {};
  } catch {
    return {};
  }
}

const bodyFp = (d: FeatureDoc | null): string => (d === null ? "none" : fingerprintBody(d.buf) ?? "unreadable");

/** The design reference the review is judged against: the breakdown's four fields and the analysis's recorded design fingerprint. */
function designFingerprint(docs: ResolvedFeatureDocs): string {
  const fields: Record<string, string | null> = {};
  for (const k of DESIGN_KEYS) fields[k] = docs.tb?.fm[k] ?? docs.dd?.fm[k] ?? docs.fa?.fm[k] ?? null;
  return sha(canonical({ fields, fa_design_reference_fingerprint: docs.fa?.fm.design_reference_fingerprint ?? null }));
}

/**
 * Everything the review is bound to, computed now. Separated from `context`'s gates so `verify`
 * can say exactly what moved even when a gate would now refuse.
 */
function load(req: { root: string; feature: string; doc?: string | null; base?: string | null }): Loaded | Stop {
  const docs = resolveFeatureDocs(req.root, req.feature, req.doc ?? null);
  if (!docs.ok) return { ok: false, outcome: `FEATURE_DOCS_${docs.outcome}`, reason: docs.reason, ...(docs.candidates ? { candidates: docs.candidates } : {}) };
  if (docs.fa === null || docs.dd === null || docs.tb === null) {
    const missing = [docs.fa === null && "Feature Analysis", docs.dd === null && "Detailed Design", docs.tb === null && "Task Breakdown"].filter(Boolean).join(", ");
    return { ok: false, outcome: "FEATURE_PLAN_MISSING", reason: `no ${missing} for feature "${req.feature}"` };
  }
  const scope = prScope(docs.root, { base: req.base ?? null, isDoc: isFeatureDocPath(docs) });
  if (!scope.ok) return { ok: false, outcome: "FEATURE_SCOPE_UNAVAILABLE", reason: `the pull request's scope could not be computed: ${scope.reason}`, scope_outcome: scope.outcome };
  const map = codeMap(scope);
  const rawTasks = readRawTasks(docs.root, req.feature);
  const { byTask, unattributed } = attribute(Object.keys(map), rawTasks);
  const scoped = Object.keys(byTask).sort();
  const scopedState: Record<string, unknown> = {};
  for (const id of scoped) scopedState[id] = rawTasks[id];
  return {
    ok: true,
    docs,
    scope,
    map,
    scoped,
    unattributed,
    byTask,
    rawTasks,
    view: readTaskState(docs.root, req.feature, docs.tb.abs),
    binding: {
      base_branch: scope.base.branch,
      merge_base: scope.merge_base,
      scope_fingerprint: scope.code_fingerprint,
      fa_fingerprint: bodyFp(docs.fa),
      dd_fingerprint: bodyFp(docs.dd),
      tb_fingerprint: bodyFp(docs.tb),
      dev_plan_fingerprint: bodyFp(docs.devPlan),
      design_fingerprint: designFingerprint(docs),
      task_state_fingerprint: sha(canonical(scopedState)),
      scoped_tasks: scoped.join(",") || "none",
    },
  };
}

/* ---------------------------------------------------------------- context */

export function featureReviewContext(req: { root: string; feature: string; doc?: string | null; base?: string | null }): Record<string, any> {
  const l = load(req);
  if (!l.ok) return l;
  const { docs } = l;
  const f = req.feature;
  const unapproved = [docs.fa, docs.dd, docs.tb, docs.devPlan].filter((d): d is FeatureDoc => d !== null && !d.approved);
  if (unapproved.length > 0) {
    return { ok: false, outcome: "FEATURE_PLAN_NOT_APPROVED", reason: `not approved: ${unapproved.map((d) => `${d.rel} (status: ${d.status ?? "none"})`).join(", ")} — approval is a human step`, waiting_on: unapproved.map((d) => `${d.rel}:${d.status_line ?? 1}`) };
  }
  const chain = chainStatus(docs.root, docs.tb!.abs);
  if (chain.earliestStale !== null) {
    return { ok: false, outcome: "FEATURE_UPSTREAM_STALE", reason: chain.summary, next_command: nextCommand(chain.earliestStale.command.replace(/^\//, ""), f) };
  }
  if (Object.keys(l.map).length === 0) {
    return { ok: false, outcome: "FEATURE_NOTHING_TO_REVIEW", reason: `the pull request from ${l.scope.branch ?? "this branch"} to ${l.scope.base.branch} has no code change` };
  }
  // Testing before review: every task the PR's code belongs to is complete (and therefore
  // developer-tested — task-state refuses `complete` without a developer-testing decision), and
  // no task of the feature is still mid-implementation.
  const inProgress = Object.entries(l.view.tasks).filter(([, t]) => t.state === "in-progress").map(([id]) => id);
  const incomplete = l.scoped.filter((id) => l.view.tasks[id]?.deterministicProof !== true);
  const pending = [...new Set([...inProgress, ...incomplete])].sort();
  if (pending.length > 0) {
    return { ok: false, outcome: "FEATURE_TESTING_REQUIRED", reason: `task(s) ${pending.join(", ")} are not complete — implementation and developer testing come before the review`, next_command: nextCommand("implement-task", `${f} ${pending[0]}`) };
  }
  if (l.scoped.length === 0) {
    const first = Object.keys(l.view.tasks)[0] ?? "T1";
    return { ok: false, outcome: "FEATURE_TASK_STATE_MISSING", reason: "no completed task of this feature recorded any of the pull request's files — nothing implemented through /implement-task is in scope", unattributed: l.unattributed, next_command: nextCommand("implement-task", `${f} ${first}`) };
  }

  const text = docs.tb!.buf.toString("utf-8");
  const design: Record<string, string | null> = {};
  for (const k of DESIGN_KEYS) design[k] = docs.tb!.fm[k] ?? null;
  const figma = figmaTarget(design.figma_link);
  return {
    ok: true,
    outcome: "FEATURE_REVIEW_READY",
    work_id: `feature:${f}`,
    record_path: reviewRecordPath(f),
    documents: {
      feature_analysis: { path: docs.fa!.rel, source_link: docs.fa!.fm.source_link ?? null },
      dd: { path: docs.dd!.rel },
      task_breakdown: { path: docs.tb!.rel },
      dev_plan: docs.devPlan ? { path: docs.devPlan.rel } : null,
    },
    design: {
      ...design,
      figma,
      /** The reads the review makes when the design is in Figma: the Figma MCP's get_design_context and get_screenshot for the node. */
      required_reads: design.design_reference_status === "not_required" ? [] : figma !== null ? ["get_design_context", "get_metadata", "get_screenshot"] : design.design_reference ? ["read the recorded reference"] : [],
      /** What proves the read (ENG-003, as /analyze-feature saves it): one JSON file outside the repository, passed to `record --design-evidence`. The screenshot is for comparison only — a rendering is not stable evidence. */
      evidence_format: design.design_reference_status === "not_required" ? null : { source: figma?.url ?? design.design_reference, parts: figma !== null ? ["get_design_context", "get_metadata"] : ["content"] },
    },
    scope: {
      base: l.scope.base,
      merge_base: l.scope.merge_base,
      branch: l.scope.branch,
      head: l.scope.head,
      code_files: Object.keys(l.map),
      unattributed: l.unattributed,
      by_task: l.byTask,
      planning_docs_in_scope: l.scope.files.filter((x) => x.class === "docs").map((x) => x.path),
    },
    tasks: l.scoped.map((id) => {
      const t = l.rawTasks[id] ?? {};
      return { id, cells: rowCells(text, id), filesChanged: t.filesChanged ?? [], acceptanceCriteria: t.acceptanceCriteria ?? [], validation: t.validation ?? [], developerTesting: t.developerTesting ?? null, verificationDebt: t.verificationDebt ?? [] };
    }),
    checks: Object.keys(FEATURE_CHECKS),
    binding: l.binding,
  };
}

/* ------------------------------------------------------ design verification */

/**
 * Whether the design was actually read, decided from evidence — never from the reviewer's own
 * word. The evidence is the ENG-003 shape /analyze-feature already saves for a design read,
 * `{ source, parts: [{ name: "get_design_context", content }, { name: "get_metadata", content }] }`,
 * verified by task-resume.ts `evidenceFingerprint`, which requires the exact source — the same
 * Figma file key AND node id (or the file root when the reference names no node).
 *
 *   verified          evidence of the recorded reference, matching the design the analysis recorded
 *   local-reference   the reference is in the repository (a file, an existing screen) and read there
 *   stale             valid evidence, but the design differs from what the analysis recorded
 *   wrong-node        evidence of another node of the same Figma file
 *   wrong-file        evidence of another Figma file
 *   invalid-evidence  evidence that is malformed or not of the recorded reference
 *   failed            the read was attempted and failed (an MCP error, access denied)
 *   missing-evidence  a read is claimed, but no evidence was supplied
 *   not-performed     no read was attempted
 *   missing-reference the feature changes UI but records no design reference
 *   not-applicable    no user-facing UI change
 */
export type DesignVerification = "verified" | "local-reference" | "stale" | "wrong-node" | "wrong-file" | "invalid-evidence" | "failed" | "missing-evidence" | "not-performed" | "missing-reference" | "not-applicable";

export function verifyDesign(root: string, design: Record<string, string | null>, faFields: Record<string, unknown> | null, evidencePath: string | null | undefined, access: Array<{ status: string }>): { state: DesignVerification; detail: string; evidence_fingerprint: string | null } {
  const out = (state: DesignVerification, detail: string, evidence_fingerprint: string | null = null) => ({ state, detail, evidence_fingerprint });
  if (design.design_reference_status === "not_required") return out("not-applicable", "no user-facing UI change");
  const external = [design.figma_link, design.design_reference].find((v): v is string => typeof v === "string" && v !== "" && isExternalRef(v));
  if (external === undefined) {
    return design.design_reference ? out("local-reference", `${design.design_reference} is read in the repository`) : out("missing-reference", "the feature changes UI but records no design reference");
  }
  if (!evidencePath) {
    if (access.some((a) => a.status === "unavailable" || a.status === "denied")) return out("failed", "the design read was attempted and failed");
    if (access.some((a) => a.status === "retrieved")) return out("missing-evidence", "a design read is reported, but no evidence of it was supplied");
    return out("not-performed", "the design was not read");
  }
  const ev = loadEvidenceFile(evidencePath) as any;
  if (ev && typeof ev.error === "string") return out("failed", ev.error);
  const r = evidenceFingerprint(ev, external);
  if (r.status !== "ok") {
    const want = figmaTarget(external);
    const got = typeof ev?.source === "string" ? figmaTarget(ev.source) : null;
    if (want !== null && got !== null && got.file_key !== want.file_key) return out("wrong-file", `the evidence is of Figma file ${got.file_key}, not ${want.file_key}`);
    if (want !== null && got !== null && got.node_id !== want.node_id) return out("wrong-node", `the evidence is of node ${got.node_id ?? "(file root)"}, not ${want.node_id ?? "(file root)"}`);
    return out("invalid-evidence", r.detail);
  }
  const recorded = faFields ? String(faFields.design_reference_fingerprint ?? "") : "";
  const now = faFields ? designReferenceState(root, faFields, ev).fingerprint : null;
  if (recorded !== "" && recorded !== "null" && now !== null && now !== recorded) return out("stale", "the design read now differs from the design the Feature Analysis recorded — the specification and the design have drifted", r.fingerprint);
  return out("verified", r.detail, r.fingerprint);
}

/* ----------------------------------------------------------------- record */

const refuse = (code: string, reason: string, extra: Record<string, unknown> = {}) => ({ ok: false, outcome: "FEATURE_REVIEW_REFUSED", code, reason, ...extra });

interface DesignAccess {
  reference: string;
  node_id: string | null;
  status: (typeof DESIGN_ACCESS_STATUSES)[number];
  note: string;
}

function render(f: string, b: Record<string, string>, findings: Finding[], checks: Check[], access: DesignAccess[], ctx: Record<string, any>, ui: string, meta: { reviewed_by: string; generated_at: string }, fp: string, map: Record<string, string>): string {
  const count = (s: string) => findings.filter((x) => x.severity === s).length;
  const of = (s: string) => findings.filter((x) => x.severity === s);
  const list = (xs: Finding[]) => (xs.length ? xs.map(renderFinding).join("\n") : "None.");
  const front: Record<string, string | number> = {
    review_schema: FEATURE_REVIEW_SCHEMA, work_type: "feature", feature: f, ...b, ui_conformance: ui, findings_fingerprint: fp,
    blocking_count: count("blocking"), major_count: count("major"), minor_count: count("minor"), nit_count: count("nit"),
    reviewed_by: meta.reviewed_by, generated_at: meta.generated_at,
  };
  const ordered = [...checks].sort((a, c) => Object.keys(FEATURE_CHECKS).indexOf(a.id) - Object.keys(FEATURE_CHECKS).indexOf(c.id));
  const testing = (ctx.tasks as any[]).map((t) => {
    const dt = t.developerTesting;
    const parts: string[] = [];
    for (const run of dt?.runs ?? []) parts.push(`ran \`${run.command}\` — ${run.result}`);
    if (dt?.justification) parts.push(`no test required: ${oneLine(dt.justification)}`);
    for (const d of t.verificationDebt ?? []) if (d.ruleId === "VERIFY-4") parts.push(`VERIFY-4 debt: ${oneLine(d.requiredVerification)}`);
    return `- \`${t.id}\`: ${parts.length ? parts.join("; ") : "no developer testing recorded"}`;
  });
  return [
    "---",
    ...RECORD_FIELDS.map((k) => `${k}: ${front[k]}`),
    "---",
    "",
    `# Feature Review — ${f}`,
    "",
    "## Review Summary",
    "",
    `Reviewed the pull request from \`${ctx.scope.branch ?? "this branch"}\` to \`${b.base_branch}\` (merge base \`${b.merge_base}\`) for tasks ${b.scoped_tasks}: ${front.blocking_count} blocking, ${front.major_count} major, ${front.minor_count} minor, ${front.nit_count} nit. UI conformance: ${ui}. This record is review evidence; it approves nothing.`,
    "",
    "## Specification Reviewed Against",
    "",
    `- Feature Analysis: \`${ctx.documents.feature_analysis.path}\`${ctx.documents.feature_analysis.source_link ? ` (source: ${ctx.documents.feature_analysis.source_link})` : ""}`,
    `- Detailed Design: \`${ctx.documents.dd.path}\``,
    `- Task Breakdown: \`${ctx.documents.task_breakdown.path}\``,
    ...(ctx.documents.dev_plan ? [`- Dev Plan: \`${ctx.documents.dev_plan.path}\``] : []),
    "",
    "## Blocking Findings",
    "",
    list(of("blocking")),
    "",
    "## Major Findings",
    "",
    list(of("major")),
    "",
    "## Other Findings",
    "",
    "### Minor",
    "",
    list(of("minor")),
    "",
    "### Nit",
    "",
    list(of("nit")),
    "",
    "## Feature-specific Checks",
    "",
    "| Check | Status | Note |",
    "|---|---|---|",
    ...ordered.map((c) => `| ${c.id} | ${c.status} | ${c.note} |`),
    "",
    "## Design References Accessed",
    "",
    "| Reference | Node | Status | Note |",
    "|---|---|---|---|",
    ...(access.length ? access.map((a) => `| ${a.reference} | ${a.node_id ?? "—"} | ${a.status} | ${a.note} |`) : ["| — | — | not-attempted | no design reference was read |"]),
    "",
    "## Developer Testing Evidence",
    "",
    ...(testing.length ? testing : ["None."]),
    "",
    "## Reviewed Scope",
    "",
    "| File | Blob |",
    "|---|---|",
    ...Object.keys(map).sort().map((p) => `| \`${p}\` | ${map[p]} |`),
    "",
    "## Unattributed Files",
    "",
    ...(ctx.scope.unattributed.length ? ctx.scope.unattributed.map((p: string) => `- \`${p}\``) : ["None."]),
    "",
  ].join("\n");
}

export function writeFeatureReview(req: { root: string; feature: string; review: string; doc?: string | null; base?: string | null; designEvidence?: string | null }): Record<string, any> {
  const ctx = featureReviewContext(req);
  if (!ctx.ok) return { ...ctx, code: ctx.outcome };
  let input: Record<string, any>;
  try {
    input = JSON.parse(readFileSync(req.review, "utf-8"));
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("not a JSON object");
  } catch (e) {
    return refuse("INVALID_ARGUMENT", `--review ${req.review} is not a readable JSON review: ${(e as Error).message}`);
  }
  const moved = BINDING_FIELDS.filter((k) => input.binding?.[k] !== ctx.binding[k]);
  if (moved.length > 0) return refuse("REVIEW_STATE_MOVED", `the reviewed state changed since the review context was read (${moved.join(", ")}) — review again`, { moved });

  const reviewedBy = oneLine(input.reviewed_by);
  if (reviewedBy === "" || reviewedBy.length > 200 || /[#\r\n]/.test(String(input.reviewed_by))) return refuse("INVALID_ARGUMENT", "reviewed_by names the reviewers: one plain line, no '#'");
  const at = String(input.generated_at ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(at)) return refuse("INVALID_ARGUMENT", "generated_at is a UTC timestamp (YYYY-MM-DDTHH:MM:SSZ), supplied by the caller");

  if (!Array.isArray(input.findings)) return refuse("INVALID_FINDING", "findings is a list (empty when there are none)");
  const findings: Finding[] = input.findings.map((x: Record<string, unknown>) => normalizeFinding(x ?? {}));
  for (const x of findings) {
    const p = findingProblem(x);
    if (p !== null) return refuse("INVALID_FINDING", p, { finding: x });
  }

  if (!Array.isArray(input.checks)) return refuse("INVALID_CHECKS", `checks lists the feature-specific checks: ${Object.keys(FEATURE_CHECKS).join(", ")}`);
  const checks: Check[] = input.checks.map((c: Record<string, unknown>) => normalizeCheck(c ?? {}));
  if (JSON.stringify(checks.map((c) => c.id).sort()) !== JSON.stringify(Object.keys(FEATURE_CHECKS).sort())) return refuse("INVALID_CHECKS", `exactly one result per feature-specific check: ${Object.keys(FEATURE_CHECKS).join(", ")}`);
  for (const c of checks) {
    if (!FEATURE_CHECK_STATUSES.includes(c.status)) return refuse("INVALID_CHECKS", `check ${c.id}: status is one of ${FEATURE_CHECK_STATUSES.join(", ")}`);
    if (c.status === "not-applicable" && c.id !== "ui-reference") return refuse("INVALID_CHECKS", `check ${c.id}: only ui-reference can be not-applicable`);
    if (c.note === "" || c.note.includes("|")) return refuse("INVALID_CHECKS", `check ${c.id}: a one-line note without "|" is required`);
    if ((c.status === "concern") !== findings.some((x) => x.rule === FEATURE_CHECKS[c.id])) {
      return refuse("INVALID_CHECKS", `check ${c.id}: "concern" exactly when a finding cites ${FEATURE_CHECKS[c.id]} — a concern is filed as a finding, and a check with a finding filed against it does not pass`);
    }
  }

  // Figma is the source of truth for UI: conformance is claimed only after the design was read.
  const rawAccess = input.design_access ?? [];
  if (!Array.isArray(rawAccess)) return refuse("INVALID_DESIGN_ACCESS", "design_access lists each design reference the review tried to read");
  const access: DesignAccess[] = rawAccess.map((a: any) => ({ reference: oneLine(a?.reference), node_id: a?.node_id == null || oneLine(a.node_id) === "" ? null : oneLine(a.node_id), status: oneLine(a?.status) as DesignAccess["status"], note: oneLine(a?.note) || "—" }));
  for (const a of access) {
    if (a.reference === "" || [a.reference, a.node_id ?? "", a.note].some((v) => v.includes("|"))) return refuse("INVALID_DESIGN_ACCESS", "each design_access entry names its reference, without '|'");
    if (!(DESIGN_ACCESS_STATUSES as readonly string[]).includes(a.status)) return refuse("INVALID_DESIGN_ACCESS", `design_access status is one of ${DESIGN_ACCESS_STATUSES.join(", ")}`);
  }
  const ui = checks.find((c) => c.id === "ui-reference")!;
  const d = ctx.design;
  const notRequired = d.design_reference_status === "not_required";
  if (notRequired !== (ui.status === "not-applicable")) {
    return refuse("INVALID_CHECKS", notRequired ? "check ui-reference: the feature records no user-facing UI change (design_reference_status: not_required) — it is not-applicable" : "check ui-reference: the feature has a design reference — not-applicable is only for features with no UI change");
  }
  const lDocs = resolveFeatureDocs(req.root, req.feature, req.doc ?? null);
  const dv = verifyDesign(req.root, d, lDocs.ok && lDocs.fa ? lDocs.fa.fm : null, req.designEvidence, access);
  if (ui.status === "pass" && dv.state !== "verified" && dv.state !== "local-reference") {
    return refuse("INVALID_CHECKS", `check ui-reference: conformance cannot pass — design verification is ${dv.state} (${dv.detail}). Supply the design evidence (--design-evidence), or record not-verifiable with the limitation`, { design_verification: dv.state });
  }
  const devTesting = checks.find((c) => c.id === "developer-testing")!;
  if (devTesting.status === "pass" && (ctx.tasks as any[]).some((t) => t.developerTesting === null)) {
    return refuse("INVALID_CHECKS", "check developer-testing: a scoped task has no recorded developer-testing decision — record not-verifiable (or concern)");
  }
  const uiConformance = ui.status === "not-applicable" ? "not-applicable" : ui.status === "pass" ? "verified" : ui.status === "concern" ? "concern" : "not-verified";

  const l = load(req);
  if (!l.ok) return refuse("REVIEW_STATE_MOVED", l.reason);
  for (const p of Object.keys(l.map)) if (/[|`]/.test(p)) return refuse("UNSUPPORTED_PATH", `${p}: a reviewed path may not contain '|' or a backtick — the record could not read it back`);
  const sorted = [...findings].sort(compareFindings);
  const fp = findingsFingerprint(findings as any, checks as any);
  const text = render(req.feature, { ...ctx.binding, design_verification: dv.state, design_evidence_fingerprint: dv.evidence_fingerprint ?? "none", base_ref: l.scope.base.ref }, sorted, checks, access, ctx, uiConformance, { reviewed_by: reviewedBy, generated_at: at }, fp, l.map);
  const abs = join(l.docs.root, ctx.record_path);
  const tmp = `${abs}.feature-review.tmp`;
  try {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(tmp, text);
    renameSync(tmp, abs);
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best effort */
    }
    return refuse("WRITE_FAILED", `could not write ${ctx.record_path}: ${(e as Error).message}`);
  }
  const count = (s: string) => findings.filter((x) => x.severity === s).length;
  const counts = { blocking: count("blocking"), major: count("major"), minor: count("minor"), nit: count("nit") };
  return {
    ok: true,
    outcome: "FEATURE_REVIEW_RECORDED",
    record_path: ctx.record_path,
    findings_fingerprint: fp,
    counts,
    ui_conformance: uiConformance,
    design_verification: dv.state,
    design_detail: dv.detail,
    binding: ctx.binding,
    next_command: counts.blocking > 0 ? nextCommand("fix-review-comments", ctx.record_path) : nextCommand("pre-pr", `feature:${req.feature}`),
  };
}

/* ----------------------------------------------------------------- verify */

export interface FeatureReviewRecord {
  frontmatter: Record<string, string>;
  findings: Finding[];
  checks: Check[];
  scope: Record<string, string>;
  access: DesignAccess[];
}

export function readFeatureReviewRecord(root: string, feature: string): FeatureReviewRecord | null | "unreadable" {
  const abs = join(root, reviewRecordPath(feature));
  if (!existsSync(abs)) return null;
  const split = splitDocument(readFileSync(abs));
  if ("error" in split) return "unreadable";
  const frontmatter: Record<string, string> = {};
  for (const line of split.inner) {
    const m = /^([a-z_]+): (.*)$/.exec(line);
    if (m) frontmatter[m[1]] = m[2];
  }
  const findings: Finding[] = [];
  const checks: Check[] = [];
  const scope: Record<string, string> = {};
  const access: DesignAccess[] = [];
  let section = "";
  let severity: Finding["severity"] | null = null;
  for (const line of split.body.toString("utf-8").split("\n")) {
    if (line.startsWith("## ") || line.startsWith("### ")) {
      section = line.replace(/^#+ /, "");
      severity = section === "Blocking Findings" ? "blocking" : section === "Major Findings" ? "major" : section === "Minor" ? "minor" : section === "Nit" ? "nit" : null;
      continue;
    }
    if (severity !== null && line.startsWith("- ")) {
      const x = parseFinding(line, severity);
      if (x === null) return "unreadable";
      findings.push(x);
    }
    const cells = line.startsWith("| ") ? line.slice(1, -1).split("|").map((c) => c.trim()) : null;
    if (cells === null || /^-+$/.test(cells[0]) || ["Check", "File", "Reference"].includes(cells[0])) continue;
    if (section === "Feature-specific Checks") {
      if (cells.length !== 3) return "unreadable";
      checks.push({ id: cells[0], status: cells[1], note: cells[2] });
    }
    if (section === "Reviewed Scope") {
      const m = /^`(.+)`$/.exec(cells[0]);
      if (cells.length !== 2 || m === null) return "unreadable";
      scope[m[1]] = cells[1];
    }
    if (section === "Design References Accessed" && cells.length === 4 && cells[0] !== "—") {
      access.push({ reference: cells[0], node_id: cells[1] === "—" ? null : cells[1], status: cells[2] as DesignAccess["status"], note: cells[3] });
    }
  }
  return { frontmatter, findings, checks, scope, access };
}

export function verifyFeatureReview(req: { root: string; feature: string; doc?: string | null; base?: string | null }): Record<string, any> {
  const l = load(req);
  if (!l.ok) return { ok: false, status: "invalid", reasons: [{ code: l.outcome, message: l.reason }] };
  const recordPath = reviewRecordPath(req.feature);
  const rec = readFeatureReviewRecord(l.docs.root, req.feature);
  if (rec === null) return { ok: false, status: "missing", record_path: recordPath, reasons: [{ code: "REVIEW_RECORD_MISSING", message: "no internal review is recorded for this feature" }] };
  const invalid = (code: string, message: string) => ({ ok: false, status: "invalid", record_path: recordPath, reasons: [{ code, message }] });
  if (rec === "unreadable") return invalid("REVIEW_RECORD_INVALID", "the record cannot be read back");
  const fm = rec.frontmatter;
  if (RECORD_FIELDS.some((k) => fm[k] === undefined) || fm.review_schema !== String(FEATURE_REVIEW_SCHEMA) || fm.work_type !== "feature" || fm.feature !== req.feature) {
    return invalid("REVIEW_RECORD_INVALID", "the record is not a feature review record for this feature");
  }
  const count = (s: string) => String(rec.findings.filter((x) => x.severity === s).length);
  if (findingsFingerprint(rec.findings as any, rec.checks as any) !== fm.findings_fingerprint || fm.blocking_count !== count("blocking") ||
      fm.major_count !== count("major") || fm.minor_count !== count("minor") || fm.nit_count !== count("nit") ||
      fingerprintEntries(Object.entries(rec.scope).map(([path, blob]) => ({ path, blob }))) !== fm.scope_fingerprint) {
    return invalid("REVIEW_RECORD_INCONSISTENT", "the findings, checks, counts or reviewed scope in the record do not match its fingerprints — it was edited after it was generated");
  }

  const now = l.binding;
  const reasons: Array<{ code: string; message: string; [k: string]: unknown }> = [];
  if (fm.base_branch !== now.base_branch || fm.merge_base !== now.merge_base) {
    const refMoved = fm.base_ref !== l.scope.base.ref;
    reasons.push({
      code: "REVIEW_SCOPE_BASE_CHANGED",
      message: fm.base_branch !== now.base_branch
        ? `the review targeted ${fm.base_branch}; the pull request now targets ${now.base_branch}`
        : refMoved
          ? `the target ${now.base_branch} now resolves to ${l.scope.base.ref} (it was ${fm.base_ref} at the review — a remote-tracking branch appeared or disappeared), and its merge base differs`
          : "the target branch's merge base moved (the target was merged in, or the branch was rebased)",
      reviewed_ref: fm.base_ref,
      current_ref: l.scope.base.ref,
    });
  }
  if (fm.scope_fingerprint !== now.scope_fingerprint) {
    const d = diffMaps(rec.scope, l.map);
    reasons.push({ code: "REVIEW_CODE_CHANGED", message: `the pull request's code changed since the review (${[d.changed.length && `${d.changed.length} changed`, d.added.length && `${d.added.length} added`, d.removed.length && `${d.removed.length} removed`].filter(Boolean).join(", ")})`, ...d });
  }
  const unapproved = [l.docs.fa, l.docs.dd, l.docs.tb, l.docs.devPlan].filter((x): x is FeatureDoc => x !== null && !x.approved);
  if (unapproved.length > 0) reasons.push({ code: "REVIEW_SPEC_NOT_APPROVED", message: `no longer approved: ${unapproved.map((x) => x.rel).join(", ")}` });
  const specMoved = (["fa_fingerprint", "dd_fingerprint", "tb_fingerprint", "dev_plan_fingerprint"] as const).filter((k) => fm[k] !== now[k]);
  if (specMoved.length > 0) reasons.push({ code: "REVIEW_SPEC_CHANGED", message: `the specification changed since the review (${specMoved.map((k) => k.replace("_fingerprint", "")).join(", ")})` });
  if (fm.design_fingerprint !== now.design_fingerprint) reasons.push({ code: "REVIEW_DESIGN_CHANGED", message: "the design reference changed since the review" });
  if (fm.task_state_fingerprint !== now.task_state_fingerprint || fm.scoped_tasks !== now.scoped_tasks) reasons.push({ code: "REVIEW_TASK_STATE_CHANGED", message: "the state of the tasks in the pull request's scope changed since the review" });
  const counts = { blocking: Number(fm.blocking_count), major: Number(fm.major_count), minor: Number(fm.minor_count), nit: Number(fm.nit_count) };
  return {
    ok: reasons.length === 0,
    status: reasons.length === 0 ? "fresh" : "stale",
    record_path: recordPath,
    reasons,
    counts,
    ui_conformance: fm.ui_conformance,
    design_verification: fm.design_verification,
    findings_fingerprint: fm.findings_fingerprint,
    majors: rec.findings.filter((x) => x.severity === "major"),
    design_access: rec.access,
    reviewed_scope: rec.scope,
    base_branch: fm.base_branch,
    merge_base: fm.merge_base,
    scoped_tasks: fm.scoped_tasks === "none" ? [] : fm.scoped_tasks.split(","),
  };
}

/* --------------------------------------------------------------------- CLI */

function main(): void {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(args[i]);
    if (!m) positional.push(args[i]);
    else flags[m[1]] = m[2] !== undefined ? m[2] : args[++i] ?? "";
  }
  const print = (o: unknown): never => {
    writeStdout(JSON.stringify(o, null, 2) + "\n");
    process.exit(0);
  };
  const req = { root: flags.root ?? "", feature: flags.feature ?? "", doc: flags.doc || null, base: flags.base || null };
  if (positional[0] === "context") print(featureReviewContext(req));
  if (positional[0] === "record") print(writeFeatureReview({ ...req, review: flags.review ?? "", designEvidence: flags["design-evidence"] || null }));
  if (positional[0] === "verify") print(verifyFeatureReview(req));
  print({ ok: false, outcome: "UNKNOWN_COMMAND", reason: "usage: feature-review.ts context|record|verify --root <dir> --feature <feature> [--review <file.json>] [--doc <path>] [--base <branch>]" });
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /feature-review\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) main();
