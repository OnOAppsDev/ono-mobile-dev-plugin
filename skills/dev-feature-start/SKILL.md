---
name: dev-feature-start
description: Shared methodology for turning an approved Detailed Design (DD) into a development task breakdown and a thin feature plan, across any platform. Used by /dev-feature-start alongside the platform-specific dev-planning skill (rn-/ios-/android-/react-dev-planning) for task vocabulary and standard IDs. It consumes an approved DD (from /dev-design-start) and produces the task breakdown /implement-task runs from. It NEVER modifies source code.
---

## Methodology

Turn an approved DD into discrete, implementable tasks — the task-generation stage that sits between design (`/dev-design-start`) and implementation (`/implement-task`). This skill **never** modifies source code.

1. **Locate the approved DD (input gate).** Resolve the feature name to its `templates/dd-template.md` from a prior `/dev-design-start` run. **Confirm its frontmatter `status` is `approved`** — if it is still `draft`, stop and ask a human to review and approve it first. Do not generate tasks against an unapproved design.

2. **Read the `platform` frontmatter field** to know which platform-specific dev-planning skill to consult — always exactly one, since the DD carries exactly one confirmed platform — and read the four design-reference fields (`design_reference_status`, `design_reference_type`, `design_reference`, `figma_link`) to carry forward unchanged. **Do not re-run platform detection** — the DD carries the platform decided at Analyze time — and do not re-ask for design input.

3. **Verify the DD's Definition of Ready (§26).** Before decomposing, confirm §26's checklist is satisfied and that §24 Open Questions and §22 Risks contain nothing that would block delivery. If unresolved blockers remain, stop and surface them rather than generating tasks against an unstable design.

4. **Decompose the DD into discrete tasks** in `templates/task-breakdown-template.md`, driven by the DD's Technical Implementation Approach (§19) and Impacted Modules (§20). Each task must carry a `platform` value (always filled — even for a single-platform feature, so `/implement-task` never has to guess) and concrete, checkable acceptance criteria — sourced from the DD's Acceptance Criteria Mapping (§25). Avoid vague criteria like "works correctly." The DD carries exactly one confirmed platform, so **every row carries that same single platform** — there is no `mixed` feature whose rows span platforms.

   **Populate the task breakdown's frontmatter** so `/implement-task` can resolve the upstream documents deterministically from links rather than guessing filenames. Set: `doc_schema_version` to the task-breakdown kind's current version per `docs/planning-doc-contract.md` (stamped at generation, **never copied from the DD**, whose version describes a different document kind); `feature` (matching the DD and Dev Plan); `feature_analysis_link` → the approved feature analysis path (carried from the DD's `feature_analysis_link`); `dd_link` → the approved DD path; `dev_plan_link` → the Dev Plan path written in step 7; `platform`, `device_type`, and all four design-reference fields carried from the DD; `status: draft`; `date`. Every link must point to the actual generated feature artifact in the target repository (e.g. `docs/biometric-login-DD.md`), never to a plugin template under `templates/`.

   **What a good task is — apply this as the decomposition rule, not just advice.** A task should represent a single logical implementation unit, sized for one `/implement-task` run. Each task should:

   - **Touch one responsibility** whenever possible.
   - Be **independently reviewable** (a reviewer can judge it without the rest of the breakdown in hand).
   - Be **independently testable** (its acceptance criteria can be verified on their own).
   - Be **independently revertible** (it can be rolled back without unwinding unrelated work).
   - **Minimize cross-task dependencies** — keep the `depends-on` graph as shallow as the design allows.

   Prefer more small, focused tasks over fewer large ones. If a candidate task can't satisfy these properties — it spans multiple responsibilities, can't be reviewed or tested or reverted on its own — split it until each resulting task can.

5. **Delegate platform vocabulary and standard-ID citations** to the matching platform-specific dev-planning skill (`rn-/ios-/android-/react-dev-planning`) via the matching architect — so each task's description and acceptance criteria use the right platform terms and cite the right standard IDs.

6. **Record dependencies between tasks** in the `depends-on` column so `/implement-task` can be run in a valid order, including cross-platform dependencies (e.g. a React-web task depending on a backend contract an RN task also depends on).

7. **Write the thin feature plan** in `templates/dev-plan-template.md`: frontmatter (`doc_schema_version` → the dev-plan kind's current version per `docs/planning-doc-contract.md`, stamped at generation, `dd_link` → the approved DD path, `platform`, `device_type`, and all four design-reference fields carried from the DD, `status: draft`), a plain-language Overview, the Task Breakdown (embed or link the table), Sequencing & Dependencies, and a **Rollback Plan** (how this ships-broken change gets reverted — feature flag, revert commit, migration reversal). Rollback lives here by design, not in the DD.

8. **Leave `status: draft`** in both the feature plan and the task breakdown until a human explicitly approves — keep the two in sync. `/implement-task` must not run against a plan/breakdown still in draft. When a human approves, both are flipped to `approved` together.
