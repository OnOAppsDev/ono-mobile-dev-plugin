/**
 * android-tv-rules.test.ts
 *
 * Pins the Android-TV-specific residue (ANDROID-003): the few stable Android TV obligations
 * the shared TV baseline, Project Knowledge and the existing Android rules cannot express —
 * and the minimal lane wiring that consumes them.
 *
 *   shared TV baseline (TVB-*)  →  Android TV rules (AND-UI-TV-*)  →  Project Knowledge  →  current source
 *
 * The repository chooses mechanisms; the plugin enforces obligations. No UI toolkit, player,
 * DI framework or navigation library is ever required.
 *
 * What it proves:
 *   1.  Android-TV-specific IDs exist, are unique, and live in one compact section.
 *   2.  No shared TV baseline rule is duplicated.
 *   3.  No repository-specific facts are encoded.
 *   4.  No SDK, store or API-version facts are encoded.
 *   5.  Android mobile never inherits Android TV rules.
 *   6.  Android TV planning cites shared + Android-TV-specific rules.
 *   7.  Android TV implementation cites shared + Android-TV-specific rules.
 *   8.  Android TV review can file findings against the new IDs.
 *   9.  Project Knowledge remains the source of repository-specific Android TV behaviour.
 *   10. No Leanback / Compose-for-TV prescription is introduced.
 *   11. No specific player implementation is prescribed (nor a DI or navigation library).
 *   12. Existing mobile Android behaviour is unchanged.
 *   13. Shared TV accessibility behaviour is unchanged.
 *   14. The live discovery fallback is intact.
 *
 *   node --no-warnings scripts/android-tv-rules.test.ts
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
const HOST = "standards/android/compose-xml-standards.md";
const host = read(HOST);

function sectionFrom(text: string, heading: RegExp): string {
  const from = text.search(heading);
  if (from < 0) return "";
  const rest = text.slice(from);
  const bodyStart = rest.indexOf("\n") + 1;
  const end = rest.slice(bodyStart).search(/^## /m);
  return end < 0 ? rest : rest.slice(0, bodyStart + end);
}
const tv = sectionFrom(host, /^## Android TV$/m);
const tvRules = tv.split(/\n(?=- `)/).filter((b) => /^- `AND-UI-TV-\d+`/.test(b.trim()));
const ids = [...tv.matchAll(/^- `(AND-UI-TV-\d+)`/gm)].map((m) => m[1]);

const PLAN = read("skills/android-dev-planning/SKILL.md");
const IMPL = read("skills/android-feature-implementation/SKILL.md");
const REVIEW = read("skills/android-code-review/SKILL.md");
const planTv = sectionFrom(PLAN, /^### `device_type: tv`$/m);
const planMobile = PLAN.slice(PLAN.indexOf("### `device_type: mobile`"), PLAN.indexOf("### `device_type: tv`"));
const implTv = sectionFrom(IMPL, /^## `device_type: tv`$/m);
const review12 = sectionFrom(REVIEW, /^## 12\. `device_type` handling at review$/m);

/** Sentences that name a framework without negating it — i.e. a prescription. */
const NEGATION = /\b(never|not|no|nor|without|neither|regardless|rather than|instead of|any|whichever|may use|assume)\b/i;
/** "a, b, or c" — an enumeration of possibilities a repository may have, not a requirement. */
const isAlternatives = (s: string): boolean => (s.match(/,/g)?.length ?? 0) >= 2 && /\bor\b/.test(s);
function prescriptions(text: string, names: RegExp): string[] {
  return flat(text)
    .split(/(?<=[.;:])\s+/)
    .filter((s) => names.test(s) && !NEGATION.test(s) && !isAlternatives(s));
}

