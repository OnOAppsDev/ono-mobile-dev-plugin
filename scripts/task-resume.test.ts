/**
 * task-resume.test.ts
 *
 * Tests for ENG-003: deterministic implementation resume and upstream change
 * reconciliation, built on the SHARED-004 task-state store.
 *
 * Every scenario runs against a real git repository in a temp dir, because the
 * properties under test — "the repository still matches the recorded execution state" —
 * are about git and file bytes, and a mock would assert the self-consistency of a fiction.
 *
 * The load-bearing properties:
 *
 *   1. Resume is the same run. It keeps runId and attempt, and completed checkpoints,
 *      validations and the developer-testing decision survive the interruption.
 *   2. Every verdict is derived from hashes the helper computed itself — never from a
 *      timestamp, never from the caller's prose.
 *   3. Only what an upstream change actually touched is invalidated: the earliest stale
 *      SDLC stage is named, stages downstream of it wait for it rather than being declared
 *      stale, and implementation checkpoints are invalidated per cited DD section.
 *   4. An unexplained change is a hard stop with the exact mismatch, never a guess.
 *
 * No external test framework. Run with:
 *   node scripts/task-resume.test.ts
 */

import { spawnSync } from "child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  realpathSync,
  utimesSync,
} from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import {
  readTaskState,
  writeTaskState,
  writeCheckpoint,
  resumeTask,
  abandonTask,
  stateFilePath,
} from "./task-state.ts";
import {
  chainStatus,
  designReferenceFingerprint,
  fingerprintFile,
  sectionFingerprints,
  slugify,
} from "./task-resume.ts";
import { fingerprintBody } from "./migrate-planning-doc.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const F = "biometric-login";

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

const haveGit = spawnSync("git", ["--version"], { encoding: "utf-8" }).status === 0;
if (!haveGit) {
  console.log("SUITE SKIPPED: git is not installed; resume verification needs a real repository.");
  process.exit(0);
}

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf-8");
const flat = (s: string): string => s.replace(/\s+/g, " ");

/* ------------------------------------------------------------------ fixture */

function git(root: string, ...args: string[]): string {
  const p = spawnSync("git", ["-C", root, ...args], { encoding: "utf-8" });
  return (p.stdout ?? "").trim();
}

function put(root: string, rel: string, text: string): void {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

const DESIGN_FIELDS = {
  design_reference_status: "provided",
  design_reference_type: "document",
  design_reference: "design/unlock-spec.md",
  figma_link: "null",
};

function faText(root: string): string {
  const design = designReferenceFingerprint(root, DESIGN_FIELDS);
  return [
    "```yaml",
    "doc_schema_version: 3",
    `feature: ${F}`,
    "source_link: specs/biometric-login.md",
    `source_fingerprint: ${fingerprintFile(join(root, "specs/biometric-login.md"))}`,
    "dd_link: docs/biometric-login-DD.md",
    "design_reference_status: provided",
    "design_reference_type: document",
    "design_reference: design/unlock-spec.md",
    `design_reference_fingerprint: ${design}`,
    "figma_link: null",
    "platform: react-native",
    "device_type: mobile",
    "status: approved",
    "date: 2026-01-02",
    "```",
    "",
    "# Feature Analysis",
    "",
    "## Proposed Technical Approach",
    "",
    "Unlock with biometrics.",
    "",
  ].join("\n");
}

const DD_BODY = [
  "# Detailed Design",
  "",
  "## 19. Technical Implementation Approach",
  "",
  "### 19.1 Hook",
  "",
  "Add the useBiometrics hook.",
  "",
  "### 19.2 Screen",
  "",
  "Wire the unlock screen to the hook.",
  "",
  "## 25. Acceptance Criteria Mapping",
  "",
  "Hook reports availability.",
  "",
].join("\n");

function ddText(root: string, body = DD_BODY): string {
  return [
    "```yaml",
    "doc_schema_version: 2",
    `feature: ${F}`,
    `source_fingerprint: ${fingerprintBody(readFileSync(join(root, "docs/biometric-login-feature-analysis.md")))}`,
    "feature_analysis_link: docs/biometric-login-feature-analysis.md",
    "design_reference_status: provided",
    "design_reference_type: document",
    "design_reference: design/unlock-spec.md",
    "figma_link: null",
    "platform: react-native",
    "device_type: mobile",
    "status: approved",
    "dd_generation: single",
    "date: 2026-01-03",
    "```",
    "",
    body,
  ].join("\n");
}

const ROW_T1 = "| T1 | Add the hook and screen | react-native | `src/a.ts`, `src/b.ts` | — | M | Hook reports availability |";

function tbText(root: string, row = ROW_T1, platform = "react-native"): string {
  return [
    "```yaml",
    "doc_schema_version: 1",
    `feature: ${F}`,
    "feature_analysis_link: docs/biometric-login-feature-analysis.md",
    `source_fingerprint: ${fingerprintBody(readFileSync(join(root, "docs/biometric-login-DD.md")))}`,
    "dd_link: docs/biometric-login-DD.md",
    "dev_plan_link: docs/biometric-login-dev-plan.md",
    "design_reference_status: provided",
    "design_reference_type: document",
    "design_reference: design/unlock-spec.md",
    "figma_link: null",
    `platform: ${platform}`,
    "device_type: mobile",
    "status: approved",
    "date: 2026-01-04",
    "```",
    "",
    "| id | description | platform | files touched | depends-on | size | acceptance criteria |",
    "|---|---|---|---|---|---|---|",
    row,
    "",
  ].join("\n");
}

interface Fx {
  root: string;
  bd: string;
  fa: string;
  dd: string;
}

/** A committed, fully consistent planning chain plus three source files. */
function setup(): Fx {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "task-resume-")));
  git(root, "init", "-q", "-b", "feature/biometrics");
  git(root, "config", "user.email", "t@t");
  git(root, "config", "user.name", "t");
  put(root, "README.md", "# App\n");
  put(root, "specs/biometric-login.md", "Users unlock with Face ID.\n");
  put(root, "design/unlock-spec.md", "Unlock screen: one button.\n");
  put(root, "src/a.ts", "export const a = 1;\n");
  put(root, "src/b.ts", "export const b = 1;\n");
  put(root, "src/c.ts", "export const c = 1;\n");
  put(root, "docs/biometric-login-feature-analysis.md", faText(root));
  put(root, "docs/biometric-login-DD.md", ddText(root));
  put(root, "docs/biometric-login-task-breakdown.md", tbText(root));
  put(root, "docs/biometric-login-dev-plan.md", "```yaml\nfeature: biometric-login\nstatus: approved\n```\n\n# Plan\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "fixture");
  return {
    root,
    bd: join(root, "docs/biometric-login-task-breakdown.md"),
    fa: join(root, "docs/biometric-login-feature-analysis.md"),
    dd: join(root, "docs/biometric-login-DD.md"),
  };
}

