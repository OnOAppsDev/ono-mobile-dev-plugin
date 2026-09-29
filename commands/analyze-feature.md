---
description: Analyze a feature request against the current repo's conventions before planning it.
argument-hint: [feature-description-or-requirement]
---

Analyze the feature described in `$ARGUMENTS` (a feature description, product requirement, or user story, optionally including a design reference such as a Figma link) against this repo's actual conventions.

**No DD exists at this stage.** A Detailed Design (DD) is produced later by `/dev-design-start` from the *approved* Feature Analysis this command creates. Do not ask for a DD, do not expect one as input, and do not treat `$ARGUMENTS` as a DD link — this command is the step that produces the Feature Analysis which later feeds `/dev-design-start`.

1. **Resolve canonical repository knowledge, then detect the platform.** Apply the `repo-knowledge-consumer` skill first to resolve `.ono/repo-knowledge.json` — the approved repository knowledge published by the Ono Project Inspector — so this command reuses it instead of re-deriving repository facts. Then apply the `mobile-repo-analysis` skill methodology and invoke the `repo-analyst` agent to **detect the platform** (React Native, native iOS, native Android, React web, or a mix) using its platform-detection algorithm.

   - If knowledge is **available**, `repo-analyst` reuses the categories reported reusable (typically the neutral stack inventory from `docs/project/patterns.md` and the component inventory from `docs/project/components.md`) and derives only the rest. Show the developer the one-line summary the skill produces, including the freshness verdict.
   - If knowledge is **unavailable**, say so in one line and continue with full live detection — **behavior identical to before this step existed.** Do not stop, do not ask permission, and do not ask the developer to run an inspection first.
   - **Platform detection always runs in full either way.** `stack.platformHints` is advisory corroboration only; it never substitutes for detection and never for the confirmation gate in step 2.
   - **Declared surfaces corroborate; they never decide.** When the knowledge declares surfaces (independently built targets), they may be shown beside the detected context as corroboration — but surface knowledge never replaces the confirmation in step 2, and `formFactor` is never read as a `device_type`. Project Knowledge may corroborate and scope; it may not silently choose routing.
2. **Present the detected context to the user and require confirmation before using it — always, even when detection confidence is high.** Detection is a recommendation, not the authoritative context. Show the detected values and ask:

   ```
   Detected development context:

   Platform: <detected platform>
   Device type: <detected device type>

   Is the current feature intended for this context?
   1. Yes, continue
   2. No, select another context
   ```

   - **Yes** → the detected `platform` and `device_type` become the authoritative context for this feature.
   - **No** → have the user select the platform (`react-native` / `react` / `ios` / `android`) and the device type (`mobile` / `tv`); use the selection as the authoritative context.
   - The confirmed context must always resolve to **exactly one** platform (`react-native` / `react` / `ios` / `android`) and **exactly one** device type (`mobile` / `tv`). Validate the values; reject empty or invalid input and re-ask. There is no `mixed` authoritative platform and no `mixed` device type.
   - **If `repo-analyst` detected multiple platforms or a mixed repository state, do not offer a "Yes, continue" path.** Present the detected candidate platforms and **require the user to select the single active platform and device type for the current feature** before continuing.
   - This gate subsumes the previous Low-confidence/ambiguous prompt — do not additionally stop-and-ask; an uncertain detection is presented as the recommendation and resolved through this same confirm/select step.
