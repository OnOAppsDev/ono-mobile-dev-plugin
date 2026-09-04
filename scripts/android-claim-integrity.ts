/**
 * android-claim-integrity.ts — the Android lane's claim validator.
 *
 *   node scripts/android-claim-integrity.ts            validate this repository, print a report
 *   node scripts/android-claim-integrity.ts <root>     validate another root (used by the tests)
 *
 * This is a developer/repository quality capability, not a runtime workflow step and not
 * a CI job. It reads no environment variable and needs no network. A repository that
 * later opts into running it automatically runs this exact command.
 *
 * Runtime: Node >= 23.6 or Bun. No external deps, no clock, no randomness and no
 * environment variable — the same tree produces the same defect list in the same order.
 *
 * Eleven groups, each answering one question about the Android lane's claims:
 *
 *   P  Does any lane file still declare itself a placeholder?
 *   L  Does every `path:line` citation still point at the sentence it relies on?
 *   C  Does every number written in the lane equal a number recomputed from disk?
 *   R  Does every citation-table row list every ID root its target file declares?
 *   E  Does every stated list size match the list that follows it?
 *   N  Is every "no X exists" claim still true, inside its own declared scope?
 *   Q  Is every quotation attributed to a repo file still verbatim?
 *   I  Does every standards ID cited in the lane exist?
 *   A  Does every in-file [text](#anchor) resolve?
 *   B  Does line 5 of each standard name the reviewer the Pass A/B split claims?
 *   S  Does every `skill §N` pointer resolve to a heading with that number?
 *
 * Four design decisions, each of which cost a false-failure iteration. Read before
 * "simplifying":
 *
 *  1. ghSlug and headingSlugs are IMPORTED from ./reference-integrity.ts, never
 *     re-implemented here. There, `\w` keeps `_`, so `device_type` survives, and
 *     whitespace maps 1:1 to `-`, never collapsed. A local copy that strips `_` as
 *     emphasis reports 12 of the lane's 81 in-file links as broken — every
 *     `#N-device_type-…` and `#…-device_type-tv` anchor. That happened in this task's
 *     own first pass.
 *  2. Readiness is matched on the two real markers only — a `## Status: Not yet authored`
 *     heading and a frontmatter description ending in the marker phrase — never on a
 *     substring search for "placeholder". Eight of the seventeen lane files carry the
 *     word — six inside a runtime guard ("stop if a cited standards file IS one"), two in
 *     rules about placeholder DATA — so a phrase search declares the authored lane unbuilt.
 *  3. Every count is RECOMPUTED from standards/, never hardcoded. A validator that pins
 *     today's numbers turns a legitimate standards change into a red build and teaches
 *     people to edit the check instead of the claim.
 *  4. `\bblocking\b` is deliberately NOT a severity marker — four Android rules use the
 *     word ordinarily ("no blocking work on the main thread") — and neither is a bare
 *     `\bcritical\b`, which matches "scroll-critical" and "startup-critical" because `-`
 *     is a word boundary. `\bnit\b` must keep its boundaries too: unbounded and
 *     case-sensitive it matches "indefinitely", "definitions", "initiated", "initial" and
 *     "initialization", reporting eight rules that carry no severity marker at all. (Nine
 *     with `i`, the ninth being "collectionItemInfo" — which contains `nIt`, not `nit`, so
 *     it is not an example of the case-sensitive trap.)
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { dirname, join, relative } from "path";
// Design decision 1: the repository's own slug functions, imported. They are already
// exported and already tested there; a re-implementation is what breaks the links.
import { headingSlugs } from "./reference-integrity.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);

/** The eleven groups, as a closed set — a typo in a group letter is a compile error,
 *  and `GROUPS` below is the single place the order is declared. */
export type Group = "P" | "L" | "C" | "R" | "E" | "N" | "Q" | "I" | "A" | "B" | "S";

export interface Defect {
  group: Group;
  rule: string;
  file: string;
  message: string;
}

// ---------------------------------------------------------------------------
// The corpus
// ---------------------------------------------------------------------------

export const LANE_AGENTS: string[] = [
  "agents/android-architect.md",
  "agents/android-code-reviewer.md",
  "agents/android-feature-developer.md",
  "agents/android-performance-reviewer.md",
];
export const LANE_SKILLS: string[] = [
  "skills/android-code-review/SKILL.md",
  "skills/android-dev-planning/SKILL.md",
  "skills/android-feature-implementation/SKILL.md",
];
export const LANE_STANDARDS: string[] = [
  "standards/android/android-architecture.md",
  "standards/android/android-logging-analytics.md",
  "standards/android/android-navigation.md",
  "standards/android/android-networking.md",
  "standards/android/android-performance.md",
  "standards/android/android-persistence.md",
  "standards/android/android-testing.md",
  "standards/android/compose-xml-standards.md",
  "standards/android/gradle-build-signing.md",
  "standards/android/kotlin-standards.md",
];
export const LANE_FILES: string[] = [...LANE_AGENTS, ...LANE_SKILLS, ...LANE_STANDARDS];

// The eight and two files skills/android-code-review/SKILL.md's own two-pass table names.
export const PASS_A: string[] = [
  "standards/android/android-architecture.md",
  "standards/android/kotlin-standards.md",
  "standards/android/compose-xml-standards.md",
  "standards/android/android-networking.md",
  "standards/android/android-persistence.md",
  "standards/android/android-navigation.md",
  "standards/android/android-logging-analytics.md",
  "standards/android/android-testing.md",
];
export const PASS_B: string[] = [
  "standards/android/android-performance.md",
  "standards/android/gradle-build-signing.md",
];

