---
name: dev-design-start
description: Shared methodology for turning an approved feature analysis into a decision-complete Detailed Design (DD) document, across any platform. Used by /dev-design-start alongside the platform-specific dev-planning skill (rn-/ios-/android-/react-dev-planning) for the Technical Implementation Approach section's vocabulary and standard IDs. This skill NEVER generates development tasks — /dev-feature-start does that from an approved DD. It NEVER modifies source code.
---

## What a Detailed Design Is

**The DD is the decision record.** Given the approved feature analysis (*what* and *why*) and the repository evidence, it records the design decisions a developer must not be left to make alone, plus the contracts and acceptance criteria those decisions imply — at exactly the resolution `/dev-feature-start` needs to decompose them into tasks and a reviewer needs to judge the result.

It is **decision-complete and minimal**: every decision recorded, and nothing else.

### The inclusion test

Apply this to every line before writing it, and again in Step 7:

> **If this line were deleted, could two competent developers implement the feature in mutually incompatible ways — or could a reviewer be unable to tell whether the result is correct?**

If neither, **it does not belong in the DD.** Volume is not thoroughness. An unmade decision is the only real gap.

### Belongs in the DD

- **Decisions where a real alternative existed**, and which option was chosen. This is the actual design content.
- **Contracts that cross a boundary** — API shapes, event names, state ownership, module boundaries, the public surface of any new abstraction.
- **Behavior that is chosen rather than inherited** — error policy, loading and empty semantics, how each edge case resolves.
- **The change surface at module and change-class resolution** — never files × edits.
- **Risks that change the plan**, assumptions that would invalidate a decision if wrong, and open questions that block.
- **Acceptance criteria** (§25) — the verifiable bridge into the task breakdown.

### Does NOT belong in the DD — and which document owns it

| Content | Owner |
|---|---|
| Repository evidence transcripts, stack surveys, `[evidence: <path>]` sweeps | **Feature Analysis** + the architect's working notes |
| Restated feature request, business context, detected repo conventions | **Feature Analysis** — link it, never copy it |
| Per-file change inventories, task sequencing, ordering, effort sizing | **Task Breakdown** (`/dev-feature-start`) |
| Rollback plan | **Dev Plan** (`templates/dev-plan-template.md`) |
| Code, signatures, pseudocode, config snippets, migration mechanics | **Implementation** (`/implement-task`) |
| Test cases, QA steps, verification procedures | **Verification / QA handoff** (`/create-dev-qa-notes`) |
| Framework tutorials, general best practice, restated standards prose | **Standards** — cite the ID instead |
| Exhaustively enumerated behavior the change *preserves* | **The existing codebase** — it already is that specification |

This table is enforceable, not advisory. Step 7 applies it.

## Methodology

Generate a **decision-complete and minimal** Detailed Design, grounded in repository facts already captured by the Analyze stage, validated against the design, and ready for `/dev-feature-start` to consume. This skill **never** generates implementation tasks and **never** modifies source code.

### Step 1 — Preconditions (resolved by the command, never re-derived here)

`/dev-design-start` owns artifact resolution and the approval gate: it has already located the feature analysis, loaded it through the `planning-doc-migration` skill, confirmed `status: approved`, and read its authoritative context. **This skill receives the following and never re-derives any of it:**

- the path to the **approved feature analysis**;
- `platform` — authoritative, and always exactly one of `react-native` / `react` / `ios` / `android`;
- `device_type`;
- the four design-reference fields — `design_reference_status`, `design_reference_type`, `design_reference`, `figma_link` — all of which carry forward into the DD unchanged;
- this run's repository-knowledge resolution;
- whether the loader reported a migration, and what it reported.

If any of these is missing, **stop and report which one.** Do not locate, load, migrate, or approval-gate a planning document from here, and do not re-run platform detection — a second copy of those gates is how the two layers drift.

The approved feature analysis IS the specification for this DD: its Feature Request, repo-analyst's detected conventions, the architect's Proposed Technical Approach, and its recorded design reference are the inputs. Do not restate the analysis's content in the DD — link it.

### Step 2 — Decide detail level and existing-file strategy

Ask the developer two things before generating:

1. **Detail level** — `Standard` or `Comprehensive`. Both are decision-complete. They differ in **depth on contested decisions, never in breadth across sections.**

   | Level | What it adds | Expected size |
   |---|---|---|
   | `Standard` | Each decision stated with the chosen option and a one-line rationale. | roughly **250–450 lines** |
   | `Comprehensive` | Additionally, **only for decisions where an alternative was genuinely viable**: the alternatives considered, the tradeoff, and why the rejected option was rejected — plus deeper risk analysis. | roughly **400–700 lines** |

   **`Comprehensive` never means "deep-dive every section."** It means depth where a decision was genuinely contested. A section with one obvious answer stays one line at either level. Comprehensive **never** adds implementation detail — it deepens *why this design*, never *how to build it*.

