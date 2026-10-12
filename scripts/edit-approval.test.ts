/**
 * edit-approval.test.ts
 *
 * Pins Bug Flow UX P0.3: one code-edit approval per Bug Fix Cycle. A developer approves the
 * current fix cycle once; from then on, require-approval-before-code lets a code edit through
 * without asking only when scripts/edit-approval.ts says so — the edit is bug work, the
 * approval is bound to this bug, this fix cycle, this approved plan and this branch, a task of
 * the cycle is in progress, and the file is inside the scope derived from the plan. Anything
 * else asks, exactly as before. Feature work, the branch and secret hooks, and commits are
 * unchanged.
 *
 *   node --no-warnings scripts/edit-approval.test.ts
 */

import { execFileSync, spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as EA from "./edit-approval.ts";
import { approveWorkPackage } from "./work-approval.ts";
import { writeTaskState, abandonTask } from "./task-state.ts";
import { isStoreArtifact } from "./task-resume.ts";
import { validateBugWorkPlan } from "./bug-work-plan.ts";
import { canonical } from "./qa-release-gate.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const HOOK = join(REPO_ROOT, "hooks/require-approval-before-code.sh");
const MAIN_HOOK = join(REPO_ROOT, "hooks/block-main-branch-changes.sh");
const SECRETS_HOOK = join(REPO_ROOT, "hooks/scan-for-secrets.sh");
const api = EA as any;

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf-8");
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const git = (root: string, ...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf-8" }).trim();

const W = "bug:BUG-43";
const REPRO = "The reported reproduction path no longer fails: with SAVE10 applied, checkout shows the discounted total";
const MAIN = "app/src/main/java/com/acme/checkout/CheckoutTotals.kt";
const TEST = "app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt";
const VM = "app/src/main/java/com/acme/checkout/CheckoutViewModel.kt";
const VM_TEST = "app/src/test/java/com/acme/checkout/CheckoutViewModelTest.kt";
const OUTSIDE = "app/src/main/java/com/acme/checkout/CheckoutScreen.kt";
const NON_GOAL = "app/src/main/java/com/acme/coupon/CouponValidator.kt";
const BANNER = "app/src/main/java/com/acme/checkout/CheckoutBanner.kt";
const CMD = "./gradlew test --tests CheckoutTotalsTest";

/** The cycle-1 plan: three tasks, the affected files named in Fix Design, one non-goal naming a path. */
const PLAN1 = (() => {
  let p = readFileSync(join(HERE, "fixtures/bug-work-plans/bwp-cycle1.md"), "utf-8")
    .replace("| T1 | S | T1's test passes; existing totals tests pass |", `| T1 | S | ${REPRO}; T1's test passes |`)
    .replace(`- **Affected files / areas:** \`${MAIN}\``, `- **Affected files / areas:** \`${MAIN}\`, \`${VM}\``)
    .replace("- **Non-goals:** coupon validation, cart badge, tax rounding.", `- **Non-goals:** coupon validation (\`${NON_GOAL}\`), cart badge, tax rounding.`);
  return p.replace(/(\| T2 \|[^\n]*\n)/, `$1| T3 | Show the discounted total in the view model | android | \`${VM}\` | T2 | S | The view model exposes the discounted total |\n`);
})();
/** The same plan after a failed QA re-test appended fix cycle 2. */
const PLAN2 = PLAN1.replace("fix_cycle: 1", "fix_cycle: 2").replace(
  "No additional fix cycles yet. Cycle 1 is the Tasks section above.",
  readFileSync(join(HERE, "fixtures/bug-work-plans/bwp-cycle2.md"), "utf-8").split("## Fix Cycles\n\n")[1].split("\n## ")[0].trimEnd().replace(/acme\/player\/PlayerSurface/g, "acme/checkout/CheckoutBanner"),
);

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "edit-approval-")));
let n = 0;
interface Repo { root: string; plan: string }
function repo(o: { plan?: string; branch?: string } = {}): Repo {
  const root = join(TMP, `repo-${++n}`);
  const plan = join(root, "docs/bugs/BUG-43/bug-work-plan.md");
  mkdirSync(dirname(plan), { recursive: true });
  for (const f of [MAIN, TEST, VM, OUTSIDE]) {
    mkdirSync(join(root, dirname(f)), { recursive: true });
    writeFileSync(join(root, f), "// v0\n");
  }
  writeFileSync(plan, o.plan ?? PLAN1);
  approveWorkPackage(plan, { by: "dana" });
  git(root, "init", "-q", "-b", o.branch ?? "fix/bug-43");
  git(root, "config", "user.email", "t@t");
  git(root, "config", "user.name", "t");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "plan");
  return { root, plan };
}
const DT = { framework: "junit", required: true, testsChanged: [TEST], justification: null, runs: [{ command: CMD, result: "pass" }], notRunReason: null };
function start(r: Repo, task: string, mode = "start"): string {
  const w = writeTaskState(r.root, W, task, "in-progress", { platform: "android" } as any, r.plan, { mode } as any);
  if (w.status !== "written") throw new Error(`start ${task}: ${JSON.stringify(w)}`);
  return w.runId as string;
}
function complete(r: Repo, task: string, files: string[], criteria: string[], regression = false) {
  const w = writeTaskState(r.root, W, task, "complete", {
    platform: "android", filesChanged: files, standardIds: [], validation: [{ command: CMD, result: "pass" }],
    acceptanceCriteria: criteria.map((criterion) => ({ criterion, met: true })),
    developerTesting: regression ? { ...DT, regression: { command: CMD, failedBefore: true, passesAfter: true } } : DT, deviations: [], blockers: [],
  } as any, r.plan);
  if (w.status !== "written") throw new Error(`complete ${task}: ${JSON.stringify(w)}`);
}
const APPROVE = (r: Repo, by = "dana") => api.approveCycle?.({ root: r.root, work: W, by });
const CHECK = (r: Repo, rel: string) => api.checkEdit?.({ file: join(r.root, rel), cwd: r.root });
const EXPAND = (r: Repo, rel: string, extra: Record<string, unknown> = {}) => api.expandScope?.({ root: r.root, work: W, file: rel, task: "T2", reason: "the total is formatted here", by: "dana", ...extra });
const STATUS = (r: Repo) => api.cycleStatus?.({ root: r.root, work: W });
const show = (x: any) => JSON.stringify([x?.decision, x?.outcome, x?.code, x?.reason]);
const allowed = (x: any) => x?.decision === "allow" && x.outcome === "APPROVED";
const asked = (x: any, outcome?: string) => x?.decision === "ask" && (outcome === undefined || x.outcome === outcome);

