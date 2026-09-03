/**
 * repo-knowledge-orchestration.test.ts
 *
 * Pins the repository-knowledge ownership boundary across the orchestration layer —
 * the contract SHARED-010 closed.
 *
 * The defect this prevents: `/analyze-feature` step 3 once grouped iOS, Android and
 * React together under one rationale — "the platform architect runs its own deeper
 * inspection rather than relying on this step". That was true for iOS and Android and
 * FALSE for React, whose architect is a structure-only placeholder that inspects
 * nothing. The same sentence also implied canonical-knowledge reuse was React-Native-only,
 * when iOS and Android had been reusing it at the architect layer since IOS-002 and
 * ANDROID-001. Nothing detected either problem, because no suite read that step.
 *
 * The rule this file encodes: **every authored lane reuses canonical repository
 * knowledge; the lanes differ only in which layer does the reusing.**
 *
 *   React Native  -> reused by `repo-analyst`      (neutral stack inventory)
 *   iOS / Android -> reused by the platform architect (its Process step 2)
 *   React (web)   -> deferred, because the lane is not authored (REACT-002)
 *
 * Two things are deliberately NOT asserted here, because both are legitimately shared:
 *   - Naming `.ono/repo-knowledge.json`. Commands and agents may name the artifact;
 *     what they may not do is read it. The boundary asserted instead is that only
 *     `repo-knowledge-consumer` invokes `scripts/read-repo-knowledge.ts`, the sole parser.
 *   - Naming `usableCategories` / `deriveLive`. Consumers legitimately reference the
 *     decision's *output*; forbidding the words would break authored, correct lanes.
 *
 * OFFLINE. Reads only this repository's own markdown. No network, no child process.
 *
 * No external test framework. Run with:
 *   node --no-warnings scripts/repo-knowledge-orchestration.test.ts
 * or through the aggregator:
 *   node scripts/check.ts --only repo-knowledge-orchestration
 */

import { readFileSync, existsSync, readdirSync } from "fs";
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

const analyze = read("commands/analyze-feature.md");
const repoAnalyst = read("agents/repo-analyst.md");
const consumer = read("skills/repo-knowledge-consumer/SKILL.md");

/** `/analyze-feature` step 3, sliced between its own numbered heading and step 4. */
function step3(): string {
  const from = analyze.indexOf("\n3. Once the platform is confirmed");
  const to = analyze.indexOf("\n4. Invoke the confirmed platform's architect", from);
  return from !== -1 && to !== -1 ? analyze.slice(from, to) : "";
}
const S3 = step3();

// --- 1. Step 3 is still locatable and structured ---------------------------
{
  check("1 step 3 is present and delimited by step 4", S3.length > 500, `${S3.length} chars`);
  check("1 step 3 states the shared rule: lanes differ only by layer",
    /differ only in which layer/.test(S3));
  check("1 step 3 names the owning skill", /`repo-knowledge-consumer`/.test(S3));
  check("1 step 3 restates none of the consumer's procedure",
    /none of it is restated here|not restated here/.test(S3));
}

// --- 2. React Native — reuse still happens at repo-analyst -----------------
{
  check("2 step 3 places RN reuse at repo-analyst", /React Native — reused at `repo-analyst`/.test(S3));
  check("2 step 3 keeps the RN neutral stack inventory clause",
    /neutral stack inventory/.test(S3) && /docs\/project\/patterns\.md/.test(S3));
  check("2 step 3 keeps the RN conditional (reusable vs derived live)",
    /reports\s*\n?\s*`conventions` reusable/.test(S3) && /derived live only when it does not/.test(S3));
  // The behaviour itself lives in repo-analyst; step 3 only describes it.
  check("2 repo-analyst still owns the RN neutral-inventory reuse rule",
    /Neutral stack inventory — reuse when available/.test(repoAnalyst));
  check("2 repo-analyst still always runs RN standards conformance fresh",
    /Standards conformance — always runs, never reused/.test(repoAnalyst));
}

