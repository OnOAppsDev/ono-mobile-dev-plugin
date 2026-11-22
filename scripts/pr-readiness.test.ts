/**
 * pr-readiness.test.ts
 *
 * Pins the PR-readiness contract (`ono-pr-readiness` v1) the Platform Guardian queries, the
 * planning-document traceability it enforces, and the pull request metadata
 * (scripts/pr-readiness.ts, scripts/pr-metadata.ts) — read-only, versioned, never claiming
 * readiness on an unsupported contract, never blocking a branch with no Ono work.
 *
 *   node --no-warnings scripts/pr-readiness.test.ts
 */

import { spawnSync } from "child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import * as R from "./pr-readiness.ts";
import { buildMetadata, parseRemote, repoLink, REFERENCES_HEADING } from "./pr-metadata.ts";
import * as FR from "./feature-review.ts";
import { recordPrePr, locateDataDir, dataDirName } from "./pre-pr.ts";
import { PLUGIN_NAME } from "./next-command.ts";
import { CODE1, CODE2, FA, DD, TB, PLAN, FIGMA, FEATURE, featureRepo, implement, git, put, reviewInput, tmpRoot, figmaEvidence } from "./feature-fixture.ts";

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
const TMP = tmpRoot("pr-readiness-");
const DATA = join(TMP, "plugin-data");
mkdirSync(DATA);
const W = `feature:${FEATURE}`;
const codes = (xs: any[]) => (xs ?? []).map((x) => x.code);
const chk = (root: string, extra: Record<string, unknown> = {}) => R.readinessCheck({ root, contract: "1", data: DATA, ...extra });
const show = (x: any) => JSON.stringify({ ready: x.ready_for_pr, status: x.status, blockers: codes(x.blockers), warnings: codes(x.warnings) });

const CHECKLIST = "# Pre-PR checklist — login (abc1234)\n\n## What changed\nOne-time code sign-in.\n\n## 🔴 Must test\n- [ ] Login → signs in\n\n---\nLocal only. Do not commit or include in the PR.\n";
let n = 0;
function prePr(root: string): any {
  const dir = join(TMP, `out-${++n}`);
  mkdirSync(dir);
  writeFileSync(join(dir, "regression-checklist.md"), CHECKLIST);
  writeFileSync(join(dir, "regression-checklist.pdf"), "%PDF-1.4\n1 0 obj << /Type /Pages /Count 1 >> endobj\n2 0 obj << /Type /Page >> endobj\n%%EOF\n");
  return recordPrePr({ root, work: W, data: DATA, checklist: join(dir, "regression-checklist.md"), pdf: join(dir, "regression-checklist.pdf") });
}
function review(root: string, o: Parameters<typeof reviewInput>[1] = {}): any {
  const c = FR.featureReviewContext({ root, feature: FEATURE });
  if (!c.ok) throw new Error(JSON.stringify(c));
  const p = join(TMP, `review-${++n}.json`);
  writeFileSync(p, JSON.stringify(reviewInput(c.binding, o)));
  return FR.writeFeatureReview({ root, feature: FEATURE, review: p, designEvidence: figmaEvidence(TMP) });
}
/** Implemented, reviewed and Pre-PR'd — not committed yet. */
function ready(name: string) {
  const r = featureRepo(TMP, name);
  git(r.root, "remote", "add", "origin", "git@bitbucket.org:onoapps/yes-tv.git");
  implement(r, "T1");
  implement(r, "T2");
  const w = review(r.root);
  const p = prePr(r.root);
  if (!w.ok || !p.ok) throw new Error(JSON.stringify([w, p]));
  return r;
}

