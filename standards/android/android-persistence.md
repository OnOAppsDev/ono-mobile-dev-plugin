# Android Persistence Standards

## Purpose & Scope

These standards govern local data persistence in native Android app code — databases (Room), key-value/preferences stores (DataStore, SharedPreferences), file storage, and caching. They are implemented by `feature-implementer` via `/implement-task` and reviewed by `code-reviewer` via `/review-code`. Each bullet carries a stable `AND-DATA-*` ID. This is a baseline, not exhaustive — follow the repository's detected persistence stack rather than imposing one.

## Storage Choice

- `AND-DATA-STORE-1` The repo's existing persistence mechanism for a given kind of data is used (Room for relational/queryable data, DataStore/SharedPreferences for small key-value settings, the file system/cache dir for blobs) — a second mechanism is not introduced for data the existing one already covers.
- `AND-DATA-STORE-2` Preferences/settings use the repo's existing store; new code does not reintroduce `SharedPreferences` into a project that has migrated to DataStore (or vice-versa) without DD approval.
- `AND-DATA-STORE-3` A single source of truth is maintained — cached/persisted data and its in-memory representation are reconciled through one path, not written to two stores that can diverge.

## Migrations & Schema

- `AND-DATA-MIGRATE-1` A schema change to a persisted store (Room entity change, DataStore schema change) ships with a migration; the schema is not changed without one.
- `AND-DATA-MIGRATE-2` User data is never silently destroyed to avoid writing a migration — destructive/fallback migration is not used on real user data without an explicit, DD-approved decision.
- `AND-DATA-MIGRATE-3` Migrations are covered by a migration test where the repo tests them (Room `MigrationTestHelper` or equivalent), ties to `AND-TEST-*`.

## Threading & Cache Behavior

- `AND-DATA-THREAD-1` Database and disk operations run off the main thread (suspend DAOs, `Dispatchers.IO` via the repo's convention) — no synchronous DB/disk access on a UI path (ties to `AND-PERF-THREAD-1`).
- `AND-DATA-CACHE-1` Cache invalidation and freshness/source-of-truth behavior are defined explicitly per the DD (what is cached, for how long, when it is invalidated) rather than left implicit.

## Security of Stored Data

- `AND-DATA-SEC-1` Tokens, credentials, and PII use approved secure storage (Keystore-backed storage, `EncryptedSharedPreferences`/encrypted DataStore) — not plain SharedPreferences/DataStore/files, per `SEC-STORAGE-1`.
- `AND-DATA-SEC-2` Existing encryption and secure-storage conventions are preserved; an encrypted store is not downgraded to a plain one for convenience.
- `AND-DATA-SEC-3` Temporary files and caches created from sensitive data are cleaned up after use, and use app-internal storage rather than world-readable locations (ties to `SEC-STORAGE-4`).

## References

- Room, DataStore, and Android data-storage documentation (developer.android.com).
- Secure-storage rules are owned by `standards/shared/mobile-security.md` (`SEC-STORAGE-*`); off-main-thread rules tie to `standards/android/android-performance.md` (`AND-PERF-THREAD-1`).
- This document is a living baseline; flag standards gaps found during implementation or review rather than working around them silently.
