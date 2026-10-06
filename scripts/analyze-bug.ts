/**
 * analyze-bug.ts
 *
 * The deterministic half of `/analyze-bug` (Bug Development Flow, Step 4). The command owns
 * the judgement — routing questions, Project Knowledge, root cause, fix design, tasks, the
 * approval conversation; this helper owns every decision that must come out the same twice:
 *
 *   start     read-only. Runs bug intake (scripts/bug-intake.ts) and reads any existing plan
 *             at docs/bugs/<bug_key>/bug-work-plan.md, then names exactly one outcome — and,
 *             when the flow may proceed, the routing a human already confirmed (if any) and
 *             the capability QA bound (if any).
 *   scaffold  writes the cycle-1 draft plan's deterministic half — frontmatter identity from
 *             intake, the routing and capability, Reproduction Evidence, Observed vs Expected,
 *             and the empty sections the analysis fills. Only when `start` says
 *             `BUG_PLAN_NEW` or `BUG_PLAN_REGENERATE`; never over an approved, stale or
 *             invalid plan.
 *   check     read-only. The plan is a valid bug-work-plan, still matches intake, and meets
 *             the generation rules (docs/bug-work-plan-contract.md, "Generation").
 *
 * It never reads Project Knowledge (that is the repo-knowledge-consumer skill's job, and
 * Project Knowledge never decides whether a bug exists), never writes a QA repository,
 * never creates task state, never approves (scripts/work-approval.ts does), runs no
 * process and reads no clock.
 *
 * Always exits 0 and prints one JSON object; callers branch on `outcome` / `ok`.
 *
 *   node --no-warnings scripts/analyze-bug.ts start    <ref-args> --root <TARGET_ROOT>
 *   node --no-warnings scripts/analyze-bug.ts scaffold <ref-args> --root <TARGET_ROOT>
 *        [--platform <p> --device-type <d>] [--capability <id>] [--author <name>] [--date YYYY-MM-DD]
 *   node --no-warnings scripts/analyze-bug.ts check    <ref-args> --root <TARGET_ROOT>
 *
 *   <ref-args>  BUG-27 | qa=BUG-27 | qa=BUG-27,external=KEY  --qa-repo <path>
 *             | --external <key> --report <file.json>
 *             | --origin dev-review|dev-testing|production --report <file.json>
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";
import { lookupQaBug, normalizeBug, isSafeKey, evidenceFingerprint } from "./bug-intake.ts";
import { validateBugWorkPlan, bugWorkPlanPath, BUG_WORK_PLAN_FIELDS, BUG_WORK_PLAN_SECTIONS } from "./bug-work-plan.ts";
import { verifyApproval } from "./work-approval.ts";
import { readFrontmatter, splitDocument } from "./migrate-planning-doc.ts";
import { stateFilePath, BUG_REPRO_CRITERION } from "./task-state.ts";

const PLUGIN_ROOT = dirname(import.meta.dirname ?? __dirname);
const TEMPLATE = join(PLUGIN_ROOT, "templates/bug-work-plan-template.md");
const PLATFORMS = ["react-native", "react", "ios", "android"];
const DEVICE_TYPES = ["mobile", "tv"];
const DEV_ORIGIN_FLAGS = ["dev-review", "dev-testing", "production"];
/** The fix task's first acceptance criterion begins with exactly this. */
export const REPRO_CRITERION = BUG_REPRO_CRITERION;
const PLAIN = /^[A-Za-z0-9][A-Za-z0-9 ._@+-]{0,99}$/;

export interface BugRequest {
  root: string;
  ref?: string;
  qaRepo?: string;
  external?: string;
  origin?: string;
  report?: string;
  platform?: string;
  deviceType?: string;
  capability?: string;
  author?: string;
  date?: string;
}

/* ------------------------------------------------------------------ intake */

