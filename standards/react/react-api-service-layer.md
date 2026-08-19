# React API Service Layer Standards

## Purpose & Scope

These standards apply to how React (web) application code talks to backend APIs. They are **library-neutral** — the org does not mandate a data-fetching library; TanStack Query (React Query), RTK Query, SWR, or a hand-rolled `fetch` wrapper are all possible findings, and detecting which one a repo uses is the `repo-analyst` agent's job. The rules are stated at the concept level and name specific libraries only as examples. Reviewed by `react-code-reviewer` via `/review-code` and used by `react-architect` via `/analyze-feature` and `/dev-design-start`. Each rule carries a stable ID so findings can cite the exact rule they apply. This is a baseline, not exhaustive.

This document inherits the **React lane conventions** in `standards/react/react-coding-standards.md` — the repository-first source-of-truth hierarchy (the repo's detected data-layer convention outranks these rules; official docs are rank-5 supporting only; absence of a convention is not compliance), technology-neutrality, the no-modernization-aside stance, the `REACT-` ID prefix, and the `## External references` pattern. Findings are limited to code introduced or modified in the reviewed scope.

> **Port + web additions.** The organization, caching, and normalized-error rules port directly from the React Native standard (RN assumed RTK Query; here they are library-neutral). The auth-transport, CORS, secret-exposure, request-cancellation, and server-side-fetching rules are **web-specific** and have no React Native analog.

## Endpoint / Query Organization

- `REACT-API-ORG-1` API definitions are grouped by feature/domain (e.g. an `ordersApi` slice, or the orders feature's query hooks/keys) — not one monolithic client covering the whole app.
- `REACT-API-ORG-2` Endpoints/queries are co-located with the feature they belong to (alongside that feature's components and store slice), not in a separate top-level `api/` dump.
- `REACT-API-ORG-3` Endpoint/query names describe the resource/action (`getOrderById`, `updateOrderStatus`), not the HTTP verb or URL shape.
- `REACT-API-ORG-4` Shared cross-feature concerns (auth transport, base URL, retry policy) live in one common base layer, not duplicated per feature.

## Caching & Invalidation

- `REACT-API-CACHE-1` Each query that returns a list or entity is cached under a key/tag scoped to that resource type (RTK Query `providesTags`, a React Query `queryKey`), so it can be invalidated precisely rather than by clearing the whole cache.
- `REACT-API-CACHE-2` A mutation invalidates the exact keys/tags its change affects — it does not blanket-invalidate unrelated data "to be safe."
- `REACT-API-CACHE-3` Cache key/tag names are defined centrally and reused consistently — no ad-hoc string keys scattered across definitions.
- `REACT-API-CACHE-4` Optimistic updates roll back on failure rather than leaving stale optimistic data in the cache.

## Base Client, Auth Transport & Error Interceptor

- `REACT-API-BASEQ-1` A single shared base client (a configured query client or a `fetch` wrapper) applies cross-cutting request concerns — base URL, auth transport, retry, and error normalization (per `REACT-API-ERR-1`) — so individual endpoints never set them ad hoc.
- `REACT-API-BASEQ-2` **Auth transport (web).** Session/auth credentials are carried in an `httpOnly`, `Secure`, explicitly-`SameSite` cookie sent with `credentials: 'include'` (shared `SEC-COOKIE-1`), **not** a bearer token read from `localStorage`/`sessionStorage`/`IndexedDB` — a successful XSS reads all of those (shared `SEC-COOKIE-2`). Where the API requires a bearer token that must reach JavaScript, it is held **in memory only** and re-acquired after reload, never persisted to a script-readable store.
- `REACT-API-BASEQ-3` **CSRF (web).** When state is changed using an ambient cookie credential, the request is protected against cross-site request forgery — an anti-CSRF token or `SameSite` cookies the backend enforces (shared `SEC-WEB-3`); safe methods (`GET`/`HEAD`) never change state and so never rely on this.
- `REACT-API-BASEQ-4` `401`/token-expiry is handled centrally in the base layer (a single refresh-and-retry, once), not by having each endpoint's caller handle auth failure independently.
- `REACT-API-BASEQ-5` **CORS (web).** CORS is treated as a browser-enforced read boundary, not an authorization mechanism (shared `SEC-WEB-6`): the client relies on server-side authn/authz regardless of origin, and a permissive CORS config is never used as a stand-in for access control.
- `REACT-API-BASEQ-6` **Secrets (web).** API keys and tokens are never inlined into the client bundle as build-time constants — a build-time constant in a shipped artifact is public (shared `SEC-SECRETS-2`); a call that genuinely needs a secret goes through a server/proxy, not the browser.
- `REACT-API-BASEQ-7` Request/response logging in the base layer never logs auth headers, cookies, tokens, or PII (shared `SEC-LOG-1`).

## Request Cancellation

- `REACT-API-ASYNC-1` In-flight requests are cancellable — an `AbortController` signal (or the data library's own cancellation) — and are aborted when the initiating component unmounts or the request is superseded, so a stale response cannot overwrite newer data or set state on an unmounted component. (Component-side effect cancellation is `REACT-FC-6` in `react-coding-standards.md`.)

## Server-Side & RSC Data Fetching

**[Applies where the app fetches on the server — Next.js, Remix, RSC, or custom SSR. For a purely client-rendered SPA this section is N/A; do not raise its rules as findings.]**

- `REACT-API-SSR-1` Data fetched during the server render populates the client's data cache on hydration, so the same data is not re-requested by a client effect after load. (Where the *route-level* loader / server-data decision lives is owned by `REACT-ROUTE-SSR-2` in `standards/react/react-routing.md`; this rule owns only the data layer's participation — cache hydration — in it. Boundary frozen in REACT-001-7.)
- `REACT-API-SSR-2` A request issued on the server forwards the incoming request's credentials/cookies deliberately and scoped to that one request — one user's credentials are never reused across requests — and repeated identical fetches within a single render are deduplicated.

## Normalized Error Shapes

- `REACT-API-ERR-1` All endpoints surface errors in a single normalized shape (e.g. `{ status, code, message }`), not the raw library error union (`FetchBaseQueryError`, a thrown `Response`, an `AxiosError`) leaking into UI code; the normalization is produced once in the shared base layer (`REACT-API-BASEQ-1`), not re-implemented per endpoint.
- `REACT-API-ERR-2` UI components branch on the normalized `code`/`status`, never on parsing a raw error message string.
- `REACT-API-ERR-3` Network-level failures (offline, timeout) are distinguished from server-returned error responses so the UI can show a retry affordance for the former and a message for the latter; a **deliberately aborted** request (per `REACT-API-ASYNC-1`) is distinguished from a real failure so a cancellation is not surfaced to the user as an error.

## Smart TV context (`device_type: tv`)

**[Additive branch. Applies only where the surface runs on a TV. Authors no rule: every obligation below is owned by a `REACT-TV-API-*` rule in `standards/react/react-smart-tv.md`, and a finding is filed under that owning ID, never duplicated here.]**

Establish the TV surface from evidence first — `standards/react/react-smart-tv.md` owns the applicability gate and its detection traps. Where the repository has no TV surface, this section is N/A.

Every rule in this document applies on a TV surface. But **two of `REACT-API-BASEQ-2`'s and `REACT-API-BASEQ-5`'s premises are browser premises, and a TV target may not satisfy them** — so they are established rather than assumed:

- **`REACT-API-BASEQ-2` reads as unconditional; on TV it is conditional on cookie transport actually working.** The preference for an `httpOnly`, `Secure`, `SameSite` cookie over a script-readable token is correct **wherever cookies are usable**. A TV platform distinguishes a **packaged** app (resources installed locally, served from a non-`http(s)` scheme) from a **hosted** app (content served over `http(s)`), and cookie behavior differs between them. `REACT-TV-API-1` requires establishing which app type ships and whether cookies are usable on it, from vendor documentation for the targeted firmware — a finding, not an assumption.
- **Where cookies are unavailable, this rule's in-memory-token fallback becomes the primary design**, not a compromise — owned by `REACT-TV-API-2`. What does not relax: no token in a script-readable store (`REACT-STATE-PERSIST-2`, shared `SEC-COOKIE-2`, `SEC-STORAGE-3`), none in logs (shared `SEC-LOG-1`), none inlined into the package (`REACT-API-BASEQ-6`, `REACT-TV-PKG-6`, shared `SEC-SECRETS-2`). **Reaching for `localStorage` because "cookies don't work on TV" is a defect, not a workaround** — and it is the single most likely wrong turn in a TV data layer.
- **`REACT-API-BASEQ-5`'s CORS model may not describe the target.** A packaged app's document origin is not the API's origin, so requests are cross-origin by construction, and platforms mediate that differently: one requires every reachable origin to be declared in the **application manifest** and does not send the CORS `Origin` header at all — which breaks any server that reflects the app's origin — while another follows CORS with server-side control only. `REACT-TV-API-3` owns establishing the actual model; adding a backend host may therefore be a **packaging change** (`REACT-TV-PKG-3`), not only a code change. Unchanged: CORS is a read boundary, never authorization (shared `SEC-WEB-6`).
- **`REACT-API-BASEQ-3`'s CSRF exposure is re-derived, not inherited.** CSRF protection is required when state changes ride an **ambient cookie** credential. Where the established TV transport carries no ambient cookie, classic browser CSRF is not the live threat — recorded as a reasoned **N/A against the established transport**, never as a passed check, and re-derived if the transport changes. `REACT-TV-API-4` owns this.

## References

- This document is a living baseline; reviewers flag data-layer gaps found during review rather than working around them silently.
- Where a repo already uses a specific data-fetching library, `repo-analyst`'s detection identifies it and these concept-level rules are applied to that library's constructs.
- Companion React standards: `standards/react/react-coding-standards.md` (authored — governing conventions; `REACT-FC-6`) and `standards/react/react-routing.md` (authored — `REACT-ROUTE-SSR-2`); and `standards/react/react-state-management.md`, `standards/react/react-architecture.md`, `standards/react/react-performance.md` (all authored; cross-references frozen in REACT-001-7); and `standards/react/react-smart-tv.md` (authored — `REACT-TV-API-*` qualifies this document's auth-transport and CORS premises on a TV surface).
- Shared standards cited (not restated) here: `standards/shared/mobile-security.md` (`SEC-COOKIE-1`, `SEC-COOKIE-2`, `SEC-WEB-3`, `SEC-WEB-6`, `SEC-SECRETS-2`, `SEC-LOG-1`, `SEC-STORAGE-3`).

## External references

Rank-5 supporting material only (see *External references* under the governing conventions in `react-coding-standards.md`): consult for background, never as a rule and never fetched at review time; a repository convention (rank 2) always wins. Links verified live 2026-08-16.

- [MDN — Using the Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) — supports `REACT-API-BASEQ-2`, `REACT-API-ASYNC-1`. *Consult* for the `credentials: 'include'` option and for aborting a request with an `AbortController` signal.
- [MDN — Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) — supports `REACT-API-BASEQ-5`. *Consult* for how preflight and credentialed requests work and why CORS is a browser boundary, not authorization.
- [MDN — `AbortController`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) — supports `REACT-API-ASYNC-1`. *Consult* for the cancellation API used to abort an in-flight request.