/** Re-stamp one frontmatter key, as the owning stage command would on regeneration. */
function restamp(path: string, key: string, value: string): void {
  const text = readFileSync(path, "utf-8");
  writeFileSync(path, text.replace(new RegExp(`^${key}:.*$`, "m"), `${key}: ${value}`));
}

const PLAN = {
  expectedFiles: ["src/a.ts", "src/b.ts"],
  steps: [
    { id: "S1", description: "add the hook", files: ["src/a.ts"], basis: ["dd#191-hook", "row:acceptance criteria"] },
    { id: "S2", description: "wire the screen", files: ["src/b.ts"], basis: ["dd#192-screen"] },
  ],
};

const DEV_TESTING = {
  framework: "jest",
  required: true,
  testsChanged: [],
  justification: "the existing a.test.ts already asserts the changed behaviour and was run",
  runs: [{ command: "jest src/a.test.ts", result: "pass" }],
  notRunReason: null,
};

/**
 * The canonical interrupted run: pre-existing dirty work, S1 complete and validated,
 * the developer-testing decision recorded, then S2 half-written when the run died.
 */
function interrupted(fx: Fx): string {
  const { root, bd } = fx;
  put(root, "README.md", "# App\n\nlocal notes the developer had before the run\n");
  put(root, "notes.txt", "untracked scratch\n");

  const start = writeTaskState(root, F, "T1", "in-progress", { platform: "react-native" }, bd);
  const runId = start.runId ?? "";
  const cp = (kind: string, payload: unknown) => writeCheckpoint(root, F, "T1", runId, kind, payload, bd);

  cp("context", { deviceType: "mobile", accessibility: { applicable: false, reason: "fixture: no accessibility-relevant surface" } });
  cp("plan", PLAN);
  put(root, "src/a.ts", "export const a = 2; // S1\n");
  cp("step", { stepId: "S1" });
  cp("validation", { command: "tsc --noEmit", result: "pass", covers: ["src/a.ts"], basis: ["dd#191-hook"] });
  cp("validation", { command: "jest src/a.test.ts", result: "pass", kind: "developer-test", covers: ["src/a.ts"], basis: ["dd#191-hook"] });
  cp("developer-testing", { developerTesting: DEV_TESTING });
  put(root, "src/b.ts", "export const b = 2; // S2, half");
  return runId;
}

const cleanup = (fx: Fx) => rmSync(fx.root, { recursive: true, force: true });

