/**
 * developer-testing-contract.test.ts
 *
 * Pins Stage 3: the mandatory Developer Testing step of implementation.
 *
 * Developer testing means tests that live inside the code repository — unit, component
 * and repository integration tests. It is NOT QA automation, QA plans, manual QA, Appium
 * or WebdriverIO. It is the developer's implementation-time responsibility, so what it
 * leaves undone is owed by the developer, never silently transferred to QA.
 *
 * Six things this suite exists to protect:
 *
 *   1. THE DECISION IS MANDATORY. A terminal `complete` cannot be written without a
 *      recorded developer-testing decision. Silence is not "no tests needed".
 *   2. REQUIRED OR JUSTIFIED. Not required → a reason. A framework exists but no test was
 *      added or updated → a justification. The default is to write tests.
 *   3. RESULTS CANNOT BE FABRICATED. A run is `pass` or `fail`, nothing softer, and must be
 *      a command the completion report says was actually executed. A failing run blocks.
 *   4. UNDISCHARGED TESTING BECOMES DEBT. Required tests that could not be written or run
 *      are recorded as `developer-testing` verification debt.
 *   5. THAT DEBT BELONGS TO THE DEVELOPER. The writer refuses any other owner, and the
 *      reader keeps it out of the debt QA is told it owes.
 *   6. QA DEBT IS UNCHANGED. Accessibility debt owned by QA is still accepted, still
 *      non-blocking, and still reaches the QA handoff.
 *
 * OFFLINE. Reads this repository's own markdown and writes only under a temp directory.
 *
 *   node --no-warnings scripts/developer-testing-contract.test.ts
 *   node scripts/check.ts --only developer-testing-contract
 */

import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import * as TaskState from "./task-state.ts";
import { writeTaskState, readTaskState, type WritePayload } from "./task-state.ts";

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

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf-8");
const flat = (s: string): string => s.replace(/\s+/g, " ");

// Loose-typed payload builder: the suite must be able to express the payloads the writer
// is supposed to refuse, including ones the TypeScript types forbid.
type Loose = Record<string, unknown>;
const asPayload = (p: Loose): WritePayload => p as unknown as WritePayload;

