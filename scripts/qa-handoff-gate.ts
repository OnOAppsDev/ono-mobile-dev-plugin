/**
 * qa-handoff-gate.ts
 *
 * The bug half of `/create-dev-qa-notes bug:<bug_key>` (Bug Development Flow, Step 7): the Bug
 * QA handoff at docs/qa/bug-<bug_key>-qa-handoff.md, its readiness checks R1–R9, and its one
 * human approval to `ready-for-qa`. Feature handoffs are untouched.
 *
 *   check     read-only. R1–R9 against the current plan, bug evidence, task state and review,
 *             the handoff-input fingerprint, the Major findings that need acknowledging, and
 *             what to do next: `blocked` | `generate` | `approve` | `done`.
 *   generate  writes the draft handoff, deterministically, from the approved Bug Work Plan,
 *             task state and review record (plus the platform lane's build instructions).
 *             Refuses while anything blocks. Leaves a current draft or a valid ready-for-qa
 *             handoff untouched; regenerates — as a draft — when its inputs changed.
 *   approve   needs an explicit human identity and one `--ack-major <id>` per Major finding.
 *             Writes exactly status: ready-for-qa, approved_by, acknowledged_majors and
 *             approved_fingerprint, bound to the handoff body, its input fingerprint and the
 *             acknowledgements. Never by a manual status edit, never on a timestamp.
 *   verify    read-only. `missing` | `draft` | `ready-for-qa` | `stale`, for re-entry and for
 *             any later consumer.
 *
 * It never writes task state, the plan, the review record or a QA repository; never registers
 * a build; never reads Project Knowledge; runs no process of its own and reads no clock; never
 * commits.
 *
 * Always exits 0 and prints one JSON object; callers branch on `ok` / `next` / `status`.
 *
 *   node --no-warnings scripts/qa-handoff-gate.ts check    bug:<bug_key> --root <dir> [--qa-repo <path> | --report <file>]
 *   node --no-warnings scripts/qa-handoff-gate.ts generate bug:<bug_key> --root <dir> [--qa-repo | --report] --date YYYY-MM-DD --build-instructions <file.md>
 *   node --no-warnings scripts/qa-handoff-gate.ts approve  bug:<bug_key> --root <dir> [--qa-repo | --report] --by <identity> [--ack-major <id>]...
 *   node --no-warnings scripts/qa-handoff-gate.ts verify   bug:<bug_key> --root <dir>
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { createHash } from "crypto";
import { validateBugWorkPlan, bugWorkPlanPath } from "./bug-work-plan.ts";
import { approvalFingerprint, plainIdentityProblem, rewriteFrontmatterValues, verifyApproval } from "./work-approval.ts";
import { bugGate, planContext } from "./bug-implementation.ts";
import { readReviewRecord, reproductionEvidence, verifyReviewRecord } from "./bug-review.ts";
import { BUG_REPRO_CRITERION, bugKeyOf, parseBreakdown, readTaskState, stateFilePath } from "./task-state.ts";
import { rowCells, taskRowsText } from "./task-resume.ts";
import { canonical } from "./qa-release-gate.ts";
import { splitDocument } from "./migrate-planning-doc.ts";

const sha = (s: string | Buffer): string => `sha256:${createHash("sha256").update(s).digest("hex")}`;
const ALGORITHM = "qa-handoff/bug/v1";
export const HANDOFF_FIELDS = [
  "work_type", "bug_key", "qa_bug_id", "external_ref", "fix_cycle", "platform", "device_type", "surfaces", "bug_work_plan_link", "review_link",
  "handoff_input_fingerprint", "status", "generated_by", "date", "acknowledged_majors", "approved_by", "approved_fingerprint",
] as const;
export const HANDOFF_SECTIONS = [
  "Bug Summary", "Fix Claim", "Reproduction Scenario", "Build / Install / Testing Instructions", "Developer Verification", "Regression Scope", "Known Limitations", "Pending Verification (owed to QA)",
] as const;

export const handoffPathFor = (key: string) => `docs/qa/bug-${key}-qa-handoff.md`;

type CheckResult = { id: string; status: "pass" | "block" | "ack-required" | "generate" | "info" | "not-run"; message: string; code?: string; route?: string; details?: unknown };
interface Request { root: string; work: string; qaRepo?: string; report?: string }

/* ---------------------------------------------------------------- inputs */

