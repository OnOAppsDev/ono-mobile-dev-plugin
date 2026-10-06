/**
 * bug-fix-cycles.test.ts
 *
 * Pins Bug Development Flow Step 8: a verified QA reopen after a failed fix continues the same
 * bug — same identity, same Bug Work Plan, same task-state store — in the next fix cycle:
 * `/analyze-bug` appends `### Cycle N+1` (history untouched), one new approval binds it,
 * `/implement-task bug:<key> C<n>-T<m>` runs its tasks, `/review-code --bug` writes
 * review-c<n>.md, and `/create-dev-qa-notes bug:<key>` hands the new fix to QA.
 *
 *   node --no-warnings scripts/bug-fix-cycles.test.ts
 */

import { execFileSync } from "child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as Bug from "./analyze-bug.ts";
import { validateBugWorkPlan } from "./bug-work-plan.ts";
import { approveWorkPackage, verifyApproval } from "./work-approval.ts";
import { bugGate, bugWorkStatus } from "./bug-implementation.ts";
import { reviewContext, writeReviewRecord, verifyReviewRecord } from "./bug-review.ts";
import { handoffCheck, generateHandoff, approveHandoff, verifyHandoff } from "./qa-handoff-gate.ts";
import { parseBreakdown, readTaskState, resumeTask, stateFilePath, writeCheckpoint, writeTaskState } from "./task-state.ts";
import { sectionFingerprints, taskRowsText } from "./task-resume.ts";
import { splitDocument } from "./migrate-planning-doc.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const FX = join(HERE, "fixtures/qa-bugs");
const QA = join(FX, "acme-qa"); // BUG-44 reopened: atv-202 failed
const QA_DELIVERED = join(FX, "acme-qa-c2-delivered"); // then atv-206 claims the fix
const QA_REOPENED2 = join(FX, "acme-qa-c2-reopened"); // then atv-206 fails too
const QA_CHANGED = join(FX, "acme-qa-reopened-changed"); // reopened, and QA changed the bug's title

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
const api = Bug as any;
const show = (r: any) => JSON.stringify([r?.outcome ?? r?.status, r?.code, r?.reason, r?.problems?.map((p: any) => p.code), r?.errors?.map((e: any) => e.code)]);
const git = (root: string, ...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf-8" }).trim();
const W = "bug:BUG-44";
const REPRO1 = "The reported reproduction path no longer fails: with SAVE10 applied, checkout shows the discounted total";
const REPRO2 = "The reported reproduction path no longer fails: resume from Home and from the screensaver keeps playing";
const CMD = "./gradlew test --tests PlayerSurfaceTest";
const FIX_FILE = "app/src/main/java/com/acme/player/PlayerSurface.kt";
const TEST_FILE = "app/src/test/java/com/acme/player/PlayerSurfaceTest.kt";

/** BUG-44's cycle-1 plan: the fixture plan's body, BUG-44's identity, and the template's commented example cycle. */
const PLAN44 = readFileSync(join(HERE, "fixtures/bug-work-plans/bwp-cycle1.md"), "utf-8")
  .replace("| T1 | S | T1's test passes; existing totals tests pass |", `| T1 | S | ${REPRO1}; T1's test passes |`)
  .replace(/BUG-43/g, "BUG-44").replace("external_ref: PAY-1182", "external_ref: null").replace("found_in_build: and-201", "found_in_build: atv-201")
  .replace("surfaces: [android]", "surfaces: [android-tv]").replace("related_feature: checkout-coupons", "related_feature: null").replace("device_type: mobile", "device_type: tv")
  .replace(/^bug_evidence_fingerprint: .*$/m, "bug_evidence_fingerprint: sha256:77e5143cb27ca22f1df34072ef30b9dd6973f9575c5e1b8e2675427e56572f89")
  .replace("No additional fix cycles yet. Cycle 1 is the Tasks section above.\n", "No additional fix cycles yet. Cycle 1 is the Tasks section above.\n\n<!--\n```md\n### Cycle 2\n\n| id | description | platform | files touched | depends-on | size | acceptance criteria |\n|---|---|---|---|---|---|---|\n| C2-T1 | example only | react-native | x | — | S | y |\n```\n-->\n");

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "bug-cycles-")));
let n = 0;
const QA_PARTIAL = join(TMP, "qa-partial");
cpSync(QA, QA_PARTIAL, { recursive: true });
rmSync(join(QA_PARTIAL, "bugs/BUG-44/bug.md"));
const BUILD = join(TMP, "build.md");
writeFileSync(BUILD, "### android\n\nInstall the CI build on the Shield and play a video.\n");
const DT = (cmd: string, extra: Record<string, unknown> = {}) => ({ framework: "junit", required: true, testsChanged: [TEST_FILE], justification: null, runs: [{ command: cmd, result: "pass" }], notRunReason: null, ...extra });
const REVIEW_CHECKS = [
  { id: "root-cause", status: "pass", note: "The surface is re-attached where the plan says" },
  { id: "reproduction-path", status: "pass", note: "Regression test failed before and passes after" },
  { id: "plan-conformance", status: "pass", note: "Within the change surface" },
  { id: "regression-risk", status: "pass", note: "Player only" },
];
const MINOR = { severity: "minor", platform: "android", path: FIX_FILE, line: 1, rule: "AND-STYLE-1", description: "Naming", remediation: "Rename" };