// =========================================================================
// 1-6. BEHAVIOUR — against the real helper
// =========================================================================
{
  const tmp = mkdtempSync(join(tmpdir(), "devtest-contract-"));
  const feature = "checkout";
  const breakdown = join(tmp, "breakdown.md");
  mkdirSync(join(tmp, ".git"), { recursive: true });
  writeFileSync(
    breakdown,
    Array.from({ length: 30 }, (_, i) => `| T${i + 1} | task ${i + 1} | react | mobile |`).join("\n") + "\n",
  );

  const TEST_CMD = "npx jest src/cart/useCart.test.ts";
  const base = (): Loose => ({
    platform: "react",
    filesChanged: ["src/cart/useCart.ts", "src/cart/useCart.test.ts"],
    standardIds: ["REACT-TS-1"],
    validation: [
      { command: "npx tsc --noEmit", result: "pass" },
      { command: TEST_CMD, result: "pass" },
    ],
    acceptanceCriteria: [{ criterion: "cart total updates", met: true }],
  });
  const DT_OK = (): Loose => ({
    framework: "jest",
    required: true,
    testsChanged: ["src/cart/useCart.test.ts"],
    justification: null,
    runs: [{ command: TEST_CMD, result: "pass" }],
    notRunReason: null,
  });
  const DEV_DEBT = (): Loose => ({
    domain: "developer-testing",
    ruleId: "VERIFY-4",
    requiredVerification: "Run the useCart unit tests",
    whyNotAutomatable: "The jest environment requires a private registry token absent from this machine",
    owner: "developer",
    status: "pending",
  });
  const QA_DEBT = (): Loose => ({
    domain: "accessibility",
    ruleId: "A11Y-SR-1",
    requiredVerification: "VoiceOver walkthrough of the cart",
    whyNotAutomatable: "VoiceOver cannot be driven headlessly",
    owner: "qa",
    status: "pending",
  });

  let n = 0;
  const write = (state: string, p: Loose) =>
    writeTaskState(tmp, feature, `T${++n}`, state, asPayload(p), breakdown);
  const view = (id: string) => readTaskState(tmp, feature, breakdown).tasks[id] as unknown as Loose;

  // -- 1. The decision is mandatory --------------------------------------
  {
    const r = write("complete", base());
    check("1 complete without a developer-testing decision is refused", r.status === "refused", r.summary);
    check("1 the refusal names the missing decision",
      r.reason === "complete-without-developer-testing", String(r.reason));

    const ok = write("complete", { ...base(), developerTesting: DT_OK() });
    check("1 complete with a recorded decision is written", ok.status === "written", ok.summary);
    const v = view(`T${n}`);
    check("1 the reader reports the decision as required", v.developerTestingStatus === "required",
      String(v.developerTestingStatus));

    const ip = write("in-progress", { platform: "react" });
    check("1 in-progress does not require the decision yet", ip.status === "written", ip.summary);
  }

  // -- 1b. Legacy records read notRecorded, never "not required" ---------
  {
    const legacy = mkdtempSync(join(tmpdir(), "devtest-legacy-"));
    mkdirSync(join(legacy, "docs", "tasks"), { recursive: true });
    writeFileSync(
      join(legacy, "docs", "tasks", `${feature}-task-state.json`),
      JSON.stringify({
        taskStateSchemaVersion: 1,
        feature,
        producedBy: { plugin: "ono-mobile-dev-plugin", version: "0.5.0" },
        tasks: {
          T1: {
            state: "complete", provenance: "plugin-verified", attempt: 1, runId: "T1-attempt-1",
            rowFingerprint: null, platform: "react", head: null, filesChanged: [], standardIds: [],
            validation: [{ command: "x", result: "pass" }],
            acceptanceCriteria: [{ criterion: "c", met: true }], deviations: [], blockers: [],
          },
        },
      }),
    );
    const v = readTaskState(legacy, feature).tasks.T1 as unknown as Loose;
    check("1b a legacy record reads developerTestingStatus notRecorded",
      v.developerTestingStatus === "notRecorded", String(v.developerTestingStatus));
    check("1b a legacy record carries no developerTesting block", v.developerTesting === null);
    rmSync(legacy, { recursive: true, force: true });
  }

  // -- 2. Required, or explicitly justified ------------------------------
  {
    const r1 = write("complete", {
      ...base(),
      developerTesting: { ...DT_OK(), required: false, testsChanged: [], runs: [], justification: null },
    });
    check("2 not-required with no justification is refused", r1.status === "refused", r1.summary);
    check("2 an invalid decision is refused as invalid-developer-testing",
      r1.reason === "invalid-developer-testing", String(r1.reason));

    const r2 = write("complete", {
      ...base(),
      developerTesting: {
        ...DT_OK(), framework: null, required: false, testsChanged: [], runs: [],
        justification: "Build-script change only; no runtime code under test",
      },
    });
    check("2 not-required with a justification is written", r2.status === "written", r2.summary);
    check("2 the reader reports notRequired", view(`T${n}`).developerTestingStatus === "notRequired");

    const r3 = write("complete", {
      ...base(),
      developerTesting: { ...DT_OK(), testsChanged: [], justification: null },
    });
    check("2 a framework exists, no test touched, no justification → refused",
      r3.status === "refused" && r3.reason === "invalid-developer-testing", r3.summary);

    const r4 = write("complete", {
      ...base(),
      developerTesting: {
        ...DT_OK(), testsChanged: [],
        justification: "useCart.test.ts already asserts the changed total; ran it unchanged",
      },
    });
    check("2 a framework exists, no test touched, justified → written", r4.status === "written", r4.summary);

    const r5 = write("complete", { ...base(), developerTesting: { ...DT_OK(), required: "maybe" } });
    check("2 required must be a boolean", r5.status === "refused", r5.summary);
  }

  // -- 3. Results cannot be fabricated -----------------------------------
  {
    for (const bogus of ["passed", "assumed-pass", "expected", "skipped", ""]) {
      const r = write("complete", {
        ...base(),
        developerTesting: { ...DT_OK(), runs: [{ command: TEST_CMD, result: bogus }] },
      });
      check(`3 a run result of "${bogus}" is refused`, r.status === "refused", r.summary);
    }

    const noCmd = write("complete", {
      ...base(),
      developerTesting: { ...DT_OK(), runs: [{ command: "", result: "pass" }] },
    });
    check("3 a run with no command is refused", noCmd.status === "refused", noCmd.summary);

    const phantom = write("complete", {
      ...base(),
      developerTesting: { ...DT_OK(), runs: [{ command: "npx jest --all", result: "pass" }] },
    });
    check("3 a run absent from the executed validation list is refused",
      phantom.status === "refused" && phantom.reason === "invalid-developer-testing", phantom.summary);

    const mismatch = write("complete", {
      ...base(),
      validation: [{ command: TEST_CMD, result: "fail" }],
      developerTesting: { ...DT_OK(), runs: [{ command: TEST_CMD, result: "pass" }] },
    });
    check("3 a run whose result contradicts the validation record is refused",
      mismatch.status === "refused", mismatch.summary);

    const failing = write("complete", {
      ...base(),
      validation: [{ command: TEST_CMD, result: "fail" }],
      developerTesting: { ...DT_OK(), runs: [{ command: TEST_CMD, result: "fail" }] },
    });
    check("3 a failing developer test blocks complete", failing.status === "refused", failing.summary);

    const failedState = write("failed", {
      ...base(),
      validation: [{ command: TEST_CMD, result: "fail" }],
      developerTesting: { ...DT_OK(), runs: [{ command: TEST_CMD, result: "fail" }] },
      blockers: ["useCart.test.ts fails"],
    });
    check("3 a failing developer test can be recorded as failed", failedState.status === "written",
      failedState.summary);

    const notRunNoDebt = write("complete", {
      ...base(),
      developerTesting: { ...DT_OK(), runs: [], notRunReason: "registry token missing" },
    });
    check("3 required tests not run and no debt recorded → refused",
      notRunNoDebt.status === "refused" && notRunNoDebt.reason === "invalid-developer-testing",
      notRunNoDebt.summary);

    const notRunNoReason = write("complete", {
      ...base(),
      developerTesting: { ...DT_OK(), runs: [], notRunReason: null },
      verificationDebt: [DEV_DEBT()],
    });
    check("3 required tests not run with no reason → refused", notRunNoReason.status === "refused",
      notRunNoReason.summary);
  }

  // -- 4. Undischarged testing becomes developer debt --------------------
  {
    const r = write("complete", {
      ...base(),
      developerTesting: { ...DT_OK(), runs: [], notRunReason: "registry token missing" },
      verificationDebt: [DEV_DEBT()],
    });
    check("4 required-but-unrun tests with developer debt → written (debt never blocks)",
      r.status === "written", r.summary);
    const v = view(`T${n}`);
    const dev = v.developerVerificationDebt as Loose[] | undefined;
    check("4 the reader surfaces the developer debt",
      Array.isArray(dev) && dev.length === 1 && dev[0].domain === "developer-testing");

    const noFramework = write("complete", {
      ...base(),
      developerTesting: {
        framework: null, required: true, testsChanged: [], runs: [],
        justification: "The repository has no unit-test framework configured",
        notRunReason: "No in-repo test runner exists",
      },
      verificationDebt: [{ ...DEV_DEBT(), requiredVerification: "Add and run unit tests for useCart" }],
    });
    check("4 no framework: tests cannot be written → recorded as developer debt",
      noFramework.status === "written", noFramework.summary);
  }

  // -- 5. That debt belongs to the developer -----------------------------
  {
    const asQa = write("complete", {
      ...base(),
      developerTesting: { ...DT_OK(), runs: [], notRunReason: "registry token missing" },
      verificationDebt: [{ ...DEV_DEBT(), owner: "qa" }],
    });
    check("5 developer-testing debt owned by QA is refused",
      asQa.status === "refused" && asQa.reason === "invalid-developer-testing", asQa.summary);

    const discharged = write("complete", {
      ...base(),
      developerTesting: { ...DT_OK(), runs: [], notRunReason: "registry token missing" },
      verificationDebt: [{ ...DEV_DEBT(), status: "done" }],
    });
    check("5 developer debt cannot be written discharged", discharged.status === "refused", discharged.summary);

    const mixed = write("complete", {
      ...base(),
      developerTesting: { ...DT_OK(), runs: [], notRunReason: "registry token missing" },
      verificationDebt: [DEV_DEBT(), QA_DEBT()],
    });
    check("5 developer and QA debt can coexist on one record", mixed.status === "written", mixed.summary);
    const v = view(`T${n}`);
    const qa = (v.qaVerificationDebt ?? []) as Loose[];
    const dev = (v.developerVerificationDebt ?? []) as Loose[];
    check("5 QA-owed debt excludes developer-testing debt",
      qa.length === 1 && qa.every((d) => d.owner === "qa" && d.domain !== "developer-testing"),
      JSON.stringify(qa));
    check("5 developer-owed debt excludes QA debt",
      dev.length === 1 && dev.every((d) => d.owner === "developer"), JSON.stringify(dev));
    check("5 the full verificationDebt list still carries both",
      (v.verificationDebt as Loose[]).length === 2);
  }

  // -- 6. QA debt behaviour is unchanged ---------------------------------
  {
    const r = write("complete", {
      ...base(),
      developerTesting: DT_OK(),
      verificationDebt: [QA_DEBT()],
    });
    check("6 QA-owned accessibility debt is still accepted and non-blocking", r.status === "written", r.summary);
    const v = view(`T${n}`);
    check("6 QA-owned accessibility debt still reaches the QA list",
      ((v.qaVerificationDebt ?? []) as Loose[]).length === 1);
    check("6 QA-owned accessibility debt still reads back in verificationDebt",
      (v.verificationDebt as Loose[]).length === 1 && (v.verificationDebt as Loose[])[0].owner === "qa");

    const pendingOnly = write("complete", {
      ...base(), developerTesting: DT_OK(), verificationDebt: [{ ...QA_DEBT(), status: "done" }],
    });
    check("6 QA debt is still refused unless pending", pendingOnly.status === "refused");

    const sr1 = write("complete", {
      ...base(),
      developerTesting: DT_OK(),
      accessibility: {
        applicable: true, reason: null, deviceType: "mobile", standardIds: ["A11Y-SR-1"],
        checks: [{ ruleId: "A11Y-SR-1", tier: 1, result: "pass" }],
      },
    });
    check("6 VERIFY-2 still refuses a mechanical pass on A11Y-SR-1",
      sr1.status === "refused" && sr1.reason === "invalid-accessibility", sr1.summary);

    check("6 the helper exports a developer-testing validator",
      typeof (TaskState as Loose).developerTestingProblem === "function");
  }

  rmSync(tmp, { recursive: true, force: true });
}

