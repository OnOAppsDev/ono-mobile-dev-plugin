/**
 * context-isolation-contract.test.ts
 *
 * The ownership boundary between this plugin and `ono-project-inspector`, and the
 * platform boundary inside this plugin, expressed as assertions rather than as prose.
 *
 * Three properties, and all three are boundary conditions rather than features:
 *
 *   1. PLATFORM ISOLATION. A component that belongs to one platform lane may cite that
 *      lane's standards and the shared standards, and nothing else. A component that
 *      belongs to no lane — a shared skill, a shared agent — may cite no platform's
 *      standards at all. This is what stops a merged, role-based agent from eagerly
 *      loading all four platforms and making context worse rather than better, which
 *      is the specific way this refactor could fail while still looking finished.
 *
 *   2. KNOWLEDGE OWNERSHIP. This plugin READS repository knowledge and never WRITES it.
 *      Exactly one component parses the manifest; every other component receives its
 *      normalised output. No component writes CLAUDE.md, AUDIT.md, docs/project/**,
 *      audits/** or .ono/**. Those are `ono-project-inspector`'s artifacts, and
 *      docs/repo-knowledge-contract.md obligations 1 and 2 say so — this suite is what
 *      makes them checkable instead of merely written down.
 *
 *   3. GRACEFUL DEGRADATION. Missing repository knowledge is the normal case, not an
 *      error. The consumer path must degrade to live derivation without blocking, and
 *      must never tell the developer to go run an inspection first.
 *
 * WHY THESE ARE WRITTEN AGAINST THE CURRENT ARCHITECTURE
 *
 * Every assertion below passes on the pre-refactor tree. That is deliberate: a test
 * authored alongside the thing it guards proves only that the two agree. Landing these
 * first means the shared-lifecycle refactor has to satisfy a boundary that was already
 * green, so a regression shows up as a failure rather than as a test that was quietly
 * written to match whatever the new code happened to do.
 *
 * Two deliberate design decisions, both of which cost a false-failure iteration:
 *
 *   a. Platform attribution reuses reference-integrity's LANES table rather than a
 *      second hand-written list. A component's lane comes from its name prefix, and a
 *      standards file's lane comes from its directory. One source of truth, so adding
 *      a lane cannot silently desynchronise this suite.
 *
 *   b. A citation is a backticked `standards/<dir>/<file>.md` path or an ID root, not a
 *      bare mention. Prose legitimately names other platforms — the React Native lane
 *      says it does not use Android's `AND-*` roots, and saying so is correct rather
 *      than a violation. Only a real citation counts, and a NEGATION_CONTEXT guard
 *      excludes the sentences that exist precisely to forbid a cross-lane citation.
 *
 * OFFLINE. Reads only this repository's own markdown.
 *
 * No external test framework. Run with:
 *   node --no-warnings scripts/context-isolation-contract.test.ts
 * or through the aggregator:
 *   node scripts/check.ts --only context-isolation
 */

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { LANES } from "./reference-integrity.ts";

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

/** Every agent and skill file, repo-relative. */
function components(): string[] {
  const out: string[] = [];
  const agents = join(REPO_ROOT, "agents");
  if (existsSync(agents)) {
    for (const f of readdirSync(agents).sort()) if (f.endsWith(".md")) out.push(`agents/${f}`);
  }
  const skills = join(REPO_ROOT, "skills");
  if (existsSync(skills)) {
    for (const d of readdirSync(skills).sort()) {
      const s = join(skills, d, "SKILL.md");
      if (existsSync(s) && statSync(s).isFile()) out.push(`skills/${d}/SKILL.md`);
    }
  }
  return out;
}

/** A component's lane, from its name prefix. Longest prefix wins, exactly as laneOf does. */
function laneOfComponent(rel: string): string | null {
  const name = rel.startsWith("agents/")
    ? rel.slice("agents/".length).replace(/\.md$/, "")
    : rel.slice("skills/".length).replace(/\/SKILL\.md$/, "");
  const hit = [...LANES]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((l) => name.startsWith(l.prefix));
  return hit ? hit.lane : null;
}

/**
 * Backticked citations of a standards file, and the standards directory each names.
 * A glob (`standards/ios/*`) counts: it cites the whole family.
 */
