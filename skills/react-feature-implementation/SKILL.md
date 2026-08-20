---
name: react-feature-implementation
description: Methodology for implementing exactly one planned task in a React (web) codebase per org standards. Used by /implement-task via the react-feature-developer agent. Assumes no framework, router, state, or data library, and honors device_type mobile and tv.
---

# React Feature Implementation

## Overview

This skill is the methodology the `react-feature-developer` agent follows to implement **exactly one** task from an approved development workflow in a React (web) codebase. It owns *how* React work is understood, grounded in the repo, executed, validated, self-reviewed, and reported.

It is not orchestration. `/implement-task` resolves the task id, reads its `platform` and `device_type`, and routes here; the `require-approval-before-code` and `block-main-branch-changes` hooks gate code writes. This skill assumes those gates are active and focuses on doing the implementation correctly. See [Relationship with command, agent, hooks](#relationship-with-command-agent-hooks).

**This skill assumes no technology.** The bundler (Vite, webpack, CRA, esbuild, Turbopack), framework (plain SPA, Next.js Pages/App Router, Remix), language (JS/TS), router, state library, data-fetching library, and styling approach are detected, never assumed. Official React/framework documentation is supporting guidance only and never overrides a valid existing implementation. This is a separate module from React Native and never reuses `RN-*` or the bare `ARCH-*`/`API-*`/`STATE-*`/`NAV-*` IDs, nor Android's `AND-*` or iOS's `IOS-*`.

**This skill never invents repository facts.** It grounds every change in inspected evidence and writes only the selected task's code.

## Inputs this skill requires (resolved, never invented)

Obtain and **verify the existence of** these inputs first. They are passed by `/implement-task` or deterministically resolved — this skill **never guesses or fabricates a path**.

- Absolute path to the approved **Feature Analysis**, **Detailed Design (DD)**, **Dev Plan**, and **Task Breakdown**.
- The **task id** to implement, and the target **repository / package** root (the correct workspace in a monorepo).
- The confirmed **`platform`** (must be `react`) and **`device_type`** (`mobile` or `tv`), read from the task/frontmatter — never re-detected.
- The four **design-reference fields** (`design_reference_status`, `design_reference_type`, `design_reference`, `figma_link`).

If any required input is missing or cannot be resolved deterministically, **stop and report exactly which input is missing**. If `platform` is not `react`, stop. If `device_type` is missing, empty, or any value other than `mobile`/`tv` (including `mixed`), **stop and report it** — never default to `mobile`.

## 0. Standards readiness gate

This skill grounds every React-specific rule in an authored `REACT-*` standard under `standards/react/`. Before implementing, confirm those standards are authored (not placeholders). If any cited `standards/react/*` file is **missing** or is still a structure-only placeholder, **stop and report that real React implementation is blocked until it is authored**. (As of authoring, all **seven** `standards/react/*` files and the shared `A11Y-*`/`I18N-*`/`SEC-*` standards are authored: the six base standards with the `REACT-*` ID skeleton frozen (REACT-001-7), plus `react-smart-tv.md` (`REACT-TV-*`, added additively by REACT-003-1). On a `device_type: tv` task this gate covers `react-smart-tv.md` too.) See [device_type handling](#device_type-handling).

## 1. Source-of-truth hierarchy

Read the complete approved context **before editing any code**, in this order: 1. Feature Analysis → 2. Detailed Design → 3. Dev Plan → 4. Task Breakdown → 5. the specific task row.

| Document | Authoritative for |
|---|---|
| Feature Analysis | Business objective, repo findings, platform/device context, original intent |
| **Detailed Design (DD)** | **Architecture, technical approach, API contracts, state design, impacted modules, risks, every accepted decision** |
| Dev Plan | Sequencing, dependencies, rollout, rollback |
| Task Breakdown + selected task row | **Scope of the current implementation** |
| The task's acceptance criteria | **The completion contract** |

Hard rules: never implement from the original request when approved downstream documents exist (the DD supersedes it); never rely on the task row alone; never reinterpret a decision already approved in the DD; if the documents conflict, stop and report; if the task requires violating or expanding the DD, stop and request approval; if a referenced document is missing/unapproved/stale/draft/dry-run, stop; if the task is blocked or depends on unresolved open questions, do not implement it.

## 2. Task resolution & readiness checks

Resolve the task by id and read its: id, title/description, objective, `platform`, `device_type`, files expected to be touched, acceptance criteria, `depends-on`, blockers, estimated size, explicit out-of-scope items, and linked DD sections / standard IDs.

Confirm **all** before editing; if any fails, **stop and report** — do not work around it:

- [ ] The DD and Dev Plan are `approved` (real implementation, not dry-run).
- [ ] The selected task is not already complete.
- [ ] Every `depends-on` task is complete (with evidence, not assumption).
- [ ] No blocking open question remains for this task.
- [ ] The task's `platform` is `react`; `device_type` is exactly `mobile` or `tv` (never defaulted).
- [ ] The task is small enough for one implementation run (else report it should be split).
- [ ] For UI work, the required design reference exists (any supported type; Figma not required specifically). If neither `figma_link` nor `design_reference` is set, stop and ask — and if a recorded reference **cannot be read** (a dead link, an unreachable MCP server, a missing export), stop and report the exact error. Do not guess spacing/color/typography. A task that changes no user-facing UI (`design_reference_status: not_required`) needs none.
- [ ] The repository and target package are known.
- [ ] The current branch and approval hooks allow code changes (not on `main`/`master`).

## 3. Repository grounding

Inspect the actual React codebase before writing code. **Detect — do not assume** — then follow what you find (Vite/webpack/Next/Remix, client SPA/SSR/RSC, JS/TS, React Router/TanStack/framework router, Redux/Zustand/Jotai/Context, TanStack Query/RTK Query/SWR/fetch, CSS Modules/CSS-in-JS/Tailwind are never assumed):

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

## 4. Context loading before edits

Read, before editing: every file named in the task and every impacted module named in the DD (§20); the nearest analogous implementation in the repo; related components, hooks, store modules, selectors, data/API modules, routes, and their tests; shared components/utilities the DD expects to reuse; relevant API contracts and backend models; the applicable React and shared standards ([§12](#12-standards-citation)).

**Search for an existing implementation before creating any** new component, hook, store module, selector, route, data client, or utility. Prefer reusing and extending existing patterns → `REACT-ARCH-FOLDERS-*`, `REACT-FC-2`, `REACT-API-ORG-*`, `REACT-STATE-SLICE-1`.

## 5. Pre-implementation plan

Before modifying code, produce a concise plan: task objective; acceptance criteria; files expected to change; files reviewed for context; existing patterns to reuse; implementation sequence; validation strategy; risks; possible side effects; rollback considerations; applicable standard IDs. This plan does not require a second user approval when `require-approval-before-code` already governs code writes — but it must be produced before the first edit.

## 6. React implementation methodology

Apply the standards below as you write, grounded in the conventions detected in [§3](#3-repository-grounding). Every React rule cites an authored `REACT-*` ID; accessibility/i18n/security cite the shared `A11Y-*`/`I18N-*`/`SEC-*` docs.

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

## 7. Scope control & deviation rules

Implement **only** the selected task. Do not opportunistically fix unrelated issues, refactor unrelated modules, absorb another task, change approved API contracts/business rules, update the DD/plan silently, mark dependencies complete without evidence, or introduce speculative abstractions. If additional work is discovered: **stop** it, **document** the finding, **explain** whether it needs a new task / DD amendment / product or backend answer / security review / migration, and **continue** only within the selected task's approved scope. If the task cannot be completed without expanding scope, **stop and report it as blocked**.

## 8. Incremental implementation

Implement in small logical steps. After each meaningful step: inspect the diff; check imports and type/compilation risks; verify architecture/module boundaries and the server/client boundary on RSC; verify no unrelated files changed; run the narrowest useful validation where practical. Do not wait until the end to discover the package no longer builds or type-checks.

## 9. Validation methodology

Select checks based on the actual repo and affected files. Candidates: install/build with the repo's bundler; TypeScript type-check (`tsc --noEmit` or the repo's script); ESLint and the configured formatter; unit tests (Jest/Vitest); component tests (Testing Library); e2e (Playwright/Cypress) where the repo uses them; a production build for bundle/tree-shaking-sensitive changes; manual acceptance-criteria validation in the running app where practical.

Rules:

- **Do not claim a command passed unless it was actually run successfully.**
- **Do not claim the app was manually validated unless it was actually run.**
- If a required tool, environment, credential, or backend is unavailable, **state exactly what could not be validated**.
- Run the narrowest relevant validation first, then broaden.
- Distinguish new failures from pre-existing ones; do not fix unrelated pre-existing failures without approval.
- **Validate every acceptance criterion individually.**
- **For any UI change, the manual bidirectional (LTR/RTL) and screen-reader walkthroughs are validation candidates, not afterthoughts** — they are the evidence `QA-A11Y-1` needs downstream, and nothing else in the pipeline produces them. Run them where the environment allows and record the result either way.

## 10. Self-review

Before reporting completion, self-review against: task scope · DD compliance · architecture and dependency direction · server/client boundary · naming · readability · duplication · unnecessary abstractions · dead code · type safety · effect cleanup and cancellation · state placement (local/URL/global) · error handling · accessibility · localization/RTL · performance · security · PII logging · test coverage · unintended file changes · backward compatibility · rollback impact. Report any unresolved concern — do not hide it.

## 11. Completion & reporting

Produce a structured final report: 1. Task implemented · 2. Objective · 3. Files changed · 4. Summary · 5. Existing patterns reused · 6. **Acceptance-criteria checklist, one by one** · 7. Dependencies verified · 8. Validation commands run and **exact results** · 9. Tests added/updated · 10. **Applied React and shared standard IDs** · 11. Deviations from the DD/task · 12. Risks and known limitations · 13. Unresolved blockers · 14. Side effects · 15. Follow-up tasks discovered · 16. Confirmation no unrelated scope was added · 17. **`device_type` implemented against** · 18. **The manual walkthrough results the QA handoff requires** — whether the bidirectional LTR/RTL check (`I18N-TEST-1`, `I18N-TEST-2`) and the accessibility/screen-reader check (`A11Y-SR-1` (whose VoiceOver/TalkBack wording has no browser equivalent — its web reading is a walkthrough with a desktop screen reader the team uses, named in the report) were actually performed, and what they showed. State "not performed" plainly when they were not; shared `QA-A11Y-1` is satisfied by a real result, never by a generic "looks fine".

**Do not mark the task complete if** any acceptance criterion failed · required validation failed · a dependency is incomplete · the implementation deviates from the DD without approval · a blocker remains · files outside the approved task scope were modified without justification · the code exists only in an isolated worktree rather than the intended repository.

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

## 12. Standards citation

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

- A referenced document is missing, unapproved, stale, draft, or dry-run only.
- Feature Analysis, DD, Dev Plan, or task breakdown conflict.
- The task needs to violate or expand the DD, or change an approved API contract/business rule.
- A `depends-on` task is not verifiably complete, or a blocker/open question remains.
- The task depends on an unconfirmed backend contract.
- A UI task has no design reference of any supported type.
- `device_type` is absent, empty, or not exactly `mobile`/`tv`.
- Completing the task requires touching files outside its approved scope.
- You are about to claim a build/type-check/test/manual check passed that you did not actually run.
- A cited `standards/react/*` file is a placeholder (see [§0](#0-standards-readiness-gate)).

## Relationship with command, agent, hooks

- **`commands/implement-task.md`** — task selection, platform/device_type routing, approval gates, invocation.
- **`agents/react-feature-developer.md`** — the React specialist that runs this methodology.
- **This skill** — the implementation methodology itself.
- **Hooks** — `require-approval-before-code`, `block-main-branch-changes`, `protect-secrets`.

This skill does not move command logic into itself and does not invent paths to feature documents — the resolved absolute paths from [Inputs](#inputs-this-skill-requires-resolved-never-invented) are verified before use.
