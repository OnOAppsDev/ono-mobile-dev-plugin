/**
 * pre-pr.test.ts
 *
 * Pins the Pre-PR regression checklist this plugin owns (0.8.0): the vendored
 * `regression-checklist` skill is the original, byte for byte; `/pre-pr` runs only after
 * development, testing and a fresh internal review with no Blocking finding; the PDF is
 * mandatory and one page; the checklist and PDF live in the plugin's persistent data directory,
 * never in a repository; the record is fresh across a content-preserving commit and stale after
 * a code or review change; an unchanged Pre-PR is not rerun, and a lost PDF is regenerated
 * without a new analysis.
 *
 *   node --no-warnings scripts/pre-pr.test.ts
 */

import { spawnSync } from "child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { join, dirname } from "path";
import * as P from "./pre-pr.ts";
import * as FR from "./feature-review.ts";
import { featureStatus } from "./feature-flow.ts";
import { approveWorkPackage } from "./work-approval.ts";
import { writeTaskState } from "./task-state.ts";
import { generateVerification, recordVerification } from "./bug-verification.ts";
import { writeReviewRecord } from "./bug-review.ts";
import { PLUGIN_NAME } from "./next-command.ts";
import { CODE1, FEATURE, featureRepo, implement, git, put, reviewInput, tmpRoot, figmaEvidence } from "./feature-fixture.ts";

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
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const show = (x: any) => JSON.stringify([x?.outcome ?? x?.status, x?.code, x?.reason, x?.reasons]);
const TMP = tmpRoot("pre-pr-");
const DATA = join(TMP, "plugin-data");
mkdirSync(DATA);
const W = `feature:${FEATURE}`;

// A stand-in Chromium: writes a one-page (or, with PRE_PR_STUB_PAGES=2, two-page) PDF where asked.
const STUB = join(TMP, "bin", "chromium-stub");
mkdirSync(dirname(STUB), { recursive: true });
writeFileSync(STUB, `#!/usr/bin/env bash
out=""; for a in "$@"; do case "$a" in --print-to-pdf=*) out="\${a#--print-to-pdf=}";; esac; done
pages="\${PRE_PR_STUB_PAGES:-1}"
{ printf '%%PDF-1.4\\n1 0 obj << /Type /Pages /Count %s >> endobj\\n' "$pages"; for i in $(seq 1 "$pages"); do printf '%s 0 obj << /Type /Page /Parent 1 0 R >> endobj\\n' "$((i+1))"; done; printf '%%%%EOF\\n'; } > "$out"
`);
chmodSync(STUB, 0o755);
process.env.PRE_PR_BROWSER = STUB;

const CHECKLIST = (items = 3) => `# Pre-PR checklist — login (abc1234)

## What changed
Sign-in now takes a one-time code.

## 🎯 Critical areas
- Session restore — the session is stored by the new hook

## 🔴 Must test
${Array.from({ length: Math.min(items, 5) }, (_, i) => `- [ ] Login screen / step ${i + 1} → works`).join("\n")}

## 🟠 Should test
${Array.from({ length: Math.max(0, items - 5) }, (_, i) => `- [ ] Profile switch ${i + 1} → session kept`).join("\n")}

## ⚠️ Watch out
- Code length is not validated (\`src/login/LoginScreen.tsx:1\`)

---
Local only. Do not commit or include in the PR.
`;
let outN = 0;
/** What the skill leaves behind: $OUT_DIR/regression-checklist.{md,pdf}, built by the real md_to_pdf_open.py. */
function skillOutput(md = CHECKLIST(), pages = 1): { md: string; pdf: string; build: ReturnType<typeof spawnSync> } {
  const dir = join(TMP, `out-${++outN}`);
  mkdirSync(dir);
  const mdPath = join(dir, "regression-checklist.md");
  writeFileSync(mdPath, md);
  const build = spawnSync("python3", [P.PDF_SCRIPT, mdPath, "--no-open"], { encoding: "utf-8", env: { ...process.env, PRE_PR_STUB_PAGES: String(pages) } });
  return { md: mdPath, pdf: join(dir, "regression-checklist.pdf"), build };
}
const gate = (root: string, work = W) => P.prePrGate({ root, work, data: DATA });
const rec = (root: string, out: { md: string; pdf: string }, work = W) => P.recordPrePr({ root, work, data: DATA, checklist: out.md, pdf: out.pdf });
const ver = (root: string, work = W) => P.verifyPrePr({ root, work, data: DATA });

