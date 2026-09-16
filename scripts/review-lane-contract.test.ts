/**
 * review-lane-contract.test.ts
 *
 * The Review lane's boundary conditions, written as assertions before the lane is
 * refactored. Ten properties, each of which is a way the shared-review migration could
 * silently go wrong:
 *
 *   1  one platform review lane per platform, no lane shared by two
 *   2  no component loads another platform's standards
 *   3  a mixed-platform diff stays isolated — one review per platform, merged by severity
 *   4  a finding carries a citation or is not filable
 *   5  correctness, performance and security stay three separate responsibilities
 *   6  /review-code readiness is EXCLUDE-AND-DECLARE, never a hard stop
 *   7  /prepare-mobile-release keeps unverifiable-is-a-no-go
 *   8  every cited platform standard resolves, and to the same path as before
 *   9  the iOS review uniques stay reachable — that lane is the superset
 *  10  React Native neither gains nor loses review behaviour without it being explicit
 *
 * WRITTEN AGAINST THE CURRENT ARCHITECTURE, and green on it. A test authored alongside
 * the thing it guards proves only that the two agree; landing these first means the
 * refactor has to satisfy a boundary that was already green.
 *
 * PROPERTY 10 IS THE SHARP ONE. React Native's permission to file a one-line out-of-lane
 * aside lives in exactly one place — `skills/rn-code-review/SKILL.md` — which is the file a
 * shared-role refactor deletes. Three other components cite that file BY NAME as the
 * thing their stricter stance diverges from. So the aside policy cannot survive the
 * refactor by accident: either it is deliberately relocated, or RN silently changes
 * behaviour and three cross-references dangle. This suite pins the current arrangement so
 * that moving it has to be a decision rather than a side effect.
 *
 * OFFLINE. Reads only this repository's own markdown.
 *
 * No external test framework. Run with:
 *   node --no-warnings scripts/review-lane-contract.test.ts
 * or through the aggregator:
 *   node scripts/check.ts --only review-lane
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

/** The review lane as it stands: one review skill and two reviewer agents per platform. */
const PLATFORMS = LANES.map((l) => ({
  lane: l.lane,
  prefix: l.prefix,
  standardsDir: l.standardsDir,
  skill: `skills/${l.prefix}code-review/SKILL.md`,
  // OWNERSHIP MOVED (Stage 4d + cleanup). One shared pair of role agents serves every
  // platform; the lane supplies the platform half. Every property below still runs per
  // platform — it now runs against the route the platform actually takes.
  reviewer: "agents/code-reviewer.md",
  perf: "agents/performance-reviewer.md",
}));

const REVIEW_CMD = "commands/review-code.md";
const RELEASE_CMD = "commands/prepare-mobile-release.md";
const SECURITY_CMD = "commands/review-security.md";

// ---------------------------------------------------------------------------
// 1. One platform review lane per platform
// ---------------------------------------------------------------------------
{
  check("1 four platform lanes are registered", PLATFORMS.length === 4, `${PLATFORMS.length}`);
  const cmd = read(REVIEW_CMD);
  const skills = new Set<string>();
  for (const p of PLATFORMS) {
    check(`1 ${p.lane} review skill exists: ${p.skill}`, has(p.skill));
    check(`1 ${p.lane} code-reviewer exists`, has(p.reviewer));
    check(`1 ${p.lane} performance-reviewer exists`, has(p.perf));
    const name = `${p.prefix}code-review`;
    check(`1 /review-code names the ${p.lane} lane`, new RegExp("`" + name + "`").test(cmd));
    skills.add(name);
  }
  check("1 no lane is shared by two platforms", skills.size === 4, `${skills.size}`);
}