2a. **Scope the confirmed context to a surface, when the repository declares surfaces.** Only after step 2 is answered, resolve the surface the feature targets through the `repo-knowledge-consumer` skill (Step 3b): offer the declared surfaces whose platform matches the confirmed one; if exactly one fits, present it for the developer to confirm, and if several fit, the developer picks — never pick one here. The confirmed surface narrows which conventions apply (its overrides of the shared sections), which code is shared versus surface-specific, and its build selector and source roots. When the repository declares no surfaces, or the category is derive-live, skip this step: behaviour is exactly as before. This scoping never revisits the platform or `device_type` just confirmed.
3. Once the platform is confirmed by the user (step 2), `repo-analyst` fills in the stack picture for the confirmed platform. **Every authored lane reuses canonical repository knowledge — the lanes differ only in which layer does the reusing.** The resolution procedure, the reusable-versus-derive-live decision, and the citation shape all belong to the `repo-knowledge-consumer` skill; none of it is restated here.

   - **React Native — reused at `repo-analyst`.** The neutral stack inventory — navigation library, state-management library, data-fetching layer, testing setup, monorepo tooling, lint/format config — is reused from `docs/project/patterns.md` when the `repo-knowledge-consumer` skill reports `conventions` reusable, and derived live only when it does not.
   - **iOS, Android and React — reused at the architect.** `repo-analyst` performs lightweight existence checks only (iOS: SPM vs. CocoaPods, whether an MVVM/Coordinator-style layout is present; Android: Gradle Kotlin DSL vs. Groovy, Compose vs. XML views; React: which bundler/framework, which routing library). That is deliberate and **is not a gap in canonical-knowledge reuse**: `feature-architect` resolves canonical repository knowledge itself through `repo-knowledge-consumer` (`skills/platform-planning/SKILL.md` §3), then runs the resolved lane's deeper platform inspection per `skills/ios-dev-planning/SKILL.md` §3, `skills/android-dev-planning/SKILL.md` §3 or `skills/react-dev-planning/SKILL.md` §3. For these three lanes, treat `repo-analyst`'s Stack Detection as a starting signal, never as the authoritative picture.

   Platform detection, device-type resolution, and the `ARCH-LAYERS-*`/`ARCH-FOLDERS-*` standards-conformance comparison against the folder structure always run in full either way, regardless of what was reused.
3a. **Look the requested capability up in Project Knowledge before discovering it live.** Through the `repo-knowledge-consumer` skill (Step 3c), locate the feature by capability id, exact name, or a source root the request names — never by similarity. **Found** → load its evidence and its direct, first-degree relationships; relationships whose evidence is stale have been re-checked against the current source, and any that no longer hold are derived live. Use the result as change-surface context: which capabilities sit next to this one, and why each matters here. **Related capabilities are context, not scope** — never expand the feature to them automatically, never follow the graph past the first degree; the developer and architect decide the actual scope. **Not found** → discover the change surface live, exactly as before.
4. Invoke the `feature-architect` agent with those findings to propose a technical approach, grounded in what was actually detected, not assumed defaults. It applies the shared `platform-planning` methodology against exactly one planning lane, resolved from the platform the user confirmed at step 2 — never re-detected here.

   | Confirmed `platform` | Agent | Shared methodology | Planning lane | Status |
   |---|---|---|---|---|
   | `react-native` | `feature-architect` | `platform-planning` | `rn-dev-planning` | active |
   | `ios` | `feature-architect` | `platform-planning` | `ios-dev-planning` | active |
   | `android` | `feature-architect` | `platform-planning` | `android-dev-planning` | active |
   | `react` | `feature-architect` | `platform-planning` | `react-dev-planning` | active |

   **Exactly one planning lane is ever loaded.** The agent and the shared methodology are
   platform-independent; the lane resolved from the confirmed platform is the only source of
   platform content, and no other platform's lane or standards may be loaded.

   - **Readiness gate (any platform).** Before invoking, check the **resolved planning lane** for the placeholder marker — a frontmatter `description` ending "not yet authored, currently a structure-only placeholder" **and** a `## Status: Not yet authored` heading. Match on those markers only, never on the phrase appearing in ordinary prose (an authored skill may legitimately mention "structure-only placeholder" when telling an agent to stop if a *standards* file is one). If present, **stop with: "Platform architecture methodology for `<platform>` is not yet authored"** — do not invoke a placeholder lane, do not fall back to another platform's lane, and do not author the methodology here. The gate is on the lane, not the agent: `feature-architect` and `platform-planning` are platform-independent and always authored, so a lane's readiness is the only thing that can gate a route. (When a lane is later authored and the marker is gone, the route opens automatically.) **No lane is gated today** — `react-native`, `ios`, `android` and `react` are all authored. The gate is retained because it is the invariant, not a note about any one platform: a lane added or reverted to placeholder state is caught here automatically, with no edit to this command.
