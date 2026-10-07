---
work_type: bug # always `bug` — this is a bug fix's QA handoff, never a feature's
bug_key: # the canonical Dev bug key (scripts/bug-intake.ts)
qa_bug_id: null # the QA bug id, or null — QA must then create or bind a QA bug before /register-build --fixes
external_ref: null # the external tracker key, or null
fix_cycle: 1 # the Bug Work Plan's current fix cycle
platform: # carried from the Bug Work Plan, never re-detected
device_type: # carried from the Bug Work Plan, never re-detected
surfaces: [] # the affected surfaces, from the Bug Work Plan
bug_work_plan_link: # docs/bugs/<bug_key>/bug-work-plan.md
review_link: # docs/bugs/<bug_key>/review-c<fix_cycle>.md
handoff_input_fingerprint: # the exact inputs this handoff was generated from (scripts/qa-handoff-gate.ts) — written by the generator
status: draft # draft | ready-for-qa — never edited by hand; only `qa-handoff-gate.ts approve` sets ready-for-qa
generated_by: create-dev-qa-notes
date: # YYYY-MM-DD
acknowledged_majors: [] # the Major review findings the approver acknowledged explicitly, by id — written by the approval
approved_by: null # written by the approval: the human who handed the fix to QA
approved_fingerprint: null # written by the approval: binds the body, the input fingerprint and the acknowledgements
---

# QA Bug Handoff

<!--
Written by /create-dev-qa-notes bug:<bug_key> to docs/qa/bug-<bug_key>-qa-handoff.md through scripts/qa-handoff-gate.ts generate — deterministically, from the approved Bug Work Plan, the bug's task state and its review record, plus the platform lane's build instructions. Every section is generated; do not edit by hand: an edit after approval invalidates it, and a re-generation replaces it. The contract is docs/bug-work-plan-contract.md § "QA handoff".
-->

## Bug Summary

<!-- The bug, its approved root cause and the root-cause fix, from the Bug Work Plan. -->

## Fix Claim

<!-- QA bug id (or the explicit QA next step when there is none), external reference, fix cycle, affected surfaces, the reviewed code identity, and the exact QA action once a build exists: /register-build <build-id> --fixes bug:<qa_bug_id> --surfaces … . Dev never registers the build. -->

## Reproduction Scenario

<!-- The plan's Reproduction Evidence and Observed vs Expected, verbatim — never rewritten — with the found-in build and the affected surfaces. -->

## Build / Install / Testing Instructions

<!-- From the platform's implementation lane, one ### subsection per platform. -->

## Developer Verification

<!-- From task state only: each current-cycle task, its developer-testing decision, the runs, the regression evidence, the reproduction-path criterion, VERIFY-4 developer debt; the review result and every Major finding with its id. -->

## Regression Scope

<!-- Advisory: the approved plan's Blast Radius and its first-degree capability context, verbatim. No Project Knowledge is queried. -->

## Known Limitations

<!-- The Fix Design's non-goals, and outstanding developer-owned verification (VERIFY-4) — the developer's, never QA's. -->

## Pending Verification (owed to QA)

<!-- QA-owned verification debt only, one row per entry, in the existing five-column contract: | Domain | Rule ID | Required verification | Why not automatable | Owner |. "None recorded." when there is none. -->
