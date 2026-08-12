# Feature Analysis — Shared Auth Session

```yaml
doc_schema_version: 3
feature: shared-auth-session
dd_link:
design_reference_status: provided
design_reference_type: figma
design_reference: null
figma_link: https://www.figma.com/design/Zz9Yy8/Auth?node-id=11-2
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
date: 2026-02-11
migrated_from_version: 1
migrated_by: ono-mobile-dev-plugin 0.5.0
migration_inputs: platform=human@migration
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
