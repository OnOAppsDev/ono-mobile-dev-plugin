# Gradle Build & Signing

## Purpose & Scope

These standards cover the Android build configuration touched during feature work and validated at release: Gradle build variants and flavors, dependency management, signing configuration, and R8/ProGuard minification. They are applied by `feature-implementer` when a task changes build config, and cited by `mobile-release-engineer` / `performance-reviewer` in `/prepare-mobile-release` when the release ships an Android build. Each bullet carries a stable `AND-REL-*` ID. This is a baseline, not exhaustive — follow the repo's existing Gradle conventions (Groovy vs. Kotlin DSL, version catalogs, convention plugins) rather than imposing a different style.

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

## References

- Android Gradle Plugin, build-variant, app-signing, and R8 documentation (developer.android.com).
- Release-readiness process and the release checklist are owned by `standards/shared/release-readiness.md`; secrets/hardening rules are owned by `standards/shared/mobile-security.md`.
- This document is a living baseline; flag standards gaps found during release validation rather than working around them silently.
