/**
 * tvos-rules.test.ts
 *
 * Pins the tvOS-specific residue (ATV-001 / ATV-002): the few stable tvOS obligations the
 * shared TV baseline, Project Knowledge, the existing iOS rules and live target-SDK
 * verification cannot express — and the minimal lane wiring that consumes them.
 *
 *   shared TV baseline (TVB-*)  →  tvOS rules (IOS-UI-TV-*)  →  Project Knowledge  →  current source
 *
 * What it proves:
 *   1.  tvOS-specific rule IDs exist, are unique, and live in one compact section.
 *   2.  No shared TV rule is duplicated.
 *   3.  No repository-specific facts are encoded.
 *   4.  No version-specific or vendor-volatile facts are encoded.
 *   5.  iOS mobile does not inherit tvOS rules.
 *   6.  tvOS planning cites shared + tvOS-specific rules.
 *   7.  tvOS implementation cites shared + tvOS-specific rules.
 *   8.  tvOS review can file against the new IDs.
 *   9.  Project Knowledge remains the source of repository-specific TV behaviour.
 *   10. Target-SDK verification remains the fallback for volatile capabilities.
 *   11. Existing mobile iOS behaviour is unchanged.
 *   12. Shared TV accessibility behaviour is unchanged.
 *
 *   node --no-warnings scripts/tvos-rules.test.ts
 */

import { readFileSync, readdirSync } from "fs";
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
const flat = (s: string): string => s.replace(/\s+/g, " ");
const HOST = "standards/ios/swiftui-uikit-standards.md";
const host = read(HOST);