/* ── 1. IDs exist, unique, compact ────────────────────────────────────── */
{
  check("1 the host standard has one compact Android TV section", tv.length > 300 && (host.match(/^## Android TV$/gm) ?? []).length === 1);
  check("1 it holds a small residue: 2–5 rules", ids.length >= 2 && ids.length <= 5, `${ids.length}`);
  check("1 IDs are unique", new Set(ids).size === ids.length, ids.join(","));
  check("1 IDs are numbered 1..N without gaps", ids.every((id, i) => id === `AND-UI-TV-${i + 1}`), ids.join(","));
  const others = readdirSync(join(REPO_ROOT, "standards/android")).filter((f) => f.endsWith(".md")).map((f) => `standards/android/${f}`);
  const elsewhere = others.filter((rel) => rel !== HOST && /^- `AND-[A-Z]+-TV-\d+`|^- `AND-TV-\d+`/m.test(read(rel)));
  check("1 no other Android standard defines a TV rule", elsewhere.length === 0, elsewhere.join(","));
  check("1 no rule outside the Android TV section uses the TV family", !host.replace(tv, "").match(/^- `AND-UI-TV-/m));
  const existingRoots = new Set(others.flatMap((rel) => [...read(rel).matchAll(/^- `(AND-[A-Z]+(?:-[A-Z0-9]+)?)-\d+`/gm)].map((m) => m[1])));
  const tvLike = [...existingRoots].filter((r) => r !== "AND-UI-TV" && /(^AND-TV|-TV$|-TV-)/.test(r));
  check("1 the TV family collides with no other Android root", tvLike.length === 0, tvLike.join(","));
  check("1 no shared or other-platform root is a prefix clash", !/`TVB-UI|`AND-UI-TVB/.test(host));
  check("1 the section states its applicability: a TV surface only, never mobile",
    /only (to|when|where)[^.]{0,80}(TV surface|`device_type` is `tv`)/i.test(flat(tv)) && /never[^.]{0,60}(mobile|phone|tablet)/i.test(flat(tv)));
}

/* ── 2. no duplication of the shared baseline ─────────────────────────── */
{
  check("2 the section states it extends, never restates, the shared baseline",
    /extends?[^.]{0,60}never restates?/i.test(flat(tv)) && /`standards\/shared\/tv-baseline\.md`/.test(tv));
  const RESTATED: Array<[string, RegExp]> = [
    ["visible focus", /always visibly indicated|focus indicator is legible/i],
    ["directional layout", /moves focus to the element visually adjacent/i],
    ["overlay containment", /cannot reach the content behind/i],
    ["generic Back semantics", /closes the topmost overlay first/i],
    ["generic player teardown", /releases the player and everything it holds/i],
    ["generic lifecycle", /captured when the app is notified it is leaving the foreground/i],
    ["generic TV performance", /phone or desktop budget/i],
  ];
  for (const [what, re] of RESTATED) check(`2 no Android TV rule restates the shared "${what}" obligation`, !re.test(tv));
  check("2 each rule states what Android adds and cites the TVB rule it extends, or has no shared counterpart",
    tvRules.length > 0 && tvRules.every((r) => (/`TVB-[A-Z0-9]+-\d+`/.test(r) && /Android adds/i.test(r)) || /no shared counterpart/i.test(r)),
    tvRules.filter((r) => !(/`TVB-/.test(r) && /Android adds/i.test(r)) && !/no shared counterpart/i.test(r)).map((r) => r.slice(0, 40)).join(" | "));
  check("2 no Android TV rule restates generic performance or accessibility", tvRules.length > 0 && !tvRules.some((r) => /budget|memory|accessib|screen reader|TalkBack/i.test(r)));
}

/* ── 3–4. no repository facts, no versions ────────────────────────────── */
{
  const t = flat(tvRules.join("\n"));
  const REPO: Array<[string, RegExp]> = [
    ["a source path", /\b(src|app|main|java|kotlin|res)\/[A-Za-z]/],
    ["a source file", /\.(kt|java|xml|gradle|kts)\b/],
    ["a named in-house type", /\b[A-Z][a-z]+(Manager|Controller|Wrapper|Presenter|ViewModel|Activity|Fragment|Screen)\b/],
    ["a module or variant name", /:app:|assemble[A-Z]|\bTvDebug|\btvRelease/],
  ];
  for (const [what, re] of REPO) check(`3 no Android TV rule encodes ${what}`, !re.test(t), (re.exec(t) ?? [""])[0]);
  const VOLATILE: Array<[string, RegExp]> = [
    ["an API level or SDK version", /API (level )?\d|\bSDK \d|\bminSdk|\btargetSdk|\bcompileSdk|\bAGP\b|Android \d/i],
    ["a store or program requirement", /Play Store|Google TV|Play Console|store (requirement|listing|review)|\d+\s?[x×]\s?\d+/i],
    ["an API or manifest symbol", /android\.(software|hardware|intent)\.|LEANBACK_LAUNCHER|uses-feature|<[a-z-]+/],
    ["a dated observation", /\b(19|20)\d\d\b/],
    ["a numeric budget", /\b\d+\s?(MB|GB|KB|fps|ms)\b/i],
  ];
  for (const [what, re] of VOLATILE) check(`4 no Android TV rule encodes ${what}`, !re.test(t), (re.exec(t) ?? [""])[0]);
}

/* ── 5, 12. Android mobile is untouched ───────────────────────────────── */
{
  check("5 android-dev-planning's mobile section cites no TV rule", !/AND-UI-TV|TVB-/.test(planMobile));
  check("5 android-feature-implementation cites AND-UI-TV-* only inside its tv section", !/AND-UI-TV/.test(IMPL.replace(implTv, "").replace(/\| Android TV[^\n]*\n/g, "")));
  check("5 android-code-review files Android TV rules only on an established TV surface",
    /`AND-UI-TV-\*`[^.]{0,200}(only|established) TV surface|established TV surface[^.]{0,200}`AND-UI-TV-\*`/i.test(flat(REVIEW)));
  for (const rel of ["skills/platform-planning/SKILL.md", "skills/platform-implementation/SKILL.md", "skills/platform-review/SKILL.md",
    "agents/feature-architect.md", "agents/feature-implementer.md", "agents/code-reviewer.md", "skills/rn-dev-planning/SKILL.md"]) {
    check(`5 ${rel} carries no Android TV rule`, !/AND-UI-TV/.test(read(rel)));
  }
  check("12 mobile planning is unchanged", /Proceed with the standard path\. Touch interaction, touch targets, and mobile navigation patterns apply\./.test(planMobile));
  check("12 the Android accessibility family is unchanged (10 rules)", [...host.matchAll(/^- `(AND-UI-A11Y-\d+)`/gm)].length === 10);
  check("12 the existing AND-UI families are unchanged",
    ["COMPOSE", "XML", "LIST", "RES", "A11Y"].every((f) => new RegExp(`^- \`AND-UI-${f}-1\``, "m").test(host)));
}

/* ── 6–8. planning, implementation and review cite both layers ────────── */
{
  const planCited = new Set([...planTv.matchAll(/`(AND-UI-TV-\d+)`/g)].map((m) => m[1]));
  check("6 Android TV planning cites concrete Android TV rule IDs", planCited.size >= ids.length && [...planCited].every((id) => ids.includes(id)), [...planCited].join(","));
  check("6 Android TV planning still cites the shared baseline", /tv-baseline\.md/.test(planTv) && /`TVB-\*`/.test(planTv));
  check("6 planning no longer says Android TV rules are unauthored", !/not yet authored/i.test(planTv) && !/no Android TV rule ID is cited/.test(planTv));
  check("6 planning's citation table lists both TV roots",
    /`AND-UI-TV-\*`/.test(PLAN.slice(PLAN.indexOf("## Standards citation"))) && /`TVB-\*`/.test(PLAN.slice(PLAN.indexOf("## Standards citation"))));

  const implCited = new Set([...implTv.matchAll(/`(AND-UI-TV-\d+)`/g)].map((m) => m[1]));
  check("7 Android TV implementation cites the Android TV rules", implCited.size >= ids.length, [...implCited].join(","));
  check("7 it cites the shared baseline", /`TVB-\*`/.test(implTv));
  check("7 it no longer says no Android TV rule is authored", !/No Android TV `AND-\*` rule is authored yet/.test(implTv));
  check("7 it builds and tests the TV variant the planning artifacts name",
    /(variant|flavor|module)/i.test(implTv) && /build selector/i.test(implTv) && /(planning artifacts)/i.test(implTv) && /Gradle/.test(implTv));
  check("7 it runs instrumentation on a TV device or emulator, or records the gap", /TV (emulator|device)/i.test(implTv) && /verification debt/i.test(implTv));
  check("7 it performs no second Project Knowledge lookup", /(do not|never) resolve Project Knowledge again/i.test(flat(implTv)));
  check("7 Developer Testing is preserved", /developer[- ]test/i.test(implTv) && /§7a|7a/.test(implTv));
  check("7 the citation table lists both TV roots", /`AND-UI-TV-\*`/.test(IMPL.slice(IMPL.indexOf("## Standards citation"))));

  check("8 review §12 files Android-TV-specific findings under AND-UI-TV-*", /file[^.]{0,80}`AND-UI-TV-/i.test(flat(review12)));
  check("8 review §12 still files shared findings under TVB-*", /`TVB-\*`/.test(review12));
  check("8 review no longer says no Android TV rules exist", !/No Android TV `AND-\*` rules exist yet/.test(REVIEW) && !/stable Android TV rules are open work/.test(REVIEW));
  check("8 review still never files against a nonexistent rule", /Never file a TV finding against a rule that does not exist/.test(review12));
  check("8 review families and citation tables route AND-UI-TV-* to code-reviewer",
    /\| `AND-UI-TV-\*` \|[^\n]*TV/.test(REVIEW) && /\| [^|]*TV[^|]*\| `standards\/android\/compose-xml-standards\.md` \| `AND-UI-TV-\*` \| code-reviewer \|/.test(REVIEW));
  check("8 surface attribution corroborates, never becomes device_type", /never treated as a `device_type`/.test(review12));
  check("8 the diff and current code stay authoritative", /(diff|current code)[^.]{0,80}(first|authoritative)/i.test(flat(review12)));
}

/* ── 9, 14. Project Knowledge and the discovery fallback ─────────────── */
{
  check("9 the section defers repository behaviour to Project Knowledge", /Project Knowledge/.test(tv) && /current source/i.test(tv));
  check("9 planning still reads Project Knowledge first", /Project Knowledge first/.test(planTv));
  check("14 the TV discovery pass keeps its 10 items", (planTv.match(/^\d+\. \*\*/gm) ?? []).length === 10);
  check("14 the toolkit-independent manifest anchor is still an orientation, not UI evidence",
    /never read them as evidence that the UI is Leanback-based/.test(planTv));
}

/* ── 10–11. framework neutrality ──────────────────────────────────────── */
{
  const TV_UI = /\bLeanback\b|Compose for TV|\bCompose TV\b|androidx\.tv/;
  const PLAYERS = /\bExoPlayer\b|\bMedia3\b|\bMediaPlayer\b|\bVLC\b/;
  const DI_NAV = /\bHilt\b|\bDagger\b|\bKoin\b|Navigation Component|Compose Navigation|\bVoyager\b|\bDecompose\b/;
  check("10 the Android TV rules name no TV UI toolkit", !TV_UI.test(tv), (TV_UI.exec(tv) ?? [""])[0]);
  check("11 the Android TV rules name no player implementation", !PLAYERS.test(tv), (PLAYERS.exec(tv) ?? [""])[0]);
  check("11 the Android TV rules name no DI or navigation library", !DI_NAV.test(tv), (DI_NAV.exec(tv) ?? [""])[0]);
  check("10 the section says the repository chooses the mechanism", /repository (chooses|decides)[^.]{0,40}mechanism|no (UI toolkit|framework)[^.]{0,80}(required|prescribed)/i.test(flat(tv)));
  for (const [label, text] of [["planning TV section", planTv], ["implementation TV section", implTv], ["review §12", review12]] as const) {
    const bad = [...prescriptions(text, TV_UI), ...prescriptions(text, PLAYERS), ...prescriptions(text, DI_NAV)];
    check(`10–11 the ${label} prescribes no toolkit, player, DI or navigation library`, bad.length === 0, bad.join(" | ").slice(0, 240));
  }
}

/* ── final TV check: nothing still claims platform TV rules are missing ── */
{
  const base = read("standards/shared/tv-baseline.md");
  check("final the shared baseline names every platform's authored TV rules",
    /`REACT-TV-\*`/.test(base) && /`IOS-UI-TV-\*`/.test(base) && /`AND-UI-TV-\*`/.test(base));
  check("final the shared baseline no longer says platform TV rules are unauthored", !/not yet authored/i.test(base));
  check("final the README no longer says Android TV rules are unauthored", !/Android-TV-specific rules\s+are not yet authored/.test(read("README.md")));
}

/* ── 13. shared TV accessibility is unchanged ─────────────────────────── */
{
  const impl = read("commands/implement-task.md");
  const s5b = flat(impl.slice(impl.indexOf("## 5b."), impl.indexOf("## 6.")));
  check("13 TV accessibility still applies the shared rules through their TV clauses", /`device_type: tv` → the flow applies, through each rule's TV clause/.test(s5b));
  check("13 TV accessibility is still TVB-A11Y-1, with no separate model", /`TVB-A11Y-1`/.test(s5b) && /no separate accessibility model/.test(s5b));
  check("13 no Android TV rule adds an accessibility requirement", !tvRules.some((r) => /accessib|screen reader|TalkBack/i.test(r)));
}

if (failures > 0) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall Android TV rule checks passed");
