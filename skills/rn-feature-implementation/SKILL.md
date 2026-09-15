---
name: rn-feature-implementation
description: React Native-specific implementation methodology — the repository dimensions to inspect, the per-area coding guidance, the validation tooling, and the RN standards-citation map. Used by /implement-task via the rn-feature-developer agent, alongside the shared platform-implementation skill, which owns the lifecycle mechanics.
---

# React Native Feature Implementation

## Overview

This skill is the **React Native half** of implementing one task. It owns what a
platform-independent layer could not state: which dimensions of a React Native repository
to inspect, how React Native code is actually written here, which tools validate it, and
which `RN-*` and shared standard IDs may be cited.

The workflow half — inputs, the source-of-truth hierarchy, readiness checks, scope
control, incremental implementation, the validation rules, self-review and the completion
report — lives in **`skills/platform-implementation/SKILL.md`** and is not restated here.
Apply both: that skill for *how the task is run*, this one for *how React Native is
written*.

**It is not orchestration.** `/implement-task` resolves the task id, verifies the approval
and readiness gates, reads the row's `platform`, routes here, and records lifecycle state;
the write hooks gate every edit. This skill does not move command logic into itself.

**This skill never modifies a planning document.** It reads approved artifacts and writes
application code.

**React Native is mobile-only in this lane.**

## Standards readiness

