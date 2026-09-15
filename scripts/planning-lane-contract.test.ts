/**
 * planning-lane-contract.test.ts
 *
 * The Planning lane's boundary conditions, written before the lane is refactored and
 * green on the current architecture. Thirteen properties, each a way the shared-planning
 * migration could silently go wrong:
 *
 *   1  exactly one planning lane per confirmed platform, none shared
 *   2  platform and device_type are authoritative after confirmation, never re-detected
 *   3  React Native + TV is an unsupported STOP, not a silent mobile fallback
 *   4  iOS / Android / React device_type handling is unchanged
 *   5  repository-knowledge reuse and its degradation path are unchanged
 *   6  evidence labelling survives: [evidence:] [reused:] [inference] [unknown]
 *   7  the Existing / Required / Recommended / Unresolved classification survives
 *   8  standards-readiness semantics are unchanged
 *   9  /analyze-feature's approval flow is unchanged
 *  10  /dev-design-start consumes an approved analysis and produces the same DD contract
 *  11  /dev-feature-start consumes an approved DD and produces the same breakdown contract
 *  12  no component loads another platform's standards
 *  13  every platform standard ID and path is unchanged
 *
 * WHY THIS IS WRITTEN FIRST. The planning lane is the one place where three separate
 * contracts meet: the human confirmation gate at /analyze-feature, the repository-knowledge
 * contract with ono-project-inspector, and the DD schema owned by dev-design-start. A
 * shared-architect refactor touches the middle of that without owning any of the three, so
 * the properties have to be pinned before anything moves.
 *
 * TWO PROPERTIES ARE LOAD-BEARING AND EASY TO LOSE:
 *
 *   Property 3 — React Native + TV. RN is mobile-only; the combination is reachable
 *   (repo-analyst treats react-native-tvos as a decisive TV marker, and a developer can
 *   select tv at the confirmation gate) and the RN lane must STOP rather than plan it as
 *   mobile. There is no RN TV standard to cite and no other lane to fall back to.
 *
 *   Property 5 — an absent repository-knowledge manifest is the NORMAL case. The planning
 *   lane must degrade to live derivation without blocking, and must never tell a developer
 *   to go run an inspection first. That is the contract with ono-project-inspector, and it
 *   is the single easiest thing to break while moving text between components.
 *
 * OFFLINE. Reads only this repository's own markdown.
 *
 * No external test framework. Run with:
 *   node --no-warnings scripts/planning-lane-contract.test.ts
 * or through the aggregator:
 *   node scripts/check.ts --only planning-lane
 */

import { readFileSync, existsSync } from "fs";
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
const has = (rel: string): boolean => existsSync(join(REPO_ROOT, rel));

const PLATFORMS = LANES.map((l) => ({
  lane: l.lane,
  prefix: l.prefix,
  standardsDir: l.standardsDir,
  skill: `skills/${l.prefix}dev-planning/SKILL.md`,
  architect: `agents/${l.prefix}architect.md`,
}));

const ANALYZE = "commands/analyze-feature.md";
const DESIGN = "commands/dev-design-start.md";
const FEATURE = "commands/dev-feature-start.md";

/** Everything a given platform's planning route can load today. */
const route = (p: (typeof PLATFORMS)[number]): string =>
  read(p.skill) + "\n" + read(p.architect) + "\n" + read("skills/dev-design-start/SKILL.md");

