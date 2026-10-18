/**
 * bug-verification.ts
 *
 * Consolidated developer verification per Bug Fix Cycle (Bug Flow P1). Every task still runs
 * and records its automated checks — build, lint, tests, the regression test — and an automated
 * failure still blocks it. What moves out of the task is manual verification: a criterion only a
 * person can verify is recorded `deferred_to_cycle_verification` (scripts/task-state.ts), and
 * once every task of the cycle is complete, one checklist covers the whole cycle:
 *
 *   docs/bugs/<bug_key>/verification-c<fix_cycle>.md
 *
 *   generate  writes the checklist from what is already recorded — the reported reproduction
 *             path (always first), Observed vs Expected, the Verification Strategy, a reopened
 *             cycle's failed QA re-test and verification delta, the deferred criteria of the
 *             cycle's tasks (merged where identical, never dropped where distinct), approved
 *             scope expansions, the automated results, the regression evidence and VERIFY-4
 *             debt — one item per obligation, verified on every surface it applies to. A fresh
 *             checklist is kept with its results; a stale one is replaced with no results.
 *   check     read-only. missing | invalid | stale | incomplete | failed | passed, with the
 *             counts, the failed items, and the next command.
 *   record    records results — pass | fail | blocked | not_run, with notes, the surface and
 *             evidence — merging them into the checklist. A fail names where it goes back to:
 *             `implementation` (a task of the cycle) or `replan` (/analyze-bug). Never on a
 *             stale checklist.
 *   verify    read-only, the gate: ok only when the current cycle's checklist is fresh and
 *             passed. /review-code --bug and the QA handoff (R10) require it.
 *
 * The checklist is bound to the bug, its fix cycle, the plan's approval fingerprint, the raw
 * task state and the code content (everything but the bug's documents and the plugin's
 * stores — scripts/bug-review.ts' notCode). Any of them moving makes it stale; no timestamp
 * decides anything. Cycle n's checklist never satisfies cycle n + 1. The machine-readable state
 * lives in the artifact itself and the rest is rendered from it, so a hand edit is detected.
 *
 * It never writes task state, the plan, a QA repository or Inspector artifacts, never creates a
 * fix cycle and never commits. Feature work has no consolidated verification.
 *
 * Always exits 0 and prints one JSON object.
 *
 *   node --no-warnings scripts/bug-verification.ts generate bug:<bug_key> --root <TARGET_ROOT>
 *   node --no-warnings scripts/bug-verification.ts check    bug:<bug_key> --root <TARGET_ROOT> [--cycle <n>]
 *   node --no-warnings scripts/bug-verification.ts record   bug:<bug_key> --root <TARGET_ROOT> --results <results.json> --by <name> [--accept-debt]
 *   node --no-warnings scripts/bug-verification.ts verify   bug:<bug_key> --root <TARGET_ROOT>
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { createHash } from "crypto";
import { validateBugWorkPlan, bugWorkPlanPath } from "./bug-work-plan.ts";
import { approvalFingerprint, plainIdentityProblem, verifyApproval } from "./work-approval.ts";
import { BUG_REPRO_CRITERION, DEFERRED_TO_CYCLE_VERIFICATION, bugKeyOf, readTaskState } from "./task-state.ts";
import { contentFingerprint, rowCells } from "./task-resume.ts";
import { planContext } from "./bug-implementation.ts";
import { notCode, readState } from "./bug-review.ts";
import { cycleStatus } from "./edit-approval.ts";
import { canonical } from "./qa-release-gate.ts";
import { nextCommand, type NextCommand } from "./next-command.ts";

export const VERIFICATION_SCHEMA = 1;
export const RESULTS = ["pass", "fail", "blocked", "not_run"] as const;
const ROUTES = ["implementation", "replan"] as const;
const MARKER = "<!-- verification-state";

const sha = (s: string) => `sha256:${createHash("sha256").update(s).digest("hex")}`;
export const verificationPath = (key: string, cycle: number) => `docs/bugs/${key}/verification-c${cycle}.md`;
const oneLine = (s: unknown) => String(s ?? "").replace(/\s*\r?\n\s*/g, " ").trim();
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
const isRepro = (c: string) => c.toLowerCase().startsWith(BUG_REPRO_CRITERION.toLowerCase());

