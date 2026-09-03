/**
 * source-fingerprint-contract.test.ts — SHARED-013.
 *
 * Pins the upstream-change invalidation contract: an approved downstream artifact must
 * be detectably derived from a specific version of its upstream artifact, and work must
 * stop before continuing against a superseded one.
 *
 * THE DEFECT THIS CLOSES, stated as the repository proved it. Before SHARED-013 the only
 * deterministic change detector was `rowFingerprint`, a hash of ONE task-breakdown row.
 * So an approved DD could be edited after approval and, as long as every task row stayed
 * byte-identical, every gate reported green: rows matched their fingerprints, `status` was
 * still `approved`, and `deterministicProof` was still true. Group 1 below asserts that
 * blind spot still exists at row level (it is real and by design), and the rest of the
 * file asserts the new layer that covers it.
 *
 * WHAT IS AND IS NOT DETERMINISTIC HERE. `fingerprintBody` and `walkDependencies` are
 * code and are tested as code. The stop behaviour itself is prose that Claude executes,
 * so it is tested the way every other command contract in this repository is tested: the
 * rule must be present, must name its recovery command, and must not contradict itself.
 * That is a documentation assertion, not proof of runtime behaviour, and the check.ts
 * footer already says so.
 *
 * OFFLINE. Reads this repository's own files and builds temp fixtures. No network.
 *
 * No external test framework. Run with:
 *   node --no-warnings scripts/source-fingerprint-contract.test.ts
 * or through the aggregator:
 *   node scripts/check.ts --only source-fingerprint
 */

import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, realpathSync, existsSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { fingerprintBody } from "./migrate-planning-doc.ts";
import {
  parseBreakdown,
  walkDependencies,
  impactReport,
  readTaskState,
  writeTaskState,
  type TaskView,
} from "./task-state.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const FIXTURE = join(HERE, "fixtures", "repos", "feature-complete");

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf-8");
const flat = (s: string): string => s.replace(/\s+/g, " ");

/** A throwaway copy of the fixture repo. realpath: macOS /var -> /private/var. */
function materialize(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "sfp-")));
  cpSync(FIXTURE, root, { recursive: true });
  return root;
}
const DD = "docs/biometric-login-DD.md";
const BD = "docs/biometric-login-task-breakdown.md";
const FA = "docs/biometric-login-feature-analysis.md";

/** Frontmatter value lookup that works for both encodings the splitter accepts. */
function fmValue(text: string, key: string): string | null {
  const m = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(text);
  return m === null ? null : m[1].trim();
}

// ===========================================================================
// 1. The blind spot this work closes — row-level detection cannot see a DD edit
// ===========================================================================
{
  const root = materialize();
  const bdBefore = readFileSync(join(root, BD), "utf-8");
  const rowsBefore = parseBreakdown(bdBefore);
  const ddFpBefore = fingerprintBody(readFileSync(join(root, DD)));

  // Edit the DD's BODY only. Not one task row is touched.
  const dd = readFileSync(join(root, DD), "utf-8");
  const mutated = dd.replace(
    "## 19. Technical Implementation Approach",
    "## 19. Technical Implementation Approach\n\nThe opt-in flag now lives in secure storage, not Redux.",
  );
  check("1 the DD fixture has a §19 to mutate", mutated !== dd);
  writeFileSync(join(root, DD), mutated);

  const rowsAfter = parseBreakdown(readFileSync(join(root, BD), "utf-8"));
  const ddFpAfter = fingerprintBody(readFileSync(join(root, DD)));

  check("1 every task row is still byte-identical after the DD edit",
    Object.keys(rowsBefore).every((id) => rowsBefore[id].fingerprint === rowsAfter[id].fingerprint));
  check("1 row-level fingerprints therefore CANNOT see a DD change — the blind spot is real",
    JSON.stringify(Object.keys(rowsBefore).map((i) => rowsBefore[i].fingerprint)) ===
      JSON.stringify(Object.keys(rowsAfter).map((i) => rowsAfter[i].fingerprint)));
  check("1 the DD body fingerprint DOES change — this is the new signal", ddFpBefore !== ddFpAfter,
    `${ddFpBefore} vs ${ddFpAfter}`);
  check("1 breakdown carries source_fingerprint so the change is detectable",
    fmValue(bdBefore, "source_fingerprint") !== null,
    "breakdown frontmatter has no source_fingerprint");
  check("1 the fixture's recorded source_fingerprint matches its DD before the edit",
    fmValue(bdBefore, "source_fingerprint") === ddFpBefore,
    `recorded ${fmValue(bdBefore, "source_fingerprint")} vs computed ${ddFpBefore}`);
  check("1 and mismatches after the edit — the stop condition",
    fmValue(bdBefore, "source_fingerprint") !== ddFpAfter);
  rmSync(root, { recursive: true, force: true });
}

