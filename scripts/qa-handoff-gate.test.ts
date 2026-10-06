/**
 * qa-handoff-gate.test.ts
 *
 * Pins Bug Development Flow Step 7: `/create-dev-qa-notes bug:<bug_key>` produces a
 * first-class Bug QA handoff (docs/qa/bug-<bug_key>-qa-handoff.md), checks readiness R1–R9
 * deterministically, and moves it to `ready-for-qa` only through one explicit human approval
 * bound to the handoff body and its exact inputs — never by a manual status edit.
 *
 *   node --no-warnings scripts/qa-handoff-gate.test.ts
 */

import { execFileSync, spawnSync } from "child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as Gate from "./qa-handoff-gate.ts";
import { approveWorkPackage } from "./work-approval.ts";
import { writeTaskState, stateFilePath } from "./task-state.ts";
import { reviewContext, writeReviewRecord } from "./bug-review.ts";
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
const api = Gate as any;
const W = "bug:BUG-43";
const REPRO = "The reported reproduction path no longer fails: with SAVE10 applied, checkout shows the discounted total";
const PLAN = PLAN_FIXTURE.replace("| T1 | S | T1's test passes; existing totals tests pass |", `| T1 | S | ${REPRO}; T1's test passes |`);
const MAIN = "app/src/main/java/com/acme/checkout/CheckoutTotals.kt";
const TEST = "app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt";
const CMD = "./gradlew test --tests CheckoutTotalsTest";
const EVIDENCE = { title: "Checkout total ignores coupon", steps: ["Add an item to the cart", "Apply coupon SAVE10", "Open checkout"], expected: "Total shows the 10% discount", actual: "Total shows the full price" };

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "qa-handoff-")));
let n = 0;
const git = (root: string, ...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf-8" }).trim();
const BUILD = join(TMP, "build-instructions.md");
writeFileSync(BUILD, "### android\n\nInstall the internal build from the CI artifact for this branch, then open Checkout.\n");

const MAJOR = { severity: "major", platform: "android", path: MAIN, line: 1, rule: "AND-ARCH-3", description: "Totals logic lives in the view model", remediation: "Move it into the use case" };
const MINOR = { severity: "minor", platform: "android", path: TEST, line: 2, rule: "AND-TEST-2", description: "Test name does not state the outcome", remediation: "Rename the test" };
const NIT = { severity: "nit", platform: "android", path: MAIN, line: 1, rule: "AND-STYLE-1", description: "Expression body", remediation: "Use a block body" };
const CHECKS = [
  { id: "root-cause", status: "pass", note: "The total reads the discounted subtotal" },
  { id: "reproduction-path", status: "pass", note: "Regression test failed before and passes after" },
  { id: "plan-conformance", status: "pass", note: "Within the minimal change surface" },
  { id: "regression-risk", status: "pass", note: "Only the checkout total" },
];

interface Opts { plan?: string; key?: string; tasks?: "both" | "t2" | "none"; regression?: "test" | "debt"; review?: boolean; findings?: any[]; qaDebt?: boolean }
/** A repository whose bug fix is implemented, with task state and (by default) a fresh review record. */
function repo(o: Opts = {}): { root: string; plan: string; work: string } {
  const key = o.key ?? "BUG-43";
  const work = `bug:${key}`;
  const root = join(TMP, `repo-${++n}`);
  const p = join(root, `docs/bugs/${key}/bug-work-plan.md`);
  mkdirSync(dirname(p), { recursive: true });
  mkdirSync(join(root, dirname(MAIN)), { recursive: true });
  mkdirSync(join(root, dirname(TEST)), { recursive: true });
  writeFileSync(join(root, MAIN), "fun total() = 0\n");
  writeFileSync(join(root, TEST), "// tests\n");
  writeFileSync(p, o.plan ?? PLAN);
  approveWorkPackage(p, { by: "dana" });
  git(root, "init", "-q", "-b", "fix/bug");
  git(root, "config", "user.email", "t@t");
  git(root, "config", "user.name", "t");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "plan");
  writeFileSync(join(root, MAIN), "fun total() = discountedSubtotal()\n");
  writeFileSync(join(root, TEST), "// tests\n@Test fun couponIsApplied() {}\n");
  const dt = { framework: "junit", required: true, testsChanged: [TEST], justification: null, runs: [{ command: CMD, result: "pass" }], notRunReason: null };
  const qaDebt = o.qaDebt ? [{ domain: "accessibility", ruleId: "A11Y-SR-1", requiredVerification: "TalkBack walkthrough of checkout totals", whyNotAutomatable: "TalkBack cannot be driven headlessly", owner: "qa", status: "pending" }] : [];
  if ((o.tasks ?? "both") === "both") {
    writeTaskState(root, work, "T1", "in-progress", { platform: "android" } as any, p, { mode: "start" });
    writeTaskState(root, work, "T1", "complete", { platform: "android", filesChanged: [TEST], standardIds: [], validation: [{ command: CMD, result: "pass" }], acceptanceCriteria: [{ criterion: "The test fails on the current code for the documented reproduction", met: true }], developerTesting: dt, verificationDebt: qaDebt, deviations: [], blockers: [] } as any, p);
  }
  if ((o.tasks ?? "both") !== "none") {
    const regression = o.regression === "debt" ? { notFeasibleReason: "vendor SDK callback, no test seam" } : { command: CMD, failedBefore: true, passesAfter: true };
    const debt = o.regression === "debt" ? [{ domain: "developer-testing", ruleId: "VERIFY-4", requiredVerification: "Regression test for the SDK totals callback", whyNotAutomatable: "No test seam in the vendor SDK", owner: "developer", status: "pending" }] : [];
    writeTaskState(root, work, "T2", "in-progress", { platform: "android" } as any, p, { mode: "start" });
    const r = writeTaskState(root, work, "T2", "complete", { platform: "android", filesChanged: [MAIN], standardIds: [], validation: [{ command: CMD, result: "pass" }], acceptanceCriteria: [{ criterion: REPRO, met: true }, { criterion: "T1's test passes", met: true }], developerTesting: { ...dt, regression }, verificationDebt: debt, deviations: [], blockers: [] } as any, p);
    if (r.status !== "written") throw new Error(`fixture T2: ${JSON.stringify(r)}`);
  }
  if (o.review !== false && (o.tasks ?? "both") !== "none") reviewNow(root, work, o.findings ?? [MAJOR, MINOR, NIT]);
  return { root, plan: p, work };
}
function reviewNow(root: string, work: string, findings: any[], checks = CHECKS) {
  const ctx = reviewContext({ root, work });
  if (!ctx.ok) throw new Error(`review context: ${JSON.stringify(ctx)}`);
  const f = join(TMP, `review-${++n}.json`);
  writeFileSync(f, JSON.stringify({ binding: ctx.binding, reviewed_by: "code-reviewer (android)", generated_at: "2026-10-06T12:00:00Z", findings, checks }));
  const w = writeReviewRecord({ root, work, review: f });
  if (!w.ok) throw new Error(`review record: ${JSON.stringify(w)}`);
}
const K = (r: { root: string; work: string }, extra: Record<string, unknown> = {}) => api.handoffCheck?.({ root: r.root, work: r.work, qaRepo: QA, ...extra });
const GEN = (r: { root: string; work: string }, extra: Record<string, unknown> = {}) => api.generateHandoff?.({ root: r.root, work: r.work, qaRepo: QA, date: "2026-10-06", buildInstructions: BUILD, ...extra });
const APP = (r: { root: string; work: string }, by: string | undefined, acks: string[] = [], extra: Record<string, unknown> = {}) => api.approveHandoff?.({ root: r.root, work: r.work, qaRepo: QA, by, ackMajors: acks, ...extra });
const VER = (r: { root: string; work: string }) => api.verifyHandoff?.({ root: r.root, work: r.work });
const handoffPath = (r: { root: string }, key = "BUG-43") => join(r.root, `docs/qa/bug-${key}-qa-handoff.md`);
const rc = (res: any, id: string) => res?.checks?.find((c: any) => c.id === id);
const blocked = (res: any, id: string) => res?.ok === false && rc(res, id)?.status === "block";
const show = (r: any) => JSON.stringify([r?.outcome ?? r?.status, r?.code, r?.reason, r?.blockers?.map((b: any) => b.id)]);
const fm = (text: string): Record<string, string> => Object.fromEntries((splitDocument(Buffer.from(text)) as any).inner.map((l: string) => /^([a-z_]+): ?(.*)$/.exec(l)).filter(Boolean).map((m: any) => [m[1], m[2]]));

