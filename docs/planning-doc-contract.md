# Planning Document Contract

**Owner:** `ono-mobile-dev-plugin`
**Framework:** [`scripts/migrate-planning-doc.ts`](../scripts/migrate-planning-doc.ts)
**Loader:** [`skills/planning-doc-migration/SKILL.md`](../skills/planning-doc-migration/SKILL.md)
**Approved design:** [`docs/planning/SHARED-011-legacy-document-migration-design.md`](planning/SHARED-011-legacy-document-migration-design.md)

This file is the human-owned half of SHARED-011. It declares what each planning
document's frontmatter must look like, how a document written against an older
version is brought forward, and the rules for adding a version later.

> **When this file changes, change `scripts/migrate-planning-doc.ts` in the same
> commit.** The version table below is parsed by `migrate-planning-doc.test.ts`
> and compared against the script's `CURRENT_SCHEMA_VERSION`, so the two cannot
> drift silently — the same discipline `docs/repo-knowledge-contract.md` applies
> to the repository-knowledge contract.

## Current versions

| Document kind | Current version |
|---|---|
| `feature-analysis` | 3 |
| `dd` | 2 |
| `dev-plan` | 1 |
| `task-breakdown` | 1 |

Every generated planning document carries `doc_schema_version` in its
frontmatter. Generating commands stamp it at creation; the migration framework
stamps it at the end of a successful chain. Nothing else writes it.