interface Inputs {
  key: string;
  root: string;
  planAbs: string;
  planBuf: Buffer;
  fm: Record<string, any>;
  cycle: number;
  /** The current fix cycle's tasks — T<n> in cycle 1, C<n>-T<m> later. Earlier cycles are history. */
  currentIds: string[];
  review: ReturnType<typeof readReviewRecord>;
  taskStateFp: string | null;
}

function loadInputs(req: Request): { ok: true; inputs: Inputs } | { ok: false; check: CheckResult } {
  const block = (code: string, message: string, route?: string) => ({ ok: false as const, check: { id: "R1", status: "block" as const, code, message, ...(route ? { route } : {}) } });
  const key = bugKeyOf(req.work ?? "");
  if (key === null) return block("BUG_WORK_ID_INVALID", `"${req.work}" is not bug work — name it bug:<bug_key>`);
  if (!req.root || !existsSync(req.root) || !statSync(req.root).isDirectory()) return block("BUG_ROOT_INVALID", `repository root ${req.root ?? ""} does not exist`);
  const root = realpathSync(req.root);
  const planAbs = join(root, bugWorkPlanPath(key) as string);
  if (!existsSync(planAbs)) return block("BUG_PLAN_MISSING", `no Bug Work Plan for ${key}`, "/analyze-bug <bug-ref>");
  const planBuf = readFileSync(planAbs);
  const v = validateBugWorkPlan(planBuf);
  if (!v.ok || v.frontmatter.bug_key !== key) return block("BUG_PLAN_INVALID", `the Bug Work Plan for ${key} is not valid`, "/analyze-bug <bug-ref>");
  const approval = verifyApproval(planBuf);
  if (approval.status !== "approved") {
    return block(approval.status === "draft" ? "BUG_PLAN_NOT_APPROVED" : "BUG_APPROVAL_STALE", `the Bug Work Plan's approval is ${approval.status} — it must be approved for fix cycle ${v.frontmatter.fix_cycle}`, "/analyze-bug <bug-ref>");
  }
  const statePath = stateFilePath(root, `bug:${key}`);
  let taskStateFp: string | null = null;
  if (existsSync(statePath)) {
    try {
      taskStateFp = sha(canonical(JSON.parse(readFileSync(statePath, "utf-8"))));
    } catch {
      taskStateFp = null;
    }
  }
  const currentIds = (v.tasks as Array<{ id: string; cycle: number }>).filter((t) => t.cycle === v.frontmatter.fix_cycle).map((t) => t.id);
  return { ok: true, inputs: { key, root, planAbs, planBuf, fm: v.frontmatter, cycle: v.frontmatter.fix_cycle, currentIds, review: readReviewRecord(root, key, v.frontmatter.fix_cycle), taskStateFp } };
}

/**
 * The handoff-input fingerprint (R8): the exact inputs a handoff is generated from — the bug,
 * the fix cycle, the plan's approval fingerprint, the task state, and the review record's
 * result and binding (not its reviewer or time). Null when an input is missing.
 */
function inputFingerprint(i: Inputs): string | null {
  const r = i.review?.frontmatter;
  if (!r || i.taskStateFp === null) return null;
  return sha(canonical({
    algorithm: ALGORITHM,
    bug_key: i.key,
    fix_cycle: i.cycle,
    bug_work_plan_fingerprint: approvalFingerprint(i.planBuf),
    task_state_fingerprint: i.taskStateFp,
    review: {
      findings_fingerprint: r.findings_fingerprint,
      reviewed_tree_fingerprint: r.reviewed_tree_fingerprint,
      bug_work_plan_fingerprint: r.bug_work_plan_fingerprint,
      task_state_fingerprint: r.task_state_fingerprint,
    },
  }));
}

/** A Major finding's stable id: its normalized content, hashed. */
const majorId = (f: unknown) => `M-${sha(canonical(f)).slice("sha256:".length, "sha256:".length + 12)}`;
const majorsOf = (i: Inputs) => (i.review?.findings ?? []).filter((f) => f.severity === "major").map((f) => ({ id: majorId(f), ...f }));

/** The approval fingerprint: the handoff body, its input fingerprint and the acknowledged Major findings. */
export function approvalFingerprintFor(body: Buffer | string, handoffInputFingerprint: string, acknowledgedMajors: string[]): string {
  return sha(canonical({ algorithm: ALGORITHM, body: sha(body), handoff_input_fingerprint: handoffInputFingerprint, acknowledged_majors: [...acknowledgedMajors].sort() }));
}

/* ------------------------------------------------------------- the handoff */

