/**
 * bug-verification.test.ts
 *
 * Pins Bug Flow P1: consolidated developer verification per Bug Fix Cycle. Automated checks
 * still run and gate every task; manual acceptance criteria are deferred to one checklist per
 * cycle (docs/bugs/<bug_key>/verification-c<n>.md), generated from what planning and
 * implementation recorded, walked once, recorded per item and surface, bound to the exact plan,
 * task state and code it verified, and required — fresh and all-pass — by the bug review and
 * the QA handoff. Feature work is unchanged.
 *
 *   node --no-warnings scripts/bug-verification.test.ts
 */

import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync, readdirSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as BV from "./bug-verification.ts";
import { approveWorkPackage } from "./work-approval.ts";
import { writeTaskState } from "./task-state.ts";
import { validateBugWorkPlan } from "./bug-work-plan.ts";
import { reviewContext, writeReviewRecord } from "./bug-review.ts";
import { handoffCheck, generateHandoff } from "./qa-handoff-gate.ts";
import { bugWorkStatus } from "./bug-implementation.ts";
import { PLUGIN_NAME } from "./next-command.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const QA = join(HERE, "fixtures/qa-bugs/acme-qa");
const api = BV as any;

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
const T1_TEST = "The test fails on the current code for the documented reproduction";
const SCREEN = "The checkout screen shows the discounted total after rotation";
const REMOVAL = "Removing the coupon restores the full price";
const MAIN = "app/src/main/java/com/acme/checkout/CheckoutTotals.kt";
const TEST = "app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt";
const CMD = "./gradlew test --tests CheckoutTotalsTest";
const LINT = "./gradlew lint";

/** Cycle 1: T1 (regression test) and T2 (the fix); both carry the same manual criterion, T2 one more. */
const PLAN1 = readFileSync(join(HERE, "fixtures/bug-work-plans/bwp-cycle1.md"), "utf-8")
  .replace(`| — | S | ${T1_TEST} |`, `| — | S | ${T1_TEST}; ${SCREEN} |`)
  .replace("| T1 | S | T1's test passes; existing totals tests pass |", `| T1 | S | ${REPRO}; T1's test passes; ${SCREEN}; ${REMOVAL} |`);
const PLAN_TWO_SURFACES = PLAN1.replace("surfaces: [android]", "surfaces: [android, android-tv]");
const PLAN2 = PLAN1.replace("fix_cycle: 1", "fix_cycle: 2").replace(
  "No additional fix cycles yet. Cycle 1 is the Tasks section above.",
  readFileSync(join(HERE, "fixtures/bug-work-plans/bwp-cycle2.md"), "utf-8").split("## Fix Cycles\n\n")[1].split("\n## ")[0].trimEnd().replace(/acme\/player\/PlayerSurface/g, "acme/checkout/CheckoutBanner"),
);

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "bug-verification-")));
let n = 0;
interface Repo { root: string; plan: string }
function repo(plan = PLAN1): Repo {
  const root = join(TMP, `repo-${++n}`);
  const p = join(root, "docs/bugs/BUG-43/bug-work-plan.md");
  mkdirSync(dirname(p), { recursive: true });
  for (const f of [MAIN, TEST]) {
    mkdirSync(join(root, dirname(f)), { recursive: true });
    writeFileSync(join(root, f), "// v0\n");
  }
  writeFileSync(p, plan);
  approveWorkPackage(p, { by: "dana" });
  git(root, "init", "-q", "-b", "fix/bug-43");
  git(root, "config", "user.email", "t@t");
  git(root, "config", "user.name", "t");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "plan");
  writeFileSync(join(root, MAIN), "fun total() = discountedSubtotal()\n");
  writeFileSync(join(root, TEST), "@Test fun couponIsApplied() {}\n");
  return { root, plan: p };
}
const DEFER = (criterion: string) => ({ criterion, met: false, status: "deferred_to_cycle_verification" });
const MET = (criterion: string) => ({ criterion, met: true });
const DT = { framework: "junit", required: true, testsChanged: [TEST], justification: null, runs: [{ command: CMD, result: "pass" }], notRunReason: null };
function task(r: Repo, id: string, criteria: unknown[], extra: Record<string, unknown> = {}, work = W) {
  const s = writeTaskState(r.root, work, id, "in-progress", { platform: "android" } as any, r.plan, { mode: "start" });
  if (s.status !== "written") throw new Error(`start ${id}: ${JSON.stringify(s)}`);
  return writeTaskState(r.root, work, id, "complete", {
    platform: "android", filesChanged: [MAIN], standardIds: [], validation: [{ command: CMD, result: "pass" }, { command: LINT, result: "pass" }],
    acceptanceCriteria: criteria, developerTesting: DT, deviations: [], blockers: [], ...extra,
  } as any, r.plan);
}
const REG = { developerTesting: { ...DT, regression: { command: CMD, failedBefore: true, passesAfter: true } } };
const DEBT = { verificationDebt: [{ domain: "developer-testing", ruleId: "VERIFY-4", requiredVerification: "Rotation on a low-memory device", whyNotAutomatable: "No emulator profile", owner: "developer", status: "pending" }] };
function implemented(r: Repo, o: { debt?: boolean } = {}) {
  const a = task(r, "T1", [MET(T1_TEST), DEFER(SCREEN)]);
  const b = task(r, "T2", [MET(REPRO), MET("T1's test passes"), DEFER(SCREEN), DEFER(REMOVAL)], { ...REG, ...(o.debt ? DEBT : {}) });
  if (a.status !== "written" || b.status !== "written") throw new Error(`implement: ${JSON.stringify([a, b])}`);
}
const GEN = (r: Repo) => api.generateVerification?.({ root: r.root, work: W });
const CHK = (r: Repo, extra: Record<string, unknown> = {}) => api.checkVerification?.({ root: r.root, work: W, ...extra });
const REC = (r: Repo, results: unknown[], extra: Record<string, unknown> = {}) => api.recordVerification?.({ root: r.root, work: W, results, by: "dana", ...extra });
const pairs = (g: any): Array<{ id: string; surface: string }> => (g?.items ?? []).flatMap((it: any) => it.surfaces.map((surface: string) => ({ id: it.id, surface })));
const all = (g: any, result: string) => pairs(g).map((p) => ({ ...p, result }));
const artifact = (r: Repo, c = 1) => join(r.root, `docs/bugs/BUG-43/verification-c${c}.md`);