// Which skill each agent's bare `skill §N` pointers refer to.
const AGENT_SKILL: Record<string, string> = {
  "agents/android-architect.md": "skills/android-dev-planning/SKILL.md",
  "agents/android-code-reviewer.md": "skills/android-code-review/SKILL.md",
  "agents/android-performance-reviewer.md": "skills/android-code-review/SKILL.md",
  "agents/android-feature-developer.md": "skills/android-feature-implementation/SKILL.md",
};

// ---------------------------------------------------------------------------
// Pure extractors
// ---------------------------------------------------------------------------

// A rule "states a numeric threshold" if its bullet carries a magnitude with a unit.
// No leading \b before \d+: in "320x180 px" there is no word boundary before "180",
// because "0x1" is three word characters. WITH the \b this finds 2 rules; without it, 4.
// The \b was the bug — it hid two. Do not "tidy" it back in.
export const THRESHOLD = /^- `AND-[A-Z0-9-]+-\d+`.*\d+ ?(MB|dp|px|ms|fps)\b/;

const NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const WORD: Record<number, string> = {};
for (const [w, n] of Object.entries(NUM)) WORD[n] = w;
const NUM_RE = new RegExp(`\\b(${Object.keys(NUM).join("|")})\\b`, "gi");
const SEP = /^\|[\s|:-]+\|?\s*$/;
const ID_DECL = /^- `([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+)`/gm;
// (?<![-A-Z0-9]) skips the suffix shorthand the standards use in prose — `-FEATURE-1`
// for AND-REL-TV-FEATURE-1. Without it, "FEATURE-1" is read as a whole ID and reported
// as undeclared. The full ID is validated wherever it is written out.
// Exported for the suite. It carries `g`, so an importer must rebuild it (or use
// `matchAll`) rather than calling `.test()`/`.exec()` on it directly.
export const ID_REF = /(?<![-A-Z0-9])[A-Z][A-Z0-9]{1,}(?:-[A-Z0-9]+)*-\d+\b/g;
const CITE_FULL = /`([A-Za-z0-9_.\/-]+\.(?:md|ts|json|sh)):(\d+)(?:-\d+)?`/g;
const CITE_BARE = /`:(\d+)(?:-\d+)?`/g;
const PATH_ON_LINE = /`([A-Za-z0-9_.\/-]+\.(?:md|ts|json|sh))(?::\d+(?:-\d+)?)?`/g;
const SLASH_CMD = /`\/([a-z][a-z-]*)`/g;

/**
 * Every `/g` pattern in this file goes through here, and every one of them is rebuilt on
 * each call. `String.prototype.matchAll` is already safe on its own — it clones the regex
 * and never writes back the source's `lastIndex` — so this helper fixes no live hazard.
 * It exists because `.test()` and `.exec()` on a /g pattern ARE stateful, and a rewrite to
 * either would silently return fewer matches on its second call, quietly lowering every
 * recomputed count in group C rather than failing. One helper is the only place that then
 * has to stay right, and the suite pins the discipline at source level rather than
 * trusting this comment.
 */
function matchesOf(text: string, rx: RegExp): RegExpMatchArray[] {
  return [...text.matchAll(new RegExp(rx.source, rx.flags))];
}

/** Code-point order, never a locale collation: the defect list must be byte-identical
 *  on every machine, whatever the host's locale. */
function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** An ID is declared ONLY as the first inline-code span of a zero-indent list item.
 *  IDs in headings and tables are references, never declarations. */
/** Line 5, or "" when the file is shorter. A standards file truncated to four lines is
 *  exactly the damage group B exists to report — it must file B1, never throw. */
export function line5(text: string): string {
  const lines = text.split("\n");
  return lines.length > 4 ? lines[4] : "";
}

export function declaredIds(text: string): string[] {
  return matchesOf(text, ID_DECL).map((m) => m[1]);
}

export function rootsOf(ids: string[]): Set<string> {
  return new Set(ids.map((i) => i.replace(/-\d+$/, "")));
}

/** Size and kind ('b' bullets | 't' table rows) of the block following line i.
 *  A table's header is the row whose NEXT line is a separator, and is not an item.
 *  One blank line between items is allowed; two end the block. */
export function blockAfter(lines: string[], i: number): { n: number; kind: "b" | "t" | null } {
  let j = i + 1;
  let n = 0;
  let kind: "b" | "t" | null = null;
  let blanks = 0;
  while (j < lines.length) {
    const s = lines[j];
    if (s.trim() === "") {
      blanks += 1;
      if (blanks > 1 && n > 0) break;
      j += 1;
      continue;
    }
    if (s.startsWith("- ") && (kind === null || kind === "b")) {
      kind = "b";
      n += 1;
      blanks = 0;
      j += 1;
      continue;
    }
    if (s.startsWith("|") && (kind === null || kind === "t")) {
      kind = "t";
      const isHeader = j + 1 < lines.length && SEP.test(lines[j + 1]);
      if (!SEP.test(s) && !isHeader) n += 1;
      blanks = 0;
      j += 1;
      continue;
    }
    break;
  }
  return { n, kind };
}

export function numberWords(line: string): number[] {
  return matchesOf(line, NUM_RE).map((m) => NUM[m[1].toLowerCase()]);
}

