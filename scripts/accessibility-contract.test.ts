/**
 * accessibility-contract.test.ts
 *
 * Pins SHARED-014: accessibility as a first-class dimension of `/implement-task`, and the
 * generic verification-debt mechanism it is the first consumer of.
 *
 * Four things this suite exists to protect, none of which prose alone can hold:
 *
 *   1. THE TV BOUNDARY. SHARED-014 is mobile-only. A `tv` task must skip the mobile
 *      accessibility flow *explicitly* — a silent skip and a recorded skip are
 *      indistinguishable in a document but not in a record. Mobile `A11Y-*` rules must
 *      never be applied to a TV surface, and `REACT-TV-*` is not part of this task.
 *
 *   2. TIER 3 IS UNREPRESENTABLE AS A PASS. Not "validated against" — unrepresentable.
 *      `checks` holds Tier 1 and 2 only; Tier 3 becomes `verificationDebt`, which has no
 *      `result` field and whose `status` the plugin only ever writes as `pending`. This is
 *      the structural form of `VERIFY-2`: automated evidence can never be presented as
 *      proof that VoiceOver or TalkBack succeeded.
 *
 *   3. LEGACY RECORDS READ `notRecorded`. A record written before SHARED-014 knows nothing
 *      about accessibility. Collapsing that into `notApplicable` (a positive decision) or
 *      into a pass would make silence look like clearance.
 *
 *   4. OWNERSHIP. Shared owns WHAT, platform standards own HOW, and the tier vocabulary
 *      lives in exactly one place. Duplication is how two sources of truth start to disagree.
 *
 * The behavioural groups drive the real helper against a temp directory — they assert what
 * the writer *does*, not what a document says it does. The document groups assert the prose
 * that binds Claude, which is executable by nobody and therefore protected by nothing else.
 *
 * OFFLINE. Reads this repository's own markdown and writes only under a temp directory.
 *
 * No external test framework. Run with:
 *   node --no-warnings scripts/accessibility-contract.test.ts
 * or through the aggregator:
 *   node scripts/check.ts --only accessibility-contract
 */

import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import {
  writeTaskState,
  readTaskState,
  accessibilityProblem,
  verificationSatisfied,
  type WritePayload,
} from "./task-state.ts";

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

const SHARED = read("standards/shared/accessibility.md");
const VERIFICATION = read("standards/shared/verification.md");
const ANDROID = read("standards/android/compose-xml-standards.md");
const RN = read("standards/react-native/rn-coding-standards.md");
const IMPL = read("commands/implement-task.md");
const QA_CMD = read("commands/create-dev-qa-notes.md");
const QA_STD = read("standards/shared/qa-handoff.md");
const QA_TPL = read("templates/qa-handoff-template.md");

