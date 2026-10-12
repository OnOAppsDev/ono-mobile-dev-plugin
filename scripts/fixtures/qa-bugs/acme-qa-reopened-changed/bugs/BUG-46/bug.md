# BUG-46 — Search keyboard hides results

> Generated from the QA ledger (`qa-ledger/`) — a derived view, never read back. Do not edit; regenerate with `qa-ledger.mjs bug render`.

| Field | Value |
|---|---|
| Bug | bug:BUG-46 |
| State | fix_delivered |
| Next action | QA: re-test the fix build on every pending surface (/retest-bug) |
| Severity | minor |
| Origin | Standalone intake |
| Affected surfaces | android |
| Found in build | and-201 |
| Fix under test | and-202 |
| Pending re-test surfaces | android |
| Fixed in build | — |
| Resolution | — |
| External reference | — |
| Assignee | — |
| Capability | — |
| Reported | dana, 2026-10-05T10:26:00.000Z |

## Summary

—

## Reproduction Steps

1. Open search
2. Type two letters

**Expected:** Results stay visible above the keyboard

**Actual:** Keyboard covers results

## Devices

None.

## Linked Test Cases

None.

## Related Scopes

None.

## Fix Claims

| Build | Claimed at | Outcome |
|---|---|---|
| and-202 | 2026-10-05T10:28:00.000Z | pending |

## Reproduction History

| Run | Build | Surface | Device | Outcome | At | Notes |
|---|---|---|---|---|---|---|
| reproduction-20261005T102700Z-4eee4b71 | and-201 | android | Pixel | reproduced | 2026-10-05T10:27:00.000Z | — |

## Re-test History

None.

## Evidence

None.

## History

| At | Event | Detail |
|---|---|---|
| 2026-10-05T10:26:00.000Z | reported | standalone intake |
| 2026-10-05T10:27:00.000Z | reproduction | reproduced on and-201 / android |
| 2026-10-05T10:28:00.000Z | fix_claimed | build and-202 |