function citedStandardsDirs(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/`standards\/([a-z-]+)\/[^`]*`/g)) out.add(m[1]);
  return out;
}

/**
 * Sentences that exist to FORBID a cross-lane citation are not citations. The corpus
 * contains several by design — "Do not use Android's `AND-*` IDs", "never cite one that
 * is merely adjacent" — and reading them as violations would report a correct rule as a
 * defect. Matched per sentence — see affirmativeStandardsDirs for why not per line.
 */
const NEGATION_CONTEXT =
  /\b(do not|don't|never|not|rather than|instead of|no\b|forbid|reject|unsupported|excluded)\b/i;

/**
 * Standards directories cited affirmatively anywhere in `text`.
 *
 * The negation guard is applied per SENTENCE, not per line. A line-scoped guard is too
 * coarse and produces false negatives: mobile-repo-analysis carries a real citation and
 * an unrelated "it does not judge them" in the same paragraph line, and a line-level
 * test reads the whole thing as a prohibition and misses the citation entirely.
 */
function affirmativeStandardsDirs(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of text.split("\n")) {
    for (const sentence of line.split(/(?<=[.:;])\s+/)) {
      if (NEGATION_CONTEXT.test(sentence)) continue;
      for (const d of citedStandardsDirs(sentence)) out.add(d);
    }
  }
  return out;
}

/**
 * The shared components that cite a platform's standards today, and why. Anything NOT on
 * this list is a violation; the list itself is asserted to be exactly these entries, so
 * the count can only go down and a new one fails immediately.
 *
 * These are not equivalent. One is a real exception to the isolation rule; the other is
 * a defect that predates this suite, documented here rather than silently tolerated.
 */
const KNOWN_CROSS_LANE: Record<string, { dirs: string[]; kind: "exception" | "defect"; why: string }> = {
  "agents/mobile-release-engineer.md": {
    dirs: ["ios", "android"],
    kind: "exception",
    why:
      "LEGITIMATE, same case as the release skill below — this is its agent half. The " +
      "release engineer validates every shipping platform in one pass, so it names each " +
      "platform's release standard by design.",
  },
  "skills/mobile-release-readiness/SKILL.md": {
    dirs: ["ios", "android"],
    kind: "exception",
    why:
      "LEGITIMATE. Release is the one stage where several platforms ship simultaneously: " +
      "/prepare-mobile-release validates every shipping platform in one checklist, so the " +
      "shared skill must name each platform's release standard. Isolation is per-invocation " +
      "everywhere else because only one platform is in scope; here several genuinely are.",
  },
  "skills/mobile-repo-analysis/SKILL.md": {
    dirs: ["react-native"],
    kind: "defect",
    why:
      "PRE-EXISTING DEFECT, recorded not endorsed. This shared skill runs React Native's " +
      "ARCH-LAYERS-*/ARCH-FOLDERS-* folder-conformance scan against EVERY repository, " +
      "'regardless of what was reused'. agents/android-architect.md already documents the " +
      "workaround: those expectations 'are RN-specific and do not apply to Android … Never " +
      "present repo-analyst's React Native conformance verdict as an Android finding.' " +
      "Fixing it changes what repo-analyst reports for iOS/Android/React repositories, so it " +
      "is a behaviour change and out of scope for a refactor that preserves behaviour.",
  },
};

// ---------------------------------------------------------------------------
// 1. Platform isolation — the load rule this refactor depends on
// ---------------------------------------------------------------------------
{
  const laneDirs = new Set(LANES.map((l) => l.standardsDir));
  const all = components();

  check("1 the component inventory is non-trivial", all.length >= 25, `${all.length}`);

  for (const rel of all) {
    const text = read(rel);
    const lane = laneOfComponent(rel);
    const own = lane ? LANES.find((l) => l.lane === lane)!.standardsDir : null;

    const cited = affirmativeStandardsDirs(text);

    const allowed = KNOWN_CROSS_LANE[rel]?.dirs ?? [];
    const foreign = [...cited]
      .filter((d) => laneDirs.has(d) && d !== own)
      .filter((d) => !allowed.includes(d));

    if (lane === null) {
      // A shared component names no platform's standards, beyond a declared entry above.
      check(`1 shared component cites no platform standards: ${rel}`,
        foreign.length === 0, foreign.join(", "));
    } else {
      // A lane component cites its own family, plus shared. Never another lane's.
      check(`1 ${lane} component cites only its own lane: ${rel}`,
        foreign.length === 0, foreign.join(", "));
    }
  }

  // The allowlist is a census, not an escape hatch: it must name exactly the components
  // that actually cross a lane. An entry that stops being needed fails here, so the list
  // shrinks as the corpus is cleaned and can never quietly absorb a new violation.
  const actual = all
    .filter((rel) => {
      const own = laneOfComponent(rel) ? LANES.find((l) => l.lane === laneOfComponent(rel))!.standardsDir : null;
      const cited = affirmativeStandardsDirs(read(rel));
      return [...cited].some((d) => laneDirs.has(d) && d !== own);
    })
    .sort();
  check("1 the cross-lane allowlist is exactly the components that cross a lane",
    actual.join(",") === Object.keys(KNOWN_CROSS_LANE).sort().join(","), actual.join(", "));

  // One is a genuine exception; one is a recorded defect. Keeping the distinction in the
  // data stops the defect from ageing into an accepted design.
  check("1 exactly one recorded cross-lane defect remains",
    Object.values(KNOWN_CROSS_LANE).filter((e) => e.kind === "defect").length === 1);
}

// ---------------------------------------------------------------------------
// 2. Shared standards are reachable from everywhere
// ---------------------------------------------------------------------------
{
  // Isolation must not become starvation: the shared families are the ones every lane
  // is required to load, so they can never be lane-scoped.
  const shared = ["accessibility", "i18n-rtl", "mobile-security", "release-readiness",
    "qa-handoff", "verification"];
  for (const f of shared) {
    check(`2 shared standard exists: ${f}`, existsSync(join(REPO_ROOT, "standards", "shared", `${f}.md`)));
  }
  check("2 shared is not a platform lane",
    !LANES.some((l) => l.standardsDir === "shared"));
}

// ---------------------------------------------------------------------------
// 3. Knowledge ownership — exactly one reader, and no writers
// ---------------------------------------------------------------------------
{
  const MANIFEST = /\.ono\/repo-knowledge\.json/;
  const READER = "skills/repo-knowledge-consumer/SKILL.md";
  const HELPER = "scripts/read-repo-knowledge.ts";

  check("3 the single reader exists", existsSync(join(REPO_ROOT, READER)));
  check("3 the deterministic helper exists", existsSync(join(REPO_ROOT, HELPER)));

  // Obligation 2 — one parser per consumer plugin. Other components may NAME the
  // manifest while explaining that they do not parse it; what none of them may do is
  // instruct a reader to parse it themselves.
  const parsers = components().filter((rel) => {
    if (rel === READER) return false;
    const text = read(rel);
    if (!MANIFEST.test(text)) return false;
    return /\b(parse|read)\b[^.]{0,80}`?\.ono\/repo-knowledge\.json/i.test(flat(text)) &&
      !/never (parse|read)|do not (parse|read)|rather than parsing/i.test(flat(text));
  });
  check("3 exactly one component parses the manifest", parsers.length === 0,
    parsers.join(", "));

  // Obligation 1 — read-only over every inspector-owned artifact.
  const OWNED = /`(CLAUDE\.md|AUDIT\.md|docs\/project\/|audits\/|\.ono\/)/;
  const writers = components().filter((rel) => {
    const t = flat(read(rel));
    if (!OWNED.test(t)) return false;
    return /\b(write|generate|update|edit|modify|regenerate)\b[^.]{0,60}`(CLAUDE\.md|AUDIT\.md|docs\/project\/|audits\/|\.ono\/)/i.test(t) &&
      !/never (write|edit|modify)|do not (write|edit|modify)|read-only|without (writing|modifying)/i.test(t);
  });
  check("3 no component writes an inspector-owned artifact", writers.length === 0,
    writers.join(", "));

  // The obligation is not merely absent from the code — it is stated where a reader looks.
  const contract = read("docs/repo-knowledge-contract.md");
  check("3 the contract states read-only", /\*\*Read-only\.\*\*/.test(contract));
  check("3 the contract states one reader", /\*\*One reader\.\*\*/.test(contract));
  check("3 the contract states cite-do-not-copy", /\*\*Cite, do not copy\.\*\*/.test(contract));
  check("3 the contract forbids repairing producer artifacts",
    /never regenerate a producer-owned artifact/.test(flat(contract)));
}