/* ── 0. slugs and section fingerprints ───────────────────────────────── */
{
  check("0 slug matches GitHub's shape", slugify("19.1 Hook") === "191-hook" && slugify("19. Technical Implementation Approach") === "19-technical-implementation-approach");
  const s = sectionFingerprints(DD_BODY);
  check("0 every heading gets a section fingerprint", ["19-technical-implementation-approach", "191-hook", "192-screen", "25-acceptance-criteria-mapping"].every((k) => typeof s[k] === "string"));
  const edited = sectionFingerprints(DD_BODY.replace("Wire the unlock screen", "Wire the new unlock screen"));
  check("0 an edit inside 19.2 moves 19.2", edited["192-screen"] !== s["192-screen"]);
  check("0 and its parent section 19", edited["19-technical-implementation-approach"] !== s["19-technical-implementation-approach"]);
  check("0 but not its sibling 19.1", edited["191-hook"] === s["191-hook"]);
  check("0 nor an unrelated section", edited["25-acceptance-criteria-mapping"] === s["25-acceptance-criteria-mapping"]);
}

/* ── 1–8. interrupted run resumes as the same run ─────────────────────── */
{
  const fx = setup();
  const runId = interrupted(fx);
  const v = resumeTask(fx.root, F, "T1", fx.bd);

  check("1 an interrupted, consistent run resolves to resume", v.status === "resume", `${v.status}: ${v.reasons.join("; ")}`);
  check("1 the verdict names the interrupted run", v.runId === runId && runId === "T1-attempt-1");

  const w = writeTaskState(fx.root, F, "T1", "in-progress", { platform: "react-native" }, fx.bd, { mode: "resume" });
  check("1 resume keeps the same runId", w.status === "written" && w.runId === runId, `${w.status} ${w.summary}`);
  check("2 resume does NOT increment the attempt", w.attempt === 1);

  const after = readTaskState(fx.root, F, fx.bd).tasks["T1"];
  const exec = after.execution;
  check("3 completed checkpoints survive the resume", exec !== null && exec.checkpoints.some((c) => c.stepId === "S1"));
  check("3 the saved context survives — decisions are re-read, not recomputed",
    exec?.context.accessibility?.applicable === false && exec?.context.deviceType === "mobile");
  check("3 the resume is counted without a clock", exec?.resumes === 1);

  check("4 the completed step is not scheduled again", v.checkpoints.valid.includes("S1") && v.nextStep.stepId === "S2", JSON.stringify(v.nextStep));
  const a = v.files.find((f) => f.path === "src/a.ts");
  check("4 its file matches its checkpoint", a?.class === "matches-checkpoint");

  const b = v.files.find((f) => f.path === "src/b.ts");
  check("5 the half-written file is detected as partial", b?.class === "partial" && b.stepId === "S2", JSON.stringify(b));
  check("5 and listed as the partial work to resume from", v.partialFiles.join(",") === "src/b.ts");

  check("6 both validations are carried forward", v.validations.carried.length === 2 && v.validations.rerun.length === 0,
    JSON.stringify(v.validations));

  check("8 the developer-testing decision survives the interruption",
    v.developerTesting?.block.framework === "jest" && v.developerTesting.block.required === true);
  check("8 and its run is still backed by a valid validation", v.developerTesting?.runs.every((r) => r.valid) === true);

  const pre = v.files.filter((f) => f.class === "preexisting-unchanged").map((f) => f.path).sort();
  check("11 pre-existing dirty and untracked files are recognised as the developer's", pre.join(",") === "README.md,notes.txt", pre.join(","));
  check("11 they are never claimed as task-owned", !v.partialFiles.includes("README.md") && !v.partialFiles.includes("notes.txt"));
  check("11 the baseline recorded their hashes", exec?.baseline.dirty.map((d) => d.path).sort().join(",") === "README.md,notes.txt");
  check("11 the baseline recorded HEAD and branch", exec?.baseline.head === git(fx.root, "rev-parse", "HEAD") && exec?.baseline.branch === "feature/biometrics");

  // An untouched expected file is its own class.
  put(fx.root, "src/b.ts", "export const b = 1;\n");
  const v2 = resumeTask(fx.root, F, "T1", fx.bd);
  check("E an expected file never touched is classified expected-untouched",
    v2.files.find((f) => f.path === "src/b.ts")?.class === "expected-untouched");
  cleanup(fx);
}

