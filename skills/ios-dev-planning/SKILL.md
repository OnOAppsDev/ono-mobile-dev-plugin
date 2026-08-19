---
name: ios-dev-planning
description: Repository-first planning methodology for native iOS features — discovers the repo's actual implementation model, then supplies the iOS vocabulary and IOS-*/shared standard IDs for a feature analysis's proposed approach, a Detailed Design's Technical Implementation Approach and Impacted Modules, and the task breakdown. Used by /analyze-feature, /dev-design-start and /dev-feature-start via the ios-architect agent, alongside the shared dev-design-start / dev-feature-start skills, which own the overall mechanics. Assumes no UI framework, architecture pattern, or library, and handles device_type mobile and tv.
---

# iOS Dev Planning

## Overview

This skill is the methodology the `ios-architect` agent follows when planning native iOS work. It owns *how* an iOS feature is understood, grounded in repository evidence, analysed, classified, and expressed as a design — for `/analyze-feature`'s Proposed Technical Approach, `/dev-design-start`'s DD §19/§20, and `/dev-feature-start`'s task vocabulary.

It is not orchestration. The shared `dev-design-start` and `dev-feature-start` skills own the overall mechanics: DD structure and gap discipline; existing-file strategy; task decomposition, dependencies, rollback plan, and draft-until-approved gates. This skill does not re-implement any of that — it supplies the iOS-specific content those mechanics consume.

**This skill assumes no technology.** In no order of precedence: SwiftUI, UIKit, storyboards and xibs, the Observation framework, `ObservableObject`, Combine, RxSwift, Swift Concurrency, GCD, completion handlers, MVC, MVVM, MVP, VIPER, Clean Architecture, TCA, coordinators, storyboard segues, `NavigationStack`, Swift Package Manager, CocoaPods, Carthage, Core Data, SwiftData, a SQLite wrapper, `URLSession` or a wrapper over it, XCTest, Swift Testing, a single app target, and a multi-package workspace are **possible findings, never defaults**. The repository's existing conventions are the source of truth, and Apple documentation never overrides a valid existing implementation — the neutrality principle stated once in `standards/ios/swift-standards.md` § *Neutrality, TV, and status*.

**This skill never writes code and never modifies repository files.** It plans.

## Inputs this skill requires (resolved, never invented)

Obtain and **verify the existence of** the inputs below. They are resolved and passed by the invoking command — artifact resolution is `commands/dev-design-start.md`'s, not this skill's. This skill **never guesses or fabricates a path** to a feature document.

- The confirmed **`platform`** (must be `ios`) and **`device_type`** (`mobile` or `tv`). **At Analyze these come from the user confirmation at `/analyze-feature` step 2**, because no feature analysis exists yet; from Design onward they are read from the upstream document's frontmatter. Never re-detected here.
- The target **repository root**, and the Xcode project, workspace, or package manifest the feature lands in.
- **At Analyze:** the feature description and `repo-analyst`'s findings summary. The four design-reference fields may still be unresolved at this point — `/analyze-feature` step 5 resolves them.
- **At Design:** the absolute path to the **approved Feature Analysis**, plus the four resolved design-reference fields.
- **At Feature-start:** the absolute path to the **approved Detailed Design (DD)**.

If a required input for the current stage is missing, **stop and report exactly which one** — do not proceed against an assumed location. If `platform` is not `ios`, stop: this skill does not run for another platform. If `device_type` is missing, empty, or any value other than `mobile`/`tv` (including `mixed`), **stop and report it** — never default to `mobile`.

**A React Native repository whose confirmed platform is `react-native` does not route here**, even when the change touches its `ios/` tree — that work is planned by `rn-dev-planning` against the RN standards, and only file-level *review* attribution loads `standards/ios/*`. This skill runs when `ios` is the confirmed platform.

## 0. Standards readiness gate

This skill grounds every iOS-specific rule in an authored `IOS-*` standard under `standards/ios/`. Before planning, confirm that none of the five `standards/ios/*` files is still scaffolding rather than authored rules — the same unauthored-placeholder marker `/implement-task` tests for. If one is, **stop and report that real iOS planning is blocked until it is authored**; never fall back to assumed defaults.

