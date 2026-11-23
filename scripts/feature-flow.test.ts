/**
 * feature-flow.test.ts
 *
 * Pins Feature Flow continuity (0.8.0): scripts/feature-docs.ts resolves a feature's planning
 * documents deterministically (links first, then a bounded scan; AMBIGUOUS rather than a
 * guess), and scripts/feature-flow.ts says where the feature stands and what comes next —
 * a human approval (file and `status:` line) or the next command, offered under the
 * docs/command-handoff.md Continue rule. Nothing is written; approvals are never changed.
 *
 *   node --no-warnings scripts/feature-flow.test.ts
 */

import { spawnSync } from "child_process";
import { readFileSync, rmSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { featureStatus } from "./feature-flow.ts";
import { resolveFeatureDocs, detectKind } from "./feature-docs.ts";
import { readFrontmatter } from "./task-resume.ts";
import { PLUGIN_NAME } from "./next-command.ts";
import { FA, DD, TB, PLAN, FEATURE, featureRepo, implement, git, put, faText, legacyFa, tmpRoot } from "./feature-fixture.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf-8");
const TMP = tmpRoot("feature-flow-");
const DATA = join(TMP, "plugin-data");
mkdirSync(DATA);
const st = (root: string, extra: Record<string, unknown> = {}) => featureStatus({ root, feature: FEATURE, data: DATA, ...extra });
const show = (x: any) => JSON.stringify({ stage: x.stage, outcome: x.outcome, next: x.next_command?.display, waiting: x.waiting_on, reason: x.reason });
const lineOf = (root: string, rel: string) => readFileSync(join(root, rel), "utf-8").split("\n").findIndex((l) => l.startsWith("status:")) + 1;

