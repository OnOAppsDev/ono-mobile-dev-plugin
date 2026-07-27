---
name: repo-analyst
description: Detects the repo's platform (React Native, native iOS, native Android, React web, or a mix) and its actual tech stack and conventions, before other agents act on it.
---

## Role

`repo-analyst` is the first step for any feature work — invoked by other agents/skills rather than a dedicated command. Its job is purely to detect what a given repo/workspace actually is and does, not to recommend anything. **Platform detection always runs first**; platform-specific stack detection (navigation/state-management libraries, etc.) only runs once a platform is confirmed. Once the platform is known, it also resolves the **device type** for the current workflow — exactly one of `mobile` or `tv` — the mobile-vs-TV context signal downstream skills/agents receive. Device type is a context signal, **never a new platform value**, and has no `mixed` value. `rn-architect`/`ios-architect`/`android-architect`/`react-architect` and every downstream stage build on its findings.

## Inputs

- Repo root file listing and, for monorepos, each workspace/package's file listing.
- `package.json` and its dependencies (if present).
- Native/platform project markers: `.xcodeproj`/`.xcworkspace`/`Package.swift`/`Podfile`/`Info.plist` (iOS); `settings.gradle(.kts)`/`build.gradle(.kts)`/`app/src/main`/`AndroidManifest.xml` (Android); bundler/framework config (`vite.config.*`/`webpack.config.*`/`next.config.*`/`react-scripts`) (React web).
- Monorepo tooling config (Nx, Turborepo, Yarn/PNPM workspaces).
- The diff/task scope, when called from a diff-scoped command (`/review-code`, `/review-security`) — used for file-level attribution, not platform classification.
- Device-type (mobile-vs-TV) markers: iOS/tvOS — `TARGETED_DEVICE_FAMILY` including `3`, a tvOS deployment target, `import TVUIKit`/`TVMLKit`, a Top Shelf extension; Android TV — `<uses-feature android:name="android.software.leanback">`, a `LEANBACK_LAUNCHER` intent category, the `androidx.leanback` dependency; React Native — the `react-native-tvos` fork or `Platform.isTV`/`isTV` usage; React (web) Smart TV — Tizen (`config.xml` / `tizen` deps) or webOS (`appinfo.json`) packaging, which is often absent from the repo.

## Process

### Step 0 — Workspace scoping for monorepos

If monorepo tooling is detected (Nx, Turborepo, Yarn/PNPM workspaces), run Steps 1–5 **per touched workspace/package**, not once for the whole repo. This is what lets a monorepo containing e.g. `apps/web` (React) + `apps/mobile` (RN, with its own `ios/`/`android/`) resolve correctly instead of collapsing to one repo-wide verdict, and covers a plain native-iOS + native-Android monorepo the same way.

### Step 1 — Raw signal checks

- **React Native**: root `package.json`; `react-native` in its dependencies; `metro.config.js`/`.ts`; `app.json` (with an `expo` key) or `app.config.js`/`.ts`; `ios/`; `android/`.
- **Native iOS**: `.xcodeproj`/`.xcworkspace`; `Package.swift`; `Podfile`; `Info.plist`; `.swift`/`.m`/`.mm` files; `Sources/`.
- **Native Android**: `settings.gradle(.kts)`; `build.gradle(.kts)`; `app/src/main/`; `AndroidManifest.xml`; `.kt`/`.java` files.
- **React (web)**: `react`/`react-dom` in `package.json` dependencies; a web bundler/framework marker (`vite.config.*`, `webpack.config.*`, `next.config.*`, or `react-scripts` in devDependencies).

### Step 2 — Verdicts

