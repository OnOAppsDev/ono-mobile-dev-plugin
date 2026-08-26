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
  check("3 step 3 places iOS/Android reuse at the architect",
    /iOS and Android — reused at the architect/.test(S3));
  check("3 step 3 says this is not a reuse gap",
    /is not a gap in canonical-knowledge reuse/.test(S3));
  check("3 step 3 names both architects as the resolvers",
    /`ios-architect`/.test(S3) && /`android-architect`/.test(S3));
  check("3 step 3 routes them through the consumer, not its internals",
    /resolve canonical repository knowledge themselves through `repo-knowledge-consumer`/.test(S3));
  check("3 step 3 cites the two dev-planning evidence sections",
    /skills\/ios-dev-planning\/SKILL\.md` §3/.test(S3) && /skills\/android-dev-planning\/SKILL\.md` §3/.test(S3));

  // The architects must actually do what step 3 now claims.
  for (const lane of ["ios", "android"]) {
    const agent = read(`agents/${lane}-architect.md`);
    check(`3 ${lane}-architect resolves canonical knowledge via the consumer`,
      /repo-knowledge-consumer/.test(agent) && /[Rr]esolve canonical repository knowledge/.test(agent));
    const skill = read(`skills/${lane}-dev-planning/SKILL.md`);
    check(`3 ${lane}-dev-planning §2 delegates to the consumer`,
      /## 2\. Repository-knowledge reuse/.test(skill) &&
      /consumed through the `repo-knowledge-consumer` skill/.test(skill));
    check(`3 ${lane}-dev-planning §2 does not restate the procedure`,
      /it is not restated here/.test(skill));
  }
}

// --- 4. THE REGRESSION GUARD: React keeps its own, true rationale ----------
{
  check("4 step 3 gives React a separate bullet", /React \(web\) — deferred, because the lane is not authored/.test(S3));
  check("4 React's reason is the unauthored lane, not an architect inspection",
    /no deeper inspection to defer to/.test(S3));
  check("4 step 3 names REACT-002 as the unblocking work", /REACT-002/.test(S3));
  check("4 step 3 defers to the step-4 readiness gate rather than compensating",
    /readiness gate stops the run/.test(S3) && /do not compensate for the missing lane/.test(S3));

  // The precise shape of the old defect: React sharing iOS/Android's rationale.
  const grouped = /iOS\/Android\/React|iOS, Android and React|iOS \/ Android \/ React/.test(S3);
  check("4 iOS, Android and React are NOT collapsed into one rationale", !grouped);

  // And its mirror: attributing iOS/Android depth to unauthored standards.
  const iosAndroidBullet = /\*\*iOS and Android[\s\S]*?(?=\n   - \*\*React|\n\n)/.exec(S3)?.[0] ?? "";
  check("4 the iOS/Android bullet blames no placeholder or unauthored standard",
    !/placeholder|not yet authored|until `standards\//i.test(iosAndroidBullet),
    iosAndroidBullet.slice(0, 90));
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
  check("6 repo-analyst still defers React depth to authored standards",
    /deferred until `standards\/react\/\*` is authored/.test(repoAnalyst));
  check("6 repo-analyst still labels every stack finding reused or derived",
    /\[reused: <path>#<anchor>\]` or `\[derived live\]/.test(repoAnalyst));
}

// --- 7. React remains a placeholder, with no methodology authored here ----
{
  for (const rel of ["agents/react-architect.md", "skills/react-dev-planning/SKILL.md"]) {
    const text = read(rel);
    check(`7 ${rel} is still marked not yet authored`, /^## Status: Not yet authored$/m.test(text));
    check(`7 ${rel} carries no repository-knowledge methodology`,
      !/repo-knowledge-consumer|usableCategories|deriveLive/.test(text));
  }
  const reactStandards = readdirSync(join(REPO_ROOT, "standards", "react")).filter((f) => f.endsWith(".md"));
  const authored = reactStandards.filter((f) => !/^\*\*Not yet authored\.\*\*/m.test(read(`standards/react/${f}`)));
  check("7 all six React standards are still placeholders", authored.length === 0, authored.join(", "));
  check("7 analyze-feature still gates the React architect route",
    /Readiness gate — React/.test(analyze) && /not yet authored/.test(analyze));
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
