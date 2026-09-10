---
name: android-feature-implementation
description: Android-specific implementation methodology — the repository dimensions to inspect, the per-area coding guidance, the validation tooling, and the AND-* standards-citation map. Used by /implement-task via the android-feature-developer agent, alongside the shared platform-implementation skill, which owns the lifecycle mechanics.
---

# Android Feature Implementation

## Overview

This skill is the **Android half** of implementing one task. It owns what a
platform-independent layer could not state: which dimensions of a Android repository to
inspect, how Android code is actually written here, which tools validate it, and which
`AND-*` and shared standard IDs may be cited.

The workflow half — inputs, the source-of-truth hierarchy, readiness checks, scope
control, incremental implementation, the validation rules, self-review and the completion
report — lives in **`skills/platform-implementation/SKILL.md`** and is not restated here.
Apply both: that skill for *how the task is run*, this one for *how Android is written*.

**It is not orchestration.** `/implement-task` resolves the task id, verifies the approval
and readiness gates, reads the row's `platform`, routes here, and records lifecycle state;
the write hooks gate every edit. This skill does not move command logic into itself.

**This skill never modifies a planning document.** It reads approved artifacts and writes
application code.

## Standards readiness

Every rule this skill applies is grounded in an authored standard under
`standards/android/`. Before implementing, confirm the ten files cited in
[Standards citation](#standards-citation) are authored rather than structure-only
placeholders. If a cited file is missing or is a placeholder, **stop and report that real
Android implementation is blocked until it is authored** — do not fall back to assumed
defaults.

## Repository dimensions to inspect

The shared skill owns the grounding discipline — detect rather than assume, follow the
nearest analogous feature, reuse before creating. These are the Android dimensions that
discipline is applied to:

- Single-module vs. multi-module structure; app/feature module boundaries.
- Kotlin and Java usage; Gradle config (Groovy/Kotlin DSL, version catalogs) and build variants/flavors.
- Jetpack Compose vs. XML/ViewBinding/DataBinding, and mixed Compose/XML surfaces.
- Architecture pattern actually in use (MVVM, MVI, Clean, layered, other).
- ViewModel and UI-state conventions.
- Async/reactive: Coroutines, Flow, LiveData, RxJava; dispatcher-injection convention.
- DI framework: Hilt, Dagger, Koin, or manual DI.
- Networking: Retrofit, Ktor, raw HTTP; serialization library.
- Persistence: Room, DataStore, SharedPreferences, files.
- Navigation: Navigation Component, Compose Navigation, custom router.
- Repository/use-case/domain conventions; error/loading/empty/retry/offline patterns.
- Analytics, logging, feature flags, remote config; localization and RTL support.
- Testing setup; lint/detekt/ktlint/Android Lint/formatting/static analysis.
- `minSdk`/`targetSdk`/`compileSdk`, AGP and Kotlin versions.

## Android implementation methodology

Apply the standards below as you write, grounded in the conventions detected in [Repository dimensions to inspect](#repository-dimensions-to-inspect). Every Android rule cites an authored `AND-*` ID; accessibility/i18n/security cite the shared `A11Y-*`/`I18N-*`/`SEC-*` docs, applied with Android-native APIs.

### Kotlin & language safety
Follow the repo's Kotlin style/level. Nullability correct, no unsafe casts or gratuitous `!!`, sealed/data/enum/result types only where consistent with the repo, no hidden side effects in extensions, Java interop kept in mind, no unjustified experimental APIs. → `AND-KT-NULL-*`, `AND-KT-TYPE-*`, `AND-KT-SEALED-*`, `AND-KT-LINT-*`.

### Architecture & dependency direction
Preserve existing layers and module boundaries; UI does not reach transport/persistence directly where repositories/use-cases exist; domain logic stays out of Activities/Fragments/Views/Composables; no circular deps; respect public/`internal` boundaries; no new architectural pattern for one task; keep business rules testable and Android-independent. → `AND-ARCH-LAYERS-*`, `AND-ARCH-DEPS-*`, `AND-ARCH-MODULE-*`.

### ViewModel & state handling
Follow the detected ViewModel/state model; immutable UI state where that's the convention; loading/success/empty/error explicit; single source of truth; no Activity/Fragment/View/Context in ViewModels; one-time effects follow the repo's pattern; handle process recreation and config change; prevent stale state, duplicated events, races. → `AND-VM-STATE-*`, `AND-VM-EVENT-1`, `AND-VM-LIFECYCLE-*`.

### Coroutines, Flow, LiveData & threading
Follow dispatcher-injection conventions; never block the main thread; lifecycle-aware collection; no unscoped coroutines; respect structured concurrency and cancellation; avoid unintended repeated collection; avoid needless Flow/LiveData/callback/Rx conversion; make Shared/StateFlow replay & subscription intentional; surface concurrency/ordering risks. → `AND-KT-COROUTINE-*`, `AND-VM-LIFECYCLE-3`, `AND-PERF-THREAD-1`.

### Dependency injection
Use the detected DI framework; follow existing scopes/component boundaries; no manual service locator where DI is used; avoid over-scoping; place bindings in the correct module; do not inject `Context` where a narrower dependency suffices. → `AND-DI-1`, `AND-DI-2`, `AND-DI-3`, `AND-DI-4`.

### Networking & API work
Use the repo's networking/auth layer and shared client; follow approved DD contracts exactly; do not invent paths/fields/enums/response shapes; use existing DTO/mapper conventions and keep transport separate from domain/UI; handle HTTP/parsing/auth/timeout/cancellation/retry/offline consistently; never log tokens/IDs/PII/bodies/photos/sensitive responses; no ad-hoc client instances; update targeted caches/streams, not global refreshes. **If the task depends on an unconfirmed backend contract, stop.** → `AND-NET-CLIENT-*`, `AND-NET-CONTRACT-*`, `AND-NET-DTO-*`, `AND-NET-AUTH-*`, `AND-NET-ERR-*`, `SEC-AUTH-*`, `SEC-LOG-1`.

### Persistence
Follow the existing Room/DataStore/SharedPreferences/file/cache pattern; migrate on schema changes; never silently clear user data to dodge a migration; keep DB/disk ops off the main thread; preserve encryption/secure-storage; define cache invalidation and source of truth; clean temp files holding sensitive data. → `AND-DATA-STORE-*`, `AND-DATA-MIGRATE-*`, `AND-DATA-THREAD-1`, `AND-DATA-CACHE-1`, `AND-DATA-SEC-*`, `SEC-STORAGE-*`.

### Navigation
Use the detected mechanism; reuse existing destinations/routes/argument models/helpers; no navigation from domain/data layers; validate route/deep-link inputs; preserve back-stack behavior; do not add a route when the DD specifies an existing screen; keep navigation side effects lifecycle-safe. → `AND-NAV-DEST-*`, `AND-NAV-ARGS-*`, `AND-NAV-STACK-*`, `AND-NAV-LAYER-1`, `SEC-DEEPLINK-*`.

### Jetpack Compose (when the surface uses Compose)
Use existing design-system components/theme tokens; stateless composables where appropriate; hoist state per repo patterns; no business logic in composables; stable keys in lazy lists; prevent unnecessary recomposition; intentional `remember`/`rememberSaveable`/derived state/effect APIs with correct keys; preserve accessibility semantics, focus order, content descriptions, touch targets; previews only if the project uses them. **Do not introduce Compose into an XML-only feature without DD approval.** → `AND-UI-COMPOSE-*`, `A11Y-*`.

### XML, Views, Fragments & Activities (when the surface uses Views)
Follow ViewBinding/DataBinding conventions; respect the Fragment view lifecycle and clear binding refs; avoid retaining Views/Activities/Fragments; keep listeners/observers lifecycle-safe; reuse styles/themes/dimensions/drawables/design-system components; avoid deep hierarchies/overdraw; preserve state across config change. **Do not migrate a View screen to Compose unless the DD approves it.** → `AND-UI-XML-*`.

### RecyclerView & lists
Reuse existing adapters/item models; use `DiffUtil`/`ListAdapter` if consistent; stable IDs only when valid; avoid full-list refreshes without reason; handle empty/loading/error/pagination; prevent recycled-view state leakage; validate accessibility/focus. → `AND-UI-LIST-*`, `AND-PERF-LIST-*`, `A11Y-*`.

### Resources, localization & RTL
No hardcoded user-visible strings; use existing resource/localization systems; maintain translation-key parity; support RTL layout and mirrored navigation/icon behavior; semantic resource names; reuse dimensions/styles/colors/typography tokens; no duplicated equivalent resources; no hardcoded PII/placeholder personal data. → `AND-UI-RES-*`, `I18N-COPY-*`, `I18N-RTL-*`.

### Accessibility
Apply the shared requirements (`standards/shared/accessibility.md`) through the Android rules that implement them (`AND-UI-A11Y-1`..`AND-UI-A11Y-10` in `standards/android/compose-xml-standards.md`). The shared standard states **what** is required; the Android standard states **how**.

Beyond labels and targets, cover the behaviour that automated checks cannot see: traversal order (`isTraversalGroup` / `traversalIndex`), focus placement on screen entry and restoration after a dialog dismisses, hiding content that is present but not perceivable (`clearAndSetSemantics`, `no-hide-descendants`), collection position (`collectionInfo` / `collectionItemInfo`), resetting semantics on recycled rows, live-region politeness, and suspending timer-driven advancement while touch exploration is active.

**Verification reach.** `standards/shared/verification.md` owns the tier vocabulary — do not restate it. Mechanical checks the repository already provides (lint, Compose UI tests, an accessibility scan if one is wired) are Tier 1 and gate the task. A TalkBack walkthrough, whether a label is meaningful, and whether an announcement is actually heard are Tier 3: record them as `verificationDebt`, never as passed checks. Do not assume any particular automation framework; if the repository has no mechanical accessibility check, record the requirement as debt rather than inventing a tool.

### Performance & memory
Avoid main-thread I/O and expensive work; avoid Activity/Fragment/View/Context/callback/observer/coroutine leaks; avoid unnecessary allocations and recompositions; use the repo's image loading/caching; size/compress images; clean temp files; avoid polling where reactive updates exist; consider cold-start/render/list/network/battery/storage impact. → `AND-PERF-THREAD-*`, `AND-PERF-LIST-*`, `AND-PERF-IMAGE-*`, `AND-PERF-MEM-*`, `AND-PERF-SIZE-*`.

### Security & privacy
Do not log secrets/tokens/IDs/photos/certificate data/PII; use approved secure storage; validate external input; handle exported components/intents/files/deep links safely; use `FileProvider`/content URIs over unsafe file URIs; least-privilege permissions requested at point of need; do not weaken TLS/cert validation/WebView security/cleartext policy; clean shared/downloaded sensitive temp files per the DD. → `SEC-SECRETS-*`, `SEC-STORAGE-*`, `SEC-NET-*`, `SEC-DEEPLINK-*`, `SEC-WEBVIEW-*`, `SEC-PERMS-*`, `SEC-LOG-*`.

### Error handling
Implement the exact loading/empty/partial/error/retry/blocked states the DD defines; never silently swallow errors; do not expose raw backend errors to users; preserve diagnostics without leaking sensitive data; follow existing retry/token-expiry behavior; ensure a failed write does not leave inconsistent state. → `AND-NET-ERR-*`, `AND-VM-STATE-2`, `AND-LOG-HYGIENE-3`.

### Analytics & logging
Reuse existing analytics conventions; add only the events the DD requires; avoid duplicate events from recomposition/lifecycle re-entry; no PII in analytics; keep debug logging removable and gated. → `AND-LOG-ANALYTICS-*`, `AND-LOG-HYGIENE-*`, `AND-LOG-PII-*`, `SEC-LOG-*`.

## Validation tooling

The shared skill owns the validation *rules* — never claim an unrun command passed,
state exactly what could not be validated, validate every acceptance criterion
individually. These are the Android candidates those rules apply to, selected by what the
task actually touched:

Select checks based on the actual repo and affected modules. Candidates: Gradle sync/configuration; compile affected Kotlin; assemble the relevant variant; unit tests; ViewModel/use-case/repository tests; instrumentation tests; Compose UI tests; Android Lint; detekt; ktlint; formatting; dependency/module-boundary checks; screenshot/visual checks where supported; manual acceptance-criteria validation.

## Android review points

Added to the shared self-review list: nullability · lifecycle safety · coroutine and threading safety · state consistency · memory leaks · migration and rollback impact.

## Standards citation

Record which standard IDs were **applied** (not merely reviewed) — this is the trace `android-code-reviewer`, `android-performance-reviewer`, and QA handoff rely on.

| Area | Standard file | IDs |
|---|---|---|
| Kotlin language & safety | `standards/android/kotlin-standards.md` | `AND-KT-*` |
| Architecture, ViewModel, DI | `standards/android/android-architecture.md` | `AND-ARCH-*`, `AND-VM-*`, `AND-DI-*` |
| Compose / XML / lists / resources | `standards/android/compose-xml-standards.md` | `AND-UI-*` |
| Performance & memory | `standards/android/android-performance.md` | `AND-PERF-*` |
| Gradle / build / signing | `standards/android/gradle-build-signing.md` | `AND-REL-*` |
| Networking & API | `standards/android/android-networking.md` | `AND-NET-*` |
| Navigation | `standards/android/android-navigation.md` | `AND-NAV-*` |
| Persistence | `standards/android/android-persistence.md` | `AND-DATA-*` |
| Testing | `standards/android/android-testing.md` | `AND-TEST-*` |
| Logging & analytics | `standards/android/android-logging-analytics.md` | `AND-LOG-*` |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-*` |
| Localization & RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-*` |
| Security & privacy (shared) | `standards/shared/mobile-security.md` | `SEC-*` |

Do not use React Native's generically-named `ARCH-*`/`API-*`/`STATE-*`/`NAV-*` IDs for Android — those are RN-specific. Android architecture/state/navigation cite the `AND-*` roots above.

## Red flags — STOP and report instead of proceeding

These are the Android-specific conditions. The platform-independent stop conditions belong
to `skills/platform-implementation/SKILL.md` and are not repeated here.

- A cited `standards/android/*` file is missing or is a structure-only placeholder (see [Standards readiness](#standards-readiness)).
- The repository's UI toolkit, DI framework, or async model cannot be determined, and the task must integrate with it.
- Two competing mechanisms are in active use for a layer this task touches, with no discernible primary.
- A standard assumes a library the repository does not use, and following it would mean migrating the repository.

## Relationship with command, agent, hooks

Responsibilities stay separated:

- **`commands/implement-task.md`** — task-id resolution, repository-root resolution, document-path resolution, approval/dependency/blocker gates, platform routing, the context handoff, lifecycle state, and verification of the completion report.
- **`skills/platform-implementation/SKILL.md`** — the platform-independent implementation methodology.
- **`agents/android-feature-developer.md`** — the Android specialist and executor that runs both.
- **This skill** — the Android implementation methodology itself, and nothing a platform-independent layer could state.
- **Hooks** — `require-approval-before-code`, `block-main-branch-changes`, and `protect-secrets`.

This skill does not move command logic into itself, does not depend on undocumented
ambient-CWD assumptions, and does not invent paths to the feature documents.