try {
  // 1. Versioning: never ready on a contract this plugin does not speak.
  {
    const r = featureRepo(TMP, "v");
    const none = R.readinessCheck({ root: r.root, contract: null, data: DATA });
    check("contract: no version → contract-required, never ready", none.status === "contract-required" && none.ready_for_pr === false && none.compatible === false, show(none));
    const two = R.readinessCheck({ root: r.root, contract: "2", data: DATA });
    check("contract: an unsupported version → CONTRACT_UNSUPPORTED, never ready, with the supported versions", two.status === "unsupported-contract" && two.ready_for_pr === false && two.compatible === false && codes(two.blockers)[0] === "CONTRACT_UNSUPPORTED" && JSON.stringify(two.supported_versions) === "[1]", show(two));
    const one = chk(r.root);
    check("contract: v1 identifies itself and the plugin", one.contract === "ono-pr-readiness" && one.contract_version === 1 && one.plugin.name === PLUGIN_NAME && typeof one.plugin.version === "string");
  }

  // 2. No Ono work: a warning, never a block.
  {
    const root = join(TMP, "plain");
    mkdirSync(root);
    git(root, "init", "-q", "-b", "main");
    git(root, "config", "user.email", "t@t");
    git(root, "config", "user.name", "t");
    put(root, "src/a.ts", "a\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "a");
    git(root, "checkout", "-qb", "hotfix/x");
    put(root, "src/a.ts", "b\n");
    git(root, "commit", "-qam", "b");
    const x = chk(root);
    check("unmanaged: no Ono work → ready, not managed, with NO_ONO_WORK explaining the workflow", x.ready_for_pr === true && x.managed === false && codes(x.warnings).join() === "NO_ONO_WORK" && x.warnings[0].message.includes(`/${PLUGIN_NAME}:analyze-feature`), show(x));
  }

  // 3. Managed feature: blocked until reviewed, Pre-PR'd and everything required committed.
  {
    const r = featureRepo(TMP, "early");
    implement(r, "T1");
    implement(r, "T2");
    const a = chk(r.root);
    check("managed: the feature is detected from its task state and documents", a.managed === true && a.work?.id === W, show(a));
    check("managed: no review and no Pre-PR → both block", a.ready_for_pr === false && ["REVIEW_MISSING", "PRE_PR_MISSING"].every((c) => codes(a.blockers).includes(c)), show(a));
    check("managed: the next command is the first blocker's", a.next_command?.display === `/review-code --feature ${FEATURE}`);
  }
  {
    const r = ready("full");
    const before = chk(r.root);
    check("before the commit: the review record is required but not committed → blocked", before.ready_for_pr === false && codes(before.blockers).includes("REQUIRED_DOCS_NOT_COMMITTED") && before.documents.not_committed.includes(`docs/reviews/${FEATURE}/review.md`), show(before));
    check("before the commit: reviewed code not committed is a warning", codes(before.warnings).includes("REVIEWED_CODE_NOT_COMMITTED"));
    git(r.root, "add", "-A");
    git(r.root, "commit", "-qm", "login");
    const after = chk(r.root);
    check("after the Guardian commits code and documents: ready for PR", after.ready_for_pr === true && after.blockers.length === 0, show(after));
    check("documents: the planning documents and the review are in the PR", after.documents.required.map((d: any) => `${d.kind}:${d.status}`).join() === "feature-analysis:in-pr,dd:in-pr,task-breakdown:in-pr,dev-plan:in-pr,internal-review:in-pr", JSON.stringify(after.documents.required));
    check("scope: the committed code is exactly the reviewed code", after.scope.committed_matches_reviewed === true && after.scope.committed.length === 3);
    check("report: branch, target, merge base and remote", after.repo.branch === "feature/login" && after.repo.base.branch === "main" && /^[0-9a-f]{40}$/.test(after.repo.merge_base) && after.repo.remote.kind === "bitbucket" && after.repo.remote.owner === "onoapps");
    check("report: review and Pre-PR status", after.review.status === "fresh" && after.pre_pr.status === "fresh" && after.pre_pr.pdf_available === true);
    const md = after.pr_metadata;
    const head = git(r.root, "rev-parse", "HEAD");
    const dd = md.references.find((x: any) => x.type === "dd");
    check("metadata: repository documents are linked at the commit that carries them", dd.status === "linked" && dd.url === `https://bitbucket.org/onoapps/yes-tv/src/${head}/${DD}`, JSON.stringify(dd));
    const fig = md.references.find((x: any) => x.type === "figma");
    check("metadata: Figma keeps its URL and node id, and says it was read in review", fig.url === FIGMA && fig.figma.node_id === "42:7" && fig.access === "accessed", JSON.stringify(fig));
    const spec = md.references.find((x: any) => x.type === "source-spec");
    check("metadata: an external specification is linked as recorded, access not verified", spec.status === "linked" && /atlassian\.net/.test(spec.url) && spec.access === "not-verified");
    check("metadata: acceptance criteria of the tasks in the PR", md.acceptance_criteria.length === 2 && md.acceptance_criteria[1].criterion.includes("Figma frame"));
    const d = md.description_markdown as string;
    check("description: the machine-readable references section, review and Pre-PR summaries", d.includes(REFERENCES_HEADING) && d.includes("### Internal review") && d.includes("### Pre-PR") && d.includes("node `42:7`"));
    check("description: no local filesystem path and no PDF in it", !d.includes(TMP) && !/regression-checklist/.test(d) && !/\/Users\//.test(d));

    // The Guardian commits the code but its hygiene leaves the review record out.
    const status = git(r.root, "status", "--porcelain", "--untracked-files=all");
    const dataBefore = JSON.stringify(readdirSync(DATA, { recursive: true } as any).sort());
    chk(r.root);
    check("read-only: the repository and the data directory are unchanged by a check", git(r.root, "status", "--porcelain", "--untracked-files=all") === status && JSON.stringify(readdirSync(DATA, { recursive: true } as any).sort()) === dataBefore);
  }
  {
    const r = ready("hygiene");
    git(r.root, "add", "src", "docs/tasks");
    git(r.root, "commit", "-qm", "code only");
    const x = chk(r.root);
    check("documents: a review record left out of the commit blocks readiness, by path", x.ready_for_pr === false && JSON.stringify(x.documents.not_committed) === JSON.stringify([`docs/reviews/${FEATURE}/review.md`]), show(x));
  }
  {
    const r = featureRepo(TMP, "ignored");
    git(r.root, "rm", "-q", "-r", "--cached", "docs/login");
    put(r.root, ".gitignore", "node_modules/\ndocs/login/\n");
    git(r.root, "add", "-A");
    git(r.root, "commit", "-qm", "untrack planning docs");
    implement(r, "T1");
    implement(r, "T2");
    review(r.root);
    prePr(r.root);
    git(r.root, "add", "-A");
    git(r.root, "commit", "-qm", "impl");
    const x = chk(r.root);
    check("documents: git-ignored planning documents can never be in the PR → REQUIRED_DOCS_MISSING", x.ready_for_pr === false && codes(x.blockers).includes("REQUIRED_DOCS_MISSING") && x.documents.missing.includes(DD), show(x));
  }
  {
    const r = featureRepo(TMP, "scope");
    implement(r, "T1");
    implement(r, "T2");
    git(r.root, "add", "-A");
    git(r.root, "commit", "-qm", "first version");
    put(r.root, CODE1, "export const LoginScreen = () => 'reviewed';\n");
    review(r.root);
    prePr(r.root);
    git(r.root, "add", `docs/reviews/${FEATURE}/review.md`);
    git(r.root, "commit", "-qm", "review record only");
    const x = chk(r.root);
    check("scope: committed code that is not what was reviewed → SCOPE_NOT_REVIEWED", x.ready_for_pr === false && codes(x.blockers).includes("SCOPE_NOT_REVIEWED") && x.scope.not_reviewed.includes(CODE1), show(x));
  }
  {
    const r = featureRepo(TMP, "amb");
    implement(r, "T1");
    // A second feature's store claiming one of the same files (raw, as another feature's /implement-task left it).
    put(r.root, "docs/tasks/signup-task-state.json", JSON.stringify({ taskStateSchemaVersion: 1, feature: "signup", producedBy: { plugin: PLUGIN_NAME, version: "0.8.0" }, tasks: { T1: { state: "complete", filesChanged: [CODE2] } } }));
    const x = chk(r.root);
    check("ambiguous: two works claim the branch → AMBIGUOUS_WORK until --work names one", x.ready_for_pr === false && codes(x.blockers).join() === "AMBIGUOUS_WORK" && x.candidates.length === 2, show(x));
    check("ambiguous: --work resolves it", chk(r.root, { work: W }).work?.id === W);
  }

  // 3b. M2 — history never makes a clear branch ambiguous.
  {
    const store = (feature: string, files: string[]) => JSON.stringify({ taskStateSchemaVersion: 1, feature, producedBy: { plugin: PLUGIN_NAME, version: "0.7.7" }, tasks: { T1: { state: "complete", filesChanged: files } } });
    // A feature merged long ago touched useLogin.ts; its store is on main.
    const r = featureRepo(TMP, "m2-feature");
    git(r.root, "checkout", "-q", "main");
    put(r.root, "docs/tasks/signup-task-state.json", store("signup", [CODE2]));
    git(r.root, "add", "-A");
    git(r.root, "commit", "-qm", "signup merged earlier");
    git(r.root, "checkout", "-q", "feature/login");
    git(r.root, "merge", "-q", "--no-edit", "main");
    implement(r, "T1");
    const x = chk(r.root);
    check("M2: a new feature editing a file an earlier feature touched is that new feature — not AMBIGUOUS_WORK", x.work?.id === W && !codes(x.blockers).includes("AMBIGUOUS_WORK"), show(x));
    check("M2: detectWork names only the branch's work", JSON.stringify(R.detectWork(r.root, (await import("./pr-scope.ts")).prScope(r.root) as any)) === JSON.stringify([W]));

    // A bug fixed long ago touched app.ts; a new bug's documents are on this branch.
    const root = join(TMP, "m2-bug");
    mkdirSync(root);
    git(root, "init", "-q", "-b", "main");
    git(root, "config", "user.email", "t@t");
    git(root, "config", "user.name", "t");
    put(root, "src/app.ts", "a\n");
    put(root, "docs/tasks/bugs/BUG-1.task-state.json", JSON.stringify({ feature: "bug:BUG-1", tasks: { T1: { state: "complete", filesChanged: ["src/app.ts"] } } }));
    git(root, "add", "-A");
    git(root, "commit", "-qm", "BUG-1 fixed earlier");
    git(root, "checkout", "-qb", "fix/bug-2");
    put(root, "docs/bugs/BUG-2/bug-work-plan.md", "---\nbug_key: BUG-2\n---\n");
    put(root, "src/app.ts", "b\n");
    const y = R.detectWork(root, (await import("./pr-scope.ts")).prScope(root) as any);
    check("M2: a new bug editing a file an earlier bug touched is that new bug", JSON.stringify(y) === '["bug:BUG-2"]', JSON.stringify(y));

    // Nothing on the branch names work: the stores' claims are the fallback (unchanged behaviour).
    const z = join(TMP, "m2-fallback");
    mkdirSync(z);
    git(z, "init", "-q", "-b", "main");
    git(z, "config", "user.email", "t@t");
    git(z, "config", "user.name", "t");
    put(z, "src/app.ts", "a\n");
    put(z, "docs/tasks/bugs/BUG-1.task-state.json", JSON.stringify({ feature: "bug:BUG-1", tasks: { T1: { state: "complete", filesChanged: ["src/app.ts"] } } }));
    git(z, "add", "-A");
    git(z, "commit", "-qm", "base");
    git(z, "checkout", "-qb", "fix/x");
    put(z, "src/app.ts", "c\n");
    check("M2: with no direct evidence, a store claiming the changed file is still the fallback", JSON.stringify(R.detectWork(z, (await import("./pr-scope.ts")).prScope(z) as any)) === '["bug:BUG-1"]');
  }

  // 3c. Bug work end to end: required documents, Major findings through bug-review's reader (m1), legacy bugs (m9).
  {
    const { approveWorkPackage } = await import("./work-approval.ts");
    const { writeTaskState } = await import("./task-state.ts");
    const { generateVerification, recordVerification } = await import("./bug-verification.ts");
    const { reviewContext, writeReviewRecord } = await import("./bug-review.ts");
    const BW = "bug:BUG-43";
    const MAIN = "app/src/main/java/com/acme/checkout/CheckoutTotals.kt";
    const TEST = "app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt";
    const CMD = "./gradlew test --tests CheckoutTotalsTest";
    const REPRO = "The reported reproduction path no longer fails: with SAVE10 applied, checkout shows the discounted total";
    const PLANTXT = readFileSync(join(HERE, "fixtures/bug-work-plans/bwp-cycle1.md"), "utf-8").replace("| T1 | S | T1's test passes; existing totals tests pass |", `| T1 | S | ${REPRO}; T1's test passes |`);
    /** A bug fixed, verified, reviewed (one Major) and Pre-PR'd; its plan on main (planned earlier) or only on the branch. */
    function bugReady(name: string, planOnMain: boolean): string {
      const root = join(TMP, name);
      const plan = join(root, "docs/bugs/BUG-43/bug-work-plan.md");
      put(root, MAIN, "fun total() = 0\n");
      put(root, TEST, "// tests\n");
      git(root, "init", "-q", "-b", "main");
      git(root, "config", "user.email", "t@t");
      git(root, "config", "user.name", "t");
      if (planOnMain) {
        put(root, "docs/bugs/BUG-43/bug-work-plan.md", PLANTXT);
        approveWorkPackage(plan, { by: "dana" });
      }
      git(root, "add", "-A");
      git(root, "commit", "-qm", "base");
      git(root, "checkout", "-qb", "fix/bug-43");
      if (!planOnMain) {
        put(root, "docs/bugs/BUG-43/bug-work-plan.md", PLANTXT);
        approveWorkPackage(plan, { by: "dana" });
      }
      put(root, MAIN, "fun total() = discountedSubtotal()\n");
      put(root, TEST, "// tests\n@Test fun couponIsApplied() {}\n");
      const dt = { framework: "junit", required: true, testsChanged: [TEST], justification: null, runs: [{ command: CMD, result: "pass" }], notRunReason: null };
      writeTaskState(root, BW, "T1", "in-progress", { platform: "android" } as any, plan, { mode: "start" } as any);
      writeTaskState(root, BW, "T1", "complete", { platform: "android", filesChanged: [TEST], standardIds: [], validation: [{ command: CMD, result: "pass" }], acceptanceCriteria: [{ criterion: "The test fails on the current code for the documented reproduction", met: true }], developerTesting: dt, deviations: [], blockers: [] } as any, plan);
      writeTaskState(root, BW, "T2", "in-progress", { platform: "android" } as any, plan, { mode: "start" } as any);
      writeTaskState(root, BW, "T2", "complete", { platform: "android", filesChanged: [MAIN], standardIds: [], validation: [{ command: CMD, result: "pass" }], acceptanceCriteria: [{ criterion: REPRO, met: true }, { criterion: "T1's test passes", met: true }], developerTesting: { ...dt, regression: { command: CMD, failedBefore: true, passesAfter: true } }, deviations: [], blockers: [] } as any, plan);
      const g = generateVerification({ root, work: BW });
      recordVerification({ root, work: BW, by: "dana", acceptDebt: true, results: g.items.flatMap((it: any) => it.surfaces.map((surface: string) => ({ id: it.id, surface, result: "pass" }))) });
      const ctx = reviewContext({ root, work: BW });
      const rp = join(TMP, `${name}-review.json`);
      writeFileSync(rp, JSON.stringify({ binding: ctx.binding, reviewed_by: "code-reviewer", generated_at: "2026-11-20T10:00:00Z", checks: [
        { id: "root-cause", status: "pass", note: "addressed" }, { id: "reproduction-path", status: "pass", note: "regression test" },
        { id: "plan-conformance", status: "pass", note: "in scope" }, { id: "regression-risk", status: "pass", note: "checkout only" }],
        findings: [{ severity: "major", platform: "android", path: MAIN, line: 1, rule: "AND-ARCH-3", description: "Totals logic lives in the view model", remediation: "Move it to the use case" }] }));
      const rv = writeReviewRecord({ root, work: BW, review: rp });
      if (!rv.ok) throw new Error(JSON.stringify(rv));
      const dir = join(TMP, `${name}-out`);
      mkdirSync(dir);
      writeFileSync(join(dir, "regression-checklist.md"), CHECKLIST);
      writeFileSync(join(dir, "regression-checklist.pdf"), "%PDF-1.4\n2 0 obj << /Type /Page >> endobj\n%%EOF\n");
      const pp = recordPrePr({ root, work: BW, data: DATA, checklist: join(dir, "regression-checklist.md"), pdf: join(dir, "regression-checklist.pdf") });
      if (!pp.ok) throw new Error(JSON.stringify(pp));
      git(root, "add", "-A");
      git(root, "commit", "-qm", "fix");
      return root;
    }
    const legacy = bugReady("bug-legacy", true);
    const lx = chk(legacy);
    check("bug: the work is detected from the branch", lx.work?.id === BW, show(lx));
    check("m9: a bug planned before the snapshot existed is not blocked for it — a warning says why", lx.ready_for_pr === true && codes(lx.warnings).includes("LEGACY_BUG_NO_SNAPSHOT") && !lx.documents.required.some((d: any) => d.kind === "bug-report"), show(lx));
    check("bug: the Fix Plan and the review record are required and in the PR", lx.documents.required.map((d: any) => `${d.kind}:${d.status}`).join() === "fix-plan:in-base,internal-review:in-pr", JSON.stringify(lx.documents.required));
    const major = lx.pr_metadata.review_summary.majors;
    check("m1: Major findings come from bug-review's own record reader, with path and line", major.length === 1 && major[0].path === MAIN && major[0].line === 1 && major[0].rule === "AND-ARCH-3" && major[0].description === "Totals logic lives in the view model", JSON.stringify(major));
    check("bug: the description lists the Major finding", lx.pr_metadata.description_markdown.includes("[AND-ARCH-3] Totals logic lives in the view model"));
    const fresh = bugReady("bug-new", false);
    const fx = chk(fresh);
    check("m9: a bug planned on this branch without its snapshot is still blocked (REQUIRED_DOCS_MISSING)", fx.ready_for_pr === false && codes(fx.blockers).includes("REQUIRED_DOCS_MISSING") && fx.documents.missing.includes("docs/bugs/BUG-43/bug-report.json"), show(fx));
  }

  // 4. Metadata rules in isolation.
  {
    check("remote: Bitbucket SSH and HTTPS forms", JSON.stringify(parseRemote("git@bitbucket.org:onoapps/yes-tv.git")) === JSON.stringify(parseRemote("https://yagil@bitbucket.org/onoapps/yes-tv.git")) && parseRemote("ssh://git@bitbucket.org/onoapps/yes-tv.git")?.repo === "yes-tv");
    check("remote: an unknown host gets no invented link", repoLink(parseRemote("git@git.internal:a/b.git"), "a".repeat(40), "docs/x.md") === null);
    const base = {
      work: { type: "bug" as const, id: "bug:PAY-1182" }, title: "PAY-1182: discount lost", head: "b".repeat(40), remote: parseRemote("git@bitbucket.org:onoapps/shop.git"),
      docs: [{ kind: "fix-plan", label: "Bug Fix Plan", path: "docs/bugs/PAY-1182/bug-work-plan.md", status: "uncommitted" as const }],
      source: { value: "PAY-1182", from: "docs/bugs/PAY-1182/bug-report.json#identity", label: "Bug report (external)" },
      design: null, designVerification: null, acceptance: [], review: { status: "fresh", counts: { blocking: 0, major: 0, minor: 0, nit: 0 }, ui_conformance: null, majors: [] },
      prePr: { status: "fresh", must: 1, should: 0 }, statusOf: () => "in-pr" as const,
    };
    const m = buildMetadata(base);
    const src = m.references.find((x: any) => x.type === "source-spec");
    check("metadata: a bare tracker key is shown as an identifier — no URL is built from it", src.status === "identifier-only" && src.url === null && !m.description_markdown.includes("atlassian.net"));
    check("metadata: an uncommitted document is never linked and is flagged", m.references.find((x: any) => x.type === "fix-plan").url === null && m.warnings.some((w: any) => w.code === "DOC_NOT_COMMITTED"));
    const ui = buildMetadata({ ...base, work: { type: "feature", id: W }, design: { status: "provided", type: "figma", reference: null, figma_link: "https://www.figma.com/design/AbC123/Login", from: TB }, designVerification: "failed" });
    check("metadata: a Figma link without a node id is warned; a denied read is reported as inaccessible", ui.warnings.some((w: any) => w.code === "FIGMA_NODE_MISSING") && ui.warnings.some((w: any) => w.code === "DESIGN_INACCESSIBLE"));
    const none = buildMetadata({ ...base, work: { type: "feature", id: W }, design: { status: "provided", type: null, reference: null, figma_link: null, from: TB } });
    check("metadata: a UI feature with no design reference is reported missing", none.warnings.some((w: any) => w.code === "DESIGN_REFERENCE_MISSING"));
    const nr = buildMetadata({ ...base, work: { type: "feature", id: W }, design: { status: "not_required", type: "none", reference: null, figma_link: null, from: TB } });
    check("metadata: no UI change → design not applicable, with the reason", nr.references.find((x: any) => x.kind === "ui").status === "not-applicable");
  }

  // 5. Locating this plugin's data directory without CLAUDE_PLUGIN_DATA.
  {
    const cfg = join(TMP, "claude-config");
    mkdirSync(join(cfg, "plugins"), { recursive: true });
    writeFileSync(join(cfg, "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "other@m": [{ installPath: TMP }], [`${PLUGIN_NAME}@ono-plugin-marketplace`]: [{ scope: "user", installPath: REPO_ROOT }] } }));
    const saved = process.env.CLAUDE_PLUGIN_DATA;
    process.env.CLAUDE_PLUGIN_DATA = join(TMP, "guardian-data");
    const loc = locateDataDir(REPO_ROOT, cfg);
    process.env.CLAUDE_PLUGIN_DATA = saved;
    check("data dir: found through the plugin registry by this plugin's own install path", loc?.dir === join(cfg, "plugins", "data", `${PLUGIN_NAME}-ono-plugin-marketplace`), JSON.stringify(loc));
    check("data dir: Claude Code's directory naming", dataDirName("ono-mobile-dev-plugin@ono-plugin-marketplace") === "ono-mobile-dev-plugin-ono-plugin-marketplace");
    check("data dir: another plugin's CLAUDE_PLUGIN_DATA is never read", !/process\.env\.CLAUDE_PLUGIN_DATA/.test(read("scripts/pre-pr.ts") + read("scripts/pr-readiness.ts")));
  }

  // 6. CLI, contract document and boundaries.
  {
    const r = featureRepo(TMP, "cli");
    const out = spawnSync(process.execPath, ["--no-warnings", join(HERE, "pr-readiness.ts"), "check", "--root", r.root, "--contract", "1", "--data", DATA], { encoding: "utf-8" });
    const j = JSON.parse(out.stdout);
    check("cli: exits 0 with one JSON object", out.status === 0 && j.contract === "ono-pr-readiness");
    const bad = spawnSync(process.execPath, ["--no-warnings", join(HERE, "pr-readiness.ts"), "check", "--root", r.root, "--contract", "9"], { encoding: "utf-8" });
    check("cli: an unsupported contract still exits 0 and is never ready", bad.status === 0 && JSON.parse(bad.stdout).ready_for_pr === false);
    const doc = read("docs/pr-readiness-contract.md");
    for (const k of ["ready_for_pr", "contract_version", "REQUIRED_DOCS_NOT_COMMITTED", "SCOPE_NOT_REVIEWED", "NO_ONO_WORK", "CONTRACT_UNSUPPORTED", "AMBIGUOUS_WORK", "pr_metadata", "description_markdown"]) check(`contract doc names ${k}`, doc.includes(k));
    const src = [read("scripts/pr-readiness.ts"), read("scripts/pr-metadata.ts")].join("\n").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("boundary: never writes a file", !/writeFileSync|renameSync|appendFileSync|unlinkSync|mkdirSync/.test(src));
    check("boundary: never runs a git write", !/["'](add|commit|push|checkout|reset|fetch|merge|stash|tag)["']/.test(src));
    check("boundary: no network", !/fetch\(|https?\.request|node:https|from "https"/.test(src));
    check("the suite is registered", read("scripts/check.ts").includes('"pr-readiness"'));
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall pr-readiness checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
