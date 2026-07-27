# Feature Plan Template

<!--
The thin delivery-plan wrapper produced by /dev-feature-start alongside templates/task-breakdown-template.md, from an APPROVED Detailed Design (templates/dd-template.md).
The DD owns the design (overview, technical approach, impacted modules, risks, acceptance criteria). This doc owns only what the DD does not: task sequencing and the rollback plan — plus the frontmatter /implement-task reads (notably the design-reference fields).
Both context values are carried over from the DD, never re-derived here:
- `platform` is exactly one of react-native | ios | android | react. There is no `mixed` platform — /analyze-feature confirmed a single platform with the user and every stage since has carried that one value.
- The four design-reference fields record the design input decided at /analyze-feature time. A design reference is required only when the feature introduces or changes user-facing UI, and is mandatory when it does; `design_reference_status: not_required` is valid only for work that changes no user-facing UI (migrations, refactors, dependency upgrades, infrastructure, performance, other behavior-preserving changes). Figma is one supported reference type, not a requirement.
-->

```yaml
feature: # feature name
dd_link: # path to the approved templates/dd-template.md this plan was built from
design_reference_status: # provided | not_required — carried over from the DD. /implement-task reads this before implementing UI tasks.
design_reference_type: # figma | document | screenshots | existing_ui | other | none — carried over from the DD
design_reference: # the non-Figma design reference (URL, file path, document location, or precise existing-screen/component reference) — carried over from the DD. null when the type is `figma` or `none`.
figma_link: # the Figma URL when design_reference_type is `figma`, otherwise null — carried over from the DD
platform: # react-native | ios | android | react — exactly one confirmed platform, carried over from the DD, not re-detected. Never mixed.
device_type: # mobile | tv — carried over from the DD, not re-detected. No "mixed".
author: # the relevant platform architect / human author
status: draft # draft | approved
date: # YYYY-MM-DD
```

<!-- 2-4 sentences: what is being built and why, in plain language. Carried over from the approved DD this plan was built from. -->
## Overview

<!-- Populated from templates/task-breakdown-template.md — embed the table here or link to it. -->
## Task Breakdown

<!-- The order tasks should be implemented in, and why — surfacing the cross-task dependencies captured in the task breakdown's depends-on column. All tasks share the feature's single confirmed platform, so there are no cross-platform dependencies to sequence. -->
## Sequencing & Dependencies

<!-- How to revert this change if it ships broken: feature flag, revert commit, migration reversal, etc. Owned here, deliberately NOT folded into the DD. -->
## Rollback Plan

<!-- Flip `status` to `approved` once a human has reviewed the plan and task breakdown. /implement-task refuses to run against a plan still in draft. -->
## Approval