// ===========================================================================
// 2. fingerprintBody — frontmatter excluded, migration-stable
// ===========================================================================
{
  const dd = readFileSync(join(FIXTURE, DD));
  const base = fingerprintBody(dd);
  check("2 fingerprintBody returns a sha256-prefixed digest", base !== null && base.startsWith("sha256:"));

  const text = dd.toString("utf-8");
  // status flips draft->approved AFTER a downstream doc may exist. Must not register.
  const flipped = Buffer.from(text.replace("status: approved", "status: draft"), "utf-8");
  check("2 a status flip does not change the fingerprint", fingerprintBody(flipped) === base);
  const restamped = Buffer.from(text.replace("doc_schema_version: 2", "doc_schema_version: 3"), "utf-8");
  check("2 a doc_schema_version change does not change it", fingerprintBody(restamped) === base);
  const reauthored = Buffer.from(text.replace("author: rn-architect", "author: someone-else"), "utf-8");
  check("2 an author change does not change it", fingerprintBody(reauthored) === base);

  // A body change must register.
  const edited = text.replace("## 20. Impacted Modules", "## 20. Impacted Modules\n\nAlso touches secure storage.");
  check("2 the mutation actually changed the text", edited !== text);
  check("2 a body change DOES change it", fingerprintBody(Buffer.from(edited, "utf-8")) !== base);

  check("2 a document with no frontmatter yields null, never a bogus digest",
    fingerprintBody(Buffer.from("# Just a heading\n\nNo frontmatter.\n", "utf-8")) === null);
  check("2 it is stable across calls", fingerprintBody(dd) === base);
}

// ===========================================================================
// 3. Transitive dependency walk, including cycles
// ===========================================================================
{
  const view = (o: Partial<TaskView>): TaskView => ({
    state: "complete", provenance: "plugin-verified", attempt: 1, runId: "x-attempt-1",
    stale: false, deterministicProof: true, dependsOn: [], filesChanged: [], standardIds: [], ...o,
  });

  // T1 -> T3 -> T7. T1 stale; T3's own row untouched so T3 still proves out.
  const chain: Record<string, TaskView> = {
    T1: view({ stale: true, deterministicProof: false, dependsOn: [] }),
    T3: view({ dependsOn: ["T1"] }),
    T7: view({ state: "unknown", provenance: null, attempt: null, runId: null,
               deterministicProof: false, dependsOn: ["T3"] }),
  };
  const direct = chain.T7.dependsOn ?? [];
  check("3 T7's DIRECT dependency T3 looks fully proven", chain[direct[0]].deterministicProof === true);
  const problems = walkDependencies(chain, "T7");
  check("3 the transitive walk still finds the stale T1", problems.some((p) => p.reason === "stale"));
  check("3 and reports the exact path T7 -> T3 -> T1",
    problems.some((p) => p.path.join(" -> ") === "T7 -> T3 -> T1"),
    JSON.stringify(problems.map((p) => p.path.join(" -> "))));

  // A removed dependency is distinguishable from a modified one.
  const removed: Record<string, TaskView> = {
    T1: view({ stale: true, deterministicProof: false, dependsOn: null }),
    T2: view({ state: "unknown", provenance: null, attempt: null, runId: null,
               deterministicProof: false, dependsOn: ["T1"] }),
  };
  check("3 a removed dependency reports reason 'removed'",
    walkDependencies(removed, "T2").some((p) => p.reason === "removed"));

  // depends-on names a task with no row at all.
  const missing: Record<string, TaskView> = {
    T2: view({ state: "unknown", provenance: null, attempt: null, runId: null,
               deterministicProof: false, dependsOn: ["T9"] }),
  };
  check("3 a dependency with no row reports reason 'missing'",
    walkDependencies(missing, "T2").some((p) => p.reason === "missing"));

  // Cycle: T3 -> T5 -> T3. Must terminate and report the cycle path.
  const cyclic: Record<string, TaskView> = {
    T3: view({ dependsOn: ["T5"] }),
    T5: view({ dependsOn: ["T3"] }),
  };
  const cycleProblems = walkDependencies(cyclic, "T3");
  check("3 a cycle terminates and is reported", cycleProblems.some((p) => p.reason === "cycle"));
  check("3 the cycle path names the repeated task",
    cycleProblems.some((p) => p.reason === "cycle" && p.path.filter((x) => x === "T3").length === 2),
    JSON.stringify(cycleProblems.map((p) => p.path.join(" -> "))));

  // A self-cycle must not hang either.
  check("3 a self-dependency is a cycle, not a hang",
    walkDependencies({ T1: view({ dependsOn: ["T1"] }) }, "T1").some((p) => p.reason === "cycle"));

  // Clean closure: no problems.
  const clean: Record<string, TaskView> = {
    T1: view({ dependsOn: [] }),
    T2: view({ state: "unknown", provenance: null, attempt: null, runId: null,
               deterministicProof: false, dependsOn: ["T1"] }),
  };
  check("3 a fully proven closure yields no problems", walkDependencies(clean, "T2").length === 0);

  // Unrelated staleness is NOT in the closure and must not appear.
  const unrelated: Record<string, TaskView> = {
    T1: view({ dependsOn: [] }),
    T3: view({ stale: true, deterministicProof: false, dependsOn: [] }),
    T7: view({ state: "unknown", provenance: null, attempt: null, runId: null,
               deterministicProof: false, dependsOn: ["T1"] }),
  };
  check("3 stale work OUTSIDE the closure does not block the requested task",
    walkDependencies(unrelated, "T7").length === 0);
}

