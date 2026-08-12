---
doc_schema_version: 3
feature: profile-avatar-upload
dd_link:
design_reference_status: provided
design_reference_type: figma
design_reference: null
figma_link: https://www.figma.com/design/Qq4Rr5/Profile?node-id=88-401
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
date: 2026-05-06
migrated_from_version: 2
migrated_by: ono-mobile-dev-plugin 0.5.0
---

# Feature Analysis — Profile Avatar Upload

## Feature Request

Let a viewer replace their profile avatar from the camera roll, with a crop step
and an optimistic update on the profile header.

## Repo Conventions Detected

- Navigation: React Navigation 6, native stack.
- State Management: Redux Toolkit + RTK Query.
- Image handling: `react-native-image-picker`, already a dependency.

## Proposed Technical Approach

- Screens: reuse `ProfileScreen`; add an `AvatarCropSheet` bottom sheet.
- State & Data: a `uploadAvatar` mutation on the existing profile endpoint group.

## Open Questions & Risks

- Upload size limits are enforced server-side only; the client should mirror them.

## Approval

Reviewed and approved 2026-05-08.
