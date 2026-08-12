# Task Breakdown Template

```yaml
doc_schema_version: 1 # the frontmatter contract version this document was written against. Set by /dev-feature-start at generation; upgraded only by scripts/migrate-planning-doc.ts. See docs/planning-doc-contract.md — never edit by hand.
feature: # feature name/slug — must match the DD and Dev Plan for this feature
feature_analysis_link: # path to the approved feature analysis (the generated feature file, NOT templates/feature-analysis-template.md)
dd_link: # path to the approved DD (the generated {FEATURE-NAME}-DD.md, NOT templates/dd-template.md)
dev_plan_link: # path to the approved Dev Plan (the generated feature plan file, NOT templates/dev-plan-template.md)
design_reference_status: # provided | not_required — carried over from the DD / Dev Plan. /implement-task reads this before implementing UI tasks.
design_reference_type: # figma | document | screenshots | existing_ui | other | none — carried over from the DD / Dev Plan
design_reference: # the non-Figma design reference (URL, file path, document location, or precise existing-screen/component reference) — carried over from the DD / Dev Plan. null when the type is `figma` or `none`.
figma_link: # the Figma URL when design_reference_type is `figma`, otherwise null — carried over from the DD / Dev Plan
platform: # react-native | ios | android | react — exactly one confirmed platform, carried over from the DD, not re-detected. Never mixed; every row carries this same platform.
device_type: # mobile | tv — carried over from the DD, not re-detected. No "mixed". Applies to the whole breakdown; a task-level device-type split is out of scope here (handle later as an explicit task-level requirement).
status: draft # draft | approved — mirrors the Dev Plan's approval; /implement-task refuses to run against a breakdown still in draft
date: # YYYY-MM-DD
```

<!--
Produced by /dev-feature-start from an APPROVED Detailed Design (templates/dd-template.md), alongside the thin Dev Plan (templates/dev-plan-template.md).
The frontmatter above makes this breakdown self-describing: /implement-task resolves the Feature Analysis, DD, and Dev Plan from these link fields rather than guessing filenames. Every link MUST point to the actual generated feature artifact in the target repository (e.g. docs/biometric-login-DD.md), never to a plugin template under templates/. Fill every link — /implement-task stops if a required link is missing.
Both context values are carried over from the DD, never re-derived here:
- `platform` is exactly one of react-native | ios | android | react, and every row carries that same value. There is no `mixed` platform — /analyze-feature confirmed a single platform with the user, so /implement-task routes to exactly one platform's agent + skill.
- The four design-reference fields record the design input decided at /analyze-feature time, and /implement-task reads them before implementing a UI-touching task. A design reference is required only when the work introduces or changes user-facing UI, and is mandatory when it does — /implement-task stops and asks if a UI task has neither `figma_link` nor `design_reference`. `design_reference_status: not_required` is valid only for work that changes no user-facing UI. Figma is one supported reference type, not a requirement.
-->

<!-- One row per task. Each task must be small enough for a single /implement-task run and have acceptance criteria concrete enough to verify without re-reading the whole dev plan. `platform` is always filled, so /implement-task never has to guess which platform skill/agent to route to. Each row carries exactly ONE platform — the same single confirmed platform the DD carries, since a feature never spans platforms. -->

| id | description | platform | files touched | depends-on | size | acceptance criteria |
|---|---|---|---|---|---|---|
| T1 | Short imperative description of the task | react-native | `src/features/example/exampleSlice.ts` | — | S / M / L | Concrete, checkable condition(s) that mean this task is done |