`dev-plan` and `task-breakdown` are declared **v1 = "the shape as of plugin
0.5.0"**. No migration chain is authored for them, so an unstamped document of
those kinds is *assumed* current — exactly the behavior that existed before
SHARED-011. See [Known limitations](#known-limitations).

## Feature Analysis version history

Recovered from this repository's own git history; each row is a real contract
change that shipped.

| v | Commit | What changed | Marker |
|---|---|---|---|
| 0 | `c77c75d` | `feature`, `dd_link`, `figma_link`, `author`, `status`, `date`. Body section `## Repo Conventions Detected`. | `feature` + `status` |
| 1 | `6c56ec5` | Adds `platform` (**`mixed` permitted**) and `device_type`. | `platform` + `device_type` |
| 2 | `c90c78c` | Replaces figma-only design input with `design_reference_status`, `design_reference_type`, `design_reference`, `figma_link`. Forbids `platform: mixed`. | all three `design_reference_*` |
| 3 | `2cadba7` | Adds the six `repo_knowledge_*` fields. Body section splits into `## Repo Knowledge Reference` + `## Repo Context`. | `repo_knowledge_status` |

## Detailed Design version history

| v | Introduced | What changed | Marker |
|---|---|---|---|
| 1 | plugin 0.5.0 | The DD shape as of SHARED-011: `§1–§26` plus the frontmatter carried from the feature analysis. Stamped, but no chain existed. | none — the fallback |
| 2 | plugin 0.6.0 | Adds `dd_generation` and `dd_complexity_band`, the DD Package contract's frontmatter half (Adaptive Multi-Stage DD, Slice A). | `dd_generation` |

### What v2 adds, and what it deliberately does not

```yaml
dd_generation: single          # single | partitioned — how this DD was produced
dd_complexity_band: unassessed # low | medium | high | unassessed
```

**A DD Package is one canonical DD file that is the sole authoritative
interface.** There is no manifest file and no package directory: the canonical
DD *is* the entry point, exactly as before, and the package metadata rides in
its existing frontmatter. That is deliberate — discovery and versioning already
belong to this contract, and a manifest would be a second mechanism for both.

`dd_generation: partitioned` is **reserved and currently unreachable.** Nothing
writes it, because partitioned generation (the orchestrator and consolidator)
is not implemented. Every DD this plugin produces today is `single`. A reader
must therefore treat `single` as the only value it will encounter, and must not
branch on the field.

`dd_complexity_band` is written by the complexity assessment and is **advisory
only** — it records what the assessment computed, and **never routes anything.**
Generation always takes the single-DD path regardless of the band. The scoring
model is an initial hypothesis being calibrated against real features; it is not
allowed to control behavior until that calibration is done.

A field for the partition inventory is intentionally **not** part of v2. It has
no producer and no consumer until partitioned generation exists, and a field
nothing writes is scaffolding, not a contract.

## Version detection

A `doc_schema_version` stamp always wins. An unstamped document is resolved by
the marker ladder above: **the detected version is the highest version whose
marker set is fully present and non-blank.** Unknown and extra fields never
participate, which is what gives forward tolerance. A stamp above the current
version is refused (`schema-too-new`), never downgraded.

**Rule when adding a version:** choose a marker set that approximates the
condition that version's migration step treats as "already done" — ideally a
field the step always writes. That is what lets an **unstamped** document
written against an older contract be detected one version lower and completed
by the chain.

### What self-healing does and does not cover

The guarantee is real but bounded, and the bounds are deliberate rather than
oversights:

| Situation | Behavior |
|---|---|
| **Unstamped**, marker set for version N not satisfied | Detected below N; the chain runs and completes the document. **This is the self-heal case.** |
| **Stamped** at N, some of N's fields missing or blank | Reports `current`. The stamp short-circuits before detection, so **the document is not repaired.** |
| **Unstamped**, satisfies N's marker but lacks other fields N's step writes | Detected at N and skipped, so those fields stay missing. |

Neither uncovered case is reachable from anything this plugin produces: every
generator writes a version's fields together, and the migration step writes them
in one operation. They are hand-edit states.

**Do not widen a marker to chase them.** Widening cannot fix the stamped case at
all — which is the more likely partial state — and it would desynchronise the
chains: `feature-analysis` v3 has exactly the same shape (one marker field,
`repo_knowledge_status`; six fields written). A marker's job is to *discriminate
between versions*, not to validate a document. If a document ever needs
validating, that is a separate mechanism, not a marker.

Framework metadata (`doc_schema_version`, `migrated_from_version`,
`migrated_by`, `migration_inputs`) never participates in detection. **Adding the
stamp is not a version change.**

## Migration metadata

A migrated document carries exactly these four fields, and no others:

```yaml
doc_schema_version: 3
migrated_from_version: 0
migrated_by: ono-mobile-dev-plugin 0.5.0
migration_inputs: device_type=human@migration, platform=human@migration
```

`migrated_from_version` and `migrated_by` appear only when a chain actually ran
(a stamp-only write records neither). `migration_inputs` appears only when a
human answered something, and exists so a reviewer can see which values were
supplied *after* the document was approved rather than before it.

Only the most recent run is recorded. These documents are committed to git, so
full history already exists somewhere better, and an unbounded array inside a
reviewed document is noise.

**One consequence to know about.** `migration_inputs` is written only when a
human answered something, so it is not cleared by a later fully-deterministic
migration. A document migrated once with human input and again without it keeps
the earlier `migration_inputs` while `migrated_from_version` describes the newer
run — the two fields then describe different migrations. Unreachable today
(only the `feature-analysis` chain asks anything), and it becomes reachable the
first time a second chained version ships for a kind whose chain asks. Read
`migration_inputs` as "a human supplied these values at some migration", not as
"…during the migration `migrated_from_version` names."

### Clock-free by construction

**There is no `migrated_at` field, and the framework never reads a clock.**

This is an implementation-level decision taken after the design was approved. It
supersedes the five-field metadata block shown in SHARED-011 §8.11; the design
document itself is left unamended as the historical approved record.

The reasoning:

- **No consumer.** No command, skill, or test reads a migration timestamp. Every
  provenance question already has an owner: *what shape now* →
  `doc_schema_version`; *what shape before* → `migrated_from_version`; *by what
  code* → `migrated_by`; *what was supplied after approval* →
  `migration_inputs`; *when, and by whom* → git.
- **It was the only source of non-determinism.** A timestamp made the migration
  a function of the wall clock rather than of its input, and forced a `--now`
  escape hatch into the CLI, into every fixture comparison, and into this
  document — an escape hatch existing solely to neutralize one field.
- **It contradicted the design's own purity claim** (SHARED-011 §5, property 3:
  steps are pure functions with no repository, filesystem, or network state).
