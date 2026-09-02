# Android Navigation Standards

## Purpose & Scope

These standards govern navigation in native Android app code — destinations/routes, argument passing, deep links, and back-stack behavior. They are used by `android-architect` when proposing navigation changes, implemented by `android-feature-developer`, and reviewed by `android-code-reviewer`. Each bullet carries a stable `AND-NAV-*` ID. This is a baseline, not exhaustive — follow the repository's detected navigation mechanism (Jetpack Navigation Component, Compose Navigation, a custom router, or manual `FragmentTransaction`/`Intent` navigation) rather than imposing one.

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

## Android TV Context (device_type: tv)

**[Applies only on an established TV surface — `device_type: tv` arrives confirmed and is never re-detected here. Where no TV surface is established this section is entirely N/A and none of its rules may be raised. Every rule below is additive: the base `AND-NAV-*` rules apply on a TV surface unchanged, and nothing here relaxes or forks one.]**

Focusability itself and a visible focus highlight are already owned by `A11Y-TOUCH-1` and `A11Y-TOUCH-2` in `standards/shared/accessibility.md`; the rules below add distinct obligations and do not restate them. This organization's TV surface uses a custom in-house framework, so every rule states a behavior, never an API or library.

- `AND-NAV-TV-BACK-1` Back moves exactly one destination backward, is never bound to close something it also opens, is never gated behind a confirmation, and consecutively reaches the TV home screen.
- `AND-NAV-TV-BACK-2` A back navigation names where focus lands on the restored destination — the invoking element or the active navigation item — rather than letting that screen re-resolve focus positionally.
- `AND-NAV-TV-BACK-3` A TV screen adds no on-screen back or up control duplicating the remote's Back key; dialogs offering only confirm, destructive, or purchase actions should also offer Cancel.
- `AND-NAV-TV-DPAD-1` Every control is reachable and actionable using only up, down, left, right, select, Back and Home; no action depends on a pointer, gesture, or Menu, Search or Start key.
- `AND-NAV-TV-DPAD-2` Directional, select and back input is handled by intent, not a single keycode: select accepts D-pad centre, Enter and gamepad equivalents, because controllers send different codes.
- `AND-NAV-TV-DPAD-3` A component that consumes directional keys, such as a text field or media surface, still leaves a D-pad path out of itself and reports unowned directions as unhandled.
- `AND-NAV-TV-DPAD-4` Explicit focus order is added only where the positional default is demonstrably wrong, and each override has a matching return path so no direction leaves a dead end.
- `AND-NAV-TV-FOCUS-1` The app has one fixed start destination that Back returns to before exit, and every destination declares its own initial focus target rather than inheriting the previous screen's.
- `AND-NAV-TV-AXIS-1` Each axis carries one consistent meaning across the app — categories on one, items within a category on the other — and no control sits beyond a straight D-pad path.

## References

- Jetpack Navigation Component and Compose Navigation documentation (developer.android.com).
- Deep-link validation security rules are owned by `standards/shared/mobile-security.md` (`SEC-DEEPLINK-*`); one-shot navigation events tie to `standards/android/android-architecture.md` (`AND-VM-EVENT-1`).
- This document is a living baseline; flag standards gaps found during implementation or review rather than working around them silently.
