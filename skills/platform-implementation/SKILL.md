---
name: platform-implementation
description: The platform-independent methodology for implementing exactly one approved task — repository grounding discipline, scope control, incremental implementation, validation workflow and self-review. Orchestration, the input handoff and the completion-report shape belong to /implement-task and are cited, not restated. Used by /implement-task via the feature-implementer agent, alongside the resolved platform's implementation skill.
---

# Platform Implementation

## Overview

The **workflow half** of implementing one task: how a task is taken from approved
documents to validated code, independent of which platform the code is written in. The
other half is the resolved **platform lane**, which owns language, framework and
standards-citation content. This skill never restates the lane and never names a platform.

**This skill is not orchestration, and it does not move command logic into itself.**

## Authoritative owners — cite these, never restate them

| What | Owner |
|---|---|
| Task-id, repository-root and document-path resolution | **`commands/implement-task.md`** §1–§4 |
| Approval, dependency and blocker gates; consistency preflight | **`commands/implement-task.md`** §5–§6a |
| Accessibility applicability for the confirmed context | **`commands/implement-task.md`** §5b |
| Platform routing and the lane's readiness gate | **`commands/implement-task.md`** §7 |
| **The resolved inputs, and the source-of-truth hierarchy over them** | **`commands/implement-task.md`** §8 |
| **The completion-report shape** | **`commands/implement-task.md`** §10 |
| Task lifecycle state — the command is **sole lifecycle writer**; this skill only appends checkpoints | **`docs/task-state-contract.md`**, via `scripts/task-state.ts` |
| Whether an interrupted run resumes, and from where — the **resume verdict** | **`commands/implement-task.md`** §6, via `scripts/task-state.ts` |
| Verification tiers, and what may be recorded as proven | **`standards/shared/verification.md`** |
| Accessibility rules | **`standards/shared/accessibility.md`** |
| Which repository knowledge may be reused, and what must be derived | **`skills/repo-knowledge-consumer/SKILL.md`** |
| Language, framework, toolchain, standards-citation map, platform stop conditions | **the resolved platform lane** |

**Take the inputs `/implement-task` §8 passes as authoritative.** Use them directly —
never re-resolve by searching, never guess a path. §8 also fixes the order the approved
documents are read in and what each is authoritative for; follow it rather than a copy.
If a listed input is missing and cannot be resolved deterministically, **stop and report
exactly which input is missing**. If the resolved platform does not match the task row's,
stop.

**The gates are the command's.** §5–§6a already confirm the DD, Dev Plan and Task
Breakdown are approved, that the task is not complete, that every `depends-on` is
satisfied and that no blocker remains. Read their verdicts; **never re-derive them here**.
If a verdict is absent or inconclusive, stop rather than assume.