export type Item = { id: string; kind: "reproduction" | "failed-retest" | "verification-delta" | "criterion" | "scope-expansion"; title: string; detail: string[]; sources: string[]; surfaces: string[] };
type Result = { result: (typeof RESULTS)[number]; notes: string | null; evidence: string | null; route: (typeof ROUTES)[number] | null; task: string | null; by: string };
type State = {
  schema: number; bug_key: string; fix_cycle: number;
  binding: { bug_work_plan_fingerprint: string; task_state_fingerprint: string; code_fingerprint: string };
  surfaces: string[]; items: Item[];
  changed: Array<{ task: string; description: string }>;
  expansions: Array<{ path: string; task: string; reason: string }>;
  automated: Array<{ command: string; result: string; tasks: string[] }>;
  regression: Array<{ task: string; command: string | null; not_feasible: string | null }>;
  developer_debt: Array<{ task: string; ruleId: string; requiredVerification: string }>;
  qa_debt: Array<{ task: string; ruleId: string; requiredVerification: string }>;
  strategy: string; expected: string;
  results: Record<string, Result>;
  accepted_debt: { by: string } | null;
};

/* ------------------------------------------------------------------ load */

type Loaded = { key: string; root: string; buf: Buffer; abs: string; fm: Record<string, any>; v: Record<string, any>; ids: string[] };
function load(req: { root: string; work: string }): Loaded | { stop: Record<string, any> } {
  const key = bugKeyOf(req.work ?? "");
  if (key === null) return { stop: { ok: false, outcome: "BUG_WORK_ID_INVALID", reason: `"${req.work}" is not bug work — name it bug:<bug_key>` } };
  if (!req.root || !existsSync(req.root)) return { stop: { ok: false, outcome: "BUG_ROOT_INVALID", reason: `repository root ${req.root ?? ""} does not exist` } };
  const root = realpathSync(req.root);
  const abs = join(root, bugWorkPlanPath(key) as string);
  if (!existsSync(abs)) return { stop: { ok: false, outcome: "BUG_PLAN_MISSING", reason: `no Bug Work Plan for ${key}`, route: "/analyze-bug <bug-ref>" } };
  const buf = readFileSync(abs);
  const v = validateBugWorkPlan(buf);
  if (!v.ok || v.frontmatter.bug_key !== key) return { stop: { ok: false, outcome: "BUG_PLAN_INVALID", reason: `the Bug Work Plan for ${key} is not valid`, route: "/analyze-bug <bug-ref>" } };
  const ids = (v.tasks as Array<{ id: string; cycle: number }>).filter((t) => t.cycle === v.frontmatter.fix_cycle).map((t) => t.id);
  return { key, root, buf, abs, fm: v.frontmatter, v, ids };
}

function bindingNow(l: Loaded): { bug_work_plan_fingerprint: string | null; task_state_fingerprint: string | null; code_fingerprint: string | null } {
  const state = readState(l.root, l.key);
  return {
    bug_work_plan_fingerprint: approvalFingerprint(l.buf),
    task_state_fingerprint: state === null ? null : sha(canonical(state)),
    code_fingerprint: contentFingerprint(l.root, notCode).fingerprint,
  };
}

/* -------------------------------------------------------------- checklist */

