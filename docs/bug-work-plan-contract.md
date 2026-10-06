# Bug Work Plan Contract

**Owner:** `ono-mobile-dev-plugin`
**Kind:** `bug-work-plan`, version 1 (see [`planning-doc-contract.md`](planning-doc-contract.md#bug-work-plan))
**Template:** [`templates/bug-work-plan-template.md`](../templates/bug-work-plan-template.md)
**Validator:** [`scripts/bug-work-plan.ts`](../scripts/bug-work-plan.ts) (`validate <path>`; always exits 0 and prints JSON)

There is one planning document per bug, in the target repository:

```
docs/bugs/<bug_key>/bug-work-plan.md
```

`<bug_key>` is bug intake's canonical key (`scripts/bug-intake.ts`). A key that is not
path-safe never becomes a path.

This document is the bug counterpart of the feature chain's analysis, design and task
breakdown, folded into one artifact. It is a **contract only** at this step. Nothing
generates, approves or implements a plan yet, and task-state does not read one.

## Frontmatter

Identity lives here and is never duplicated as a body section.

| Field | Value | Notes |
|---|---|---|
| `doc_schema_version` | `1` | Stamped at generation. The plan is born stamped (planning-doc contract). |
| `work_type` | `bug` | Names the kind. Anything else is refused. |
| `bug_key` | safe key | Required, and follows the intake rule: `qa_bug_id`, else `external_ref`, else `DEV-<8 hex>`. |
| `qa_bug_id` | key or `null` | Required for `qa-*` origins, `null` for every other origin. |
| `external_ref` | key or `null` | Required for `external`. A key, never a URL. |
| `origin` | `qa-execution` \| `qa-standalone` \| `external` \| `production` \| `dev-review` \| `dev-testing` | From bug intake. |
| `found_in_build` | id or `null` | `null` when unknown. |
| `platform` | `react-native` \| `ios` \| `android` \| `react` | Exactly one. Every task row carries it. |
| `device_type` | `mobile` \| `tv` | |
| `surfaces` | `[id, …]` or `[]` | `[]` when unknown. |
| `capability` | id or `null` | |
| `related_feature` | Dev feature id or `null` | Never inferred. |
| `bug_evidence_fingerprint` | `sha256:<64 hex>` | Bug intake's evidence fingerprint, copied verbatim. |
| `fix_cycle` | positive integer, default `1` | The latest cycle in the plan: `1` plus the number of `### Cycle n` entries. |
| `repo_knowledge_*` | as defined by the repo-knowledge-consumer skill | Not validated here. |
| `author`, `date` | | Not validated here. |
| `status` | `draft` \| `approved` | Default `draft`. |
| `approved_by`, `approved_fingerprint`, `approved_cycle` | `null` until the approval step | **Reserved.** They are parsed for syntax only (`approved_fingerprint` is `null` or `sha256:<64 hex>`; `approved_cycle` is `null` or a positive integer) and carry no semantics yet. |

Nullable identity is **explicit**. Every key above except `fix_cycle`, `repo_knowledge_*`,
`author` and `date` must be present, and a field that does not apply is written as the
bare `null`, never omitted.

## Body: the fixed sections

Exactly these level-2 sections, once each, in this order. Any other level-1 or level-2
heading is refused.

| # | Section | Anchor |
|---|---|---|
| 1 | Reproduction Evidence | `#reproduction-evidence` |
| 2 | Observed vs Expected | `#observed-vs-expected` |
| 3 | Affected Capability & Surfaces | `#affected-capability--surfaces` |
| 4 | Root Cause | `#root-cause` |
| 5 | Blast Radius | `#blast-radius` |
| 6 | Fix Design | `#fix-design` |
| 7 | Verification Strategy | `#verification-strategy` |
| 8 | Tasks | `#tasks` |
| 9 | Fix Cycles | `#fix-cycles` (each cycle is `#cycle-<n>`) |
| 10 | Repo Knowledge Reference | `#repo-knowledge-reference` |
| 11 | Open Questions | `#open-questions` |

**Evidence discipline.** Facts carry the planning lanes' existing labels:
`[evidence: <path>]`, `[reused: <path>#<anchor>]`, `[inference]` and `[unknown]`. This is
the same framework, not a new one. The validator checks structure, not prose.

**Fix Design** must state, each as a labelled line with content:
- `**Root-cause fix:**`
- `**Minimal change surface:**`
- `**Affected files / areas:**`
- `**Non-goals:**`
- `**No unrelated refactoring:**`
- `**Risks:**`

**Verification Strategy** must state:
- `**Reproduction path:**`
- `**Developer Testing:**`
- `**Regression test:**` (or why one is not feasible)
- `**Affected surfaces:**`
- `**QA re-test:**`
- `**Verification debt:**` (as `standards/shared/verification.md` defines it)

Nothing is executed here.

Labelled lines are used rather than subheadings on purpose. A subheading such as
`### Risks` repeated in a later cycle would collide on its anchor, so section anchors
would no longer be unique.

## Tasks: cycle 1

The Tasks section holds exactly one table in the **Task Breakdown's row schema, unchanged**
(`templates/task-breakdown-template.md`):

```
| id | description | platform | files touched | depends-on | size | acceptance criteria |
```

Rules:
- There is at least one row.
- Every row carries the plan's `platform`.
- `depends-on` names tasks of the same or an earlier cycle.
- Row fingerprints are task-state's own `fingerprintRow`.

**Cycle 1 ids are `T1`, `T2`, …**, the normal Task Breakdown format. That is safe:
- task-state's id rule (`[A-Za-z]+[0-9]+`) and `parseBreakdown` read these rows exactly as
  they read a feature breakdown's;
- task state is keyed per work item, so a bug's `T1` never meets a feature's `T1`.

## Fix Cycles: append-only

Cycle 1 is the Tasks section. Fix Cycles starts with no further cycles ("No additional fix
cycles yet."). Each later cycle is **appended** as a level-3 subsection, numbered
consecutively from 2, and earlier cycles are never edited:

```md
### Cycle 2

- **Failed build:** atv-202
- **Failed surfaces:** android-tv
- **Failed re-test evidence:** [evidence: …] the failed re-test run, notes and evidence
- **Fix-design delta:** what changes from the previous cycle's design, and why

| id | description | platform | files touched | depends-on | size | acceptance criteria |
|---|---|---|---|---|---|---|
| C2-T1 | … | android | … | — | S | … |
```

- A cycle's tasks are `C<n>-T<m>` and use the same row schema.
- `fix_cycle` must name the latest cycle.
- The hyphenated id keeps every cycle's tasks distinct within one plan and shows which
  cycle a task belongs to.

**Known limitation.** task-state's id rule does not yet accept `C<n>-T<m>`, so
`parseBreakdown` skips those rows today. Widening it belongs to the step that implements
fix cycles, together with appending them. Neither is part of this contract step.

## Fingerprints and anchors

Both reuse the planning-document machinery as is. No parser change was needed.

- **Body:** `fingerprintBody()` (`scripts/migrate-planning-doc.ts`). It covers the body
  only, so any edit to Root Cause, Fix Design, Tasks or a cycle changes it. The approval
  step will bind to this value.
- **Sections:** `sectionFingerprints()` (`scripts/task-resume.ts`). It gives one
  fingerprint per heading anchor, so a basis can cite `bug-work-plan.md#root-cause`,
  `#fix-design`, `#tasks` or `#cycle-2`.
  - An edit to Cycle 2 moves `#cycle-2` and `#fix-cycles`, but not `#tasks`.
  - An edit to Root Cause does not move `#fix-design`.
  - Code fences are skipped, so the example cycle in the template is never an anchor.
- **Frontmatter is excluded**, exactly as for every planning document. `status`,
  `approved_*` and `doc_schema_version` changes never move the body fingerprint.
  - That includes `bug_evidence_fingerprint` and the other identity fields.
  - **Consequence for the approval step:** it must compare `bug_evidence_fingerprint`
    (and identity) directly, the way design-reference fields are compared beside
    `source_fingerprint`. It must not rely on the body fingerprint for them.

## Validation results

`validateBugWorkPlan(buf)` returns:
- `ok` and `errors[]` (`{code, message}`);
- the typed `frontmatter`;
- `sections` (heading and anchor), `tasks` (id, cycle, row fingerprint, depends-on,
  platform) and `cycles`;
- `body_fingerprint` and `section_fingerprints`.

Error codes:

| Area | Codes |
|---|---|
| Frontmatter | `NO_FRONTMATTER`, `SCHEMA_VERSION`, `WORK_TYPE`, `MISSING_FIELD`, `INVALID_FIELD`, `IDENTITY_MISMATCH` |
| Body layout | `SECTION_MISSING`, `SECTION_DUPLICATE`, `SECTION_ORDER`, `SECTION_UNEXPECTED`, `ANCHOR_COLLISION`, `LABEL_MISSING` |
| Tasks | `TASK_TABLE`, `TASK_ID`, `TASK_DUPLICATE`, `TASK_PLATFORM`, `TASK_DEPENDENCY` |
| Cycles | `CYCLE_SEQUENCE`, `CYCLE_LABEL`, `FIX_CYCLE_MISMATCH` |

The `DEV-<8 hex>` key is checked for form only. Recomputing it needs the bug evidence, which
bug intake owns.