/** The request → one intake call, exactly as bug-intake.ts defines it. Shared with /implement-task's bug gate. */
export function runIntake(req: BugRequest): { result?: Record<string, any>; refusal?: { outcome: string; reason: string }; evidenceRef?: string } {
  const isDev = req.origin !== undefined;
  const modes = [req.ref !== undefined, req.external !== undefined, isDev].filter(Boolean).length;
  if (modes === 0) return { refusal: { outcome: "BUG_REF_REQUIRED", reason: "name the bug: a QA ref (BUG-27 / qa=BUG-27 with --qa-repo), --external <key> --report <file>, or --origin dev-review|dev-testing|production --report <file>" } };
  if (modes > 1) return { refusal: { outcome: "BUG_REF_CONFLICT", reason: "give exactly one of: a QA ref, --external, --origin" } };
  if (req.ref !== undefined) {
    if (!req.qaRepo) return { refusal: { outcome: "BUG_QA_REPO_REQUIRED", reason: "a QA bug is read from its QA repository — pass --qa-repo <path>; it is never searched for or guessed" } };
    const result = lookupQaBug(req.qaRepo, req.ref);
    return { result, evidenceRef: result.provenance?.evidence?.path };
  }
  if (isDev && !DEV_ORIGIN_FLAGS.includes(req.origin as string)) {
    return { refusal: { outcome: "BUG_REF_REQUIRED", reason: `--origin must be one of ${DEV_ORIGIN_FLAGS.join(", ")} (an external tracker bug uses --external)` } };
  }
  if (!req.report) return { refusal: { outcome: "BUG_REPORT_REQUIRED", reason: "an external or Dev-discovered bug needs its report: --report <file.json>" } };
  let report: Record<string, unknown>;
  try {
    report = JSON.parse(readFileSync(req.report, "utf-8"));
    if (!report || typeof report !== "object" || Array.isArray(report)) throw new Error("not a JSON object");
  } catch (e) {
    return {
      result: { ok: false, status: "invalid", context_level: "insufficient", code: "INVALID_REPORT", reason: `--report ${req.report} is not a readable JSON report: ${(e as Error).message}`, missing: ["report_source"], dev_may_start: false },
    };
  }
  const input = req.external !== undefined ? { ...report, origin: "external", external_ref: req.external } : { ...report, origin: req.origin };
  return { result: normalizeBug(input, { source: "report-file", path: req.report }), evidenceRef: req.report };
}

/* ---------------------------------------------------------------- routing */

/** Approved Task Breakdowns of the related feature under docs/ — the routing a human confirmed for it. */
function featureBreakdowns(root: string, feature: string): Array<{ path: string; platform: string; device_type: string }> {
  const out: Array<{ path: string; platform: string; device_type: string }> = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 6 || !existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!["node_modules", ".git", "bugs", "tasks"].includes(e.name)) walk(p, depth + 1);
      } else if (e.name.endsWith(".md")) {
        const fm = readFrontmatter(readFileSync(p));
        const v = fm?.values ?? {};
        if (fm && v.feature?.trim() === feature && fm.keys.includes("dev_plan_link") && v.status?.trim() === "approved") {
          out.push({ path: relative(root, p).split(sep).join("/"), platform: (v.platform ?? "").trim(), device_type: (v.device_type ?? "").trim() });
        }
      }
    }
  };
  walk(join(root, "docs"), 0);
  return out;
}

function routing(root: string, identity: Record<string, any>, plan: Record<string, any> | null) {
  const corroborating_surfaces = identity.surfaces ?? [];
  if (plan) {
    return { platform: plan.platform, device_type: plan.device_type, source: "existing-plan", requires_confirmation: false, reason: "the routing confirmed for the existing plan", corroborating_surfaces };
  }
  const ask = (reason: string) => ({ platform: null, device_type: null, source: null, requires_confirmation: true, reason, corroborating_surfaces });
  if (!identity.related_feature) return ask("no related feature with human-confirmed routing — confirm the platform and device type once");
  const found = featureBreakdowns(root, identity.related_feature);
  if (found.length !== 1) return ask(`related feature ${identity.related_feature} has ${found.length} approved Task Breakdowns — confirm the platform and device type once`);
  const [b] = found;
  if (!PLATFORMS.includes(b.platform) || !DEVICE_TYPES.includes(b.device_type)) return ask(`${b.path} does not carry a valid platform and device type — confirm them once`);
  return { platform: b.platform, device_type: b.device_type, source: b.path, requires_confirmation: false, reason: `inherited from the approved Task Breakdown of related feature ${identity.related_feature}`, corroborating_surfaces };
}

/* ------------------------------------------------------------------ assess */

const IDENTITY_DRIFT_FIELDS = ["qa_bug_id", "external_ref", "origin"] as const;

