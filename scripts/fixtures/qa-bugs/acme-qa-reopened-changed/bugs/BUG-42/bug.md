# BUG-42 — Login spinner never ends

> Generated from the QA ledger (`qa-ledger/`) — a derived view, never read back. Do not edit; regenerate with `qa-ledger.mjs bug render`.

| Field | Value |
|---|---|
| Bug | bug:BUG-42 |
| State | verification_blocked |
| Next action | QA: verify — reproduce it on a registered build (/verify-bug) |
| Severity | major |
| Origin | Standalone intake |
| Affected surfaces | android |
| Found in build | — |
| Fix under test | — |
| Pending re-test surfaces | — |
| Fixed in build | — |
| Resolution | — |
| External reference | — |
| Assignee | — |
| Capability | — |
| Reported | dana, 2026-10-05T10:06:00.000Z |

## Summary

—

## Reproduction Steps

1. Open the app signed out
2. Sign in

**Expected:** Home screen

**Actual:** Spinner forever

## Devices

None.

## Linked Test Cases

None.

## Related Scopes

None.

## Fix Claims

None.

## Reproduction History

| Run | Build | Surface | Device | Outcome | At | Notes |
|---|---|---|---|---|---|---|
| reproduction-20261005T100700Z-c07f943d | and-201 | android | Pixel | blocked | 2026-10-05T10:07:00.000Z | Staging auth down |

## Re-test History

None.

## Evidence

None.

## History

| At | Event | Detail |
|---|---|---|
| 2026-10-05T10:06:00.000Z | reported | standalone intake |
| 2026-10-05T10:07:00.000Z | reproduction | blocked on and-201 / android |
