# BUG-41 — Subtitles vanish after seek

> Generated from the QA ledger (`qa-ledger/`) — a derived view, never read back. Do not edit; regenerate with `qa-ledger.mjs bug render`.

| Field | Value |
|---|---|
| Bug | bug:BUG-41 |
| State | new |
| Next action | QA: verify — reproduce it on a registered build (/verify-bug) |
| Severity | minor |
| Origin | Standalone intake |
| Affected surfaces | android-tv |
| Found in build | — |
| Fix under test | — |
| Pending re-test surfaces | — |
| Fixed in build | — |
| Resolution | — |
| External reference | — |
| Assignee | — |
| Capability | — |
| Reported | dana, 2026-10-05T10:05:00.000Z |

## Summary

—

## Reproduction Steps

1. Play a video with subtitles
2. Seek forward 30 seconds

**Expected:** Subtitles keep showing

**Actual:** Subtitles disappear until restart

## Devices

None.

## Linked Test Cases

None.

## Related Scopes

None.

## Fix Claims

None.

## Reproduction History

None.

## Re-test History

None.

## Evidence

None.

## History

| At | Event | Detail |
|---|---|---|
| 2026-10-05T10:05:00.000Z | reported | standalone intake |