2. **If a DD already exists for this feature** — how to handle it: `Overwrite` / `Update` (merge new findings) / `Preserve` (write to a new filename) / `Version` (rename the existing file, e.g. append `-v1`, before writing). **Never blindly overwrite an existing DD.**

**The size figures above are review triggers, not caps, and never truncation rules.** Above **~800 lines** a contraction review (Step 7) is **mandatory**: at that size the overage is presumed to be leaked Task Breakdown, Implementation, or Verification content, and it must be found and removed. **Never remove a real design decision to satisfy a budget.** If the DD still exceeds the trigger after honest pruning, that is allowed — record the reason in §23 Assumptions and continue.

### Step 3 — Read all available context

Read, in this order, everything that exists — do not skip any:

1. The **approved feature analysis** (spec + detected conventions + proposed approach).
2. The **design reference** the command resolved in its step 4, which owns the branch selection and both stop conditions (an inaccessible reference, and UI work with no reference at all). Read it and ground the design in it. When `design_reference_status: not_required` there is nothing to read here and nothing to ask for; skip this item.
3. `docs/` and any architecture/integration/ADR notes, if present.
4. **Canonical repository knowledge first, source inspection only for the gaps.** Apply the `repo-knowledge-consumer` skill, then:
   - Read the documents it reports reusable rather than re-deriving them: `docs/project/components.md` for existing screens, components, and hooks the design should reuse; `docs/project/patterns.md` for the state-management, API, navigation, styling, error-handling, and i18n conventions the design must follow; `docs/project/integrations.md` for the services and SDKs §11 and §21 will reference; and the `CLAUDE.md` structure pointers for the module map §20 builds on.
   - **Then inspect source only for what canonical knowledge does not cover**: any category in `deriveLive`, plus the feature-specific detail no repository-wide document could contain — the actual signatures, props, state shape, and call sites of the specific components and services *this feature* touches. That feature-specific reading is required and is not duplication.
   - When knowledge is unavailable, browse the relevant source directories, existing components, services, and API routes directly — **exactly as this step always did.**

   The distinction to hold onto: repository-wide facts are read from the approved documents; feature-specific detail is read from source. Re-deriving a repository-wide fact that `patterns.md` already states is the duplication this step exists to remove.

   **Reading is not writing.** Everything read here informs the design; only the conclusions reach the DD. A source sweep is never transcribed into the document.

### Step 3a — Measure complexity (advisory; changes nothing)

The command triggers the `dd-complexity-assessment` skill against the Step 3 sweep and reports its `summary`. Two things follow for this methodology, and nothing else does:

1. Carry the band it returns into Step 6's frontmatter as `dd_complexity_band`.
2. Nothing in this methodology reads it. The command's step 3a owns the no-branching guardrail; this skill simply has no rule that consults the band.

### Step 4 — Validate consistency

Cross-check inputs against each other. **This is a checklist to run, not a set of sections to author** — each dimension's output is a design decision or a single line of `N/A — [reason]`. Never write a section per dimension.

- **Spec vs Design** — does every flow in the analysis appear in the design reference, and every screen in the design reference map to a requirement? Are labels/terminology consistent? (Skip when the feature changes no user-facing behavior.)
- **Design vs Architecture** — can every UI element be built with the current component library / design system per the detected conventions? Are new components needed and feasible? Do navigation patterns match existing routing conventions?
- **Completeness** — check for anything missing or ambiguous across: loading states, empty states, error states, happy + failure/edge user flows, every screen transition, permissions/roles, analytics events, API requirements, backend requirements, validation rules, edge cases (boundaries, concurrency, stale data, races), accessibility, responsive/breakpoint behaviour, i18n/RTL, feature flags / rollout strategy.

  **Record a finding from this sweep only when it would change a design decision.** The list is a prompt for your attention, not a list of headings to fill.

### Step 5 — Surface gaps and confirm

If any gap would **change a design decision**, stop and present a structured, labelled list of clarification questions (`[MISSING — …]`, `[AMBIGUOUS — …]`) before generating. Do not continue until those are resolved.

A gap that would **not** change a decision is not an Open Question — drop it. §24 records questions that block, not a transcript of everything unconfirmed.

