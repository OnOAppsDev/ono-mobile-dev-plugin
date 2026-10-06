# BUG-44 — Player freezes after resume

> Generated from the QA ledger (`qa-ledger/`) — a derived view, never read back. Do not edit; regenerate with `qa-ledger.mjs bug render`.

| Field | Value |
|---|---|
| Bug | bug:BUG-44 |
| State | reopened |
| Next action | Dev: fix — deliver a new build that claims the fix (/register-build --fixes) |
| Severity | critical |
| Origin | Standalone intake |
| Affected surfaces | android-tv |
| Found in build | atv-201 |
| Fix under test | — |
| Pending re-test surfaces | — |
| Fixed in build | — |
| Resolution | — |
| External reference | — |
| Assignee | — |
| Capability | — |
| Reported | dana, 2026-10-05T10:10:00.000Z |

## Summary

—

## Reproduction Steps

1. Play a video
2. Press Home
3. Return to the app

**Expected:** Playback resumes

**Actual:** Frame frozen, audio continues

## Devices

None.

## Linked Test Cases

None.

## Related Scopes

None.

## Fix Claims

| Build | Claimed at | Outcome |
|---|---|---|
| atv-202 | 2026-10-05T10:12:00.000Z | failed |
| atv-206 | 2026-10-05T11:00:00.000Z | failed |

## Reproduction History

| Run | Build | Surface | Device | Outcome | At | Notes |
|---|---|---|---|---|---|---|
| reproduction-20261005T101100Z-d66ae036 | atv-201 | android-tv | Shield | reproduced | 2026-10-05T10:11:00.000Z | — |

## Re-test History

| Run | Build | Fix build | Surface | Device | Outcome | At | Notes |
|---|---|---|---|---|---|---|---|
| retest-20261005T101700Z-c555166e | atv-202 | atv-202 | android-tv | Shield | fail | 2026-10-05T10:17:00.000Z | Still frozen after resume from Home |
| retest-20261005T110500Z-8ca0b9f2 | atv-206 | atv-206 | android-tv | Shield | fail | 2026-10-05T11:05:00.000Z | Frozen again after resume from the screensaver |

## Evidence

- videos/BUG-44-atv-202.mp4
- videos/BUG-44-atv-206.mp4

## History

| At | Event | Detail |
|---|---|---|
| 2026-10-05T10:10:00.000Z | reported | standalone intake |
| 2026-10-05T10:11:00.000Z | reproduction | reproduced on atv-201 / android-tv |
| 2026-10-05T10:12:00.000Z | fix_claimed | build atv-202 |
| 2026-10-05T10:17:00.000Z | retest | fail on atv-202 / android-tv |
| 2026-10-05T10:17:00.000Z | reopened | fix in atv-202 failed on android-tv |
| 2026-10-05T11:00:00.000Z | fix_claimed | build atv-206 |
| 2026-10-05T11:05:00.000Z | retest | fail on atv-206 / android-tv |
| 2026-10-05T11:05:00.000Z | reopened | fix in atv-206 failed on android-tv |