- **It was lossy anyway.** A later chain overwrites it, discarding the earlier
  migration's date. A lossy audit field that requires a determinism escape hatch
  is the worst of both.

`migrate-planning-doc.test.ts` asserts the source contains no `Date`,
`Math.random`, `--now`, or `migrated_at`, so this cannot regress.

## What a migration may and may not do

### Operations

A step declares typed operations; the runner validates every one before applying
any. A rejected operation aborts the **whole** migration and writes nothing.

| Op | Declared by | Meaning | Precondition |
|---|---|---|---|
| `set` → `add` | step or runner | Introduce a field | The field is absent |
| `set` → `fill` | step or runner | Give a value to an existing empty field | The field exists with **no value** |
| `set` → `stamp` | **runner only** | Advance a framework-metadata field the runner owns | `fromStep` is false **and** the field is in `FRAMEWORK_METADATA_KEYS` |
| `rename` | step | Carry a value to a new key | Source exists; target absent or empty |
| `resolve` | step | Replace a value the new version forbids | Field is in the step's `resolvable` map **and** its current value is in that field's declared `invalidValues` |

`fill` exists because the templates ship keys with explanations and no value
(`figma_link: # optional — the Figma URL …`), and a generated document may
retain them. Filling an empty slot is add-only semantics — no human decision is
being overwritten, because there is no value. Position and trailing comment are
preserved.

`stamp` exists because advancing an already-stamped document necessarily
overwrites `doc_schema_version` — migrating a DD from v1 to v2 must rewrite
`1` to `2` — and a document migrated a second time must likewise rewrite
`migrated_from_version` and `migrated_by`. Before `stamp` existed the runner
attempted this through `fill`, which rejected, so **any stamped document could
not be migrated forward at all.** That was unreachable while `feature-analysis`
was the only kind with a chain (its legacy documents predate stamping, so the
stamp was always an `add`), and it surfaced the moment `dd` gained one.

### The two overwrite paths

**A migration may never overwrite an existing value except through one of
exactly two declared paths.** Everything else is rejected, and a `set` whose
value already matches is a silent no-op.

| Path | Who | What it may overwrite | Guard |
|---|---|---|---|
| `resolve` | a migration **step** | A document field whose current value the new version forbids | The field must be pre-declared in that step's `resolvable` map, and its current value must be in that field's declared `invalidValues` set. In practice: `platform: mixed`. |
| `stamp` | the **runner** only | Only `doc_schema_version`, `migrated_from_version`, `migrated_by`, `migration_inputs` | `fromStep` must be false **and** the field must be in `FRAMEWORK_METADATA_KEYS`. Both conditions, always. |

The two paths cannot reach each other's territory. A step fails `stamp`'s
`fromStep` condition, so it can never advance framework metadata. The runner
fails `resolve`'s declaration requirement and, for any non-framework field,
`stamp`'s membership condition — so it can never rewrite document content. And
`PROTECTED_KEYS` (`feature`, `status`, `author`, `date`) is checked *above* both
paths, unconditionally, so neither party can touch approval or identity.

The stamped field name is always a literal in the source; nothing derives it
from the document, so document content cannot select what gets overwritten.
`migrate-planning-doc.test.ts` pins all of this: the runner may advance the
stamp and `migrated_by`; a step attempting the same is rejected; the runner
writing `status` is rejected; and the runner overwriting a populated
non-framework field is rejected.

### Protected keys

`feature`, `status`, `author`, `date` can never be written by any operation.
This is a runtime check in the runner, not a convention, and
`migrate-planning-doc.test.ts` feeds it a deliberately misbehaving step to prove
it — and the same check rejects the **runner**, so protected keys are unwritable
by either party. Framework metadata keys are unwritable *by a step*; only the
runner sets them, and only it may advance them, via `stamp`.