// ---------------------------------------------------------------------------
// 4. Graceful degradation — absent knowledge is normal, never a blocker
// ---------------------------------------------------------------------------
{
  const consumer = flat(read("skills/repo-knowledge-consumer/SKILL.md"));
  check("4 the consumer skill never blocks", /This skill never blocks/i.test(consumer));
  check("4 an absent manifest is the normal case", /normal case, not an error/i.test(consumer));
  check("4 it falls back to full live derivation", /full live derivation/i.test(consumer));
  check("4 it derives exactly what is unavailable, and no more",
    /Derive exactly those, and no others/i.test(consumer));
  check("4 it reports drift rather than repairing it",
    /recommend `\/inspect-sync`|recommend `\/inspect`/i.test(consumer));

  const analyze = flat(read("commands/analyze-feature.md"));
  check("4 /analyze-feature does not stop when knowledge is unavailable",
    /Do not stop, do not ask permission, and do not ask the developer to run an inspection first/i.test(analyze));
  check("4 platform detection runs regardless of the manifest",
    /Platform detection always runs in full either way/i.test(analyze));
  check("4 platformHints is advisory only",
    /advisory corroboration only/i.test(analyze));
}

// ---------------------------------------------------------------------------
// 5. The decision boundary — facts are read, decisions are gated
// ---------------------------------------------------------------------------
{
  // The manifest may inform, but the platform a feature targets is a human decision.
  // This is the line the ownership model turns on, so it is asserted, not assumed.
  const contract = flat(read("docs/repo-knowledge-contract.md"));
  check("5 platformHints may never be authoritative for routing",
    /must never be used as the authoritative platform for routing/.test(contract));
  check("5 the consumer runs its own confirmation gate regardless",
    /own human confirmation gate regardless/.test(contract));

  const analyze = flat(read("commands/analyze-feature.md"));
  check("5 the confirmation gate is unconditional",
    /require confirmation before using it — always/i.test(analyze));
  check("5 exactly one platform and one device type are confirmed",
    /exactly \*\*one\*\* platform/.test(analyze) || /resolve to \*\*exactly one\*\* platform/.test(analyze));
}

// ---------------------------------------------------------------------------

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
