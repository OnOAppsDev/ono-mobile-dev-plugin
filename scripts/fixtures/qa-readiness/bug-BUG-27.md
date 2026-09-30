---
qa_readiness_schema: 1
scope: bug:BUG-27
scope_kind: bug
candidate_builds:
  - android-tv: atv-104
verdict: READY
blocker_count: 0
exception_count: 0
fingerprint: sha256:827ef56e7a3aca63d93b3416a128ab4508e8cd1fd3901f656f4d82614dcd8e57
generated_at: 2026-10-01T09:00:36.000Z
signed_off_by: lead
signed_off_date: 2026-10-01T09:00:37.000Z
signoff_fingerprint: sha256:827ef56e7a3aca63d93b3416a128ab4508e8cd1fd3901f656f4d82614dcd8e57
signoff_status: valid
---

# QA Readiness — bug:BUG-27

> Generated from the QA ledger — a derived view, never read back. Regenerate with `qa-ledger.mjs readiness render`.

**Verdict: READY**

## Blockers

None.

## Per-Surface Matrix

| Surface | Candidate build | Pinned | Smoke | Functional (pass / total) | Regression |
|---|---|---|---|---|---|
| android-tv | atv-104 | no | passed | n/a | n/a |

## Smoke

| Surface | Build | Status |
|---|---|---|
| android-tv | atv-104 | passed |

## Functional

Not applicable — a bug scope has no feature plan.

## Regression

RD-1: not required — Player only

## Bugs

| Bug | Severity | State | Fixed in |
|---|---|---|---|
| bug:BUG-27 | major | closed_verified | atv-104 |

## Retests

| Bug | Build | Surface | Outcome |
|---|---|---|---|
| bug:BUG-27 | atv-104 | android-tv | pass |

## QA Debt

None.

## Exceptions

None.

## Known Issues

None.

## Tested Builds

- atv-103
- atv-104

## QA Notes

—

## Release Notes Input

- Scope: bug:BUG-27
- Bug fixes verified: bug:BUG-27 (fixed in atv-104)
- Builds tested: atv-103, atv-104
- Surfaces tested: android-tv
- Known issues: none
- Exceptions: none
- QA verdict: READY
