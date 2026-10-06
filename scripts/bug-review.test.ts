/**
 * bug-review.test.ts
 *
 * Pins Bug Development Flow Step 6: `/review-code --bug <bug_key>` reviews the current bug
 * fix with the existing review machinery and persists one minimal, deterministic review
 * record per fix cycle — docs/bugs/<bug_key>/review-c<fix_cycle>.md — bound to exactly what
 * was reviewed, with a read-only freshness verification for the later QA handoff gate.
 *
 *   node --no-warnings scripts/bug-review.test.ts
 */

import { execFileSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as Review from "./bug-review.ts";
import { approveWorkPackage } from "./work-approval.ts";
import { writeTaskState, stateFilePath } from "./task-state.ts";
import { splitDocument } from "./migrate-planning-doc.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const QA = join(HERE, "fixtures/qa-bugs/acme-qa");
const PLAN_FIXTURE = readFileSync(join(HERE, "fixtures/bug-work-plans/bwp-cycle1.md"), "utf-8");

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
const api = Review as any;
const show = (r: any) => JSON.stringify([r?.outcome ?? r?.status, r?.reason, r?.reasons]);
const W = "bug:BUG-43";
const REPRO = "The reported reproduction path no longer fails: with SAVE10 applied, checkout shows the discounted total";
const PLAN = PLAN_FIXTURE.replace("| T1 | S | T1's test passes; existing totals tests pass |", `| T1 | S | ${REPRO}; T1's test passes |`);
const MAIN = "app/src/main/java/com/acme/checkout/CheckoutTotals.kt";
const TEST = "app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt";
const CMD = "./gradlew test --tests CheckoutTotalsTest";

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "bug-review-")));
let n = 0;
function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf-8" }).trim();
}
/** A repository whose BUG-43 fix is implemented (uncommitted, as /implement-task leaves it) with both tasks complete. */
function repo(opts: { approve?: boolean; tasks?: boolean; plan?: string } = {}): { root: string; plan: string } {
  const root = join(TMP, `repo-${++n}`);
  const p = join(root, "docs/bugs/BUG-43/bug-work-plan.md");
  mkdirSync(dirname(p), { recursive: true });
  mkdirSync(join(root, dirname(MAIN)), { recursive: true });
  mkdirSync(join(root, dirname(TEST)), { recursive: true });
  writeFileSync(join(root, MAIN), "fun total() = 0\n");
  writeFileSync(join(root, TEST), "// tests\n");
  writeFileSync(p, opts.plan ?? PLAN);
  if (opts.approve !== false) approveWorkPackage(p, { by: "dana" });
  git(root, "init", "-q", "-b", "fix/bug-43");
  git(root, "config", "user.email", "t@t");
  git(root, "config", "user.name", "t");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "plan");
  // The fix, as /implement-task leaves it: in the working tree, task state recorded.
  writeFileSync(join(root, MAIN), "fun total() = discountedSubtotal()\n");
  writeFileSync(join(root, TEST), "// tests\n@Test fun couponIsApplied() {}\n");
  if (opts.tasks !== false) {
    const dt = { framework: "junit", required: true, testsChanged: [TEST], justification: null, runs: [{ command: CMD, result: "pass" }], notRunReason: null };
    writeTaskState(root, W, "T1", "in-progress", { platform: "android" } as any, p, { mode: "start" });
    writeTaskState(root, W, "T1", "complete", { platform: "android", filesChanged: [TEST], standardIds: [], validation: [{ command: CMD, result: "pass" }], acceptanceCriteria: [{ criterion: "The test fails on the current code for the documented reproduction", met: true }], developerTesting: dt, deviations: [], blockers: [] } as any, p);
    writeTaskState(root, W, "T2", "in-progress", { platform: "android" } as any, p, { mode: "start" });
    writeTaskState(root, W, "T2", "complete", { platform: "android", filesChanged: [MAIN], standardIds: [], validation: [{ command: CMD, result: "pass" }], acceptanceCriteria: [{ criterion: REPRO, met: true }, { criterion: "T1's test passes", met: true }], developerTesting: { ...dt, regression: { command: CMD, failedBefore: true, passesAfter: true } }, deviations: [], blockers: [] } as any, p);
  }
  return { root, plan: p };
}
const C = (root: string, work = W) => api.reviewContext?.({ root, work });
const V = (root: string, work = W) => api.verifyReviewRecord?.({ root, work });
/** A review result, as the merged review hands it to the record helper. */
function review(ctx: any, over: Record<string, unknown> = {}) {
  return {
    binding: ctx.binding,
    reviewed_by: "code-reviewer + performance-reviewer (android)",
    generated_at: "2026-10-06T12:00:00Z",
    findings: [
      { severity: "major", platform: "android", path: MAIN, line: 1, rule: "AND-ARCH-3", description: "Totals logic lives in the view model instead of the domain layer", remediation: "Move discountedSubtotal() into CheckoutTotalsUseCase" },
      { severity: "minor", platform: "android", path: TEST, line: 2, rule: "AND-TEST-2", description: "Test name does not state the expected outcome", remediation: "Rename to couponIsAppliedToTotal" },
      { severity: "nit", platform: "android", path: MAIN, line: 1, rule: "AND-STYLE-1", description: "Expression body hides the coupon branch", remediation: "Use a block body" },
      { severity: "major", platform: "android", path: "app/src/main/java/com/acme/cart/CartBadge.kt", line: 4, rule: "BUG-CHECK-SCOPE", description: "Cart badge changed although it is a Fix Design non-goal", remediation: "Revert CartBadge.kt or re-plan through /analyze-bug" },
    ],
    checks: [
      { id: "root-cause", status: "pass", note: "The total now reads the discounted subtotal named by the plan's root cause" },
      { id: "reproduction-path", status: "pass", note: "T2 regression test failed before the fix and passes after" },
      { id: "plan-conformance", status: "concern", note: "One change outside the minimal change surface" },
      { id: "regression-risk", status: "pass", note: "Only the checkout total; the cart badge is a separate subtotal" },
    ],
    ...over,
  };
}
function record(root: string, rev: unknown): any {
  const f = join(TMP, `review-${++n}.json`);
  writeFileSync(f, JSON.stringify(rev));
  return api.writeReviewRecord?.({ root, work: W, review: f });
}
const recordPath = (root: string, cycle = 1) => join(root, `docs/bugs/BUG-43/review-c${cycle}.md`);
const fm = (text: string): Record<string, string> => Object.fromEntries((splitDocument(Buffer.from(text)) as any).inner.map((l: string) => /^([a-z_]+): ?(.*)$/.exec(l)).filter(Boolean).map((m: any) => [m[1], m[2]]));

