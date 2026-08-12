# Feature Analysis — Channel Guide Overlay

```yaml
doc_schema_version: 3
feature: channel-guide-overlay
dd_link:
design_reference_status: provided
design_reference_type: figma
design_reference: null
figma_link: https://www.figma.com/design/Ab1Cd2Ef3/Channel-Guide?node-id=204-1180#guide-overlay
platform: android
device_type: tv
repo_knowledge_status: unavailable
repo_knowledge_schema: null
repo_knowledge_fingerprint: null
repo_knowledge_freshness: null
repo_knowledge_reused: none
repo_knowledge_derived: stack, commands, structure, inventory, conventions, integrations, auditTopics
author: android-architect
status: approved
date: 2026-03-02
migrated_from_version: 1
migrated_by: ono-mobile-dev-plugin 0.5.0
```

## Feature Request

Show a channel guide as an overlay on top of live playback, dismissable with the
back key, without tearing down the player.

## Repo Conventions Detected

- Platform Detection: `settings.gradle.kts` + `app/build.gradle.kts`, Kotlin only. Confidence: High.
- UI: the in-house `tv-surface` module, not Leanback and not Compose for TV.
- Navigation: single-activity, fragment-per-surface, routed through `TvRouter`.
- Testing: JUnit 5 + Robolectric.

## Proposed Technical Approach

- Surfaces: a new `ChannelGuideOverlayFragment` hosted by the existing playback activity (AND-NAV-2).
- State & Data: the existing `GuideRepository`; no new data source (AND-ARCH-3).
- Module Placement: `:feature:guide` (AND-ARCH-FOLDERS-1).

## Open Questions & Risks

- Focus restoration on dismiss is the main risk; the overlay must return focus
  to the transport controls rather than to the surface root.

## Approval

Reviewed and approved 2026-03-04.
