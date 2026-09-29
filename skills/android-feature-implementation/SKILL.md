---
name: android-feature-implementation
description: Android-specific implementation methodology — the repository dimensions to inspect, the per-area coding guidance, the validation tooling, and the AND-* standards-citation map. Used by /implement-task via the feature-implementer agent, alongside the shared platform-implementation skill, which owns the lifecycle mechanics.
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

Apply each area's authored rules to the surfaces the task actually touches; an area the
task does not touch is not applicable. The rules themselves live in the standards below —
read them there rather than from a summary, which is how the severity markers and exact
formats survive.

| Area | Rules |
|---|---|
| Kotlin & language safety | `AND-KT-NULL-*`, `AND-KT-TYPE-*`, `AND-KT-SEALED-*`, `AND-KT-LINT-*` |
| Architecture & dependency direction | `AND-ARCH-LAYERS-*`, `AND-ARCH-DEPS-*`, `AND-ARCH-MODULE-*` |
| ViewModel & state handling | `AND-VM-STATE-*`, `AND-VM-EVENT-1`, `AND-VM-LIFECYCLE-*` |
| Coroutines, Flow, LiveData & threading | `AND-KT-COROUTINE-*`, `AND-VM-LIFECYCLE-3`, `AND-PERF-THREAD-1` |
| Dependency injection | `AND-DI-1`, `AND-DI-2`, `AND-DI-3`, `AND-DI-4` |
| Networking & API work | `AND-NET-CLIENT-*`, `AND-NET-CONTRACT-*`, `AND-NET-DTO-*`, `AND-NET-AUTH-*`, `AND-NET-ERR-*`, `SEC-AUTH-*`, `SEC-LOG-1` |
| Persistence | `AND-DATA-STORE-*`, `AND-DATA-MIGRATE-*`, `AND-DATA-THREAD-1`, `AND-DATA-CACHE-1`, `AND-DATA-SEC-*`, `SEC-STORAGE-*` |
| Navigation | `AND-NAV-DEST-*`, `AND-NAV-ARGS-*`, `AND-NAV-STACK-*`, `AND-NAV-LAYER-1`, `SEC-DEEPLINK-*` |
| Jetpack Compose (when the surface uses Compose) | `AND-UI-COMPOSE-*` |
| XML, Views, Fragments & Activities (when the surface uses Views) | `AND-UI-XML-*` |
| RecyclerView & lists | `AND-UI-LIST-*`, `AND-PERF-LIST-*` |
| Resources, localization & RTL | `AND-UI-RES-*`, `I18N-COPY-*`, `I18N-RTL-*` |
| Accessibility | `AND-UI-A11Y-1`, `AND-UI-A11Y-10` |
| Performance & memory | `AND-PERF-THREAD-*`, `AND-PERF-LIST-*`, `AND-PERF-IMAGE-*`, `AND-PERF-MEM-*`, `AND-PERF-SIZE-*` |
| Security & privacy | `SEC-SECRETS-*`, `SEC-STORAGE-*`, `SEC-NET-*`, `SEC-DEEPLINK-*`, `SEC-WEBVIEW-*`, `SEC-PERMS-*`, `SEC-LOG-*` |
| Error handling | `AND-NET-ERR-*`, `AND-VM-STATE-2`, `AND-LOG-HYGIENE-3` |
| Analytics & logging | `AND-LOG-ANALYTICS-*`, `AND-LOG-HYGIENE-*`, `AND-LOG-PII-*`, `SEC-LOG-*` |

**Verification reach.** `standards/shared/verification.md` owns the tier vocabulary — do not restate it. Mechanical checks the repository already provides (lint, Compose UI tests, an accessibility scan if one is wired) are Tier 1 and gate the task. A TalkBack walkthrough, whether a label is meaningful, and whether an announcement is actually heard are Tier 3: record them as `verificationDebt`, never as passed checks. Do not assume any particular automation framework; if the repository has no mechanical accessibility check, record the requirement as debt rather than inventing a tool.
## `device_type: tv`

`device_type` is inherited context from the approved planning artifacts — never re-detect it and never default it. TV is a context inside the Android platform, not a separate platform: the same lane, rules and validation apply. On `tv`:

- **Implement within the repository's own TV model**, which the planning artifacts carry from Project Knowledge or the planning lane's TV discovery. Never introduce a second focus model, TV component set or player, and never migrate to a different TV framework as a side effect.
- **Meet the shared TV baseline** (`standards/shared/tv-baseline.md`, `TVB-*`) through that model — focus visible and never lost, directional order that follows the layout, focus contained in overlays and restored on return, no touch-only interaction, deterministic Back, one playback owner with complete teardown, state captured before suspension, large resources released on navigation — and cite the `TVB-*` rules applied.
- **Never silently apply touch or mobile assumptions** — touch targets, tap/swipe gestures and soft-keyboard flows do not transfer to a D-pad/remote model. The shared accessibility rules apply through their TV clauses.
- **No Android TV `AND-*` rule is authored yet** (`ANDROID-003`) — cite none.
- **Verification reach.** Focus traversal, D-pad input and screen-reader behaviour are largely not provable headlessly: state what was verified at which tier and record the rest as verification debt, per `standards/shared/verification.md`.

## Validation tooling

The shared skill owns the validation *rules* — never claim an unrun command passed,
state exactly what could not be validated, validate every acceptance criterion
individually. These are the Android candidates those rules apply to, selected by what the
task actually touched:

Select checks based on the actual repo and affected modules. Candidates: Gradle sync/configuration; compile affected Kotlin; assemble the relevant variant; unit tests; ViewModel/use-case/repository tests; instrumentation tests; Compose UI tests; Android Lint; detekt; ktlint; formatting; dependency/module-boundary checks; screenshot/visual checks where supported; manual acceptance-criteria validation.

## Android review points

Added to the shared self-review list: nullability · lifecycle safety · coroutine and threading safety · state consistency · memory leaks · migration and rollback impact.

## Standards citation

The shared skill owns the reuse rule itself. **In Android it is applied by searching for an
existing implementation before creating any** new abstraction, helper, use-case, repository,
UI component, navigation pattern, state container or networking primitive, and reusing or
extending what is there → `AND-ARCH-*`, `AND-UI-*`, `AND-NET-CLIENT-1`, `AND-NAV-DEST-2`.

Record which standard IDs were **applied** (not merely reviewed) — this is the trace `code-reviewer`, `performance-reviewer`, and QA handoff rely on.

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

`skills/platform-implementation/SKILL.md` names every owner in this chain; that table is
not repeated here. This skill adds the Android methodology, the `AND-*` citation map and
the Android stop conditions, and `agents/feature-implementer.md` executes both.
