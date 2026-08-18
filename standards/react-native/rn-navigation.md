# Navigation Standards

## Purpose & Scope

These standards are library-agnostic — the org does not mandate React Navigation, Expo Router, or any specific navigation library. Detecting which library a given repo actually uses is the `repo-analyst` agent's job, not this standard's; whatever library is in use, the rules below still apply. Each bullet below carries a stable ID so review findings can cite the exact rule they violate. This list is a baseline, not exhaustive — reviewers should use judgment for app-specific risk.

## Typed Routes & Params

- `NAV-TYPED-1` Every route's param list is typed (e.g. a shared `RootStackParamList`/route-params type); no `any` or untyped param objects.
- `NAV-TYPED-2` Screens only read params declared in that route's type — no reaching into `route.params` for undeclared or optional-by-convention fields.
- `NAV-TYPED-3` Navigation calls (`navigate`, `push`, `replace`, etc.) are type-checked against the route's param type, not passed as loose objects.

## Deep Link Structure

- `NAV-DEEPLINK-1` Deep links map to a documented, versioned URL structure (e.g. a single source-of-truth route table), not ad hoc strings scattered across the codebase.
- `NAV-DEEPLINK-2` Any new deep link target is added with a corresponding entry in `standards/shared/mobile-security.md`'s `SEC-DEEPLINK-*` validation rules — a navigation change that introduces a new external entry point is a security-relevant change.
- `NAV-DEEPLINK-3` Deep link URL structure changes are backward-compatible or versioned, so previously distributed links (marketing, push notifications, emails) don't silently break.

## Navigation Abstracted Behind a Service

- `NAV-SERVICE-1` Screens and components call a navigation service/hook (e.g. `useAppNavigation()` or a `navigationService` module), not the raw navigation library's API directly — this keeps the library swappable without touching every screen.
- `NAV-SERVICE-2` Navigation actions triggered from outside React components (e.g. from an API error interceptor, a push notification handler) go through the same navigation service, not a separate ad hoc mechanism.
- `NAV-SERVICE-3` The navigation service is the single place that knows the underlying library's API — screens/components never import the navigation library directly.

## References

- This document is a living baseline; reviewers should flag standards gaps found during review rather than working around them silently.
- See `standards/shared/mobile-security.md` (`SEC-DEEPLINK-*`) for the security-specific deep link validation rules that pair with `NAV-DEEPLINK-*` above.
