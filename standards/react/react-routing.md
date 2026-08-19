# React Routing Standards

## Purpose & Scope

These standards are **library-agnostic** — the org does not mandate React Router, TanStack Router, the Next.js App/Pages Router, or any specific routing solution. Detecting which router a given repo actually uses is the `repo-analyst` agent's job, not this standard's; whatever router is in use, the rules below still apply. They are reviewed by `react-code-reviewer` via `/review-code` and used by `react-architect` via `/analyze-feature` and `/dev-design-start`. Each rule carries a stable ID so findings and design proposals can cite the exact rule they apply. This is a baseline, not exhaustive.

This document inherits the **React lane conventions** in `standards/react/react-coding-standards.md` — the repository-first source-of-truth hierarchy (a repo's established routing approach, as detected by `repo-analyst`, outranks these rules; official docs are rank-5 supporting only; absence of a convention is not compliance), technology-neutrality, the no-modernization-aside stance, the `REACT-` ID prefix, and the `## External references` pattern. Findings are limited to code introduced or modified in the reviewed scope.

> **Web rewrite, not a port.** React Native routes carry parameters as a typed in-memory object between screens; on the web the **URL itself** is the routing state, so this document replaces RN's in-memory-param model (`NAV-TYPED-*`) with a URL model, recasts "deep links" as ordinary URLs, and — see `REACT-ROUTE-SERVICE-*` — deliberately **downgrades** RN's mandatory navigation-service abstraction.

## URL as the Source of Truth

- `REACT-ROUTE-URL-1` Route inputs come from the **URL** — path segments and the query string — not an in-memory object handed between views. The URL is the canonical, shareable, reloadable location: the same URL must reproduce the same view.
- `REACT-ROUTE-URL-2` Query-string state is read and written through `URLSearchParams` (or the router's typed search API), not hand-parsed by string splitting; every value is decoded and validated on read, because a param may be absent, repeated, or attacker-supplied. Untyped/`any` param objects are not acceptable (see `REACT-TS-2` in `react-coding-standards.md`).
- `REACT-ROUTE-URL-3` Raw string params are parsed into a typed shape **once** at the route boundary (a loader, a route definition, or a single parsing hook); views read the typed shape and do not reach for undeclared params.
- `REACT-ROUTE-URL-4` Navigation targets are built from a single typed route definition (a path builder or typed routes), not ad-hoc string concatenation, so renaming a route is a type error rather than a silent broken link.
- `REACT-ROUTE-URL-5` State that should be shareable or bookmarkable (active filters, selected tab, pagination, search query) belongs in the URL; genuinely ephemeral, non-shareable state uses component or history state deliberately. (The full local-vs-URL-vs-store boundary is owned by `REACT-STATE-BOUNDARY-2` in `standards/react/react-state-management.md`.)

## URL Structure, Stability & SEO

- `REACT-ROUTE-STABILITY-1` URLs follow a documented, single-source-of-truth route structure (a route table/config), not ad-hoc path strings scattered across the codebase.
- `REACT-ROUTE-STABILITY-2` A URL change is backward-compatible or paired with an explicit redirect (a permanent redirect for a moved route), so previously distributed links — marketing, emails, push, search-index entries, bookmarks — do not silently break.
- `REACT-ROUTE-STABILITY-3` A public/shareable route has a single canonical URL (canonical link, consistent trailing-slash and casing) so equivalent URLs don't fragment SEO or caching.
- `REACT-ROUTE-STABILITY-4` Adding an externally reachable route or redirect that consumes user-controllable input is a security-relevant change and is validated per `REACT-ROUTE-SECURITY-*` below.

## Untrusted Navigation Targets

- `REACT-ROUTE-SECURITY-1` A redirect or navigation target derived from user-controllable input (a `?next=` / `?returnTo=` query param, a path segment, the referrer) is validated against an allowlist before use — never navigate or assign `window.location` to an absolute URL taken from a query parameter. This cites and enforces shared `SEC-WEB-5` (the browser-navigation counterpart to the native `SEC-DEEPLINK-1`).
- `REACT-ROUTE-SECURITY-2` Navigating to a route (a link click or route load) is treated as a safe, idempotent `GET`; a state-changing action is never performed as a side effect of a bare navigation but goes through a form/action protected against cross-site request forgery per shared `SEC-WEB-3`.

## SSR & Hydration-Safe Routing

**[Applies where the app renders routes on the server — Next.js, Remix, or a custom SSR setup. For a purely client-rendered SPA this section is N/A; do not raise its rules as findings.]**

- `REACT-ROUTE-SSR-1` The server-rendered markup and the client's first render for the same URL match — an initial routing decision does not branch on browser-only values (`window`, `document`, `localStorage`), which would cause a hydration mismatch.
- `REACT-ROUTE-SSR-2` Initial-navigation data loading uses the framework's route loader / server-data mechanism, where one exists, rather than a client effect that refetches after hydration.
- `REACT-ROUTE-SSR-3` A redirect for the initial request is issued server-side (the framework's redirect) rather than rendering and then client-redirecting, so there is no content flash and the HTTP status is correct.

## Navigation Ergonomics

- `REACT-ROUTE-UX-1` In-app navigation uses the router's link/navigation primitive (`<Link>` or the framework equivalent), not a raw `<a href>` that forces a full-document reload, and not a programmatic navigate where a link is semantically correct — a link is focusable, keyboard-activatable, and open-in-new-tab-able (see shared `A11Y-ROLES-*`). A cross-origin link opened in a new tab (`target="_blank"`) carries `rel="noopener noreferrer"`.
- `REACT-ROUTE-UX-2` Scroll position is managed on navigation — reset to the top on a forward navigation to a new route, and restored on Back/Forward — rather than left wherever the previous route happened to be.
- `REACT-ROUTE-UX-3` The app respects the browser Back/Forward buttons and does not trap or corrupt history: `push` vs `replace` is chosen deliberately (a filter change that shouldn't create a back-button step uses `replace`), and no flow hijacks the Back action.
- `REACT-ROUTE-UX-4` Prefetching of likely-next routes (the router's prefetch / `<Link>` prefetch) is used where it improves perceived navigation speed, without prefetching so aggressively that it wastes bandwidth. (Perceived-performance budgets are owned by `standards/react/react-performance.md`, `REACT-PERF-*`.)

## Navigation Abstraction

**Lane decision (stated per the governing no-default rule): the RN `NAV-SERVICE` mandate is downgraded on web.** React Native wrapped the navigation library behind a service so the library stayed swappable; on the web the router exposes a stable, standardized seam (a navigate hook such as `useNavigate` or `useRouter().push`, a `<Link>` component, and the History API), so a bespoke wrapper is not required and is not the default recommendation.

- `REACT-ROUTE-SERVICE-1` Components navigate using the router's own hooks and components directly (a navigate hook — e.g. `useNavigate` or `useRouter().push` — and `<Link>`, or the framework equivalent). A custom navigation-service singleton is **not required** and is not introduced for its own sake.
- `REACT-ROUTE-SERVICE-2` Navigation triggered from outside a component (an API error interceptor, an auth-expiry handler) uses the router's supported imperative API, or one small module wrapping it — not a scattered set of `window.location` assignments. If the repository already has a navigation-service abstraction, follow it (repository-first); do not remove it absent a planned migration.
- `REACT-ROUTE-SERVICE-3` Raw `window.location` / `history` manipulation for *in-app* navigation is avoided in favor of the router, which keeps client-side routing, transitions, and scroll handling intact; a direct `window.location` assignment is reserved for genuine full-document navigations (an external URL, an auth redirect to another origin).

## Smart TV context (`device_type: tv`)

**[Additive branch — REACT-003-2. Applies only where the surface runs on a TV. Authors no rule: every obligation below is owned by a `REACT-TV-*` rule in `standards/react/react-smart-tv.md`, and a finding is filed under that owning ID, never duplicated here.]**

Establish the TV surface from evidence first — `standards/react/react-smart-tv.md` owns the applicability gate and its detection traps. Where the repository has no TV surface, this section is N/A.

Routing diverges more on TV than any other base document, because two of this document's premises weaken: **the URL may not be shareable, and there is no pointer.** The rules themselves stand; their rationale shifts.

- **URL-as-source-of-truth still holds, but the *sharing* rationale often does not.** `REACT-ROUTE-URL-1..4` apply unchanged — the URL remains the canonical, reload-reproducible location, and typed params parsed once at the boundary remain correct. What weakens is `REACT-ROUTE-URL-5`'s and `REACT-ROUTE-STABILITY-2`'s premise of externally distributed links: a packaged Tizen/webOS app is installed locally and its internal URLs are generally not shareable or bookmarkable by a user. Judge "should this be in the URL?" on reload-survival and reproducibility rather than on shareability, and do not raise a finding that rests on a shareability requirement the surface does not have.
- **`REACT-ROUTE-STABILITY-3` (canonical URL / SEO) is normally N/A** on a packaged application, which is not crawled. Record it Not Applicable with the reason rather than passed. It applies unchanged on a browser-based TV surface served over the web.
- **The `REACT-ROUTE-SSR-*` section is normally N/A** on a packaged TV app for the same reason `REACT-ARCH-BOUNDARY-*` is (see `standards/react/react-architecture.md`) — there is no server render. Confirm from the repository; a browser-based TV surface behind an SSR framework is possible.
- **Back is a hardware key, and it is the one navigation control the user always has.** `REACT-TV-INPUT-4` owns Back's behavior at every level, including root-level exit; `REACT-ROUTE-UX-3`'s prohibition on trapping or corrupting history applies unchanged and is the mechanism Back relies on, and `REACT-ROUTE-SERVICE-3`'s preference for the router over raw `history` manipulation is what keeps Back coherent. Note that a vendor platform may drive Back through the History API by default — a repo that opts out of that default owns the behavior itself, per `REACT-TV-INPUT-4`.
- **Scroll restoration becomes focus restoration.** `REACT-ROUTE-UX-2` still applies where the surface scrolls, but the user-visible obligation on TV is that focus returns to the element the user left, which `REACT-TV-FOCUS-4` owns. Restoring scroll position while dropping focus is a `REACT-TV-FOCUS-1` defect, not a routing pass.
- **`REACT-ROUTE-UX-1` link semantics apply, with the pointer half removed.** A link must still be focusable and activatable — which on TV is the entire interaction — but "open in a new tab" has no TV meaning, and per `REACT-TV-INPUT-6` no affordance may depend on hover, tap, or drag. `REACT-TV-FOCUS-3` owns the visible focus treatment that makes a focused link legible across a room.
- **`REACT-ROUTE-UX-4` prefetching is weighed against a memory ceiling, not just bandwidth.** On a constrained runtime, aggressive route prefetching costs budget that `REACT-TV-PERF-1` and `REACT-TV-PERF-2` govern; a prefetch magnitude claim follows the measurement discipline in `standards/react/react-performance.md`.
- **A launch or relaunch payload is an untrusted navigation input.** `REACT-ROUTE-SECURITY-1` and shared `SEC-WEB-5` already require validating a navigation target taken from user-controllable input; on TV the same obligation extends to a vendor launch/relaunch parameter, which `REACT-TV-LIFECYCLE-3` owns (with shared `SEC-DEEPLINK-2`). `REACT-ROUTE-SECURITY-2` applies unchanged — a bare navigation never changes state.

## References

- This document is a living baseline; reviewers flag routing gaps found during review rather than working around them silently.
- Where a repo's existing routing structure predates these rules, `repo-analyst`'s detected conventions take precedence for that repo until a migration is planned.
- Companion React standards (all authored; base cross-references frozen in REACT-001-7): `standards/react/react-coding-standards.md` (governing conventions), `standards/react/react-state-management.md` (URL-as-state boundary), `standards/react/react-performance.md` (prefetch/perceived-performance), `standards/react/react-architecture.md`, and `standards/react/react-smart-tv.md` (`REACT-TV-*` — Back-key handling, focus restoration, launch payloads).
- Shared standards cited (not restated) here: `standards/shared/mobile-security.md` (`SEC-WEB-5`, `SEC-WEB-3`) and `standards/shared/accessibility.md` (`A11Y-ROLES-*`).

## External references

Rank-5 supporting material only (see *External references* under the governing conventions in `react-coding-standards.md`): consult for background, never as a rule and never fetched at review time; a repository convention (rank 2) always wins. Links verified live 2026-08-16.

- [MDN — `URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) — supports `REACT-ROUTE-URL-2`. *Consult* for reading/writing query-string state safely instead of hand-parsing.
- [MDN — History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API) — supports `REACT-ROUTE-UX-3`, `REACT-ROUTE-SERVICE-3`. *Consult* for how `pushState`/`replaceState`/`popstate` underlie client-side routing and Back/Forward behavior.
- [OWASP — Unvalidated Redirects and Forwards Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html) — supports `REACT-ROUTE-SECURITY-1`. *Consult* for allowlist strategies when a redirect target comes from user input.
