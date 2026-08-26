---
name: android-dev-planning
description: Repository-first planning methodology for native Android features — discovers the repo's actual implementation model, then supplies the Android vocabulary and AND-*/shared standard IDs for a Detailed Design's Technical Implementation Approach, Impacted Modules, and task breakdown. Used by /dev-design-start and /dev-feature-start via the android-architect agent, alongside the shared dev-design-start / dev-feature-start skills, which own the overall mechanics. Assumes no UI toolkit, architecture, or library, and handles device_type mobile and tv.
---

# Android Dev Planning

## Overview

This skill is the methodology the `android-architect` agent follows when planning native Android work. It owns *how* an Android feature is understood, grounded in repository evidence, analysed, classified, and expressed as a design — for `/analyze-feature`'s Proposed Technical Approach, `/dev-design-start`'s DD §19/§20, and `/dev-feature-start`'s task vocabulary.

It is not orchestration. The shared `dev-design-start` and `dev-feature-start` skills own the overall mechanics: DD structure and gap discipline; existing-file strategy; task decomposition, dependencies, rollback plan, and draft-until-approved gates. This skill does not re-implement any of that — it supplies the Android-specific content those mechanics consume.

**This skill assumes no technology.** Jetpack Compose, XML/Views, Fragments, Activities, single-activity, Hilt, Dagger, Koin, manual DI, Room, DataStore, Retrofit, Ktor, Coroutines/Flow, RxJava, LiveData, WorkManager, MVVM, MVI, Clean Architecture, multi-module layout, and — on TV — Leanback or Compose for TV are **possible findings, never defaults**. The repository's existing conventions are the source of truth. Official Android documentation is supporting guidance only and never overrides a valid existing implementation.

**This skill never writes code and never modifies repository files.** It plans.

## Inputs this skill requires (resolved, never invented)

Before anything else, obtain and **verify the existence of** the concrete inputs below. They are resolved and passed by the invoking command — artifact resolution is `commands/dev-design-start.md`'s, not this skill's. This skill **never guesses or fabricates a path** to a feature document.

- The confirmed **`platform`** (must be `android`) and **`device_type`** (`mobile` or `tv`), read from frontmatter. Never re-detected here.
- The target **repository / module root**.
- **At Analyze:** the feature description and `repo-analyst`'s findings summary.
- **At Design:** the absolute path to the **approved Feature Analysis**.
- **At Feature-start:** the absolute path to the **approved Detailed Design (DD)**.
- The four **design-reference fields** (`design_reference_status`, `design_reference_type`, `design_reference`, `figma_link`).

If any required input is missing, **stop and report exactly which input is missing** — do not proceed against an assumed location. If `platform` is not `android`, stop: this skill does not run for another platform. If `device_type` is missing, empty, or any value other than `mobile`/`tv` (including `mixed`), **stop and report it** — never default to `mobile`.

## 0. Standards readiness gate

This skill grounds every Android-specific rule in an authored `AND-*` standard under `standards/android/`. Before planning, confirm those standards are authored (not placeholders). If any cited `standards/android/*` file is missing or is still a structure-only placeholder, **stop and report that real Android planning is blocked until it is authored** — do not silently fall back to assumed defaults. (As of authoring, all ten `standards/android/*` files and the shared `A11Y-*`/`I18N-*`/`SEC-*` standards are authored; this gate exists so the skill fails loudly if that regresses.)

## 1. Source-of-truth hierarchy

Defined once in `skills/dev-design-start/SKILL.md` § *Shared planning rules → Source-of-truth hierarchy*. Apply it as written; it is not restated here.

Android's parameters for the two parameterised ranks:

- **Rank 4** — `standards/android/*` plus `standards/shared/*`.
- **Rank 5** — official Android documentation.

## 2. Repository-knowledge reuse

Repository knowledge is resolved by the invoking command and consumed through the `repo-knowledge-consumer` skill, which owns the resolution procedure, what may be reused, and the citation shape. Apply it as written; it is not restated here.

What this lane adds on top of it:

- **Derive live the Android detail no repository-wide document can hold** — the actual signatures, state shape, and call sites of the specific classes *this feature* touches, alongside the categories the consumer reports as `deriveLive`. That feature-specific reading is required and is not duplication of the manifest.

