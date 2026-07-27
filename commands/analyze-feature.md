---
description: Analyze a feature request against the current repo's conventions before planning it.
argument-hint: [feature-description-or-requirement]
---

Analyze the feature described in `$ARGUMENTS` (a feature description, product requirement, or user story, optionally including a design reference such as a Figma link) against this repo's actual conventions.

**No DD exists at this stage.** A Detailed Design (DD) is produced later by `/dev-design-start` from the *approved* Feature Analysis this command creates. Do not ask for a DD, do not expect one as input, and do not treat `$ARGUMENTS` as a DD link — this command is the step that produces the Feature Analysis which later feeds `/dev-design-start`.

1. Apply the `mobile-repo-analysis` skill methodology. Invoke the `repo-analyst` agent first to **detect the platform** (React Native, native iOS, native Android, React web, or a mix) using its platform-detection algorithm, before anything else.
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
3. Once the platform is confirmed by the user (step 2), `repo-analyst` runs platform-specific stack detection for the confirmed platform (for React Native: navigation library, state-management library, data-fetching layer, testing setup, monorepo tooling, folder structure, lint/format config; for iOS/Android/React: lightweight existence checks only, per the current placeholder depth of those standards).
4. Invoke the confirmed platform's architect agent with those findings to propose a technical approach — `rn-architect` / `ios-architect` / `android-architect` / `react-architect` (one architect, matching the single confirmed platform) — grounded in what was actually detected, not assumed defaults.
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
6. The architect agent proposes screens/views from whatever reference step 5 resolved — reading Figma via the `figma` MCP server when the type is `figma`, otherwise reading the recorded reference through the appropriate available mechanism. The architect does not raise its own Figma request and does not gate on Figma specifically.
7. Populate `templates/feature-analysis-template.md` in full: the feature request, `repo-analyst`'s findings verbatim (including the Platform Detection section), the **confirmed** `platform` (a single value — never `mixed`) and the **confirmed** `device_type` (`mobile` or `tv`) frontmatter fields, the confirmed platform architect's proposed approach as a single flat "Proposed Technical Approach" section, the four design-reference fields exactly as resolved in step 5 (`design_reference_status` — `provided` or `not_required`, never left `pending`; `design_reference_type`; `design_reference`; `figma_link`), and any open questions/risks. When the status is `not_required`, record in "Open Questions & Risks" why the feature has no user-facing UI change. Every downstream stage reads these fields rather than re-asking.
8. This is a proposal, not a design. A human reviews the populated feature analysis and flips its status to `approved` before `/dev-design-start` turns it into a Detailed Design (DD).