**Approval therefore survives by construction.** A migrated document keeps its
`status` byte-for-byte, migration never confers or revokes approval, and no
consumer treats migration metadata as approval-relevant. The consumer's approval
gate runs *after* the load and reads the same `status` it always did, so a
legacy `proposed` analysis migrates successfully and is still rejected by
`/dev-design-start`. Migration is not an approval bypass.

### Body

**Frontmatter only. The body is never rewritten.** It is held as an opaque
Buffer slice, never parsed for rewriting, and asserted byte-identical before the
file is written. Headings, whitespace, evidence, links, timestamps, and
generated content are physically incapable of changing.

One consequence, deliberate: the v2→v3 body change (`## Repo Conventions
Detected` → `## Repo Knowledge Reference` + `## Repo Context`) is **not**
performed. A migrated legacy analysis is frontmatter-valid and body-legacy. The
loader reports this, and `/dev-design-start` records it in the DD's §23
Assumptions. Consumers read the legacy heading tolerantly.

The body *is* read — read-only — for one narrowly scoped inference; see below.

## Inference rules

These rules govern **document fields** — the ones a migration step fills.
Framework metadata is not inferred and is covered by
[The two overwrite paths](#the-two-overwrite-paths) instead.

Every field resolves to exactly one of three outcomes. There is no fourth
"best guess."

| Outcome | Meaning |
|---|---|
| **carry** | A value is already present. Never overwritten by a step — only `resolve` may, under its declared guard. |
| **derive** | Document-internal evidence is conclusive. |
| **ask** | `needs-input`. Nothing is written until answered. |

**SHARED-011 is a planning-document compatibility layer, not a repository
re-analysis flow.** The migrator's entire evidence universe is the bytes of the
document being migrated. It never invokes `repo-analyst`, never reads
`.ono/repo-knowledge.json`, and never inspects source — because a migration
whose output depends on repository state is not a function of its input, and
because repository state today is not the state the human approved against.

| Field | Rule |
|---|---|
| `platform` (absent) | **ask** — options `react-native` / `react` / `ios` / `android`. `mixed` is not offered even though v1 permitted it; offering it would only force a second question, and the result is a narrower but entirely legal v1. |
| `platform: mixed` | **resolve** via **ask**, same four options. Fires only when the value is exactly `mixed`. |
| `device_type` | **carry** if present. **derive** only from an explicitly *labelled* device line in the body resolving to exactly one value (`Device Type: tv`, `**Device type:** mobile`). Otherwise **ask**. |
| `design_reference_*` | **derive** when `figma_link` holds a real link (`provided` / `figma` / `null`), or when an existing status implies the rest. Otherwise **ask** — v0/v1 could not distinguish `not_required` from a UI feature whose reference was never recorded, and the two drive different `/dev-design-start` branches. |
| `figma_link` | Carried byte-verbatim when meaningful. Added or filled as `null` when absent or empty. |
| `repo_knowledge_*` | Fully deterministic; see below. Never resolved from the repository. |

### Why `device_type` is never inferred from repository signals

Beyond reproducibility and anachronism: **this organisation's Android TV surface
uses a custom in-house framework**, so the conventional signals (Leanback,
`androidx.tv`, Compose for TV) are absent or actively misleading. A keyword
heuristic over the document or the repository would not be *uncertain* — it
would be confidently wrong, and it would write that wrong value into an approved
document. Prose mentioning "TV" is explicitly not evidence.

### The v2→v3 `repo_knowledge_*` values

When `repo_knowledge_status` is blank or absent, the step writes exactly:

```yaml
repo_knowledge_status: unavailable
repo_knowledge_schema: null
repo_knowledge_fingerprint: null
repo_knowledge_freshness: null
repo_knowledge_reused: none
repo_knowledge_derived: stack, commands, structure, inventory, conventions, integrations, auditTopics
```

These are not a convenient default — they are the block
`skills/repo-knowledge-consumer/SKILL.md` already specifies for the unavailable
case, and they are *semantically* correct: that block means "all repository
context in this document was derived live at authoring time and is a
point-in-time observation," which is precisely what a pre-v3 analysis contains
(the v0 template described its section as "repo-analyst's structured findings,
verbatim"). `migrate-planning-doc.test.ts` parses those six values out of the
consumer skill and compares them, so a change there breaks the build.

Two details worth recording:

1. `unknown` is a valid **freshness** verdict but **not** a valid
   `repo_knowledge_status` — the status enum is exactly
   `available | unavailable`.
2. The consumer skill's block also carries a body section whose prose
   interpolates a `reason` from the reader's enum (`absent`, `unparseable`,
   `invalid`, `schema-too-new`, `worktree`, `root-not-found`). **None of those
   means "authored before the contract existed."** Since the migrator writes no
   body, this creates no invalid frontmatter — but it is a real gap in that
   contract and is tracked in the SHARED-011 design's Open Decisions.

If `repo_knowledge_status` already holds a value, the step writes nothing: the
document already asserts a knowledge state, and compatibility is not repair. Any
blank siblings stay blank and are inert, because `/dev-design-start` re-resolves
knowledge from its own run and never copies these values forward.

## Frontmatter encodings

Two forms are supported, and a document keeps whichever it uses.

| Encoding | Recognized as |
|---|---|
| `delimited` | The file begins with `---`; the block ends at the next line that is exactly `---`. A UTF-8 BOM before it is preserved. |
| `fenced-yaml` | The first ` ```yaml ` (or ` ```yml `) fence appearing **before the first level-2 heading outside an HTML comment**, closed by a bare ` ``` `. |

Delimited wins when both could match, so a `---` document whose body contains a
` ```yaml ` block is never mis-split. The HTML-comment guard is required, not
decorative: `templates/dev-plan-template.md` puts its fence at line 11, behind a
multi-line comment. Anything else is refused (`unsupported`) rather than guessed.