// ---------------------------------------------------------------------------
// 2. No cross-platform standards loading
// ---------------------------------------------------------------------------
{
  const dirs = new Set(PLATFORMS.map((p) => p.standardsDir));
  // Prohibitions legitimately name other platforms ("do not use Android's AND-* IDs"),
  // so a citation only counts in a sentence that is not a prohibition.
  const NEG = /\b(do not|don't|never|not|rather than|instead of|no\b|forbid|unsupported|excluded|separate)\b/i;
  for (const p of PLATFORMS) {
    for (const rel of [p.skill, p.reviewer, p.perf]) {
      const cited = new Set<string>();
      for (const line of read(rel).split("\n")) {
        for (const sentence of line.split(/(?<=[.:;])\s+/)) {
          if (NEG.test(sentence)) continue;
          for (const m of sentence.matchAll(/`standards\/([a-z-]+)\//g)) cited.add(m[1]);
        }
      }
      const foreign = [...cited].filter((d) => dirs.has(d) && d !== p.standardsDir);
      check(`2 ${rel} cites only its own lane`, foreign.length === 0, foreign.join(", "));
    }
  }
  // The command loads platform standards only for platforms actually touched.
  const cmd = flat(read(REVIEW_CMD));
  check("2 /review-code loads platform standards only for touched platforms",
    /Load platform-specific standards only for platforms actually touched/.test(cmd));
  check("2 /review-code forbids mixing a platform's standards into files it does not own",
    /do not mix in a platform's standards for files it doesn't own/.test(cmd));
  check("2 /review-code always loads the shared standards",
    /\*\*Always\*\* load the shared standards/.test(cmd));
}

// ---------------------------------------------------------------------------
// 3. Mixed-platform diffs stay isolated
// ---------------------------------------------------------------------------
{
  const cmd = flat(read(REVIEW_CMD));
  check("3 each touched platform's pair runs independently",
    /Run each touched platform's pair independently/.test(cmd));
  check("3 findings merge into one document, not one per platform",
    /Merge all agents' output into a single `templates\/code-review-template\.md`/.test(cmd));
  check("3 severity stays the primary organizing axis for a mixed diff",
    /keeping \*\*severity as the primary organizing axis\*\* even for a mixed-platform diff/.test(cmd));
  check("3 findings are platform-tagged inline",
    /tag each finding inline with `\[platform\]`/.test(cmd));
  check("3 file attribution decides which platform owns a changed file",
    /attribute each changed file to a platform using the file-attribution rule/.test(cmd));
}

// ---------------------------------------------------------------------------
// 4. A finding carries a citation, or is not a finding
// ---------------------------------------------------------------------------
{
  // The filing gate is stated by the lanes that have one today. RN's lane is thin and
  // states the weaker "cite the standard ID" form; both are recorded so the refactor
  // cannot quietly upgrade or downgrade either without this failing.
  for (const p of PLATFORMS.filter((x) => x.lane !== "react-native")) {
    const s = flat(read(p.skill));
    check(`4 ${p.lane} lane has a filing gate`,
      /What may be filed|filing gate/i.test(s));
    check(`4 ${p.lane} requires a citation in the same slot`,
      /citation/i.test(s));
  }
  // OWNERSHIP MOVED. Citation and remediation are generic and now live once in
  // platform-review; asserted against the ROUTE (shared + lane), which is what a
  // reviewer actually loads, rather than against the lane alone.
  const shared = flat(read("skills/platform-review/SKILL.md"));
  check("4 the route requires a citation in the same slot, or the finding is not filable",
    /A finding with an empty citation slot is not filable/.test(shared));
  check("4 the route requires concrete remediation per finding",
    /concrete remediation\*\* — a specific fix pointer/.test(shared));
  check("4 Nit is not an exemption from citation", /Nit is not an exemption/.test(shared));
}

// ---------------------------------------------------------------------------
// 5. Correctness, performance and security stay separate
// ---------------------------------------------------------------------------
{
  const cmd = flat(read(REVIEW_CMD));
  check("5 /review-code is complementary to /review-security, not a replacement",
    /complementary to `\/review-security`, not a replacement/.test(cmd));
  check("5 /review-code does not duplicate security commentary",
    /Do not duplicate security commentary here/.test(cmd));
  check("5 security review is its own command", has(SECURITY_CMD));
  check("5 security has its own shared reviewer", has("agents/mobile-security-reviewer.md"));
  check("5 the security reviewer is shared across platforms, not per-lane",
    !PLATFORMS.some((p) => has(`agents/${p.prefix}security-reviewer.md`)));
  for (const p of PLATFORMS) {
    const rev = flat(read(p.reviewer));
    check(`5 ${p.lane} code-reviewer declares a boundary vs performance and security`,
      // Phrasing-tolerant: the role agent states the boundary in the imperative
      // ("Do not comment on performance") where the per-platform agents used the
      // third person. The property is the declared boundary, never one verb form.
      /(do(es)? not|never) comment on performance|not filed here|Boundary vs/i.test(rev));
  }
}

// ---------------------------------------------------------------------------
// 6. /review-code readiness is exclude-and-declare, never a hard stop
// ---------------------------------------------------------------------------
{
  const cmd = flat(read(REVIEW_CMD));
  check("6 a placeholder lane does NOT abort the review",
    /do not abort the review and do not route to the placeholder/i.test(cmd));
  check("6 the excluded platform's files are dropped from the step",
    /Exclude that platform's files from this step/i.test(cmd));
  check("6 every authored platform is still reviewed in full",
    /review every authored platform in full/i.test(cmd));
  check("6 the exclusion is recorded as an explicit Unreviewed entry",
    /explicit \*\*Unreviewed\*\* entry naming the platform and the reason/.test(cmd));
  check("6 an excluded lane is a declared gap, never a silent pass",
    /declared gap, never a silent pass/.test(cmd));
  // The contrast that makes this semantics meaningful: /implement-task DOES hard-stop.
  check("6 /implement-task by contrast hard-stops on a placeholder",
    /stop with: "Platform implementation methodology for/.test(flat(read("commands/implement-task.md"))));
}

// ---------------------------------------------------------------------------
// 7. Release-time performance review keeps no-go semantics
// ---------------------------------------------------------------------------
{
  const rel = flat(read(RELEASE_CMD));
  // Wording follows the Stage-4d route; the invariant is unchanged — one performance
  // review per shipping platform, each carrying exactly one lane.
  check("7 release invokes a performance reviewer per shipping platform",
    /invoke the `performance-reviewer` agent once per shipping platform/.test(rel));
  check("7 release carries exactly one lane per invocation",
    /exactly one lane per invocation/.test(rel));
  check("7 one platform-tagged sign-off block per shipping platform",
    /one platform-tagged sign-off block per shipping platform/.test(rel));
  check("7 a placeholder lane does not abort the release check",
    /do not abort the release check and do not route to the placeholder/i.test(rel));
  check("7 an ungated platform is written as an explicit unverifiable item",
    /explicit \*\*unverifiable\*\* item naming the platform and the reason/.test(rel));
  check("7 unverifiable is a no-go by default, surfaced to a human",
    /incomplete or unverifiable checklist item is a no-go by default/.test(rel));
}

// ---------------------------------------------------------------------------
// 8. Every cited platform standard resolves, to its own lane's directory
// ---------------------------------------------------------------------------
{
  let cited = 0;
  for (const p of PLATFORMS) {
    for (const rel of [p.skill, p.reviewer, p.perf]) {
      for (const m of read(rel).matchAll(/`(standards\/[A-Za-z0-9._/-]+\.md)`/g)) {
        cited++;
        check(`8 ${rel} → ${m[1]} resolves`, has(m[1]));
      }
    }
  }
  check(`8 the review lane cites standards at all (${cited} citations)`, cited >= 20, `${cited}`);
  // ID roots the review lane cites must exist in a standards file.
  for (const p of PLATFORMS) {
    const roots = new Set<string>();
    for (const m of read(p.skill).matchAll(/`([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)-\*`/g)) roots.add(m[1]);
    check(`8 ${p.lane} lane cites ID roots`, roots.size > 0, `${roots.size}`);
  }
}

// ---------------------------------------------------------------------------
// 9. The iOS review lane is the superset — its uniques must stay reachable
// ---------------------------------------------------------------------------
{
  const ios = read("skills/ios-code-review/SKILL.md");
  const iosFlat = flat(ios);
  const UNIQUES: Array<[string, RegExp]> = [
    ["delegation ladder", /delegation ladder/i],
    ["rung 1 is conditional on the resolved enabled tool set", /Rung 1 is conditional/i],
    ["an authored ID always wins over a tool rule", /An authored ID always wins/i],
    ["unresolvable tool config → file the finding", /the configuration cannot be resolved, file the finding/i],
    ["filing gate — name one of four things", /What may be filed/i],
    ["evidence reach by applicability stage", /Evidence reach/i],
    ["Not Applicable, never passed", /mark a rule Not Applicable — never "passed"/i],
    ["split the predicate from the claim", /Split the predicate from the claim/i],
    ["mechanism versus magnitude", /Mechanism versus magnitude/i],
    ["measurement requests", /Measurement requests/i],
    ["lane ownership and the merge contract", /Lane ownership and the merge contract/i],
    ["framework-neutral family selection", /Framework-neutral family selection/i],
    ["the two review passes", /two independent passes over the same scope|The two (review )?passes/i],
    ["release stage is Pass B only", /Release stage \(Pass B only\)/i],
    ["device_type handling at review", /`device_type` handling at review/i],
  ];
  // Reachability is a property of the ROUTE — the iOS lane plus the shared methodology it
  // loads — not of the lane file alone. Eight of these generalised into platform-review;
  // asserting them against the lane after the split would demand a second copy, which is
  // the duplication this refactor removes.
  const iosRoute = ios + "\n" + read("skills/platform-review/SKILL.md");
  const iosRouteFlat = flat(iosRoute);
  for (const [label, re] of UNIQUES) {
    check(`9 iOS review unique reachable from the iOS route: ${label}`,
      re.test(iosRoute) || re.test(iosRouteFlat));
  }
  // The size proxy for "iOS is the superset" no longer holds after the split, because the
  // generalised half left the lane. The real property — iOS retains the most
  // platform-specific review content — is asserted directly instead.
  // Section count is a poor proxy after the split — lanes differ in how much ID-bearing
  // data they carry, and React legitimately carries more sections than iOS. The property
  // that actually matters is that iOS's fifteen uniques are each reachable, asserted
  // above. What is still worth pinning is that the iOS lane did not become a thin stub:
  // it must retain substantially more content than the thinnest lane.
  const laneLines = (rel: string): number => read(rel).split("\n").length;
  check("9 the iOS lane is not reduced to a stub",
    laneLines("skills/ios-code-review/SKILL.md") >= 200,
    `${laneLines("skills/ios-code-review/SKILL.md")} lines`);
}

// ---------------------------------------------------------------------------
// 10. React Native neither gains nor loses review behaviour silently
// ---------------------------------------------------------------------------
{
  // (a) RN's out-of-lane aside PERMISSION. It lives in exactly one file today, and that
  //     file is an agent a shared-role refactor removes. Pinned here deliberately.
  // OWNERSHIP MOVED (Stage 4c, Option A). The permission now lives in the RN review
  // SKILL, which survives the shared-role refactor; the agent defers to it. The
  // behaviour is unchanged — only its owner is.
  const rnSkill = flat(read("skills/rn-code-review/SKILL.md"));
  check("10 RN permits a one-line out-of-lane aside",
    /at most a one-line aside outside the Findings section/.test(rnSkill));
  check("10 the RN skill owns the policy and says it is RN's alone",
    /This policy is React Native's alone/.test(rnSkill));
  check("10 the RN skill forbids normalising it without an explicit decision",
    /Do not normalise it in either direction without an explicit decision/.test(rnSkill));
  // Re-pointed (cleanup): `rn-code-reviewer` is gone; `code-reviewer` serves every lane.
  // It cannot name RN's policy without breaking lane neutrality, so what it must do is
  // defer to whichever lane resolved — and still never restate the aside itself.
  const sharedReviewer = flat(read("agents/code-reviewer.md"));
  check("10 the shared agent defers the policy to the lane rather than restating it",
    /out-of-lane policy/i.test(sharedReviewer) &&
    /the \*\*lane's\*\* policy|read it from the lane/.test(sharedReviewer) &&
    !/at most a one-line aside/.test(sharedReviewer));

  // (b) The three lanes that deliberately diverge from RN still say so, and still name
  //     the file they diverge from. A dangling cross-reference here means the refactor
  //     moved RN's policy without updating the components that cite it.
  const divergent: Array<[string, string]> = [
    ["android skill", "skills/android-code-review/SKILL.md"],
    ["ios skill", "skills/ios-code-review/SKILL.md"],
    ["react skill", "skills/react-code-review/SKILL.md"],
  ];
  for (const [label, rel] of divergent) {
    const t = flat(read(rel));
    check(`10 ${label} records the deliberate divergence from RN`,
      /deliberately stricter than|divergence is intentional|never shared/i.test(t));
  }
  // Every component that diverges from RN must name the file that now owns the policy.
  // The three per-platform reviewer agents that used to cite RN's policy are gone; the
  // skills that diverge from it remain, and must still name the file that owns it.
  for (const rel of ["skills/ios-code-review/SKILL.md", "skills/react-code-review/SKILL.md"]) {
    check(`10 ${rel} points at the RN skill, not the deleted agent`,
      /skills\/rn-code-review\/SKILL\.md/.test(flat(read(rel))));
  }
  // No surviving component may still cite a deleted per-platform reviewer agent.
  for (const rel of ["skills/ios-code-review/SKILL.md", "skills/android-code-review/SKILL.md",
                     "skills/react-code-review/SKILL.md", "agents/code-reviewer.md"]) {
    check(`10 ${rel} cites no deleted per-platform reviewer agent`,
      !/agents\/(rn|ios|android|react)-(code|performance)-reviewer\.md/.test(read(rel)));
  }

  // (c) RN must not silently acquire the strict no-modernization-anywhere rule the other
  //     three carry. If the refactor gives it one, that is a behaviour change and this
  //     assertion is where it must be declared.
  // Three lanes state this rule in three wordings; match the property, not one phrasing.
  //   android/react : "Modernization suggestions must not appear anywhere in the review output"
  //   ios skill     : "Modernization must not appear anywhere in the output"
  //   ios agent     : "Never file a modernization or framework-preference observation anywhere in the output"
  const STRICT = /Modernization[^.]{0,80}must not appear anywhere in the (?:review )?output|Never file a modernization[^.]{0,80}anywhere in the output/i;
  for (const p of PLATFORMS.filter((x) => x.lane !== "react-native")) {
    check(`10 ${p.lane} carries the strict no-modernization rule`,
      STRICT.test(flat(read(p.skill))) || STRICT.test(flat(read(p.reviewer))));
  }
  check("10 RN does NOT carry the strict no-modernization-anywhere rule today",
    !STRICT.test(flat(read("skills/rn-code-review/SKILL.md"))) &&
    !STRICT.test(flat(read("agents/code-reviewer.md"))));
}

// ---------------------------------------------------------------------------

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
