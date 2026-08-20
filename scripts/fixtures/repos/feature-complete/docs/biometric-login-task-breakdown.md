```yaml
doc_schema_version: 1
feature: biometric-login
feature_analysis_link: docs/biometric-login-feature-analysis.md
dd_link: docs/biometric-login-DD.md
dev_plan_link: docs/biometric-login-dev-plan.md
qa_handoff_link:
design_reference_status: provided
design_reference_type: existing_ui
design_reference: the existing PasscodeUnlockScreen
figma_link: null
platform: react-native
device_type: mobile
status: approved
date: 2026-01-04
```

| id | description | platform | files touched | depends-on | size | acceptance criteria |
|---|---|---|---|---|---|---|
| T1 | Add the biometrics hook | react-native | `src/features/auth/useBiometrics.ts` | — | S | Hook reports availability |
| T2 | Wire the unlock screen | react-native | `src/features/auth/UnlockScreen.tsx` | T1 | M | Unlocks on success |
| T3 | Persist the opt-in flag | react-native | `src/features/auth/authSlice.ts` | T1, T2 | S | Flag survives restart |