function complete(root: string, plan: string, task: string, criteria: string[], fix: boolean) {
  writeTaskState(root, W, task, "in-progress", { platform: "android" } as any, plan, { mode: "start" });
  const r = writeTaskState(root, W, task, "complete", {
    platform: "android", filesChanged: [fix ? FIX_FILE : TEST_FILE], standardIds: [], validation: [{ command: CMD, result: "pass" }],
    acceptanceCriteria: criteria.map((c) => ({ criterion: c, met: true })),
    developerTesting: DT(CMD, fix ? { regression: { command: CMD, failedBefore: true, passesAfter: true } } : {}), deviations: [], blockers: [],
  } as any, plan);
  if (r.status !== "written") throw new Error(`complete ${task}: ${JSON.stringify(r)}`);
}
function review(root: string) {
  const ctx = reviewContext({ root, work: W });
  if (!ctx.ok) throw new Error(`review: ${JSON.stringify(ctx)}`);
  const f = join(TMP, `rv-${++n}.json`);
  writeFileSync(f, JSON.stringify({ binding: ctx.binding, reviewed_by: "code-reviewer (android)", generated_at: "2026-10-06T12:00:00Z", findings: [MINOR], checks: REVIEW_CHECKS }));
  const w = writeReviewRecord({ root, work: W, review: f });
  if (!w.ok) throw new Error(`record: ${JSON.stringify(w)}`);
  return w;
}
function handOff(root: string, qaRepo: string) {
  const g = generateHandoff({ root, work: W, qaRepo, date: "2026-10-06", buildInstructions: BUILD });
  if (!g.ok) throw new Error(`generate: ${JSON.stringify(g)}`);
  const a = approveHandoff({ root, work: W, qaRepo, by: "dana", ackMajors: [] });
  if (!a.ok) throw new Error(`approve handoff: ${JSON.stringify(a)}`);
}
/** Cycle 1 of BUG-44 delivered: plan approved, T1/T2 complete, reviewed, handed to QA (while QA's view was unavailable). */
function cycle1(handed = true): { root: string; plan: string } {
  const root = join(TMP, `repo-${++n}`);
  const plan = join(root, "docs/bugs/BUG-44/bug-work-plan.md");
  mkdirSync(dirname(plan), { recursive: true });
  for (const f of [FIX_FILE, TEST_FILE]) {
    mkdirSync(join(root, dirname(f)), { recursive: true });
    writeFileSync(join(root, f), "// v0\n");
  }
  writeFileSync(plan, PLAN44);
  approveWorkPackage(plan, { by: "dana" });
  git(root, "init", "-q", "-b", "fix/bug-44");
  git(root, "config", "user.email", "t@t");
  git(root, "config", "user.name", "t");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "plan");
  writeFileSync(join(root, FIX_FILE), "// cycle 1 fix\n");
  complete(root, plan, "T1", ["The test fails on the current code for the documented reproduction"], false);
  complete(root, plan, "T2", [REPRO1, "T1's test passes"], true);
  review(root);
  if (handed) handOff(root, QA_PARTIAL);
  git(root, "add", "-A");
  git(root, "commit", "-qm", "cycle 1");
  return { root, plan };
}
const S = (root: string, qaRepo = QA) => api.startBug?.({ root, ref: "BUG-44", qaRepo });
const APPEND = (root: string, qaRepo = QA) => api.appendCycle?.({ root, ref: "BUG-44", qaRepo });
const CHECK = (root: string, qaRepo = QA) => api.checkPlan?.({ root, ref: "BUG-44", qaRepo });

