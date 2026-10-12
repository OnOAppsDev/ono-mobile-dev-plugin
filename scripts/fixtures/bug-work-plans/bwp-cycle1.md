# Bug Work Plan — BUG-43: Checkout total ignores coupon

```yaml
doc_schema_version: 1
work_type: bug
bug_key: BUG-43
qa_bug_id: BUG-43
external_ref: PAY-1182
origin: qa-standalone
found_in_build: and-201
platform: android
device_type: mobile
surfaces: [android]
capability: null
related_feature: checkout-coupons
bug_evidence_fingerprint: sha256:95d68ae65a0758e098e12de059aec106752c1c4e0e21502486395fefce9633b6
fix_cycle: 1
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

No additional fix cycles yet. Cycle 1 is the Tasks section above.

## Repo Knowledge Reference

Canonical repository knowledge was unavailable; repository facts above are point-in-time observations.

## Open Questions

- None.
