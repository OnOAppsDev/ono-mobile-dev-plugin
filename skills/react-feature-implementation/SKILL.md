---
name: react-feature-implementation
description: React (web)-specific implementation methodology — the repository dimensions to inspect, the per-area coding guidance, device_type handling, the validation tooling, and the REACT-* standards-citation map. Used by /implement-task via the react-feature-developer agent, alongside the shared platform-implementation skill, which owns the lifecycle mechanics.
---

# React Feature Implementation

## Overview

This skill is the **React half** of implementing one task. It owns what a
platform-independent layer could not state: which dimensions of a React repository to
inspect, how React code is actually written here, which tools validate it, and which
`REACT-*` and shared standard IDs may be cited.

The workflow half — inputs, the source-of-truth hierarchy, readiness checks, scope
control, incremental implementation, the validation rules, self-review and the completion
report — lives in **`skills/platform-implementation/SKILL.md`** and is not restated here.
Apply both: that skill for *how the task is run*, this one for *how React is written*.

**It is not orchestration.** `/implement-task` resolves the task id, verifies the approval
and readiness gates, reads the row's `platform`, routes here, and records lifecycle state;
the write hooks gate every edit. This skill does not move command logic into itself.

**This skill never modifies a planning document.** It reads approved artifacts and writes
application code.

## Standards readiness