Every rule this skill applies is grounded in an authored standard under
`standards/react-native/`. Before implementing, confirm the six files cited in
[Standards citation](#standards-citation) are authored rather than structure-only
placeholders. If a cited file is missing or is a placeholder, **stop and report that real
React Native implementation is blocked until it is authored** — do not fall back to
assumed defaults. (All six, and the shared `A11Y-*`/`I18N-*`/`SEC-*` standards, are
authored today; this gate exists so the skill fails loudly if that regresses.)

## Repository dimensions to inspect

The shared skill owns the grounding discipline — detect rather than assume, follow the
nearest analogous feature, reuse before creating. These are the React Native dimensions
that discipline is applied to:

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

## React Native implementation methodology

Apply each area's authored rules to the surfaces the task actually touches; an area the
task does not touch is not applicable. The rules themselves live in the standards below —
read them there rather than from a summary, which is how the severity markers and exact
formats survive.

| Area | Rules |
|---|---|
| TypeScript & types | `RN-TS-*` |
| Components & hooks | `RN-FC-*` |
| Naming, files & props | `RN-NAME-*`, `RN-PROPS-*` |
| Constants & styling | `RN-CONST-*`, `RN-STYLE-*` |
| Architecture, layering & folder placement | `ARCH-LAYERS-*`, `ARCH-FOLDERS-*`, `ARCH-DEPS-*`, `ARCH-LOGIC-*`, `ARCH-REUSE-*` |
| Data fetching & API layer | `API-ORG-*`, `API-CACHE-*`, `API-BASEQ-*`, `API-ERR-*` |
| Shared & global state | `STATE-SLICE-*`, `STATE-SELECT-*`, `STATE-ENTITY-*`, `STATE-BOUNDARY-*` |
| Navigation & deep links | `NAV-TYPED-*`, `NAV-SERVICE-*`, `NAV-DEEPLINK-*` |
| Copy, localization & RTL | `I18N-COPY-*`, `I18N-FMT-*`, `I18N-RTL-*` |
| Accessibility | `A11Y-ROLES-*`, `A11Y-TOUCH-*`, `A11Y-FONT-*`, `A11Y-SR-*`, `RN-A11Y-1`, `RN-A11Y-11` |
| Performance | `RN-PERF-RERENDER-*`, `RN-PERF-LIST-*`, `RN-PERF-JSTHREAD-*`, `RN-PERF-IMAGE-*`, `RN-PERF-BUNDLE-*` |
| Security & privacy | `SEC-SECRETS-*`, `SEC-STORAGE-*`, `SEC-NET-*`, `SEC-AUTH-*`, `SEC-DEEPLINK-*`, `SEC-WEBVIEW-*`, `SEC-BRIDGE-*`, `SEC-PERMS-*`, `SEC-LOG-*` |
| Lint & format | `RN-LINT-*` |

Apply those shared requirements through the React Native rules that implement them (`RN-A11Y-1`..`RN-A11Y-11` in `standards/react-native/rn-coding-standards.md`). Several RN accessibility props are single-platform — `accessibilityElementsHidden` and `accessibilityViewIsModal` are iOS-only, `importantForAccessibility` and `accessibilityLiveRegion` are Android-only — so a requirement met with only one of a pair is silently unmet on the other platform. Cover focus placement on screen entry, modal focus restoration to the invoking control, item position in lists (RN exposes no collection-semantics API, so position that is not stated is not announced), deriving item accessibility props from item data so a recycled row cannot inherit a stale label, and suspending timer-driven advancement while a screen reader is active.

**Verification reach.** `standards/shared/verification.md` owns the tier vocabulary — do not restate it. Typecheck, lint and any accessibility assertions the repository's existing test setup supports are Tier 1 and gate the task; a VoiceOver or TalkBack walkthrough is Tier 3 and is recorded as `verificationDebt`, never as a passed check. Do not assume a particular automation framework.
## Validation tooling

The shared skill owns the validation *rules* — never claim an unrun command passed, state
exactly what could not be validated, validate every acceptance criterion individually.
These are the React Native candidates those rules apply to, selected by what the task
actually touched:

TypeScript typecheck (`tsc --noEmit` or the repository's script); ESLint; Prettier check;
unit and component tests (Jest with React Native Testing Library, or whatever the
repository uses); the Metro bundle; a native build when the task touches `ios/` or
`android/`; a bidirectional LTR/RTL walkthrough for UI copy changes (`I18N-TEST-*`); a
screen-reader walkthrough for new or changed interactive flows (`A11Y-SR-1`); and manual
acceptance-criteria validation.

## React Native review points

Added to the shared self-review list: Rules of Hooks · effect dependency arrays ·
re-render cost · selector memoization · navigation typing and back behaviour · list and
image performance.

## Standards citation

Record which standard IDs were **applied** (not merely reviewed) — this is the trace `rn-code-reviewer`, `rn-performance-reviewer`, and the QA handoff rely on, so they do not have to re-derive it.

| Area | Standard file | IDs |
|---|---|---|
| TypeScript, components, hooks, naming, constants, styling, lint | `standards/react-native/rn-coding-standards.md` | `RN-TS-*`, `RN-FC-*`, `RN-NAME-*`, `RN-PROPS-*`, `RN-CONST-*`, `RN-STYLE-*`, `RN-LINT-*` |
| Layering, folders, dependency direction, reuse | `standards/react-native/rn-architecture.md` | `ARCH-LAYERS-*`, `ARCH-FOLDERS-*`, `ARCH-DEPS-*`, `ARCH-LOGIC-*`, `ARCH-REUSE-*` |
| Data fetching & API layer | `standards/react-native/rn-api-service-layer.md` | `API-ORG-*`, `API-CACHE-*`, `API-BASEQ-*`, `API-ERR-*` |
| Shared & global state | `standards/react-native/rn-state-management.md` | `STATE-SLICE-*`, `STATE-SELECT-*`, `STATE-ENTITY-*`, `STATE-BOUNDARY-*` |
| Navigation & deep links | `standards/react-native/rn-navigation.md` | `NAV-TYPED-*`, `NAV-SERVICE-*`, `NAV-DEEPLINK-*` |
| Performance | `standards/react-native/rn-performance.md` | `RN-PERF-RERENDER-*`, `RN-PERF-LIST-*`, `RN-PERF-JSTHREAD-*`, `RN-PERF-IMAGE-*`, `RN-PERF-BUNDLE-*` |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-ROLES-*`, `A11Y-TOUCH-*`, `A11Y-FONT-*`, `A11Y-SR-*` |
| Localization & RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-COPY-*`, `I18N-RTL-*`, `I18N-FMT-*`, `I18N-TEST-*` |
| Security & privacy (shared) | `standards/shared/mobile-security.md` | `SEC-SECRETS-*`, `SEC-STORAGE-*`, `SEC-NET-*`, `SEC-AUTH-*`, `SEC-DEEPLINK-*`, `SEC-WEBVIEW-*`, `SEC-BRIDGE-*`, `SEC-PERMS-*`, `SEC-LOG-*` |

Cite only IDs that exist in these files and genuinely apply to the change. Never invent an ID, and never cite one that is merely adjacent to the point being made.

## Red flags — STOP and report instead of proceeding

These are the React Native-specific conditions. The platform-independent stop conditions belong to `skills/platform-implementation/SKILL.md` and are not repeated here.

- A cited `standards/react-native/*` file is missing or is a structure-only placeholder (see [Standards readiness](#standards-readiness)).
- The repository's navigation, state-management, or data-fetching library cannot be determined, and the task must integrate with it.
- The repository has two competing libraries in active use for a layer this task touches, with no discernible primary.
- The task requires touching a native module or custom native view and the architecture mode (New vs. Legacy) cannot be established.
- A standard assumes a library the repository does not use, and following the standard would mean migrating the repository.

## Relationship with command, agent, hooks

Responsibilities stay separated:

- **`commands/implement-task.md`** — task-id resolution, repository-root resolution, document-path resolution, approval/dependency/blocker gates, platform routing, the context handoff, lifecycle state, and verification of the completion report.
- **`skills/platform-implementation/SKILL.md`** — the platform-independent implementation methodology: inputs, source-of-truth hierarchy, readiness checks, grounding discipline, scope control, incremental implementation, validation rules, self-review, and the completion report.
- **`agents/rn-feature-developer.md`** — the React Native specialist and executor that runs both.
- **This skill** — the React Native implementation methodology itself, and nothing a platform-independent layer could state.
- **Hooks** — `require-approval-before-code` (approval before any code write), `block-main-branch-changes` (feature-branch enforcement), and `protect-secrets`.

This skill does not move command logic into itself, does not depend on undocumented ambient-CWD assumptions, and does not invent paths to the feature documents — the resolved absolute paths the command passes are verified before use.