/** A feature implemented, tested and reviewed clean — ready for its Pre-PR. */
function reviewedFeature(name: string, findings: unknown[] = [], checks: Record<string, string> = {}) {
  const r = featureRepo(TMP, name);
  implement(r, "T1");
  implement(r, "T2");
  const c = FR.featureReviewContext({ root: r.root, feature: FEATURE });
  const p = join(TMP, `${name}-review.json`);
  writeFileSync(p, JSON.stringify(reviewInput(c.binding, { findings, checks })));
  const w = FR.writeFeatureReview({ root: r.root, feature: FEATURE, review: p, designEvidence: figmaEvidence(TMP) });
  if (!w.ok) throw new Error(JSON.stringify(w));
  return r;
}

try {
  // 1. The vendored skill is the original, unchanged.
  {
    check("vendored: md_to_pdf_open.py is byte-identical to the original Pre-PR skill's", sha(readFileSync(P.PDF_SCRIPT)) === "7471291124793c5001412a9843c27984c69817f5647812e7f658b0b1b8e4f576");
    const skill = readFileSync(join(P.SKILL_DIR, "SKILL.md"));
    const body = skill.subarray(skill.indexOf("\n---\n", 4) + 5);
    check("vendored: the SKILL.md body is byte-identical to the original's (only the frontmatter differs)", sha(body) === "19d5157d45af01036765a369f8ec350ecbe61c6700204275272469753388613b");
    const fm = skill.toString("utf-8").slice(0, skill.indexOf("\n---\n", 4));
    check("vendored: an internal skill — not user-invocable, no pre-PR trigger phrases that could race another plugin's skill", /^name: regression-checklist$/m.test(fm) && /^user-invocable: false$/m.test(fm) && !/before I open a PR|what could I have broken|ready for PR/i.test(fm));
    check("vendored: there is exactly one copy of the skill in the plugin", !existsSync(join(REPO_ROOT, "skills/pre-pr")));
    const cand = P.browserCandidates();
    check("dependencies: the browser lookup is read from the script itself (no drift)", cand.paths.length === 7 && cand.names.length === 6 && cand.paths[0].includes("Google Chrome"));
    check("PDF pages: the Node count is the script's count (/Type /Page, never /Pages)", P.pdfPageCount(Buffer.from("<< /Type /Pages >> << /Type /Page >> << /Type/Page >>")) === 2);
  }

  // 2. Prerequisites.
  {
    const r = featureRepo(TMP, "early");
    implement(r, "T1");
    const g = gate(r.root);
    check("gate: no review yet → refused, offering /review-code --feature", g.ok === false && g.outcome === "PRE_PR_REVIEW_MISSING" && g.next_command?.display === `/review-code --feature ${FEATURE}`, show(g));
    const b = reviewedFeature("blocking", [{ severity: "blocking", platform: "react", path: CODE1, line: 1, rule: "FEATURE-CHECK-ACCEPTANCE", description: "six digits not enforced", remediation: "validate" }], { "acceptance-criteria": "concern" });
    const bg = gate(b.root);
    check("gate: a Blocking finding → refused, offering /fix-review-comments", bg.outcome === "PRE_PR_BLOCKING_FINDINGS" && bg.next_command?.skill === `${PLUGIN_NAME}:fix-review-comments`, show(bg));
    const s = reviewedFeature("stale");
    put(s.root, CODE1, "changed\n");
    check("gate: a stale review → refused", gate(s.root).outcome === "PRE_PR_REVIEW_STALE");
    check("gate: an invalid work id is refused", gate(s.root, "login").outcome === "PRE_PR_WORK_INVALID");
    const ok = reviewedFeature("deps");
    const d = P.prePrGate({ root: ok.root, work: W, data: DATA }, { python: () => null, browser: () => null });
    check("gate: no Python or browser → stop, naming both; the PDF is mandatory", d.ok === false && d.outcome === "PRE_PR_DEPENDENCY_MISSING" && /mandatory/.test(d.reason) && d.missing.length === 2, show(d));
    const nb = P.prePrGate({ root: ok.root, work: W, data: DATA }, { python: () => "python3", browser: () => null });
    check("gate: no browser alone → stop, naming the browser", nb.outcome === "PRE_PR_DEPENDENCY_MISSING" && nb.missing.length === 1 && /Chromium/.test(nb.missing[0]), show(nb));
    const savedBrowser = process.env.PRE_PR_BROWSER;
    process.env.PRE_PR_BROWSER = STUB;
    check("dependencies: PRE_PR_BROWSER is honoured, as by the script", P.findBrowser() === STUB);
    process.env.PRE_PR_BROWSER = savedBrowser;
    const inRepo = P.prePrGate({ root: ok.root, work: W, data: join(ok.root, ".data") });
    check("gate: a data directory inside a repository is refused", inRepo.outcome === "PRE_PR_DATA_DIR_IN_REPOSITORY", show(inRepo));
  }

  // 3. Ready → the skill's output → record → fresh.
  {
    const r = reviewedFeature("happy");
    const g = gate(r.root);
    check("gate: ready, with the exact PR scope for the skill", g.ok === true && g.outcome === "PRE_PR_READY" && g.scope.target === "main" && g.scope.files.length === 3 && g.scope.uncommitted.length === 3, show(g));
    check("gate: names the vendored skill, qualified", g.skill.qualified === `${PLUGIN_NAME}:regression-checklist`);
    const out = skillOutput();
    check("the real md_to_pdf_open.py builds the PDF (stub browser)", out.build.status === 0 && existsSync(out.pdf), String(out.build.stderr));
    const w = rec(r.root, out);
    check("record: completed, copied into the plugin's data directory", w.ok === true && w.outcome === "PRE_PR_RECORDED" && w.pdf_path.startsWith(DATA) && existsSync(w.pdf_path) && existsSync(w.checklist_path), show(w));
    check("record: counts read from the checklist", w.counts.must === 3 && w.counts.should === 0);
    check("record: a feature is then ready for PR (no next command)", w.next_command === null);
    const before = git(r.root, "status", "--porcelain", "--untracked-files=all", "--ignored");
    check("isolation: nothing of the Pre-PR is in the repository", !/regression-checklist|pre-pr/.test(before));
    check("verify: fresh", ver(r.root).status === "fresh", show(ver(r.root)));
    const again = gate(r.root);
    check("rerun: an unchanged Pre-PR is not run again", again.outcome === "PRE_PR_FRESH" && again.pdf_path === w.pdf_path, show(again));
    // A3: the PRE_PR line — one line, derived from the canonical record, never a second state.
    const line = String(w.pre_pr_line ?? "");
    const lj = (() => { try { return JSON.parse(line.replace(/^PRE_PR /, "")); } catch { return null; } })();
    check("A3: record prints one machine-readable PRE_PR line", /^PRE_PR \{.*\}$/.test(line) && !line.includes("\n"), line);
    check("A3: the line carries work, HEAD, counts, the top risk and the PDF", lj?.contract === 1 && lj.work === W && lj.head === g.scope.head && lj.must === 3 && lj.should === 0 && lj.pdf === w.pdf_path && typeof lj.topRisk === "string" && lj.topRisk.length > 0, line);
    check("A3: a fresh rerun prints the same line (derived, not stored separately)", again.pre_pr_line === w.pre_pr_line, `${again.pre_pr_line} / ${w.pre_pr_line}`);
    const store = readdirSync(dirname(w.pdf_path)).sort().join();
    check("A3: no second Pre-PR state — the store holds only the record, the checklist and the PDF", store === ["record.json", "regression-checklist.md", "regression-checklist.pdf"].sort().join(), store);
    const grep = spawnSync("git", ["-C", r.root, "grep", "-I", "-l", "--untracked", "-e", "PRE_PR", "-e", "prePr", "-e", "regression-checklist"], { encoding: "utf-8" });
    check("A3: nothing about the Pre-PR is written into the repository's task state or plans", grep.status === 1 && grep.stdout === "", grep.stdout);
    const st = featureStatus({ root: r.root, feature: FEATURE, data: DATA });
    check("flow: review and Pre-PR fresh → ready for PR, handed to the Guardian", st.stage === "ready-for-pr" && st.next_command === null && /Platform Guardian/.test(st.message), st.stage);

    git(r.root, "add", "-A");
    git(r.root, "commit", "-qm", "login");
    check("commit: a content-preserving commit keeps the Pre-PR fresh", ver(r.root).status === "fresh", show(ver(r.root)));

    unlinkSync(w.pdf_path);
    const lost = gate(r.root);
    check("PDF lost: regenerate from the recorded checklist, no new analysis", lost.outcome === "PRE_PR_PDF_MISSING" && lost.regenerate.command.includes(w.checklist_path), show(lost));
    const regen = spawnSync("bash", ["-c", lost.regenerate.command], { encoding: "utf-8" });
    check("PDF lost: the regeneration command rebuilds it in place", regen.status === 0 && ver(r.root).status === "fresh" && ver(r.root).pdf_available === true, regen.stderr);

    // m2: the same content on another branch is another pull request.
    git(r.root, "checkout", "-qb", "feature/login-copy");
    const other = ver(r.root);
    check("m2: a Pre-PR recorded on one branch is stale on another, naming both", other.status === "stale" && other.reasons.some((x: any) => x.code === "PRE_PR_BRANCH_CHANGED" && /feature\/login/.test(x.message)), show(other));
    git(r.root, "checkout", "-q", "feature/login");
    check("m2: back on the recorded branch it is fresh again", ver(r.root).status === "fresh");
    // m10: the target starts resolving to a remote-tracking branch that sits elsewhere.
    git(r.root, "update-ref", "refs/remotes/origin/main", git(r.root, "rev-parse", "feature/login~1"));
    const moved = ver(r.root);
    check("m10: a target that now resolves to another ref says so", moved.status === "stale" && moved.reasons.some((x: any) => x.code === "PRE_PR_SCOPE_BASE_CHANGED" && /refs\/remotes\/origin\/main/.test(x.message) && /refs\/heads\/main/.test(x.message)), show(moved));
    git(r.root, "update-ref", "-d", "refs/remotes/origin/main");

    put(r.root, CODE1, "export const LoginScreen = () => 'v2';\n");
    const stale = ver(r.root);
    check("code change: the Pre-PR is stale", stale.status === "stale" && stale.reasons.some((x: any) => x.code === "PRE_PR_CODE_CHANGED"), show(stale));
  }

  // 4. Output validation and isolation.
  {
    const r = reviewedFeature("validate");
    const tooMany = rec(r.root, skillOutput(CHECKLIST(9)));
    check("record: more than eight checks is refused", tooMany.ok === false && tooMany.code === "PRE_PR_CHECKLIST_INVALID" && /at most 8/.test(tooMany.reason), show(tooMany));
    const two = rec(r.root, skillOutput(CHECKLIST(), 2));
    check("record: a PDF longer than one page is refused", two.ok === false && two.code === "PRE_PR_PDF_NOT_ONE_PAGE", show(two));
    const md = skillOutput();
    const noPdf = rec(r.root, { md: md.md, pdf: join(TMP, "missing.pdf") });
    check("record: no PDF → refused; Pre-PR is never complete without it", noPdf.ok === false && noPdf.code === "INVALID_ARGUMENT", show(noPdf));
    const shape = rec(r.root, skillOutput("# Notes\n\n- [ ] something\n"));
    check("record: a checklist without the template's shape is refused", shape.ok === false && shape.code === "PRE_PR_CHECKLIST_INVALID");
    put(r.root, "node_modules/tmp/regression-checklist.md", CHECKLIST()); // ignored, so the review stays fresh
    const inside = rec(r.root, { md: join(r.root, "node_modules/tmp/regression-checklist.md"), pdf: md.pdf });
    check("record: a checklist inside the repository is refused", inside.ok === false && inside.code === "PRE_PR_INSIDE_REPOSITORY", show(inside));
    check("isolation: the refused attempts recorded nothing", ver(r.root).status === "missing");
    const py = spawnSync("python3", [P.PDF_SCRIPT, join(r.root, "node_modules/tmp/regression-checklist.md"), "--no-open"], { encoding: "utf-8" });
    check("isolation: the original script itself refuses a checklist inside a git repository (exit 2)", py.status === 2 && /REFUSED/.test(py.stderr));
  }

  // 5. Bug work: after the bug review, before the QA handoff.
  {
    const root = join(TMP, "bug");
    const PLAN = readFileSync(join(HERE, "fixtures/bug-work-plans/bwp-cycle1.md"), "utf-8").replace("| T1 | S | T1's test passes; existing totals tests pass |", "| T1 | S | The reported reproduction path no longer fails: with SAVE10 applied, checkout shows the discounted total; T1's test passes |");
    const MAIN = "app/src/main/java/com/acme/checkout/CheckoutTotals.kt";
    const TEST = "app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt";
    const CMD = "./gradlew test --tests CheckoutTotalsTest";
    const plan = join(root, "docs/bugs/BUG-43/bug-work-plan.md");
    put(root, MAIN, "fun total() = 0\n");
    put(root, TEST, "// tests\n");
    put(root, "docs/bugs/BUG-43/bug-work-plan.md", PLAN);
    approveWorkPackage(plan, { by: "dana" });
    git(root, "init", "-q", "-b", "main");
    git(root, "config", "user.email", "t@t");
    git(root, "config", "user.name", "t");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "plan");
    git(root, "checkout", "-qb", "fix/bug-43");
    const BW = "bug:BUG-43";
    check("bug: before verification → testing required", gate(root, BW).outcome === "PRE_PR_TESTING_REQUIRED");
    put(root, MAIN, "fun total() = discountedSubtotal()\n");
    put(root, TEST, "// tests\n@Test fun couponIsApplied() {}\n");
    const dt = { framework: "junit", required: true, testsChanged: [TEST], justification: null, runs: [{ command: CMD, result: "pass" }], notRunReason: null };
    writeTaskState(root, BW, "T1", "in-progress", { platform: "android" } as any, plan, { mode: "start" } as any);
    writeTaskState(root, BW, "T1", "complete", { platform: "android", filesChanged: [TEST], standardIds: [], validation: [{ command: CMD, result: "pass" }], acceptanceCriteria: [{ criterion: "The test fails on the current code for the documented reproduction", met: true }], developerTesting: dt, deviations: [], blockers: [] } as any, plan);
    writeTaskState(root, BW, "T2", "in-progress", { platform: "android" } as any, plan, { mode: "start" } as any);
    writeTaskState(root, BW, "T2", "complete", { platform: "android", filesChanged: [MAIN], standardIds: [], validation: [{ command: CMD, result: "pass" }], acceptanceCriteria: [{ criterion: "The reported reproduction path no longer fails: with SAVE10 applied, checkout shows the discounted total", met: true }, { criterion: "T1's test passes", met: true }], developerTesting: { ...dt, regression: { command: CMD, failedBefore: true, passesAfter: true } }, deviations: [], blockers: [] } as any, plan);
    const g = generateVerification({ root, work: BW });
    recordVerification({ root, work: BW, by: "dana", acceptDebt: true, results: g.items.flatMap((it: any) => it.surfaces.map((surface: string) => ({ id: it.id, surface, result: "pass" }))) });
    check("bug: verified but not reviewed → review missing", gate(root, BW).outcome === "PRE_PR_REVIEW_MISSING");
    const { reviewContext } = await import("./bug-review.ts");
    const ctx = reviewContext({ root, work: BW });
    const rp = join(TMP, "bug-review.json");
    writeFileSync(rp, JSON.stringify({ binding: ctx.binding, reviewed_by: "code-reviewer", generated_at: "2026-11-20T10:00:00Z", findings: [], checks: [
      { id: "root-cause", status: "pass", note: "addressed" }, { id: "reproduction-path", status: "pass", note: "regression test" },
      { id: "plan-conformance", status: "pass", note: "in scope" }, { id: "regression-risk", status: "pass", note: "checkout only" }] }));
    const br = writeReviewRecord({ root, work: BW, review: rp });
    check("bug: the recorded review hands on to /pre-pr", br.ok === true && br.next_command?.display === `/pre-pr ${BW}`, show(br));
    const bg = gate(root, BW);
    check("bug: ready after a fresh review", bg.outcome === "PRE_PR_READY", show(bg));
    const w = rec(root, skillOutput(), BW);
    check("bug: recorded, then offers the QA handoff (whose gates are unchanged)", w.ok === true && w.next_command?.display === `/create-dev-qa-notes ${BW}`, show(w));
  }

  // 6. The command and the boundaries.
  {
    const cmd = read("commands/pre-pr.md");
    check("command: gate → skill → record, all through the helper", cmd.includes('scripts/pre-pr.ts" gate') && cmd.includes('scripts/pre-pr.ts" record') && /regression-checklist/.test(cmd));
    check("command: passes the plugin's persistent data directory", cmd.includes('--data "${CLAUDE_PLUGIN_DATA}"'));
    check("command: the PDF is mandatory — no Markdown-only completion", /PDF is mandatory/.test(cmd) && /never completes this command/.test(cmd));
    check("command (m5): record uses the absolute paths the skill printed, never a shell variable", !/--checklist "\$OUT_DIR/.test(cmd) && /Shell variables .* do not survive/.test(cmd) && cmd.includes('--checklist "<absolute path of regression-checklist.md>"'));
    check("command (m6): a failed PDF overrides the skill's Markdown-only closing line", /That is not completion here/.test(cmd) && /✗ Pre-PR not complete/.test(cmd) && /never present the Markdown checklist as the result/.test(cmd));
    check("command: no rerun of an unchanged Pre-PR; regenerate a lost PDF without analysis", /nothing to rerun/i.test(cmd) && /Do not analyse again/.test(cmd));
    check("command: never commits, stages or writes inside the repository", /never commits, stages or pushes/.test(cmd) && /never writes inside the repository/.test(cmd));
    check("command: tells the developer to skip the Guardian's own pre-PR during the transition", /answer "skip"/.test(cmd));
    const src = read("scripts/pre-pr.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("boundary: never stages, commits or pushes", !/["'](add|commit|push|stage)["']/.test(src));
    check("boundary: never reads the CLAUDE_PLUGIN_DATA environment variable (another plugin's value in its hooks)", !/process\.env\.CLAUDE_PLUGIN_DATA/.test(src));
    check("boundary: reads no clock", !/\bnew Date\b|\bDate\.now\b|\bMath\.random\b/.test(src));
    check("the suite is registered", read("scripts/check.ts").includes('"pre-pr"'));
    // A3 integration (Guardian consumes, the Dev Plugin owns).
    const fm = cmd.slice(0, cmd.indexOf("\n---", 4));
    check("A3: /pre-pr is model-invocable (Guardian's closer can start it)", !/disable-model-invocation:\s*true/.test(fm) && /^description: /m.test(fm));
    check("A3: the command ends with the PRE_PR line, from the record", /Always end with the result line/.test(cmd) && cmd.includes("`pre_pr_line`") && /authoritative, machine-readable answer stays the readiness contract/.test(cmd));
    check("A3: one Pre-PR implementation — the vendored skill, no copy under another name", readdirSync(join(REPO_ROOT, "skills")).filter((d) => /pre-?pr|regression/i.test(d)).join() === "regression-checklist");
    const bugReview = read("scripts/bug-review.ts"), featureReview = read("scripts/feature-review.ts");
    check("A3: position — after the internal review (bug and feature), before the QA handoff (bug)", /next_command: nextCommand\("pre-pr", ctx\.work_id\)/.test(bugReview) && /nextCommand\("pre-pr", `feature:\$\{req\.feature\}`\)/.test(featureReview) && /nextCommand\("create-dev-qa-notes", w\.work\)/.test(read("scripts/pre-pr.ts")));
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall pre-pr checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