/**
 * What changed between the evidence a plan recorded and the current intake — one rule, used by
 * `/analyze-bug` and by `/implement-task`'s bug gate. A change of QA context alone is not a
 * change of evidence: when `found_in_build` is unknown on one side (partial context does not
 * re-derive QA's value), the fingerprint is compared with the plan's value in its place, and
 * a match is reported in `transition`. A `found_in_build` both sides know and disagree on,
 * any other evidence field, or the identity, is drift.
 */
export function evidenceDrift(fm: Record<string, any>, it: Record<string, any>): { drift: string[]; transition: boolean } {
  const drift: string[] = IDENTITY_DRIFT_FIELDS.filter((f) => (fm[f] ?? null) !== (it.identity[f] ?? null));
  const planFound = fm.found_in_build ?? null;
  const nowFound = it.identity.found_in_build ?? null;
  if (planFound !== null && nowFound !== null && planFound !== nowFound) drift.push("found_in_build");
  let transition = false;
  if (fm.bug_evidence_fingerprint !== it.bug_evidence_fingerprint) {
    const comparable = (planFound === null || nowFound === null) &&
      evidenceFingerprint({ ...it.evidence, surfaces: it.identity.surfaces, found_in_build: planFound }) === fm.bug_evidence_fingerprint;
    if (comparable) transition = true;
    else drift.push("bug_evidence_fingerprint");
  }
  return { drift, transition };
}

function assess(req: BugRequest): Record<string, any> {
  if (!req.root || !existsSync(req.root) || !statSync(req.root).isDirectory()) {
    return { ok: false, outcome: "BUG_ROOT_INVALID", proceed: null, reason: `repository root ${req.root ?? ""} does not exist — resolve TARGET_ROOT first` };
  }
  const root = realpathSync(req.root);
  const got = runIntake(req);
  if (got.refusal) return { ok: false, outcome: got.refusal.outcome, proceed: null, reason: got.refusal.reason };
  const it = got.result as Record<string, any>;
  const base = { root, intake: it, context_level: it.context_level, warnings: it.warnings ?? [], evidence_ref: got.evidenceRef ?? null };

  if (it.context_level === "insufficient" || it.status === "invalid" || it.status === "ambiguous") {
    return { ...base, ok: false, outcome: "BUG_INSUFFICIENT_EVIDENCE", proceed: null, reason: it.reason, code: it.code, missing: it.missing ?? [], candidates: it.candidates ?? [] };
  }
  if (it.status === "reopened") {
    return { ...base, ok: false, outcome: "BUG_REOPENED", proceed: null, reason: "QA re-tested the fix and it failed. A new fix cycle (Cycle 2) is appended by the reopened-cycle step, which is not available yet — no plan or cycle is created here.", reopened: it.reopened };
  }
  if (it.dev_may_start !== true) {
    return { ...base, ok: false, outcome: "BUG_QA_DENIED", proceed: null, reason: it.reason };
  }

  const key = it.identity.bug_key as string;
  const rel = bugWorkPlanPath(key) as string;
  const abs = join(root, rel);
  const taskState = stateFilePath(root, `bug:${key}`);
  const common = {
    ...base,
    bug_key: key,
    plan_path: rel,
    plan_exists: existsSync(abs),
    task_state_path: relative(root, taskState).split(sep).join("/"),
    task_state_exists: existsSync(taskState),
    knowledge: { capability: it.identity.capability ?? null, capability_source: it.identity.capability ? "qa-intake" : null },
  };
  if (!common.plan_exists) {
    return { ...common, ok: true, outcome: "BUG_PLAN_NEW", proceed: "create", reason: "no plan exists yet — create the cycle-1 plan", plan: null, routing: routing(root, it.identity, null) };
  }

  const buf = readFileSync(abs);
  const v = validateBugWorkPlan(buf);
  if (!v.ok) {
    return { ...common, ok: false, outcome: "BUG_PLAN_INVALID", proceed: null, reason: `${rel} is not a valid bug-work-plan — fix it by hand or remove it; it is never overwritten`, plan: { valid: false, errors: v.errors } };
  }
  const fm = v.frontmatter;
  if (fm.bug_key !== key) {
    return { ...common, ok: false, outcome: "BUG_PLAN_INVALID", proceed: null, reason: `${rel} records bug_key ${fm.bug_key}, not ${key}`, plan: { valid: false, errors: [{ code: "IDENTITY_MISMATCH", message: `bug_key ${fm.bug_key} ≠ ${key}` }] } };
  }
  const approval = verifyApproval(buf);
  const { drift } = evidenceDrift(fm, it);
  const plan = { valid: true, approval: { status: approval.status, reasons: approval.reasons }, drift, frontmatter: fm };
  const withPlan = { ...common, plan };

  if (drift.length) {
    if (approval.status === "draft" && !common.task_state_exists) {
      return { ...withPlan, ok: true, outcome: "BUG_PLAN_REGENERATE", proceed: "regenerate", reason: `the bug evidence changed (${drift.join(", ")}) and the plan is an unapproved draft with no task state — regenerate it in place`, routing: routing(root, it.identity, fm) };
    }
    return { ...withPlan, ok: false, outcome: "BUG_PLAN_STALE", proceed: null, reason: `the bug evidence changed (${drift.join(", ")}) under a plan that is ${approval.status === "draft" ? "already in implementation (task state exists)" : `${approval.status}`} — reconciling it belongs to a later step; nothing is regenerated` };
  }
  if (approval.status === "approved") {
    return {
      ...withPlan,
      ok: true,
      outcome: "BUG_PLAN_APPROVED",
      proceed: null,
      reason: "the plan is approved and still matches the bug evidence",
      next_action: `/implement-task bug:${key} T1`,
      next_action_note: "Pass the bug's evidence source to /implement-task too (--qa-repo=<path> for a QA bug, --report=<path> otherwise): it re-reads the evidence before every task.",
    };
  }
  if (approval.status === "draft" || (approval.status === "approval_stale" && !common.task_state_exists)) {
    return { ...withPlan, ok: true, outcome: "BUG_PLAN_AWAITING_APPROVAL", proceed: "approve", reason: approval.status === "draft" ? "the plan is a current draft — present it for approval" : "the plan changed after it was approved — present it for approval again", routing: routing(root, it.identity, fm) };
  }
  if (approval.status === "approval_stale") {
    return { ...withPlan, ok: false, outcome: "BUG_PLAN_STALE", proceed: null, reason: "the plan changed after approval and task state exists — reconciling it belongs to a later step" };
  }
  return { ...withPlan, ok: false, outcome: "BUG_PLAN_INVALID", proceed: null, reason: `the plan's approval fields are inconsistent (${(approval.reasons ?? []).map((r: any) => r.code).join(", ")}) — they are written only by scripts/work-approval.ts` };
}