export function frontmatter(text: string): Record<string, string> {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end < 0) return {};
  const out: Record<string, string> = {};
  for (const line of text.slice(3, end).split("\n")) {
    const m = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// ---------------------------------------------------------------------------
// The claim tables — the only hand-written halves
// ---------------------------------------------------------------------------

// (citing file, target file, line, a literal phrase that must be ON that line).
// The phrase is the whole point. "The line exists" alone would have passed FIVE OF FIVE of
// the stale citations this task found: every target had grown, not shrunk, so all five old
// line numbers were still in range — and one, `commands/analyze-feature.md:75`, pointed at
// a line that had become blank. Blank still exists.
export const CITATIONS: ReadonlyArray<readonly [string, string, number, string]> = [
  ["agents/android-architect.md", "agents/repo-analyst.md", 86,
    "lightweight existence checks only"],
  ["agents/android-architect.md", "agents/repo-analyst.md", 84,
    "ARCH-LAYERS"],
  ["agents/android-architect.md", "commands/analyze-feature.md", 82,
    "The four design-reference fields exactly as resolved in step 5"],
  ["agents/android-feature-developer.md", "commands/implement-task.md", 66,
    "never default to `mobile`"],
  ["agents/android-feature-developer.md", "commands/implement-task.md", 215,
    "passed through as authoritative context"],
  ["agents/android-performance-reviewer.md", "standards/android/gradle-build-signing.md", 5,
    "validated at release"],
  ["skills/android-code-review/SKILL.md", "standards/android/gradle-build-signing.md", 5,
    "validated at release"],
  ["skills/android-dev-planning/SKILL.md", "standards/android/android-architecture.md", 28,
    "AND-VM-EVENT-1"],
  ["skills/android-dev-planning/SKILL.md", "skills/repo-knowledge-consumer/SKILL.md", 154,
    "it carries no device information"],
  ["skills/android-dev-planning/SKILL.md", "agents/repo-analyst.md", 86,
    "lightweight existence checks only"],
  ["skills/android-dev-planning/SKILL.md", "skills/rn-dev-planning/SKILL.md", 77,
    "**Label every finding**"],
  ["skills/android-dev-planning/SKILL.md", "agents/repo-analyst.md", 113,
    "there is no `mixed` device type"],
  ["skills/android-dev-planning/SKILL.md", "templates/feature-analysis-template.md", 12,
    "mobile | tv"],
  ["skills/android-dev-planning/SKILL.md", "skills/dev-design-start/SKILL.md", 118,
    "names **its own mechanism**"],
  ["skills/android-dev-planning/SKILL.md", "commands/dev-feature-start.md", 35,
    "no blocking Open Questions"],
  ["skills/android-dev-planning/SKILL.md", "skills/dev-feature-start/SKILL.md", 36,
    "Delegate platform vocabulary and standard-ID citations"],
  ["skills/android-feature-implementation/SKILL.md", "commands/implement-task.md", 215,
    "passed through as authoritative context"],
  ["skills/android-feature-implementation/SKILL.md", "commands/implement-task.md", 66,
    "never default to `mobile`"],
];

// Group R discovers its rows: the table rows inside each lane skill's
// `## … Standards citation` section. Every ID root the named file declares must be COVERED
// by a root the row lists — glob semantics, so `AND-UI-*` covers `AND-UI-A11Y`, because the
// two skills write their tables at different granularities.
//
// Two earlier versions of this were wrong, in opposite directions. A hand-written list of
// three rows, all shared, left the ten Android rows unchecked — and a missing
// `AND-UI-A11Y` in the planning skill's Compose row survived the whole of round 1.
// Discovering EVERY table row that names a `standards/*.md` path is too broad: the lane
// has seven such rows outside the citation sections, and four would be reported as
// defects — a security-referral row and three lane-ownership rows, each naming a subset of
// a file's roots on purpose. The other three escape only because they happen to write a
// broad root such as `AND-*`, which is luck rather than correctness.
export const ROOT_ROW_SKILLS: ReadonlyArray<string> = LANE_SKILLS;

// (citing file, the claim's needle, scope name, inverted pattern or null).
// A negative-existence claim, inverted into a positive search over its OWN scope.
// `needle` must still be present in the citing file: if the claim is deleted, the row
// here is stale and says so, so the table cannot rot in either direction.
export const NEGATIVES: ReadonlyArray<readonly [string, string, string, string | null]> = [
  // A severity MARKER is a label, not a word that happens to appear in prose. The four
  // levels are fixed by templates/code-review-template.md, and a marker on a rule would
  // read `[Blocking]`, `**Major**` or `Severity:`. Matching bare \bcritical\b instead
  // reports "scroll-critical surfaces" and "startup-critical code" as severity markers,
  // and \bblocking\b reports the four rules that forbid blocking the main thread.
  ["skills/android-code-review/SKILL.md", "no severity marker on any rule", "STANDARDS",
    "^- `AND-[A-Z0-9-]+-\\d+`.*(\\[(Blocking|Major|Minor|Nit)\\]|\\*\\*(Blocking|Major|Minor|Nit)\\*\\*|\\bSeverity:)"],
  ["skills/android-code-review/SKILL.md", "no applicability-stage heading", "STANDARDS",
    "^#{2,3} .*\\b(at review|at release|Stage)\\b"],
  ["skills/android-code-review/SKILL.md", "There is no `AND-TV-*` root", "STANDARDS",
    "^- `AND-TV-"],
  ["skills/android-code-review/SKILL.md", "no TV standards file", "ANDROID_TV_FILE", null],
  ["skills/android-dev-planning/SKILL.md", "there is no TV platform value", "TV_COMPONENT", null],
];

// (citing file, ID, the magnitude the citing file pairs with it).
// skills/android-code-review/SKILL.md:186 is the only skill in the repository that copies
// threshold VALUES out of standards/ — measured: the other three `*-code-review` skills
// carry none, and neither do the other two Android lane skills. Group C guards the word
// "four"; without this the four pairings are unguarded, so a standard could change 280 MB
// and the skill would keep quoting the old figure with the count still right.
export const THRESHOLD_PAIRS: ReadonlyArray<readonly [string, string, string]> = [
  ["skills/android-code-review/SKILL.md", "AND-UI-A11Y-3", "48dp"],
  ["skills/android-code-review/SKILL.md", "AND-PERF-TV-1", "280 MB"],
  ["skills/android-code-review/SKILL.md", "AND-REL-TV-BANNER-1", "320x180 px"],
  ["skills/android-code-review/SKILL.md", "AND-REL-TV-STORE-1", "1280x720 px"],
];

// (citing file, needle, the governing count).
// Lines naming two numbers, where discovery cannot tell which one governs the list.
// Pinning them means group E's conservative rule is not a hiding place.
export const GOVERNING: ReadonlyArray<readonly [string, string, number]> = [
  ["agents/android-performance-reviewer.md", "Two call sites, one lane:", 2],
  ["skills/android-code-review/SKILL.md", "counted, not estimated", 5],
];

// (citing file, the file it is attributed to, the quoted text). An explicit table, not
// discovery: a line carrying several short quoted phrases ("will jank", "will leak") makes
// regex pairing mis-pair one quote's close with the next quote's open, which produced three
// false defects. Comparison is case-insensitive, because quoting a sentence mid-sentence
// legitimately lowercases its first letter — accessibility.md writes "On TV form factors",
// the planning skill quotes "on TV form factors", and that is correct practice, not drift.
export const QUOTATIONS: ReadonlyArray<readonly [string, string, string]> = [
  ["agents/android-architect.md", "agents/repo-analyst.md",
    "lightweight existence checks only (Gradle Kotlin DSL vs. Groovy, Compose vs. XML " +
    "view presence) — deliberately so"],
  ["agents/android-architect.md", "templates/feature-analysis-template.md",
    "Proposed Technical Approach"],
  ["skills/android-dev-planning/SKILL.md", "standards/shared/accessibility.md",
    "on TV form factors there is no touch target — the equivalent requirement is a " +
    "reliably focusable element with a clearly visible focus state"],
  ["skills/android-dev-planning/SKILL.md", "standards/shared/accessibility.md",
    "TV: no touch — ensure D-pad focusability and a visible focus highlight"],
];

// Slash commands that belong to a DIFFERENT plugin (ono-project-inspector), established
// by docs/repo-knowledge-contract.md:30 and skills/repo-knowledge-consumer/SKILL.md:78.
// reference-integrity.ts:338 has the analogous FOREIGN_PATHS carve-out for paths and none
// for commands. This is a GUARD, not a fix for a live defect: today no bare citation
// inherits its path from `/inspect` or `/inspect-sync` — the only two that inherit from a
// command inherit from `/implement-task` — so the branch below never fires. It exists so a
// bare `:NNN` written after a foreign command is skipped, not reported as a missing
// commands/inspect.md.
export const FOREIGN_COMMANDS: Set<string> = new Set(["inspect", "inspect-sync"]);

// ---------------------------------------------------------------------------
// Recomputed counts
// ---------------------------------------------------------------------------

/** Every numeric claim in the lane, paired with a value recomputed from disk.
 *  `asWord` renders the number in English, because some claims are written in words. */
export function countClaims(root: string): Array<{ file: string; template: string; n: number; asWord: boolean }> {
  const ids = (rel: string): string[] => declaredIds(read(root, rel));
  const andAll = LANE_STANDARDS.flatMap(ids);
  const a11y = ids("standards/shared/accessibility.md");
  const i18n = ids("standards/shared/i18n-rtl.md");
  const fam = (pre: string): string[] => andAll.filter((i) => i.startsWith(pre));
  const passA = PASS_A.flatMap(ids);
  const per = (rel: string): number => ids(rel).length;

  let thresholds = 0;
  for (const rel of LANE_STANDARDS) {
    for (const line of read(root, rel).split("\n")) if (THRESHOLD.test(line)) thresholds += 1;
  }

  // How many of the seven non-testing Pass A files use the exact verb "reviewed by"?
  let reviewedBy = 0;
  for (const rel of PASS_A) {
    if (rel === "standards/android/android-testing.md") continue;
    if (line5(read(root, rel)).includes("reviewed by `android-code-reviewer`")) reviewedBy += 1;
  }

  const ACR = "skills/android-code-review/SKILL.md";
  const ADP = "skills/android-dev-planning/SKILL.md";
  const APR = "agents/android-performance-reviewer.md";
  const claim = (file: string, template: string, n: number, asWord: boolean) =>
    ({ file, template, n, asWord });
  return [
    claim(ACR, "`A11Y-*`, `I18N-*` | **{n}** |", a11y.length + i18n.length, false),
    claim(ACR, "`A11Y-*` ({n})", a11y.length, false),
    claim(ACR, "`I18N-*` ({n})", i18n.length, false),
    claim(ACR, "**{n} `AND-*` across the ten Android files", andAll.length, false),
    claim(ACR, "plus {n} shared**", a11y.length + i18n.length, false),
    claim(ACR, "| **{n}** |", passA.length, false),
    claim(ACR, "`AND-UI-*` ({n}, incl.", fam("AND-UI-").length, false),
    claim(ACR, "`AND-UI-TV-*` {n} and", fam("AND-UI-TV-").length, false),
    claim(ACR, "`AND-UI-A11Y-*` {n})", fam("AND-UI-A11Y-").length, false),
    claim(ACR, "`AND-PERF-*` ({n}, incl.", fam("AND-PERF-").length, false),
    claim(ACR, "`AND-PERF-TV-*` {n})", fam("AND-PERF-TV-").length, false),
    claim(ACR, "`AND-REL-*` ({n}, incl.", fam("AND-REL-").length, false),
    claim(ACR, "`AND-REL-TV-*` {n})", fam("AND-REL-TV-").length, false),
    claim(ACR, "`AND-ARCH-*`, `AND-VM-*`, `AND-DI-*` ({n}, incl.",
      per("standards/android/android-architecture.md"), false),
    claim(ACR, "`AND-KT-*` ({n})", per("standards/android/kotlin-standards.md"), false),
    claim(ACR, "`AND-NET-*` ({n})", per("standards/android/android-networking.md"), false),
    claim(ACR, "`AND-DATA-*` ({n})", per("standards/android/android-persistence.md"), false),
    claim(ACR, "`AND-NAV-*` ({n}, incl.", per("standards/android/android-navigation.md"), false),
    claim(ACR, "`AND-LOG-*` ({n})", per("standards/android/android-logging-analytics.md"), false),
    claim(ACR, "`AND-TEST-*` ({n}, incl.", per("standards/android/android-testing.md"), false),
    claim(ADP, "**{n} `AND-*` rules**", andAll.length, false),
    claim(APR, "({n} IDs, counted on disk", fam("AND-PERF-").length, false),
    claim(APR, "{n} of them `AND-PERF-TV-*`", fam("AND-PERF-TV-").length, false),
    claim(APR, "`AND-REL-*` ({n},", fam("AND-REL-").length, false),
    claim(APR, "{n} of them `AND-REL-TV-*`", fam("AND-REL-TV-").length, false),
    claim("agents/android-code-reviewer.md",
      "{n} of the other seven Pass A files say", reviewedBy, true),
    // F13's replacement text. This began as a NEGATIVES row asserting "no numeric
    // threshold"; correcting the false claim removed the phrase, the two-sided
    // check said so, and the invariant moved here — where it now guards the four rules
    // by recomputing them instead of asserting an absence that is no longer claimed.
    claim(ACR, "{n} rules do state a numeric threshold", thresholds, true),
  ];
}

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

const CACHE = new Map<string, string>();

function read(root: string, rel: string): string {
  const key = `${root}\u0000${rel}`;
  const hit = CACHE.get(key);
  if (hit !== undefined) return hit;
  const text = readFileSync(join(root, rel), "utf-8");
  CACHE.set(key, text);
  return text;
}

function defect(group: Group, rule: string, file: string, message: string): Defect {
  return { group, rule, file, message };
}

/** The named scopes a NEGATIVES row may use. Adding a row means using one of these, or
 *  adding a branch in checkN for a scope that is not a plain file list. */
function scopeFiles(scope: string): string[] {
  if (scope === "STANDARDS") return LANE_STANDARDS;
  throw new Error(
    `unknown NEGATIVES scope ${JSON.stringify(scope)} — use "STANDARDS" (a file list), or ` +
      `"ANDROID_TV_FILE" / "TV_COMPONENT", which checkN handles directly`,
  );
}

/** Quote a string for a defect message: single quotes, switching to double when the text
 *  itself contains one, backslashes escaped. Keeps a message readable when the claim it
 *  quotes is itself full of backticks and punctuation. */
function repr(s: string): string {
  const body = s.replace(/\\/g, "\\\\");
  if (body.includes("'") && !body.includes('"')) return `"${body}"`;
  return `'${body.replace(/'/g, "\\'")}'`;
}

function citationKey(citing: string, target: string, line: number): string {
  return `${citing}\u0000${target}\u0000${line}`;
}

/** Recursive walk over standards/. A directory whose path
 *  contains "fixtures" contributes no files — scripts/fixtures corpora are deliberately
 *  broken — while descent continues into its subdirectories. */
function walkStandards(dir: string, out: string[]): string[] {
  if (!existsSync(dir)) return out;
  const skip = dir.includes("fixtures");
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkStandards(p, out);
    else if (!skip && entry.name.endsWith(".md")) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The eleven groups
// ---------------------------------------------------------------------------

function checkP(root: string, out: Defect[]): void {
  const marker = "not yet authored, currently a structure-only placeholder";
  for (const rel of LANE_FILES) {
    const text = read(root, rel);
    if (/^## Status: Not yet authored\s*$/m.test(text)) {
      out.push(defect("P", "P1-no-placeholder-heading", rel,
        "carries the `## Status: Not yet authored` readiness marker"));
    }
    const description = frontmatter(text)["description"] ?? "";
    if (description.trimEnd().replace(/"+$/, "").endsWith(marker)) {
      out.push(defect("P", "P2-no-placeholder-description", rel,
        "frontmatter description ends with the placeholder marker"));
    }
  }
}

function checkL(root: string, out: Defect[]): void {
  for (const [citing, target, line, phrase] of CITATIONS) {
    if (!existsSync(join(root, target))) {
      out.push(defect("L", "L1-cited-line-exists", citing,
        `cites \`${target}\`, which does not exist`));
      continue;
    }
    const lines = read(root, target).split("\n");
    if (line > lines.length) {
      out.push(defect("L", "L1-cited-line-exists", citing,
        `cites \`${target}:${line}\` but that file has ${lines.length} lines`));
    } else if (!lines[line - 1].includes(phrase)) {
      out.push(defect("L", "L2-cited-line-still-says-it", citing,
        `\`${target}:${line}\` no longer contains ${repr(phrase)}`));
    }
  }

  // The other half, so the table cannot rot in the "citation deleted, row left behind"
  // direction — NEGATIVES and QUOTATIONS each have one, and CITATIONS had none. A citation
  // may be written `path:113`, `path:113-114` (a range, recorded by its first line), or
  // bare as `:113` / `:113-114`; all four spellings count.
  for (const [citing, target, line] of CITATIONS) {
    const pat = new RegExp("`(?:" + target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      ")?:" + line + "(?:-\\d+)?`");
    if (!pat.test(read(root, citing))) {
      out.push(defect("L", "L5-citation-still-made", citing,
        `no longer cites \`${target}:${line}\` — remove its CITATIONS row`));
    }
  }

  const known = new Set(CITATIONS.map(([c, t, l]) => citationKey(c, t, l)));
  for (const rel of LANE_FILES) {
    for (const raw of read(root, rel).split("\n")) {
      for (const m of matchesOf(raw, CITE_FULL)) {
        const path = m[1];
        const num = m[2];
        if (!known.has(citationKey(rel, path, Number(num)))) {
          out.push(defect("L", "L3-citation-is-registered", rel,
            `cites \`${path}:${num}\`, which is not a registered citation — it ` +
            `drifted, or its phrase needs recording in CITATIONS`));
        }
      }
      for (const m of matchesOf(raw, CITE_BARE)) {
        const before = raw.slice(0, m.index ?? 0);
        const paths = matchesOf(before, PATH_ON_LINE).map((x) => x[1]);
        const cmds = matchesOf(before, SLASH_CMD).map((x) => x[1]);
        let inherited: string;
        if (paths.length > 0) {
          inherited = paths[paths.length - 1];
        } else if (cmds.length > 0) {
          // ono-project-inspector's command, not this plugin's file. Nothing here can
          // resolve it, and reporting it would be a false defect.
          if (FOREIGN_COMMANDS.has(cmds[cmds.length - 1])) continue;
          inherited = `commands/${cmds[cmds.length - 1]}.md`;
        } else {
          out.push(defect("L", "L4-bare-citation-has-a-path", rel,
            `bare citation \`:${m[1]}\` has no path to inherit`));
          continue;
        }
        if (!known.has(citationKey(rel, inherited, Number(m[1])))) {
          out.push(defect("L", "L3-citation-is-registered", rel,
            `bare citation \`:${m[1]}\` resolves to \`${inherited}:${m[1]}\`, which is not a ` +
            `registered citation — it drifted, or its phrase needs ` +
            `recording in CITATIONS`));
        }
      }
    }
  }
}

function checkC(root: string, out: Defect[]): void {
  for (const { file, template, n, asWord } of countClaims(root)) {
    // Beyond twelve there is no word form, so fall back to the numeral rather than
    // throwing: a legitimate standards change must be REPORTED, never crash the run.
    const rendered = asWord ? (WORD[n] ?? String(n)) : String(n);
    const want = template.replaceAll("{n}", rendered);
    const hay = read(root, file);
    // A word-form count is legitimately capitalised at the start of a sentence
    // ("Four rules do state…"), so compare those case-insensitively. Digit-form
    // claims stay case-sensitive: there is nothing to normalise.
    const found = asWord ? hay.toLowerCase().includes(want.toLowerCase()) : hay.includes(want);
    if (!found) {
      out.push(defect("C", "C1-count-matches-disk", file,
        `does not state ${repr(want)} — recomputed from standards/`));
    }
  }
}

/** The rows of a skill's `## … Standards citation` section, and nothing else. */
export function citationTableRows(text: string): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) {
      inside = line.toLowerCase().includes("standards citation");
      continue;
    }
    if (inside && line.startsWith("|")) out.push(line);
  }
  return out;
}