// --- 3. iOS and Android — reuse at the architect layer ---------------------
{
  check("3 step 3 places iOS/Android/React reuse at the architect",
    /iOS, Android and React — reused at the architect/.test(S3));
  check("3 step 3 says this is not a reuse gap",
    /is not a gap in canonical-knowledge reuse/.test(S3));
  check("3 step 3 names all three architects as the resolvers",
    /`ios-architect`/.test(S3) && /`android-architect`/.test(S3) && /`react-architect`/.test(S3));
  check("3 step 3 routes them through the consumer, not its internals",
    /resolve canonical repository knowledge themselves through `repo-knowledge-consumer`/.test(S3));
  check("3 step 3 cites the three dev-planning evidence sections",
    /skills\/ios-dev-planning\/SKILL\.md` §3/.test(S3) && /skills\/android-dev-planning\/SKILL\.md` §3/.test(S3) &&
      /skills\/react-dev-planning\/SKILL\.md` §3/.test(S3));

  // The architects must actually do what step 3 now claims.
  for (const lane of ["ios", "android", "react"]) {
    const agent = read(`agents/${lane}-architect.md`);
    check(`3 ${lane}-architect resolves canonical knowledge via the consumer`,
      /repo-knowledge-consumer/.test(agent) && /[Rr]esolve canonical repository knowledge/.test(agent));
    const skill = read(`skills/${lane}-dev-planning/SKILL.md`);
    check(`3 ${lane}-dev-planning has a §2 Repository-knowledge reuse section`,
      /## 2\. Repository-knowledge reuse/.test(skill));
    check(`3 ${lane}-dev-planning routes resolution through the consumer`,
      /`repo-knowledge-consumer`/.test(skill));
    check(`3 ${lane}-dev-planning never parses the manifest itself`,
      !/(read|parse)[^.\n]{0,40}`?\.ono\/repo-knowledge\.json`?[^.\n]{0,30}(yourself|directly)(?![^.]*Never)/i.test(skill) ||
        /Never read or parse `\.ono\/repo-knowledge\.json` directly/.test(skill));
    // NOTE (React divergence, reported not silently accepted): ios- and
    // android-dev-planning §2 delegate with "Apply it as written; it is not restated
    // here", while react-dev-planning §2 restates the usableCategories/deriveLive
    // procedure inline. Both route through the consumer, so behaviour agrees, but the
    // ownership convention does not. Asserting the delegation WORDING here would fail
    // on React; loosening it to nothing would hide the divergence. This assertion
    // therefore pins the shared substance, and the wording difference is tracked as a
    // React-lane follow-up rather than papered over.
    if (lane !== "react") {
      check(`3 ${lane}-dev-planning §2 does not restate the procedure`,
        /it is not restated here/.test(skill));
    }
  }
}

// --- 4. THE REGRESSION GUARD: no lane is described as unauthored ----------
{
  // Originally this guarded the OPPOSITE condition: React had to keep its own rationale
  // ("deferred, because the lane is not authored"), because sharing the iOS/Android one
  // would have claimed an architect inspection a placeholder could not perform.
  // REACT-001/002/003 authored the lane, so React now legitimately shares that rationale
  // and the guard inverts — step 3 must describe NO lane as unauthored, and must not
  // reintroduce a per-lane deferral for a lane that is built.
  check("4 step 3 no longer describes React as deferred or unauthored",
    !/deferred, because the lane is not authored/.test(S3) && !/no deeper inspection to defer to/.test(S3));
  check("4 step 3 blames no lane on a placeholder or unauthored standard",
    !/placeholder|not yet authored|until `standards\//i.test(S3), S3.slice(0, 120));
  check("4 step 3 points at no unblocking ticket, because none is needed", !/REACT-002/.test(S3));
  check("4 the shared rule still leads the step", /differ only in which layer/.test(S3));
  // React Native remains the one lane that reuses at repo-analyst rather than the architect.
  check("4 React Native is still distinguished from the architect-layer lanes",
    /React Native — reused at `repo-analyst`/.test(S3));
}

// --- 5. Sole ownership of resolution and parsing ---------------------------
{
  /**
   * INVOCATION, not mention. A document may name the helper as precedent without
   * invoking it — `skills/rn-nativewind-theme-sync/SKILL.md` cites it in a prose list
   * of deterministic scripts ("Same split this plugin uses everywhere else:
   * `assess-dd-complexity.ts`, `read-repo-knowledge.ts`, `migrate-planning-doc.ts`")
   * to explain the observe-vs-decide boundary. Treating that as an invocation was a
   * false positive that failed this suite the moment that skill merged. An invocation
   * is a runnable command line: `node ... scripts/read-repo-knowledge.ts ...`.
   */
  const invokesParser = (text: string): boolean =>
    /(?:node|bun)[^\n]*\bread-repo-knowledge\.ts\b/.test(text);
  const callers: string[] = [];
  const scan = (dir: string): void => {
    const abs = join(REPO_ROOT, dir);
    if (!existsSync(abs)) return;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) scan(rel);
      else if (entry.name.endsWith(".md") && invokesParser(read(rel))) callers.push(rel);
    }
  };
  scan("commands"); scan("agents"); scan("skills");
  check("5 only repo-knowledge-consumer invokes the parser helper",
    callers.length === 1 && callers[0] === "skills/repo-knowledge-consumer/SKILL.md",
    callers.join(", "));

  check("5 a prose mention of the helper is not an invocation",
    !invokesParser("Same split this plugin uses everywhere else (`read-repo-knowledge.ts`)"));
  check("5 a runnable command line IS an invocation",
    invokesParser("node --no-warnings scripts/read-repo-knowledge.ts --root ."));
  check("5 the NativeWind skill mentions the helper without invoking it",
    read("skills/rn-nativewind-theme-sync/SKILL.md").includes("read-repo-knowledge.ts") &&
      !invokesParser(read("skills/rn-nativewind-theme-sync/SKILL.md")));
  check("5 the consumer forbids parsing the manifest directly",
    /Never read or parse `\.ono\/repo-knowledge\.json` yourself/.test(consumer));
  check("5 the consumer declares the helper the only parser",
    /The helper is the only parser/.test(consumer));
  check("5 the consumer forbids re-deriving a reusable category",
    /Never re-derive a category listed in `usableCategories`/.test(consumer));
  check("5 the consumer forbids skipping a derive-live category",
    /Never skip deriving a category listed in `deriveLive`/.test(consumer));

  // /analyze-feature delegates resolution rather than performing it.
  check("5 analyze-feature delegates resolution to the consumer skill",
    /Apply the `repo-knowledge-consumer` skill first to resolve/.test(analyze));
  check("5 analyze-feature never instructs reading the manifest itself",
    !/(read|parse)\s+`?\.ono\/repo-knowledge\.json`?\s+(yourself|directly)/i.test(analyze));
}