/** What the architect writes into an appended cycle — the judgement half, simulated. */
function fillCycle(text: string, cyc: number, o: { rows?: string[]; verification?: string } = {}): string {
  let t = text;
  const values: Record<string, string> = {
    "Why the previous fix was insufficient": "[inference] the cycle-1 fix re-attached the surface on resume from Home but not from the screensaver",
    "Fix-design delta": "also re-attach the surface when the screensaver dismisses",
    "New risks": "double attach on a fast resume [inference]",
    "Changed non-goals": "none",
    "Changed affected files / areas": `\`${FIX_FILE}\``,
    "Verification delta": o.verification ?? `C${cyc}-T1 makes the failed re-test path (resume from the screensaver on android-tv) mandatory acceptance evidence`,
  };
  for (const [label, value] of Object.entries(values)) {
    const re = new RegExp(`^- \\*\\*${label.replace(/[/]/g, "\\/")}:\\*\\*\\s*$`, "m");
    if (!re.test(t)) throw new Error(`no empty label ${label} in cycle ${cyc}`);
    t = t.replace(re, `- **${label}:** ${value}`);
  }
  const at = t.lastIndexOf(`### Cycle ${cyc}\n`); // not the template's commented example
  const sepAt = t.indexOf("|---|---|---|---|---|---|---|\n", at) + "|---|---|---|---|---|---|---|\n".length;
  const rows = o.rows ?? [
    `| C${cyc}-T1 | Add a failing regression test for resume from the screensaver | android | \`${TEST_FILE}\` | — | S | The test fails on the current code for the failed re-test path |`,
    `| C${cyc}-T2 | Re-attach the surface when the screensaver dismisses | android | \`${FIX_FILE}\` | C${cyc}-T1, T2 | S | ${REPRO2}; C${cyc}-T1 passes |`,
  ];
  return `${t.slice(0, sepAt)}${rows.join("\n")}\n${t.slice(sepAt)}`;
}
/** Every file under a directory with its content hash — to prove nothing was written. */
function snapshot(dir: string): string {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : 1))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(`${p.slice(dir.length)}\0${sha(readFileSync(p))}`);
    }
  };
  walk(dir);
  return sha(out.join("\n"));
}
const anchors = (text: string) => sectionFingerprints((splitDocument(Buffer.from(text)) as any).body.toString("utf-8"));

