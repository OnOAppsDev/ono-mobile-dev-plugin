---
name: platform-implementation
description: The platform-independent methodology for implementing exactly one approved task — inputs, source-of-truth hierarchy, readiness checks, repository grounding, scope control, validation, self-review and the completion report. Used by /implement-task via the feature-implementer agent, alongside the resolved platform's feature-implementation skill, which supplies the language, framework and standards-citation content this skill deliberately does not carry. NOT YET WIRED — nothing routes to it; every platform still takes its own implementation lane.
---

# Platform Implementation

## Overview

This skill is the **workflow half** of implementing one task. It owns everything about
*how a task is taken from approved documents to validated code* that does not depend on
which platform the code is written in — and it owns nothing else.

The other half is the resolved platform's own implementation skill, referred to
throughout as **the platform lane**. That lane owns the language and framework
methodology and the standards-citation map. This skill never restates either, and never
names a platform.

> **Not yet wired — nothing routes to this skill.**
>
> `/implement-task` still routes each platform to its own implementation skill and
> feature-developer agent. This skill exists alongside them so the two can be compared on
> real work before anything is switched over. **Do not invoke it on your own initiative.**

**This skill is not orchestration.** `/implement-task` resolves the task id, verifies the
approval and readiness gates, reads the row's `platform`, routes, and records lifecycle
state. The `require-approval-before-code`, `block-main-branch-changes` and
`protect-secrets` hooks gate every write. This skill assumes those are active and does
not re-implement any of it.

**This skill never modifies a planning document.** It reads approved artifacts and writes
application code.

## What this skill does not own

Referencing these is correct; restating them is duplication.

| Concern | Owner |
|---|---|
| Task-id resolution, repository-root resolution, document-path resolution | **`commands/implement-task.md`** §1–§4 |
| Approval, dependency and blocker gates; the consistency preflight | **`commands/implement-task.md`** §5–§6a |
| Accessibility applicability for the confirmed context | **`commands/implement-task.md`** §5b |
| Platform routing, and the readiness gate on the resolved lane | **`commands/implement-task.md`** §7 |
| Task lifecycle state — it is the **sole writer** | **`commands/implement-task.md`** §7a, via `scripts/task-state.ts` |
| The context handoff, and verification of the completion report | **`commands/implement-task.md`** §8, §10 |
| Language, framework and library methodology; the standards-citation map; platform toolchain mechanics; platform-only stop conditions | **the resolved platform lane** |
| Verification tiers, and what may be recorded as proven | **`standards/shared/verification.md`** |
| Repository knowledge: what it covers, what may be reused, what must still be derived | **`skills/repo-knowledge-consumer/SKILL.md`** |

## Inputs this skill requires (resolved, never invented)

`/implement-task` resolves and verifies these before invoking, and passes them as
authoritative. **When they are provided, use them directly** — do not re-resolve them by
searching the workspace, and never guess a filename or a path:

- The absolute `TARGET_ROOT` (repository root).
- The absolute path to the approved **Feature Analysis**.
- The absolute path to the approved **Detailed Design (DD)**.
- The absolute path to the approved **Dev Plan**.
- The absolute path to the approved **Task Breakdown** — the generated feature artifact, never a plugin template under `templates/`.
- The selected **task id**.
- The selected **task-row content**.
- The **platform**, and with it the **resolved platform lane**.
- The **design reference** — `design_reference_status`, `design_reference_type`, `design_reference`, and `figma_link`, as recorded upstream.
- The **dependency status** resolved by the command.
- The **approval status** resolved by the command.
- The **unresolved-blocker status** resolved by the command.

The command may pass broader context than this skill consumes — `device_type` among it.
Take what is listed here and ignore the rest rather than inventing behaviour for it; a
lane that needs `device_type` declares it itself.

If any listed input is missing and cannot be resolved deterministically, **stop and report
exactly which input is missing** — do not proceed against an assumed location. If the
resolved platform does not match the task row's `platform`, stop.

## 1. Standards readiness gate

Every rule applied to the code is grounded in an authored standard. Before implementing,
confirm that the standards the resolved lane cites, and the shared standards under
`standards/shared/`, are authored rather than structure-only placeholders. If a cited file
is missing or is a placeholder, **stop and report that implementation is blocked until it
is authored** — never fall back to assumed defaults.

The lane owns *which* files those are. This skill owns only the obligation to check.

## 2. Source-of-truth hierarchy

Read the complete approved context **before editing any code**, in this order:

1. Feature Analysis → 2. Detailed Design → 3. Dev Plan → 4. Task Breakdown → 5. the specific task row for the task id.

Each document's authority:

