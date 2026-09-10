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

Apply each area's rules to the surfaces the task actually touches. An area the task does not touch is not applicable — do not manufacture work to fill it.

### TypeScript & types

Keep `strict` mode intact and never weaken it per file; justify any `any` inline and prefer `unknown` plus narrowing; give exported functions and hooks explicit return types; fix the underlying type rather than forcing a mismatched shape past the compiler. → `RN-TS-*`.

### Components & hooks

Functional components with hooks only in new or modified code; extract reusable stateful logic into a custom hook instead of duplicating it; follow the Rules of Hooks and restructure rather than disabling the lint rule; keep side effects in effects with complete, accurate dependency arrays rather than in the render body. → `RN-FC-*`.

### Naming, files & props

One component per file with the filename matching the component; `use`-prefixed camelCase hooks; utility files named for what they export; props typed via a named `interface`/`type`, defaults supplied as default parameters, optional props marked `?`, callback props given explicit parameter and return types. → `RN-NAME-*`, `RN-PROPS-*`.

### Constants & styling

Extract values used more than once, or shared across files, into a named constant declared in a file scoped to what it configures rather than repeating inline literals; use one styling method consistently (`StyleSheet.create` or the repository's detected styling library) defined outside the render function rather than inline style objects/arrays; source colors, spacing, and typography from the repository's shared theme/tokens module rather than hardcoding them per component. → `RN-CONST-*`, `RN-STYLE-*`.

### Architecture, layering & folder placement

Keep screens thin, business logic in features, and data access in services/store; colocate a feature's screens, components, state, endpoints, and hooks under one feature folder; keep dependencies pointing downward and avoid reaching into another feature's internals; keep business rules out of components and derive computed values through memoized selectors or hooks; before adding a new component, hook, or utility, check the component inventory and shared modules for one that already covers the need, and extract logic duplicated in two or more places into a shared hook, utility, or component. → `ARCH-LAYERS-*`, `ARCH-FOLDERS-*`, `ARCH-DEPS-*`, `ARCH-LOGIC-*`, `ARCH-REUSE-*`.

### Data fetching & API layer

Follow the repository's existing endpoint organisation and place endpoints alongside the feature they serve; name endpoints for the resource and action; keep cross-cutting concerns (base URL, auth, retry) in the shared query/client layer rather than per endpoint; declare cache tags and invalidation precisely rather than blanket-invalidating; roll back optimistic updates on failure; normalise error shapes so raw transport errors do not leak into UI code, and distinguish network failures from server-returned errors. → `API-ORG-*`, `API-CACHE-*`, `API-BASEQ-*`, `API-ERR-*`.

### Shared & global state

Follow the repository's slice/store conventions; keep state fully typed; mutate state only where the state library sanctions it; read derived state through memoized selectors with stable inputs rather than recomputing in render; store record collections keyed by id rather than as arrays requiring linear scans; and keep state that only one component or screen uses local rather than defaulting it into the global store. → `STATE-SLICE-*`, `STATE-SELECT-*`, `STATE-ENTITY-*`, `STATE-BOUNDARY-*`.

### Navigation & deep links

Use the repository's detected navigation library and its typed-route mechanism; route params carry ids and primitives rather than large objects; declare deep links in the repository's established place and validate their parameters before acting on them; implement the back behaviour the DD specifies rather than accepting a default that contradicts it. → `NAV-TYPED-*`, `NAV-SERVICE-*`, `NAV-DEEPLINK-*`.

### Copy, localization & RTL

No user-visible string is hardcoded — every one goes through the repository's i18n mechanism with a key in the established namespace; format dates, numbers and currency through the locale-aware helpers rather than manual string building; use start/end (not left/right) for directional layout so RTL mirrors correctly. → `I18N-COPY-*`, `I18N-FMT-*`, `I18N-RTL-*`.

### Accessibility

Interactive elements carry an accessibility role and a meaningful label; touch targets meet the minimum size; text scales with the OS font setting rather than being pinned; focus order follows visual order and modals trap focus. Accessibility applicability for this task was decided by `commands/implement-task.md` §5b — implement what it resolved, and record anything that needs a real screen-reader run as verification debt per `standards/shared/verification.md` rather than claiming it passed. → `A11Y-ROLES-*`, `A11Y-TOUCH-*`, `A11Y-FONT-*`, `A11Y-SR-*`.

### Performance

Memoize expensive derivations and stable callbacks where re-render cost is real rather than speculative; give lists a stable `keyExtractor` and virtualize long ones; avoid blocking the JS thread with synchronous work in render or in a gesture handler; size and cache images appropriately. → `RN-PERF-RERENDER-*`, `RN-PERF-LIST-*`, `RN-PERF-JSTHREAD-*`, `RN-PERF-IMAGE-*`, `RN-PERF-BUNDLE-*`.

### Security & privacy

No secret, token or key is committed or logged; sensitive values go to the repository's secure-storage mechanism rather than plain async storage; validate anything arriving from a deep link or a WebView before acting on it; keep PII out of logs and analytics events. → `SEC-SECRETS-*`, `SEC-STORAGE-*`, `SEC-NET-*`, `SEC-AUTH-*`, `SEC-DEEPLINK-*`, `SEC-WEBVIEW-*`, `SEC-BRIDGE-*`, `SEC-PERMS-*`, `SEC-LOG-*`.

### Lint & format

The repository's configured lint and format tooling passes with no new warnings; a suppression carries a justification comment rather than silencing a real finding. → `RN-LINT-*`.

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
