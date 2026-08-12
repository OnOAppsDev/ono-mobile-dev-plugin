# Feature Analysis — Saved Items Shelf

```yaml
feature: saved-items-shelf
dd_link:
figma_link:
author: rn-architect
status: approved
date: 2026-01-14
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
