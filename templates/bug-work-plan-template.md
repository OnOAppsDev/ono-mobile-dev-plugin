# Bug Work Plan Template

```yaml
doc_schema_version: 1 # the frontmatter contract version this document was written against. Stamped at generation; a bug-work-plan has no earlier version and is never migrated from an unstamped copy. See docs/planning-doc-contract.md and docs/bug-work-plan-contract.md — never edit by hand.
work_type: bug # always `bug` — names this document's kind
bug_key: # the canonical Dev bug key from scripts/bug-intake.ts: the QA bug id, else the external ref, else DEV-<8 hex>. Names the folder: docs/bugs/<bug_key>/bug-work-plan.md
qa_bug_id: null # the QA bug id (BUG-<n>) when the bug came from QA, otherwise null — never omitted
external_ref: null # the external tracker key (e.g. PAY-1182) when there is one, otherwise null — a key, never a URL
origin: # qa-execution | qa-standalone | external | production | dev-review | dev-testing — from bug intake
found_in_build: null # the build the bug was found in, from bug intake, or null when unknown
platform: # react-native | ios | android | react — exactly one confirmed platform; every task row carries it
device_type: # mobile | tv — resolved for this repository, never assumed
surfaces: [] # the affected surface ids from bug intake, e.g. [android] — [] when unknown
capability: null # the Project Knowledge capability id, or null when not found
related_feature: null # the Dev feature id QA recorded for a related feature scope, or one confirmed by the developer; null otherwise — never inferred
bug_evidence_fingerprint: # sha256: of the bug evidence this plan was written from — bug intake's bug_evidence_fingerprint, copied verbatim
fix_cycle: 1 # the latest fix cycle in this plan: 1 for the Tasks section alone, n when "### Cycle n" is the last entry under Fix Cycles
# repo_knowledge_* fields: exact values and encoding are defined by the repo-knowledge-consumer skill's Step 6 (skills/repo-knowledge-consumer/SKILL.md). Absent values are the bare YAML keyword `null`.
repo_knowledge_status: # available | unavailable
repo_knowledge_schema: # the repository-knowledge contract schema version, or null when unavailable
repo_knowledge_fingerprint: # fingerprint.gitHead from the manifest, or null
repo_knowledge_freshness: # fresh | stale-head | stale-artifacts | unknown | null
repo_knowledge_reused: # categories reused from canonical knowledge, or none
repo_knowledge_derived: # categories derived live for this bug, or none
author: # the relevant platform architect / human author
status: draft # draft | approved
approved_by: null # reserved for the approval step — null until then
approved_fingerprint: null # reserved for the approval step — null until then
approved_cycle: null # reserved for the approval step — null until then
date: # YYYY-MM-DD
```

## Reproduction Evidence

<!-- How the bug reproduces, from bug intake: steps, build, surface, device, and the evidence source (QA ledger, report file, external tracker). Label every fact [evidence: <path>], [reused: <path>#<anchor>], [inference] or [unknown] — the planning lanes' existing evidence discipline. Prefer [unknown] over a guess. -->

## Observed vs Expected

<!-- **Observed:** what happens. **Expected:** what should happen. Both from the bug evidence, labelled. -->

## Affected Capability & Surfaces

<!-- The affected surfaces and, when Project Knowledge locates it, the capability (`docs/project/capabilities.md#capability-<id>`). Cite, never paste. -->

## Root Cause

<!-- The defect's cause in the code, grounded in [evidence: <path>] — not the symptom. If the cause is not yet proven, say so with [inference] and record what would confirm it under Open Questions. -->

## Blast Radius

<!-- What else the cause or the fix can touch: callers, shared state, other surfaces, related capabilities. Labelled. -->

## Fix Design

- **Root-cause fix:** the change that removes the cause, not the symptom
- **Minimal change surface:** the smallest set of changes that fixes it
- **Affected files / areas:** the files or areas changed, where known
- **Non-goals:** what this fix deliberately does not change
- **No unrelated refactoring:** confirm nothing outside the fix is restructured
- **Risks:** what could regress, and how verification covers it

## Verification Strategy

- **Reproduction path:** how the bug is reproduced before, and shown fixed after
- **Developer Testing:** the unit, component or integration tests the fix adds or updates (standards/shared/verification.md)
- **Regression test:** the test that fails before the fix and passes after — or why one is not feasible
- **Affected surfaces:** every surface above that verification covers
- **QA re-test:** what QA re-tests, on which surfaces, once a build claims the fix
- **Verification debt:** what cannot be verified or automated here, recorded as verification debt — or none

## Tasks

<!-- Cycle 1. The Task Breakdown's row schema, unchanged (templates/task-breakdown-template.md). Ids are T1, T2, … Every row carries the plan's platform. -->

| id | description | platform | files touched | depends-on | size | acceptance criteria |
|---|---|---|---|---|---|---|
| T1 | Short imperative description of the task | react-native | `src/features/example/exampleSlice.ts` | — | S / M / L | Concrete, checkable condition(s) that mean this task is done |

## Fix Cycles

No additional fix cycles yet. Cycle 1 is the Tasks section above.

<!--
Append-only. When QA re-tests a fix and it fails, the next cycle is appended here and fix_cycle is set to its number; earlier cycles are never edited. Each cycle has this shape:

```md
### Cycle 2

- **Failed build:** the build whose fix failed QA re-test
- **Failed surfaces:** the surfaces it failed on
- **Failed re-test evidence:** the re-test run, notes and evidence, labelled
- **Fix-design delta:** what changes from the previous cycle's Fix Design, and why

| id | description | platform | files touched | depends-on | size | acceptance criteria |
|---|---|---|---|---|---|---|
| C2-T1 | … | react-native | … | — | S | … |
```
-->

## Repo Knowledge Reference

<!-- Where this plan's repository context came from, in the repo-knowledge-consumer skill's Step 6 block shape. When canonical knowledge was unavailable, say so: everything above is then a point-in-time observation. -->

## Open Questions

<!-- Anything uncertain that needs a human decision before the fix is implemented. Do not silently resolve these. -->
