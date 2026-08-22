```yaml
doc_schema_version: 3
feature: biometric-login
dd_link: docs/biometric-login-DD.md
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
date: 2026-01-02
```

## Feature Request
Let a returning user unlock the app with biometrics instead of the passcode.

## Repo Knowledge Reference
Source: `.ono/repo-knowledge.json` (contract v1, produced by ono-project-inspector 0.4.0, unknown @ n/a)

Derived live for this feature: structure, inventory, integrations, auditTopics

## Repo Context
Platform Detection: react-native [derived live]. Device Type: mobile [derived live].
Standards Conformance: feature-based layout [derived live].

## Proposed Technical Approach
Reuse the existing unlock screen; add a biometrics hook and an opt-in flag.

## Open Questions & Risks
None open.

## Approval
Approved.
