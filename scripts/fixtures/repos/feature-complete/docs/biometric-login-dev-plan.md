```yaml
doc_schema_version: 1
feature: biometric-login
dd_link: docs/biometric-login-DD.md
design_reference_status: provided
design_reference_type: existing_ui
design_reference: the existing PasscodeUnlockScreen
figma_link: null
platform: react-native
device_type: mobile
author: rn-architect
status: approved
date: 2026-01-04
```

## Overview
Biometric unlock for returning users.

## Task Breakdown
See docs/biometric-login-task-breakdown.md.

## Sequencing & Dependencies
T1 then T2 then T3.

## Rollback Plan
Revert the commit; the opt-in flag defaults off.

## Approval
Approved.
