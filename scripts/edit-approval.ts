/**
 * edit-approval.ts
 *
 * One code-edit approval per Bug Fix Cycle (Bug Flow UX P0.3). The require-approval-before-code
 * hook asks before every code-file Write/Edit/MultiEdit; for bug work whose current fix cycle a
 * developer approved once, this helper is what lets an in-scope edit through without asking
 * again. It decides deterministically, from files only — never from prose, a clock or session
 * memory:
 *
 *   scope    read-only. The cycle's approvable scope, derived from the approved Bug Work Plan:
 *            the current cycle's `files touched`, the Fix Design's affected files (and, in cycle
 *            n ≥ 2, the cycle's changed affected files), and the platform's conventional test
 *            file for each scoped source file. A path a non-goal names is never in scope; the
 *            repository root and directories shallower than three segments are never in scope.
 *   status   read-only. Whether the cycle approval is valid right now (`APPROVED`), and why not.
 *   check    read-only; the hook's question. May this file be edited without asking? `allow`
 *            only when every condition holds; `ask` otherwise, with a reason code.
 *   approve  writes the cycle approval after a developer said yes, as a named approver.
 *   expand   adds one file to the approved scope after a developer approved that expansion. A
 *            path a non-goal names, or a change the caller declares contradicts a non-goal, is
 *            refused and routed back to /analyze-bug.
 *   revoke   ends the approval early.
 *
 * The record is docs/tasks/bugs/<bug_key>.cycle-approval.json, beside the bug's task-state
 * store and, like it, a store artifact (never reviewed code). It is bound to the bug, its fix
 * cycle, the plan's recorded approval fingerprint, the branch and the scope, and it seals
 * itself with a fingerprint over its own content. It holds no timestamp: it stops being valid
 * on its own — never by a person remembering to revoke it — when the plan's approval goes
 * stale or is replaced, the fix cycle moves, the branch changes, no task of the cycle is in
 * progress (abandoned or not started), or every task of the cycle is complete.
 *
 * Task state stays per task (scripts/task-state.ts is its only writer). This helper only reads
 * it. It grants nothing but skipping the per-edit question for in-scope code files: never a
 * commit, a push, a merge or a write on main/master, which the other hooks and the commands
 * govern unchanged. Feature work never has a cycle approval, so it is never relaxed.
 *
 * Always exits 0 and prints one JSON object.
 *
 *   node --no-warnings scripts/edit-approval.ts check   --file <path> [--cwd <dir>]
 *   node --no-warnings scripts/edit-approval.ts scope   bug:<bug_key> --root <TARGET_ROOT>
 *   node --no-warnings scripts/edit-approval.ts status  bug:<bug_key> --root <TARGET_ROOT>
 *   node --no-warnings scripts/edit-approval.ts approve bug:<bug_key> --root <TARGET_ROOT> --by <approver>
 *   node --no-warnings scripts/edit-approval.ts expand  bug:<bug_key> --root <TARGET_ROOT> --file <path> --task <id> --reason <text> --by <approver> [--contradicts-non-goal]
 *   node --no-warnings scripts/edit-approval.ts revoke  bug:<bug_key> --root <TARGET_ROOT>
 */

import { execFileSync } from "child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "path";
import { createHash } from "crypto";
import { validateBugWorkPlan, bugWorkPlanPath } from "./bug-work-plan.ts";
import { plainIdentityProblem, verifyApproval } from "./work-approval.ts";
import { bugKeyOf, readTaskState } from "./task-state.ts";
import { filesFromCell, rowCells } from "./task-resume.ts";
import { canonical } from "./qa-release-gate.ts";

export const RECORD_SCHEMA = 1;
/** The code files the require-approval-before-code hook asks about — the same list as the hook. */
export const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".swift", ".kt", ".kts", ".java", ".m", ".mm", ".cpp", ".h"];
const PROTECTED_BRANCHES = new Set(["main", "master"]);
/** A directory is approvable only this deep; anything shallower is too broad to approve as one scope. */
const MIN_DIR_SEGMENTS = 3;

export type ScopeEntry = { path: string; kind: "file" | "dir" | "test"; source: string };
export type Expansion = { path: string; task: string; reason: string; approved_by: string };