| Document | Authoritative for |
|---|---|
| Feature Analysis | Business objective, repository findings, platform context, original feature intent |
| **Detailed Design (DD)** | **Architecture, technical approach, API contracts, state design, impacted modules, risks, and every accepted implementation decision** |
| Dev Plan | Sequencing, dependencies, rollout, and rollback context |
| Task Breakdown + selected task row | **Scope of the current implementation** |
| The task's acceptance criteria | **The completion contract** |

Hard rules:

- Never implement from the original feature request when approved downstream documents exist — the DD supersedes it.
- Never rely on the task row alone without reading the DD and Dev Plan.
- Never reinterpret an architectural decision already approved in the DD.
- If the Feature Analysis, DD, Dev Plan and Task Breakdown **conflict**, stop and report the conflict — do not pick one silently.
- If the task requires **violating or expanding the DD**, stop and request approval.
- If a referenced document is **missing, unapproved, stale, or still marked draft/dry-run**, stop.
- If the task is marked **blocked** or depends on an unresolved open question, do not implement it.

## 3. Task resolution & readiness checks

Resolve the task by id from the task-row content the command passed, and read its: id,
description, `platform`, files expected to be touched, acceptance criteria, `depends-on`,
blockers, estimated size, explicit out-of-scope items, and any linked DD sections or
standard IDs.

Confirm **all** of the following before editing. If any fails, **stop and report exactly
what is missing** — do not work around it:

- [ ] The DD is `approved` (for real implementation, not dry-run).
- [ ] The Dev Plan is `approved`.
- [ ] The Task Breakdown is `approved`.
- [ ] The selected task is not already complete.
- [ ] Every `depends-on` task is complete — **confirmed from the dependency status the command passed, never re-derived here.** If that status is absent or inconclusive, stop and report it rather than assuming.
- [ ] No blocking open question remains for this task, per the unresolved-blocker status passed in.
- [ ] The task's `platform` matches the resolved lane.
- [ ] The task is small enough for one implementation run (if not, report that it should be split).
- [ ] For UI work, the required design reference exists — `figma_link` or `design_reference`, any supported type; Figma specifically is not required. If neither is set, stop and ask, and do not guess spacing, colour or typography. A task that changes no user-facing UI (`design_reference_status: not_required`) needs none.
- [ ] The repository root and target workspace/package/module are known.

**Resolve the design reference before writing UI code.** For a Figma link, pull Dev Mode
specs and any code mappings for the relevant frame via the `figma` MCP server and
implement to match. For any other recorded type, read what `design_reference` points at —
the specification document, the exported mockups/screenshots, or the named existing
screen/component's implementation — and implement to match that. **If the reference cannot
be accessed, stop with the exact error.**

## 4. Repository grounding

Inspect the actual codebase before writing code. **Detect — do not assume** — and then
follow what you find rather than imposing a default. The resolved lane declares *which*
dimensions to inspect; this skill owns the discipline applied to all of them:

- Follow the **nearest analogous feature** as the pattern.
- **Reuse before creating.** Reuse an existing component, module, selector, endpoint or
  helper rather than adding a parallel one. Naming a "new" element that already exists is
  the most common defect this step prevents.
- **Where a standard's assumed library and the repository's detected library differ, that
  is a standards question, not an implementation decision.** Follow the approved DD, cite
  the IDs actually applied, and record the divergence in the completion report — do not
  resolve it in code, and never migrate the repository to match a standard as a side
  effect of a feature.
- **Never write down what you discovered.** Repository knowledge is owned by
  `ono-project-inspector`; anything derived here is scoped to this run and is not
  persisted to `CLAUDE.md`, `AUDIT.md`, `docs/project/**`, `audits/**` or `.ono/**`.

## 5. Context loading before edits

Before the first edit, read: the DD sections the task references; the files the task row
names; the nearest analogous feature; the modules directly upstream and downstream of the
change; and the tests covering them. Reading is not writing — this context informs the
change, and none of it is restated in the output.

## 6. Pre-implementation plan

Before modifying code, produce a concise plan containing: task objective; acceptance
criteria; files expected to change; files reviewed for context; existing patterns and
components to reuse; implementation sequence; validation strategy; risks; possible side
effects; and the applicable standard IDs.

## 7. Scope control & deviation rules

- Implement **only** the selected task. Do not opportunistically fix unrelated issues,
  refactor unrelated modules, absorb another task, change approved API contracts or
  business rules, update the DD or plan silently, mark dependencies complete without
  evidence, or introduce speculative abstractions.

If additional work is discovered:

1. **Stop** that additional work.
2. **Document** the finding.
3. **Explain** whether it needs: a new task · a DD amendment · a product or backend answer · a security review · a migration.
4. **Continue** only with work that stays within the selected task's approved scope.

If the selected task itself cannot be completed without expanding scope, **stop and report
it as blocked**.

## 8. Incremental implementation

