---
name: planning-doc-migration
description: Loads a planning document (feature analysis, DD, dev plan, task breakdown) through the SHARED-011 migration framework so every consumer sees exactly one frontmatter shape, migrating a legacy document's frontmatter in place when needed and never touching its body or its approval status. Used by /dev-design-start before reading an approved feature analysis. This is the only component that invokes scripts/migrate-planning-doc.ts, and the single compatibility layer for planning-document frontmatter — no command may carry its own legacy-tolerance rules.
---

## Purpose

The frontmatter contract for planning documents has changed four times. Before
this skill existed, each consuming command carried its own hand-written prose
tolerance for older shapes, so a document written by an earlier plugin version
failed in a newer stage even though its body was still completely valid.

**This skill is the single compatibility layer.** A command loads a planning
document through it and then reads current-shape frontmatter — it never inspects
a legacy shape itself, and never carries its own "accept an older document"
paragraph. A future contract change is then one appended migration, not an edit
to every consumer.

See `docs/planning-doc-contract.md` for the contract, the version history, and
the rules a migration obeys.

## Step 1 — Resolve the document path

Use the path the calling command already resolved. If the command has resolved a
`TARGET_ROOT`, confirm the document sits inside it before doing anything else —
migration writes to the file, so a path that escapes the target root or resolves
under `.claude/worktrees/…` is a stop, not a warning.

## Step 2 — Run the framework

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/migrate-planning-doc.ts" "<path>" --kind <kind>
```

`--kind` is one of `feature-analysis`, `dd`, `dev-plan`, `task-breakdown`, and is
required.

The `--no-warnings` flag is part of the canonical invocation, not optional. Node
emits an `ExperimentalWarning` on stderr when executing a `.ts` file directly;
any caller that merges stderr into stdout would be handed non-JSON and fail to
parse it.

**Never parse a legacy frontmatter shape yourself, and never edit a planning
document's frontmatter by hand to make it load.** The helper is the only
migrator, so every consumer gets identical results. It always exits 0 and always
prints a JSON object — treat a non-zero exit as a broken installation.

Add `--check` to see what would change without writing anything. Use it when
debugging, never as part of a normal load.

## Step 3 — Branch on `status`

| `status` | What it means | What to do |
|---|---|---|
| `current` | Already at the current version. Nothing was read beyond the stamp, nothing written. | Continue silently. **Say nothing** — a no-op must be invisible. |
| `migrated` | The frontmatter was brought forward and written. Body unchanged. | Report one line (Step 4), then continue automatically. |
| `needs-input` | Values remain that cannot be derived. **The file was not modified.** | Go to Step 5. |
| `would-migrate` | `--check` only. | Report and stop; this is not a load. |
| `unsupported` / `schema-too-new` / `kind-mismatch` / `rejected` / `unreadable` | The document could not be loaded safely. | **Stop the workflow and report `error` verbatim.** Do not hand-fix the document, do not retry with a different `--kind`, and do not continue without it. |

## Step 4 — Report a migration in one line

When `status` is `migrated`, tell the developer what happened before continuing:

```
Migrated <path> from <kind> schema v<detectedVersion> to v<currentVersion>
(frontmatter only; body unchanged). <n> field(s) added: <fields>.
```

Then continue the workflow automatically. Migration is not an approval gate and
never requires re-approval — see Step 6.

Add these two notes when they apply, because the calling command needs them:

- **Human-supplied values.** If `migration_inputs` was written, name the fields.
  Those values were supplied *after* the document was approved, and the calling
  command should record that.
- **Legacy body sections.** A document migrated from below v3 still carries
  `## Repo Conventions Detected` rather than `## Repo Knowledge Reference` +
  `## Repo Context`. The framework does not rewrite bodies, by design. Its
  embedded repository findings are a point-in-time observation, not a citation.

## Step 5 — Ask the batched questions, once

`needs-input` carries every outstanding question in one array — the framework
runs the whole chain to collect them before asking anything, so a v0 document
asks once rather than once per migration step.

Present **all** of them together, using each question's `field`, `reason`, and
`options`. Then re-run with the answers:

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/migrate-planning-doc.ts" "<path>" \
  --kind <kind> --answers '{"device_type":"tv","platform":"android"}'
```

Rules:

- **Never answer on the document's behalf.** These are exactly the values the
  framework refused to guess. An ambiguous value is a question, not a default.
- **Never infer a value from the repository.** This skill is a document
  compatibility layer, not repository re-analysis. Do not run `repo-analyst`,
  do not read `.ono/repo-knowledge.json`, and do not read source to answer a
  migration question — repository state today is not the state the human
  approved against.
- `design_reference_status: provided` also needs `design_reference_type` and
  `design_reference` in the same `--answers` object.
- If the developer cannot answer, **stop.** A partially migrated document is not
  a thing the framework will produce, and guessing is worse than stopping.
- An invalid answer returns `needs-input` again with the same question. Re-ask;
  do not force the value in by editing the file.

## Step 6 — What migration never does

State these to the developer if they ask, and never work around them:

- **It never changes approval.** `status`, `feature`, `author`, and `date` are
  structurally unwritable — a migration that tries is rejected whole, and
  nothing is written. A migrated document keeps its approval; migration also
  never *grants* approval. The calling command's own approval gate still runs,
  and still reads the same `status` byte. A legacy `proposed` analysis migrates
  successfully and is still rejected by `/dev-design-start`.
- **It never rewrites the body.** Frontmatter only, asserted byte-identical
  before writing.
- **It never runs during generation.** Migration happens on **load**. A command
  about to write a planning document does not migrate it first — that would put
  two writers on one file.
- **It never repairs a document.** If a document already asserts a value, the
  framework leaves it alone rather than correcting it.

## Hard Constraints

- Never parse a legacy planning-document shape yourself — always go through
  `scripts/migrate-planning-doc.ts`.
- Never hand-edit a planning document's frontmatter to make a command load it.
- Never invoke this skill on a document a command is about to generate or
  overwrite.
- Never continue past a `unsupported` / `schema-too-new` / `kind-mismatch` /
  `rejected` / `unreadable` status.
- Never guess, default, or repo-derive an answer to a `needs-input` question.
- Never announce a `current` result — a no-op must be silent.
- Never treat `doc_schema_version`, `migrated_from_version`, `migrated_by`, or
  `migration_inputs` as approval-relevant.