5. **Design-reference gate — a design reference is required only when the feature introduces or changes user-facing UI, and is mandatory when it does.** Decide first whether the feature changes the user-facing surface, then apply exactly one branch:

   - **No new or changed user-facing UI** → **do not ask for Figma or any other design input.** Record `design_reference_status: not_required`, `design_reference_type: none`, `design_reference: null`, `figma_link: null`. This covers technical migrations (for example an **ExoPlayer-to-Media3 migration**), refactors, dependency upgrades, infrastructure work, performance improvements, and other behavior-preserving changes. This is the default whenever the user-visible surface is unchanged.
   - **New or changed user-facing UI, and a design reference was supplied** in `$ARGUMENTS` or the conversation → use it and record it per the table below. Do not ask anything further.
   - **New or changed user-facing UI, and no design reference was supplied** → **stop and ask for one, then wait.** A design reference is mandatory here: do not proceed on a user's assertion that no design input exists, do not fall back to `not_required`, and do not invent screens or layout from the text description. Ask:

     ```
     This feature introduces or changes user-facing UI, so a design reference is required
     before an approach can be proposed. Please provide one of:

     1. Figma link
     2. Design specification document (path or URL)
     3. Exported mockups or screenshots (path or URL)
     4. Zeplin / Adobe XD reference
     5. An existing screen or component in this app to mirror (name it precisely)
     6. Another approved UI design artifact
     ```

     Re-ask until a usable reference is supplied. `design_reference_status: not_required` is **never** a valid outcome for a UI-changing feature.

   Record the supplied reference as:

   | Reference | `design_reference_type` | `figma_link` | `design_reference` |
   |---|---|---|---|
   | Figma link | `figma` | the Figma URL | `null` |
   | Design spec document | `document` | `null` | path/URL of the document |
   | Mockups / screenshots | `screenshots` | `null` | path/URL of the exports |
   | Existing screen/component to mirror | `existing_ui` | `null` | the precise screen/component reference |
   | Zeplin / Adobe XD / other artifact | `other` | `null` | URL or location of the artifact |

   In all `provided` cases set `design_reference_status: provided`. **Figma is one supported reference type, not a requirement** — never tell the user Figma specifically is mandatory. If the supplied reference cannot be accessed (Figma MCP failure, unreadable path, missing document, unresolvable screen name), **stop with the exact error** rather than guessing.