/* ── 7. selective validation invalidation after a later edit ─────────── */
{
  const fx = setup();
  const runId = interrupted(fx);
  writeTaskState(fx.root, F, "T1", "in-progress", {}, fx.bd, { mode: "resume" });
  const cp = (kind: string, payload: unknown) => writeCheckpoint(fx.root, F, "T1", runId, kind, payload, fx.bd);
  put(fx.root, "src/b.ts", "export const b = 2; // S2\n");
  cp("step", { stepId: "S2" });
  cp("validation", { command: "eslint src/b.ts", result: "pass", covers: ["src/b.ts"], basis: ["dd#192-screen"] });

  // S1's file changes after its checkpoint and no unfinished step owns it.
  put(fx.root, "src/a.ts", "export const a = 3; // edited after S1\n");
  const v = resumeTask(fx.root, F, "T1", fx.bd);
  const rerun = v.validations.rerun.map((r) => r.command).sort();
  check("7 validations covering the changed file are selected for rerun", rerun.join("|") === "jest src/a.test.ts|tsc --noEmit", rerun.join("|"));
  check("7 a validation whose files did not change is carried", v.validations.carried.map((c) => c.command).join("|") === "eslint src/b.ts");
  check("7 the rerun names the exact file", v.validations.rerun.every((r) => /src\/a\.ts/.test(r.reason)));
  check("E a file changed after its checkpoint is classified so", v.files.find((f) => f.path === "src/a.ts")?.class === "changed-after-checkpoint");
  check("E and its step is resumed from", v.checkpoints.invalidated.some((i) => i.stepId === "S1") && v.nextStep.stepId === "S1");
  check("8 a developer test invalidated by the edit is no longer valid backing",
    v.developerTesting?.runs.some((r) => r.command === "jest src/a.test.ts" && r.valid === false) === true);
  cleanup(fx);
}

/* ── 9. HEAD / branch mismatch hard-stops ─────────────────────────────── */
{
  const fx = setup();
  interrupted(fx);
  put(fx.root, "src/c.ts", "export const c = 2;\n");
  git(fx.root, "add", "src/c.ts");
  git(fx.root, "commit", "-qm", "someone else's work");
  const v = resumeTask(fx.root, F, "T1", fx.bd);
  check("9 HEAD moved with non-upstream changes → hard stop", v.status === "hard-stop", v.status);
  check("9 the mismatch names HEAD and the offending path",
    v.mismatches.some((m) => m.kind === "head" && /src\/c\.ts/.test(m.detail)), JSON.stringify(v.mismatches));
  const refused = writeTaskState(fx.root, F, "T1", "in-progress", {}, fx.bd, { mode: "resume" });
  check("9 the writer refuses to resume an inconsistent run", refused.status === "refused" && refused.reason === "resume-inconsistent");
  cleanup(fx);
}
{
  const fx = setup();
  interrupted(fx);
  git(fx.root, "checkout", "-q", "-b", "other");
  const v = resumeTask(fx.root, F, "T1", fx.bd);
  check("9 a different branch → hard stop", v.status === "hard-stop" && v.mismatches.some((m) => m.kind === "branch"), JSON.stringify(v.mismatches));
  cleanup(fx);
}
{
  // HEAD advanced by a commit that touched only upstream artifacts and the store is not a mismatch.
  const fx = setup();
  interrupted(fx);
  git(fx.root, "add", "docs/tasks");
  git(fx.root, "commit", "-qm", "record task state");
  const v = resumeTask(fx.root, F, "T1", fx.bd);
  check("9 HEAD advanced only by the task-state store still resumes", v.status === "resume", `${v.status}: ${v.reasons.join("; ")}`);
  cleanup(fx);
}

/* ── 10–11. unexplained changes hard-stop ────────────────────────────── */
{
  const fx = setup();
  interrupted(fx);
  put(fx.root, "src/c.ts", "export const c = 99;\n");
  const v = resumeTask(fx.root, F, "T1", fx.bd);
  check("10 a change outside the task's scope → hard stop", v.status === "hard-stop");
  check("10 the mismatch names the exact file", v.mismatches.some((m) => m.kind === "outside-scope" && m.path === "src/c.ts"), JSON.stringify(v.mismatches));
  check("E the file is classified changed-outside-scope", v.files.find((f) => f.path === "src/c.ts")?.class === "outside-scope");
  cleanup(fx);
}
{
  const fx = setup();
  interrupted(fx);
  put(fx.root, "README.md", "# App\n\nthe developer kept editing\n");
  const v = resumeTask(fx.root, F, "T1", fx.bd);
  check("11 a pre-existing dirty file that changed during the run → hard stop",
    v.status === "hard-stop" && v.mismatches.some((m) => m.kind === "preexisting-changed" && m.path === "README.md"), JSON.stringify(v.mismatches));
  cleanup(fx);
}

/* ── 12. historical records remain readable ───────────────────────────── */
{
  const fx = setup();
  const p = stateFilePath(fx.root, F);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({
    taskStateSchemaVersion: 1,
    feature: F,
    producedBy: { plugin: "ono-mobile-dev-plugin", version: "0.5.0" },
    tasks: {
      T1: { state: "in-progress", provenance: "plugin-verified", attempt: 1, runId: "T1-attempt-1", rowFingerprint: null, platform: "react-native", head: null, filesChanged: [], standardIds: [], validation: [], acceptanceCriteria: [], deviations: [], blockers: [] },
    },
  }, null, 2));
  const r = readTaskState(fx.root, F, fx.bd);
  check("12 a pre-ENG-003 record reads ok", r.status === "ok" && r.tasks["T1"].state === "in-progress");
  check("12 its missing execution block reads as null, not as an empty run", r.tasks["T1"].execution === null);
  const v = resumeTask(fx.root, F, "T1", fx.bd);
  check("12 a legacy in-progress record has nothing to verify → deterministic restart", v.status === "restart" && /legacy|no execution/i.test(v.reasons.join(" ")));
  const plain = writeTaskState(fx.root, F, "T1", "in-progress", {}, fx.bd);
  check("12 a plain in-progress over a legacy record still starts a new attempt", plain.status === "written" && plain.attempt === 2);
  cleanup(fx);
}

