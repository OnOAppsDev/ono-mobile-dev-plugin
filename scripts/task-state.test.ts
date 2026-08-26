/**
 * task-state.test.ts
 *
 * Tests for scripts/task-state.ts — the SHARED-004 per-task lifecycle store.
 *
 * Three properties carry the most weight, and all three are boundary conditions:
 *
 *   1. The store never blocks a command. Absent, malformed, invalid, too-new and
 *      wrong-feature files all degrade to `unknown` for every task, so the caller
 *      falls back to the ask-the-human path that existed before the store did.
 *   2. A terminal `complete` cannot be recorded without verification evidence, and a
 *      human attestation can never be mistaken for deterministic proof. These are the
 *      two trust boundaries the contract exists to hold.
 *   3. The helper is deterministic and clock-free — the same assertion
 *      migrate-planning-doc.test.ts makes about the migrator.
 *
 * Fixtures are built in a temp directory, like read-repo-knowledge.test.ts, because
 * nothing here needs byte-exact on-disk goldens.
 *
 * No external test framework. Run with:
 *   node scripts/task-state.test.ts
 *   bun  scripts/task-state.test.ts
 */

import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import {
  CURRENT_SCHEMA_VERSION,
  PLUGIN_VERSION,
  WRITABLE_STATES,
  stateFilePath,
  normalizeRow,
  fingerprintRow,
  parseBreakdown,
  parseDependsOn,
  verificationSatisfied,
  readTaskState,
  writeTaskState,
} from "./task-state.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const CONTRACT = join(REPO_ROOT, "docs", "task-state-contract.md");
const SCRIPT = join(HERE, "task-state.ts");

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "task-state-"));
}

const BREAKDOWN = `# Task Breakdown

| id | description | platform | files touched | depends-on | size | acceptance criteria |
|---|---|---|---|---|---|---|
| T1 | Add the biometric hook | react-native | \`src/features/auth/useBiometrics.ts\` | — | S | Hook returns availability |
| T2 | Wire the unlock screen | react-native | \`src/features/auth/UnlockScreen.tsx\` | T1 | M | Screen unlocks on success |
| T3 | Persist the opt-in flag | react-native | \`src/features/auth/authSlice.ts\` | T1, T2 | S | Flag survives restart |
`;

function seedBreakdown(root: string, body = BREAKDOWN): string {
  const p = join(root, "docs", "biometric-login-task-breakdown.md");
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
  return p;
}

const PASSING = {
  platform: "react-native",
  filesChanged: ["src/features/auth/useBiometrics.ts"],
  standardIds: ["RN-TS-1"],
  validation: [{ command: "tsc --noEmit", result: "pass" }],
  acceptanceCriteria: [{ criterion: "Hook returns availability", met: true }],
};

/* ── 1. row fingerprint normalization ─────────────────────────────────── */
{
  const a = "| T1 | Add the hook | react-native | `a.ts` | — | S | Works |";
  const b = "|T1|Add   the hook|react-native|`a.ts`|—|S|Works|";
  check("1 normalization collapses whitespace and pipe padding", normalizeRow(a) === normalizeRow(b));
  check("1 identical rows fingerprint identically", fingerprintRow(a) === fingerprintRow(b));
  check("1 fingerprint is sha256-prefixed hex", /^sha256:[0-9a-f]{64}$/.test(fingerprintRow(a)));
  const changed = a.replace("Add the hook", "Add the hooks");
  check("1 a one-character row edit changes the fingerprint", fingerprintRow(a) !== fingerprintRow(changed));
  check("1 fingerprinting is stable across calls", fingerprintRow(a) === fingerprintRow(a));
}

/* ── 2. breakdown parsing ─────────────────────────────────────────────── */
{
  const rows = parseBreakdown(BREAKDOWN);
  check("2 parses exactly the three task rows", Object.keys(rows).sort().join(",") === "T1,T2,T3");
  check("2 skips the header and separator rows", rows["id"] === undefined);
  check("2 reads platform from the row", rows["T1"].platform === "react-native");
  check("2 em-dash depends-on means no dependencies", rows["T1"].dependsOn.length === 0);
  check("2 single dependency parsed", rows["T2"].dependsOn.join(",") === "T1");
  check("2 comma-separated dependencies parsed", rows["T3"].dependsOn.join(",") === "T1,T2");
  check("2 dash and none also mean empty", parseDependsOn("-").length === 0 && parseDependsOn("None").length === 0);
  check("2 backticked ids are tolerated", parseDependsOn("`T1`, `T2`").join(",") === "T1,T2");
}