/** The compact tvOS section of the host standard, up to the next level-2 heading. */
function tvosSection(): string {
  const from = host.search(/^## Apple TV \(tvOS\)$/m);
  if (from < 0) return "";
  const rest = host.slice(from);
  const bodyStart = rest.indexOf("\n") + 1;
  const end = rest.slice(bodyStart).search(/^## /m);
  return end < 0 ? rest : rest.slice(0, bodyStart + end);
}
const tv = tvosSection();
const tvRules = tv.split(/\n(?=- `)/).filter((b) => /^- `IOS-UI-TV-\d+`/.test(b.trim()));
const ids = [...tv.matchAll(/^- `(IOS-UI-TV-\d+)`/gm)].map((m) => m[1]);

function laneTv(text: string): string {
  const from = text.indexOf("### `device_type: tv`");
  if (from < 0) return "";
  const rest = text.slice(from);
  const bodyStart = rest.indexOf("\n") + 1;
  const end = rest.slice(bodyStart).search(/^## /m);
  return end < 0 ? rest : rest.slice(0, bodyStart + end);
}
function laneMobile(text: string): string {
  const from = text.indexOf("### `device_type: mobile`");
  const to = text.indexOf("### `device_type: tv`");
  return from < 0 || to < 0 ? "" : text.slice(from, to);
}

/* ── 1. IDs exist, unique, compact ────────────────────────────────────── */
{
  check("1 the host standard has one compact Apple TV (tvOS) section", tv.length > 300 && (host.match(/^## Apple TV \(tvOS\)$/gm) ?? []).length === 1);
  check("1 it holds a small residue: 3–6 rules", ids.length >= 3 && ids.length <= 6, `${ids.length}`);
  check("1 IDs are unique", new Set(ids).size === ids.length, ids.join(","));
  check("1 IDs are numbered 1..N without gaps", ids.every((id, i) => id === `IOS-UI-TV-${i + 1}`), ids.join(","));
  const others = readdirSync(join(REPO_ROOT, "standards/ios")).filter((f) => f.endsWith(".md")).map((f) => `standards/ios/${f}`);
  const definedElsewhere = others.filter((rel) => rel !== HOST && /^- `IOS-[A-Z]+-TV-\d+`/m.test(read(rel)));
  check("1 no other iOS standard defines a TV rule (no five-document spread)", definedElsewhere.length === 0, definedElsewhere.join(","));
  check("1 no bare IOS-TV-* rule exists anywhere", !others.some((rel) => /^- `IOS-TV-\d+`/m.test(read(rel))));
  check("1 no rule outside the tvOS section uses the TV family", !host.replace(tv, "").match(/^- `IOS-UI-TV-/m));
  check("1 the ID root follows the documented host-root convention", /`IOS-UI-TV-\*`/.test(read("standards/ios/swift-standards.md")));
}

/* ── 2. no duplication of the shared baseline ─────────────────────────── */
{
  check("2 the section states it extends, never restates, the shared baseline",
    /extends?[^.]{0,60}never restates?|never restates?[^.]{0,60}shared/i.test(flat(tv)) && /`standards\/shared\/tv-baseline\.md`/.test(tv));
  const RESTATED: Array<[string, RegExp]> = [
    ["visible focus", /always visibly indicated|focus indicator is legible/i],
    ["never-lost focus", /never (dropped|lost)[^.]{0,40}(nothing|transition)/i],
    ["directional layout", /moves focus to the element visually adjacent/i],
    ["overlay containment", /cannot reach the content behind/i],
    ["touch-only interaction", /depends only on touch, hover or pointer/i],
    ["one playback owner", /one writer, derived from the player/i],
  ];
  for (const [what, re] of RESTATED) check(`2 no tvOS rule restates the shared "${what}" obligation`, !re.test(tv));
  check("2 each tvOS rule either extends a named TVB rule or states it has no shared counterpart",
    tvRules.length > 0 && tvRules.every((r) => /`TVB-[A-Z0-9]+-\d+`/.test(r) || /no shared (counterpart|baseline rule)/i.test(r)),
    tvRules.filter((r) => !/`TVB-/.test(r) && !/no shared/i.test(r)).map((r) => r.slice(0, 40)).join(" | "));
}

/* ── 3–4. no repository facts, no volatile facts ─────────────────────── */
{
  const t = flat(tvRules.join("\n"));
  const REPO: Array<[string, RegExp]> = [
    ["a source path", /\b(src|app|Sources|Modules|Packages)\/[A-Za-z]/],
    ["a source file", /\.(swift|m|h|plist|xcconfig|pbxproj)\b/],
    ["a named in-house type", /\b[A-Z][a-z]+(Manager|Coordinator|Wrapper|Controller|ViewModel|Screen)\b/],
    ["a repository-chosen framework as the answer", /\buse (SwiftUI|UIKit|TVUIKit|TVMLKit)\b/i],
  ];
  for (const [what, re] of REPO) check(`3 no tvOS rule encodes ${what}`, !re.test(t), (re.exec(t) ?? [""])[0]);
  const VOLATILE: Array<[string, RegExp]> = [
    ["an OS or toolchain version", /\b(tvOS|iOS|Xcode|Swift)\s?\d/],
    ["an API symbol", /\b(UI|AV|TV|MP)[A-Z][A-Za-z]+\b/],
    ["remote hardware generations", /Siri Remote|clickpad|touch surface|generation/i],
    ["App Store asset requirements", /App Store|\d+\s?(px|pt)\b|layered image|icon size/i],
    ["storage quotas or download mechanisms", /quota|\d+\s?(MB|GB|KB)\b|On-Demand|purg(e|eable)|CloudKit/i],
    ["a current SDK capability list", /(no|there is no) web ?view|WebKit/i],
    ["a dated observation", /\b(19|20)\d\d\b/],
  ];
  for (const [what, re] of VOLATILE) check(`4 no tvOS rule encodes ${what}`, !re.test(t), (re.exec(t) ?? [""])[0]);
}

/* ── 5. iOS mobile does not inherit tvOS rules ────────────────────────── */
{
  check("5 the tvOS rules apply only to a tvOS target / TV surface",
    /only (to|when|where)[^.]{0,80}(tvOS target|`device_type` is `tv`|TV surface)/i.test(flat(tv)) && /never[^.]{0,60}(iOS|mobile|iPhone|iPad)/i.test(flat(tv)));
  const plan = read("skills/ios-dev-planning/SKILL.md");
  check("5 ios-dev-planning's mobile section cites no tvOS rule", !/IOS-UI-TV|TVB-/.test(laneMobile(plan)));
  const review = read("skills/ios-code-review/SKILL.md");
  check("5 ios-code-review files tvOS rules only on an established TV surface",
    /`IOS-UI-TV-\*`[^.]{0,200}(only|established) TV surface|established TV surface[^.]{0,200}`IOS-UI-TV-\*`/i.test(flat(review)));
  for (const rel of ["skills/platform-planning/SKILL.md", "skills/platform-implementation/SKILL.md", "skills/platform-review/SKILL.md",
    "agents/feature-architect.md", "agents/feature-implementer.md", "agents/code-reviewer.md", "skills/rn-dev-planning/SKILL.md"]) {
    check(`5 ${rel} carries no tvOS rule`, !/IOS-UI-TV/.test(read(rel)));
  }
}

/* ── 6–8. planning, implementation and review cite both layers ────────── */
{
  const planTv = laneTv(read("skills/ios-dev-planning/SKILL.md"));
  const planCited = new Set([...planTv.matchAll(/`(IOS-UI-TV-\d+)`/g)].map((m) => m[1]));
  check("6 tvOS planning cites concrete tvOS rule IDs", planCited.size >= 3 && [...planCited].every((id) => ids.includes(id)), [...planCited].join(","));
  check("6 tvOS planning still cites the shared baseline", /`TVB-\*`|`TVB-[A-Z]+-\d+`/.test(planTv) && /tv-baseline\.md/.test(planTv));
  check("6 tvOS planning no longer says tvOS rules are unauthored", !/stable tvOS TV rules are not yet authored/.test(flat(planTv)) && !/reserved roots with no rules behind them/.test(planTv));
  check("6 tvOS planning still forbids the empty and the bare roots", /`IOS-PERF-TV-\*`/.test(planTv) && /bare `IOS-TV-\*`/.test(planTv));
  check("6 planning's citation table lists the tvOS family", /`IOS-UI-TV-\*`/.test(read("skills/ios-dev-planning/SKILL.md").slice(read("skills/ios-dev-planning/SKILL.md").indexOf("## Standards citation"))));

  const impl = read("skills/ios-feature-implementation/SKILL.md");
  const implTv = impl.slice(impl.indexOf("**`device_type: tv`**"), impl.indexOf("**`device_type: tv`**") + 3500);
  check("7 tvOS implementation cites the tvOS rules", /`IOS-UI-TV-\d+`/.test(implTv));
  check("7 tvOS implementation cites the shared baseline", /`TVB-\*`|`TVB-[A-Z]+-\d+`/.test(implTv));
  check("7 it builds and tests against the repository's tvOS scheme and a tvOS destination",
    /tvOS (scheme|target)/i.test(implTv) && /tvOS Simulator/.test(implTv) && /(probe|§5)/.test(implTv));
  check("7 the scheme and target come from the planning artifacts / the repository, not a second lookup",
    /(planning artifacts|build selector)/i.test(implTv) && /(never|do not)[^.]{0,40}(resolve Project Knowledge again|second (lookup|Project Knowledge))/i.test(flat(implTv)));
  check("7 unverifiable tvOS checks become verification debt", /verification debt|`verificationDebt`/.test(implTv));
  check("7 no longer says no stable tvOS rules are authored", !/no stable tvOS rules are authored yet/.test(impl));

  const review = read("skills/ios-code-review/SKILL.md");
  const r12 = review.slice(review.indexOf("## 12. `device_type` handling at review"), review.indexOf("## 13."));
  check("8 review §12 files against the tvOS rules", /`IOS-UI-TV-\*`/.test(r12) && /file[^.]{0,60}`IOS-UI-TV-/i.test(flat(r12)));
  check("8 review §12 still files against the shared baseline", /`TVB-\*`/.test(r12));
  check("8 review no longer says no stable tvOS rules are authored", !/No stable tvOS `IOS-\*` rules are authored yet/.test(review));
  check("8 review still never files against a nonexistent rule", /Never file against a rule that does not exist/.test(r12) && /`IOS-PERF-TV-\*`/.test(r12));
  check("8 review families table routes IOS-UI-TV-* to code-reviewer",
    /\| `IOS-UI-TV-\*` \|[^\n]*TV/.test(review));
  check("8 surface attribution corroborates, never becomes device_type", /never treated as a `device_type`/.test(r12));
  check("8 the current diff and source stay authoritative", /(diff|current (code|source))[^.]{0,80}(authoritative|first|wins)/i.test(flat(r12)));
}

/* ── 9–10. Project Knowledge and target-SDK verification remain ───────── */
{
  check("9 the tvOS section defers repository behaviour to Project Knowledge", /Project Knowledge/.test(tv) && /current source/i.test(tv));
  check("9 tvOS planning still reads Project Knowledge first", /Project Knowledge first/.test(laneTv(read("skills/ios-dev-planning/SKILL.md"))));
  check("9 the tvOS discovery pass is intact (11 items)", (laneTv(read("skills/ios-dev-planning/SKILL.md")).match(/^\d+\. \*\*/gm) ?? []).length === 11);
  const capability = tvRules.find((r) => /capabilit/i.test(r)) ?? "";
  check("10 a tvOS rule requires capabilities to be verified against the target SDK", /verif[^.]{0,40}target SDK/i.test(capability), capability.slice(0, 80));
  check("10 planning still verifies volatile capabilities against the target SDK", /verif[^.]{0,40}target SDK/i.test(flat(read("skills/ios-dev-planning/SKILL.md"))));
}

/* ── 11–12. mobile iOS and shared TV accessibility are unchanged ──────── */
{
  const plan = read("skills/ios-dev-planning/SKILL.md");
  check("11 mobile planning still applies touch conventions", /Touch interaction, touch targets and phone\/tablet navigation patterns apply\./.test(laneMobile(plan)));
  check("11 the iOS accessibility family is unchanged (3 rules)", [...host.matchAll(/^- `(IOS-UI-A11Y-\d+)`/gm)].length === 3);
  check("11 the existing IOS-UI families are unchanged",
    ["FRAMEWORK", "VIEW", "STATE", "ID", "CELL", "UIKIT", "INTEROP", "A11Y"].every((f) => new RegExp(`^- \`IOS-UI-${f}-1\``, "m").test(host)));
  const impl = read("commands/implement-task.md");
  const s5b = flat(impl.slice(impl.indexOf("## 5b."), impl.indexOf("## 6.")));
  check("12 TV accessibility still applies the shared rules through their TV clauses", /`device_type: tv` → the flow applies, through each rule's TV clause/.test(s5b));
  check("12 TV accessibility is still TVB-A11Y-1, with no separate model", /`TVB-A11Y-1`/.test(s5b) && /no separate accessibility model/.test(s5b));
  check("12 no tvOS rule adds an accessibility requirement of its own", !/A11Y|VoiceOver|screen reader/i.test(tvRules.join(" ")) || /`TVB-A11Y-1`/.test(tv));
}

if (failures > 0) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall tvOS rule checks passed");