export function startBug(req: BugRequest): Record<string, any> {
  const { root, ...out } = assess(req);
  return out;
}

/* ---------------------------------------------------------------- scaffold */

const oneLine = (s: unknown) => String(s ?? "").replace(/\s*\r?\n\s*/g, " ").trim();
const yamlValue = (v: unknown): string => (v === null || v === undefined ? "null" : Array.isArray(v) ? `[${v.join(", ")}]` : String(v));

function templateSections(): { fm: string[]; sections: Record<string, string> } {
  const buf = readFileSync(TEMPLATE);
  const split = splitDocument(buf) as any;
  const body: string = split.body.toString("utf-8");
  const sections: Record<string, string> = {};
  const parts = body.split(/^## /m).slice(1);
  for (const p of parts) {
    const nl = p.indexOf("\n");
    sections[p.slice(0, nl)] = p.slice(nl + 1).trim();
  }
  return { fm: split.inner as string[], sections };
}

function scaffoldText(a: Record<string, any>, route: { platform: string; device_type: string; how: string }, capability: { id: string | null; how: string }, req: BugRequest): string {
  const it = a.intake;
  const id = it.identity;
  const ev = it.evidence;
  const tpl = templateSections();
  const owned: Record<string, unknown> = {
    doc_schema_version: 1,
    work_type: "bug",
    bug_key: id.bug_key,
    qa_bug_id: id.qa_bug_id,
    external_ref: id.external_ref,
    origin: id.origin,
    found_in_build: id.found_in_build,
    platform: route.platform,
    device_type: route.device_type,
    surfaces: id.surfaces,
    capability: capability.id,
    related_feature: id.related_feature,
    bug_evidence_fingerprint: it.bug_evidence_fingerprint,
    fix_cycle: 1,
    status: "draft",
    approved_by: null,
    approved_fingerprint: null,
    approved_cycle: null,
    ...(req.author ? { author: req.author } : {}),
    ...(req.date ? { date: req.date } : {}),
  };
  const fmLines: string[] = [];
  for (const f of BUG_WORK_PLAN_FIELDS) {
    if (f in owned) fmLines.push(`${f}: ${yamlValue(owned[f])}`);
    else {
      // Fields the command fills by its own rules (repo_knowledge_* per the consumer skill's Step 6): kept as the template states them.
      if (f === "repo_knowledge_status") fmLines.push(...tpl.fm.filter((l) => l.startsWith("# repo_knowledge_*")));
      fmLines.push(...tpl.fm.filter((l) => l.startsWith(`${f}:`)));
    }
  }

  const label = `[evidence: ${a.evidence_ref}]`;
  const isQa = id.qa_bug_id !== null;
  const partial = it.context_level === "partial";
  const source = isQa
    ? `QA bug \`${id.qa_bug_id}\` (origin \`${id.origin}\`) — the QA repository's hash-verified ledger ${label}`
    : `${id.origin === "external" ? `external tracker \`${id.external_ref}\`` : `\`${id.origin}\` report`} — ${label}`;
  const repro = [
    `- **Source:** ${source}`,
    `- **Intake context level:** ${partial ? "partial — QA ownership state unverified" : "full"}`,
    `- **QA state:** ${!isQa ? "not a QA bug" : it.qa_state ? `${it.qa_state} (verified)` : "unavailable"}`,
    "- **Steps:**",
    ...ev.steps.map((s: string, i: number) => `  ${i + 1}. ${oneLine(s)}`),
    `- **Found in build:** ${id.found_in_build ?? "unknown"}`,
    `- **Affected surfaces:** ${id.surfaces.length ? id.surfaces.join(", ") : "unknown"}`,
    ...(id.external_ref && isQa ? [`- **External reference:** ${id.external_ref}`] : []),
    ...(ev.environment ? [`- **Environment:** ${oneLine(ev.environment)}`] : []),
    ...(ev.description ? [`- **Description:** ${oneLine(ev.description)}`] : []),
    ...(it.qa?.reproductions?.length
      ? ["- **QA reproductions:**", ...it.qa.reproductions.map((r: any) => `  - \`${r.run}\` — ${r.outcome} on ${r.build} / ${r.surface} / ${r.device}${r.notes ? ` — ${oneLine(r.notes)}` : ""}`)]
      : []),
    ...(it.qa?.evidence?.length ? [`- **QA evidence:** ${it.qa.evidence.map((e: string) => `\`${e}\``).join(", ")}`] : []),
    ...(a.warnings.length
      ? ["", "**Partial-context warnings** — preserved verbatim from intake:", "", ...a.warnings.map((w: any) => `- \`${w.code}\` — ${oneLine(w.message)}`)]
      : []),
  ];
  const observed = [`- **Observed:** ${oneLine(ev.actual)} ${label}`, `- **Expected:** ${oneLine(ev.expected)} ${label}`];
  const affected = [
    `- **Platform / device type:** ${route.platform} / ${route.device_type} — ${route.how}`,
    `- **Affected surfaces:** ${id.surfaces.length ? id.surfaces.join(", ") : "unknown"} (from intake — corroborating evidence, never routing)`,
    `- **Capability:** ${capability.id ?? "not located"} — ${capability.how}`,
    `- **Related feature:** ${id.related_feature ?? "none"}`,
  ];

  const emptyLabels = (s: string) => s.replace(/^(- \*\*[^*]+:\*\*).*$/gm, "$1");
  const out: string[] = [];
  for (const name of BUG_WORK_PLAN_SECTIONS) {
    let s = tpl.sections[name] ?? "";
    if (name === "Fix Design" || name === "Verification Strategy") s = emptyLabels(s);
    if (name === "Tasks") s = s.split("\n").filter((l) => !/^\| T1 \|/.test(l)).join("\n");
    const filled = name === "Reproduction Evidence" ? repro : name === "Observed vs Expected" ? observed : name === "Affected Capability & Surfaces" ? affected : null;
    out.push(`## ${name}\n\n${s}${filled ? `\n\n${filled.join("\n")}` : ""}\n`);
  }
  return [`# Bug Work Plan — ${id.bug_key}: ${oneLine(ev.title)}`, "", "```yaml", ...fmLines, "```", "", out.join("\n")].join("\n");
}