const sha = (s: string) => `sha256:${createHash("sha256").update(s).digest("hex")}`;
export const recordPath = (key: string) => `docs/tasks/bugs/${key}.cycle-approval.json`;
const isCode = (p: string) => CODE_EXTENSIONS.includes(extname(p).toLowerCase());

/* ------------------------------------------------------------------- plan */

const backticked = (text: string) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim()).filter((t) => !/\s/.test(t) && /[/.]/.test(t));

/** The value of a `- **Label:** …` line within `text`, or "". */
function labelled(text: string, label: string): string {
  const re = new RegExp(`^\\s*-\\s*\\*\\*${label.replace(/[/]/g, "\\/")}:\\*\\*(.*)$`, "m");
  return re.exec(text)?.[1] ?? "";
}
function section(body: string, heading: string): string {
  const i = body.indexOf(`\n## ${heading}\n`);
  if (i < 0) return "";
  const rest = body.slice(i + heading.length + 5);
  const j = rest.indexOf("\n## ");
  return j < 0 ? rest : rest.slice(0, j);
}
function cycleBlock(body: string, n: number): string {
  const fixCycles = section(body, "Fix Cycles");
  const i = fixCycles.indexOf(`### Cycle ${n}\n`);
  if (i < 0) return "";
  const rest = fixCycles.slice(i);
  const j = rest.indexOf("\n### Cycle ", 1);
  return j < 0 ? rest : rest.slice(0, j);
}

/** A plan path as a scope path: relative, normalised, never escaping the root. Null when it cannot be one. */
function scopePath(raw: string): string | null {
  const t = raw.replace(/^\.\//, "");
  if (t === "" || t === "." || isAbsolute(t) || t.split("/").includes("..")) return null;
  return t;
}

/** The conventional test files for a source file, by platform convention. Exact paths only — never a pattern. */
function testsFor(p: string): string[] {
  const ext = extname(p);
  const stem = basename(p, ext);
  const dir = dirname(p);
  if ([".kt", ".kts", ".java"].includes(ext)) {
    if (!p.includes("/src/main/") || /Test$/.test(stem)) return [];
    return ["/src/test/", "/src/androidTest/"].map((t) => join(dirname(p.replace("/src/main/", t)), `${stem}Test${ext}`));
  }
  if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
    if (/\.(test|spec)$/.test(stem) || dir.split("/").includes("__tests__")) return [];
    return [join(dir, `${stem}.test${ext}`), join(dir, `${stem}.spec${ext}`), join(dir, "__tests__", `${stem}.test${ext}`)];
  }
  if (ext === ".swift") {
    if (/Tests?$/.test(stem)) return [];
    const [top, ...rest] = p.split("/");
    if (rest.length === 0) return [];
    return [...new Set([join(`${top}Tests`, ...rest.slice(0, -1), `${stem}Tests.swift`), join(`${top}Tests`, `${stem}Tests.swift`)])];
  }
  return [];
}

function loadPlan(root: string, key: string) {
  const rel = bugWorkPlanPath(key) as string;
  const abs = join(root, rel);
  if (!existsSync(abs)) return null;
  const buf = readFileSync(abs);
  const v = validateBugWorkPlan(buf);
  return { rel, abs, buf, v, fm: (v.frontmatter ?? {}) as Record<string, any> };
}