// =========================================================================
// 1. The shared taxonomy — exactly the approved 30 rules, each defined once
// =========================================================================
{
  const EXPECTED: Record<string, number> = {
    "A11Y-ROLES": 7,
    "A11Y-TOUCH": 2,
    "A11Y-FONT": 3,
    "A11Y-CONTRAST": 2,
    "A11Y-FOCUS": 4,
    "A11Y-COLLECTION": 6,
    "A11Y-SR": 5,
    "A11Y-MOTION": 1,
  };
  const defined = [...SHARED.matchAll(/^- `(A11Y-[A-Z]+-\d+)`/gm)].map((m) => m[1]);

  check("1 shared defines exactly 30 accessibility rules", defined.length === 30, String(defined.length));
  check("1 no shared rule ID is defined twice", new Set(defined).size === defined.length);

  for (const [family, count] of Object.entries(EXPECTED)) {
    const got = defined.filter((id) => id.startsWith(`${family}-`));
    check(`1 ${family}-* has exactly ${count} rules`, got.length === count, got.join(", "));
    // Contiguous 1..n — a gap means a rule was deleted without renumbering.
    const nums = got.map((id) => Number(id.slice(family.length + 1))).sort((a, b) => a - b);
    check(`1 ${family}-* is numbered 1..${count} with no gap`,
      nums.every((n, i) => n === i + 1), nums.join(","));
  }

  // The rules the design review rejected must not come back.
  check("1 the merged/rejected A11Y-FOCUS-5 was not reintroduced", !/`A11Y-FOCUS-5`/.test(SHARED));
  check("1 the merged/rejected A11Y-COLLECTION-7 does not exist", !/`A11Y-COLLECTION-7`/.test(SHARED));
  check("1 A11Y-VERIFY-* was relocated out of the accessibility standard", !/`A11Y-VERIFY-/.test(SHARED));
}

// =========================================================================
// 2. Behaviour coverage — every area the contract was required to reach
// =========================================================================
{
  const f = flat(SHARED);
  const COVERAGE: Array<[string, RegExp]> = [
    ["traversal/reading order", /traversal order follows the visual reading order/i],
    ["focus placement after navigation", /focus is placed deliberately/i],
    ["screen-change announcement", /screen change is announced/i],
    ["modal focus entry", /focus moves \*\*into\*\* the surface/i],
    ["modal focus restoration", /restored to the control that invoked it/i],
    ["focus never dropped after re-render", /Focus is never dropped to nothing/i],
    ["hidden/off-screen not exposed", /present in the hierarchy but not currently perceivable/i],
    ["dynamic announcements", /announced to assistive tech via a live-region/i],
    ["announcement flooding", /do not flood/i],
    ["grouping without swallowing actions", /Grouping preserves independently actionable children/i],
    ["lists and grids", /Grids expose row and column position/i],
    ["position announcement 2 of 5", /2 of 5/],
    ["looping carousels", /looping or infinite collection exposes finite, non-repeating/i],
    ["partially visible hint item", /partially visible item shown as a visual affordance/i],
    ["focus scrolls item fully into view", /scrolls it \*\*fully\*\* into view/i],
    ["auto-advance with screen reader", /Auto-advancing content is \*\*suspended while a screen reader is active/i],
    ["recycled-cell phantom nodes", /duplicate or phantom nodes/i],
    ["scrollable containers", /Scrollable containers expose their scrollability/i],
    ["nested scroll not trapping", /do not trap traversal/i],
    ["timed content", /disappears on a timer/i],
    ["error association", /programmatically associated with the field it describes/i],
    ["reduced motion", /reduced-motion settings are honoured/i],
    ["contrast ratios", /4\.5:1 for body text/],
    ["colour alone", /never carried by colour alone/i],
  ];
  for (const [label, re] of COVERAGE) {
    check(`2 shared covers ${label}`, re.test(f));
  }
}

// =========================================================================
// 3. Verification standard owns the tier vocabulary — and owns it alone
// =========================================================================
{
  for (const id of ["VERIFY-1", "VERIFY-2", "VERIFY-3"]) {
    check(`3 ${id} is defined in the shared verification standard`,
      new RegExp(`^- \`${id}\``, "m").test(VERIFICATION));
  }
  const v = flat(VERIFICATION);
  check("3 Tier 1 is defined there", /\*\*Tier 1 — mechanical\.\*\*/.test(v));
  check("3 Tier 2 is defined there", /\*\*Tier 2 — human-approved baseline\.\*\*/.test(v));
  check("3 Tier 3 is defined there", /\*\*Tier 3 — outside the plugin's reach\.\*\*/.test(v));
  check("3 Tier 3 is never recorded as passed", /Tier 3 is \*\*never recorded as passed/.test(v));
  check("3 VERIFY-2 forbids satisfying manual rules with Tier 1/2 evidence",
    /never satisfied by Tier 1 or Tier 2 evidence/.test(v));
  check("3 debt does not block completion",
    /Outstanding verification debt does not block completion/.test(v));
  check("3 the mechanism is domain-neutral, not accessibility-specific",
    /They are domain-neutral/.test(v));
  check("3 presence-is-not-meaning is stated", /Presence is not meaning/.test(v));

  // Owned in ONE place: no platform skill may redefine the tiers.
  for (const rel of [
    "skills/ios-feature-implementation/SKILL.md",
    "skills/android-feature-implementation/SKILL.md",
    "skills/rn-feature-implementation/SKILL.md",
  ]) {
    const s = read(rel);
    check(`3 ${rel} does not redefine the tier vocabulary`,
      !/\*\*Tier 1 — mechanical\.\*\*/.test(s) && !/\*\*Tier 3 — outside the plugin's reach\.\*\*/.test(s));
    check(`3 ${rel} points at the shared verification standard`,
      /standards\/shared\/verification\.md/.test(s));
  }
  check("3 the accessibility standard defers the tier vocabulary rather than restating it",
    /standards\/shared\/verification\.md`?, which owns the Tier 1 \/ Tier 2 \/ Tier 3 vocabulary/.test(flat(SHARED)));
}

// =========================================================================
// 4. Platform HOW rules — owned by the right file, unique, correctly scoped
// =========================================================================
{
  const and = [...ANDROID.matchAll(/^- `(AND-UI-A11Y-\d+)`/gm)].map((m) => m[1]);
  check("4 Android defines 10 AND-UI-A11Y rules", and.length === 10, String(and.length));
  check("4 Android A11Y IDs are unique", new Set(and).size === and.length);
  check("4 AND-UI-A11Y-* is defined only in compose-xml-standards.md",
    !/`AND-UI-A11Y-\d+`/.test(read("standards/android/android-architecture.md")));

  const rn = [...RN.matchAll(/^- `(RN-A11Y-\d+)`/gm)].map((m) => m[1]);
  check("4 RN defines 11 RN-A11Y rules", rn.length === 11, String(rn.length));
  check("4 RN A11Y IDs are unique", new Set(rn).size === rn.length);

  // Grounded in the real API surface — these were verified against the official docs,
  // including two traps: several props are single-platform, and setAccessibilityFocus
  // is deprecated in favour of sendAccessibilityEvent.
  check("4 RN records the iOS-only/Android-only hiding pair",
    /accessibilityElementsHidden.*iOS-only.*importantForAccessibility="no-hide-descendants".*Android-only/s.test(RN));
  check("4 RN does not recommend the deprecated setAccessibilityFocus",
    /`AccessibilityInfo.setAccessibilityFocus` is deprecated/.test(RN));
  check("4 Android cites the real Compose traversal APIs",
    /isTraversalGroup/.test(ANDROID) && /traversalIndex/.test(ANDROID));
  check("4 Android cites the real collection semantics APIs",
    /collectionInfo/.test(ANDROID) && /collectionItemInfo/.test(ANDROID));
  check("4 Android states the 48dp minimum target", /48dp/.test(ANDROID));

  // Ownership: platform standards add HOW, they do not restate the shared requirement.
  check("4 Android declares it does not restate the shared requirement",
    /does not restate/.test(flat(ANDROID)));
  check("4 RN declares it does not restate the shared requirement",
    /does not restate/.test(flat(RN)));
  check("4 iOS rules are unchanged at three",
    [...read("standards/ios/swiftui-uikit-standards.md").matchAll(/^- `(IOS-UI-A11Y-\d+)`/gm)].length === 3);
}

// =========================================================================
// 5. THE TV BOUNDARY — mobile-only, explicitly, in prose and in behaviour
// =========================================================================
{
  const f = flat(IMPL);
  check("5 implement-task decides applicability from the confirmed context",
    /## 5b\. Accessibility applicability/.test(IMPL));
  check("5 tv skips the mobile accessibility flow explicitly",
    /`device_type: tv` → skip this flow, explicitly/.test(f));
  check("5 tv cites no A11Y rules", /Cite \*\*no\*\* `A11Y-\*` rules/.test(f));
  check("5 tv does not cite REACT-TV-* either", /Do \*\*not\*\* cite\s*`REACT-TV-\*` in the accessibility block/.test(f));
  check("5 a silent skip is named as the failure mode",
    /A silent skip is the failure mode this rule exists to prevent/.test(f));
  check("5 device_type is never re-detected here", /never re-detect it here, and never default it/.test(f));
  check("5 non-UI is not equated with not-applicable by reflex",
    /Do not equate "non-UI" with "not applicable" by reflex/.test(f));
  check("5 accessibility-relevant foundations are enumerated",
    /shared UI primitives, design tokens, theming, navigation and focus infrastructure/.test(f));

  // SHARED-014 must not have introduced TV accessibility obligations. The pre-existing
  // TV carve-out inside A11Y-TOUCH-1/2 is deliberately preserved and is NOT in scope here
  // — so this checks the families SHARED-014 actually authored, not the whole document.
  // Asserting "no TV word anywhere" would fail on text this task was told to leave alone.
  {
    // Group each rule with its own indented sub-bullets, then keep only the rules
    // SHARED-014 authored. A flat line filter would sweep in A11Y-TOUCH-1's sub-bullets,
    // which legitimately carry the preserved TV carve-out.
    const NEW_RULE = /^- `A11Y-(FOCUS|COLLECTION|CONTRAST|MOTION)-\d+`|^- `A11Y-(ROLES-[67]|SR-[45])`/;
    const lines = SHARED.split("\n");
    const owned: string[] = [];
    let inNew = false;
    for (const l of lines) {
      if (/^- `A11Y-/.test(l)) inNew = NEW_RULE.test(l);
      else if (/^\S/.test(l) && l.trim() !== "") inNew = false;
      if (inNew) owned.push(l);
    }
    check("5 the new-family scan actually found the new rules", owned.length > 20, String(owned.length));
    const tvLines = owned.filter((l) => /tvOS|Android TV|Apple TV|Smart TV/i.test(l));
    check("5 the families SHARED-014 authored carry no TV obligations",
      tvLines.length === 0, tvLines.join(" | "));
    check("5 no REACT-TV-* rule is cited by the accessibility standard",
      !/REACT-TV-/.test(SHARED));
  }
  check("5 RN standards still carry no TV markers",
    !/\btvos\b|Platform\.isTV|android tv|apple tv/i.test(RN));
}

