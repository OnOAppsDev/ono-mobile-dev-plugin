# Detailed Design (DD) Template

```yaml
doc_schema_version: 2 # the frontmatter contract version this document was written against. Set by /dev-design-start at generation; upgraded only by scripts/migrate-planning-doc.ts. See docs/planning-doc-contract.md — never edit by hand.
feature: # feature name
feature_analysis_link: # path to the approved templates/feature-analysis-template.md this DD was built from
design_reference_status: # provided | not_required — carried over from the feature analysis. `provided` is mandatory for a feature with new or changed user-facing UI; `not_required` is valid only when there is no UI change.
design_reference_type: # figma | document | screenshots | existing_ui | other | none — carried over from the feature analysis
design_reference: # the non-Figma design reference (URL, file path, document location, or precise existing-screen/component reference) — carried over from the feature analysis. null when the type is `figma` or `none`.
figma_link: # the Figma URL when design_reference_type is `figma`, otherwise null — carried over from the feature analysis. Figma is one supported reference type, not a requirement.
platform: # react-native | ios | android | react — exactly one confirmed platform, carried over from the feature analysis, not re-detected. Never mixed.
device_type: # mobile | tv — carried over from the feature analysis, not re-detected. No "mixed".
# repo_knowledge_* fields: exact values and encoding are defined by the repo-knowledge-consumer skill's Step 6 (skills/repo-knowledge-consumer/SKILL.md) — do not guess from the prose below. In particular: absent values are the bare YAML keyword `null` (never the string "null", never empty), and repo_knowledge_reused/repo_knowledge_derived mirror the reader's usableCategories/deriveLive verbatim — no summarizing, reordering, or abbreviating.
repo_knowledge_status: # available | unavailable — resolved when this DD was written, not copied from the feature analysis
repo_knowledge_schema: # the repository-knowledge contract schema version, or null when unavailable
repo_knowledge_fingerprint: # fingerprint.gitHead at DD authoring time, or null — lets a later reader tell whether the cited knowledge has moved
repo_knowledge_freshness: # fresh | stale-head | stale-artifacts | unknown | null
repo_knowledge_reused: # categories reused from canonical knowledge, or none
repo_knowledge_derived: # categories derived live for this feature, or none
author: # the relevant platform architect / human author
status: draft # draft | approved
detail_level: standard # standard | comprehensive
dd_generation: single # single | partitioned — how this DD was produced. Always `single` today; `partitioned` is reserved for partitioned generation, which is not implemented. Never branch on this field.
dd_complexity_band: unassessed # low | medium | high | unassessed — what the complexity assessment computed. ADVISORY ONLY: it records a measurement and never routes generation. Every feature takes the single-DD path regardless of the band.
date: # YYYY-MM-DD
```

<!-- Produced by the repo-knowledge-consumer skill. Records which repository knowledge this design was built on, so a reviewer can resolve the same sources and tell whether they have moved since. When canonical knowledge was unavailable, says so — and everything repository-wide below is then a point-in-time observation rather than a citation. -->
## 0. Repo Knowledge Reference

<!--
Produced by /dev-design-start from an APPROVED feature analysis. This is the DECISION RECORD, not a task list — /dev-feature-start turns an approved DD into a task breakdown.

THE INCLUSION TEST — apply to every line before writing it:
  If this line were deleted, could two competent developers implement the feature in mutually
  incompatible ways, or could a reviewer be unable to tell whether the result is correct?
  If neither: it does not belong here. Volume is not thoroughness.

DOES NOT BELONG IN THIS DOCUMENT — and who owns it instead:
  - Repository evidence transcripts, stack surveys, [evidence: <path>] sweeps  -> Feature Analysis + architect working notes
  - Restated feature request, business context, detected repo conventions      -> Feature Analysis (link it, never copy it)
  - Per-file change inventories, sequencing, ordering, effort sizing           -> Task Breakdown (/dev-feature-start)
  - Rollback plan                                                              -> Dev Plan (templates/dev-plan-template.md)
  - Code, signatures, pseudocode, config snippets, migration mechanics         -> Implementation (/implement-task)
  - Test cases, QA steps, verification procedures                              -> Verification / QA handoff
  - Framework tutorials, general best practice, restated standards prose       -> Standards (cite the ID)
  - Exhaustively enumerated behavior the change PRESERVES                      -> The existing codebase — it already is that spec

Give every section its content or an explicit `N/A — [reason]`. "Filled" means the decision is recorded,
NOT that the section is long — one accurate line beats a page of elaboration.

detail_level changes DEPTH ON CONTESTED DECISIONS, never breadth across sections:
  standard      — each decision with the chosen option and a one-line rationale        (~250-450 lines)
  comprehensive — plus, ONLY where an alternative was genuinely viable, the alternatives
                  considered and why the rejected one was rejected, and deeper risk analysis (~400-700 lines)
  Comprehensive never means "deep-dive every section", and never adds implementation detail.
  These figures are REVIEW TRIGGERS, not caps. Above ~800 lines, the /dev-design-start skill's Step 7
  contraction review is mandatory. Never remove a real design decision to satisfy a budget.

Section numbering is FIXED — /dev-feature-start and the platform architects cross-reference §19, §20, §25, §26
by number. Collapse a section's CONTENT where the rules say so; never renumber, merge, or delete a heading.
-->

## 1. Feature Overview
<!-- One paragraph. What is this feature? What problem does it solve? Summarise — the approved feature analysis is linked in `feature_analysis_link` and is not copied into this document. -->

