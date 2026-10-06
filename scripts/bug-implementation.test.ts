/**
 * bug-implementation.test.ts
 *
 * Pins Bug Development Flow Step 5: `/implement-task bug:<bug_key> <task>` executes a task
 * from an approved Bug Work Plan on the existing implementation engine — the same command,
 * task-row machinery, task-state store, checkpoints, resume, developer-testing lifecycle and
 * platform lanes the feature flow uses. scripts/bug-implementation.ts is the bug gate; the
 * feature path is pinned unchanged section by section.
 *
 *   node --no-warnings scripts/bug-implementation.test.ts
 */

import { execFileSync, spawnSync } from "child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as Impl from "./bug-implementation.ts";
import { lookupQaBug, evidenceFingerprint } from "./bug-intake.ts";
import { approveWorkPackage } from "./work-approval.ts";
import { abandonTask, fingerprintRow, parseBreakdown, readTaskState, resumeTask, stateFilePath, walkDependencies, writeCheckpoint, writeTaskState } from "./task-state.ts";
import { currentBasis, resolveDocs, isStoreArtifact } from "./task-resume.ts";
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
const api = Impl as any;
const show = (r: any) => JSON.stringify([r?.outcome ?? r?.status, r?.reason ?? r?.summary, r?.route]);
const W = "bug:BUG-43";
const REPRO = "The reported reproduction path no longer fails: with SAVE10 applied, checkout shows the discounted total";

/** The fixture plan, with T2 made the fix task (its first criterion is the reproduction path). */
const PLAN = PLAN_FIXTURE.replace("| T1 | S | T1's test passes; existing totals tests pass |", `| T1 | S | ${REPRO}; T1's test passes |`);

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "bug-impl-")));
let n = 0;
function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf-8" }).trim();
}
/** A committed repository with an approved (or not) Bug Work Plan and the source it names. */
function repo(plan: string = PLAN, approve = true, key = "BUG-43"): { root: string; plan: string } {
  const root = join(TMP, `repo-${++n}`);
  const p = join(root, `docs/bugs/${key}/bug-work-plan.md`);
  mkdirSync(dirname(p), { recursive: true });
  mkdirSync(join(root, "app/src/main/java/com/acme/checkout"), { recursive: true });
  mkdirSync(join(root, "app/src/test/java/com/acme/checkout"), { recursive: true });
  writeFileSync(join(root, "app/src/main/java/com/acme/checkout/CheckoutTotals.kt"), "fun total() = 0\n");
  writeFileSync(join(root, "app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt"), "// tests\n");
  writeFileSync(p, plan);
  if (approve) approveWorkPackage(p, { by: "dana" });
  git(root, "init", "-q", "-b", "fix/bug-43");
  git(root, "config", "user.email", "t@t");
  git(root, "config", "user.name", "t");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "fixture");
  return { root, plan: p };
}
/** A plan for another QA bug, its identity and evidence taken from current intake. */
function planFor(id: string, qa = QA): string {
  const it = lookupQaBug(qa, id);
  const fx = it.identity;
  return PLAN.replace("bug_key: BUG-43", `bug_key: ${id}`)
    .replace("qa_bug_id: BUG-43", `qa_bug_id: ${id}`)
    .replace("external_ref: PAY-1182", `external_ref: ${fx.external_ref ?? "null"}`)
    .replace("found_in_build: and-201", `found_in_build: ${fx.found_in_build ?? "null"}`)
    .replace("surfaces: [android]", `surfaces: [${fx.surfaces.join(", ")}]`)
    .replace("related_feature: checkout-coupons", `related_feature: ${fx.related_feature ?? "null"}`)
    .replace(/^bug_evidence_fingerprint: .*$/m, `bug_evidence_fingerprint: ${it.bug_evidence_fingerprint}`);
}
function repoFor(id: string, plan: string): { root: string; plan: string } {
  return repo(plan.replace(/BUG-43/g, id), true, id);
}
const G = (req: Record<string, unknown>) => api.bugGate?.(req);
const tasksSection = (text: string) => text.slice(text.indexOf("\n## Tasks\n"), text.indexOf("\n## Fix Cycles\n"));

const DT_OK = (cmd: string) => ({ framework: "junit", required: true, testsChanged: ["app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt"], justification: null, runs: [{ command: cmd, result: "pass" }], notRunReason: null });
function completion(extra: Record<string, unknown> = {}, criteria: string[] = [REPRO, "T1's test passes"]) {
  const cmd = "./gradlew test --tests CheckoutTotalsTest";
  return {
    platform: "android",
    filesChanged: ["app/src/main/java/com/acme/checkout/CheckoutTotals.kt"],
    standardIds: [],
    validation: [{ command: cmd, result: "pass" }],
    acceptanceCriteria: criteria.map((c) => ({ criterion: c, met: true })),
    developerTesting: { ...DT_OK(cmd), regression: { command: cmd, failedBefore: true, passesAfter: true } },
    deviations: [],
    blockers: [],
    ...extra,
  };
}

