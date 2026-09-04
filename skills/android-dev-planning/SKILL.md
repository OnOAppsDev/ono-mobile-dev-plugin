---
name: android-dev-planning
description: Repository-first planning methodology for native Android features — establishes from evidence what the repository actually builds (Gradle topology, toolchain, merged manifest, UI toolkit, architecture, data and concurrency model), then supplies the Android vocabulary and the `AND-*` plus shared standard IDs for a feature analysis's proposed approach, a Detailed Design's Technical Implementation Approach (§19) and Impacted Modules (§20), and the task breakdown. Used by /analyze-feature, /dev-design-start and /dev-feature-start via the android-architect agent, alongside the shared dev-design-start / dev-feature-start skills, which own the overall mechanics. Assumes no UI toolkit, architecture pattern, DI framework or library; handles device_type mobile and tv.
---

# Android Dev Planning

## Overview

The methodology `android-architect` follows for native Android work — `/analyze-feature`'s proposed approach, `/dev-design-start`'s DD §19 and §20, `/dev-feature-start`'s task vocabulary. Two kinds of content:

- **What a platform-independent layer could not write** — which dimensions of an Android repository to establish, the Android vocabulary for the approach, change surface and task breakdown, and which `AND-*` and shared IDs may be cited.
- **What the shared layer delegates to each platform lane** — the evidence labels in [§3](#3-android-repository-evidence-collection) and the verify-later mechanism in [§7](#7-verify-later-mechanism-for-android); neither is Android-specific, but the architecture assigns them here.

**Not orchestration, not generic DD methodology** — see [What this skill does not own](#what-this-skill-does-not-own). It never writes code, never modifies a repository file, never flips a document's status, gates no approval. It plans.

**Assumes no framework and no library.** Jetpack Compose, XML/Views, hybrid and mid-migration surfaces, MVVM, MVI, Clean Architecture, Hilt, Dagger, Koin, manual DI, coroutines/Flow, RxJava, Retrofit, Ktor, Room, DataStore, `SharedPreferences` — each **a possible finding, never a default**. The repository's conventions are the source of truth.

**A custom or legacy model is a first-class finding, not a defect — plan within it.** In-house base classes, a project-specific UI abstraction, a bespoke rendering or navigation layer, a custom store or an in-house scheduler carry exactly the standing a named library would, and the repository's own conventions apply alongside the standards. Where a custom abstraction wraps a standard mechanism, apply the standard's *intent* to the wrapper's observable behaviour rather than demanding the standard API — that is a rule genuinely applying, not the merely-adjacent citation [§8](#8-android-standards-citation) forbids.

## What this skill does not own

Referencing these is correct; restating them is duplication.

| Concern | Owner |
|---|---|
| Artifact resolution, approval gates, platform and device confirmation, architect routing | `commands/analyze-feature.md`, `commands/dev-design-start.md` |
| DD frontmatter, `doc_schema_version` stamping, detail level, the §20 change-class rule, the ~800-line contraction trigger, the mandatory Step 7 contraction pass | `skills/dev-design-start/SKILL.md` Steps 2, 6, 7 |
| Repository-knowledge resolution, what may be reused, the citation shape | `skills/repo-knowledge-consumer/SKILL.md` |
| Statement classification, risk taxonomy, the ranked source-of-truth hierarchy | `skills/dev-design-start/SKILL.md` § *Shared planning rules* — defined once there. Apply as written; **no Android copy**. This lane supplies only the two parameterised ranks ([§1](#1-source-of-truth-hierarchy)) |

## 0. Standards readiness gate

Every Android rule cited lives in one of the ten `standards/android/*` files listed in [§8](#8-android-standards-citation) — **198 `AND-*` rules** between them, including the `AND-*TV-*` families [§6](#6-device_type-handling) cites on a TV surface. Before planning, confirm each is **present** and not a structure-only placeholder. If one is missing, renamed away or unauthored, **stop and report that Android planning is blocked until it is authored**; never fall back to an assumed default. All ten are authored today; the gate exists so the skill fails loudly if that regresses.

## 1. Source-of-truth hierarchy

Defined once in `skills/dev-design-start/SKILL.md` § *Shared planning rules → Source-of-truth hierarchy*. Apply as written; not restated here.

Android's two parameterised ranks: **rank 4** — `standards/android/*` plus `standards/shared/*`; **rank 5** — official Android developer documentation ([References](#references)). *Recommendations for Android Architecture* is the rank-5 arbiter: it alone grades decisions **Strongly recommended / Recommended / Optional**, settling whether a repository pattern is a sanctioned variant or a finding.

**One rank-4 vs rank-5 divergence is known and named, never silently resolved:** `AND-VM-EVENT-1` (`standards/android/android-architecture.md:28`) mandates the one-shot event channel for navigation, toasts and dialogs; official guidance says the opposite — do not send ViewModel→UI events, reduce them into state. Rank 4 outranks rank 5, so the standard governs. Record the divergence; resolve it neither way.

## 2. Repository-knowledge reuse

Repository knowledge is resolved by the invoking command and consumed through the `repo-knowledge-consumer` skill, which owns the resolution procedure, what may be reused, and the citation shape. Apply it as written; it is not restated here. Two facts this lane adds on top: repository knowledge arrives **already resolved for this run**, so the manifest is never parsed directly and a reusable category never re-derived; and **`device_type` never comes from repository knowledge** — the manifest carries no device information (`skills/repo-knowledge-consumer/SKILL.md:154`) — it arrives confirmed from the command, per [§6](#6-device_type-handling).

This lane adds: **derive live the Android detail no repository-wide document can hold** — actual signatures, state shape and call sites of the classes *this feature* touches, alongside the categories the consumer reports as `deriveLive`. That reading is required, not manifest duplication.

## 3. Android repository evidence collection

Inspect the codebase before proposing anything. `repo-analyst`'s inventory is a starting signal, **not** a design's evidence base: it runs only lightweight existence checks and hands deeper inspection here (`agents/repo-analyst.md:86`).

Order matters:

- **Dimensions 1-4 decide what actually ships** — nothing from 5 onward is answerable until the build graph, toolchain, SDK/language baseline and *merged* manifest are known.
- **From dimension 6 the sweep is pattern-driven, not repo-wide** — locate the nearest analogous feature once, answer later dimensions from it, then widen; expect legitimately **per-surface** answers for UI toolkit, state holder and navigation. An untouched dimension is `N/A`, never surveyed for completeness. Two limits: **never assume the mobile surface's conventions apply to the TV one** in a repository holding both; and for a wide-reaching change read every relevant file for the true blast radius, without which the site counts below cannot be given.

1. **Gradle project & module topology** — `settings.gradle(.kts)` include list; each module's type, plugins and dependency edges, with **each edge's configuration** (`api` re-exports to that module's consumers, `implementation` does not); this feature's module; each module's public vs `internal` Kotlin surface — separate from the configuration question. → `AND-ARCH-MODULE-1..4`, `AND-ARCH-DEPS-2`
2. **Build configuration & toolchain** — DSL per build file (mixed is legitimate); declaration style (version catalog, `buildSrc`, convention plugins, raw coordinates — equal findings); AGP/Gradle/Kotlin/JDK versions; `buildTypes` × `flavorDimensions` and the **derived** variant set; per-variant source sets; env/config mechanism; **where secrets, tokens and API keys live** and how they reach a build (never hardcoded, never committed); signing configs. → `AND-REL-VARIANT-1/3/4`, `AND-REL-DEP-1`, `AND-REL-SIGN-1/2`, `SEC-SECRETS-*`
3. **Platform & language baseline** — `minSdk`/`targetSdk`/`compileSdk` per module; Kotlin language version; Kotlin↔Java mix; Compose compiler configuration. `targetSdk` is **behavioural** input, not release metadata (Detection traps). → `AND-REL-VARIANT-2`, `AND-KT-NULL-3`
4. **Manifest surface (merged, not authored)** — components and their `exported` flags; permissions; `<uses-feature>`; `android:supportsRtl`; deep-link `<intent-filter>`s and `autoVerify`; compat `<property>` opt-outs; which arrive from library manifests. → `AND-REL-VARIANT-3` (placeholders), `SEC-DEEPLINK-3`, `SEC-PERMS-1`; no `AND-*` rule covers manifest merging — report that gap
5. **UI toolkit — per surface** — per surface touched: Compose, XML/Views, an interop boundary, or a **custom / project-specific** layer over one (in-house base classes, UI abstractions, a bespoke rendering layer); binding mechanism enabled in *that module's* `buildFeatures`; `ComposeView`/`AndroidView` sites and the `ViewCompositionStrategy` set; design-system and theme entry points; any `WebView` and its JavaScript, file-access and URL-loading configuration. → `AND-UI-COMPOSE-*`, `AND-UI-XML-*`, `AND-UI-LIST-*`, `SEC-WEBVIEW-*`
6. **Existing analogous feature & reusable surfaces** — nearest comparable feature (module, package layout, state holder, navigation entry, repository, DI module, tests, strings); shared components, base classes and design-system entries to reuse, not recreate. → `AND-UI-LIST-1`, `AND-UI-XML-5`, `AND-UI-RES-4`, `AND-NAV-DEST-2`, `AND-NET-CLIENT-1`, `AND-REL-DEP-2`
7. **Presentation architecture & layering** — which layers exist (UI, optional domain, data); repositories as the data-layer entry point or not; the pattern in use; dependency direction and cycles. An absent domain layer is legitimate, not a defect to fix for one feature. → `AND-ARCH-LAYERS-1..3`, `AND-ARCH-DEPS-1/2`
8. **State holders, UI state & lifecycle** — per surface: `ViewModel` vs plain state holder; UI-state shape and explicit loading/empty/success/error; one-time effects via channel vs reduced into state; `SavedStateHandle` and process death; lifecycle-aware flow collection. → `AND-VM-STATE-1..4`, `AND-VM-EVENT-1`, `AND-VM-LIFECYCLE-1..3`, `AND-KT-SEALED-1/2`
9. **Concurrency & reactive model** — coroutines+Flow, RxJava, `LiveData`, callbacks or a mix; **how a dispatcher is obtained** (injected provider vs hardcoded); which scopes launch work; the type each layer boundary exposes; cancellation and exceptions. → `AND-KT-COROUTINE-1..6`, `AND-PERF-THREAD-1`
10. **Dependency injection & composition root** — Hilt, Dagger, Koin, manual DI or a service locator; where the object graph is composed; component/module boundaries and each binding's scope; how ViewModels get their dependencies. → `AND-DI-1..4`
11. **Navigation & Activity topology** — single- vs multi-Activity; mechanism(s) and host (Navigation Component, Compose Navigation, `FragmentTransaction`, `Intent`-based, a **custom router** or a project-specific abstraction — equal findings); route and argument typing; back stack and predictive-back readiness; deep-link entry points and where they are validated. → `AND-NAV-DEST-1..3`, `AND-NAV-ARGS-1..3`, `AND-NAV-STACK-1/2`, `AND-NAV-LAYER-1`, `SEC-DEEPLINK-1/2`
12. **Data layer & persistence** — repository boundary; single source of truth; store per data kind (Room, DataStore, `SharedPreferences`, files, a **custom store**); Room migration mechanism, `exportSchema` and a committed schema JSON, destructive fallback; cache/freshness rules; secure-storage conventions. → `AND-DATA-STORE-1..3`, `AND-DATA-MIGRATE-1..3`, `AND-DATA-THREAD-1`, `AND-DATA-CACHE-1`, `AND-DATA-SEC-1..3`, `SEC-STORAGE-*`
13. **Networking** — client and its shared configured instance; interceptors for base URL, timeouts, retry, logging; how auth is attached and 401/refresh handled; serialization library and DTO→domain mapping; normalised error type; offline behaviour — Android ships **no opinionated networking stack**, so each is a repo fact with no default. → `AND-NET-CLIENT-1..3`, `AND-NET-CONTRACT-1/2`, `AND-NET-DTO-1/2`, `AND-NET-AUTH-1/2`, `AND-NET-ERR-1..5`, `SEC-NET-*`, `SEC-AUTH-*`
14. **Background & long-running work** — must the work survive the app leaving the foreground; the mechanism in use (WorkManager, a service or foreground service, a broadcast receiver, `JobScheduler`, an **in-house scheduler**) — categories differ in **guarantee**, not ergonomics. Use the mechanism the repository already has, justified against four questions — survive process death? deferrable? user-visible? time-critical? — and **never introduce a new background mechanism when an existing one fits.** → `AND-KT-COROUTINE-1`, `AND-PERF-SIZE-3` (battery cost of polling, wake locks, alarms); no rule names a scheduler or foreground service — report that gap
15. **Resources, configuration qualifiers, localisation & RTL** — `res/` layout and which **qualifier** directories exist; string/plural conventions and how many locales are maintained; `android:supportsRtl`, start/end attributes, mirrored drawables; dark theme; theme/token resources. → `AND-UI-RES-1..5`, `I18N-COPY-*`, `I18N-RTL-*`, `I18N-FMT-*`, `I18N-TEST-*`
16. **Adaptive layout & form factor** — layout decisions from window metrics vs hardcoded orientation and device checks; declared orientation/resizability/aspect-ratio restrictions and any compat opt-out; targeted form factors — answer with dimension 3 first: `targetSdk` can make those declarations inert (Detection traps). → `AND-UI-XML-7` (configuration-change state) only; nothing covers window size classes or foldables — report that gap
17. **Accessibility** — does the design system already meet touch-target and contrast thresholds; how semantics are expressed on the toolkit found in 5; role and state exposure; merged semantics for grouped rows; font scaling; is TalkBack actually exercised. → `AND-UI-COMPOSE-7`, `AND-UI-LIST-6`, `A11Y-ROLES-*`, `A11Y-TOUCH-*`, `A11Y-FONT-*`, `A11Y-SR-*`, `A11Y-CONTRAST-*`, `A11Y-COLLECTION-*`
18. **Testing setup** — **per module**: whether `src/test/` and `src/androidTest/` exist and what each holds; frameworks; test doubles; dispatcher and flow test tooling; actual coverage of the layers touched — two source sets, separate dependency configurations. → `AND-TEST-UNIT-1..3`, `AND-TEST-VM-1..3`, `AND-TEST-INSTR-1`, `AND-TEST-COMPOSE-1/2`, `AND-DATA-MIGRATE-3`
19. **Logging, analytics & observability** — logging abstraction and how it is gated or stripped in release; analytics wrapper, naming convention, existing events; crash reporter; feature flags and remote config; the PII posture in all of them. → `AND-LOG-HYGIENE-1..3`, `AND-LOG-ANALYTICS-1..3`, `AND-LOG-PII-1..3`, `SEC-LOG-*`
20. **Performance posture & release shaping** — image-loading library; recycling/lazy containers on scroll-critical surfaces; what runs on the cold-start path; Baseline Profiles and Macrobenchmark setup; reflective, serialised or native-interop types the feature adds that need **keep rules** (name the concept, never a version-specific file). → `AND-PERF-LIST-*`, `AND-PERF-IMAGE-*`, `AND-PERF-MEM-*`, `AND-PERF-SIZE-1/2`, `AND-REL-R8-1/2`
21. **Client integrations on the feature's path** — media and playback (player library and version, who owns its lifecycle, the playback surface and playback-state model); push messaging and notification channels, including the runtime notification permission; any other third-party SDK touched. A player or messaging-library migration is planned here. → `AND-VM-LIFECYCLE-1/2`, `SEC-PERMS-1..3`, `SEC-DEPS-*`; no `AND-*` rule names a player, a notification channel or a push SDK — report that gap, never an adjacent rule

**Label every finding** `[evidence: <path>]`, `[reused: <path>#<anchor>]`, `[inference]` or `[unknown]`. **An unlabelled claim about the repository is a defect; prefer `[unknown]` over a guess.** `[unknown — <what is missing>]` is never by itself a stop. The vocabulary is the platform lane's (`skills/rn-dev-planning/SKILL.md:77`). Record the change surface **while** sweeping, for [§4](#4-technical-implementation-approach-dd-19) and [§5](#5-impacted-modules-dd-20): modules entered, the distinct *kinds* of change, roughly how many sites each repeats across.

### Detection traps

Each names the naive check and the reliable signal.

- **A dependency's presence is not evidence of use** — Compose artifacts arrive transitively. Signal, all three per module: `buildFeatures { compose = true }` in *that module*, the Compose compiler plugin (or a legacy `composeOptions` block pre-Kotlin-2.0), a real `@Composable` call site on the surface being changed.
- **`app/src/main/AndroidManifest.xml` is not the app's manifest** — merge priority runs variant → app main → library, and `tools:node="remove"`/`tools:replace` can delete or override entries — a library can inject a permission or provider invisibly. Signal: `module/build/outputs/logs/manifest-merger-<variant>-report.txt`; otherwise `[unknown — requires merged manifest]`.
- **`targetSdk` silently rewrites behaviour** — edge-to-edge is enforced once the app targets 35; at 36 `onBackPressed` is no longer called and orientation/resizability declarations go inert on displays whose smallest width is >= 600dp. Signal: read `targetSdk` **before** deciding whether an insets, back or orientation rule applies at all.
- **`src/main/` is not the code that ships** — for `demoDebug` Gradle resolves `src/demoDebug/` → `src/debug/` → `src/demo/` → `src/main/`, and for `res/` qualifier **precedence** beats the number of matching qualifiers. Signal: resolve the variant's source-set and qualifier winners before citing a file.
- **Grepping `minifyEnabled` alone can read a modern project as un-minified** — AGP 9.3 **added** an `optimization { enable = true }` DSL covering code and resources together, and a `keepRules` source set; it **replaced nothing**, so the legacy `minifyEnabled` / `proguardFiles(...)` form is still supported and **either DSL may be in use**. Signal: read the AGP version, then check both DSLs and both keep-rule locations.
- **Four single-signal reads that are wrong on their own** — an XML layout can be a Compose screen (`ComposeView` is declarable in XML); "it has ViewModels" is not the state-holder finding (Android documents two kinds with opposite lifecycles); a hardcoded `Dispatchers.IO` may be the violation rather than the convention; "no `androidTest/`" is not "no Android coverage" (Robolectric is a *local* test). Read the call site, per surface.

## 4. Technical Implementation Approach (DD §19)

Express the approach in the repository's own Android vocabulary, grounded strictly in [§3](#3-android-repository-evidence-collection). Section scope and resolution are `skills/dev-design-start/SKILL.md` Step 6 and `templates/dd-template.md` §19; this lane supplies the vocabulary.

- **Surfaces** — screens, composables, fragments or activities added or changed; design-system components reused, named by path.
- **State and data flow** — where UI state lives (`ViewModel` or plain state holder), its shape, one-time-effect delivery, where the single source of truth sits, in the mechanism §3 found. Trace input → state holder → domain/repository → data source → surface, **naming the actual classes**. Decide survival per piece of state — transient, restorable, or persisted — and **state the decision even when the answer is "nothing needs to survive"; silence here is a common defect.**
- **Layering and placement** — the layer each new type belongs to and the Gradle module or package it lands in, against §3.1. Then **confirm the composed approach itself**, separate from the sweep: it inverts no layer direction and creates no new dependency cycle (`AND-ARCH-LAYERS-1..3`, `AND-ARCH-DEPS-1/2`).
- **Concurrency, background work and data** — this feature's §3.9, §3.12, §3.13 and §3.14 choices: scope, how the dispatcher is obtained, the background mechanism and the guarantee it owes, store and any migration, client, DTO→domain mapping, normalised error type, boundary types.
- **Navigation** — destination, argument typing, back-stack behaviour, any deep link, in the detected mechanism's terms. Back-stack expectations, a fixed start destination and predictable up/back behaviour apply to **any** navigation implementation, including a fully custom one — plan them regardless of mechanism.
- **Build and release shaping** — any variant, config value, dependency or keep-rule consequence created.
- **Testing** — what is tested at which level, in §3.18's frameworks and source sets rather than new ones: domain and failure paths, state-holder behaviour and emitted state sequences, instrumentation or Compose UI tests where that harness exists, localisation and RTL where relevant. Where a touched layer has no harness, say so rather than planning tests that cannot run. → §3.18's IDs, plus `I18N-TEST-*`
- **Cross-cutting** — the resource/RTL, accessibility, performance, logging and security decisions made, each citing its ID from [§8](#8-android-standards-citation).

Every statement carries its class per `skills/dev-design-start/SKILL.md` § *Shared planning rules → Classification*. **The §3 sweep informs this section but is not its content** — §19 receives conclusions and cited IDs, never the survey. `/dev-feature-start` decomposes this vocabulary into tasks.

## 5. Impacted Modules (DD §20)

Name the change surface as **Gradle modules × change classes**, in Android's terms: Gradle module (or package, in a single-module project), **source set**, **variant**, **flavor dimension**, plus the units inside — feature module, `:core`/`:data`/`:domain`, screens and composables, fragments and activities, ViewModels and state holders, repositories and data sources, DAOs and DataStore serializers, API interfaces and DTO/mapper files, DI modules, navigation graphs or route types, resource sets, and a module's own build script when the feature changes build configuration.

For each, state the class of change and whether it is created, modified or only read. **`skills/dev-design-start/SKILL.md` Step 6 and `templates/dd-template.md` §20 own the resolution rule — modules × change classes, never files × edits — with the roughly-ten-or-fewer site threshold for enumerating files and a worked site-count example**; this section supplies the Android vocabulary the classes are named in.

Every path must be evidence-backed. Mark an undetermined location `[unknown — target module not determined]` rather than inventing a plausible one, and name the variant or source set explicitly when the change is not in `src/main/`. `/dev-feature-start` expands these change classes into per-file tasks in this vocabulary, so a vague module or variant here becomes an unbuildable task there.

## 6. device_type handling

`device_type` arrives confirmed and authoritative from the command (`agents/repo-analyst.md:113-114`, `templates/feature-analysis-template.md:12`). **It is a context signal, never a separate platform**: there is no TV platform value and no TV-specific agent, skill or command. **Never re-detect it, never accept `mixed`, and stop rather than defaulting to `mobile`** if it is missing, empty, or any value other than `mobile`/`tv`.

### `device_type: mobile`

The mobile-only decisions a plan must settle:

- Which window size classes the feature must work at; window metrics vs hardcoded orientation/device checks (§3.16).
- Touch interaction: minimum activation targets and spacing per `A11Y-TOUCH-1/2`; behaviour under font scaling (`A11Y-FONT-1..3`).
- Insets and system-bar behaviour, and back-navigation semantics — both conditional on §3.3's `targetSdk`.
- State across configuration change and process death (`AND-VM-LIFECYCLE-2`, `AND-UI-XML-7`).
- Any runtime-permission path the feature opens, with the denial and rationale UI states it needs (`SEC-PERMS-1..3`).

### `device_type: tv`

**On `device_type: tv`, cite the `AND-*TV-*` rules in addition to the base `AND-*` rules, which all still apply on a TV surface unchanged** — nothing here relaxes or forks one. Each host document carries its TV rules in its own `## Android TV Context (device_type: tv)` section, so the cited ID's root still decides which file owns it; the families and their files are the TV rows of [§8](#8-android-standards-citation).

**Run this discovery pass before proposing anything**, recording the evidence for each item that exists and marking the rest `[unknown]`. Identifying what the repository actually does comes **first**; architectural and planning decisions come after.

1. **Focus handling** — how focus moves, is tracked and restored; any custom focus engine or manager. → `AND-UI-TV-FOCUS-*`
2. **D-pad and remote input** — where key events are received and dispatched; custom key handling; media and remote buttons. → `AND-NAV-TV-DPAD-*`, `AND-NAV-TV-AXIS-1`
3. **Navigation abstractions** — the TV navigation mechanism, which may differ from any mobile one in the same repository. → `AND-NAV-TV-BACK-*`, `AND-NAV-TV-FOCUS-1`
4. **TV UI components** — the component set actually in use: framework widgets, an in-house set, or something else. → `AND-UI-TV-COMP-1`, `AND-UI-TV-LAYOUT-1`
5. **Playback integration** — the player, who owns its lifecycle, surface handling and playback-state model, where the feature touches playback. → `AND-PERF-TV-4`
6. **Screen lifecycle** — TV-specific background and resume behaviour, and the stop path. → `AND-ARCH-TV-1`, `AND-ARCH-TV-2`
7. **Reusable base classes and framework modules** — the TV base screen types and in-house modules the feature should extend, and their public surface. → `AND-ARCH-TV-1`, `AND-ARCH-TV-3`

Two more the plan needs even though the brief lists them separately: **launcher and banner configuration** (`AND-REL-TV-LAUNCH-1`, `AND-REL-TV-FEATURE-1/2`, `AND-REL-TV-BANNER-1`) and **TV packaging and release configuration** (`AND-REL-TV-TRACK-1`, `AND-REL-TV-BUILD-1`).

- **Cite the TV families as well as the base rules, never instead of them.** `AND-UI-TV-*`, `AND-NAV-TV-*`, `AND-PERF-TV-*` and `AND-ARCH-TV-*` apply **only** once a TV surface is established; where none is, they are N/A and may not be raised. **`AND-REL-TV-*` is the exception** — `standards/android/gradle-build-signing.md`'s TV section is deliberately scoped to the shipping artefact rather than to an established surface, because the declarations it governs are what establish one, so those nine are in play wherever the repository ships or has been asked to ship a TV target, including the greenfield case below. `AND-PERF-TV-1`'s memory budget travels with its own assumption — no active bindings, a single video stream — and tightens without it; **Android publishes no TV figure for start-up, playback start or navigation latency**, so a plan asserts none.
- **Any implementation model may be in use** — this organisation's Android TV surface uses a **custom in-house framework**, so the conventional framework signals are absent or actively misleading, and no rule cited here names a TV framework as required. Detect what the repository actually has; assume nothing. A deprecated-but-present framework is **never** migrated off unless the feature asks for it — that is optional modernization, never required feature work (`AND-ARCH-TV-5`), and `AND-ARCH-TV-4` requires the proposal to separate existing implementation, required feature work and optional modernization.
- **Framework-independent detection anchors, and they are not equal.** **Either of two confirms a TV target on its own:** a launcher activity carrying `android.intent.category.LEANBACK_LAUNCHER` (`AND-REL-TV-LAUNCH-1`), or a `<uses-feature android:name="android.software.leanback">` declaration (`AND-REL-TV-FEATURE-1`) — Android defines that feature as *"the app is designed to run on Android TV devices"*. **`android.hardware.touchscreen` declared `android:required="false"` (`AND-REL-TV-FEATURE-2`) and a banner (`AND-REL-TV-BANNER-1`) corroborate but never confirm alone** — the touchscreen declaration also serves fake-touch and D-pad-only devices such as Chromebooks, so a phone app carrying it is not thereby a TV app. **Never read a leanback-named manifest token as evidence that the UI is Leanback-based** — these confirm a TV *target* and imply nothing about the UI framework, which only reading the repository settles.
- **Focusability and a visible focus state stay credited to the shared rules**, not to any `AND-*TV-*` ID: `A11Y-TOUCH-1` ("on TV form factors there is no touch target — the equivalent requirement is a reliably focusable element with a clearly visible focus state"; its Android example reads "TV: no touch — ensure D-pad focusability and a visible focus highlight") and `A11Y-TOUCH-2` (enough separation that D-pad focus moves predictably). Cite those two directly; `AND-UI-TV-FOCUS-1/2/3` add distinct obligations and deliberately do not duplicate them.
- **Never silently carry touch or phone assumptions into a TV plan.** Most TV devices have no touchscreen or pointer input and rely on a D-pad remote; a few support pointer remotes, so a D-pad path is always required and touch is never assumed (`AND-NAV-TV-DPAD-1`).
- **A genuinely unstandardised TV question is still recorded as an unresolved decision**, naming what is missing rather than stretching an adjacent rule to cover it. This skill cites TV standards; it authors none.

**When the repository has no TV convention to follow.** Many `AND-*TV-*` rules are phrased against *the repository's existing* TV convention. Resolve an absence in this order — never by supplying a preference:

1. **A convention exists** — follow it. It is rank 2 and outranks these rules; a rule is not a reason to change working code.
2. **No TV surface exists yet — the greenfield case.** `/analyze-feature` can confirm `device_type: tv` on a repository with no TV code, and *"add TV support"* is a legitimate feature. **Absence here is a gap to fill, not an ambiguity to stop on.** Propose the required TV extensions **once, at application level, as approval-gated unresolved decisions** — the entry point and manifest declarations, the focus and D-pad model, the base screen type, and the packaging target — then plan the feature on top of what that decision settles. Each is *required feature work*, never *optional modernization* (`AND-ARCH-TV-4`).
3. **A TV surface exists but its convention cannot be read** — mark it `[unknown]`, record an unresolved decision naming the evidence sought, and **cap any finding that rests on it at the lowest severity**. Do not infer a convention from one file. **Planning continues on this case**; it is a labelled gap in the plan, not a refusal to plan.

**None of the three refuses to plan.** Case 3 is the only one that can *escalate* to the red flag below, and only when the TV model cannot be identified **at all** — not merely when one convention is unclear. Greenfield is planned, not refused.

## 7. Verify-later mechanism for Android

`skills/dev-design-start/SKILL.md:118` obliges each platform lane to name **its own** verify-later mechanism; `standards/android/` has no applicability section to point at, so it is defined here. The three shared risk classes and the verify-later principle stay as written in § *Shared planning rules*.

**A statement is verify-later when the fact it asserts is produced by a stage, not written in the repository.** Each is checkable at exactly one stage; one whose stage is unreached is **not verified at that stage — never satisfied** — recorded with the stage and the artefact that would settle it.

| Stage | Reached by | What it, and only it, settles |
|---|---|---|
| **0 Inspection** | Reading the repository — the planning default | Source content, declared dependencies, existing patterns, what a build script *says* |
| **1 Build** | Gradle build of a **named variant**, no device | Merged manifest and merge conflicts; source-set, `res/` and `values/` overlay winners; generated `BuildConfig`/`resValue` and placeholder expansion; variant-scoped Lint; Compose compiler stability/skippability reports; APK Analyzer sizes and method counts |
| **2 Release build** | Minified, resource-shrunk, release-signed artifact | Keep-rule sufficiency for reflection, serialization, JNI and manifest-only entry points; what shrinking removed; the merged rule set and mapping file; that release signing works and no debug config leaked |
| **3 Device run** | Instrumented run on a device **or emulator** | Instrumented and Compose UI test outcomes (`AND-TEST-INSTR-1`, `AND-TEST-COMPOSE-1`); StrictMode violations; leaks; everything Robolectric excludes — system UI, `WebView`, real rendering |
| **4 Measurement** | Numeric pass on a **physical** device against a release-like build | Any duration, rate, delta, frame count, allocation count or jank figure — only with conditions stated, since compilation mode and profile state change the number |
| **5 Field / store** | State outside the repository | Store track eligibility and which build a cohort receives; pre-launch reports; field crash/ANR/wake-lock rates; app-signing key identity |

**Class test — two questions, then a fallback; the first Yes decides, and each class has one destination:**

1. Does the statement change **what gets built or how it is decomposed** — scope, a contract, a task boundary, module or variant structure, feasibility? → **Blocking**, whatever the stage → **DD §24 Open Questions**.
2. Is what is missing a **number** only Stage 4 or Stage 5 can produce? → **Needs measurement, profiling or investigation** → **DD §22 Risks**.
3. Otherwise it is a binary correctness fact a Stage 1/2/3 or store check settles → **Non-blocking, must be tracked** → **DD §22 Risks**.

An item that also rests on an unconfirmed assumption is recorded in **DD §23 Assumptions** as well as at its class destination — §23 is additive, not an alternative. **Never route a non-blocking item to §24** — it is blocking-only, and `/dev-feature-start` refuses to generate tasks while anything sits there (`templates/dd-template.md` §24, `commands/dev-feature-start.md:35`), so a tracked item filed there halts the next command for nothing. Anything routed to §22 is written in that section's own shape — **likelihood and mitigation**, per `templates/dd-template.md` §22 — with the stage and the settling artefact named inside the mitigation. A verify-later item first surfaced at `/dev-feature-start`, after the DD is approved, is reported against the task it blocks rather than back-filled into the DD; only the approving human reopens an approved design.

Two hard edges. **Stage 4 is the exclusive home of *needs measurement, profiling or investigation*** — "will jank", "will leak", "startup will regress", "recomposes too often", "the APK grows too much" are all Q2-Yes, and `standards/android/android-performance.md` *Purpose & Scope* forbids asserting them as confirmed findings. Conversely a binary fact filed as "needs profiling" — a missing keep rule (`AND-REL-R8-2`), a manifest merge conflict, an unrun `lintRelease` — is the collapse the shared rule forbids; "we will measure it on the emulator" is not a Stage-4 plan.

Tooling — official pages in [References](#references):

- **Static analysis is Stage 1, not measurement** — Android Lint is variant-scoped, needing a Gradle invocation but no device. The ktlint/detekt/Lint list is owned by `AND-KT-LINT-1/2`; cite it, do not restate it.
- **Measurement tooling has no `AND-*` ID.** Android Studio Profiler, Macrobenchmark and **LeakCanary (Square's, third-party)** are prose-only: cite the same *Purpose & Scope*.
- **A recomposition claim is a build-configuration fact, not a code fact** — strong skipping is default-on from Kotlin 2.0.20, so "this parameter is unstable, therefore it recomposes" is false by default; Stage 1 compiler reports settle it.

## 8. Android standards citation

Cite only IDs that exist in these files and genuinely apply. Never invent an ID, never cite a merely adjacent one — the single exception is the **custom**-wrapper carve-out stated in the [Overview](#overview).

| Area | Standard file | IDs |
|---|---|---|
| Kotlin, coroutines, lint | `standards/android/kotlin-standards.md` | `AND-KT-NULL-*`, `AND-KT-TYPE-*`, `AND-KT-SEALED-*`, `AND-KT-COROUTINE-*`, `AND-KT-LINT-*` |
| Layering, modules, ViewModel/state, DI | `standards/android/android-architecture.md` | `AND-ARCH-LAYERS-*`, `AND-ARCH-DEPS-*`, `AND-ARCH-MODULE-*`, `AND-VM-STATE-*`, `AND-VM-EVENT-*`, `AND-VM-LIFECYCLE-*`, `AND-DI-*`, `AND-ARCH-TV-*` ⁺ |
| Compose, XML/Views, lists, resources | `standards/android/compose-xml-standards.md` | `AND-UI-COMPOSE-*`, `AND-UI-XML-*`, `AND-UI-LIST-*`, `AND-UI-RES-*`, `AND-UI-TV-FOCUS-*`, `AND-UI-TV-OVERSCAN-*`, `AND-UI-TV-LAYOUT-*`, `AND-UI-TV-SCALE-*`, `AND-UI-TV-COMP-*`, `AND-UI-TV-IME-*` ⁺, `AND-UI-A11Y-*` |
| Performance & memory | `standards/android/android-performance.md` | `AND-PERF-THREAD-*`, `AND-PERF-LIST-*`, `AND-PERF-IMAGE-*`, `AND-PERF-MEM-*`, `AND-PERF-SIZE-*`, `AND-PERF-TV-*` ⁺ |
| Networking & API | `standards/android/android-networking.md` | `AND-NET-CLIENT-*`, `AND-NET-CONTRACT-*`, `AND-NET-DTO-*`, `AND-NET-AUTH-*`, `AND-NET-ERR-*` |
| Persistence | `standards/android/android-persistence.md` | `AND-DATA-STORE-*`, `AND-DATA-MIGRATE-*`, `AND-DATA-THREAD-*`, `AND-DATA-CACHE-*`, `AND-DATA-SEC-*` |
| Gradle build, variants, signing, R8 | `standards/android/gradle-build-signing.md` | `AND-REL-VARIANT-*`, `AND-REL-DEP-*`, `AND-REL-SIGN-*`, `AND-REL-R8-*`, `AND-REL-TV-LAUNCH-*`, `AND-REL-TV-FEATURE-*`, `AND-REL-TV-BANNER-*`, `AND-REL-TV-STORE-*`, `AND-REL-TV-TRACK-*`, `AND-REL-TV-BUILD-*`, `AND-REL-TV-SIGN-*` ⁺ |
| Navigation | `standards/android/android-navigation.md` | `AND-NAV-DEST-*`, `AND-NAV-ARGS-*`, `AND-NAV-STACK-*`, `AND-NAV-LAYER-*`, `AND-NAV-TV-BACK-*`, `AND-NAV-TV-DPAD-*`, `AND-NAV-TV-FOCUS-*`, `AND-NAV-TV-AXIS-*` ⁺ |
| Testing | `standards/android/android-testing.md` | `AND-TEST-UNIT-*`, `AND-TEST-VM-*`, `AND-TEST-INSTR-*`, `AND-TEST-COMPOSE-*` |
| Logging & analytics | `standards/android/android-logging-analytics.md` | `AND-LOG-HYGIENE-*`, `AND-LOG-ANALYTICS-*`, `AND-LOG-PII-*` |
| Security & privacy (shared) | `standards/shared/mobile-security.md` | `SEC-SECRETS-*`, `SEC-STORAGE-*`, `SEC-EXPOSURE-*`, `SEC-NET-*`, `SEC-AUTH-*`, `SEC-DEEPLINK-*`, `SEC-WEBVIEW-*`, `SEC-BRIDGE-*`, `SEC-DEPS-*`, `SEC-PERMS-*`, `SEC-HARDEN-*`, `SEC-LOG-*`, `SEC-COOKIE-*`, `SEC-WEB-*` |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-ROLES-*`, `A11Y-TOUCH-*`, `A11Y-FONT-*`, `A11Y-SR-*`, `A11Y-COLLECTION-*`, `A11Y-FOCUS-*`, `A11Y-CONTRAST-*`, `A11Y-MOTION-*` |
| Localization & RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-COPY-*`, `I18N-RTL-*`, `I18N-FMT-*`, `I18N-TEST-*` |

Five boundary rules, each otherwise a source of false IDs:

- **The `⁺` roots are TV-only and additive.** Citable alongside the base roots in the same row, never instead of them. All but one require an established `device_type: tv` surface ([§6](#6-device_type-handling)); **`AND-REL-TV-*` is scoped to the shipping artefact instead**, so it is also citable in the greenfield case. One TV rule carries no `TV` segment — `AND-TEST-INSTR-2`, inside `AND-TEST-INSTR-*` — and **there is no `AND-TEST-TV-*` family**, no TV root outside the five rows marked above, and no separate TV standards file.

- **Lane boundary.** Never use React Native's unprefixed `ARCH-*`/`API-*`/`STATE-*`/`NAV-*` or iOS's `IOS-*` for Android; the equivalents are `AND-ARCH-*`, `AND-NET-*`, `AND-VM-STATE-*`, `AND-NAV-*`.
- **`AND-REL-*` is not shared `REL-*`.** `AND-REL-*` is Gradle build, variants, signing, R8; `REL-*` in `standards/shared/release-readiness.md` is release readiness. Segments do not transfer between them.
- **`AND-DI-*` has no topic segment** — `AND-DI-1`…`AND-DI-4`, the only such `AND-*` namespace, so a pattern assuming `AND-<AREA>-<TOPIC>-<n>` misses it.
- **Accessibility and stored-data security have `AND-*` families; i18n/RTL does not.** `AND-UI-A11Y-1`…`-10` (`standards/android/compose-xml-standards.md`) state **how** a shared `A11Y-*` requirement is met on Android, and `AND-DATA-SEC-1`…`-3` (`standards/android/android-persistence.md`) cover security *of stored data* — cite each alongside the shared root, which still owns whether the requirement applies. For everything else in those areas, cite the shared roots above. `AND-UI-RES-*` covers resources, localisation and RTL *inside the Android UI layer*, a different thing from `I18N-*`; cite both where both apply.

## Red flags — STOP and report instead of proceeding

The Android-specific conditions; generic stops belong to the command and the shared skill.

- `device_type` fails [§6](#6-device_type-handling)'s check — anything but exactly `mobile` or `tv`.
- `device_type: tv`, a TV surface **exists**, and its implementation model cannot be identified from evidence (§6 case 3). **A repository with no TV surface at all is not this red flag** — that is §6 case 2, and it is planned rather than refused.
- Two UI toolkits, two navigation mechanisms, two persistence stores or two DI mechanisms in active use with no discernible primary, and the feature must choose.
- The feature cannot be built without a new module, dependency edge, build type, flavor or library — report it as an unresolved decision rather than deciding it (`AND-ARCH-MODULE-3`, `AND-REL-VARIANT-1`).
- The AGP version cannot be determined and the plan must say something about R8, keep rules or the build DSL.
- A cited `standards/android/*` file is **missing** or is a structure-only placeholder ([§0](#0-standards-readiness-gate)).
- You are about to: state something about the **merged manifest** with no merger report or other build artefact behind it; make a variant-specific claim from `src/main/` alone; cite a resource without resolving qualifier precedence; cite an `AND-*` ID you did not confirm exists in the file that owns it; or state any repository fact you did not verify.

## Relationship with commands, agent, skills

- **`commands/analyze-feature.md`** — platform and `device_type` detection, the confirmation and design-reference gates, invoking the architect.
- **`commands/dev-design-start.md`** — stage orchestration: artifact resolution, approval gate, repository-knowledge resolution, architect routing.
- **`skills/dev-design-start/SKILL.md`** — the shared DD methodology.
- **`skills/dev-feature-start/SKILL.md`** — task decomposition from an approved DD, delegating platform vocabulary and standard-ID citations here via the architect (`:36`).
- **`skills/repo-knowledge-consumer/SKILL.md`** — repository-knowledge resolution, reuse, citation ([§2](#2-repository-knowledge-reuse)).
- **`agents/android-architect.md`** — the Android specialist that executes this methodology.
- **`skills/android-feature-implementation/SKILL.md`** — the sibling methodology used at Implement time, not here.
- **This skill** — the Android planning methodology, and nothing a platform-independent layer could state. Beyond the Overview's and §6's limits, it does not move command logic here or invent paths to feature documents.

## References

Consult when a planning question is genuinely open, not routinely. None overrides the repository's existing implementation ([§1](#1-source-of-truth-hierarchy)).

| When | Source |
|---|---|
| §3.1, §3.7 — layers, modules, dependency edges, the common architectural principles | [App architecture](https://developer.android.com/topic/architecture) · [Modularization](https://developer.android.com/topic/modularization) · [Modularization patterns](https://developer.android.com/topic/modularization/patterns) |
| [§1](#1-source-of-truth-hierarchy) — the rank-5 arbiter | [Recommendations for Android Architecture](https://developer.android.com/topic/architecture/recommendations) |
| §3.8-§3.9 — which state holder, what UI state holds, dispatcher/scope/stream questions | [State holders and UI state](https://developer.android.com/topic/architecture/ui-layer/stateholders) · [Coroutines best practices](https://developer.android.com/kotlin/coroutines/coroutines-best-practices) |
| §3.10 — DI vs a service locator; Hilt wiring | [Dependency injection](https://developer.android.com/training/dependency-injection) · [Hilt](https://developer.android.com/training/dependency-injection/hilt-android) |
| §3.11 — identifying or choosing a navigation mechanism, half-migrated graphs included | [Navigation](https://developer.android.com/guide/navigation) · [Navigation 3](https://developer.android.com/guide/navigation/navigation-3) |
| §3.12 — a storage-mechanism decision; what a Room schema change costs | [Data and file storage](https://developer.android.com/training/data-storage) · [DataStore](https://developer.android.com/topic/libraries/architecture/datastore) · [Room migrations](https://developer.android.com/training/data-storage/room/migrating-db-versions) |
| §3.14 — choosing a background mechanism by the guarantee needed | [Background tasks](https://developer.android.com/develop/background-work/background-tasks) |
| §3.2, §7 — variants, source sets, manifest merging, R8, keep rules, the AGP/Gradle/JDK floor | [Build variants](https://developer.android.com/build/build-variants) · [Manifest merging](https://developer.android.com/build/manage-manifests) · [R8](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization) · [AGP release notes](https://developer.android.com/build/releases/agp-9-3-0-release-notes) |
| [§7](#7-verify-later-mechanism-for-android) — the tooling a stage is actually run with | [Macrobenchmark](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview) · [Android Studio Profiler](https://developer.android.com/studio/profile) · [Android Lint](https://developer.android.com/studio/write/lint) · [APK Analyzer](https://developer.android.com/studio/debug/apk-analyzer) · [StrictMode](https://developer.android.com/reference/android/os/StrictMode) |
| §3.3 — which `targetSdk`-gated behaviours are in force | [Android 16 behavior changes](https://developer.android.com/about/versions/16/behavior-changes-16) · [Edge-to-edge in views](https://developer.android.com/develop/ui/views/layout/edge-to-edge) |
| §3.5 — a Compose/Views interop boundary; how Compose is enabled | [Compose interop APIs](https://developer.android.com/develop/ui/compose/migrate/interoperability-apis) · [Compose compiler plugin](https://developer.android.com/develop/ui/compose/setup-compose-dependencies-and-compiler) |
| §3.15 — a resource-qualifier, localisation or RTL question | [App resources](https://developer.android.com/guide/topics/resources/providing-resources) · [Languages and cultures](https://developer.android.com/training/basics/supporting-devices/languages) |
| §3.16-§3.17 — published breakpoints, no hardware-based layout decisions, numeric accessibility thresholds | [Window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes) · [Display sizes](https://developer.android.com/develop/ui/compose/layouts/adaptive/support-different-display-sizes) · [Accessible apps](https://developer.android.com/guide/topics/ui/accessibility/apps) |
| §3.18 — what "tested" means per module and source set; fakes over mocks; what a local test cannot reach | [Testing fundamentals](https://developer.android.com/training/testing/fundamentals) · [Test doubles](https://developer.android.com/training/testing/fundamentals/test-doubles) · [Robolectric](https://developer.android.com/training/testing/local-tests/robolectric) |
| §3.20 — does an existing profile need a new critical journey, before a startup claim | [Baseline Profiles](https://developer.android.com/topic/performance/baselineprofiles/overview) |
| [§6](#6-device_type-handling) — a permission's class and the runtime obligations it creates | [Permissions](https://developer.android.com/guide/topics/permissions/overview) |
| [§6](#6-device_type-handling) — what the platform requires of a TV app before the plan assumes it | [TV app quality](https://developer.android.com/docs/quality-guidelines/tv-app-quality) · [Build TV apps](https://developer.android.com/training/tv/start/start) · [TV navigation](https://developer.android.com/training/tv/get-started/navigation) |
| [§6](#6-device_type-handling) — the TV memory budget's figures and the assumptions they carry, before citing `AND-PERF-TV-1` | [Memory optimization for TV](https://developer.android.com/training/tv/playback/memory) |
| [§6](#6-device_type-handling) — the manifest declarations that make an app a TV app, before treating one as missing | [Get started with TV apps](https://developer.android.com/training/tv/get-started/create) · [`uses-feature`](https://developer.android.com/guide/topics/manifest/uses-feature-element) |
| Whether a Jetpack library exists, its version and stability — the explorer carries no versions, so the release notes are the authority; a topic hub; Kotlin language or formatting | [Jetpack explorer](https://developer.android.com/jetpack/androidx/explorer) · per-library release notes · [Develop for Android](https://developer.android.com/develop) · [Kotlin style guide](https://developer.android.com/kotlin/style-guide) |
