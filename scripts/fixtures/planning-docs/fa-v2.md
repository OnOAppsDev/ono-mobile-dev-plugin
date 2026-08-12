---
feature: profile-avatar-upload
dd_link:
design_reference_status: provided
design_reference_type: figma
design_reference: null
figma_link: https://www.figma.com/design/Qq4Rr5/Profile?node-id=88-401
platform: react-native
device_type: mobile
author: rn-architect
status: approved
date: 2026-05-06
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
