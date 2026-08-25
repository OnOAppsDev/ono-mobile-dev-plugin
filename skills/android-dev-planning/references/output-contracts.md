# Output contracts — what each stage receives

The same Android analysis feeds three stages, and **the three consume different parts of
it.** Produce the full analysis every time; hand over only what the stage's contract calls
for. Verbatim inclusion is never assumed.

## Contents

- The five parts of the analysis
- Stage contracts (Analyze / Design / Feature-start)
- Impacted Modules — reporting resolution
- Traceability rules

## The five parts of the analysis

1. **Implementation Model Found** — the repository's actual UI model per surface,
   architecture pattern, state approach, navigation mechanism, DI, concurrency model,
   networking, persistence, module layout, and — when `device_type: tv` — the TV model.
   Every line labelled `[evidence: <path>]`, `[reused: <path>#<anchor>]`, `[inference]`, or
   `[unknown]`. **Produce this in full every time**: it is what grounds parts 2–5.
2. **Technical Approach** — Surfaces · State & Data · Navigation · Module & Folder
   Placement · Lifecycle & State Restoration · Concurrency & Background Work · Persistence &
   Networking · Testing · Performance · Accessibility, i18n/RTL, Security, Logging &
   Analytics. Each item cites the `AND-*` and shared IDs it follows.
3. **Impacted Modules** — the change inventory, distinct from part 2's forward-looking
   placement decision. Resolution rules below.
4. **Existing · Required · Recommended** — three explicitly separated lists, never merged:
   what is already there and will be followed; what this feature genuinely needs; and
   recommended deviations, each carrying an explicit justification and an approval gate.
   Optional modernization suggestions are *content routed into* the third list (or into
   Unresolved), never a fourth class and never folded into Required — per
   `skills/dev-design-start/SKILL.md` § *Shared planning rules → Classification*, which
   owns the taxonomy.
5. **Unresolved Decisions** — every question needing a human answer, with the options and
   what each implies.

## Stage contracts

**Section numbers are fixed and are cited by number.** `skills/dev-design-start/SKILL.md`
states that the platform architects cross-reference §19, §20, §25 and §26 by number, and
`commands/dev-feature-start.md` decomposes §19 and §20 by number. Use the numbers.

| Stage | Receives | Notes |
|---|---|---|
| `/analyze-feature` | **All five parts**, flattened into the single "Proposed Technical Approach" section of `templates/feature-analysis-template.md` | The evidence base belongs in this document — it is what a later reader resolves the design from. **Part 3 at this stage names the expected surface only** — the modules and packages the feature is expected to touch. The full change-class inventory is Design-stage output |
| `/dev-design-start` | **Parts 2–5 only** — Part 2 → DD **§19** Technical Implementation Approach, Part 3 → DD **§20** Impacted Modules, Part 4's Recommended entries → **§19** with their justification and **§23** where one rests on an assumption, Part 5 → **§24** Open Questions | Part 1 is **research that informs the DD, not DD content.** The DD cites its conclusions; the sweep is never pasted in |
| `/dev-feature-start` | The Android **vocabulary and standard IDs** used in each task's description and acceptance criteria, against **§19**, **§20** and the Acceptance Criteria Mapping in **§25** | Task decomposition itself belongs to `skills/dev-feature-start` |

Two rules apply across all three:

- **`skills/dev-design-start`'s Step 6 and Step 7 govern what actually lands in the
  document.** Never assume verbatim inclusion of anything produced here.
- Exactly one confirmed platform always applies, so these sections are **always flat** —
  never split into per-platform subsections.

## Impacted Modules — reporting resolution

Work at **module and change-class resolution**. Name each affected module, package,
component, and service, and for each state:

- the **class of change** it undergoes, and whether it is created, modified, or only read;
- an **approximate site count** where the same change repeats across many files — for
  example, "`:player` — all `SimpleExoPlayer` construction sites move to
  `ExoPlayer.Builder`, ~40 sites".

**Enumerate individual files only when** the affected set is small — roughly **ten or fewer
sites** for a given change class — or when a specific file is a **design-relevant
boundary**: it defines a public surface, carries a decision of its own, or is the seam the
design turns on. A file that is simply one more instance of an already-stated change class
is not enumerated.

**Per-file expansion belongs to `/dev-feature-start` and the task breakdown**, which turns
each change class into per-file tasks and re-reads the repository to do so. A DD that lists
every touched file has written the task breakdown in the wrong document.

Keep each note at the level of **what** changes, never **how** to change it.

**Build on what is already published rather than re-deriving it.** Where the repository
carries canonical knowledge, take the module map from the `CLAUDE.md` structure pointers and
name reused components from `docs/project/components.md` by path, with conventions from
`docs/project/patterns.md` and services or SDKs from `docs/project/integrations.md` — all
resolved through the `repo-knowledge-consumer` skill, never parsed directly.

**Every path must be evidence-backed** — a path actually seen during the sweep. Where a
location is genuinely not yet determined, mark it explicitly, for example
`[unknown — target module not determined]`, rather than inventing a plausible path.

## Traceability rules

Every element of the plan traces to something concrete:

| Element | Traces to |
|---|---|
| Repository claim | a path, via `[evidence: <path>]` or `[reused: <path>#<anchor>]` |
| Requirement | the upstream document section it comes from |
| Rule | a real `AND-*` or shared ID, cited only where it genuinely applies |
| Recommendation | an explicit justification |

Never cite an ID that does not exist, and never cite one that is merely adjacent to the
point being made. **Never use React Native's generically-named `ARCH-*`/`API-*`/`STATE-*`/
`NAV-*` IDs for Android** — those are RN-specific; Android cites the `AND-*` roots.
