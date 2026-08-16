---
feature: # feature name/slug — must match the Task Breakdown's `feature` for this feature
platform: # react-native | ios | android | react — carried over verbatim from the Task Breakdown, never re-detected here
device_type: # mobile | tv — carried over verbatim from the Task Breakdown, never re-detected here
dd_link: # path to the approved DD, carried over from the Task Breakdown's dd_link
task_breakdown_link: # path to the approved Task Breakdown this handoff was written from (the generated feature artifact, NOT templates/task-breakdown-template.md)
status: draft # draft | ready-for-qa — /create-dev-qa-notes always writes `draft`. A human reviews the notes and flips it to `ready-for-qa`; until then the handoff is not dev-signed-off and QA-side tooling should treat it as incomplete.
generated_by: create-dev-qa-notes
date: # YYYY-MM-DD
---

# QA Handoff

<!--
Written by /create-dev-qa-notes to docs/qa/{FEATURE-NAME}-qa-handoff.md under the resolved repository root, per QA-FILE-1 in standards/shared/qa-handoff.md. The Task Breakdown records the written path in its `qa_handoff_link` field (QA-LINK-1), so a later command discovers this document by following that link rather than by searching the filesystem.

The frontmatter above is **delimited** (`---`), not a fenced ` ```yaml ` block: these fields exist to be read by tooling, and a fence is document content rather than frontmatter. `delimited` is also the encoding docs/planning-doc-contract.md resolves first when both forms could match, so this document is read the same way as every other artifact in the pipeline. The file therefore does NOT open with `# QA Handoff` — ono-plugin-qa's /check-qa-coverage currently identifies a dev handoff by that opening heading and must be updated to read the frontmatter (preferably via the breakdown's `qa_handoff_link`) instead.

The section headings below are a contract /check-qa-coverage reads section-by-section — do not rename or reorder them without changing that plugin in step.

There is deliberately no `doc_schema_version` here. That field belongs to the four kinds registered in docs/planning-doc-contract.md, each of which carries a version history and a migration chain; the QA handoff is not one of them and adding it would claim a contract that has no chain behind it.
-->

<!-- One paragraph: what was built, for which feature, and why — written for someone who did not see the dev plan. -->
## Feature Summary

<!-- Numbered, step-by-step instructions a non-engineer QA person can follow exactly as written. -->
## How to Test

<!-- Test accounts/credentials (reference a secrets vault, never inline real credentials — see SEC-SECRETS-1 in standards/shared/mobile-security.md), target environment/build, feature flags to enable. -->
## Test Accounts & Environment

<!-- Boundary/error conditions explicitly exercised: empty states, offline, slow network, permission-denied, validation errors, etc. Per QA-EDGE-1 in standards/shared/qa-handoff.md. -->
## Edge Cases

<!-- Anything intentionally not handled in this change, with the reason and (if applicable) a follow-up task reference. Use "None" if empty — don't omit the section. Per QA-LIMIT-1. -->
## Known Limitations

<!-- Every screen/flow touched, so QA can map test steps back to the UI. -->
## Screens & Flows Touched

<!-- One subsection per platform this feature touches: RN — how to run via Metro/Expo Go, simulator/device, or an internal build link; iOS — Xcode run, TestFlight; Android — Android Studio run, internal APK/Play Console track; React (web) — local dev server, preview/staging URL. -->
## Build / Install / Testing Instructions

<!-- Which I18N-* standard IDs (standards/shared/i18n-rtl.md) were checked, and the result of manual LTR/RTL walkthroughs (I18N-TEST-1). Per QA-A11Y-1 in standards/shared/qa-handoff.md. -->
## i18n / RTL Check

<!-- Which A11Y-* standard IDs (standards/shared/accessibility.md) were checked, and the result of the VoiceOver/TalkBack (or web screen-reader) walkthrough (A11Y-SR-1). Per QA-A11Y-1. -->
## Accessibility Check
