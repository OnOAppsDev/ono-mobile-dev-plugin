# Android Networking & API Standards

## Purpose & Scope

These standards govern how native Android app code talks to backend APIs — the networking client, transport/DTO models and mapping, authentication, and error/offline handling. They are implemented by `feature-implementer` via `/implement-task` and reviewed by `code-reviewer` via `/review-code`. Each bullet carries a stable `AND-NET-*` ID. This is a baseline, not exhaustive — follow the repository's detected networking stack (Retrofit, Ktor, or another client) rather than imposing one, and follow the API contracts defined in the approved DD exactly.

## Networking Client

- `AND-NET-CLIENT-1` Requests go through the repository's existing configured client (the shared Retrofit/Ktor instance and its `OkHttpClient`/engine) — a new ad-hoc `Retrofit.Builder()`/`OkHttpClient()`/`HttpClient()` is not created per feature or call site.
- `AND-NET-CLIENT-2` Cross-cutting concerns (base URL, auth header injection, timeouts, logging, retry policy) live in the shared client's interceptors/config, not duplicated per endpoint.
- `AND-NET-CLIENT-3` Endpoints are organized the way the repo organizes them (per-feature API interface co-located with the feature), not accumulated in one monolithic service interface where the repo splits them.

## Contracts, DTOs & Mapping

- `AND-NET-CONTRACT-1` Endpoint paths, HTTP methods, query/body fields, enums, and response shapes match the approved DD's API contract (§10) exactly — no invented paths, fields, or status semantics.
- `AND-NET-CONTRACT-2` If the task depends on a backend contract that is not confirmed in the DD (or the DD marks it open), implementation stops and the gap is reported rather than guessing the shape.
- `AND-NET-DTO-1` Transport/DTO models are kept separate from domain/UI models where the repo does so, with an explicit mapping layer — network models do not leak directly into UI/ViewModel state.
- `AND-NET-DTO-2` Serialization uses the repo's existing library and convention (Moshi, kotlinx.serialization, Gson) with fields mapped explicitly (`@SerialName`/`@Json`) rather than relying on incidental field-name matches.

## Authentication

- `AND-NET-AUTH-1` The auth token is attached centrally (interceptor/authenticator in the shared client), never manually per endpoint call, and never placed in a URL/query param (ties to `SEC-AUTH-1`).
- `AND-NET-AUTH-2` `401`/token-expiry is handled once, centrally, via the repo's refresh-and-retry flow — it does not fan out to each caller, and it does not retry indefinitely or fall back to a state that looks authenticated but is not (ties to `SEC-AUTH-2`).

## Errors, Timeouts & Offline

- `AND-NET-ERR-1` Errors surface to callers in a single normalized shape (e.g. a sealed `Result`/error type) rather than leaking raw `HttpException`/`IOException`/engine exceptions into UI code.
- `AND-NET-ERR-2` Network-level failures (no connectivity, timeout) are distinguished from server error responses so the UI can offer retry for the former and a message for the latter, per the DD's error states.
- `AND-NET-ERR-3` Timeouts, cancellation, and retries follow the shared client's configuration; cancellation propagates (a cancelled coroutine cancels its in-flight request) rather than leaking the call.
- `AND-NET-ERR-4` Request/response logging never logs tokens, auth headers, PII, request bodies, or sensitive responses (ties to `SEC-LOG-1`, `AND-LOG-PII-1`).
- `AND-NET-ERR-5` On success, the targeted cache/stream/store for the affected resource is updated rather than triggering a global refresh of unrelated data.

## References

- Retrofit / OkHttp / Ktor client documentation, and the serialization library the repo uses.
- Auth, logging, and transport-security rules are owned by `standards/shared/mobile-security.md` (`SEC-AUTH-*`, `SEC-LOG-*`, `SEC-NET-*`); this document points at them.
- This document is a living baseline; flag standards gaps found during implementation or review rather than working around them silently.
