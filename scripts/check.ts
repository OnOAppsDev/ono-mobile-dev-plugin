/**
 * check.ts — the developer-facing entry point for the plugin's deterministic checks.
 *
 *   node scripts/check.ts            run everything, from the repository root
 *   node scripts/check.ts --only ts  run suites whose name contains "ts"
 *
 * Node prints one ExperimentalWarning line on stderr for direct .ts execution. It is
 * Node's, not this tool's, and affects neither the report nor the exit code. Every suite
 * is spawned with --no-warnings, so only that single outer line appears; add the flag
 * yourself (`node --no-warnings scripts/check.ts`) for silent output.
 *
 * This is an aggregator, not a test framework. Every suite it runs already owns its
 * own assertions, prints `PASS `/`FAIL `/`SKIP ` lines and exits non-zero on failure;
 * this script spawns them in a deliberate order, adds up the lines, and reports.
 *
 * Order is foundational-to-integration so the topmost failure is the root cause rather
 * than a symptom: a broken helper makes the document chain fail too, and you want to
 * see the helper first. Every phase runs even after a failure — only the reading order
 * is prioritised.
 *
 * What this run does NOT prove is printed on every invocation, deliberately. The
 * deterministic suites cover roughly 2.8k lines of helper and hook code; the workflow
 * itself is ~7.4k lines of instructions that only Claude executes. A green run means the
 * infrastructure the workflow stands on is intact — never that the workflow is correct.
 *
 * SKIPPED is a third outcome and is never folded into PASS. A suite that cannot run
 * (a missing local tool, for example) says so, and the footer reports the run as
 * incomplete.
 */

import { spawnSync } from "child_process";
import { readdirSync, existsSync } from "fs";
import { join, dirname } from "path";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);

/**
 * Suites are registered explicitly rather than discovered, so the phase a suite belongs
 * to is a decision rather than an accident of filename sorting. An unregistered suite on
 * disk is a failure, not a silent omission — see `unregistered` below.
 */
interface Phase {
  name: string;
  why: string;
  suites: string[];
}

const PHASES: Phase[] = [
  {
    name: "Helpers",
    why: "the deterministic code the workflow calls",
    suites: [
      "resolve-target-repo-root",
      "read-repo-knowledge",
      "assess-dd-complexity",
      "migrate-planning-doc",
      "task-state",
    ],
  },
  {
    name: "Hooks",
    why: "the safety layer that gates every write",
    suites: ["hooks"],
  },
  {
    name: "Contracts",
    why: "documentation and code cannot drift apart",
    suites: [
      "dd-partition-contract",
      "dd-consolidation-contract",
      "dd-orchestration-contract",
      "rn-implementation-contract",
    ],
  },
  {
    name: "Integration",
    why: "each stage's real output is valid input to the next stage's reader",
    suites: ["document-chain"],
  },
];

const NOT_PROVEN = [
  "platform / device-type detection · file attribution — specified in prose, executed by Claude",
  "DD content quality · implementation correctness · review findings · QA prose",
  "that any command, skill or agent behaves correctly when Claude runs it",
];

interface SuiteResult {
  suite: string;
  pass: number;
  fail: number;
  skip: number;
  suiteSkipped: string | null;
  exitCode: number;
  failLines: string[];
  missing: boolean;
}