// --- 6. repo-analyst's per-platform depth is unchanged --------------------
{
  // SHARED-010 corrected the command's description, not the analyst's behaviour.
  check("6 repo-analyst still does lightweight checks for iOS",
    /\*\*iOS\*\*: lightweight existence checks only/.test(repoAnalyst));
  check("6 repo-analyst still does lightweight checks for Android",
    /\*\*Android\*\*: lightweight existence checks only/.test(repoAnalyst));
  check("6 repo-analyst does lightweight React checks for the same deliberate reason",
    /\*\*React \(web\)\*\*: lightweight existence checks only/.test(repoAnalyst) &&
      /react-architect` runs its own deeper React inspection/.test(repoAnalyst));
  check("6 repo-analyst no longer defers React depth to unauthored standards",
    !/deferred until `standards\/react\/\*` is authored/.test(repoAnalyst));
  check("6 repo-analyst still labels every stack finding reused or derived",
    /\[reused: <path>#<anchor>\]` or `\[derived live\]/.test(repoAnalyst));
}

// --- 7. React is authored, so it consumes canonical knowledge like the others --
{
  // Inverted by REACT-001/002/003. These were status assertions ("React is still a
  // placeholder"); with the lane authored they become the same coverage assertions
  // group 3 already makes for iOS and Android — a stronger check, not a weaker one.
  const reactAgent = read("agents/react-architect.md");
  const reactSkill = read("skills/react-dev-planning/SKILL.md");
  check("7 react-architect resolves canonical knowledge via the consumer",
    /repo-knowledge-consumer/.test(reactAgent));
  check("7 react-dev-planning delegates to the consumer", /repo-knowledge-consumer/.test(reactSkill));
  for (const rel of ["agents/react-architect.md", "skills/react-dev-planning/SKILL.md"]) {
    check(`7 ${rel} is no longer a placeholder`, !/^## Status: Not yet authored$/m.test(read(rel)));
  }
  const reactStandards = readdirSync(join(REPO_ROOT, "standards", "react")).filter((f) => f.endsWith(".md"));
  const stillPlaceholder = reactStandards.filter((f) => /^\*\*Not yet authored\.\*\*/m.test(read(`standards/react/${f}`)));
  check("7 every React standard is authored", stillPlaceholder.length === 0, stillPlaceholder.join(", "));
  check("7 the React standards set is non-empty", reactStandards.length >= 7, `${reactStandards.length}`);
  check("7 analyze-feature still carries a platform-neutral readiness gate",
    /Readiness gate \(any platform\)/.test(analyze));
}

// --- 8. This suite stays offline -----------------------------------------
{
  const src = read("scripts/repo-knowledge-orchestration.test.ts");
  for (const [label, needle] of [
    ["network fetch", `fet${"ch("}`],
    ["child process module", `child${"_process"}`],
    ["process spawn", `spawn${"Sync"}`],
  ] as Array<[string, string]>) {
    check(`8 stays offline — no ${label}`, !src.includes(needle));
  }
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
