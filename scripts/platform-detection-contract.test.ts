/**
 * platform-detection-contract.test.ts
 *
 * Pins platform and device-type detection (Guardian: YEA-1371 on native tvOS, and React Native
 * repositories). Detection is executed by Claude from `agents/repo-analyst.md`, so this suite pins
 * the rules it executes and the callers' confirmation gates; the deterministic half — tracker
 * evidence as corroboration and the refusal of non-canonical routing values — is pinned in
 * scripts/analyze-bug.test.ts. Whether Claude applies these rules correctly is verified by review
 * or `claude plugin eval`, never here.
 *
 * The load-bearing properties:
 *
 *   1. One routing candidate with a resolution — resolved / ambiguous / conflicting — and the
 *      worked cases in repo-analyst's Step 5a table give the right answer for every case below.
 *   2. React Native routes `react-native`: linked shells are never separate candidates, a
 *      platform-specific bug keeps react-native with the OS in surfaces, Expo managed apps with no
 *      committed native folders are apps, and the React Native TV stop is unchanged.
 *   3. Native TV: tvOS is ios + tv, Android TV is android + tv, the native markers are recognised,
 *      and the device type is resolved together with the platform.
 *   4. The repository is authoritative: tracker evidence corroborates or picks among repository
 *      targets, never adds one; a conflict and an ambiguity both require a selection.
 *   5. The human confirmation stays: a resolved detection gets a simple confirmation, and only an
 *      ambiguous or conflicting one asks for a selection.
 *
 * OFFLINE. Reads only this repository's own markdown.
 *
 *   node --no-warnings scripts/platform-detection-contract.test.ts
 */

import { readFileSync } from "fs";
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
const section = (text: string, from: string, to: string): string => {
  const a = text.indexOf(from);
  if (a < 0) return "";
  const b = text.indexOf(to, a + from.length);
  return text.slice(a, b < 0 ? undefined : b);
};

const RA = read("agents/repo-analyst.md");
const MRA = flat(read("skills/mobile-repo-analysis/SKILL.md"));
const AF = flat(read("commands/analyze-feature.md"));
const AB = read("commands/analyze-bug.md");
const ABF = flat(AB);
const STEP5A = section(RA, "### Step 5a — The routing candidate", "### Step 5b");
const STEP5B = section(RA, "### Step 5b", "### Step 6 —");

/* ── 1. the Step 5a resolution table ─────────────────────────────────────── */
interface Row { repo: string; tracker: string; candidate: string; resolution: string }
const rows: Row[] = STEP5A.split("\n")
  .filter((l) => l.startsWith("| ") && !l.startsWith("| Repository evidence") && !l.startsWith("|---"))
  .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
  .filter((c) => c.length === 4)
  .map(([repo, tracker, candidate, resolution]) => ({ repo, tracker, candidate, resolution }));