function buildState(l: Loaded, binding: State["binding"]): State {
  const ctx = planContext(l.buf, l.fm);
  const cc = ctx.current_cycle as Record<string, any> | null;
  const text = l.buf.toString("utf-8");
  const raw = (readState(l.root, l.key)?.tasks ?? {}) as Record<string, any>;
  const base: string[] = (l.fm.surfaces ?? []).length ? [...l.fm.surfaces] : [String(l.fm.platform)];
  const failedSurfaces: string[] = cc ? (Array.isArray(cc.failed_surfaces) ? cc.failed_surfaces : String(cc.failed_surfaces ?? "").split(",")).map((x: string) => x.trim()).filter(Boolean) : [];
  const surfaces = [...base, ...failedSurfaces.filter((x) => !base.includes(x))];
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const expected = lines(ctx.observed_vs_expected).find((x) => /\*\*Expected:\*\*/.test(x)) ?? "";

  const items: Omit<Item, "id">[] = [];
  // The reported reproduction path — mandatory in every cycle, always first.
  const repro: Omit<Item, "id"> = {
    kind: "reproduction",
    title: "Follow the reported reproduction path; the bug no longer occurs",
    detail: [...lines(ctx.reproduction), ...(ctx.reproduction_path ? [`Verification Strategy — reproduction path: ${oneLine(ctx.reproduction_path)}`] : []), ...(expected ? [expected.replace(/^-\s*/, "")] : [])],
    sources: ["Reproduction Evidence", "Verification Strategy"],
    surfaces: [...surfaces],
  };
  items.push(repro);
  if (cc) {
    items.push({
      kind: "failed-retest",
      title: `Repeat QA's re-test that failed the previous fix (build ${oneLine(cc.failed_build)})`,
      detail: [`Failed re-test: ${oneLine(cc.failed_retest_evidence)}`, `QA notes: ${oneLine(cc.qa_notes)}`, `Failed surfaces: ${failedSurfaces.join(", ") || "unknown"}`],
      sources: [`Cycle ${l.fm.fix_cycle}`],
      surfaces: failedSurfaces.length ? failedSurfaces : [...surfaces],
    });
    items.push({ kind: "verification-delta", title: `Cycle ${l.fm.fix_cycle} verification delta`, detail: [oneLine(cc.verification_delta)], sources: [`Cycle ${l.fm.fix_cycle}`], surfaces: [...surfaces] });
  }
  // Deferred criteria of the cycle's tasks: identical ones merged, distinct ones all kept.
  const byKey = new Map<string, Omit<Item, "id">>();
  for (const id of l.ids) {
    for (const c of raw[id]?.acceptanceCriteria ?? []) {
      if (c?.status !== DEFERRED_TO_CYCLE_VERIFICATION) continue;
      const criterion = String(c.criterion ?? "").trim();
      if (isRepro(criterion)) {
        repro.detail.push(`Also confirm (${id}): ${criterion}`);
        if (!repro.sources.includes(id)) repro.sources.push(id);
        continue;
      }
      const k = norm(criterion);
      const it = byKey.get(k) ?? { kind: "criterion" as const, title: criterion, detail: [], sources: [], surfaces: [...surfaces] };
      if (!it.sources.includes(id)) it.sources.push(id);
      byKey.set(k, it);
    }
  }
  items.push(...byKey.values());
  const approval = cycleStatus({ root: l.root, work: `bug:${l.key}` });
  const expansions = approval.fix_cycle === l.fm.fix_cycle ? (approval.expansions ?? []).map((x: any) => ({ path: x.path, task: x.task, reason: x.reason })) : [];
  for (const x of expansions) items.push({ kind: "scope-expansion", title: `Check what changed outside the planned scope: ${x.path}`, detail: [`${x.task}: ${x.reason}`], sources: [x.task], surfaces: [...surfaces] });

  const automated = new Map<string, { command: string; result: string; tasks: string[] }>();
  const regression: State["regression"] = [];
  const developer_debt: State["developer_debt"] = [];
  const qa_debt: State["qa_debt"] = [];
  for (const id of l.ids) {
    const t = raw[id] ?? {};
    for (const run of [...(t.validation ?? []), ...(t.developerTesting?.runs ?? [])]) {
      const e = automated.get(run.command) ?? { command: String(run.command), result: "pass", tasks: [] };
      if (run.result !== "pass") e.result = String(run.result);
      if (!e.tasks.includes(id)) e.tasks.push(id);
      automated.set(run.command, e);
    }
    const reg = t.developerTesting?.regression;
    if (reg && (reg.command || reg.notFeasibleReason)) regression.push({ task: id, command: reg.command ?? null, not_feasible: reg.notFeasibleReason ?? null });
    for (const d of t.verificationDebt ?? []) (d.owner === "developer" ? developer_debt : qa_debt).push({ task: id, ruleId: String(d.ruleId), requiredVerification: oneLine(d.requiredVerification) });
  }
  return {
    schema: VERIFICATION_SCHEMA, bug_key: l.key, fix_cycle: l.fm.fix_cycle, binding, surfaces,
    items: items.map((it, i) => ({ id: `V${i + 1}`, ...it })),
    changed: l.ids.map((id) => ({ task: id, description: oneLine(rowCells(text, id)?.description) })),
    expansions, automated: [...automated.values()], regression, developer_debt, qa_debt,
    strategy: ctx.verification_strategy.trim(), expected: ctx.observed_vs_expected.trim(),
    results: {}, accepted_debt: null,
  };
}

