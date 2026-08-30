---
description: Turn an approved feature analysis into a Detailed Design (DD) document.
argument-hint: [feature-name]
---

Turn an approved feature analysis into a Detailed Design (DD).

1. Take `$ARGUMENTS` as the feature name and locate its `templates/feature-analysis-template.md` from a prior `/analyze-feature` run.

   **Load it through the `planning-doc-migration` skill (`--kind feature-analysis`) before reading anything from it.** That skill is the single compatibility layer for planning-document frontmatter: it detects an analysis written against an older contract, migrates its frontmatter in place, and hands you exactly one shape to read. Do not carry your own tolerance for older shapes here, and never hand-edit an analysis's frontmatter to make it load. If the skill reports `needs-input`, answer its batched questions with the developer before continuing; if it reports any other non-`current`/`migrated` status, stop and report it verbatim.

   Then confirm the frontmatter `status` is `approved` — if it's still `proposed`, stop and ask a human to review it first. **Migration never changes approval**, so this gate is unchanged: a legacy analysis that migrates successfully is still rejected here if it was never approved.
2. Read the `platform`, `device_type`, `design_reference_status`, `design_reference_type`, `design_reference`, and `figma_link` fields from the approved feature analysis — do not re-run platform or device-type detection, and **never re-ask for design input that `/analyze-feature` already recorded.** After step 1 these fields are always present in their current shape.

   Also read the six `repo_knowledge_*` fields and the analysis's repository-context section, then re-resolve current knowledge with the `repo-knowledge-consumer` skill so the DD is built against what the repository knows **now**, not only what it knew when the analysis was approved. If the fingerprint has moved since, note it in one line and continue — the consumer skill has already routed affected categories to live derivation.

   **When step 1 reported a migration, record it in the DD's §23 Assumptions:** the version the analysis was migrated from; that any field listed in its `migration_inputs` was supplied by a human at migration time rather than at approval time; and — for an analysis migrated from below v3 — that its `## Repo Conventions Detected` section is an embedded point-in-time observation rather than a citation, since the framework never rewrites bodies. Prefer canonical knowledge over that embedded snapshot where the two disagree, and note the disagreement there too.
2a. **Consistency preflight — has the feature analysis moved since this DD was generated?** If a DD already exists for this feature, compute the analysis's body fingerprint and compare it to the DD's recorded `source_fingerprint`:

   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" fingerprint --file "<absolute feature analysis path>"
   ```

   A mismatch means the analysis changed after this DD was built. That is the expected entry point for an upstream change, not an error — report it and continue into the re-entry choice below. Absent means unknown, never mismatch. If the analysis itself needs amending first, say so and name the recovery: **"Amend and re-approve the feature analysis, then run `/analyze-feature` if it must be regenerated."**

2b. **Before the re-entry choice, surface what already exists downstream.** If a Task Breakdown exists for this feature, read its lifecycle state and report the one-line summary — how many tasks are recorded, how many are `complete`, how many would become `Modified` or `Removed`:

   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" read \
     --root "<TARGET_ROOT>" --feature "<feature>" --breakdown "<absolute Task Breakdown path>"
   ```

   The skill's Step 2 then asks whether to `Overwrite` / `Update` / `Preserve` / `Version` the existing DD. That decision is materially different when eight tasks are already implemented, so it must not be made blind.