// =========================================================================
// 6. BEHAVIOUR — the writer enforces the contract, against the real helper
// =========================================================================
{
  const tmp = mkdtempSync(join(tmpdir(), "a11y-contract-"));
  const feature = "checkout";
  const breakdown = join(tmp, "breakdown.md");
  mkdirSync(join(tmp, ".git"), { recursive: true });
  writeFileSync(breakdown, "| T1 | do a thing | android | mobile |\n");

  const basePayload = (): WritePayload => ({
    platform: "android",
    filesChanged: ["a.kt"],
    standardIds: ["AND-UI-COMPOSE-1"],
    validation: [{ command: "./gradlew test", result: "pass" }],
    acceptanceCriteria: [{ criterion: "it works", met: true }],
  });

  const A11Y_OK = {
    applicable: true,
    reason: null,
    deviceType: "mobile",
    standardIds: ["A11Y-ROLES-1", "AND-UI-A11Y-1"],
    checks: [{ ruleId: "A11Y-ROLES-1", tier: 1 as const, result: "pass" as const, evidence: "lint" }],
  };

  const DEBT = {
    domain: "accessibility",
    ruleId: "A11Y-SR-1",
    requiredVerification: "TalkBack walkthrough of the checkout flow",
    whyNotAutomatable: "TalkBack cannot be driven headlessly",
    owner: "qa",
    status: "pending" as const,
  };

  // -- 6a. Mobile UI task completes with passing checks AND outstanding debt --
  {
    const r = writeTaskState(tmp, feature, "T1", "complete",
      { ...basePayload(), accessibility: A11Y_OK, verificationDebt: [DEBT] }, breakdown);
    check("6a a mobile UI task with passing checks and pending debt completes",
      r.status === "written", `${r.status}: ${r.summary}`);

    const back = readTaskState(tmp, feature, breakdown);
    const v = back.tasks["T1"];
    check("6a the record reads accessibilityStatus=applicable", v?.accessibilityStatus === "applicable",
      String(v?.accessibilityStatus));
    check("6a verification debt survives the round trip", v?.verificationDebt.length === 1);
    check("6a debt carries every field QA needs",
      v?.verificationDebt[0]?.ruleId === "A11Y-SR-1" &&
      v?.verificationDebt[0]?.requiredVerification.length > 0 &&
      v?.verificationDebt[0]?.whyNotAutomatable.length > 0 &&
      v?.verificationDebt[0]?.owner === "qa");
    check("6a pending debt does not defeat deterministic proof", v?.deterministicProof === true);
  }

  // -- 6b. A FAILING Tier 1 check blocks completion --
  {
    const failing = { ...A11Y_OK, checks: [{ ruleId: "A11Y-ROLES-1", tier: 1 as const, result: "fail" as const }] };
    check("6b a failing Tier 1 check makes verification unsatisfied",
      verificationSatisfied({ ...basePayload(), accessibility: failing }) === false);
    const r = writeTaskState(tmp, feature, "T2", "complete",
      { ...basePayload(), accessibility: failing }, breakdown);
    check("6b the writer refuses complete on a failing accessibility check",
      r.status === "refused" && r.reason === "complete-without-verification", `${r.status}/${r.reason}`);
  }

  // -- 6c. Tier 3 can never be recorded as a passed check --
  {
    const tier3 = { ...A11Y_OK, checks: [{ ruleId: "A11Y-SR-2", tier: 3 as unknown as 1, result: "pass" as const }] };
    const problem = accessibilityProblem({ accessibility: tier3 });
    check("6c a Tier 3 check is rejected outright", problem !== null && /Tier 1 and Tier 2/.test(problem), String(problem));
    const r = writeTaskState(tmp, feature, "T3", "complete", { ...basePayload(), accessibility: tier3 }, breakdown);
    check("6c the writer refuses a Tier 3 check in any state",
      r.status === "refused" && r.reason === "invalid-accessibility", `${r.status}/${r.reason}`);
    // ...and refuses it even for a non-terminal state: a malformed record is malformed.
    const r2 = writeTaskState(tmp, feature, "T3", "in-progress", { accessibility: tier3 }, breakdown);
    check("6c a Tier 3 check is refused for in-progress too", r2.status === "refused");
  }

  // -- 6d. VERIFY-2: a manual-only rule cannot be satisfied mechanically --
  {
    const sr1 = { ...A11Y_OK, checks: [{ ruleId: "A11Y-SR-1", tier: 1 as const, result: "pass" as const }] };
    const problem = accessibilityProblem({ accessibility: sr1 });
    check("6d A11Y-SR-1 cannot be recorded as a Tier 1 pass",
      problem !== null && /VERIFY-2/.test(problem), String(problem));
    const r = writeTaskState(tmp, feature, "T4", "complete", { ...basePayload(), accessibility: sr1 }, breakdown);
    check("6d the writer refuses automated evidence as screen-reader proof", r.status === "refused");
  }

  // -- 6e. The plugin can never record debt as discharged --
  {
    const discharged = [{ ...DEBT, status: "verified" as unknown as "pending" }];
    const problem = accessibilityProblem({ verificationDebt: discharged });
    check("6e debt status other than pending is refused",
      problem !== null && /may only be written as "pending"/.test(problem), String(problem));
    const incomplete = [{ ...DEBT, whyNotAutomatable: "" }];
    check("6e debt missing a required field is refused",
      accessibilityProblem({ verificationDebt: incomplete }) !== null);
  }

  // -- 6f. TV: explicit skip, and citing mobile rules anyway is refused --
  {
    const tvSkip = {
      applicable: false,
      reason: "device_type: tv — SHARED-014 is mobile-only; TV accessibility is owned by the TV workstreams",
      deviceType: "tv",
      standardIds: [],
      checks: [],
    };
    const r = writeTaskState(tmp, feature, "T5", "complete",
      { ...basePayload(), accessibility: tvSkip }, breakdown);
    check("6f a tv task completes with an explicit recorded skip", r.status === "written", r.summary);
    const back = readTaskState(tmp, feature, breakdown);
    check("6f the tv skip reads notApplicable, not notRecorded",
      back.tasks["T5"]?.accessibilityStatus === "notApplicable");
    check("6f the tv skip carries its reason",
      (back.tasks["T5"]?.accessibility?.reason ?? "").includes("tv"));

    const tvCiting = { ...tvSkip, standardIds: ["A11Y-TOUCH-1"] };
    check("6f a tv task citing mobile A11Y rules is refused",
      accessibilityProblem({ accessibility: tvCiting }) !== null);
    const r2 = writeTaskState(tmp, feature, "T6", "complete",
      { ...basePayload(), accessibility: tvCiting }, breakdown);
    check("6f the writer refuses mobile rules on a skipped tv task",
      r2.status === "refused" && r2.reason === "invalid-accessibility", `${r2.status}/${r2.reason}`);
  }

  // -- 6g. applicable:false requires a reason --
  {
    const noReason = { applicable: false, reason: null, deviceType: "mobile", standardIds: [], checks: [] };
    const problem = accessibilityProblem({ accessibility: noReason });
    check("6g applicable=false without a reason is refused",
      problem !== null && /requires a non-empty reason/.test(problem), String(problem));
  }

  // -- 6h. applicable:true with nothing cited/recorded cannot complete --
  {
    const empty = { applicable: true, reason: null, deviceType: "mobile", standardIds: [], checks: [] };
    check("6h applicable=true with no cited rules cannot complete",
      verificationSatisfied({ ...basePayload(), accessibility: empty }) === false);
  }

  // -- 6i. LEGACY: a record with no block reads notRecorded --
  {
    const r = writeTaskState(tmp, feature, "T7", "complete", basePayload(), breakdown);
    check("6i a task with no accessibility block still completes (additive field)",
      r.status === "written", r.summary);
    const back = readTaskState(tmp, feature, breakdown);
    const v = back.tasks["T7"];
    check("6i an absent block reads notRecorded", v?.accessibilityStatus === "notRecorded",
      String(v?.accessibilityStatus));
    check("6i notRecorded is not notApplicable", v?.accessibilityStatus !== "notApplicable");
    check("6i an absent block exposes no accessibility object", v?.accessibility === null);
    check("6i an absent block yields no debt", v?.verificationDebt.length === 0);
  }

  // -- 6j. A genuinely legacy file on disk (written before the field existed) --
  {
    const legacyDir = mkdtempSync(join(tmpdir(), "a11y-legacy-"));
    mkdirSync(join(legacyDir, ".claude"), { recursive: true });
    const r = writeTaskState(legacyDir, feature, "T1", "complete", basePayload(), breakdown);
    const raw = JSON.parse(readFileSync(r.path, "utf-8"));
    check("6j the writer omits the fields entirely when not supplied",
      !("accessibility" in raw.tasks.T1) && !("verificationDebt" in raw.tasks.T1));
    const back = readTaskState(legacyDir, feature, breakdown);
    check("6j reading a file without the fields yields notRecorded",
      back.tasks["T1"]?.accessibilityStatus === "notRecorded");
    rmSync(legacyDir, { recursive: true, force: true });
  }

  rmSync(tmp, { recursive: true, force: true });
}