// =========================================================================
// 7. DOCUMENTS — the prose that binds Claude
// =========================================================================
{
  const SKILL = read("skills/platform-implementation/SKILL.md");
  const s = flat(SKILL);
  const IMPL = flat(read("commands/implement-task.md"));
  const FIX = flat(read("commands/fix-review-comments.md"));
  const QA_CMD = flat(read("commands/create-dev-qa-notes.md"));
  const QA_TPL = flat(read("templates/qa-handoff-template.md"));
  const VERIFY = read("standards/shared/verification.md");
  const CONTRACT = flat(read("docs/task-state-contract.md"));

  // The shared methodology owns the step.
  check("7 the shared methodology has a Developer testing section", /^## \d+[a-z]?\. Developer testing/m.test(SKILL));
  check("7 it requires detecting the repository's test framework",
    /detect the repository's (developer[- ])?test(ing)? framework/i.test(s));
  check("7 it makes the decision mandatory", /decision is mandatory/i.test(s));
  check("7 it defaults to updating or adding tests where a framework exists",
    /default expectation is to update existing tests or add new ones/i.test(s));
  check("7 it requires an explicit justification for not modifying tests",
    /justif(y|ication)[^.]*not (to )?modify(ing)? tests/i.test(s));
  check("7 it requires the narrowest relevant tests to be run",
    /narrowest relevant (developer )?tests/i.test(s));
  check("7 it forbids claiming tests passed unless they ran", /Never claim a test passed unless it actually ran/i.test(s));
  check("7 it records unwritable/unrunnable tests as developer debt",
    /`domain: "developer-testing"`/.test(s) && /`owner: "developer"`/.test(s));
  check("7 it states developer debt is not QA debt", /never QA debt/i.test(s));
  check("7 it excludes QA automation from developer testing",
    /Appium/.test(s) && /WebdriverIO/.test(s) && /QA (test )?plans?/i.test(s));
  check("7 it defers to the lane's testing guidance, else repository conventions",
    /lane's testing guidance/i.test(s) && /repository('s own)? conventions/i.test(s));
  check("7 it applies to every command that invokes the methodology",
    /whichever command invoked/i.test(s));
  check("7 the shared methodology still names no platform",
    !/\b(React Native|Android|iOS|Kotlin|Swift|Jest|XCTest|Gradle)\b/.test(SKILL));

  // The command records it.
  check("7 implement-task §10 requires the developer-testing outcome", /developer-testing outcome/i.test(IMPL));
  check("7 implement-task shows the developerTesting payload", /"developerTesting"/.test(IMPL));
  check("7 implement-task names the refusal for a missing decision",
    /complete-without-developer-testing/.test(IMPL));
  check("7 implement-task keeps developer debt owned by the developer",
    /"owner": "developer"/.test(IMPL) || /`owner: "developer"`/.test(IMPL));

  // fix-review-comments inherits it through the shared methodology.
  check("7 fix-review-comments routes through the shared methodology", /`platform-implementation`/.test(FIX));
  check("7 fix-review-comments inherits the developer-testing decision",
    /developer-testing decision/i.test(FIX));

  // QA handoff keeps developer debt out of "owed to QA".
  check("7 create-dev-qa-notes reads QA debt from qaVerificationDebt", /`qaVerificationDebt`/.test(QA_CMD));
  check("7 create-dev-qa-notes keeps developer debt out of Pending Verification",
    /`developerVerificationDebt`/.test(QA_CMD) && /never (listed|appears) (as|under) (owed to QA|Pending Verification)/i.test(QA_CMD));
  check("7 the QA template restricts Pending Verification to QA-owned debt", /owner: qa/i.test(QA_TPL) || /`owner: "qa"`/.test(QA_TPL));

  // The shared verification standard names the obligation once.
  check("7 VERIFY-4 is defined in the shared verification standard", /^- `VERIFY-4`/m.test(VERIFY));
  check("7 VERIFY-4 names the developer as owner", /`VERIFY-4`[^\n]*(\n [^\n]*)*developer/.test(VERIFY));

  // The contract documents the block.
  check("7 the task-state contract documents developerTesting", /`developerTesting`/.test(CONTRACT));
  check("7 the contract documents the owner split",
    /`qaVerificationDebt`/.test(CONTRACT) && /`developerVerificationDebt`/.test(CONTRACT));

  // Scope: no new React or iOS testing standards.
  check("7 no React testing standard was created",
    !readdirSync(join(REPO_ROOT, "standards/react")).some((f) => /test/i.test(f)));
  check("7 no iOS testing standard was created",
    !readdirSync(join(REPO_ROOT, "standards/ios")).some((f) => /test/i.test(f)));
}

if (failures > 0) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall developer-testing contract checks passed");
