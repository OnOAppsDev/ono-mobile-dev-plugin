# Feature Analysis — Saved Items Shelf

```yaml
doc_schema_version: 3
feature: saved-items-shelf
dd_link:
design_reference_status: provided
design_reference_type: document
design_reference: docs/specs/saved-items.md
figma_link: null
platform: react-native
device_type: mobile
repo_knowledge_status: unavailable
repo_knowledge_schema: null
repo_knowledge_fingerprint: null
repo_knowledge_freshness: null
repo_knowledge_reused: none
repo_knowledge_derived: stack, commands, structure, inventory, conventions, integrations, auditTopics
author: rn-architect
status: approved
date: 2026-01-14
migrated_from_version: 0
migrated_by: ono-mobile-dev-plugin 0.5.0
migration_inputs: platform=human@migration, device_type=human@migration, design_reference_status=human@migration, design_reference_type=human@migration, design_reference=human@migration
```

## Feature Request

Let a signed-in viewer save an item from the catalogue and see everything they
have saved on a dedicated shelf, reachable from the profile tab.

## Repo Conventions Detected

- Navigation: React Navigation 6, native stack, routes registered in `src/navigation/RootNavigator.tsx`.
- State Management: Redux Toolkit, one slice per feature under `src/store/slices/`.
- Data Fetching: RTK Query, endpoints injected via `src/services/api/baseApi.ts`.
- Testing: Jest + React Native Testing Library.
- Folder Structure: feature-first under `src/features/<feature>/`.

## Proposed Technical Approach

- Screens: a new `SavedItemsScreen`, registered on the profile stack (NAV-STACK-1).
- State & Data: a `savedItems` RTK Query endpoint group, no local slice (STATE-RTK-2).
- Folder Placement: `src/features/saved-items/` (ARCH-FOLDERS-1).

## Open Questions & Risks

- Whether the shelf paginates is unresolved; the catalogue endpoint already
  supports a cursor, so this is a product decision rather than a technical one.

## Approval

Reviewed and approved 2026-01-16.
