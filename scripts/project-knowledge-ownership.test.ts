/**
 * project-knowledge-ownership.test.ts
 *
 * Pins the Project Knowledge ownership cleanup: the Project Inspector owns
 * repository-specific knowledge, this plugin consumes trusted knowledge first, live
 * discovery is fallback or verification only, and current source stays authoritative.
 *
 * What it proves:
 *   1.  Trusted Project Knowledge prevents duplicate planning discovery.
 *   2.  verifyOnUse triggers targeted verification only.
 *   3.  deriveLive / missing knowledge still performs the full fallback discovery.
 *   4.  React Native ARCH-* conformance runs only when the platform is react-native.
 *   5.  iOS, Android and React never inherit React Native conformance (ENG-001).
 *   6.  Trusted platform knowledge suppresses unnecessary existence scans.
 *   7.  TV tasks no longer skip the shared accessibility standard.
 *   8.  TV accessibility debt stays separated (QA vs developer) — see also
 *       accessibility-contract.test.ts §6f, which drives the real helper.
 *   9.  The platform / device_type confirmation gate is unchanged.
 *   10. Routing, Developer Testing, resume and review behaviour are unchanged.
 *   +   Outdated "no device information" wording, obsolete TV-blocking wording and
 *       volatile platform claims presented as permanent facts are gone.
 *
 * These are document assertions: the planning, analysis and implementation methodology is
 * prose that only Claude executes, so the prose is what binds it.
 *
 *   node --no-warnings scripts/project-knowledge-ownership.test.ts
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";

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

/** A lane's §3 introduction: from its `## 3.` heading to the first numbered dimension. */
function section3Intro(text: string): string {
  const from = text.search(/^## 3\. /m);
  if (from < 0) return "";
  const rest = text.slice(from);
  const to = rest.search(/^1\. \*\*/m);
  return to < 0 ? "" : rest.slice(0, to);
}

/** The numbered checklist of a lane's §3: every `N. **…**` line up to the next heading. */
function section3Checklist(text: string): number {
  const from = text.search(/^## 3\. /m);
  const rest = text.slice(from);
  const end = rest.slice(1).search(/^## /m);
  const body = end < 0 ? rest : rest.slice(0, end + 1);
  return (body.match(/^\d+\. \*\*/gm) ?? []).length;
}

const LANES: Record<string, number> = {
  "rn-dev-planning": 14,
  "ios-dev-planning": 18,
  "android-dev-planning": 18,
  "react-dev-planning": 16,
};

/* ── 1–3. planning discovery is knowledge-first, fallback-complete ────── */
for (const [lane, dims] of Object.entries(LANES)) {
  const text = read(`skills/${lane}/SKILL.md`);
  const intro = flat(section3Intro(text));
  check(`1 ${lane}: §3 introduction located`, intro.length > 200, `${intro.length}`);
  check(`1 ${lane}: trusted Project Knowledge is used, not re-inspected`,
    /trusted/i.test(intro) && /(cite|use) it/i.test(intro) && /(do not|never) re-?(inspect|derive|discover)/i.test(intro), intro.slice(0, 200));
  check(`2 ${lane}: verifyOnUse verifies only the affected facts`,
    /verifyOnUse|verify on use/i.test(intro) && /only (the|those) (affected )?facts?/i.test(intro));
  check(`3 ${lane}: deriveLive or missing knowledge runs the full checklist`,
    /deriveLive|derive live/i.test(intro) && /(absent|missing|unavailable)/i.test(intro) && /checklist/i.test(intro));
  check(`3 ${lane}: feature-specific detail outside Project Knowledge is inspected live`,
    /feature-specific/i.test(intro) && /(inspect|read)[^.]{0,30}(live|source)/i.test(intro));
  check(`3 ${lane}: the discovery checklist is intact (${dims} dimensions)`, section3Checklist(text) === dims, `${section3Checklist(text)}`);
  check(`1 ${lane}: no unconditional full sweep remains`,
    !/complete sweep is required at Design/i.test(text) && !/this sweep is (this lane's|this skill's) own responsibility/i.test(text));
  check(`1 ${lane}: current source stays authoritative`, /current (source|code)[^.]{0,40}(wins|authoritative)/i.test(intro));
}

/* ── 4–5. ENG-001: RN conformance is React Native's alone ─────────────── */
{
  const mra = read("skills/mobile-repo-analysis/SKILL.md");
  const m = flat(mra);
  check("4 mobile-repo-analysis no longer runs RN conformance unconditionally",
    !/Always run the standards-conformance comparison/.test(m) && !/regardless of what was reused\. `patterns\.md`/.test(m));
  check("4 mobile-repo-analysis runs RN conformance only when the platform is react-native",
    /only when the confirmed platform is `react-native`/.test(m));
  check("5 mobile-repo-analysis cites no platform standards file", !/standards\/react-native\//.test(mra));
  check("5 mobile-repo-analysis: other platforms' conformance belongs to their own lane",
    /(iOS|Android|React)[^.]*(own|its) (planning )?lane/i.test(m) && /never (inherit|receive|get)[^.]{0,40}React Native/i.test(m));

  const ra = read("agents/repo-analyst.md");
  const r = flat(ra);
  check("4 repo-analyst keeps RN conformance fresh for React Native", /Standards conformance — always runs, never reused/.test(ra));
  check("4 repo-analyst reuses trusted structure as the conformance input",
    /`structure`[^.]{0,120}trusted[^.]{0,200}(input|read)/i.test(r) || /trusted[^.]{0,80}`structure`/i.test(r));
  const out5 = /5\. \*\*Standards Conformance\*\*[^\n]*/.exec(ra)?.[0] ?? "";
  check("5 repo-analyst output: conformance only for react-native, N/A otherwise",
    /react-native/.test(out5) && /N\/A/.test(out5) && !/the platform's `ARCH-\*` expectations/.test(out5), out5);
  check("5 repo-analyst never presents RN conformance for another platform",
    /Never (run|report|present)[^.]*React Native[^.]*conformance[^.]*(iOS|another platform|any other platform)/i.test(r));

  const af = flat(read("commands/analyze-feature.md"));
  check("4 analyze-feature: RN conformance is scoped to react-native",
    /`ARCH-LAYERS-\*`\/`ARCH-FOLDERS-\*` standards-conformance comparison[^.]*only (for|when)[^.]*react-native/i.test(af));

  for (const lane of ["ios-dev-planning", "android-dev-planning", "react-dev-planning"]) {
    const s = flat(read(`skills/${lane}/SKILL.md`));
    check(`5 ${lane}: no longer works around an RN verdict it receives`,
      !/Its Standards Conformance verdict is computed against React Native/.test(s) &&
        !/Its Standards Conformance section compares folder structure against React Native/.test(s));
  }

  const ci = read("scripts/context-isolation-contract.test.ts");
  check("5 the known-defect allowlist entry is gone", !/"skills\/mobile-repo-analysis\/SKILL\.md": \{/.test(ci));
}

/* ── 6. platform existence checks are gated by knowledge state ────────── */
{
  const ra = read("agents/repo-analyst.md");
  for (const p of ["iOS", "Android", "React \\(web\\)"]) {
    const line = new RegExp(`- \\*\\*${p}\\*\\*: lightweight existence checks only[^\\n]*`).exec(ra)?.[0] ?? "";
    check(`6 repo-analyst ${p.replace(/\\/g, "")}: trusted knowledge answers the check`, /trusted/i.test(line) && /(skip|not re-?run|instead of)/i.test(line), line.slice(0, 160));
    check(`6 repo-analyst ${p.replace(/\\/g, "")}: verifyOnUse verifies, deriveLive runs the check`,
      /verifyOnUse|verify on use/i.test(line) && /deriveLive|derive live/i.test(line), line.slice(0, 160));
  }
  const af = flat(read("commands/analyze-feature.md"));
  check("6 analyze-feature: existence checks run only where knowledge does not answer them",
    /existence checks[^.]*only (when|where)[^.]*(knowledge|trusted)/i.test(af) || /existence checks[^.]*(trusted|deriveLive)/i.test(af));
}

/* ── 7. TV tasks apply the shared accessibility standard ──────────────── */
{
  const impl = read("commands/implement-task.md");
  const s5b = flat(impl.slice(impl.indexOf("## 5b."), impl.indexOf("## 6.")));
  check("7 5b no longer skips the flow for tv", !/skip this flow/i.test(s5b) && !/a mobile standard/i.test(s5b));
  check("7 5b: accessibility is never skipped merely because the task is tv", /never[^.]{0,40}(skip|not applicable)[^.]{0,60}(merely|only|simply) because[^.]{0,40}`?device_type`?/i.test(s5b));
  check("7 5b: shared rules apply through their TV clauses", /TV clause/i.test(s5b) && /`A11Y-TOUCH-1`/.test(s5b));
  check("7 5b: focus-driven accessibility stays applicable", /`A11Y-FOCUS-\*`/.test(s5b));
  check("7 5b: React TV may add applicable REACT-TV-* rules", /`REACT-TV-\*`/.test(s5b) && !/Do \*\*not\*\* cite\s*`REACT-TV-\*`/.test(s5b));
  check("8 5b: TV screen-reader verification is Tier 3 debt owned by QA", /Tier 3/.test(s5b) && /`owner: "qa"`|owner `qa`|owned by QA/i.test(s5b));
  check("7 5b: non-relevant work is still not-applicable with a reason", /Genuinely not accessibility-relevant/.test(s5b));
}

/* ── outdated Project Knowledge wording ───────────────────────────────── */
{
  for (const rel of ["agents/repo-analyst.md", "skills/mobile-repo-analysis/SKILL.md", "skills/repo-knowledge-consumer/SKILL.md", "README.md"]) {
    check(`PK ${rel}: no "carries no device information"`, !/carries no device information/i.test(read(rel)));
  }
  const ra = flat(read("agents/repo-analyst.md"));
  check("PK repo-analyst: surfaces and formFactor may exist but never supply device_type",
    /formFactor/.test(ra) && /never[^.]{0,40}(supplies|supply|resolves?)[^.]{0,20}`device_type`/i.test(ra) && /after the human/i.test(ra));
  const mra = flat(read("skills/mobile-repo-analysis/SKILL.md"));
  check("PK mobile-repo-analysis: device type is still resolved live and confirmed by the human",
    /device type/i.test(mra) && /never[^.]{0,40}(supplies|supply|resolves?)[^.]{0,20}`device_type`|never choose the platform or the `device_type`/i.test(mra));
}

/* ── obsolete TV-blocking wording ─────────────────────────────────────── */
{
  const banned: Array<[string, RegExp]> = [
    ["standards/ios/swift-standards.md", /out of scope for all five documents until task `ATV-001`/],
    ["skills/ios-dev-planning/SKILL.md", /The standards carry no tvOS rules yet, so this skill's TV responsibility is discovery and non-regression/],
    ["skills/ios-dev-planning/SKILL.md", /`ATV-002` owns branching this skill deeply/],
    ["skills/ios-code-review/SKILL.md", /repository knowledge cannot supply one/],
    ["skills/ios-code-review/SKILL.md", /`ATV-002` owns branching these skills/],
    ["skills/android-code-review/SKILL.md", /that is a separate, later scope/],
    ["skills/android-dev-planning/SKILL.md", /that is a separate, later scope/],
    ["skills/ios-feature-implementation/SKILL.md", /roots stay reserved until `ATV-001`/],
    ["README.md", /`REACT-003` for Smart TV/],
  ];
  for (const [rel, re] of banned) check(`TV ${rel}: obsolete blocking wording removed (${re.source.slice(0, 40)}…)`, !re.test(read(rel)));
  for (const rel of ["skills/ios-dev-planning/SKILL.md", "skills/android-dev-planning/SKILL.md", "standards/ios/swift-standards.md"]) {
    const s = flat(read(rel));
    check(`TV ${rel}: repository TV facts come from Project Knowledge`, /Project Knowledge/.test(s));
    check(`TV ${rel}: stable TV rules are named as not yet authored, not as a blocker`, /stable[^.]{0,60}TV rules/i.test(s));
  }
  check("TV iOS lanes still never cite an unauthored TV rule ID",
    /Never cite a TV ID/.test(read("skills/ios-dev-planning/SKILL.md")) && /never cite a TV/i.test(read("skills/ios-feature-implementation/SKILL.md")));
  check("TV android-code-review still never files against a nonexistent TV rule",
    /Never file a TV finding against a rule that does not exist/.test(read("skills/android-code-review/SKILL.md")));
  for (const rel of ["skills/ios-code-review/SKILL.md", "skills/android-code-review/SKILL.md"]) {
    check(`TV ${rel}: TV scope may be corroborated by surface attribution, never as device_type`,
      /surface/i.test(read(rel)) && /formFactor/.test(read(rel)) && /never[^.]{0,40}`device_type`/i.test(flat(read(rel))));
  }
}

/* ── volatile platform claims are verified, not asserted ─────────────── */
{
  const iosPlan = flat(read("skills/ios-dev-planning/SKILL.md"));
  check("V the tvOS web-view statement is no longer a permanent fact", !/there is no web view on tvOS/.test(iosPlan));
  check("V the capability rule now says to verify against the target SDK", /verif[^.]{0,40}target SDK/i.test(iosPlan));
  const review = read("skills/ios-code-review/SKILL.md");
  const metric = /\| Field-observed regression \|[^\n]*/.exec(review)?.[0] ?? "";
  check("V the MetricKit platform list is marked for re-verification", /re-verify|verify (its )?availability/i.test(metric), metric.slice(0, 160));
  const impl = read("skills/ios-feature-implementation/SKILL.md");
  const dated = impl.split("\n").filter((l) => /Xcode 26\.0\.1|Swift 6\.2/.test(l));
  check("V dated toolchain observations exist and are all paired with re-verification", dated.length > 0 &&
    dated.every((l) => /re-verify|re-check|Re-check/.test(l)), dated.map((l) => l.slice(0, 80)).join(" | "));
}

/* ── 9–10. confirmation, routing, Developer Testing, resume, review ───── */
{
  const af = read("commands/analyze-feature.md");
  check("9 the confirmation question is unchanged", /Is the current feature intended for this context\?/.test(af));
  check("9 exactly one platform and one device type are still required",
    /exactly one\*\* platform[\s\S]{0,120}exactly one\*\* device type/.test(af));
  check("9 no default device type", /never default it/.test(read("commands/implement-task.md")));
  const impl = read("commands/implement-task.md");
  check("10 routing still comes from the task row", /Read the `platform` value from the selected task row/.test(impl));
  check("10 Developer Testing is still recorded", /"developerTesting"/.test(impl) && /complete-without-developer-testing/.test(impl));
  check("10 resume is still deterministic", /task-state\.ts" resume/.test(impl));
  check("10 review still resolves Project Knowledge for changed files", /repo-knowledge-consumer/.test(read("commands/review-code.md")));
}

if (failures > 0) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall project-knowledge ownership checks passed");
