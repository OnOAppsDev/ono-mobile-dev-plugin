# Feature Analysis — Voice Search Entry Point

```yaml
doc_schema_version: 3
feature: voice-search-entry-point
dd_link:
design_reference_status: provided
design_reference_type: figma
design_reference: null
figma_link: https://www.figma.com/design/Tt6Uu7/Search?node-id=140-22
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
date: 2026-01-28
migrated_from_version: 0
migrated_by: ono-mobile-dev-plugin 0.5.0
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