/** Both halves: the citing file still states `ID (magnitude)`, and that ID's own bullet in
 *  standards/ still carries that magnitude. Either half going stale is a defect. */
function checkThresholds(root: string, out: Defect[]): void {
  for (const [citing, ident, magnitude] of THRESHOLD_PAIRS) {
    if (!read(root, citing).includes(`\`${ident}\` (${magnitude})`)) {
      out.push(defect("C", "C2-threshold-pairing-stated", citing,
        `no longer states \`${ident}\` (${magnitude}) — if the standard changed, update ` +
          `both; if the pairing was dropped, remove its THRESHOLD_PAIRS row`));
      continue;
    }
    const bullet = LANE_STANDARDS.flatMap((rel) =>
      read(root, rel).split("\n").filter((l) => l.startsWith(`- \`${ident}\``)));
    const flat = (t: string): string => t.split(" ").join("").split("**").join("");
    if (bullet.length !== 1) {
      out.push(defect("C", "C2-threshold-pairing-stated", citing,
        `pairs a magnitude with \`${ident}\`, which is declared ${bullet.length} times`));
    } else if (!flat(bullet[0]).includes(flat(magnitude))) {
      out.push(defect("C", "C2-threshold-pairing-stated", citing,
        `states \`${ident}\` (${magnitude}), but that rule no longer carries ${magnitude}`));
    }
  }
}