/* ── 13–15. upstream change detection and the earliest stale stage ───── */
{
  const fx = setup();
  const clean = chainStatus(fx.root, fx.bd);
  check("13 a consistent chain has no stale stage", clean.earliestStale === null, JSON.stringify(clean.stages.map((s) => [s.stage, s.status])));

  interrupted(fx);
  put(fx.root, "specs/biometric-login.md", "Users unlock with Face ID or Touch ID.\n");
  const c = chainStatus(fx.root, fx.bd);
  check("13 a changed source specification is detected", c.stages[0].status === "stale" && c.stages[0].checks.some((k) => k.name === "requirements" && k.status === "stale"));
  check("14 the earliest stale stage is the feature analysis", c.earliestStale?.stage === "feature-analysis" && c.earliestStale.command === "/analyze-feature");
  check("15 downstream stages wait for it rather than being declared stale",
    c.stages.filter((s) => s.stage !== "feature-analysis").every((s) => s.status === "pending-upstream"), JSON.stringify(c.stages.map((s) => [s.stage, s.status])));
  const v = resumeTask(fx.root, F, "T1", fx.bd);
  check("13 resume routes an upstream change to reconciliation", v.status === "reconcile-upstream" && v.upstream.earliestStale?.stage === "feature-analysis");
  check("13 the run records which upstream inputs moved since it started", v.upstreamChanged.includes("requirements"), v.upstreamChanged.join(","));

  // /analyze-feature re-stamps the analysis; its body is byte-identical.
  restamp(fx.fa, "source_fingerprint", fingerprintFile(join(fx.root, "specs/biometric-login.md")) ?? "");
  const c2 = chainStatus(fx.root, fx.bd);
  check("15 an analysis regenerated with an identical body leaves the DD and breakdown current — they are NOT rerun",
    c2.earliestStale === null && c2.stages.every((s) => s.status === "current"), JSON.stringify(c2.stages.map((s) => [s.stage, s.status])));
  cleanup(fx);
}
{
  const fx = setup();
  put(fx.root, "design/unlock-spec.md", "Unlock screen: two buttons.\n");
  const c = chainStatus(fx.root, fx.bd);
  check("13 a changed design-reference file is detected", c.stages[0].checks.some((k) => k.name === "design-reference" && k.status === "stale"));
  check("14 a design change is also a feature-analysis-stage change", c.earliestStale?.stage === "feature-analysis");
  cleanup(fx);
}
{
  const fx = setup();
  put(fx.root, "docs/biometric-login-feature-analysis.md", readFileSync(fx.fa, "utf-8").replace("Unlock with biometrics.", "Unlock with biometrics, with a passcode fallback."));
  const c = chainStatus(fx.root, fx.bd);
  check("14 an amended analysis makes the DD the earliest stale stage", c.earliestStale?.stage === "dd" && c.earliestStale.command === "/dev-design-start");
  check("15 the analysis stage itself stays current", c.stages[0].status === "current");
  cleanup(fx);
}
{
  const fx = setup();
  put(fx.root, "docs/biometric-login-DD.md", readFileSync(fx.dd, "utf-8").replace("Wire the unlock screen", "Wire the redesigned unlock screen"));
  put(fx.root, "specs/biometric-login.md", "Users unlock with Face ID or Touch ID.\n");
  const c = chainStatus(fx.root, fx.bd);
  check("14 with two changes the EARLIEST stale stage wins", c.earliestStale?.stage === "feature-analysis");
  cleanup(fx);
}
{
  const fx = setup();
  put(fx.root, "docs/biometric-login-DD.md", readFileSync(fx.dd, "utf-8").replace("Wire the unlock screen", "Wire the redesigned unlock screen"));
  const c = chainStatus(fx.root, fx.bd);
  check("14 a DD edit makes the breakdown the earliest stale stage", c.earliestStale?.stage === "task-breakdown" && c.earliestStale.command === "/dev-feature-start");
  check("15 the stages above it are untouched", c.stages[0].status === "current" && c.stages[1].status === "current");
  cleanup(fx);
}

