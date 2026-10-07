# BUG-27 — Player freezes after resume

> Generated from the QA ledger (`qa-ledger/`) — a derived view, never read back. Do not edit; regenerate with `qa-ledger.mjs bug render`.

| Field | Value |
|---|---|
| Bug | bug:BUG-27 |
| State | closed_verified |
| Next action | None — the bug is closed |
| Severity | major |
| Origin | Standalone intake |
| Affected surfaces | android-tv |
| Found in build | atv-103 |
| Fix under test | — |
| Pending re-test surfaces | — |
| Fixed in build | atv-104 |
| Resolution | verified |
| External reference | JIRA-4411 |
| Assignee | — |
| Capability | — |
| Reported | dana, 2026-10-01T09:00:26.000Z |

## Summary

—

## Reproduction Steps

1. Resume

**Expected:** Plays

**Actual:** Frozen

## Devices

None.

## Linked Test Cases

None.

## Related Scopes

None.

## Fix Claims

| Build | Claimed at | Outcome |
|---|---|---|
| atv-104 | 2026-10-01T09:00:29.000Z | verified |

## Reproduction History

| Run | Build | Surface | Device | Outcome | At | Notes |
|---|---|---|---|---|---|---|
| reproduction-20261001T090028Z-ad06fc42 | atv-103 | android-tv | Shield | reproduced | 2026-10-01T09:00:28.000Z | — |

## Re-test History

| Run | Build | Fix build | Surface | Device | Outcome | At | Notes |
|---|---|---|---|---|---|---|---|
| retest-20261001T090035Z-db166494 | atv-104 | atv-104 | android-tv | Shield | pass | 2026-10-01T09:00:35.000Z | — |

## Evidence

None.

## History

| At | Event | Detail |
|---|---|---|
| 2026-10-01T09:00:26.000Z | reported | standalone intake |
| 2026-10-01T09:00:28.000Z | reproduction | reproduced on atv-103 / android-tv |
| 2026-10-01T09:00:29.000Z | fix_claimed | build atv-104 |
| 2026-10-01T09:00:35.000Z | retest | pass on atv-104 / android-tv |
| 2026-10-01T09:00:35.000Z | closed | verified on android-tv with atv-104 |
