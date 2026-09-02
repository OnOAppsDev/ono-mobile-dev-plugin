# Android Testing Standards

## Purpose & Scope

These standards govern automated tests for native Android app code — unit tests, ViewModel/use-case/repository tests, instrumentation tests, and Compose UI tests. They are applied by `android-feature-developer` when a task adds or changes testable code, and referenced by `android-code-reviewer` and `mobile-testing-and-qa-handoff`. Each bullet carries a stable `AND-TEST-*` ID. This is a baseline, not exhaustive — follow the repository's detected test setup (JUnit4/5, Turbine, MockK/Mockito, Robolectric, Espresso, Compose test) rather than imposing a different framework.

## Unit Tests

- `AND-TEST-UNIT-1` New or changed business/domain logic (use-cases, mappers, validators, pure functions) has unit tests covering the behavior the task's acceptance criteria describe, including the failure/edge paths in the DD.
- `AND-TEST-UNIT-2` Tests use the repo's existing test framework, assertion library, and mocking library rather than introducing a parallel one.
- `AND-TEST-UNIT-3` Tests are deterministic — no reliance on wall-clock time, real network, real device state, or ordering between tests; time and dispatchers are injected/controlled.

## ViewModel, Repository & Coroutine Tests

- `AND-TEST-VM-1` ViewModel/repository tests inject a test dispatcher (`StandardTestDispatcher`/`UnconfinedTestDispatcher` via the repo's convention) rather than depending on real dispatchers, so coroutine behavior is controlled.
- `AND-TEST-VM-2` Emitted UI-state/flow sequences are asserted with the repo's tool (Turbine or an equivalent flow-test helper), covering loading → success and loading → error transitions where the feature has them.
- `AND-TEST-VM-3` One-shot events (`AND-VM-EVENT-1`) are asserted to fire once, not re-delivered.

## Instrumentation & UI Tests

- `AND-TEST-INSTR-1` Instrumentation/UI tests are added where the repo already tests that surface and the task's acceptance criteria are UI-observable; they are not required where the repo has no UI-test harness (state that gap instead of inventing one).
- `AND-TEST-INSTR-2` Where an instrumentation harness exists, backgrounding a TV playback screen is asserted to stop playback, release the player, and clear the keep-screen-on flag.
- `AND-TEST-COMPOSE-1` Compose UI tests use `createComposeRule`/`createAndroidComposeRule` and select nodes by semantics (text, content description, test tag) rather than by brittle tree position.
- `AND-TEST-COMPOSE-2` UI tests assert accessibility-relevant semantics (roles, state, labels) where the acceptance criteria include them, reinforcing `A11Y-*`.

## References

- Android testing guidance, `kotlinx-coroutines-test`, Turbine, Espresso, and Compose testing documentation.
- Migration tests tie to `standards/android/android-persistence.md` (`AND-DATA-MIGRATE-3`); accessibility assertions tie to `standards/shared/accessibility.md`.
- Performance numbers must not be taken from an emulator: Macrobenchmark treats an emulator run as an error to be suppressed "with extreme caution", so a green CI benchmark on emulated hardware is not evidence of device performance. This is why there is no `AND-TEST-TV-*` family — Android publishes no TV testing guidance to ground one, and its TV memory budget is documented as an Android Studio profiler activity with no assertion API or CI mechanism, so `AND-TEST-INSTR-2` covers the one TV behaviour an ordinary instrumentation harness can assert.
- This document is a living baseline; flag standards gaps found during implementation or review rather than working around them silently.
