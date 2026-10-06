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
breakdown, folded into one artifact. A plan is approved through
[`scripts/work-approval.ts`](../scripts/work-approval.ts) ([Approval](#approval)). Nothing
generates or implements a plan yet, and task-state does not read one.

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
| `approved_by`, `approved_fingerprint`, `approved_cycle` | `null` until approved | Written only by `work-approval.ts approve`. Their meaning is defined under [Approval](#approval); the structural validator checks syntax only (`approved_fingerprint` is `null` or `sha256:<64 hex>`; `approved_cycle` is `null` or a positive integer). |

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
  - That is why approval does not bind to the body fingerprint alone (see below).

## Approval

A plan is approved for exactly the work package a human approved. The package is:
- the body;
- the text above the frontmatter block;
- the bug identity and evidence fields implementation trusts;
- the current fix cycle.

The helper is [`scripts/work-approval.ts`](../scripts/work-approval.ts). It always exits 0
and prints JSON.

```
node --no-warnings scripts/work-approval.ts verify  <path>
node --no-warnings scripts/work-approval.ts approve <path> --by <identity>
```

### The approval fingerprint

```
approval_fingerprint = "sha256:" + hex(sha256(canonical({
  algorithm: "work-approval/bug-work-plan/v1",
  body:      fingerprintBody(plan),               // sha256 of the body bytes, as is
  leading:   "sha256:" + hex(sha256(leading)),    // the bytes above the frontmatter block
  fields: {
    bug_key, qa_bug_id, external_ref, origin, found_in_build,
    platform, device_type, surfaces, capability, related_feature,
    bug_evidence_fingerprint, fix_cycle
  }
})))
```

- `canonical` is the JSON form the release gate and bug intake already use
  (`scripts/qa-release-gate.ts`): keys sorted recursively, and no whitespace.
- Field values are the validator's typed values:
  - `null` stays `null`;
  - `fix_cycle` is an integer (1 when absent);
  - `surfaces` is a de-duplicated, sorted list. It is a set here, exactly as in the bug
    evidence fingerprint, so reordering it changes nothing.
- A structurally invalid plan has no approval fingerprint, and is never approved.
- `algorithm` names this exact rule. A future change takes a new id, so it can never
  collide with an approval recorded under this one.

**What is outside the approval, and why.** Frontmatter values that are not listed above are
not bound:
- **YAML comments.** They are not values.
- **`doc_schema_version`.** The migration framework owns it. A shape migration must not
  look like a content change, which is the same reason it is excluded from `fingerprintBody`.
- **`repo_knowledge_*`.** These re-resolve on every run and have their own freshness
  fingerprint.
- **`author` and `date`.** These are generation metadata that implementation never acts
  on. Binding wall-clock data would make an approval's validity depend on time.
- **`status` and the `approved_*` fields.** They record the approval itself.

These are the exclusions the existing `fingerprintBody` / `source_fingerprint` convention
already makes. Everything else is bound, so implementation cannot read anything an
approval does not cover:
- every body byte, including HTML comments inside the body, because body bytes are hashed
  as they are with no normalization;
- the title line above the frontmatter.

### Verification

`verify` is read-only and reports exactly one status:

| Status | When | Codes |
|---|---|---|
| `invalid` | The plan is not structurally valid. | `PLAN_INVALID`, plus the validator's `errors` |
| `draft` | `status` is not `approved`. | `NOT_APPROVED` |
| `invalid` | `status: approved`, but the approval is incomplete. This covers a hand-written or partial approval. | `APPROVER_MISSING`, `APPROVAL_FINGERPRINT_MISSING`, `APPROVAL_CYCLE_MISSING` |
| `approval_stale` | The approval is complete but no longer matches: the content, identity or cycle changed. | `APPROVAL_FINGERPRINT_MISMATCH`, `APPROVAL_CYCLE_MISMATCH` |
| `approved` | All four rules hold. | none |

The four rules for a valid approval:
1. `status: approved`;
2. `approved_by` is not empty;
3. `approved_fingerprint` equals the recomputed approval fingerprint;
4. `approved_cycle` equals `fix_cycle`.

Every verdict also returns the current `approval_fingerprint` and the `recorded` approval,
so a caller can show what moved.

**Behavior after an edit:**
- A malformed `approved_fingerprint` makes the plan structurally `invalid`.
- An edit after approval leaves `status: approved` on disk. Verification never rewrites a
  stale plan back to `draft`, and never repairs it. The caller decides how to present it,
  and a human re-approves.

### Cycle binding

`approved_cycle` must equal `fix_cycle`, and `fix_cycle` is also inside the fingerprint.
When a new cycle is appended (`fix_cycle` 1 → 2):
- the cycle-1 approval becomes `approval_stale`, because both the fingerprint and the cycle
  differ;
- `approved_cycle: 1` cannot approve cycle 2, even with a fingerprint recomputed for the
  new content;
- cycle 2 needs one new approval, recorded as `approved_cycle: 2`.

### Approving

`approve --by <identity>`:
- Needs an explicit human identity. The approver is never inferred.
  - An identity must be plain: a letter or digit first, then letters, digits, spaces and
    `. _ @ + -`, at most 100 characters.
  - These are refused: `#`, `:`, a line break, and placeholders such as `null`.
- Refuses a structurally invalid plan.
- Writes exactly four frontmatter values, keeping each line's comment:
  - `status: approved`
  - `approved_by: <identity>`
  - `approved_fingerprint: <approval fingerprint>`
  - `approved_cycle: <fix_cycle>`
- Before the atomic write (temp file, fsync, rename), it asserts:
  - the body and the text above the frontmatter are byte-identical;
  - the frontmatter block reassembles byte-faithfully;
  - each approval field appears exactly once;
  - the result verifies as `approved`.
  If any check fails, nothing is written.

**Idempotent.** If the plan is already validly approved, by the same approver, for the
same fingerprint and cycle, `approve` writes nothing (`changed: false`).

**Re-approval.** If content changed after approval, `approve` records the new valid state
and reports the replaced approval as `previous`. A different approver on unchanged
content is a new approval act and is recorded the same way.

No `doc_schema_version` change was needed: v1 already reserved these fields, and their
syntax is unchanged.

## Generation (`/analyze-bug`)

`commands/analyze-bug.md` creates the plan. Its deterministic half is
[`scripts/analyze-bug.ts`](../scripts/analyze-bug.ts):

| Subcommand | What it does |
|---|---|
| `start` | Read-only. Runs bug intake and reads any existing plan, then names exactly one outcome. |
| `scaffold` | Writes the draft's deterministic half. |
| `check` | Applies the generation rules below on top of `validateBugWorkPlan`. |

**Outcomes of `start`:**

| Outcome | Meaning |
|---|---|
| `BUG_PLAN_NEW` | No plan exists. Create the cycle-1 plan. |
| `BUG_PLAN_AWAITING_APPROVAL` | A current draft exists, or the plan was edited after approval with no task state. Present it for approval; do not regenerate. |
| `BUG_PLAN_APPROVED` | The plan is approved and current. The next action is `/implement-task bug:<bug_key> T1`. |
| `BUG_PLAN_REGENERATE` | The evidence or identity drifted under an unapproved draft with no task state. Regenerate the draft in place. |
| `BUG_PLAN_STALE` | The evidence drifted under an approved plan, or under one with task state. Stop; reconciliation is a later step. |
| `BUG_PLAN_INVALID` | Never overwritten. |
| `BUG_REOPENED` | Reported, together with intake's reopened evidence. No Cycle 2 is created. |
| `BUG_QA_DENIED` | QA's verified denial. |
| `BUG_INSUFFICIENT_EVIDENCE` | Intake has no reliable evidence. |

Drift is measured on `bug_evidence_fingerprint`, `qa_bug_id`, `external_ref` and `origin`.

When intake later moves from partial to full context, QA's derived `found_in_build` becomes
known. That changes the evidence fingerprint, and the plan is then reported as drifted.

**Routing** is never chosen by the helper.
- It is inherited only from the existing plan, or from the related feature's **one**
  approved Task Breakdown with a valid platform and device type.
- Otherwise a human confirms it once (`ROUTING_REQUIRED`).
- QA surfaces are corroboration only.
- **The capability QA bound** wins over a Project Knowledge lookup (`CAPABILITY_CONFLICT`).

**Generation rules (`check`).** Each rule, with the code reported when it fails:

| Code | Rule |
|---|---|
| `SECTION_EMPTY` | Every fixed section has content outside HTML comments. |
| `EVIDENCE_LABELS` | Root Cause labels its claims `[evidence: …]`, `[reused: …]`, `[inference]` or `[unknown]`. A labelled `[inference]` is how an unreproducible-locally root cause is recorded. |
| `REPRO_CRITERION` | Some cycle-1 task's **first** acceptance criterion begins "The reported reproduction path no longer fails". |
| `REGRESSION_PLAN` | The Regression test label names an existing cycle-1 task (`T<n>`), or begins `Not feasible:` with the reason. |
| `PARTIAL_WARNINGS` | In partial context, Reproduction Evidence keeps every intake warning code. |
| `PLAN_STALE` | The plan still matches intake. |

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
