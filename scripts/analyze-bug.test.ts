/**
 * analyze-bug.test.ts
 *
 * Pins Bug Development Flow Step 4: `/analyze-bug`, the single entry point that prepares a
 * bug for implementation — intake, routing, Project Knowledge, root cause, fix design,
 * verification, tasks, one Bug Work Plan, one approval. Its deterministic half is
 * scripts/analyze-bug.ts (start · scaffold · check); its judgement half is
 * commands/analyze-bug.md. Both are pinned here, and so is everything this step must not move.
 *
 *   node --no-warnings scripts/analyze-bug.test.ts
 */

import { spawnSync } from "child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as Bug from "./analyze-bug.ts";
import { validateBugWorkPlan, BUG_WORK_PLAN_SECTIONS } from "./bug-work-plan.ts";
import { approveWorkPackage, verifyApproval } from "./work-approval.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const QA = join(HERE, "fixtures/qa-bugs/acme-qa");

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
const show = (r: any) => JSON.stringify([r?.outcome, r?.code, r?.reason ?? r?.error, r?.problems?.map((p: any) => p.code)]);

/** Every file under a directory with its hash — to prove nothing was written. */
function snapshot(dir: string): string {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(`${p.slice(dir.length)}\0${sha(readFileSync(p))}`);
    }
  };
  walk(dir);
  return out.join("\n");
}

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "analyze-bug-")));
let roots = 0;
/** A fresh target repository; `breakdowns` are approved/draft task breakdowns of related features. */
function repo(breakdowns: Array<{ feature: string; status: string; platform?: string; device?: string; name?: string }> = []): string {
  const root = join(TMP, `repo-${++roots}`);
  mkdirSync(join(root, "docs/planning"), { recursive: true });
  for (const b of breakdowns) {
    writeFileSync(join(root, "docs/planning", b.name ?? `${b.feature}-task-breakdown.md`), [
      `# Task Breakdown — ${b.feature}`, "", "```yaml", "doc_schema_version: 1", `feature: ${b.feature}`, "feature_analysis_link: docs/x-analysis.md",
      "dd_link: docs/x-DD.md", "dev_plan_link: docs/x-plan.md", `platform: ${b.platform ?? "android"}`, `device_type: ${b.device ?? "mobile"}`, `status: ${b.status}`, "```", "",
      "| id | description | platform | files touched | depends-on | size | acceptance criteria |", "|---|---|---|---|---|---|---|", "",
    ].join("\n"));
  }
  return root;
}
function report(content: Record<string, unknown>): string {
  const p = join(TMP, `report-${++roots}.json`);
  writeFileSync(p, JSON.stringify(content));
  return p;
}
const EVIDENCE = { title: "Checkout total ignores coupon", steps: ["Add an item to the cart", "Apply coupon SAVE10", "Open checkout"], expected: "Total shows the 10% discount", actual: "Total shows the full price" };
const S = (req: Record<string, unknown>) => api.startBug?.(req);
const SC = (req: Record<string, unknown>) => api.scaffoldPlan?.(req);
const C = (req: Record<string, unknown>) => api.checkPlan?.(req);
const planFile = (root: string, key: string) => join(root, "docs/bugs", key, "bug-work-plan.md");

/** What the architect writes into the scaffold — the judgement half, simulated. */
function fill(text: string, o: { rootCause?: string; regression?: string; firstCriterion?: string; platform?: string } = {}): string {
  let t = text;
  const add = (heading: string, content: string) => {
    const at = t.indexOf(`\n## ${heading}\n`);
    if (at === -1) throw new Error(`no section ${heading}`);
    const end = at + `\n## ${heading}\n`.length;
    t = `${t.slice(0, end)}\n${content}\n${t.slice(end)}`;
  };
  add("Root Cause", o.rootCause ?? "[evidence: app/src/main/java/com/acme/checkout/CheckoutTotals.kt] `total()` sums line prices before the coupon is applied.");
  add("Blast Radius", "- [inference] Only the checkout total; the cart badge reads a separate subtotal.");
  add("Repo Knowledge Reference", "Repository knowledge was not available (absent). All repository context in this document was derived live at authoring time and is a point-in-time observation.");
  add("Open Questions", "- None.");
  const labels: Record<string, string> = {
    "Root-cause fix": "compute the total from the discounted subtotal",
    "Minimal change surface": "one function and its unit test",
    "Affected files / areas": "`app/src/main/java/com/acme/checkout/CheckoutTotals.kt`",
    "Non-goals": "coupon validation, cart badge",
    "No unrelated refactoring": "the totals class is not restructured",
    "Risks": "stacked coupons [inference]",
    "Reproduction path": "add an item, apply SAVE10, open checkout",
    "Developer Testing": "unit test for `CheckoutTotals.total()`",
    "Regression test": o.regression ?? "T1 adds `CheckoutTotalsTest.couponIsApplied`, failing before the fix",
    "Affected surfaces": "android",
    "QA re-test": "QA re-tests on the fix build on android",
    "Verification debt": "none",
  };
  for (const [label, value] of Object.entries(labels)) {
    const re = new RegExp(`^- \\*\\*${label.replace(/[/]/g, "\\/")}:\\*\\*\\s*$`, "m");
    if (!re.test(t)) throw new Error(`no empty label ${label}`);
    t = t.replace(re, `- **${label}:** ${value}`);
  }
  const p = o.platform ?? "android";
  const tasks = t.indexOf("\n## Tasks\n");
  const sep = t.indexOf("|---|---|---|---|---|---|---|\n", tasks) + "|---|---|---|---|---|---|---|\n".length;
  const rows = [
    `| T1 | Add a failing regression test for the coupon total | ${p} | \`app/src/test/CheckoutTotalsTest.kt\` | — | S | The test fails on the current code for the documented reproduction |`,
    `| T2 | Compute the total from the discounted subtotal | ${p} | \`app/src/main/CheckoutTotals.kt\` | T1 | S | ${o.firstCriterion ?? "The reported reproduction path no longer fails: with SAVE10 applied, checkout shows the discounted total"}; T1 passes |`,
  ];
  t = `${t.slice(0, sep)}${rows.join("\n")}\n${t.slice(sep)}`;
  return t;
}

