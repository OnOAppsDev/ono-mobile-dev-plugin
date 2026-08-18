---
name: rn-feature-implementation
description: Methodology for implementing a planned task in a React Native codebase per org standards. Used by /implement-task via the rn-feature-developer agent.
---

# React Native Feature Implementation

## Overview

This skill is the methodology the `rn-feature-developer` agent follows to implement **exactly one** task from an approved development workflow in a React Native codebase. It owns *how* React Native work is understood, grounded in the repository, executed, validated, self-reviewed, and reported.

It is not orchestration. `/implement-task` resolves the task id, verifies the approval and readiness gates, reads the row's `platform`, and routes here; the `require-approval-before-code`, `block-main-branch-changes`, and `protect-secrets` hooks gate the writes. This skill does not re-implement any of that — it assumes those gates are active and focuses on doing the implementation correctly. See [Relationship with command, agent, hooks](#relationship-with-command-agent-hooks).

**This skill never modifies a planning document.** It reads the approved artifacts and writes application code.

## Inputs this skill requires (resolved, never invented)

`/implement-task` resolves and verifies these before invoking this skill, and passes them as authoritative. **When they are provided, use them directly** — do not re-resolve them by searching the workspace, and never guess a filename or a path:

- The absolute `TARGET_ROOT` (repository root).
- The absolute path to the approved **Feature Analysis**.
- The absolute path to the approved **Detailed Design (DD)**.
- The absolute path to the approved **Dev Plan**.
- The absolute path to the approved **Task Breakdown** — the generated feature artifact, never a plugin template under `templates/`.
- The selected **task id**.
- The selected **task-row content**.
- The **platform** (must be `react-native`).
- The **design reference** — `design_reference_status`, `design_reference_type`, `design_reference`, and `figma_link`, as recorded upstream.
- The **dependency status** resolved by the command.
- The **approval status** resolved by the command.
- The **unresolved-blocker status** resolved by the command.

The command may pass broader context than this skill consumes; take what is listed here and ignore the rest rather than inventing behavior for it.

If any listed input is missing and cannot be resolved deterministically, **stop and report exactly which input is missing** — do not proceed against an assumed location. If `platform` is not `react-native`, stop: this skill does not run for another platform. Only when the command did not pass these inputs at all may you locate the Task Breakdown yourself, and then from the resolved path — never a guessed one.

## 0. Standards readiness gate

