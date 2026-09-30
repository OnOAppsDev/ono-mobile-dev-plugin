# Release Checklist

<!-- Version being released, platform(s) shipping (react-native/ios/android/react, or a combination), target date, release engineer (mobile-release-engineer — shared across all platforms). -->
## Scope

<!-- Confirm the version bump (package.json/app version, native/platform build numbers) and a matching changelog entry exist for this release. Per REL-VERSION-* in standards/shared/release-readiness.md. -->
## Version Bump & Changelog

<!-- Diff of native/platform config (Info.plist / AndroidManifest.xml / build.gradle / entitlements, or the equivalent for the platform shipping) against the last release, with each change explicitly reviewed — not just "no diff shown". Per REL-NATIVECONFIG-* in standards/shared/release-readiness.md. -->
## Native Config Diff

<!-- Confirm required env vars are set per environment (dev/staging/prod) and that none are real secrets committed to the repo (see standards/shared/mobile-security.md, SEC-SECRETS-*). Per REL-ENV-*. -->
## Env Vars Per Environment

<!-- App store / Play store listing metadata that changed: screenshots, description, release notes, permissions declarations. For React (web), the deploy-target/hosting equivalent instead. Per REL-STORE-1. -->
## Store Metadata

<!-- One subsection per platform this release ships, per the routing rules in the mobile-release-readiness skill:
     - React Native: JS bundle, native build, Expo/EAS if used, iOS/Android store readiness.
     - iOS: Xcode scheme, signing, provisioning, TestFlight/App Store readiness (standards/ios/xcode-build-signing.md).
     - Android: Gradle variant, signing config, Play Console readiness (standards/android/gradle-build-signing.md).
     - React (web): production build artifact, deploy target — no store-readiness section. -->
## Platform-Specific Release Validation

<!-- One perf sign-off block per shipping platform, tagged [platform], populated by `performance-reviewer` run against that platform's resolved review lane: bundle size delta and the platform's own performance concerns, plus verdict. Per REL-PERF-1. -->
## Perf Sign-off

<!-- QA-owned readiness evidence, per REL-QA-1 … REL-QA-5 in standards/shared/release-readiness.md: the output of scripts/qa-release-gate.ts over the QA readiness artifact(s) (docs/qa-readiness-contract.md) — paste its qa_section_markdown here. It lists the readiness artifact(s), each verdict and sign-off status with who/when, candidate and tested builds, the release items each one covers, build consistency, every known issue and exception, and any missing / stale / uncovered status. The Dev QA handoff is Dev → QA input, not QA sign-off, and is not listed here. -->
## QA Readiness (QA-owned)

<!-- Concrete rollback steps if this release needs to be pulled: revert commit/tag, store rollback/staged-rollout halt, any required backend/migration reversal. Per REL-ROLLBACK-1. -->
## Rollback Plan

<!-- Overall verdict: Go / No-Go, with the specific blocking gaps listed if No-Go. An incomplete or unverifiable item defaults to No-Go per REL-VERDICT-1 — it's surfaced to the human, never waived automatically. -->
## Sign-off