function refuse(code: string, reason: string, extra: Record<string, unknown> = {}): Record<string, any> {
  return { ok: false, outcome: "SCAFFOLD_REFUSED", code, reason, ...extra };
}

export function scaffoldPlan(req: BugRequest): Record<string, any> {
  if (req.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(req.date)) return refuse("INVALID_ARGUMENT", "--date must be YYYY-MM-DD");
  if (req.author !== undefined && !PLAIN.test(req.author)) return refuse("INVALID_ARGUMENT", "--author must be a plain name");
  if (req.capability !== undefined && !isSafeKey(req.capability)) return refuse("INVALID_ARGUMENT", "--capability must be a capability id");
  const a = assess(req);
  if (a.outcome !== "BUG_PLAN_NEW" && a.outcome !== "BUG_PLAN_REGENERATE") {
    const { root, ...shown } = a;
    return { ...shown, ok: false, code: "NOT_SCAFFOLDABLE", reason: `${a.outcome}: ${a.reason} — no plan is written` };
  }

  // Routing: a confirmed (or inherited) platform and device type, never chosen here.
  const r = a.routing;
  if ((req.platform !== undefined && !PLATFORMS.includes(req.platform)) || (req.deviceType !== undefined && !DEVICE_TYPES.includes(req.deviceType))) {
    return refuse("ROUTING_INVALID", `platform must be one of ${PLATFORMS.join(", ")} and device type one of ${DEVICE_TYPES.join(", ")}`);
  }
  let route: { platform: string; device_type: string; how: string };
  if (r.requires_confirmation) {
    if (!req.platform || !req.deviceType) return refuse("ROUTING_REQUIRED", "the platform and device type must be confirmed by the developer (--platform, --device-type) — QA surfaces never decide them");
    route = { platform: req.platform, device_type: req.deviceType, how: "confirmed by the developer" };
  } else {
    if ((req.platform && req.platform !== r.platform) || (req.deviceType && req.deviceType !== r.device_type)) {
      return refuse("ROUTING_CONFLICT", `the routing is ${r.platform} / ${r.device_type} (${r.reason}); a different value is not applied silently`);
    }
    route = { platform: r.platform, device_type: r.device_type, how: r.source === "existing-plan" ? "carried from the existing plan, as confirmed" : `inherited from \`${r.source}\` (the approved Task Breakdown of related feature \`${a.intake.identity.related_feature}\`)` };
  }

  // Capability: the one QA bound wins; a Project Knowledge lookup fills it only when none was bound.
  const bound = a.knowledge.capability as string | null;
  if (bound && req.capability && req.capability !== bound) {
    return refuse("CAPABILITY_CONFLICT", `QA bound capability ${bound}; the looked-up ${req.capability} never overrides it`);
  }
  const capability = bound
    ? { id: bound, how: "bound by QA intake" }
    : req.capability
      ? { id: req.capability, how: `located in Project Knowledge — \`docs/project/capabilities.md#capability-${req.capability}\`` }
      : { id: null, how: "the change surface is discovered live" };

  const text = scaffoldText(a, route, capability, req);
  const abs = join(a.root, a.plan_path);
  if (!resolve(abs).startsWith(a.root + sep)) return refuse("UNSAFE_PATH", `${a.plan_path} escapes the repository root`);
  mkdirSync(dirname(abs), { recursive: true });
  const tmp = `${abs}.analyze-bug.tmp`;
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, abs);
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best effort */
    }
    return refuse("WRITE_FAILED", `could not write ${a.plan_path}: ${(e as Error).message}`);
  }
  return {
    ok: true,
    outcome: "SCAFFOLDED",
    plan_path: a.plan_path,
    regenerated: a.outcome === "BUG_PLAN_REGENERATE",
    routing: route,
    capability,
    context_level: a.context_level,
    warnings: a.warnings,
    to_fill: ["Affected Capability & Surfaces (Project Knowledge state)", "Root Cause", "Blast Radius", "Fix Design", "Verification Strategy", "Tasks", "Repo Knowledge Reference", "Open Questions", "repo_knowledge_* frontmatter"],
  };
}

