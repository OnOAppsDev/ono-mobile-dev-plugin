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
import { rewriteFrontmatterValues, verifyApproval } from "./work-approval.ts";
import { readFrontmatter, splitDocument } from "./migrate-planning-doc.ts";
import { rowCells, sectionFingerprints } from "./task-resume.ts";
import { readTaskState, stateFilePath, BUG_REPRO_CRITERION } from "./task-state.ts";

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
  // A verified reopen (full QA context only — partial context never reports `reopened`)
  // continues the existing plan in its next fix cycle; it is not a denial.
  const reopened = it.status === "reopened";
  if (!reopened && it.dev_may_start !== true) {
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
    if (reopened) {
      return { ...common, ok: false, outcome: "BUG_REOPENED", proceed: null, reason: "QA re-tested a fix and it failed, but there is no Bug Work Plan to continue — a reopened bug continues the plan of the fix that failed; nothing is created here", reopened: it.reopened };
    }
    return { ...common, ok: true, outcome: "BUG_PLAN_NEW", proceed: "create", reason: "no plan exists yet — create the cycle-1 plan", plan: null, routing: routing(root, it.identity, null) };
  }

  const buf = readFileSync(abs);
  const v = validateBugWorkPlan(buf);
  const latestCycle = v.frontmatter?.fix_cycle ?? 1;
  if (!v.ok && latestCycle > 1 && v.frontmatter?.bug_key === key &&
      v.errors.every((e: any) => (e.code === "CYCLE_LABEL" || e.code === "TASK_TABLE") && e.message.startsWith(`Cycle ${latestCycle}`))) {
    // An appended cycle whose analysis is not written yet: resume it, never append again.
    return { ...common, ok: true, outcome: "BUG_CYCLE_INCOMPLETE", proceed: "complete-cycle", reason: `fix cycle ${latestCycle} was appended and its analysis is not finished — fill it, then validate and approve`, cycle: latestCycle, plan: { valid: false, errors: v.errors } };
  }
  if (!v.ok) {
    return { ...common, ok: false, outcome: "BUG_PLAN_INVALID", proceed: null, reason: `${rel} is not a valid bug-work-plan — fix it by hand or remove it; it is never overwritten`, plan: { valid: false, errors: v.errors } };
  }
  const fm = v.frontmatter;
  if (fm.bug_key !== key) {
    return { ...common, ok: false, outcome: "BUG_PLAN_INVALID", proceed: null, reason: `${rel} records bug_key ${fm.bug_key}, not ${key}`, plan: { valid: false, errors: [{ code: "IDENTITY_MISMATCH", message: `bug_key ${fm.bug_key} ≠ ${key}` }] } };
  }
  const approval = verifyApproval(buf);
  const { drift } = evidenceDrift(fm, it);
  const progress = cycleProgress(root, key, abs, v);
  const plan = { valid: true, approval: { status: approval.status, reasons: approval.reasons }, drift, frontmatter: fm, cycle: progress };
  const withPlan = { ...common, plan };

  if (reopened) {
    const failed = it.reopened?.failed_fix_build ?? null;
    const cycles = v.cycles as Array<{ cycle: number; failed_build: string }>;
    const answered = cycles.length > 0 && cycles[cycles.length - 1].failed_build === failed;
    const identityDrift = drift.filter((f) => f !== "bug_evidence_fingerprint" && f !== "found_in_build");
    if (!answered && cycles.some((c) => c.failed_build === failed)) {
      return { ...withPlan, ok: false, outcome: "BUG_PLAN_STALE", proceed: null, reason: `QA's failed fix ${failed} is already answered by an earlier cycle, not the latest — the plan and QA disagree; nothing is appended` };
    }
    if (!answered) {
      if (identityDrift.length > 0) {
        return { ...withPlan, ok: false, outcome: "BUG_PLAN_STALE", proceed: null, reason: `the bug's identity changed (${identityDrift.join(", ")}) — a new cycle cannot continue a different bug` };
      }
      if (!progress.handed_off) {
        return { ...withPlan, ok: false, outcome: "BUG_REOPEN_UNMATCHED", proceed: null, reason: `QA reopened the bug after fix ${failed} failed, but fix cycle ${progress.cycle} of this plan was never handed to QA — this reopen does not follow this plan's fix, so no cycle is appended`, reopened: it.reopened };
      }
      return {
        ...withPlan,
        ok: true,
        outcome: "BUG_CYCLE_NEW",
        proceed: "append-cycle",
        reason: `QA re-tested the cycle-${progress.cycle} fix (${failed}) and it failed — append fix cycle ${progress.cycle + 1} to the same plan`,
        next_cycle: progress.cycle + 1,
        evidence_class: drift.length > 0 ? "changed" : "unchanged",
        drift,
        reopened: it.reopened,
        routing: routing(root, it.identity, fm),
      };
    }
    // The latest cycle already answers this reopen: report that cycle's state below.
  }

  if (drift.length) {
    if (fm.fix_cycle === 1 && approval.status === "draft" && !common.task_state_exists) {
      return { ...withPlan, ok: true, outcome: "BUG_PLAN_REGENERATE", proceed: "regenerate", reason: `the bug evidence changed (${drift.join(", ")}) and the plan is an unapproved draft with no task state — regenerate it in place`, routing: routing(root, it.identity, fm) };
    }
    return { ...withPlan, ok: false, outcome: "BUG_PLAN_STALE", proceed: null, reason: `the bug evidence changed (${drift.join(", ")}) under a plan that is ${approval.status === "draft" ? "already in implementation (task state exists)" : `${approval.status}`}${fm.fix_cycle > 1 ? `, at fix cycle ${fm.fix_cycle}` : ""} — reconciling it needs a verified reopen or a human decision; nothing is regenerated` };
  }
  if (approval.status === "approved") {
    if (progress.complete && progress.handed_off) {
      if (it.context_level !== "full") {
        return { ...withPlan, ok: false, outcome: "BUG_REOPEN_UNVERIFIED", proceed: null, reason: `fix cycle ${progress.cycle} was handed to QA, and QA's state is unavailable (partial context) — whether QA reopened the bug cannot be verified, so a new cycle cannot start; read the bug again once QA's state is available` };
      }
      return { ...withPlan, ok: true, outcome: "BUG_CYCLE_HANDED_OFF", proceed: null, reason: `fix cycle ${progress.cycle} is implemented and handed to QA — QA re-tests it; a new cycle starts only after a verified reopen`, next_action: null };
    }
    return {
      ...withPlan,
      ok: true,
      outcome: "BUG_PLAN_APPROVED",
      proceed: null,
      reason: `the plan is approved for fix cycle ${progress.cycle} and still matches the bug evidence`,
      next_action: progress.first_incomplete ? `/implement-task bug:${key} ${progress.first_incomplete}` : `/review-code --bug ${key}, then /create-dev-qa-notes bug:${key}`,
      next_action_note: "Pass the bug's evidence source to /implement-task too (--qa-repo=<path> for a QA bug, --report=<path> otherwise): it re-reads the evidence before every task.",
    };
  }
  if (approval.status === "draft" || (approval.status === "approval_stale" && progress.recorded === 0)) {
    return { ...withPlan, ok: true, outcome: "BUG_PLAN_AWAITING_APPROVAL", proceed: "approve", reason: approval.status === "draft" ? "the plan is a current draft — present it for approval" : `the plan changed after it was approved${fm.fix_cycle > 1 ? ` (fix cycle ${fm.fix_cycle} is new)` : ""} — present it for approval`, routing: routing(root, it.identity, fm) };
  }
  if (approval.status === "approval_stale") {
    return { ...withPlan, ok: false, outcome: "BUG_PLAN_STALE", proceed: null, reason: "the plan changed after approval and this cycle's tasks have task state — reconciling it needs a human decision" };
  }
  return { ...withPlan, ok: false, outcome: "BUG_PLAN_INVALID", proceed: null, reason: `the plan's approval fields are inconsistent (${(approval.reasons ?? []).map((r: any) => r.code).join(", ")}) — they are written only by scripts/work-approval.ts` };
}

