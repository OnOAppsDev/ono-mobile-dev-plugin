# Task State Contract

**Schema version: 1**
**Owner:** `ono-mobile-dev-plugin`
**Helper:** [`scripts/task-state.ts`](../scripts/task-state.ts) — evidence computed by [`scripts/task-resume.ts`](../scripts/task-resume.ts)
**Sole lifecycle writer:** `commands/implement-task.md`
**Checkpoint appender (active run only):** `skills/platform-implementation/SKILL.md` — see [Ownership](#ownership-eng-003)

This file declares the deterministic per-task lifecycle store SHARED-004 introduces, so
`/implement-task` can verify machine-side whether a task is already complete, whether its
dependencies are complete, and whether it is blocked — instead of asking a human every time.

> **When this file changes, change `scripts/task-state.ts` in the same commit.** The version
> table below is parsed by `task-state.test.ts` and compared against the script's
> `CURRENT_SCHEMA_VERSION`, so the two cannot drift silently — the same discipline
> `docs/planning-doc-contract.md` and `docs/repo-knowledge-contract.md` apply.

## The file

`<TARGET_ROOT>/docs/tasks/{FEATURE-NAME}-task-state.json` — committed to Git, repository-local,
machine-generated.

**Discovery is that path and nothing else.** There is no link field on any planning document: the
Task Breakdown is a human-approved artifact and is never mutated for discovery. One feature, one
file. A second discovery mechanism would be a second source of truth.

## Current versions

| Artifact | Current version |
|---|---|
| task state | 1 |

## Guarantees the helper makes

1. **Deterministic.** Identical inputs produce a byte-identical file. No clock is read and no
   randomness is used — `task-state.test.ts` asserts the source contains no `Date`, `Date.now` or
   `Math.random`, and `task-resume.test.ts` asserts neither helper reads a file timestamp.
   "When did this happen, and by whom" is answered by Git, exactly as
   `docs/planning-doc-contract.md` § *Clock-free by construction* decided for migrations. Git is
   read — never written — only to capture and verify tree state (ENG-003); every other input the
   caller supplies.
2. **Always exits 0 and always prints one JSON object.** Callers branch on `status`, never on the
   exit code — the same posture as `scripts/read-repo-knowledge.ts`.
3. **Atomic.** Writes go to a sibling temp file, are fsync'd, then renamed. A crash leaves either
   the old file or the new one, never a truncated one. There is no `.bak`: Git is the undo.
4. **One parser.** No command, skill or agent reads or writes this file directly. `task-resume.ts`
   computes evidence and never touches the file either.
5. **Never fatal.** An absent, malformed, invalid or too-new file degrades to `unknown` for every
   task, and the caller falls back to asking a human. It never blocks a command.
6. **Dependencies are never stored.** The `depends-on` graph lives only in the Task Breakdown. The
   helper reads it from there when a breakdown path is supplied, and never persists it.

## Lifecycle states

Four written states. Absence of a record is the fifth, implicit state: **the task was never
started**, and nothing is written for it.

| State | Written when |
|---|---|
| `in-progress` | `/implement-task` is about to hand off to the platform agent — or is resuming that same run (ENG-003) |
| `complete` | `/implement-task` section 10 verification **passed** |
| `blocked` | a blocker or unproven dependency stopped the run |
| `failed` | the run reached the agent but section 10 verification failed |

Two further verdicts are **derived at read time and never stored**:

| Verdict | Meaning |
|---|---|
| `stale` | the recorded `rowFingerprint` no longer matches the task row in the breakdown |
| `unknown` | no file, no record for this task id, or the file could not be trusted |

## Trust levels: `provenance`

Every record carries a `provenance`, and it is the axis that keeps two different kinds of claim
distinguishable:

| Provenance | Meaning | Written by |
|---|---|---|
| `plugin-verified` | the record was produced by `/implement-task` through this helper | the helper — **the only value it ever writes** |
| `human-attested` | a human asserted the state by editing the file | never written by the helper; recognised on read |

**A human attestation is not deterministic proof.** The reader exposes:

```
deterministicProof = state === "complete" && provenance === "plugin-verified" && stale === false
```

Only `deterministicProof: true` satisfies `/implement-task` section 6's deterministic branch. A
`human-attested` completion is surfaced as an attestation that still requires the human
confirmation section 6 has always asked for. The two never silently collapse into one another.

## Attempt counter

`attempt` is a per-task integer stored in the file, and `runId` is derived from it as
`{taskId}-attempt-{attempt}`. It increments on every `in-progress` write that starts a run
(mode `start` or `restart`) and is carried unchanged onto that run's terminal write, so repeated
runs of the same task are distinguishable (`T2-attempt-1`, `T2-attempt-2`) without a timestamp or
a random component. A `resume` is the same run and never increments it.

## Schema

```jsonc
{
  "taskStateSchemaVersion": 1,
  "feature": "biometric-login",
  "producedBy": { "plugin": "ono-mobile-dev-plugin", "version": "0.5.0" },
  "tasks": {
    "T1": {
      "state": "complete",
      "provenance": "plugin-verified",
      "attempt": 1,
      "runId": "T1-attempt-1",
      "rowFingerprint": "sha256:9c1d...",
      "platform": "react-native",
      "head": "a1b2c3d",
      "filesChanged": ["src/features/auth/useBiometrics.ts"],
      "standardIds": ["RN-TS-1", "API-ERR-1"],
      "validation": [{ "command": "tsc --noEmit", "result": "pass" }],
      "acceptanceCriteria": [{ "criterion": "Face ID unlocks the app", "met": true }],
      "deviations": [],
      "blockers": []
    }
  }
}
```

| Field | Meaning |
|---|---|
| `taskStateSchemaVersion` | contract version. A reader supporting max N treats `> N` as untrusted |
| `feature` | the feature slug. A mismatch against the caller's feature is refused, never applied |
| `producedBy` | which plugin and version wrote the file |
| `tasks.<taskId>` | one record per task id, keyed exactly as the Task Breakdown's `id` column |
| `rowFingerprint` | `sha256:` plus the hex digest of the normalized task row (see below) |
| `head` | the Git HEAD the caller supplied, or `null`. The commit the working tree was **based on**, not necessarily the commit containing the work |
| `filesChanged`, `standardIds`, `validation`, `acceptanceCriteria`, `deviations`, `blockers` | the section 10 completion report, made durable. This is what `/create-dev-qa-notes` reads instead of relying on a session transcript |

## Row fingerprint normalization

Exactly this, so two writers cannot disagree:

1. Take the raw Markdown table line for the task.
2. Trim leading and trailing whitespace.
3. Remove one leading `|` and one trailing `|` if present.
4. Split on `|`.
5. Trim each cell, then collapse every internal whitespace run to a single space.
6. Join the cells with a single space.
7. SHA-256 the UTF-8 bytes; prefix the hex digest with `sha256:`.

Header rows and the `|---|` separator are not tasks and are skipped. A row whose first cell does
not match `^[A-Za-z]+[0-9]+$` is not a task row.

## Reader output

| Field | Meaning |
|---|---|
| `available` | `false` for every non-`ok` status |
| `status` | `ok` / `absent` / `unparseable` / `invalid` / `schema-too-new` / `feature-mismatch` |
| `path` | the resolved state-file path |
| `schema` | the file's `taskStateSchemaVersion`, or `null` |
| `tasks.<id>` | `state`, `provenance`, `attempt`, `runId`, `stale`, `deterministicProof`, `dependsOn`, `head`, `platform`, `blockers`, `filesChanged`, `standardIds`, `accessibilityStatus`, `accessibility`, `verificationDebt`, `qaVerificationDebt`, `developerVerificationDebt`, `developerTestingStatus`, `developerTesting`, `execution` |
| `summary` | one line for the developer |
| `detail` | parser error text, on `unparseable` |

`execution` is `null` for a record written before ENG-003 — never an empty run.

`stale` is `null` when no breakdown was supplied — staleness cannot be judged without the current
row. `dependsOn` is `null` for the same reason, and is read from the breakdown, never from the
store.

## Writer preconditions

The helper refuses a write rather than recording something untrue:

Every refusal is a `WriteResult` with `status: "refused"` and one of these `reason` values; a
failed atomic write is `status: "unreadable"` with `write-failed`. `task-resume.test.ts` asserts
this table, the `WriteResult.reason` union and the reasons the code emits are the same set.

| Refusal | Condition |
|---|---|
| `complete-without-verification` | `--state complete` without `acceptanceCriteria` (all `met: true`) and at least one `validation` entry, or with a failing Tier 1/2 check or developer test. **A terminal `complete` may only be written after section 10 verification succeeds** |
| `complete-without-developer-testing` | `--state complete` without the `developerTesting` decision |
| `complete-with-stale-validation` | `--state complete` citing a validation the run recorded whose covered files or planning basis moved after it ran, or whose recorded result differs from the one reported (ENG-003) |
| `invalid-accessibility` | a malformed `accessibility` block or `verificationDebt` entry, in any state |
| `invalid-developer-testing` | a malformed `developerTesting` block, in any state |
| `invalid-checkpoint` | a `checkpoint` of an unknown kind (a lifecycle state is never a kind), with a malformed payload, a path outside the root, or a basis reference that does not resolve |
| `active-run-exists` | a plain `in-progress` (mode `start`) over an active run that has an execution block — resume or restart must be chosen |
| `resume-inconsistent` | `--mode resume` when there is no checkpointed run, or the resume verdict is not `resume` |
| `no-active-run` | a `checkpoint` or `abandon` for a task that is not `in-progress` |
| `run-mismatch` | a `checkpoint` or `abandon` naming a runId other than the active one |
| `feature-mismatch` | the existing file's `feature` differs from the caller's |
| `schema-too-new` | the existing file's version exceeds the supported maximum |
| `invalid-state` | `--state` is not one of the four |
| `unparseable` | the existing file, or `--payload`, is not valid JSON |
| `write-failed` | the atomic write failed; the previous file is unchanged (`status: "unreadable"`) |

The helper never writes `provenance: human-attested`.

## Accessibility and verification debt (SHARED-014)

Two additive record fields. Both are **optional**: a record written before SHARED-014
carries neither, and the reader reports that state distinctly rather than guessing.

`accessibility` — the recorded accessibility decision for the task:

| Field | Meaning |
| --- | --- |
| `applicable` | Whether the mobile accessibility flow applied to this task. |
| `reason` | Required when `applicable` is `false`; why it did not apply (e.g. `device_type: tv`). |
| `deviceType` | The confirmed device type the decision was made under. |
| `standardIds` | The accessibility rules cited — shared `A11Y-*` plus the lane's platform IDs. |
| `checks` | Tier 1 and Tier 2 checks only, each `{ ruleId, tier, result, evidence? }`. |

`verificationDebt` — an array of obligations the plugin could not discharge, each
`{ domain, ruleId, requiredVerification, whyNotAutomatable, owner, status }`. The field is
**domain-tagged and generic**: SHARED-014 populates only `domain: "accessibility"`, and
performance or device-capability domains can use the same field without a migration.

**Three readings that are never collapsed.** The reader reports `accessibilityStatus`:

- `notRecorded` — the block is absent. Nothing is known. This is **not** "not applicable"
  and **not** a pass; a legacy record must never look like one that cleared accessibility.
- `applicable` — the flow applied; `standardIds` and `checks` carry the evidence.
- `notApplicable` — a positive recorded decision, with a reason.

**Writer preconditions.** The writer refuses, in any state, a `verificationDebt` entry
missing a required field or carrying a `status` other than `pending`; an `applicable: false`
block with no reason or that cites rules anyway; a check outside Tier 1/2; and any Tier 1/2
check against a manual-only rule (`A11Y-SR-1`) per `VERIFY-2`. For `complete` specifically,
an applicable block must cite at least one rule, record at least one check, and contain no
failing check. **Outstanding verification debt never blocks `complete`** — the plugin proved
nothing either way, and blocking would tie completion to device availability.

The plugin only ever writes `status: "pending"`, and the record has no field in which a
plugin-recorded discharge could be expressed. Evidence produced by a human stays
human-attested; it never becomes `plugin-verified`.

## Developer testing (Stage 3)

One additive record field, `developerTesting` — the mandatory developer-testing decision
(`skills/platform-implementation/SKILL.md` §7a). Developer testing means tests in the code
repository (unit, component, repository integration), never QA automation.

| Field | Meaning |
| --- | --- |
| `framework` | The in-repo developer test framework detected, or `null` when there is none. |
| `required` | Whether developer tests were required for this change. |
| `testsChanged` | Test files added or updated. |
| `justification` | Required when `required` is `false`, or when a framework exists and `testsChanged` is empty. |
| `runs` | Developer tests that actually ran, each `{ command, result }` with `result` `pass` or `fail`. |
| `notRunReason` | Required when tests are required and `runs` is empty. |

**Writer preconditions.** `complete` without the block is refused as
`complete-without-developer-testing`. In any state, `invalid-developer-testing` refuses a
missing justification; a run result other than `pass`/`fail`; a run whose command and
result do not also appear in `validation` (a result cannot be recorded for a test the
report never ran); required-but-unrun tests without a `notRunReason` and a
`developer-testing` debt entry; and any `developer-testing` debt whose `owner` is not
`developer` (`VERIFY-4`). A failing run blocks `complete`. Developer-testing debt, like all
debt, does not.

**Reader.** `developerTestingStatus` is `notRecorded` (block absent — a legacy record; never
read as "not required"), `required` or `notRequired`. Debt is split by owner:
`qaVerificationDebt` (`owner: "qa"`) is what a QA handoff lists as owed to QA;
`developerVerificationDebt` (`owner: "developer"`) is never presented as owed to QA.
`verificationDebt` still carries every entry, unchanged.


## Execution record and deterministic resume (ENG-003)

An `in-progress` record carries an additive, optional `execution` block: the evidence that
lets an interrupted run be resumed as **the same run** — same `runId`, same `attempt` —
rather than re-derived. Like SHARED-014 and Stage 3, it is additive within schema 1: a
record written before it has no block, and the reader returns `execution: null`.

Every hash in the block is computed by the helper from bytes on disk — never supplied by
the caller, never derived from a timestamp. A file's modification time can move without its
content moving; the content is what the work was built against.

| Field | Meaning |
|---|---|
| `runId` | binds the block to one run |
| `baseline` | `{ gitAvailable, head, branch, dirty }` at run start. `dirty` lists every modified or untracked file that already existed, with its content hash — the developer's work, never the task's |
| `context` | the confirmed `platform` and `deviceType`, the §5b `accessibility` decision and any design-reference `designAttestation` — re-read on resume, never recomputed |
| `upstream` | the fingerprints the run was built against: `requirements`, `design`, `analysis`, `dd`, `breakdown`, `row` |
| `expectedFiles` | the row's "files touched" at run start |
| `plan` | `{ expectedFiles, steps: [{ id, description, files, basis }] }` — the §4 plan |
| `checkpoints` | completed steps: `{ seq, stepId, stepFingerprint, files: [{path, hash}], basis }` |
| `validations` | commands that actually ran: `{ seq, kind, command, result, exitCode, covers: [{path, hash}], basis, evidence }` |
| `probes` | toolchain probes: `{ seq, name, command, output, outputFingerprint }` |
| `developerTesting` | the §7a decision `{ seq, developerTesting, verificationDebt }`, recorded before the terminal write |
| `review` | self-review progress `{ seq, completed, findings, covers }` |
| `seq` | a per-run monotonic counter — ordering without a clock |
| `resumes` | how many times the run was resumed |
| `restartedFrom` | the runId an explicit restart replaced, or `null` |
| `outcome` | `null` while active; the terminal state, or `abandoned`, afterwards. The block is kept on the terminal record as audit evidence |

### Basis references

A step or validation records the planning inputs it was built on as **basis references**,
each with its hash at the time. A reference that does not resolve when written is refused.

| Reference | Hash of |
|---|---|
| `row`, `row:<column>` | the task row, or one of its cells (`row:acceptance criteria`, `row:files touched`, …) |
| `dd`, `dd#<anchor>` | the DD body, or one section — a heading and everything under it until the next heading at the same or a higher level |
| `analysis`, `analysis#<anchor>` | the feature analysis body, or one section |
| `breakdown` | the Task Breakdown body |
| `requirements`, `design` | the source specification, and the design-reference fingerprint |
| `probe:<name>` | the latest recorded output of that probe |

Anchors are GitHub-style heading slugs (`### 19.2 Screen` → `dd#192-screen`). Section
granularity is what makes reconciliation selective: an edit to §19.2 moves `dd#192-screen`
and its parent `dd#19-…`, never its sibling `dd#191-…`.

### Checkpoints

`checkpoint --run <runId> --kind <kind>` appends to the active run. It **never changes
`state`**, is refused for any run that is not the active `in-progress` one, and a lifecycle
state is not a kind.

| Kind | Records |
|---|---|
| `context` | `deviceType`, the `accessibility` applicability decision, `designAttestation` |
| `plan` | the plan's `expectedFiles` and ordered `steps`, each with its `files` and `basis`. A re-plan replaces the plan; a step whose definition changed no longer matches its checkpoint |
| `step` | a completed step: the hash of every file it wrote and of every basis reference it cites |
| `validation` | a command that ran, its `pass`/`fail`, the hashes of the files it `covers` (default: every task-owned file) and its `basis` (default: the basis of the steps whose files it covers, plus `row:acceptance criteria`), and an optional `evidence` path |
| `probe` | a toolchain probe's output, fingerprinted |
| `developer-testing` | the developer-testing decision, validated exactly as the terminal write validates it, against the run's recorded validations |
| `review` | self-review items completed and findings, with a snapshot of task-owned files |

Each answers, from hashes alone: what was completed, what file state existed then, what ran
against that state, and — through the resume verdict — what the next unfinished step is.

### The resume verdict

`resume --task <id>` is read-only. It evaluates the recorded run against the repository and
the current documents, in this precedence order:

| Verdict | When | What `/implement-task` does |
|---|---|---|
| `hard-stop` | the repository no longer matches the run and the difference is not the run's own work (below) | stops with every mismatch |
| `restart` | the record has no execution block (legacy), or the platform or `device_type` changed — the one upstream change that genuinely invalidates everything written | starts a new attempt |
| `reconcile-upstream` | a planning stage is stale (see [the upstream chain](#the-upstream-chain-and-the-earliest-stale-stage)) | reruns the earliest stale stage |
| `resume` | consistent | continues the same run from `nextStep` |
| `no-active-run` | the task is not `in-progress` | the ordinary §6 branches |

**Mismatches** — each named with its exact path and hashes:

| `kind` | Condition |
|---|---|
| `branch` | the branch differs from the baseline |
| `head` | HEAD moved to a commit that is not a descendant of the baseline, or whose commits touch anything other than upstream artifacts and this store |
| `git` | the run began in a git repository and git state can no longer be read |
| `preexisting-changed` | a file that was already dirty at run start, and is not task-owned, has changed |
| `outside-scope` | a file neither task-owned, pre-existing nor an upstream artifact has changed |

Upstream artifacts — the Task Breakdown, DD, feature analysis, Dev Plan, source specification
and a local design-reference file — are never scope mismatches: their changes are judged by
the chain verdict. This store is never a mismatch either.

**File classes** (Part E). Task-owned files are those named by the row, the plan, a
checkpoint or the developer-testing decision:

| Class | Meaning |
|---|---|
| `matches-checkpoint` | identical to the last checkpoint that wrote it — completed work, never redone |
| `changed-after-checkpoint` | differs from its last checkpoint: partial work of a later unfinished step that owns it, or — when none does — the checkpointed step is invalidated and resumed from |
| `expected-untouched` | task-owned, never checkpointed, identical to the baseline |
| `partial` | task-owned, never checkpointed, differs from the baseline — work in flight when the run stopped |
| `preexisting-unchanged` | the developer's pre-existing dirty or untracked file, exactly as it was |
| `outside-scope` | an unexplained change — always a `hard-stop` |

**Checkpoint validity** (Part C). A step's checkpoint is valid while its definition matches
the current plan, every basis reference still hashes the same, and its files still match —
or were changed only by a later unfinished step that owns them. `checkpoints.valid` and
`checkpoints.invalidated` (with the exact reason) list each step. `nextStep` is the first plan
step not validly completed; after the last step it is `validation`, `developer-testing`,
`review` and finally `report`. With no plan recorded it is `plan` — existing edits are
preserved, and the current code is authoritative.

**Validation carry-forward** (Part D). A recorded validation is reusable only while every
file it `covers` and every reference in its `basis` still hash the same, and its `evidence`
path (if any) still exists. The latest run of each command is judged; the verdict splits them
into `carried` and `rerun`, each rerun with its exact reason. A developer-testing run stays
valid only while a carried validation backs it. Nothing is re-run blindly, and no old result
is trusted blindly: `complete` citing a validation that no longer holds is refused
(`complete-with-stale-validation`).

### The upstream chain and the earliest stale stage

`chain --breakdown <path>` checks each planning stage against the stage above it, using the
fingerprints each stage recorded at generation. It extends SHARED-013's `source_fingerprint`
— it is not a second invalidation framework:

| Stage | Rerun with | Stale when |
|---|---|---|
| `feature-analysis` | `/analyze-feature` | its `source_fingerprint` no longer matches the content of the specification at `source_link`, or its `design_reference_fingerprint` no longer matches the design content — for an external source, as re-read now ([External sources](#external-sources-content-not-urls)) |
| `dd` | `/dev-design-start` | its `source_fingerprint` no longer matches the feature analysis body, or its design-reference fields differ from the analysis's |
| `task-breakdown` | `/dev-feature-start` | its `source_fingerprint` no longer matches the DD body, or its design-reference fields differ from the DD's |

The **earliest stale stage** is the first one that is stale. Every stage below it is
`pending-upstream` — not stale: whether it must be rerun depends on whether regenerating the
stage above actually changes that stage's body. A feature analysis regenerated with a
byte-identical body leaves the DD's fingerprint matching, so the DD and breakdown stay current
and are not rerun. Absent fingerprints (legacy documents, an inline feature request with no
`source_link`) are `unknown`, never a mismatch. Only content is compared: a changed `date:`
or a newer file timestamp invalidates nothing.

A check whose external source was not read in this invocation is **`unverifiable`** — never
`current` (nothing was compared), never `stale` (nothing was shown to change). A stage with
one is `unverifiable` rather than current; the chain lists every such check in
`unverifiable`, and `/implement-task` falls back to the attestation gate for it.

The implementation stage is judged by the resume verdict: once the chain is current again,
checkpoints and validations whose basis references moved are invalidated, and everything
else is kept.

### External sources: content, not URLs

A Figma design, or a specification hosted outside the repository, can change behind an
unchanged link — and the Figma MCP exposes no version, revision or content hash. Hashing the
URL would report such a change as "unchanged", so an external source is fingerprinted by the
**content the workflow actually read**, through one generic mechanism for both:

| Source | Fingerprinted from |
|---|---|
| a repository file or folder (spec, mockups, design document) | its bytes — no evidence needed, exactly as before |
| an external URL (a Figma link, a hosted spec) | the **evidence** of the read: `{ source, parts: [{ name, content }] }`, saved by the reading step outside the repository and passed as `--design-evidence` / `--source-evidence` |
| a named in-repo screen (`existing_ui`), or no reference | the design-reference fields alone |

- **The parts are fixed per kind of source**, so two reads compare like with like: a Figma
  source is exactly `get_metadata` (the node tree) and `get_design_context` (styles, text,
  layout) for the linked node — the reads the design step already performs; any other source
  is exactly `content`, its raw retrieved text. Any other set is refused. Screenshots are not
  evidence: a rendering is not a stable byte stream.
- **The evidence must be of the referenced source.** A Figma source is identified by file key
  and node, so a re-shared link to the same node (`?m=dev`, `?t=…`) is the same source and a
  different node is not; evidence read from another source is refused.
- **One canonicalization, and only content counts.** Line endings, trailing whitespace and the
  query strings of URLs inside the content (per-request asset signatures) are normalized.
  Every other field of the evidence — a retrieval time, a `lastModified` — is ignored, so no
  timestamp can make a source look changed or unchanged.
- **Unread is unverifiable, never unchanged.** Without usable evidence an external source has
  no fingerprint. Its chain checks are `unverifiable`; the basis references `design` and
  `requirements` cannot be cited by a new checkpoint; completed work citing them is listed in
  the verdict's `checkpoints.unverified` and validations built on them in
  `validations.unverified` — neither redone nor treated as verified; `unverified` names the
  inputs to re-read; and `complete` citing such a validation is refused. The attestation gate
  (`context.designAttestation`) remains the fallback, and an attestation is never verification.

### Lifecycle operations

| Operation | Command | Effect |
|---|---|---|
| **start** | `write --state in-progress` (mode `start`, the default) | a new attempt with a fresh execution block. Refused over an active checkpointed run (`active-run-exists`), so an interruption is never silently discarded |
| **`resume`** | `write --state in-progress --mode resume` | the same run: `attempt` and `runId` unchanged, all evidence kept, `resumes + 1`. The helper re-evaluates the verdict itself and refuses unless it is `resume` |
| **`restart`** | `write --state in-progress --mode restart` | a new attempt chosen explicitly over the active one: fresh execution, `restartedFrom` set. The current tree becomes the new baseline |
| **`abandon`** | `abandon --run <runId> --reason <text>` | records the run `failed` with `blockers: ["abandoned: …"]` and `execution.outcome: "abandoned"`, keeping its number. The working tree is never touched; the result lists the task-owned files that differ from the baseline, so reverting any is a separate, confirmed decision |

The terminal writes — `complete`, `failed`, `blocked` — are unchanged. They keep the run's
number, and they keep its execution block as evidence.

### Ownership (ENG-003)

| Who | May write |
|---|---|
| `commands/implement-task.md` | **every lifecycle write** — `in-progress` in any mode, `complete`, `failed`, `blocked`, `abandon`. It is the sole lifecycle writer |
| `skills/platform-implementation/SKILL.md`, executed by `feature-implementer` for the run the command started | **append** `checkpoint`s to that active run, and nothing else |
| any other skill, agent or command | nothing |

The helper enforces what it can structurally — a checkpoint can never carry a state, cannot
target a finished run and cannot target another run. Which component calls it is the rule
above.

## Known limitations

- **No locking.** `in-progress` is an advisory marker, not a lock. Two concurrent runs against the
  same task are not prevented, only made visible afterwards.
- **Merge conflicts.** One file per feature limits the blast radius, but two branches implementing
  different tasks of the same feature will conflict on it. Resolve by keeping both task records.
- **`human-attested` is trusted as written.** The reader cannot tell an honest manual entry from a
  mistaken one — the same trust model as a human flipping a document's `status: approved`. What it
  guarantees is that such an entry is never mistaken for deterministic proof.
- **External evidence is only as stable as the read.** The Figma parts are the MCP's own
  output; if that output ever varies for an unchanged design beyond what the canonicalization
  normalizes, the fingerprint changes and the analysis is reported stale — the safe direction:
  a spurious rerun, never a missed change.
- **Outside git, scope cannot be enumerated.** A run that began outside a git repository still
  verifies its task-owned files by hash, but changes elsewhere cannot be listed; the verdict
  says so.
- **A basis is only as fine as the headings.** A DD with one undivided section invalidates every
  step citing it on any edit — correct, but coarser than a well-sectioned DD.
- **Probes are re-run, not trusted across machines.** A validation that cites `probe:<name>` is
  invalidated when a later probe of that name records different output.