/* ------------------------------------------------------------------- check */

function sectionText(body: string, name: string): string {
  const start = body.indexOf(`\n## ${name}\n`);
  if (start === -1) return "";
  const from = start + `\n## ${name}\n`.length;
  const next = body.indexOf("\n## ", from);
  return body.slice(from, next === -1 ? body.length : next);
}
const stripComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, "").trim();

export function checkPlan(req: BugRequest): Record<string, any> {
  const a = assess(req);
  const problems: Array<{ code: string; message: string }> = [];
  if (!a.plan_path) return { ok: false, outcome: a.outcome, reason: a.reason, problems: [{ code: "NO_PLAN_CONTEXT", message: a.reason }] };
  const abs = join(a.root, a.plan_path);
  if (!existsSync(abs)) return { ok: false, outcome: a.outcome, problems: [{ code: "PLAN_MISSING", message: `${a.plan_path} does not exist` }] };
  const buf = readFileSync(abs);
  const v = validateBugWorkPlan(buf);
  if (!v.ok) for (const e of v.errors) problems.push({ code: "PLAN_INVALID", message: `${e.code}: ${e.message}` });
  if (a.plan?.drift?.length) problems.push({ code: "PLAN_STALE", message: `the plan no longer matches intake: ${a.plan.drift.join(", ")}` });

  const body = (splitDocument(buf) as any).body?.toString("utf-8") ?? "";
  for (const name of BUG_WORK_PLAN_SECTIONS) {
    if (stripComments(sectionText(body, name)) === "") problems.push({ code: "SECTION_EMPTY", message: `section "${name}" has no content` });
  }
  if (!/\[(evidence: [^\]]+|reused: [^\]]+|inference|unknown)\]/.test(stripComments(sectionText(body, "Root Cause")))) {
    problems.push({ code: "EVIDENCE_LABELS", message: "Root Cause must label its claims [evidence: <path>], [reused: <path>#<anchor>], [inference] or [unknown] — never an unlabelled root cause" });
  }
  const tasks: Array<{ id: string; cycle: number }> = v.tasks ?? [];
  const ids = new Set(tasks.filter((t) => t.cycle === 1).map((t) => t.id));
  const criteria = stripComments(sectionText(body, "Tasks")).split("\n").filter((l) => /^\|\s*T[1-9][0-9]*\s*\|/.test(l)).map((l) => {
    const cells = l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    return (cells[6] ?? "").split(/;|<br\s*\/?>/i)[0].trim();
  });
  if (!criteria.some((c) => c.toLowerCase().startsWith(REPRO_CRITERION.toLowerCase()))) {
    problems.push({ code: "REPRO_CRITERION", message: `the fix task's first acceptance criterion must begin "${REPRO_CRITERION}"` });
  }
  const regression = /^\s*[-*]\s+\*\*Regression test:\*\*(.*)$/m.exec(sectionText(body, "Verification Strategy"))?.[1]?.trim() ?? "";
  const named = [...regression.matchAll(/\bT[1-9][0-9]*\b/g)].map((m) => m[0]);
  if (!/^Not feasible:\s*\S/i.test(regression) && !named.some((t) => ids.has(t))) {
    problems.push({ code: "REGRESSION_PLAN", message: 'Regression test must name the task that writes or extends it (T<n>), or begin "Not feasible:" with the reason' });
  }
  if (a.context_level === "partial") {
    const repro = stripComments(sectionText(body, "Reproduction Evidence"));
    for (const w of a.warnings) if (!repro.includes(`\`${w.code}\``)) problems.push({ code: "PARTIAL_WARNINGS", message: `Reproduction Evidence must keep the intake warning ${w.code}` });
  }
  return { ok: problems.length === 0, outcome: a.outcome, plan_path: a.plan_path, problems };
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
  const [cmd, ref] = positional;
  const req: BugRequest = {
    root: flags.root ?? "",
    ref,
    qaRepo: flags["qa-repo"],
    external: flags.external,
    origin: flags.origin,
    report: flags.report,
    platform: flags.platform,
    deviceType: flags["device-type"],
    capability: flags.capability,
    author: flags.author,
    date: flags.date,
  };
  if (cmd === "start") print(startBug(req));
  if (cmd === "scaffold") print(scaffoldPlan(req));
  if (cmd === "check") print(checkPlan(req));
  print({ ok: false, outcome: "UNKNOWN_COMMAND", reason: "usage: analyze-bug.ts start|scaffold|check <ref-args> --root <TARGET_ROOT>" });
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /analyze-bug\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) main();