Implement in small logical steps. After each meaningful step: inspect the diff; check
imports and compilation or type errors; verify layering and module boundaries; verify no
unrelated files changed; and run the narrowest useful validation where practical. Do not
wait until the end to discover the project no longer builds.

## 9. Validation methodology

Select checks based on the actual repository and the surfaces touched. The resolved lane
names the concrete commands and tools; the rules below hold regardless of which they are:

- **Do not claim a command passed unless it was actually run successfully.**
- **Do not claim the app was manually validated unless it was actually run.**
- If a required tool, simulator, device, credential, environment or backend is
  unavailable, **state exactly what could not be validated**, and record the obligation as
  verification debt per `standards/shared/verification.md` rather than omitting it.
- Every recorded check declares its tier. **A Tier 3 requirement is never recorded as
  passed** — a green automated check is evidence that no automated defect was found on the
  surfaces the run reached, never that a manual walkthrough happened.
- Run the narrowest relevant validation first, then broaden when practical.
- Do not fix unrelated pre-existing failures unless explicitly approved; distinguish new
  failures from pre-existing ones.
- **Validate every acceptance criterion individually.**

## 10. Self-review

Before reporting completion, self-review against: task scope · DD compliance · layering
and dependency direction · module and folder placement · component and helper reuse ·
state ownership and the local/shared boundary · error shape and handling · loading and
empty states · navigation behaviour · localization coverage and RTL · accessibility roles,
labels and focus order · performance of lists and images · security and PII logging · type
safety · test coverage · dead code · unintended file changes · backward compatibility.

The resolved lane adds its own platform-specific review points to this list. Report any
unresolved concern — do not hide it.

## 11. Completion & reporting

Produce a structured final report with:

1. Task implemented · 2. Objective · 3. **Files changed** · 4. Summary of the implementation · 5. Existing patterns and components reused · 6. **Acceptance-criteria checklist, one by one** · 7. Dependencies verified · 8. **Validation commands run and their exact results** · 9. Tests added or updated · 10. **Applied standard IDs** (platform and shared) · 11. **Deviations** from the DD or task · 12. Risks and known limitations · 13. Unresolved **blockers** · 14. Side effects · 15. Follow-up tasks discovered · 16. **Confirmation that no unrelated scope was added** · 17. **Confirmation that the writes landed inside `TARGET_ROOT`** and not in a `.claude/worktrees/…` path.

**Do not mark the task complete if** any acceptance criterion failed · required validation
failed · a dependency is unproven · the implementation deviates from the DD without
approval · a blocker remains · the code exists only in an isolated worktree rather than
the intended repository · files outside the approved task scope were modified without
justification.

Record which standard IDs were **applied**, not merely reviewed — that trace is what the
review lane and the QA handoff rely on, so they do not have to re-derive it. The resolved
lane owns the map from area to standard file and ID root; cite only IDs that exist in it
and genuinely apply to the change. Never invent an ID, and never cite one that is merely
adjacent to the point being made.

## Red flags — STOP and report instead of proceeding

These are the platform-independent stop conditions. The resolved lane adds its own.

- A required input is missing, or a referenced document is missing, unapproved, stale, draft, or dry-run only.
- The Feature Analysis, DD, Dev Plan and Task Breakdown conflict.
- The task needs to violate or expand the DD, or change an approved API contract or business rule.
- A `depends-on` task is not verifiably complete, or a blocker or open question remains.
- The task depends on an unconfirmed backend contract.
- A UI task has no design reference of any supported type, or a recorded reference cannot be accessed.
- Completing the task requires touching files outside its approved scope.
- You are about to claim a typecheck, lint, test, build or manual check passed that you did not actually run.
- You are about to record a Tier 3 obligation as satisfied by mechanical evidence.
- A standard the resolved lane cites is missing or is a structure-only placeholder (see [§1](#1-standards-readiness-gate)).
- You are about to write to a repository-knowledge artifact owned by `ono-project-inspector`.

## Relationship with command, agent, lane, hooks

Responsibilities stay separated:

- **`commands/implement-task.md`** — task-id resolution, repository-root resolution, document-path resolution, approval/dependency/blocker gates, platform routing, the context handoff, lifecycle state, and verification of the completion report.
- **`agents/feature-implementer.md`** — the executor that runs this methodology against one resolved lane.
- **The resolved platform lane** — language and framework methodology, the standards-citation map, toolchain mechanics, and platform-only stop conditions.
- **This skill** — the platform-independent implementation methodology, and nothing a platform lane or the command already owns.
- **Hooks** — `require-approval-before-code` (approval before any code write), `block-main-branch-changes` (feature-branch enforcement), and `protect-secrets`.

This skill does not move command logic into itself, does not depend on undocumented
ambient-CWD assumptions, and does not invent paths to the feature documents — the resolved
absolute paths from [Inputs](#inputs-this-skill-requires-resolved-never-invented) are
verified before use.
