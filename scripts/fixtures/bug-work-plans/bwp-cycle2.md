# Bug Work Plan — BUG-44: Player freezes after resume

```yaml
doc_schema_version: 1
work_type: bug
bug_key: BUG-44
qa_bug_id: BUG-44
external_ref: null
origin: qa-standalone
found_in_build: atv-201
platform: android
device_type: tv
surfaces: [android-tv]
capability: null
related_feature: null
bug_evidence_fingerprint: sha256:77e5143cb27ca22f1df34072ef30b9dd6973f9575c5e1b8e2675427e56572f89
fix_cycle: 2
repo_knowledge_status: unavailable
repo_knowledge_schema: null
repo_knowledge_fingerprint: null
repo_knowledge_freshness: null
repo_knowledge_reused: none
repo_knowledge_derived: none
author: android architect
status: draft
approved_by: null
approved_fingerprint: null
approved_cycle: null
date: 2026-10-06
```

## Reproduction Evidence

- [evidence: qa-ledger/scopes/bug/BUG-43.jsonl] Reproduced by QA on build `and-201`, surface `android`, device Pixel.
- Steps: add an item to the cart; apply coupon SAVE10; open checkout.

## Observed vs Expected

- **Observed:** [evidence: qa-ledger/scopes/bug/BUG-43.jsonl] Total shows the full price.
- **Expected:** [evidence: qa-ledger/scopes/bug/BUG-43.jsonl] Total shows the 10% discount.

## Affected Capability & Surfaces

- Surfaces: `android` [evidence: qa-ledger/scopes/bug/BUG-43.jsonl]
- Capability: not found in Project Knowledge [unknown]

## Root Cause

[evidence: app/src/main/java/com/acme/checkout/CheckoutTotals.kt] `total()` sums line prices before the coupon is applied; the discounted subtotal is computed but never read.

## Blast Radius

- [inference] Only the checkout total; the cart badge reads a separate subtotal.

## Fix Design

- **Root-cause fix:** compute the total from the discounted subtotal in `CheckoutTotals.total()`.
- **Minimal change surface:** one function in `CheckoutTotals.kt` and its unit test.
- **Affected files / areas:** `app/src/main/java/com/acme/checkout/CheckoutTotals.kt`
- **Non-goals:** coupon validation, cart badge, tax rounding.
- **No unrelated refactoring:** the totals class is not restructured.
- **Risks:** stacked coupons [inference]; covered by the regression test.

## Verification Strategy

- **Reproduction path:** add an item, apply SAVE10, open checkout on `and-201`-equivalent debug build.
- **Developer Testing:** unit test for `CheckoutTotals.total()` with and without a coupon.
- **Regression test:** `CheckoutTotalsTest.couponIsApplied` — fails before the fix, passes after.
- **Affected surfaces:** `android`.
- **QA re-test:** QA re-tests BUG-43 on the fix build on `android`.
- **Verification debt:** none.

## Tasks

| id | description | platform | files touched | depends-on | size | acceptance criteria |
|---|---|---|---|---|---|---|
| T1 | Add a failing regression test for the coupon total | android | `app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt` | — | S | The test fails on the current code for the documented reproduction |
| T2 | Compute the total from the discounted subtotal | android | `app/src/main/java/com/acme/checkout/CheckoutTotals.kt` | T1 | S | T1's test passes; existing totals tests pass |

## Fix Cycles

Cycle 1 is the Tasks section above.

### Cycle 2

- **Failed build:** atv-202
- **Failed surfaces:** android-tv
- **Failed re-test evidence:** [evidence: qa-ledger/runs/retest-20261005T101700Z-c555166e.jsonl] Still frozen after resume from Home; videos/BUG-44-atv-202.mp4
- **Fix-design delta:** the cycle 1 fix released the surface on pause but did not re-attach it on resume from Home; re-attach in `onResume`.

| id | description | platform | files touched | depends-on | size | acceptance criteria |
|---|---|---|---|---|---|---|
| C2-T1 | Add a regression test for resume from Home | android | `app/src/test/java/com/acme/player/PlayerSurfaceTest.kt` | — | S | The test fails on atv-202's code path |
| C2-T2 | Re-attach the video surface on resume | android | `app/src/main/java/com/acme/player/PlayerSurface.kt` | C2-T1 | S | C2-T1's test passes; cycle 1 tests still pass |

## Repo Knowledge Reference

Canonical repository knowledge was unavailable; repository facts above are point-in-time observations.

## Open Questions

- None.