3. Apply the `dev-design-start` skill methodology (shared mechanics) together with the matching platform-specific dev-planning skill(s) — `rn-dev-planning` / `ios-dev-planning` / `android-dev-planning` / `react-dev-planning` — via the architect agent for the confirmed platform, to build the DD's Technical Implementation Approach and Impacted Modules. The platform was already confirmed by the user during `/analyze-feature` and is carried in the approved feature analysis's frontmatter — invoke **exactly one** architect matching that confirmed platform. Never re-detect the platform here, and never split the feature across multiple platforms. What follows for the document's shape is the skill's Step 6.

   - **Readiness gate (any platform).** Before invoking, check the target dev-planning skill and architect agent for the placeholder marker — a frontmatter `description` ending "not yet authored, currently a structure-only placeholder" **and** a `## Status: Not yet authored` heading. Match on those markers only, never on the phrase appearing in ordinary prose (an authored skill may legitimately mention "structure-only placeholder" when telling an agent to stop if a *standards* file is one). If present, **stop with: "Platform design methodology for `<platform>` is not yet authored"** — do not invoke a placeholder, do not substitute the shared skill alone for the missing platform vocabulary, and do not author it here. (When a lane is later authored and the marker is gone, the route opens automatically.) **No lane is gated today** — `react-native`, `ios`, `android` and `react` are all authored. The gate is retained because it is the invariant, not a note about any one platform: a lane added or reverted to placeholder state is caught here automatically, with no edit to this command.
3a. **Measure the feature's complexity, report it, and change nothing.** While the architect performs the repository sweep in step 3, apply the `dd-complexity-assessment` skill to record its eleven signals and score them with `scripts/assess-dd-complexity.ts`. Show the developer the returned `summary` line.

   **This is a measurement, not a decision.** Generation always continues on the single-DD path below, for every band including `high` and `unclassified`. Do not branch on the band, do not ask the developer to confirm it, do not offer an alternative generation mode, and do not let it change the detail level, the section rules, or the contraction pass. Partitioned generation does not exist, and the scoring model is being calibrated against real features before it is allowed to influence anything.

   The assessment adds **no prompt and no gate**. If it cannot classify the feature, report that in the same one line and carry on unchanged.
4. **Use the design information the feature analysis already recorded — never ask for it again.** Apply exactly one branch:

   - `figma_link` is set (`design_reference_type: figma`) → read the design through the Figma MCP.
   - `design_reference` is set (type `document` / `screenshots` / `existing_ui` / `other`) → read and use that reference through the appropriate available mechanism: the file/URL for a document or exported mockups, the named screen's actual implementation in this repo for `existing_ui`.
   - `design_reference_status: not_required` → continue and generate the DD with no design input. This is the expected path for technical migrations, refactors, dependency upgrades, infrastructure work, performance improvements, and other behavior-preserving changes.
   - The feature analysis indicates new or changed user-facing UI but carries neither `figma_link` nor `design_reference` (for example `design_reference_status: pending`, or a `not_required` that contradicts the UI changes described) → **stop and ask for a design reference, then wait.** Do not generate any part of the DD, and do not accept "there is no design" as an answer — a design reference is mandatory for UI work.

   If a provided design reference cannot be accessed — Figma MCP failure (auth, invalid URL, MCP unavailable, timeout), or a recorded non-Figma reference that cannot be found or read — **stop with the exact error and do not generate any part of the DD.** A `not_required` feature having no reference is never such an error.
5. Have the skill populate `templates/dd-template.md`. The skill owns the whole of how that document is written, and this command does not restate any of it: **Step 2** owns the detail level and the existing-file strategy, and **Step 6** owns the section rules, the `N/A — [reason]` discipline, the §5–§18 scope call, the §19 and §20 resolution rules, and the complete frontmatter field list.

   Pass it the two values this command produced, and let Step 6 place them:

   - the **`source_fingerprint`** of the approved feature analysis's body, so `/dev-feature-start` can later detect that the analysis moved, and
   - the `dd_complexity_band` measured in step 3a (`unassessed` only if the assessment did not run at all), and
   - the six `repo_knowledge_*` values from **this run's** resolution in step 2 — never copied from the feature analysis.
6. **The skill's Step 7 contraction pass must have run before the DD is handed over — it is mandatory, not optional.** Step 7 owns what it removes and the one-line report it produces; this command's only obligation is not to accept a DD that skipped it.
7. Leave `status: draft` in the DD's frontmatter — do not mark it `approved`. This is a design, not a task list. A human reviews and flips that status before `/dev-feature-start` turns the DD into a task breakdown.