/* ── 3. degradation: the store never blocks a caller ──────────────────── */
{
  const root = tmpRoot();
  const absent = readTaskState(root, "biometric-login");
  check("3 absent file reports absent", absent.status === "absent" && absent.available === false);
  check("3 absent file yields no tasks and a developer-facing summary", Object.keys(absent.tasks).length === 0 && absent.summary.length > 0);

  const p = stateFilePath(root, "biometric-login");
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, "{ not json");
  const bad = readTaskState(root, "biometric-login");
  check("3 malformed file reports unparseable, never throws", bad.status === "unparseable" && bad.available === false);

  writeFileSync(p, JSON.stringify({ taskStateSchemaVersion: 1, feature: "biometric-login" }));
  check("3 missing tasks map reports invalid", readTaskState(root, "biometric-login").status === "invalid");

  writeFileSync(p, JSON.stringify({ taskStateSchemaVersion: CURRENT_SCHEMA_VERSION + 1, feature: "biometric-login", tasks: {} }));
  check("3 newer schema reports schema-too-new", readTaskState(root, "biometric-login").status === "schema-too-new");

  writeFileSync(p, JSON.stringify({ taskStateSchemaVersion: 1, feature: "other-feature", tasks: {} }));
  const mism = readTaskState(root, "biometric-login");
  check("3 wrong feature reports feature-mismatch", mism.status === "feature-mismatch");
  check("3 every non-ok status is unavailable with zero trusted tasks", mism.available === false && Object.keys(mism.tasks).length === 0);
  rmSync(root, { recursive: true, force: true });
}

/* ── 4. write / read round trip, and the attempt counter ──────────────── */
{
  const root = tmpRoot();
  const bd = seedBreakdown(root);

  const w1 = writeTaskState(root, "biometric-login", "T1", "in-progress", { platform: "react-native" }, bd);
  check("4 first in-progress write succeeds", w1.status === "written");
  check("4 first attempt is 1", w1.attempt === 1);
  check("4 runId is taskId-attempt-N", w1.runId === "T1-attempt-1");

  const w2 = writeTaskState(root, "biometric-login", "T1", "failed", { platform: "react-native" }, bd);
  check("4 a terminal write keeps the in-flight attempt number", w2.attempt === 1 && w2.runId === "T1-attempt-1");

  const w3 = writeTaskState(root, "biometric-login", "T1", "in-progress", { platform: "react-native" }, bd);
  check("4 a new run increments the attempt counter", w3.attempt === 2 && w3.runId === "T1-attempt-2");
  check("4 repeated runs are distinguishable", w1.runId !== w3.runId);

  const w4 = writeTaskState(root, "biometric-login", "T1", "complete", PASSING, bd);
  check("4 complete keeps the second run's number", w4.attempt === 2 && w4.runId === "T1-attempt-2");

  const r = readTaskState(root, "biometric-login", bd);
  check("4 read reports ok", r.status === "ok" && r.available === true);
  check("4 T1 is complete", r.tasks["T1"].state === "complete");
  check("4 written provenance is always plugin-verified", r.tasks["T1"].provenance === "plugin-verified");
  check("4 completion report is persisted", r.tasks["T1"].filesChanged.length === 1 && r.tasks["T1"].standardIds.join(",") === "RN-TS-1");
  check("4 unrecorded breakdown tasks read as unknown", r.tasks["T2"].state === "unknown" && r.tasks["T3"].state === "unknown");
  check("4 dependsOn comes from the breakdown", r.tasks["T3"].dependsOn?.join(",") === "T1,T2");
  check("4 file is pretty-printed JSON with a trailing newline", readFileSync(stateFilePath(root, "biometric-login"), "utf-8").endsWith("}\n"));
  rmSync(root, { recursive: true, force: true });
}

