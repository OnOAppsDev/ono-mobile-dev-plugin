# BUG-43 — Checkout total ignores coupon

> Generated from the QA ledger (`qa-ledger/`) — a derived view, never read back. Do not edit; regenerate with `qa-ledger.mjs bug render`.

| Field | Value |
|---|---|
| Bug | bug:BUG-43 |
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
| External reference | PAY-1182 |
| Assignee | — |
| Capability | — |
| Reported | dana, 2026-10-05T10:08:00.000Z |

## Summary

—

## Reproduction Steps

1. Add an item to the cart
2. Apply coupon SAVE10
3. Open checkout

**Expected:** Total shows the 10% discount

**Actual:** Total shows the full price

## Devices

None.

## Linked Test Cases

None.

## Related Scopes

- feature:checkout

## Fix Claims

None.

## Reproduction History

| Run | Build | Surface | Device | Outcome | At | Notes |
|---|---|---|---|---|---|---|
| reproduction-20261005T100900Z-5b31c81b | and-201 | android | Pixel | reproduced | 2026-10-05T10:09:00.000Z | Reproduced on first try |

## Re-test History

None.

## Evidence

None.

## History

| At | Event | Detail |
|---|---|---|
| 2026-10-05T10:08:00.000Z | reported | standalone intake |
| 2026-10-05T10:09:00.000Z | reproduction | reproduced on and-201 / android |
