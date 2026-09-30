---
qa_readiness_schema: 2
scope: bug:BUG-27
scope_kind: bug
dev_feature: null
qa_bug_id: BUG-27
external_ref: JIRA-4411
candidate_builds:
  - android-tv: atv-104
verdict: READY
blocker_count: 0
exception_count: 0
fingerprint: sha256:9842a81de57028c034dddc317a4027cd2354a8c8901c77ac4323d5f0df8847c6
freshness_token: sha256:f966897736a74a3d3d41a16deffe49cc5a9a19f977422c06bb820dc5acf0a842
generated_at: 2026-10-01T09:00:36.000Z
signed_off_by: lead
signed_off_date: 2026-10-01T09:00:37.000Z
signoff_fingerprint: sha256:9842a81de57028c034dddc317a4027cd2354a8c8901c77ac4323d5f0df8847c6
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