/** The approvable scope of the plan's current fix cycle — deterministic, from the plan alone. */
export function deriveScope(buf: Buffer, v: Record<string, any>) {
  const text = buf.toString("utf-8").replace(/<!--[\s\S]*?-->/g, "");
  const cycle = v.frontmatter.fix_cycle as number;
  const tasks = (v.tasks as Array<{ id: string; cycle: number }>).filter((t) => t.cycle === cycle).map((t) => t.id);
  const fixDesign = section(text, "Fix Design");
  const block = cycle > 1 ? cycleBlock(text, cycle) : "";
  const nonGoalText = [labelled(fixDesign, "Non-goals"), labelled(block, "Changed non-goals")].join("\n");
  const nonGoalPaths = [...new Set(backticked(nonGoalText).map(scopePath).filter((p): p is string => p !== null))].sort();
  const underNonGoal = (p: string) => nonGoalPaths.some((g) => p === g || (g.endsWith("/") && p.startsWith(g)));

  const sources = new Map<string, { kind: ScopeEntry["kind"]; sources: string[] }>();
  const ignored: Array<{ path: string; source: string; why: string }> = [];
  const add = (raw: string, kind: ScopeEntry["kind"], source: string) => {
    const p = scopePath(raw);
    if (p === null) return void ignored.push({ path: raw, source, why: "not a path inside the repository" });
    const dir = p.endsWith("/");
    if (dir && p.split("/").filter(Boolean).length < MIN_DIR_SEGMENTS) return void ignored.push({ path: raw, source, why: `a directory shallower than ${MIN_DIR_SEGMENTS} segments is too broad to approve` });
    if (underNonGoal(p)) return void ignored.push({ path: raw, source, why: "named by a non-goal" });
    const e = sources.get(p) ?? { kind: dir ? "dir" : kind, sources: [] };
    if (!e.sources.includes(source)) e.sources.push(source);
    sources.set(p, e);
  };
  for (const id of tasks) for (const f of filesFromCell(rowCells(text, id)?.["files touched"])) add(f, "file", `${id} files touched`);
  for (const f of backticked(labelled(fixDesign, "Affected files / areas"))) add(f, "file", "Fix Design affected files");
  if (block) for (const f of backticked(labelled(block, "Changed affected files / areas"))) add(f, "file", `Cycle ${cycle} changed affected files`);
  for (const [p, e] of [...sources]) {
    if (e.kind !== "file" || !isCode(p)) continue;
    for (const t of testsFor(p)) if (!sources.has(t) && !underNonGoal(t)) sources.set(t, { kind: "test", sources: [`test for ${p}`] });
  }
  const scope: ScopeEntry[] = [...sources].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([path, e]) => ({ path, kind: e.kind, source: e.sources.join("; ") }));
  return { fix_cycle: cycle, tasks, scope, non_goal_paths: nonGoalPaths, non_goals: nonGoalText.trim(), ignored };
}

const inScope = (rel: string, scope: ScopeEntry[], expansions: Expansion[]) =>
  scope.some((e) => (e.kind === "dir" ? rel.startsWith(e.path) : rel === e.path)) || expansions.some((x) => x.path === rel);

/* ------------------------------------------------------------- repository */

function gitOut(dir: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}
const currentBranch = (root: string) => {
  const b = gitOut(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return b === null || b === "" || b === "HEAD" ? null : b;
};

/** A file as a path relative to `root`, resolving symlinks of whatever part of it exists; null when it is outside. */
function relativeTo(root: string, file: string): string | null {
  let existing = file;
  const tail: string[] = [];
  while (!existsSync(existing)) {
    const up = dirname(existing);
    if (up === existing) return null;
    tail.unshift(basename(existing));
    existing = up;
  }
  const real = join(realpathSync(existing), ...tail);
  const rel = relative(root, real);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

/** In-progress feature tasks under `root` (docs/tasks/<feature>-task-state.json), read raw. */
function featureWorkInProgress(root: string): string[] {
  const dir = join(root, "docs/tasks");
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith("-task-state.json")).sort()) {
    try {
      const j = JSON.parse(readFileSync(join(dir, f), "utf-8"));
      for (const [id, t] of Object.entries((j?.tasks ?? {}) as Record<string, any>)) if (t?.state === "in-progress") found.push(`${f.replace(/-task-state\.json$/, "")} ${id}`);
    } catch {
      /* an unreadable feature store says nothing about bug work */
    }
  }
  return found;
}

/* ----------------------------------------------------------------- record */

