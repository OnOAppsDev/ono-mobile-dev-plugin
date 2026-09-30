# Release Readiness Standards

## Purpose & Scope

These standards apply to any mobile-division release validated via `/prepare-mobile-release`, regardless of platform — extracted from the `mobile-release-readiness` skill's checklist so findings can cite a stable ID instead of restating the criterion as prose each time. Each bullet below carries a stable `REL-*` ID. Platform-specific release validation (native config specifics, store submission mechanics) is covered by each platform's own standards (`standards/react-native/*`, `standards/ios/xcode-build-signing.md`, `standards/android/gradle-build-signing.md`, `standards/react/*`); this document covers only the checklist criteria common to every platform.

## Version Bump & Changelog

- `REL-VERSION-1` The app/package version and native build numbers are bumped for this release.
- `REL-VERSION-2` A matching changelog entry exists describing what's shipping.

## Native Config Diff

- `REL-NATIVECONFIG-1` Native/platform config (e.g. `Info.plist`, `AndroidManifest.xml`, `build.gradle`, entitlements, or the equivalent for the platform shipping) is diffed against the last release; every change is attributable to a reviewed PR.
- `REL-NATIVECONFIG-2` An unexplained native/platform config diff is treated as a blocker, not a note.

## Environment Variables

- `REL-ENV-1` Dev/staging/prod environment variables are set for anything the release needs.
- `REL-ENV-2` No real secrets are committed to the repo among env vars — cross-reference `SEC-SECRETS-*` in `standards/shared/mobile-security.md`.

## Store / Distribution Metadata

- `REL-STORE-1` Any store or distribution-target listing changes (screenshots, description, release notes, permission declarations, or the web equivalent — deploy target/hosting changes) are noted for this version.

## Performance Sign-off

- `REL-PERF-1` A performance sign-off (bundle size delta, re-renders, virtualization, main-thread/JS-thread blocking, images — per whichever platform's performance standards apply) is pulled from the relevant platform performance-reviewer agent(s) for changes going into this release.

## QA Readiness (QA-owned)

- `REL-QA-1` QA readiness — not the Dev QA handoff — is the release's QA evidence. Every release item, each feature by its canonical Dev feature id and each bug fix by its QA bug id, is covered by exactly one QA-owned readiness artifact (`readiness/<kind>/<id>.md` from ono-plugin-qa, per `docs/qa-readiness-contract.md`), supplied explicitly and evaluated by `scripts/qa-release-gate.ts`. Missing, malformed, uncovered or doubly-claimed coverage is a blocker; identities are matched exactly, never by similar names.
- `REL-QA-2` The covering readiness is signed and current — `signoff_status: valid` with a sign-off fingerprint equal to the artifact's fingerprint — and its verdict is `READY` or `READY_WITH_EXCEPTIONS`. `NOT_READY`, unsigned or stale readiness is a blocker.
- `REL-QA-3` `READY_WITH_EXCEPTIONS` passes the QA gate but is never treated as `READY`: every exception and known issue is listed in the checklist, and shipping with them remains a human decision.
- `REL-QA-4` QA evidence proves only the build it was run on. When the release build per surface is known, it must equal QA's candidate build — a mismatch is a blocker; an unknown release build is surfaced as unverified (`REL-VERDICT-1`).
- `REL-QA-5` The Dev QA handoff (`qa-handoff-template.md`) is Dev → QA input and never QA sign-off. A bug-fix-only release needs no feature, handoff or test plan — only the bug scopes' QA readiness. QA's Release Notes Input is input only: the release's own contents, version and notes stay authoritative.

## Rollback Plan

- `REL-ROLLBACK-1` A rollback plan with concrete steps (revert commit/tag, halt a staged rollout, reverse any backend/migration dependency) is documented before shipping.

## Verdict

- `REL-VERDICT-1` An incomplete or unverifiable checklist item defaults to No-Go — it is surfaced to the human for a decision rather than waived by the release agent itself.

## References

- This document is a living baseline; reviewers should flag standards gaps found during release validation rather than working around them silently.
- Extracted from the `mobile-release-readiness` skill's checklist as part of the mobile-division plugin migration.
