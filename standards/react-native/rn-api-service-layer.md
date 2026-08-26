# API Service Layer Standards

## Purpose & Scope

These standards apply to how React Native app code talks to backend APIs. `repo-analyst` detects which data-fetching layer a project actually uses (RTK Query, TanStack Query, Apollo, plain `fetch`/axios, etc.) before this document is applied — see [Applicability](#applicability). Each bullet below carries a stable ID so review findings can cite the exact rule they violate. This list is a baseline, not exhaustive — reviewers should use judgment for endpoints with unusual requirements.

## Applicability

- **Universal Principles** apply no matter which data-fetching library is detected.
- **RTK Query Rules** apply only when `repo-analyst` detects RTK Query as the project's data-fetching layer. If a different library is detected, apply the Universal Principles using that library's own mechanism (e.g. TanStack Query's `queryKey` and invalidation instead of `providesTags`/`invalidatesTags`) — a file is never failed just for not using RTK Query APIs.

## Universal Principles

### Endpoint Organization

- `API-ORG-1` [WARNING] Create one API module per feature/domain (e.g., RTK Query `createApi` slice, TanStack Query key/hook module, Apollo query set) — avoid monolithic API clients.
- `API-ORG-2` [WARNING] Endpoints/queries live alongside the feature they belong to, not in a separate top-level `api/` dump.
- `API-ORG-3` [WARNING] Endpoint/query names describe the resource/action (`getOrderById`, `updateOrderStatus`), not the HTTP verb or URL shape.
- `API-ORG-4` [WARNING] Shared cross-feature concerns (auth headers, base URL, retry policy) live in one common client/request layer.
- `API-ORG-5` [WARNING] Mock response payloads and JSON stubs used for local development or tests live in dedicated `__mocks__/` directories, never defined inline inside an API module (`createApi` slice, query/hook module, etc.) — an API module imports a mock, it does not embed one.

### Normalized Error Shapes

- `API-ERR-1` [WARNING] All endpoints surface errors in a single normalized shape (e.g. `{ status, code, message }`), not the raw client-library error type leaking into UI code.
- `API-ERR-2` [WARNING] UI components branch on the normalized `code`/`status`, never on parsing a raw error message string.
- `API-ERR-3` [WARNING] Network-level failures (no connectivity, timeout) are distinguished from server-returned error responses in the normalized shape.

### Pagination & Cancellation

- `API-PAGE-1` [WARNING] Paginated endpoints use the detected library's own pagination mechanism (RTK Query's `serializeQueryArgs`/`merge` pair, TanStack Query's `useInfiniteQuery`, Apollo's `fetchMore`) rather than manually concatenating pages into local component state.
- `API-CANCEL-1` [WARNING] A request whose result is no longer needed — the component unmounted, or a newer request superseded it (a fast-typed search) — is cancelled or has its stale result ignored via the library's own mechanism (an `AbortController` passed through `fetchBaseQuery`, a query library's built-in stale-request handling), not left to race and overwrite fresher state.

## RTK Query Rules (only when RTK Query is the detected data-fetching layer)

### Tag-Based Cache Invalidation

- `API-CACHE-1` [WARNING] Every query that returns a list or entity declares `providesTags` scoped to that resource type (e.g. `{ type: 'Order', id }` plus a `{ type: 'Order', id: 'LIST' }` for the collection).
- `API-CACHE-2` [WARNING] Every mutation that changes a resource declares `invalidatesTags` matching the exact tags its change affects — avoid blanket-invalidating unrelated tag types.
- `API-CACHE-3` [WARNING] Tag type names are declared centrally (the `tagTypes` array on the API slice) and reused consistently, using an exact casing standard: each tag type is a PascalCase, singular noun matching the primary entity it represents — `'User'`, `'Order'` — never a plural (`'Orders'`), lowercase (`'order'`), snake_case (`'order_item'`), or abbreviated form.
- `API-CACHE-4` [WARNING] Optimistic updates (`onQueryStarted` cache patches) roll back on failure.

### Base Query, Auth & Error Interceptor

- `API-BASEQ-1` [CRITICAL] A single shared `baseQuery` (typically `fetchBaseQuery` wrapped in a custom function) attaches the auth token to every request — individual endpoints never manually set the auth header.
- `API-BASEQ-2` [CRITICAL] The base query centrally handles `401`/token-expiry by triggering a refresh-and-retry flow once, not per-caller handling of auth failure.
- `API-BASEQ-3` [WARNING] Non-auth error responses are normalized (`API-ERR-*` above) inside the base query.
- `API-BASEQ-4` [CRITICAL] Request/response logging in the base query never logs auth headers or tokens (ties to `SEC-LOG-1` in `standards/shared/mobile-security.md`).

## References

- `repo-analyst`'s Stack Detection determines whether the RTK Query section applies; the Universal Principles always apply regardless of its finding.
- This document is a living baseline; reviewers should flag standards gaps found during review rather than working around them silently.
- See the "AI Agent Execution Directives" section in `standards/react-native/rn-coding-standards.md` for the severity hierarchy, citation format, and anti-hallucination thresholds that govern how findings against the IDs above are reported.