try {
  const qaBefore = (() => {
    const out: string[] = [];
    const walk = (d: string) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(join(d, e.name)) : out.push(`${join(d, e.name)}:${sha(readFileSync(join(d, e.name)))}`)));
    walk(QA);
    return out.sort().join("\n");
  })();

  /* ── 2, 8, 13, 25, 26. the gate on a current approved plan ─────────────── */
  {
    const { root, plan } = repo();
    const g = G({ root, work: W, task: "T2", qaRepo: QA });
    check("8 a current, approved Bug Work Plan is accepted", g?.ok === true && g.outcome === "BUG_READY", show(g));
    check("2 bug:<key> resolves docs/bugs/<key>/bug-work-plan.md as the sole planning document", g?.plan_path === "docs/bugs/BUG-43/bug-work-plan.md" && g.plan_abs === plan && g.work_id === W);
    check("2 no feature analysis, DD, dev plan or feature breakdown is needed", !("dd" in (g ?? {})) && g?.breakdown_path === plan);
    const text = readFileSync(plan, "utf-8");
    const viaTaskState = parseBreakdown(tasksSection(text));
    const line = text.split("\n").find((l) => l.startsWith("| T2 |")) as string;
    check("13 the task row is parsed by task-state's parseBreakdown", g?.task?.id === "T2" && g.task.fingerprint === viaTaskState.T2.fingerprint);
    check("15 the row fingerprint is the existing fingerprintRow", g?.task?.fingerprint === fingerprintRow(line));
    check("14 dependencies come from the row", JSON.stringify(g?.task?.depends_on) === '["T1"]');
    check("10 acceptance criteria are the plan row's, verbatim", JSON.stringify(g?.task?.acceptance_criteria) === JSON.stringify([REPRO, "T1's test passes"]), JSON.stringify(g?.task?.acceptance_criteria));
    check("routing comes from the plan: platform and device type", g?.platform === "android" && g.device_type === "mobile");
    check("25 the Fix Design non-goals reach the implementation context", g?.context?.non_goals === "coupon validation, cart badge, tax rounding.");
    check("25 …and Root Cause, Fix Design and Verification Strategy", /discounted subtotal is computed but never read/.test(g?.context?.root_cause ?? "") && /Minimal change surface/.test(g?.context?.fix_design ?? "") && /Regression test/.test(g?.context?.verification_strategy ?? ""));
    check("26 the reproduction evidence and observed vs expected reach it", /apply coupon SAVE10/i.test(g?.context?.reproduction ?? "") && /Total shows the full price/.test(g?.context?.observed_vs_expected ?? ""));
    check("26 …with the bug identity, surfaces, capability and Project Knowledge reference",
      g?.context?.bug?.bug_key === "BUG-43" && JSON.stringify(g.context.bug.surfaces) === '["android"]' && "capability" in g.context.bug && typeof g.context.repo_knowledge_reference === "string" && g.context.repo_knowledge_reference.length > 0);
    check("27 the bug developer-testing expectations are stated", Array.isArray(g?.expectations) && g.expectations.some((e: string) => /reproduction path/.test(e)) && g.expectations.some((e: string) => /regression test.*fail.*before.*pass/i.test(e)) && g.expectations.some((e: string) => /VERIFY-4/.test(e)));
    check("the bug task-state file is reported", g?.state_path === "docs/tasks/bugs/BUG-43.task-state.json");
    check("the gate reads only — nothing is written", !existsSync(join(root, "docs/tasks")) && git(root, "status", "--porcelain") === "");
  }

  /* ── 3–7. plan and approval gates ─────────────────────────────────────── */
  {
    const empty = join(TMP, "empty");
    mkdirSync(empty, { recursive: true });
    const u = G({ root: empty, work: "bug:BUG-99", task: "T1", qaRepo: QA });
    check("3 an unknown bug (no plan) is blocked and routed to /analyze-bug", u?.ok === false && u.outcome === "BUG_PLAN_MISSING" && /\/analyze-bug/.test(u.route ?? ""), show(u));
    check("3 an unsafe bug key is refused before any read", G({ root: empty, work: "bug:../etc", task: "T1" })?.outcome === "BUG_WORK_ID_INVALID");
    check("1 a work id without bug: is not bug work (never inferred from naming)", G({ root: empty, work: "BUG-43", task: "T1" })?.outcome === "BUG_WORK_ID_INVALID");

    const inv = repo(PLAN.replace("## Root Cause\n", "## Cause\n"), false);
    const i = G({ root: inv.root, work: W, task: "T1", qaRepo: QA });
    check("4 an invalid Bug Work Plan is blocked", i?.outcome === "BUG_PLAN_INVALID" && i.ok === false && /\/analyze-bug/.test(i.route ?? ""), show(i));
    const draft = repo(PLAN, false);
    const d = G({ root: draft.root, work: W, task: "T1", qaRepo: QA });
    check("5 a draft Bug Work Plan is blocked — approval first", d?.outcome === "BUG_PLAN_NOT_APPROVED" && d.route === `/analyze-bug qa=BUG-43,external=PAY-1182 --qa-repo=${QA}`, show(d));
    const st = repo();
    writeFileSync(st.plan, readFileSync(st.plan, "utf-8").replace("the discounted subtotal is computed but never read.", "the coupon is dropped."));
    const s = G({ root: st.root, work: W, task: "T1", qaRepo: QA });
    check("6 a stale approval (plan edited after approval) is blocked, never re-approved", s?.outcome === "BUG_APPROVAL_STALE" && /\/analyze-bug/.test(s.route ?? "") && /status: approved/.test(readFileSync(st.plan, "utf-8")), show(s));
    const cyc = repo();
    writeFileSync(cyc.plan, readFileSync(cyc.plan, "utf-8").replace("approved_cycle: 1\n", "approved_cycle: 2\n"));
    const c = G({ root: cyc.root, work: W, task: "T1", qaRepo: QA });
    check("7 approved_cycle != fix_cycle is blocked", c?.outcome === "BUG_APPROVAL_STALE" && c.reasons.some((r: any) => r.code === "APPROVAL_CYCLE_MISMATCH"), show(c));
    const ok = repo();
    check("8 the evidence source is required to re-read intake — never guessed", G({ root: ok.root, work: W, task: "T1" })?.outcome === "BUG_EVIDENCE_SOURCE_REQUIRED");
  }

  /* ── 9–12. evidence freshness through bug intake ──────────────────────── */
  {
    const drift = repo(PLAN.replace(/^bug_evidence_fingerprint: .*$/m, `bug_evidence_fingerprint: sha256:${"a".repeat(64)}`));
    const g = G({ root: drift.root, work: W, task: "T1", qaRepo: QA });
    check("9 a material change in the bug evidence blocks as stale", g?.outcome === "BUG_EVIDENCE_STALE" && JSON.stringify(g.drift) === '["bug_evidence_fingerprint"]' && /\/analyze-bug/.test(g.route ?? ""), show(g));
    const ext = repo(PLAN.replace("external_ref: PAY-1182", "external_ref: PAY-9").replace("bug_key: BUG-43", "bug_key: BUG-43"));
    check("9 an identity change (external ref) blocks as stale", G({ root: ext.root, work: W, task: "T1", qaRepo: QA })?.outcome === "BUG_EVIDENCE_STALE");

    for (const [id, status] of [["BUG-41", "needs_qa_verification"], ["BUG-46", "awaiting_qa_retest"], ["BUG-45", "closed"]] as const) {
      const r = repoFor(id, planFor(id));
      const d = G({ root: r.root, work: `bug:${id}`, task: "T1", qaRepo: QA });
      check(`10 a verified QA denial after approval (${status}) blocks`, d?.outcome === "BUG_QA_DENIED" && d.ok === false && d.intake_status === status, show(d));
    }
    const ro = repoFor("BUG-44", planFor("BUG-44"));
    const reo = G({ root: ro.root, work: "bug:BUG-44", task: "T1", qaRepo: QA });
    check("12 a reopened bug routes back to /analyze-bug — no cycle is created here", reo?.outcome === "BUG_REOPENED" && reo.route === `/analyze-bug qa=BUG-44 --qa-repo=${QA}` && reo.reopened?.failed_fix_build === "atv-202", show(reo));
    check("34 …and the plan is untouched (no Cycle 2)", !/### Cycle 2/.test(readFileSync(ro.plan, "utf-8")));

    // 11 — full → partial: the view disappears; the evidence is identical, found_in_build is merely unknown now.
    const qaPartial = join(TMP, "qa-partial");
    cpSync(QA, qaPartial, { recursive: true });
    rmSync(join(qaPartial, "bugs/BUG-43/bug.md"));
    const full = repo();
    const p = G({ root: full.root, work: W, task: "T1", qaRepo: qaPartial });
    check("11 full → partial context with the same evidence does not block", p?.ok === true && p.outcome === "BUG_READY" && p.context_level === "partial", show(p));
    check("11 …and says so", p?.warnings?.some((w: any) => w.code === "QA_STATE_UNAVAILABLE") && p.warnings.some((w: any) => w.code === "FOUND_IN_BUILD_UNVERIFIED"));
    // partial → full: a plan approved with found_in_build unknown, read now with QA's view.
    const it = lookupQaBug(QA, "BUG-43");
    const partialFp = evidenceFingerprint({ ...it.evidence, surfaces: it.identity.surfaces, found_in_build: null });
    const pf = repo(PLAN.replace("found_in_build: and-201", "found_in_build: null").replace(/^bug_evidence_fingerprint: .*$/m, `bug_evidence_fingerprint: ${partialFp}`));
    const f = G({ root: pf.root, work: W, task: "T1", qaRepo: QA });
    check("11 partial → full context with the same evidence does not block", f?.ok === true && f.outcome === "BUG_READY" && f.context_level === "full", show(f));
    check("11 a found_in_build that contradicts the plan is a material change", G({ root: repo(PLAN.replace("found_in_build: and-201", "found_in_build: and-999")).root, work: W, task: "T1", qaRepo: QA })?.outcome === "BUG_EVIDENCE_STALE");
  }

  /* ── 13–24. task-state, resume, basis ─────────────────────────────────── */
  {
    const { root, plan } = repo(PLAN.replace("## Open Questions\n\n- None.", "## Open Questions\n\n| id | question |\n|---|---|\n| T9 | not a task |"));
    const r0 = readTaskState(root, W, plan);
    check("13 only the Tasks section's rows are tasks (a T-id table elsewhere is not)", JSON.stringify(Object.keys(r0.tasks).sort()) === '["T1","T2"]', JSON.stringify(Object.keys(r0.tasks)));
    check("14 a dependency on an unproven task is reported by the existing walk", walkDependencies(r0.tasks, "T2").length > 0);

    // 16 — no feature id can ever name the bug state file.
    const bugPath = stateFilePath(root, W);
    check("16 bug state lives at docs/tasks/bugs/<key>.task-state.json", bugPath === join(root, "docs/tasks/bugs/BUG-43.task-state.json"));
    for (const f of ["bug-BUG-43", "bugs/BUG-43", "bugs/BUG-43.task-state", "BUG-43", "bug_BUG-43", "bugs/BUG-43.task-state.json"]) {
      check(`16 feature "${f}" cannot collide with bug state`, stateFilePath(root, f) !== bugPath && stateFilePath(root, f).endsWith("-task-state.json"));
    }
    check("1 a feature id keeps its path exactly", stateFilePath(root, "checkout") === join(root, "docs/tasks/checkout-task-state.json"));
    check("16 the bug store is the plugin's own artifact", isStoreArtifact("docs/tasks/bugs/BUG-43.task-state.json") && isStoreArtifact("docs/tasks/checkout-task-state.json") && !isStoreArtifact("docs/tasks/bugs/x.md"));

    const head = git(root, "rev-parse", "HEAD");
    const start = writeTaskState(root, W, "T1", "in-progress", { platform: "android", head } as any, plan, { mode: "start" });
    check("17 a bug task starts a run through the existing writer", start.status === "written" && start.runId === "T1-attempt-1", JSON.stringify(start));
    const file = JSON.parse(readFileSync(bugPath, "utf-8"));
    const featureRoot = repo();
    writeTaskState(featureRoot.root, "checkout", "T1", "in-progress", { platform: "android" } as any, featureRoot.plan, { mode: "start" });
    const featureFile = JSON.parse(readFileSync(stateFilePath(featureRoot.root, "checkout"), "utf-8"));
    check("17 the bug store uses the existing schema (same top-level shape and version)", JSON.stringify(Object.keys(file).sort()) === JSON.stringify(Object.keys(featureFile).sort()) && file.taskStateSchemaVersion === featureFile.taskStateSchemaVersion && file.feature === W, JSON.stringify(Object.keys(file)));
    check("17 …and the existing execution record", typeof file.tasks.T1.execution?.baseline?.head === "string" && file.tasks.T1.execution.runId === "T1-attempt-1");
    check("16 the feature store did not move", existsSync(join(featureRoot.root, "docs/tasks/checkout-task-state.json")));

    // 21–22 — checkpoints cite Bug Work Plan sections.
    const docs = resolveDocs(root, plan);
    const basis = currentBasis(docs, "T1", parseBreakdown(tasksSection(readFileSync(plan, "utf-8"))).T1.fingerprint);
    check("22 currentBasis cites Bug Work Plan sections", ["plan", "plan#root-cause", "plan#fix-design", "plan#verification-strategy", "plan#tasks", "evidence", "row"].every((k) => typeof basis[k] === "string"), Object.keys(basis).join(","));
    check("22 the evidence basis is the plan's bug_evidence_fingerprint", basis.evidence === "sha256:95d68ae65a0758e098e12de059aec106752c1c4e0e21502486395fefce9633b6");
    const cp = (kind: string, payload: unknown) => writeCheckpoint(root, W, "T1", "T1-attempt-1", kind, payload, plan);
    const planCp = cp("plan", { expectedFiles: ["app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt"], steps: [
      { id: "s1", description: "regression test from the root cause", files: ["app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt"], basis: ["plan#root-cause", "row"] },
      { id: "s2", description: "assertions from the fix design", files: ["app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt"], basis: ["plan#fix-design"] },
    ] });
    check("21 a plan checkpoint citing plan sections is accepted", planCp.status === "written", JSON.stringify(planCp));
    writeFileSync(join(root, "app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt"), "// tests\n@Test fun couponIsApplied() {}\n");
    check("21 step checkpoints are accepted", cp("step", { stepId: "s1" }).status === "written" && cp("step", { stepId: "s2" }).status === "written");
    check("21 a validation citing a plan section is accepted", cp("validation", { command: "./gradlew test", result: "fail", kind: "developer-test", covers: ["app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt"], basis: ["plan#verification-strategy"] }).status === "written");
    check("21 an unknown basis reference is refused", cp("validation", { command: "x", result: "pass", basis: ["dd#root-cause"] }).status === "refused");

    // 18 — resume of the same run.
    const v1 = resumeTask(root, W, "T1", plan);
    check("18 resume works for bug work", v1.status === "resume" && v1.runId === "T1-attempt-1" && v1.checkpoints.valid.length === 2, JSON.stringify([v1.status, v1.summary]));
    check("18 the bug chain is named, not a feature chain", /Bug Work Plan/.test(v1.upstream.summary) && v1.upstream.earliestStale === null);

    // 24 — an unrelated frontmatter change invalidates nothing.
    const original = readFileSync(plan, "utf-8");
    writeFileSync(plan, original.replace("author: android architect", "author: dana").replace("date: 2026-10-06", "date: 2026-10-07"));
    const v2 = resumeTask(root, W, "T1", plan);
    check("24 an unrelated frontmatter change does not invalidate implementation", v2.status === "resume" && v2.checkpoints.invalidated.length === 0 && v2.validations.rerun.length === 0 && v2.upstreamChanged.length === 0, JSON.stringify([v2.status, v2.checkpoints.invalidated, v2.upstreamChanged]));
    // 23 — a Root Cause change invalidates only the work built on it.
    writeFileSync(plan, original.replace("the discounted subtotal is computed but never read.", "the coupon is dropped by the mapper."));
    const v3 = resumeTask(root, W, "T1", plan);
    check("23 a Root Cause change invalidates the work whose basis cites it", v3.checkpoints.invalidated.some((c) => c.stepId === "s1") && v3.checkpoints.valid.includes("s2"), JSON.stringify(v3.checkpoints));
    check("23 …and leaves work on other sections carried", v3.validations.rerun.length === 0 && v3.validations.carried.length === 1, JSON.stringify(v3.validations));
    check("23 …and names the plan as the upstream that moved", v3.upstreamChanged.includes("plan"));
    writeFileSync(plan, original);

    // 19–20 — restart and abandon.
    const rs = writeTaskState(root, W, "T1", "in-progress", { platform: "android" } as any, plan, { mode: "restart" });
    check("19 restart works for bug work", rs.status === "written" && rs.runId === "T1-attempt-2", JSON.stringify(rs));
    const ab = abandonTask(root, W, "T1", "T1-attempt-2", "wrong approach", plan);
    check("20 abandon works for bug work", (ab as any).status === "written" && readTaskState(root, W, plan).tasks.T1.state === "failed", JSON.stringify(ab));
  }

  /* ── 27–28. developer testing and acceptance criteria for bug completion ─ */
  {
    const { root, plan } = repo();
    const head = git(root, "rev-parse", "HEAD");
    const go = (task: string) => writeTaskState(root, W, task, "in-progress", { platform: "android", head } as any, plan, { mode: "start" });
    const done = (task: string, payload: any) => writeTaskState(root, W, task, "complete", payload, plan);
    go("T2");
    const noDt = completion();
    delete (noDt as any).developerTesting;
    check("27 completing a bug task without developer testing is refused", done("T2", noDt).reason === "complete-without-developer-testing");
    const notRequired = completion({ developerTesting: { ...DT_OK("./gradlew test --tests CheckoutTotalsTest"), required: false, justification: "trivial" } });
    const r1 = done("T2", notRequired);
    check("27 the fix task cannot declare developer tests not required", r1.status === "refused" && r1.reason === "invalid-bug-completion", JSON.stringify(r1));
    const notRequiredWithRegression = completion({ developerTesting: { ...DT_OK("./gradlew test --tests CheckoutTotalsTest"), required: false, justification: "trivial", regression: { command: "./gradlew test --tests CheckoutTotalsTest", failedBefore: true, passesAfter: true } } });
    const r1b = done("T2", notRequiredWithRegression);
    check("27 the fix task cannot declare developer tests not required, even with a regression record", r1b.status === "refused" && r1b.reason === "invalid-bug-completion" && /required/.test(r1b.summary), JSON.stringify(r1b));
    const noReg = completion({ developerTesting: DT_OK("./gradlew test --tests CheckoutTotalsTest") });
    const r2 = done("T2", noReg);
    check("28 the fix task needs a regression test that failed before and passes after, or VERIFY-4 debt", r2.status === "refused" && r2.reason === "invalid-bug-completion" && /regression/i.test(r2.summary), JSON.stringify(r2));
    const half = completion({ developerTesting: { ...DT_OK("./gradlew test --tests CheckoutTotalsTest"), regression: { command: "./gradlew test --tests CheckoutTotalsTest", failedBefore: false, passesAfter: true } } });
    check("28 a regression test that never failed before the fix is not a regression test", done("T2", half).reason === "invalid-bug-completion");
    const unrun = completion({ developerTesting: { ...DT_OK("./gradlew test --tests CheckoutTotalsTest"), regression: { command: "./gradlew other", failedBefore: true, passesAfter: true } } });
    check("28 the regression test must be among the runs that actually passed", done("T2", unrun).reason === "invalid-bug-completion");
    const debtOnly = completion({ developerTesting: { ...DT_OK("./gradlew test --tests CheckoutTotalsTest"), regression: { notFeasibleReason: "vendor SDK callback, no test seam" } } });
    check("28 not feasible without VERIFY-4 developer debt is refused", done("T2", debtOnly).reason === "invalid-bug-completion");
    const rewritten = completion({}, ["Checkout shows a total", "T1's test passes"]);
    check("10 the acceptance criteria may not be weakened or rewritten", done("T2", rewritten).reason === "invalid-bug-completion");
    const ok = done("T2", completion());
    check("28 a regression test that failed before and passes after completes the fix task", ok.status === "written" && ok.state === "complete", JSON.stringify(ok));
    go("T1");
    const t1 = writeTaskState(root, W, "T1", "complete", {
      platform: "android", filesChanged: [], standardIds: [], validation: [{ command: "./gradlew test", result: "pass" }],
      acceptanceCriteria: [{ criterion: "The test fails on the current code for the documented reproduction", met: true }],
      developerTesting: { framework: "junit", required: true, testsChanged: ["x.kt"], justification: null, runs: [{ command: "./gradlew test", result: "pass" }], notRunReason: null },
      deviations: [], blockers: [],
    } as any, plan);
    check("28 a non-fix bug task follows the existing developer-testing rules only", t1.status === "written", JSON.stringify(t1));
    const debtRoot = repo();
    writeTaskState(debtRoot.root, W, "T2", "in-progress", { platform: "android" } as any, debtRoot.plan, { mode: "start" });
    const withDebt = writeTaskState(debtRoot.root, W, "T2", "complete", completion({
      developerTesting: { ...DT_OK("./gradlew test --tests CheckoutTotalsTest"), regression: { notFeasibleReason: "vendor SDK callback, no test seam" } },
      verificationDebt: [{ domain: "developer-testing", ruleId: "VERIFY-4", requiredVerification: "regression test for the SDK callback", whyNotAutomatable: "no test seam", owner: "developer", status: "pending" }],
    }) as any, debtRoot.plan);
    check("28 not feasible with VERIFY-4 developer debt completes", withDebt.status === "written", JSON.stringify(withDebt));

    // 12 — completion: the next action once every cycle-1 task is complete.
    const st = api.bugWorkStatus?.({ root, work: W });
    check("12 when every cycle-1 task is complete, the next action is /review-code --bug <key>", st?.all_complete === true && st.next_action === "/review-code --bug BUG-43", JSON.stringify(st));
    const st2 = api.bugWorkStatus?.({ root: debtRoot.root, work: W });
    check("12 …and not before", st2?.all_complete === false && JSON.stringify(st2.remaining) === '["T1"]' && st2.next_action === null, JSON.stringify(st2));
  }

  /* ── 34. cycle 2 is out of scope ─────────────────────────────────────── */
  {
    const { root } = repo();
    check("34 a C2-T1 task is not supported yet", G({ root, work: W, task: "C2-T1", qaRepo: QA })?.outcome === "BUG_TASK_UNSUPPORTED");
    check("34 a task with no row is blocked", G({ root, work: W, task: "T9", qaRepo: QA })?.outcome === "BUG_TASK_UNKNOWN");
    const c2 = readFileSync(join(HERE, "fixtures/bug-work-plans/bwp-cycle2.md"), "utf-8");
    const r = repo(c2.replace(/BUG-44/g, "BUG-43"), false);
    check("34 a plan already at fix cycle 2 is not implemented here", G({ root: r.root, work: W, task: "T1", qaRepo: QA })?.outcome === "BUG_CYCLE_UNSUPPORTED");
  }

  /* ── the command, the lane, and everything that must not move ──────────── */
  const cmd = read("commands/implement-task.md");
  {
    const FEATURE_SECTIONS: Record<string, string> = {
      "2. Resolve one authoritative repository root (via the helper)": "5f4c303483f78d592a5fba83548573aa5d1486af452f0fb396813e6c320503f6",
      "3. Locate the Task Breakdown for the feature": "475698ed8b848323a984e8f65166e1ed5bb5953206a67d41aa7f3c9d4363b90c",
      "4. Resolve the upstream documents from frontmatter (no filename guessing)": "7b28c0d5151c75303c28a6fe1de766d3dd8267800daa6f02b3bdee36b0e2e739",
      "5. Approval & readiness gates": "ba2a44848e3a26f26ff8e7b6e0a36da0d42e9da2ff99b999b449d83b44bd14a1",
      "5a. Consistency preflight (runs on every invocation)": "e520bfadafec8286b28557ead91f78ab5d852773ea87cc8cf9ff9de4c7d4ece7",
      "5b. Accessibility applicability (decide once, from the confirmed context)": "dc940ea9472aafb271c37e2bde34a3f0d289c5d353b79767ac32a439e9f0bee0",
      "6. Task state and dependency completeness (read the store, then decide)": "1b5557e69e6c0d15e7e7f8c98bc4df73c5ef9105a7adabe5f5b8171deb97a3e5",
      "6a. Feature-wide impact report (always printed, blocks only what it must)": "db635a018cc1252cbeda06cc0a77ddb6016401e4b5715c8f9969ea30f4eed26d",
      "7. Platform routing (read from the task row; never re-detect)": "b98a78404b69d00e1f20a05a3fcf4d953cafa723d6e8feaeef0c7c70b78eb0c1",
      "7a. Record `in-progress` before handing off": "19a0d225de80e2ae64a8ed2107dbd9d42ae654e4ad62ec1da48467fa2fb09018",
      "8. Pass explicit resolved context to the selected agent + skill": "ecdb4eddd01892576f0a9f191cf3e2845050b14f611059da23469bed1e5bd470",
      "9. Scope: exactly one task": "ca5739ca52f37ea85acdef8b7f742eed9cf8baedca10adebdef0981ac764e1e6",
      "10. Completion handling (report; do not mutate status)": "1f5a367caf3581e7d42f9e1dbd0ddb4e379588a5601d7828b1f4a1ea22e0392a",
      "Responsibility boundary": "acd92a7f289e84c437f4ba73a9eb2f63f0410779652b8974da4c69e114ec284f",
    };
    const sections = new Map(cmd.split("\n## ").slice(1).map((p) => [p.split("\n")[0], p]));
    for (const [h, hash] of Object.entries(FEATURE_SECTIONS)) check(`1 /implement-task feature section "${h.slice(0, 40)}…" is byte-identical`, sections.has(h) && sha(sections.get(h) as string) === hash);
    const s1 = sections.get("1. Resolve the task identity from `$ARGUMENTS`") ?? "";
    check("1 the feature argument form is still the default", s1.includes("Parse `$ARGUMENTS` as `[feature] [task-id]` (e.g. `biometric-login T3`).") && /no `bug:` prefix.*feature work, exactly as before/i.test(s1));
    check("1 bug work is only ever the explicit bug: prefix", /`bug:<bug_key>`/.test(s1) && /never inferred/i.test(s1));
    const bug = sections.get("1a. Bug work (`bug:<bug_key>`)") ?? "";
    check("2 the bug section resolves the Bug Work Plan as the sole planning document", bug.includes("docs/bugs/<bug_key>/bug-work-plan.md") && /sole planning document/.test(bug));
    check("3 the bug section runs the gate before anything else", bug.includes('scripts/bug-implementation.ts" gate bug:<bug_key> <task-id>') && /BUG_READY/.test(bug));
    for (const o of ["BUG_PLAN_MISSING", "BUG_PLAN_INVALID", "BUG_PLAN_NOT_APPROVED", "BUG_APPROVAL_STALE", "BUG_EVIDENCE_STALE", "BUG_QA_DENIED", "BUG_REOPENED", "BUG_CYCLE_UNSUPPORTED", "BUG_TASK_UNSUPPORTED"]) {
      check(`bug section handles ${o}`, bug.includes(`\`${o}\``));
    }
    check("6 the bug section never re-approves", /never re-?approve/i.test(bug) && /\/analyze-bug/.test(bug));
    check("17 the bug section reuses task-state with the bug work id and the plan as the breakdown", bug.includes('--feature "bug:<bug_key>"') && bug.includes("--breakdown") && /every `<feature>` is `bug:<bug_key>`/.test(bug));
    check("29 the bug section reuses feature-implementer and platform-implementation — no bug agent or lane", bug.includes("`feature-implementer`") && bug.includes("`platform-implementation`") && !readdirSync(join(REPO_ROOT, "agents")).some((f) => /(^|-)bug(-|\.|$)/.test(f)) && !readdirSync(join(REPO_ROOT, "skills")).some((f) => /(^|-)bug(-|$)/.test(f)));
    check("25 the bug section passes non-goals as hard scope limits", /non-goals/i.test(bug) && /hard scope/i.test(bug) && /no unrelated refactoring/i.test(bug));
    check("12 the bug section names the next action after the cycle", bug.includes("/review-code --bug <bug_key>") && bug.includes('scripts/bug-implementation.ts" status'));
    check("14A the bug section never commits — the existing approval gate before any commit stands", /never creates? a git commit/i.test(bug) && /explicit developer approval/i.test(bug));
    check("argument-hint documents the bug form", /^argument-hint: .*bug:<bug_key>/m.test(cmd));
    const lane = read("skills/platform-implementation/SKILL.md");
    const bugLane = lane.slice(lane.indexOf("## Bug work"));
    check("11 the shared implementation methodology carries the minimum bug guidance", lane.includes("## Bug work") && /root cause/i.test(bugLane) && /non-goals/i.test(bugLane) && /regression test/i.test(bugLane) && /reproduction path/i.test(bugLane));
    for (const l of ["rn-feature-implementation", "ios-feature-implementation", "android-feature-implementation", "react-feature-implementation"]) {
      check(`29 the ${l} lane has no bug copy`, !/bug-work-plan|Bug Work Plan/.test(read(`skills/${l}/SKILL.md`)));
    }

    const PINNED: Record<string, string> = {
      "hooks/block-main-branch-changes.json": "89599088f364c9d6dd1af0a0cc7438610bf9b417a9b8e320d2866bf1c6857b2c",
      "hooks/block-main-branch-changes.sh": "771aef6d81d25308edbc77e4cca8c663cf2f05946cfe254fd150e34342636d34",
      "hooks/protect-secrets.json": "e1eaeb813e75d5b80927dcf6630c292c0bc7acd32519349af088dc0994cc00fb",
      "hooks/require-approval-before-code.json": "37f5f2e5dbe97ccac0f432a7b3eacc6f8595b0d2a60ade3674df0f6ec69db043",
      "hooks/require-approval-before-code.sh": "f4333da9c0a95003cf5dd08323e3f702b16d4468edc2bff65230e6468385dcfe",
      "hooks/scan-for-secrets.sh": "be60a1fc569de494c2aa215220cf162eccfe8f6b7fc04ffc5a14d7e6827c67d9",
      // Step 6 extended /review-code with --bug; bug-review.test.ts pins its original body verbatim.
      // Step 7 extended /create-dev-qa-notes with bug:<key>; qa-handoff-gate.test.ts pins its feature body verbatim.
      "templates/qa-handoff-template.md": "3203b0e0ffd0a3e0c67044cc18dcdaf752047a2c61f1e5cd7538cf1b16cfb564",
      "agents/feature-implementer.md": "d53845b5e31d2487754747f89227b0a54fa9d1ed457ae02934b593cce7576023",
      "commands/analyze-feature.md": "42f3b7f1fbd91e9110e15877b3f746312926958ccf53f28dfc3ee76879e70051",
      "commands/dev-design-start.md": "f62963b1d156f4d9b22cd1d92678d4de25f0d66d7120801d62075d14ec8b9ca8",
      "commands/dev-feature-start.md": "0713797d25d66df5064424ffd0dcf4269fead926512c2c40dd2eb9350abce175",
      "commands/prepare-mobile-release.md": "7f7d431309a77e4af4f7485b236cf2205616f2afed3b06de94cf2a0acbf327e4",
    };
    for (const [f, h] of Object.entries(PINNED)) check(`14A/32/33 ${f} is unchanged`, sha(readFileSync(join(REPO_ROOT, f))) === h);
    const src = read("scripts/bug-implementation.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("30 no QA repository writes", !/qa-ledger\.mjs|ono-plugin-qa/.test(src) && !/\b(writeFileSync|appendFile|mkdirSync|rmSync|renameSync|unlinkSync)\b/.test(src));
    check("31 no Inspector or Project Knowledge access", !/project-inspector|\.ono\b|read-repo-knowledge/.test(src));
    check("the gate runs no process and reads no clock", !/child_process|new Date|Date\.now|Math\.random|randomUUID/.test(src));
    check("32 no review artifact is produced", !/review-c\d|docs\/bugs\/[^"]*review/.test(src));
    check("the suite is registered with the check harness", read("scripts/check.ts").includes('"bug-implementation"'));
    const contract = read("docs/task-state-contract.md");
    check("the task-state contract documents bug work", /bug:<bug_key>/.test(contract) && contract.includes("docs/tasks/bugs/<bug_key>.task-state.json") && /plan#/.test(contract) && /invalid-bug-completion/.test(contract));
  }
  check("30 the QA fixture repository is untouched", (() => {
    const out: string[] = [];
    const walk = (d: string) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(join(d, e.name)) : out.push(`${join(d, e.name)}:${sha(readFileSync(join(d, e.name)))}`)));
    walk(QA);
    return out.sort().join("\n");
  })() === qaBefore);

  /* ── CLI ─────────────────────────────────────────────────────────────── */
  {
    const run = (args: string[]) => {
      const p = spawnSync(process.execPath, ["--no-warnings", join(HERE, "bug-implementation.ts"), ...args], { encoding: "utf-8" });
      try {
        return { code: p.status, json: JSON.parse(p.stdout) };
      } catch {
        return { code: p.status, json: null, raw: p.stdout + p.stderr };
      }
    };
    const { root } = repo();
    const g = run(["gate", W, "T1", "--root", root, "--qa-repo", QA]);
    check("CLI gate prints one JSON object, exit 0", g.code === 0 && g.json?.outcome === "BUG_READY", JSON.stringify(g.json?.outcome ?? g.raw));
    const s = run(["status", W, "--root", root]);
    check("CLI status reports the cycle", s.code === 0 && s.json?.all_complete === false);
    const tsCli = spawnSync(process.execPath, ["--no-warnings", join(HERE, "task-state.ts"), "read", "--root", root, "--feature", "bug:../x"], { encoding: "utf-8" });
    check("CLI task-state refuses an unsafe bug work id", JSON.parse(tsCli.stdout).status === "invalid");
    check("CLI an unknown command is refused, exit 0", run(["frobnicate"]).code === 0 && run(["frobnicate"]).json?.ok === false);
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall bug-implementation checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