/**
 * Where the plan's current fix cycle stands: its tasks (T<n> in cycle 1, C<n>-T<m> later), how
 * many have task state, which are not yet proven complete, and whether this cycle was handed to
 * QA — the bug's handoff names this cycle and is `ready-for-qa` (the handoff gate verified that
 * approval when it was given).
 */
function cycleProgress(root: string, key: string, planAbs: string, v: Record<string, any>) {
  const n = v.frontmatter.fix_cycle as number;
  const ids = (v.tasks as Array<{ id: string; cycle: number }>).filter((t) => t.cycle === n).map((t) => t.id);
  const state = readTaskState(root, `bug:${key}`, planAbs);
  const recorded = ids.filter((id) => state.tasks[id] !== undefined && state.tasks[id].state !== "unknown").length;
  const incomplete = ids.filter((id) => state.tasks[id]?.deterministicProof !== true);
  const handoff = join(root, `docs/qa/bug-${key}-qa-handoff.md`);
  const hf = existsSync(handoff) ? readFrontmatter(readFileSync(handoff))?.values ?? {} : {};
  const handedOff = hf.work_type === "bug" && hf.bug_key === key && hf.fix_cycle === String(n) && hf.status === "ready-for-qa";
  return { cycle: n, tasks: ids, recorded, incomplete, first_incomplete: incomplete[0] ?? null, complete: ids.length > 0 && incomplete.length === 0, handed_off: handedOff };
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

/** Reproduction Evidence and Observed vs Expected, from intake — the deterministic half the scaffold writes and a changed-evidence cycle refreshes. */
function evidenceBlocks(a: Record<string, any>): { repro: string[]; observed: string[] } {
  const it = a.intake;
  const id = it.identity;
  const ev = it.evidence;
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
  return { repro, observed };
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

  const { repro, observed } = evidenceBlocks(a);
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

/** The helper's only write: a sibling temp file, then a rename. */
function atomicWrite(abs: string, data: string | Buffer): string | null {
  mkdirSync(dirname(abs), { recursive: true });
  const tmp = `${abs}.analyze-bug.tmp`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, abs);
    return null;
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best effort */
    }
    return (e as Error).message;
  }
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
  const failed = atomicWrite(abs, text);
  if (failed !== null) return refuse("WRITE_FAILED", `could not write ${a.plan_path}: ${failed}`);
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