## 3. Repository evidence collection

Inspect the actual codebase before proposing anything. **Detect — do not assume.** `repo-analyst` supplies only lightweight Android existence checks, so this sweep is this skill's own responsibility, not something to delegate.

Collect evidence for each dimension, recording the path that proves it:

1. **Gradle structure** — Groovy vs. Kotlin DSL, version catalogs, convention plugins, `settings.gradle(.kts)` module list.
2. **Application and library modules** — single-module vs. multi-module, module types, dependency graph direction, `api`/`implementation` boundaries.
3. **Kotlin and Java usage** — language mix, Kotlin version/level, Java interop surfaces.
4. **SDK levels** — `minSdk`, `targetSdk`, `compileSdk`, AGP version, and any API-level constraints they impose.
5. **Build variants and product flavors** — build types, flavors, and how environment/config values are supplied.
6. **UI implementation model** — see [§5](#5-ui-implementation-model-identification).
7. **Activities and Fragments** — single-activity vs. multi-activity, Fragment usage, base classes, and project-specific UI abstractions.
8. **Navigation approach** — Navigation Component, Compose Navigation, `FragmentTransaction`, `Intent`-based, a custom router, or a project-specific abstraction.
9. **State-management conventions** — ViewModel usage or its absence, state holder shape, immutable vs. mutable state, one-time-event pattern.
10. **Dependency injection** — Hilt, Dagger, Koin, manual DI, or a service locator; scopes and component boundaries.
11. **Networking** — client, serialization, interceptors, auth handling, DTO/mapper conventions.
12. **Persistence** — Room, DataStore, SharedPreferences, files, or a custom store; migration and cache conventions.
13. **Background work** — WorkManager, services, foreground services, broadcast receivers, `JobScheduler`, or an in-house scheduler.
14. **Concurrency model** — Coroutines/Flow, RxJava, LiveData, callbacks, or a mix; dispatcher-injection convention; structured-concurrency and cancellation practice.
15. **Testing tools and coverage** — frameworks, assertion/mocking libraries, instrumentation and UI test setup, what is actually covered today.
16. **Reusable components** — existing screens, shared UI components, base classes, and utilities the feature should reuse.
17. **Existing feature boundaries** — how features are packaged, where a new one would sit, and what the nearest analogous feature looks like.
18. **Relevant platform integrations** — analytics, logging, feature flags, remote config, media/playback, push, deep links, and any SDKs the feature touches.

**Label every finding** `[evidence: <path>]`, `[reused: <path>#<anchor>]`, `[inference]`, or `[unknown]`. An unlabelled repository claim is a defect. Prefer `[unknown]` over a guess.

## 4. Architecture analysis order

Analyse in this order, so each step builds on established evidence rather than assumption:

1. **Module and layer map** — what exists, and which layer the feature belongs in.
2. **Existing analogous feature** — the nearest comparable feature in the repo becomes the pattern to follow.
3. **Layering and dependency direction** — confirm the proposal does not invert the repo's direction → `AND-ARCH-LAYERS-1`, `AND-ARCH-LAYERS-2`, `AND-ARCH-LAYERS-3`, `AND-ARCH-DEPS-1`, `AND-ARCH-DEPS-2`.
4. **Module placement** — where new code lands and whether a new module is justified → `AND-ARCH-MODULE-1`, `AND-ARCH-MODULE-2`, `AND-ARCH-MODULE-3`, `AND-ARCH-MODULE-4`.
5. **Dependency injection** — how the feature's dependencies are provided in the repo's existing DI approach → `AND-DI-1`, `AND-DI-2`, `AND-DI-3`, `AND-DI-4`.

A new architectural pattern is never introduced for a single feature. If the feature appears to require one, that is an unresolved decision, not a design choice.

## 5. UI implementation-model identification

Identify the model **per surface**, not per repository — a repo may legitimately contain several. Recognize five outcomes, none privileged:

| Model | Evidence to look for | Standards that apply |
|---|---|---|
| **Compose** | Compose dependencies, `setContent`, `@Composable` declarations | `AND-UI-COMPOSE-*` |
| **XML / Views** | `res/layout/`, ViewBinding/DataBinding, Fragment/Activity view inflation | `AND-UI-XML-*` |
| **Hybrid** | both present on different surfaces | whichever matches each surface |
| **Mid-migration** | interop in both directions (a Compose host embedding a View, or a View hierarchy hosting Compose), migration notes/ADRs | whichever matches each surface; the migration's direction is respected, not accelerated |
| **Custom / project-specific** | in-house base classes, UI abstractions, or a bespoke rendering/navigation layer | `AND-UI-*` applied to the wrapper's observable behavior, plus the repo's own conventions |

Rules:

- **The surface the feature touches decides which family applies.** Do not apply Compose rules to a View surface or vice versa.
- **Do not migrate a surface between models** unless the feature explicitly requires it and it is approved → record as an unresolved decision.
- **A custom or legacy model is a first-class finding, not a defect.** Plan within it. Where a custom abstraction wraps a standard mechanism, apply the standard's *intent* to the wrapper's behavior rather than demanding the standard API.
- Lists and resources follow the surface too → `AND-UI-LIST-*`, `AND-UI-RES-*`.

## 6. Module and dependency impact

**Inspect broadly; report at module and change-class resolution.** Analysis may — and for a wide-reaching change should — read every relevant file to understand the true blast radius. What the *design* records is the conclusion of that reading, not its transcript.

Enumerate every **module and package** the feature touches, and for each state:

- the **class of change** it undergoes, and whether it is created, modified, or only read;
- an **approximate site count** where the same change repeats across many files (e.g. "`:player` — all `SimpleExoPlayer` construction sites move to `ExoPlayer.Builder`, ~40 sites").

**Enumerate individual files only when** the affected set is small — roughly **ten or fewer sites** for a given change class — or when a specific file is itself a **design-relevant boundary**: it defines a public surface, carries a decision of its own, or is the seam the design turns on. A file that is simply one more instance of an already-stated change class is not enumerated.

**Per-file expansion belongs to `/dev-feature-start` and the Task Breakdown**, which turns each change class into per-file tasks and re-reads the repository to do so. A DD that lists every touched file has written the task breakdown in the wrong document. Keep each note at the level of *what* changes, never *how* to change it.

Confirm no new circular dependency, no inverted layer dependency, and no new module without justification. New third-party dependencies are an unresolved decision, never a silent addition → `AND-REL-DEP-1`, `AND-REL-DEP-2`, `AND-REL-DEP-3`. Build-config changes follow the repo's existing variant/flavor structure → `AND-REL-VARIANT-1`, `AND-REL-VARIANT-3`; `minSdk`/`targetSdk`/`compileSdk` are never changed as a side effect of a feature → `AND-REL-VARIANT-2`.

## 7. State and data-flow analysis

Describe, in the repo's own idiom:

- **State ownership** — who owns each piece of state and what the single source of truth is → `AND-VM-STATE-1`, `AND-VM-STATE-3`.
- **State shape** — the explicit loading / success / empty / error representation the feature needs → `AND-VM-STATE-2`.
- **Event flow** — how user events reach the state owner and how one-time effects are delivered, following the repo's existing pattern → `AND-VM-EVENT-1`.
- **Data flow end to end** — input → state holder → domain/repository → data source → back to the surface, naming the actual classes involved.
- **Framework independence** — no Android UI types held where the repo keeps them out → `AND-VM-STATE-4`.

Use the repository's vocabulary. If the repo has no ViewModel layer, do not invent one; describe the state holder it actually uses, and cite `AND-VM-*` for the behavior those rules govern where it genuinely applies.

## 8. Lifecycle, process recreation and concurrency

- **Lifecycle** — which lifecycle owns each piece of work, and how the feature behaves across configuration change and backgrounding → `AND-VM-LIFECYCLE-1`, `AND-VM-LIFECYCLE-2`.
- **Process recreation and state restoration** — what must survive process death and where it is saved. Decide explicitly per state: transient UI state, restorable UI state, or persisted data. State this even when the answer is "nothing needs to survive" — silence here is a common defect.
- **Concurrency** — which work runs off the main thread, on which dispatcher/scheduler, following the repo's injection convention → `AND-KT-COROUTINE-1`, `AND-KT-COROUTINE-2`, `AND-PERF-THREAD-1`.
- **Cancellation and scoping** — which scope owns each operation and what cancels it → `AND-KT-COROUTINE-3`, `AND-VM-LIFECYCLE-3`.
- **Background work** — when work must outlive the surface, choose the mechanism the repo already uses and justify it against the feature's needs: does it need to survive process death, is it deferrable, is it user-visible, is it time-critical. Do not introduce a new background mechanism when an existing one fits.

## 9. Navigation analysis

Plan against the repo's detected mechanism — never a second, parallel one → `AND-NAV-DEST-1`. Reuse existing destinations and helpers rather than adding new ones for a screen that already exists → `AND-NAV-DEST-2`, `AND-NAV-DEST-3`. Define arguments and any deep-link entry points, validating external input → `AND-NAV-ARGS-1`, `AND-NAV-ARGS-2`, `AND-NAV-ARGS-3`, `SEC-DEEPLINK-1`, `SEC-DEEPLINK-2`. Specify back-stack behavior and where the user lands on back/up → `AND-NAV-STACK-1`, `AND-NAV-STACK-2`. Navigation is not triggered from domain or data layers → `AND-NAV-LAYER-1`.

Back-stack expectations, a fixed start destination, and predictable up/back behavior apply to any navigation implementation, including a fully custom one — plan them regardless of mechanism.

## 10. Persistence and networking

**Persistence** — choose the repo's existing mechanism for the kind of data involved; do not introduce a second store for data an existing one covers → `AND-DATA-STORE-1`, `AND-DATA-STORE-2`, `AND-DATA-STORE-3`. Plan schema migrations explicitly; never clear user data to avoid one → `AND-DATA-MIGRATE-1`, `AND-DATA-MIGRATE-2`, `AND-DATA-MIGRATE-3`. Keep disk work off the main thread → `AND-DATA-THREAD-1`. Define cache invalidation and the source of truth → `AND-DATA-CACHE-1`. Sensitive data uses the repo's secure storage → `AND-DATA-SEC-1`, `AND-DATA-SEC-2`, `AND-DATA-SEC-3`, `SEC-STORAGE-1`, `SEC-STORAGE-2`.

**Networking** — use the repo's existing client and cross-cutting configuration; no ad-hoc client per feature → `AND-NET-CLIENT-1`, `AND-NET-CLIENT-2`, `AND-NET-CLIENT-3`. Follow the DD's API contracts exactly and never invent endpoints, fields, or response shapes → `AND-NET-CONTRACT-1`, `AND-NET-CONTRACT-2`. Keep transport models separate from domain models per the repo's mapping convention → `AND-NET-DTO-1`, `AND-NET-DTO-2`. Plan auth handling → `AND-NET-AUTH-1`, `AND-NET-AUTH-2`, `SEC-AUTH-1`. Specify error, timeout, retry, and offline behavior → `AND-NET-ERR-1`, `AND-NET-ERR-2`, `AND-NET-ERR-3`, `AND-NET-ERR-4`, `AND-NET-ERR-5`.

**If the feature depends on an unconfirmed backend contract, record it as a blocking unresolved decision** — a design built on an unconfirmed contract is not ready for decomposition.

## 11. Testing planning

Plan what will be tested and at which level, matching the repo's existing setup rather than introducing a framework → `AND-TEST-UNIT-2`. Cover: business/domain logic including the failure and edge paths the design defines → `AND-TEST-UNIT-1`; determinism, with time and dispatchers controlled → `AND-TEST-UNIT-3`; state-holder behavior and emitted state sequences → `AND-TEST-VM-1`, `AND-TEST-VM-2`, `AND-TEST-VM-3`; instrumentation or UI tests where the repo uses them → `AND-TEST-INSTR-1`, `AND-TEST-COMPOSE-1`, `AND-TEST-COMPOSE-2`; localization and RTL checks where relevant → `I18N-TEST-1`, `I18N-TEST-2`.

If the repository has no test infrastructure for a layer the feature touches, say so plainly and record it as an unresolved decision — do not silently plan tests that cannot run, and do not propose building a test framework as part of an unrelated feature.

## 12. Performance planning

Identify the feature's realistic performance risks rather than reciting generic ones: main-thread work → `AND-PERF-THREAD-1`, `AND-PERF-THREAD-2`, `AND-PERF-THREAD-3`; list rendering and item identity → `AND-PERF-LIST-1`, `AND-PERF-LIST-2`, `AND-PERF-LIST-3`; image loading and sizing → `AND-PERF-IMAGE-1`, `AND-PERF-IMAGE-2`, `AND-PERF-IMAGE-3`; leaks and retention → `AND-PERF-MEM-1`, `AND-PERF-MEM-2`, `AND-PERF-MEM-3`, `AND-PERF-MEM-4`; startup, download size, and battery → `AND-PERF-SIZE-1`, `AND-PERF-SIZE-2`, `AND-PERF-SIZE-3`.

Flag a risk that needs profiling to confirm **as needing profiling** — never state a guess as a confirmed finding.

## 13. Security, accessibility, i18n and RTL planning

- **Security** — secrets and token handling → `SEC-SECRETS-1`, `SEC-SECRETS-2`; transport security → `SEC-NET-1`, `SEC-NET-2`; exported components, intents, and deep links → `SEC-DEEPLINK-1`, `SEC-DEEPLINK-3`; permissions at point of need → `SEC-PERMS-1`, `SEC-PERMS-2`; WebView surfaces when present → `SEC-WEBVIEW-1`, `SEC-WEBVIEW-2`; never logging sensitive data → `SEC-LOG-1`, `AND-LOG-PII-1`.
- **Accessibility** — roles and labels for non-text controls → `A11Y-ROLES-1`, `A11Y-ROLES-2`; screen-reader support and focus order → `A11Y-SR-1`, `A11Y-SR-2`; font scaling → `A11Y-FONT-1`, `A11Y-FONT-2`; activation targets → `A11Y-TOUCH-1`, `A11Y-TOUCH-2`. On TV, `A11Y-TOUCH-1`'s requirement is satisfied by a reliably focusable element with a clearly visible focus state rather than a touch-target size.
- **i18n and RTL** — no hardcoded user-visible strings → `I18N-COPY-1`, `AND-UI-RES-1`; formatting → `I18N-FMT-1`, `I18N-FMT-2`; RTL layout and mirroring → `I18N-RTL-1`, `I18N-RTL-2`, `I18N-RTL-3`, `I18N-RTL-4`.
- **Logging and analytics** — reuse existing conventions, define the events the feature genuinely needs, keep debug logging gated → `AND-LOG-HYGIENE-1`, `AND-LOG-HYGIENE-2`, `AND-LOG-HYGIENE-3`, `AND-LOG-ANALYTICS-1`, `AND-LOG-ANALYTICS-2`, `AND-LOG-ANALYTICS-3`, `AND-LOG-PII-2`, `AND-LOG-PII-3`.

## 14. `device_type` handling

One agent and one skill serve both device types. **TV is a context signal, never a separate platform** — there is no TV platform value, no TV-specific agent, skill, or command.

### `device_type: mobile`

Proceed with the standard path. Touch interaction, touch targets, and mobile navigation patterns apply.

### `device_type: tv`

**An Android TV application may use any implementation model.** Inspect and identify the actual implementation before making any planning or architectural decision. It may use standard Android TV frameworks, a custom framework, or another repository-specific solution. Never assume Leanback, Compose for TV, or any standard Android TV component set.

Run this discovery pass **before** proposing anything, recording evidence for each item that exists:

1. **Focus handling** — how focus is moved, tracked, and restored; any custom focus engine or focus manager.
2. **D-pad and remote input** — where key events are received and dispatched; custom key handling; media/remote button support.
3. **Navigation abstractions** — the TV navigation mechanism, which may differ from any mobile navigation in the same repo.
4. **TV UI components** — the component set actually used: framework widgets, Compose for TV, Leanback widgets, or in-house components.
5. **Playback integration** — the player, its lifecycle ownership, surface handling, and playback-state model, where the feature touches playback.
6. **Lifecycle conventions** — TV-specific screen lifecycle handling, including background and resume behavior.
7. **Reusable base classes** — TV base activities, fragments, screens, or view wrappers the feature should extend.
8. **Framework modules** — in-house TV framework modules and their public surface.
9. **Launcher and banner configuration** — the manifest entries that make the app a TV app.
10. **Packaging and release configuration** — TV-specific variants, flavors, or distribution configuration.

**A dependable, toolkit-independent anchor:** every Android TV app declares its TV entry point in the manifest regardless of UI toolkit — a launcher activity with the leanback launcher intent category, the leanback `uses-feature` declaration, a `touchscreen` `uses-feature` marked not required, and a banner on the application element. These manifest facts confirm a TV target **without implying anything about the UI framework**. Use them to orient; never read them as evidence that the UI is Leanback-based.

Likewise, D-pad focus traversal, always-visible focus indication, and predictable back behavior are expectations of any TV implementation — framework, Compose for TV, or fully custom. Plan them regardless of which model is found.

**TV planning rules:**

- **Never propose migrating** to Leanback, Compose for TV, or another framework unless the feature explicitly requests that migration and it is approved.
- **Never silently apply touch or mobile assumptions** — touch targets, tap/swipe gestures, scroll affordances, and soft-keyboard flows do not transfer to a D-pad/remote model.
- **Reuse the existing custom components and conventions** wherever they cover the need.
- **Identify gaps or risks in the existing model without redesigning it.** Naming a weakness is in scope; unilaterally re-architecting around it is not.
- If the repository contains both mobile and TV surfaces, plan only for the confirmed `device_type`, and never assume the mobile surface's conventions apply to the TV one.

This skill does **not** author TV standards or TV rules — that is a separate, later scope. Its TV responsibility is discovery and respect for the existing model.

## 15. Classification: Existing, Required, Recommended, Unresolved

Defined once in `skills/dev-design-start/SKILL.md` § *Shared planning rules → Classification*. Every statement in an Android plan carries one of those four labels; the taxonomy is not restated here.

## 16. Risk classification

Defined once in `skills/dev-design-start/SKILL.md` § *Shared planning rules → Risk classification*. Apply the three classes as written; they are not restated here.

## 17. Traceability and output requirements

Every element of the plan traces to something concrete:

- **Repository claims** → a path, via `[evidence: <path>]` or `[reused: <path>#<anchor>]`.
- **Requirements** → the upstream document section they come from.
- **Rules** → a real `AND-*` or shared ID, cited only where it genuinely applies.
- **Recommendations** → an explicit justification.

Never cite an ID that does not exist, and never cite one that is merely adjacent to the point being made. **Never use React Native's generically-named `ARCH-*`/`API-*`/`STATE-*`/`NAV-*` IDs for Android** — those are RN-specific; Android cites the `AND-*` roots.

Output shape, consumed by the shared skills:

- **At Analyze** → the flat "Proposed Technical Approach" section of `templates/feature-analysis-template.md`. The evidence base belongs in that document.
- **At Design** → the DD's §19 Technical Implementation Approach and §20 Impacted Modules, **as conclusions rather than as a transcript.** The evidence sweep from [§3](#3-repository-evidence-collection), the `[evidence: <path>]` / `[reused: …]` / `[inference]` / `[unknown]` labelling, and the [§14](#14-device_type-handling) TV discovery pass are research that grounds the design — they are not DD content, and are never pasted into it. §19 receives the decisions taken and the standard IDs each follows; §20 receives modules and change classes per [§6](#6-module-and-dependency-impact). The shared `dev-design-start` skill's Step 6 and Step 7 govern what actually lands in the document.
- **At Feature-start** → the Android vocabulary and standard IDs used in each task's description and acceptance criteria.

Exactly one confirmed platform always applies, so these sections are **always flat** — never split into per-platform subsections.

## 18. Approval gates and failure behavior

- Approval gating is owned by `commands/dev-design-start.md` and `commands/dev-feature-start.md`. **This skill never flips a status.**
- The design-reference gate is owned by `/analyze-feature`; this lane reads what it recorded and never re-runs it.
- **Stop and report** — never work around — when: a required input is missing; `device_type` is absent or invalid; evidence is missing, contradictory, or ambiguous on a load-bearing dimension; upstream documents conflict; the plan would require violating or expanding an approved decision; a backend contract is unconfirmed; a cited standard file is missing or a placeholder.

## Definition of Done

The plan is complete when all of the following hold:

- [ ] `platform: android` and a valid `device_type` were read from frontmatter, not re-detected.
- [ ] Repository knowledge was resolved through `repo-knowledge-consumer`; reused categories are cited by path and anchor.
- [ ] Every dimension in [§3](#3-repository-evidence-collection) was inspected or explicitly marked `[unknown]`.
- [ ] The UI implementation model is identified **per affected surface**.
- [ ] Every repository claim carries an evidence, reuse, inference, or unknown label.
- [ ] State ownership, event flow, lifecycle, process-recreation behavior, and concurrency are each stated.
- [ ] Navigation, persistence, networking, testing, performance, security, accessibility, i18n and RTL are addressed or marked `N/A — [reason]`.
- [ ] When `device_type: tv`, the TV discovery pass ran and no mobile/touch assumption was carried over.
- [ ] Every statement is classified Existing / Required / Recommended / Unresolved.
- [ ] Every cited standard ID exists and genuinely applies.
- [ ] Unresolved decisions are listed with options and implications.
- [ ] No code was written and no repository file was modified.
- [ ] No new architecture, library, or migration is proposed as required work without an approval gate.

## Standards citation

Cite only IDs that exist in these files and genuinely apply to the point being made.

| Area | Standard file | IDs |
|---|---|---|
| Kotlin language & safety | `standards/android/kotlin-standards.md` | `AND-KT-*` |
| Architecture, state holders, DI | `standards/android/android-architecture.md` | `AND-ARCH-*`, `AND-VM-*`, `AND-DI-*` |
| Compose / XML / lists / resources | `standards/android/compose-xml-standards.md` | `AND-UI-*` |
| Navigation | `standards/android/android-navigation.md` | `AND-NAV-*` |
| Networking & API | `standards/android/android-networking.md` | `AND-NET-*` |
| Persistence | `standards/android/android-persistence.md` | `AND-DATA-*` |
| Performance & memory | `standards/android/android-performance.md` | `AND-PERF-*` |
| Testing | `standards/android/android-testing.md` | `AND-TEST-*` |
| Logging & analytics | `standards/android/android-logging-analytics.md` | `AND-LOG-*` |
| Gradle / build / signing | `standards/android/gradle-build-signing.md` | `AND-REL-*` |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-*` |
| Localization & RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-*` |
| Security & privacy (shared) | `standards/shared/mobile-security.md` | `SEC-*` |

## Red flags — STOP and report instead of proceeding

- A required input is missing, or `device_type` is absent, empty, or not exactly `mobile`/`tv`.
- Repository evidence is missing, contradictory, or ambiguous on a dimension the plan depends on.
- Two competing mechanisms exist and the one this feature should follow cannot be determined from evidence.
- A UI-changing feature has no design reference of any supported type.
- `device_type: tv` but the TV implementation model cannot be identified.
- The feature depends on an unconfirmed backend contract.
- The plan would require introducing a new architecture, toolkit, or library as required work.
- The Feature Analysis and DD conflict, or an upstream document is unapproved, stale, or draft.
- A cited `standards/android/*` file is missing or is a structure-only placeholder (see [§0](#0-standards-readiness-gate)).
- You are about to state a repository fact you did not verify.

## Relationship with commands, agent, skills

Responsibilities stay separated:

- **`commands/analyze-feature.md`** — platform/device-type detection, the user confirmation gate, the design-reference gate, and invoking the architect.
- **`commands/dev-design-start.md` / `commands/dev-feature-start.md`** — stage orchestration and approval gating.
- **Shared `dev-design-start` / `dev-feature-start` skills** — DD structure and gap discipline; task decomposition, dependencies, rollback plan, draft-until-approved gates.
- **`agents/android-architect.md`** — the Android specialist that runs this methodology.
- **This skill** — the Android planning methodology itself.
- **`skills/android-feature-implementation/SKILL.md`** — the separate methodology used at Implement time, not here.

This skill does not move command logic into itself, does not re-run platform or device-type detection, and does not invent paths to feature documents — the resolved paths from [Inputs](#inputs-this-skill-requires-resolved-never-invented) are verified before use.