Every rule this skill applies is grounded in an authored standard under
`standards/react/`. Before implementing, confirm the seven files cited in
[Standards citation](#standards-citation) are authored rather than structure-only
placeholders. If a cited file is missing or is a placeholder, **stop and report that real
React implementation is blocked until it is authored** — do not fall back to assumed
defaults.

## Repository dimensions to inspect

The shared skill owns the grounding discipline — detect rather than assume, follow the
nearest analogous feature, reuse before creating. These are the React dimensions that
discipline is applied to:

- Build tooling and scripts; framework and rendering model (client SPA / SSR / RSC — and which router on Next), identified **per surface, not once for the whole repository** (see `skills/react-dev-planning/SKILL.md#5-rendering-model-identification`); a hybrid repo has more than one answer.
- Language level (JS vs TS; `strict` via the `tsconfig` `extends` chain).
- Routing mechanism and how params/query are read.
- State management library and the local/URL/global convention.
- Data-fetching library, base client, auth transport (cookie vs. token-in-JS), caching, error normalization.
- Component and hooks conventions; styling approach; forms/validation library.
- Testing setup (Jest/Vitest, Testing Library, Playwright/Cypress); lint/format/type-check config.
- Analytics, logging, feature flags, i18n framework, error reporting.
- Monorepo layout and which package the task lives in.

Apply the React detection traps from `skills/react-dev-planning/SKILL.md#4-react-detection-traps` (build tool from scripts not a stray config; `tsconfig` strict via `extends`; dependency-present ≠ used; App vs Pages Router; the `'use client'` boundary; env inlining; monorepo hoisting; version skew; test runner) so a confident-but-wrong reading of one file does not misdirect the implementation.

## React implementation methodology

Apply the standards below as you write, grounded in the conventions detected in [Repository dimensions to inspect](#repository-dimensions-to-inspect). Every React rule cites an authored `REACT-*` ID; accessibility/i18n/security cite the shared `A11Y-*`/`I18N-*`/`SEC-*` docs.

### TypeScript & language safety
In a TS repo, keep `strict` intact, no `any` without a justifying comment, explicit return types across module boundaries, no `as` casts that force a mismatched shape. → `REACT-TS-1`, `REACT-TS-2`, `REACT-TS-3`, `REACT-TS-4`.

### Components & hooks
Function components + hooks only (a class only where a genuine constraint like an error boundary requires it); extract reusable stateful logic into a custom hook; follow the Rules of Hooks and never disable the hooks lint to work around a violation; keep side effects in effects with complete dependency arrays; return cleanup for every listener/timer/subscription/observer; make effect data-fetching cancellable (`AbortController`); write effects to tolerate StrictMode double-invocation. → `REACT-FC-1`..`REACT-FC-7`.

### Naming & file conventions
PascalCase components matching file names; `use`-prefixed camelCase hooks; one component per file; utility files named for what they export; follow the repo's styling-file convention; on an RSC surface, place the `'use client'`/`'use server'` directive correctly. → `REACT-NAME-1`..`REACT-NAME-6`.

### Prop typing
Named `interface`/`type` props; default parameters not `defaultProps`; optional props marked `?`; explicitly-typed callback props; derive intrinsic-element props from React's helper types and forward native/`aria-*`/`data-*` attributes. → `REACT-PROPS-1`..`REACT-PROPS-5`.

### Architecture & dependency direction
Preserve existing layers (pages/routes → features → services/store) and feature-folder placement; keep dependencies pointing downward; keep business logic out of components; on an RSC surface, respect the server/client boundary (data fetching server-side, interactivity behind `'use client'`, no server-only import in a client module, no secret in client code). → `REACT-ARCH-LAYERS-*`, `REACT-ARCH-FOLDERS-*`, `REACT-ARCH-DEPS-*`, `REACT-ARCH-LOGIC-*`, `REACT-ARCH-BOUNDARY-1`, `REACT-ARCH-BOUNDARY-2`, `REACT-ARCH-BOUNDARY-3`.

### State management
Follow the detected library; place each piece of state deliberately — local for single-component, the URL for shareable/bookmarkable state, the global store only when shared across routes and not URL-appropriate; typed store modules mutated only through the sanctioned path; derived state via memoized selectors with stable inputs; normalized collections; never persist tokens to script-readable storage. → `REACT-STATE-SLICE-*`, `REACT-STATE-SELECT-*`, `REACT-STATE-ENTITY-*`, `REACT-STATE-BOUNDARY-*`, `REACT-STATE-PERSIST-1`, `REACT-STATE-PERSIST-2`, `SEC-COOKIE-2`, `SEC-STORAGE-3`.

### Routing
Use the detected router — never a second, parallel one; read typed params from the URL; keep URLs stable/backward-compatible; validate redirect targets taken from user input; on a server-rendering surface keep routing hydration-safe and redirects server-side; use link semantics, scroll restoration, and Back/Forward correctly. → `REACT-ROUTE-URL-*`, `REACT-ROUTE-STABILITY-*`, `REACT-ROUTE-SECURITY-1`, `REACT-ROUTE-SECURITY-2`, `REACT-ROUTE-SSR-*`, `REACT-ROUTE-UX-*`, `REACT-ROUTE-SERVICE-*`, `SEC-WEB-5`, `SEC-WEB-3`.

### Data & API layer
Use the repo's data-fetching library and shared base client; follow approved DD contracts exactly and never invent endpoints/fields/shapes; carry auth per the repo's transport (prefer `httpOnly` cookies + `credentials:'include'`, never tokens in script-readable storage, CSRF on state-changing requests — **on `device_type: tv` follow the transport the DD established per `REACT-TV-API-1`/`-2` rather than defaulting to the cookie preference, and never fall back to `localStorage` because cookies do not work on the target**); treat CORS as a read boundary, not authorization; never inline a secret into the client bundle; cache precisely and normalize error shapes; cancel in-flight requests on unmount/supersede; on SSR/RSC fetch server-side and hydrate the cache. **If the task depends on an unconfirmed backend contract, stop.** → `REACT-API-ORG-*`, `REACT-API-CACHE-*`, `REACT-API-BASEQ-*`, `REACT-API-ASYNC-1`, `REACT-API-SSR-*`, `REACT-API-ERR-*`, `SEC-COOKIE-1`, `SEC-COOKIE-2`, `SEC-WEB-3`, `SEC-WEB-6`, `SEC-SECRETS-2`, `SEC-LOG-1`.

### Performance
Avoid unnecessary re-renders and unstable props; virtualize large lists; keep heavy work off the main thread; size images and reserve layout space; code-split and preserve tree-shaking; minimize hydration cost; load third-party scripts without blocking; hold Core Web Vitals as targets. Do not assert a magnitude improvement you did not measure. → `REACT-PERF-RERENDER-*`, `REACT-PERF-LIST-1`, `REACT-PERF-MAINTHREAD-1`, `REACT-PERF-IMAGE-*`, `REACT-PERF-BUNDLE-*`, `REACT-PERF-HYDRATION-1`, `REACT-PERF-THIRDPARTY-1`, `REACT-PERF-CWV-1`, `SEC-WEB-4`.

### Accessibility, i18n & RTL
Roles/labels for non-text controls, screen-reader support and logical focus order, font scaling, activation targets (on TV, a reliably focusable element with a visible focus state satisfies `A11Y-TOUCH-1`); no hardcoded user-visible strings, correct formatting, RTL layout and mirroring. → `A11Y-ROLES-*`, `A11Y-SR-*`, `A11Y-FONT-*`, `A11Y-TOUCH-1`, `A11Y-TOUCH-2`, `I18N-COPY-1`, `I18N-FMT-*`, `I18N-RTL-*`.

### Security & privacy
Apply the shared web security rules as you write — safe HTML rendering / no XSS, CSP-compatible code, CSRF on state-changing requests, no open redirects, no secret inlined into the bundle, no tokens/PII in logs. **Security is applied here but owned by the shared `mobile-security-reviewer` at review time — do not treat a self-check as the security review.** → `SEC-WEB-1`, `SEC-WEB-2`, `SEC-WEB-3`, `SEC-WEB-4`, `SEC-WEB-5`, `SEC-COOKIE-1`, `SEC-COOKIE-2`, `SEC-SECRETS-2`, `SEC-LOG-1`.

### Error handling, analytics & logging
Implement the exact loading/empty/error/retry states the DD defines; never silently swallow an error or expose a raw backend error to users; distinguish a deliberate abort from a failure; reuse existing analytics conventions and add only the events the DD requires; keep debug logging gated and never log PII. → `REACT-API-ERR-1`, `REACT-API-ERR-2`, `REACT-API-ERR-3`, `SEC-LOG-1`.

## `device_type` handling

`device_type` is inherited context — resolved once at `/analyze-feature` and carried in frontmatter. **Read and honor it; never re-detect it, never default to `mobile`, never treat `tv` as a separate platform.**

- **`mobile`** — pointer/touch interaction and responsive-web patterns apply.
- **`tv`** — implement within the repo's **existing** Smart TV model (Tizen/webOS/browser-TV) as identified during planning, and apply `standards/react/react-smart-tv.md`'s `REACT-TV-*` rules **in addition to** the base `REACT-*` and shared rules, which all still apply on a TV surface. Do not carry pointer/touch assumptions (hover, tap/swipe, pointer-scroll) into a D-pad/remote model (`REACT-TV-INPUT-6`). The rules most often reached for while writing TV code:
  - **Focus is the cursor.** One element focused at all times, never dropped to `document.body` after a transition or list refresh (`REACT-TV-FOCUS-1`); focus restored on return rather than reset (`REACT-TV-FOCUS-4`); a visible focus indicator legible across a room, and never `outline: none` without an equally visible replacement (`REACT-TV-FOCUS-3` — the TV reading of `A11Y-TOUCH-1`/`A11Y-TOUCH-2`).
  - **Use the repo's existing focus model; never add a second one** (`REACT-TV-FOCUS-2`).
  - **No numeric key-code literals in components** — one central, platform-aware key map (`REACT-TV-INPUT-1`, `REACT-TV-INPUT-2`), key handling scoped to the focused subtree rather than a per-component `window` listener (`REACT-TV-INPUT-3`), and every listener cleaned up (`REACT-FC-5`).
  - **Release memory on navigating away** — assets, caches, detached DOM, and any player instance (`REACT-TV-PERF-2`, `REACT-TV-MEDIA-3`). On a memory-capped TV runtime a retained reference terminates the app rather than slowing it.
  - **Capture state before suspension, not on resume** (`REACT-TV-LIFECYCLE-2`), and treat a relaunch/launch payload as untrusted input (`REACT-TV-LIFECYCLE-3`).
  - **Follow the DD's established auth transport** (`REACT-TV-API-1`, `REACT-TV-API-2`) — the browser cookie preference is conditional on a TV target, and `localStorage` is never the fallback.
  - **Suppress the platform screensaver during playback and restore it on pause/stop**, with the restore as a cleanup obligation (`REACT-TV-MEDIA-7`, `REACT-FC-5`).
  - **Handle the platform IME** — focus restored after dismissal, layout surviving the viewport change (`REACT-TV-INPUT-8`) — and, where the platform has a cursor mode, handle 5-way ↔ cursor transitions (`REACT-TV-INPUT-7`).

## Validation tooling

The shared skill owns the validation *rules* — never claim an unrun command passed,
state exactly what could not be validated, validate every acceptance criterion
individually. These are the React candidates those rules apply to, selected by what the
task actually touched:

Select checks based on the actual repo and affected files. Candidates: install/build with the repo's bundler; TypeScript type-check (`tsc --noEmit` or the repo's script); ESLint and the configured formatter; unit tests (Jest/Vitest); component tests (Testing Library); e2e (Playwright/Cypress) where the repo uses them; a production build for bundle/tree-shaking-sensitive changes; manual acceptance-criteria validation in the running app where practical.

## React review points

Added to the shared self-review list: server/client boundary · effect cleanup and cancellation · state placement (local/URL/global) · rollback impact.

## Standards citation

Record which standard IDs were **applied** (not merely reviewed) — this is the trace `react-code-reviewer`, `react-performance-reviewer`, and QA handoff rely on.

| Area | Standard file | IDs |
|---|---|---|
| TypeScript, components, hooks, naming, props, lint | `standards/react/react-coding-standards.md` | `REACT-TS-*`, `REACT-FC-*`, `REACT-NAME-*`, `REACT-PROPS-*`, `REACT-LINT-*` |
| Architecture, layers, server/client boundary | `standards/react/react-architecture.md` | `REACT-ARCH-*` |
| Routing | `standards/react/react-routing.md` | `REACT-ROUTE-*` |
| State management | `standards/react/react-state-management.md` | `REACT-STATE-*` |
| API / data layer | `standards/react/react-api-service-layer.md` | `REACT-API-*` |
| Performance | `standards/react/react-performance.md` | `REACT-PERF-*` |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-*` |
| Localization & RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-*` |
| Security & privacy (shared) | `standards/shared/mobile-security.md` | `SEC-*` (incl. `SEC-WEB-*`, `SEC-COOKIE-*`) |
| Smart TV (`device_type: tv` only) | `standards/react/react-smart-tv.md` | `REACT-TV-FOCUS-*`, `REACT-TV-INPUT-*`, `REACT-TV-UI-*`, `REACT-TV-MEDIA-*`, `REACT-TV-LIFECYCLE-*`, `REACT-TV-API-*`, `REACT-TV-PERF-*`, `REACT-TV-PKG-*` |

Do not use React Native's `RN-*` or the bare `ARCH-*`/`API-*`/`STATE-*`/`NAV-*` IDs for React, and do not use Android's `AND-*` or iOS's `IOS-*` — React cites the `REACT-*` roots. The Smart TV row applies **only** when `device_type: tv`, and then in addition to every row above, never instead of them.

## Red flags — STOP and report instead of proceeding

These are the React-specific conditions. The platform-independent stop conditions belong
to `skills/platform-implementation/SKILL.md` and are not repeated here.

- A cited `standards/react/*` file is missing or is a structure-only placeholder (see [Standards readiness](#standards-readiness)).
- `device_type` is absent, empty, or not exactly `mobile`/`tv`.
- The rendering model (CSR / SSR / RSC) cannot be determined, and the task depends on it.
- Two competing routing or state libraries are in active use, with no discernible primary.

## Relationship with command, agent, hooks

Responsibilities stay separated:

- **`commands/implement-task.md`** — task-id resolution, repository-root resolution, document-path resolution, approval/dependency/blocker gates, platform routing, the context handoff, lifecycle state, and verification of the completion report.
- **`skills/platform-implementation/SKILL.md`** — the platform-independent implementation methodology.
- **`agents/react-feature-developer.md`** — the React specialist and executor that runs both.
- **This skill** — the React implementation methodology itself, and nothing a platform-independent layer could state.
- **Hooks** — `require-approval-before-code`, `block-main-branch-changes`, and `protect-secrets`.

This skill does not move command logic into itself, does not depend on undocumented
ambient-CWD assumptions, and does not invent paths to the feature documents.
