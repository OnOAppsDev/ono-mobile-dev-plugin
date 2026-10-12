# BUG-50 — Saved card is not preselected

> Generated from the QA ledger (`qa-ledger/`) — a derived view, never read back. Do not edit; regenerate with `qa-ledger.mjs bug render`.

| Field | Value |
|---|---|
| Bug | bug:BUG-50 |
| State | assigned |
| Next action | Dev: fix — deliver a new build that claims the fix (/register-build --fixes) |
| Severity | major |
| Origin | Standalone intake |
| Affected surfaces | android |
| Found in build | and-201 |
| Fix under test | — |
| Pending re-test surfaces | — |
| Fixed in build | — |
| Resolution | — |
| External reference | — |
| Assignee | — |
| Capability | checkout-payments |
| Reported | dana, 2026-10-05T10:50:00.000Z |

## Summary

—

## Reproduction Steps

1. Add a card at checkout
2. Leave and reopen checkout

**Expected:** The saved card is preselected

**Actual:** No payment method is selected

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
| reproduction-20261005T105100Z-a83519e2 | and-201 | android | Pixel | reproduced | 2026-10-05T10:51:00.000Z | — |

## Re-test History

None.

## Evidence

None.

## History

| At | Event | Detail |
|---|---|---|
| 2026-10-05T10:50:00.000Z | reported | standalone intake |
| 2026-10-05T10:51:00.000Z | reproduction | reproduced on and-201 / android |
| 2026-10-05T10:52:00.000Z | capability_set | checkout-payments |