function expectedIdentity(i: Inputs): Record<string, string> {
  return {
    work_type: "bug",
    bug_key: i.key,
    qa_bug_id: i.fm.qa_bug_id ?? "null",
    external_ref: i.fm.external_ref ?? "null",
    fix_cycle: String(i.cycle),
    platform: i.fm.platform,
    device_type: i.fm.device_type,
    surfaces: `[${(i.fm.surfaces ?? []).join(", ")}]`,
    bug_work_plan_link: bugWorkPlanPath(i.key) as string,
    review_link: `docs/bugs/${i.key}/review-c${i.cycle}.md`,
  };
}

function readHandoff(root: string, key: string): { buf: Buffer; fm: Record<string, string>; body: Buffer } | null {
  const abs = join(root, handoffPathFor(key));
  if (!existsSync(abs)) return null;
  const buf = readFileSync(abs);
  const split = splitDocument(buf);
  if ("error" in split) return { buf, fm: {}, body: Buffer.alloc(0) };
  const fm: Record<string, string> = {};
  for (const l of split.inner) {
    const m = /^([a-z_]+): ?(.*)$/.exec(l);
    if (m) fm[m[1]] = m[2].trim();
  }
  return { buf, fm, body: split.body };
}

const listOf = (v: string | undefined) => (v ?? "").replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean);

function handoffState(i: Inputs) {
  const h = readHandoff(i.root, i.key);
  const current = inputFingerprint(i);
  if (h === null) return { exists: false, status: null as string | null, input_current: false, approval_valid: false, reasons: [] as Array<{ code: string; message: string }>, foreign: false };
  const reasons: Array<{ code: string; message: string }> = [];
  const foreign = h.fm.work_type !== "bug" || h.fm.bug_key !== i.key;
  if (foreign) reasons.push({ code: "HANDOFF_PATH_CONFLICT", message: `${handoffPathFor(i.key)} is not this bug's handoff` });
  const want = expectedIdentity(i);
  const off = Object.keys(want).filter((k) => h.fm[k] !== want[k]);
  if (!foreign && off.length > 0) reasons.push({ code: "HANDOFF_IDENTITY_MISMATCH", message: `the handoff's ${off.join(", ")} no longer match the plan and review` });
  const inputCurrent = current !== null && h.fm.handoff_input_fingerprint === current;
  if (!foreign && !inputCurrent) reasons.push({ code: "HANDOFF_INPUTS_CHANGED", message: "the plan approval, task state or review changed since this handoff was generated" });
  let approvalValid = false;
  if (h.fm.status === "ready-for-qa") {
    const acks = listOf(h.fm.acknowledged_majors).sort();
    const majors = majorsOf(i).map((m) => m.id).sort();
    approvalValid = !!h.fm.approved_by && h.fm.approved_by !== "null" && plainIdentityProblem(h.fm.approved_by) === null &&
      h.fm.approved_fingerprint === approvalFingerprintFor(h.body, h.fm.handoff_input_fingerprint ?? "", acks) && JSON.stringify(acks) === JSON.stringify(majors);
    if (!approvalValid) reasons.push({ code: "HANDOFF_APPROVAL_INVALID", message: "status is ready-for-qa but the approval does not match the handoff body, its inputs or the Major findings it acknowledges" });
  } else if (h.fm.status !== "draft") {
    reasons.push({ code: "HANDOFF_STATUS_INVALID", message: `status "${h.fm.status}" is neither draft nor ready-for-qa` });
  }
  return { exists: true, status: h.fm.status ?? null, input_current: inputCurrent, approval_valid: approvalValid && reasons.length === 0, reasons, foreign };
}

/* ------------------------------------------------------------------- check */