This skill grounds every React Native rule in an authored standard under `standards/react-native/`. Before implementing, confirm the six files cited in [§12](#12-standards-citation) are authored, not structure-only placeholders. If a cited file is missing or is a placeholder, **stop and report that real React Native implementation is blocked until it is authored** — do not silently fall back to assumed defaults. (As of authoring, all six `standards/react-native/*` files and the shared `A11Y-*`/`I18N-*`/`SEC-*` standards are authored; this gate exists so the skill fails loudly if that regresses.)

## 1. Source-of-truth hierarchy

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
- If the Feature Analysis, DD, Dev Plan, and Task Breakdown **conflict**, stop and report the conflict — do not pick one silently.
- If the task requires **violating or expanding the DD**, stop and request approval.
- If a referenced document is **missing, unapproved, stale, or still marked draft/dry-run**, stop.
- If the task is marked **blocked** or depends on an unresolved open question, do not implement it.

## 2. Task resolution & readiness checks

Resolve the task by id using the task-row content the command passed, and read its: id, description, `platform`, files expected to be touched, acceptance criteria, `depends-on`, blockers, estimated size, explicit out-of-scope items, and any linked DD sections or standard IDs.

Confirm **all** of the following before editing. If any fails, **stop and report exactly what is missing** — do not work around it:

- [ ] The DD is `approved` (for real implementation, not dry-run).
- [ ] The Dev Plan is `approved`.
- [ ] The Task Breakdown is `approved`.
- [ ] The selected task is not already complete.
- [ ] Every `depends-on` task is complete — **confirmed from the dependency status the command passed, never re-derived here.** If that status is absent or inconclusive, stop and report it rather than assuming.
- [ ] No blocking open question remains for this task, per the unresolved-blocker status passed in.
- [ ] The task's `platform` is `react-native`.
- [ ] The task is small enough for one implementation run (if not, report that it should be split).
- [ ] For UI work, the required design reference exists — `figma_link` or `design_reference`, any supported type; Figma specifically is not required. If neither is set, stop and ask, and do not guess spacing, colour, or typography. A task that changes no user-facing UI (`design_reference_status: not_required`) needs none.
- [ ] The repository root and target workspace/package are known.

**Resolve the design reference before writing UI code.** For a Figma link, pull Dev Mode specs and Code Connect mappings for the relevant frame via the `figma` MCP server and implement to match. For any other recorded type, read what `design_reference` points at — the specification document, the exported mockups/screenshots, or the named existing screen/component's implementation — and implement to match that. **If the reference cannot be accessed, stop with the exact error.**

## 3. Repository grounding

Inspect the actual codebase before writing code. **Detect — do not assume** — and then follow what you find rather than imposing a default:

- Workspace layout: single package vs. monorepo, and which package this task belongs to.
- TypeScript configuration: strictness, path aliases, module resolution.
- Feature-folder structure and where an analogous feature already lives.
- The navigation library actually in use, and whether screens reach it through a navigation service.
- The state-management approach actually in use, and where slices/stores/selectors live.
- The data-fetching layer actually in use, its base query or client, and its error-normalisation convention.
- Existing reusable components, hooks, and design-system primitives this task should reuse rather than duplicate.
- The i18n setup: which library, where keys live, and the namespacing convention.
- Test setup: runner, component-testing library, and what is actually covered today.
- Lint and format configuration, and any rules the repository has deliberately disabled.

Follow the nearest analogous feature as the pattern. Reuse an existing component, hook, selector, or endpoint rather than adding a parallel one; naming a "new" component that already exists is the most common defect this step prevents.

**Where a standard's assumed library and the repository's detected library differ, that is a standards question, not an implementation decision.** Follow the approved DD, cite the IDs you actually applied, and record the divergence in the completion report — do not resolve it in code, and never migrate the repository to match a standard as a side effect of a feature.

## 4. Context loading before edits

Before the first edit, read: the DD sections the task references; the files the task row names; the nearest analogous feature; the modules directly upstream and downstream of the change; and the tests covering them. Reading is not writing — this context informs the change, and none of it is restated in the output.

## 5. Pre-implementation plan

Before modifying code, produce a concise plan containing: task objective; acceptance criteria; files expected to change; files reviewed for context; existing patterns and components to reuse; implementation sequence; validation strategy; risks; possible side effects; and the applicable standard IDs.

## 6. React Native implementation methodology

Apply each area's rules to the surfaces the task actually touches. An area the task does not touch is not applicable — do not manufacture work to fill it.

### TypeScript & types

Keep `strict` mode intact and never weaken it per file; justify any `any` inline and prefer `unknown` plus narrowing; give exported functions and hooks explicit return types; fix the underlying type rather than forcing a mismatched shape past the compiler. → `RN-TS-*`.

### Components & hooks

Functional components with hooks only in new or modified code; extract reusable stateful logic into a custom hook instead of duplicating it; follow the Rules of Hooks and restructure rather than disabling the lint rule; keep side effects in effects with complete, accurate dependency arrays rather than in the render body. → `RN-FC-*`.

### Naming, files & props

One component per file with the filename matching the component; `use`-prefixed camelCase hooks; utility files named for what they export; props typed via a named `interface`/`type`, defaults supplied as default parameters, optional props marked `?`, callback props given explicit parameter and return types. → `RN-NAME-*`, `RN-PROPS-*`.

### Architecture, layering & folder placement

Keep screens thin, business logic in features, and data access in services/store; colocate a feature's screens, components, state, endpoints, and hooks under one feature folder; keep dependencies pointing downward and avoid reaching into another feature's internals; keep business rules out of components and derive computed values through memoized selectors or hooks. → `ARCH-LAYERS-*`, `ARCH-FOLDERS-*`, `ARCH-DEPS-*`, `ARCH-LOGIC-*`.

### Data fetching & API layer

Follow the repository's existing endpoint organisation and place endpoints alongside the feature they serve; name endpoints for the resource and action; keep cross-cutting concerns (base URL, auth, retry) in the shared query/client layer rather than per endpoint; declare cache tags and invalidation precisely rather than blanket-invalidating; roll back optimistic updates on failure; normalise error shapes so raw transport errors do not leak into UI code, and distinguish network failures from server-returned errors. → `API-ORG-*`, `API-CACHE-*`, `API-BASEQ-*`, `API-ERR-*`.

### Shared & global state

Follow the repository's slice/store conventions; keep state fully typed; mutate state only where the state library sanctions it; read derived state through memoized selectors with stable inputs rather than recomputing in render; store record collections keyed by id rather than as arrays requiring linear scans; and keep state that only one component or screen uses local rather than defaulting it into the global store. → `STATE-SLICE-*`, `STATE-SELECT-*`, `STATE-ENTITY-*`, `STATE-BOUNDARY-*`.

### Navigation & deep links

Type every route's params and call navigation through the repository's navigation service rather than the library's API directly, including from non-component code such as interceptors and notification handlers; keep deep links in the documented route table, keep changes backward-compatible or versioned, and treat a new deep-link entry point as security-relevant. → `NAV-TYPED-*`, `NAV-SERVICE-*`, `NAV-DEEPLINK-*`, `SEC-DEEPLINK-*`.

### Copy, localization & RTL

No hardcoded user-facing strings — every user-visible string resolves through the repository's localization lookup, with feature-namespaced keys, parameter interpolation instead of concatenation, plural-category support instead of manual branching, and new keys added to every supported locale in the same change. Use direction-relative spacing, positioning, and text alignment, flip direction-implying icons, and format dates, numbers, and currency through locale-aware formatters. → `I18N-COPY-*`, `I18N-RTL-*`, `I18N-FMT-*`.

### Accessibility

Give every interactive element a semantic role and an action-describing label, expose state programmatically rather than through styling alone, hide decorative imagery from assistive technology, group content that should be announced as one unit, meet the platform's minimum activation target, respect OS font scaling with containers that grow with their content, and keep screen-reader focus order matching the visual reading order with modals managing focus. → `A11Y-ROLES-*`, `A11Y-TOUCH-*`, `A11Y-FONT-*`, `A11Y-SR-*`.

### Performance

Memoize where inspection or profiling shows real re-render cost rather than reflexively; stabilise callbacks and objects passed to expensive children; use a virtualized list with a correct `keyExtractor` for large or unbounded lists; keep heavy synchronous work off the JS thread; size and configure images for their display context; and call out any dependency addition that meaningfully grows the bundle. → `RN-PERF-RERENDER-*`, `RN-PERF-LIST-*`, `RN-PERF-JSTHREAD-*`, `RN-PERF-IMAGE-*`, `RN-PERF-BUNDLE-*`.

### Security & privacy

Never hardcode secrets or commit them; store tokens and sensitive values in the repository's secure storage rather than plain key-value storage; validate external input including deep-link and bridge payloads; keep transport security intact and never weaken certificate validation; harden any WebView surface the task touches; request permissions at the point of need; and never log secrets, tokens, or personal data. → `SEC-SECRETS-*`, `SEC-STORAGE-*`, `SEC-NET-*`, `SEC-DEEPLINK-*`, `SEC-WEBVIEW-*`, `SEC-BRIDGE-*`, `SEC-PERMS-*`, `SEC-LOG-*`.

### Lint & format

ESLint and Prettier both pass with zero warnings before the change is handed on; any inline disable carries a comment explaining why the rule does not apply; formatting comes from the configured formatter, with no pure-reformatting noise mixed into a functional change. → `RN-LINT-*`.

## 7. Scope control & deviation rules

- Implement **only** the selected task. Do not opportunistically fix unrelated issues, refactor unrelated modules, absorb another task, change approved API contracts or business rules, update the DD or plan silently, mark dependencies complete without evidence, or introduce speculative abstractions.

If additional work is discovered:

1. **Stop** that additional work.
2. **Document** the finding.
3. **Explain** whether it needs: a new task · a DD amendment · a product or backend answer · a security review · a migration.
4. **Continue** only with work that stays within the selected task's approved scope.

If the selected task itself cannot be completed without expanding scope, **stop and report it as blocked**.

## 8. Incremental implementation

Implement in small logical steps. After each meaningful step: inspect the diff; check imports and type errors; verify layering and feature-folder boundaries; verify no unrelated files changed; and run the narrowest useful validation where practical. Do not wait until the end to discover the project no longer typechecks.

## 9. Validation methodology

Select checks based on the actual repository and the surfaces touched. Candidates: TypeScript typecheck (`tsc --noEmit` or the repository's script); ESLint; Prettier check; unit and component tests (Jest with React Native Testing Library, or whatever the repository uses); the Metro bundle; a native build when the task touches `ios/` or `android/`; a bidirectional LTR/RTL walkthrough for UI copy changes (`I18N-TEST-*`); a screen-reader walkthrough for new or changed interactive flows (`A11Y-SR-1`); and manual acceptance-criteria validation.

Rules:

- **Do not claim a command passed unless it was actually run successfully.**
- **Do not claim the app was manually validated unless it was actually run.**
- If a required tool, simulator, device, credential, environment, or backend is unavailable, **state exactly what could not be validated**.
- Run the narrowest relevant validation first, then broaden when practical.
- Do not fix unrelated pre-existing failures unless explicitly approved; distinguish new failures from pre-existing ones.
- **Validate every acceptance criterion individually.**

## 10. Self-review

Before reporting completion, self-review against: task scope · DD compliance · layering and dependency direction · feature-folder placement · component and hook reuse · Rules of Hooks · effect dependency arrays · re-render cost · state ownership and the local/global boundary · selector memoization · error shape and handling · loading and empty states · navigation typing and back behaviour · localization coverage and RTL · accessibility roles, labels, and focus order · performance of lists and images · security and PII logging · type safety · test coverage · dead code · unintended file changes · backward compatibility.

Report any unresolved concern — do not hide it.

## 11. Completion & reporting

Produce a structured final report with:

1. Task implemented · 2. Objective · 3. **Files changed** · 4. Summary of the implementation · 5. Existing patterns and components reused · 6. **Acceptance-criteria checklist, one by one** · 7. Dependencies verified · 8. **Validation commands run and their exact results** · 9. Tests added or updated · 10. **Applied standard IDs** (React Native and shared) · 11. **Deviations** from the DD or task · 12. Risks and known limitations · 13. Unresolved **blockers** · 14. Side effects · 15. Follow-up tasks discovered · 16. **Confirmation that no unrelated scope was added** · 17. **Confirmation that the writes landed inside `TARGET_ROOT`** and not in a `.claude/worktrees/…` path.

**Do not mark the task complete if** any acceptance criterion failed · required validation failed · a dependency is unproven · the implementation deviates from the DD without approval · a blocker remains · the code exists only in an isolated worktree rather than the intended repository · files outside the approved task scope were modified without justification.

## 12. Standards citation

Record which standard IDs were **applied** (not merely reviewed) — this is the trace `rn-code-reviewer`, `rn-performance-reviewer`, and the QA handoff rely on, so they do not have to re-derive it.

| Area | Standard file | IDs |
|---|---|---|
| TypeScript, components, hooks, naming, lint | `standards/react-native/react-native-coding-standards.md` | `RN-TS-*`, `RN-FC-*`, `RN-NAME-*`, `RN-PROPS-*`, `RN-LINT-*` |
| Layering, folders, dependency direction | `standards/react-native/rn-architecture.md` | `ARCH-LAYERS-*`, `ARCH-FOLDERS-*`, `ARCH-DEPS-*`, `ARCH-LOGIC-*` |
| Data fetching & API layer | `standards/react-native/rn-api-service-layer.md` | `API-ORG-*`, `API-CACHE-*`, `API-BASEQ-*`, `API-ERR-*` |
| Shared & global state | `standards/react-native/rn-state-management.md` | `STATE-SLICE-*`, `STATE-SELECT-*`, `STATE-ENTITY-*`, `STATE-BOUNDARY-*` |
| Navigation & deep links | `standards/react-native/rn-navigation.md` | `NAV-TYPED-*`, `NAV-SERVICE-*`, `NAV-DEEPLINK-*` |
| Performance | `standards/react-native/rn-performance.md` | `RN-PERF-RERENDER-*`, `RN-PERF-LIST-*`, `RN-PERF-JSTHREAD-*`, `RN-PERF-IMAGE-*`, `RN-PERF-BUNDLE-*` |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-ROLES-*`, `A11Y-TOUCH-*`, `A11Y-FONT-*`, `A11Y-SR-*` |
| Localization & RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-COPY-*`, `I18N-RTL-*`, `I18N-FMT-*`, `I18N-TEST-*` |
| Security & privacy (shared) | `standards/shared/mobile-security.md` | `SEC-SECRETS-*`, `SEC-STORAGE-*`, `SEC-NET-*`, `SEC-AUTH-*`, `SEC-DEEPLINK-*`, `SEC-WEBVIEW-*`, `SEC-BRIDGE-*`, `SEC-PERMS-*`, `SEC-LOG-*` |

Cite only IDs that exist in these files and genuinely apply to the change. Never invent an ID, and never cite one that is merely adjacent to the point being made.

## Red flags — STOP and report instead of proceeding

- A required input is missing, or a referenced document is missing, unapproved, stale, draft, or dry-run only.
- The Feature Analysis, DD, Dev Plan, and Task Breakdown conflict.
- The task needs to violate or expand the DD, or change an approved API contract or business rule.
- A `depends-on` task is not verifiably complete, or a blocker or open question remains.
- The task depends on an unconfirmed backend contract.
- A UI task has no design reference of any supported type, or a recorded reference cannot be accessed.
- Completing the task requires touching files outside its approved scope.
- You are about to claim a typecheck, lint, test, build, or manual check passed that you did not actually run.
- A cited `standards/react-native/*` file is missing or is a structure-only placeholder (see [§0](#0-standards-readiness-gate)).

## Relationship with command, agent, hooks

Responsibilities stay separated:

- **`commands/implement-task.md`** — task-id resolution, repository-root resolution, document-path resolution, approval/dependency/blocker gates, platform routing, the context handoff, and verification of the completion report.
- **`agents/rn-feature-developer.md`** — the React Native specialist and executor that runs this methodology.
- **This skill** — the implementation methodology itself.
- **Hooks** — `require-approval-before-code` (approval before any code write), `block-main-branch-changes` (feature-branch enforcement), and `protect-secrets`.

This skill does not move command logic into itself, does not depend on undocumented ambient-CWD assumptions, and does not invent paths to the feature documents — the resolved absolute paths from [Inputs](#inputs-this-skill-requires-resolved-never-invented) are verified before use.