/* ----------------------------------------------------------------- status */

const pairKeys = (s: State) => s.items.flatMap((it) => it.surfaces.map((surface) => `${it.id}@${surface}`));

function summarize(s: State) {
  const counts = { pass: 0, fail: 0, blocked: 0, not_run: 0, pending: 0 };
  const failed: Array<Record<string, unknown>> = [];
  const open: Array<Record<string, unknown>> = [];
  for (const k of pairKeys(s)) {
    const r = s.results[k];
    const [id, surface] = k.split("@");
    const title = s.items.find((i) => i.id === id)?.title;
    if (!r) { counts.pending++; open.push({ id, surface, title, result: "pending" }); continue; }
    counts[r.result]++;
    if (r.result === "fail") failed.push({ id, surface, title, notes: r.notes, route: r.route, task: r.task });
    else if (r.result !== "pass") open.push({ id, surface, title, result: r.result, notes: r.notes });
  }
  const reasons: Array<{ code: string; message: string }> = [];
  if (s.developer_debt.length && s.accepted_debt === null) reasons.push({ code: "DEBT_NOT_ACCEPTED", message: "outstanding VERIFY-4 developer debt has not been accepted explicitly" });
  const status = failed.length ? "failed" : open.length || reasons.length ? "incomplete" : "passed";
  return { status, counts, failed, open, reasons };
}

/* ----------------------------------------------------------------- render */

function render(s: State): string {
  const sum = summarize(s);
  const cell = (x: unknown) => oneLine(x).replace(/\|/g, "\\|") || "—";
  const json = JSON.stringify(s, null, 2).replace(/--/g, "-\\u002d");
  const front = [
    `verification_schema: ${VERIFICATION_SCHEMA}`, "work_type: bug", `bug_key: ${s.bug_key}`, `fix_cycle: ${s.fix_cycle}`,
    `bug_work_plan_fingerprint: ${s.binding.bug_work_plan_fingerprint}`, `task_state_fingerprint: ${s.binding.task_state_fingerprint}`,
    `code_fingerprint: ${s.binding.code_fingerprint}`, `status: ${sum.status}`, "generated_by: bug-verification",
  ];
  const byIds = (ids: string[]) => ids.join(", ");
  return [
    "---", ...front, "---", "",
    `# Fix Cycle ${s.fix_cycle} Verification — ${s.bug_key}`, "",
    "<!-- Generated by scripts/bug-verification.ts from the approved Bug Work Plan and the cycle's task state. Results are recorded only through `bug-verification.ts record`; a hand edit invalidates this file. -->", "",
    "## Bug", "",
    `- **Bug:** ${s.bug_key}`, `- **Fix Cycle:** ${s.fix_cycle}`, "",
    "## What changed", "",
    ...s.changed.map((c) => `- ${c.task} — ${c.description}`),
    ...s.expansions.map((x) => `- Approved beyond the planned scope: \`${x.path}\` (${x.task}: ${oneLine(x.reason)})`), "",
    "## Automated checks already completed", "",
    ...(s.automated.length ? s.automated.map((a) => `- \`${a.command}\` — ${a.result.toUpperCase()} (${byIds(a.tasks)})`) : ["- none recorded"]),
    ...s.regression.map((r) => r.command ? `- Regression test \`${r.command}\` — failed before the fix, passes after (${r.task})` : `- No regression test (${r.task}): ${oneLine(r.not_feasible)}`), "",
    "## Manual verification checklist", "",
    "Each item is verified on every surface listed under it; one surface never stands for another.", "",
    ...s.surfaces.flatMap((surface) => [
      `### ${surface}`, "",
      ...s.items.filter((it) => it.surfaces.includes(surface)).flatMap((it) => [`${it.id}. ${it.title}`, ...it.detail.map((d) => `   - ${d}`)]), "",
    ]),
    "## Expected result", "", s.expected || "—", "",
    "## Affected surfaces", "", ...s.surfaces.map((x) => `- ${x}`), "",
    "## Verification Strategy", "", "Carried from the approved Bug Work Plan:", "", s.strategy || "—", "",
    "## Known verification debt", "",
    ...(s.developer_debt.length ? s.developer_debt.map((d) => `- ${d.ruleId} (developer, ${d.task}): ${d.requiredVerification}`) : ["- Developer (VERIFY-4): none"]),
    ...(s.qa_debt.length ? s.qa_debt.map((d) => `- ${d.ruleId} (owed to QA, ${d.task}): ${d.requiredVerification}`) : []),
    ...(s.accepted_debt ? [`- Developer debt accepted by ${s.accepted_debt.by}`] : []), "",
    "## Result", "",
    "| Item | Surface | Result | Notes | Evidence |", "|---|---|---|---|---|",
    ...pairKeys(s).map((k) => { const [id, surface] = k.split("@"); const r = s.results[k]; return `| ${id} | ${surface} | ${r ? r.result : "pending"} | ${cell(r?.notes)} | ${cell(r?.evidence)} |`; }), "",
    `**Overall:** ${sum.status} — ${sum.counts.pass} pass, ${sum.counts.fail} fail, ${sum.counts.blocked} blocked, ${sum.counts.not_run} not run, ${sum.counts.pending} pending`, "",
    MARKER, json, "-->", "",
  ].join("\n");
}