Within the block, parsing is **line-oriented, not a YAML round-trip** — this
repository ships no dependencies, and a serializer round-trip would silently
discard the templates' explanatory comments. Untouched lines are re-emitted
byte-verbatim; only added, filled, or resolved lines are regenerated. An inline
comment is recognized only at a whitespace-preceded `#`, so
`docs/patterns.md#anchor` and a Figma URL carrying a `#fragment` survive intact.

## Failure and reporting

The helper **always exits 0 and always prints one JSON object.** Callers branch
on `status`, never on the exit code — the same posture as
`scripts/read-repo-knowledge.ts`, and deliberately unlike
`scripts/resolve-target-repo-root.ts`, because a caller here must distinguish
nine outcomes.

| Status | Meaning | Writes? |
|---|---|---|
| `current` | Stamped at the current version. True no-op — no chain, no serialization, no message. | No |
| `migrated` | Chain applied and written. | Yes |
| `would-migrate` | `--check`: everything except the write. | No |
| `needs-input` | Ambiguous values remain. All questions batched into one result. | No |
| `unsupported` | No recognizable frontmatter, or no version detectable. | No |
| `schema-too-new` | Stamped above the current version. | No |
| `kind-mismatch` | The document carries a marker exclusive to another kind. | No |
| `rejected` | A step **or the runner** violated an operation rule, or the body-hash assertion failed. | No |
| `unreadable` | Missing file, unreadable path, bad `--answers`, or a failed write. | No |

Nothing is written until every check passes, and the write itself is atomic
(sibling temp file, then rename), so a crash leaves either the old file or the
new one — never a truncated one. There is no `.bak`: git is the undo.

## Adding a version later

The point of the framework. To take Feature Analysis from v3 to v4:

1. Update `templates/feature-analysis-template.md` and add a v4 row to the
   history table above, with its marker.
2. Bump `CURRENT_SCHEMA_VERSION["feature-analysis"]` and the version table here.
3. **Append** one `{ from: 3, to: 4 }` entry to the chain.
4. Add a fixture pair, plus a `needs-input` fixture if the new field can be
   ambiguous.