/* ── 5. the terminal-complete verification gate ───────────────────────── */
{
  const root = tmpRoot();
  const bd = seedBreakdown(root);
  check("5 verificationSatisfied rejects an empty payload", verificationSatisfied({}) === false);
  check("5 rejects criteria with no validation", verificationSatisfied({ acceptanceCriteria: [{ criterion: "x", met: true }] }) === false);
  check("5 rejects an unmet criterion", verificationSatisfied({ acceptanceCriteria: [{ criterion: "x", met: false }], validation: [{ command: "t", result: "pass" }] }) === false);
  check("5 accepts all-met criteria plus validation", verificationSatisfied(PASSING) === true);

  const refused = writeTaskState(root, "biometric-login", "T1", "complete", { platform: "react-native" }, bd);
  check("5 complete without verification is refused", refused.status === "refused" && refused.reason === "complete-without-verification");
  check("5 the refusal writes nothing", !existsSync(stateFilePath(root, "biometric-login")));

  const allowedFail = writeTaskState(root, "biometric-login", "T1", "failed", { blockers: ["tsc failed"] }, bd);
  check("5 failed needs no verification evidence", allowedFail.status === "written");
  const allowedBlocked = writeTaskState(root, "biometric-login", "T2", "blocked", { blockers: ["T1 unproven"] }, bd);
  check("5 blocked needs no verification evidence", allowedBlocked.status === "written");

  const bogus = writeTaskState(root, "biometric-login", "T1", "done", {}, bd);
  check("5 an unknown state is refused", bogus.status === "refused" && bogus.reason === "invalid-state");
  rmSync(root, { recursive: true, force: true });
}

/* ── 6. staleness from fingerprint mismatch ───────────────────────────── */
{
  const root = tmpRoot();
  const bd = seedBreakdown(root);
  writeTaskState(root, "biometric-login", "T1", "in-progress", {}, bd);
  writeTaskState(root, "biometric-login", "T1", "complete", PASSING, bd);

  const fresh = readTaskState(root, "biometric-login", bd);
  check("6 matching fingerprint is not stale", fresh.tasks["T1"].stale === false);
  check("6 a verified, non-stale complete is deterministic proof", fresh.tasks["T1"].deterministicProof === true);

  seedBreakdown(root, BREAKDOWN.replace("Add the biometric hook", "Add the biometric hook and cache it"));
  const stale = readTaskState(root, "biometric-login", bd);
  check("6 an edited row makes the record stale", stale.tasks["T1"].stale === true);
  check("6 a stale complete is NOT deterministic proof", stale.tasks["T1"].deterministicProof === false);
  check("6 the recorded state itself is unchanged", stale.tasks["T1"].state === "complete");
  check("6 the summary reports the stale count", /stale/.test(stale.summary));

  seedBreakdown(root);
  const noBd = readTaskState(root, "biometric-login");
  check("6 staleness is null when no breakdown is supplied", noBd.tasks["T1"].stale === null);
  check("6 and proof is withheld without a breakdown", noBd.tasks["T1"].deterministicProof === false);
  check("6 dependsOn is null without a breakdown", noBd.tasks["T1"].dependsOn === null);

  seedBreakdown(root, BREAKDOWN.split("\n").filter((l) => !l.startsWith("| T1 ")).join("\n"));
  check("6 a record whose row was deleted is stale", readTaskState(root, "biometric-login", bd).tasks["T1"].stale === true);
  rmSync(root, { recursive: true, force: true });
}

