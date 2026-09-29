/**
 * shared-tv-baseline.test.ts
 *
 * Pins the Shared TV Baseline: one small, platform-neutral set of stable TV obligations
 * (`standards/shared/tv-baseline.md`, root `TVB-*`) shared by tvOS, Android TV and React
 * Smart TV.
 *
 * The layering this suite protects:
 *
 *   shared TV baseline  →  platform-specific additions  →  Project Knowledge  →  current source
 *
 * What it proves:
 *   1.  The baseline exists and is scoped to TV surfaces.
 *   2.  Its rule IDs are unique, well-formed, and collide with no other root.
 *   3.  It contains no repository-specific facts.
 *   4.  It contains no OS, SDK or vendor version assumptions — and no platform mechanisms.
 *   5.  The tvOS lanes cite it.
 *   6.  The Android TV lanes cite it.
 *   7.  React Smart TV coexists with it without conflicting rules.
 *   8.  Repository-specific TV facts still come from Project Knowledge.
 *   9.  TV accessibility still uses the shared A11Y-* rules.
 *   10. No mobile-only workflow starts applying TV rules.
 *   11. The TV discovery fallback is intact.
 *   12. Routing and device_type behaviour are unchanged.
 *
 *   node --no-warnings scripts/shared-tv-baseline.test.ts
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

const read = (rel: string): string => (existsSync(join(REPO_ROOT, rel)) ? readFileSync(join(REPO_ROOT, rel), "utf-8") : "");
const flat = (s: string): string => s.replace(/\s+/g, " ");
const BASELINE = "standards/shared/tv-baseline.md";
const base = read(BASELINE);

/** The rule bullets: `- \`TVB-FAMILY-N\` …` with their indented continuation lines. */
const ruleIds = [...base.matchAll(/^- `(TVB-[A-Z0-9]+-\d+)`/gm)].map((m) => m[1]);
/** The normative body only — everything before the References section. */
const normative = base.split(/^## References/m)[0] ?? "";

/** The `device_type: tv` section of a lane, up to the next level-2 heading. */
function tvSection(text: string): string {
  const from = text.indexOf("### `device_type: tv`");
  if (from < 0) return "";
  const rest = text.slice(from);
  const bodyStart = rest.indexOf("\n") + 1;
  const end = rest.slice(bodyStart).search(/^## /m);
  return end < 0 ? rest : rest.slice(0, bodyStart + end);
}
function mobileSection(text: string): string {
  const from = text.indexOf("### `device_type: mobile`");
  const to = text.indexOf("### `device_type: tv`");
  return from < 0 || to < 0 ? "" : text.slice(from, to);
}

/* ── 1. the baseline exists and is scoped ─────────────────────────────── */
{
  check("1 the shared TV baseline exists", base.length > 0, BASELINE);
  check("1 it has a Purpose & Scope section", /^## Purpose & Scope$/m.test(base));
  check("1 it applies only to a confirmed or established TV surface",
    /only (when|where)[^.]{0,80}`device_type`[^.]{0,20}`tv`/i.test(flat(base)) && /never[^.]{0,60}mobile/i.test(flat(base)));
  check("1 it is small: 8–10 rules", ruleIds.length >= 8 && ruleIds.length <= 10, `${ruleIds.length}`);
  check("1 it covers focus, input, media, lifecycle, performance and accessibility",
    ["FOCUS", "INPUT", "MEDIA", "LIFECYCLE", "PERF", "A11Y"].every((f) => ruleIds.some((id) => id.startsWith(`TVB-${f}-`))), ruleIds.join(","));
}

/* ── 2. IDs: unique, well-formed, no collision ───────────────────────── */
{
  check("2 rule IDs are unique", new Set(ruleIds).size === ruleIds.length, ruleIds.join(","));
  check("2 rule IDs follow ROOT-FAMILY-N", ruleIds.every((id) => /^TVB-[A-Z0-9]+-[1-9]\d*$/.test(id)));
  const perFamily = new Map<string, number[]>();
  for (const id of ruleIds) {
    const [, fam, n] = /^TVB-([A-Z0-9]+)-(\d+)$/.exec(id) ?? [];
    perFamily.set(fam, [...(perFamily.get(fam) ?? []), Number(n)]);
  }
  check("2 each family is numbered from 1 without gaps",
    [...perFamily.values()].every((ns) => ns.every((n, i) => n === i + 1)), JSON.stringify([...perFamily]));
  const others: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (rel.endsWith(".md") && rel !== BASELINE) others.push(rel);
    }
  };
  walk("standards");
  const defines = others.filter((rel) => /^- `TVB-/m.test(read(rel)));
  check("2 no other standard defines a TVB-* rule", defines.length === 0, defines.join(","));
  const containing = others.filter((rel) => /[A-Z]TVB-|[A-Z0-9]-TVB-/.test(read(rel)));
  check("2 no existing ID root contains TVB- as a substring", containing.length === 0, containing.join(","));
  check("2 the baseline does not reuse the substring-colliding root TV-*", !/`TV-[A-Z]+-\d/.test(base));
}

/* ── 3–4. no repository facts, no platform mechanisms, no versions ───── */
{
  const n = flat(normative);
  const REPO_FACTS: Array<[string, RegExp]> = [
    ["a source path", /`?(src|app|lib|packages|modules)\/[A-Za-z]/],
    ["a source file", /\.(kt|java|swift|m|tsx?|jsx?|xml)\b/],
    ["a named in-house class", /\b[A-Z][a-z]+(Manager|Controller|Wrapper|Engine|Screen|Fragment|Activity)\b/],
  ];
  for (const [what, re] of REPO_FACTS) check(`3 the baseline names no ${what}`, !re.test(n), (re.exec(n) ?? [""])[0]);
  const MECHANISMS: Array<[string, RegExp]> = [
    ["tvOS focus-engine APIs", /preferredFocus|UIFocus|focus engine|FocusGuide|TVUIKit|TVMLKit/i],
    ["Apple remote or Menu semantics", /Siri Remote|Menu button|\bMenu\b at the root/i],
    ["Android leanback / media-session mechanics", /leanback|MediaSession|Media3|ExoPlayer|Compose for TV|AndroidManifest|uses-feature/i],
    ["Smart TV vendor details", /Tizen|webOS|config\.xml|appinfo\.json|Magic Remote/i],
    ["vendor key codes", /keyCode|\b100\d\d\b|\bVK_/],
    ["player frameworks", /AVPlayer|AVKit|HTMLMediaElement|<video>/],
  ];
  for (const [what, re] of MECHANISMS) check(`4 the baseline names no ${what}`, !re.test(n), (re.exec(n) ?? [""])[0]);
  const VERSIONS: Array<[string, RegExp]> = [
    ["an OS version", /\b(iOS|tvOS|iPadOS|Android|watchOS|macOS)\s?\d/],
    ["an API level or SDK version", /API level|\bSDK \d|\bAGP\b|Xcode \d/i],
    ["a dated observation", /\bas of (19|20)\d\d\b|\b(19|20)\d\d\b/],
    ["a numeric memory or frame budget", /\b\d+\s?(MB|GB|KB|fps|ms)\b/i],
  ];
  for (const [what, re] of VERSIONS) check(`4 the baseline states no ${what}`, !re.test(n), (re.exec(n) ?? [""])[0]);
}

/* ── 5–6. tvOS and Android TV lanes cite the baseline ─────────────────── */
const cites = (s: string) => /`standards\/shared\/tv-baseline\.md`/.test(s) || /`TVB-\*`|`TVB-[A-Z]+-\d+`/.test(s);
for (const [plat, label] of [["ios", "5"], ["android", "6"]] as const) {
  const plan = read(`skills/${plat}-dev-planning/SKILL.md`);
  check(`${label} ${plat}-dev-planning's TV section cites the baseline`, cites(tvSection(plan)));
  const impl = read(`skills/${plat}-feature-implementation/SKILL.md`);
  const implTv = impl.slice(Math.max(0, impl.search(/`device_type: tv`/)));
  check(`${label} ${plat}-feature-implementation handles tv and cites the baseline`, /`device_type: tv`/.test(impl) && cites(implTv.slice(0, 2500)));
  const review = read(`skills/${plat}-code-review/SKILL.md`);
  const r12 = review.slice(review.indexOf("## 12. `device_type` handling at review"));
  check(`${label} ${plat}-code-review §12 files TV findings against the baseline`, cites(r12.slice(0, 3000)) && /TVB-/.test(r12.slice(0, 3000)));
  // tvOS rules are authored since ATV-001; Android TV's are still open work (ANDROID-003).
  check(plat === "ios" ? `${label} ios planning cites its authored tvOS rules alongside the baseline`
                       : `${label} ${plat} planning still marks platform-specific TV rules as not yet authored`,
    plat === "ios" ? /`IOS-UI-TV-\d+`/.test(tvSection(plan)) : /not yet authored/i.test(flat(tvSection(plan))));
}
check("5 tvOS still never cites an unauthored tvOS TV ID",
  /Never cite `IOS-PERF-TV-\*`/.test(read("skills/ios-dev-planning/SKILL.md")) && /`IOS-UI-TV-\*`/.test(read("skills/ios-dev-planning/SKILL.md")));
check("5 swift-standards points at the shared baseline for TV", /tv-baseline\.md/.test(read("standards/ios/swift-standards.md")));

/* ── 7. React Smart TV coexists with the baseline ─────────────────────── */
{
  const rtv = read("standards/react/react-smart-tv.md");
  const reactIds = new Set([...rtv.matchAll(/^- `(REACT-TV-[A-Z]+-\d+)`/gm)].map((m) => m[1]));
  check("7 the React Smart TV rule set is intact (54 rules)", reactIds.size === 54, `${reactIds.size}`);
  const map = rtv.slice(rtv.indexOf("## Relationship to the shared TV baseline"));
  check("7 react-smart-tv.md has a relationship section", map.length > 200 && /^## Relationship to the shared TV baseline$/m.test(rtv));
  check("7 every baseline rule is mapped from the React standard", ruleIds.every((id) => map.includes(`\`${id}\``)), ruleIds.filter((id) => !map.includes(`\`${id}\``)).join(","));
  const mapped = [...map.split(/^## References/m)[0].matchAll(/`(REACT-TV-[A-Z]+-\d+)`/g)].map((m) => m[1]);
  check("7 every React rule the mapping names exists", mapped.length > 0 && mapped.every((id) => reactIds.has(id)), mapped.filter((id) => !reactIds.has(id)).join(","));
  check("7 the mapping states the two never conflict and React may be stricter",
    /never (conflict|contradict)/i.test(flat(map)) && /stricter|more specific/i.test(flat(map)));
  check("7 the mapping keeps REACT-TV-* as the cited ID on React", /cite the `REACT-TV-\*` (rule|ID)/i.test(flat(map)));
  const bm = flat(base);
  check("7 the baseline names the React realisation rather than restating it", /`REACT-TV-\*`/.test(bm) && /standards\/react\/react-smart-tv\.md/.test(bm));
  for (const lane of ["react-dev-planning", "react-feature-implementation", "react-code-review"]) {
    check(`7 ${lane} names the baseline alongside REACT-TV-*`, /TVB-|tv-baseline\.md/.test(read(`skills/${lane}/SKILL.md`)));
  }
}

/* ── 8. repository TV facts still come from Project Knowledge ─────────── */
{
  check("8 the baseline defers repository facts to Project Knowledge", /Project Knowledge/.test(base) && /current source/i.test(base));
  check("8 the baseline states the layering", /shared TV baseline[^\n]*→[^\n]*platform[^\n]*→[^\n]*Project Knowledge[^\n]*→[^\n]*current source/i.test(base));
  for (const lane of ["android-dev-planning", "ios-dev-planning", "react-dev-planning"]) {
    check(`8 ${lane} still reads Project Knowledge first for TV`, /Project Knowledge first/.test(tvSection(read(`skills/${lane}/SKILL.md`))));
  }
}

/* ── 9. TV accessibility still uses the shared A11Y rules ─────────────── */
{
  const a11y = /^- `TVB-A11Y-1`[^\n]*(\n  [^\n]*)*/m.exec(base)?.[0] ?? "";
  check("9 the baseline's accessibility rule defers to shared A11Y-*", /`A11Y-\*`/.test(a11y) && /TV clause/i.test(a11y));
  check("9 it adds no separate accessibility model", /no separate (TV )?accessibility model/i.test(flat(a11y)));
  check("9 screen-reader verification uses the existing debt model", /`verificationDebt`/.test(a11y) && /Tier 3/.test(a11y) && /`owner: "qa"`/.test(a11y));
  const impl = read("commands/implement-task.md");
  const s5b = flat(impl.slice(impl.indexOf("## 5b."), impl.indexOf("## 6.")));
  check("9 /implement-task still applies the shared A11Y rules to tv through their TV clauses", /`device_type: tv` → the flow applies, through each rule's TV clause/.test(s5b));
  check("9 /implement-task names the baseline's accessibility rule as aligned", /`TVB-A11Y-1`/.test(s5b));
}

/* ── 10. no mobile workflow applies TV rules ──────────────────────────── */
{
  for (const lane of ["ios-dev-planning", "android-dev-planning", "react-dev-planning"]) {
    check(`10 ${lane}'s mobile section cites no TVB rule`, !/TVB-|tv-baseline/.test(mobileSection(read(`skills/${lane}/SKILL.md`))));
  }
  for (const rel of ["skills/rn-dev-planning/SKILL.md", "skills/rn-feature-implementation/SKILL.md", "skills/rn-code-review/SKILL.md",
    "skills/platform-planning/SKILL.md", "skills/platform-implementation/SKILL.md", "skills/platform-review/SKILL.md",
    "agents/feature-architect.md", "agents/feature-implementer.md", "agents/code-reviewer.md", "agents/performance-reviewer.md"]) {
    check(`10 ${rel} carries no TV baseline content`, !/TVB-|tv-baseline/.test(read(rel)));
  }
  const rc = flat(read("commands/review-code.md"));
  check("10 /review-code loads the baseline only for a TV surface",
    /tv-baseline\.md/.test(rc) && /only when[^.]{0,80}TV surface/i.test(rc));
  const s3 = /3\. \*\*Always\*\* load the shared standards:[^\n]*/.exec(read("commands/review-code.md"))?.[0] ?? "";
  check("10 the always-loaded shared standards do not include the baseline", !/tv-baseline/.test(s3), s3.slice(0, 120));
}

/* ── 11. the TV discovery fallback is intact ──────────────────────────── */
{
  const counts: Record<string, number> = { "android-dev-planning": 10, "ios-dev-planning": 11, "react-dev-planning": 8 };
  for (const [lane, n] of Object.entries(counts)) {
    const tv = tvSection(read(`skills/${lane}/SKILL.md`));
    const items = (tv.match(/^\d+\. \*\*/gm) ?? []).length;
    check(`11 ${lane}: the TV discovery pass keeps its ${n} items`, items === n, `${items}`);
    check(`11 ${lane}: live discovery is still the fallback`, /discovered live|discover(ed)? live|discovery pass/i.test(tv));
  }
}

/* ── 12. routing and device_type are unchanged ────────────────────────── */
{
  const impl = read("commands/implement-task.md");
  check("12 routing still comes from the task row", /Read the `platform` value from the selected task row/.test(impl));
  check("12 a tv task still runs on the same agent, methodology and lane",
    /a `tv` task runs on the same agent, the same shared methodology and the same platform lane as a `mobile` task/.test(impl));
  check("12 device_type is still never defaulted", /never re-detect it here, and never default it/.test(flat(impl)));
  check("12 the confirmation question is unchanged", /Is the current feature intended for this context\?/.test(read("commands/analyze-feature.md")));
  check("12 React Native + tv is still unsupported", /`platform: react-native` with `device_type: tv` is unsupported/.test(read("skills/rn-dev-planning/SKILL.md")));
}

if (failures > 0) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall shared TV baseline checks passed");