/* ------------------------------------------------------------- fix cycles */

/** The cycle labels the analysis writes; append-cycle leaves them empty, so an unfinished cycle never validates. */
const CYCLE_JUDGEMENT = ["Why the previous fix was insufficient", "Fix-design delta", "New risks", "Changed non-goals", "Changed affected files / areas", "Verification delta"];

/**
 * Append the next fix cycle to the existing Bug Work Plan — only when `start` says
 * `BUG_CYCLE_NEW` (a verified reopen of the handed-off current cycle).
 *
 *   - `### Cycle N+1` goes at the end of `## Fix Cycles`, carrying QA's failed re-test
 *     (failed build and surfaces, the re-test run, QA's notes and evidence, the fix claims)
 *     and empty judgement labels for the analysis; `fix_cycle` becomes N+1.
 *   - Changed evidence: Reproduction Evidence and Observed vs Expected are refreshed from
 *     intake first, marked as refreshed, with their previous text kept in the new cycle; the
 *     frontmatter evidence fields follow intake.
 *   - Every earlier cycle — the Tasks section and each `### Cycle k` — and, for unchanged
 *     evidence, the whole shared analysis is asserted byte-identical before anything is written.
 *
 * The approval is left as it was: it no longer matches, so the plan reads `approval_stale`
 * until a human approves the new cycle through work-approval.ts.
 */
