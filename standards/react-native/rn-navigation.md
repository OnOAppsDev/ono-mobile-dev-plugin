# Navigation Standards

## Purpose & Scope

These standards are library-agnostic — the org does not mandate React Navigation, Expo Router, or any specific navigation library. Detecting which library a given repo actually uses is the `repo-analyst` agent's job, not this standard's; whatever library is in use, the rules below still apply. Each bullet below carries a stable ID so review findings can cite the exact rule they violate. This list is a baseline, not exhaustive — reviewers should use judgment for app-specific risk.

## Library Awareness: React Navigation & Expo Router

The two libraries the org's repos most commonly use are React Navigation (screen-config based, e.g. `createNativeStackNavigator<ParamList>()`) and Expo Router (file-based routing under `app/`). Confirm via `repo-analyst`'s detection which one — or which other library — a given repo actually uses, then apply every rule below in the terms of that library rather than assuming React Navigation's shape:

- **Typed routes & params (`NAV-TYPED-*`).** React Navigation typically centralizes types in a `ParamList` passed to the navigator generic. Expo Router typically derives route typing from the file structure under `app/` (its typed-routes output, or a colocated types file per route) and reads params via `useLocalSearchParams`/`useGlobalSearchParams`. `NAV-TYPED-4`'s "single source-of-truth types file per feature" is satisfied by whichever mechanism the library provides — a `navigation.types.ts` for React Navigation, or the equivalent generated/colocated typing for Expo Router — not only the former.
- **Deep link structure (`NAV-DEEPLINK-*`).** React Navigation needs an explicit linking config mapping URLs to routes. In Expo Router, the `app/` directory itself is the source-of-truth route table — a file's path *is* its URL structure — so `NAV-DEEPLINK-1` is satisfied by that file layout directly; do not ask an Expo Router repo to also maintain a separate manual route table.
- **Navigation API usage (`NAV-SERVICE-*`).** Calling the library's own API directly is fine for either library — Expo Router's `useRouter()`/`router.push()`/`<Link>` is idiomatic and does not need wrapping, and the same goes for React Navigation's `useNavigation()`. A custom abstraction is only expected where a repo has already chosen to build one; the finding to watch for is inconsistency (some call sites going through an abstraction, equivalent ones bypassing it directly), not the presence of direct library calls themselves.
- **Platform back behavior (`NAV-BACK-1`)** applies identically regardless of library, since it concerns the native `BackHandler` API rather than the navigation library's routing model.



## Typed Routes & Params

- `NAV-TYPED-1` [CRITICAL] Every route's param list is typed (e.g. a shared `RootStackParamList`/route-params type); no `any` or untyped param objects.
- `NAV-TYPED-2` [CRITICAL] Screens only read params declared in that route's type, not undeclared or optional-by-convention fields on `route.params`.
- `NAV-TYPED-3` [CRITICAL] Navigation calls (`navigate`, `push`, `replace`, etc.) are type-checked against the route's param type, not passed as loose objects.
- `NAV-TYPED-4` [CRITICAL] A feature's route param types are all exported from a single `navigation.types.ts` file within that feature's folder — not scattered across individual screen files or redeclared inline at each call site. Other modules import a feature's route param types only from that file.
- `NAV-TYPED-5` [WARNING] Route params carry only serializable data — primitives, plain objects/arrays, ids — not functions, class instances, or non-plain objects (a `Date`, a `Map`, a store/context instance). Data a destination screen needs that isn't serializable is looked up from the store/service layer by an id/key passed as the param, not smuggled through `route.params` directly.

## Deep Link Structure

- `NAV-DEEPLINK-1` [CRITICAL] Deep links map to a documented, versioned URL structure (e.g. a single source-of-truth route table), not ad hoc strings scattered across the codebase.
- `NAV-DEEPLINK-2` [CRITICAL] Any new deep link target is added with a corresponding entry in `standards/shared/mobile-security.md`'s `SEC-DEEPLINK-*` validation rules.
- `NAV-DEEPLINK-3` [CRITICAL] Deep link URL structure changes are backward-compatible or versioned.

## Navigation API Usage

- `NAV-SERVICE-1` [WARNING] Screens and components may call the navigation library's own API directly — Expo Router's `useRouter()`/`router.push()`/`<Link>`, React Navigation's `useNavigation()`, etc. A custom navigation service/hook (`useAppNavigation()`, `navigationService`) is optional, not required. What matters is consistency: pick one approach (direct library calls, or a wrapping abstraction) for a given kind of navigation action and use it everywhere that action occurs, rather than mixing both for the same purpose across the codebase.
- `NAV-SERVICE-2` [WARNING] Navigation actions triggered from outside React components (e.g. from an API error interceptor, a push notification handler) use the library's supported mechanism for this (React Navigation's `navigationRef`, Expo Router's `router` singleton) consistently — the same mechanism every time this need arises, not a separate ad hoc workaround per call site.
- `NAV-SERVICE-3` [WARNING] Where a repo has deliberately adopted a navigation abstraction module, it stays the single place other modules go through for the actions it covers — components importing the underlying navigation library directly for those same actions, alongside the abstraction, is the actual finding (inconsistency), not the direct import by itself.

## Platform Back Behavior

- `NAV-BACK-1` [WARNING] On Android, a screen that needs custom behavior on the hardware/gesture back action (confirm-before-exit, closing a nested UI state before navigating back) handles it through a listener scoped to the screen being focused (e.g. registered in a focus effect and removed on blur), not a raw `BackHandler` listener left registered outside the screen's focused lifetime, which fires for screens it no longer applies to.

## References

- This document is a living baseline; reviewers should flag standards gaps found during review rather than working around them silently.
- See `standards/shared/mobile-security.md` (`SEC-DEEPLINK-*`) for the security-specific deep link validation rules that pair with `NAV-DEEPLINK-*` above.
- See the "AI Agent Execution Directives" section in `standards/react-native/react-native-coding-standards.md` for the severity hierarchy, citation format, and anti-hallucination thresholds that govern how findings against the IDs above are reported.
