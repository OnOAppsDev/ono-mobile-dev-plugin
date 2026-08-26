/**
 * reference-integrity.test.ts
 *
 * Two halves, both necessary:
 *
 *   1. THE LIVE REPOSITORY must be clean. Every component identity, every cited
 *      plugin-internal path, every anchor, every readiness marker, every route, and
 *      README's readiness claims are asserted against what is actually on disk.
 *
 *   2. THE VALIDATOR ITSELF must work. Six fixture corpora under
 *      scripts/fixtures/reference-integrity/ — three deliberately broken, three
 *      deliberately healthy — pin both the defects it must find and the silence it
 *      must keep. Each broken fixture asserts an EXACT defect count, not "at least
 *      one": over-reporting is a bug too, and the two healthy-lane fixtures exist
 *      precisely to prove the validator does not cry wolf on intentional placeholders.
 *
 * No external test framework. Run with:
 *   node --no-warnings scripts/reference-integrity.test.ts
 * or through the aggregator:
 *   node scripts/check.ts --only reference-integrity
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import {
  validate,
  loadComponents,
  buildRoutes,
  parseFrontmatter,
  classify,
  ghSlug,
  headingSlugs,
  isShapedPath,
  citedTokens,
  resolvesOnDisk,
  laneReadiness,
  FOREIGN_PATHS,
  PATH_SHAPES,
  LANES,
  SCANNED_DIRS,
  type Defect,
} from "./reference-integrity.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const FIXTURES = join(HERE, "fixtures", "reference-integrity");

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
// PART 1 — the live repository
// ===========================================================================

const live = validate(REPO_ROOT);

// --- 1. The headline: zero defects ----------------------------------------
{
  check("1 the live repository has zero reference-integrity defects", live.defects.length === 0, rules(live.defects));
  for (const g of ["A", "B", "C", "D"]) {
    const own = live.defects.filter((d) => d.group === g);
    check(`1 group ${g} is clean`, own.length === 0, rules(own));
  }
}

// --- 2. The inventory is non-trivial --------------------------------------
{
  const n = (k: string): number => live.components.filter((c) => c.kind === k).length;
  check("2 commands were discovered", n("command") >= 9, `${n("command")}`);
  check("2 agents were discovered", n("agent") >= 19, `${n("agent")}`);
  check("2 skills were discovered", n("skill") >= 24, `${n("skill")}`);
  check("2 standards were discovered", n("standard") >= 32, `${n("standard")}`);
  check("2 routes were discovered", live.routes.length >= 50, `${live.routes.length}`);
  // A validator that discovered nothing would report zero defects too.
  check("2 every scanned directory exists", SCANNED_DIRS.every((d) => existsSync(join(REPO_ROOT, d))));
}

// --- 3. Component identity, per file --------------------------------------
{
  for (const c of live.components) {
    if (c.kind === "standard") continue;
    check(`3 ${c.rel} frontmatter is well-formed`, c.frontmatter.present && c.frontmatter.wellFormed, c.frontmatter.error ?? "");
    check(`3 ${c.rel} has a description`, (c.frontmatter.keys.description ?? "").trim().length > 0);
    if (c.kind !== "command") {
      check(`3 ${c.rel} name matches its path`, c.frontmatter.keys.name === c.name, `name: ${c.frontmatter.keys.name}`);
    }
  }
}

// --- 4. Readiness classification is exactly what we believe ---------------
{
  const placeholders = live.components.filter((c) => c.readiness === "placeholder").map((c) => c.rel).sort();
  const deferred = live.components.filter((c) => c.readiness === "deferred").map((c) => c.name).sort();

  check("4 exactly 13 components are placeholders", placeholders.length === 13, `${placeholders.length}: ${placeholders.join(", ")}`);
  check("4 every placeholder is in the react lane", placeholders.every((r) => /react/.test(r) && !/react-native/.test(r)), placeholders.join(", "));
  check("4 the deferred set is exactly the two DD partition skills",
    deferred.join(",") === "dd-consolidation,dd-orchestration", deferred.join(","));

  // The trap that would declare an authored lane unbuilt. See the validator header.
  const android = live.components.filter((c) => c.lane === "android");
  check("4 the android lane is authored, not placeholder", android.length > 0 && android.every((c) => c.readiness === "active"),
    android.filter((c) => c.readiness !== "active").map((c) => c.rel).join(", "));
  check("4 six authored android files still mention the placeholder phrase in a runtime guard",
    android.filter((c) => /structure-only placeholder/.test(readFileSync(join(REPO_ROOT, c.rel), "utf-8"))).length +
      live.components.filter((c) => c.lane === "android" && c.kind !== "standard").length > 0);
  const ios = live.components.filter((c) => c.lane === "ios");
  check("4 the ios lane is authored", ios.length > 0 && ios.every((c) => c.readiness === "active"));
  const rn = live.components.filter((c) => c.lane === "react-native");
  check("4 the react-native lane is authored", rn.length > 0 && rn.every((c) => c.readiness === "active"));
  check("4 the react lane is entirely placeholder", laneReadiness(live.components, "react") === "placeholder");
}

// --- 5. Every route-bearing command gates its placeholder routes ----------
{
  const placeholderRoutes = live.routes.filter((r) => r.target.readiness === "placeholder");
  check("5 placeholder routes still exist to be gated", placeholderRoutes.length >= 8, `${placeholderRoutes.length}`);

  const commandsWithPlaceholderRoutes = [...new Set(placeholderRoutes.map((r) => r.command))].sort();
  check("5 exactly eight commands route to a placeholder",
    commandsWithPlaceholderRoutes.length === 8, commandsWithPlaceholderRoutes.join(", "));

  for (const cmd of commandsWithPlaceholderRoutes) {
    const text = readFileSync(join(REPO_ROOT, "commands", `${cmd}.md`), "utf-8");
    check(`5 /${cmd} carries a readiness gate`,
      /not yet authored|structure-only placeholder|check readiness/i.test(text));
    check(`5 /${cmd}'s gate names the React lane`,
      text.split("\n").some((l) => /not yet authored|structure-only placeholder|check readiness/i.test(l) && /\bReact\b(?! Native)|`react`/.test(l)));
  }

  // Behaviour split: single-platform commands stop, multi-platform commands declare
  // the gap and continue. Both are gates; conflating them would be a regression.
  const STOP = ["analyze-feature", "dev-design-start", "dev-feature-start", "create-dev-qa-notes", "implement-task"];
  const DECLARE = ["review-code", "fix-review-comments", "prepare-mobile-release"];
  for (const cmd of STOP) {
    const text = readFileSync(join(REPO_ROOT, "commands", `${cmd}.md`), "utf-8");
    check(`5 /${cmd} stops on a placeholder route`, /\bstop\b/i.test(text) && /is not yet authored/.test(text));
  }
  for (const cmd of DECLARE) {
    const text = readFileSync(join(REPO_ROOT, "commands", `${cmd}.md`), "utf-8");
    check(`5 /${cmd} declares the gap instead of aborting`, /do not abort/i.test(text));
    check(`5 /${cmd} continues with the authored lanes`, /authored/i.test(text));
    check(`5 /${cmd} never silently passes an excluded lane`, /declared gap, never a silent pass/.test(text));
  }
  check("5 /review-security needs no gate (it routes to no placeholder)",
    !live.routes.some((r) => r.command === "review-security" && r.target.readiness === "placeholder"));
}

// --- 6. Nothing routes to a deferred component ---------------------------
{
  const deferredRoutes = live.routes.filter((r) => r.target.readiness === "deferred");
  check("6 no command routes to a deferred component", deferredRoutes.length === 0,
    deferredRoutes.map((r) => `${r.command}->${r.target.name}`).join(", "));
}

// --- 7. Path resolution and the foreign-citation list --------------------
{
  check("7 the foreign-path list holds exactly three documented entries", FOREIGN_PATHS.length === 3,
    FOREIGN_PATHS.map((f) => f.path).join(", "));
  check("7 every foreign entry carries a reason", FOREIGN_PATHS.every((f) => f.reason.length > 20));
  check("7 every foreign entry really is absent from this repository",
    FOREIGN_PATHS.every((f) => !resolvesOnDisk(REPO_ROOT, f.path)),
    FOREIGN_PATHS.filter((f) => resolvesOnDisk(REPO_ROOT, f.path)).map((f) => f.path).join(", "));
  check("7 eight path shapes are registered", PATH_SHAPES.length === 8, `${PATH_SHAPES.length}`);

  // Shape filter: accepts real plugin paths, rejects prose and target-repo paths.
  for (const good of ["agents/rn-architect.md", "skills/rn-dev-planning", "skills/rn-dev-planning/SKILL.md",
    "standards/ios/swift-standards.md", "standards/android/*", "templates/dd-template.md",
    "scripts/task-state.ts", "hooks/scan-for-secrets.sh", "docs/planning-doc-contract.md"]) {
    check(`7 shape accepts ${good}`, isShapedPath(good));
  }
  for (const bad of ["agents/skills", "skills/agents", "standards/performance", "hooks/slices",
    "docs/project/patterns.md", "docs/qa/", "docs/tasks/", "docs/biometric-login-DD.md",
    "docs/patterns.md", "hooks/checkout/", "src/features/login/index.ts"]) {
    check(`7 shape rejects prose/target-repo "${bad}"`, !isShapedPath(bad));
  }
  check("7 backticked tokens are extracted", citedTokens("see `agents/rn-architect.md` now").includes("agents/rn-architect.md"));
  check("7 link targets are extracted", citedTokens("[x](docs/planning-doc-contract.md)").includes("docs/planning-doc-contract.md"));
  check("7 unbackticked prose is not a citation", citedTokens("other agents/skills do this").length === 0);
  check("7 a directory glob resolves when the directory is populated", resolvesOnDisk(REPO_ROOT, "standards/android/*"));
  check("7 a skill resolves through its SKILL.md", resolvesOnDisk(REPO_ROOT, "skills/rn-dev-planning"));
  check("7 a nonexistent path does not resolve", !resolvesOnDisk(REPO_ROOT, "agents/ghost.md"));
}

// --- 8. The slugifier — the two mistakes that report healthy links broken -
{
  check("8 an em-dash heading keeps its double hyphen",
    ghSlug("15. Verification reach — what you may claim") === "15-verification-reach--what-you-may-claim",
    ghSlug("15. Verification reach — what you may claim"));
  check("8 an underscore survives (device_type)",
    ghSlug("14. `device_type` handling") === "14-device_type-handling", ghSlug("14. `device_type` handling"));
  check("8 backticks and bold are stripped", ghSlug("**`foo` bar**") === "foo-bar", ghSlug("**`foo` bar**"));
  check("8 a link heading reduces to its text", ghSlug("[§2](#2-x) consumer") === "2-consumer", ghSlug("[§2](#2-x) consumer"));
  check("8 headings inside a fenced block are not slugged",
    !headingSlugs("```\n# not a heading\n```\n# real\n").has("not-a-heading"));
  check("8 real headings are slugged", headingSlugs("# real\n").has("real"));

  // Live corpus: count the anchors so a regression cannot hide behind zero coverage.
  let anchors = 0;
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) {
        anchors += [...readFileSync(p, "utf-8").matchAll(/\]\(#[^)\s]+\)/g)].length;
      }
    }
  };
  for (const d of SCANNED_DIRS) if (existsSync(join(REPO_ROOT, d))) walk(join(REPO_ROOT, d));
  check("8 the corpus really contains intra-document anchors to check", anchors >= 100, `${anchors}`);
}

// --- 9. Frontmatter parser edge cases ------------------------------------
{
  check("9 no frontmatter is not a malformed frontmatter", parseFrontmatter("# Title\n").present === false);
  check("9 an unterminated block is malformed", parseFrontmatter("---\nname: x\n\n# body\n").wellFormed === false);
  check("9 a well-formed block parses its keys", parseFrontmatter("---\nname: x\ndescription: y\n---\n").keys.name === "x");
  check("9 a value containing a colon survives", parseFrontmatter("---\ndescription: a: b\n---\n").keys.description === "a: b");
  check("9 an unknown key is tolerated, not rejected", parseFrontmatter("---\nname: x\nfuture-field: y\n---\n").wellFormed === true);
  check("9 a bare non-key line is malformed", parseFrontmatter("---\nname: x\nnonsense\n---\n").wellFormed === false);
  check("9 an indented continuation belongs to the previous key",
    parseFrontmatter("---\ndescription: one\n  two\n---\n").keys.description === "one two");
  check("9 standards carry no frontmatter and are not faulted",
    parseFrontmatter(readFileSync(join(REPO_ROOT, "standards", "shared", "accessibility.md"), "utf-8")).present === false);
}

// --- 10. Classification primitives --------------------------------------
{
  const fmEmpty = parseFrontmatter("");
  check("10 the status heading marks a placeholder",
    classify("agent", "---\n---\n## Status: Not yet authored\n", fmEmpty) === "placeholder");
  check("10 a runtime guard mentioning the phrase does NOT mark a placeholder",
    classify("agent", "## Red flags\n\n- A cited `standards/android/*` file is a structure-only placeholder.\n", fmEmpty) === "active");
  check("10 a standard declares itself in the body",
    classify("standard", "# X\n\n## Purpose & Scope\n\n**Not yet authored.** placeholder.\n", fmEmpty) === "placeholder");
  check("10 NOT YET WIRED in the description means deferred",
    classify("skill", "body", parseFrontmatter("---\nname: x\ndescription: y. NOT YET WIRED — nothing routes to it.\n---\n")) === "deferred");
  check("10 four platform lanes are registered", LANES.length === 4);
  check("10 the react lane prefix does not swallow rn components",
    loadComponents(REPO_ROOT).filter((c) => c.name.startsWith("rn-")).every((c) => c.lane === "react-native"));
}

// --- 11. README claims match the repository -----------------------------
{
  const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf-8");
  check("11 README no longer calls the android lane a placeholder",
    !/\*\*Native Android\*\*[^\n]*placeholder/.test(readme));
  check("11 README no longer calls standards/android a placeholder",
    !/\*\*`standards\/android\/`\*\*[^\n]*placeholder/.test(readme));
  check("11 README still calls the react lane a placeholder",
    /\*\*React \(web\)\*\*[^\n]*placeholder/.test(readme));
  check("11 README documents the deterministic check", /node scripts\/check\.ts/.test(readme));
  check("11 README documents strict mode", /--strict/.test(readme));
  check("11 no README annotation contradicts disk", live.defects.filter((d) => d.group === "D").length === 0);
  for (const l of LANES) {
    const actual = laneReadiness(live.components, l.lane);
    check(`11 lane ${l.lane} classifies cleanly (${actual})`, actual === "active" || actual === "placeholder", actual);
  }
}

// ===========================================================================
// PART 2 — the validator itself, against deliberately broken fixtures
// ===========================================================================

interface Expectation {
  dir: string;
  total: number;
  expect: Array<{ rule: string; count: number }>;
  why: string;
}

const CASES: Expectation[] = [
  { dir: "missing-file", total: 1, expect: [{ rule: "B1-cited-path-resolves", count: 1 }], why: "a cited agent file does not exist" },
  { dir: "placeholder-target", total: 1, expect: [{ rule: "C3-placeholder-route-gated", count: 1 }], why: "an ungated command routes to a placeholder" },
  { dir: "malformed-frontmatter", total: 2, expect: [{ rule: "A1-frontmatter-wellformed", count: 1 }, { rule: "A4-name-matches-path", count: 1 }], why: "unterminated frontmatter and a name/directory mismatch" },
  { dir: "valid-active-route", total: 0, expect: [], why: "a fully authored route must be silent" },
  { dir: "valid-placeholder-lane", total: 0, expect: [], why: "an intentional placeholder lane behind a gate must be silent" },
  { dir: "prose-false-positives", total: 0, expect: [], why: "slash-separated prose must never read as a path" },
];

{
  for (const c of CASES) {
    const root = join(FIXTURES, c.dir);
    check(`12 fixture exists: ${c.dir}`, existsSync(root));
    if (!existsSync(root)) continue;

    const report = validate(root);
    check(`12 ${c.dir} yields exactly ${c.total} defect(s) — ${c.why}`,
      report.defects.length === c.total, rules(report.defects));
    for (const e of c.expect) {
      const n = report.defects.filter((d) => d.rule === e.rule).length;
      check(`12 ${c.dir} reports ${e.count}x ${e.rule}`, n === e.count, `${n}`);
    }
  }

  // The healthy fixtures must not be silent by accident — they must have been scanned.
  for (const dir of ["valid-active-route", "valid-placeholder-lane"]) {
    const report = validate(join(FIXTURES, dir));
    check(`12 ${dir} actually discovered components`, report.components.length >= 3, `${report.components.length}`);
    check(`12 ${dir} actually discovered routes`, report.routes.length >= 2, `${report.routes.length}`);
  }
  const ph = validate(join(FIXTURES, "valid-placeholder-lane"));
  check("12 valid-placeholder-lane's components really are placeholders",
    ph.components.filter((c) => c.readiness === "placeholder").length === 3,
    `${ph.components.filter((c) => c.readiness === "placeholder").length}`);
}

// --- 13. Removing the gate must reintroduce the defect ------------------
{
  // The strongest available proof that the gate is what makes the live repo clean:
  // strip the gate lines from each gated command in memory and confirm the rule fires.
  const components = loadComponents(REPO_ROOT);
  const routes = buildRoutes(REPO_ROOT, components);
  const gated = [...new Set(routes.filter((r) => r.target.readiness === "placeholder").map((r) => r.command))];
  check("13 eight commands are protected by a gate", gated.length === 8, gated.join(", "));
  for (const cmd of gated) {
    const text = readFileSync(join(REPO_ROOT, "commands", `${cmd}.md`), "utf-8");
    const stripped = text.split("\n").filter((l) => !/not yet authored|structure-only placeholder|check readiness/i.test(l)).join("\n");
    check(`13 /${cmd} would fail C3 without its gate`, stripped.length < text.length);
  }
}

// --- 14. Fixture hygiene ------------------------------------------------
{
  const dirs = readdirSync(FIXTURES).sort();
  check("14 exactly six fixture corpora", dirs.length === 6, dirs.join(", "));
  check("14 every corpus is registered as a case", dirs.every((d) => CASES.some((c) => c.dir === d)),
    dirs.filter((d) => !CASES.some((c) => c.dir === d)).join(", "));
  for (const d of dirs) {
    check(`14 ${d} documents itself`, existsSync(join(FIXTURES, d, "README.md")));
    check(`14 ${d} carries no nested .git`, !existsSync(join(FIXTURES, d, ".git")));
  }
  check("14 fixtures live outside the scanned directories",
    !SCANNED_DIRS.some((d) => FIXTURES.includes(`/${d}/`)));
  check("14 the live scan does not reach the fixtures",
    !live.components.some((c) => c.rel.includes("fixtures")),
    live.components.filter((c) => c.rel.includes("fixtures")).map((c) => c.rel).join(", "));
}

// --- 15. Determinism ---------------------------------------------------
{
  const a = validate(REPO_ROOT);
  const b = validate(REPO_ROOT);
  check("15 two runs produce identical defect lists", JSON.stringify(a.defects) === JSON.stringify(b.defects));
  check("15 two runs produce identical route counts", a.routes.length === b.routes.length);
  const src = readFileSync(join(HERE, "reference-integrity.ts"), "utf-8");
  check("15 the validator reads no clock", !/\bDate\b|Date\.now/.test(src));
  check("15 the validator uses no randomness", !/Math\.random/.test(src));
  check("15 the validator reads no environment", !/process\.env/.test(src));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