// ===========================================================================
// 4. Impact report buckets
// ===========================================================================
{
  const view = (o: Partial<TaskView>): TaskView => ({
    state: "complete", provenance: "plugin-verified", attempt: 1, runId: "x-attempt-1",
    stale: false, deterministicProof: true, dependsOn: [], filesChanged: [], standardIds: [], ...o,
  });
  const r = impactReport({
    T1: view({}),
    T3: view({ stale: true, deterministicProof: false, dependsOn: ["T1"] }),
    T5: view({ stale: true, deterministicProof: false, dependsOn: null }),
    T9: view({ state: "unknown", provenance: null, attempt: null, runId: null, deterministicProof: false }),
  });
  check("4 unchanged bucket", r.unchanged.join(",") === "T1", r.unchanged.join(","));
  check("4 modified bucket", r.modified.join(",") === "T3", r.modified.join(","));
  check("4 removed bucket", r.removed.join(",") === "T5", r.removed.join(","));
  check("4 unrecorded bucket", r.unrecorded.join(",") === "T9", r.unrecorded.join(","));
  check("4 every task lands in exactly one bucket",
    r.unchanged.length + r.modified.length + r.removed.length + r.unrecorded.length === 4);
  check("4 buckets are deterministically ordered", JSON.stringify(impactReport({
    T1: view({}), T3: view({ stale: true, deterministicProof: false, dependsOn: ["T1"] }),
    T5: view({ stale: true, deterministicProof: false, dependsOn: null }),
    T9: view({ state: "unknown", provenance: null, attempt: null, runId: null, deterministicProof: false }),
  })) === JSON.stringify(r));
}