// =========================================================================
// 7. The QA flow consumes persisted evidence rather than reconstructing it
// =========================================================================
{
  const f = flat(QA_CMD);
  check("7 create-dev-qa-notes reads the accessibility dimension from the store",
    /Read the accessibility dimension from the same records — never reconstruct it/.test(f));
  for (const status of ["applicable", "notApplicable", "notRecorded"]) {
    check(`7 the QA command handles accessibilityStatus: ${status}`,
      new RegExp(`accessibilityStatus: "${status}"`).test(f));
  }
  check("7 notRecorded is never reported as not applicable or as a pass",
    /never reported as "not applicable" and never as a pass/.test(f));
  check("7 every debt field is carried into the handoff",
    /`domain`, `ruleId`, `requiredVerification`, `whyNotAutomatable` and `owner`/.test(f));
  check("7 the QA command forbids inferring a screen-reader pass",
    /do not infer a VoiceOver or TalkBack pass/.test(f));

  check("7 the template has a pending-verification section",
    /^## Pending Verification \(owed to QA\)$/m.test(QA_TPL));
  check("7 the template sources it from task-state",
    /from task-state/.test(flat(QA_TPL)));
  check("7 QA-A11Y-2 requires reading recorded evidence",
    /^- `QA-A11Y-2`/m.test(QA_STD) && /never reconstructed/.test(flat(QA_STD)));
  check("7 QA-A11Y-3 requires listing debt with its owner",
    /^- `QA-A11Y-3`/m.test(QA_STD) && /VERIFY-3/.test(QA_STD));
}

// =========================================================================
// 8. Completion semantics are stated where Claude will read them
// =========================================================================
{
  const f = flat(IMPL);
  check("8 the accessibility outcome is a required part of the completion report",
    /the \*\*accessibility outcome\*\* decided in step 5b/.test(f));
  check("8 Tier 1/2 go in checks; a failing check blocks complete",
    /A \*\*failing\*\* Tier 1\/2 check blocks `complete`/.test(f));
  check("8 Tier 3 becomes verification debt, never a check",
    /are never recorded as checks/.test(f));
  check("8 outstanding debt does not block complete",
    /\*\*Outstanding debt does not block `complete`\*\*/.test(f));
  check("8 blocking is explained as tying completion to device availability",
    /tie completion to device availability/.test(f));
  check("8 automated evidence is never screen-reader proof",
    /Never present automated evidence as screen-reader proof/.test(f));
  check("8 the payload shape is shown with domain accessibility",
    /"domain": "accessibility"/.test(IMPL) && /"status": "pending"/.test(IMPL));
  check("8 the model stays automation-framework agnostic",
    /Do \*\*not\*\* assume or introduce a particular automation framework/.test(f));
  check("8 the contract documents the additive fields",
    /## Accessibility and verification debt \(SHARED-014\)/.test(read("docs/task-state-contract.md")));
}

// =========================================================================
// 9. This suite stays offline
// =========================================================================
{
  const src = read("scripts/accessibility-contract.test.ts");
  for (const [label, needle] of [
    ["network fetch", `fet${"ch("}`],
    ["child process module", `child${"_process"}`],
    ["process spawn", `spawn${"Sync"}`],
  ] as Array<[string, string]>) {
    check(`9 stays offline — no ${label}`, !src.includes(needle));
  }
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
