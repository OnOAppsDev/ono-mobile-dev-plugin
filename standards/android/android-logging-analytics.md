# Android Logging & Analytics Standards

## Purpose & Scope

These standards govern logging and analytics in native Android app code — diagnostic logging hygiene, analytics event emission, and PII handling in both. They are implemented by `feature-implementer` via `/implement-task` and reviewed by `code-reviewer` via `/review-code`. Each bullet carries a stable `AND-LOG-*` ID. This is a baseline, not exhaustive — follow the repository's detected logging and analytics conventions rather than imposing a new one. Security-sensitive logging rules are shared with `standards/shared/mobile-security.md` (`SEC-LOG-*`); this document adds the Android-specific application.

## Logging Hygiene

- `AND-LOG-HYGIENE-1` Logging goes through the repo's existing logging abstraction (Timber or a project logger), not raw `Log.d`/`println`/`System.out` scattered in new code.
- `AND-LOG-HYGIENE-2` Debug/verbose logging is gated so it does not run in release builds (a release-stripped log tree, `BuildConfig.DEBUG` guard, or the repo's mechanism) and is easily removable.
- `AND-LOG-HYGIENE-3` Diagnostic information needed to investigate failures is preserved (error type, non-sensitive context) rather than swallowing an error with an empty `catch` — errors are logged or surfaced, never silently discarded.

## Analytics Events

- `AND-LOG-ANALYTICS-1` Only the analytics events specified by the DD (§12) are added, using the repo's existing analytics wrapper and naming/property conventions — not a new SDK call style.
- `AND-LOG-ANALYTICS-2` Events fire once per real user action; recomposition, lifecycle re-entry, configuration change, or flow re-subscription do not cause duplicate events (ties to `AND-VM-EVENT-1`).
- `AND-LOG-ANALYTICS-3` Event names and property keys reuse existing definitions where the same event already exists rather than introducing a divergent duplicate.

## PII in Logs & Analytics

- `AND-LOG-PII-1` No PII, secrets, tokens, credentials, request/response bodies, photos, or sensitive identifiers are written to logs (ties to `SEC-LOG-1`).
- `AND-LOG-PII-2` No PII is sent in analytics event properties; identifiers used for analytics are the approved non-personal ones.
- `AND-LOG-PII-3` Crash-reporter (Crashlytics/Sentry) breadcrumbs and payloads are checked for sensitive fields, which are redacted before send (ties to `SEC-LOG-2`).

## References

- Timber / Android logging guidance and the analytics/crash-reporting SDK the repo uses.
- Logging security rules are owned by `standards/shared/mobile-security.md` (`SEC-LOG-*`); one-shot-event deduplication ties to `standards/android/android-architecture.md` (`AND-VM-EVENT-1`).
- This document is a living baseline; flag standards gaps found during implementation or review rather than working around them silently.
