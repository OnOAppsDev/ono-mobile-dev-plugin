/**
 * device-type-contract.test.ts
 *
 * Pins the mobile-vs-TV context contract — the contract DOC-002 closed.
 *
 * Four rules, asserted wherever a component is responsible for one of them:
 *
 *   P  `platform` and `device_type` are separate dimensions.
 *   E  `device_type` is exactly `mobile` or `tv`. There is no `mixed`.
 *   C  TV is a context INSIDE a platform, never a platform of its own — Apple TV is
 *      `ios` + `tv`, Android TV is `android` + `tv`, Smart TV is `react` + `tv`.
 *   D  `device_type` never silently defaults to `mobile`.
 *
 * Why this file exists: before it, the load-bearing clause in `/implement-task` §5 —
 * "never default to `mobile` and never re-detect it here" — was protected by nothing.
 * All 14 suites stayed green with it deleted. `document-chain` asserts the value is
 * carried and valid, and `migrate-planning-doc` asserts it is never inferred, but no
 * suite read the prose that makes the rule binding on Claude.
 *
 * It also closes the one substantive hole DOC-002 found: **`react-native` + `tv` was
 * reachable but undefined.** `repo-analyst` treats `react-native-tvos` as a decisive TV
 * marker and the confirmation gate lets a developer pick `tv` for any platform, yet the
 * React Native lane said only "mobile-only, no TV branch" — never what to do when `tv`
 * actually arrived. The defined behaviour is now stop-and-report, owned by
 * `rn-dev-planning` and followed by `rn-architect`.
 *
 * DELIBERATE NON-OVERLAP. This suite does NOT assert the React Native implementation
 * lane's `device_type` silence. `rn-implementation-contract.test.ts` group 10 owns that
 * exclusion (10 assertions over `agents/rn-feature-developer.md` and
 * `skills/rn-feature-implementation/SKILL.md`) plus group 6's pair — the command passes
 * `device_type`, the skill's Inputs deliberately omits it. Duplicating it here would
 * create two places to update and two chances to disagree.
 *
 * OFFLINE. Reads only this repository's own markdown.
 *
 * No external test framework. Run with:
 *   node --no-warnings scripts/device-type-contract.test.ts
 * or through the aggregator:
 *   node scripts/check.ts --only device-type-contract
 */

import { readFileSync, readdirSync, existsSync } from "fs";
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
/** Collapse hard-wrapped markdown so a rule split across lines still matches. */
const flat = (s: string): string => s.replace(/\s+/g, " ");

// --- 1. /implement-task owns the enum, the stop, and the no-default rule ---
{
  const cmd = flat(read("commands/implement-task.md"));

  check("1 states the enum exactly", /exactly `mobile` or `tv`/.test(cmd));
  check("1 rejects `mixed` explicitly", /including `mixed`/.test(cmd));
  check("1 stops on a missing, invalid or conflicting value",
    /stop and report the exact condition/.test(cmd));
  check("1 NEVER defaults to mobile", /never default to `mobile`/.test(cmd));
  check("1 never re-detects device_type", /never re-detect it here/.test(cmd));
  check("1 resolves from the row, else the breakdown frontmatter",
    /resolved from the selected task row if it carries one, otherwise from the Task Breakdown/.test(cmd));

  // P + C at the shared layer: device_type is a separate dimension that does not route.
  check("1 device_type does not change platform routing",
    /does \*\*not\*\* change platform routing/.test(cmd));
  check("1 a tv task runs on the same platform agent and skill",
    /a `tv` task runs on the same platform feature-developer agent \+ feature-implementation skill as a `mobile` task/.test(cmd));
  check("1 passes device_type to the platform lane as authoritative context",
    /passed through as authoritative context/.test(cmd));
}