try {
  check("fixture plans are valid", [PLAN1, PLAN_TWO_SURFACES, PLAN2].every((p) => validateBugWorkPlan(Buffer.from(p)).ok));

  /* ── 3–5, 40. per-task automation; manual criteria deferred (bug only) ── */
  {
    const r = repo();
    const t1 = task(r, "T1", [MET(T1_TEST), DEFER(SCREEN)]);
    check("5 a manual criterion is recorded deferred_to_cycle_verification, and the task completes", t1.status === "written", JSON.stringify(t1));
    const raw = JSON.parse(readFileSync(join(r.root, "docs/tasks/bugs/BUG-43.task-state.json"), "utf-8"));
    check("5 the deferral is stored deterministically, never as met", JSON.stringify(raw.tasks.T1.acceptanceCriteria[1]) === JSON.stringify(DEFER(SCREEN)));
    const r2 = repo();
    check("5 a deferred criterion can never also be met", task(r2, "T1", [MET(T1_TEST), { ...DEFER(SCREEN), met: true }]).status === "refused");
    check("5 a failed criterion blocks completion", task(repo(), "T1", [MET(T1_TEST), { criterion: SCREEN, met: false, status: "failed" }]).status === "refused");
    check("5 an unmet criterion without a deferral still blocks completion", task(repo(), "T1", [MET(T1_TEST), { criterion: SCREEN, met: false }]).status === "refused");
    check("3 automated checks still run per task: no validation, no completion", task(repo(), "T1", [MET(T1_TEST), DEFER(SCREEN)], { validation: [] }).status === "refused");
    check("4 an automated failure still blocks task completion", task(repo(), "T1", [MET(T1_TEST), DEFER(SCREEN)], { developerTesting: { ...DT, runs: [{ command: CMD, result: "fail" }] } }).status === "refused");
    const fr = join(TMP, `feature-${++n}`);
    mkdirSync(join(fr, "docs/tasks"), { recursive: true });
    const bd = join(fr, "docs/tasks/checkout-task-breakdown.md");
    writeFileSync(bd, `| id | description | platform | files touched | depends-on | size | acceptance criteria |\n|---|---|---|---|---|---|---|\n| T1 | x | android | \`a.kt\` | — | S | ${SCREEN} |\n`);
    writeTaskState(fr, "checkout", "T1", "in-progress", { platform: "android" } as any, bd, { mode: "start" });
    const f = writeTaskState(fr, "checkout", "T1", "complete", { platform: "android", filesChanged: ["a.kt"], validation: [{ command: CMD, result: "pass" }], acceptanceCriteria: [DEFER(SCREEN)], developerTesting: DT } as any, bd);
    check("40 feature work cannot defer a criterion — its per-task verification is unchanged", f.status === "refused" && f.reason === "complete-without-verification", JSON.stringify(f));
  }

  /* ── 1, 2, 6. nothing per task; one checklist when the cycle completes ── */
  const base = repo();
  {
    task(base, "T1", [MET(T1_TEST), DEFER(SCREEN)]);
    const mid = bugWorkStatus({ root: base.root, work: W });
    check("1 after T1, the next step is T2 — no verification is requested", mid.next_command?.args === "bug:BUG-43 T2" && mid.next_command.skill === `${PLUGIN_NAME}:implement-task`);
    const early = GEN(base);
    check("1 a checklist is never generated for an unfinished cycle", early?.ok === false && early.outcome === "CYCLE_INCOMPLETE" && early.next_command?.args === "bug:BUG-43 T2", JSON.stringify(early));
    check("1 …and nothing is written", !existsSync(artifact(base)));
    task(base, "T2", [MET(REPRO), MET("T1's test passes"), DEFER(SCREEN), DEFER(REMOVAL)], REG);
    const done = bugWorkStatus({ root: base.root, work: W });
    check("2/6 after the last task, the next step is the cycle's verification", done.next_command?.skill === `${PLUGIN_NAME}:verify-fix-cycle` && done.next_command.args === "bug:BUG-43", JSON.stringify(done.next_command));
  }
  const g = GEN(base);
  const text = existsSync(artifact(base)) ? readFileSync(artifact(base), "utf-8") : "";
  {
    check("6 one checklist is generated for the cycle", g?.ok === true && g.outcome === "VERIFICATION_GENERATED", JSON.stringify(g));
    check("15 the artifact path is docs/bugs/<key>/verification-c<n>.md", g?.path === "docs/bugs/BUG-43/verification-c1.md" && existsSync(artifact(base)));
    check("16/17 it carries the bug key and the fix cycle", /\nbug_key: BUG-43\n/.test(text) && /\nfix_cycle: 1\n/.test(text));
    const items = g?.items ?? [];
    const repro = items[0];
    check("7 the reported reproduction path is always the first item", repro?.kind === "reproduction" && /add an item to the cart; apply coupon SAVE10; open checkout/.test(repro.detail.join("\n")), JSON.stringify(repro));
    check("9 the Verification Strategy's reproduction path is part of it", /add an item, apply SAVE10, open checkout/.test(repro?.detail.join("\n") ?? ""));
    check("9 the Verification Strategy is carried into the artifact", text.includes("## Verification Strategy") && text.includes("`CheckoutTotalsTest.couponIsApplied` — fails before the fix, passes after."));
    const screen = items.filter((i: any) => i.title === SCREEN);
    check("11 the same manual criterion from T1 and T2 becomes one item", screen.length === 1 && JSON.stringify(screen[0].sources) === '["T1","T2"]', JSON.stringify(screen));
    check("12 a distinct criterion is kept", items.some((i: any) => i.title === REMOVAL));
    check("12 met (automated) criteria are not manual items", !items.some((i: any) => i.title === T1_TEST || i.title === "T1's test passes"));
    check("13 affected surfaces are carried", JSON.stringify(g?.surfaces) === '["android"]' && text.includes("## Affected surfaces"));
    check("14 the automated summary lists each check once", (g?.automated ?? []).filter((a: any) => a.command === CMD).length === 1 && g.automated.some((a: any) => a.command === LINT && a.result === "pass"));
    check("14 …and the regression test", /Regression test `\.\/gradlew test --tests CheckoutTotalsTest` — failed before the fix, passes after/.test(text));
    check("the artifact has the developer-facing sections", ["## Bug", "## What changed", "## Automated checks already completed", "## Manual verification checklist", "## Expected result", "## Affected surfaces", "## Known verification debt", "## Result"].every((h) => text.includes(h)));
    check("35 no per-task verification instructions — the checklist is per cycle", !/Verify T1|Verify T2|### T1|### T2/.test(text));
    check("generation is deterministic", (() => { const again = GEN(base); return again.outcome === "VERIFICATION_CURRENT" && readFileSync(artifact(base), "utf-8") === text; })());
    check("10/8 cycle 1 has no failed-re-test or delta item", !items.some((i: any) => i.kind === "failed-retest" || i.kind === "verification-delta"));
    const c = CHK(base);
    check("a fresh checklist with no results is incomplete, and resumes at the verification command", c?.status === "incomplete" && c.next_command?.skill === `${PLUGIN_NAME}:verify-fix-cycle`, JSON.stringify(c));
  }

  /* ── 18–23. results, partial runs and resume ──────────────────────────── */
  {
    const ps = pairs(g);
    const first = REC(base, [{ ...ps[0], result: "pass", notes: "no longer reproduces", evidence: "video/repro.mp4" }]);
    check("18 a pass is recorded", first?.ok === true && CHK(base).counts.pass === 1, JSON.stringify(first));
    check("18 the artifact records the result with its notes and evidence", /\| V1 \| android \| pass \| no longer reproduces \| video\/repro\.mp4 \|/.test(readFileSync(artifact(base), "utf-8")));
    check("22 a partial run stays incomplete", CHK(base).status === "incomplete");
    check("23 on resume, a fresh pass is kept", GEN(base).outcome === "VERIFICATION_CURRENT" && CHK(base).results[`${ps[0].id}@${ps[0].surface}`].result === "pass");
    REC(base, [{ ...ps[1], result: "not_run" }]);
    check("21 not_run is recorded and keeps the cycle incomplete", CHK(base).status === "incomplete" && CHK(base).counts.not_run === 1);
    REC(base, [{ ...ps[1], result: "blocked", notes: "no tablet available" }]);
    check("20 blocked is recorded and keeps the cycle incomplete", CHK(base).status === "incomplete" && CHK(base).counts.blocked === 1);
    check("an unknown item or surface is refused", REC(base, [{ id: "V99", surface: "android", result: "pass" }])?.ok === false && REC(base, [{ id: ps[0].id, surface: "ios", result: "pass" }])?.ok === false);
    check("an unknown result is refused", REC(base, [{ ...ps[0], result: "passed" }])?.ok === false);
    check("a failure must say where it goes back to", REC(base, [{ ...ps[1], result: "fail" }])?.ok === false);
    const fail = REC(base, [{ ...ps[1], result: "fail", notes: "total wrong after rotation", route: "implementation", task: "T2" }]);
    const fc = CHK(base);
    check("19 a fail is recorded, and the cycle is failed", fail?.ok === true && fc.status === "failed" && fc.failed.length === 1 && fc.failed[0].id === ps[1].id, JSON.stringify(fc.failed));
    check("12-fail an implementation defect routes back to its task", fc.next_command?.skill === `${PLUGIN_NAME}:implement-task` && fc.next_command.args === "bug:BUG-43 T2");
    REC(base, [{ ...ps[1], result: "fail", route: "replan" }]);
    check("12-fail a design failure routes to /analyze-bug, with nothing to chain", CHK(base).route === "/analyze-bug <bug-ref>" && CHK(base).next_command === undefined);
    check("12-fail no new fix cycle is created", !/### Cycle 2/.test(readFileSync(base.plan, "utf-8").replace(/<!--[\s\S]*?-->/g, "")));
    const rv = reviewContext({ root: base.root, work: W });
    check("29 a failed required item blocks review", rv.ok === false && rv.outcome === "BUG_VERIFICATION_REQUIRED" && rv.next_command?.skill === `${PLUGIN_NAME}:verify-fix-cycle`, JSON.stringify(rv));
    REC(base, [{ ...ps[1], result: "blocked" }]);
    check("30 a blocked required item blocks review", reviewContext({ root: base.root, work: W }).outcome === "BUG_VERIFICATION_REQUIRED");
    REC(base, [{ ...ps[1], result: "not_run" }]);
    check("31 a not_run required item blocks review", reviewContext({ root: base.root, work: W }).outcome === "BUG_VERIFICATION_REQUIRED");
    const hk = handoffCheck({ root: base.root, work: W, qaRepo: QA });
    check("34 the QA handoff is blocked without a passed verification", hk.ok === false && hk.checks.find((c: any) => c.id === "R10")?.status === "block", JSON.stringify(hk.checks?.find((c: any) => c.id === "R10")));
    const ok = REC(base, all(g, "pass"));
    const pc = CHK(base);
    check("32 every required item passing makes the cycle verified", ok?.ok === true && pc.status === "passed", JSON.stringify(pc));
    check("43 the next command is the qualified review", JSON.stringify(pc.next_command) === JSON.stringify({ skill: `${PLUGIN_NAME}:review-code`, args: "--bug BUG-43", display: "/review-code --bug BUG-43" }));
    check("33 review proceeds once the cycle is verified", reviewContext({ root: base.root, work: W }).outcome === "BUG_REVIEW_READY");
    check("the artifact records every result", pairs(g).every((p) => readFileSync(artifact(base), "utf-8").includes(`| ${p.id} | ${p.surface} | pass |`)));
    check("a hand-edited artifact is invalid", (() => { const t = readFileSync(artifact(base), "utf-8"); writeFileSync(artifact(base), t.replace("| fail |", "| pass |").replace("status: passed", "status: passed ")); const s = CHK(base).status; writeFileSync(artifact(base), t); return s === "invalid"; })());
  }

  /* ── 34, 36, 37. the QA handoff consumes it ───────────────────────────── */
  {
    const r = repo();
    implemented(r, { debt: true });
    const gv = GEN(r);
    check("37 VERIFY-4 developer debt is listed in the checklist", gv.developer_debt.length === 1 && readFileSync(artifact(r), "utf-8").includes("Rotation on a low-memory device"));
    REC(r, all(gv, "pass"));
    check("37 outstanding developer debt must be accepted explicitly", CHK(r).status === "incomplete" && CHK(r).reasons.some((x: any) => x.code === "DEBT_NOT_ACCEPTED"));
    REC(r, [], { acceptDebt: true });
    check("37 …then the cycle is verified", CHK(r).status === "passed");
    const ctx = reviewContext({ root: r.root, work: W });
    const f = join(TMP, `review-${++n}.json`);
    writeFileSync(f, JSON.stringify({ binding: ctx.binding, reviewed_by: "code-reviewer (android)", generated_at: "2026-10-12T09:00:00Z", findings: [], checks: ["root-cause", "reproduction-path", "plan-conformance", "regression-risk"].map((id) => ({ id, status: "pass", note: "ok" })) }));
    check("review records after verification", writeReviewRecord({ root: r.root, work: W, review: f }).ok === true);
    check("recording the review leaves the verification fresh", CHK(r).status === "passed");
    const hk = handoffCheck({ root: r.root, work: W, qaRepo: QA });
    check("34 the QA handoff passes R10 on a fresh, passed verification", hk.checks.find((c: any) => c.id === "R10")?.status === "pass" && hk.ok === true, JSON.stringify(hk.blockers));
    const bi = join(TMP, `build-${++n}.md`);
    writeFileSync(bi, "### android\n\nInstall the CI build.\n");
    const gh = generateHandoff({ root: r.root, work: W, qaRepo: QA, date: "2026-10-12", buildInstructions: bi });
    const h = existsSync(join(r.root, "docs/qa/bug-BUG-43-qa-handoff.md")) ? readFileSync(join(r.root, "docs/qa/bug-BUG-43-qa-handoff.md"), "utf-8") : "";
    const dv = h.split("## Developer Verification")[1]?.split("\n## ")[0] ?? "";
    check("34 Developer Verification shows the consolidated result and its artifact", gh.ok === true && dv.includes("docs/bugs/BUG-43/verification-c1.md") && /Consolidated manual verification: passed/.test(dv), dv);
    check("34 …the surfaces verified", /Surfaces verified: android/.test(dv));
    check("36 …the automated developer-testing evidence and the regression", dv.includes(`\`${CMD}\``) && /regression/.test(dv));
    check("37 …and the VERIFY-4 developer debt", h.includes("Rotation on a low-memory device"));
    check("35 the handoff carries no per-task how-to-verify instructions", !/how to verify/i.test(h));
    check("recording verification again changes the handoff's inputs", (() => { REC(r, [{ id: "V1", surface: "android", result: "pass", notes: "re-checked" }]); return handoffCheck({ root: r.root, work: W, qaRepo: QA }).checks.find((c: any) => c.id === "R8")?.status === "generate"; })());
  }

  /* ── 24–28. freshness ─────────────────────────────────────────────────── */
  const verified = (plan = PLAN1) => {
    const r = repo(plan);
    implemented(r);
    REC(r, all(GEN(r), "pass"));
    if (CHK(r).status !== "passed") throw new Error(`verified fixture: ${JSON.stringify(CHK(r))}`);
    return r;
  };
  {
    const r = verified();
    writeFileSync(join(r.root, MAIN), "fun total() = 0 // edited after verification\n");
    const c = CHK(r);
    check("24 a code change makes verification stale", c.status === "stale" && c.stale_reasons.includes("CODE_CHANGED"), JSON.stringify(c));
    check("24 …and review is blocked", reviewContext({ root: r.root, work: W }).outcome === "BUG_VERIFICATION_REQUIRED");
    const again = GEN(r);
    check("24 regenerating a stale checklist starts a new run with no results", again.outcome === "VERIFICATION_REGENERATED" && JSON.stringify(again.stale_reasons) === '["CODE_CHANGED"]' && CHK(r).counts.pass === 0);
    check("recording against a stale checklist is refused", (() => { writeFileSync(join(r.root, MAIN), "fun total() = 1\n"); return REC(r, [{ id: "V1", surface: "android", result: "pass" }])?.ok === false; })());
  }
  {
    const r = verified();
    writeFileSync(r.plan, readFileSync(r.plan, "utf-8").replace("cart badge, tax rounding", "cart badge, tax rounding, analytics"));
    check("25 a plan change makes verification stale", CHK(r).status === "stale" && CHK(r).stale_reasons.includes("PLAN_CHANGED"), JSON.stringify(CHK(r)));
  }
  {
    const r = verified();
    writeTaskState(r.root, W, "T2", "in-progress", { platform: "android" } as any, r.plan, { mode: "start" });
    check("26 a task-state change makes verification stale", CHK(r).status === "stale" && CHK(r).stale_reasons.includes("TASK_STATE_CHANGED"), JSON.stringify(CHK(r)));
  }
  {
    const r = verified();
    writeFileSync(r.plan, PLAN2);
    approveWorkPackage(r.plan, { by: "dana" });
    const c1 = CHK(r, { cycle: 1 });
    check("27 a cycle change makes the cycle-1 verification stale", c1.status === "stale" && c1.stale_reasons.includes("CYCLE_CHANGED"), JSON.stringify(c1));
    const c2 = CHK(r);
    check("28 cycle 1's verification never satisfies cycle 2", c2.status === "missing" && c2.path === "docs/bugs/BUG-43/verification-c2.md" && c2.fix_cycle === 2);
    writeFileSync(artifact(r, 2), readFileSync(artifact(r, 1)));
    check("28 a cycle-1 artifact copied to the cycle-2 path is invalid, never passed", CHK(r).status === "invalid", JSON.stringify(CHK(r).status));
    rmSync(artifact(r, 2));
    task(r, "C2-T1", [MET("The test fails on atv-202's code path")]);
    task(r, "C2-T2", [MET("C2-T1's test passes"), MET("cycle 1 tests still pass")]);
    const g2 = GEN(r);
    check("17 cycle 2 has its own artifact", g2?.ok === true && g2.path === "docs/bugs/BUG-43/verification-c2.md" && existsSync(artifact(r, 2)) && existsSync(artifact(r, 1)), JSON.stringify(g2));
    const fr = (g2?.items ?? []).find((i: any) => i.kind === "failed-retest");
    check("8 cycle 2 includes the QA re-test that failed the previous fix", fr !== undefined && /Still frozen after resume from Home/.test(fr.detail.join("\n")) && /atv-202/.test(fr.title + fr.detail.join("\n")));
    check("8 …on the surface it failed on", JSON.stringify(fr?.surfaces) === '["android-tv"]');
    check("10 cycle 2 includes its verification delta", (g2?.items ?? []).some((i: any) => i.kind === "verification-delta" && /mandatory acceptance evidence/.test(i.detail.join("\n"))));
    check("7 cycle 2 still includes the original reproduction path", g2?.items?.[0]?.kind === "reproduction");
    check("13 a surface QA failed on is added to the surfaces to verify", JSON.stringify(g2?.surfaces) === '["android","android-tv"]');
  }
  {
    const r = repo(PLAN_TWO_SURFACES);
    implemented(r);
    const g2 = GEN(r);
    check("13 every item is verified on every affected surface — one never proves another", pairs(g2).length === (g2?.items ?? []).length * 2 && (g2?.items ?? []).every((i: any) => JSON.stringify(i.surfaces) === '["android","android-tv"]'));
    REC(r, pairs(g2).filter((p) => p.surface === "android").map((p) => ({ ...p, result: "pass" })));
    check("13 passing on android alone does not verify android-tv", CHK(r).status === "incomplete");
    check("13 the checklist groups items by surface", /### android\n[\s\S]*### android-tv\n/.test(readFileSync(artifact(r), "utf-8")));
  }

  /* ── 38–45. boundaries ────────────────────────────────────────────────── */
  {
    const src = read("scripts/bug-verification.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("38/39 the helper never writes a QA repository or Inspector artifacts", !/qa-ledger|\.ono\b|inspector/i.test(src));
    check("42 the helper never commits", !/["'](commit|push|merge)["']/.test(src));
    check("the helper reads no clock", !/\bnew Date\b|\bDate\.now\b|\bMath\.random\b/.test(src));
    const PINS: Record<string, string> = {
      "hooks/require-approval-before-code.sh": "f518c0e554ef7c660b16504cd44eb4e5065b1520b4f519c4e34169a743b77bd2",
      "scripts/edit-approval.ts": "f43451852dc4f4639a659fff6250765c23c1474e089d5cec049859d50ff7382b",
      "agents/feature-implementer.md": "d53845b5e31d2487754747f89227b0a54fa9d1ed457ae02934b593cce7576023",
    };
    for (const [f, h] of Object.entries(PINS)) check(`41 ${f} is unchanged (P0.3 and the shared implementer)`, sha(readFileSync(join(REPO_ROOT, f))) === h);
    const it = read("commands/implement-task.md");
    const bug = it.slice(it.indexOf("## 1a. Bug work")).split("\n## 2. ")[0];
    const feature = it.slice(it.indexOf("\n## 2. "));
    check("1/2/35 /implement-task never asks for manual verification after a task", /deferred_to_cycle_verification/.test(bug) && /no manual verification (is|instructions are) (shown|requested|asked)[^.]*after (a|each) task/i.test(bug));
    check("19 output: automated testing complete, then one cycle verification", bug.includes("✓ Automated Developer Testing complete") && bug.includes("▸ Cycle <n> manual verification required") && /Run Fix Cycle <n> verification now\?/.test(bug));
    check("40 /implement-task's feature sections are untouched by the deferral", !/deferred_to_cycle_verification|verify-fix-cycle/.test(feature));
    const v = read("commands/verify-fix-cycle.md");
    check("10 the verification command asks once, then walks the whole checklist", /Run Fix Cycle <n> verification now\?/.test(v) && /one session/i.test(v) && /scripts\/bug-verification\.ts" record/.test(v));
    check("19 the verification command reports the verified cycle and offers the review", v.includes("✓ Fix Cycle <n> verified") && /Review the fix\?/.test(v));
    check("44 chaining to review needs an explicit yes, through the qualified next command", /only on an explicit yes/i.test(v) && /Skill tool with `skill` set to `next_command\.skill` and `args` set to `next_command\.args`, verbatim/.test(v) && /show `next_command\.display`/.test(v));
    check("12 a failed verification creates no fix cycle", /never (creates|appends) a (new )?(QA )?fix cycle/i.test(v));
    check("42 no automatic commit", /never creates a git commit/i.test(v));
    check("33 /review-code --bug names the verification gate", /BUG_VERIFICATION_REQUIRED/.test(read("commands/review-code.md")));
    check("34 /create-dev-qa-notes names the verification route", /\/verify-fix-cycle/.test(read("commands/create-dev-qa-notes.md")));
    check("the contract documents consolidated verification", /## Consolidated verification/.test(read("docs/bug-work-plan-contract.md")) && /deferred_to_cycle_verification/.test(read("docs/task-state-contract.md")));
    check("the suite is registered", read("scripts/check.ts").includes('"bug-verification"'));
    const qa = join(dirname(REPO_ROOT), "ono-plugin-qa");
    check("38 the QA plugin repository has no changes", !existsSync(qa) || git(qa, "status", "--porcelain") === "");
    const insp = join(dirname(REPO_ROOT), "ono-plugin-project-inspector");
    check("39 the Inspector repository has no changes", !existsSync(insp) || git(insp, "status", "--porcelain") === "");
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall bug-verification checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