// ===========================================================================
// 5. THE MID-RUN SCENARIO — in-flight work survives; the next invocation stops
// ===========================================================================
{
  const root = materialize();
  const bdPath = join(root, BD);
  const feature = "biometric-login";
  const head = "a1b2c3d";

  // T1 and T2 complete cleanly.
  for (const task of ["T1", "T2"]) {
    // breakdownPath is the 6th POSITIONAL argument, not a payload key — passing it
    // inside the payload records no rowFingerprint, which makes every task read `stale`.
    writeTaskState(root, feature, task, "in-progress", { head, platform: "react-native" }, bdPath);
    writeTaskState(root, feature, task, "complete", {
      head, platform: "react-native",
      filesChanged: [`src/${task}.ts`], standardIds: ["RN-TS-1"],
      validation: [{ command: "tsc --noEmit", result: "pass" }],
      acceptanceCriteria: [{ criterion: "done", met: true }],
    }, bdPath);
  }
  // T3 goes in-progress — this is the task in flight.
  writeTaskState(root, feature, "T3", "in-progress", { head, platform: "react-native" }, bdPath);

  // The DD changes WHILE T3 is in flight. Undetected during that run, by design.
  const dd = readFileSync(join(root, DD), "utf-8");
  const ddChanged = dd.replace("## 20. Impacted Modules", "## 20. Impacted Modules\n\nPM changed the storage decision.");
  check("5 the mid-run DD mutation actually changed the document", ddChanged !== dd);
  writeFileSync(join(root, DD), ddChanged);

  // T3 completes anyway and its record must survive.
  writeTaskState(root, feature, "T3", "complete", {
    head, platform: "react-native",
    filesChanged: ["src/features/auth/authSlice.ts"], standardIds: ["RN-STATE-1"],
    validation: [{ command: "tsc --noEmit", result: "pass" }],
    acceptanceCriteria: [{ criterion: "Flag survives restart", met: true }],
  }, bdPath);

  const after = readTaskState(root, feature, bdPath);
  check("5 the in-flight task completed and is still recorded", after.tasks.T3.state === "complete");
  check("5 its provenance survived the mid-run DD change", after.tasks.T3.provenance === "plugin-verified");
  check("5 its filesChanged survived", after.tasks.T3.filesChanged.length === 1);
  check("5 its runId survived", after.tasks.T3.runId === "T3-attempt-1");
  check("5 nothing about the completed record was erased",
    after.tasks.T1.state === "complete" && after.tasks.T2.state === "complete");

  // Next invocation: the upstream mismatch is what stops the following task.
  const recorded = fmValue(readFileSync(bdPath, "utf-8"), "source_fingerprint");
  const current = fingerprintBody(readFileSync(join(root, DD)));
  check("5 the next invocation detects the upstream mismatch", recorded !== null && recorded !== current,
    `recorded=${recorded} current=${current}`);
  check("5 rows alone would NOT have detected it — T3's row is not stale",
    after.tasks.T3.stale === false, `stale=${String(after.tasks.T3.stale)}`);
  check("5 every row still fingerprints cleanly",
    Object.values(parseBreakdown(readFileSync(bdPath, "utf-8"))).every((r) => r.fingerprint.startsWith("sha256:")));
  rmSync(root, { recursive: true, force: true });
}

// ===========================================================================
// 6. Fixture and template carry the field
// ===========================================================================
{
  for (const [label, rel] of [["DD", DD], ["breakdown", BD]] as const) {
    const text = readFileSync(join(FIXTURE, rel), "utf-8");
    check(`6 fixture ${label} carries source_fingerprint`, fmValue(text, "source_fingerprint") !== null);
    check(`6 fixture ${label}'s value is sha256-prefixed`,
      (fmValue(text, "source_fingerprint") ?? "").startsWith("sha256:"));
  }
  const ddFp = fmValue(readFileSync(join(FIXTURE, DD), "utf-8"), "source_fingerprint");
  check("6 the DD's stamp matches its feature analysis body",
    ddFp === fingerprintBody(readFileSync(join(FIXTURE, FA))), `${ddFp}`);
  const bdFp = fmValue(readFileSync(join(FIXTURE, BD), "utf-8"), "source_fingerprint");
  check("6 the breakdown's stamp matches its DD body",
    bdFp === fingerprintBody(readFileSync(join(FIXTURE, DD))), `${bdFp}`);

  check("6 dd-template declares the field", /^source_fingerprint:/m.test(read("templates/dd-template.md")));
  check("6 task-breakdown-template declares the field",
    /^source_fingerprint:/m.test(read("templates/task-breakdown-template.md")));
  // The Dev Plan has no independent generation point, so it gets no unverified field.
  check("6 dev-plan-template does NOT declare it",
    !/^source_fingerprint:/m.test(read("templates/dev-plan-template.md")));
  check("6 no /dev-plan-start command exists to verify one",
    !existsSync(join(REPO_ROOT, "commands", "dev-plan-start.md")));
}

