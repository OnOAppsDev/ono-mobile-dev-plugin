# Task State Contract

**Schema version: 1**
**Owner:** `ono-mobile-dev-plugin`
**Helper:** [`scripts/task-state.ts`](../scripts/task-state.ts)
**Sole writer:** `commands/implement-task.md`

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
   `Math.random`. "When did this happen, and by whom" is answered by Git, exactly as
   `docs/planning-doc-contract.md` § *Clock-free by construction* decided for migrations.
2. **Always exits 0 and always prints one JSON object.** Callers branch on `status`, never on the
   exit code — the same posture as `scripts/read-repo-knowledge.ts`.
3. **Atomic.** Writes go to a sibling temp file, are fsync'd, then renamed. A crash leaves either
   the old file or the new one, never a truncated one. There is no `.bak`: Git is the undo.
4. **One parser.** No command, skill or agent reads or writes this file directly.
5. **Never fatal.** An absent, malformed, invalid or too-new file degrades to `unknown` for every
   task, and the caller falls back to asking a human. It never blocks a command.
6. **Dependencies are never stored.** The `depends-on` graph lives only in the Task Breakdown. The
   helper reads it from there when a breakdown path is supplied, and never persists it.

## Lifecycle states

Four written states. Absence of a record is the fifth, implicit state: **the task was never
started**, and nothing is written for it.

| State | Written when |
|---|---|
| `in-progress` | `/implement-task` is about to hand off to the platform agent |
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
`{taskId}-attempt-{attempt}`. It increments on every `in-progress` write and is carried unchanged
onto that run's terminal write, so repeated runs of the same task are distinguishable
(`T2-attempt-1`, `T2-attempt-2`) without a timestamp or a random component.

## Schema

```jsonc
{
  "taskStateSchemaVersion": 1,
  "feature": "biometric-login",
  "producedBy": { "plugin": "ono-mobile-dev-plugin", "version": "0.6.0" },
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
| `tasks.<id>` | `state`, `provenance`, `attempt`, `stale`, `deterministicProof`, `dependsOn` |
| `summary` | one line for the developer |

`stale` is `null` when no breakdown was supplied — staleness cannot be judged without the current
row. `dependsOn` is `null` for the same reason, and is read from the breakdown, never from the
store.

## Writer preconditions

The helper refuses a write rather than recording something untrue:

| Refusal | Condition |
|---|---|
| `complete-without-verification` | `--state complete` without `acceptanceCriteria` (all `met: true`) and at least one `validation` entry. **A terminal `complete` may only be written after section 10 verification succeeds** |
| `feature-mismatch` | the existing file's `feature` differs from the caller's |
| `schema-too-new` | the existing file's version exceeds the supported maximum |
| `invalid-state` | `--state` is not one of the four |

The helper never writes `provenance: human-attested`.

## Known limitations

- **No locking.** `in-progress` is an advisory marker, not a lock. Two concurrent runs against the
  same task are not prevented, only made visible afterwards.
- **Merge conflicts.** One file per feature limits the blast radius, but two branches implementing
  different tasks of the same feature will conflict on it. Resolve by keeping both task records.
- **`human-attested` is trusted as written.** The reader cannot tell an honest manual entry from a
  mistaken one — the same trust model as a human flipping a document's `status: approved`. What it
  guarantees is that such an entry is never mistaken for deterministic proof.
