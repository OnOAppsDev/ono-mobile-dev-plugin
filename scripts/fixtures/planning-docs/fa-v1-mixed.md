# Feature Analysis — Shared Auth Session

```yaml
feature: shared-auth-session
dd_link:
figma_link: https://www.figma.com/design/Zz9Yy8/Auth?node-id=11-2
platform: mixed
device_type: mobile
author: rn-architect
status: approved
date: 2026-02-11
```

## Feature Request

Keep a signed-in session alive across the mobile app and the web dashboard so a
viewer does not re-authenticate when moving between them.

## Repo Conventions Detected

- Platform Detection: a React Native app under `apps/mobile/` and a React web app
  under `apps/web/`, sharing `packages/auth/`. Confidence: Medium — two candidates.
- State Management: Redux Toolkit in both apps.

## Proposed Technical Approach

- Shared token refresh in `packages/auth/`, consumed by both apps.

## Open Questions & Risks

- The platform was recorded as `mixed`, which later contract versions forbid.

## Approval

Reviewed and approved 2026-02-13.