Proceed to generation when this checkable condition holds: **every design decision in scope has either a recorded resolution or a blocking open question in §24.** If it does not, name the unresolved decision and ask how to proceed. Do not substitute volume for confidence — writing more never satisfies this condition.

**This gap stop is the only one this methodology owns.** Every other stop in the stage belongs to the command — document resolution, loading and the approval gate in its step 1, the design reference in its step 4 — and each is defined there, once. Do not re-raise them here, and do not add a second stop for a condition the command already gates.

### Step 6 — Generate the DD

Populate `templates/dd-template.md`. Apply the existing-file strategy chosen in Step 2. Place it where the repo keeps design docs (check `docs/` conventions) or at the repo root; default filename `{FEATURE-NAME}-DD.md`.

**Section numbering is fixed.** `/dev-feature-start`, `templates/task-breakdown-template.md`, and the platform architects cross-reference §19, §20, §25, and §26 by number. Collapse a section's *content* where the rules below call for it — never renumber, merge, or delete a section heading.

- **Frontmatter — this is the complete field list for a DD:** carry `platform`, `device_type`, and all four design-reference fields (`design_reference_status`, `design_reference_type`, `design_reference`, `figma_link`) from the feature analysis unchanged; set `feature_analysis_link` to the analysis path, `author`, `status: draft`, `detail_level`, `date`. Set `doc_schema_version` to the DD kind's current version per `docs/planning-doc-contract.md` — stamped at generation, **never copied from the analysis**, whose version describes a different document kind. Set `dd_generation: single` and `dd_complexity_band` to the band Step 3a measured (`unassessed` only when the assessment did not run). Both are recorded for the reader and for calibration; **nothing downstream reads either, and neither may change how this DD is written.** Set the six `repo_knowledge_*` fields to the values the command's step 2 resolved for **this run** — never copied from the analysis, since the repository may have moved since it was approved.

  **When the loader reported a migration**, record its provenance in §23 Assumptions exactly as the command's step 2 specifies — that instruction is the single definition of what §23 must carry, and it is not restated here.

- **Cite upstream, never restate it.** §1–§3 summarise the feature in a few sentences and rely on `feature_analysis_link` for the rest — the analysis's Feature Request, Repo Context, and detected conventions are not copied into the DD. §19 records what this design decides **beyond** the analysis's Proposed Technical Approach, rather than re-deriving it. §22–§24 carry forward only items that are **still open**, not the analysis's full list.

- **Repository knowledge citations:** include the `## Repo Knowledge Reference` section per the `repo-knowledge-consumer` skill's Step 6 shape. In §19 and §20, cite the canonical documents for repository-wide facts (`docs/project/patterns.md#<anchor>`, `docs/project/components.md#<anchor>`, the `CLAUDE.md` structure pointers) rather than restating their contents. Reserve inline description for feature-specific detail read from source.

- **§5–§18 — scale the behavior sections to whether user-facing behavior actually changes.** Decide this **semantically**, from what the feature actually does to the user-facing surface — not from a frontmatter field alone.

  **When the feature does not change user-facing behavior** — technical migrations, refactors, dependency upgrades, infrastructure work, performance improvements, and other behavior-preserving changes — **preserved behavior must never be exhaustively re-documented.** The existing codebase already is that specification, and restating it is the single largest source of DD bloat. Collapse §5–§18 into concise behavior-impact coverage with exactly three parts:

  1. **Preserved behavior** — stated by *reference*, not enumeration. One or two lines naming the surfaces whose behavior is unchanged. Never a flow-by-flow, screen-by-screen, or control-by-control inventory.
  2. **Behavior plausibly at risk** — the only part that gets enumerated. What this change could realistically break, and what must therefore still hold afterwards.
  3. **Intentional visible changes** — anything a user will actually notice, if any. Often "none."

  Keep the §5–§18 headings in place, route this coverage through the sections it genuinely touches (usually §17 Error Handling and §18 Edge Cases), and mark the rest `N/A — behavior preserved; see §18`.

  **When the feature does change user-facing behavior**, §5–§18 are load-bearing — fill them for the changed surface. Even then, scope them to *what changes*: an unchanged adjacent flow is referenced, never re-specified.

  **`design_reference_status` is a strong default signal, not the decision.** `not_required` strongly indicates preserved behavior and `provided` strongly indicates changed behavior, but the semantic judgement above governs. A `not_required` feature that nonetheless alters observable behavior gets that behavior documented; a `provided` feature whose design turns out to be behavior-preserving still gets no enumerated inventory of what stays the same. Where the signal and the semantics disagree, follow the semantics and note the disagreement in §23 Assumptions.

