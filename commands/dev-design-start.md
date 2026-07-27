---
description: Turn an approved feature analysis into a Detailed Design (DD) document.
argument-hint: [feature-name]
---

Turn an approved feature analysis into a Detailed Design (DD).

1. Take `$ARGUMENTS` as the feature name and locate its `templates/feature-analysis-template.md` from a prior `/analyze-feature` run. Confirm its frontmatter `status` is `approved` — if it's still `proposed`, stop and ask a human to review it first.
2. Read the `platform`, `device_type`, `design_reference_status`, `design_reference_type`, `design_reference`, and `figma_link` fields from the approved feature analysis — do not re-run platform or device-type detection, and **never re-ask for design input that `/analyze-feature` already recorded.**
3. Apply the `dev-design-start` skill methodology (shared mechanics) together with the matching platform-specific dev-planning skill(s) — `rn-dev-planning` / `ios-dev-planning` / `android-dev-planning` / `react-dev-planning` — via the architect agent for the confirmed platform, to build the DD's Technical Implementation Approach and Impacted Modules. The platform was already confirmed by the user during `/analyze-feature` and is carried in the approved feature analysis's frontmatter — invoke **exactly one** architect matching that confirmed platform. Never re-detect the platform here, and never split the feature across multiple platforms or produce per-platform subsections.
4. **Use the design information the feature analysis already recorded — never ask for it again.** Apply exactly one branch:

   - `figma_link` is set (`design_reference_type: figma`) → read the design through the Figma MCP.
   - `design_reference` is set (type `document` / `screenshots` / `existing_ui` / `other`) → read and use that reference through the appropriate available mechanism: the file/URL for a document or exported mockups, the named screen's actual implementation in this repo for `existing_ui`.
   - `design_reference_status: not_required` → continue and generate the DD with no design input. This is the expected path for technical migrations, refactors, dependency upgrades, infrastructure work, performance improvements, and other behavior-preserving changes.
   - The feature analysis indicates new or changed user-facing UI but carries neither `figma_link` nor `design_reference` (for example `design_reference_status: pending`, or a `not_required` that contradicts the UI changes described) → **stop and ask for a design reference, then wait.** Do not generate any part of the DD, and do not accept "there is no design" as an answer — a design reference is mandatory for UI work.

   If a provided design reference cannot be accessed — Figma MCP failure (auth, invalid URL, MCP unavailable, timeout), or a recorded non-Figma reference that cannot be found or read — **stop with the exact error and do not generate any part of the DD.** A `not_required` feature having no reference is never such an error.
5. Populate `templates/dd-template.md` in full, including its frontmatter (`feature_analysis_link`, the four design-reference fields — `design_reference_status`, `design_reference_type`, `design_reference`, `figma_link` — carried over verbatim from the feature analysis, `platform` and `device_type` carried over from the feature analysis, `author`, `status: draft`, `detail_level`, `date`). Honour the skill's existing-file strategy — never blindly overwrite an existing DD.
6. Leave `status: draft` in the DD's frontmatter — do not mark it `approved`. This is a design, not a task list. A human reviews and flips that status before `/dev-feature-start` turns the DD into a task breakdown.
