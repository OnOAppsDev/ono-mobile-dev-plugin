/**
 * feature-review.test.ts
 *
 * Pins the mandatory Feature internal review (0.8.0): `/review-code --feature <feature>`
 * persists docs/reviews/<feature>/review.md through scripts/feature-review.ts, on the bug
 * review's findings model, bound to the intended pull request's code (scripts/pr-scope.ts),
 * the approved planning documents, the design reference and the scoped tasks' state — fresh
 * across a content-preserving commit, stale after any relevant change, and honest about
 * whether the Figma design was actually read.
 *
 *   node --no-warnings scripts/feature-review.test.ts
 */

import { readFileSync, rmSync, writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import * as FR from "./feature-review.ts";
import { featureStatus } from "./feature-flow.ts";
import { writeTaskState } from "./task-state.ts";
import { renderFinding, parseFinding } from "./bug-review.ts";
import { PLUGIN_NAME } from "./next-command.ts";
import { FA, DD, TB, CODE1, CODE2, FIGMA, FEATURE, featureRepo, implement, git, put, reviewInput, ddText, faText, tbText, tmpRoot, figmaEvidence } from "./feature-fixture.ts";

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
const TMP = tmpRoot("feature-review-");
const DATA = join(TMP, "plugin-data");
mkdirSync(DATA);
const ctx = (root: string) => FR.featureReviewContext({ root, feature: FEATURE });
const verify = (root: string) => FR.verifyFeatureReview({ root, feature: FEATURE });
let k = 0;
/** Record a review; by default with valid ENG-003 evidence of the referenced Figma node (`ev: null` = none). */
function record(root: string, input: Record<string, unknown>, ev: string | null | undefined = undefined) {
  const p = join(TMP, `review-${++k}.json`);
  writeFileSync(p, JSON.stringify(input));
  return FR.writeFeatureReview({ root, feature: FEATURE, review: p, designEvidence: ev === undefined ? figmaEvidence(TMP) : ev });
}
const codes = (v: any) => (v.reasons ?? []).map((r: any) => r.code).join(",");
const show = (x: any) => JSON.stringify([x?.outcome ?? x?.status, x?.code, x?.reason, x?.reasons]);
/** A feature with both tasks implemented and reviewed clean. */
function reviewed(name: string) {
  const r = featureRepo(TMP, name);
  implement(r, "T1");
  implement(r, "T2");
  const c = ctx(r.root);
  const w = record(r.root, reviewInput(c.binding));
  return { r, c, w };
}

try {
  // 1. Gates: approved plan, implementation and testing first.
  {
    const un = featureRepo(TMP, "unapproved", { dd: "draft" });
    implement(un, "T1");
    const a = ctx(un.root);
    check("gate: an unapproved planning document stops the review, naming its status line", a.outcome === "FEATURE_PLAN_NOT_APPROVED" && a.waiting_on?.[0]?.startsWith(`${DD}:`), show(a));
    const empty = featureRepo(TMP, "nothing");
    check("gate: no code change against the target → nothing to review", ctx(empty.root).outcome === "FEATURE_NOTHING_TO_REVIEW");
    const mid = featureRepo(TMP, "mid");
    implement(mid, "T1");
    implement(mid, "T2", "in-progress");
    const m = ctx(mid.root);
    check("gate: a task still in progress → testing comes before review", m.outcome === "FEATURE_TESTING_REQUIRED" && m.next_command?.display === `/implement-task ${FEATURE} T2`, show(m));
    const stray = featureRepo(TMP, "stray");
    put(stray.root, "src/other.ts", "x\n");
    const s = ctx(stray.root);
    check("gate: code no completed task recorded → task state missing, with the unattributed files", s.outcome === "FEATURE_TASK_STATE_MISSING" && s.unattributed?.includes("src/other.ts"), show(s));
  }

  // 2. Context: specification, design and scope.
  const base = reviewed("base");
  {
    const c = base.c;
    check("context: ready, with the PR's code files and their tasks", c.outcome === "FEATURE_REVIEW_READY" && c.scope.code_files.length === 3 && JSON.stringify(Object.keys(c.scope.by_task)) === '["T1","T2"]', show(c));
    check("context: the specification documents are named", c.documents.feature_analysis.path === FA && c.documents.dd.path === DD && c.documents.task_breakdown.path === TB);
    check("context: Figma file key and node id for the MCP reads", c.design.figma?.file_key === "AbC123" && c.design.figma.node_id === "42:7" && c.design.required_reads.join() === "get_design_context,get_metadata,get_screenshot" && JSON.stringify(c.design.evidence_format.parts) === '["get_design_context","get_metadata"]');
    check("context: planning documents are not code — they are tracked separately", c.scope.planning_docs_in_scope.includes(DD) && !c.scope.code_files.includes(DD));
    check("context: each scoped task carries its acceptance criteria and developer testing", c.tasks.every((t: any) => t.developerTesting?.runs?.length === 1 && t.acceptanceCriteria.length === 1));
  }

  // 3. Record and verify.
  {
    const { r, w } = base;
    check("record: written at docs/reviews/<feature>/review.md", w.ok === true && w.outcome === "FEATURE_REVIEW_RECORDED" && w.record_path === `docs/reviews/${FEATURE}/review.md`, show(w));
    check("record: UI conformance verified only with a retrieved read", w.ui_conformance === "verified");
    check("record: a clean review hands on to /pre-pr", w.next_command?.skill === `${PLUGIN_NAME}:pre-pr` && w.next_command.args === `feature:${FEATURE}`);
    const v = verify(r.root);
    check("verify: fresh right after recording", v.status === "fresh", show(v));
    const text = readFileSync(join(r.root, w.record_path), "utf-8");
    check("record: names the specification, the design reads and the reviewed scope", text.includes("## Specification Reviewed Against") && text.includes(`| ${FIGMA} | 42:7 | retrieved |`) && text.includes(`| \`${CODE1}\` |`));
    check("record: carries no clock of its own (generated_at is the caller's)", text.includes("generated_at: 2026-11-20T10:00:00Z"));
    const f = { severity: "major", platform: "react", path: CODE1, line: 3, rule: "FEATURE-CHECK-ACCEPTANCE", description: "six digits not enforced", remediation: "validate length" };
    check("record: findings use the bug record's exact line format, read back identically", JSON.stringify(parseFinding(renderFinding(f as any), "major")) === JSON.stringify(f));
  }

  // 4. Freshness across commits; staleness on every relevant change.
  {
    const { r } = reviewed("commit");
    git(r.root, "add", "-A");
    git(r.root, "commit", "-qm", "implement login");
    check("commit: a commit of exactly the reviewed content keeps the review fresh", verify(r.root).status === "fresh", show(verify(r.root)));
    put(r.root, CODE1, "export const LoginScreen = () => 'changed';\n");
    const v = verify(r.root);
    check("code: an edit to a reviewed file makes it stale, naming the file", v.status === "stale" && codes(v).includes("REVIEW_CODE_CHANGED") && v.reasons[0].changed?.includes(CODE1), show(v));
    git(r.root, "checkout", "--", CODE1);
    check("code: restoring the reviewed content makes it fresh again", verify(r.root).status === "fresh");
    put(r.root, "src/login/extra.ts", "x\n");
    const added = verify(r.root);
    check("code: a file added to the PR makes it stale (added)", codes(added).includes("REVIEW_CODE_CHANGED") && added.reasons[0].added?.includes("src/login/extra.ts"), show(added));
    unlinkSync(join(r.root, "src/login/extra.ts"));
    put(r.root, `docs/qa/${FEATURE}-qa-handoff.md`, "---\nfeature: login\n---\n");
    put(r.root, "docs/tasks/other-task-state.json", "{}\n");
    check("unrelated: writing a QA handoff or another feature's state does not invalidate it", verify(r.root).status === "fresh", show(verify(r.root)));
    const rerecord = verify(r.root);
    check("unrelated: the record itself is never part of what it binds", rerecord.status === "fresh");
  }
  {
    const { r } = reviewed("base-moves");
    git(r.root, "add", "-A");
    git(r.root, "commit", "-qm", "impl");
    git(r.root, "checkout", "-q", "main");
    put(r.root, "src/elsewhere.ts", "e\n");
    git(r.root, "add", "-A");
    git(r.root, "commit", "-qm", "main moves");
    git(r.root, "checkout", "-q", "feature/login");
    check("merge base: main moving alone does not invalidate the review", verify(r.root).status === "fresh");
    git(r.root, "merge", "-q", "--no-edit", "main");
    check("merge base: merging the target in makes it stale (scope base changed)", codes(verify(r.root)).includes("REVIEW_SCOPE_BASE_CHANGED"), show(verify(r.root)));
  }
  {
    const { r } = reviewed("spec");
    const fa = faText();
    put(r.root, DD, ddText(fa, "approved", "## 25. Acceptance Criteria Mapping\n\n- AC1: the code screen accepts eight digits.\n"));
    check("spec: a DD body change makes it stale (spec changed)", codes(verify(r.root)).includes("REVIEW_SPEC_CHANGED"), show(verify(r.root)));
  }
  {
    const { r } = reviewed("approval");
    put(r.root, TB, readFileSync(join(r.root, TB), "utf-8").replace("status: approved", "status: draft"));
    check("spec: a planning document leaving approved makes it stale", codes(verify(r.root)).includes("REVIEW_SPEC_NOT_APPROVED"), show(verify(r.root)));
  }
  {
    const { r } = reviewed("design");
    put(r.root, TB, readFileSync(join(r.root, TB), "utf-8").replace("node-id=42-7", "node-id=99-1"));
    check("design: re-pointing the Figma reference makes it stale (design changed)", codes(verify(r.root)).includes("REVIEW_DESIGN_CHANGED"), show(verify(r.root)));
  }
  {
    const { r } = reviewed("taskstate");
    writeTaskState(r.root, FEATURE, "T2", "in-progress", { platform: "react" } as any, join(r.root, TB), { mode: "restart" } as any);
    check("task state: a scoped task's state changing makes it stale", codes(verify(r.root)).includes("REVIEW_TASK_STATE_CHANGED"), show(verify(r.root)));
  }
  {
    const { r, w } = reviewed("tamper");
    const p = join(r.root, w.record_path);
    writeFileSync(p, readFileSync(p, "utf-8").replace("blocking_count: 0", "blocking_count: 1"));
    check("tamper: a hand-edited record is inconsistent, never fresh", verify(r.root).status === "invalid" && codes(verify(r.root)) === "REVIEW_RECORD_INCONSISTENT");
    check("missing: no record → missing", verify(featureRepo(TMP, "norecord").root).status === "missing");
  }

  // 5. Figma honesty and check discipline.
  {
    const r = featureRepo(TMP, "figma");
    implement(r, "T1");
    implement(r, "T2");
    const c = ctx(r.root);
    // M4: conformance is proven by ENG-003 evidence of the exact file and node — never by a reported status.
    const pass = (access: unknown[] | undefined, ev: string | null) => record(r.root, reviewInput(c.binding, access ? { access } : {}), ev);
    const okRead = pass(undefined, figmaEvidence(TMP));
    check("M4 correct file and node: verified", okRead.ok === true && okRead.design_verification === "verified" && okRead.ui_conformance === "verified", show(okRead));
    const wrongNode = pass(undefined, figmaEvidence(TMP, "https://www.figma.com/design/AbC123/Login?node-id=1-2"));
    check("M4 correct file, wrong node: refused (wrong-node)", wrongNode.ok === false && wrongNode.design_verification === "wrong-node", show(wrongNode));
    const wrongFile = pass(undefined, figmaEvidence(TMP, "https://www.figma.com/design/ZZZ999/Other?node-id=42-7"));
    check("M4 wrong file: refused (wrong-file)", wrongFile.ok === false && wrongFile.design_verification === "wrong-file", show(wrongFile));
    const claimed = pass([{ reference: FIGMA, node_id: "42:7", status: "retrieved", note: "read it" }], null);
    check("M4 model-authored 'retrieved' without evidence: refused (missing-evidence)", claimed.ok === false && claimed.design_verification === "missing-evidence", show(claimed));
    const none = pass([], null);
    check("M4 no read at all: refused (not-performed)", none.ok === false && none.design_verification === "not-performed", show(none));
    const failed = pass([{ reference: FIGMA, node_id: "42:7", status: "denied", note: "403" }], null);
    check("M4 failed MCP access: refused (failed)", failed.ok === false && failed.design_verification === "failed", show(failed));
    const mcpError = join(TMP, "mcp-error.json");
    writeFileSync(mcpError, JSON.stringify({ error: "Figma MCP: 403 Forbidden" }));
    check("M4 an MCP error captured as evidence: refused (failed)", pass(undefined, mcpError).design_verification === "failed");
    const badParts = pass(undefined, figmaEvidence(TMP, FIGMA, ["get_design_context"]));
    check("M4 evidence missing a canonical part: refused (invalid-evidence)", badParts.ok === false && badParts.design_verification === "invalid-evidence", show(badParts));
    const nv = record(r.root, reviewInput(c.binding, { checks: { "ui-reference": "not-verifiable" }, access: [{ reference: FIGMA, node_id: "42:7", status: "denied", note: "403 from Figma" }] }), null);
    check("M4 an unavailable design is recorded as not verified, with the limitation and its reason", nv.ok === true && nv.ui_conformance === "not-verified" && nv.design_verification === "failed" && readFileSync(join(r.root, nv.record_path), "utf-8").includes("| denied | 403 from Figma |") && /design_verification: failed/.test(readFileSync(join(r.root, nv.record_path), "utf-8")), show(nv));
    check("M4 verify reports the recorded design verification", verify(r.root).design_verification === "failed");
    const na = record(r.root, reviewInput(c.binding, { checks: { "ui-reference": "not-applicable" } }));
    check("figma: not-applicable is refused when the feature has a design reference", na.ok === false && /not-applicable is only/.test(na.reason));
    const concern = record(r.root, reviewInput(c.binding, { checks: { "acceptance-criteria": "concern" } }));
    check("checks: a concern without a finding citing its rule is refused", concern.ok === false && concern.code === "INVALID_CHECKS");
    const moved = record(r.root, reviewInput({ ...c.binding, scope_fingerprint: "sha256:0" }));
    check("record: a binding that moved since the context is refused (review again)", moved.ok === false && moved.code === "REVIEW_STATE_MOVED");
    const blocking = record(r.root, reviewInput(c.binding, { checks: { "acceptance-criteria": "concern" }, findings: [{ severity: "blocking", platform: "react", path: CODE2, line: 1, rule: "FEATURE-CHECK-ACCEPTANCE", description: "the session is never stored", remediation: "persist it" }] }));
    check("blocking: recorded, and the next step is fixing it", blocking.ok === true && blocking.counts.blocking === 1 && blocking.next_command?.skill === `${PLUGIN_NAME}:fix-review-comments`, show(blocking));
    const st = featureStatus({ root: r.root, feature: FEATURE, data: DATA });
    check("flow: a fresh review with a Blocking finding stops at review-blocking", st.stage === "review-blocking", st.stage);
  }

  // 5b. M4: stale design evidence, and a reference without a node id.
  {
    const { designReferenceState } = await import("./task-resume.ts");
    const { readFrontmatter } = await import("./task-resume.ts");
    const r = featureRepo(TMP, "figma-stale");
    // The analysis recorded the design as it was then (a different read of the same node).
    const thenEv = JSON.parse(readFileSync(figmaEvidence(TMP), "utf-8"));
    thenEv.parts[0].content = "get_design_context: frame \"Login\", 4-digit code field";
    const fa = readFileSync(join(r.root, FA), "utf-8");
    const recorded = designReferenceState(r.root, readFrontmatter(Buffer.from(fa)) as any, thenEv).fingerprint;
    put(r.root, FA, fa.replace("design_reference_fingerprint: null", `design_reference_fingerprint: ${recorded}`));
    git(r.root, "commit", "-qam", "stamp design fingerprint");
    implement(r, "T1");
    implement(r, "T2");
    const c = ctx(r.root);
    const stale = record(r.root, reviewInput(c.binding));
    check("M4 stale evidence: the design moved since the analysis → refused (stale)", stale.ok === false && stale.design_verification === "stale", show(stale));
    const p = join(TMP, "then.json");
    writeFileSync(p, JSON.stringify(thenEv));
    check("M4 evidence matching the recorded design: verified", record(r.root, reviewInput(c.binding), p).design_verification === "verified");

    const root = featureRepo(TMP, "figma-root", {});
    // The reference names no node, in every document that carries it (carried verbatim, as generation does).
    for (const doc of [FA, DD, TB, "docs/login/login-dev-plan.md"]) put(root.root, doc, readFileSync(join(root.root, doc), "utf-8").replace("?node-id=42-7", ""));
    implement(root, "T1");
    implement(root, "T2");
    const c2 = ctx(root.root);
    const fileLevel = record(root.root, reviewInput(c2.binding), figmaEvidence(TMP, "https://www.figma.com/design/AbC123/Login"));
    check("M4 reference without a node id: file-level evidence verifies", fileLevel.ok === true && fileLevel.design_verification === "verified", show(fileLevel));
    const nodeForFile = record(root.root, reviewInput(c2.binding), figmaEvidence(TMP));
    check("M4 reference without a node id: evidence of one node is not the file (wrong-node)", nodeForFile.design_verification === "wrong-node", show(nodeForFile));
  }

  // 6. The flow after a clean review; the command, the skill and the boundaries.
  {
    const st = featureStatus({ root: base.r.root, feature: FEATURE, data: DATA });
    check("flow: a fresh, clean review hands on to /pre-pr", st.stage === "pre-pr-required" && st.next_command?.display === `/pre-pr feature:${FEATURE}`, JSON.stringify(st.stage));
    const cmd = read("commands/review-code.md");
    const feat = cmd.slice(cmd.indexOf("## Feature review (`--feature <feature>`)"));
    check("command: /review-code documents --feature", /^argument-hint: .*--feature <feature>/m.test(cmd) && feat.length > 100);
    check("command: the feature section gathers context and records through the helper", feat.includes('scripts/feature-review.ts" context') && feat.includes('scripts/feature-review.ts" record') && feat.includes('scripts/feature-review.ts" verify'));
    check("command: the same agents, methodology and lanes — no feature review engine", /Steps 1–6 run as written/.test(feat) && /no separate feature review engine/i.test(feat) && feat.includes("`platform-review`"));
    check("command: Figma is read through the MCP and never copied into the repository", /get_design_context/.test(feat) && /get_screenshot/.test(feat) && /Never copy a Figma file/.test(feat));
    check("command: no UI conformance claim without the design read", /never claim UI conformance/i.test(feat));
    check("command: Blocking stops; Major is reported without a new approval", /Blocking findings stop the flow/.test(feat) && /no separate Major approval/.test(feat));
    const skill = read("skills/platform-review/SKILL.md");
    const fs = skill.slice(skill.indexOf("## Feature review"));
    check("skill: the four feature checks with their rules", ["FEATURE-CHECK-ACCEPTANCE", "FEATURE-CHECK-DESIGN", "FEATURE-CHECK-UI-REFERENCE", "FEATURE-CHECK-TESTS"].every((x) => fs.includes(x)));
    const qa = read("commands/create-dev-qa-notes.md");
    const gateAt = qa.indexOf("## 2a. Internal review gate (feature handoff)");
    check("QA handoff (m7): the feature review gate runs in the flow — after the root is resolved, before anything is gathered or written", gateAt > qa.indexOf("## 2. Resolve one authoritative repository root") && gateAt < qa.indexOf("## 3. Locate the Task Breakdown") && qa.slice(gateAt, qa.indexOf("## 3. ")).includes('scripts/feature-review.ts" verify'));
    check("QA handoff (m7): no stray appended gate after the bug section", !qa.slice(qa.indexOf("## Bug handoff")).includes("Internal review gate"));
    // m7 behaviour: the verdict the gate acts on is the one /pre-pr and readiness use.
    const gateRepo = featureRepo(TMP, "qa-gate");
    implement(gateRepo, "T1");
    implement(gateRepo, "T2");
    check("QA handoff (m7): no review → the gate's verify says missing", verify(gateRepo.root).status === "missing");
    const gw = record(gateRepo.root, reviewInput(ctx(gateRepo.root).binding, { checks: { "acceptance-criteria": "concern" }, findings: [{ severity: "blocking", platform: "react", path: CODE2, line: 1, rule: "FEATURE-CHECK-ACCEPTANCE", description: "no session stored", remediation: "store it" }] }));
    check("QA handoff (m7): a fresh review with a Blocking finding is reported for the gate to stop on", gw.ok === true && verify(gateRepo.root).status === "fresh" && verify(gateRepo.root).counts.blocking === 1);
    const src = read("scripts/feature-review.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("boundary: the helper never writes task state", !/writeTaskState|writeCheckpoint|abandonTask/.test(src));
    check("boundary: the helper reads no clock", !/\bnew Date\b|\bDate\.now\b|\bMath\.random\b/.test(src));
    check("boundary: no Major-disposition mechanism or approval", !/disposition|approved_by|approve\(/.test(src));
    check("the suite is registered", read("scripts/check.ts").includes('"feature-review"'));
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall feature-review checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
