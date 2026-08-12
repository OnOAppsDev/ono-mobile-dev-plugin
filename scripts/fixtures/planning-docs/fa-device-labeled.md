# Feature Analysis — Voice Search Entry Point

```yaml
feature: voice-search-entry-point
dd_link:
figma_link: https://www.figma.com/design/Tt6Uu7/Search?node-id=140-22
platform: android
author: android-architect
status: approved
date: 2026-01-28
```

## Feature Request

Add a microphone affordance to the search bar that hands off to the platform
voice input and pre-fills the query.

## Repo Conventions Detected

### Platform Detection
Gradle + Kotlin, single app module. Confidence: High.

### Device Type: tv
Resolved from the launcher intent filter and the in-house `tv-surface` module.
Confidence: High.

### Stack Detection
- Navigation: single-activity, fragment-per-surface.
- Testing: JUnit 5 + Robolectric.

## Proposed Technical Approach

- Surfaces: extend the existing `SearchFragment` (AND-NAV-2).

## Open Questions & Risks

- None outstanding.

## Approval

Reviewed and approved 2026-01-30.