/* ── 7. trust levels: human attestation is never deterministic proof ──── */
{
  const root = tmpRoot();
  const bd = seedBreakdown(root);
  writeTaskState(root, "biometric-login", "T1", "in-progress", {}, bd);
  writeTaskState(root, "biometric-login", "T1", "complete", PASSING, bd);

  const p = stateFilePath(root, "biometric-login");
  const doc = JSON.parse(readFileSync(p, "utf-8"));
  doc.tasks["T2"] = {
    state: "complete",
    provenance: "human-attested",
    attempt: 1,
    runId: "T2-attempt-1",
    rowFingerprint: parseBreakdown(readFileSync(bd, "utf-8"))["T2"].fingerprint,
    platform: "react-native",
    head: null,
    filesChanged: [],
    standardIds: [],
    validation: [],
    acceptanceCriteria: [],
    deviations: [],
    blockers: [],
  };
  writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);

  const r = readTaskState(root, "biometric-login", bd);
  check("7 a human attestation is read and preserved", r.tasks["T2"].state === "complete" && r.tasks["T2"].provenance === "human-attested");
  check("7 it is NOT stale (its fingerprint matches)", r.tasks["T2"].stale === false);
  check("7 but it is NOT deterministic proof", r.tasks["T2"].deterministicProof === false);
  check("7 while the plugin-verified record IS proof", r.tasks["T1"].deterministicProof === true);
  check("7 the two trust levels stay distinguishable", r.tasks["T1"].provenance !== r.tasks["T2"].provenance);

  const after = writeTaskState(root, "biometric-login", "T2", "in-progress", {}, bd);
  check("7 the writer never emits human-attested", after.status === "written" &&
    JSON.parse(readFileSync(p, "utf-8")).tasks["T2"].provenance === "plugin-verified");
  rmSync(root, { recursive: true, force: true });
}

/* ── 8. dependency resolution the caller performs on the read output ──── */
{
  const root = tmpRoot();
  const bd = seedBreakdown(root);
  const proven = (r: ReturnType<typeof readTaskState>, id: string): boolean =>
    (r.tasks[id]?.dependsOn ?? []).every((d) => r.tasks[d]?.deterministicProof === true);

  let r = readTaskState(root, "biometric-login", bd);
  check("8 T2 is not proven while T1 is unknown", proven(r, "T2") === false);

  writeTaskState(root, "biometric-login", "T1", "in-progress", {}, bd);
  writeTaskState(root, "biometric-login", "T1", "complete", PASSING, bd);
  r = readTaskState(root, "biometric-login", bd);
  check("8 T2 is proven once T1 is verified complete", proven(r, "T2") === true);
  check("8 T3 is not proven while T2 is unknown", proven(r, "T3") === false);

  writeTaskState(root, "biometric-login", "T2", "in-progress", {}, bd);
  writeTaskState(root, "biometric-login", "T2", "blocked", { blockers: ["backend contract"] }, bd);
  r = readTaskState(root, "biometric-login", bd);
  check("8 a blocked dependency is not proof", proven(r, "T3") === false);

  seedBreakdown(root, BREAKDOWN.replace("Add the biometric hook", "Add the biometric hook v2"));
  r = readTaskState(root, "biometric-login", bd);
  check("8 a stale dependency is not proof", proven(r, "T2") === false);
  rmSync(root, { recursive: true, force: true });
}

/* ── 9. re-run guard and interrupted-run visibility ───────────────────── */
{
  const root = tmpRoot();
  const bd = seedBreakdown(root);
  writeTaskState(root, "biometric-login", "T1", "in-progress", {}, bd);
  writeTaskState(root, "biometric-login", "T1", "complete", PASSING, bd);
  const r = readTaskState(root, "biometric-login", bd);
  check("9 an already-complete task is visible for the re-run guard",
    r.tasks["T1"].state === "complete" && r.tasks["T1"].deterministicProof === true);

  // A run that dies after the pre-handoff write leaves in-progress behind.
  writeTaskState(root, "biometric-login", "T3", "in-progress", { platform: "react-native" }, bd);
  const r2 = readTaskState(root, "biometric-login", bd);
  check("9 an interrupted run is still in-progress", r2.tasks["T3"].state === "in-progress");
  check("9 with its attempt number available", r2.tasks["T3"].runId === "T3-attempt-1");
  check("9 and is not mistaken for proof", r2.tasks["T3"].deterministicProof === false);
  rmSync(root, { recursive: true, force: true });
}