// ===========================================================================
// 7. Command contracts — the rule, and one recovery command per stop
// ===========================================================================
{
  const impl = flat(read("commands/implement-task.md"));
  const dfs = flat(read("commands/dev-feature-start.md"));
  const dds = flat(read("commands/dev-design-start.md"));
  const af = flat(read("commands/analyze-feature.md"));

  check("7 implement-task runs a preflight on every invocation", /consistency preflight/i.test(impl));
  check("7 implement-task verifies source_fingerprint", /source_fingerprint/.test(impl));
  check("7 implement-task hard-stops on upstream mismatch and names /dev-feature-start",
    /source_fingerprint[\s\S]{0,800}?\/dev-feature-start/.test(impl));
  check("7 implement-task walks the TRANSITIVE closure", /transitive/i.test(impl));
  check("7 implement-task reports the dependency path", /dependency path|T7 → T3|exact path/i.test(impl));
  check("7 implement-task stops on a dependency cycle", /cycle/i.test(impl));
  check("7 implement-task reports unrelated staleness without blocking",
    /outside[\s\S]{0,120}closure[\s\S]{0,200}(does not block|report)/i.test(impl));
  check("7 implement-task prints the impact report", /impact report/i.test(impl));
  check("7 implement-task compares the carried design-reference fields", /design-reference field/i.test(impl));

  check("7 dev-feature-start verifies the DD fingerprint at entry", /source_fingerprint/.test(dfs));
  check("7 dev-feature-start stamps the breakdown", /stamp/i.test(dfs));
  check("7 dev-feature-start shows the impact report before rewriting rows",
    /impact report[\s\S]{0,300}(before|prior to)/i.test(dfs) || /before[\s\S]{0,200}impact report/i.test(dfs));
  check("7 dev-feature-start names /dev-design-start as the recovery", /\/dev-design-start/.test(dfs));
  check("7 dev-feature-start has an existing-file strategy", /already exist/i.test(dfs));

  check("7 dev-design-start verifies the analysis fingerprint", /source_fingerprint/.test(dds));
  check("7 dev-design-start surfaces downstream task-state before the re-entry choice",
    /task-state/i.test(dds));
  check("7 dev-design-start names /analyze-feature as the recovery", /\/analyze-feature/.test(dds));

  check("7 analyze-feature has an existing-file strategy", /already exist/i.test(af));

  // No generic stops: every stop paragraph must name a slash command.
  // Paragraph-scoped, not line-scoped: a stop instruction and the command that resolves
  // it legitimately sit in the same block — sometimes in a table that follows the
  // sentence. Lines that explain why NOT to stop are excluded, since they name no stop.
  const genericStops: string[] = [];
  for (const cmd of ["implement-task", "dev-feature-start", "dev-design-start"]) {
    const text = read(`commands/${cmd}.md`);
    for (const m of text.matchAll(/\bhard stop\b/gi)) {
      const para = text.slice(m.index ?? 0, (m.index ?? 0) + 700);
      if (/never blocking|would teach the developer|do not stop/i.test(para.slice(0, 120))) continue;
      if (!/`?\/(implement-task|dev-feature-start|dev-design-start|analyze-feature)`?/.test(para)) {
        genericStops.push(`${cmd}: ${para.slice(0, 70).replace(/\s+/g, " ")}`);
      }
    }
  }
  check("7 no invalidation stop is generic — each names a recovery command",
    genericStops.length === 0, genericStops.join(" | "));
}

// ===========================================================================
// 8. Backward compatibility and the approval model
// ===========================================================================
{
  const contract = flat(read("docs/planning-doc-contract.md"));
  check("8 the contract defines source_fingerprint", /source_fingerprint/.test(contract));
  check("8 missing means unknown, never mismatch", /unknown[^.]{0,80}never[^.]{0,40}mismatch/i.test(contract));
  check("8 it is declared additive and outside the version chain",
    /additive[\s\S]{0,160}outside the version chain/i.test(contract));
  check("8 no schema version was bumped for it",
    /\| `dd` \| 2 \|/.test(read("docs/planning-doc-contract.md")) &&
      /\| `task-breakdown` \| 1 \|/.test(read("docs/planning-doc-contract.md")));

  const sync = flat(read("skills/dev-design-start/SKILL.md"));
  check("8 one canonical synchronization flow is documented", /synchroni[sz]ation flow/i.test(sync));
  check("8 the flow requires a human to re-approve upstream", /re-approv/i.test(sync));
  check("8 the plugin never revokes approval automatically",
    /never[\s\S]{0,80}revoke[\s\S]{0,60}approval|approval is never revoked/i.test(sync));
  check("8 the plugin never edits upstream requirements",
    /never[\s\S]{0,90}edit[\s\S]{0,90}(upstream|feature analysis)/i.test(sync));

  // Nothing in this work may write `status`.
  for (const rel of ["commands/implement-task.md", "commands/dev-feature-start.md"]) {
    check(`8 ${rel} never writes an approval status`,
      !/\bset\s+`?status`?\s*(:|to)\s*`?approved/i.test(read(rel)));
  }
}

// ===========================================================================
// 9. This suite stays offline
// ===========================================================================
{
  const src = read("scripts/source-fingerprint-contract.test.ts");
  for (const [label, needle] of [
    ["network fetch", `fet${"ch("}`],
    ["child process module", `child${"_process"}`],
  ] as Array<[string, string]>) {
    check(`9 stays offline — no ${label}`, !src.includes(needle));
  }
  // Needle assembled from fragments so this assertion cannot match its own text —
  // the same reason hooks.test.ts builds its credential fixtures from fragments.
  check("9 reuses the shipped body hash rather than defining another",
    src.includes("fingerprintBody") && !src.includes(`create${"Hash"}`));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