/* ── 16–17. implementation reconciliation after an upstream change ───── */
{
  const fx = setup();
  const runId = interrupted(fx);
  writeTaskState(fx.root, F, "T1", "in-progress", {}, fx.bd, { mode: "resume" });
  const cp = (kind: string, payload: unknown) => writeCheckpoint(fx.root, F, "T1", runId, kind, payload, fx.bd);
  put(fx.root, "src/b.ts", "export const b = 2; // S2\n");
  cp("step", { stepId: "S2" });
  cp("validation", { command: "eslint src/b.ts", result: "pass", covers: ["src/b.ts"], basis: ["dd#192-screen"] });

  // The DD's §19.2 changes; /dev-feature-start re-stamps the breakdown; rows are unchanged.
  put(fx.root, "docs/biometric-login-DD.md", readFileSync(fx.dd, "utf-8").replace("Wire the unlock screen to the hook.", "Wire the unlock screen to the hook, with a fallback button."));
  let v = resumeTask(fx.root, F, "T1", fx.bd);
  check("16 before the breakdown is regenerated, resume routes to /dev-feature-start",
    v.status === "reconcile-upstream" && v.upstream.earliestStale?.command === "/dev-feature-start");

  restamp(fx.bd, "source_fingerprint", fingerprintBody(readFileSync(fx.dd)) ?? "");
  v = resumeTask(fx.root, F, "T1", fx.bd);
  check("16 once the chain is current again the run resumes — the whole implementation is not discarded", v.status === "resume", `${v.status}: ${v.reasons.join("; ")}`);
  check("16 the checkpoint whose DD section did not move survives", v.checkpoints.valid.includes("S1"));
  check("17 the checkpoint citing the changed section is invalidated",
    v.checkpoints.invalidated.some((i) => i.stepId === "S2" && /dd#192-screen/.test(i.reason)), JSON.stringify(v.checkpoints));
  check("17 implementation continues from the first invalidated step", v.nextStep.stepId === "S2");
  check("D a validation whose planning basis moved is rerun, even though its file did not change",
    v.validations.rerun.some((r) => r.command === "eslint src/b.ts" && /dd#192-screen/.test(r.reason)));
  check("D validations on unaffected work are carried", v.validations.carried.some((c) => c.command === "tsc --noEmit"));
  check("16 the upstream inputs that moved are named", v.upstreamChanged.includes("dd") && !v.upstreamChanged.includes("row"), v.upstreamChanged.join(","));
  check("C upstream artifacts changing are never mistaken for out-of-scope edits", v.mismatches.length === 0);

  // A regenerated plan keeps surviving steps and records the revised one.
  const re = cp("plan", { ...PLAN, steps: [PLAN.steps[0], { ...PLAN.steps[1], description: "wire the screen with a fallback button" }] });
  check("C a re-plan for the active run is accepted", re.status === "written", re.summary);
  const v2 = resumeTask(fx.root, F, "T1", fx.bd);
  check("C after the re-plan S1 is still valid and S2 is still next", v2.checkpoints.valid.includes("S1") && v2.nextStep.stepId === "S2");
  cleanup(fx);
}
{
  // A platform change genuinely invalidates the run: restart, not resume.
  const fx = setup();
  interrupted(fx);
  put(fx.root, "docs/biometric-login-task-breakdown.md", tbText(fx.root, ROW_T1.replace("react-native", "ios"), "ios"));
  const v = resumeTask(fx.root, F, "T1", fx.bd);
  check("C a platform change is the one upstream change that discards the run", v.status === "restart" && /platform/.test(v.reasons.join(" ")));
  cleanup(fx);
}

/* ── 18. no timestamp-only invalidation ───────────────────────────────── */
{
  const fx = setup();
  interrupted(fx);
  for (const p of [fx.fa, fx.dd, fx.bd]) {
    writeFileSync(p, readFileSync(p, "utf-8").replace(/^date: .*$/m, "date: 2027-12-31"));
    utimesSync(p, 2_000_000_000, 2_000_000_000);
  }
  utimesSync(join(fx.root, "src/a.ts"), 2_000_000_000, 2_000_000_000);
  const c = chainStatus(fx.root, fx.bd);
  check("18 a changed `date:` and newer mtimes invalidate nothing upstream", c.earliestStale === null);
  const v = resumeTask(fx.root, F, "T1", fx.bd);
  check("18 nor any checkpoint or validation", v.status === "resume" && v.checkpoints.invalidated.length === 0 && v.validations.rerun.length === 0,
    `${v.status} ${JSON.stringify(v.checkpoints.invalidated)}`);
  for (const rel of ["scripts/task-resume.ts", "scripts/task-state.ts"]) {
    const code = read(rel).replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check(`18 ${rel} reads no clock`, !/\bnew Date\b|\bDate\.now\b|\bMath\.random\b/.test(code));
    check(`18 ${rel} never compares mtimes`, !/\bmtime|ctime|birthtime|statSync\b/.test(code));
  }
  cleanup(fx);
}

/* ── 19. terminal semantics are unchanged; lifecycle ops are explicit ─── */
{
  const fx = setup();
  const runId = interrupted(fx);
  const refuseStart = writeTaskState(fx.root, F, "T1", "in-progress", {}, fx.bd);
  check("F a plain in-progress over an active checkpointed run is refused — resume or restart must be chosen",
    refuseStart.status === "refused" && refuseStart.reason === "active-run-exists");

  writeTaskState(fx.root, F, "T1", "in-progress", {}, fx.bd, { mode: "resume" });
  put(fx.root, "src/b.ts", "export const b = 2; // S2\n");
  writeCheckpoint(fx.root, F, "T1", runId, "step", { stepId: "S2" }, fx.bd);

  const noVerify = writeTaskState(fx.root, F, "T1", "complete", { platform: "react-native" }, fx.bd);
  check("19 complete without verification is still refused", noVerify.status === "refused" && noVerify.reason === "complete-without-verification");

  const payload = {
    platform: "react-native",
    filesChanged: ["src/a.ts", "src/b.ts"],
    standardIds: ["RN-TS-1"],
    validation: [{ command: "tsc --noEmit", result: "pass" }, { command: "jest src/a.test.ts", result: "pass" }],
    acceptanceCriteria: [{ criterion: "Hook reports availability", met: true }],
    developerTesting: DEV_TESTING,
  };
  put(fx.root, "src/a.ts", "export const a = 4; // changed after its validations\n");
  const stale = writeTaskState(fx.root, F, "T1", "complete", payload, fx.bd);
  check("D complete citing a validation that no longer holds is refused", stale.status === "refused" && stale.reason === "complete-with-stale-validation", stale.summary);
  put(fx.root, "src/a.ts", "export const a = 2; // S1\n");

  const done = writeTaskState(fx.root, F, "T1", "complete", payload, fx.bd);
  check("19 complete after a resumed run is written", done.status === "written", done.summary);
  check("19 and keeps the run's number", done.runId === runId && done.attempt === 1);
  const r = readTaskState(fx.root, F, fx.bd).tasks["T1"];
  check("19 it is deterministic proof exactly as before", r.deterministicProof === true);
  check("19 the execution evidence is kept on the terminal record", r.execution?.outcome === "complete");

  const late = writeCheckpoint(fx.root, F, "T1", runId, "step", { stepId: "S1" }, fx.bd);
  check("G no checkpoint can be appended once the run is terminal", late.status === "refused" && late.reason === "no-active-run");
  cleanup(fx);
}
{
  const fx = setup();
  const runId = interrupted(fx);
  const wrong = writeCheckpoint(fx.root, F, "T1", "T1-attempt-9", "step", { stepId: "S1" }, fx.bd);
  check("G a checkpoint for another run is refused", wrong.status === "refused" && wrong.reason === "run-mismatch");
  const terminal = writeCheckpoint(fx.root, F, "T1", runId, "complete", {}, fx.bd);
  check("G a checkpoint can never carry a lifecycle state", terminal.status === "refused" && terminal.reason === "invalid-checkpoint");
  const badRef = writeCheckpoint(fx.root, F, "T1", runId, "validation", { command: "x", result: "pass", basis: ["dd#no-such-section"] }, fx.bd);
  check("G a basis reference that does not resolve is refused", badRef.status === "refused" && badRef.reason === "invalid-checkpoint");
  const soft = writeCheckpoint(fx.root, F, "T1", runId, "validation", { command: "x", result: "assumed" }, fx.bd);
  check("G a validation result other than pass/fail is refused", soft.status === "refused");

  const ab = abandonTask(fx.root, F, "T1", runId, "developer asked to drop this attempt", fx.bd);
  check("F abandon records the run as failed, keeping its number", ab.status === "written" && ab.state === "failed" && ab.runId === runId);
  check("F abandon lists the task-owned changes left in the tree, and touches none", ab.taskOwnedChanges?.join(",") === "src/a.ts,src/b.ts"
    && readFileSync(join(fx.root, "src/a.ts"), "utf-8").includes("S1"), JSON.stringify(ab.taskOwnedChanges));
  const rec = readTaskState(fx.root, F, fx.bd).tasks["T1"];
  check("F the abandoned outcome is explicit", rec.state === "failed" && rec.execution?.outcome === "abandoned" && rec.blockers.some((b) => /abandoned/.test(b)));

  const next = writeTaskState(fx.root, F, "T1", "in-progress", {}, fx.bd);
  check("F after abandon the next run is a new attempt", next.status === "written" && next.attempt === 2 && next.runId === "T1-attempt-2");
  const nextExec = readTaskState(fx.root, F, fx.bd).tasks["T1"].execution;
  check("F its baseline treats the abandoned edits as the developer's current code",
    nextExec?.baseline.dirty.some((d) => d.path === "src/a.ts") === true);

  const rs = writeTaskState(fx.root, F, "T1", "in-progress", {}, fx.bd, { mode: "restart" });
  check("F restart starts a new attempt with a fresh execution", rs.status === "written" && rs.attempt === 3 &&
    readTaskState(fx.root, F, fx.bd).tasks["T1"].execution?.restartedFrom === "T1-attempt-2");

  const blocked = writeTaskState(fx.root, F, "T1", "blocked", { blockers: ["backend contract"] }, fx.bd);
  check("19 blocked still needs no verification evidence", blocked.status === "written" && blocked.attempt === 3);
  cleanup(fx);
}

/* ── determinism: identical runs produce identical stores ─────────────── */
{
  const a = setup();
  const b = setup();
  interrupted(a);
  interrupted(b);
  const sa = readFileSync(stateFilePath(a.root, F), "utf-8").replaceAll(git(a.root, "rev-parse", "HEAD"), "HEAD");
  const sb = readFileSync(stateFilePath(b.root, F), "utf-8").replaceAll(git(b.root, "rev-parse", "HEAD"), "HEAD");
  check("determinism: identical interrupted runs write identical stores (modulo commit sha)", sa === sb);
  check("determinism: no absolute path is persisted", !sa.includes(a.root));
  cleanup(a);
  cleanup(b);
}

/* ── contracts: prose and code say the same thing ─────────────────────── */
{
  const contract = flat(read("docs/task-state-contract.md"));
  const src = read("scripts/task-state.ts");
  const union = /reason\?:([\s\S]*?);\n/.exec(src.slice(src.indexOf("export interface WriteResult")))?.[1] ?? "";
  const declared = [...union.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
  // A write result's reason, in either form the writer builds one: an object literal line
  // `reason: "x",` or a `refuse(path, taskId, "x", …)` call. The dependency walk's own
  // `reason` values close their object on the same line and are not write refusals.
  const emitted = [...new Set([
    ...[...src.matchAll(/reason: "([a-z-]+)",\s*$/gm)].map((m) => m[1]),
    ...[...src.matchAll(/refuse\([^,]+, [^,]+, "([a-z-]+)"/g)].map((m) => m[1]),
  ])];
  const undeclared = emitted.filter((r) => !declared.includes(r));
  check("contract every refusal the writer emits is in WriteResult.reason", undeclared.length === 0, undeclared.join(","));
  const undocumented = declared.filter((r) => !contract.includes(`\`${r}\``));
  check("contract every WriteResult.reason is documented", undocumented.length === 0, undocumented.join(","));

  check("contract documents resume, restart and abandon", /`resume`/.test(contract) && /`restart`/.test(contract) && /`abandon`/.test(contract));
  check("contract documents the checkpoint kinds", ["plan", "step", "validation", "probe", "developer-testing", "review", "context"].every((k) => contract.includes(`\`${k}\``)));
  check("contract documents the ownership boundary", /sole (lifecycle )?writer/i.test(contract) && /append[^.]*checkpoint/i.test(contract));
  check("contract documents the four file classes", ["matches-checkpoint", "changed-after-checkpoint", "expected-untouched", "outside-scope"].every((k) => contract.includes(k)));
  check("contract documents the earliest-stale-stage rule", /earliest stale stage/i.test(contract) && /pending-upstream/.test(contract));

  const impl = flat(read("commands/implement-task.md"));
  check("implement-task no longer leaves in-progress to the developer", !/developer decides resume vs\. restart/.test(impl));
  check("implement-task evaluates resume through the helper", /task-state\.ts" resume/.test(read("commands/implement-task.md")));
  check("implement-task runs the full upstream chain check", /task-state\.ts" chain/.test(read("commands/implement-task.md")));
  check("implement-task names restart and abandon explicitly", /--restart/.test(impl) && /--abandon/.test(impl));
  check("implement-task keeps approval as a human gate during reconciliation", /re-approv/i.test(impl));

  const skill = flat(read("skills/platform-implementation/SKILL.md"));
  check("the shared methodology appends checkpoints for the active run", /task-state\.ts" checkpoint/.test(read("skills/platform-implementation/SKILL.md")));
  check("the shared methodology still never writes lifecycle state", /never writes (terminal |task )?lifecycle state/i.test(skill));
  check("the shared methodology resumes from the verdict rather than recomputing", /nextStep/.test(skill));

  const fa = read("templates/feature-analysis-template.md");
  check("the feature analysis records its requirements source and fingerprint", /^source_link:/m.test(fa) && /^source_fingerprint:/m.test(fa));
  check("the feature analysis records a design-reference fingerprint", /^design_reference_fingerprint:/m.test(fa));
  check("analyze-feature stamps both", /source_fingerprint/.test(read("commands/analyze-feature.md")) && /design_reference_fingerprint/.test(read("commands/analyze-feature.md")));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
