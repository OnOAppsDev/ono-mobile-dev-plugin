# Xcode Build & Signing

## Purpose & Scope

These standards cover how an iOS app is configured, signed, versioned, and prepared for distribution: build settings and schemes, dependency declaration, code signing and provisioning, version and build numbers, and store-submission readiness. They are cited by `mobile-release-engineer` via `/prepare-mobile-release` and by the `mobile-release-readiness` skill when a release includes an iOS build; `ios-feature-developer` and `ios-code-reviewer` apply them when a change touches project configuration. Each bullet carries a stable `IOS-BUILD-*` ID. Lane boundaries between the five iOS documents are defined once, in `standards/ios/swift-standards.md`.

**Scope boundary.** This document covers *iOS-specific build and signing mechanics*. The platform-neutral release checklist — environments, rollback, QA sign-off, the release verdict — is `REL-*` in `standards/shared/release-readiness.md` and is not restated here. Secrets handling is `SEC-*` in `standards/shared/mobile-security.md`; this document cites it rather than duplicating it.

**Toolchain neutrality.** Nothing here mandates a signing strategy, CI system, or dependency manager. Every rule asks whether the change is consistent with, and safe within, the mechanism the repository already uses.

The four **governing sections** at the top of `standards/ios/swift-standards.md` — lane boundaries, severity, missing antecedents, applicability stage, plus the shared neutrality/TV/status notes — govern this document too and are not repeated here.

## Build Configuration & Schemes

- `IOS-BUILD-CONFIG-1` Build settings are changed where the repository keeps them — an `.xcconfig`, the shared project settings, or the target's settings — not duplicated into one target so that configurations silently diverge. Where the repository uses `.xcconfig`, the same key is not *also* set on the target in `project.pbxproj`: target-level settings win, and the `.xcconfig` edit becomes a silent no-op. Additive settings (`OTHER_LDFLAGS`, `SWIFT_ACTIVE_COMPILATION_CONDITIONS`) include `$(inherited)`, or they drop everything the layers below contributed.
- `IOS-BUILD-CONFIG-2` A new build configuration, scheme, or target is not introduced for a single task without DD approval; schemes intended for the team or CI are marked shared and committed.
- `IOS-BUILD-CONFIG-3` The deployment target and Swift language mode are not changed as a side effect of a feature task — either is an explicit, reviewed decision with its own justification.
- `IOS-BUILD-CONFIG-4` Environment values (base URLs, feature flags, tenant identifiers) are supplied through the repository's existing mechanism — `.xcconfig`, `Info.plist` substitution, or a generated configuration type — rather than hardcoded at call sites.
- `IOS-BUILD-CONFIG-5` Debug-only configuration is confined to non-release configurations and cannot reach a distributable build. **Blocking** where the leak weakens a security control or exposes non-production data in a shipped build — relaxed transport security (`NSAllowsArbitraryLoads`), a staging or test endpoint, a developer menu, disabled certificate validation. Major for a benign leak such as verbose logging.
- `IOS-BUILD-CONFIG-6` Anything embedded in the build at build time is treated as public and is never a secret — build settings, `.xcconfig` values, and `Info.plist` entries ship inside a reverse-engineerable binary (`SEC-SECRETS-2`).
- `IOS-BUILD-CONFIG-7` Capabilities and entitlements are changed deliberately: a new entitlement is justified, matches the provisioning profile that will sign the build, and is reflected in any required usage-description strings.

## Dependencies

- `IOS-BUILD-DEP-1` Dependencies are declared the way the repository declares them; a second dependency manager is not introduced alongside an existing one.
- `IOS-BUILD-DEP-2` Dependency versions are resolvable and pinned per the repository's convention, and the resolution artifact the repository commits (for example a package resolution file or lockfile) is committed with the change.
- `IOS-BUILD-DEP-3` Security-sensitive dependencies — auth, cryptography, storage, networking — are pinned to an exact version rather than an open range (`SEC-DEPS-*`).
- `IOS-BUILD-DEP-4` A new dependency's binary-size and launch cost is stated when it is proposed (`IOS-PERF-SIZE-3`, `IOS-PERF-LAUNCH-3`). The finding for a missing cost statement is `IOS-ARCH-MODULE-5`; this rule is a cross-reference and is not filed separately.

## Signing & Provisioning