function checkR(root: string, out: Defect[]): void {
  for (const citing of ROOT_ROW_SKILLS) {
    const text = read(root, citing);
    if (!/^## .*standards citation/im.test(text)) {
      out.push(defect("R", "R3-citation-section-exists", citing,
        "has no `## … Standards citation` section, so its citation rows cannot be found " +
          "— was the heading renamed?"));
      continue;
    }
    for (const line of citationTableRows(text)) {
      const m = /`(standards\/[a-z0-9/.-]+\.md)`/.exec(line);
      if (m === null) continue;
      const target = m[1];
      if (!existsSync(join(root, target))) {
        out.push(defect("R", "R1-row-target-exists", citing,
          `a citation row names \`${target}\`, which does not exist`));
        continue;
      }
      const listed = new Set(
        matchesOf(line, /`([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*)-\*`/g).map((x) => x[1]),
      );
      const onDisk = [...rootsOf(declaredIds(read(root, target)))];
      const missing = onDisk
        .filter((r) => ![...listed].some((g) => r === g || r.startsWith(g + "-")))
        .sort(byText);
      if (missing.length > 0) {
        out.push(defect("R", "R2-row-lists-every-root", citing,
          `the row for \`${target}\` covers no root for ${missing.join(", ")}`));
      }
    }
  }
}