try {
  const qaSnap = sha(readdirSync(QA, { recursive: true } as any).sort().join("\n"));

  /* ── 2, 6, 14, 22, 26–27. a ready bug: the gate passes, majors need acknowledgement ── */
  const base = repo();
  const k = K(base);
  {
    check("6 a current, approved plan passes R1", rc(k, "R1")?.status === "pass", show(k));
    check("2 bug mode resolves the Bug Work Plan and the handoff path", k?.plan_path === "docs/bugs/BUG-43/bug-work-plan.md" && k.handoff?.path === "docs/qa/bug-BUG-43-qa-handoff.md");
    for (const id of ["R2", "R3", "R4", "R5", "R6"]) check(`${id} passes on a complete, reviewed, current fix`, rc(k, id)?.status === "pass", JSON.stringify(rc(k, id)));
    check("14 regression evidence satisfies R4", rc(k, "R4")?.status === "pass");
    check("22 minor and nit findings do not block", k?.ok === true && k.blockers.length === 0);
    check("20 a major finding requires acknowledgement (R7)", rc(k, "R7")?.status === "ack-required" && k.majors.length === 1 && /^M-[0-9a-f]{12}$/.test(k.majors[0].id) && k.majors[0].rule === "AND-ARCH-3", JSON.stringify(k?.majors));
    check("R8 no handoff yet — generation needed", rc(k, "R8")?.status === "generate" && k.next === "generate");
    check("R9 a QA bug carries its QA id", rc(k, "R9")?.status === "pass");
    check("26 the QA next action is register-build --fixes with the QA id and surfaces", k?.qa_next_action === "/register-build <build-id> --fixes bug:BUG-43 --surfaces android");
    check("34 the handoff-input fingerprint is deterministic", /^sha256:[0-9a-f]{64}$/.test(k?.input_fingerprint ?? "") && K(base)?.input_fingerprint === k.input_fingerprint);
  }

  /* ── 23–33. the generated draft ───────────────────────────────────────── */
  const g = GEN(base);
  const text = existsSync(handoffPath(base)) ? readFileSync(handoffPath(base), "utf-8") : "";
  const f = fm(text);
  {
    check("23 the handoff is written at docs/qa/bug-<key>-qa-handoff.md", g?.ok === true && g.outcome === "HANDOFF_GENERATED" && text.length > 0, show(g));
    check("24 the frontmatter is the bug handoff's own — no feature fields",
      JSON.stringify(Object.keys(f)) === JSON.stringify(["work_type", "bug_key", "qa_bug_id", "external_ref", "fix_cycle", "platform", "device_type", "surfaces", "bug_work_plan_link", "review_link", "handoff_input_fingerprint", "status", "generated_by", "date", "acknowledged_majors", "approved_by", "approved_fingerprint"]) &&
        !("feature" in f) && !("dd_link" in f), JSON.stringify(Object.keys(f)));
    check("24 values come from the plan and the review", f.work_type === "bug" && f.bug_key === "BUG-43" && f.fix_cycle === "1" && f.platform === "android" && f.device_type === "mobile" && f.surfaces === "[android]" &&
      f.bug_work_plan_link === "docs/bugs/BUG-43/bug-work-plan.md" && f.review_link === "docs/bugs/BUG-43/review-c1.md" && f.handoff_input_fingerprint === k.input_fingerprint);
    check("24 it starts as a draft with no approval", f.status === "draft" && f.approved_by === "null" && f.approved_fingerprint === "null" && f.acknowledged_majors === "[]" && f.generated_by === "create-dev-qa-notes" && f.date === "2026-10-06");
    check("26 QA bug id carried", f.qa_bug_id === "BUG-43");
    check("27 external reference carried", f.external_ref === "PAY-1182" && /\*\*External reference:\*\* PAY-1182/.test(text));
    const sections = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    check("25 the eight required sections, in order", JSON.stringify(sections) === JSON.stringify(["Bug Summary", "Fix Claim", "Reproduction Scenario", "Build / Install / Testing Instructions", "Developer Verification", "Regression Scope", "Known Limitations", "Pending Verification (owed to QA)"]), JSON.stringify(sections));
    check("4 the Fix Claim names cycle, surfaces, reviewed code and the exact QA action",
      /\*\*Fix cycle:\*\* 1/.test(text) && /\*\*Affected surfaces:\*\* android/.test(text) && text.includes(git(base.root, "rev-parse", "HEAD")) && text.includes("`/register-build <build-id> --fixes bug:BUG-43 --surfaces android`") && /never registers? the build/i.test(text));
    const planBody = (splitDocument(Buffer.from(readFileSync(base.plan))) as any).body.toString("utf-8");
    const sec = (body: string, name: string) => body.slice(body.indexOf(`\n## ${name}\n`) + `\n## ${name}\n`.length, body.indexOf("\n## ", body.indexOf(`\n## ${name}\n`) + 3)).replace(/<!--[\s\S]*?-->/g, "").trim();
    check("29 the reproduction scenario is carried verbatim from the plan", text.includes(sec(planBody, "Reproduction Evidence")) && text.includes(sec(planBody, "Observed vs Expected")) && /\*\*Found in build:\*\* and-201/.test(text));
    check("4 the build instructions are the platform lane's, verbatim", text.includes("Install the internal build from the CI artifact for this branch, then open Checkout."));
    check("30 Developer Verification is derived from task state", /`T1` — complete \(deterministic proof\)/.test(text) && /`T2` — complete \(deterministic proof\)/.test(text) && text.includes(`regression \`${CMD}\` failed before the fix and passes after`) && text.includes(`ran \`${CMD}\` — pass`) && text.includes(`reproduction path: ${REPRO} — met`));
    check("30 …with the review result", /docs\/bugs\/BUG-43\/review-c1\.md` — 0 blocking, 1 major, 1 minor, 1 nit/.test(text));
    check("31 Regression Scope is the plan's Blast Radius, verbatim and advisory", text.includes(sec(planBody, "Blast Radius")) && /advisory/i.test(text));
    check("33 no QA debt → the five-column table says none recorded", /## Pending Verification \(owed to QA\)\n\n\| Domain \| Rule ID \| Required verification \| Why not automatable \| Owner \|\n\|---\|---\|---\|---\|---\|\n\nNone recorded\./.test(text) || /## Pending Verification \(owed to QA\)\n\nNone recorded\./.test(text));
    check("Known Limitations carries the Fix Design non-goals", text.includes("coupon validation, cart badge, tax rounding."));
    const k2 = K(base);
    check("37 an existing current draft returns to approval", k2?.next === "approve" && rc(k2, "R8")?.status === "pass" && k2.handoff.status === "draft", JSON.stringify(k2?.handoff));
    const again = GEN(base);
    check("37 …and is not regenerated", again?.ok === true && again.outcome === "HANDOFF_CURRENT" && readFileSync(handoffPath(base), "utf-8") === text, show(again));
  }

  /* ── 20–21, 36, 38–41. approval ───────────────────────────────────────── */
  {
    const before = readFileSync(handoffPath(base), "utf-8");
    for (const by of [undefined, "", "null", "dana # x"]) check(`39 approval requires an explicit human identity (${JSON.stringify(by)})`, APP(base, by as any, [k.majors[0].id])?.ok === false && readFileSync(handoffPath(base), "utf-8") === before);
    const noAck = APP(base, "dana");
    check("20 a major finding blocks approval until acknowledged", noAck?.ok === false && noAck.code === "MAJOR_ACK_REQUIRED" && readFileSync(handoffPath(base), "utf-8") === before, show(noAck));
    check("40 majors cannot be acknowledged implicitly ('all')", APP(base, "dana", ["all"])?.code === "INVALID_ACK");
    check("40 an unknown acknowledgement is refused", APP(base, "dana", [k.majors[0].id, "M-000000000000"])?.code === "INVALID_ACK");
    const ok = APP(base, "dana", [k.majors[0].id]);
    const approved = readFileSync(handoffPath(base), "utf-8");
    const af = fm(approved);
    check("approval writes status: ready-for-qa", ok?.ok === true && ok.outcome === "HANDOFF_APPROVED" && af.status === "ready-for-qa" && af.approved_by === "dana" && /^sha256:[0-9a-f]{64}$/.test(af.approved_fingerprint), show(ok));
    check("21 the major acknowledgement is recorded", af.acknowledged_majors === `[${k.majors[0].id}]`);
    check("approval changes only the four approval lines", approved.split("\n").filter((l, i) => l !== before.split("\n")[i]).map((l) => l.split(":")[0]).sort().join(",") === "acknowledged_majors,approved_by,approved_fingerprint,status");
    check("the approval fingerprint binds the body, the inputs and the acknowledgements",
      af.approved_fingerprint === api.approvalFingerprintFor?.((splitDocument(Buffer.from(approved)) as any).body, af.handoff_input_fingerprint, [k.majors[0].id]));
    check("38 an approved, current handoff verifies ready", VER(base)?.status === "ready-for-qa" && VER(base).ok === true, JSON.stringify(VER(base)));
    const k3 = K(base);
    check("38 …and re-entry reuses it", k3?.next === "done" && k3.handoff.status === "ready-for-qa" && k3.handoff.approval_valid === true);
    const reuse = GEN(base);
    check("38 …without regenerating", reuse?.outcome === "HANDOFF_CURRENT" && readFileSync(handoffPath(base), "utf-8") === approved);
    check("approval is idempotent for the same approver and acknowledgements", APP(base, "dana", [k.majors[0].id])?.changed === false && readFileSync(handoffPath(base), "utf-8") === approved);
    writeFileSync(handoffPath(base), approved.replace("Install the internal build", "Install any build"));
    const edited = VER(base);
    check("36 a body edit invalidates the approval", edited?.ok === false && edited.status === "stale" && edited.reasons.some((x: any) => x.code === "HANDOFF_APPROVAL_INVALID"), JSON.stringify(edited));
    writeFileSync(handoffPath(base), approved.replace("platform: android", "platform: ios"));
    check("a frontmatter identity edit is caught too", VER(base)?.status === "stale");
    writeFileSync(handoffPath(base), approved.replace("acknowledged_majors: [" + k.majors[0].id + "]", "acknowledged_majors: []"));
    check("21 dropping the acknowledgement invalidates the approval", VER(base)?.status === "stale");
    const body = (splitDocument(Buffer.from(approved)) as any).body;
    check("the approval fingerprint changes with the acknowledgements", api.approvalFingerprintFor?.(body, af.handoff_input_fingerprint, [k.majors[0].id]) !== api.approvalFingerprintFor?.(body, af.handoff_input_fingerprint, []));
    const forged = approved.replace(`acknowledged_majors: [${k.majors[0].id}]`, "acknowledged_majors: []").replace(af.approved_fingerprint, api.approvalFingerprintFor?.(body, af.handoff_input_fingerprint, []));
    writeFileSync(handoffPath(base), forged);
    check("21 a consistently forged approval that acknowledges no Major finding is still not ready", VER(base)?.status === "stale", JSON.stringify(VER(base)));
    writeFileSync(handoffPath(base), approved);
    // 41 — a hand-written ready-for-qa is never valid.
    const hand = repo();
    GEN(hand);
    writeFileSync(handoffPath(hand), readFileSync(handoffPath(hand), "utf-8").replace("status: draft", "status: ready-for-qa").replace("approved_by: null", "approved_by: dana"));
    const hv = VER(hand);
    check("41 a manually edited status: ready-for-qa is not ready", hv?.ok === false && hv.status === "stale" && hv.reasons.some((x: any) => x.code === "HANDOFF_APPROVAL_INVALID"), JSON.stringify(hv));
  }

  /* ── 35. input change invalidates ready-for-qa ───────────────────────── */
  {
    const r = repo();
    const kk = K(r);
    GEN(r);
    APP(r, "dana", kk.majors.map((m: any) => m.id));
    reviewNow(r.root, r.work, [MINOR]);
    const v = VER(r);
    check("35 a new review (different findings) invalidates ready-for-qa", v?.status === "stale" && v.reasons.some((x: any) => x.code === "HANDOFF_INPUTS_CHANGED"), JSON.stringify(v));
    const k4 = K(r);
    check("35 re-entry asks for regeneration", k4?.next === "generate" && rc(k4, "R8")?.status === "generate");
    const ts = repo();
    const kt = K(ts);
    GEN(ts);
    APP(ts, "dana", kt.majors.map((m: any) => m.id));
    writeTaskState(ts.root, ts.work, "T1", "in-progress", { platform: "android" } as any, ts.plan, { mode: "restart" });
    const vt = VER(ts);
    check("35 a task-state change invalidates ready-for-qa", vt?.status === "stale" && vt.reasons.some((x: any) => x.code === "HANDOFF_INPUTS_CHANGED"), JSON.stringify(vt));
    const regen = GEN(r);
    const rf = fm(readFileSync(handoffPath(r), "utf-8"));
    check("35 regeneration resets the handoff to draft — approval never silently kept", regen?.outcome === "HANDOFF_GENERATED" && regen.regenerated === true && rf.status === "draft" && rf.approved_by === "null" && rf.acknowledged_majors === "[]");
    check("22 with only a minor finding nothing needs acknowledging", K(r)?.majors.length === 0 && APP(r, "dana")?.ok === true);
  }

  /* ── 3–5, 7–13, 15–19. readiness R1–R6 ───────────────────────────────── */
  {
    const empty = join(TMP, "empty");
    mkdirSync(empty, { recursive: true });
    check("3 an unknown bug is blocked", blocked(api.handoffCheck?.({ root: empty, work: "bug:BUG-99", qaRepo: QA }), "R1"));
    const inv = repo({ plan: PLAN.replace("## Root Cause\n", "## Cause\n"), tasks: "none", review: false });
    check("4 an invalid plan is blocked", blocked(K(inv), "R1"));
    const stale = repo();
    writeFileSync(stale.plan, readFileSync(stale.plan, "utf-8").replace("the discounted subtotal is computed but never read.", "edited."));
    check("5 a stale plan approval is blocked", blocked(K(stale), "R1"));
    const draftPlan = repo();
    writeFileSync(draftPlan.plan, readFileSync(draftPlan.plan, "utf-8").replace("status: approved", "status: draft"));
    check("5 a draft plan is blocked", blocked(K(draftPlan), "R1"));
    check("generate refuses a blocked bug", GEN(stale)?.ok === false && !existsSync(handoffPath(stale)));

    const drift = repo({ plan: PLAN.replace(/^bug_evidence_fingerprint: .*$/m, `bug_evidence_fingerprint: sha256:${"a".repeat(64)}`) });
    const d = K(drift);
    check("7 evidence drift blocks (R2) and routes to /analyze-bug", blocked(d, "R2") && /\/analyze-bug/.test(rc(d, "R2").route ?? ""), JSON.stringify(rc(d, "R2")));
    check("R2 needs the evidence source — never guessed", blocked(api.handoffCheck?.({ root: base.root, work: W }), "R2"));
    const qaPartial = join(TMP, "qa-partial");
    cpSync(QA, qaPartial, { recursive: true });
    rmSync(join(qaPartial, "bugs/BUG-43/bug.md"));
    const p = K(base, { qaRepo: qaPartial });
    check("8 partial QA context with current evidence does not block", rc(p, "R2")?.status === "pass" && p.warnings.some((w: any) => w.code === "QA_STATE_UNAVAILABLE"), JSON.stringify(rc(p, "R2")));
    const c2 = repo({ key: "BUG-44", plan: PLAN.replace(/BUG-43/g, "BUG-44").replace("external_ref: PAY-1182", "external_ref: null").replace("found_in_build: and-201", "found_in_build: atv-201").replace("surfaces: [android]", "surfaces: [android-tv]").replace("related_feature: checkout-coupons", "related_feature: null").replace(/^bug_evidence_fingerprint: .*$/m, "bug_evidence_fingerprint: sha256:77e5143cb27ca22f1df34072ef30b9dd6973f9575c5e1b8e2675427e56572f89") });
    const reo = K(c2);
    check("9 a reopened bug blocks and routes to /analyze-bug", blocked(reo, "R2") && /BUG_REOPENED/.test(rc(reo, "R2").message + rc(reo, "R2").code) && /\/analyze-bug/.test(rc(reo, "R2").route ?? ""), JSON.stringify(rc(reo, "R2")));
    check("45 no reopened cycle is created", !/### Cycle 2/.test(readFileSync(c2.plan, "utf-8")));

    const partialTasks = repo({ tasks: "t2", review: false });
    reviewNow(partialTasks.root, partialTasks.work, [MINOR]);
    const pt = K(partialTasks);
    check("10 an incomplete current-cycle task blocks (R3)", blocked(pt, "R3") && /T1/.test(rc(pt, "R3").message), JSON.stringify(rc(pt, "R3")));
    const attested = repo({ review: false });
    const sp = stateFilePath(attested.root, attested.work);
    writeFileSync(sp, readFileSync(sp, "utf-8").replace('"provenance": "plugin-verified"', '"provenance": "human-attested"'));
    reviewNow(attested.root, attested.work, [MINOR]);
    check("11 a completion without deterministic proof blocks (R3)", blocked(K(attested), "R3"));

    const noDt = repo({ review: false });
    const s1 = JSON.parse(readFileSync(stateFilePath(noDt.root, noDt.work), "utf-8"));
    delete s1.tasks.T1.developerTesting;
    writeFileSync(stateFilePath(noDt.root, noDt.work), JSON.stringify(s1, null, 2) + "\n");
    reviewNow(noDt.root, noDt.work, [MINOR]);
    check("12 a missing developer-testing decision blocks (R4)", blocked(K(noDt), "R4"), JSON.stringify(rc(K(noDt), "R4")));
    const failDt = repo({ review: false });
    const s2 = JSON.parse(readFileSync(stateFilePath(failDt.root, failDt.work), "utf-8"));
    s2.tasks.T1.developerTesting.runs[0].result = "fail";
    writeFileSync(stateFilePath(failDt.root, failDt.work), JSON.stringify(s2, null, 2) + "\n");
    reviewNow(failDt.root, failDt.work, [MINOR]);
    check("13 a failed developer test blocks (R4)", blocked(K(failDt), "R4"));
    const noReg = repo({ review: false });
    const s3 = JSON.parse(readFileSync(stateFilePath(noReg.root, noReg.work), "utf-8"));
    delete s3.tasks.T2.developerTesting.regression;
    writeFileSync(stateFilePath(noReg.root, noReg.work), JSON.stringify(s3, null, 2) + "\n");
    reviewNow(noReg.root, noReg.work, [MINOR], CHECKS.map((c) => (c.id === "reproduction-path" ? { ...c, status: "not-verifiable", note: "No regression evidence" } : c)));
    check("R4 the fix task without regression evidence or VERIFY-4 debt blocks", blocked(K(noReg), "R4"));

    const debt = repo({ regression: "debt", findings: [MINOR], review: false });
    reviewNow(debt.root, debt.work, [MINOR]);
    const kd = K(debt);
    check("15 VERIFY-4 developer debt satisfies R4", rc(kd, "R4")?.status === "pass", JSON.stringify(rc(kd, "R4")));
    check("15 …and is surfaced as developer debt", kd?.developer_debt?.length === 1 && kd.developer_debt[0].ruleId === "VERIFY-4");
    GEN(debt);
    const dtext = readFileSync(handoffPath(debt), "utf-8");
    const pending = dtext.slice(dtext.indexOf("## Pending Verification"));
    const limits = dtext.slice(dtext.indexOf("## Known Limitations"), dtext.indexOf("## Pending Verification"));
    check("32 developer debt stays out of Pending Verification", !/VERIFY-4/.test(pending) && /VERIFY-4/.test(limits) && /Regression test for the SDK totals callback/.test(limits));
    const qd = repo({ qaDebt: true });
    GEN(qd);
    const qtext = readFileSync(handoffPath(qd), "utf-8");
    check("33 QA-owned debt uses the five-column contract", qtext.includes("| Domain | Rule ID | Required verification | Why not automatable | Owner |") &&
      qtext.includes("| accessibility | A11Y-SR-1 | TalkBack walkthrough of checkout totals | TalkBack cannot be driven headlessly | qa |"));

    const noReview = repo({ review: false });
    check("16 a missing review blocks (R5)", blocked(K(noReview), "R5"));
    const staleReview = repo();
    writeFileSync(join(staleReview.root, MAIN), "fun total() = 1\n");
    check("17 a stale review blocks (R5)", blocked(K(staleReview), "R5"));
    const badReview = repo();
    const rp = join(badReview.root, "docs/bugs/BUG-43/review-c1.md");
    writeFileSync(rp, readFileSync(rp, "utf-8").replace("major_count: 1", "major_count: 0"));
    check("18 an invalid review blocks (R5)", blocked(K(badReview), "R5"));
    const blocking = repo({ findings: [{ ...MAJOR, severity: "blocking" }] });
    const kb = K(blocking);
    check("19 a blocking finding blocks (R6)", blocked(kb, "R6") && GEN(blocking)?.ok === false, JSON.stringify(rc(kb, "R6")));
    check("19 …and approval is impossible", APP(blocking, "dana")?.ok === false);
  }

  /* ── 28. a bug without a QA id ────────────────────────────────────────── */
  {
    const extPlan = PLAN.replace("bug_key: BUG-43", "bug_key: PAY-1182").replace("qa_bug_id: BUG-43", "qa_bug_id: null").replace("origin: qa-standalone", "origin: external").replace("related_feature: checkout-coupons", "related_feature: null");
    const r = repo({ key: "PAY-1182", plan: extPlan });
    const report = join(TMP, "report.json");
    writeFileSync(report, JSON.stringify({ ...EVIDENCE, surfaces: ["android"], found_in_build: "and-201" }));
    const kx = api.handoffCheck?.({ root: r.root, work: r.work, report });
    check("28 a missing QA bug id does not block (R9)", kx?.ok === true && rc(kx, "R9")?.status === "info", show(kx));
    check("28 …and the QA next step is explicit: create or bind the QA bug first", /create or bind a QA bug.*before `\/register-build <build-id> --fixes bug:<qa-bug-id>`/.test(kx?.qa_next_action ?? ""), kx?.qa_next_action);
    api.generateHandoff?.({ root: r.root, work: r.work, report, date: "2026-10-06", buildInstructions: BUILD });
    const xt = readFileSync(handoffPath(r, "PAY-1182"), "utf-8");
    check("28 the handoff states it", fm(xt).qa_bug_id === "null" && /QA must create or bind a QA bug/.test(xt));
  }

  /* ── path safety ──────────────────────────────────────────────────────── */
  {
    const r = repo();
    mkdirSync(join(r.root, "docs/qa"), { recursive: true });
    writeFileSync(handoffPath(r), "---\nfeature: bug-BUG-43\nstatus: ready-for-qa\n---\n\n# QA Handoff\n");
    const clash = GEN(r);
    check("a feature handoff that happens to share the path is never overwritten", clash?.ok === false && clash.code === "HANDOFF_PATH_CONFLICT" && readFileSync(handoffPath(r), "utf-8").startsWith("---\nfeature: bug-BUG-43"), show(clash));
  }

  /* ── 1, 41–46. the command and everything that must not move ─────────── */
  {
    const cmd = read("commands/create-dev-qa-notes.md");
    const body = cmd.slice(cmd.indexOf("\n---\n") + 5);
    check("1 the feature command body is byte-identical, first", sha(body.slice(0, 11007)) === "5f8b01d64ea60e069243ad27a0a16208e3296e6018c02ddd5bc9b10c5090a33d");
    const bug = body.slice(11007);
    check("1 the bug section applies only to bug:<bug_key>", /^\n## Bug handoff \(`bug:<bug_key>`\)\n/.test(bug) && /Without a `bug:` prefix, nothing in this section applies/.test(bug));
    check("argument-hint documents the bug form", /^argument-hint: .*bug:<bug_key>/m.test(cmd));
    for (const s of ['scripts/qa-handoff-gate.ts" check bug:<bug_key>', 'scripts/qa-handoff-gate.ts" generate bug:<bug_key>', 'scripts/qa-handoff-gate.ts" approve bug:<bug_key>']) check(`the bug section runs ${s.split('" ')[1].split(" ")[0]}`, bug.includes(s));
    check("the bug section asks once: Hand this bug fix to QA?", bug.includes("Hand this bug fix to QA?"));
    check("40 the bug section requires acknowledging each Major finding explicitly", /--ack-major <id>/.test(bug) && /each Major finding/i.test(bug) && /never implicitly/i.test(bug));
    check("41 no manual status edit", /never edit `status`/i.test(bug));
    check("42 no automatic commit", /never creates? a git commit/i.test(bug));
    check("the bug section never registers a build from Dev", /never registers? a build/i.test(bug));
    const tpl = read("templates/qa-bug-handoff-template.md");
    check("the bug handoff template has the eight sections in order", JSON.stringify([...tpl.matchAll(/^## (.+)$/gm)].map((m) => m[1])) === JSON.stringify(["Bug Summary", "Fix Claim", "Reproduction Scenario", "Build / Install / Testing Instructions", "Developer Verification", "Regression Scope", "Known Limitations", "Pending Verification (owed to QA)"]));
    check("the template has no feature fields", !/^(feature|dd_link|task_breakdown_link):/m.test(tpl) && /^work_type: bug/m.test(tpl));
    const PINNED: Record<string, string> = {
      "templates/qa-handoff-template.md": "3203b0e0ffd0a3e0c67044cc18dcdaf752047a2c61f1e5cd7538cf1b16cfb564",
      "standards/shared/qa-handoff.md": "c060c434744a5991a6dee7744b27195224e46904c7ccbfc5aa58b10336087720",
      "skills/mobile-testing-and-qa-handoff/SKILL.md": "7d69cad27d8b143750966c717b8220b92a5acc0372c73b149414821362b38448",
      "scripts/task-state.ts": "246d16e33f87534fc908538ab6c4deb49bc7d0df058a060f1c953a9bfda87cd3",
      "scripts/bug-work-plan.ts": "ba9ff6624cf1e578ad98072e4d4aea5965247a8532dd7a83eae9419fa1a39e04",
      "commands/review-code.md": "0ff911cb0a8d08857ac1cb957dac2c3b881b92ba4902ed1bd45ff3879ad33bbe",
      "commands/implement-task.md": "6fa59fb5c05b0fd1ff7f2d15ae70302c2c010b5852d00e3e3c57f1deb6c8eaf1",
      "commands/prepare-mobile-release.md": "7f7d431309a77e4af4f7485b236cf2205616f2afed3b06de94cf2a0acbf327e4",
      "scripts/qa-release-gate.ts": "88f016631998c356936fb7e04984c7c84f111390a7561a1766a3b383380e636a",
    };
    for (const [file, h] of Object.entries(PINNED)) check(`1/15 ${file} is unchanged`, sha(readFileSync(join(REPO_ROOT, file))) === h);
    const src = read("scripts/qa-handoff-gate.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("31 the gate never reads Project Knowledge", !/read-repo-knowledge|repo-knowledge\.json|\.ono\b|capabilityRelationships/.test(src));
    check("43 the gate never writes a QA repository", !/qa-ledger\.mjs|ono-plugin-qa|register-build"/.test(src) && sha(readdirSync(QA, { recursive: true } as any).sort().join("\n")) === qaSnap);
    check("44 no Inspector access", !/project-inspector/.test(src));
    check("42 no process, no commit, no clock", !/child_process|execFile|spawn|new Date|Date\.now|Math\.random/.test(src));
    check("the gate writes only the handoff, atomically", (src.match(/writeFileSync\(/g) ?? []).length === 1 && (src.match(/renameSync\(/g) ?? []).length === 1);
    check("the gate never writes task state or the plan", !/writeTaskState|writeCheckpoint|approveWorkPackage/.test(src));
    check("45 no reopened-cycle behavior", !/Cycle 2|C2-T/.test(src));
    check("the suite is registered", read("scripts/check.ts").includes('"qa-handoff-gate"'));
    const contract = read("docs/bug-work-plan-contract.md");
    check("the contract documents the bug handoff and R1–R9", /docs\/qa\/bug-<bug_key>-qa-handoff\.md/.test(contract) && ["R1", "R5", "R7", "R8", "R9"].every((r) => contract.includes(`| ${r} |`)));
  }

  /* ── CLI ──────────────────────────────────────────────────────────────── */
  {
    const run = (args: string[]) => {
      const p = spawnSync(process.execPath, ["--no-warnings", join(HERE, "qa-handoff-gate.ts"), ...args], { encoding: "utf-8" });
      try {
        return { code: p.status, json: JSON.parse(p.stdout) };
      } catch {
        return { code: p.status, json: null, raw: p.stdout + p.stderr };
      }
    };
    const r = repo();
    const c = run(["check", r.work, "--root", r.root, "--qa-repo", QA]);
    check("CLI check prints one JSON object, exit 0", c.code === 0 && c.json?.ok === true, JSON.stringify(c.json?.blockers ?? c.raw));
    check("CLI generate", run(["generate", r.work, "--root", r.root, "--qa-repo", QA, "--date", "2026-10-06", "--build-instructions", BUILD]).json?.ok === true);
    const ap = run(["approve", r.work, "--root", r.root, "--qa-repo", QA, "--by", "dana", "--ack-major", c.json.majors[0].id]);
    check("CLI approve with one --ack-major per Major finding", ap.json?.ok === true, JSON.stringify(ap.json));
    check("CLI verify", run(["verify", r.work, "--root", r.root]).json?.status === "ready-for-qa");
    check("CLI an unknown command is refused, exit 0", run(["frobnicate"]).code === 0 && run(["frobnicate"]).json?.ok === false);
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall qa-handoff-gate checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