// --- 2. The authored platform lanes: TV is context, never a platform ------
{
  for (const [lane, agent, skill] of [
    ["android", "agents/android-architect.md", "skills/android-dev-planning/SKILL.md"],
    ["ios", "agents/ios-architect.md", "skills/ios-dev-planning/SKILL.md"],
  ] as const) {
    const a = flat(read(agent));
    const s = flat(read(skill));

    check(`2 ${lane}-architect takes the confirmed context as given`,
      /device_type/.test(a) && /(never re-detect|Do not re-run detection|never re-detecting)/i.test(a));
    check(`2 ${lane}-architect declares TV is not a separate platform`,
      /[Nn]ever treat (TV|Apple TV) as a separate platform/.test(a));
    check(`2 ${lane}-architect forbids silent mobile assumptions on tv`,
      /Never silently apply mobile\/touch assumptions/.test(a));
    check(`2 ${lane}-dev-planning declares TV a context signal, not a platform`,
      /is a context signal, never a separate platform/.test(s));
    check(`2 ${lane}-dev-planning branches on both device types`,
      /`device_type: mobile`/.test(s) && /`device_type: tv`/.test(s));
    check(`2 ${lane}-dev-planning names no TV platform value`,
      /there is no TV platform value/.test(s));
  }

  // Review has no upstream frontmatter, so it infers rather than demanding.
  const acr = flat(read("skills/android-code-review/SKILL.md"));
  check("2 android-code-review handles device_type at review",
    /## 12\. `device_type` handling at review/.test(acr));
  check("2 android-code-review infers, never demands", /Infer, never demand/.test(acr));
  check("2 android-code-review files no finding against a nonexistent TV rule",
    /Never file a TV finding against a rule that does not exist/.test(acr));
  check("2 android-code-review never applies touch assumptions to TV",
    /Never apply touch or gesture assumptions to a TV surface/.test(acr));
}

// --- 3. THE DOC-002 GUARD: react-native + tv stops, and never falls through
{
  const skill = flat(read("skills/rn-dev-planning/SKILL.md"));
  const agent = flat(read("agents/rn-architect.md"));

  check("3 rn-dev-planning still declares the lane mobile-only",
    /React Native is mobile-only here/.test(skill));
  check("3 rn-dev-planning declares react-native + tv unsupported",
    /`platform: react-native` with `device_type: tv` is unsupported/.test(skill));
  check("3 rn-dev-planning stops and reports rather than continuing",
    /report the unsupported context and stop/.test(skill) &&
    /stop and report that React Native TV is not supported/.test(skill));
  check("3 rn-dev-planning names the confirmed context in the report",
    /naming the confirmed `platform` and `device_type`/.test(skill));
  check("3 rn-dev-planning forbids planning it as mobile",
    /Never plan it as mobile/.test(skill));
  check("3 rn-dev-planning forbids inventing an RN TV branch or standard",
    /Never invent an RN TV branch, an RN TV standard, or an RN TV convention/.test(skill));
  check("3 rn-dev-planning forbids rerouting to another lane",
    /Do not route elsewhere/.test(skill));
  check("3 rn-dev-planning records why the combination is reachable",
    /react-native-tvos/.test(skill) && /confirmation gate/.test(skill));
  check("3 rn-dev-planning frames the stop as defined behaviour, not a gap",
    /this stop \*\*is\*\* the defined behaviour/.test(skill));

  check("3 rn-architect follows the rule and stops",
    /report the unsupported context and stop/.test(agent));
  check("3 rn-architect defers ownership to the skill",
    /per `skills\/rn-dev-planning\/SKILL\.md`'s Overview, which owns the rule/.test(agent));
  check("3 rn-architect repeats neither the rationale nor a TV methodology",
    !/react-native-tvos/.test(agent) && !/discovery pass/.test(agent));
}

// --- 4. RN TV is unsupported, not merely unauthored -----------------------
{
  // A placeholder lane is "not yet authored" and opens when authored. RN TV is a
  // product decision that does not exist — the two must not be conflated.
  const skill = flat(read("skills/rn-dev-planning/SKILL.md"));
  check("4 the stop is not described as a placeholder awaiting authoring",
    /not a placeholder lane awaiting authoring/.test(skill));
  check("4 RN TV support is named a separate product and architecture decision",
    /separate product and architecture decision/.test(skill));
  // Enumerate the directory rather than a remembered list: a rename (the RN coding-standards
  // document was renamed once already) must not make this assertion crash or, worse,
  // silently stop checking a file that quietly dropped out of a hard-coded array.
  const rnStandards = readdirSync(join(REPO_ROOT, "standards", "react-native")).filter((f) => f.endsWith(".md"));
  check("4 the react-native standards directory is non-empty", rnStandards.length >= 6, `${rnStandards.length}`);
  const withTv = rnStandards.filter((f) => /\btvos\b|Platform\.isTV|android tv|apple tv/i.test(read(`standards/react-native/${f}`)));
  check("4 no react-native standard carries TV rules", withTv.length === 0, withTv.join(", "));
}

// --- 5. Nothing else moved -----------------------------------------------
{
    // Inverted by REACT-001/002/003. DOC-002 asserted React carried no device_type
    // methodology because the lane was scaffolding; REACT-003 authored the Smart TV
    // context, so the correct assertion is the one iOS and Android already satisfy.
    for (const rel of ["agents/react-architect.md", "skills/react-dev-planning/SKILL.md"]) {
      const t = read(rel);
      check(`5 ${rel} is no longer a placeholder`, !/^## Status: Not yet authored$/m.test(t));
      check(`5 ${rel} carries device_type methodology`, /device_type/.test(t));
    }
    const reactSkill = flat(read("skills/react-dev-planning/SKILL.md"));
    check("5 react-dev-planning branches on both device types",
      /`device_type: mobile`/.test(reactSkill) && /`device_type: tv`/.test(reactSkill));
    check("5 the React Smart TV standard exists",
      existsSync(join(REPO_ROOT, "standards", "react", "react-smart-tv.md")));
    check("5 the React lane cites its Smart TV standard",
      /react-smart-tv/.test(read("skills/react-dev-planning/SKILL.md")));
  // repo-analyst keeps owning resolution, including the marker that makes RN+tv reachable.
  const ra = flat(read("agents/repo-analyst.md"));
  check("5 repo-analyst still owns device-type resolution",
    /resolve the \*\*device type\*\* for the current workflow/.test(ra));
  check("5 repo-analyst still treats react-native-tvos as a decisive TV marker",
    /`react-native-tvos`/.test(ra));
  check("5 repo-analyst still has no mixed device type", /no `mixed` device type/.test(ra));
  check("5 repo-analyst still stops and asks when the target is undeterminable",
    /stop and ask the human to pick `mobile` or `tv`/.test(ra));

  // README documents the model for humans (DOC-001).
  const readme = flat(read("README.md"));
  check("5 README documents the model", /### Mobile vs\. TV/.test(readme));
  check("5 README states TV is a context inside a platform",
    /TV is a context inside a platform, never another platform/.test(readme));
  check("5 README states React Native is mobile-only",
    /React Native is deliberately mobile-only/.test(readme));
}

// --- 6. This suite stays offline ----------------------------------------
{
  const src = read("scripts/device-type-contract.test.ts");
  for (const [label, needle] of [
    ["network fetch", `fet${"ch("}`],
    ["child process module", `child${"_process"}`],
    ["process spawn", `spawn${"Sync"}`],
  ] as Array<[string, string]>) {
    check(`6 stays offline — no ${label}`, !src.includes(needle));
  }
  // Guard the non-overlap this file documents: the RN implementation exclusion is
  // owned by rn-implementation-contract.test.ts and must not be re-asserted here.
  // The check inspects executable `read(...)` calls only — the header comment names
  // those two paths on purpose, so a plain substring search would match itself.
  check("6 reads no file from the RN implementation lane",
    !/read\("[^"]*rn-feature-(implementation|developer)/.test(src));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
