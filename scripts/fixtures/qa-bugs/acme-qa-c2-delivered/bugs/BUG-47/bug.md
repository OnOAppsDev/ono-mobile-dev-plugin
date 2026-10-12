# BUG-47 — Search results flicker on scroll

> Generated from the QA ledger (`qa-ledger/`) — a derived view, never read back. Do not edit; regenerate with `qa-ledger.mjs bug render`.

| Field | Value |
|---|---|
| Bug | bug:BUG-47 |
| State | assigned |
| Next action | Dev: fix — deliver a new build that claims the fix (/register-build --fixes) |
| Severity | minor |
| Origin | Standalone intake |
| Affected surfaces | android |
| Found in build | and-201 |
| Fix under test | — |
| Pending re-test surfaces | — |
| Fixed in build | — |
| Resolution | — |
| External reference | — |
| Assignee | — |
| Capability | — |
| Reported | dana, 2026-10-05T10:40:00.000Z |

## Summary

—

## Reproduction Steps

1. Search for shoes
2. Scroll the results quickly

**Expected:** Results scroll smoothly

**Actual:** Rows flicker and reload

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
| reproduction-20261005T104100Z-7066546e | and-201 | android | Pixel | reproduced | 2026-10-05T10:41:00.000Z | — |

## Re-test History

None.

## Evidence

None.

## History

| At | Event | Detail |
|---|---|---|
| 2026-10-05T10:40:00.000Z | reported | standalone intake |
| 2026-10-05T10:41:00.000Z | reproduction | reproduced on and-201 / android |