try {
  const qaSnaps = [QA, QA_DELIVERED, QA_REOPENED2, QA_CHANGED].map(snapshot);

  /* ── 1, 18–19. cycle 1 unchanged; a reopen must be verified and must follow a handoff ── */
  const one = cycle1();
  const planC1 = readFileSync(one.plan, "utf-8");
  {
    check("1 cycle 1 is the plan as Step 4 made it — fix_cycle 1, approved", validateBugWorkPlan(Buffer.from(planC1)).frontmatter.fix_cycle === 1 && verifyApproval(Buffer.from(planC1)).status === "approved");
    const partial = S(one.root, QA_PARTIAL);
    check("18 a handed-off cycle with QA state unavailable cannot start a new cycle", partial?.outcome === "BUG_REOPEN_UNVERIFIED" && partial.ok === false && partial.proceed === null, show(partial));
    const partialAppend = APPEND(one.root, QA_PARTIAL);
    check("18 …and append-cycle refuses it", partialAppend?.ok === false && readFileSync(one.plan, "utf-8") === planC1, show(partialAppend));
    const notHanded = cycle1(false);
    const un = S(notHanded.root);
    check("19 a reopen that does not follow this plan's handoff is not a new cycle", un?.outcome === "BUG_REOPEN_UNMATCHED" && un.ok === false, show(un));
    const nothing = join(TMP, "no-plan");
    mkdirSync(nothing, { recursive: true });
    check("19 a reopened bug without a plan is reported, nothing is created", S(nothing)?.outcome === "BUG_REOPENED" && !existsSync(join(nothing, "docs/bugs")));
  }

  /* ── 2–16. a verified reopen appends Cycle 2 ──────────────────────────── */
  const s = S(one.root);
  {
    check("2 a verified reopen of a handed-off cycle starts the next cycle", s?.outcome === "BUG_CYCLE_NEW" && s.ok === true && s.proceed === "append-cycle" && s.next_cycle === 2, show(s));
    check("16 the failed re-test does not change the evidence — class unchanged", s?.evidence_class === "unchanged" && s.drift.length === 0);
    check("3 same identity", s?.bug_key === "BUG-44" && s.plan_path === "docs/bugs/BUG-44/bug-work-plan.md");
  }
  const a = APPEND(one.root);
  const planC2 = readFileSync(one.plan, "utf-8");
  const v2 = validateBugWorkPlan(Buffer.from(planC2));
  {
    check("2 append-cycle appends Cycle 2", a?.ok === true && a.outcome === "CYCLE_APPENDED" && a.cycle === 2, show(a));
    check("4 the same plan file", a?.plan_path === "docs/bugs/BUG-44/bug-work-plan.md" && readdirSync(dirname(one.plan)).filter((f) => f.endsWith(".md") && f.startsWith("bug-work-plan")).length === 1);
    check("6 fix_cycle increments to 2", /^fix_cycle: 2$/m.test(planC2));
    check("3 the identity is unchanged", ["bug_key: BUG-44", "qa_bug_id: BUG-44", "origin: qa-standalone"].every((l) => planC2.includes(`\n${l}\n`)));
    const before = anchors(planC1), after = anchors(planC2);
    check("9 cycle 1 (the Tasks section) is preserved byte for byte", before.tasks === after.tasks);
    check("16 the shared analysis is preserved — Root Cause, Fix Design, Verification Strategy, Reproduction", ["root-cause", "fix-design", "verification-strategy", "reproduction-evidence", "observed-vs-expected", "blast-radius"].every((k) => before[k] === after[k]));
    const cyc = planC2.slice(planC2.indexOf("### Cycle 2"));
    check("10 the failed build is recorded", /- \*\*Failed build:\*\* atv-202/.test(cyc));
    check("11 the failed surfaces are recorded", /- \*\*Failed surfaces:\*\* android-tv/.test(cyc));
    check("12 the failed re-test run and result are recorded, with provenance", /- \*\*Failed re-test evidence:\*\* \[evidence: qa-ledger\/runs\/retest-20261005T101700Z-c555166e\.jsonl\] `retest-20261005T101700Z-c555166e` — fail on atv-202/.test(cyc));
    check("12 QA notes and evidence are recorded", /- \*\*QA notes:\*\* Still frozen after resume from Home; evidence: `videos\/BUG-44-atv-202\.mp4`/.test(cyc));
    check("13 the previous fix claim is recorded", /- \*\*Previous fix claim:\*\* atv-202 — failed \(the cycle 1 fix\)/.test(cyc));
    check("14/15 the judgement labels are left for the analysis — an unfilled cycle is not a valid plan", v2.ok === false && v2.errors.some((e: any) => e.code === "CYCLE_LABEL" && /Fix-design delta/.test(e.message)) && v2.errors.some((e: any) => /Verification delta/.test(e.message)), JSON.stringify(v2.errors));
    check("14 the commented example cycle is still only an example", !/^### Cycle 3/m.test(planC2) && planC2.includes("| C2-T1 | example only |"));
    const again = APPEND(one.root);
    check("8 re-running append never appends Cycle 2 twice", again?.ok === false && readFileSync(one.plan, "utf-8") === planC2, show(again));
    const s2 = S(one.root);
    check("43 re-running analyze on the unfinished cycle resumes its analysis — never appends", s2?.outcome === "BUG_CYCLE_INCOMPLETE" && s2.proceed === "complete-cycle" && s2.cycle === 2, show(s2));
  }

  /* ── 14–15, 20–24. the filled cycle ───────────────────────────────────── */
  const filled = fillCycle(planC2, 2);
  writeFileSync(one.plan, filled);
  {
    const v = validateBugWorkPlan(Buffer.from(filled));
    check("20 the filled Cycle 2 plan is valid", v.ok === true, JSON.stringify(v.errors));
    check("20 C2-T1 and C2-T2 parse through the one task parser", JSON.stringify(Object.keys(parseBreakdown(taskRowsText(filled))).sort()) === '["C2-T1","C2-T2","T1","T2"]', JSON.stringify(Object.keys(parseBreakdown(taskRowsText(filled)))));
    check("21/22 C2-T2 depends on C2-T1 and on the cycle-1 T2", JSON.stringify(parseBreakdown(taskRowsText(filled))["C2-T2"].dependsOn) === '["C2-T1","T2"]');
    check("check accepts the completed cycle", CHECK(one.root)?.ok === true, show(CHECK(one.root)));
    check("28 the cycle-1 approval is stale now", verifyApproval(Buffer.from(filled)).status === "approval_stale" && verifyApproval(Buffer.from(filled)).reasons.some((r: any) => r.code === "APPROVAL_CYCLE_MISMATCH"));
    const s5 = S(one.root);
    check("43 re-running analyze on the filled draft cycle returns to approval — never appends", s5?.outcome === "BUG_PLAN_AWAITING_APPROVAL" && s5.proceed === "approve" && readFileSync(one.plan, "utf-8") === filled, show(s5));
    const noDelta = validateBugWorkPlan(Buffer.from(filled.replace(/^- \*\*Fix-design delta:\*\* .*$/m, "- **Fix-design delta:**")));
    check("14 a cycle without its fix-design delta is invalid", noDelta.ok === false && noDelta.errors.some((e: any) => /Fix-design delta/.test(e.message)));
    const noVer = validateBugWorkPlan(Buffer.from(filled.replace(/^- \*\*Verification delta:\*\* .*$/m, "- **Verification delta:**")));
    check("15 a cycle without its verification delta is invalid", noVer.ok === false && noVer.errors.some((e: any) => /Verification delta/.test(e.message)));
    const surf = (() => {
      writeFileSync(one.plan, fillCycle(planC2, 2, { verification: "C2-T1 covers the failed path" }));
      const r = CHECK(one.root);
      writeFileSync(one.plan, filled);
      return r;
    })();
    check("15 the verification delta must cover the failed re-test surfaces", surf?.ok === false && surf.problems.some((p: any) => p.code === "CYCLE_SURFACES"), show(surf));
    const noRepro = (() => {
      writeFileSync(one.plan, filled.replace(`${REPRO2}; C2-T1 passes`, "Playback resumes; C2-T1 passes"));
      const r = CHECK(one.root);
      writeFileSync(one.plan, filled);
      return r;
    })();
    check("15 the failed reproduction path is mandatory acceptance evidence for the cycle's fix task", noRepro?.ok === false && noRepro.problems.some((p: any) => p.code === "REPRO_CRITERION"), show(noRepro));
    const future = validateBugWorkPlan(Buffer.from(filled.replace("| — | S | The test fails on the current code for the failed re-test path |", "| C3-T1 | S | The test fails on the current code for the failed re-test path |")));
    check("23 a dependency on a future cycle is rejected", future.ok === false && future.errors.some((e: any) => e.code === "TASK_DEPENDENCY"));
    const dup = validateBugWorkPlan(Buffer.from(filled.replace("| C2-T2 | Re-attach", "| C2-T1 | Re-attach")));
    check("24 a task id collision is rejected", dup.ok === false && dup.errors.some((e: any) => e.code === "TASK_DUPLICATE"));
    const wrongId = validateBugWorkPlan(Buffer.from(filled.replace("| C2-T2 | Re-attach", "| T3 | Re-attach")));
    check("24 a cycle-1 id inside Cycle 2 is rejected", wrongId.ok === false && wrongId.errors.some((e: any) => e.code === "TASK_ID"));
    const lastAt = filled.lastIndexOf("### Cycle 2\n");
    const gap = `${filled.slice(0, lastAt)}### Cycle 3\n${filled.slice(lastAt + "### Cycle 2\n".length)}`.replace(/^fix_cycle: 2$/m, "fix_cycle: 3");
    check("7 a gap in cycle numbering is rejected", validateBugWorkPlan(Buffer.from(gap)).errors.some((e: any) => e.code === "CYCLE_SEQUENCE"));
    const cyc2 = filled.slice(filled.lastIndexOf("### Cycle 2"), filled.indexOf("## Repo Knowledge Reference"));
    const twice = filled.replace("## Repo Knowledge Reference", `${cyc2}## Repo Knowledge Reference`);
    check("8 a duplicate Cycle 2 is rejected", validateBugWorkPlan(Buffer.from(twice)).errors.some((e: any) => e.code === "CYCLE_SEQUENCE"));
  }

  /* ── 29, 44, 30–35. approval and implementation of Cycle 2 ─────────────── */
  {
    const ap = approveWorkPackage(one.plan, { by: "dana" });
    check("29 one new approval binds to cycle 2", ap.ok === true && ap.approved_cycle === 2 && verifyApproval(readFileSync(one.plan)).status === "approved", JSON.stringify(ap));
    const s3 = S(one.root);
    check("44 re-running analyze on the approved cycle returns the next task, never appends", s3?.outcome === "BUG_PLAN_APPROVED" && s3.next_action === "/implement-task bug:BUG-44 C2-T1" && /### Cycle 2/.test(readFileSync(one.plan, "utf-8")) && !/### Cycle 3\n/.test(readFileSync(one.plan, "utf-8")), show(s3));
    const g = bugGate({ root: one.root, work: W, task: "C2-T1", qaRepo: QA });
    check("30 /implement-task bug:BUG-44 C2-T1 passes the gate — the reopen is reconciled by Cycle 2", g.ok === true && g.outcome === "BUG_READY" && g.task.id === "C2-T1", JSON.stringify([g.outcome, g.reason]));
    check("30 the gate passes the cycle's own context", g.context?.current_cycle?.cycle === 2 && /screensaver/.test(g.context.current_cycle.fix_design_delta) && g.context.current_cycle.failed_build === "atv-202" && /mandatory acceptance evidence/.test(g.context.current_cycle.verification_delta));
    const t1 = bugGate({ root: one.root, work: W, task: "T1", qaRepo: QA });
    check("31 T1 is history — not current-cycle work once Cycle 2 begins", t1.ok === false && t1.outcome === "BUG_TASK_NOT_CURRENT", JSON.stringify([t1.outcome, t1.reason]));
    check("32 a Cycle 3 task is blocked before Cycle 3 exists", bugGate({ root: one.root, work: W, task: "C3-T1", qaRepo: QA }).outcome === "BUG_TASK_FUTURE_CYCLE");
    check("32 an unknown cycle-2 task is unknown", bugGate({ root: one.root, work: W, task: "C2-T9", qaRepo: QA }).outcome === "BUG_TASK_UNKNOWN");

    const statePath = stateFilePath(one.root, W);
    const before = JSON.parse(readFileSync(statePath, "utf-8"));
    writeFileSync(join(one.root, TEST_FILE), "// cycle 2 test\n");
    const start = writeTaskState(one.root, W, "C2-T1", "in-progress", { platform: "android" } as any, one.plan, { mode: "start" });
    check("25 cycle-2 work writes to the same task-state file", start.status === "written" && start.path === statePath && readdirSync(dirname(statePath)).filter((f) => f.endsWith(".json")).length === 1, JSON.stringify(start));
    const cp = (kind: string, payload: unknown) => writeCheckpoint(one.root, W, "C2-T1", start.runId as string, kind, payload, one.plan);
    const planCp = cp("plan", { expectedFiles: [TEST_FILE], steps: [
      { id: "s1", description: "test from the cycle delta", files: [TEST_FILE], basis: ["plan#cycle-2", "row"] },
      { id: "s2", description: "test from the shared root cause", files: [TEST_FILE], basis: ["plan#root-cause"] },
    ] });
    check("35 checkpoints cite the cycle's anchor (plan#cycle-2)", planCp.status === "written" && cp("step", { stepId: "s1" }).status === "written" && cp("step", { stepId: "s2" }).status === "written", JSON.stringify(planCp));
    const r1 = resumeTask(one.root, W, "C2-T1", one.plan);
    check("33 resume works in Cycle 2", r1.status === "resume" && r1.checkpoints.valid.length === 2, JSON.stringify([r1.status, r1.summary]));
    const text = readFileSync(one.plan, "utf-8");
    writeFileSync(one.plan, text.replace("also re-attach the surface when the screensaver dismisses", "re-attach on every resume path"));
    const r2 = resumeTask(one.root, W, "C2-T1", one.plan);
    check("36 a Cycle 2 edit invalidates only the work built on plan#cycle-2", r2.checkpoints.invalidated.some((c) => c.stepId === "s1") && r2.checkpoints.valid.includes("s2"), JSON.stringify(r2.checkpoints));
    const st = readTaskState(one.root, W, one.plan);
    check("36 …and never Cycle 1's completed work", st.tasks.T1.deterministicProof === true && st.tasks.T2.deterministicProof === true);
    writeFileSync(one.plan, text.replace("the discounted subtotal is computed but never read.", "the surface is dropped on pause."));
    const r3 = resumeTask(one.root, W, "C2-T1", one.plan);
    check("37 a Root Cause change invalidates only the work citing plan#root-cause", r3.checkpoints.invalidated.some((c) => c.stepId === "s2") && r3.checkpoints.valid.includes("s1"), JSON.stringify(r3.checkpoints));
    writeFileSync(one.plan, text);
    const rs = writeTaskState(one.root, W, "C2-T1", "in-progress", { platform: "android" } as any, one.plan, { mode: "restart" });
    check("34 restart works in Cycle 2", rs.status === "written" && rs.runId === "C2-T1-attempt-2", JSON.stringify(rs));
    writeTaskState(one.root, W, "C2-T1", "complete", { platform: "android", filesChanged: [TEST_FILE], standardIds: [], validation: [{ command: CMD, result: "pass" }], acceptanceCriteria: [{ criterion: "The test fails on the current code for the failed re-test path", met: true }], developerTesting: DT(CMD), deviations: [], blockers: [] } as any, one.plan);
    const mid = bugWorkStatus({ root: one.root, work: W });
    check("27 current-cycle completion counts only Cycle 2's tasks", mid.ok === true && JSON.stringify(mid.tasks) === '["C2-T1","C2-T2"]' && JSON.stringify(mid.remaining) === '["C2-T2"]' && mid.all_complete === false && JSON.stringify(mid.history) === '["T1","T2"]', JSON.stringify(mid));
    writeFileSync(join(one.root, FIX_FILE), "// cycle 2 fix\n");
    complete(one.root, one.plan, "C2-T2", [REPRO2, "C2-T1 passes"], true);
    const done = bugWorkStatus({ root: one.root, work: W });
    check("27 the cycle is complete once its own tasks are", done.all_complete === true && done.next_action === "/review-code --bug BUG-44");
    const after = JSON.parse(readFileSync(statePath, "utf-8"));
    check("26 Cycle 1's records are intact in the same store", JSON.stringify(after.tasks.T1) === JSON.stringify(before.tasks.T1) && JSON.stringify(after.tasks.T2) === JSON.stringify(before.tasks.T2) && after.feature === W);
  }

  /* ── 38–42. review and handoff bind to the current cycle ───────────────── */
  {
    check("39 review-c1.md cannot satisfy Cycle 2", verifyReviewRecord({ root: one.root, work: W }).status === "missing" && existsSync(join(one.root, "docs/bugs/BUG-44/review-c1.md")));
    const ctx = reviewContext({ root: one.root, work: W });
    check("38 the review context is Cycle 2's", ctx.ok === true && ctx.fix_cycle === 2 && ctx.record_path === "docs/bugs/BUG-44/review-c2.md" && JSON.stringify(ctx.tasks.map((t: any) => t.id)) === '["C2-T1","C2-T2"]', JSON.stringify([ctx.outcome, ctx.record_path]));
    const w = review(one.root);
    check("38 /review-code --bug writes review-c2.md", w.record_path === "docs/bugs/BUG-44/review-c2.md" && existsSync(join(one.root, "docs/bugs/BUG-44/review-c2.md")) && verifyReviewRecord({ root: one.root, work: W }).status === "fresh");
    const old = verifyHandoff({ root: one.root, work: W });
    check("41 the cycle-1 handoff approval is invalid for Cycle 2", old.status === "stale", JSON.stringify(old));
    const k = handoffCheck({ root: one.root, work: W, qaRepo: QA });
    check("40 the handoff gate checks Cycle 2 (the reopen is reconciled)", k.ok === true && k.next === "generate", JSON.stringify(k.blockers));
    const g = generateHandoff({ root: one.root, work: W, qaRepo: QA, date: "2026-10-07", buildInstructions: BUILD });
    const h = readFileSync(join(one.root, "docs/qa/bug-BUG-44-qa-handoff.md"), "utf-8");
    check("40 /create-dev-qa-notes regenerates the handoff for Cycle 2", g.ok === true && /^fix_cycle: 2$/m.test(h) && /^review_link: docs\/bugs\/BUG-44\/review-c2\.md$/m.test(h) && /^status: draft$/m.test(h), JSON.stringify(g));
    check("40 it carries the failed prior fix and the cycle's verification delta", /\*\*Previous fix \(cycle 1\):\*\* build atv-202 failed on android-tv/.test(h) && /\*\*Verification delta:\*\*/.test(h) && /screensaver/.test(h));
    check("40 Developer Verification is the current cycle's tasks", /`C2-T1` — complete/.test(h) && /`C2-T2` — complete/.test(h) && !/`T1` — complete/.test(h));
    check("42 the Fix Claim points QA at the new build", h.includes("`/register-build <build-id> --fixes bug:BUG-44 --surfaces android-tv`") && /supersedes/i.test(h));
    const ap = approveHandoff({ root: one.root, work: W, qaRepo: QA, by: "dana", ackMajors: [] });
    check("41 Cycle 2 needs, and gets, its own handoff approval", ap.ok === true && verifyHandoff({ root: one.root, work: W }).status === "ready-for-qa", JSON.stringify(ap));
  }

  /* ── 17 states after handoff; 45 Cycle 3 only after a new verified reopen ── */
  {
    git(one.root, "add", "-A");
    git(one.root, "commit", "-qm", "cycle 2");
    const handed = S(one.root);
    check("17 after the handoff the same reopen is reported, not re-cycled", handed?.outcome === "BUG_CYCLE_HANDED_OFF" && handed.proceed === null, show(handed));
    const delivered = S(one.root, QA_DELIVERED);
    check("17 a fix awaiting QA re-test is QA's to act on", delivered?.outcome === "BUG_QA_DENIED" && delivered.intake.status === "awaiting_qa_retest");
    const before = readFileSync(one.plan, "utf-8");
    const s4 = S(one.root, QA_REOPENED2);
    check("45 a new verified reopen (atv-206 failed) starts Cycle 3", s4?.outcome === "BUG_CYCLE_NEW" && s4.next_cycle === 3, show(s4));
    const a3 = APPEND(one.root, QA_REOPENED2);
    const planC3 = readFileSync(one.plan, "utf-8");
    check("45 Cycle 3 is appended", a3?.ok === true && a3.cycle === 3 && /^fix_cycle: 3$/m.test(planC3) && /### Cycle 3\n\n- \*\*Failed build:\*\* atv-206/.test(planC3), show(a3));
    check("9 Cycles 1 and 2 are preserved byte for byte", anchors(before).tasks === anchors(planC3).tasks && anchors(before)["cycle-2"] === anchors(planC3)["cycle-2"]);
    check("13 Cycle 3 records both prior failed claims", /- \*\*Previous fix claim:\*\* atv-206 — failed \(the cycle 2 fix\); earlier: atv-202 failed/.test(planC3));
    const partial2 = join(TMP, "qa-partial-2");
    cpSync(QA_REOPENED2, partial2, { recursive: true });
    rmSync(join(partial2, "bugs/BUG-44/bug.md"));
    const p = S(one.root, partial2);
    check("18 a partial context never starts (or re-starts) a cycle", p?.outcome !== "BUG_CYCLE_NEW" && APPEND(one.root, partial2)?.ok === false);
  }

  /* ── 17 (class B): changed evidence refreshes the analysis first ───────── */
  {
    const b = cycle1();
    const before = readFileSync(b.plan, "utf-8");
    const sb = S(b.root, QA_CHANGED);
    check("17 changed evidence is classified as changed", sb?.outcome === "BUG_CYCLE_NEW" && sb.evidence_class === "changed" && JSON.stringify(sb.drift) === '["bug_evidence_fingerprint"]', show(sb));
    const ab = APPEND(b.root, QA_CHANGED);
    const after = readFileSync(b.plan, "utf-8");
    check("17 the evidence is refreshed before the cycle is appended", ab?.ok === true && after.includes("bug_evidence_fingerprint: sha256:292b862d2e89de1044456c666231edde24926dcccfebbc4fa13e0768a6ca12fa") && /\*Refreshed for Cycle 2/.test(after), show(ab));
    check("17 prior evidence is preserved in the new cycle", /- \*\*Evidence change:\*\* `sha256:77e5143c[0-9a-f]+` → `sha256:292b862d[0-9a-f]+`/.test(after) && after.slice(after.indexOf("### Cycle 2")).includes("> "));
    check("9 cycle 1 is still byte-identical", anchors(before).tasks === anchors(after).tasks);
    const filledB = fillCycle(after, 2);
    writeFileSync(b.plan, filledB);
    check("17 a refreshed plan no longer drifts from intake", CHECK(b.root, QA_CHANGED)?.ok === true, show(CHECK(b.root, QA_CHANGED)));
  }

  /* ── 46–50. scope ─────────────────────────────────────────────────────── */
  {
    const after = [QA, QA_DELIVERED, QA_REOPENED2, QA_CHANGED].map(snapshot);
    check("46 no QA repository is written", JSON.stringify(after) === JSON.stringify(qaSnaps));
    for (const f of ["scripts/analyze-bug.ts", "scripts/bug-implementation.ts", "scripts/bug-review.ts", "scripts/qa-handoff-gate.ts"]) {
      const src = read(f).replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      check(`46/47/48 ${f}: no QA writes, no Inspector, no process, no commit`, !/qa-ledger\.mjs|ono-plugin-qa|project-inspector|child_process|execFile|spawn/.test(src));
    }
    const PINNED: Record<string, string> = {
      "commands/analyze-feature.md": "42f3b7f1fbd91e9110e15877b3f746312926958ccf53f28dfc3ee76879e70051",
      "commands/dev-design-start.md": "f62963b1d156f4d9b22cd1d92678d4de25f0d66d7120801d62075d14ec8b9ca8",
      "commands/dev-feature-start.md": "0713797d25d66df5064424ffd0dcf4269fead926512c2c40dd2eb9350abce175",
      "commands/prepare-mobile-release.md": "7f7d431309a77e4af4f7485b236cf2205616f2afed3b06de94cf2a0acbf327e4",
      "templates/qa-handoff-template.md": "3203b0e0ffd0a3e0c67044cc18dcdaf752047a2c61f1e5cd7538cf1b16cfb564",
      "scripts/qa-release-gate.ts": "88f016631998c356936fb7e04984c7c84f111390a7561a1766a3b383380e636a",
    };
    for (const [f, h] of Object.entries(PINNED)) check(`49 ${f} is unchanged`, sha(readFileSync(join(REPO_ROOT, f))) === h);
    check("49 a feature id is never a bug, and feature task ids are unchanged", parseBreakdown("| T3 | a | android | x | T1, C2-T1 | S | y |\n")["T3"].dependsOn.join() === "T1,C2-T1" && stateFilePath("/r", "checkout").endsWith("docs/tasks/checkout-task-state.json"));
    const cmd = read("commands/analyze-bug.md");
    check("the command appends cycles only from a verified reopen", cmd.includes('scripts/analyze-bug.ts" append-cycle') && ["BUG_CYCLE_NEW", "BUG_REOPEN_UNVERIFIED", "BUG_REOPEN_UNMATCHED", "BUG_CYCLE_HANDED_OFF"].every((o) => cmd.includes(`\`${o}\``)) && /verified reopen/i.test(cmd));
    check("the command never rewrites history", /never (edit|rewrite)s? an earlier cycle/i.test(cmd));
    check("48 the commands never commit", /never creates? a git commit/i.test(read("commands/implement-task.md")) && /never creates? a git commit/i.test(read("commands/create-dev-qa-notes.md")));
    check("the suite is registered", read("scripts/check.ts").includes('"bug-fix-cycles"'));
    const contract = read("docs/bug-work-plan-contract.md");
    check("the contract documents fix cycles", /### Cycle <n>/.test(contract) && /Verification delta/.test(contract) && /BUG_CYCLE_NEW/.test(contract));
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall bug-fix-cycles checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
