# Feature Analysis Template

```yaml
feature: # feature name
dd_link: # link to the Detailed Design doc, if one exists
design_reference_status: pending # pending | provided | not_required — `provided` = a design reference exists (MANDATORY for any feature with new or changed user-facing UI); `not_required` = valid ONLY when the feature introduces no new or changed user-facing UI. /analyze-feature must resolve this away from `pending`.
design_reference_type: # figma | document | screenshots | existing_ui | other — the kind of design reference provided. `none` when design_reference_status is not_required.
design_reference: # the non-Figma design reference — URL, file path, document location, or a precise existing-screen/component reference. null when the type is `figma` (the link lives in figma_link) or when no reference is required.
figma_link: # optional — the Figma URL when design_reference_type is `figma`, otherwise null. Figma is one supported reference type, not a requirement.
platform: # react-native | ios | android | react — exactly one confirmed platform. Resolved from repo-analyst after user confirmation; must never be mixed.
device_type: # mobile | tv — the mobile-vs-TV target for this feature, resolved by repo-analyst; ask the human if ambiguous. No "mixed" — resolve to exactly one.
author: # the relevant platform architect / human author
status: proposed # proposed | approved
date: # YYYY-MM-DD
```

<!-- 2-4 sentences: what was asked for, in plain language. -->
## Feature Request

<!-- repo-analyst's structured findings, verbatim: Platform Detection (raw signals, candidate platform(s), confidence) first, then the platform-specific stack section (for react-native: Navigation, State Management, Data Fetching, Testing, Monorepo/Workspace, Folder Structure, Lint/Format; for ios/android/react: lightweight existence-check findings). Every section present even if "not detected". -->
## Repo Conventions Detected

<!-- The relevant platform architect's proposed approach: Screens/Views / State & Data / Navigation-Routing / Folder Placement. Cite each platform's standard IDs (ARCH-*/NAV-* for react-native, etc.) each part follows. Grounded strictly in the conventions detected above, not assumed defaults. Exactly one confirmed platform applies (react-native, ios, android, or react), so this is always a single flat section authored by that one platform's architect — never split into per-platform subsections. -->
## Proposed Technical Approach

<!-- Anything uncertain, any assumption that needs a human decision before /dev-design-start turns this into a Detailed Design. Do not silently resolve these. -->
## Open Questions & Risks

<!-- Flip to `approved` once a human has reviewed the above. /dev-design-start reads only an approved feature analysis. -->
## Approval