**One gap is known and deliberate:** no tvOS rules exist in any of the five documents. `ATV-001` owns authoring them and `ATV-002` owns branching the iOS skills and agents deeply on device type. `IOS-UI-TV-*` and `IOS-PERF-TV-*` are reserved roots with no rules behind them, and a bare `IOS-TV-*` root is not permitted at all — **never cite a TV ID.** [§14](#14-device_type-handling) defines what to do instead.

## 1. Source-of-truth hierarchy

Defined once in `skills/dev-design-start/SKILL.md` § *Shared planning rules → Source-of-truth hierarchy*. Apply it as written; it is not restated here.

iOS's parameters for the two parameterised ranks:

- **Rank 4** — `standards/ios/*` plus `standards/shared/*`.
- **Rank 5** — Apple documentation.

One hard rule is iOS-specific and applies in addition to the shared ones:

- **Applicability is decided by the baseline, not by the rule.** Check the baseline found in [§3](#3-repository-evidence-collection) before citing a rule that depends on a particular API.

## 2. Repository-knowledge reuse

Repository knowledge is resolved by the invoking command and consumed through the `repo-knowledge-consumer` skill, which owns the resolution procedure, what may be reused, and the citation shape. Apply it as written; it is not restated here.

What this lane adds on top of it:

- **Derive live the iOS detail no repository-wide document can hold** — the actual signatures, state shape, isolation, and call sites of the types *this feature* touches, alongside the categories the consumer reports as `deriveLive`. That reading is required and is not duplication of the manifest.

## 3. Repository evidence collection

Inspect the actual codebase before proposing anything. **Detect — do not assume.** `repo-analyst` supplies only lightweight iOS existence checks, so this sweep is this skill's own responsibility. Its Standards Conformance verdict is computed against React Native's `ARCH-LAYERS-*`/`ARCH-FOLDERS-*` and **does not apply to iOS** — run the structural comparison against `IOS-ARCH-LAYERS-*` and `IOS-ARCH-MODULE-*` here instead, and report it in the Implementation Model Found section rather than as a conformance verdict.

**Depth scales with stage.** At Analyze, inspect the dimensions the feature plausibly touches and mark the rest `[unknown — not inspected at Analyze]`; a feature that may yet be rejected does not earn a full survey. The complete sweep is required at Design, where §19 and §20 depend on it. In both cases scope each dimension to what the feature touches — an untouched dimension is marked `N/A`, never surveyed for completeness.

Collect evidence for each dimension, recording the path that proves it:

1. **Project and target structure** — the project, workspace, or package manifest, and whether the project is generated from a manifest. Enumerate the targets and their kinds: app, framework, local package, app extension, widget, tests, UI tests, and any tvOS target.
2. **Dependency management** — which manager or managers are in use, and whether the resolution artifact the repo commits is committed.
3. **Build configuration** — where settings actually live, the build configurations and schemes present and which are shared, entitlements, and the mechanism that supplies environment values (base URLs, flags, tenant IDs).
4. **Language and platform baseline** — the deployment target(s), the Swift language mode, any strict-concurrency and default-isolation configuration, the Swift-and-Objective-C mix, bridging headers, and any interop surface the feature would touch. This baseline decides which rules are *applicable at all* ([§1](#1-source-of-truth-hierarchy)).
5. **App and scene lifecycle** — which lifecycle the app actually uses, and where its delegates are wired.
6. **UI implementation model** — see [§5](#5-ui-implementation-model-identification). Identify it **per surface**, not per repository.
7. **Existing surfaces and reusable types** — the screens, views, view controllers, base classes, design-system or theme layer, and shared components the feature should reuse rather than recreate. Inspect this directly when no component inventory is available; it is the dimension that prevents proposing a "new" component that already exists.
8. **Navigation mechanism** — the mechanism or mechanisms in use, plus the deep-link and universal-link entry points and where they are validated.
9. **Presentation state and observation model** — the observation mechanism, the state shape used for loading, empty, success and error, and how one-time effects (alerts, navigation triggers, toasts) are delivered.
10. **Dependency injection and composition** — how dependencies are provided, where the object graph is composed, and what scope each dependency has.
11. **Concurrency model and isolation** — which mechanism the model layer is written in, the isolation of the types the feature touches, and how boundaries between mechanisms are currently crossed.
12. **Networking** — the client layer, session configuration, interceptor and auth handling, the transport-to-domain mapping convention, and the established error, timeout, retry and offline behaviour.
13. **Persistence** — the store or stores in use, the migration practice actually followed, the context/queue discipline for a managed store, and what is treated as the single source of truth.
14. **Background and long-running work** — assertions taken as the app leaves the foreground, scheduled background work, background transfers, and the background modes declared.
15. **State restoration and process death** — what the app restores, and by which mechanism: an activity-based scene restoration path, a per-scene storage wrapper, a UIKit restoration path, or nothing. An *app*-level storage wrapper backed by the preferences store is durable persistence, not restoration — classify it under dimension 13. A repository that restores nothing is a finding to record, not a gap to fix here.
16. **Testing setup** — the frameworks in use **per target**, the test-double approach, whether tests need a host application, and what is *actually* covered for the layers this feature touches. Two unit-test frameworks coexisting is normal, not a defect to fix here.
17. **Localisation, assets and Dynamic Type** — the localisation mechanism **per target and per string table**, asset catalogues, whether text uses scaling text styles, and any right-to-left handling present.
18. **Platform integrations** — analytics, logging, feature flags and remote config, push (including its permission timing and any notification extension), media and playback, authentication, purchases, web views, and the privacy manifest — each only where the feature touches it. Where the feature spans an extension or widget, also record how state is shared with the host app and what container that sharing goes through.

### Detection traps

An iOS repository routinely hides its own configuration. Each of these produces a confident, wrong finding:

- **A file's absence proves nothing about configuration.** Xcode can generate the information property list from build settings, in which case its keys exist only as settings and no such file is in the repository. Read the resolved configuration, not the directory listing.
- **A build setting has no single home.** Its value is resolved across levels — anything the build command passes, then the target, a configuration file mapped to the target, the project, a configuration file mapped to the project, then defaults — and a dependency manager may insert its own configuration-file layer. A value read from one file is a candidate, not the answer. **Where the resolved value cannot be obtained from committed files alone, record `[unknown — requires resolved build settings]` and continue; that alone is never a stop, and resolving it must never mutate the repository.**
- **The baseline is per target.** Deployment target, language mode, and concurrency configuration are set per target, and a package manifest's tools version can decide the language mode with no explicit setting written anywhere. One target's value says nothing about another's, and the installed toolchain version is not the language mode.
- **Entry-point markers are ambiguous.** A `@main` attribute alone does not identify SwiftUI; an app-delegate type does not establish a UIKit lifecycle, because a SwiftUI app may adopt one through the adaptor; and a scene delegate may be wired in code rather than declared, so its absence from the property list is not evidence.
- **Packages added through Xcode leave no manifest in the app repository.** Searching only for a package manifest misses every dependency added that way; the project's package references and the committed resolution artifact are the evidence.
- **A generated project is not evidence — its manifest is.** Where a generator is in use, read the generator's manifest and check whether the generated project is committed or ignored.
- **Test discovery by naming convention undercounts.** One unit-test framework is attribute-based rather than name-based, and UI automation lives in its own target kind. Count per target.

**Label every finding** `[evidence: <path>]`, `[reused: <path>#<anchor>]`, `[inference]`, or `[unknown]`. An unlabelled repository claim is a defect. Prefer `[unknown]` over a guess.

**Where the repository has no convention for a dimension, its absence is never by itself compliance.** Resolve it through the ladder in `standards/ios/swift-standards.md` § *When the repository has no convention*, and state which of its three cases applied.

## 4. Architecture analysis order

Analyse in this order, so each step builds on established evidence rather than assumption:

1. **Target, package and layer map** — what exists, and which layer the feature belongs in.
2. **Existing analogous feature** — the nearest comparable feature becomes the pattern to follow.
3. **Layering and dependency direction** → `IOS-ARCH-LAYERS-1`, `IOS-ARCH-LAYERS-2`, `IOS-ARCH-LAYERS-3`, `IOS-ARCH-LAYERS-4`, `IOS-ARCH-LAYERS-6`.
4. **Target and package placement** — where new code lands, and whether a new target, package, or dependency edge is justified → `IOS-ARCH-MODULE-1`, `IOS-ARCH-MODULE-2`, `IOS-ARCH-MODULE-3`, `IOS-ARCH-MODULE-4`. In a single-target project, folder and namespace boundaries are the module boundary.
5. **Dependency injection** — at the narrowest useful scope → `IOS-ARCH-DI-1`, `IOS-ARCH-DI-2`, `IOS-ARCH-DI-3`, `IOS-ARCH-DI-5`; a new singleton or `.shared` holding state is not introduced into a project that injects → `IOS-ARCH-DI-4`.

A new architectural pattern is never introduced for a single feature. If the feature appears to require one, that is an unresolved decision, not a design choice.

## 5. UI implementation-model identification

Identify the model **per surface**, not per repository — `IOS-UI-FRAMEWORK-1` makes the file being changed decide which family applies, so a repo may legitimately contain several. Recognise five outcomes, none privileged:

| Model | Evidence to look for | Standards that apply |
|---|---|---|
| **SwiftUI** | `View` conformances, a SwiftUI `App` entry point, state wrappers | `IOS-UI-VIEW-*`, `IOS-UI-STATE-*`, `IOS-UI-ID-*` |
| **UIKit — built in code** | `UIViewController`/`UIView` subclasses, programmatic Auto Layout | `IOS-UI-VIEW-*`, `IOS-UI-UIKIT-*`, `IOS-UI-CELL-*` |
| **UIKit — Interface Builder** | `.storyboard`/`.xib` files, outlets and actions, segues | as above, plus `IOS-UI-UIKIT-5` |
| **Hybrid / interop** | a hosting controller or a representable wrapper on the boundary | both families at the boundary, plus `IOS-UI-INTEROP-*` |
| **Custom / project-specific** | in-house base classes, a bespoke view or navigation abstraction | the family's rules applied to the wrapper's observable behaviour, plus the repo's own conventions |

Rules:

- **The surface the feature touches decides which family applies.** On a hybrid surface the design **names where the boundary sits and keeps it singular** → `IOS-UI-FRAMEWORK-4`.
- **Do not migrate a surface between families** unless the feature explicitly requires it and it is approved → `IOS-UI-FRAMEWORK-3`; record it as an unresolved decision. Introducing the other family for one new screen is a design decision → `IOS-UI-FRAMEWORK-2`.
- **A custom or legacy model is a first-class finding, not a defect.** Plan within it, applying a standard's *intent* to a wrapper's behaviour rather than demanding the standard API.
- Collection surfaces carry their own identity and recycling decisions → `IOS-UI-ID-1`, `IOS-UI-ID-2`, `IOS-UI-CELL-*`.
- **Where a design reference is recorded, read it and resolve it against the repository**: map every element it shows either to an existing surface or component (dimension 7, named by path) or to a new one, saying why nothing existing fits. An approach that never resolved the design against the component inventory is incomplete.

## 6. Target, package and dependency impact

**Inspect broadly; report at module and change-class resolution.** Analysis may — and for a wide-reaching change should — read every relevant file to understand the true blast radius. What the *design* records is the conclusion, not the transcript.

Enumerate every target and package the feature touches, and for each state the **class of change**, whether it is created, modified or only read, and an approximate site count where the same change repeats. **The enumeration threshold is the shared rule** — `dev-design-start` Step 6 §20 owns it and it is not restated here. What is iOS-specific is the unit: a change class spans a *target or package*, so "every call site in this package adopts the new factory" is one entry, not thirty. Per-file expansion belongs to `/dev-feature-start`. Confirm no new circular dependency, no inverted layer dependency, and no widening of a module's public surface to make one call site compile → `IOS-ARCH-MODULE-2`, `IOS-SWIFT-TYPE-2`. A new third-party dependency is an unresolved decision, never a silent addition, and its stated cost is part of the proposal → `IOS-ARCH-MODULE-5`, `IOS-PERF-SIZE-3`, `IOS-PERF-LAUNCH-3`, `IOS-PERF-LAUNCH-4`, `IOS-BUILD-DEP-4`; it is declared and pinned the repository's way → `IOS-BUILD-DEP-1`, `IOS-BUILD-DEP-2`, exactly pinned where security-sensitive → `IOS-BUILD-DEP-3`, `SEC-DEPS-1`. Build-setting changes follow where the repository keeps settings → `IOS-BUILD-CONFIG-1`, `IOS-BUILD-CONFIG-4`. **The deployment target, the Swift language mode, and the concurrency diagnostics are never changed as a side effect of a feature** → `IOS-BUILD-CONFIG-3`, `IOS-SWIFT-CONC-7`. A new build configuration, scheme, or target needs approval → `IOS-BUILD-CONFIG-2`; a new capability or entitlement is justified and matched to its provisioning → `IOS-BUILD-CONFIG-7`.

## 7. State and data-flow analysis

Describe, in the repo's own idiom:

- **State ownership** — who owns each piece of state and what the single source of truth is → `IOS-UI-STATE-1`, `IOS-UI-STATE-2`, `IOS-ARCH-DATA-4`.
- **State shape** — the explicit loading / empty / success / error representation → `IOS-ARCH-LAYERS-5`, `IOS-UI-VIEW-4`.
- **Observation and binding mechanism** — the detected observation model decides which ownership and binding wrappers are valid, and its invalidation granularity is a consequence of that model, never a reason to migrate → `IOS-UI-STATE-3`, `IOS-UI-STATE-4`. State a model object's owner explicitly. The failure worth designing against is not the one that fails to compile: a mismatched pairing can compile, keep its state, and simply never invalidate the view. Some cross-pairings are deliberately supported for incremental migration, so state the pairing the repository actually uses rather than assuming a mismatch is a defect.
- **Event flow** — how user intent reaches the state owner and how one-time effects are delivered.
- **Data flow end to end** — input → state owner → use case/service → repository/client → back to the surface, naming the actual types.
- **Framework independence** — presentation state holds no view, view-controller, or window references and is constructible in a test → `IOS-ARCH-LAYERS-6`, `IOS-ARCH-TEST-1`.
- **Dependency reach** — dependencies are read at the level that needs them rather than threaded through intermediate views → `IOS-UI-STATE-5`.

Use the repository's vocabulary. If the repo has no view-model layer, do not invent one; describe the state owner it actually uses, and still cite the `IOS-UI-STATE-*` and `IOS-ARCH-LAYERS-*` rules for the behaviour they govern — the absence of the mechanism a rule names is not the absence of the requirement.

## 8. Lifecycle, process death, restoration and concurrency

- **Surface lifecycle** — which lifecycle owns each piece of work, and where it starts and stops, with no accumulation across repeated callbacks → `IOS-UI-STATE-6`, `IOS-UI-UIKIT-3`.
- **Process death and restoration** — backgrounding preserves the process, so restoration covers two cases: the system **terminating** a suspended app, and — in a scene-based app — a scene being **disconnected and later reconnected** while the process is still alive. The second is the common one on iPad and the one most often missed. Decide explicitly per piece of state: transient, restorable UI position, or persisted data. **State this even when the answer is "nothing needs to survive"** — silence here is a common defect. Two platform properties shape the decision: restoration state is **purgeable and may be discarded at the system's discretion**, so every restoring surface needs a working default path and no specific discard trigger is designed around unless the repository's mechanism documents one; and the payload carries **identifiers, not content**, which is re-resolved from the model layer. Plan restoration only through the mechanism the repository already uses, and keep durable user data out of it → `IOS-ARCH-NAV-5`.
- **Concurrency and isolation** — which work runs off the main actor, what isolation each new type has, and what must be `Sendable` to cross a boundary → `IOS-SWIFT-CONC-1`, `IOS-SWIFT-CONC-2`. **Where the module sets a default isolation, record it** — under a main-actor-by-default module an unannotated service type is main-actor-isolated and must be explicitly opted out to run off the main actor, which inverts the usual reading of the same code. A suspension point releases the isolation domain, so a critical section that must be atomic cannot span one. An escape hatch that disables data-race checking, and any weakening of the project's concurrency diagnostics, are **design decisions recorded here or not taken at all** → `IOS-SWIFT-CONC-3`, `IOS-SWIFT-CONC-7`. Crossing between GCD and Swift Concurrency is designed as an async-aware adaptor, never a blocking wait → `IOS-SWIFT-CONC-4`, `IOS-SWIFT-CONC-6`, `IOS-PERF-MAIN-2`.
- **Task lifetime and cancellation** — for each asynchronous operation, decide deliberately whether it is tied to the surface's lifetime or must complete regardless of navigation → `IOS-SWIFT-CONC-5`. Observations and resources needing teardown are owned and released → `IOS-SWIFT-LIFETIME-5`, `IOS-PERF-MEM-3`; capture semantics for anything held by a long-lived registry are decided at design time → `IOS-SWIFT-LIFETIME-1`.
- **Background work** — the platform separates several cases with distinct declared capabilities, and choosing the wrong one produces work that silently never runs. It distinguishes at least: finishing work already in flight as the app backgrounds; user-initiated long-running work the system surfaces and the user can cancel; deferrable maintenance the system schedules for periods of low activity; short periodic refresh; server-pushed background wake-ups, which are the documented answer when content arrives at irregular intervals rather than on a schedule; and transfers that survive **termination**, which additionally require the design to say **how the relaunched app reattaches to them** → `IOS-ARCH-DATA-9`. Do not introduce a new mechanism when an existing one fits. **State a time budget only where the platform publishes one** — short refresh and pushed wake-ups are documented in seconds, whereas a foreground-continuation assertion publishes no figure and its remaining time is only readable at runtime.

## 9. Navigation analysis

Plan against the repo's detected mechanism — never a second, parallel one → `IOS-ARCH-NAV-1`; where SwiftUI and UIKit navigation meet, exactly one system drives a flow → `IOS-UI-INTEROP-4`. Exactly one component owns a stack's state → `IOS-ARCH-NAV-2`. Reuse the existing factory, coordinator, or container to construct the next screen's dependencies → `IOS-ARCH-NAV-3`. Define the route's arguments, and validate and map every externally-supplied entry point — deep link, universal link, notification payload, shortcut — to an internal route, including the entitlement check for screens the user may not reach → `IOS-ARCH-NAV-4`, `SEC-DEEPLINK-1`, `SEC-DEEPLINK-2`, `SEC-DEEPLINK-3`.

**A universal-link entry point has prerequisites owned outside the app**: the associated-domains entitlement, and an association file hosted per domain and subdomain on the web server. Route the entitlement through `IOS-BUILD-CONFIG-7` and record an unconfirmed association file as a blocking unresolved decision — it has the same character as an unconfirmed backend contract.

**Where two mechanisms coexist, the surface the feature touches decides which one applies** — report the parallelism as a finding rather than stopping on it. Stop only when the surface itself cannot be determined from evidence.

Two consequences are decided at design time wherever navigation is driven from a serialisable route model:

- **The route model's serialisability is all-or-nothing.** Where a path is persisted for restoration or deep linking, a single non-encodable route value makes the **whole** path unsaveable — silently, as an absent value rather than an error. Decide the route value types together with [§8](#8-lifecycle-process-death-restoration-and-concurrency)'s restoration decision, not separately.
- **An external link must be translatable into route values.** A deep link that cannot be expressed in the repository's route vocabulary needs that vocabulary extended — a design decision — not a second navigation path bolted alongside.

Predictable back behaviour, a defined start destination, and a stated back-stack shape apply to any navigation implementation, including a fully custom one.

## 10. Persistence and networking

**Persistence** — use the repo's existing mechanism for the kind of data involved; do not add a second stack for data an existing one covers → `IOS-ARCH-DATA-1`, `IOS-ARCH-DATA-4`. A preferences store holds small non-sensitive values only; credentials and tokens belong in secure storage → `SEC-STORAGE-1`, `SEC-STORAGE-2`, `SEC-STORAGE-3`, `SEC-STORAGE-4`. **Plan the migration in the same change as any persisted-schema change** → `IOS-ARCH-DATA-7`, and where the store offers several strategies, **name which one this change needs** — inferred, staged, or hand-written — because the answer decides whether this is a one-line model edit or a task of its own. Where the store fails closed on an unmigrated schema, the launch path's behaviour in that case is itself a design decision. Respect the store's threading discipline → `IOS-ARCH-DATA-8`. Disk work stays off the main thread → `IOS-PERF-MAIN-1`.

**Networking** — go through the repo's client layer; no ad-hoc request construction at a call site → `IOS-ARCH-DATA-5`. A session captures its configuration when created, so a feature needing a different *session kind* — ephemeral or background — has that decided up front rather than mutated later. Per-request policy such as cache policy and timeout is set on the request, subject to the session's policy being no more restrictive; **do not propose a second session for those**, since a second client layer would otherwise reach an approval gate it does not need. **State the API contract this design depends on** — endpoint, method, request and response fields, and error cases — because implementation is bound to it exactly and may not invent or change it → `IOS-ARCH-DATA-6`. Preserve the transport-model/domain-model separation → `IOS-ARCH-DATA-2`, and plan decoding tolerant of what the backend actually guarantees → `IOS-ARCH-DATA-3`. Plan the error, timeout, retry and offline behaviour, propagating errors through the repo's mechanism and mapping them to intelligible user-facing text at the presentation boundary → `IOS-SWIFT-ERR-1`, `IOS-SWIFT-ERR-2`, `IOS-SWIFT-ERR-4`, `IOS-SWIFT-ERR-5`. Plan auth and transport security → `SEC-AUTH-1`, `SEC-AUTH-2`, `SEC-NET-1`, `SEC-NET-2`; a transport-security exception is a blocking unresolved decision, not a configuration detail.

**An unconfirmed backend contract is recorded, not worked around.** At Analyze and Design it is a blocking unresolved decision in the document; the plan continues and the gap is visible. It blocks **decomposition** — `/dev-feature-start` does not generate tasks against it ([§16](#16-risk-classification-and-applicability-stage)).

## 11. Testing planning

Plan what will be tested and at which level, matching the repo's existing framework and depth rather than introducing a new one → `IOS-ARCH-TEST-4`, `IOS-ARCH-TEST-2`. Make new logic reachable without a UI host, by injecting collaborators the way the repo already does → `IOS-ARCH-TEST-1`. Plan for determinism → `IOS-ARCH-TEST-5`. Where testability genuinely conflicts with the existing structure, raise it rather than restructuring code purely for coverage → `IOS-ARCH-TEST-3`. Cover localisation and RTL where relevant → `I18N-TEST-1`, `I18N-TEST-2`.

If the repository has no test infrastructure for a layer the feature touches, say so plainly and record it as an unresolved decision — do not silently plan tests that cannot run, and do not propose building a harness as part of an unrelated feature.

## 12. Performance planning

Identify the feature's realistic performance risks rather than reciting generic ones, across main-thread and cooperative-pool responsiveness → `IOS-PERF-MAIN-*`; rendering, scrolling, per-row cost and container choice → `IOS-PERF-RENDER-*`; image sizing, decode and eviction → `IOS-PERF-IMG-*`; unbounded accumulation and deterministic release → `IOS-PERF-MEM-*`; work added to launch, including pre-`main` cost → `IOS-PERF-LAUNCH-*`; and app size → `IOS-PERF-SIZE-*`. Cite the specific rule each risk engages.

**A magnitude claim is never asserted from reading code** → `IOS-PERF-MEASURE-1`. At planning time a suspected regression is written as a measurement request naming the metric, the scenario, and the threshold that would make it a defect; a *mechanism* risk is stated directly → `IOS-PERF-MEM-4`. Where the design's performance rests on something only a release build on real hardware can show, say so and defer it → `IOS-PERF-MEASURE-3`.

## 13. Security, accessibility, i18n/RTL, logging and analytics

- **Security** — secrets and token handling, and the rule that anything embedded at build time is public → `SEC-SECRETS-1`, `SEC-SECRETS-2`, `IOS-BUILD-CONFIG-6`; transport security → `SEC-NET-1`, `SEC-NET-2`; deep and universal links → `SEC-DEEPLINK-1`, `SEC-DEEPLINK-2`; permissions requested at the point of need, each with its usage-description string → `SEC-PERMS-1`, `SEC-PERMS-2`, `IOS-BUILD-DIST-4`; WebView surfaces → `SEC-WEBVIEW-1`, `SEC-WEBVIEW-2`; never logging sensitive data → `SEC-LOG-1`, `SEC-LOG-2`. Debug-only configuration must not reach a distributable build → `IOS-BUILD-CONFIG-5`. A new data-collection category or required-reason API triggers a privacy-manifest re-check → `IOS-BUILD-DIST-3`.
- **Accessibility** — labels, roles and traits → `A11Y-ROLES-1`, `A11Y-ROLES-2`, `IOS-UI-A11Y-1`; screen-reader support and focus order → `A11Y-SR-1`, `A11Y-SR-2`; Dynamic Type → `A11Y-FONT-1`, `A11Y-FONT-2`, `IOS-UI-A11Y-2`; composite controls exposed as one element → `IOS-UI-A11Y-3`; activation targets → `A11Y-TOUCH-1`, `A11Y-TOUCH-2`, which state their own TV equivalence and are applied as written. Dynamic Type applies on TV as it does on phone → `A11Y-FONT-*`. Also decide the feature's behaviour under the appearance and accessibility settings the repository already honours — colour scheme, increased contrast, reduced motion, bold text — rather than leaving them to fall out of the implementation.
- **i18n and RTL** — no hardcoded user-visible strings → `I18N-COPY-1`, `IOS-UI-VIEW-5`; locale-aware formatting → `I18N-FMT-1`, `I18N-FMT-2`; mirroring and directionality → `I18N-RTL-1`, `I18N-RTL-2`, `I18N-RTL-3`, `I18N-RTL-4`.
- **Logging and analytics** — reuse the repository's logging facility and its subsystem/category convention → `IOS-SWIFT-LOG-1`, `IOS-SWIFT-LOG-2`. **Define the analytics events the feature needs in the design** — names, parameters and trigger points — because implementation may not invent or rename them → `IOS-SWIFT-ANALYTICS-1`, `IOS-SWIFT-ANALYTICS-2`, `IOS-SWIFT-ANALYTICS-3`. Where the feature's own subject *is* one of these cross-cutting concerns, its DD section stays populated even when the behaviour-preserving collapse empties the rest.
- **Design tokens** — layout constants, colours, spacing and typography come from the repository's token or theme layer where one exists → `IOS-UI-VIEW-3`.
- **Behaviour-preserving changes** carry their own design content: how equivalence is established (parity between old and new outputs), whether both paths run at once during rollout, and what makes the change reversible. Absence of user-facing change is not absence of design.

## 14. `device_type` handling

One agent and one skill serve both device types. **Apple TV is a context signal, never a separate platform** — there is no TV platform value, and no TV-specific agent, skill, or command.

### `device_type: mobile`

Touch interaction, touch targets and phone/tablet navigation patterns apply. Three mobile-only decisions are stated rather than assumed: the orientations the feature supports; how its layout behaves across size classes and on iPad; and whether it is reachable in more than one scene at once, which decides state ownership and what restoration means per scene ([§8](#8-lifecycle-process-death-restoration-and-concurrency)).

### `device_type: tv`

**The standards carry no tvOS rules yet, so this skill's TV responsibility is discovery and non-regression, not guidance.** Apply the existing `IOS-*` rules unchanged — they are framework-neutral and none assumes touch. Where TV work needs a rule that does not exist, **record it as an unresolved decision naming the `ATV-001` gap**. A TV plan that rests on the repository's own conventions plus a named standards gap is the correct output at this point, not a deficient one. **This skill does not author TV standards or TV rules — `ATV-001` owns that, and `ATV-002` owns branching this skill deeply on device type.**

**An Apple TV application may use any implementation model** — SwiftUI, UIKit, `TVUIKit`, a TV markup framework such as `TVMLKit`, `AVKit` for playback, or an entirely in-house framework. Detect which; assume none.

Run this discovery pass **before** proposing anything, recording evidence for each item that exists:

1. **tvOS target identity and code sharing** — which target is the tvOS one, and how code is shared with any iOS target: a common package, conditional compilation, or separate sources.
2. **Focus handling** — how focus moves, is tracked, and is restored on return to a screen; whether the surface depends on that restoration; any custom focus manager.
3. **Remote input** — where press events are received and dispatched, and how the app handles back and play/pause.
4. **Navigation abstractions** — the TV navigation mechanism, which may differ from any mobile one in the same repo.
5. **TV UI components** — the component set actually used, framework or in-house.
6. **Playback integration** — the player, whether the framework's own player interface or a custom one, its lifecycle ownership, and the playback-state model.
7. **Current viewer and profiles** — whether the app distinguishes people on a shared device, how the current profile is resolved and stored, and whether credentials are shared across users. This decides what `SEC-STORAGE-*` actually requires on TV and is a capability decision under `IOS-BUILD-CONFIG-7`.
8. **Lifecycle conventions** — TV-specific screen lifecycle, background and resume behaviour.
9. **Reusable base types** — TV base controllers, screens, or view wrappers to extend.
10. **In-house TV framework modules** and their public surface.
11. **Layout, launch presentation, packaging and release** — how the app handles the screen's safe margins, its TV icon and launch-surface artwork, and any TV-specific scheme or distribution configuration. Note that the dynamic top-shelf surface is an **app extension target**, not an asset — if the feature touches it, that is a target-structure decision under [§3](#3-repository-evidence-collection) and [§6](#6-target-package-and-dependency-impact).

**A framework-independent anchor:** a tvOS target declares itself in its *build configuration* — it builds against the tvOS SDK, carries a tvOS deployment target, and declares the Apple TV device family. These confirm a TV target **without implying anything about the UI framework.** Use them to orient, never as evidence of which framework the app uses.

**Two TV facts change a design rather than an implementation**, so record them as decisions even though no rule exists yet: whether the feature's data fits the platform's materially tighter device-local storage expectations, or needs the cloud and system-managed asset-download mechanisms instead — which of those the repository is on is itself the decision, since the platform has more than one and they supersede each other over time — and where the repository's current approach conflicts, that conflict is an unresolved decision, not a verdict against the repository; and whether playback adopts the framework's own player interface or a custom one, since a custom player inherits every surface the framework's player supplies. For what a TV surface owes the user irrespective of framework, consult *Designing for tvOS*, *Focus and selection* and `AVPlayerViewController` in [References](#references).

**TV planning rules:**

- **Never propose migrating** to a different TV UI framework unless the feature explicitly requests it and it is approved. A superseded but still-present TV framework is a legitimate finding to plan within, not a defect to fix.
- **Never silently apply touch or mobile assumptions** — touch targets, on-screen gestures, scroll affordances and soft-keyboard flows do not transfer to a focus-and-remote model. Where a mobile-oriented rule's mechanism does not apply, state the intent it serves and how the TV surface satisfies it.
- **A capability the platform does not offer is not a design decision but an impossibility** — most notably, there is no web view on tvOS, so a TV feature specified around hosted web content is a blocking unresolved decision, not a security checklist item.
- **Reuse the existing custom components and conventions** wherever they cover the need.
- **Identify gaps or risks in the existing model without redesigning it.** Naming a weakness is in scope; re-architecting around it is not.
- If the repository contains both mobile and TV surfaces, plan only for the confirmed `device_type`, and never assume the mobile surface's conventions apply to the TV one.

## 15. Classification: Existing, Required, Recommended, Unresolved

Defined once in `skills/dev-design-start/SKILL.md` § *Shared planning rules → Classification*. Every statement in an iOS plan carries one of those four labels; the taxonomy is not restated here.

## 16. Risk classification and applicability stage

The three risk classes are defined once in `skills/dev-design-start/SKILL.md` § *Shared planning rules → Risk classification*. Apply them as written; they are not restated here.

Three additions are iOS-specific:

- **An additional blocking condition:** a required deployment-target or language-mode change.
- **The third class is tied to a measurement rule:** a suspected issue inspection cannot confirm → `IOS-PERF-MEASURE-1`.
- **The verify-later mechanism for iOS is the applicability stage** defined in `standards/ios/swift-standards.md` § *Applicability stage*. Planning happens before anything is built, so any rule its own document marks *(Build stage.)* or *(Release stage.)* is recorded as something the plan requires to be verified later. This is how the shared verify-later principle is discharged in this lane; the principle itself is not restated here.

## 17. Traceability and output requirements

Every element traces to something concrete: **repository claims** to a path via `[evidence: …]` or `[reused: …]`; **requirements** to the upstream section they come from; **rules** to a real ID, cited only where it genuinely applies and never merely adjacent to the point; **recommendations** to an explicit justification. **Never use React Native's generically-named `ARCH-*`/`API-*`/`STATE-*`/`NAV-*` IDs, and never use Android's `AND-*` IDs** — iOS cites the `IOS-*` roots.

Output shape, consumed by the shared skills:

- **At Analyze** → the flat "Proposed Technical Approach" section of `templates/feature-analysis-template.md`, holding the implementation model found, the approach, the classification, and the unresolved decisions. The evidence base belongs in that document. A change inventory at DD §20 resolution is **not** produced here; naming the targets and packages the feature is expected to touch is.
- **At Design** → DD §19 and §20, **as conclusions rather than as a transcript.** The evidence sweep, the labelling, and the [§14](#14-device_type-handling) TV discovery pass are research that grounds the design; they are never pasted into it. §19 receives the decisions and the IDs each follows, §20 the targets, packages and change classes per [§6](#6-target-package-and-dependency-impact). Unresolved decisions go to §24 and recommended deviations to §23 — not into §19 — and optional suggestions are reported to the developer rather than written to the DD, where `dev-design-start` Step 7 would remove them. That skill's Step 6 and Step 7 govern what lands in the document.
- **At Feature-start** → the iOS vocabulary and standard IDs used in each task's description and acceptance criteria, plus three decomposition hazards specific to this platform:
  - **Tasks that add files contend for the project file.** Where the project is not generated from a manifest, two tasks that each add a file both edit it and will conflict; sequence them, or note the contention on the `depends-on` edge.
  - **A new target, scheme, or build configuration is its own task**, never a side effect of the task that needs it → `IOS-BUILD-CONFIG-2`.
  - **A test that needs a host application depends on the target task that provides it** — that ordering is explicit, not implied.

Exactly one confirmed platform always applies, so these sections are **always flat** — never split into per-platform subsections.

## 18. Approval gates and failure behaviour

- Approval gating is owned by `commands/dev-design-start.md` and `commands/dev-feature-start.md`. **This skill never flips a status.**
- A UI-changing feature requires a design reference of any supported type; `not_required` is never a valid outcome for one. The gate itself is owned by `/analyze-feature`.
- **Stop and report** — never work around — on any condition in the Red flags section below.

## Definition of Done

- [ ] `platform: ios` and a valid `device_type` were taken from the confirmed context, not re-detected.
- [ ] Repository knowledge was resolved through `repo-knowledge-consumer`; reused categories are cited by path and anchor.
- [ ] Every dimension in [§3](#3-repository-evidence-collection) was inspected, scoped out as `N/A`, or explicitly marked `[unknown]` — at the depth the current stage requires.
- [ ] The UI implementation model is identified **per affected surface**, or `N/A — [reason]` where the feature touches no surface.
- [ ] Every repository claim carries an evidence, reuse, inference, or unknown label.
- [ ] The language and platform baseline was read, and no cited rule depends on an API the baseline does not offer.
- [ ] Any recorded design reference was read and resolved against existing components.
- [ ] State ownership, event flow, surface lifecycle, process-death behaviour, isolation, and task lifetime are each stated or marked `N/A — [reason]`.
- [ ] Navigation, persistence, networking, testing, performance, security, accessibility, i18n and RTL are addressed or marked `N/A — [reason]`.
- [ ] Build-stage and release-stage rules are recorded as *to be verified later*, never asserted as satisfied.
- [ ] When `device_type: tv`, the discovery pass ran, no mobile/touch assumption was carried over, and no TV standard ID was cited.
- [ ] Every statement is classified Existing / Required / Recommended / Unresolved.
- [ ] Every cited standard ID exists and genuinely applies.
- [ ] Unresolved decisions are listed with options and implications.
- [ ] No code was written and no repository file was modified.
- [ ] No new architecture, dependency, framework migration, deployment-target change, or language-mode change is proposed as required work without an approval gate.

## Standards citation

Cite only IDs that exist in these files and genuinely apply to the point being made.

| Area | Standard file | IDs |
|---|---|---|
| Swift naming, optionals and types, errors, object lifetime, concurrency correctness, diagnostics, static analysis | `standards/ios/swift-standards.md` | `IOS-SWIFT-*` |
| Layering, targets and packages, navigation, DI, data and model layer, testability | `standards/ios/ios-architecture.md` | `IOS-ARCH-*` |
| Framework selection, view composition, SwiftUI state, lists and cells, UIKit conventions, interop, accessibility wiring | `standards/ios/swiftui-uikit-standards.md` | `IOS-UI-*` |
| Main-thread responsiveness, rendering, images, memory, launch, app size, measurement | `standards/ios/ios-performance.md` | `IOS-PERF-*` |
| Build configuration, dependencies, signing, versioning, distribution, reproducibility | `standards/ios/xcode-build-signing.md` | `IOS-BUILD-*` |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-*` |
| Localisation and RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-*` |
| Security and privacy (shared) | `standards/shared/mobile-security.md` | `SEC-*` |

The lane-boundary, severity, no-convention and applicability-stage rules governing all five iOS documents are defined once in `standards/ios/swift-standards.md`.

## Red flags — STOP and report instead of proceeding

- A required input for the current stage is missing, or `device_type` is absent, empty, or not exactly `mobile`/`tv`.
- Repository evidence is missing, contradictory, or ambiguous on a dimension the plan depends on — and the ambiguity cannot be resolved by scoping to the surface the feature touches.
- Two competing mechanisms exist and the surface this feature touches cannot be determined from evidence.
- A UI-changing feature has no design reference of any supported type, or a recorded reference cannot be read.
- `device_type: tv` but the TV implementation model cannot be identified.
- The plan would require introducing a new architecture, framework, or dependency as required work.
- The feature cannot be built without raising the deployment target or changing the Swift language mode or concurrency diagnostics.
- A persisted-schema change has no migration path in the plan.
- The Feature Analysis and DD conflict, or an upstream document is unapproved, stale, or draft.
- At Feature-start: a blocking unresolved decision remains, including an unconfirmed backend contract.
- A cited `standards/ios/*` file is missing or is still unauthored scaffolding (see [§0](#0-standards-readiness-gate)).
- You are about to state a repository fact you did not verify.

## Relationship with commands, agent, skills

- **`commands/analyze-feature.md`** — platform/device-type detection, the user confirmation gate, the design-reference gate, and invoking the architect.
- **`commands/dev-design-start.md` / `commands/dev-feature-start.md`** — stage orchestration and approval gating.
- **Shared `dev-design-start` / `dev-feature-start` skills** — the overall mechanics ([Overview](#overview)).
- **`agents/ios-architect.md`** — the iOS specialist that runs this methodology.
- **This skill** — the iOS planning methodology itself.
- **`skills/ios-feature-implementation/SKILL.md`** — the separate methodology used at Implement time, not here.

This skill does not move command logic into itself, does not re-run platform or device-type detection, and does not invent paths to feature documents.

## References

Consult when a planning question is genuinely open — not routinely. None of these overrides the repository's existing implementation ([§1](#1-source-of-truth-hierarchy)).

| Source | When to consult |
|---|---|
| [Organizing your code with local packages](https://developer.apple.com/documentation/xcode/organizing-your-code-with-local-packages) | Whether new code justifies a package or belongs in an existing target ([§6](#6-target-package-and-dependency-impact)). |
| [SwiftUI state and data flow](https://developer.apple.com/documentation/swiftui/state-and-data-flow) | Which ownership and binding wrapper the detected observation model requires ([§7](#7-state-and-data-flow-analysis)). |
| [Swift concurrency documentation](https://www.swift.org/documentation/concurrency/) | Deciding a new type's isolation and what must be `Sendable` ([§8](#8-lifecycle-process-death-restoration-and-concurrency)). |
| [Swift 6 migration guide](https://www.swift.org/migration/documentation/migrationguide/) | Planning inside a project mid-migration, where diagnostics are noisy ([§3](#3-repository-evidence-collection)). |
| [Preserving your app's UI across launches](https://developer.apple.com/documentation/uikit/preserving-your-app-s-ui-across-launches) | What must survive process death, and what the platform may discard ([§8](#8-lifecycle-process-death-restoration-and-concurrency)). |
| [Background Tasks](https://developer.apple.com/documentation/backgroundtasks) | Choosing among background mechanisms ([§8](#8-lifecycle-process-death-restoration-and-concurrency)). |
| [Migrating your data model automatically](https://developer.apple.com/documentation/coredata/migrating-your-data-model-automatically) | Which migration tier a persisted-schema change needs ([§10](#10-persistence-and-networking)). |
| [Preventing insecure network connections](https://developer.apple.com/documentation/security/preventing-insecure-network-connections) | Whether a feature's transport needs an exception, and what that costs ([§10](#10-persistence-and-networking)). |
| [Designing for tvOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-tvos) | What a TV surface owes the user irrespective of framework ([§14](#14-device_type-handling)). |
| [Focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection) | Focus expectations any TV implementation must meet ([§14](#14-device_type-handling)). |
| [Focus-based navigation](https://developer.apple.com/documentation/uikit/focus-based-navigation) | Reading an existing focus implementation during TV discovery ([§14](#14-device_type-handling)). |
| [`AVPlayerViewController`](https://developer.apple.com/documentation/avkit/avplayerviewcontroller) | Weighing the framework's player against a custom one ([§14](#14-device_type-handling)). |
| [Xcode localization](https://developer.apple.com/documentation/xcode/localization) | Identifying the repository's localisation mechanism ([§13](#13-security-accessibility-i18nrtl-logging-and-analytics)). |
| [Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files) | Whether the feature triggers a privacy-manifest re-check ([§13](#13-security-accessibility-i18nrtl-logging-and-analytics)). |