function checkE(root: string, out: Defect[]): void {
  for (const rel of LANE_FILES) {
    const lines = read(root, rel).split("\n");
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.trimEnd().endsWith(":")) continue;
      const words = numberWords(l);
      if (words.length === 0) continue;
      const { n } = blockAfter(lines, i);
      if (n === 0) continue;
      const hit = GOVERNING.find(([f, k]) => f === rel && l.includes(k));
      const pin = hit === undefined ? null : hit[2];
      const ok = pin !== null ? n === pin : words.includes(n);
      if (!ok) {
        const stated = pin !== null ? String(pin) : `[${words.join(", ")}]`;
        out.push(defect("E", "E1-stated-count-matches-list", rel,
          `line ${i + 1} states ${stated} but ${n} item(s) follow — fix the number, or ` +
            `pin the governing one in GOVERNING if the line names two`));
      }
    }
  }
}

function checkN(root: string, out: Defect[]): void {
  for (const [citing, needle, scope, pattern] of NEGATIVES) {
    if (!read(root, citing).includes(needle)) {
      out.push(defect("N", "N2-claim-still-made", citing,
        `no longer contains ${repr(needle)} — remove its NEGATIVES row`));
      continue;
    }
    if (scope === "ANDROID_TV_FILE") {
      const hits = readdirSync(join(root, "standards", "android")).filter((f) => /tv/i.test(f));
      if (hits.length > 0) {
        out.push(defect("N", "N1-negative-still-true", citing,
          `claims ${repr(needle)} but standards/android/ holds ${hits.sort(byText).join(", ")}`));
      }
      continue;
    }
    if (scope === "TV_COMPONENT") {
      const hits: string[] = [];
      for (const sub of ["agents", "skills", "commands"]) {
        for (const f of readdirSync(join(root, sub))) {
          if (/(^|[-\/])tv([-\/.]|$)/i.test(f)) hits.push(`${sub}/${f}`);
        }
      }
      if (hits.length > 0) {
        out.push(defect("N", "N1-negative-still-true", citing,
          `claims ${repr(needle)} but ${hits.sort(byText).join(", ")} exist`));
      }
      continue;
    }
    // Every row not handled by a named scope above must carry a pattern.
    if (pattern === null) throw new Error(`NEGATIVES row for ${citing} has no pattern`);
    const rx = new RegExp(pattern);
    const hits: string[] = [];
    for (const rel of scopeFiles(scope)) {
      for (const line of read(root, rel).split("\n")) {
        if (rx.test(line)) hits.push(`${rel}: ${line.slice(0, 70)}`); // every pattern is anchored with ^
      }
    }
    if (hits.length > 0) {
      out.push(defect("N", "N1-negative-still-true", citing,
        `claims ${repr(needle)} but ${hits.length} line(s) contradict it: ${hits.slice(0, 4).join(" | ")}`));
    }
  }
}