// ---------------------------------------------------------------------------
// 1. One planning lane per confirmed platform
// ---------------------------------------------------------------------------
{
  check("1 four planning lanes are registered", PLATFORMS.length === 4, `${PLATFORMS.length}`);
  const lanes = new Set<string>();
  for (const p of PLATFORMS) {
    check(`1 ${p.lane} planning skill exists`, has(p.skill));
    check(`1 ${p.lane} architect exists`, has(p.architect));
    lanes.add(`${p.prefix}dev-planning`);
  }
  check("1 no planning lane is shared by two platforms", lanes.size === 4, `${lanes.size}`);
  // All three planning commands must name every lane's route target.
  for (const cmd of [ANALYZE, DESIGN, FEATURE]) {
    const t = read(cmd);
    const named = PLATFORMS.filter((p) =>
      new RegExp("`" + p.prefix + "architect`").test(t) ||
      new RegExp("`" + p.prefix + "dev-planning`").test(t)).length;
    check(`1 ${cmd} names all four planning routes`, named === 4, `${named}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Confirmed context is authoritative and never re-detected
// ---------------------------------------------------------------------------
{
  const a = flat(read(ANALYZE));
  check("2 /analyze-feature resolves exactly one platform and one device type",
    /resolve to \*\*exactly one\*\* platform/.test(a));
  check("2 there is no mixed authoritative platform",
    /There is no `mixed` authoritative platform/.test(a));
  const d = flat(read(DESIGN));
  check("2 /dev-design-start never re-detects the platform",
    /Never re-detect the platform here/.test(d));
  check("2 /dev-design-start reads the confirmed platform from frontmatter",
    /carried in the approved feature analysis's frontmatter/.test(d));
  const f = flat(read(FEATURE));
  check("2 /dev-feature-start carries exactly one confirmed platform",
    /exactly one confirmed platform \(never `mixed`\)/.test(f));
  // Each lane treats the confirmed context as given.
  for (const p of PLATFORMS) {
    const t = flat(route(p));
    check(`2 ${p.lane} route treats the confirmed context as authoritative`,
      /never re-detect|Never re-detect|Take the confirmed context as given|carried in frontmatter/i.test(t));
  }
}

// ---------------------------------------------------------------------------
// 3. React Native + TV is an unsupported STOP
// ---------------------------------------------------------------------------
{
  const rn = flat(route(PLATFORMS.find((p) => p.lane === "react-native")!));
  check("3 RN declares itself mobile-only in the planning lane",
    /React Native is mobile-only/i.test(rn));
  check("3 RN + tv is reported as an unsupported context and stopped",
    /unsupported.{0,80}report the unsupported context and stop|stop and report that React Native TV is not supported/i.test(rn));
  check("3 RN never plans a tv context as mobile", /Never plan it as mobile/i.test(rn));
  check("3 RN never invents a TV branch, standard or convention",
    /Never invent an RN TV branch/i.test(rn));
  check("3 RN does not route a tv context to another lane",
    /Do not route elsewhere/i.test(rn));
  check("3 the RN+tv combination is acknowledged as reachable",
    /combination is reachable/i.test(rn));
}

// ---------------------------------------------------------------------------
// 4. iOS / Android / React device_type handling is unchanged
// ---------------------------------------------------------------------------
{
  for (const lane of ["ios", "android", "react"]) {
    const p = PLATFORMS.find((x) => x.lane === lane)!;
    const t = read(p.skill);
    check(`4 ${lane} lane has a device_type section`,
      /^#{2,3} .{0,12}`device_type`.{0,20}$/m.test(t) || /device_type. handling/.test(t));
    check(`4 ${lane} lane handles both mobile and tv`,
      /device_type: mobile/.test(t) && /device_type: tv/.test(t));
  }
  // TV is a context inside a platform, never a fifth platform.
  const a = flat(read(ANALYZE));
  check("4 device type is exactly mobile or tv, with no mixed",
    /exactly one device type \(`mobile` \/ `tv`\)|no `mixed` device type/.test(a));
  check("4 React TV additively enables its own standard family",
    /REACT-TV-/.test(read(PLATFORMS.find((p) => p.lane === "react")!.skill)));
}

// ---------------------------------------------------------------------------
// 5. Repository-knowledge reuse and degradation are unchanged
// ---------------------------------------------------------------------------
{
  check("5 the single reader skill exists", has("skills/repo-knowledge-consumer/SKILL.md"));
  const consumer = flat(read("skills/repo-knowledge-consumer/SKILL.md"));
  check("5 the consumer never blocks", /This skill never blocks/i.test(consumer));
  check("5 an absent manifest is the normal case", /normal case, not an error/i.test(consumer));
  check("5 it falls back to full live derivation", /full live derivation/i.test(consumer));
  check("5 it derives exactly what is unavailable and no more",
    /Derive exactly those, and no others/i.test(consumer));

  const a = flat(read(ANALYZE));
  check("5 /analyze-feature never stops when knowledge is unavailable",
    /Do not stop, do not ask permission, and do not ask the developer to run an inspection first/i.test(a));
  check("5 platform detection runs in full regardless of the manifest",
    /Platform detection always runs in full either way/i.test(a));
  check("5 platformHints is advisory corroboration only",
    /advisory corroboration only/i.test(a));

  // Every planning route resolves knowledge through the one reader, never by parsing.
  for (const p of PLATFORMS) {
    const t = flat(route(p));
    check(`5 ${p.lane} route resolves knowledge through repo-knowledge-consumer`,
      /repo-knowledge-consumer/.test(t));
    check(`5 ${p.lane} route never parses the manifest itself`,
      !/\bparse\b[^.]{0,40}\.ono\/repo-knowledge\.json/i.test(t) ||
      /[Nn]ever parse `?\.ono\/repo-knowledge\.json`? yourself/.test(t));
  }
}

// ---------------------------------------------------------------------------
// 6. Evidence labelling survives
// ---------------------------------------------------------------------------
{
  const LABELS = ["\\[evidence: ", "\\[reused: ", "\\[inference\\]", "\\[unknown"];
  for (const p of PLATFORMS) {
    const t = route(p);
    for (const l of LABELS) {
      check(`6 ${p.lane} route carries ${l.replace(/\\\\/g, "")}`, new RegExp(l).test(t));
    }
    check(`6 ${p.lane} route calls an unlabelled repository claim a defect`,
      /unlabelled (claim about the repository|repository claim|claim) is a defect/i.test(flat(t)));
  }
}

// ---------------------------------------------------------------------------
// 7. Existing / Required / Recommended / Unresolved classification survives
// ---------------------------------------------------------------------------
{
  const shared = flat(read("skills/dev-design-start/SKILL.md"));
  check("7 the shared design skill defines the classification",
    /Classification: Existing, Required, Recommended, Unresolved/i.test(shared));
  check("7 optional modernisation is never folded into required work",
    /never folded into required work|reported to the developer, never folded/i.test(shared) ||
    PLATFORMS.some((p) => /never folded into required work/i.test(flat(route(p)))));
  for (const p of PLATFORMS) {
    const t = flat(route(p));
    check(`7 ${p.lane} route carries all four classes`,
      /Existing/.test(t) && /Required/.test(t) &&
      /Recommended|Optional/.test(t) && /Unresolved|Open Decisions/.test(t));
  }
}

// ---------------------------------------------------------------------------
// 8. Standards-readiness semantics unchanged
// ---------------------------------------------------------------------------
{
  for (const p of PLATFORMS) {
    const t = flat(route(p));
    check(`8 ${p.lane} route has a standards readiness gate`,
      /[Ss]tandards readiness/.test(t));
    check(`8 ${p.lane} route stops rather than falling back to assumed defaults`,
      /do not fall back to assumed defaults|never fall back to assumed defaults|do not silently fall back/i.test(t));
  }
  // The command-level gate is a hard stop for planning, and must stay one.
  const a = flat(read(ANALYZE));
  check("8 /analyze-feature stops on an unauthored lane",
    /stop with: "Platform architecture methodology for/.test(a));
  check("8 /analyze-feature does not fall back to another platform's architect",
    /do not fall back to another platform's architect/.test(a));
}

// ---------------------------------------------------------------------------
// 9. /analyze-feature approval flow unchanged
// ---------------------------------------------------------------------------
{
  const a = flat(read(ANALYZE));
  check("9 confirmation is required always, even at high confidence",
    /require confirmation before using it — always/i.test(a));
  check("9 a multi-platform repo gets no 'Yes, continue' path",
    /do not offer a "Yes, continue" path/i.test(a));
  check("9 the design-reference gate is mandatory for UI-changing work",
    /mandatory when it does/i.test(a));
  check("9 non-UI work is not asked for a design reference",
    /do not ask for Figma or any other design input/i.test(a));
  check("9 the output starts as status: proposed", /status: proposed/.test(a));
}

// ---------------------------------------------------------------------------
// 10-11. The document chain contracts
// ---------------------------------------------------------------------------
{
  const d = flat(read(DESIGN));
  check("10 /dev-design-start requires an approved feature analysis",
    /approved feature analysis/i.test(d));
  check("10 it routes exactly one architect for the confirmed platform",
    /invoke \*\*exactly one\*\* architect matching that confirmed platform/i.test(d));
  check("10 it never splits a feature across platforms",
    /never split the feature across multiple platforms/i.test(d));
  check("10 the DD's section rules stay with the shared design skill",
    /the `dev-design-start` skill methodology \(shared mechanics\)/.test(d));

  const f = flat(read(FEATURE));
  check("11 /dev-feature-start consumes an approved DD",
    /approved \*\*DD\*\*|approved DD/i.test(f));
  check("11 it invokes exactly one planning skill and one architect",
    /invoke exactly one planning skill and one architect/i.test(f));
  check("11 every task row is tagged with the confirmed platform",
    /every task row is tagged with that same platform/i.test(f));
  check("11 the DD package fields are not decomposition inputs",
    /not decomposition inputs|Never branch on either/i.test(f));
}

// ---------------------------------------------------------------------------
// 12. No cross-platform standards loading
// ---------------------------------------------------------------------------
{
  const dirs = new Set(PLATFORMS.map((p) => p.standardsDir));
  const NEG = /\b(do not|don't|never|not|rather than|instead of|no\b|forbid|unsupported|excluded|separate)\b/i;
  for (const p of PLATFORMS) {
    for (const rel of [p.skill, p.architect]) {
      const cited = new Set<string>();
      for (const line of read(rel).split("\n")) {
        for (const sentence of line.split(/(?<=[.:;])\s+/)) {
          if (NEG.test(sentence)) continue;
          for (const m of sentence.matchAll(/`standards\/([a-z-]+)\//g)) cited.add(m[1]);
        }
      }
      const foreign = [...cited].filter((d) => dirs.has(d) && d !== p.standardsDir);
      check(`12 ${rel} cites only its own lane`, foreign.length === 0, foreign.join(", "));
    }
  }
}

// ---------------------------------------------------------------------------
// 13. Standards IDs and paths unchanged
// ---------------------------------------------------------------------------
{
  let paths = 0;
  for (const p of PLATFORMS) {
    for (const rel of [p.skill, p.architect]) {
      for (const m of read(rel).matchAll(/`(standards\/[A-Za-z0-9._/-]+\.md)`/g)) {
        paths++;
        check(`13 ${rel} → ${m[1]} resolves`, has(m[1]));
      }
    }
    const roots = new Set<string>();
    for (const m of read(p.skill).matchAll(/`([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)-\*`/g)) roots.add(m[1]);
    check(`13 ${p.lane} lane cites ID roots`, roots.size > 0, `${roots.size}`);
  }
  check(`13 the planning lane cites standards at all (${paths})`, paths >= 20, `${paths}`);
}

// ---------------------------------------------------------------------------

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