try {
  const qaSnap = sha(readdirSync(QA, { recursive: true } as any).sort().join("\n"));

  /* ── 2, 7–13. the review context ──────────────────────────────────────── */
  const base = repo();
  const ctx = C(base.root);
  {
    check("2 --bug resolves the current Bug Work Plan", ctx?.ok === true && ctx.outcome === "BUG_REVIEW_READY" && ctx.plan_path === "docs/bugs/BUG-43/bug-work-plan.md" && ctx.fix_cycle === 1, show(ctx));
    check("7 the review receives Root Cause", /discounted subtotal is computed but never read/.test(ctx?.context?.root_cause ?? ""));
    check("8 the review receives Fix Design", /Minimal change surface/.test(ctx?.context?.fix_design ?? "") && ctx.context.minimal_change_surface === "one function in `CheckoutTotals.kt` and its unit test.");
    check("9 the review receives the non-goals", ctx?.context?.non_goals === "coupon validation, cart badge, tax rounding.");
    check("10 the review receives the reproduction evidence", /apply coupon SAVE10/i.test(ctx?.context?.reproduction ?? "") && /Total shows the full price/.test(ctx.context.observed_vs_expected));
    check("11 the review receives the Developer Testing evidence from task state",
      ctx?.tasks?.length === 2 && ctx.tasks.find((t: any) => t.id === "T2")?.developerTesting?.regression?.failedBefore === true && ctx.tasks.find((t: any) => t.id === "T2").state === "complete", JSON.stringify(ctx?.tasks?.map((t: any) => [t.id, t.state])));
    check("11 …and each task's row and acceptance criteria", ctx?.tasks?.find((t: any) => t.id === "T2")?.cells?.["acceptance criteria"]?.startsWith("The reported reproduction path no longer fails"));
    check("12 the first-degree context is the plan's own Blast Radius and capability", /cart badge reads a separate subtotal/.test(ctx?.context?.blast_radius ?? "") && "capability" in (ctx?.context?.bug ?? {}) && JSON.stringify(ctx.context.bug.surfaces) === '["android"]');
    check("12 the Repo Knowledge reference is passed", typeof ctx?.context?.repo_knowledge_reference === "string" && ctx.context.repo_knowledge_reference.length > 0);
    const src = read("scripts/bug-review.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("13 no Project Knowledge graph is read or expanded", !/read-repo-knowledge|repo-knowledge\.json|\.ono\b|capabilityRelationships/.test(src));
    check("the review does not re-read QA state", !/lookupQaBug|runIntake|bug-intake|qa-repo/.test(src));
    check("the binding names exactly what is reviewed", ctx?.binding?.fix_cycle === 1 && ctx.binding.reviewed_head === git(base.root, "rev-parse", "HEAD") &&
      /^sha256:[0-9a-f]{64}$/.test(ctx.binding.reviewed_tree_fingerprint) && /^sha256:[0-9a-f]{64}$/.test(ctx.binding.bug_work_plan_fingerprint) && /^sha256:[0-9a-f]{64}$/.test(ctx.binding.task_state_fingerprint), JSON.stringify(ctx?.binding));
    check("the context reports the record path", ctx?.record_path === "docs/bugs/BUG-43/review-c1.md");
    check("the plan's root cause is evidence-labelled, so a definite root-cause verdict is allowed", ctx?.context?.root_cause_inference === false);
  }

  /* ── 3–6. what blocks a bug review ─────────────────────────────────────── */
  {
    const empty = join(TMP, "empty");
    mkdirSync(empty, { recursive: true });
    check("3 an unknown bug is blocked", C(empty, "bug:BUG-99")?.outcome === "BUG_PLAN_MISSING");
    check("3 a work id without bug: is refused", C(empty, "BUG-43")?.outcome === "BUG_WORK_ID_INVALID" && C(empty, "bug:../x")?.outcome === "BUG_WORK_ID_INVALID");
    const inv = repo({ plan: PLAN.replace("## Root Cause\n", "## Cause\n"), approve: false, tasks: false });
    check("4 an invalid plan is blocked", C(inv.root)?.outcome === "BUG_PLAN_INVALID");
    const draft = repo({ approve: false, tasks: false });
    check("5 an unapproved plan is blocked", C(draft.root)?.outcome === "BUG_PLAN_NOT_APPROVED");
    const stale = repo();
    writeFileSync(stale.plan, readFileSync(stale.plan, "utf-8").replace("the discounted subtotal is computed but never read.", "the coupon is dropped."));
    check("5 a stale approval is blocked", C(stale.root)?.outcome === "BUG_APPROVAL_STALE");
    const noState = repo({ tasks: false });
    const ns = C(noState.root);
    check("6 current-cycle task state is required", ns?.outcome === "BUG_TASK_STATE_MISSING" && /\/implement-task bug:BUG-43/.test(ns.route ?? ""), show(ns));
    const other = repo({ tasks: false });
    mkdirSync(dirname(stateFilePath(other.root, W)), { recursive: true });
    writeFileSync(stateFilePath(other.root, W), JSON.stringify({ taskStateSchemaVersion: 1, feature: W, producedBy: { plugin: "x", version: "0" }, tasks: { T9: { state: "complete" } } }));
    check("6 task state that records no task of this cycle is not enough", C(other.root)?.outcome === "BUG_TASK_STATE_MISSING");
    const c2 = readFileSync(join(HERE, "fixtures/bug-work-plans/bwp-cycle2.md"), "utf-8").replace(/BUG-44/g, "BUG-43");
    const cyc = repo({ plan: c2, tasks: false });
    check("38 a plan at a later fix cycle is not reviewed here (no reopened-cycle behavior)", C(cyc.root)?.outcome === "BUG_CYCLE_UNSUPPORTED");
  }

  /* ── 14–27. the record ────────────────────────────────────────────────── */
  const stateBefore = readFileSync(stateFilePath(base.root, W));
  const w = record(base.root, review(ctx));
  const text = existsSync(recordPath(base.root)) ? readFileSync(recordPath(base.root), "utf-8") : "";
  const f = fm(text);
  {
    check("14 the record is written at docs/bugs/<key>/review-c<cycle>.md", w?.ok === true && w.record_path === "docs/bugs/BUG-43/review-c1.md" && text.length > 0, show(w));
    check("14 its frontmatter is the minimal machine-readable set", JSON.stringify(Object.keys(f)) === JSON.stringify(["review_schema", "work_type", "bug_key", "fix_cycle", "reviewed_head", "reviewed_tree_fingerprint", "bug_work_plan_fingerprint", "task_state_fingerprint", "findings_fingerprint", "blocking_count", "major_count", "minor_count", "nit_count", "reviewed_by", "generated_at"]), JSON.stringify(Object.keys(f)));
    check("15 bug_key", f.review_schema === "1" && f.work_type === "bug" && f.bug_key === "BUG-43");
    check("16 fix_cycle", f.fix_cycle === "1");
    check("17 reviewed_head is the current HEAD", f.reviewed_head === git(base.root, "rev-parse", "HEAD"));
    check("18 the plan fingerprint is the approved plan's", f.bug_work_plan_fingerprint === ctx.binding.bug_work_plan_fingerprint && f.bug_work_plan_fingerprint === fm(readFileSync(base.plan, "utf-8")).approved_fingerprint);
    check("19 the task-state fingerprint is captured", f.task_state_fingerprint === ctx.binding.task_state_fingerprint);
    check("21 blocking count", f.blocking_count === "0");
    check("22 major count (the scope deviation is a major finding too)", f.major_count === "2");
    check("23 minor and nit counts", f.minor_count === "1" && f.nit_count === "1");
    check("reviewer and time are recorded as given", f.reviewed_by === "code-reviewer + performance-reviewer (android)" && f.generated_at === "2026-10-06T12:00:00Z");
    const sections = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    check("5 the body has the required sections, in order", JSON.stringify(sections) === JSON.stringify(["Review Summary", "Blocking Findings", "Major Findings", "Other Findings", "Bug-specific Checks", "Verification Evidence", "Scope Deviations"]), JSON.stringify(sections));
    check("24 findings keep the existing `[platform] file:line` — [standard ID] description — remediation form",
      text.includes(`- \`[android] ${MAIN}:1\` — [AND-ARCH-3] Totals logic lives in the view model instead of the domain layer — Move discountedSubtotal() into CheckoutTotalsUseCase`));
    check("24 empty severity sections read None.", /## Blocking Findings\n\nNone\./.test(text));
    check("25 the root-cause check is represented", /\| root-cause \| pass \| The total now reads/.test(text));
    check("26 the reproduction-path check is represented", /\| reproduction-path \| pass \|/.test(text));
    check("27 the scope deviation is represented", /## Scope Deviations\n\n- `\[android\] app\/src\/main\/java\/com\/acme\/cart\/CartBadge\.kt:4` — \[BUG-CHECK-SCOPE\]/.test(text));
    check("11 verification evidence comes from task state", /## Verification Evidence[\s\S]*T2[\s\S]*regression `\.\/gradlew test --tests CheckoutTotalsTest` failed before the fix and passes after/.test(text));
    check("34 the review never writes task state", readFileSync(stateFilePath(base.root, W)).equals(stateBefore));
    check("33 the write is atomic — no temp file left behind", readdirSync(join(base.root, "docs/bugs/BUG-43")).sort().join(",") === "bug-work-plan.md,review-c1.md");
    const v = V(base.root);
    check("6 a just-written record verifies fresh", v?.status === "fresh" && v.ok === true, show(v));
  }

  /* ── 20, 28. determinism ──────────────────────────────────────────────── */
  {
    const fp = (fs: any[], checks?: any[]) => api.findingsFingerprint?.(fs, checks ?? review(ctx).checks);
    const r = review(ctx);
    check("20 the findings fingerprint is deterministic", fp(r.findings) === fp(structuredClone(r.findings)) && /^sha256:[0-9a-f]{64}$/.test(fp(r.findings)) && f.findings_fingerprint === fp(r.findings));
    check("20 ordering is canonicalized — the same findings in any order fingerprint the same", fp([...r.findings].reverse()) === fp(r.findings));
    check("20 whitespace in a finding is normalized", fp([{ ...r.findings[0], description: `  ${r.findings[0].description}  ` }, ...r.findings.slice(1)]) === fp(r.findings));
    check("20 a changed severity changes it", fp([{ ...r.findings[0], severity: "blocking" }, ...r.findings.slice(1)]) !== fp(r.findings));
    check("20 a changed check result changes it", fp(r.findings, r.checks.map((c: any) => (c.id === "regression-risk" ? { ...c, status: "concern" } : c))) !== fp(r.findings));
    check("20 a duplicate finding counts — findings are a multiset", fp([...r.findings, r.findings[2]]) !== fp(r.findings));
    check("20 time and reviewer never enter it", !/generated_at|reviewed_by/.test(read("scripts/bug-review.ts").slice(read("scripts/bug-review.ts").indexOf("export function findingsFingerprint"), read("scripts/bug-review.ts").indexOf("export function findingsFingerprint") + 900)));
    const again = record(base.root, review(ctx, { generated_at: "2026-10-07T09:30:00Z", reviewed_by: "code-reviewer (android)", findings: [...review(ctx).findings].reverse() }));
    const text2 = readFileSync(recordPath(base.root), "utf-8");
    const strip = (t: string) => t.replace(/^generated_at: .*$/m, "").replace(/^reviewed_by: .*$/m, "");
    check("28 a second review of the same unchanged state is identical except reviewer and time", again?.ok === true && strip(text2) === strip(text) && text2 !== text, show(again));
    check("8 a new review of the same cycle replaces the record", fm(text2).generated_at === "2026-10-07T09:30:00Z");
    record(base.root, review(ctx));
  }

  /* ── 29–32. freshness ─────────────────────────────────────────────────── */
  {
    const r1 = repo();
    record(r1.root, review(C(r1.root)));
    check("29 fresh before any change", V(r1.root)?.status === "fresh");
    mkdirSync(join(r1.root, "docs/qa"), { recursive: true });
    writeFileSync(join(r1.root, "docs/qa/bug-BUG-43-qa-handoff.md"), "---\nwork_type: bug\n---\n");
    check("29 writing the bug's QA handoff never makes its review stale (downstream, not reviewed code)", V(r1.root)?.status === "fresh");
    writeFileSync(join(r1.root, "docs/qa/checkout-qa-handoff.md"), "feature handoff\n");
    check("29 …while any other repository change still does", V(r1.root)?.status === "stale");
    rmSync(join(r1.root, "docs/qa/checkout-qa-handoff.md"));
    writeFileSync(join(r1.root, MAIN), "fun total() = discountedSubtotal() + 0\n");
    const s1 = V(r1.root);
    check("29 an uncommitted code change makes the record stale", s1?.status === "stale" && s1.reasons.some((x: any) => x.code === "REVIEW_CODE_CHANGED"), show(s1));
    writeFileSync(join(r1.root, MAIN), "fun total() = discountedSubtotal()\n");
    check("29 …and restoring the reviewed content makes it fresh again", V(r1.root)?.status === "fresh");
    git(r1.root, "add", "-A");
    git(r1.root, "commit", "-qm", "fix BUG-43");
    const committed = V(r1.root);
    check("29 committing exactly the reviewed content keeps it fresh (and says HEAD moved)", committed?.status === "fresh" && committed.head_moved === true, show(committed));
    writeFileSync(join(r1.root, MAIN), "fun total() = 1\n");
    git(r1.root, "commit", "-qam", "later change");
    const s2 = V(r1.root);
    check("29 a code change in a new HEAD makes it stale", s2?.status === "stale" && s2.reasons.some((x: any) => x.code === "REVIEW_CODE_CHANGED"), show(s2));

    const r2 = repo();
    record(r2.root, review(C(r2.root)));
    writeFileSync(r2.plan, readFileSync(r2.plan, "utf-8").replace("- **Risks:** stacked coupons [inference]; covered by the regression test.", "- **Risks:** stacked coupons [inference]."));
    approveWorkPackage(r2.plan, { by: "dana" });
    const s3 = V(r2.root);
    check("30 a Bug Work Plan change (even re-approved) makes it stale", s3?.status === "stale" && s3.reasons.some((x: any) => x.code === "REVIEW_PLAN_CHANGED"), show(s3));
    const r2b = repo();
    record(r2b.root, review(C(r2b.root)));
    writeFileSync(r2b.plan, readFileSync(r2b.plan, "utf-8").replace("date: 2026-10-06", "date: 2026-10-08"));
    check("30 a plan change outside the approval contract does not", V(r2b.root)?.status === "fresh");
    writeFileSync(r2b.plan, readFileSync(r2b.plan, "utf-8").replace("the discounted subtotal is computed but never read.", "edited without approval."));
    const unapproved = V(r2b.root);
    check("30 a plan whose approval went stale makes it stale", unapproved?.status === "stale" && unapproved.reasons.some((x: any) => x.code === "REVIEW_PLAN_NOT_APPROVED"), show(unapproved));

    const r3 = repo();
    record(r3.root, review(C(r3.root)));
    writeTaskState(r3.root, W, "T1", "in-progress", { platform: "android" } as any, r3.plan, { mode: "restart" });
    const s4 = V(r3.root);
    check("31 a task-state change makes it stale", s4?.status === "stale" && s4.reasons.some((x: any) => x.code === "REVIEW_TASK_STATE_CHANGED"), show(s4));

    const r4 = repo();
    record(r4.root, review(C(r4.root)));
    const body = readFileSync(recordPath(r4.root), "utf-8");
    writeFileSync(recordPath(r4.root), body.replace("fix_cycle: 1", "fix_cycle: 2"));
    const s5 = V(r4.root);
    check("32 a record for another fix cycle cannot stand for this one", s5?.status !== "fresh" && s5.reasons.some((x: any) => x.code === "REVIEW_CYCLE_MISMATCH"), show(s5));
    writeFileSync(recordPath(r4.root), body.replace("- `[android] app/src/test", "- `[android] app/src/other"));
    const tampered = V(r4.root);
    check("a hand-edited finding is detected (findings fingerprint)", tampered?.status === "invalid" && tampered.reasons.some((x: any) => x.code === "REVIEW_RECORD_INCONSISTENT"), show(tampered));
    writeFileSync(recordPath(r4.root), body.replace("major_count: 2", "major_count: 1"));
    check("21–23 counts that disagree with the findings are detected", V(r4.root)?.status === "invalid");
    const c2plan = readFileSync(join(HERE, "fixtures/bug-work-plans/bwp-cycle2.md"), "utf-8").replace(/BUG-44/g, "BUG-43");
    const later = repo({ plan: c2plan, tasks: false });
    writeFileSync(recordPath(later.root), body);
    const lv = V(later.root);
    check("32 a plan at cycle 2 never reuses the cycle-1 record — it looks for review-c2.md", lv?.status === "missing" && lv.record_path === "docs/bugs/BUG-43/review-c2.md", show(lv));
    rmSync(recordPath(r4.root));
    check("no record → missing", V(r4.root)?.status === "missing");
    check("verification is read-only", !existsSync(recordPath(r4.root)));
  }

  /* ── record input validation ─────────────────────────────────────────── */
  {
    const r = repo();
    const c = C(r.root);
    const refused = (over: Record<string, unknown>, code: string, what: string) => {
      const out = record(r.root, review(c, over));
      check(`record refuses ${what}`, out?.ok === false && out.code === code && !existsSync(recordPath(r.root)), show(out));
    };
    refused({ findings: [{ ...review(c).findings[0], severity: "critical" }] }, "INVALID_FINDING", "an unknown severity");
    refused({ findings: [{ ...review(c).findings[0], rule: "" }] }, "INVALID_FINDING", "a finding without its standard ID");
    refused({ findings: [{ ...review(c).findings[0], remediation: "" }] }, "INVALID_FINDING", "a finding without remediation");
    refused({ findings: [{ ...review(c).findings[0], description: "a — b" }] }, "INVALID_FINDING", "a finding the record could not read back");
    refused({ checks: review(c).checks.slice(1) }, "INVALID_CHECKS", "a missing bug-specific check");
    refused({ checks: review(c).checks.map((x: any) => (x.id === "plan-conformance" ? { ...x, status: "pass" } : x)) }, "INVALID_CHECKS", "a passing check that still has findings filed against it");
    refused({ reviewed_by: "" }, "INVALID_ARGUMENT", "a missing reviewer");
    refused({ generated_at: "yesterday" }, "INVALID_ARGUMENT", "a non-UTC timestamp");
    const moved = { ...c.binding, reviewed_tree_fingerprint: `sha256:${"0".repeat(64)}` };
    refused({ binding: moved }, "REVIEW_STATE_MOVED", "a review whose reviewed state is no longer current");
    // Reproduction path: a pass needs regression or VERIFY-4 evidence in task state.
    const noReg = repo({ tasks: false });
    const p = noReg.plan;
    const dt = { framework: "junit", required: true, testsChanged: [TEST], justification: null, runs: [{ command: CMD, result: "pass" }], notRunReason: null };
    writeTaskState(noReg.root, W, "T2", "in-progress", { platform: "android" } as any, p, { mode: "start" });
    writeTaskState(noReg.root, W, "T2", "blocked", { platform: "android", developerTesting: dt, blockers: ["waiting"] } as any, p);
    const cn = C(noReg.root);
    const passRepro = record(noReg.root, review(cn));
    check("26 a reproduction-path pass without regression evidence in task state is refused", passRepro?.ok === false && passRepro.code === "INVALID_CHECKS" && /reproduction-path/.test(passRepro.reason), show(passRepro));
    const honest = record(noReg.root, review(cn, { checks: review(cn).checks.map((x: any) => (x.id === "reproduction-path" ? { ...x, status: "not-verifiable", note: "No regression evidence recorded yet" } : x)) }));
    check("26 …recorded honestly as not-verifiable, it is accepted", honest?.ok === true, show(honest));
    // Root cause labelled [inference] in the plan: no definite verdict.
    const inferPlan = PLAN.replace("[evidence: app/src/main/java/com/acme/checkout/CheckoutTotals.kt] `total()` sums", "[inference] `total()` likely sums");
    const ri = repo({ plan: inferPlan });
    const ci = C(ri.root);
    check("25 an inference-only root cause is flagged to the review", ci?.context?.root_cause_inference === true);
    const certain = record(ri.root, review(ci));
    check("25 a definite root-cause pass on an [inference] root cause is refused", certain?.ok === false && certain.code === "INVALID_CHECKS" && /inference/.test(certain.reason), show(certain));
    check("25 …not-verifiable is accepted", record(ri.root, review(ci, { checks: review(ci).checks.map((x: any) => (x.id === "root-cause" ? { ...x, status: "not-verifiable", note: "Consistent with the inferred cause; not proven" } : x)) }))?.ok === true);
  }

  /* ── 1, 35–40. the command and everything that must not move ───────────── */
  {
    const cmd = read("commands/review-code.md");
    const body = cmd.slice(cmd.indexOf("\n---\n") + 5);
    check("1 /review-code without --bug is byte-identical: the original body is kept verbatim, first", sha(body.slice(0, 6053)) === "fa922cd35137f74ae2577e82965c6a7d36e383d591e696d1bb9515b139f4a5d7");
    const bug = body.slice(6053);
    check("1 the bug section applies only with --bug", /^\n## Bug review \(`--bug <bug_key>`\)\n/.test(bug) && /Without `--bug`, nothing in this section applies/.test(bug));
    check("argument-hint documents --bug", /^argument-hint: .*--bug <bug_key>/m.test(cmd));
    check("2 the bug section gathers context through the helper", bug.includes('scripts/bug-review.ts" context bug:<bug_key>') && bug.includes('scripts/bug-review.ts" record bug:<bug_key>'));
    for (const o of ["BUG_REVIEW_READY", "BUG_PLAN_MISSING", "BUG_PLAN_INVALID", "BUG_PLAN_NOT_APPROVED", "BUG_APPROVAL_STALE", "BUG_TASK_STATE_MISSING", "BUG_CYCLE_UNSUPPORTED"]) check(`the bug section handles ${o}`, bug.includes(`\`${o}\``));
    check("the bug section reuses the same agents, methodology and lanes — no bug review engine", bug.includes("`code-reviewer`") && bug.includes("`performance-reviewer`") && bug.includes("`platform-review`") && /steps 1–6 run as written/i.test(bug));
    check("13 the bug section keeps Project Knowledge to the plan's first-degree context", /first-degree/.test(bug) && /never expand/i.test(bug));
    check("37 the record does not approve a QA handoff — that decision belongs to a later step", /does not approve a QA handoff/i.test(bug) && !/create-dev-qa-notes/.test(bug));
    check("39 no automatic commit", /never creates? a git commit/i.test(bug) && /never writes task state/i.test(bug));
    const skill = read("skills/platform-review/SKILL.md");
    const bugSkill = skill.slice(skill.indexOf("## Bug review"));
    check("3 the shared review methodology carries the four bug checks", ["root-cause", "reproduction-path", "plan-conformance", "regression-risk"].every((c) => bugSkill.includes(`\`${c}\``)) && bugSkill.includes("BUG-CHECK-SCOPE"));
    check("3 …and no new platform standard", /not a platform standard/i.test(bugSkill) && !readdirSync(join(REPO_ROOT, "standards/shared")).some((s) => /bug/.test(s)));
    for (const l of ["rn-code-review", "ios-code-review", "android-code-review", "react-code-review"]) check(`the ${l} lane has no bug copy`, !/bug-review|BUG-CHECK/.test(read(`skills/${l}/SKILL.md`)));
    const PINNED: Record<string, string> = {
      "templates/code-review-template.md": "23621fd42028242e12a0abb28a3187f4114e21256d808b42a06174089215365b",
      "agents/code-reviewer.md": "290c5efae292e7190894713e34fe87cce0b4df0900c743997c4f02b4484c2752",
      "agents/performance-reviewer.md": "325982f461b1c538d917e50854c694c8611dffb902273feac06146e3717738ef",
      "skills/rn-code-review/SKILL.md": "441309e50840868519edfa701b5d969af00468df1ad4c4f9caa9d99073774b2c",
      "skills/ios-code-review/SKILL.md": "c645b6577094f31551d10181294740bf517a90a875b48b295fccf2d225a104fe",
      "skills/android-code-review/SKILL.md": "d438f1156092e8d9a81344b4be099ead575b3077a33395c10b9a44ef8f241e5f",
      "skills/react-code-review/SKILL.md": "361f52aa0f8c83d723cefea33841859133564c1c7567b3c8835971d12a677d4b",
      "commands/review-security.md": "a41cbc8446140875677105c09cf58a26e001cb2a557d1fc4a984ba083c75f8c7",
      "commands/implement-task.md": "6fa59fb5c05b0fd1ff7f2d15ae70302c2c010b5852d00e3e3c57f1deb6c8eaf1",
      "scripts/task-state.ts": "246d16e33f87534fc908538ab6c4deb49bc7d0df058a060f1c953a9bfda87cd3",
      // Step 7 extended /create-dev-qa-notes with bug:<key>; qa-handoff-gate.test.ts pins its feature body verbatim.
      "templates/qa-handoff-template.md": "3203b0e0ffd0a3e0c67044cc18dcdaf752047a2c61f1e5cd7538cf1b16cfb564",
      "commands/prepare-mobile-release.md": "7f7d431309a77e4af4f7485b236cf2205616f2afed3b06de94cf2a0acbf327e4",
    };
    for (const [file, h] of Object.entries(PINNED)) check(`34/37 ${file} is unchanged`, sha(readFileSync(join(REPO_ROOT, file))) === h);
    const src = read("scripts/bug-review.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("34 the helper never writes task state", !/writeTaskState|writeCheckpoint|abandonTask/.test(src));
    check("35 no QA repository access", !/qa-ledger|ono-plugin-qa/.test(src) && sha(readdirSync(QA, { recursive: true } as any).sort().join("\n")) === qaSnap);
    check("36 no Inspector access", !/project-inspector|\.ono\b/.test(src));
    check("39 the helper never commits or runs a process", !/child_process|execFile|spawn/.test(src));
    check("the helper writes only the record, atomically", (src.match(/writeFileSync\(/g) ?? []).length === 1 && (src.match(/renameSync\(/g) ?? []).length === 1);
    check("the helper reads no clock", !/new Date|Date\.now|Math\.random|randomUUID/.test(src));
    check("38 no reopened-cycle behavior", !/Cycle 2|C2-T/.test(src));
    check("the suite is registered", read("scripts/check.ts").includes('"bug-review"'));
    const contract = read("docs/bug-work-plan-contract.md");
    check("the contract documents the review record", /review-c<fix_cycle>\.md/.test(contract) && /findings_fingerprint/.test(contract) && /reviewed_tree_fingerprint/.test(contract));
  }

  /* ── CLI ──────────────────────────────────────────────────────────────── */
  {
    const run = (args: string[]) => {
      const p = spawnSync(process.execPath, ["--no-warnings", join(HERE, "bug-review.ts"), ...args], { encoding: "utf-8" });
      try {
        return { code: p.status, json: JSON.parse(p.stdout) };
      } catch {
        return { code: p.status, json: null, raw: p.stdout + p.stderr };
      }
    };
    const r = repo();
    const c = run(["context", W, "--root", r.root]);
    check("CLI context prints one JSON object, exit 0", c.code === 0 && c.json?.outcome === "BUG_REVIEW_READY", JSON.stringify(c.json?.outcome ?? c.raw));
    const file = join(TMP, "cli-review.json");
    writeFileSync(file, JSON.stringify(review(c.json)));
    const w2 = run(["record", W, "--root", r.root, "--review", file]);
    check("CLI record writes the record", w2.code === 0 && w2.json?.ok === true && existsSync(recordPath(r.root)));
    check("CLI verify reports freshness", run(["verify", W, "--root", r.root]).json?.status === "fresh");
    check("CLI an unknown command is refused, exit 0", run(["frobnicate"]).code === 0 && run(["frobnicate"]).json?.ok === false);
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall bug-review checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
