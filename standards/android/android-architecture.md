# Android Architecture

## Purpose & Scope

These principles govern how native Android app code is layered, organized into Gradle modules, wired with dependency injection, and structured around ViewModels and UI state. They are used by `android-architect` when proposing a technical approach (`/analyze-feature`, `/dev-design-start`), by `android-feature-developer` during implementation, and by `android-code-reviewer` in `/review-code`. Each bullet carries a stable ID (`AND-ARCH-*`, `AND-VM-*`, `AND-DI-*`) so design proposals, implementation summaries, and review findings can cite the exact rule. This is a baseline, not exhaustive — the repository's already-detected architecture (as reported by `repo-analyst`) takes precedence, and these rules describe how to stay consistent with it rather than a pattern to impose.

## Layering & Dependency Direction

- `AND-ARCH-LAYERS-1` Code follows the layering the repository already uses (e.g. UI → domain/use-case → data/repository, or the project's detected MVVM/MVI/Clean/layered variant); a new architectural pattern is not introduced for a single task.
- `AND-ARCH-LAYERS-2` UI classes (Activity, Fragment, View, Composable) do not directly perform networking, persistence, or transport calls when the repo routes those through repositories/use-cases — they depend on the layer below, not on the data source.
- `AND-ARCH-LAYERS-3` Domain/business logic is not buried inside Activities, Fragments, Views, or Composables; it lives where it is testable without an Android UI (use-case, domain service, or the repository's equivalent).
- `AND-ARCH-DEPS-1` Dependencies point inward/downward only, matching the repo's convention (UI depends on domain, domain on data — never the reverse); the data layer knows nothing about which screen calls it.
- `AND-ARCH-DEPS-2` No circular dependencies between classes or modules are introduced.

## Gradle Module Boundaries

- `AND-ARCH-MODULE-1` In a multi-module project, code is placed in the module the DD specifies / the existing convention dictates (feature module, `:core`/`:data`/`:domain`, app module) rather than defaulting everything into `:app`.
- `AND-ARCH-MODULE-2` Cross-module access goes through each module's intended public surface; `internal` declarations are not leaked, and a feature module does not reach into another feature module's internals.
- `AND-ARCH-MODULE-3` A new module, or a new dependency edge between existing modules, is not added for one task without DD approval — module topology is an architectural decision, not an implementation detail.
- `AND-ARCH-MODULE-4` In a single-module project, package boundaries are respected as the equivalent of module boundaries; feature code is not scattered across unrelated packages.

## ViewModel & UI State

- `AND-VM-STATE-1` Screen state follows the repository's detected ViewModel/state convention (e.g. a single immutable UI-state data class exposed as `StateFlow`, or the project's established `LiveData`/MVI pattern) rather than a newly invented one.
- `AND-VM-STATE-2` Loading, success, empty, and error are represented explicitly in the UI-state model (distinct fields or sealed states), not inferred from ambiguous combinations like "data is null and no error".
- `AND-VM-STATE-3` There is a single source of truth for a piece of state; the same value is not stored in both the ViewModel and a separate holder that can drift out of sync.
- `AND-VM-STATE-4` UI state is immutable where that is the existing convention — the ViewModel emits a new state object rather than mutating one the UI already holds.
- `AND-VM-EVENT-1` One-time effects (navigation, toasts, snackbars, dialogs) use the repository's established one-shot event pattern (e.g. `Channel`/`SharedFlow` consumed once) so they are not re-delivered on configuration change or re-subscription.
- `AND-VM-LIFECYCLE-1` ViewModels do not hold references to `Activity`, `Fragment`, `View`, or `Context` (other than `Application`/`AndroidViewModel` where the repo uses it) — passing UI objects into a ViewModel leaks them across configuration changes.
- `AND-VM-LIFECYCLE-2` State survives process death and configuration change per the feature's needs — `SavedStateHandle` (or the repo's equivalent) is used for state that must be restored, and transient in-memory state is not silently lost where the DD requires it to persist.
- `AND-VM-LIFECYCLE-3` UI-state flows are collected lifecycle-aware (`repeatOnLifecycle`/`flowWithLifecycle` or `collectAsStateWithLifecycle`), not with a raw unscoped collector that keeps running while the UI is stopped.

## Dependency Injection

- `AND-DI-1` The repository's detected DI framework (Hilt, Dagger, Koin, or manual DI) is used; a manual service locator is not introduced into a project that uses a DI framework, and vice-versa.
- `AND-DI-2` Bindings/modules are declared in the correct component/module and scope the repo already uses; dependencies are not over-scoped (e.g. made a singleton when request/screen scope is correct) or under-scoped.
- `AND-DI-3` A narrower dependency is injected in preference to a broad one — inject the specific collaborator or a scoped resource rather than `Context` where `Context` is not actually required.
- `AND-DI-4` Constructor injection is preferred over field/property injection where the framework and existing code allow it, keeping dependencies explicit and the type testable.

## Android TV Context (device_type: tv)

**[Applies only on an established TV surface — `device_type: tv` arrives confirmed and is never
re-detected here. Where no TV surface is established this section is entirely N/A and none of its rules
may be raised. Every rule below is additive: the base `AND-ARCH-*` rules apply on a TV surface unchanged,
and nothing here relaxes or forks one.]**

- `AND-ARCH-TV-1` TV screens extend the framework's existing base screen type so the stop-path contract — end playback, release buffers and decoders, clear the screen-on flag — is implemented once, not per screen.
- `AND-ARCH-TV-2` Every resource a screen acquires is released on the matching lifecycle event: acquire after start pairs with release after stop, resume with pause; an asymmetric pair is a defect. **Playback resources are `AND-PERF-TV-4`'s, not this rule's** — file the pairing defect here, the unreleased player there, never both.
- `AND-ARCH-TV-3` TV-specific behaviour is selected by a runtime capability check (the TV system feature, `isLowRamDevice()`) inside the existing module structure, not by forking a parallel TV codebase (ties to `AND-ARCH-MODULE-3`).
- `AND-ARCH-TV-4` By repository convention rather than platform mandate, every proposed TV change is labelled existing implementation, required feature work, or optional modernization, and the three are never combined.
- `AND-ARCH-TV-5` Replacing a deprecated TV UI toolkit is optional modernization, never required feature work — deprecated and current toolkits coexist, so any migration is proposed as its own DD.
- `AND-ARCH-TV-6` By repository convention rather than platform mandate, playback, focus handling and navigation stay on the existing in-house TV framework; a task adds no second player abstraction without DD approval.

## References

- Guide to Android app architecture (developer.android.com) and the Android Hilt/Dagger guidance.
- This document is a living baseline; where a repo's existing structure predates these principles, `repo-analyst`'s detected conventions take precedence for that repo until a migration is planned.
- Kotlin language rules for coroutines/Flow live in `standards/android/kotlin-standards.md`; UI-framework specifics live in `standards/android/compose-xml-standards.md`.
- Two TV rules — `AND-ARCH-TV-4` and `AND-ARCH-TV-6` — have **no official Android source** and are recorded as this repository's conventions, not platform requirements; cite them as house rules and never present them as Android mandates. The three-way separation carries a corollary: code that already works is not rewritten to satisfy a required outcome, and a modernization suggestion stays a suggestion. This document names no TV UI framework as required; the organisation's Android TV surface uses a custom in-house framework, so a rule that assumed Leanback, `androidx.tv` or Compose for TV would be unusable here.