export function appendCycle(req: BugRequest): Record<string, any> {
  const a = assess(req);
  if (a.outcome !== "BUG_CYCLE_NEW") {
    const { root, ...shown } = a;
    return { ...shown, ok: false, code: a.context_level === "partial" ? "BUG_REOPEN_UNVERIFIED" : "NOT_APPENDABLE", reason: `${a.outcome}: ${a.reason} — no cycle is appended` };
  }
  if (a.context_level !== "full") return refuse("BUG_REOPEN_UNVERIFIED", "a new fix cycle needs a verified QA reopen (full QA context)");
  const abs = join(a.root, a.plan_path);
  const buf = readFileSync(abs);
  const split = splitDocument(buf) as any;
  let body: string = split.body.toString("utf-8");
  const fm = a.plan.frontmatter;
  const n: number = fm.fix_cycle;
  const next = n + 1;
  const ro = a.intake.reopened;
  const latest = ro.latest_retest ?? {};
  const failed: string = ro.failed_fix_build;
  const earlier = (ro.previous_fix_claims ?? []).filter((c: any) => c.build !== failed);
  const changed = a.evidence_class === "changed";
  const sectionBody = (name: string) => {
    const start = body.indexOf(`\n## ${name}\n`);
    const from = start + `\n## ${name}\n`.length;
    const end = body.indexOf("\n## ", from);
    return { start, from, end, text: body.slice(from, end) };
  };
  const quote = (t: string) => t.trim().split("\n").map((l) => (l.trim() === "" ? ">" : `> ${l}`)).join("\n");

  const lines = [
    `- **Failed build:** ${failed}`,
    `- **Failed surfaces:** ${(ro.failed_surfaces ?? []).join(", ")}`,
    `- **Failed re-test evidence:** [evidence: qa-ledger/runs/${latest.run}.jsonl] \`${latest.run}\` — ${latest.outcome} on ${latest.build} / ${latest.surface} / ${latest.device} (${latest.at})`,
    `- **QA notes:** ${oneLine(latest.notes) || "none"}; evidence: ${(ro.evidence ?? []).length ? ro.evidence.map((e: string) => `\`${e}\``).join(", ") : "none"}`,
    `- **Previous fix claim:** ${failed} — failed (the cycle ${n} fix)${earlier.length ? `; earlier: ${earlier.map((c: any) => `${c.build} ${c.outcome}`).join(", ")}` : ""}`,
    ...CYCLE_JUDGEMENT.map((l) => `- **${l}:**`),
  ];
  const evidenceChange: string[] = [];
  if (changed) {
    const oldRepro = stripComments(sectionBody("Reproduction Evidence").text);
    const oldObserved = stripComments(sectionBody("Observed vs Expected").text);
    evidenceChange.push(
      `- **Evidence change:** \`${fm.bug_evidence_fingerprint}\` → \`${a.intake.bug_evidence_fingerprint}\` (${a.drift.join(", ")}). Reproduction Evidence and Observed vs Expected were refreshed for this cycle; their previous text:`,
      "",
      quote(oldRepro),
      ">",
      quote(oldObserved),
    );
    const { repro, observed } = evidenceBlocks(a);
    const marker = `*Refreshed for Cycle ${next}: the bug evidence changed (${a.drift.join(", ")}). The previous evidence is kept under \`### Cycle ${next}\`.*`;
    for (const [name, content] of [["Reproduction Evidence", repro], ["Observed vs Expected", observed]] as const) {
      const sec = sectionBody(name);
      body = `${body.slice(0, sec.from)}\n${marker}\n\n${content.join("\n")}\n${body.slice(sec.end)}`;
    }
  }
  const table = ["| id | description | platform | files touched | depends-on | size | acceptance criteria |", "|---|---|---|---|---|---|---|"];
  const block = [`### Cycle ${next}`, "", ...lines, ...(evidenceChange.length ? ["", ...evidenceChange] : []), "", ...table, ""].join("\n");
  body = body.replace("No additional fix cycles yet. Cycle 1 is the Tasks section above.", "Cycle 1 is the Tasks section above.");
  const at = body.indexOf("\n## Repo Knowledge Reference\n");
  if (at === -1) return refuse("PLAN_INVALID", "the plan has no Repo Knowledge Reference section to append before");
  const head = body.slice(0, at).replace(/\n*$/, "\n");
  body = `${head}\n${block}${body.slice(at)}`;

  const assembled = Buffer.concat([split.leading, Buffer.from([split.open, ...split.inner, split.close].join(split.eol) + split.eol, "utf-8"), Buffer.from(body, "utf-8")]);
  const values: Record<string, string> = { fix_cycle: String(next) };
  if (changed) {
    values.bug_evidence_fingerprint = a.intake.bug_evidence_fingerprint;
    values.found_in_build = yamlValue(a.intake.identity.found_in_build);
    values.surfaces = yamlValue(a.intake.identity.surfaces);
  }
  const out = rewriteFrontmatterValues(assembled, values);
  if (!out.ok) return refuse(out.code, `${out.message} — nothing was written`);

  // History is immutable: every earlier cycle, and (unchanged evidence) the shared analysis.
  const anchorsOf = (b: Buffer) => sectionFingerprints((splitDocument(b) as any).body.toString("utf-8"));
  const before = anchorsOf(buf), after = anchorsOf(out.buf);
  const kept = ["tasks", ...Array.from({ length: n - 1 }, (_, i) => `cycle-${i + 2}`),
    ...(changed ? [] : ["reproduction-evidence", "observed-vs-expected", "affected-capability--surfaces", "root-cause", "blast-radius", "fix-design", "verification-strategy"])];
  const moved = kept.filter((k) => before[k] !== after[k]);
  if (moved.length > 0) return refuse("HISTORY_CHANGED", `appending would change ${moved.join(", ")} — earlier cycles are immutable; nothing was written`);

  const failedWrite = atomicWrite(abs, out.buf);
  if (failedWrite !== null) return refuse("WRITE_FAILED", `could not write ${a.plan_path}: ${failedWrite}`);
  return {
    ok: true,
    outcome: "CYCLE_APPENDED",
    plan_path: a.plan_path,
    cycle: next,
    evidence_class: a.evidence_class,
    drift: a.drift,
    to_fill: [...CYCLE_JUDGEMENT.map((l) => `Cycle ${next}: ${l}`), `Cycle ${next}: task table (C${next}-T1, …)`, ...(changed ? ["Root Cause and other analysis the changed evidence affects — mark refreshed content"] : [])],
    approval: "stale — the new cycle needs one human approval (work-approval.ts)",
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
  // The current fix cycle: cycle 1 is the Tasks section; cycle n ≥ 2 is `### Cycle n`.
  const cycleNo: number = v.frontmatter?.fix_cycle ?? 1;
  const tasks: Array<{ id: string; cycle: number }> = v.tasks ?? [];
  const ids = new Set(tasks.filter((t) => t.cycle === cycleNo).map((t) => t.id));
  const text = buf.toString("utf-8");
  const criteria = [...ids].map((id) => (rowCells(text, id)?.["acceptance criteria"] ?? "").split(/;|<br\s*\/?>/i)[0].trim());
  if (!criteria.some((c) => c.toLowerCase().startsWith(REPRO_CRITERION.toLowerCase()))) {
    problems.push({ code: "REPRO_CRITERION", message: `the fix task's first acceptance criterion must begin "${REPRO_CRITERION}"${cycleNo > 1 ? ` — in cycle ${cycleNo}, the failed re-test path is mandatory acceptance evidence` : ""}` });
  }
  const cycle = cycleNo > 1 ? (v.cycles ?? []).find((c: any) => c.cycle === cycleNo) : null;
  const regression = cycle
    ? String(cycle.verification_delta ?? "")
    : /^\s*[-*]\s+\*\*Regression test:\*\*(.*)$/m.exec(sectionText(body, "Verification Strategy"))?.[1]?.trim() ?? "";
  const named = [...regression.matchAll(/\b(?:C[1-9][0-9]*-)?T[1-9][0-9]*\b/g)].map((m) => m[0]);
  if (!/^Not feasible:\s*\S/i.test(regression) && !named.some((t) => ids.has(t))) {
    problems.push({ code: "REGRESSION_PLAN", message: cycle
      ? `Cycle ${cycleNo}'s Verification delta must name the cycle task that writes or updates the regression test (C${cycleNo}-T<n>), or begin "Not feasible:" with the reason`
      : 'Regression test must name the task that writes or extends it (T<n>), or begin "Not feasible:" with the reason' });
  }
  if (cycle) {
    const missingSurfaces = (cycle.failed_surfaces as string[]).filter((sf) => !regression.includes(sf));
    if (missingSurfaces.length > 0) problems.push({ code: "CYCLE_SURFACES", message: `Cycle ${cycleNo}'s Verification delta must cover the surfaces the re-test failed on: ${missingSurfaces.join(", ")}` });
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
  if (cmd === "append-cycle") print(appendCycle(req));
  print({ ok: false, outcome: "UNKNOWN_COMMAND", reason: "usage: analyze-bug.ts start|scaffold|check <ref-args> --root <TARGET_ROOT>" });
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /analyze-bug\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) main();
