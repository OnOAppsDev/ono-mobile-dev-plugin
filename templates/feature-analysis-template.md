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
# repo_knowledge_* fields: exact values and encoding are defined by the repo-knowledge-consumer skill's Step 6 (skills/repo-knowledge-consumer/SKILL.md) — do not guess from the prose below. In particular: absent values are the bare YAML keyword `null` (never the string "null", never empty), and repo_knowledge_reused/repo_knowledge_derived mirror the reader's usableCategories/deriveLive verbatim — no summarizing, reordering, or abbreviating.
repo_knowledge_status: # available | unavailable — whether .ono/repo-knowledge.json was resolved when this analysis was written
repo_knowledge_schema: # the repository-knowledge contract schema version, or null when unavailable
repo_knowledge_fingerprint: # fingerprint.gitHead from the manifest, or null — lets a later reader tell whether the cited knowledge has moved
repo_knowledge_freshness: # fresh | stale-head | stale-artifacts | unknown | null
repo_knowledge_reused: # categories reused from canonical knowledge, or none
repo_knowledge_derived: # categories derived live for this feature, or none
author: # the relevant platform architect / human author
status: proposed # proposed | approved
date: # YYYY-MM-DD
```

<!-- 2-4 sentences: what was asked for, in plain language. -->
## Feature Request

<!--
Where this feature's repository context came from. Produced by the repo-knowledge-consumer skill (Step 6 block shape). When canonical knowledge was unavailable, this section says so and everything below is a point-in-time observation instead of a citation.
-->
## Repo Knowledge Reference

<!--
repo-analyst's findings. CITE reused knowledge, EMBED only what was derived live — repository facts pasted verbatim into this document go stale the moment the repository changes, and three downstream stages are instructed to trust this document without re-deriving.

repo-analyst also produces a Repository Knowledge section (whether canonical knowledge was available and which categories were reused vs. derived live for this feature); that is already recorded above in `## Repo Knowledge Reference`, so do not duplicate it here.

Required sections, always present even when the answer is "not detected":
- Platform Detection — raw signals, candidate platform(s), confidence. ALWAYS derived live, so always embedded.
- Device Type — resolved mobile|tv and confidence. ALWAYS derived live, so always embedded.
- Stack Detection — Navigation, State Management, Data Fetching, Testing, Monorepo/Workspace, Lint/Format (react-native), or the lightweight existence-check findings (ios/android/react). Tag EVERY entry either `[reused: docs/project/patterns.md#anchor]` or `[derived live]`.
- Standards Conformance — folder structure vs the platform's ARCH-* expectations. ALWAYS derived live, so always embedded.
-->
## Repo Context

<!-- The relevant platform architect's proposed approach: Screens/Views / State & Data / Navigation-Routing / Folder Placement. Cite each platform's standard IDs (ARCH-*/NAV-* for react-native, etc.) each part follows. Grounded strictly in the conventions detected above, not assumed defaults. Exactly one confirmed platform applies (react-native, ios, android, or react), so this is always a single flat section authored by that one platform's architect — never split into per-platform subsections. -->
## Proposed Technical Approach

<!-- Anything uncertain, any assumption that needs a human decision before /dev-design-start turns this into a Detailed Design. Do not silently resolve these. -->
## Open Questions & Risks

<!-- Flip to `approved` once a human has reviewed the above. /dev-design-start reads only an approved feature analysis. -->
## Approval
