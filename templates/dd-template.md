# Detailed Design (DD) Template

```yaml
feature: # feature name
feature_analysis_link: # path to the approved templates/feature-analysis-template.md this DD was built from
design_reference_status: # provided | not_required — carried over from the feature analysis. `provided` is mandatory for a feature with new or changed user-facing UI; `not_required` is valid only when there is no UI change.
design_reference_type: # figma | document | screenshots | existing_ui | other | none — carried over from the feature analysis
design_reference: # the non-Figma design reference (URL, file path, document location, or precise existing-screen/component reference) — carried over from the feature analysis. null when the type is `figma` or `none`.
figma_link: # the Figma URL when design_reference_type is `figma`, otherwise null — carried over from the feature analysis. Figma is one supported reference type, not a requirement.
platform: # react-native | ios | android | react — exactly one confirmed platform, carried over from the feature analysis, not re-detected. Never mixed.
device_type: # mobile | tv — carried over from the feature analysis, not re-detected. No "mixed".
author: # the relevant platform architect / human author
status: draft # draft | approved
detail_level: standard # standard | comprehensive
date: # YYYY-MM-DD
```

<!--
Produced by /dev-design-start from an APPROVED feature analysis. This is the design artifact, not a task list — /dev-feature-start turns an approved DD into a task breakdown.
Populate every section. For sections that genuinely do not apply, write `N/A — [reason]` rather than leaving them blank.
In comprehensive detail_level, expand each section with rationale, tradeoffs, and decision notes (deeper, not longer for its own sake).
-->

## 1. Feature Overview
<!-- One paragraph. What is this feature? What problem does it solve? -->

## 2. Business Goal
<!-- Why does this feature exist? What metric or outcome does it support? -->

## 3. Scope
<!-- What is explicitly included in this implementation. -->

## 4. Out of Scope
<!-- What is explicitly excluded. Prevents scope creep during development. -->

---

## 5. User Flows
<!-- For each distinct user journey, describe the steps from entry point to completion. Include both happy path and all failure/edge paths. -->

### 5.1 [Flow Name]
**Actor:** [who performs this flow]
**Entry point:** [where they start]
**Steps:** [numbered list]
**Exit conditions:** [success / failure outcomes]

## 6. Screen Flows
<!-- State diagram or numbered list describing every screen transition. Include: trigger → source screen → destination screen → conditions. -->

## 7. UI Behavior
<!-- Interactive behaviour in detail: form-field behaviour, validation feedback timing, button states, drawer/modal behaviour, etc. -->

## 8. Navigation Changes
<!-- Any changes to routing, menu structure, breadcrumbs, deep links, or back-button behaviour. -->

---

## 9. Data Flow
<!-- How data moves through the feature: user input → client state → API → backend → response → UI update. -->

## 10. API Requirements

| Method | Endpoint | Auth | Request | Response | Notes |
|--------|----------|------|---------|----------|-------|
| GET    | /api/... | JWT  | ...     | ...      | ...   |

<!-- Describe pagination, sorting, filtering contracts. Flag any new endpoints that need backend work. -->

## 11. Service Dependencies
<!-- External services, internal microservices, third-party SDKs, feature flags, or infrastructure this feature depends on. -->

## 12. Analytics Requirements

| Event Name | Trigger | Properties | Notes |
|------------|---------|------------|-------|
| ...        | ...     | ...        | ...   |

---

## 13. Permissions

| Role | Can View | Can Edit | Can Delete | Notes |
|------|----------|----------|------------|-------|
| ...  | ✅       | ❌       | ❌         | ...   |

<!-- Describe what happens when a user without permission attempts a restricted action. -->

## 14. Validation Rules

| Field | Rule | Client | Server | Error Message |
|-------|------|--------|--------|---------------|
| ...   | ...  | ✅     | ✅     | "..."         |

## 15. Loading States
<!-- For every async operation, describe what the UI renders while waiting. -->

## 16. Empty States
<!-- For every list, feed, or data view, describe what renders when there is no data. -->

## 17. Error Handling
<!-- For every operation that can fail, describe the failure mode and recovery path. -->

## 18. Edge Cases
<!-- Boundary conditions, race conditions, concurrent edits, stale data, large datasets, slow connections, etc. -->

---

## 19. Technical Implementation Approach
<!--
How this should be built, grounded strictly in the conventions detected in the feature analysis (not assumed defaults). Supplied by the matching platform architect + companion dev-planning skill (rn-/ios-/android-/react-dev-planning) — cite the standard IDs each part follows (ARCH-*/API-*/STATE-*/NAV-* for react-native, the equivalents for other platforms). Flag any new patterns being introduced.
Exactly one confirmed platform applies, carried over from the feature analysis — write this as a single flat section from that one platform's architect, never split into per-platform subsections.
-->

## 20. Impacted Modules
<!-- Every file, module, component, or service that will need to change, with a brief note on what changes. Feeds /dev-feature-start's task decomposition. -->

## 21. Impacted Services
<!-- Any backend services, databases, queues, or infrastructure this feature touches. -->

---

## 22. Risks
<!-- Technical, design, or delivery risks. Include likelihood and mitigation strategy for each. -->

## 23. Assumptions
<!-- Facts assumed true that have not been explicitly confirmed. Each assumption is a potential risk. -->

## 24. Open Questions
<!-- Unresolved questions that need answers before or during implementation. /dev-feature-start refuses to generate tasks while blocking questions remain open. -->

---

## 25. Acceptance Criteria Mapping
<!-- Map each requirement from the feature analysis to a verifiable acceptance criterion. This is the source of truth /dev-feature-start uses to write each task's acceptance criteria. -->

| # | Requirement | Acceptance Criterion | Source |
|---|-------------|----------------------|--------|
| 1 | ...         | Given / When / Then  | Feature analysis §X |

## 26. Definition of Ready for Development
<!-- This feature is ready for /dev-feature-start (task generation) when ALL of the following are true. /dev-feature-start verifies this before decomposing. -->

- [ ] All Open Questions in §24 are resolved
- [ ] All API contracts in §10 are agreed with backend
- [ ] All design assets are final and accessible
- [ ] All permissions confirmed with product/stakeholders
- [ ] Analytics events approved
- [ ] No unresolved items in §22 Risks that would block delivery

---

## Approval
<!-- Flip `status` to `approved` in the frontmatter once a human has reviewed the above. /dev-feature-start reads only an approved DD. -->