6. The `feature-architect` agent proposes screens/views from whatever reference step 5 resolved — reading Figma via the `figma` MCP server when the type is `figma`, otherwise reading the recorded reference through the appropriate available mechanism. The agent does not raise its own Figma request and does not gate on Figma specifically.

   **Keep what that read returned as evidence (ENG-003)** whenever the reference — or the source specification — lives outside the repository, so step 7 can fingerprint the content actually consumed rather than its URL. Save it as one JSON file per source, **outside `TARGET_ROOT`** (the session's scratch directory), shaped `{ "source": "<the URL read>", "parts": [{ "name": "<read>", "content": "<its raw output>" }] }`:

   - **Figma** — exactly two parts, the raw output of the two reads the design step makes for the linked node: `get_metadata` (the node tree) and `get_design_context` (its styles, text and layout). No screenshot — a rendering is not a stable byte stream. This is the design read the agent already performs; it adds no extra scan.
   - **A hosted specification or other external document** — one part, `content`: the raw text as retrieved. Never a summarizing fetch: a model-processed summary is not the same bytes twice, so it cannot evidence the content.
7. Populate `templates/feature-analysis-template.md` in full:

   - `doc_schema_version`, set to the feature-analysis kind's current version per `docs/planning-doc-contract.md`. This makes the document self-describing so a later stage can tell an older contract from a malformed one; it is stamped here at generation and upgraded only by `scripts/migrate-planning-doc.ts`. Do not run the migration framework here — migration happens on **load**, never during generation.
   - The feature request.
   - The **confirmed** `platform` (a single value — never `mixed`) and the **confirmed** `device_type` (`mobile` or `tv`) frontmatter fields.
   - The six `repo_knowledge_*` frontmatter fields and the `## Repo Knowledge Reference` section, per the `repo-knowledge-consumer` skill's Step 6 block shape.
   - The confirmed `surface` (step 2a) and the located `capability` (step 3a) frontmatter fields — `null` when there is none — and the `## Project Knowledge Context` section: the capability's identity and cited evidence, only the direct relationships relevant to understanding this feature with why each is relevant, the current-source evidence for any relationship re-checked because it was stale, and the likely change-surface context. Never paste unrelated graph data.
   - `repo-analyst`'s findings in the `## Repo Context` section — **cite reused knowledge, embed only what was derived live.** A fact that came from canonical knowledge is recorded as a path plus anchor, never pasted; a fact derived live is recorded inline and labelled as a point-in-time observation. The Platform Detection, Device Type, and Standards Conformance findings are always derived live, so they are always embedded. This is the change that stops repository facts from being frozen into an approved document that outlives them.
   - `feature-architect`'s proposed approach as a single flat "Proposed Technical Approach" section.
   - The four design-reference fields exactly as resolved in step 5 (`design_reference_status` — `provided` or `not_required`, never left `pending`; `design_reference_type`; `design_reference`; `figma_link`).
   - Any open questions/risks. When the status is `not_required`, record in "Open Questions & Risks" why the feature has no user-facing UI change.
   - The **upstream fingerprints** (ENG-003), so `/implement-task` can later tell that an input moved — by its **content**, never by its URL alone. When the request came from a specification (a spec, PRD or story), set `source_link` to its repository-relative path or its URL and stamp `source_fingerprint`; when it was given inline, set both to `null` — the analysis body is then the root of the chain. After the four design-reference fields are written, stamp `design_reference_fingerprint`. Pass the step 6 evidence file for any external source:

     ```
     node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" source-fingerprint \
       --root "<TARGET_ROOT>" --source "<source_link>" [--source-evidence "<spec evidence file>"]
     node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" design-fingerprint \
       --root "<TARGET_ROOT>" --file "<absolute feature analysis path>" [--design-evidence "<design evidence file>"]
     ```

     A repository file is hashed by its bytes and needs no evidence; an external source is fingerprinted from its evidence. Never invent either value: when a helper reports `unverifiable` or anything else but `ok`, leave the field `null` (unknown, never a mismatch) and say so.

   Every downstream stage reads these fields rather than re-asking or re-detecting.
7a. **If a feature analysis already exists for this feature**, ask how to handle it — `Overwrite` / `Update` (merge new findings) / `Preserve` (write to a new filename) / `Version` (rename the existing file, e.g. append its date) — the same four options `/dev-design-start` offers for a DD. This is the chain root, so it is where an upstream requirement change re-enters the pipeline.

   **The plugin never edits the requirements itself and never confers or revokes approval.** A human amends the analysis and re-approves it; this command only writes the document it is asked to write and leaves `status: proposed`. When downstream artifacts already exist, say so plainly: a regenerated analysis makes the DD's `source_fingerprint` mismatch, which is what sends the next stage back through `/dev-design-start`. Re-stamp `source_fingerprint` and `design_reference_fingerprint` on every regeneration — if the regenerated body is byte-identical, the DD still matches and nothing downstream is rerun.

8. This is a proposal, not a design. A human reviews the populated feature analysis and flips its status to `approved` before `/dev-design-start` turns it into a Detailed Design (DD).
