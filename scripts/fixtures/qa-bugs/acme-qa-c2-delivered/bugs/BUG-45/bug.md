# BUG-45 — Back exits from the player

> Generated from the QA ledger (`qa-ledger/`) — a derived view, never read back. Do not edit; regenerate with `qa-ledger.mjs bug render`.

| Field | Value |
|---|---|
| Bug | bug:BUG-45 |
| State | closed_verified |
| Next action | None — the bug is closed |
| Severity | major |
| Origin | Standalone intake |
| Affected surfaces | android-tv |
| Found in build | atv-201 |
| Fix under test | — |
| Pending re-test surfaces | — |
| Fixed in build | atv-203 |
| Resolution | verified |
| External reference | — |
| Assignee | — |
| Capability | — |
| Reported | dana, 2026-10-05T10:18:00.000Z |

## Summary

—

## Reproduction Steps

1. Open a video
2. Press Back

**Expected:** Returns to the detail screen

**Actual:** App exits

## Devices

None.

## Linked Test Cases

None.

## Related Scopes

None.

## Fix Claims

| Build | Claimed at | Outcome |
|---|---|---|
| atv-203 | 2026-10-05T10:20:00.000Z | verified |

## Reproduction History

| Run | Build | Surface | Device | Outcome | At | Notes |
|---|---|---|---|---|---|---|
| reproduction-20261005T101900Z-58838eb3 | atv-201 | android-tv | Shield | reproduced | 2026-10-05T10:19:00.000Z | — |

## Re-test History

| Run | Build | Fix build | Surface | Device | Outcome | At | Notes |
|---|---|---|---|---|---|---|---|
| retest-20261005T102500Z-2248a0f8 | atv-203 | atv-203 | android-tv | Shield | pass | 2026-10-05T10:25:00.000Z | — |

## Evidence

None.

## History

| At | Event | Detail |
|---|---|---|
| 2026-10-05T10:18:00.000Z | reported | standalone intake |
| 2026-10-05T10:19:00.000Z | reproduction | reproduced on atv-201 / android-tv |
| 2026-10-05T10:20:00.000Z | fix_claimed | build atv-203 |
| 2026-10-05T10:25:00.000Z | retest | pass on atv-203 / android-tv |
| 2026-10-05T10:25:00.000Z | closed | verified on android-tv with atv-203 |
