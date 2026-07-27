---
name: dev-design-start
description: Shared methodology for turning an approved feature analysis into a thorough Detailed Design (DD) document, across any platform. Used by /dev-design-start alongside the platform-specific dev-planning skill (rn-/ios-/android-/react-dev-planning) for the Technical Implementation Approach section's vocabulary and standard IDs. This skill NEVER generates development tasks — /dev-feature-start does that from an approved DD. It NEVER modifies source code.
---

## Methodology

Generate a thorough Detailed Design grounded in repository facts already captured by the Analyze stage, validated against the design, and ready for `/dev-feature-start` to consume. This skill **never** generates implementation tasks and **never** modifies source code.

### Step 1 — Locate the approved feature analysis (input gate)

1. Resolve the feature name to its `templates/feature-analysis-template.md` from a prior `/analyze-feature` run.
2. **Confirm its frontmatter `status` is `approved`.** If it is still `proposed`, stop and ask a human to review and approve it first — do not design against an unapproved analysis.
3. Read the `platform` frontmatter field — this is authoritative, and is always exactly one of `react-native` / `react` / `ios` / `android`. **Do not re-run platform detection.** Read the design-reference fields too — `design_reference_status`, `design_reference_type`, `design_reference`, `figma_link` — all of which carry forward into the DD unchanged.

The approved feature analysis IS the specification for this DD: its Feature Request, repo-analyst's detected conventions, the architect's Proposed Technical Approach, and its recorded design reference are the inputs. Do not re-interrogate the developer for a spec path or a design reference that the analysis already carries.

### Step 2 — Decide detail level and existing-file strategy

Ask the developer two things before generating:

1. **Detail level** — `Standard` (covers every required section concisely) or `Comprehensive` (deep-dives every section with rationale, tradeoffs, extended edge cases).
2. **If a DD already exists for this feature** — how to handle it: `Overwrite` / `Update` (merge new findings) / `Preserve` (write to a new filename) / `Version` (rename the existing file, e.g. append `-v1`, before writing). **Never blindly overwrite an existing DD.**

### Step 3 — Read all available context

Read, in this order, everything that exists — do not skip any:

1. The **approved feature analysis** (spec + detected conventions + proposed approach).
2. The **design reference** recorded in the analysis: via the Figma MCP tool when `figma_link` is set (`design_reference_type: figma`), otherwise by reading whatever `design_reference` points at — a spec document, exported mockups/screenshots, or the existing screen/component named for `existing_ui`. If that reference cannot be accessed for any reason (auth, invalid URL, MCP unavailable, timeout, unreadable path, unresolvable screen name), stop immediately with the exact error and do not generate any part of the DD — the DD cannot be built without the design it depends on. When `design_reference_status: not_required` there is nothing to read here and nothing to ask for; skip this step. If the analysis describes new or changed UI yet carries no reference at all, stop and ask for one — a design reference is mandatory for UI work.
3. `docs/` and any architecture/integration/ADR notes, if present.
4. **Repository inspection** — browse the relevant source directories, existing components, services, and API routes to understand the actual implementation landscape.

### Step 4 — Validate consistency

Cross-check inputs against each other and actively hunt for gaps across every dimension:

- **Spec vs Design** — does every flow in the analysis appear in the design reference, and every screen in the design reference map to a requirement? Are labels/terminology consistent? (Skip when `design_reference_status: not_required`.)
- **Design vs Architecture** — can every UI element be built with the current component library / design system per the detected conventions? Are new components needed and feasible? Do navigation patterns match existing routing conventions?
- **Completeness** — flag anything missing or ambiguous across: loading states, empty states, error states, happy + failure/edge user flows, every screen transition, permissions/roles, analytics events, API requirements, backend requirements, validation rules, edge cases (boundaries, concurrency, stale data, races), accessibility, responsive/breakpoint behaviour, i18n/RTL, feature flags / rollout strategy.

### Step 5 — Surface gaps and confirm

If any **important** gap is found, stop and present a structured, labelled list of clarification questions (`[MISSING — …]`, `[AMBIGUOUS — …]`) before generating. Do not continue until critical gaps are resolved; minor gaps (e.g. exact copy) can be recorded as Open Questions in the DD.

Only proceed to generation when you are **≥90% confident** that the design matches the analysis, the approach is clear, the UX is understood end-to-end, all dependencies are identified, and edge cases are sufficiently covered. If you cannot reach 90%, explain what is blocking confidence and ask how to proceed.

### Step 6 — Generate the DD

Populate `templates/dd-template.md` in full. Apply the existing-file strategy chosen in Step 2. Place it where the repo keeps design docs (check `docs/` conventions) or at the repo root; default filename `{FEATURE-NAME}-DD.md`.

- **Frontmatter:** carry `platform`, `device_type`, and all four design-reference fields (`design_reference_status`, `design_reference_type`, `design_reference`, `figma_link`) from the feature analysis unchanged; set `feature_analysis_link` to the analysis path, `status: draft`, `detail_level`, `date`.
- **Technical Implementation Approach (§19) and Impacted Modules (§20):** delegate platform vocabulary and standard-ID citations to the dev-planning skill (`rn-/ios-/android-/react-dev-planning`) for the one confirmed platform, via that platform's architect. The feature analysis always carries exactly one confirmed platform, so this is always a single flat section — never platform-tagged subsections.
- Fill every section; write `N/A — [reason]` where one genuinely does not apply. In comprehensive mode, expand with rationale and tradeoffs.
- **Leave `status: draft`** until a human explicitly approves — `/dev-feature-start` reads only an approved DD.

## Constraints

- **Never generate implementation tasks.** `/dev-feature-start` does that from an approved DD.
- **Never modify source code.**
- **Never re-run platform detection** — read `platform` from the approved feature analysis.
- **Never blindly overwrite** an existing DD — honour the Step 2 existing-file strategy.
- **Never ignore an unresolved critical gap** — flag it and stop.
- **Always prioritise repository facts** (the feature analysis, detected conventions, actual source) over assumptions.