function readArtifact(root: string, key: string, cycle: number): { state: State } | { invalid: string } | null {
  const abs = join(root, verificationPath(key, cycle));
  if (!existsSync(abs)) return null;
  const text = readFileSync(abs, "utf-8");
  const at = text.lastIndexOf(`${MARKER}\n`);
  if (at < 0) return { invalid: "no verification state in the artifact" };
  let s: State;
  try {
    s = JSON.parse(text.slice(at + MARKER.length + 1, text.lastIndexOf("\n-->")));
  } catch {
    return { invalid: "the verification state is not readable" };
  }
  if (s?.schema !== VERIFICATION_SCHEMA || s.bug_key !== key || s.fix_cycle !== cycle) return { invalid: "the artifact is not this bug's verification for this cycle" };
  if (render(s) !== text) return { invalid: "the artifact was edited outside scripts/bug-verification.ts" };
  return { state: s };
}

function writeArtifact(root: string, s: State): void {
  const abs = join(root, verificationPath(s.bug_key, s.fix_cycle));
  mkdirSync(dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp`;
  try {
    writeFileSync(tmp, render(s));
    renameSync(tmp, abs);
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best effort */
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ check */

function incomplete(l: Loaded): string[] {
  const state = readTaskState(l.root, `bug:${l.key}`, l.abs);
  return l.ids.filter((id) => state.tasks[id]?.deterministicProof !== true);
}

export function checkVerification(req: { root: string; work: string; cycle?: number }): Record<string, any> {
  const l = load(req);
  if ("stop" in l) return { ...l.stop, status: "unavailable" };
  const cycle = req.cycle ?? (l.fm.fix_cycle as number);
  const path = verificationPath(l.key, cycle);
  const verify = nextCommand("verify-fix-cycle", `bug:${l.key}`);
  const base = { ok: false, work_id: `bug:${l.key}`, fix_cycle: cycle, path };
  const got = readArtifact(l.root, l.key, cycle);
  if (got === null) {
    const left = cycle === l.fm.fix_cycle ? incomplete(l) : [];
    return { ...base, status: "missing", reason: `no verification for fix cycle ${cycle}`, next_command: left.length ? nextCommand("implement-task", `bug:${l.key} ${left[0]}`) : verify };
  }
  if ("invalid" in got) return { ...base, status: "invalid", reason: got.invalid, next_command: verify };
  const s = got.state;
  const now = bindingNow(l);
  const stale: string[] = [];
  if (l.fm.fix_cycle !== s.fix_cycle) stale.push("CYCLE_CHANGED");
  if (now.bug_work_plan_fingerprint !== s.binding.bug_work_plan_fingerprint) stale.push("PLAN_CHANGED");
  else if (verifyApproval(l.buf).status !== "approved") stale.push("PLAN_NOT_APPROVED");
  if (now.task_state_fingerprint !== s.binding.task_state_fingerprint) stale.push("TASK_STATE_CHANGED");
  if (now.code_fingerprint === null || now.code_fingerprint !== s.binding.code_fingerprint) stale.push("CODE_CHANGED");
  const sum = summarize(s);
  const common = { ...base, items: s.items, surfaces: s.surfaces, counts: sum.counts, results: s.results, failed: sum.failed, open: sum.open, reasons: sum.reasons, developer_debt: s.developer_debt };
  if (stale.length) return { ...common, status: "stale", stale_reasons: stale, reason: `the verification no longer describes the current ${stale.join(", ")}`, next_command: verify };
  if (sum.status === "failed") {
    const replan = sum.failed.some((f) => f.route === "replan");
    const task = sum.failed.find((f) => f.route === "implementation")?.task as string | undefined;
    return { ...common, status: "failed", reason: "a verification item failed", ...(replan ? { route: "/analyze-bug <bug-ref>" } : task ? { route: `/implement-task bug:${l.key} ${task}`, next_command: nextCommand("implement-task", `bug:${l.key} ${task}`) } : {}) };
  }
  if (sum.status === "incomplete") return { ...common, status: "incomplete", reason: "verification is not finished", next_command: verify };
  return { ...common, ok: true, status: "passed", reason: `fix cycle ${cycle} is verified`, next_command: nextCommand("review-code", `--bug ${l.key}`) };
}

/** The gate for /review-code --bug and the QA handoff: the current cycle's verification, fresh and passed. */
export function verifyVerification(req: { root: string; work: string }): Record<string, any> {
  const c = checkVerification(req);
  return { ok: c.status === "passed", status: c.status, path: c.path, fix_cycle: c.fix_cycle, reason: c.reason, stale_reasons: c.stale_reasons ?? [], failed: c.failed ?? [], counts: c.counts ?? null };
}

/** What follows a complete cycle: its verification, or — once that passed — the review. */
export function afterCycle(root: string, key: string): NextCommand {
  return checkVerification({ root, work: `bug:${key}` }).status === "passed" ? nextCommand("review-code", `--bug ${key}`) : nextCommand("verify-fix-cycle", `bug:${key}`);
}

/* --------------------------------------------------------------- generate */

export function generateVerification(req: { root: string; work: string }): Record<string, any> {
  const l = load(req);
  if ("stop" in l) return l.stop;
  if (verifyApproval(l.buf).status !== "approved") return { ok: false, outcome: "PLAN_NOT_APPROVED", reason: "the Bug Work Plan is not approved for its current fix cycle", route: "/analyze-bug <bug-ref>" };
  const left = incomplete(l);
  if (left.length) return { ok: false, outcome: "CYCLE_INCOMPLETE", reason: `fix cycle ${l.fm.fix_cycle} is not complete: ${left.join(", ")}`, next_command: nextCommand("implement-task", `bug:${l.key} ${left[0]}`) };
  const now = bindingNow(l);
  if (now.code_fingerprint === null || now.task_state_fingerprint === null || now.bug_work_plan_fingerprint === null) return { ok: false, outcome: "REPOSITORY_UNAVAILABLE", reason: "the plan, task state or code content could not be read" };
  const fresh = buildState(l, now as State["binding"]);
  const failing = fresh.automated.filter((a) => a.result !== "pass");
  if (failing.length) return { ok: false, outcome: "AUTOMATED_TESTING_FAILED", reason: `automated checks did not pass: ${failing.map((a) => a.command).join(", ")}` };
  const before = checkVerification(req);
  const view = (s: State, outcome: string, extra: Record<string, unknown> = {}) => ({
    ok: true, outcome, path: verificationPath(l.key, s.fix_cycle), fix_cycle: s.fix_cycle, surfaces: s.surfaces, items: s.items,
    automated: s.automated, regression: s.regression, developer_debt: s.developer_debt, status: summarize(s).status, ...extra,
  });
  if (before.status !== "missing" && before.status !== "invalid" && before.status !== "stale") {
    return view((readArtifact(l.root, l.key, l.fm.fix_cycle) as { state: State }).state, "VERIFICATION_CURRENT");
  }
  writeArtifact(l.root, fresh);
  if (before.status === "missing") return view(fresh, "VERIFICATION_GENERATED");
  return view(fresh, "VERIFICATION_REGENERATED", { stale_reasons: before.status === "invalid" ? ["INVALID"] : before.stale_reasons });
}

/* ----------------------------------------------------------------- record */

export function recordVerification(req: { root: string; work: string; results: unknown[]; by?: string; acceptDebt?: boolean }): Record<string, any> {
  const refuse = (code: string, reason: string) => ({ ok: false, outcome: "REFUSED", code, reason });
  const l = load(req);
  if ("stop" in l) return l.stop;
  const who = plainIdentityProblem(req.by);
  if (who) return refuse(who.code, who.message);
  const c = checkVerification(req);
  if (!["incomplete", "failed", "passed"].includes(c.status)) return refuse(`VERIFICATION_${String(c.status).toUpperCase()}`, `the checklist is ${c.status} — generate it again before recording (${c.reason})`);
  const s = (readArtifact(l.root, l.key, l.fm.fix_cycle) as { state: State }).state;
  const pairs = new Set(pairKeys(s));
  const next = { ...s.results };
  for (const x of Array.isArray(req.results) ? (req.results as Array<Record<string, any>>) : []) {
    const k = `${x?.id}@${x?.surface}`;
    if (!pairs.has(k)) return refuse("UNKNOWN_ITEM", `${x?.id} is not a checklist item for surface ${x?.surface}`);
    if (!(RESULTS as readonly string[]).includes(x.result)) return refuse("INVALID_RESULT", `${k}: result must be one of ${RESULTS.join(", ")}`);
    let route: Result["route"] = null;
    let task: string | null = null;
    if (x.result === "fail") {
      if (!(ROUTES as readonly string[]).includes(x.route)) return refuse("FAIL_ROUTE_REQUIRED", `${k}: a failure names where it goes back to — "implementation" (with the task) or "replan"`);
      route = x.route;
      if (route === "implementation") {
        if (!l.ids.includes(x.task)) return refuse("FAIL_TASK_REQUIRED", `${k}: an implementation failure names a task of fix cycle ${l.fm.fix_cycle} (${l.ids.join(", ")})`);
        task = x.task;
      }
    }
    next[k] = { result: x.result, notes: x.notes ? oneLine(x.notes) : null, evidence: x.evidence ? oneLine(x.evidence) : null, route, task, by: (req.by as string).trim() };
  }
  const updated: State = { ...s, results: Object.fromEntries(Object.entries(next).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), accepted_debt: req.acceptDebt ? { by: (req.by as string).trim() } : s.accepted_debt };
  try {
    writeArtifact(l.root, updated);
  } catch (e) {
    return refuse("WRITE_FAILED", (e as Error).message);
  }
  const after = checkVerification(req);
  return { ...after, ok: true, verified: after.ok === true, outcome: "VERIFICATION_RECORDED" };
}

/* --------------------------------------------------------------------- CLI */

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0) return args[i + 1];
  return args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
}
const print = (o: unknown) => process.stdout.write(JSON.stringify(o) + "\n");

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /bug-verification\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) {
  const [cmd, work = "", ...args] = process.argv.slice(2);
  const root = flag(args, "--root") ?? "";
  if (cmd === "generate") print(generateVerification({ root, work }));
  else if (cmd === "check") print(checkVerification({ root, work, cycle: flag(args, "--cycle") ? Number(flag(args, "--cycle")) : undefined }));
  else if (cmd === "verify") print(verifyVerification({ root, work }));
  else if (cmd === "record") {
    let results: unknown[] = [];
    const file = flag(args, "--results");
    try {
      results = file ? JSON.parse(readFileSync(file, "utf-8")) : [];
    } catch {
      print({ ok: false, outcome: "REFUSED", code: "RESULTS_UNREADABLE", reason: `${file} is not a JSON array of results` });
      process.exit(0);
    }
    print(recordVerification({ root, work, results, by: flag(args, "--by"), acceptDebt: args.includes("--accept-debt") }));
  } else print({ ok: false, outcome: "UNKNOWN_COMMAND", reason: "usage: bug-verification.ts generate|check|record|verify bug:<bug_key> --root <dir> …" });
}
