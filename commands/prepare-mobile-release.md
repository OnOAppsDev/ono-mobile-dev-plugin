---
description: Validate that a release is ready to ship, across whichever platform(s) are shipping.
argument-hint: [version]
---

Validate that the app is ready to ship version `$ARGUMENTS`.

1. Invoke `repo-analyst` to determine which platform(s) this release actually ships (react-native, iOS, Android, React web, or a combination).
2. Apply the shared `mobile-release-readiness` skill methodology via the `mobile-release-engineer` agent for the checklist mechanics (version bump, changelog, native/platform config diff, env vars per environment, store metadata, QA sign-off, rollback plan), citing `standards/shared/release-readiness.md`'s `REL-*` IDs.
3. Add platform-specific release validation for each shipping platform: React Native — JS bundle, native build, Expo/EAS if used, iOS/Android store readiness; iOS — Xcode scheme, signing, provisioning, TestFlight/App Store readiness, per `standards/ios/xcode-build-signing.md`; Android — Gradle variant, signing config, Play Console readiness, per `standards/android/gradle-build-signing.md`; React (web) — production build artifact and deploy target, no store-readiness section.
4. For perf sign-off, invoke each shipping platform's performance-reviewer agent (`rn-performance-reviewer` / `ios-performance-reviewer` / `android-performance-reviewer` / `react-performance-reviewer`) and populate one platform-tagged sign-off block per shipping platform.

   - **Readiness gate (any platform).** Before invoking, check the target platform's performance-reviewer agent for the placeholder marker — a frontmatter `description` ending "not yet authored, currently a structure-only placeholder" **and** a `## Status: Not yet authored` heading. Match on those markers only, never on the phrase appearing in ordinary prose (an authored skill may legitimately mention "structure-only placeholder" when telling an agent to stop if a *standards* file is one). If present, **do not abort the release check and do not route to the placeholder.** Sign off every authored shipping platform in full, and write that platform's block as an explicit **unverifiable** item naming the platform and the reason — which the final rule below then treats as a no-go for a human to decide, exactly as any other unverifiable item. An excluded lane is a **declared gap, never a silent pass**, and this exclusion is intended behavior rather than a routing failure. (When a lane is later authored and the marker is gone, the route opens automatically.) **No lane is gated today** — `react-native`, `ios`, `android` and `react` are all authored. The gate is retained because it is the invariant, not a note about any one platform: a lane added or reverted to placeholder state is caught here automatically, with no edit to this command.
5. Walk and populate `templates/release-checklist-template.md` in full, including the platform-specific release-validation section.
6. Produce a final go/no-go verdict.

An incomplete or unverifiable checklist item is a no-go by default — surface it to the human for a decision rather than waiving it yourself.