**This skill never modifies a planning document, and never writes lifecycle state.** It reads
approved artifacts and writes application code. Its one write to the task-state store is to
**append checkpoints to the active run** — see [Checkpoints](#6a-checkpoints) — which can never
set `complete`, `failed`, `blocked` or any other lifecycle state.

## 0. Resuming an interrupted run

When §8 of `/implement-task` passes a **resume verdict**, this is the same run continuing, not a
new one. The verdict is authoritative, and it was computed from hashes — follow it rather than
re-deriving any of it:

- **Start at `nextStep`.** Steps in `checkpoints.valid` are done: their files are
  `matches-checkpoint`, and they are **not reimplemented**. Steps in `checkpoints.invalidated`
  are redone from their recorded reason — typically an upstream section they cite changed.
- **Finish `partialFiles` from the code as it now is.** A `partial` or `changed-after-checkpoint`
  file holds work in flight when the run stopped. The current repository code is authoritative:
  read it, complete the step that owns it, then checkpoint the step. Never restore an earlier
  version and never rewrite it from scratch without cause.
- **Re-run only `validations.rerun`.** Each names the exact file or basis that moved.
  `validations.carried` results still hold and are not re-run to "be safe".
- **Re-read the saved `context` and `developerTesting`** — the accessibility decision, the design
  attestation, the developer-testing decision. Recomputing a recorded decision is the
  non-determinism resume exists to remove.
- **Never touch `preexisting-unchanged` files.** They are the developer's work, not the task's.
- With `nextStep: plan`, no plan was recorded before the interruption: plan again (§4), treating
  every edit already in the tree as existing code.

## 1. Standards readiness gate

Confirm the standards the resolved lane cites, and `standards/shared/`, are authored
rather than structure-only placeholders. If one is missing or a placeholder, **stop and
report that implementation is blocked until it is authored** — never fall back to assumed
defaults. The lane owns *which* files; this skill owns the obligation to check.

## 2. Design reference

**Resolve it before writing UI code.** For Figma, pull Dev Mode specs and any code
mappings for the frame via the `figma` MCP server. When the command passed a design evidence
file, it holds exactly those reads for the linked node; use it, and pass it as
`--design-evidence` on every checkpoint whose basis cites `design`. If you read the design
yourself, save `get_metadata` and `get_design_context` for the linked node as that file first
(`commands/analyze-feature.md` step 6), outside the repository. Otherwise read what `design_reference`
points at — the specification, the exported mockups, or the named existing screen to
mirror. Never guess spacing, colour or typography. **If a recorded reference cannot be
accessed, stop with the exact error.** `design_reference_status: not_required` needs none.

## 3. Repository grounding

Inspect the codebase before writing. **Detect — do not assume** — then follow what is
there rather than a default. The lane declares *which* dimensions to inspect; this skill
owns the discipline applied to all of them:

- **Label every repository claim** `[evidence: <path>]`, `[reused: <path>#<anchor>]`, `[inference]` or `[unknown]`. An unlabelled claim is a defect, and `[unknown]` beats a guess. Never invent modules, components, APIs, paths, dependencies or repository facts.
- Follow the **nearest analogous feature** as the pattern.
- **Reuse before creating.** Naming a "new" element that already exists is the most common defect this step prevents.
- **Official vendor documentation is supporting guidance only.** Platform, framework and library docs never override a valid existing implementation, and "the ecosystem now prefers X" is never by itself a reason to propose X.
- **Where a standard's assumed library and the repository's detected library differ, that is a standards question, not an implementation decision.** Follow the approved DD, cite the IDs actually applied, record the divergence in the report, and never migrate the repository to match a standard as a side effect of a feature.
- **Project Knowledge arrives through the approved planning artifacts.** The Feature Analysis's `surface`, `capability` and `## Project Knowledge Context`, and the DD's `## Repo Knowledge Reference` and §20 citations, already name the surface conventions, capability context and repository facts planning resolved and verified. Read those cited sections; **do not resolve Project Knowledge again** or run a second discovery pass over what planning cited. Read source for the feature-specific detail the edit needs — that is required, not duplication.
- **Current code stays authoritative during edits.** Where the code contradicts a cited fact, follow the code, record the contradiction as a deviation in the completion report, and stop under §5 if the task can no longer be done within its approved scope. Never overwrite or "fix" Inspector-owned knowledge — recommend `/inspect` → **Refresh Project Knowledge** instead.
- **Never write down what you discovered.** Repository knowledge belongs to `ono-project-inspector`; anything derived here is scoped to this run and is never persisted to `CLAUDE.md`, `AUDIT.md`, `docs/project/**`, `audits/**` or `.ono/**`.

Before the first edit, read the DD sections the task references, the files the task row
names, the nearest analogous feature, the modules directly upstream and downstream, and
the tests covering them. Reading is not writing — none of it is restated in the output.

## 4. Pre-implementation plan

Produce a concise plan: objective; acceptance criteria; files expected to change; files
reviewed for context; patterns and components to reuse; implementation sequence;
validation strategy; risks; side effects; applicable standard IDs.

## 5. Scope control & deviation rules

Implement **only** the selected task. Do not opportunistically fix unrelated issues,
refactor unrelated modules, absorb another task, change approved API contracts or business
rules, update the DD or plan silently, mark dependencies complete without evidence, or
introduce speculative abstractions.

On discovering additional work: **stop** it, **document** the finding, **explain** whether
it needs a new task · a DD amendment · a product or backend answer · a security review · a
migration, and **continue** only within the selected task's approved scope. If the task
itself cannot be completed without expanding scope, **stop and report it as blocked**.

## 6. Incremental implementation

Work in small steps. After each: inspect the diff, check imports and compilation or type
errors, verify layering and module boundaries, verify no unrelated files changed, and run
the narrowest useful validation. Do not wait until the end to discover the project no
longer builds.

## 6a. Checkpoints

A checkpoint is the durable evidence that lets an interruption resume deterministically. Append
one at each boundary below, for the `runId` the command passed, through the helper. Only
`/implement-task` starts a run; when the invoking command passed no `runId`, there is no active
run and nothing is checkpointed.

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" checkpoint \
  --root "<TARGET_ROOT>" --feature "<feature>" --task "<task-id>" --run "<runId>" \
  --kind <kind> --breakdown "<absolute Task Breakdown path>" --payload '<json>'
```

| Boundary | `--kind` | Payload |
|---|---|---|
| the §4 plan is settled | `plan` | `expectedFiles`, and ordered `steps` — each `{ id, description, files, basis }` |
| a toolchain probe the lane requires has run | `probe` | `{ name, command, output }` |
| a §6 step is complete and its narrowest check passed | `step` | `{ stepId }` |
| any validation or developer test has run | `validation` | `{ command, result, kind, covers, basis, evidence? }` |
| the §7a developer-testing decision is made | `developer-testing` | `{ developerTesting, verificationDebt }` |
| self-review is complete | `review` | `{ completed, findings }` |

- **`basis` names the planning inputs a step or validation is built on** — the DD sections it
  implements (`dd#<heading-anchor>`), the row cells it satisfies (`row:acceptance criteria`),
  `design` for UI work, `probe:<name>` for a toolchain-dependent result. Cite the narrowest
  sections that genuinely apply: after an upstream change, only work whose cited sections moved is
  redone. A reference that does not resolve is refused.
- **A basis citing `design` or `requirements` needs the evidence of the external read** the
  work was built against when that source is external (`--design-evidence` /
  `--source-evidence`); without it the helper refuses, rather than record a basis it cannot
  verify later.
- **`covers` names the files a validation actually exercised.** Omitted, it covers every
  task-owned file — correct, but it re-runs on any edit.
- **The helper hashes every file and every basis reference itself.** Never pass a hash, and never
  checkpoint a step before its files are written: a checkpoint states what is on disk.
- **Record only what actually happened.** A `validation` checkpoint is a command that ran, with its
  real `pass` or `fail` — the same rule §7 applies to the completion report.

## 7. Validation methodology

The lane names the concrete commands, and `standards/shared/verification.md` owns the tier
vocabulary and what each tier may prove. These are the additional workflow rules execution
requires:

- **Do not claim a command passed unless it was actually run successfully**, and do not claim the app was manually validated unless it was actually run.
- If a tool, simulator, device, credential, environment or backend is unavailable, **state exactly what could not be validated** and record the obligation as verification debt rather than omitting it.
- Run the narrowest relevant validation first, then broaden.
- Do not fix unrelated pre-existing failures unless approved; distinguish new from pre-existing.
- **Validate every acceptance criterion individually.**

## 7a. Developer testing

Every change answers one question explicitly: **are developer tests required?** The
decision is mandatory — silence is not "no tests needed". It applies to every change this
methodology produces, whichever command invoked it.

**Developer testing** means tests that live in the code repository: unit tests, component
tests and repository integration tests. It is the developer's implementation-time
responsibility. It is **not** QA automation — not QA plans, manual QA, Appium, WebdriverIO,
or anything in a QA repository — and none of those satisfy or replace it.

1. **Detect the repository's developer test framework** — runner, libraries, where the
   tests live and how the repository actually runs them. Apply the lane's testing guidance
   where the lane has one; otherwise follow the repository's own conventions. Never invent
   a testing standard, and never introduce a framework the repository does not use.
2. **Decide whether tests are required** for this change. Where the repository has an
   applicable framework, the **default expectation is to update existing tests or add new
   ones** covering the changed behaviour. Where no test is added or updated, record an
   explicit justification for not modifying tests (e.g. existing tests already assert the changed behaviour and
   were run; the change has no runtime behaviour under test). Not required at all also
   needs a reason.
3. **Run the narrowest relevant developer tests** — the files or targets covering the
   change — then broaden only as the lane's validation guidance requires.
4. **Record what actually happened.** Never claim a test passed unless it actually ran, and
   record each run exactly as it was run, with its real `pass` or `fail`. A failing
   developer test is a proven defect: it blocks completion.
5. **Tests that cannot be written or run** (no framework, an unavailable toolchain,
   environment or credential) become verification debt with `domain: "developer-testing"`
   and `owner: "developer"` (`VERIFY-4` in `standards/shared/verification.md`). It is the
   developer's obligation and **never QA debt** — never hand it to QA, and never let it
   appear as verification owed to QA.

## 8. Self-review and completion

Before reporting, self-review against task scope · DD compliance · layering and dependency
direction · module placement · reuse · state ownership · error handling · localization and
RTL · accessibility · performance · security and PII logging · test coverage · dead code ·
unintended file changes · backward compatibility. The lane adds its own points. Report any
unresolved concern — do not hide it.

**Return the structured completion report `/implement-task` §10 requires**, in the shape
§10 defines. Record which standard IDs were **applied**, not merely reviewed — the review
lane and the QA handoff rely on that trace. The lane owns the area-to-ID map; cite only
IDs that exist in it and genuinely apply. Never invent an ID, and never cite one that is
merely adjacent.

**Do not mark the task complete if** any acceptance criterion failed · required validation
failed · a dependency is unproven · the implementation deviates from the DD without
approval · a blocker remains · the code exists only in an isolated worktree · files outside
the approved scope were modified without justification.

## Red flags — STOP and report instead of proceeding

Platform-independent stop conditions; the lane adds its own.

- A required input is missing, or a referenced document is missing, unapproved, stale, draft or dry-run.
- The approved documents conflict, or the task needs to violate or expand the DD, or change an approved API contract or business rule.
- A `depends-on` task is not verifiably complete, or a blocker or open question remains.
- The task depends on an unconfirmed backend contract.
- A UI task has no design reference of any supported type, or a recorded one cannot be accessed.
- Completing the task requires touching files outside its approved scope.
- You are about to claim a typecheck, lint, test, build or manual check passed that you did not run.
- You are about to finish without a recorded developer-testing decision, or hand developer-testing debt to QA.
- You are about to record a Tier 3 obligation as satisfied by mechanical evidence.
- A standard the lane cites is missing or is a structure-only placeholder.
- You are about to write a repository-knowledge artifact owned by `ono-project-inspector`.

## Relationship with command, agent, lane, hooks

Every boundary is stated once, in [Authoritative owners](#authoritative-owners--cite-these-never-restate-them)
above. `agents/feature-implementer.md` executes this methodology against one resolved lane;
the lane supplies the platform content; the command owns orchestration; the
`require-approval-before-code`, `block-main-branch-changes` and `protect-secrets` hooks
gate every edit.