{
  check("1 Step 5a exists and defines the three resolutions",
    STEP5A !== "" && ["`resolved`", "`ambiguous`", "`conflicting`"].every((r) => STEP5A.includes(r)));
  check("1 the resolution table has worked cases", rows.length >= 15, String(rows.length));
  check("1 every row resolves to resolved, ambiguous or conflicting", rows.every((r) => ["resolved", "ambiguous", "conflicting"].includes(r.resolution)), rows.map((r) => r.resolution).join(","));

  const CASES: Array<{ name: string; repo: RegExp; tracker: RegExp; candidate: RegExp; resolution: string }> = [
    { name: "React Native mobile app", repo: /^React Native app with linked/, tracker: /^none$/, candidate: /^`react-native` \/ `mobile`$/, resolution: "resolved" },
    { name: "React Native iOS-only bug", repo: /^React Native app with linked shells$/, tracker: /iOS only/, candidate: /^`react-native` \/ `mobile`, surfaces `\[ios\]`$/, resolution: "resolved" },
    { name: "React Native Android-only bug", repo: /^React Native app with linked shells$/, tracker: /Android only/, candidate: /^`react-native` \/ `mobile`, surfaces `\[android\]`$/, resolution: "resolved" },
    { name: "Expo managed app without native folders", repo: /^Expo managed app, no committed native folders$/, tracker: /^none$/, candidate: /^`react-native` \/ `mobile`$/, resolution: "resolved" },
    { name: "React Native TV (react-native-tvos) keeps its stop", repo: /react-native-tvos/, tracker: /^none$/, candidate: /^`react-native` \/ `tv` \(the React Native lane stops on it\)$/, resolution: "resolved" },
    { name: "React Native mobile + an Apple TV ticket", repo: /^React Native mobile app \(no TV marker\)$/, tracker: /Apple TV/, candidate: /^`react-native` \/ `mobile`$/, resolution: "conflicting" },
    { name: "native iOS", repo: /^Native iOS, no TV marker$/, tracker: /none/, candidate: /^`ios` \/ `mobile`$/, resolution: "resolved" },
    { name: "native tvOS", repo: /^Native tvOS \(`SDKROOT = appletvos`/, tracker: /none/, candidate: /^`ios` \/ `tv`$/, resolution: "resolved" },
    { name: "native tvOS + a conflicting ticket", repo: /^Native tvOS only$/, tracker: /Android or iPhone/, candidate: /^`ios` \/ `tv`$/, resolution: "conflicting" },
    { name: "iOS + tvOS targets, a tvOS ticket picks tv", repo: /^Xcode project with iOS and tvOS targets$/, tracker: /tvOS \/ Apple TV/, candidate: /^`ios` \/ `tv`$/, resolution: "resolved" },
    { name: "iOS + tvOS targets, no ticket evidence", repo: /^Xcode project with iOS and tvOS targets$/, tracker: /^none$/, candidate: /^`ios` \/ \(`mobile` or `tv`\)$/, resolution: "ambiguous" },
    { name: "native Android", repo: /^Native Android, no TV marker$/, tracker: /none/, candidate: /^`android` \/ `mobile`$/, resolution: "resolved" },
    { name: "Android TV", repo: /^Android TV \(Leanback/, tracker: /none/, candidate: /^`android` \/ `tv`$/, resolution: "resolved" },
    { name: "phone + Leanback activities, an Android TV ticket picks tv", repo: /^Android app with phone and Leanback launcher activities$/, tracker: /Android TV/, candidate: /^`android` \/ `tv`$/, resolution: "resolved" },
    { name: "independent iOS + Android, an iOS ticket picks ios", repo: /^Independent native iOS and native Android \(no RN\)$/, tracker: /names iOS/, candidate: /^`ios` \/ `mobile`$/, resolution: "resolved" },
    { name: "independent iOS + Android, no ticket evidence", repo: /^Independent native iOS and native Android \(no RN\)$/, tracker: /^none$/, candidate: /^\(`ios` or `android`\) \/ `mobile`$/, resolution: "ambiguous" },
    { name: "nothing detected", repo: /^Nothing decisive detected$/, tracker: /^any$/, candidate: /^—$/, resolution: "ambiguous" },
  ];
  for (const c of CASES) {
    const hit = rows.filter((r) => c.repo.test(r.repo) && c.tracker.test(r.tracker));
    check(`1 case: ${c.name}`, hit.length === 1 && c.candidate.test(hit[0].candidate) && hit[0].resolution === c.resolution, JSON.stringify(hit));
  }

  // Canonical values only: no TV or mixed spelling is ever a routing value.
  const tokens = rows.flatMap((r) => [...r.candidate.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((t) => !t.startsWith("[")));
  const allowed = ["react-native", "react", "ios", "android", "mobile", "tv"];
  check("1 the table's candidates use only canonical platform and device values", tokens.length > 0 && tokens.every((t) => allowed.includes(t)), tokens.filter((t) => !allowed.includes(t)).join(","));
  // The repository is authoritative: a `tv` candidate needs a TV marker in the repository evidence.
  const tvRows = rows.filter((r) => /`tv`/.test(r.candidate) && !/\(`mobile` or `tv`\)/.test(r.candidate));
  check("4 a tv candidate always rests on a repository TV target", tvRows.length >= 4 && tvRows.every((r) => /tvOS|TV|Leanback|react-native-tvos/.test(r.repo)), JSON.stringify(tvRows.map((r) => r.repo)));
  // A ticket naming TV against a repository with no TV target never routes tv.
  const tvTicketNoTarget = rows.filter((r) => /Apple TV|tvOS|Android TV/.test(r.tracker) && /no TV marker/.test(r.repo));
  check("4 a TV ticket against a repository with no TV target is conflicting, never tv", tvTicketNoTarget.length >= 1 && tvTicketNoTarget.every((r) => r.resolution === "conflicting" && !/`tv`/.test(r.candidate)));
}

/* ── 2. React Native ─────────────────────────────────────────────────────── */
{
  const s5a = flat(STEP5A);
  check("2 React Native routes react-native; linked shells are not separate candidates",
    /\*\*React Native routes `react-native`\.\*\*/.test(s5a) && /they are not separate routing candidates/.test(s5a));
  check("2 a platform-specific React Native bug keeps react-native, the OS goes to surfaces",
    /affects only iOS or only Android in a React Native app still routes `react-native`; the affected OS is recorded in the bug's \*\*surfaces\*\*/.test(s5a));
  check("2 only an unlinked native project co-located with RN is a separate candidate", /Only an \*\*unlinked\*\* native project/.test(s5a));
  const step4 = flat(section(RA, "### Step 4", "### Step 5 —"));
  check("2 Expo managed apps are apps, not JS-only libraries",
    /\*\*Expo managed app\*\* — the `expo` dependency \*\*and\*\* an app config/.test(step4) && /routes `react-native`/.test(step4) && /absence is expected/.test(step4));
  check("2 a JS-only library is only what is neither", /\*\*JS-only RN library\*\* — neither of the above/.test(step4));
  check("2 Expo signals are raw React Native signals", /the `expo` dependency; `eas\.json`/.test(RA));
  const step5 = flat(section(RA, "### Step 5 —", "### Step 5a"));
  check("2 Step 5's table is lanes to load, not the routing candidate",
    /### Step 5 — Lanes to load/.test(RA) && /It is not the routing candidate/.test(step5) && /never a second routing platform/.test(step5));
  const rnPlan = flat(read("skills/rn-dev-planning/SKILL.md"));
  check("2 the React Native TV stop is unchanged", /`platform: react-native` with `device_type: tv` is unsupported — report the unsupported context and stop/.test(rnPlan));
  check("2 react-native-tvos is still a decisive TV marker", /`react-native-tvos`/.test(STEP5B));
}

/* ── 3. native TV ────────────────────────────────────────────────────────── */
{
  const inputs = flat(section(RA, "## Inputs", "## Process"));
  for (const m of ["`SDKROOT = appletvos`", "`appletvos`", "`TARGETED_DEVICE_FAMILY` including `3`", "`TVOS_DEPLOYMENT_TARGET`", "Podfile `platform :tvos`", "`.tvOS(`", "android.software.leanback", "`LEANBACK_LAUNCHER`", "`androidx.leanback`"]) {
    check(`3 the tvOS/Android TV marker ${m} is recognised`, inputs.includes(m));
  }
  check("3 Android TV markers hold whatever UI framework the app uses", /whatever UI framework the TV app uses, including a custom one/.test(inputs));
  const s5a = flat(STEP5A);
  check("3 tvOS is ios + tv and Android TV is android + tv", /tvOS \/ Apple TV is `ios` \+ `tv`; Android TV \/ Google TV is `android` \+ `tv`/.test(s5a));
  check("3 no TV spelling is ever a platform", /Never report `tvos`, `apple-tv`, `android-tv` or `mixed` as a platform or device type/.test(s5a));
  const s5b = flat(STEP5B);
  check("3 the device type is resolved together with the platform, before the confirmation",
    /Together with the platform, resolve the \*\*device type\*\* for the current workflow/.test(s5b) && /before the caller's confirmation, so the developer confirms both at once/.test(s5b));
  check("3 the old after-confirmation device-type step is gone", !/### Step 6\.5/.test(RA) && !/After the platform is confirmed, resolve the \*\*device type\*\*/.test(RA) && !/Step 6\.5/.test(RA));
  check("3 a repository with both mobile and TV targets still never defaults", /never default to `mobile`/.test(flat(RA)) && /report the resolution `ambiguous`: the caller must then stop and ask the human to pick `mobile` or `tv`/.test(s5b));
  check("3 mobile-repo-analysis lists the tvOS markers and resolves both together", /`SDKROOT = appletvos`/.test(MRA) && /Podfile `platform :tvos`/.test(MRA) && /together with the platform in step 1/.test(MRA));
}

/* ── 4. tracker evidence ─────────────────────────────────────────────────── */
{
  const s5a = flat(STEP5A);
  check("4 the repository is authoritative and tracker evidence corroborates", /\*\*The repository is authoritative; tracker evidence corroborates\.\*\*/.test(s5a));
  check("4 tracker evidence never adds a platform or device type", /It never adds a platform or device type the repository does not support/.test(s5a));
  check("4 tracker evidence alone is ambiguous", /Tracker evidence alone, with nothing detected, is `ambiguous`/.test(s5a));
  check("4 Project Knowledge corroborates the same way, never picks", /never pick the pair/.test(s5a));
  check("4 the constraint is stated", /Tracker evidence never introduces a platform or device type the repository does not support/.test(flat(RA)));
  check("4 tracker evidence is an Input, corroborating only", /\*\*Tracker evidence\*\*, when the caller passes it/.test(RA) && /never a detection input of its own/.test(flat(RA)));
  check("4 /analyze-bug passes the ticket evidence to repo-analyst",
    /pass it the tracker evidence as corroboration: `routing\.corroborating_surfaces`, `routing\.corroborating_environment`, and the ticket's project key and name/.test(ABF));
  check("4 /analyze-bug records the ticket's environment and named OS, never an invented one",
    /Copy the ticket's environment field into `environment` verbatim/.test(ABF) && /record it in `surfaces` as a plain id/.test(ABF) && /never invent one the ticket does not state/.test(ABF));
  check("4 /analyze-bug: the repository decides what is possible", /\*\*The repository decides what is possible\.\*\*/.test(ABF) && /never adds a platform or device type the repository does not support/.test(ABF));
  check("4 /analyze-bug: surfaces and environment corroborate, never choose on their own", /They never choose the platform or device type on their own/.test(ABF));
}

/* ── 5. the confirmation gate ────────────────────────────────────────────── */
{
  check("5 /analyze-feature still always requires confirmation", /require confirmation before using it — always/.test(AF));
  check("5 /analyze-feature keeps its confirmation question", /Is the current feature intended for this context\?/.test(AF));
  check("5 /analyze-feature: resolved → a simple confirmation, RN shells and Expo included",
    /\*\*`resolved` → offer exactly this simple confirmation\.\*\*/.test(AF) && /linked iOS and Android shells \(they are not separate platforms\)/.test(AF) && /Expo managed app/.test(AF));
  check("5 /analyze-feature: no choice between platforms the repository does not genuinely offer", /Do not ask the developer to choose between platforms the repository does not genuinely offer/.test(AF));
  check("5 /analyze-feature: ambiguous or conflicting → a selection, no Yes path",
    /\*\*`ambiguous` or `conflicting` → do not offer a "Yes, continue" path\.\*\*/.test(AF) && /require the user to select the single active platform and device type/.test(AF));
  check("5 /analyze-feature no longer withholds Yes merely because several lanes load", !/If `repo-analyst` detected multiple platforms or a mixed repository state/.test(AF));
  check("5 /analyze-bug keeps the shared gate and its question", AB.includes("`/analyze-feature` step 2") && /Is this bug in this context\?/.test(AB));
  check("5 /analyze-bug: ambiguous or conflicting → a selection among repository options",
    /When the resolution is `ambiguous` or `conflicting`, offer no "Yes, continue" path: show the repository-supported options/.test(ABF));
  check("5 /analyze-bug: a platform-specific React Native bug stays react-native",
    /\*\*React Native stays `react-native`\.\*\*/.test(ABF) && /the affected OS is in `surfaces`, never the platform/.test(ABF));
  check("5 /analyze-bug names the canonical TV pairs for the developer", /tvOS \/ Apple TV is `ios` \+ `tv` and Android TV is `android` \+ `tv`/.test(ABF));
  check("5 mobile-repo-analysis: resolved → confirmation, ambiguous/conflicting → selection",
    /\*\*When the resolution is `resolved`\*\*/.test(MRA) && /When it is `ambiguous` or `conflicting`, do not offer a "Yes, continue" path/.test(MRA));
  check("5 repo-analyst's detection is still a recommendation for the caller to confirm", /are a \*\*recommendation for the caller to confirm\*\*/.test(RA));
  check("5 the output reports the one candidate, its resolution and the lanes apart",
    /the \*\*one routing candidate\*\* and its \*\*resolution\*\*/.test(RA) && /the lanes to load \(Step 5\), kept apart from the routing candidate/.test(RA));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