export function handoffCheck(req: Request): Record<string, any> {
  const loaded = loadInputs(req);
  const notRun = (id: string): CheckResult => ({ id, status: "not-run", message: "R1 did not pass" });
  if (!loaded.ok) {
    const checks = [loaded.check, ...["R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"].map(notRun)];
    return { ok: false, outcome: "HANDOFF_BLOCKED", next: "blocked", checks, blockers: [loaded.check], majors: [], warnings: [], developer_debt: [], qa_debt: [] };
  }
  const i = loaded.inputs;
  const work = `bug:${i.key}`;
  const checks: CheckResult[] = [{ id: "R1", status: "pass", message: `the Bug Work Plan is valid and approved for fix cycle ${i.cycle}` }];

  // R2 — upstream current, through the existing bug implementation gate.
  const g = bugGate({ root: i.root, work, qaRepo: req.qaRepo, report: req.report });
  const warnings = g.ok ? (g.warnings ?? []) : [];
  checks.push(g.ok
    ? { id: "R2", status: "pass", message: g.context_level === "partial" ? "the bug evidence is current; QA ownership state is unavailable (partial context)" : "the bug evidence and QA state are current" }
    : { id: "R2", status: "block", code: g.outcome, message: `${g.outcome}: ${g.reason}`, ...(g.route ? { route: g.route } : {}) });

  // R3 — every current-cycle task complete with deterministic proof.
  const text = i.planBuf.toString("utf-8");
  const ids = i.currentIds;
  const state = readTaskState(i.root, work, i.planAbs);
  const unproven = ids.filter((id) => state.tasks[id]?.deterministicProof !== true);
  checks.push(unproven.length === 0
    ? { id: "R3", status: "pass", message: `every cycle-${i.cycle} task is complete with deterministic proof` }
    : { id: "R3", status: "block", code: "TASKS_INCOMPLETE", message: `not proven complete: ${unproven.map((id) => `${id} (${state.tasks[id]?.state ?? "unrecorded"}${state.tasks[id]?.provenance === "human-attested" ? ", human-attested" : ""})`).join(", ")}`, route: `/implement-task ${work} ${unproven[0]}` });

  // R4 — developer testing: a decision for every task; the fix task's reproduction and regression evidence.
  let raw: Record<string, any> = {};
  try {
    raw = JSON.parse(readFileSync(stateFilePath(i.root, work), "utf-8")).tasks ?? {};
  } catch {
    raw = {};
  }
  const dtProblems: string[] = [];
  for (const id of ids) {
    const v = state.tasks[id];
    if (!v || v.developerTestingStatus === "notRecorded" || v.developerTesting === null) dtProblems.push(`${id}: no developer-testing decision recorded`);
    else if ((v.developerTesting.runs ?? []).some((r) => r.result === "fail")) dtProblems.push(`${id}: a developer test failed`);
  }
  const fixIds = ids.filter((id) => (rowCells(text, id)?.["acceptance criteria"] ?? "").split(/;|<br\s*\/?>/i)[0].trim().toLowerCase().startsWith(BUG_REPRO_CRITERION.toLowerCase()));
  if (fixIds.length === 0) dtProblems.push("the plan has no fix task (a first acceptance criterion on the reported reproduction path)");
  for (const id of fixIds) {
    if (!reproductionEvidence([{ ...(raw[id] ?? {}), state: raw[id]?.state }])) dtProblems.push(`${id}: the reproduction path is not shown fixed with a regression test (failed before, passes after) or VERIFY-4 developer debt`);
  }
  const developerDebt = ids.flatMap((id) => (state.tasks[id]?.developerVerificationDebt ?? []).map((d) => ({ task: id, ...d })));
  const qaDebt = ids.flatMap((id) => (state.tasks[id]?.qaVerificationDebt ?? []).map((d) => ({ task: id, ...d })));
  checks.push(dtProblems.length === 0
    ? { id: "R4", status: "pass", message: `developer testing recorded for every task; the reproduction path is covered${developerDebt.length ? `; ${developerDebt.length} developer-owned VERIFY-4 item(s) outstanding` : ""}`, details: { developer_debt: developerDebt } }
    : { id: "R4", status: "block", code: "DEVELOPER_TESTING", message: dtProblems.join("; ") });

  // R5 — the review record is fresh for this cycle.
  const rv = verifyReviewRecord({ root: i.root, work });
  checks.push(rv.status === "fresh"
    ? { id: "R5", status: "pass", message: `docs/bugs/${i.key}/review-c${i.cycle}.md describes the current plan, task state and code` }
    : { id: "R5", status: "block", code: `REVIEW_${String(rv.status).toUpperCase()}`, message: `the review record is ${rv.status}${rv.reasons?.length ? `: ${rv.reasons.map((r: any) => r.code).join(", ")}` : ""}`, route: `/review-code --bug ${i.key}` });

  // R6 — blocking findings; R7 — Major findings need acknowledgement.
  const reviewOk = rv.status === "fresh" && i.review !== null;
  const blocking = reviewOk ? Number(i.review!.frontmatter.blocking_count) : 0;
  checks.push(!reviewOk ? { id: "R6", status: "not-run", message: "R5 did not pass" }
    : blocking > 0 ? { id: "R6", status: "block", code: "BLOCKING_FINDINGS", message: `${blocking} blocking finding(s) — fix them and review again`, route: `/review-code --bug ${i.key}` }
    : { id: "R6", status: "pass", message: "no blocking findings" });
  const majors = reviewOk ? majorsOf(i) : [];
  checks.push(!reviewOk ? { id: "R7", status: "not-run", message: "R5 did not pass" }
    : majors.length > 0 ? { id: "R7", status: "ack-required", message: `${majors.length} Major finding(s) must each be acknowledged explicitly in the approval`, details: majors }
    : { id: "R7", status: "pass", message: "no Major findings" });

  // R8 — the handoff was generated from exactly these inputs.
  const fp = inputFingerprint(i);
  const hs = handoffState(i);
  checks.push(fp === null ? { id: "R8", status: "not-run", message: "the inputs are incomplete (task state or review missing)" }
    : !hs.exists || !hs.input_current || hs.foreign ? { id: "R8", status: "generate", message: hs.exists ? "the handoff's inputs changed — regenerate it as a draft; any earlier approval no longer holds" : "no handoff yet — generate the draft" }
    : { id: "R8", status: "pass", message: "the handoff was generated from the current inputs" });

  // R9 — QA bug identity.
  const surfaces = (i.fm.surfaces ?? []).join(",") || "<surface>";
  const qaNext = i.fm.qa_bug_id
    ? `/register-build <build-id> --fixes bug:${i.fm.qa_bug_id} --surfaces ${surfaces}`
    : "QA must create or bind a QA bug for this defect before `/register-build <build-id> --fixes bug:<qa-bug-id>` can be used — it has no QA bug id yet.";
  checks.push(i.fm.qa_bug_id ? { id: "R9", status: "pass", message: `QA bug ${i.fm.qa_bug_id}` } : { id: "R9", status: "info", message: qaNext });

  const blockers = checks.filter((c) => c.status === "block");
  const next = blockers.length ? "blocked" : checks.find((c) => c.id === "R8")?.status === "generate" ? "generate" : hs.status === "ready-for-qa" && hs.approval_valid ? "done" : "approve";
  return {
    ok: blockers.length === 0,
    outcome: blockers.length ? "HANDOFF_BLOCKED" : next === "done" ? "HANDOFF_READY_FOR_QA" : next === "approve" ? "HANDOFF_AWAITING_APPROVAL" : "HANDOFF_NEEDS_GENERATION",
    next,
    work_id: work,
    plan_path: bugWorkPlanPath(i.key),
    checks,
    blockers,
    majors,
    warnings,
    developer_debt: developerDebt,
    qa_debt: qaDebt,
    input_fingerprint: fp,
    qa_next_action: qaNext,
    review: i.review ? { path: `docs/bugs/${i.key}/review-c${i.cycle}.md`, status: rv.status, counts: rv.counts ?? null } : null,
    handoff: { path: handoffPathFor(i.key), exists: hs.exists, status: hs.status, input_current: hs.input_current, approval_valid: hs.approval_valid },
  };
}

