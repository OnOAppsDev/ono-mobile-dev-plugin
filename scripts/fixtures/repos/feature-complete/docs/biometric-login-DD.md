```yaml
doc_schema_version: 2
feature: biometric-login
feature_analysis_link: docs/biometric-login-feature-analysis.md
design_reference_status: provided
design_reference_type: existing_ui
design_reference: the existing PasscodeUnlockScreen
figma_link: null
platform: react-native
device_type: mobile
repo_knowledge_status: available
repo_knowledge_schema: 1
repo_knowledge_fingerprint: null
repo_knowledge_freshness: unknown
repo_knowledge_reused: stack, commands, conventions
repo_knowledge_derived: structure, inventory, integrations, auditTopics
author: rn-architect
status: approved
detail_level: standard
dd_generation: single
dd_complexity_band: low
date: 2026-01-03
```

## 0. Repo Knowledge Reference
Cited from `.ono/repo-knowledge.json`.

## 19. Technical Implementation Approach
Add `useBiometrics` in the existing auth feature folder; persist the opt-in flag in the
existing store module. Follows `ARCH-LAYERS-3`, `STATE-BOUNDARY-2`.

## 20. Impacted Modules
`src/features/auth` — one new hook, one changed screen, one store field. 3 sites.

## 25. Acceptance Criteria Mapping
| # | Requirement | Acceptance Criterion | Source |
|---|---|---|---|
| 1 | Biometric unlock | Given enrolled biometrics, unlock succeeds | Feature analysis |

## 26. Definition of Ready for Development
- [x] All Open Questions in §24 are resolved

## Approval
Approved.
