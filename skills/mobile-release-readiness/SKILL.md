---
name: mobile-release-readiness
description: Shared methodology for validating a release is ready to ship, across whichever platform(s) are shipping, with platform-specific release validation. Used by /prepare-mobile-release via the mobile-release-engineer agent, the platform performance-reviewer agent(s), and the release-checklist template.
---

## Methodology

1. **Resolve the version and the platform(s) the app ships.** Use the `[version]` given to `/prepare-mobile-release` and the platform(s) `repo-analyst` detects (RN, iOS, Android, React web, or a combination).

2. **Verify version bump & changelog**, per `REL-VERSION-1`/`REL-VERSION-2` in `standards/shared/release-readiness.md`. Confirm the app/package version and native build numbers were bumped for this release, and a matching changelog entry exists.

3. **Diff native/platform config**, per `REL-NATIVECONFIG-1`/`REL-NATIVECONFIG-2`. Compare platform config against the last release. Every change must be attributable to a reviewed PR — an unexplained diff is a blocker, not a note.

4. **Confirm env vars per environment**, per `REL-ENV-1`/`REL-ENV-2`. Check that dev/staging/prod env vars are set for anything the release needs, and cross-reference `SEC-SECRETS-*` in `standards/shared/mobile-security.md`.

5. **Check store/distribution metadata**, per `REL-STORE-1`. Note any listing changes shipping with this version.

6. **Add platform-specific release validation** for each shipping platform:
   - **RN**: JS bundle, native build, Expo/EAS if used, iOS/Android store readiness.
   - **iOS**: Xcode scheme, signing, provisioning, TestFlight/App Store readiness — per `standards/ios/xcode-build-signing.md`.
   - **Android**: Gradle variant, signing config, Play Console readiness — per `standards/android/gradle-build-signing.md`.
   - **React (web)**: production build artifact, deploy target — no store-readiness section.

7. **Get perf sign-off**, per `REL-PERF-1`. Pull `performance-reviewer`'s findings from each shipping platform's run — one invocation per platform, each against that platform's review lane — into a platform-tagged Perf Sign-off subsection.

8. **Check QA readiness**, per `REL-QA-1` … `REL-QA-5`. Run `node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/qa-release-gate.ts"` with every QA readiness artifact (`--qa-readiness` paths from the command), the release contents (`--feature` canonical Dev feature ids, `--bug` QA bug ids) and, when known, the release build per surface; read its JSON and never re-judge it. `no_go` is a blocker with every listed reason; `pass_with_exceptions` passes but every exception and known issue goes into the checklist for a human decision. The Dev QA handoff is Dev → QA input — it is never QA sign-off. QA's Release Notes Input feeds the changelog as input only; the release's own contents stay authoritative.

9. **Write a rollback plan**, per `REL-ROLLBACK-1`. Concrete steps to pull this release if needed.

10. **Populate `templates/release-checklist-template.md` in full** and render a final Go / No-Go verdict, per `REL-VERDICT-1` — listing every blocking gap by name if No-Go.