/* ---------------------------------------------------------------- render */

const oneLine = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

function render(i: Inputs, k: Record<string, any>, buildInstructions: string, date: string): string {
  const ctx = planContext(i.planBuf, i.fm);
  const cc = ctx.current_cycle as Record<string, any> | null; // fix cycle n ≥ 2: the failed prior fix and the cycle's deltas
  const work = `bug:${i.key}`;
  const r = i.review!;
  const id = expectedIdentity(i);
  const title = /^# Bug Work Plan — [^:\n]+: (.+)$/m.exec(((splitDocument(i.planBuf) as any).leading ?? Buffer.alloc(0)).toString("utf-8"))?.[1] ?? i.key;
  const state = readTaskState(i.root, work, i.planAbs);
  let raw: Record<string, any> = {};
  try {
    raw = JSON.parse(readFileSync(stateFilePath(i.root, work), "utf-8")).tasks ?? {};
  } catch {
    raw = {};
  }
  const ids = i.currentIds;
  const verification = ids.map((tid) => {
    const v = state.tasks[tid];
    const dt = v?.developerTesting;
    const parts: string[] = [dt ? (dt.required ? "developer tests required" : `developer tests not required — ${oneLine(dt.justification)}`) : "no developer-testing decision"];
    const reg = raw[tid]?.developerTesting?.regression; // the reader's view normalizes developerTesting; regression lives on the record
    if (reg?.command) parts.push(`regression \`${reg.command}\` failed before the fix and passes after`);
    else if (reg?.notFeasibleReason) parts.push(`no regression test — ${oneLine(reg.notFeasibleReason)}`);
    for (const c of raw[tid]?.acceptanceCriteria ?? []) if (String(c.criterion ?? "").toLowerCase().startsWith(BUG_REPRO_CRITERION.toLowerCase())) parts.push(`reproduction path: ${oneLine(c.criterion)} — ${c.met === true ? "met" : "not met"}`);
    for (const run of dt?.runs ?? []) parts.push(`ran \`${run.command}\` — ${run.result}`);
    for (const d of v?.developerVerificationDebt ?? []) parts.push(`VERIFY-4 developer debt: ${oneLine(d.requiredVerification)}`);
    return `- \`${tid}\` — ${v?.state ?? "unrecorded"}${v?.deterministicProof ? " (deterministic proof)" : ""}: ${parts.join("; ")}`;
  });
  const f = r.frontmatter;
  const majors = majorsOf(i);
  const debtRows = (k.qa_debt as Array<Record<string, any>>).map((d) => `| ${oneLine(d.domain)} | ${oneLine(d.ruleId)} | ${oneLine(d.requiredVerification)} | ${oneLine(d.whyNotAutomatable)} | ${oneLine(d.owner)} |`);
  const devDebt = (k.developer_debt as Array<Record<string, any>>).map((d) => `- \`VERIFY-4\` developer-testing (\`${d.task}\`): ${oneLine(d.requiredVerification)} — ${oneLine(d.whyNotAutomatable)} (owner: developer)`);
  const front: Record<string, string> = {
    ...id,
    handoff_input_fingerprint: k.input_fingerprint,
    status: "draft",
    generated_by: "create-dev-qa-notes",
    date,
    acknowledged_majors: "[]",
    approved_by: "null",
    approved_fingerprint: "null",
  };
  return [
    "---",
    ...HANDOFF_FIELDS.map((key) => `${key}: ${front[key]}`),
    "---",
    "",
    `# QA Bug Handoff — ${i.key}`,
    "",
    "## Bug Summary",
    "",
    `- **Bug:** ${i.key} — ${oneLine(title)} (origin \`${i.fm.origin}\`)`,
    `- **Root cause (as approved):** ${oneLine(ctx.root_cause)}`,
    `- **Fix:** ${oneLine(ctx.fix_design.match(/\*\*Root-cause fix:\*\*(.*)/)?.[1] ?? "")}`,
    "",
    "## Fix Claim",
    "",
    `- **QA bug:** ${i.fm.qa_bug_id ? `\`${i.fm.qa_bug_id}\`` : "none — QA must create or bind a QA bug before `/register-build <build-id> --fixes bug:<qa-bug-id>` can be used"}`,
    `- **External reference:** ${i.fm.external_ref ?? "none"}`,
    `- **Fix cycle:** ${i.cycle}`,
    ...(cc ? [`- **Previous fix (cycle ${i.cycle - 1}):** build ${cc.failed_build} failed on ${cc.failed_surfaces.join(", ")} — ${oneLine(cc.why_insufficient)}`] : []),
    `- **Affected surfaces:** ${(i.fm.surfaces ?? []).join(", ") || "unknown"}`,
    `- **Reviewed code:** HEAD \`${f.reviewed_head}\` when reviewed; content \`${f.reviewed_tree_fingerprint}\` — the build QA tests must contain exactly this code`,
    `- **QA action once a build exists:** ${i.fm.qa_bug_id ? `\`${k.qa_next_action}\`` : k.qa_next_action}`,
    ...(cc ? [`- A new build's fix claim supersedes the failed claim of build ${cc.failed_build}; QA's lifecycle records that — Dev does not.`] : []),
    "- Dev never registers the build: builds come from CI or the release process, and QA registers them.",
    "",
    "## Reproduction Scenario",
    "",
    `Carried verbatim from the approved Bug Work Plan (\`${id.bug_work_plan_link}#reproduction-evidence\`):`,
    "",
    ctx.reproduction,
    "",
    ctx.observed_vs_expected,
    "",
    `- **Found in build:** ${i.fm.found_in_build ?? "unknown"}`,
    `- **Affected surfaces:** ${(i.fm.surfaces ?? []).join(", ") || "unknown"}`,
    ...(cc ? [
      `- **Failed re-test (cycle ${i.cycle}):** ${oneLine(cc.failed_retest_evidence)}; QA notes: ${oneLine(cc.qa_notes)}`,
      `- **Verification delta:** ${oneLine(cc.verification_delta)}`,
    ] : []),
    "",
    "## Build / Install / Testing Instructions",
    "",
    buildInstructions.trim(),
    "",
    "## Developer Verification",
    "",
    `From task state (\`docs/tasks/bugs/${i.key}.task-state.json\`), fix cycle ${i.cycle}:`,
    "",
    ...verification,
    `- Review: \`${id.review_link}\` — ${f.blocking_count} blocking, ${f.major_count} major, ${f.minor_count} minor, ${f.nit_count} nit`,
    ...(majors.length ? ["", "Major findings, each acknowledged explicitly by the approver (`acknowledged_majors`):", "", ...majors.map((m) => `- \`${m.id}\` \`${m.platform ? `[${m.platform}] ` : ""}${m.path ?? "—"}${m.line ? `:${m.line}` : ""}\` — [${m.rule}] ${m.description} — ${m.remediation}`)] : []),
    "",
    "## Regression Scope",
    "",
    "Advisory to QA — the approved plan's Blast Radius, verbatim, with its first-degree context. No Project Knowledge was queried for this section.",
    "",
    ctx.blast_radius || "None recorded.",
    "",
    `- **Capability:** ${i.fm.capability ?? "not located"}`,
    `- **Related feature:** ${i.fm.related_feature ?? "none"}`,
    "",
    "## Known Limitations",
    "",
    `- **Out of scope (Fix Design non-goals):** ${oneLine(ctx.non_goals) || "none"}`,
    ...(devDebt.length ? ["- **Outstanding developer verification (VERIFY-4) — the developer's, never QA's:**", ...devDebt.map((l) => `  ${l}`)] : ["- **Outstanding developer verification (VERIFY-4):** none"]),
    "",
    "## Pending Verification (owed to QA)",
    "",
    ...(debtRows.length ? ["| Domain | Rule ID | Required verification | Why not automatable | Owner |", "|---|---|---|---|---|", ...debtRows] : ["None recorded."]),
    "",
  ].join("\n");
}

