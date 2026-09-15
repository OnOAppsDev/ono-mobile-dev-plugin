---
name: platform-implementation
description: The platform-independent methodology for implementing exactly one approved task — repository grounding discipline, scope control, incremental implementation, validation workflow and self-review. Orchestration, the input handoff and the completion-report shape belong to /implement-task and are cited, not restated. Used via the feature-implementer agent alongside the resolved platform's implementation skill. NOT YET WIRED — nothing routes to it; every platform still takes its own implementation lane.
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
| Task lifecycle state — the command is **sole writer** | **`docs/task-state-contract.md`**, via `scripts/task-state.ts` |
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

**This skill never modifies a planning document, and never writes task state.** It reads
approved artifacts and writes application code.

## 1. Standards readiness gate

Confirm the standards the resolved lane cites, and `standards/shared/`, are authored
rather than structure-only placeholders. If one is missing or a placeholder, **stop and
report that implementation is blocked until it is authored** — never fall back to assumed
defaults. The lane owns *which* files; this skill owns the obligation to check.

## 2. Design reference

**Resolve it before writing UI code.** For Figma, pull Dev Mode specs and any code
mappings for the frame via the `figma` MCP server. Otherwise read what `design_reference`
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

## 7. Validation methodology

The lane names the concrete commands, and `standards/shared/verification.md` owns the tier
vocabulary and what each tier may prove. These are the additional workflow rules execution
requires:

- **Do not claim a command passed unless it was actually run successfully**, and do not claim the app was manually validated unless it was actually run.
- If a tool, simulator, device, credential, environment or backend is unavailable, **state exactly what could not be validated** and record the obligation as verification debt rather than omitting it.
- Run the narrowest relevant validation first, then broaden.
- Do not fix unrelated pre-existing failures unless approved; distinguish new from pre-existing.
- **Validate every acceptance criterion individually.**

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
- You are about to record a Tier 3 obligation as satisfied by mechanical evidence.
- A standard the lane cites is missing or is a structure-only placeholder.
- You are about to write a repository-knowledge artifact owned by `ono-project-inspector`.

## Relationship with command, agent, lane, hooks

Every boundary is stated once, in [Authoritative owners](#authoritative-owners--cite-these-never-restate-them)
above. `agents/feature-implementer.md` executes this methodology against one resolved lane;
the lane supplies the platform content; the command owns orchestration; the
`require-approval-before-code`, `block-main-branch-changes` and `protect-secrets` hooks
gate every edit.