function runSuite(suite: string): SuiteResult {
  const path = join(HERE, `${suite}.test.ts`);
  const empty: SuiteResult = {
    suite,
    pass: 0,
    fail: 0,
    skip: 0,
    suiteSkipped: null,
    exitCode: 0,
    failLines: [],
    missing: false,
  };
  if (!existsSync(path)) return { ...empty, missing: true, exitCode: 1 };

  const proc = spawnSync(process.execPath, ["--no-warnings", path], {
    encoding: "utf-8",
    cwd: REPO_ROOT,
  });
  const out = `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
  const lines = out.split("\n");

  const skipMatch = /^SUITE SKIPPED:\s*(.+)$/m.exec(out);
  return {
    suite,
    pass: lines.filter((l) => l.startsWith("PASS ")).length,
    fail: lines.filter((l) => l.startsWith("FAIL ")).length,
    skip: lines.filter((l) => l.startsWith("SKIP ")).length,
    suiteSkipped: skipMatch ? skipMatch[1].trim() : null,
    exitCode: proc.status ?? 1,
    failLines: lines.filter((l) => l.startsWith("FAIL ")),
    missing: false,
  };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function main(): void {
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx === -1 ? null : process.argv[onlyIdx + 1];

  const registered = PHASES.flatMap((p) => p.suites);
  const onDisk = readdirSync(HERE)
    .filter((f) => f.endsWith(".test.ts"))
    .map((f) => f.replace(/\.test\.ts$/, ""));
  const unregistered = onDisk.filter((s) => !registered.includes(s));

  console.log("ono-mobile-dev-plugin · deterministic check");
  console.log(`node scripts/check.ts${only ? ` --only ${only}` : ""}`);

  const results: SuiteResult[] = [];
  for (const phase of PHASES) {
    const suites = phase.suites.filter((s) => only === null || s.includes(only));
    if (suites.length === 0) continue;
    console.log(`\nPhase ${PHASES.indexOf(phase) + 1} · ${phase.name}`);
    for (const suite of suites) {
      const r = runSuite(suite);
      results.push(r);
      if (r.missing) {
        console.log(`  ${pad("MISSING", 7)} ${pad(suite, 34)} suite file not found`);
        continue;
      }
      if (r.suiteSkipped !== null) {
        console.log(`  ${pad("SKIPPED", 7)} ${pad(suite, 34)} ${r.suiteSkipped}`);
        continue;
      }
      const verdict = r.fail > 0 || r.exitCode !== 0 ? "FAIL" : "PASS";
      const n = String(r.pass).padStart(4, " ");
      const counts = `${n} assertions${r.skip > 0 ? `, ${r.skip} skipped` : ""}`;
      console.log(`  ${pad(verdict, 7)} ${pad(suite, 34)} ${counts}`);
      for (const line of r.failLines) console.log(`          ${line}`);
    }
  }

  const totalPass = results.reduce((n, r) => n + r.pass, 0);
  const totalFail = results.reduce((n, r) => n + r.fail, 0);
  const totalSkip = results.reduce((n, r) => n + r.skip, 0);
  const skippedSuites = results.filter((r) => r.suiteSkipped !== null);
  const missingSuites = results.filter((r) => r.missing);
  const broken = results.filter((r) => !r.missing && r.suiteSkipped === null && (r.fail > 0 || r.exitCode !== 0));
  const ran = results.length - skippedSuites.length - missingSuites.length;

  console.log(`\n${"─".repeat(63)}`);
  console.log(
    `${ran} suites · ${totalPass} assertions · ${totalFail} failures · ${
      totalSkip + skippedSuites.length
    } skipped`,
  );

  if (unregistered.length > 0) {
    console.log(`\nUNREGISTERED suite(s) on disk, not run: ${unregistered.join(", ")}`);
    console.log("Add them to a phase in scripts/check.ts — a suite nobody runs is a suite nobody trusts.");
  }

  // A filter that matches nothing must never read as healthy: a typo'd --only would
  // otherwise run zero suites and print a green report.
  const emptyRun = results.length === 0;
  if (emptyRun) {
    console.log(
      only === null
        ? "No suites are registered in scripts/check.ts."
        : `No suite name contains "${only}". Registered: ${registered.join(", ")}`,
    );
  }

  const failed = broken.length > 0 || missingSuites.length > 0 || unregistered.length > 0 || emptyRun;

  if (failed) {
    const names = [
      ...broken.map((r) => `${r.suite} (${r.fail || "exit " + r.exitCode})`),
      ...missingSuites.map((r) => `${r.suite} (missing)`),
    ];
    if (names.length > 0) console.log(`FAILED: ${names.join(", ")}`);
    if (broken.some((r) => r.suite === "document-chain") && broken.length > 1) {
      console.log("Start with Phase 1: document-chain failures are often downstream.");
    }
  } else if (skippedSuites.length > 0) {
    console.log("Deterministic infrastructure healthy, but the run was INCOMPLETE — see skipped suites above.");
  } else {
    console.log("Deterministic infrastructure healthy.");
  }

  console.log("\nNOT covered by this run — these require Claude and are verified by");
  console.log("review or `claude plugin eval`, never here:");
  for (const item of NOT_PROVEN) console.log(`  ${item}`);

  process.exit(failed ? 1 : 0);
}

main();
