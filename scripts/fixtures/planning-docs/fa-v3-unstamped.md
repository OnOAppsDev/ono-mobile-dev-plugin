# Feature Analysis — Continue Watching Row

```yaml
feature: continue-watching-row
dd_link:
design_reference_status: provided
design_reference_type: figma
design_reference: null
figma_link: https://www.figma.com/design/Mm7Nn8/Home?node-id=310-77
platform: react-native
device_type: mobile
repo_knowledge_status: available
repo_knowledge_schema: 1
repo_knowledge_fingerprint: 4f1c9ab2d3e5f6071829304a5b6c7d8e9f001122
repo_knowledge_freshness: fresh
repo_knowledge_reused: stack, commands, structure, inventory, conventions, integrations, auditTopics
repo_knowledge_derived: none
author: rn-architect
status: approved
date: 2026-07-30
```

## Repo Knowledge Reference

Source: `.ono/repo-knowledge.json` (contract v1, produced by ono-project-inspector 0.8.0, fresh @ 4f1c9ab2)

| Category | Reused from | Section |
|---|---|---|
| conventions | `docs/project/patterns.md` | `#state-management`, `#navigation-patterns` |
| inventory | `docs/project/components.md` | `#screens`, `#reusable-ui-components` |

Derived live for this feature: none

## Feature Request

Show a "Continue watching" row at the top of Home for any viewer with in-progress
playback, ordered by most recently watched.

## Repo Context

### Platform Detection
React Native 0.74 workspace, single app. Confidence: High. [derived live]

### Device Type
mobile. Confidence: High. [derived live]

### Stack Detection
- Navigation: React Navigation 6 [reused: docs/project/patterns.md#navigation-patterns]
- State Management: Redux Toolkit [reused: docs/project/patterns.md#state-management]

### Standards Conformance
Folder structure matches ARCH-FOLDERS-1. [derived live]

## Proposed Technical Approach

- Screens: reuse `HomeScreen`; add a `ContinueWatchingRow` component.
- State & Data: a `continueWatching` RTK Query endpoint (STATE-RTK-2).

## Open Questions & Risks

- None outstanding.

## Approval

Reviewed and approved 2026-08-01.
