# Bug Work Plan fixtures

Valid `bug-work-plan` v1 documents used by `scripts/bug-work-plan.test.ts`
(contract: `docs/bug-work-plan-contract.md`). Each test derives its invalid variants from
these by one exact, asserted edit, so a fixture change cannot silently weaken a check.

| File | Shape |
|---|---|
| `bwp-cycle1.md` | QA bug `BUG-43`: cycle 1 only (`T1`, `T2`), empty Fix Cycles, `fix_cycle: 1`. Its `bug_evidence_fingerprint` is the one bug intake computes for `BUG-43` in `scripts/fixtures/qa-bugs`. |
| `bwp-cycle2.md` | QA bug `BUG-44`, reopened: cycle 1 plus an appended `### Cycle 2` (`C2-T1`, `C2-T2`), `fix_cycle: 2`. The body above Fix Cycles is reused from `bwp-cycle1.md`, because only the shape matters here. |
