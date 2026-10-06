/**
 * bug-review.ts
 *
 * The bug half of `/review-code --bug <bug_key>` (Bug Development Flow, Step 6). The review
 * itself is the existing one — the same command, `code-reviewer` + `performance-reviewer`,
 * `platform-review`, platform lanes, standards and severity model. This helper does what must
 * come out the same twice:
 *
 *   context  read-only. Is there an approved Bug Work Plan for the current fix cycle, and
 *            task state for it? Returns what the review reads from the plan (identity,
 *            reproduction, root cause, fix design, non-goals, verification, first-degree
 *            context), each task's row and recorded developer-testing evidence, and the
 *            binding: exactly what is being reviewed.
 *   record   writes the one review record for the cycle, docs/bugs/<bug_key>/review-c<n>.md,
 *            from the merged review's findings and bug-specific checks, atomically. Refuses
 *            if the reviewed state moved since `context`. Replaces an earlier record of the
 *            same cycle: it is evidence of the latest review, not the source of truth.
 *   verify   read-only. Is the record still about the current code, plan, task state and
 *            cycle? `fresh` | `stale` | `missing` | `invalid`, with reasons.
 *
 * The record approves nothing; what it means for a QA handoff is decided later. The helper
 * never writes task state, never reads a QA repository or Project Knowledge, never commits,
 * runs no process of its own (git is read through task-resume.ts) and reads no clock — the
 * caller supplies `generated_at`, which no fingerprint includes.
 *
 * Always exits 0 and prints one JSON object; callers branch on `outcome` / `status`.
 *
 *   node --no-warnings scripts/bug-review.ts context bug:<bug_key> --root <TARGET_ROOT>
 *   node --no-warnings scripts/bug-review.ts record  bug:<bug_key> --root <TARGET_ROOT> --review <review.json>
 *   node --no-warnings scripts/bug-review.ts verify  bug:<bug_key> --root <TARGET_ROOT>
 */

import { existsSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { validateBugWorkPlan, bugWorkPlanPath } from "./bug-work-plan.ts";
import { approvalFingerprint, verifyApproval } from "./work-approval.ts";
import { BUG_REPRO_CRITERION, bugKeyOf, parseBreakdown, stateFilePath } from "./task-state.ts";
import { contentFingerprint, isStoreArtifact, rowCells, taskRowsText } from "./task-resume.ts";
import { planContext } from "./bug-implementation.ts";
import { canonical } from "./qa-release-gate.ts";
import { splitDocument } from "./migrate-planning-doc.ts";

const sha = (s: string | Buffer): string => `sha256:${createHash("sha256").update(s).digest("hex")}`;

export const REVIEW_SCHEMA = 1;
export const SEVERITIES = ["blocking", "major", "minor", "nit"] as const;
const PLATFORMS = ["react-native", "ios", "android", "react"];
/** The four shared bug checks, and the rule id a finding raised by each one cites. */
export const BUG_CHECKS: Record<string, string> = {
  "root-cause": "BUG-CHECK-ROOT-CAUSE",
  "reproduction-path": "BUG-CHECK-REPRODUCTION",
  "plan-conformance": "BUG-CHECK-SCOPE",
  "regression-risk": "BUG-CHECK-REGRESSION-RISK",
};
const CHECK_STATUSES = ["pass", "concern", "not-verifiable"];
const RECORD_FIELDS = [
  "review_schema", "work_type", "bug_key", "fix_cycle", "reviewed_head", "reviewed_tree_fingerprint", "bug_work_plan_fingerprint",
  "task_state_fingerprint", "findings_fingerprint", "blocking_count", "major_count", "minor_count", "nit_count", "reviewed_by", "generated_at",
] as const;
const BINDING_FIELDS = ["fix_cycle", "reviewed_head", "reviewed_tree_fingerprint", "bug_work_plan_fingerprint", "task_state_fingerprint"] as const;

/**
 * The reviewed code: everything but the bug's planning/review documents, the task-state store
 * (each bound on its own), and Bug QA handoffs (docs/qa/bug-<key>-qa-handoff.md, generated
 * downstream of the review — writing one must never make the review it was built from stale).
 */
const notCode = (rel: string) => rel.startsWith("docs/bugs/") || isStoreArtifact(rel) || /^docs\/qa\/bug-[^/]+-qa-handoff\.md(\.qa-handoff\.tmp)?$/.test(rel);

export interface Finding {
  severity: (typeof SEVERITIES)[number];
  platform: string | null;
  path: string | null;
  line: number | null;
  rule: string;
  description: string;
  remediation: string;
}
export interface Check {
  id: string;
  status: string;
  note: string;
}

/* ---------------------------------------------------------- findings model */

const oneLine = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const nullable = (v: unknown) => (v === null || v === undefined || oneLine(v) === "" ? null : oneLine(v));

function normalizeFinding(f: Record<string, unknown>): Finding {
  return {
    severity: oneLine(f.severity).toLowerCase() as Finding["severity"],
    platform: nullable(f.platform),
    path: nullable(f.path),
    line: f.line === null || f.line === undefined ? null : Number(f.line),
    rule: oneLine(f.rule),
    description: oneLine(f.description),
    remediation: oneLine(f.remediation),
  };
}
const normalizeCheck = (c: Record<string, unknown>): Check => ({ id: oneLine(c.id), status: oneLine(c.status), note: oneLine(c.note) });

/** Canonical order: severity, then location, then rule — so the same findings in any order are the same record. */
function compareFindings(a: Finding, b: Finding): number {
  const key = (f: Finding) => [SEVERITIES.indexOf(f.severity), f.path ?? "", f.line ?? 0, f.rule, f.platform ?? "", f.description, f.remediation] as const;
  const ka = key(a), kb = key(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
  return 0;
}

/**
 * The findings fingerprint: sha256 over the canonical JSON of the normalized findings — in
 * canonical order, duplicates kept (a multiset) — and the four bug checks by id. Whitespace
 * is collapsed; nothing about who reviewed or when enters it.
 */
export function findingsFingerprint(findings: Array<Record<string, unknown>>, checks: Array<Record<string, unknown>>): string {
  const fs = findings.map(normalizeFinding).sort(compareFindings);
  const cs = checks.map(normalizeCheck).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sha(canonical({ findings: fs, checks: cs }));
}

/** One finding in the review template's form: `[platform] file:line` — [standard ID] description — remediation. */
function renderFinding(f: Finding): string {
  const where = f.path === null ? "—" : `${f.platform ? `[${f.platform}] ` : ""}${f.path}${f.line !== null ? `:${f.line}` : ""}`;
  return `- \`${f.platform && f.path === null ? `[${f.platform}] —` : where}\` — [${f.rule}] ${f.description} — ${f.remediation}`;
}
function parseFinding(line: string, severity: Finding["severity"]): Finding | null {
  const m = /^- `(?:\[([a-z-]+)\] )?(.+?)` — \[([^\]]+)\] (.+?) — (.+)$/.exec(line);
  if (m === null) return null;
  const loc = /^(.*?)(?::(\d+))?$/.exec(m[2]) as RegExpExecArray;
  const path = m[2] === "—" ? null : loc[1];
  return { severity, platform: m[1] ?? null, path, line: m[2] === "—" || loc[2] === undefined ? null : Number(loc[2]), rule: m[3], description: m[4], remediation: m[5] };
}

function findingProblem(f: Finding): string | null {
  if (!(SEVERITIES as readonly string[]).includes(f.severity)) return `severity "${f.severity}" is not one of ${SEVERITIES.join(", ")}`;
  if (f.platform !== null && !PLATFORMS.includes(f.platform)) return `platform "${f.platform}" is not one of ${PLATFORMS.join(", ")}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(f.rule)) return "every finding cites its standard ID (or a BUG-CHECK-* rule)";
  if (f.description === "" || f.remediation === "") return "every finding has a description and a concrete remediation";
  if (f.line !== null && (!Number.isInteger(f.line) || f.line < 1 || f.path === null)) return "a line is a positive integer and needs its path";
  for (const v of [f.path ?? "", f.description, f.remediation]) if (v.includes("—")) return 'a finding may not contain "—" — the record could not read it back';
  if ((f.path ?? "").includes("`")) return "a path may not contain a backtick";
  return null;
}

/* ------------------------------------------------------------------ state */

type Stop = { ok: false; outcome: string; reason: string; route?: string };
interface Ready {
  ok: true;
  key: string;
  root: string;
  rel: string;
  buf: Buffer;
  fm: Record<string, any>;
  stateRaw: Record<string, any> | null;
}

function load(work: string, rootIn: string): Stop | (Omit<Ready, "stateRaw"> & { approval: Record<string, any> }) {
  const key = bugKeyOf(work ?? "");
  if (key === null) return { ok: false, outcome: "BUG_WORK_ID_INVALID", reason: `"${work}" is not bug work — name it bug:<bug_key>` };
  if (!rootIn || !existsSync(rootIn) || !statSync(rootIn).isDirectory()) return { ok: false, outcome: "BUG_ROOT_INVALID", reason: `repository root ${rootIn ?? ""} does not exist` };
  const root = realpathSync(rootIn);
  const rel = bugWorkPlanPath(key) as string;
  if (!existsSync(join(root, rel))) return { ok: false, outcome: "BUG_PLAN_MISSING", reason: `no Bug Work Plan at ${rel}`, route: "/analyze-bug <bug-ref>" };
  const buf = readFileSync(join(root, rel));
  const v = validateBugWorkPlan(buf);
  if (!v.ok || v.frontmatter.bug_key !== key) return { ok: false, outcome: "BUG_PLAN_INVALID", reason: `${rel} is not a valid Bug Work Plan for ${key}`, route: "/analyze-bug <bug-ref>" };
  return { ok: true, key, root, rel, buf, fm: v.frontmatter, approval: verifyApproval(buf) };
}

function readState(root: string, key: string): Record<string, any> | null {
  const p = stateFilePath(root, `bug:${key}`);
  if (!existsSync(p)) return null;
  try {
    const doc = JSON.parse(readFileSync(p, "utf-8"));
    return doc && typeof doc === "object" && doc.tasks && typeof doc.tasks === "object" ? doc : null;
  } catch {
    return null;
  }
}

function binding(r: { root: string; buf: Buffer; fm: Record<string, any> }, state: Record<string, any> | null) {
  const code = contentFingerprint(r.root, notCode);
  return {
    fix_cycle: r.fm.fix_cycle as number,
    reviewed_head: code.head,
    reviewed_tree_fingerprint: code.fingerprint,
    bug_work_plan_fingerprint: approvalFingerprint(r.buf),
    task_state_fingerprint: state === null ? null : sha(canonical(state)),
  };
}

/* ---------------------------------------------------------------- context */

export function reviewContext(req: { root: string; work: string }): Record<string, any> {
  const r = load(req.work, req.root);
  if (!r.ok) return r;
  const route = "/analyze-bug <bug-ref>";
  if (r.fm.fix_cycle !== 1) return { ok: false, outcome: "BUG_CYCLE_UNSUPPORTED", reason: `the plan is at fix cycle ${r.fm.fix_cycle}; reviewing a reopened cycle is not available yet`, route };
  if (r.approval.status === "draft") return { ok: false, outcome: "BUG_PLAN_NOT_APPROVED", reason: "the Bug Work Plan is not approved", route };
  if (r.approval.status === "approval_stale") return { ok: false, outcome: "BUG_APPROVAL_STALE", reason: "the plan changed, or its cycle moved, after it was approved", route, reasons: r.approval.reasons };
  if (r.approval.status !== "approved") return { ok: false, outcome: "BUG_APPROVAL_INVALID", reason: "the plan's approval fields are incomplete or inconsistent", route };

  const text = r.buf.toString("utf-8");
  const ids = Object.keys(parseBreakdown(taskRowsText(text)));
  const state = readState(r.root, r.key);
  const recorded = ids.filter((id) => state?.tasks?.[id] !== undefined);
  if (state === null || recorded.length === 0) {
    return { ok: false, outcome: "BUG_TASK_STATE_MISSING", reason: "no task state is recorded for this fix cycle — nothing has been implemented to review", route: `/implement-task bug:${r.key} T1` };
  }
  const b = binding(r, state);
  if (b.reviewed_tree_fingerprint === null) return { ok: false, outcome: "BUG_REPOSITORY_UNAVAILABLE", reason: "the repository's content could not be read through git" };
  const tasks = ids.map((id) => {
    const t = state.tasks[id] ?? {};
    return {
      id,
      cells: rowCells(text, id),
      state: t.state ?? "unrecorded",
      filesChanged: t.filesChanged ?? [],
      acceptanceCriteria: t.acceptanceCriteria ?? [],
      validation: t.validation ?? [],
      developerTesting: t.developerTesting ?? null,
      verificationDebt: t.verificationDebt ?? [],
    };
  });
  return {
    ok: true,
    outcome: "BUG_REVIEW_READY",
    work_id: `bug:${r.key}`,
    plan_path: r.rel,
    fix_cycle: r.fm.fix_cycle,
    record_path: `docs/bugs/${r.key}/review-c${r.fm.fix_cycle}.md`,
    context: planContext(r.buf, r.fm),
    tasks,
    incomplete_tasks: tasks.filter((t) => t.state !== "complete").map((t) => t.id),
    checks: Object.keys(BUG_CHECKS),
    binding: b,
  };
}

/* ----------------------------------------------------------------- record */

/** The task-state evidence that lets a reproduction-path check pass: the fix task's reproduction criterion met, and a regression test or VERIFY-4 debt. */
export function reproductionEvidence(tasks: Array<Record<string, any>>): boolean {
  return tasks.some((t) => {
    const metRepro = (t.acceptanceCriteria ?? []).some((c: any) => String(c.criterion ?? "").toLowerCase().startsWith(BUG_REPRO_CRITERION.toLowerCase()) && c.met === true);
    const reg = t.developerTesting?.regression;
    const regressionOk = reg && ((reg.failedBefore === true && reg.passesAfter === true) ||
      (typeof reg.notFeasibleReason === "string" && reg.notFeasibleReason.trim() !== "" && (t.verificationDebt ?? []).some((d: any) => d.ruleId === "VERIFY-4" && d.owner === "developer")));
    return t.state === "complete" && metRepro && regressionOk;
  });
}

function evidenceLines(tasks: Array<Record<string, any>>): string[] {
  return tasks.map((t) => {
    const dt = t.developerTesting;
    const parts: string[] = [];
    const reg = dt?.regression;
    if (reg?.command) parts.push(`regression \`${reg.command}\` ${reg.failedBefore === true ? "failed before the fix" : "was not shown failing before the fix"} and ${reg.passesAfter === true ? "passes after" : "does not pass after"}`);
    else if (reg?.notFeasibleReason) parts.push(`no regression test: ${oneLine(reg.notFeasibleReason)}`);
    for (const run of dt?.runs ?? []) parts.push(`ran \`${run.command}\` — ${run.result}`);
    for (const d of t.verificationDebt ?? []) if (d.ruleId === "VERIFY-4") parts.push(`VERIFY-4 debt: ${oneLine(d.requiredVerification)}`);
    return `- \`${t.id}\` (${t.state}): ${parts.length ? parts.join("; ") : "no developer testing recorded"}`;
  });
}

function render(key: string, b: Record<string, any>, findings: Finding[], checks: Check[], evidence: string[], meta: { reviewed_by: string; generated_at: string }, fp: string): string {
  const count = (s: string) => findings.filter((f) => f.severity === s).length;
  const list = (fs: Finding[]) => (fs.length ? fs.map(renderFinding).join("\n") : "None.");
  const of = (s: string) => findings.filter((f) => f.severity === s);
  const front = {
    review_schema: REVIEW_SCHEMA,
    work_type: "bug",
    bug_key: key,
    fix_cycle: b.fix_cycle,
    reviewed_head: b.reviewed_head,
    reviewed_tree_fingerprint: b.reviewed_tree_fingerprint,
    bug_work_plan_fingerprint: b.bug_work_plan_fingerprint,
    task_state_fingerprint: b.task_state_fingerprint,
    findings_fingerprint: fp,
    blocking_count: count("blocking"),
    major_count: count("major"),
    minor_count: count("minor"),
    nit_count: count("nit"),
    reviewed_by: meta.reviewed_by,
    generated_at: meta.generated_at,
  };
  const ordered = [...checks].sort((a, c) => Object.keys(BUG_CHECKS).indexOf(a.id) - Object.keys(BUG_CHECKS).indexOf(c.id));
  return [
    "---",
    ...RECORD_FIELDS.map((k) => `${k}: ${front[k]}`),
    "---",
    "",
    `# Bug Review — ${key}, fix cycle ${b.fix_cycle}`,
    "",
    "## Review Summary",
    "",
    `Reviewed fix cycle ${b.fix_cycle} of ${key} at \`${b.reviewed_head}\`: ${front.blocking_count} blocking, ${front.major_count} major, ${front.minor_count} minor, ${front.nit_count} nit. This record is review evidence; it does not approve a QA handoff.`,
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
    "## Bug-specific Checks",
    "",
    "| Check | Status | Note |",
    "|---|---|---|",
    ...ordered.map((c) => `| ${c.id} | ${c.status} | ${c.note} |`),
    "",
    "## Verification Evidence",
    "",
    ...(evidence.length ? evidence : ["None."]),
    "",
    "## Scope Deviations",
    "",
    list(findings.filter((f) => f.rule === BUG_CHECKS["plan-conformance"])),
    "",
  ].join("\n");
}

const refuse = (code: string, reason: string, extra: Record<string, unknown> = {}) => ({ ok: false, outcome: "BUG_REVIEW_REFUSED", code, reason, ...extra });

export function writeReviewRecord(req: { root: string; work: string; review: string }): Record<string, any> {
  const ctx = reviewContext(req);
  if (!ctx.ok) return { ...ctx, code: ctx.outcome };
  let input: Record<string, any>;
  try {
    input = JSON.parse(readFileSync(req.review, "utf-8"));
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("not a JSON object");
  } catch (e) {
    return refuse("INVALID_ARGUMENT", `--review ${req.review} is not a readable JSON review: ${(e as Error).message}`);
  }

  // What was reviewed must still be what is here — otherwise the findings describe something else.
  const moved = BINDING_FIELDS.filter((k) => input.binding?.[k] !== ctx.binding[k]);
  if (moved.length > 0) return refuse("REVIEW_STATE_MOVED", `the reviewed state changed since the review context was read (${moved.join(", ")}) — review again`, { moved });

  const reviewedBy = oneLine(input.reviewed_by);
  if (reviewedBy === "" || reviewedBy.length > 200 || /[#\r\n]/.test(String(input.reviewed_by))) return refuse("INVALID_ARGUMENT", "reviewed_by names the reviewers: one plain line, no '#'");
  const at = String(input.generated_at ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(at)) return refuse("INVALID_ARGUMENT", "generated_at is a UTC timestamp (YYYY-MM-DDTHH:MM:SSZ), supplied by the caller");

  if (!Array.isArray(input.findings)) return refuse("INVALID_FINDING", "findings is a list (empty when there are none)");
  const findings = input.findings.map((f: Record<string, unknown>) => normalizeFinding(f ?? {}));
  for (const f of findings) {
    const p = findingProblem(f);
    if (p !== null) return refuse("INVALID_FINDING", p, { finding: f });
  }

  if (!Array.isArray(input.checks)) return refuse("INVALID_CHECKS", `checks lists the bug-specific checks: ${Object.keys(BUG_CHECKS).join(", ")}`);
  const checks: Check[] = input.checks.map((c: Record<string, unknown>) => normalizeCheck(c ?? {}));
  const ids = checks.map((c) => c.id).sort();
  if (JSON.stringify(ids) !== JSON.stringify(Object.keys(BUG_CHECKS).sort())) return refuse("INVALID_CHECKS", `exactly one result per bug-specific check: ${Object.keys(BUG_CHECKS).join(", ")}`);
  for (const c of checks) {
    if (!CHECK_STATUSES.includes(c.status)) return refuse("INVALID_CHECKS", `check ${c.id}: status is one of ${CHECK_STATUSES.join(", ")}`);
    if (c.note === "" || c.note.includes("|")) return refuse("INVALID_CHECKS", `check ${c.id}: a one-line note without "|" is required`);
    const filed = findings.some((f: Finding) => f.rule === BUG_CHECKS[c.id]);
    if ((c.status === "concern") !== filed) {
      return refuse("INVALID_CHECKS", `check ${c.id}: "concern" exactly when a finding cites ${BUG_CHECKS[c.id]} — a concern is filed as a finding, and a check with a finding filed against it does not pass`);
    }
  }
  const status = (id: string) => checks.find((c) => c.id === id)?.status;
  if (ctx.context.root_cause_inference && status("root-cause") === "pass") {
    return refuse("INVALID_CHECKS", "check root-cause: the plan's root cause is an [inference] — the review cannot certify it was addressed; record not-verifiable (or concern)");
  }
  if (status("reproduction-path") === "pass" && !reproductionEvidence(ctx.tasks)) {
    return refuse("INVALID_CHECKS", "check reproduction-path: task state shows no completed fix task whose reproduction criterion is met with regression (or VERIFY-4) evidence — record not-verifiable (or concern)");
  }

  const sorted = [...findings].sort(compareFindings);
  const fp = findingsFingerprint(findings, checks);
  const key = ctx.work_id.slice("bug:".length);
  const text = render(key, ctx.binding, sorted, checks, evidenceLines(ctx.tasks), { reviewed_by: reviewedBy, generated_at: at }, fp);
  const root = realpathSync(req.root);
  const abs = join(root, ctx.record_path);
  const tmp = `${abs}.bug-review.tmp`;
  try {
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
  const count = (s: string) => findings.filter((f: Finding) => f.severity === s).length;
  return {
    ok: true,
    outcome: "BUG_REVIEW_RECORDED",
    record_path: ctx.record_path,
    findings_fingerprint: fp,
    counts: { blocking: count("blocking"), major: count("major"), minor: count("minor"), nit: count("nit") },
    binding: ctx.binding,
  };
}

/* ----------------------------------------------------------------- verify */

/** A review record's frontmatter, findings and checks, read back from the file — null when it is not readable as one. */
export function readReviewRecord(root: string, key: string, cycle: number): { frontmatter: Record<string, string>; findings: Finding[]; checks: Check[] } | null {
  const abs = join(root, `docs/bugs/${key}/review-c${cycle}.md`);
  if (!existsSync(abs)) return null;
  const split = splitDocument(readFileSync(abs));
  if ("error" in split) return null;
  const frontmatter: Record<string, string> = {};
  for (const l of split.inner) {
    const m = /^([a-z_]+): (.*)$/.exec(l);
    if (m) frontmatter[m[1]] = m[2];
  }
  const parsed = parseRecordBody(split.body.toString("utf-8"));
  return parsed === null ? null : { frontmatter, ...parsed };
}

/** Read the record's findings and checks back from its body, exactly as rendered. */
function parseRecordBody(body: string): { findings: Finding[]; checks: Check[] } | null {
  const findings: Finding[] = [];
  const checks: Check[] = [];
  let severity: Finding["severity"] | null = null;
  let inChecks = false;
  for (const line of body.split("\n")) {
    if (line.startsWith("## ") || line.startsWith("### ")) {
      const h = line.replace(/^#+ /, "");
      severity = h === "Blocking Findings" ? "blocking" : h === "Major Findings" ? "major" : h === "Minor" ? "minor" : h === "Nit" ? "nit" : null;
      inChecks = h === "Bug-specific Checks";
      continue;
    }
    if (severity !== null && line.startsWith("- ")) {
      const f = parseFinding(line, severity);
      if (f === null) return null;
      findings.push(f);
    }
    if (inChecks && line.startsWith("| ") && !line.startsWith("| Check |")) {
      const cells = line.slice(1, -1).split("|").map((c) => c.trim());
      if (cells.length !== 3) return null;
      checks.push({ id: cells[0], status: cells[1], note: cells[2] });
    }
  }
  return { findings, checks };
}

export function verifyReviewRecord(req: { root: string; work: string }): Record<string, any> {
  const r = load(req.work, req.root);
  if (!r.ok) return { ok: false, status: "invalid", reasons: [{ code: r.outcome, message: r.reason }] };
  const recordPath = `docs/bugs/${r.key}/review-c${r.fm.fix_cycle}.md`;
  const abs = join(r.root, recordPath);
  if (!existsSync(abs)) return { ok: false, status: "missing", record_path: recordPath, reasons: [{ code: "REVIEW_RECORD_MISSING", message: `no review record for fix cycle ${r.fm.fix_cycle}` }] };

  const buf = readFileSync(abs);
  const split = splitDocument(buf);
  const invalid = (code: string, message: string) => ({ ok: false, status: "invalid", record_path: recordPath, reasons: [{ code, message }] });
  if ("error" in split) return invalid("REVIEW_RECORD_INVALID", "the record has no frontmatter");
  const rec: Record<string, string> = {};
  for (const l of split.inner) {
    const m = /^([a-z_]+): (.*)$/.exec(l);
    if (m) rec[m[1]] = m[2];
  }
  if (RECORD_FIELDS.some((k) => rec[k] === undefined) || rec.review_schema !== String(REVIEW_SCHEMA) || rec.work_type !== "bug" || rec.bug_key !== r.key) {
    return invalid("REVIEW_RECORD_INVALID", "the record is not a bug review record for this bug");
  }
  const parsed = parseRecordBody(split.body.toString("utf-8"));
  if (parsed === null) return invalid("REVIEW_RECORD_INCONSISTENT", "the record's findings or checks cannot be read back");
  const count = (s: string) => String(parsed.findings.filter((f) => f.severity === s).length);
  if (findingsFingerprint(parsed.findings as any, parsed.checks as any) !== rec.findings_fingerprint ||
      rec.blocking_count !== count("blocking") || rec.major_count !== count("major") || rec.minor_count !== count("minor") || rec.nit_count !== count("nit")) {
    return invalid("REVIEW_RECORD_INCONSISTENT", "the findings, checks or counts in the record do not match its findings_fingerprint — it was edited after it was generated");
  }

  const now = binding(r, readState(r.root, r.key));
  const reasons: Array<{ code: string; message: string }> = [];
  if (rec.fix_cycle !== String(r.fm.fix_cycle)) reasons.push({ code: "REVIEW_CYCLE_MISMATCH", message: `the record reviews fix cycle ${rec.fix_cycle}; the plan is at ${r.fm.fix_cycle}` });
  if (r.approval.status !== "approved") reasons.push({ code: "REVIEW_PLAN_NOT_APPROVED", message: `the Bug Work Plan's approval is ${r.approval.status}` });
  else if (rec.bug_work_plan_fingerprint !== now.bug_work_plan_fingerprint) reasons.push({ code: "REVIEW_PLAN_CHANGED", message: "the approved Bug Work Plan changed since the review" });
  if (rec.task_state_fingerprint !== String(now.task_state_fingerprint)) reasons.push({ code: "REVIEW_TASK_STATE_CHANGED", message: "the bug's task state changed since the review" });
  if (rec.reviewed_tree_fingerprint !== String(now.reviewed_tree_fingerprint)) reasons.push({ code: "REVIEW_CODE_CHANGED", message: "the code changed since the review" });
  return {
    ok: reasons.length === 0,
    status: reasons.length === 0 ? "fresh" : "stale",
    record_path: recordPath,
    reasons,
    head_moved: rec.reviewed_head !== String(now.reviewed_head),
    counts: { blocking: Number(rec.blocking_count), major: Number(rec.major_count), minor: Number(rec.minor_count), nit: Number(rec.nit_count) },
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
    else if (m[2] !== undefined) flags[m[1]] = m[2];
    else flags[m[1]] = args[++i] ?? "";
  }
  const print = (o: unknown): never => {
    console.log(JSON.stringify(o, null, 2));
    process.exit(0);
  };
  const [cmd, work] = positional;
  const root = flags.root ?? "";
  if (cmd === "context") print(reviewContext({ root, work }));
  if (cmd === "record") print(writeReviewRecord({ root, work, review: flags.review ?? "" }));
  if (cmd === "verify") print(verifyReviewRecord({ root, work }));
  print({ ok: false, outcome: "UNKNOWN_COMMAND", reason: "usage: bug-review.ts context|record|verify bug:<bug_key> --root <dir> [--review <file.json>]" });
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /bug-review\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) main();