try {
  /* ── 1. QA assigned → a cycle-1 plan ───────────────────────────────────── */
  const root43 = repo([{ feature: "checkout-coupons", status: "approved" }]);
  const qaBefore = snapshot(QA);
  {
    const s = S({ root: root43, ref: "BUG-43", qaRepo: QA });
    check("1 a QA-assigned bug with no plan starts a new plan", s?.outcome === "BUG_PLAN_NEW" && s.ok === true && s.proceed === "create", show(s));
    check("1 the intake result is carried verbatim", s?.intake?.status === "ready_for_dev" && s.intake.identity.bug_key === "BUG-43" && s.intake.context_level === "full");
    check("1 the plan path is docs/bugs/<bug_key>/bug-work-plan.md", s?.plan_path === "docs/bugs/BUG-43/bug-work-plan.md" && s.plan_exists === false);
    const sc = SC({ root: root43, ref: "BUG-43", qaRepo: QA, author: "android architect", date: "2026-10-06" });
    check("1 scaffold writes the draft plan", sc?.ok === true && sc.outcome === "SCAFFOLDED" && existsSync(planFile(root43, "BUG-43")), show(sc));
    const text = readFileSync(planFile(root43, "BUG-43"), "utf-8");
    const v = validateBugWorkPlan(Buffer.from(text));
    check("27 the plan begins as draft", v.frontmatter?.status === "draft" && /^status: draft$/m.test(text));
    check("1 the identity is intake's, verbatim", v.frontmatter?.bug_key === "BUG-43" && v.frontmatter.qa_bug_id === "BUG-43" && v.frontmatter.external_ref === "PAY-1182" &&
      v.frontmatter.origin === "qa-standalone" && v.frontmatter.found_in_build === "and-201" && JSON.stringify(v.frontmatter.surfaces) === '["android"]' &&
      v.frontmatter.related_feature === "checkout-coupons" && v.frontmatter.bug_evidence_fingerprint === s.intake.bug_evidence_fingerprint && v.frontmatter.fix_cycle === 1, JSON.stringify(v.frontmatter));
    check("15 the routing inherited from the related feature's approved breakdown is recorded", v.frontmatter?.platform === "android" && v.frontmatter.device_type === "mobile");
    check("23 the scaffold has every fixed section, in order", JSON.stringify([...text.matchAll(/^## (.+)$/gm)].map((m) => m[1])) === JSON.stringify(BUG_WORK_PLAN_SECTIONS));
    check("1 Reproduction Evidence carries source, context level, steps, build, surfaces and provenance",
      /\*\*Source:\*\*.*BUG-43/.test(text) && /\*\*Intake context level:\*\* full/.test(text) && text.includes("1. Add an item to the cart") && /\*\*Found in build:\*\* and-201/.test(text) &&
        /\*\*Affected surfaces:\*\* android/.test(text) && text.includes("[evidence: qa-ledger/scopes/bug/BUG-43.jsonl]"));
    check("1 Observed vs Expected is the intake evidence, labelled", /\*\*Observed:\*\* Total shows the full price \[evidence: /.test(text) && /\*\*Expected:\*\* Total shows the 10% discount \[evidence: /.test(text));
    check("1 the routing source is recorded in Affected Capability & Surfaces", /\*\*Platform \/ device type:\*\* android \/ mobile — inherited from .*checkout-coupons-task-breakdown\.md/.test(text), text.slice(text.indexOf("## Affected Capability"), text.indexOf("## Root Cause")));
    check("1 Fix Cycles starts with no additional cycles", /## Fix Cycles\n\nNo additional fix cycles yet\./.test(text));
    check("24 the scaffold's Tasks table is the Task Breakdown header, with no placeholder row", /## Tasks\n[\s\S]*?\| id \| description \| platform \| files touched \| depends-on \| size \| acceptance criteria \|\n\|---\|---\|---\|---\|---\|---\|---\|\n\n/.test(text) && !text.includes("Short imperative description"));
    check("1 an unfilled scaffold is not yet a valid plan (nothing placeholder can pass)", v.ok === false);
    const notReady = C({ root: root43, ref: "BUG-43", qaRepo: QA });
    check("1 check refuses the unfilled scaffold", notReady?.ok === false, show(notReady));

    // The architect fills it.
    writeFileSync(planFile(root43, "BUG-43"), fill(text));
    const filled = validateBugWorkPlan(readFileSync(planFile(root43, "BUG-43")));
    check("23 the filled plan is a valid bug-work-plan", filled.ok === true, JSON.stringify(filled.errors));
    const ok = C({ root: root43, ref: "BUG-43", qaRepo: QA });
    check("24 check passes a complete plan", ok?.ok === true && ok.problems.length === 0, show(ok));
    check("1 the QA repository is untouched", snapshot(QA) === qaBefore);
  }

  /* ── 25–26. task readiness rules ──────────────────────────────────────── */
  {
    const base = readFileSync(planFile(root43, "BUG-43"), "utf-8");
    const tryPlan = (doc: string) => {
      writeFileSync(planFile(root43, "BUG-43"), doc);
      return C({ root: root43, ref: "BUG-43", qaRepo: QA });
    };
    const has = (r: any, code: string) => r?.ok === false && r.problems.some((p: any) => p.code === code);
    check("25 a plan whose fix task does not cover the reported reproduction path is refused",
      has(tryPlan(base.replace("The reported reproduction path no longer fails: with SAVE10 applied, checkout shows the discounted total", "Checkout shows the discounted total")), "REPRO_CRITERION"));
    check("25 the reproduction criterion must be the first acceptance criterion",
      has(tryPlan(base.replace("The reported reproduction path no longer fails: with SAVE10 applied, checkout shows the discounted total; T1 passes", "T1 passes; the reported reproduction path no longer fails")), "REPRO_CRITERION"));
    check("26 a regression-test plan that names no task and gives no reason is refused",
      has(tryPlan(base.replace("- **Regression test:** T1 adds `CheckoutTotalsTest.couponIsApplied`, failing before the fix", "- **Regression test:** yes")), "REGRESSION_PLAN"));
    check("26 a regression test naming an unknown task is refused", has(tryPlan(base.replace("- **Regression test:** T1 adds", "- **Regression test:** T9 adds")), "REGRESSION_PLAN"));
    const justified = tryPlan(base.replace("- **Regression test:** T1 adds `CheckoutTotalsTest.couponIsApplied`, failing before the fix", "- **Regression test:** Not feasible: the defect is in a vendor SDK callback with no test seam; recorded as verification debt"));
    check("26 a justified 'Not feasible:' regression plan is accepted", justified?.ok === true, show(justified));
    const extended = tryPlan(base.replace("- **Regression test:** T1 adds", "- **Regression test:** extended inside T2:"));
    check("26 extending an existing test inside the fix task is accepted", extended?.ok === true, show(extended));
    check("6 a Root Cause without any evidence label is refused", has(tryPlan(base.replace("[evidence: app/src/main/java/com/acme/checkout/CheckoutTotals.kt] `total()`", "`total()`")), "EVIDENCE_LABELS"));
    const inference = tryPlan(base.replace("[evidence: app/src/main/java/com/acme/checkout/CheckoutTotals.kt] `total()` sums line prices before the coupon is applied.",
      "Local reproduction was unavailable (no staging coupon). [inference] `total()` likely sums line prices before the coupon is applied; QA's reproduction is the evidence."));
    check("22 local reproduction unavailable + a labelled inference does not block reliable QA evidence", inference?.ok === true, show(inference));
    check("23 an empty required section is refused", has(tryPlan(base.replace("- [inference] Only the checkout total; the cart badge reads a separate subtotal.\n", "")), "SECTION_EMPTY"));
    writeFileSync(planFile(root43, "BUG-43"), base);
  }

  /* ── 28–31. approval, through the approval helper only ─────────────────── */
  {
    const s = S({ root: root43, ref: "BUG-43", qaRepo: QA });
    check("12 an existing draft, current plan returns to approval", s?.outcome === "BUG_PLAN_AWAITING_APPROVAL" && s.proceed === "approve" && s.plan.approval.status === "draft", show(s));
    const before = readFileSync(planFile(root43, "BUG-43"));
    const sc = SC({ root: root43, ref: "BUG-43", qaRepo: QA });
    check("31 rerunning on a draft never regenerates it", sc?.ok === false && sc.outcome === "BUG_PLAN_AWAITING_APPROVAL" && readFileSync(planFile(root43, "BUG-43")).equals(before), show(sc));
    check("30 a declined approval leaves the draft as it was", verifyApproval(readFileSync(planFile(root43, "BUG-43"))).status === "draft");

    const a = approveWorkPackage(planFile(root43, "BUG-43"), { by: "dana" });
    check("28 the plan is approved through scripts/work-approval.ts", a.ok === true && a.status === "approved", JSON.stringify(a));
    check("29 the approved plan verifies", verifyApproval(readFileSync(planFile(root43, "BUG-43"))).status === "approved");
    const after = S({ root: root43, ref: "BUG-43", qaRepo: QA });
    check("11 an existing approved, current plan is reused — no regeneration", after?.outcome === "BUG_PLAN_APPROVED" && after.proceed === null && after.ok === true, show(after));
    check("11 the next action is /implement-task bug:<bug_key> T1, with execution support still to come",
      after?.next_action === "/implement-task bug:BUG-43 T1" && /--qa-repo/.test(after.next_action_note ?? ""), JSON.stringify([after?.next_action, after?.next_action_note]));
    const approvedBytes = readFileSync(planFile(root43, "BUG-43"));
    const again = SC({ root: root43, ref: "BUG-43", qaRepo: QA });
    check("11 an approved plan is never overwritten", again?.ok === false && readFileSync(planFile(root43, "BUG-43")).equals(approvedBytes), show(again));
    check("32 no task-state is created", !existsSync(join(root43, "docs/tasks")));
  }

  /* ── 13–14. invalid and stale plans ───────────────────────────────────── */
  {
    const root = repo();
    const p = planFile(root, "BUG-43");
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, "# not a plan\n\n## Root Cause\n");
    const s = S({ root, ref: "BUG-43", qaRepo: QA, });
    check("13 an existing invalid plan blocks", s?.outcome === "BUG_PLAN_INVALID" && s.ok === false && s.proceed === null, show(s));
    const sc = SC({ root, ref: "BUG-43", qaRepo: QA, platform: "android", deviceType: "mobile" });
    check("13 …and is never overwritten", sc?.ok === false && readFileSync(p, "utf-8") === "# not a plan\n\n## Root Cause\n");

    // A plan whose recorded evidence no longer matches intake.
    const approvedText = readFileSync(planFile(root43, "BUG-43"), "utf-8");
    const drifted = approvedText.replace(/^bug_evidence_fingerprint: .*$/m, `bug_evidence_fingerprint: sha256:${"a".repeat(64)}`);
    const rootA = repo();
    mkdirSync(dirname(planFile(rootA, "BUG-43")), { recursive: true });
    writeFileSync(planFile(rootA, "BUG-43"), drifted);
    const stale = S({ root: rootA, ref: "BUG-43", qaRepo: QA, platform: "android", deviceType: "mobile" });
    check("14 evidence changed under an approved plan → BUG_PLAN_STALE", stale?.outcome === "BUG_PLAN_STALE" && stale.ok === false && JSON.stringify(stale.plan.drift) === '["bug_evidence_fingerprint"]', show(stale));
    const staleBytes = readFileSync(planFile(rootA, "BUG-43"));
    check("14 …and the stale approved plan is never overwritten", SC({ root: rootA, ref: "BUG-43", qaRepo: QA, platform: "android", deviceType: "mobile" })?.ok === false && readFileSync(planFile(rootA, "BUG-43")).equals(staleBytes));
    check("14 the stale verdict is deterministic", JSON.stringify(S({ root: rootA, ref: "BUG-43", qaRepo: QA })) === JSON.stringify(S({ root: rootA, ref: "BUG-43", qaRepo: QA })));

    // The same drift under a draft, with no task state, is regenerated in place.
    const rootD = repo();
    mkdirSync(dirname(planFile(rootD, "BUG-43")), { recursive: true });
    const draftDrift = drifted.replace("status: approved", "status: draft");
    writeFileSync(planFile(rootD, "BUG-43"), draftDrift);
    const regen = S({ root: rootD, ref: "BUG-43", qaRepo: QA });
    check("14 evidence changed under a draft with no task state → BUG_PLAN_REGENERATE", regen?.outcome === "BUG_PLAN_REGENERATE" && regen.proceed === "regenerate", show(regen));
    check("15 a regenerated plan keeps the routing a human confirmed for it", regen?.routing?.platform === "android" && regen.routing.source === "existing-plan" && regen.routing.requires_confirmation === false);
    const rs = SC({ root: rootD, ref: "BUG-43", qaRepo: QA });
    const regenerated = readFileSync(planFile(rootD, "BUG-43"), "utf-8");
    check("14 regeneration rewrites the draft in place with the current evidence", rs?.ok === true && rs.regenerated === true && regenerated.includes(`bug_evidence_fingerprint: ${regen.intake.bug_evidence_fingerprint}`) && /^status: draft$/m.test(regenerated), show(rs));
    // …but not once task state exists for the bug.
    const rootT = repo();
    mkdirSync(dirname(planFile(rootT, "BUG-43")), { recursive: true });
    writeFileSync(planFile(rootT, "BUG-43"), draftDrift);
    mkdirSync(join(rootT, "docs/tasks/bugs"), { recursive: true });
    writeFileSync(join(rootT, "docs/tasks/bugs/BUG-43.task-state.json"), "{}");
    const withState = S({ root: rootT, ref: "BUG-43", qaRepo: QA });
    check("14 a draft with task state is stale, never regenerated (reconciliation is a later step)", withState?.outcome === "BUG_PLAN_STALE" && withState.task_state_exists === true, show(withState));
    // A plan edited after approval, evidence unchanged → re-approval, no regeneration.
    const rootE = repo();
    mkdirSync(dirname(planFile(rootE, "BUG-43")), { recursive: true });
    writeFileSync(planFile(rootE, "BUG-43"), approvedText.replace("- None.", "- Is SAVE10 stackable?"));
    const edited = S({ root: rootE, ref: "BUG-43", qaRepo: QA });
    check("12 a plan edited after approval returns to approval, not regeneration", edited?.outcome === "BUG_PLAN_AWAITING_APPROVAL" && edited.plan.approval.status === "approval_stale", show(edited));
    // A plan whose bug_key is not this bug.
    const rootK = repo();
    mkdirSync(dirname(planFile(rootK, "BUG-43")), { recursive: true });
    writeFileSync(planFile(rootK, "BUG-43"), approvedText.replace("bug_key: BUG-43", "bug_key: BUG-44").replace("qa_bug_id: BUG-43", "qa_bug_id: BUG-44"));
    check("13 a plan at this bug's path for another bug is invalid", S({ root: rootK, ref: "BUG-43", qaRepo: QA })?.outcome === "BUG_PLAN_INVALID");
  }

  /* ── 2–4. QA ownership ────────────────────────────────────────────────── */
  {
    const root = repo();
    const r = S({ root, ref: "qa=BUG-44", qaRepo: QA });
    check("2 a reopened QA bug is reported as BUG_REOPENED", r?.outcome === "BUG_REOPENED" && r.ok === false && r.proceed === null, show(r));
    check("2 …with the failed build, surfaces and re-test evidence from intake",
      r?.reopened?.failed_fix_build === "atv-202" && JSON.stringify(r.reopened.failed_surfaces) === '["android-tv"]' && r.reopened.latest_retest.notes === "Still frozen after resume from Home" &&
        JSON.stringify(r.reopened.evidence) === '["videos/BUG-44-atv-202.mp4"]');
    const sc = SC({ root, ref: "qa=BUG-44", qaRepo: QA, platform: "android", deviceType: "tv" });
    check("2 no plan and no Cycle 2 is created for a reopened bug", sc?.ok === false && !existsSync(join(root, "docs/bugs")), show(sc));
    const n = S({ root, ref: "BUG-41", qaRepo: QA });
    check("3 a QA-new bug blocks — QA verifies first", n?.outcome === "BUG_QA_DENIED" && n.ok === false && n.intake.status === "needs_qa_verification", show(n));
    const c = S({ root, ref: "BUG-45", qaRepo: QA });
    check("4 a closed QA bug blocks", c?.outcome === "BUG_QA_DENIED" && c.intake.status === "closed", show(c));
    const f = S({ root, ref: "BUG-46", qaRepo: QA });
    check("4 a fix awaiting QA re-test blocks", f?.outcome === "BUG_QA_DENIED" && f.intake.status === "awaiting_qa_retest");
    for (const ref of ["BUG-41", "BUG-45", "BUG-46"]) check(`3–4 scaffold refuses ${ref}`, SC({ root, ref, qaRepo: QA, platform: "android", deviceType: "mobile" })?.ok === false);
    check("3–4 nothing is written for a denied bug", !existsSync(join(root, "docs/bugs")));
    check("QA a QA ref needs the QA repository path — never guessed", S({ root, ref: "BUG-43" })?.outcome === "BUG_QA_REPO_REQUIRED");
  }

  /* ── 5. partial QA context ────────────────────────────────────────────── */
  {
    const qaCopy = join(TMP, "qa-partial");
    cpSync(QA, qaCopy, { recursive: true });
    rmSync(join(qaCopy, "bugs/BUG-43/bug.md"));
    const root = repo();
    const s = S({ root, ref: "BUG-43", qaRepo: qaCopy });
    check("5 a partial-context QA bug proceeds", s?.outcome === "BUG_PLAN_NEW" && s.ok === true && s.context_level === "partial", show(s));
    check("5 the partial warnings are carried", JSON.stringify(s?.warnings?.map((w: any) => w.code)) === '["QA_STATE_UNAVAILABLE","QA_VIEW_MISSING","FOUND_IN_BUILD_UNKNOWN"]', JSON.stringify(s?.warnings));
    const sc = SC({ root, ref: "BUG-43", qaRepo: qaCopy, platform: "android", deviceType: "mobile" });
    const text = readFileSync(planFile(root, "BUG-43"), "utf-8");
    check("5 the plan records the partial context and every warning", sc?.ok === true && /\*\*Intake context level:\*\* partial — QA ownership state unverified/.test(text) &&
      ["QA_STATE_UNAVAILABLE", "QA_VIEW_MISSING", "FOUND_IN_BUILD_UNKNOWN"].every((c) => text.includes(c)), show(sc));
    check("5 no QA state is invented", /\*\*QA state:\*\* unavailable/.test(text) && !/\*\*QA state:\*\* (assigned|reopened)/.test(text));
    check("5 an unknown found_in_build stays null", /^found_in_build: null$/m.test(text) && /\*\*Found in build:\*\* unknown/.test(text));
    writeFileSync(planFile(root, "BUG-43"), fill(text));
    check("5 a complete partial-context plan passes check", C({ root, ref: "BUG-43", qaRepo: qaCopy })?.ok === true);
    writeFileSync(planFile(root, "BUG-43"), fill(text).replace(/^- `QA_VIEW_MISSING`.*\n/m, ""));
    const dropped = C({ root, ref: "BUG-43", qaRepo: qaCopy });
    check("5 a partial-context plan that dropped a warning is refused", dropped?.ok === false && dropped.problems.some((p: any) => p.code === "PARTIAL_WARNINGS"), show(dropped));
  }

  /* ── 6–10. external, dev-review, dev-testing, production, insufficient ── */
  {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ["6 an external bug", { external: "PAY-1182", report: report({ ...EVIDENCE, surfaces: ["android"] }) }, "PAY-1182"],
      ["7 a dev-review bug", { origin: "dev-review", report: report(EVIDENCE) }, "DEV-"],
      ["8 a dev-testing bug", { origin: "dev-testing", report: report(EVIDENCE) }, "DEV-"],
      ["9 a production bug", { origin: "production", report: report({ ...EVIDENCE, environment: "prod 2.4.0" }) }, "DEV-"],
    ];
    for (const [what, req, key] of cases) {
      const root = repo();
      const s = S({ root, ...req });
      check(`${what} starts a new plan`, s?.outcome === "BUG_PLAN_NEW" && s.ok === true && s.intake.identity.bug_key.startsWith(key), show(s));
      check(`${what} needs a human routing decision`, s?.routing?.requires_confirmation === true && s.routing.platform === null);
      const sc = SC({ root, ...req, platform: "android", deviceType: "mobile" });
      const p = planFile(root, s?.intake?.identity?.bug_key ?? "x");
      check(`${what} creates its plan`, sc?.ok === true && existsSync(p), show(sc));
      const text = existsSync(p) ? readFileSync(p, "utf-8") : "";
      check(`${what}: the plan names its report as the evidence source`, text.includes(`[evidence: ${req.report}]`) && /\*\*QA state:\*\* not a QA bug/.test(text));
      writeFileSync(p, fill(text));
      check(`${what}: the completed plan passes check`, C({ root, ...req })?.ok === true);
    }
    const root = repo();
    const missing = S({ root, origin: "production", report: report({ title: "Crash", steps: [] }) });
    check("10 insufficient evidence blocks, naming what is missing", missing?.outcome === "BUG_INSUFFICIENT_EVIDENCE" && missing.ok === false && JSON.stringify(missing.missing) === '["steps","expected","actual"]', show(missing));
    check("10 …and creates no plan", SC({ root, origin: "production", report: report({ title: "Crash", steps: [] }), platform: "android", deviceType: "mobile" })?.ok === false && !existsSync(join(root, "docs/bugs")));
    check("10 an unreadable report is insufficient evidence", S({ root, origin: "production", report: join(TMP, "nope.json") })?.outcome === "BUG_INSUFFICIENT_EVIDENCE");
    check("10 an unknown QA bug is insufficient evidence", S({ root, ref: "BUG-99", qaRepo: QA })?.outcome === "BUG_INSUFFICIENT_EVIDENCE");
    check("10 an unsafe reference is refused before any read", S({ root, ref: "../../etc", qaRepo: QA })?.outcome === "BUG_INSUFFICIENT_EVIDENCE");
    check("request with no bug reference is refused", S({ root })?.outcome === "BUG_REF_REQUIRED");
    check("request an external key without its report is refused", S({ root, external: "PAY-1" })?.outcome === "BUG_REPORT_REQUIRED");
    check("request a QA ref and --external together are refused", S({ root, ref: "BUG-43", qaRepo: QA, external: "PAY-1", report: report(EVIDENCE) })?.outcome === "BUG_REF_CONFLICT");
    check("request a missing repository root is refused", S({ root: join(TMP, "no-such-root"), ref: "BUG-43", qaRepo: QA })?.outcome === "BUG_ROOT_INVALID");
  }

  /* ── 15–17. routing ───────────────────────────────────────────────────── */
  {
    const inherit = S({ root: repo([{ feature: "checkout-coupons", status: "approved", platform: "android", device: "mobile" }]), ref: "BUG-43", qaRepo: QA });
    check("15 routing is inherited from the related feature's one approved task breakdown",
      inherit?.routing?.platform === "android" && inherit.routing.device_type === "mobile" && inherit.routing.requires_confirmation === false && /checkout-coupons-task-breakdown\.md$/.test(inherit.routing.source), JSON.stringify(inherit?.routing));
    const draft = S({ root: repo([{ feature: "checkout-coupons", status: "draft" }]), ref: "BUG-43", qaRepo: QA });
    check("16 a draft breakdown is not inherited — a human confirms", draft?.routing?.requires_confirmation === true && draft.routing.platform === null, JSON.stringify(draft?.routing));
    const two = S({ root: repo([{ feature: "checkout-coupons", status: "approved" }, { feature: "checkout-coupons", status: "approved", platform: "ios", name: "other-breakdown.md" }]), ref: "BUG-43", qaRepo: QA });
    check("16 two approved breakdowns for the feature are ambiguous — a human confirms", two?.routing?.requires_confirmation === true && two.routing.platform === null);
    const other = S({ root: repo([{ feature: "another-feature", status: "approved" }]), ref: "BUG-43", qaRepo: QA });
    check("16 an unrelated feature's breakdown is never inherited", other?.routing?.requires_confirmation === true);
    const tvBreakdown = S({ root: repo([{ feature: "checkout-coupons", status: "approved", platform: "android", device: "watch" }]), ref: "BUG-43", qaRepo: QA });
    check("16 an invalid inherited context is never used", tvBreakdown?.routing?.requires_confirmation === true);
    const unrelated = S({ root: repo(), ref: "BUG-50", qaRepo: QA });
    check("17 QA surfaces corroborate but never route", unrelated?.routing?.requires_confirmation === true && unrelated.routing.platform === null && JSON.stringify(unrelated.routing.corroborating_surfaces) === '["android"]', JSON.stringify(unrelated?.routing));
    const rootR = repo();
    const noRoute = SC({ root: rootR, ref: "BUG-50", qaRepo: QA });
    check("16 scaffold refuses without a confirmed platform and device type", noRoute?.ok === false && noRoute.code === "ROUTING_REQUIRED" && !existsSync(join(rootR, "docs/bugs")), show(noRoute));
    check("16 scaffold refuses an invalid platform", SC({ root: rootR, ref: "BUG-50", qaRepo: QA, platform: "mixed", deviceType: "mobile" })?.code === "ROUTING_INVALID");
    const rootC = repo([{ feature: "checkout-coupons", status: "approved" }]);
    const conflict = SC({ root: rootC, ref: "BUG-43", qaRepo: QA, platform: "ios", deviceType: "mobile" });
    check("15 scaffold refuses a platform that contradicts the inherited routing", conflict?.ok === false && conflict.code === "ROUTING_CONFLICT" && !existsSync(join(rootC, "docs/bugs")), show(conflict));
    const confirmed = SC({ root: rootR, ref: "BUG-50", qaRepo: QA, platform: "android", deviceType: "mobile" });
    check("16 a human-confirmed routing is recorded as confirmed", confirmed?.ok === true && /\*\*Platform \/ device type:\*\* android \/ mobile — confirmed by the developer/.test(readFileSync(planFile(rootR, "BUG-50"), "utf-8")), show(confirmed));
  }

  /* ── 18–21. Project Knowledge ─────────────────────────────────────────── */
  {
    const s = S({ root: repo(), ref: "BUG-50", qaRepo: QA });
    check("18 the capability QA bound is the first Project Knowledge key", s?.knowledge?.capability === "checkout-payments" && s.knowledge.capability_source === "qa-intake", JSON.stringify(s?.knowledge));
    const root = repo();
    SC({ root, ref: "BUG-50", qaRepo: QA, platform: "android", deviceType: "mobile" });
    const text = readFileSync(planFile(root, "BUG-50"), "utf-8");
    check("18 the bound capability is recorded, with its source", /^capability: checkout-payments$/m.test(text) && /\*\*Capability:\*\* checkout-payments — bound by QA intake/.test(text));
    const rootX = repo();
    const clash = SC({ root: rootX, ref: "BUG-50", qaRepo: QA, platform: "android", deviceType: "mobile", capability: "checkout" });
    check("18 a looked-up capability never overrides the one QA bound", clash?.ok === false && clash.code === "CAPABILITY_CONFLICT" && !existsSync(join(rootX, "docs/bugs")), show(clash));
    const rootL = repo([{ feature: "checkout-coupons", status: "approved" }]);
    SC({ root: rootL, ref: "BUG-43", qaRepo: QA, capability: "checkout" });
    check("18 without a bound capability, the one Project Knowledge located is recorded as such", /\*\*Capability:\*\* checkout — located in Project Knowledge/.test(readFileSync(planFile(rootL, "BUG-43"), "utf-8")));
    const none = S({ root: repo(), ref: "BUG-43", qaRepo: QA });
    check("19 no Project Knowledge in the repository never blocks", none?.ok === true && none.knowledge.capability === null && none.knowledge.capability_source === null);
    const src = read("scripts/analyze-bug.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("19 the helper never reads Project Knowledge — it can never decide whether the bug exists", !/repo-knowledge|\.ono\b|read-repo-knowledge/.test(src));
  }

  /* ── the command ──────────────────────────────────────────────────────── */
  const cmd = read("commands/analyze-bug.md");
  {
    check("command has frontmatter with a description and the argument grammar", /^---\ndescription: .+\nargument-hint: .*BUG-27.*--qa-repo.*--external.*--report.*--origin/m.test(cmd));
    check("command resolves TARGET_ROOT through the existing helper", cmd.includes('scripts/resolve-target-repo-root.ts" "<candidate>"'));
    check("command starts with the deterministic helper, which runs bug intake", /scripts\/analyze-bug\.ts" start/.test(cmd) && /scripts\/bug-intake\.ts/.test(cmd));
    for (const outcome of ["BUG_REF_REQUIRED", "BUG_QA_REPO_REQUIRED", "BUG_INSUFFICIENT_EVIDENCE", "BUG_QA_DENIED", "BUG_REOPENED", "BUG_PLAN_NEW", "BUG_PLAN_INVALID", "BUG_PLAN_APPROVED", "BUG_PLAN_AWAITING_APPROVAL", "BUG_PLAN_REGENERATE", "BUG_PLAN_STALE"]) {
      check(`command handles ${outcome}`, cmd.includes(`\`${outcome}\``));
    }
    const row = (outcome: string) => cmd.split("\n").find((l) => l.startsWith("|") && l.includes(`\`${outcome}\``)) ?? "";
    for (const outcome of ["BUG_INSUFFICIENT_EVIDENCE", "BUG_QA_DENIED", "BUG_REOPENED", "BUG_PLAN_STALE", "BUG_PLAN_INVALID"]) {
      check(`command stops on ${outcome}`, /\*\*Stop\.\*\*/.test(row(outcome)) && !/Continue at step/.test(row(outcome)), row(outcome));
    }
    check("3–4 command: a verified QA denial is never overridden", /never overridden/.test(row("BUG_QA_DENIED")));
    for (const outcome of ["BUG_PLAN_APPROVED", "BUG_PLAN_AWAITING_APPROVAL"]) check(`command never regenerates on ${outcome}`, /Do \*\*not\*\* regenerate/.test(row(outcome)));
    check("command proceeds to analysis only on BUG_PLAN_NEW and BUG_PLAN_REGENERATE", /Continue at step 4/.test(row("BUG_PLAN_NEW")) && /continue at step 4/i.test(row("BUG_PLAN_REGENERATE")));
    check("5 command: partial context proceeds — never blocked only because QA state is unavailable", /Analysis is never blocked only because QA state is unavailable/.test(cmd) && /Never state, assume or write a QA state/.test(cmd));
    check("2 command never creates Cycle 2", /Cycle 2/.test(cmd) && /never (creates|append)/i.test(cmd));
    check("16 command reuses the analyze-feature confirmation gate", cmd.includes("`/analyze-feature` step 2") && /Is this bug in this context\?/.test(cmd) && /exactly \*\*one\*\* platform/.test(cmd));
    check("15 command asks only when routing is not inherited", /requires_confirmation/.test(cmd) && /ask once/i.test(cmd));
    check("17 command: QA surfaces corroborate, never route", /surfaces .*corroborat/i.test(cmd) && /never choose/i.test(cmd));
    check("18 command: the QA-bound capability is looked up first", /--capability/.test(cmd) && /bound by QA/.test(cmd) && /`repo-knowledge-consumer`/.test(cmd) && /Step 3c/.test(cmd));
    check("19 command: Project Knowledge never decides whether the bug exists", /Project Knowledge never decides whether the bug exists/.test(cmd));
    check("19 command: missing knowledge falls back to live derivation", /unavailable.*live/i.test(cmd));
    check("20 command preserves refreshRecommendation, unchanged, in the plan and the summary", /carry its `refreshRecommendation`, unchanged, into the plan's Repo Knowledge Reference and into the step 9 summary/.test(cmd));
    check("21 command: first-degree relationships only, never scope", /Never follow the graph past the first degree/.test(cmd) && /Never expand scope to a related capability/.test(cmd) && /current source wins/i.test(cmd));
    check("8 command reuses the planning machinery: feature-architect, platform-planning, one lane",
      ["`feature-architect`", "`platform-planning`", "`rn-dev-planning`", "`ios-dev-planning`", "`android-dev-planning`", "`react-dev-planning`"].every((x) => cmd.includes(x)) && /Exactly one planning lane/.test(cmd));
    check("8 command keeps the lane readiness gate", /not yet authored, currently a structure-only placeholder/.test(cmd));
    check("6 command applies the mobile-debugging methodology and the evidence labels", cmd.includes("`mobile-debugging`") && ["[evidence: <path>]", "[inference]", "[reused: <path>#<anchor>]"].every((l) => cmd.includes(l)));
    check("22 command: local reproduction unavailable does not block reliable QA evidence", /reproduc\w* (locally|was) unavailable|local reproduction is unavailable/i.test(cmd));
    check("8 command: smaller than a DD — root cause, minimal fix, tests, regression risk", /not a Detailed Design/i.test(cmd) && /minimal fix/i.test(cmd));
    check("7 command scaffolds through the helper and fills the plan from the template", /scripts\/analyze-bug\.ts" scaffold/.test(cmd) && cmd.includes("templates/bug-work-plan-template.md"));
    check("25 command: the fix task's first criterion covers the reported reproduction path", cmd.includes("The reported reproduction path no longer fails"));
    check("26 command: a regression-test task, or the reason there is none", /Not feasible:/.test(cmd) && /regression/i.test(cmd));
    check("9 command validates and checks before asking", /scripts\/bug-work-plan\.ts" validate/.test(cmd) && /scripts\/analyze-bug\.ts" check/.test(cmd));
    check("28 command approves only through scripts/work-approval.ts, with an explicit identity", /scripts\/work-approval\.ts" approve "<absolute plan path>" --by "<approver>"/.test(cmd));
    check("28 command never edits the approval fields itself", /Never (write|edit) `status` or any `approved_\*` field/.test(cmd));
    check("11 command: partial context surfaces unverified QA ownership at approval", /QA ownership state is unverified/.test(cmd));
    check("30 command: a declined approval leaves the draft; rerunning resumes at approval", /declin/i.test(cmd) && /rerun.*\/analyze-bug.*resumes at approval/i.test(cmd));
    check("12 command reports the next action without invoking it", cmd.includes("/implement-task bug:<bug_key> T1") && /does not (invoke|run) implementation/i.test(cmd));
    check("32 command never creates task state", /never creates task state/i.test(cmd));
  }

  /* ── 32–36. scope ─────────────────────────────────────────────────────── */
  {
    // Step 6 extended /review-code with --bug; bug-review.test.ts pins its original body verbatim.
    // Step 5 changed /implement-task, task-state.ts and task-resume.ts on purpose; bug-implementation.test.ts
    // pins every feature section of /implement-task, and the task-state suites pin the store's behaviour.
    const PINNED: Record<string, string> = {
      "commands/analyze-feature.md": "42f3b7f1fbd91e9110e15877b3f746312926958ccf53f28dfc3ee76879e70051",
      "commands/dev-design-start.md": "f62963b1d156f4d9b22cd1d92678d4de25f0d66d7120801d62075d14ec8b9ca8",
      "commands/dev-feature-start.md": "0713797d25d66df5064424ffd0dcf4269fead926512c2c40dd2eb9350abce175",
      // Step 7 extended /create-dev-qa-notes with bug:<key>; qa-handoff-gate.test.ts pins its feature body verbatim.
      "commands/prepare-mobile-release.md": "7f7d431309a77e4af4f7485b236cf2205616f2afed3b06de94cf2a0acbf327e4",
      "commands/fix-review-comments.md": "5b6d7698b9c940ea8bb783669ee37fe8b71f5a39ca4428bce9e6882c459c7a3d",
      "agents/feature-architect.md": "c715811b78c1804368766551cf42f46beec568d78a91397a4ea5f57d96bca582",
      "skills/platform-planning/SKILL.md": "4375411ab8091ac6cd4f8433ba75e8df53d7b4ab79be95a3eeb78aa01cf3f86c",
      "skills/mobile-debugging/SKILL.md": "0b6bc7a1384ca2dc1f762dcd2946ccd8320dfe35fc0471f79e027d4f580c081e",
      "skills/repo-knowledge-consumer/SKILL.md": "6589271d788e6a1d2259b92cfa227aede26a62d583395555b5ca58addabd4108",
    };
    for (const [f, h] of Object.entries(PINNED)) check(`33/36 ${f} is unchanged`, sha(readFileSync(join(REPO_ROOT, f))) === h);
    const src = read("scripts/analyze-bug.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("34 the helper never writes the QA repository", !/qa-ledger\.mjs|ono-plugin-qa/.test(src) && snapshot(QA) === qaBefore);
    check("35 the helper never touches Inspector artifacts (it may only cite a capability anchor)", !/project-inspector|\.ono\b/.test(src) && !/(readFileSync|readdirSync|existsSync)\([^)]*docs\/project/.test(src));
    check("32 the helper never writes task state", !/writeTaskState|writeCheckpoint|task-state\.ts" write/.test(src));
    check("the helper runs no process and reads no clock", !/child_process|new Date|Date\.now|Math\.random|randomUUID/.test(src));
    check("the helper writes only the plan, through one atomic write", (src.match(/writeFileSync\(/g) ?? []).length === 1 && (src.match(/renameSync\(/g) ?? []).length === 1);
    check("the suite is registered with the check harness", read("scripts/check.ts").includes('"analyze-bug"'));
    check("the bug-work-plan contract documents the analyze-bug readiness rules", /REPRO_CRITERION/.test(read("docs/bug-work-plan-contract.md")) && /REGRESSION_PLAN/.test(read("docs/bug-work-plan-contract.md")));
    check("README lists /analyze-bug", /\| `\/analyze-bug` \|/.test(read("README.md")));
  }

  /* ── CLI ──────────────────────────────────────────────────────────────── */
  {
    const run = (args: string[]) => {
      const p = spawnSync(process.execPath, ["--no-warnings", join(HERE, "analyze-bug.ts"), ...args], { encoding: "utf-8" });
      try {
        return { code: p.status, json: JSON.parse(p.stdout) };
      } catch {
        return { code: p.status, json: null, raw: p.stdout + p.stderr };
      }
    };
    const root = repo([{ feature: "checkout-coupons", status: "approved" }]);
    const st = run(["start", "BUG-43", "--qa-repo", QA, "--root", root]);
    check("CLI start prints one JSON object, exit 0", st.code === 0 && st.json?.outcome === "BUG_PLAN_NEW", JSON.stringify(st.json?.outcome ?? st.raw));
    const sc = run(["scaffold", "qa=BUG-43", "--qa-repo", QA, "--root", root, "--date", "2026-10-06"]);
    check("CLI scaffold writes the plan", sc.code === 0 && sc.json?.ok === true && existsSync(planFile(root, "BUG-43")));
    check("CLI check refuses the unfilled scaffold", run(["check", "BUG-43", "--qa-repo", QA, "--root", root]).json?.ok === false);
    const ext = run(["start", "--external", "PAY-1182", "--report", report(EVIDENCE), "--root", repo()]);
    check("CLI external intake", ext.json?.outcome === "BUG_PLAN_NEW" && ext.json.intake.identity.bug_key === "PAY-1182");
    const dev = run(["start", "--origin", "dev-review", "--report", report(EVIDENCE), "--root", repo()]);
    check("CLI dev-review intake", dev.json?.outcome === "BUG_PLAN_NEW");
    check("CLI a bad date is refused", run(["scaffold", "--origin", "production", "--report", report(EVIDENCE), "--root", repo(), "--platform", "android", "--device-type", "mobile", "--date", "today"]).json?.code === "INVALID_ARGUMENT");
    check("CLI an unknown command is refused, exit 0", run(["frobnicate"]).code === 0 && run(["frobnicate"]).json?.ok === false);
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall analyze-bug checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