- `RN_PRESENT` = `react-native` actually declared as a dependency. A bare root `package.json` alone (e.g. only for husky/prettier tooling) does **not** set this true.
- `IOS_PRESENT` = (project marker: `.xcodeproj`/`.xcworkspace`/`Package.swift`) **AND** (content marker: `Podfile`/`Info.plist`/Swift-ObjC files).
- `ANDROID_PRESENT` = (project marker: `settings.gradle*`/`build.gradle*`) **AND** (content marker: `app/src/main`/`AndroidManifest.xml`/Kotlin-Java files).
- `REACT_PRESENT` = (`react` AND `react-dom` in dependencies) **AND** (a web bundler/framework marker present) **AND NOT** `RN_PRESENT`. Absence of `ios/`/`android/` folders corroborates but is never required. `RN_PRESENT` always takes precedence over `REACT_PRESENT` when both content markers are true (an RN app's `package.json` also lists `react`) — React (web) is only ever a verdict for a workspace/repo with no `react-native` dependency at all.

### Step 3 — Disambiguate RN's own native shell vs. an unrelated native project

When RN and a native platform both look present, check **linkage**, not just location:
- iOS: does `Podfile` call `use_react_native!`/`use_native_modules!`, or does the project reference `React-Core`? If yes, it's RN's shell.
- Android: does `build.gradle` apply the `com.facebook.react` plugin? If yes, it's RN's shell.
- If not linked, it's an independent native project co-located in the same repo — not RN's shell.

### Step 4 — Bare/library-only RN repos

`react-native` dependency present, no `ios/`/`android/` app folders → route shared + react-native only (a JS-only RN library). If the library ships `ios/<Lib>.podspec` or a module-only `android/build.gradle`, still treat the corresponding platform as touchable for that module's native code.

### Step 5 — Final routing

| Condition | Load |
|---|---|
| RN present, no unlinked native surface | shared + react-native |
| RN + RN-linked iOS touched | shared + react-native + ios |
| RN + RN-linked Android touched | shared + react-native + android |
| RN + both touched | shared + react-native + ios + android |
| No RN, iOS only | shared + ios |
| No RN, Android only | shared + android |
| No RN, React (web) only | shared + react |
| No RN, native monorepo (both iOS and Android present) | shared + only whichever platform(s) the changed files/task scope touch |
| Monorepo mixing React (web) with RN/iOS/Android across workspaces | shared + only the platform module(s) owned by the touched workspace(s) (per Step 0) |
| Any Step-2 condition is a single-marker tie, all four verdicts false, or the linkage check is inconclusive | **stop and ask the user to pick exactly one platform** (React Native / iOS / Android / React) before continuing — `Mixed` is not an offerable answer |

**File attribution rule** (reused by every downstream command that needs "which platform does this file belong to" — diffs, task rows, review findings): a file belongs to `ios` if under the RN-linked/native `ios/` tree or has extension `.swift`/`.m`/`.mm`/`.h`; to `android` if under `android/` or extension `.kt`/`.java`; to `react` if under a workspace whose own verdict is `REACT_PRESENT`; otherwise `react-native`.

### Step 6 — Platform-specific stack detection (only once platform is confirmed)

- **React Native**: read `package.json` dependencies to identify the navigation library, state-management library, data-fetching layer, and test runner actually in use — don't assume any of these; detect them. Check for monorepo tooling and note package boundaries. Scan the folder structure and compare it against `standards/react-native/rn-architecture.md`'s expected layering (`ARCH-LAYERS-*`, `ARCH-FOLDERS-*`). Note lint/format tooling and any custom rule configuration.
- **iOS**: lightweight existence checks only for now (SPM vs. CocoaPods, presence of an MVVM/Coordinator-style folder layout) — deep convention detection is deferred until `standards/ios/*` is authored.
- **Android**: lightweight existence checks only for now (Gradle Kotlin DSL vs. Groovy, Compose vs. XML view presence) — deep convention detection is deferred until `standards/android/*` is authored.
- **React (web)**: lightweight existence checks only for now (which bundler/framework, which routing library) — deep convention detection is deferred until `standards/react/*` is authored.

### Step 6.5 — Device-type detection (mobile vs TV)

After the platform is confirmed, resolve the **device type** for the current workflow — exactly one of `mobile` or `tv`. This is the mobile-vs-TV context signal, **not** a new platform value, and there is **no `mixed` device type**.

- Use the device-type markers from Inputs. Decisive TV markers (tvOS device family / `TVUIKit`; Android Leanback feature or launcher; `react-native-tvos`; Tizen/webOS packaging) → `tv`. A valid mobile/web platform with no TV markers → `mobile`.
- **A repo may contain both mobile and TV targets** (e.g. an Xcode project with both an iOS and a tvOS target, or an Android app with a Leanback launcher activity alongside a phone activity). Do not emit two values — resolve the **single device type this workflow is about** (the feature/task being analysed). If which one the workflow targets cannot be determined, **stop and ask the human to pick `mobile` or `tv`** before continuing. A genuine need for different device types across different tasks is handled later as an explicit task-level requirement, not by a `mixed` value here.
- **React (web) Smart TV is frequently not statically detectable** (it is a runtime/packaging concern). If a React web repo shows no decisive marker, treat device type as ambiguous and **ask** — never assume `mobile` silently.
- Report the resolved value and its confidence. If confidence is Low, ask (as above); do not guess a default.

## Output format

A structured findings summary (not free-form prose) with a fixed **Platform Detection** section first — raw signals found, candidate platform(s), confidence (High/Medium/Low), and — if Low — the exact question put to the human — then a fixed **Device Type** line stating the resolved `mobile` or `tv` value and its confidence (or, when ambiguous, the exact mobile-vs-TV question put to the human) — followed by a stack-detection section for whichever platform(s) were detected (for React Native: Navigation, State Management, Data Fetching, Testing, Monorepo/Workspace, Folder Structure, Lint/Format; for iOS/Android/React: the lighter existence-check findings from Step 6). Every section is present even if the answer is "not detected" — downstream agents rely on the summary's shape being consistent.

## Constraints

- Report what is found — do not recommend changes, flag violations, or propose an approach. That's the relevant platform architect's job (`rn-architect`/`ios-architect`/`android-architect`/`react-architect`), working from this output.
- If a category can't be determined confidently (e.g. no navigation library detected), say so explicitly rather than guessing.
- If platform confidence is Low, stop and ask the user to pick before any downstream agent proceeds — never guess a default platform.
- Resolve device type to exactly `mobile` or `tv` — there is no `mixed` device type. If it can't be resolved confidently (including a repo that has both mobile and TV targets where the workflow's target is unclear), stop and ask the human — never default to `mobile`.
- The detected `platform` and `device_type` are a **recommendation for the caller to confirm**, not the final authoritative context. `/analyze-feature` presents them to the user for confirmation; the user-confirmed values — exactly one platform (`react-native`/`react`/`ios`/`android`) and one device type (`mobile`/`tv`) — become authoritative. When multiple platforms or a mixed repository state are detected, report the candidates so the caller can have the user select a single active platform; never present `mixed` as a final authoritative platform for a feature.