- **§19 Technical Implementation Approach — decisions, not evidence.** §19's platform vocabulary and standard-ID citations arrive from the platform dev-planning skill the command routed to in its step 3; what this methodology governs is only what lands in the section. Because the command confirmed exactly one platform, §19 is always a single flat section — never platform-tagged subsections.

  **The architect's repository evidence sweep is research that informs this section; it is not this section's content.** The dimension-by-dimension survey, the `[evidence: <path>]` / `[reused: …]` / `[inference]` / `[unknown]` labelling, and any `device_type` discovery pass are the architect's working notes. §19 receives their **conclusions** — the decisions taken and the standard IDs each follows, with a path citation only where a decision genuinely rests on a specific one. Do not paste the survey. A reader who needs the full evidence base finds it in the feature analysis's Repo Context, not here.

  **The sweep's dimensions and that labelling vocabulary belong to the platform dev-planning skill, not here.** This methodology neither defines nor requires them — it only excludes their raw form from the DD. Do not add a generic dimension list or a generic label set to this skill; a platform-independent layer cannot know what a platform must inspect.

- **§20 Impacted Modules — modules and change classes, not files × edits.** Name the modules, packages, components, and services the feature touches; for each, state the **class** of change and, where the same change repeats, an approximate site count — for example "`:player` — all `SimpleExoPlayer` construction sites move to `ExoPlayer.Builder`, ~40 sites". Enumerate individual files only when a change class has roughly **ten or fewer** sites, or when a specific file carries a design decision of its own.

  **A per-file inventory is a task breakdown, and `/dev-feature-start` owns it** — it expands change classes into per-file tasks and re-reads the repository to do so. A note on what changes must stay at the level of *what* changes, never *how* to change it.

  Build on the module map via the `CLAUDE.md` structure pointers rather than re-deriving it, and name reused components from `docs/project/components.md` by path — a "new" component that already exists is the most common failure this section prevents. Mark a genuinely undetermined location explicitly (`[unknown — target module not determined]`) rather than inventing a plausible path.

- Give every section its content or an explicit `N/A — [reason]`. **"Filled" means the decision is recorded, not that the section is long** — one accurate line beats a page of elaboration, at either detail level. This is the only rule scoping §21 Impacted Services, whose services are named from the integrations document read in Step 3; no separate rule governs it.

### Step 7 — Contract the DD before handing it over (mandatory)

Generation only ever adds. This step is the only one that removes, and it is not optional.

Re-read the generated DD end to end and delete everything that fails either gate:

1. **The exclusion table** in [What a Detailed Design Is](#does-not-belong-in-the-dd--and-which-document-owns-it) — content owned by the Feature Analysis, Task Breakdown, Dev Plan, Implementation, Verification, or the standards.
2. **The inclusion test** — any line whose deletion would neither permit incompatible implementations nor blind a reviewer.

Apply it hardest where leakage concentrates: enumerated preserved behavior in §5–§18, pasted evidence in §19, per-file inventories in §20, restated analysis content in §1–§3 and §22–§24, and any code, pseudocode, or test procedure anywhere in the document.

**If the DD exceeds ~800 lines, this review is mandatory and is expected to find something** — at that size, overage is leaked downstream content until proven otherwise. **Never delete a real design decision to hit a number.** If the DD is still over the trigger after honest pruning, keep it and record why in §23 Assumptions.

**Report the contraction to the developer in one line** — what was removed and which document owns it, for example: *"Pruned ~180 lines: per-file inventory from §20 → task breakdown; evidence sweep from §19 → feature analysis."* Silent pruning is not acceptable; the developer must be able to see what left the document.

## Constraints

- **Never generate implementation tasks.** `/dev-feature-start` does that from an approved DD.
- **Never modify source code.**
- **Never re-run platform detection** — `platform` is authoritative context the command resolved (Step 1).
- **Never blindly overwrite** an existing DD — honour the Step 2 existing-file strategy.
- **Never ignore an unresolved critical gap** — flag it and stop.
- **Always prioritise repository facts** (the feature analysis, detected conventions, actual source) over assumptions.
- **Never exhaustively re-document behavior the feature preserves** — reference it, and enumerate only what is at risk or intentionally changed.
- **Never paste the architect's repository evidence sweep into §19** — it is research, not design.
- **Never enumerate files where a change class describes the work** — per-file inventories are `/dev-feature-start`'s output, not the DD's.
- **Never restate the feature analysis** — link it, and record only what this design adds.
- **Never treat length as thoroughness.** Skipping Step 7 is a defect, not a shortcut.