/* ------------------------------------------------------- generate / approve */

function atomicWrite(abs: string, data: Buffer | string): string | null {
  mkdirSync(dirname(abs), { recursive: true });
  const tmp = `${abs}.qa-handoff.tmp`;
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

const refuse = (code: string, reason: string, extra: Record<string, unknown> = {}) => ({ ok: false, outcome: "HANDOFF_REFUSED", code, reason, ...extra });

export function generateHandoff(req: Request & { date?: string; buildInstructions?: string }): Record<string, any> {
  const k = handoffCheck(req);
  if (!k.ok) return refuse("HANDOFF_BLOCKED", "readiness checks block the handoff — resolve them first", { blockers: k.blockers });
  const loaded = loadInputs(req) as { ok: true; inputs: Inputs };
  const i = loaded.inputs;
  const hs = handoffState(i);
  if (hs.foreign) return refuse("HANDOFF_PATH_CONFLICT", `${handoffPathFor(i.key)} exists and is not this bug's handoff — it is never overwritten`);
  if (hs.exists && hs.input_current && hs.reasons.length === 0 && (hs.status === "draft" || hs.approval_valid)) {
    return { ok: true, outcome: "HANDOFF_CURRENT", changed: false, path: handoffPathFor(i.key), status: hs.status };
  }
  if (!req.date || !/^\d{4}-\d{2}-\d{2}$/.test(req.date)) return refuse("INVALID_ARGUMENT", "--date YYYY-MM-DD is required");
  if (!req.buildInstructions || !existsSync(req.buildInstructions)) return refuse("INVALID_ARGUMENT", "--build-instructions <file.md> is required: the platform lane's build/install/testing instructions");
  const instructions = readFileSync(req.buildInstructions, "utf-8");
  if (instructions.trim() === "" || /^#{1,2} /m.test(instructions)) return refuse("INVALID_ARGUMENT", "the build instructions must be non-empty and use ### (or deeper) headings only");
  const text = render(i, k, instructions, req.date);
  const failed = atomicWrite(join(i.root, handoffPathFor(i.key)), text);
  if (failed !== null) return refuse("WRITE_FAILED", failed);
  return { ok: true, outcome: "HANDOFF_GENERATED", changed: true, regenerated: hs.exists, path: handoffPathFor(i.key), status: "draft", input_fingerprint: k.input_fingerprint };
}

export function approveHandoff(req: Request & { by?: string; ackMajors?: string[] }): Record<string, any> {
  const who = plainIdentityProblem(req.by);
  if (who !== null) return refuse(who.code, who.message);
  const k = handoffCheck(req);
  if (!k.ok) return refuse("HANDOFF_BLOCKED", "readiness checks block the handoff", { blockers: k.blockers });
  if (k.next === "generate") return refuse("HANDOFF_REGENERATE_REQUIRED", "generate the handoff from the current inputs first");
  const acks = [...new Set(req.ackMajors ?? [])].sort();
  const majorIds = (k.majors as Array<{ id: string }>).map((m) => m.id).sort();
  const unknown = acks.filter((a) => !majorIds.includes(a));
  if (unknown.length) return refuse("INVALID_ACK", `not a current Major finding id: ${unknown.join(", ")} — acknowledge each Major finding by its id; nothing is acknowledged implicitly`);
  const missing = majorIds.filter((m) => !acks.includes(m));
  if (missing.length) return refuse("MAJOR_ACK_REQUIRED", `every Major finding must be acknowledged explicitly: ${missing.join(", ")}`, { majors: k.majors });

  const loaded = loadInputs(req) as { ok: true; inputs: Inputs };
  const i = loaded.inputs;
  const h = readHandoff(i.root, i.key)!;
  const fp = approvalFingerprintFor(h.body, h.fm.handoff_input_fingerprint, acks);
  if (h.fm.status === "ready-for-qa" && k.next === "done" && h.fm.approved_by === req.by && h.fm.approved_fingerprint === fp) {
    return { ok: true, outcome: "HANDOFF_APPROVED", changed: false, path: handoffPathFor(i.key), approved_by: req.by, acknowledged_majors: acks };
  }
  const out = rewriteFrontmatterValues(h.buf, { status: "ready-for-qa", approved_by: req.by as string, acknowledged_majors: `[${acks.join(", ")}]`, approved_fingerprint: fp });
  if (!out.ok) return refuse(out.code, `${out.message} — nothing was written`);
  const failed = atomicWrite(join(i.root, handoffPathFor(i.key)), out.buf);
  if (failed !== null) return refuse("WRITE_FAILED", failed);
  const v = verifyHandoff(req);
  if (v.status !== "ready-for-qa") {
    atomicWrite(join(i.root, handoffPathFor(i.key)), h.buf);
    return refuse("APPROVAL_SELF_CHECK", "the approved handoff does not verify — it was restored to its previous content", { verify: v });
  }
  return { ok: true, outcome: "HANDOFF_APPROVED", changed: true, path: handoffPathFor(i.key), approved_by: req.by, acknowledged_majors: acks, approved_fingerprint: fp };
}

/* ------------------------------------------------------------------ verify */

export function verifyHandoff(req: { root: string; work: string }): Record<string, any> {
  const loaded = loadInputs(req);
  if (!loaded.ok) return { ok: false, status: "stale", reasons: [{ code: "HANDOFF_INPUTS_UNAVAILABLE", message: loaded.check.message }] };
  const i = loaded.inputs;
  const hs = handoffState(i);
  if (!hs.exists) return { ok: false, status: "missing", path: handoffPathFor(i.key), reasons: [] };
  if (hs.reasons.length > 0) return { ok: false, status: "stale", path: handoffPathFor(i.key), reasons: hs.reasons };
  return { ok: hs.status === "ready-for-qa", status: hs.status, path: handoffPathFor(i.key), reasons: [] };
}

/* --------------------------------------------------------------------- CLI */

function main(): void {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};
  const acks: string[] = [];
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(args[i]);
    if (!m) positional.push(args[i]);
    else {
      const value = m[2] !== undefined ? m[2] : (args[++i] ?? "");
      if (m[1] === "ack-major") acks.push(value);
      else flags[m[1]] = value;
    }
  }
  const print = (o: unknown): never => {
    console.log(JSON.stringify(o, null, 2));
    process.exit(0);
  };
  const [cmd, work] = positional;
  const base = { root: flags.root ?? "", work, qaRepo: flags["qa-repo"], report: flags.report };
  if (cmd === "check") print(handoffCheck(base));
  if (cmd === "generate") print(generateHandoff({ ...base, date: flags.date, buildInstructions: flags["build-instructions"] }));
  if (cmd === "approve") print(approveHandoff({ ...base, by: flags.by, ackMajors: acks }));
  if (cmd === "verify") print(verifyHandoff(base));
  print({ ok: false, outcome: "UNKNOWN_COMMAND", reason: "usage: qa-handoff-gate.ts check|generate|approve|verify bug:<bug_key> --root <dir> …" });
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /qa-handoff-gate\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) main();
