# Gradle Build & Signing

## Purpose & Scope

These standards cover the Android build configuration touched during feature work and validated at release: Gradle build variants and flavors, dependency management, signing configuration, and R8/ProGuard minification. They are applied by `android-feature-developer` when a task changes build config, and cited by `mobile-release-engineer` / `android-performance-reviewer` in `/prepare-mobile-release` when the release ships an Android build. Each bullet carries a stable `AND-REL-*` ID. This is a baseline, not exhaustive — follow the repo's existing Gradle conventions (Groovy vs. Kotlin DSL, version catalogs, convention plugins) rather than imposing a different style.

## Build Variants & Configuration

- `AND-REL-VARIANT-1` New configuration follows the repo's existing variant/flavor/build-type structure; a new build type or product flavor is not introduced for a single task without DD approval.
- `AND-REL-VARIANT-2` `minSdk`, `targetSdk`, and `compileSdk` are not changed as a side effect of a feature task — an SDK-level change is an explicit, reviewed decision with its own justification.
- `AND-REL-VARIANT-3` Environment/config values (base URLs, flags) are supplied through the repo's existing mechanism (`BuildConfig` fields, `resValue`, manifest placeholders, or a config file) rather than hardcoded per call site.
- `AND-REL-VARIANT-4` Debug-only configuration (logging, debug tooling, cleartext for a local server) is confined to the debug build type and cannot leak into release.

## Dependency Management

- `AND-REL-DEP-1` Dependencies are declared the way the repo declares them (version catalog `libs.*`, `buildSrc`, or direct coordinates) — a new declaration style is not mixed in.
- `AND-REL-DEP-2` A new dependency is justified against what already exists (no duplicate library for a capability the repo already has) and its size/transitive impact is noted (ties to `AND-PERF-SIZE-2`).
- `AND-REL-DEP-3` Security-sensitive libraries (auth, crypto, storage, networking) are pinned to a specific version rather than a dynamic/`+` range (ties to `SEC-DEPS-3`).

## Signing

- `AND-REL-SIGN-1` No signing credentials (keystore passwords, key aliases, keystore files) are committed to source control — they come from a secure source (Gradle properties outside VCS, environment variables, a secrets manager, or CI signing) per `SEC-SECRETS-1`.
- `AND-REL-SIGN-2` Release builds are signed with the release signing config (or Play App Signing), and the debug signing config is never used for a distributable release artifact.

## Minification & Shrinking

- `AND-REL-R8-1` Release builds enable R8/ProGuard minification and resource shrinking per the repo's release build type (ties to `SEC-HARDEN-1`).
- `AND-REL-R8-2` Code that reflection, serialization, or native interop depends on has matching keep rules; a feature that adds such code adds the required keep rules rather than leaving release builds to crash after shrinking.

## Android TV Context (device_type: tv)

**[Applies wherever the repository ships, or has been asked to ship, an Android TV target. Every rule
below is additive: the base `AND-REL-*` rules apply on a TV surface unchanged, and nothing here relaxes
or forks one.]**

**This section is deliberately not gated on an *established* TV surface, unlike the other TV sections.**
The declarations `AND-REL-TV-LAUNCH-1` and `-FEATURE-1` govern **are what establish one** — and
`-FEATURE-2`'s is required on a TV build without being TV-specific evidence, since it also serves
fake-touch and D-pad-only devices — so gating them on an established surface would make them unreachable
exactly when they are missing, the case that matters.
Their scope is instead the **shipping artefact**: a TV product flavour, variant or target, or a feature
asking for TV support, brings them into play, and a missing declaration is then a finding rather than a
reason to skip the section. The remaining rules — banner, store listing, track, bundle, signing — apply
once a TV target is intended.

Packaging is the one TV area where the platform dictates exact literals — these are Play
store-filtering and launcher behaviour, not house preference. `android.software.leanback` is a **feature
string, not a library**: nothing here requires or proposes any TV UI framework. `*(derived)*` marks a rule
recording a documented negative rather than a platform mandate.

- `AND-REL-TV-LAUNCH-1` The TV launcher activity's `<intent-filter>` declares `android.intent.action.MAIN` with `android.intent.category.LEANBACK_LAUNCHER`; without it Play hides the app on TV and the TV home screen never lists it.
- `AND-REL-TV-FEATURE-1` The manifest declares `<uses-feature android:name="android.software.leanback">` — the platform's TV-app declaration; a build shipping to mobile too sets `android:required="false"`.
- `AND-REL-TV-FEATURE-2` `android.hardware.touchscreen` is declared `android:required="false"`; the attribute defaults to `true`, so omitting the line silently filters the app out of Play on every TV device.
- `AND-REL-TV-FEATURE-3` The `android.hardware.*` features a TV may lack — faketouch, telephony, camera, nfc, location.gps, microphone, sensor, wifi — are declared not-required, and no `<uses-permission>` silently implies one.
- `AND-REL-TV-BANNER-1` The **in-app** `android:banner` on `<application>` or `<activity>` points at a 320x180 px xhdpi drawable carrying the app name, localised per language; there is no default banner.
- `AND-REL-TV-STORE-1` The Play listing carries the **separate** 1280x720 px store-listing TV banner — not the in-app drawable — and at least one TV screenshot; without both, Play will not publish.
- `AND-REL-TV-TRACK-1` Opting in to the Android TV form factor, and any move to the optional dedicated TV release track, is a recorded release decision — that track choice is irreversible.
- `AND-REL-TV-BUILD-1` The TV release ships as an Android App Bundle and meets Android TV's own Play target-API floor, which is lower than the phone floor and is re-checked, not assumed.
- `AND-REL-TV-SIGN-1` *(derived)* No TV-specific signing requirement is documented: the TV artefact is signed by the same release signing config or Play App Signing identity as the mobile artefact.

Left unpinned because official pages disagree or the policy moves: the banner's resource directory, the
Play Console menu path, and the target-API numbers.

**Nothing here is caught automatically.** The two strings `AND-REL-TV-LAUNCH-1` and `-FEATURE-1` require
are also the markers that **establish** a TV surface — which is why this section is scoped to the
shipping artefact rather than to an established surface. `-FEATURE-2`'s string is **required on a TV build
without being evidence of one**, since it also serves fake-touch and D-pad-only devices. Check all three
against the artefact's own manifest and build configuration, where their absence is the finding; never
infer compliance from a diff that omits the manifest.

## References

- Android Gradle Plugin, build-variant, app-signing, and R8 documentation (developer.android.com).
- Android TV packaging, the launcher and banner declarations, and Play Console TV distribution: the TV get-started, publishing and app-quality documentation (developer.android.com).
- Release-readiness process and the release checklist are owned by `standards/shared/release-readiness.md`; secrets/hardening rules are owned by `standards/shared/mobile-security.md`.
- This document is a living baseline; flag standards gaps found during release validation rather than working around them silently.
