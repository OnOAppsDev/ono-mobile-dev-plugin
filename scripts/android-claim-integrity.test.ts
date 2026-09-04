/**
 * android-claim-integrity.test.ts
 *
 * Three parts, all necessary:
 *
 *   1. THE LIVE ANDROID LANE must be clean. Every count, ID-root list, path:line
 *      citation, stated list size, negative-existence claim, quotation, cited ID,
 *      anchor, reviewer binding and section pointer in the seventeen Android files is
 *      asserted against what is actually on disk.
 *
 *   2. THE EXTRACTORS must work. Inline fixtures rather than a fixture tree, because
 *      every extractor here is a pure function over a string. Each negative case asserts
 *      an EXACT result, not "at least one": over-reporting is a bug too. The validator's
 *      own first version carried five such bugs — a bare `critical` matching
 *      "scroll-critical", an `-FEATURE-1` prose shorthand read as an ID, a `\b` that hid
 *      two threshold rules, mis-paired quotation marks, and a sentence-capitalised number
 *      word — and every one of them reported something that was not there.
 *
 *   3. DETERMINISM. Two runs agree, and the validator reads no clock, no randomness and
 *      no environment.
 *
 * No external test framework. Run with:
 *   node --no-warnings scripts/android-claim-integrity.test.ts
 * or through the aggregator:
 *   node scripts/check.ts --only android-claim-integrity
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { ghSlug } from "./reference-integrity.ts";
import {
  validate,
  declaredIds,
  rootsOf,
  blockAfter,
  numberWords,
  frontmatter,
  countClaims,
  LANE_AGENTS,
  LANE_SKILLS,
  LANE_STANDARDS,
  LANE_FILES,
  PASS_A,
  PASS_B,
  CITATIONS,
  ROOT_ROW_SKILLS,
  citationTableRows,
  line5,
  NEGATIVES,
  QUOTATIONS,
  GOVERNING,
  FOREIGN_COMMANDS,
  THRESHOLD,
  ID_REF,
  type Defect,
} from "./android-claim-integrity.ts";

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

function rules(defects: Defect[]): string {
  return defects.map((d) => `${d.rule}@${d.file}`).join(", ");
}

// ===========================================================================
// PART 1 — the live Android lane
// ===========================================================================

const live = validate(REPO_ROOT);

// --- 1. The headline: zero defects ---------------------------------------
{
  check("1 the live Android lane has zero claim-integrity defects",
    live.length === 0, rules(live));
  for (const g of ["P", "L", "C", "R", "E", "N", "Q", "I", "A", "B", "S"]) {
    const own = live.filter((d) => d.group === g);
    check(`1 group ${g} is clean`, own.length === 0, own.map((d) => d.message).join("; "));
  }
}

// --- 2. The corpus is the whole lane, not a subset ------------------------
{
  check("2 the corpus is 4 agents + 3 skills + 10 standards",
    LANE_AGENTS.length === 4 && LANE_SKILLS.length === 3 && LANE_STANDARDS.length === 10,
    `${LANE_AGENTS.length}/${LANE_SKILLS.length}/${LANE_STANDARDS.length}`);
  check("2 LANE_FILES is exactly those seventeen",
    LANE_FILES.length === 17, `${LANE_FILES.length}`);
  check("2 the two passes together are the ten standards",
    PASS_A.length === 8 && PASS_B.length === 2 &&
      new Set([...PASS_A, ...PASS_B]).size === LANE_STANDARDS.length);
  check("2 every lane file is readable from the repository root",
    LANE_FILES.every((rel) => readFileSync(join(REPO_ROOT, rel), "utf-8").length > 0));
}

// --- 3. The claim tables are populated, and pinned -------------------------
// These pins are what make L3 and the other completeness rules bite: adding a citation
// or a claim without recording it here fails the suite as well as the validator.
{
  // A tripwire, not the completeness property: L3/L5 inside validate() enforce that every
  // citation in the lane is registered and every row still cited, and assertion 1 covers
  // them. This pin exists so adding a citation without recording its phrase fails HERE too,
  // with a number in the message, rather than only inside a defect list.
  check("3 the CITATIONS table still holds all 18 registered citations",
    CITATIONS.length === 18, `${CITATIONS.length}`);
  check("3 CITATIONS rows are well formed",
    CITATIONS.every(([c, t, l, p]) =>
      LANE_FILES.includes(c) && t.includes("/") && l > 0 && p.length > 0));
  check("3 group R reads the citation section of all three lane skills",
    ROOT_ROW_SKILLS.length === 3, `${ROOT_ROW_SKILLS.length}`);
  check("3 every lane skill has a citation section with rows in it",
    ROOT_ROW_SKILLS.every((rel) =>
      citationTableRows(readFileSync(join(REPO_ROOT, rel), "utf-8")).length > 0));
  check("3 citationTableRows takes only the citation section",
    citationTableRows("## Routing\n| a | `standards/android/x.md` |\n## 8. Standards citation\n| b | `standards/android/y.md` |")
      .length === 1);
  check("3 NEGATIVES carries five inverted claims", NEGATIVES.length === 5);
  check("3 QUOTATIONS carries four attributed quotations", QUOTATIONS.length === 4);
  check("3 GOVERNING pins the two ambiguous self-count lines", GOVERNING.length === 2);
  check("3 the foreign-command carve-out names ono-project-inspector's two",
    FOREIGN_COMMANDS.has("inspect") && FOREIGN_COMMANDS.has("inspect-sync") &&
      FOREIGN_COMMANDS.size === 2);
  const claims = countClaims(REPO_ROOT);
  check("3 every count claim is recomputed", claims.length === 27, `${claims.length}`);
  check("3 no count claim hardcodes its number in the template",
    claims.every((c) => c.template.includes("{n}")));
  // Deliberately a FLOOR, not a pin. Design decision 3 says counts are recomputed so a
  // legitimate standards change does not redden the suite; hardcoding 198 here would
  // undo that. Group C already asserts the lane STATES whatever the real number is.
  const declared = LANE_STANDARDS.flatMap((rel) =>
    declaredIds(readFileSync(join(REPO_ROOT, rel), "utf-8")));
  check("3 the Android standards corpus is non-trivial", declared.length >= 150,
    `${declared.length} IDs declared`);
  check("3 no Android standards ID is declared twice",
    new Set(declared).size === declared.length,
    `${declared.length - new Set(declared).size} duplicate(s)`);
}

// ===========================================================================
// PART 2 — the extractors
// ===========================================================================

// --- 4. declaredIds: only a zero-indent bullet's FIRST inline-code span ----
{
  check("4 declaredIds takes a zero-indent bullet's first span",
    declaredIds("- `AND-KT-NULL-1` text `AND-KT-NULL-2`").join() === "AND-KT-NULL-1");
  check("4 declaredIds ignores an ID inside a table cell",
    declaredIds("| x | `AND-KT-NULL-1` |").length === 0);
  check("4 declaredIds ignores an ID in a heading",
    declaredIds("## `AND-KT-NULL-1` rules").length === 0);
  check("4 declaredIds ignores an indented bullet",
    declaredIds("  - `AND-KT-NULL-1` text").length === 0);
  check("4 declaredIds reads every line of a multi-line document",
    declaredIds("- `AND-KT-NULL-1` a\n- `AND-KT-NULL-2` b\n").length === 2);
  // `matchAll` clones the regex and never advances the source's lastIndex, so repeated
  // calls cannot drift — an assertion comparing two calls would pass even for a naive
  // implementation and prove nothing. The REAL hazard is a future rewrite to `.test()` or
  // `.exec()`, which IS stateful on a /g regex. That is pinned at the source level in
  // part 3, and demonstrated here so the reason is not lost.
  const g = new RegExp(ID_REF.source, "g");
  const sample = "`AND-KT-NULL-1` and `AND-KT-NULL-2`";
  const first = g.test(sample);
  check("4 a /g regex IS stateful under .test() — which is why matchesOf rebuilds",
    first === true && g.lastIndex !== 0);
  check("4 rootsOf strips the ordinal",
    [...rootsOf(["AND-KT-NULL-1", "AND-KT-NULL-2", "AND-DI-3"])].sort().join() ===
      "AND-DI,AND-KT-NULL");
}

// --- 5. blockAfter: the list or table that follows a lead-in ---------------
{
  check("5 blockAfter skips a table header row",
    blockAfter(["lead:", "| a | b |", "|---|---|", "| 1 | 2 |", "| 3 | 4 |"], 0).n === 2);
  check("5 blockAfter reports the table kind",
    blockAfter(["lead:", "| a | b |", "|---|---|", "| 1 | 2 |"], 0).kind === "t");
  check("5 blockAfter counts bullets",
    blockAfter(["lead:", "- a", "- b", "- c"], 0).n === 3);
  check("5 blockAfter allows one blank line between bullets",
    blockAfter(["lead:", "- a", "", "- b"], 0).n === 2);
  check("5 blockAfter stops after two blank lines",
    blockAfter(["lead:", "- a", "", "", "- b"], 0).n === 1);
  check("5 blockAfter returns nothing for prose",
    blockAfter(["lead:", "plain prose"], 0).n === 0 &&
      blockAfter(["lead:", "plain prose"], 0).kind === null);
}

// --- 6. numberWords: every number word on the line, in order ---------------
{
  check("6 numberWords finds every number word, in order",
    numberWords("Two call sites, one lane:").join() === "2,1");
  check("6 numberWords is case-insensitive", numberWords("Three cases:").join() === "3");
  check("6 numberWords ignores a word that merely contains one",
    numberWords("someone tightened it:").length === 0);
  check("6 numberWords returns nothing when there is no count",
    numberWords("Stop and report:").length === 0);
}

// --- 7. The two regexes whose earlier versions produced false defects ------
{
  // No \b before \d+: "0x1" is three word characters, so "320x180 px" has no boundary
  // before 180. The version with \b found two of the four threshold rules.
  check("7 THRESHOLD matches a WIDTHxHEIGHT px threshold",
    THRESHOLD.test("- `AND-REL-TV-BANNER-1` points at a 320x180 px xhdpi drawable"));
  check("7 THRESHOLD matches a plain unit threshold",
    THRESHOLD.test("- `AND-PERF-TV-1` stays within Android's published 280 MB total"));
  check("7 THRESHOLD ignores a rule with no magnitude",
    !THRESHOLD.test("- `AND-KT-NULL-1` no numbers here at all"));
  // The standards write `-FEATURE-1` in prose as shorthand for AND-REL-TV-FEATURE-1.
  // Without the lookbehind that reads as an undeclared ID.
  check("7 ID_REF skips the suffix shorthand",
    [...("see `-FEATURE-1` and `AND-KT-NULL-1`").matchAll(new RegExp(ID_REF.source, "g"))]
      .map((m) => m[0]).join() === "AND-KT-NULL-1");
}

// --- 8. frontmatter -------------------------------------------------------
{
  check("8 frontmatter reads the description",
    frontmatter("---\nname: x\ndescription: hello\n---\nbody")["description"] === "hello");
  check("8 frontmatter returns nothing for a file that has none",
    Object.keys(frontmatter("# Title\ntext")).length === 0);
  check("8 line5 returns the fifth line", line5("a\nb\nc\nd\ne\nf") === "e");
  check("8 line5 returns empty for a file with four lines or fewer",
    line5("a\nb\nc\nd") === "" && line5("") === "");
  check("8 frontmatter returns nothing for an unterminated block",
    Object.keys(frontmatter("---\nname: x\n")).length === 0);
}

// --- 9. The slug functions are the repository's, not a copy ---------------
// A re-implementation that strips `_` as emphasis reports 12 of the lane's 81 in-file
// links broken — every `#N-device_type-…` and `#…-device_type-tv` anchor. Pinned so a
// future edit cannot quietly swap the import for a local copy.
{
  // ghSlug takes the heading TEXT — headingSlugs strips the leading #'s first. Passing
  // the "## " prefix through yields a leading hyphen and a test that asserts a falsehood.
  check("9 ghSlug keeps the underscore in device_type",
    ghSlug("6. `device_type` handling") === "6-device_type-handling");
  check("9 ghSlug never collapses repeated hyphens",
    ghSlug("reach — what you may claim").includes("--"));
  const src = readFileSync(join(HERE, "android-claim-integrity.ts"), "utf-8");
  check("9 the validator imports headingSlugs rather than defining a slugger",
    /import \{[^}]*headingSlugs[^}]*\} from "\.\/reference-integrity\.ts"/.test(src) &&
      !/function ghSlug/.test(src) && !/function headingSlugs/.test(src));
}

// ===========================================================================
// PART 3 — determinism
// ===========================================================================

{
  const a = validate(REPO_ROOT);
  const b = validate(REPO_ROOT);
  check("10 two runs produce identical defect lists",
    JSON.stringify(a) === JSON.stringify(b));
  const src = readFileSync(join(HERE, "android-claim-integrity.ts"), "utf-8");
  check("10 the validator reads no clock", !/\bDate\b|Date\.now/.test(src));
  check("10 the validator uses no randomness", !/Math\.random/.test(src));
  check("10 the validator reads no environment", !/process\.env/.test(src));
  // The genuine stateful-regex hazard: a /g regex used with .test()/.exec() keeps its
  // lastIndex between calls. Every /g pattern in the validator goes through matchesOf.
  check("10 no module regex is used with .test() or .exec() directly",
    !/\b(NUM_RE|ID_DECL|ID_REF|CITE_FULL|CITE_BARE|PATH_ON_LINE|SLASH_CMD)\.(test|exec)\(/.test(src),
    (/\b(NUM_RE|ID_DECL|ID_REF|CITE_FULL|CITE_BARE|PATH_ON_LINE|SLASH_CMD)\.(test|exec)\(/.exec(src) ?? [""])[0]);
  // Every defect this validator can file is filed against an Android-lane file. It reads
  // other files — that is the whole point — but it never reports on another owner's work.
  const citing = [
    ...CITATIONS.map(([c]) => c), ...ROOT_ROW_SKILLS,
    ...NEGATIVES.map(([c]) => c), ...QUOTATIONS.map(([c]) => c),
    ...GOVERNING.map(([c]) => c), ...countClaims(REPO_ROOT).map((c) => c.file),
  ];
  check("10 every claim this validator checks belongs to the Android lane",
    citing.every((c) => LANE_FILES.includes(c)),
    citing.filter((c) => !LANE_FILES.includes(c)).join(", "));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