function hook(script: string, payload: unknown, env: Record<string, string> = {}) {
  const p = spawnSync("bash", [script], { input: JSON.stringify(payload), encoding: "utf-8", env: { ...process.env, CLAUDE_PLUGIN_ROOT: REPO_ROOT, ...env } });
  let json: any = null;
  try {
    json = p.stdout.trim() ? JSON.parse(p.stdout) : null;
  } catch {
    /* not JSON */
  }
  return { code: p.status, stdout: p.stdout, stderr: p.stderr, decision: json?.hookSpecificOutput?.permissionDecision ?? null, reason: json?.hookSpecificOutput?.permissionDecisionReason ?? "" };
}
const edit = (r: Repo, rel: string, tool = "Edit") => ({ tool_name: tool, tool_input: { file_path: join(r.root, rel), old_string: "a", new_string: "b" }, cwd: r.root });
const ORIGINAL_ASK = (file: string) => `Code file change to ${file} requires explicit approval before writing (org policy: require-approval-before-code).`;

try {
  check("fixture plans are valid", validateBugWorkPlan(Buffer.from(PLAN1)).ok && validateBugWorkPlan(Buffer.from(PLAN2)).ok);

  /* ── the scope, derived from the plan ─────────────────────────────────── */
  {
    const r = repo();
    const s = api.cycleScope?.({ root: r.root, work: W });
    const paths = (s?.scope ?? []).map((e: any) => e.path);
    check("scope: the current cycle's tasks", JSON.stringify(s?.tasks) === '["T1","T2","T3"]' && s.fix_cycle === 1, JSON.stringify(s));
    check("scope: every task's files touched", [TEST, MAIN, VM].every((p) => paths.includes(p)), JSON.stringify(paths));
    check("scope: Fix Design's affected files", (s?.scope ?? []).some((e: any) => e.path === VM && /fix-design|affected/i.test(e.source)));
    check("scope: the platform's test file for a scoped source file", paths.includes(VM_TEST) && (s.scope.find((e: any) => e.path === VM_TEST)?.kind === "test"));
    check("scope: nothing else", !paths.includes(OUTSIDE) && !paths.includes(NON_GOAL));
    check("scope: non-goals are reported, and a path a non-goal names is never in scope", JSON.stringify(s?.non_goal_paths) === JSON.stringify([NON_GOAL]));
    check("scope is deterministic", JSON.stringify(api.cycleScope({ root: r.root, work: W })) === JSON.stringify(s));
    const broad = repo({ plan: PLAN1.replace(`- **Affected files / areas:** \`${MAIN}\`, \`${VM}\``, `- **Affected files / areas:** \`${MAIN}\`, \`app/\`, \`.\`, \`/\`, \`app/src/main/java/com/acme/checkout/\``) });
    const bs = api.cycleScope?.({ root: broad.root, work: W });
    const bp = (bs?.scope ?? []).map((e: any) => e.path);
    check("24 scope never includes the repository root or a top-level directory", !bp.includes("app/") && !bp.includes(".") && !bp.includes("/") && (bs?.ignored ?? []).length === 3, JSON.stringify(bs?.ignored));
    const ngPlan = repo({ plan: PLAN1.replace(`- **Affected files / areas:** \`${MAIN}\`, \`${VM}\``, `- **Affected files / areas:** \`${MAIN}\`, \`${VM}\`, \`${NON_GOAL}\``) });
    const ngs = api.cycleScope?.({ root: ngPlan.root, work: W });
    check("24 a path a non-goal names stays out of scope even when Fix Design lists it", !(ngs?.scope ?? []).some((e: any) => e.path === NON_GOAL) && (ngs?.ignored ?? []).some((i: any) => i.path === NON_GOAL && /non-goal/.test(i.why)), JSON.stringify(ngs?.ignored));
    check("scope: an explicit, specific directory from Fix Design is kept as a directory", (bs?.scope ?? []).some((e: any) => e.path === "app/src/main/java/com/acme/checkout/" && e.kind === "dir"));
  }

  /* ── 1–6. one approval for the whole cycle ────────────────────────────── */
  const base = repo();
  {
    check("1 bug work without a cycle approval still asks", asked(CHECK(base, MAIN), "NO_ACTIVE_APPROVAL"), show(CHECK(base, MAIN)));
    start(base, "T1");
    check("1 …even with a task in progress", asked(CHECK(base, TEST), "NO_ACTIVE_APPROVAL"));
    const a = APPROVE(base);
    check("approve records the cycle approval", a?.ok === true && a.outcome === "CYCLE_APPROVED" && a.record_path === "docs/tasks/bugs/BUG-43.cycle-approval.json", JSON.stringify(a));
    const rec = JSON.parse(readFileSync(join(base.root, "docs/tasks/bugs/BUG-43.cycle-approval.json"), "utf-8"));
    check("the record is bound to the bug, the cycle, the approved plan, the branch and the scope", rec.work_id === W && rec.fix_cycle === 1 && rec.approved_by === "dana" && /^sha256:/.test(rec.approved_plan_fingerprint) && rec.branch === "fix/bug-43" && rec.status === "active" && Array.isArray(rec.approved_scope) && rec.approved_scope.length > 0, JSON.stringify(rec));
    check("the record carries no timestamp", !/\d{4}-\d{2}-\d{2}T/.test(JSON.stringify(rec)) && !("approved_at" in rec));
    check("2 the approval allows an in-scope edit", allowed(CHECK(base, TEST)), show(CHECK(base, TEST)));
    check("3 a second in-scope edit does not ask again", allowed(CHECK(base, TEST)) && allowed(CHECK(base, MAIN)));
    complete(base, "T1", [TEST], ["The test fails on the current code for the documented reproduction"]);
    start(base, "T2");
    check("4 an edit during T2 is allowed by the same Cycle 1 approval", allowed(CHECK(base, MAIN)));
    complete(base, "T2", [MAIN], [REPRO, "T1's test passes"], true);
    start(base, "T3");
    check("5 an edit during T3 is allowed by the same approval", allowed(CHECK(base, VM)) && allowed(CHECK(base, VM_TEST)));
    check("6 no per-task re-approval: the record was written once", JSON.parse(readFileSync(join(base.root, "docs/tasks/bugs/BUG-43.cycle-approval.json"), "utf-8")).approved_plan_fingerprint === rec.approved_plan_fingerprint && STATUS(base)?.outcome === "APPROVED");
    check("non-code files are not the helper's business", CHECK(base, "README.md")?.decision === "ask" || CHECK(base, "README.md")?.outcome === "NOT_CODE");

    /* ── 7–9. scope enforcement and expansion ──────────────────────────── */
    check("7 an out-of-scope file asks, and says it is out of scope", asked(CHECK(base, OUTSIDE), "OUT_OF_SCOPE") && /out of (the approved )?scope/i.test(CHECK(base, OUTSIDE).reason));
    check("7 a file in another repository asks", asked(api.checkEdit?.({ file: join(TMP, "elsewhere/x.kt"), cwd: base.root })));
    const e = EXPAND(base, OUTSIDE);
    check("8 an approved expansion is recorded", e?.ok === true && e.outcome === "SCOPE_EXPANDED", JSON.stringify(e));
    check("8 …and allows that file afterwards", allowed(CHECK(base, OUTSIDE)));
    check("8 …and only that file", asked(CHECK(base, "app/src/main/java/com/acme/checkout/CheckoutRepository.kt"), "OUT_OF_SCOPE"));
    const exp = JSON.parse(readFileSync(join(base.root, "docs/tasks/bugs/BUG-43.cycle-approval.json"), "utf-8")).expansions;
    check("8 the expansion records the file, the task, the reason and who approved it", exp.length === 1 && exp[0].path === OUTSIDE && exp[0].task === "T2" && exp[0].reason && exp[0].approved_by === "dana");
    const ng = EXPAND(base, NON_GOAL);
    check("9 a file a non-goal names is never silently expanded — it routes back to /analyze-bug", ng?.ok === false && ng.code === "NON_GOAL_CONFLICT" && /analyze-bug/.test(ng.route ?? ""), JSON.stringify(ng));
    check("9 a declared contradiction routes back too", EXPAND(base, "app/src/main/java/com/acme/checkout/CheckoutFormat.kt", { contradictsNonGoal: true })?.code === "NON_GOAL_CONFLICT");
    check("9 …and the file stays out of scope", asked(CHECK(base, NON_GOAL), "OUT_OF_SCOPE"));
    check("an expansion needs an explicit approver", EXPAND(base, "app/src/main/java/com/acme/checkout/A.kt", { by: "" })?.ok === false);
    check("an expansion names a task of the current cycle", EXPAND(base, "app/src/main/java/com/acme/checkout/A.kt", { task: "C9-T1" })?.ok === false);
    check("the plan is never rewritten by an expansion", readFileSync(base.plan, "utf-8") === (() => { const r2 = repo(); return readFileSync(r2.plan, "utf-8"); })());

    /* ── 16. completion consumes it ────────────────────────────────────── */
    complete(base, "T3", [VM], ["The view model exposes the discounted total"]);
    check("16 a completed cycle invalidates the approval", asked(CHECK(base, VM), "CYCLE_COMPLETE"), show(CHECK(base, VM)));
    check("16 status reports it consumed", STATUS(base)?.outcome === "CYCLE_COMPLETE" && STATUS(base).active === false);
    check("16 a completed cycle cannot be approved again", APPROVE(base)?.ok === false);
  }

  /* ── 10–15. automatic invalidation ────────────────────────────────────── */
  {
    const r = repo();
    start(r, "T1");
    APPROVE(r);
    writeFileSync(r.plan, readFileSync(r.plan, "utf-8").replace("cart badge, tax rounding", "cart badge, tax rounding, analytics"));
    check("11 a stale plan approval invalidates the edit approval", asked(CHECK(r, TEST), "PLAN_APPROVAL_STALE"), show(CHECK(r, TEST)));
    approveWorkPackage(r.plan, { by: "dana" });
    check("10 a changed (even re-approved) Bug Work Plan invalidates it", asked(CHECK(r, TEST), "PLAN_CHANGED"), show(CHECK(r, TEST)));
    check("18 resume after a changed plan requires a new approval", STATUS(r)?.active === false && APPROVE(r)?.ok === true && allowed(CHECK(r, TEST)));
  }
  {
    const r = repo();
    start(r, "T1");
    APPROVE(r);
    writeFileSync(r.plan, PLAN2);
    approveWorkPackage(r.plan, { by: "dana" });
    check("12 a fix_cycle change invalidates the approval", asked(CHECK(r, TEST), "CYCLE_CHANGED"), show(CHECK(r, TEST)));
    check("13 a Cycle 1 approval cannot authorize Cycle 2", asked(CHECK(r, BANNER)) && STATUS(r)?.active === false);
    const recPath = join(r.root, "docs/tasks/bugs/BUG-43.cycle-approval.json");
    const forged = JSON.parse(readFileSync(recPath, "utf-8"));
    forged.fix_cycle = 2;
    writeFileSync(recPath, JSON.stringify(forged));
    check("13 a record edited to claim Cycle 2 is invalid", asked(CHECK(r, BANNER)) && ["INVALID_APPROVAL", "PLAN_CHANGED"].includes(CHECK(r, BANNER).outcome), show(CHECK(r, BANNER)));
  }
  {
    const r = repo();
    start(r, "T1");
    APPROVE(r);
    git(r.root, "checkout", "-q", "-b", "other");
    check("14 a different branch invalidates the approval", asked(CHECK(r, TEST), "WRONG_BRANCH"), show(CHECK(r, TEST)));
    git(r.root, "checkout", "-q", "fix/bug-43");
    check("14 …and it holds again on its own branch", allowed(CHECK(r, TEST)));
    const run = start(r, "T1", "restart");
    check("17 resume with the same valid state reuses the approval (a new run, no new approval)", typeof run === "string" && allowed(CHECK(r, TEST)));
    const ab = abandonTask(r.root, W, "T1", run, "developer stopped", r.plan);
    check("15 abandoned work invalidates the approval", ab.status === "written" && asked(CHECK(r, TEST), "WORK_NOT_IN_PROGRESS"), show(CHECK(r, TEST)));
    start(r, "T1", "start");
    check("15 …until bug work is in progress again", allowed(CHECK(r, TEST)));
    const rv = api.revokeCycle?.({ root: r.root, work: W });
    check("an approval can be revoked", rv?.ok === true && asked(CHECK(r, TEST), "NO_ACTIVE_APPROVAL"));
  }
  {
    const r = repo({ branch: "main" });
    start(r, "T1");
    const a = APPROVE(r);
    check("20 a cycle is never approved on main/master", a?.ok === false && a.code === "BRANCH_PROTECTED", JSON.stringify(a));
    check("20 the main-branch hook still blocks every write, approved or not", hook(MAIN_HOOK, edit(r, TEST), { CLAUDE_PROJECT_DIR: r.root }).code === 2);
  }
  {
    const r = repo();
    start(r, "T1");
    APPROVE(r);
    const recPath = join(r.root, "docs/tasks/bugs/BUG-43.cycle-approval.json");
    const rec = JSON.parse(readFileSync(recPath, "utf-8"));
    writeFileSync(recPath, JSON.stringify({ ...rec, approved_scope: [...rec.approved_scope, { path: OUTSIDE, kind: "file", source: "hand-edit" }] }));
    check("24 a hand-widened scope invalidates the record", asked(CHECK(r, OUTSIDE), "INVALID_APPROVAL"), show(CHECK(r, OUTSIDE)));
    // Resealed by hand, so only the derived-scope comparison can catch it.
    const widened = { ...rec, approved_scope: [...rec.approved_scope, { path: OUTSIDE, kind: "file", source: "hand-edit" }] };
    delete widened.record_fingerprint;
    writeFileSync(recPath, JSON.stringify({ ...widened, record_fingerprint: `sha256:${sha(canonical(widened))}` }));
    check("24 a resealed, hand-widened scope still differs from what the plan derives", asked(CHECK(r, OUTSIDE), "INVALID_APPROVAL"), show(CHECK(r, OUTSIDE)));
    // Not resealed: a hand-added expansion — only the seal can catch it.
    writeFileSync(recPath, JSON.stringify({ ...rec, expansions: [{ path: OUTSIDE, task: "T1", reason: "x", approved_by: "dana" }] }));
    check("24 a hand-added expansion invalidates the record", asked(CHECK(r, OUTSIDE), "INVALID_APPROVAL") && asked(CHECK(r, TEST), "INVALID_APPROVAL"), show(CHECK(r, OUTSIDE)));
    writeFileSync(recPath, "{ not json");
    check("an unreadable record asks", asked(CHECK(r, TEST), "INVALID_APPROVAL"));
  }

  /* ── 19, 25. the hook ─────────────────────────────────────────────────── */
  {
    const r = repo();
    start(r, "T1");
    const before = hook(HOOK, edit(r, TEST));
    check("1 hook: bug work without approval asks", before.code === 0 && before.decision === "ask");
    APPROVE(r);
    const h = hook(HOOK, edit(r, TEST));
    check("2 hook: an approved in-scope edit is allowed", h.code === 0 && h.decision === "allow", h.stdout + h.stderr);
    check("2 hook: Write and MultiEdit too", hook(HOOK, edit(r, MAIN, "Write")).decision === "allow" && hook(HOOK, edit(r, MAIN, "MultiEdit")).decision === "allow");
    const out = hook(HOOK, edit(r, OUTSIDE));
    check("7 hook: an out-of-scope edit asks and explains why", out.decision === "ask" && /out of (the approved )?scope/i.test(out.reason) && /bug:BUG-43/.test(out.reason), out.reason);
    check("hook: a relative path resolves against the session's cwd", hook(HOOK, { tool_name: "Edit", tool_input: { file_path: TEST }, cwd: r.root }).decision === "allow");
    check("25 hook: no helper, no allow — it fails closed", hook(HOOK, edit(r, TEST), { CLAUDE_PLUGIN_ROOT: join(TMP, "no-plugin") }).decision === "ask");
    check("hook: the cycle approval record itself is never written through Write/Edit", hook(HOOK, edit(r, "docs/tasks/bugs/BUG-43.cycle-approval.json", "Write")).decision === "ask");
    check("hook: other non-code files still pass through untouched", hook(HOOK, edit(r, "docs/notes.md")).stdout.trim() === "");
    const src = read("hooks/require-approval-before-code.sh");
    check("25 hook: the decision comes from the helper's output, not from shell logic", /scripts\/edit-approval\.ts" check/.test(src) && !/bug-work-plan|task-state|fix_cycle|approved_scope/.test(src));
    check("25 hook: it allows only on the helper's exact allow decision", /= "allow"/.test(src) && (src.match(/permissionDecision: "allow"/g) ?? []).length === 1);

    /* ── 19. feature work: unchanged ─────────────────────────────────── */
    const f = join(TMP, `feature-${++n}`);
    mkdirSync(join(f, "docs/tasks"), { recursive: true });
    mkdirSync(join(f, "src"), { recursive: true });
    git(f, "init", "-q", "-b", "feat/checkout");
    writeFileSync(join(f, "docs/tasks/checkout-task-state.json"), JSON.stringify({ schemaVersion: 1, feature: "checkout", tasks: { T1: { state: "in-progress" } } }));
    const fh = hook(HOOK, { tool_name: "Edit", tool_input: { file_path: join(f, "src/app.ts") }, cwd: f });
    check("19 feature work: every code edit still asks, with the original reason", fh.code === 0 && fh.decision === "ask" && fh.reason === ORIGINAL_ASK(join(f, "src/app.ts")), fh.reason);
    check("19 feature work: the helper never allows it", asked(api.checkEdit?.({ file: join(f, "src/app.ts"), cwd: f })));
    // A feature task in progress beside an approved bug cycle: the relaxation applies to bug work only.
    writeFileSync(join(r.root, "docs/tasks/checkout-task-state.json"), JSON.stringify({ schemaVersion: 1, feature: "checkout", tasks: { T4: { state: "in-progress" } } }));
    check("19 a feature task in progress turns the relaxation off", asked(CHECK(r, TEST), "FEATURE_WORK_ACTIVE"), show(CHECK(r, TEST)));
    rmSync(join(r.root, "docs/tasks/checkout-task-state.json"));
    check("…and back on once it is not", allowed(CHECK(r, TEST)));

    /* ── 21–23. secrets, commits, pushes ─────────────────────────────── */
    const secret = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
    const sh = hook(SECRETS_HOOK, { tool_name: "Write", tool_input: { file_path: join(r.root, TEST), content: `val k = "${secret}"` }, cwd: r.root });
    check("21 secret protection still blocks an approved in-scope write", sh.code === 2, sh.stderr);
    for (const cmd of ["git commit -m fix", "git push origin fix/bug-43"]) {
      const b = hook(HOOK, { tool_name: "Bash", tool_input: { command: cmd }, cwd: r.root });
      check(`22/23 the approval hook grants nothing for \`${cmd}\``, b.code === 0 && b.stdout.trim() === "");
    }
    const helper = read("scripts/edit-approval.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("22/23 the helper never commits, pushes or merges", !/["'](commit|push|merge)["']/.test(helper));
    check("22 commits stay a human act", /never creates a git commit/i.test(read("commands/implement-task.md")) && /does not (grant|permit)[^.]*commit/i.test(read("commands/implement-task.md")));
  }

  /* ── 26–29. boundaries ────────────────────────────────────────────────── */
  {
    check("the record is a store artifact, never part of the reviewed code", isStoreArtifact("docs/tasks/bugs/BUG-43.cycle-approval.json") && !isStoreArtifact("docs/tasks/bugs/BUG-43.cycle-approval.json.bak"));
    const PINS: Record<string, string> = {
      "hooks/require-approval-before-code.json": "37f5f2e5dbe97ccac0f432a7b3eacc6f8595b0d2a60ade3674df0f6ec69db043",
      "hooks/block-main-branch-changes.json": "89599088f364c9d6dd1af0a0cc7438610bf9b417a9b8e320d2866bf1c6857b2c",
      "hooks/block-main-branch-changes.sh": "771aef6d81d25308edbc77e4cca8c663cf2f05946cfe254fd150e34342636d34",
      "hooks/protect-secrets.json": "e1eaeb813e75d5b80927dcf6630c292c0bc7acd32519349af088dc0994cc00fb",
      "hooks/scan-for-secrets.sh": "be60a1fc569de494c2aa215220cf162eccfe8f6b7fc04ffc5a14d7e6827c67d9",
      "agents/feature-implementer.md": "d53845b5e31d2487754747f89227b0a54fa9d1ed457ae02934b593cce7576023",
    };
    for (const [f, h] of Object.entries(PINS)) check(`20/21 ${f} is byte-identical`, sha(readFileSync(join(REPO_ROOT, f))) === h);
    const it = read("commands/implement-task.md");
    const featurePart = it.slice(it.indexOf("\n## 2. "));
    check("29 /implement-task's feature sections never mention the cycle approval", !/edit-approval|cycle approval/i.test(featurePart));
    const bug = it.slice(it.indexOf("## 1a. Bug work")).split("\n## 2. ")[0];
    check("UX: /implement-task asks once per cycle — Implement Fix Cycle <n>?", /Implement Fix Cycle <n>\?/.test(bug) && /scripts\/edit-approval\.ts" approve bug:<bug_key>/.test(bug));
    check("UX: no re-approval between tasks of an approved cycle", /without asking again/i.test(bug));
    check("UX: an out-of-scope file stops before the edit, with file, why, task and non-goal", /scripts\/edit-approval\.ts" expand/.test(bug) && ["requested file", "why", "task", "non-goal"].every((w) => bug.toLowerCase().includes(w)));
    const ab = read("commands/analyze-bug.md");
    check("UX: /analyze-bug's continue offer is the cycle approval", /Implement Fix Cycle <n>\?/.test(ab) && /Planned implementation scope/.test(ab) && /scripts\/edit-approval\.ts" approve/.test(ab));
    check("the suite is registered", read("scripts/check.ts").includes('"edit-approval"'));
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall edit-approval checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