/* ── 10. atomicity and determinism ────────────────────────────────────── */
{
  const root = tmpRoot();
  const bd = seedBreakdown(root);
  writeTaskState(root, "biometric-login", "T1", "in-progress", {}, bd);
  writeTaskState(root, "biometric-login", "T1", "complete", PASSING, bd);
  const first = readFileSync(stateFilePath(root, "biometric-login"), "utf-8");

  const root2 = tmpRoot();
  const bd2 = seedBreakdown(root2);
  writeTaskState(root2, "biometric-login", "T1", "in-progress", {}, bd2);
  writeTaskState(root2, "biometric-login", "T1", "complete", PASSING, bd2);
  const second = readFileSync(stateFilePath(root2, "biometric-login"), "utf-8");
  check("10 identical inputs produce a byte-identical file", first === second);

  writeTaskState(root, "biometric-login", "T3", "in-progress", {}, bd);
  writeTaskState(root, "biometric-login", "T2", "in-progress", {}, bd);
  const keys = Object.keys(JSON.parse(readFileSync(stateFilePath(root, "biometric-login"), "utf-8")).tasks);
  check("10 task keys are written in sorted order", keys.join(",") === "T1,T2,T3");
  check("10 no temp file is left behind", !existsSync(join(root, "docs", "tasks", `.${process.pid}.task-state.tmp`)));

  const code = readFileSync(SCRIPT, "utf-8");
  check("10 no Date usage in code", !/\bnew Date\b|\bDate\.now\b/.test(code));
  check("10 no Math.random usage in code", !/\bMath\.random\b/.test(code));
  check("10 no timestamp field is written", !/"?(createdAt|updatedAt|completedAt|startedAt|recordedAt)"?\s*:/.test(code));
  rmSync(root, { recursive: true, force: true });
  rmSync(root2, { recursive: true, force: true });
}

/* ── 11. contract / script drift ──────────────────────────────────────── */
{
  check("11 the contract document exists", existsSync(CONTRACT));
  const doc = readFileSync(CONTRACT, "utf-8");
  const declared = /\|\s*task state\s*\|\s*(\d+)\s*\|/.exec(doc);
  check("11 the contract declares a version in its table", declared !== null, doc.slice(0, 60));
  if (declared) {
    check(`11 contract version matches CURRENT_SCHEMA_VERSION (${CURRENT_SCHEMA_VERSION})`,
      Number(declared[1]) === CURRENT_SCHEMA_VERSION, `${declared[1]} vs ${CURRENT_SCHEMA_VERSION}`);
  }
  check("11 the contract states the single discovery rule",
    /docs\/tasks\/\{FEATURE-NAME\}-task-state\.json/.test(doc));
  check("11 the contract forbids a planning-document link field",
    /never mutated for discovery/.test(doc));
  check("11 the contract documents all four writable states",
    WRITABLE_STATES.every((s) => new RegExp(`\`${s}\``).test(doc)));
  check("11 the contract documents both provenance values",
    /`plugin-verified`/.test(doc) && /`human-attested`/.test(doc));
  check("11 the contract states the deterministicProof rule", /deterministicProof/.test(doc));
  check("11 the contract specifies the fingerprint normalization", /Row fingerprint normalization/.test(doc));
  check("11 the contract records the attempt-counter runId shape", /\{taskId\}-attempt-\{attempt\}/.test(doc));

  // plugin.json is the authoritative plugin version. Equality, not ">=": a record must
  // state the version that actually wrote it, never a planned future release.
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, ".claude-plugin", "plugin.json"), "utf-8"));
  check("11 PLUGIN_VERSION matches plugin.json exactly", pkg.version === PLUGIN_VERSION, `${pkg.version} vs ${PLUGIN_VERSION}`);
}

/* ── 12. the commands wired to the store ──────────────────────────────── */
{
  const impl = readFileSync(join(REPO_ROOT, "commands", "implement-task.md"), "utf-8");
  check("12 implement-task invokes the helper", /scripts\/task-state\.ts/.test(impl));
  check("12 implement-task no longer claims no mechanism exists",
    !/no deterministic per-task lifecycle\/status store/.test(impl) &&
    !/no approved task-status-mutation mechanism/.test(impl));
  check("12 implement-task requires deterministicProof for a dependency",
    /deterministicProof/.test(impl));
  check("12 implement-task records in-progress before the handoff",
    /in-progress/.test(impl));
  check("12 implement-task only records complete after verification",
    /complete/.test(impl) && /task-state-contract\.md/.test(impl));

  const qa = readFileSync(join(REPO_ROOT, "commands", "create-dev-qa-notes.md"), "utf-8");
  check("12 create-dev-qa-notes consumes the persisted record", /scripts\/task-state\.ts/.test(qa));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