type Record_ = {
  schema: number; work_id: string; bug_key: string; fix_cycle: number; approved_by: string;
  approved_plan_fingerprint: string; branch: string; status: "active" | "revoked";
  approved_scope: ScopeEntry[]; expansions: Expansion[]; record_fingerprint?: string;
};
const seal = (r: Record_): Record_ => {
  const { record_fingerprint: _, ...rest } = r;
  return { ...rest, record_fingerprint: sha(canonical(rest)) };
};
function writeRecord(root: string, key: string, r: Record_) {
  const abs = join(root, recordPath(key));
  const tmp = join(dirname(abs), `.${key}.cycle-approval.tmp`);
  try {
    writeFileSync(tmp, JSON.stringify(seal(r), null, 2) + "\n");
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
function readRecord(root: string, key: string): { record: Record_ } | { problem: string } | null {
  const abs = join(root, recordPath(key));
  if (!existsSync(abs)) return null;
  let r: any;
  try {
    r = JSON.parse(readFileSync(abs, "utf-8"));
  } catch {
    return { problem: "the cycle approval record is not readable JSON" };
  }
  const shaped = r && r.schema === RECORD_SCHEMA && r.work_id === `bug:${key}` && r.bug_key === key && Number.isInteger(r.fix_cycle) &&
    typeof r.approved_by === "string" && typeof r.approved_plan_fingerprint === "string" && typeof r.branch === "string" &&
    (r.status === "active" || r.status === "revoked") && Array.isArray(r.approved_scope) && Array.isArray(r.expansions);
  if (!shaped) return { problem: "the cycle approval record is not in the expected shape" };
  if (seal(r).record_fingerprint !== r.record_fingerprint) return { problem: "the cycle approval record was changed outside scripts/edit-approval.ts" };
  return { record: r };
}

/* --------------------------------------------------------------- evaluate */

type Verdict = { outcome: string; reason: string; record?: Record_; scope?: ReturnType<typeof deriveScope>; work_id: string };

/** Is bug `key`'s cycle approval valid now — and, given `rel`, does it cover that file? Every input is re-read. */
function evaluate(root: string, key: string, rel?: string): Verdict {
  const work_id = `bug:${key}`;
  const v = (outcome: string, reason: string, extra: Partial<Verdict> = {}): Verdict => ({ outcome, reason, work_id, ...extra });
  const got = readRecord(root, key);
  if (got === null) return v("NO_ACTIVE_APPROVAL", `${work_id} has no cycle approval`);
  if ("problem" in got) return v("INVALID_APPROVAL", got.problem);
  const r = got.record;
  if (r.status !== "active") return v("NO_ACTIVE_APPROVAL", `the cycle approval for ${work_id} was revoked`);
  const plan = loadPlan(root, key);
  if (plan === null || !plan.v.ok) return v("PLAN_APPROVAL_STALE", `the Bug Work Plan for ${work_id} is missing or invalid`);
  const branch = currentBranch(root);
  if (branch !== r.branch) return v("WRONG_BRANCH", `the cycle approval for ${work_id} was given on ${r.branch}, not ${branch ?? "an unknown branch"}`);
  if (plan.fm.fix_cycle !== r.fix_cycle) return v("CYCLE_CHANGED", `the approval is for fix cycle ${r.fix_cycle}; the plan is at fix cycle ${plan.fm.fix_cycle} — each cycle is approved on its own`);
  if (verifyApproval(plan.buf).status !== "approved") return v("PLAN_APPROVAL_STALE", `the Bug Work Plan for ${work_id} is no longer approved as written — re-approve it through /analyze-bug`);
  if (plan.fm.approved_fingerprint !== r.approved_plan_fingerprint) return v("PLAN_CHANGED", `the Bug Work Plan for ${work_id} changed and was approved again since this cycle was approved`);
  const scope = deriveScope(plan.buf, plan.v);
  if (canonical(scope.scope) !== canonical(r.approved_scope)) return v("INVALID_APPROVAL", "the recorded scope is not the scope the approved plan derives");
  const state = readTaskState(root, work_id, plan.abs);
  if (scope.tasks.length > 0 && scope.tasks.every((id) => state.tasks[id]?.deterministicProof === true)) {
    return v("CYCLE_COMPLETE", `fix cycle ${r.fix_cycle} of ${work_id} is complete — its edit approval is consumed`, { record: r, scope });
  }
  if (!scope.tasks.some((id) => state.tasks[id]?.state === "in-progress")) {
    return v("WORK_NOT_IN_PROGRESS", `no task of fix cycle ${r.fix_cycle} of ${work_id} is in progress (not started, or abandoned)`, { record: r, scope });
  }
  const features = featureWorkInProgress(root);
  if (features.length) return v("FEATURE_WORK_ACTIVE", `feature work is in progress (${features.join(", ")}) — the cycle approval covers bug work only`, { record: r, scope });
  if (rel !== undefined && !inScope(rel, scope.scope, r.expansions)) {
    return v("OUT_OF_SCOPE", `${rel} is out of the approved scope of ${work_id} fix cycle ${r.fix_cycle} — an out-of-scope edit needs its own approval`, { record: r, scope });
  }
  return v("APPROVED", `${work_id} fix cycle ${r.fix_cycle} is approved by ${r.approved_by}${rel !== undefined ? ` and ${rel} is in scope` : ""}`, { record: r, scope });
}

/* ------------------------------------------------------------------ check */

/** The hook's question for one file. `allow` only on `APPROVED`; `ask` for everything else. */
export function checkEdit(req: { file: string; cwd?: string }): Record<string, any> {
  const ask = (outcome: string, reason: string, extra: Record<string, unknown> = {}) => ({ decision: "ask", outcome, reason, hook_note: null as string | null, ...extra });
  if (!req.file) return ask("NO_FILE", "no file to check");
  const abs = isAbsolute(req.file) ? req.file : resolve(req.cwd ?? process.cwd(), req.file);
  if (!isCode(abs)) return ask("NOT_CODE", "not a code file — the hook does not ask about it");
  let probe = dirname(abs);
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  const top = gitOut(probe, ["rev-parse", "--show-toplevel"]);
  if (top === null) return ask("NO_ACTIVE_APPROVAL", "not inside a git repository");
  const gitRoot = realpathSync(top);
  const relToTop = relativeTo(gitRoot, abs);
  if (relToTop === null) return ask("NO_ACTIVE_APPROVAL", "the file is outside its repository");

  // Every directory from the file up to the repository root may be a TARGET_ROOT with bug approvals.
  const verdicts: Array<{ root: string; verdict: Verdict }> = [];
  const activeBugs: string[] = [];
  for (let dir = dirname(join(gitRoot, relToTop)); ; dir = dirname(dir)) {
    const bugs = join(dir, "docs/tasks/bugs");
    if (existsSync(bugs) && statSync(bugs).isDirectory()) {
      const entries = readdirSync(bugs).sort();
      for (const f of entries.filter((x) => x.endsWith(".cycle-approval.json"))) {
        const key = f.slice(0, -".cycle-approval.json".length);
        const rel = relativeTo(dir, abs);
        if (rel !== null) verdicts.push({ root: dir, verdict: evaluate(dir, key, rel) });
      }
      for (const f of entries.filter((x) => x.endsWith(".task-state.json"))) {
        try {
          const j = JSON.parse(readFileSync(join(bugs, f), "utf-8"));
          if (Object.values((j?.tasks ?? {}) as Record<string, any>).some((t) => t?.state === "in-progress")) activeBugs.push(f);
        } catch {
          /* unreadable: not evidence of activity */
        }
      }
    }
    if (dir === gitRoot || dirname(dir) === dir) break;
  }
  if (verdicts.length === 0) return ask("NO_ACTIVE_APPROVAL", "no bug fix cycle is approved here");
  const note = (vd: Verdict) => `[${vd.work_id}: ${vd.outcome}] ${vd.reason}.`;
  if (activeBugs.length > 1) {
    return ask("MULTIPLE_ACTIVE_WORK", `more than one bug has a task in progress (${activeBugs.join(", ")}) — which one this edit belongs to is ambiguous`, { hook_note: "More than one bug has a task in progress, so no cycle approval applies." });
  }
  const ok = verdicts.find((x) => x.verdict.outcome === "APPROVED");
  if (ok) return { decision: "allow", outcome: "APPROVED", reason: ok.verdict.reason, work_id: ok.verdict.work_id, hook_note: note(ok.verdict) };
  const pick = verdicts.find((x) => x.verdict.outcome !== "WORK_NOT_IN_PROGRESS" && x.verdict.outcome !== "NO_ACTIVE_APPROVAL") ?? verdicts[0];
  return ask(pick.verdict.outcome, pick.verdict.reason, { work_id: pick.verdict.work_id, hook_note: note(pick.verdict) });
}

/* ---------------------------------------------------- scope · status · write */

function resolveWork(req: { root: string; work: string }) {
  const key = bugKeyOf(req.work ?? "");
  if (key === null) return { error: { ok: false, outcome: "BUG_WORK_ID_INVALID", reason: `"${req.work}" is not bug work — name it bug:<bug_key>` } };
  if (!req.root || !existsSync(req.root)) return { error: { ok: false, outcome: "BUG_ROOT_INVALID", reason: `repository root ${req.root ?? ""} does not exist` } };
  return { key, root: realpathSync(req.root) };
}

export function cycleScope(req: { root: string; work: string }): Record<string, any> {
  const w = resolveWork(req);
  if ("error" in w) return w.error;
  const plan = loadPlan(w.root, w.key);
  if (plan === null || !plan.v.ok) return { ok: false, outcome: "BUG_PLAN_INVALID", reason: `no valid Bug Work Plan for ${w.key}` };
  return { ok: true, outcome: "SCOPE", work_id: `bug:${w.key}`, ...deriveScope(plan.buf, plan.v) };
}

export function cycleStatus(req: { root: string; work: string }): Record<string, any> {
  const w = resolveWork(req);
  if ("error" in w) return w.error;
  const vd = evaluate(w.root, w.key);
  return {
    ok: true,
    outcome: vd.outcome,
    reason: vd.reason,
    work_id: vd.work_id,
    record_path: recordPath(w.key),
    active: vd.outcome === "APPROVED",
    consumed: vd.outcome === "CYCLE_COMPLETE",
    // Valid, and waiting only for a task to start: /implement-task's own run start makes it active.
    reusable: vd.outcome === "APPROVED" || vd.outcome === "WORK_NOT_IN_PROGRESS",
    fix_cycle: vd.record?.fix_cycle ?? null,
    approved_by: vd.record?.approved_by ?? null,
    expansions: vd.record?.expansions ?? [],
  };
}

const refuse = (code: string, reason: string, extra: Record<string, unknown> = {}) => ({ ok: false, outcome: "REFUSED", code, reason, ...extra });

export function approveCycle(req: { root: string; work: string; by?: string }): Record<string, any> {
  const w = resolveWork(req);
  if ("error" in w) return w.error;
  const who = plainIdentityProblem(req.by);
  if (who) return refuse(who.code, who.message);
  const plan = loadPlan(w.root, w.key);
  if (plan === null || !plan.v.ok) return refuse("BUG_PLAN_INVALID", `no valid Bug Work Plan for ${w.key}`, { route: "/analyze-bug <bug-ref>" });
  if (verifyApproval(plan.buf).status !== "approved") return refuse("PLAN_NOT_APPROVED", "the Bug Work Plan is not approved for its current fix cycle — approve it through /analyze-bug first", { route: "/analyze-bug <bug-ref>" });
  const branch = currentBranch(w.root);
  if (branch === null) return refuse("BRANCH_UNKNOWN", "the current branch cannot be read — a cycle approval is bound to a branch");
  if (PROTECTED_BRANCHES.has(branch)) return refuse("BRANCH_PROTECTED", `${branch} is protected — create a fix branch first`);
  const scope = deriveScope(plan.buf, plan.v);
  const state = readTaskState(w.root, `bug:${w.key}`, plan.abs);
  if (scope.tasks.length === 0 || scope.tasks.every((id) => state.tasks[id]?.deterministicProof === true)) return refuse("CYCLE_COMPLETE", `fix cycle ${scope.fix_cycle} has nothing left to implement`);
  if (scope.scope.length === 0) return refuse("SCOPE_EMPTY", "the plan names no file or area this cycle may change");
  const record: Record_ = {
    schema: RECORD_SCHEMA, work_id: `bug:${w.key}`, bug_key: w.key, fix_cycle: scope.fix_cycle, approved_by: (req.by as string).trim(),
    approved_plan_fingerprint: plan.fm.approved_fingerprint, branch, status: "active", approved_scope: scope.scope, expansions: [],
  };
  try {
    writeRecord(w.root, w.key, record);
  } catch (e) {
    return refuse("WRITE_FAILED", `could not write ${recordPath(w.key)}: ${(e as Error).message}`);
  }
  return { ok: true, outcome: "CYCLE_APPROVED", record_path: recordPath(w.key), work_id: record.work_id, fix_cycle: record.fix_cycle, branch, approved_by: record.approved_by, tasks: scope.tasks, scope: scope.scope };
}

export function expandScope(req: { root: string; work: string; file: string; task: string; reason: string; by?: string; contradictsNonGoal?: boolean }): Record<string, any> {
  const w = resolveWork(req);
  if ("error" in w) return w.error;
  const who = plainIdentityProblem(req.by);
  if (who) return refuse(who.code, who.message);
  if (!req.reason || !req.reason.trim()) return refuse("REASON_REQUIRED", "say why the file must change");
  const vd = evaluate(w.root, w.key);
  if (vd.outcome !== "APPROVED") return refuse("NO_VALID_APPROVAL", `there is no valid cycle approval to expand (${vd.outcome}: ${vd.reason})`);
  const r = vd.record as Record_;
  const scope = vd.scope as ReturnType<typeof deriveScope>;
  if (!scope.tasks.includes(req.task)) return refuse("TASK_NOT_CURRENT", `${req.task} is not a task of fix cycle ${r.fix_cycle} (${scope.tasks.join(", ")})`);
  const rel = relativeTo(w.root, isAbsolute(req.file) ? req.file : join(w.root, req.file));
  if (rel === null) return refuse("FILE_OUTSIDE_ROOT", `${req.file} is not inside ${w.root}`);
  const route = "/analyze-bug <bug-ref>";
  if (req.contradictsNonGoal) return refuse("NON_GOAL_CONFLICT", "the change contradicts a non-goal of the approved Fix Design — re-plan through /analyze-bug instead of widening the approval", { route });
  if (scope.non_goal_paths.some((g) => rel === g || (g.endsWith("/") && rel.startsWith(g)))) {
    return refuse("NON_GOAL_CONFLICT", `${rel} is named by a non-goal of the approved Fix Design — re-plan through /analyze-bug instead of widening the approval`, { route });
  }
  if (inScope(rel, scope.scope, r.expansions)) return { ok: true, outcome: "ALREADY_IN_SCOPE", path: rel };
  const expansion: Expansion = { path: rel, task: req.task, reason: req.reason.trim(), approved_by: (req.by as string).trim() };
  try {
    writeRecord(w.root, w.key, { ...r, expansions: [...r.expansions, expansion] });
  } catch (e) {
    return refuse("WRITE_FAILED", `could not write ${recordPath(w.key)}: ${(e as Error).message}`);
  }
  return { ok: true, outcome: "SCOPE_EXPANDED", path: rel, expansion };
}

export function revokeCycle(req: { root: string; work: string }): Record<string, any> {
  const w = resolveWork(req);
  if ("error" in w) return w.error;
  const got = readRecord(w.root, w.key);
  if (got === null) return { ok: true, outcome: "NO_APPROVAL" };
  if ("problem" in got) return refuse("INVALID_APPROVAL", got.problem);
  try {
    writeRecord(w.root, w.key, { ...got.record, status: "revoked" });
  } catch (e) {
    return refuse("WRITE_FAILED", `could not write ${recordPath(w.key)}: ${(e as Error).message}`);
  }
  return { ok: true, outcome: "REVOKED", record_path: recordPath(w.key) };
}

/* --------------------------------------------------------------------- CLI */

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}
const print = (o: unknown) => process.stdout.write(JSON.stringify(o) + "\n");

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /edit-approval\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) {
  const [cmd, ...args] = process.argv.slice(2);
  const work = args[0] && !args[0].startsWith("--") ? args[0] : "";
  const root = flag(args, "--root") ?? "";
  try {
    if (cmd === "check") print(checkEdit({ file: flag(args, "--file") ?? "", cwd: flag(args, "--cwd") }));
    else if (cmd === "scope") print(cycleScope({ root, work }));
    else if (cmd === "status") print(cycleStatus({ root, work }));
    else if (cmd === "approve") print(approveCycle({ root, work, by: flag(args, "--by") }));
    else if (cmd === "expand") print(expandScope({ root, work, file: flag(args, "--file") ?? "", task: flag(args, "--task") ?? "", reason: flag(args, "--reason") ?? "", by: flag(args, "--by"), contradictsNonGoal: args.includes("--contradicts-non-goal") }));
    else if (cmd === "revoke") print(revokeCycle({ root, work }));
    else print({ ok: false, outcome: "UNKNOWN_COMMAND", reason: "usage: edit-approval.ts check --file <path> [--cwd <dir>] | scope|status|approve|expand|revoke bug:<bug_key> --root <dir> …" });
  } catch (e) {
    // Never fail open: an error is an `ask`.
    print({ ok: false, decision: "ask", outcome: "HELPER_ERROR", reason: (e as Error).message });
  }
}
