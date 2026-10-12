---
qa_readiness_schema: 2
scope: bug:BUG-28
scope_kind: bug
dev_feature: null
qa_bug_id: BUG-28
external_ref: JIRA-4411
candidate_builds:
  - android-tv: null
verdict: NOT_READY
blocker_count: 3
exception_count: 0
fingerprint: sha256:5bf243b54a604b4a2b81c035452e23f45c0e7890a88a2aff7e6b414d4e85a0ff
freshness_token: sha256:fdd131f86bfa2a65711c434c451c852095afc29370a82d254dbc2f6f843ac29c
generated_at: 2026-10-01T09:00:38.000Z
signed_off_by: null
signed_off_date: null
signoff_fingerprint: null
signoff_status: none
artifact_integrity: sha256:c08ba4da3d04f41ac64d276e7546618c4c2827709ed61854c3c6fa8e57532d4f
---

# QA Readiness — bug:BUG-28

> Generated from the QA ledger — a derived view, never read back. Regenerate with `qa-ledger.mjs readiness render`.

**Verdict: NOT_READY**

## Blockers

| Blocker | Rule | Detail | Exception |
|---|---|---|---|
| R4:bug:BUG-28 | R4 | bug:BUG-28 (minor) is new | — |
| R6 | R6 | no regression decision is recorded — /plan-regression | — |
| R9:android-tv:candidate | R9 | no accepted build on android-tv — smoke has not passed on any build, and none is pinned | — |

## Per-Surface Matrix

| Surface | Candidate build | Pinned | Smoke | Functional (pass / total) | Regression |
|---|---|---|---|---|---|
| android-tv | — | no | no_build | n/a | n/a |

## Smoke

| Surface | Build | Status |
|---|---|---|
| android-tv | — | no_build |

## Functional

Not applicable — a bug scope has no feature plan.

## Regression

No decision recorded.

## Bugs

| Bug | Severity | State | Fixed in |
|---|---|---|---|
| bug:BUG-28 | minor | new | — |

## Retests

None.

## QA Debt

None.

## Exceptions

None.

## Known Issues

None.

## Tested Builds

None.

## QA Notes

—

## Release Notes Input

- Scope: bug:BUG-28
- Bug fixes verified: none
- Builds tested: none
- Surfaces tested: android-tv
- Known issues: none
- Exceptions: none
- QA verdict: NOT_READY