function checkQ(root: string, out: Defect[]): void {
  const flat = (t: string): string => t.replace(/[*`]/g, "").toLowerCase();
  for (const [citing, target, quote] of QUOTATIONS) {
    if (!flat(read(root, citing)).includes(flat(quote))) {
      out.push(defect("Q", "Q2-quotation-still-made", citing,
        `no longer quotes ${repr(quote.slice(0, 60))} — remove its QUOTATIONS row`));
      continue;
    }
    if (!flat(read(root, target)).includes(flat(quote))) {
      out.push(defect("Q", "Q1-quotation-is-verbatim", citing,
        `quotes ${repr(quote.slice(0, 70))}, which is no longer verbatim in \`${target}\``));
    }
  }
}

/** The only ID roots an Android file may cite: its own lane's, and the shared ones the
 *  citation tables name. Deliberately NOT all of `standards/` — a wider authority would
 *  let an `IOS-*` or `REACT-*` ID silently legitimise a typo'd Android citation, and this
 *  validator's remit is one lane, not the repository. */
const ID_AUTHORITY_DIRS = ["standards/android", "standards/shared"];

function checkI(root: string, out: Defect[]): void {
  const authoritative = new Set<string>();
  for (const dir of ID_AUTHORITY_DIRS)
  for (const abs of walkStandards(join(root, dir), [])) {
    const rel = relative(root, abs).split("\\").join("/");
    for (const id of declaredIds(read(root, rel))) authoritative.add(id);
  }
  for (const rel of LANE_FILES) {
    const tokens = [...new Set(matchesOf(read(root, rel), ID_REF).map((m) => m[0]))].sort(byText);
    for (const tok of tokens) {
      if (authoritative.has(tok)) continue;
      // No root fallback. Accepting any token whose FAMILY exists would let
      // `AND-KT-NULL-99` pass, and deleting a rule then renumbering its family is the
      // likeliest standards edit there is. A compressed range still validates through the
      // exact match on its first member — `AND-REL-SIGN-1/2`
      // (skills/android-dev-planning/SKILL.md:60) matches on `AND-REL-SIGN-1`, and the
      // bare `2` is not an ID token at all.
      out.push(defect("I", "I1-cited-id-exists", rel,
        `cites \`${tok}\`, which no file under ${ID_AUTHORITY_DIRS.join(" or ")} declares`));
    }
  }
}