5. `/analyze-feature` stamps `4`.

**Released migration steps are frozen.** Never edit a shipped step to
accommodate a later contract change — that is the next step's job. Editing one
silently changes every document that already passed through it. This rule is
enforced in review, not by the runtime, and it is the single most important
discipline in the design.

No command file changes. No skill changes. No existing migration edited.

## Consumers

Exactly these components load a planning document through the loader skill.
Keep this list current — it is how a reviewer knows the compatibility layer is
still single.

| Consumer | Document kind | Wired? |
|---|---|---|
| `/dev-design-start` | `feature-analysis` | Yes |
| `/dev-feature-start` | `dd` | **Yes** — wired when `dd` gained a chain at v2 |
| `/implement-task` | all four | Deferred — see below |

## Known limitations

Recorded so a later author does not discover them the hard way.

- **`dev-plan` and `task-breakdown` still have no authored chain.** They stamp v1
  and are assumed current. When one of those contracts next changes, its detector
  markers must be recovered retroactively from git history the way the Feature
  Analysis table above was, and the pre-0.5.0 variants in the wild must be
  tolerated by its v1→v2 step.
- **`qa_handoff_link` on the task breakdown is additive and deliberately outside
  the version chain.** `/create-dev-qa-notes` writes it into an already-approved
  breakdown after the QA handoff is generated (`QA-LINK-1` in
  `standards/shared/qa-handoff.md`), and does **not** bump
  `doc_schema_version`. That is safe by construction: extra fields never
  participate in detection, untouched lines are re-emitted byte-verbatim, and the
  field is written by a command rather than by a migration step, so neither
  overwrite path is involved. It is recorded here so a later author does not read
  a `task-breakdown` v1 document carrying an unlisted key as drift. If
  `task-breakdown` ever gains a v2 for other reasons, fold this field into that
  version's shape then — do not author a version for it alone, since nothing
  needs migrating: a breakdown without the key simply has no handoff yet.
- **`/implement-task` is still not wired to the loader**, even though `dd` now has
  a chain. It resolves the DD, the dev plan, the task breakdown and the feature
  analysis from frontmatter links and reads fields that exist in every version;
  `dd` v2 is purely additive, so an unmigrated v1 DD reaching `/implement-task`
  behaves exactly as before. Wiring it is worthwhile but is not required for
  correctness, and it would pull three unchained kinds into the loader for no
  present benefit.
- **A v1 DD is migrated the first time `/dev-feature-start` loads it**, which
  writes to a document a human already approved. That is the framework's normal
  behavior — frontmatter only, body byte-identical, `status` untouched — but it
  is the first time it happens to a DD rather than a feature analysis, so expect
  a two-line frontmatter diff on older features.
- **`feature-analysis` and `dev-plan` are not distinguishable from each other**
  by frontmatter alone — both carry `dd_link` and neither carries a field the
  other lacks. Kind-mismatch detection is therefore a *negative* check only: it
  refuses a document carrying a field that belongs to exactly one other kind —
  `detail_level` → DD, `dev_plan_link` → task breakdown. It cannot catch a dev
  plan passed as a feature analysis. This costs nothing today because
  `dev-plan`'s chain is empty.

  Note which fields are **not** on that list. `feature_analysis_link` looks like
  a DD marker but the task breakdown carries it too, so treating it as exclusive
  wrongly refuses a valid task breakdown. Only add a field here after checking
  every template for it; `migrate-planning-doc.test.ts` loads all four shipped
  templates through the framework to catch exactly that mistake.
- **Fixtures live on disk**, unlike `read-repo-knowledge.test.ts`'s temp-directory
  fixtures. Deliberate: these documents are compared byte-for-byte and contain
  ` ```yaml ` fences, CRLF endings, and trailing whitespace, none of which
  survives a TypeScript template literal without escaping every backtick — which
  is precisely the corruption the tests exist to catch.