try {
  // 1. Kind detection follows the templates' own keys.
  {
    const kinds = [faText(), "---\nfeature: x\nfeature_analysis_link: a\ndetail_level: standard\nstatus: draft\n---\n", "---\nfeature: x\nfeature_analysis_link: a\ndd_link: b\ndev_plan_link: c\nstatus: draft\n---\n", "---\nfeature: x\ndd_link: b\nauthor: y\nstatus: draft\n---\n", "---\nfeature: x\ntask_breakdown_link: t\ngenerated_by: create-dev-qa-notes\n---\n", "---\nbug_key: B-1\nfeature: x\n---\n"]
      .map((t) => detectKind(readFrontmatter(Buffer.from(t))));
    // 0.8.0 audit B1: a Dev-Plan-shaped document is `fa-or-plan` — the keys alone cannot tell it from a legacy analysis; context decides.
    check("kinds: FA, DD and Task Breakdown are told apart; the overlapping FA/Dev-Plan shape is fa-or-plan; a QA handoff and a Bug Work Plan are not planning docs", JSON.stringify(kinds) === JSON.stringify(["feature-analysis", "dd", "task-breakdown", "fa-or-plan", null, null]), JSON.stringify(kinds));
    // B1 regression: the repository's own FA fixtures. Before the fix every one of these was classified "dev-plan".
    const shapes = Object.fromEntries(["fa-v0", "fa-v1", "fa-v1-nofigma", "fa-v2", "fa-v3-stamped", "dd-v1-stamped", "dd-v2-stamped"].map((f) => [f, detectKind(readFrontmatter(readFileSync(join(HERE, "fixtures/planning-docs", `${f}.md`))))]));
    check("B1: no FA fixture is classified a Dev Plan", Object.entries(shapes).filter(([f]) => f.startsWith("fa-")).every(([, k]) => k === "feature-analysis" || k === "fa-or-plan"), JSON.stringify(shapes));
    check("B1: a current-schema FA without the optional ENG-003 fields is a Feature Analysis", shapes["fa-v3-stamped"] === "feature-analysis");
    check("B1: legacy DDs stay DDs", shapes["dd-v1-stamped"] === "dd" && shapes["dd-v2-stamped"] === "dd");
  }

  // 2. Stage by stage — each waits on the human approval, never sets it.
  {
    const r = featureRepo(TMP, "s1", { fa: "proposed", only: ["fa"] });
    const a = st(r.root);
    check("FA proposed: waits on a human approval at the status line", a.stage === "awaiting-approval" && a.waiting_on?.[0]?.where === `${FA}:${lineOf(r.root, FA)}` && a.next_command === null, show(a));
    check("FA proposed: names what comes after the approval, without offering it now", a.after_approval?.skill === `${PLUGIN_NAME}:dev-design-start` && a.after_approval.args === FEATURE);
    check("FA proposed: the message tells the developer exactly where to approve", a.message.includes("change `status` to `approved`") && a.message.includes(`${FA}:`));

    const b = featureRepo(TMP, "s2", { only: ["fa"] });
    const bs = st(b.root);
    check("FA approved, no DD: offers /dev-design-start <feature>", bs.stage === "design-missing" && bs.next_command?.skill === `${PLUGIN_NAME}:dev-design-start` && bs.next_command.args === FEATURE, show(bs));

    const c = featureRepo(TMP, "s3", { dd: "draft", only: ["fa", "dd"] });
    const cs = st(c.root);
    check("DD draft: waits on the DD's approval", cs.stage === "awaiting-approval" && cs.waiting_on?.[0]?.document === DD && cs.after_approval?.args === FEATURE && cs.after_approval.skill.endsWith(":dev-feature-start"), show(cs));

    const d = featureRepo(TMP, "s4", { only: ["fa", "dd"] });
    const ds = st(d.root);
    check("DD approved, no breakdown: offers /dev-feature-start <feature>", ds.stage === "breakdown-missing" && ds.next_command?.skill === `${PLUGIN_NAME}:dev-feature-start`, show(ds));

    const e = featureRepo(TMP, "s5", { tb: "draft", plan: "draft" });
    const es = st(e.root);
    check("Breakdown and Dev Plan draft: waits on both, by file and line", es.stage === "awaiting-approval" && es.waiting_on?.map((w: any) => w.document).join(",") === `${TB},${PLAN}`, show(es));
    check("Breakdown draft: after approval, the first task", es.after_approval?.args === `${FEATURE} T1`);
  }

  // 3. Implementation, task by task, and the resume.
  {
    const r = featureRepo(TMP, "impl");
    const a = st(r.root);
    check("all approved: offers the first task", a.stage === "implementation" && a.next_command?.display === `/implement-task ${FEATURE} T1`, show(a));
    implement(r, "T1", "in-progress");
    const b = st(r.root);
    check("an interrupted task is offered again (resume)", b.next_command?.display === `/implement-task ${FEATURE} T1` && /resume T1/.test(b.message), show(b));
    const cli = (root: string) => spawnSync(process.execPath, ["--no-warnings", join(HERE, "feature-flow.ts"), "status", "--root", root, "--feature", FEATURE, "--data", DATA], { encoding: "utf-8" });
    const first = cli(r.root);
    const second = cli(r.root);
    check("resume: a new session (a new process) gets the same answer — the documents and task state are the state", first.status === 0 && first.stdout === second.stdout && JSON.parse(first.stdout).next_command.display === `/implement-task ${FEATURE} T1`);
    implement(r, "T1");
    const c = st(r.root);
    check("T1 complete: offers T2 (its dependency is complete)", c.next_command?.display === `/implement-task ${FEATURE} T2`, show(c));
    implement(r, "T2");
    const d = st(r.root);
    check("every task complete: offers the internal review", d.stage === "review-required" && d.next_command?.skill === `${PLUGIN_NAME}:review-code` && d.next_command.args === `--feature ${FEATURE}`, show(d));
  }

  // 4. Upstream change re-enters at the earliest stale stage; approval stays human.
  {
    const r = featureRepo(TMP, "stale");
    put(r.root, FA, faText("approved", "## Feature Request\n\nSign in with a passkey instead.\n"));
    const s = st(r.root);
    check("FA body changed after the DD: regenerate the DD first", s.stage === "upstream-stale" && s.next_command?.display === `/dev-design-start ${FEATURE}`, show(s));
  }

  // 5. Deterministic resolution: links win; duplicates are AMBIGUOUS; broken links say so.
  {
    const r = featureRepo(TMP, "amb", { only: ["fa"] });
    put(r.root, "docs/old/login-feature-analysis-2026-10.md", faText());
    const a = st(r.root);
    check("two Feature Analyses for one feature and nothing linking: AMBIGUOUS, never a guess", a.ok === false && a.outcome === "AMBIGUOUS" && a.candidates?.length === 2 && a.next_command === null, show(a));
    const anchored = st(r.root, { doc: FA });
    check("--doc names the one meant", anchored.ok === true && anchored.stage === "design-missing", show(anchored));

    const l = featureRepo(TMP, "links");
    put(l.root, "docs/old/login-feature-analysis-2026-10.md", faText());
    const ls = resolveFeatureDocs(l.root, FEATURE) as any;
    check("links win over the scan: a versioned copy does not make a linked chain ambiguous", ls.ok === true && ls.fa.rel === FA && ls.resolved_by["feature-analysis"] === "link" && ls.resolved_by["task-breakdown"] === "scan");

    const b = featureRepo(TMP, "broken");
    put(b.root, TB, readFileSync(join(b.root, TB), "utf-8").replace(`dd_link: ${DD}`, "dd_link: docs/login/missing-DD.md"));
    const bs = st(b.root);
    check("a link to a missing document is LINK_BROKEN", bs.outcome === "LINK_BROKEN", show(bs));
    check("an invalid feature name is refused", (featureStatus({ root: b.root, feature: "../etc" }) as any).outcome === "FEATURE_ID_INVALID");
  }

  // 5b. B1 — legacy and current Feature Analyses resolve through links and through discovery.
  for (const fx of ["fa-v0", "fa-v1", "fa-v1-nofigma", "fa-v2", "fa-v3-stamped"]) {
    const r = featureRepo(TMP, `legacy-${fx}`, { faRaw: legacyFa(fx) });
    const d = resolveFeatureDocs(r.root, FEATURE) as any;
    check(`B1 ${fx}: the Task Breakdown's link resolves the analysis (no LINK_BROKEN)`, d.ok === true && d.fa?.rel === FA && d.fa.kind === "feature-analysis" && d.resolved_by["feature-analysis"] === "link" && d.devPlan?.rel === PLAN, JSON.stringify([d.outcome, d.reason]));
    const s1 = st(r.root);
    check(`B1 ${fx}: the flow proceeds to implementation`, s1.stage === "implementation" && s1.next_command?.display === `/implement-task ${FEATURE} T1`, show(s1));
    const alone = featureRepo(TMP, `legacy-alone-${fx}`, { faRaw: legacyFa(fx), only: ["fa"] });
    const s2 = st(alone.root);
    check(`B1 ${fx}: discovered without a breakdown — an approved analysis offers the design, never "analysis missing"`, s2.stage === "design-missing", show(s2));
  }
  {
    const r = featureRepo(TMP, "legacy-review", { faRaw: legacyFa("fa-v1") });
    implement(r, "T1");
    implement(r, "T2");
    const { featureReviewContext } = await import("./feature-review.ts");
    const c = featureReviewContext({ root: r.root, feature: FEATURE });
    check("B1: a feature with a legacy analysis reaches its internal review", c.outcome === "FEATURE_REVIEW_READY", JSON.stringify([c.outcome, c.reason]));
    const two = featureRepo(TMP, "legacy-two", { faRaw: legacyFa("fa-v1"), only: ["fa"] });
    put(two.root, "docs/old/login-plan.md", legacyFa("fa-v2"));
    const a2 = st(two.root);
    check("B1: two overlapping-shape documents and no breakdown → AMBIGUOUS, never a guess", a2.outcome === "AMBIGUOUS" && a2.candidates?.length === 2, show(a2));
  }

  // 5c. M1 — several Task Breakdowns (Preserve / Version), resolved only by valid review evidence.
  {
    const TB_V2 = "docs/login/login-task-breakdown-v2.md";
    const TB_OLD = "docs/login/login-task-breakdown-2026-10-01.md";
    const one = featureRepo(TMP, "m1-one");
    check("M1: one breakdown resolves by scan", (resolveFeatureDocs(one.root, FEATURE) as any).resolved_by?.["task-breakdown"] === "scan");

    const pres = featureRepo(TMP, "m1-preserve");
    put(pres.root, TB_V2, readFileSync(join(pres.root, TB), "utf-8"));
    const pa = resolveFeatureDocs(pres.root, FEATURE) as any;
    check("M1: Preserve leaves two breakdowns and no review → genuinely AMBIGUOUS", pa.ok === false && pa.outcome === "AMBIGUOUS" && pa.candidates?.length === 2, JSON.stringify(pa));
    check("M1: an explicit --doc selects one", (resolveFeatureDocs(pres.root, FEATURE, TB) as any).tb?.rel === TB);

    const ver = featureRepo(TMP, "m1-version");
    put(ver.root, TB_OLD, readFileSync(join(ver.root, TB), "utf-8"));
    check("M1: Version leaves two breakdowns and no review → AMBIGUOUS", (resolveFeatureDocs(ver.root, FEATURE) as any).outcome === "AMBIGUOUS");

    // Review evidence bound to one breakdown selects it — for review, Pre-PR and readiness alike.
    const rv = featureRepo(TMP, "m1-reviewed");
    implement(rv, "T1");
    implement(rv, "T2");
    const FR = await import("./feature-review.ts");
    const { reviewInput, figmaEvidence } = await import("./feature-fixture.ts");
    const c = FR.featureReviewContext({ root: rv.root, feature: FEATURE });
    const rp = join(TMP, "m1-review.json");
    writeFileSync(rp, JSON.stringify(reviewInput(c.binding)));
    const w = FR.writeFeatureReview({ root: rv.root, feature: FEATURE, review: rp, designEvidence: figmaEvidence(TMP) });
    check("M1 setup: the review is recorded against the breakdown", w.ok === true, JSON.stringify(w));
    put(rv.root, TB_OLD, readFileSync(join(rv.root, TB), "utf-8").replace("| T2 | Login screen |", "| T2 | Old login screen |"));
    const rr = resolveFeatureDocs(rv.root, FEATURE) as any;
    check("M1: valid review evidence selects the reviewed breakdown", rr.ok === true && rr.tb.rel === TB && rr.resolved_by["task-breakdown"] === "review-record" && rr.warnings.some((x: string) => x.includes("internal review")), JSON.stringify([rr.outcome, rr.reason]));
    check("M1: the review verifies fresh with no --doc", FR.verifyFeatureReview({ root: rv.root, feature: FEATURE }).status === "fresh");
    const { prePrGate } = await import("./pre-pr.ts");
    check("M1: /pre-pr resolves the same breakdown with no --doc", prePrGate({ root: rv.root, work: `feature:${FEATURE}`, data: DATA }, { python: () => "python3", browser: () => "/bin/true" }).outcome === "PRE_PR_READY");
    const { readinessCheck } = await import("./pr-readiness.ts");
    check("M1: readiness resolves it too (no FEATURE_DOCS_UNRESOLVED)", !readinessCheck({ root: rv.root, contract: "1", data: DATA }).blockers.some((b: any) => b.code === "FEATURE_DOCS_UNRESOLVED"));

    // Stale evidence never selects: the reviewed breakdown's body changed.
    put(rv.root, TB, readFileSync(join(rv.root, TB), "utf-8").replace("| T1 | Login hook |", "| T1 | Login hook v2 |"));
    const stale = resolveFeatureDocs(rv.root, FEATURE) as any;
    check("M1: stale review evidence does not select a breakdown — AMBIGUOUS, saying why", stale.outcome === "AMBIGUOUS" && /changed since the review/.test(stale.reason), JSON.stringify(stale));
    // The selected breakdown disappears while two others remain.
    put(rv.root, TB_V2, readFileSync(join(rv.root, TB_OLD), "utf-8"));
    unlinkSync(join(rv.root, TB));
    const gone = resolveFeatureDocs(rv.root, FEATURE) as any;
    check("M1: a reviewed breakdown that disappeared selects nothing — AMBIGUOUS, saying why", gone.outcome === "AMBIGUOUS" && /no longer exists/.test(gone.reason), JSON.stringify(gone));
  }

  // 6. Read-only.
  {
    const r = featureRepo(TMP, "ro", { fa: "proposed" });
    implement(r, "T1", "in-progress");
    const before = git(r.root, "status", "--porcelain", "--untracked-files=all");
    const bytes = [FA, DD, TB, PLAN].map((p) => readFileSync(join(r.root, p), "utf-8"));
    st(r.root);
    check("read-only: nothing in the repository changed", git(r.root, "status", "--porcelain", "--untracked-files=all") === before && [FA, DD, TB, PLAN].every((p, i) => readFileSync(join(r.root, p), "utf-8") === bytes[i]));
    for (const f of ["scripts/feature-flow.ts", "scripts/feature-docs.ts"]) {
      const src = read(f).replace(/\/\*\*[\s\S]*?\*\//g, "");
      check(`read-only: ${f} writes no file`, !/writeFileSync|renameSync|appendFileSync|unlinkSync|mkdirSync/.test(src));
      check(`read-only: ${f} never sets an approval`, !/status:\s*approved["'`]?\s*[,)]/.test(src) && !/["']approved["']\s*\)/.test(src));
    }
  }

  // 7. The commands offer the next step from the helper and never approve.
  {
    for (const c of ["commands/analyze-feature.md", "commands/dev-design-start.md", "commands/dev-feature-start.md"]) {
      const t = read(c);
      check(`${c}: ends by asking feature-flow.ts what comes next`, /scripts\/feature-flow\.ts" status/.test(t));
      check(`${c}: offers it under the Continue rule (explicit yes only)`, /Continue\?/.test(t) && /explicit yes/i.test(t) && /docs\/command-handoff\.md/.test(t));
      check(`${c}: continuing is never an approval`, /never (an )?approv/i.test(t));
    }
    const it = read("commands/implement-task.md");
    const feature = it.slice(it.indexOf("\n## 10. "));
    check("implement-task §10: the feature path offers the next step from feature-flow.ts", /scripts\/feature-flow\.ts" status/.test(feature) && /Continue\?/.test(feature));
    const handoff = read("docs/command-handoff.md");
    check("command-handoff: feature-flow.ts is a next-command helper", /feature-flow\.ts status/.test(handoff));
    check("the suite is registered", read("scripts/check.ts").includes('"feature-flow"'));
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall feature-flow checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