function checkA(root: string, out: Defect[]): void {
  for (const rel of LANE_FILES) {
    const text = read(root, rel);
    const heads = headingSlugs(text);
    const anchors = [...new Set(matchesOf(text, /\]\(#([^)]+)\)/g).map((m) => m[1]))].sort(byText);
    for (const anchor of anchors) {
      if (!heads.has(anchor)) {
        out.push(defect("A", "A1-anchor-resolves", rel,
          `links to \`#${anchor}\`, which matches no heading in the file`));
      }
    }
  }
}

function checkB(root: string, out: Defect[]): void {
  const bound: Array<readonly [string, string]> = [
    ...PASS_A.map((r) => [r, "android-code-reviewer"] as const),
    ...PASS_B.map((r) => [r, "android-performance-reviewer"] as const),
  ];
  for (const [rel, reviewer] of bound) {
    if (!line5(read(root, rel)).includes(reviewer)) {
      out.push(defect("B", "B1-line-5-names-its-reviewer", rel,
        `line 5 does not name \`${reviewer}\`, which the two-pass split assigns it`));
    }
  }
}

function checkS(root: string, out: Defect[]): void {
  for (const [rel, skill] of Object.entries(AGENT_SKILL)) {
    const heads = read(root, skill);
    // Three unambiguous spellings: `skill §N`, `skill **§N`, and a §N right after a
    // backticked SKILL.md path. NOT widened to every bare `§N`: in
    // agents/android-architect.md the same shape also writes DD section numbers
    // ("DD §19", "| Required → §19"), whose target is templates/dd-template.md, and no
    // rule in the text distinguishes the two. Those are left to review — every one was
    // resolved by hand in round 1 and none was wrong. Widening on a guess would trade a
    // silent gap for a noisy false one.
    const text = read(root, rel);
    const nums = new Set<number>([
      ...matchesOf(text, /[Ss]kill(?:’s|'s)?\s*\**\s*§ ?(\d+)/g).map((m) => Number(m[1])),
      ...matchesOf(text, /`skills\/[a-z0-9-]+\/SKILL\.md`\s*§ ?(\d+)/g).map((m) => Number(m[1])),
    ]);
    for (const num of [...nums].sort((a, b) => a - b)) {
      if (!new RegExp(`^## ${num}\\. `, "m").test(heads)) {
        out.push(defect("S", "S1-section-pointer-resolves", rel,
          `points at \`${skill}\` §${num}, which has no such section`));
      }
    }
  }
}

const GROUPS: ReadonlyArray<readonly [Group, (root: string, out: Defect[]) => void]> = [
  ["P", checkP], ["L", checkL], ["C", checkC], ["C", checkThresholds], ["R", checkR], ["E", checkE],
  ["N", checkN], ["Q", checkQ], ["I", checkI], ["A", checkA], ["B", checkB],
  ["S", checkS],
];

export function validate(root: string): Defect[] {
  const out: Defect[] = [];
  for (const [, fn] of GROUPS) fn(root, out);
  const order = new Map(GROUPS.map(([letter], i) => [letter, i] as const));
  return out.sort((x, y) =>
    (order.get(x.group) ?? 0) - (order.get(y.group) ?? 0) ||
    byText(x.file, y.file) ||
    byText(x.rule, y.rule) ||
    byText(x.message, y.message));
}

function main(): void {
  const arg = process.argv[2];
  const root = arg !== undefined && !arg.startsWith("-") ? arg : REPO_ROOT;
  const defects = validate(root);

  console.log("android claim integrity");
  console.log(
    `  ${LANE_FILES.length} lane files · ${CITATIONS.length} path:line citations · ` +
      `${countClaims(root).length} count claims`,
  );

  if (defects.length === 0) {
    console.log("\nNo defects.");
    process.exit(0);
  }
  // De-duplicated: group C is served by two functions, and iterating GROUPS directly
  // printed its block twice.
  for (const letter of [...new Set(GROUPS.map(([g]) => g))]) {
    const own = defects.filter((x) => x.group === letter);
    if (own.length === 0) continue;
    console.log(`\nGroup ${letter} — ${own.length} defect(s)`);
    for (const x of own) console.log(`  ${x.file}: ${x.message}  [${x.rule}]`);
  }
  console.log(`\n${defects.length} defect(s).`);
  process.exit(1);
}

const invokedDirectly =
  process.argv[1] !== undefined && /android-claim-integrity\.ts$/.test(process.argv[1]);
if (invokedDirectly) main();
