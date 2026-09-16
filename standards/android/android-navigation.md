# Android Navigation Standards

## Purpose & Scope

These standards govern navigation in native Android app code — destinations/routes, argument passing, deep links, and back-stack behavior. They are used by `feature-architect` when proposing navigation changes, implemented by `feature-implementer`, and reviewed by `code-reviewer`. Each bullet carries a stable `AND-NAV-*` ID. This is a baseline, not exhaustive — follow the repository's detected navigation mechanism (Jetpack Navigation Component, Compose Navigation, a custom router, or manual `FragmentTransaction`/`Intent` navigation) rather than imposing one.

## Destinations & Routes

- `AND-NAV-DEST-1` Navigation uses the repo's detected mechanism; a second navigation system is not introduced alongside the existing one for a single task.
- `AND-NAV-DEST-2` Existing destinations, routes, graphs, and navigation helpers are reused; a new destination is not added when the DD specifies navigating to an existing screen.
- `AND-NAV-DEST-3` Route/destination definitions and argument keys live in the repo's established place (nav graph, a routes/screen sealed type, or navigation helper) rather than as scattered string literals.

## Arguments & Deep Links

- `AND-NAV-ARGS-1` Arguments are passed via the mechanism's typed argument facility (Safe Args, typed route params, a parcelable argument model) rather than by mutating shared global state to smuggle data between screens.
- `AND-NAV-ARGS-2` Deep-link and route arguments are validated before use — a value taken from a deep link is not trusted for navigation target, auth, or state changes without independent validation (ties to `SEC-DEEPLINK-1/2`).
- `AND-NAV-ARGS-3` Only serializable/parcelable, appropriately-sized data is passed as arguments; large objects or non-parcelable references are passed by id/handle and re-resolved, not shoved through the back stack.

## Back Stack & Lifecycle

- `AND-NAV-STACK-1` Back-stack behavior specified by the DD (which screen is popped to, whether a destination is single-top, what the up/back button does) is implemented as specified, not left to default behavior that contradicts it.
- `AND-NAV-STACK-2` Navigation actions are triggered from a lifecycle-safe point (in response to a UI event or a one-shot event per `AND-VM-EVENT-1`), guarding against double-navigation from rapid taps or re-emitted state.
- `AND-NAV-LAYER-1` Navigation is initiated from the UI layer, not from the domain or data layer — repositories/use-cases return results; they do not call the navigator.

## References

- Jetpack Navigation Component and Compose Navigation documentation (developer.android.com).
- Deep-link validation security rules are owned by `standards/shared/mobile-security.md` (`SEC-DEEPLINK-*`); one-shot navigation events tie to `standards/android/android-architecture.md` (`AND-VM-EVENT-1`).
- This document is a living baseline; flag standards gaps found during implementation or review rather than working around them silently.
