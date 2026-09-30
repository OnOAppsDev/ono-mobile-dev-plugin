---
qa_readiness_schema: 2
scope: feature:checkout
scope_kind: feature
dev_feature: checkout
qa_bug_id: null
external_ref: null
candidate_builds:
  - android: 104
verdict: READY_WITH_EXCEPTIONS
blocker_count: 0
exception_count: 3
fingerprint: sha256:8dab0a23176676b6dd430ee5fa2e29107b108197f6a80497e333c68e6561d21e
freshness_token: sha256:deb3704d30720a4dc2866ac72cf853b2d7c22d26d364d67d9f0d279ce34770b8
generated_at: 2026-10-01T09:00:24.000Z
signed_off_by: lead
signed_off_date: 2026-10-01T09:00:25.000Z
signoff_fingerprint: sha256:8dab0a23176676b6dd430ee5fa2e29107b108197f6a80497e333c68e6561d21e
signoff_status: valid
---

# QA Readiness — feature:checkout

> Generated from the QA ledger — a derived view, never read back. Regenerate with `qa-ledger.mjs readiness render`.

**Verdict: READY_WITH_EXCEPTIONS**

## Blockers

| Blocker | Rule | Detail | Exception |
|---|---|---|---|
| R8:HV-ce5b0074 | R8 | QA debt HV-ce5b0074 (VoiceOver walkthrough of the Payment screen) is not discharged | EX-1 |
| R8:HV-5cecbf88 | R8 | QA debt HV-5cecbf88 (Manual RTL walkthrough of the Confirmation screen in Hebrew) is not discharged | EX-2 |
| R8:HV-a11y-not-recorded | R8 | QA debt HV-a11y-not-recorded (Accessibility status is notRecorded (or missing) for part of this handoff — QA must verify accessibility; it is not covered) is not discharged | EX-3 |

## Per-Surface Matrix

| Surface | Candidate build | Pinned | Smoke | Functional (pass / total) | Regression |
|---|---|---|---|---|---|
| android | 104 | no | passed | 6 / 6 | n/a |

## Smoke

| Surface | Build | Status |
|---|---|---|
| android | 104 | passed |

## Functional

| Surface | Pass | Fail | Blocked | Not run | Stale | Pending | Excluded |
|---|---|---|---|---|---|---|---|
| android | 6 | 0 | 0 | 0 | 0 | 0 | 0 |

## Regression

RD-1: not required — Isolated change

## Bugs

None.

## Retests

None.

## QA Debt

| Debt | Description | Discharged |
|---|---|---|
| HV-ce5b0074 | VoiceOver walkthrough of the Payment screen | no |
| HV-5cecbf88 | Manual RTL walkthrough of the Confirmation screen in Hebrew | no |
| HV-a11y-not-recorded | Accessibility status is notRecorded (or missing) for part of this handoff — QA must verify accessibility; it is not covered | no |

## Exceptions

| Exception | Item | Kind | Reason | Approved by | Date | Build | Applied |
|---|---|---|---|---|---|---|---|
| EX-1 | R8:HV-ce5b0074 | waived_debt | Scheduled after launch: HV-ce5b0074 | lead | 2026-10-01T09:00:22.000Z | — | yes |
| EX-2 | R8:HV-5cecbf88 | waived_debt | Scheduled after launch: HV-5cecbf88 | lead | 2026-10-01T09:00:23.000Z | — | yes |
| EX-3 | R8:HV-a11y-not-recorded | waived_debt | Scheduled after launch: HV-a11y-not-recorded | lead | 2026-10-01T09:00:24.000Z | — | yes |

## Known Issues

None.

## Tested Builds

- 104

## QA Notes

Checked on Pixel 8

## Release Notes Input

- Scope: feature:checkout (Dev feature checkout)
- Bug fixes verified: none
- Builds tested: 104
- Surfaces tested: android
- Known issues: none
- Exceptions: EX-1 R8:HV-ce5b0074 (waived_debt); EX-2 R8:HV-5cecbf88 (waived_debt); EX-3 R8:HV-a11y-not-recorded (waived_debt)
- QA verdict: READY_WITH_EXCEPTIONS