## 2. Business Goal
<!-- Why does this feature exist? What metric or outcome does it support? A few sentences; cite the feature analysis rather than restating it. -->

## 3. Scope
<!-- What is explicitly included in this implementation. -->

## 4. Out of Scope
<!-- What is explicitly excluded. Prevents scope creep during development. -->

---

<!--
=== SCOPE RULE GOVERNING §5–§18 (behavior sections) ===

Decide SEMANTICALLY whether this feature changes user-facing behavior — from what the feature actually
does to the user-facing surface, NOT from a frontmatter field alone.

WHEN IT DOES NOT change user-facing behavior (technical migrations, refactors, dependency upgrades,
infrastructure work, performance improvements, other behavior-preserving changes):
PRESERVED BEHAVIOR MUST NEVER BE EXHAUSTIVELY RE-DOCUMENTED. The existing codebase already is that
specification, and restating it is the single largest source of DD bloat. Collapse §5–§18 into concise
behavior-impact coverage with exactly three parts:
  1. Preserved behavior      — stated by REFERENCE, not enumeration. One or two lines naming the
                               unchanged surfaces. Never a flow-by-flow, screen-by-screen, or
                               control-by-control inventory.
  2. Behavior plausibly at risk — the ONLY part that gets enumerated. What this change could realistically
                               break, and what must therefore still hold afterwards.
  3. Intentional visible changes — anything a user will actually notice, if any. Often "none."
Keep the headings below in place, route this coverage through the sections it genuinely touches (usually
§17 and §18), and mark the rest `N/A — behavior preserved; see §18`.

WHEN IT DOES change user-facing behavior: §5–§18 are load-bearing — fill them for the CHANGED surface.
Even then, scope them to what changes; an unchanged adjacent flow is referenced, never re-specified.

`design_reference_status` is a STRONG DEFAULT SIGNAL, NOT THE DECISION. `not_required` strongly indicates
preserved behavior and `provided` strongly indicates changed behavior, but the semantic judgement above
governs. Where signal and semantics disagree, follow the semantics and note it in §23 Assumptions.
-->

## 5. User Flows
<!-- For each distinct user journey, describe the steps from entry point to completion. Include both happy path and all failure/edge paths. Subject to the scope rule above. -->

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
DECISIONS, NOT EVIDENCE. How this should be built, grounded strictly in the conventions detected in the feature analysis (not assumed defaults). Supplied by the matching platform architect + companion dev-planning skill (rn-/ios-/android-/react-dev-planning) — cite the standard IDs each part follows (ARCH-*/API-*/STATE-*/NAV-* for react-native, the equivalents for other platforms). Flag any new patterns being introduced.

The architect's repository evidence sweep is RESEARCH THAT INFORMS THIS SECTION — it is not this section's content. The dimension-by-dimension survey, the [evidence: <path>] / [reused: …] / [inference] / [unknown] labelling, and any device_type discovery pass are working notes. This section receives their CONCLUSIONS: the decisions taken and the standard IDs each follows, with a path citation only where a decision genuinely rests on a specific one. Do not paste the survey — a reader who needs the full evidence base finds it in the feature analysis's Repo Context.

Record what this design decides BEYOND the analysis's Proposed Technical Approach; do not re-derive it.
Exactly one confirmed platform applies, carried over from the feature analysis — write this as a single flat section from that one platform's architect, never split into per-platform subsections.
Cite canonical repository knowledge for repository-wide facts (`docs/project/patterns.md#<anchor>` for conventions, `docs/project/components.md#<anchor>` for existing components to reuse) instead of restating them. Describe inline only the feature-specific detail read from source.
-->

## 20. Impacted Modules
<!--
MODULES AND CHANGE CLASSES, NOT FILES × EDITS. Name the modules, packages, components, and services the feature touches; for each, state the CLASS of change and, where the same change repeats, an approximate site count — e.g. "`:player` — all `SimpleExoPlayer` construction sites move to `ExoPlayer.Builder`, ~40 sites". Enumerate individual files only when a change class has roughly TEN OR FEWER sites, or when a specific file carries a design decision of its own.

A per-file inventory is a task breakdown, and /dev-feature-start owns it — it expands change classes into per-file tasks and re-reads the repository to do so. A note on what changes stays at the level of WHAT changes, never HOW to change it.

Build on the module map via the CLAUDE.md structure pointers rather than re-deriving it, and name reused components from docs/project/components.md by path — a "new" component that already exists is the most common failure this section can prevent. Mark a genuinely undetermined location explicitly (`[unknown — target module not determined]`) rather than inventing a plausible path.
-->

## 21. Impacted Services
<!-- Any backend services, databases, queues, or infrastructure this feature touches. -->

---

## 22. Risks
<!-- Technical, design, or delivery risks that would change the plan. Include likelihood and mitigation strategy for each. Carry forward only what is STILL open from the feature analysis — not its full list. -->

## 23. Assumptions
<!-- Facts assumed true that have not been explicitly confirmed, and that would invalidate a design decision if wrong. Also record here: a §5–§18 scope call that disagrees with `design_reference_status`, and any deliberate overage past the ~800-line contraction trigger. -->

## 24. Open Questions
<!-- Unresolved questions that BLOCK — a question whose answer would not change a design decision does not belong here. /dev-feature-start refuses to generate tasks while blocking questions remain open. -->

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