- `IOS-BUILD-SIGN-1` No signing material is committed to source control — private keys, `.p12` archives, provisioning profiles, App Store Connect API keys, and their passwords come from the repository's secure mechanism (CI secret storage, a managed certificate repository, or a secrets manager) per `SEC-SECRETS-1`.
- `IOS-BUILD-SIGN-2` The signing identity and profile match the distribution channel the build is for. A *mismatch* is the finding — most seriously, any development-signed artifact bound for TestFlight or the App Store. The rule is the match, not the enumeration: a channel this table omits is not itself a finding.

  | Channel | Identity | Profile |
  |---|---|---|
  | App Store / TestFlight | Apple Distribution | App Store |
  | Ad Hoc | Apple Distribution | Ad Hoc (registered devices) |
  | In-house (Enterprise programme) | Enterprise Distribution | In-House |
  | Internal development install | Apple Development | Development |
- `IOS-BUILD-SIGN-3` The signing strategy is the one the repository declares. Where release builds are configured for manual signing, CI does not silently fall back to automatic signing, and the profile is specified explicitly rather than left to Xcode's selection.
- `IOS-BUILD-SIGN-4` The bundle identifier, team, entitlements, and profile agree with each other for every target in the archive — including extensions, widgets, and watch targets, which each need their own matching profile.
- `IOS-BUILD-SIGN-5` *(Release stage.)* Certificate and profile expiry is checked before a release is cut, not discovered at upload; renewal follows the repository's established mechanism rather than a one-off manual replacement.
- `IOS-BUILD-SIGN-6` A signing failure is diagnosed and fixed, never worked around by disabling signing checks, loosening entitlements, or committing credentials to unblock a build.

## Versioning

- `IOS-BUILD-VERSION-1` The marketing version and build number are set through the repository's convention (build settings, `.xcconfig`, or a CI step) and are consistent across every target in the archive; the shared requirement is `REL-VERSION-*`.
- `IOS-BUILD-VERSION-2` *(Release stage.)* The build number is unique and monotonically increasing within a distribution stream — a rebuild of the same marketing version gets a new build number rather than reusing one.

## Distribution & Store Readiness

- `IOS-BUILD-DIST-1` The uploaded artifact is built from the release configuration, from a clean, committed state that corresponds to a known revision.
- `IOS-BUILD-DIST-2` *(Release stage.)* Debug symbols are produced and uploaded to whatever symbolicates the app's crash reports, so shipping crashes are readable.
- `IOS-BUILD-DIST-3` The app's **own** privacy manifest is present and accurate — declared data collection, tracking domains, and every required-reason API the app uses (file timestamp, system boot time, disk space, active keyboards, `UserDefaults`) — and each SDK on Apple's designated list ships its own manifest *and* signature. A re-check is triggered by a new dependency **and** by any change that adopts a required-reason API or a new data-collection category; it is not an SDK-only concern.
- `IOS-BUILD-DIST-4` Every permission the build can request has its usage-description key present in the target's `Info.plist`. A missing key is a **blocker**: the system terminates the process at the point the API is invoked, and upload validation rejects the binary. The string is also accurate and human-readable — a present-but-boilerplate string is a review-rejection risk and a user-trust problem, which is the softer, separate finding.
- `IOS-BUILD-DIST-5` Store-facing metadata affected by the change — screenshots, description, age rating, export-compliance answers, what's-new text — is identified before submission (`REL-STORE-1`).
- `IOS-BUILD-DIST-6` A change that plausibly affects App Store review — new permissions, purchases, account handling, third-party login, user-generated content — is flagged in the release notes for a guideline check rather than assumed acceptable.

## Reproducibility

- `IOS-BUILD-REPRO-1` *(Build stage.)* The app builds and archives from a clean checkout using only committed configuration and documented secrets; a step that exists only on one machine is documented or automated before release.
- `IOS-BUILD-REPRO-2` *(Build stage.)* Generated or fetched artifacts required to build are either committed or produced by a committed script — the build does not depend on an undocumented local state.


## References

Consult when a rule is ambiguous for the case in front of you — not routinely.

| Source | When to consult |
|---|---|
| [Xcode build settings reference](https://developer.apple.com/documentation/xcode/build-settings-reference) | What a build setting controls (`IOS-BUILD-CONFIG-*`). |
| [Create provisioning profiles](https://developer.apple.com/help/account/manage-profiles/create-provisioning-profiles) | Profile/entitlement mismatches (`IOS-BUILD-SIGN-3/4`). |
| [Distributing your app for beta testing and releases](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases) | Archive and upload mechanics (`IOS-BUILD-DIST-*`). |
| [Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files) | Whether a change requires a manifest update (`IOS-BUILD-DIST-3`). |
| [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) | Review risk before submission (`IOS-BUILD-DIST-6`). |
| [fastlane match](https://docs.fastlane.tools/actions/match/) | Only where the repository already uses it — never a recommendation to adopt it. |

