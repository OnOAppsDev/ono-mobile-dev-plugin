---
name: react-dev-planning
description: React (web)-specific planning methodology — the repository evidence dimensions to inspect, the vocabulary a Detailed Design's approach and change surface are written in, React (web) detection traps, device_type handling and the REACT-* citation map. Used by /analyze-feature, /dev-design-start and /dev-feature-start via the react-architect agent, alongside the shared platform-planning skill which owns the planning methodology.
---

# React (web) Dev Planning

## Overview

This skill is the **React (web) half** of planning a feature. It owns what a
platform-independent layer could not state: which dimensions of a React (web) repository must be
inspected, the vocabulary the approach and change surface are written in, this platform's
detection traps and device-type handling, and which `REACT-*` and shared standard IDs may be
cited.

The methodology half — the confirmed-context rule, standards readiness, repository-knowledge
resolution, evidence discipline and its labelling vocabulary, reuse-before-new,
detected-conventions-govern, output discipline and the generic stop conditions — lives in
**`skills/platform-planning/SKILL.md`** and is not restated here. The DD's own section
rules, the statement classification, the risk taxonomy and the source-of-truth hierarchy
belong to **`skills/dev-design-start/SKILL.md`**. Apply all three.

**This skill assumes no technology.** Everything this lane names is a *possible finding*,
never a default. What the repository already does is the source of truth.

**This skill plans. It never writes code and never modifies repository files.**

## 3. Repository evidence collection

Inspect the actual codebase before proposing anything. **Detect — do not assume.** `repo-analyst` supplies only lightweight React existence checks, so this sweep is this skill's own responsibility (see [What this skill must not expect from `repo-analyst`](#what-this-skill-must-not-expect-from-repo-analyst)). Read [§4](#4-react-detection-traps) *before* trusting any single-file signal below.

Collect evidence for each dimension, recording the path that proves it:

1. **Build tooling** — the bundler/dev server actually in use (Vite, webpack, CRA/`react-scripts`, esbuild, Turbopack) and its config; scripts in `package.json`.
2. **Framework & rendering target** — plain client SPA, Next.js (and which router — Pages or App/RSC), Remix, or another meta-framework; SSR/SSG/RSC presence. See [§5](#5-rendering-model-identification).
3. **Language level** — JavaScript vs. TypeScript, and if TS, whether `strict` is actually in effect (read `tsconfig` `compilerOptions.strict` **and** the `extends` chain — see [§4](#4-react-detection-traps)).
4. **Routing** — React Router, TanStack Router, the framework's file-based router, or a custom solution; how params and query state are read.
5. **State management** — Redux Toolkit, Zustand, Jotai, Recoil, MobX, Context + `useReducer`, or a mix; where global vs. local vs. URL state lives today.
6. **Data-fetching / server-state** — TanStack Query, RTK Query, SWR, a bare `fetch`/`axios` wrapper; the base client, auth transport, caching, and error-normalization conventions.
7. **Component & hooks model** — function components + hooks, any remaining class components, custom-hook conventions, and project-specific component abstractions.
8. **Styling approach** — CSS Modules, CSS-in-JS (styled-components/Emotion), Tailwind or another utility system, plain/global CSS, or a design-system library.
9. **Forms & validation** — the form library (React Hook Form, Formik, uncontrolled, custom) and validation approach, where the feature touches forms.
10. **Auth & session** — how the app authenticates and carries session (cookie-based vs. token-in-JS), and where that is enforced.
11. **Testing tools and coverage** — runner (Jest, Vitest), Testing Library, Playwright/Cypress for e2e, and what is actually covered today.
12. **Reusable components** — existing pages/views, shared components, shared hooks, and utilities the feature should reuse.
13. **Existing feature boundaries** — how features are packaged, where a new one would sit, and what the nearest analogous feature looks like.
14. **Relevant integrations** — analytics, logging, feature flags, remote config, i18n framework, error reporting, media, and any SDKs the feature touches.
15. **Monorepo layout** — workspace tooling (Nx, Turborepo, Yarn/PNPM workspaces), which package this feature lives in, and how dependencies hoist.
16. **Environment and config supply** — the `.env*` files in play, the framework's public prefix (`NEXT_PUBLIC_`/`VITE_`) and therefore which values reach the browser, and where base URLs, feature flags, and tenant/tier identifiers are injected. This is the load-bearing fact for `REACT-API-BASEQ-6`/`SEC-SECRETS-2` (nothing secret inlined into the bundle) and for the env-inlining trap in [§4](#4-react-detection-traps).

**Label every finding** `[evidence: <path>]`, `[reused: <path>#<anchor>]`, `[inference]`, or `[unknown]`. An unlabelled repository claim is a defect. Prefer `[unknown]` over a guess.

### What this skill must not expect from `repo-analyst`

`repo-analyst` performs **lightweight existence checks only** for React (a `react`/`react-dom` dependency without `react-native`, plus a web bundler/framework marker). Its Stack Detection section is a starting signal, **not** the evidence base for a design. Its Standards Conformance section compares folder structure against React Native's `ARCH-LAYERS-*`/`ARCH-FOLDERS-*` expectations, which are RN-specific and **do not apply to React (web)** — React has its own `REACT-ARCH-*`. Therefore this skill runs its own React inspection (this section) and its own structural comparison against `REACT-ARCH-LAYERS-*`/`REACT-ARCH-FOLDERS-*`. Never present `repo-analyst`'s React Native conformance verdict as a React finding.

## 4. React Detection traps

An Xcode-style hazard applies to React repos too: the confident-but-wrong reading of a single file. For each trap, prefer the authoritative signal and mark `[unknown]` rather than guess. **Each trap names the wrong finding it prevents.**

- **Build tool inferred from one config file.** A repo may carry a stale `webpack.config.js` while actually building with Vite. Confirm from the `package.json` scripts and the installed dev dependency, not a lone config file. *Prevents:* "this is a webpack app" when it ships on Vite.
- **TypeScript present ≠ strict.** A `tsconfig.json` existing does not mean `strict` is on; it may be set in a base config the project `extends`, or disabled per-file. Read `compilerOptions.strict` through the full `extends` chain. *Prevents:* citing `REACT-TS-1` as satisfied (or violated) from the presence of a `tsconfig` alone.
- **A dependency in `package.json` ≠ used.** A library can be installed but unused, or present only transitively. Confirm real imports before treating it as the repo's convention. *Prevents:* "the app uses Redux" because `@reduxjs/toolkit` is in `dependencies`.
- **Next.js App Router vs. Pages Router coexisting.** A repo may run both `app/` and `pages/` during a migration; the feature's surface decides which applies. *Prevents:* planning an App Router server component into a Pages Router screen (or vice versa).
- **`'use client'` / `'use server'` boundary invisibility.** In an RSC tree a file is a server component unless marked `'use client'`; the boundary is not obvious from the component body. Read the directive and the import tree. *Prevents:* "this can use hooks" on a server component, or leaking a server-only import into client code.
- **Environment inlining.** Only build-time env vars with the framework's public prefix (`NEXT_PUBLIC_`, `VITE_`) reach the browser, across possibly several `.env*` files; an unprefixed var is server-only. *Prevents:* assuming a value is available client-side, or treating a bundler-inlined constant as a secret (`SEC-SECRETS-2`).
- **`type: module` vs. CommonJS interop.** A package's module system affects how config and tooling load; ESM/CJS interop errors are misread as code bugs. *Prevents:* misattributing a module-resolution failure to the feature.
- **Monorepo hoisting.** A dependency may resolve from a hoisted root `node_modules`, not the package's own; version and presence differ from what the local `package.json` implies. *Prevents:* a version/resolution claim that is wrong for the actual workspace.
- **Peer-dependency / version skew.** The installed React (and router/state-lib) major version determines which APIs and behaviors apply (e.g. StrictMode double-invoke, `defaultProps` on function components). Confirm the version. *Prevents:* citing a version-specific behavior that does not apply.
- **Test runner discovered per config.** Jest vs. Vitest (and the e2e tool) is read from config and scripts, not assumed. *Prevents:* planning tests against a framework the repo does not run.

## 5. Rendering-model identification

Identify the model **per surface**, not per repository — a repo may legitimately mix them. Recognize these outcomes, none privileged:

| Model | Evidence to look for | Standards that apply |
|---|---|---|
| **Client-rendered SPA** | Vite/CRA, a client router, no server render | `REACT-*` general; SSR/RSC-scoped rules are N/A |
| **SSR / SSG** | Next.js Pages Router, Remix, `getServerSideProps`/loaders | general + `REACT-ROUTE-SSR-*`, `REACT-API-SSR-*`, `REACT-PERF-HYDRATION-1` |
| **RSC (server components)** | Next.js App Router, `app/`, `'use client'`/`'use server'` directives | general + the server/client boundary rules `REACT-ARCH-BOUNDARY-*`, `REACT-NAME-6` |
| **Hybrid / mid-migration** | App and Pages Routers both present; interop | whichever matches each surface; the migration's direction is respected, not accelerated |
| **Custom / project-specific** | in-house rendering/routing abstractions | apply the standard's *intent* to the wrapper's behavior, plus the repo's own conventions |

Rules:

- **The surface the feature touches decides which family applies.** Do not apply RSC boundary rules to a pure client SPA, or SSR rules to a surface that never renders on the server.
- **Do not migrate a surface between models** unless the feature explicitly requires it and it is approved → record as an unresolved decision.
- **A custom or legacy model is a first-class finding, not a defect.** Plan within it.

## 6. Architecture analysis order

Analyse in this order, so each step builds on established evidence:

1. **Folder & layer map** — what exists, and which layer the feature belongs in → `REACT-ARCH-LAYERS-*`, `REACT-ARCH-FOLDERS-*`.
2. **Existing analogous feature** — the nearest comparable feature becomes the pattern to follow.
3. **Dependency direction** — confirm the proposal does not invert the repo's downward direction → `REACT-ARCH-DEPS-1`, `REACT-ARCH-DEPS-2`, `REACT-ARCH-DEPS-3`.
4. **Server/client boundary** — on an RSC surface, where data-fetching and interactivity each live → `REACT-ARCH-BOUNDARY-1`, `REACT-ARCH-BOUNDARY-2`, `REACT-ARCH-BOUNDARY-3`.
5. **Business logic placement** — logic out of components, into hooks/selectors/services → `REACT-ARCH-LOGIC-1`, `REACT-ARCH-LOGIC-2`, `REACT-ARCH-LOGIC-3`.

A new architectural pattern is never introduced for a single feature. If the feature appears to require one, that is an unresolved decision, not a design choice.

## 7. State and data-flow analysis

Describe, in the repo's own idiom, and place each piece of state deliberately across the three-way boundary:

- **Local vs. URL vs. global** — single-component state stays local; shareable/bookmarkable/reload-surviving state (filters, tab, pagination, search, current record id) goes in the URL; global store only when shared across routes and not URL-appropriate → `REACT-STATE-BOUNDARY-1`, `REACT-STATE-BOUNDARY-2`, `REACT-STATE-BOUNDARY-3`, `REACT-STATE-BOUNDARY-4` (URL mechanics: `REACT-ROUTE-URL-*`).
- **Store conventions** — one store module per feature/domain, typed, mutated only through the sanctioned path → `REACT-STATE-SLICE-1..4`.
- **Selectors** — derived state through memoized selectors, stable inputs → `REACT-STATE-SELECT-1`, `REACT-STATE-SELECT-2`, `REACT-STATE-SELECT-3`.
- **Normalized entities** — collections keyed by id, relationships by reference → `REACT-STATE-ENTITY-1`, `REACT-STATE-ENTITY-2`, `REACT-STATE-ENTITY-3`.
- **Server-state** — held by the data-fetching layer ([§9](#9-data-and-api-layer-analysis)), not mirrored into a global client store; on an RSC stack, part moves server-side.
- **Persistence** — browser storage as a deliberate tier, never tokens/PII in script-readable storage → `REACT-STATE-PERSIST-1`, `REACT-STATE-PERSIST-2`, `SEC-COOKIE-2`, `SEC-STORAGE-3`.

## 8. Routing analysis

Plan against the repo's detected router — never a second, parallel one. The URL is the source of truth: typed path/query params parsed once at the boundary → `REACT-ROUTE-URL-1..5`. Follow the repo's URL structure and keep changed URLs backward-compatible / redirected → `REACT-ROUTE-STABILITY-1..4`. Validate any redirect/navigation target taken from user input, and never change state on a bare `GET` navigation → `REACT-ROUTE-SECURITY-1`, `REACT-ROUTE-SECURITY-2`, `SEC-WEB-5`, `SEC-WEB-3`. On a server-rendering surface, plan hydration-safe routing and server-side redirects → `REACT-ROUTE-SSR-1..3`. Plan link semantics, scroll restoration, Back/Forward, and prefetch → `REACT-ROUTE-UX-1..4`. Follow the repo's navigation seam; do not introduce a bespoke navigation singleton → `REACT-ROUTE-SERVICE-1..3`.

## 9. Data and API layer analysis

Use the repo's existing data-fetching library and base client; no ad-hoc client per feature → `REACT-API-ORG-1..4`, `REACT-API-BASEQ-1`. Plan cache keys/tags and precise invalidation → `REACT-API-CACHE-1..4`. Plan **web auth transport** — prefer `httpOnly` cookies with `credentials: 'include'` (**on `device_type: tv` this preference is conditional, not a default: `REACT-TV-API-1` requires establishing the app type and whether cookie transport works on the target before choosing, and `REACT-TV-API-3` the cross-origin model**), never tokens in script-readable storage, CSRF on state-changing requests, CORS as a read boundary not authorization, and no secrets inlined into the bundle → `REACT-API-BASEQ-1..7` (including `-4` central 401/refresh-and-retry and `-7` no auth headers or PII in base-layer logging), `SEC-COOKIE-1`, `SEC-COOKIE-2`, `SEC-WEB-3`, `SEC-WEB-6`, `SEC-SECRETS-2`. Plan request cancellation on unmount / supersede → `REACT-API-ASYNC-1`. On a server-rendering surface, plan server fetch + cache hydration and credential forwarding → `REACT-API-SSR-1`, `REACT-API-SSR-2`. Normalize error shapes centrally and distinguish aborts from failures → `REACT-API-ERR-1..3`. Never log tokens/PII → `SEC-LOG-1`.

**If the feature depends on an unconfirmed backend contract, record it as a blocking unresolved decision and continue planning** — do not decide the contract unilaterally, and do not stop. Most features carry one at Design time; it blocks *decomposition* at Feature-start (`skills/dev-design-start/SKILL.md` § *Shared planning rules → Risk classification*), not the design itself.

## 10. Module and dependency impact

**Inspect broadly; report at module and change-class resolution.** Analysis may read every relevant file to understand the true blast radius. What the *design* records is the conclusion of that reading, not its transcript.

Enumerate every **module/feature folder and package** the feature touches, and for each state the **class of change** (created / modified / read-only) and, where the same change repeats across many files, an **approximate site count** (e.g. "`features/orders` — all list screens move to the shared `<DataTable>`, ~12 sites"). **Enumerate individual files only when** the affected set is small (roughly **ten or fewer** sites for a change class) or when a file is itself a **design-relevant boundary**. **Per-file expansion belongs to `/dev-feature-start` and the Task Breakdown, which re-reads the repository to do it** — that re-read, not this design, is the source of the breakdown's `files touched` column. Never invent per-file paths here to fill it.

Confirm no new circular dependency and no inverted layer dependency → `REACT-ARCH-DEPS-*`. A new third-party dependency is an unresolved decision, never a silent addition, and is weighed against bundle cost → `REACT-PERF-BUNDLE-1`. Build-tool/config changes follow the repo's existing setup.

## 11. Testing planning

Plan what will be tested and at which level, matching the repo's existing runner and libraries rather than introducing one. Cover: business/hook logic including failure and edge paths; component behavior through Testing Library (user-facing behavior, not implementation detail); e2e for critical flows where the repo uses Playwright/Cypress; localization and RTL checks where relevant → `I18N-TEST-1`, `I18N-TEST-2`. Accessibility checks for interactive UI → `A11Y-*` (see [§13](#13-security-accessibility-i18n-and-rtl-planning)).


> **Known lane gap — testing and logging have no `REACT-*` family.** Unlike the iOS lane (`IOS-ARCH-TEST-*`) and Android (`AND-TEST-*`, `AND-LOG-*`), `standards/react/` authors **no** `REACT-TEST-*` or `REACT-LOG-*` rules. So a testing or logging plan here is grounded in **repository convention plus the shared `I18N-TEST-*`/`A11Y-*` rules only** — this is the one place the §0 claim that every React-specific rule cites an authored `REACT-*` standard does not hold, and it is stated rather than papered over. Practical consequence to respect: **do not invent a `REACT-TEST-*` or `REACT-LOG-*` ID**, and where the repository has no convention either, say so (absence of a convention is not compliance) rather than supplying a preference. Authoring those two families is a separate decision for the standards owner.
If the repository has no test infrastructure for a layer the feature touches, say so plainly and record it as an unresolved decision — never silently plan tests that cannot run, and never propose building a test framework as part of an unrelated feature.

## 12. Performance planning

Identify the feature's realistic performance risks rather than reciting generic ones: unnecessary re-renders and unstable props → `REACT-PERF-RERENDER-1`, `REACT-PERF-RERENDER-2`; large lists → `REACT-PERF-LIST-1`; main-thread long tasks → `REACT-PERF-MAINTHREAD-1`; image sizing and layout stability → `REACT-PERF-IMAGE-1`, `REACT-PERF-IMAGE-2`; bundle size and code-splitting → `REACT-PERF-BUNDLE-1`, `REACT-PERF-BUNDLE-2`, `REACT-PERF-BUNDLE-3`; hydration cost on a server-rendering surface → `REACT-PERF-HYDRATION-1`; third-party scripts → `REACT-PERF-THIRDPARTY-1`, `SEC-WEB-4`; Core Web Vitals as targets → `REACT-PERF-CWV-1`.

**Measurement discipline:** write a magnitude/regression concern as a measurement request (metric + scenario + threshold), never as a confirmed finding from reading code; flag production-build-only concerns (bundle size, tree-shaking) as such.

## 13. Security, accessibility, i18n and RTL planning

- **Security** — web auth/session and CSRF → `SEC-WEB-3`, `SEC-COOKIE-1`, `SEC-COOKIE-2`; XSS / safe rendering, CSP, third-party scripts, open redirects → `SEC-WEB-1`, `SEC-WEB-2`, `SEC-WEB-4`, `SEC-WEB-5`; secrets never inlined into the client bundle → `SEC-SECRETS-2`; never logging sensitive data → `SEC-LOG-1`. Security *enforcement* at review time is owned by the shared `mobile-security-reviewer`; planning names the concern and the rule.
- **Accessibility** — roles/labels for non-text controls → `A11Y-ROLES-1`, `A11Y-ROLES-2`; screen-reader support and focus order → `A11Y-SR-1`, `A11Y-SR-2`. **`A11Y-SR-1` names VoiceOver and TalkBack, which do not exist on a browser surface; its web reading is a walkthrough with a desktop screen reader the team actually uses (NVDA, JAWS, or VoiceOver on macOS), recorded by name.** Do not treat the mobile tool names as making the rule N/A on web; font scaling → `A11Y-FONT-1`, `A11Y-FONT-2`; activation targets → `A11Y-TOUCH-1`, `A11Y-TOUCH-2`. On TV (`device_type: tv`), `A11Y-TOUCH-1` is satisfied by a reliably focusable element with a clearly visible focus state rather than a touch-target size.
- **i18n and RTL** — no hardcoded user-visible strings → `I18N-COPY-1`; formatting → `I18N-FMT-1`, `I18N-FMT-2`; RTL layout and mirroring → `I18N-RTL-1`, `I18N-RTL-2`, `I18N-RTL-3`, `I18N-RTL-4`.

## 14. `device_type` handling

One agent and one skill serve both device types. **TV is a context signal, never a separate platform** — there is no `react-tv` platform value, and no TV-specific agent, skill, or command.

### `device_type: mobile`

Proceed with the standard path. Pointer/touch interaction and responsive-web patterns apply.

### `device_type: tv`

A React Smart TV application (Tizen, webOS, or another vendor runtime, plus browser-based TV) may use any implementation model. Inspect and identify the actual implementation before making any planning decision. Never assume a specific TV framework or focus library.

Run this discovery pass **before** proposing anything, recording evidence for each item that exists:

1. **Focus & spatial navigation** — how focus moves across a D-pad/remote grid, and how it is tracked and restored; any custom focus engine or spatial-navigation library.
2. **Remote/key input** — where key events (arrows, OK, Back, media keys) are received and dispatched.
3. **10-foot UI conventions** — layout scale, overscan-safe margins, and the visible focus treatment the repo uses.
4. **Playback integration** — the player, its lifecycle ownership, and playback-state model, where the feature touches playback.
5. **TV runtime & memory constraints** — the target device tier and any existing performance/memory budget conventions.
6. **Vendor packaging & lifecycle** — Tizen (`.wgt`/`config.xml`) or webOS (`.ipk`/`appinfo.json`) packaging, app suspend/resume/exit lifecycle, and store/signing configuration.
7. **Reusable TV components** — TV base components, screen wrappers, or a framework module the feature should extend.
8. **Network & auth transport** — whether the target ships as a **packaged** app (resources installed locally, non-`http(s)` scheme) or a **hosted** app, whether cookie transport is usable on it, and the platform's cross-origin model → `REACT-TV-API-1`, `REACT-TV-API-3`. This is a **Design-stage** obligation: `REACT-TV-API-1` requires the app type and cookie viability be established *before* the transport is designed, and consulting vendor documentation is expected here (unlike at review). Record the finding with its source.

**Read `standards/react/react-smart-tv.md`'s TV detection traps before recording any discovery finding above** — most importantly that a TV dependency in `package.json` does not establish that *this feature's* surface is TV, that a runtime `window.tizen`/`window.webOS` guard may exist only for dev-browser degradation, and that Tizen and webOS differ in manifests, key codes, lifecycle, and input model, so a repo targeting both has two answers to most of these items.

**Where the repository has no TV surface yet (greenfield), absence is a gap to fill, not an ambiguity to stop on.** `REACT-TV-FOCUS-2`, `REACT-TV-INPUT-1`/`-2`, `REACT-TV-UI-1`/`-2`/`-3`, and `REACT-TV-PERF-1` are all phrased against the repository's *existing* convention. When none exists, the focus model, key map, safe-area inset, and TV budget are **required feature-specific extensions proposed once at app level** as an explicit approval-gated decision — not per feature, and not a migration. Distinguish this from the failure case: a TV surface that exists but whose model **cannot be identified** is the stop-and-report condition in *Failure behavior*; a repository with **no** TV surface at all is this greenfield path.

**TV planning rules:**

- **Never propose migrating** to a different TV framework unless the feature explicitly requests it and it is approved.
- **Never silently apply pointer/touch assumptions** — hover, tap/swipe gestures, and pointer-scroll affordances do not transfer to a D-pad/remote model.
- **Reuse the existing TV components and conventions** wherever they cover the need; identify gaps without redesigning the model.
- **Cite `REACT-TV-*` IDs — the standard is authored.** `standards/react/react-smart-tv.md` supplies the vocabulary and rule IDs for a TV plan: focus and spatial navigation (`REACT-TV-FOCUS-*`), remote/key input including cursor mode and the platform IME (`REACT-TV-INPUT-*`), 10-foot UI and overscan (`REACT-TV-UI-*`), playback and screensaver suppression (`REACT-TV-MEDIA-*`), lifecycle (`REACT-TV-LIFECYCLE-*`), **network and auth transport (`REACT-TV-API-*`)**, the constrained-runtime and memory budget (`REACT-TV-PERF-*`), and vendor packaging/signing (`REACT-TV-PKG-*`). They are cited **in addition to** the base `REACT-*` and shared rules, which all still apply — `A11Y-TOUCH-1` already carries its own TV clause, and `REACT-TV-FOCUS-3` is the React rule that owns it.
- **The discovery pass above is what makes those citations legitimate.** The TV rules require the repository's *existing* model; citing `REACT-TV-FOCUS-2` without having identified which focus model the repo uses is an unlabelled repository claim, and a defect. Where a discovery item is genuinely unresolvable, mark it `[unknown]` and record it as an unresolved decision rather than planning against an assumed model.
- **Plan a stated budget, not a vague concern.** `REACT-TV-PERF-1` requires an explicit memory/performance budget for the target device tier; a magnitude claim still follows the measurement discipline in [§12](#12-performance-planning), and on TV must be measured on the target tier rather than a desktop profile.

This skill does **not** author TV standards. Its TV responsibility is discovery and respect for the existing model.

## Standards citation

**This lane's parameters for the two parameterised source-of-truth ranks** (`skills/dev-design-start/SKILL.md` § *Shared planning rules → Source-of-truth hierarchy*): **rank 4** is `standards/react/*` plus `standards/shared/*`; **rank 5** is official React and framework documentation, which is supporting guidance only and never overrides rank 2.

Cite only IDs that exist in these files and genuinely apply. **Never use React Native's `RN-*` or the bare `ARCH-*`/`API-*`/`STATE-*`/`NAV-*` IDs for React (web)** — React cites the `REACT-*` roots.

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

The Smart TV row applies **only** when `device_type: tv`; on `mobile` those rules are not cited at all. On `tv` they are cited **in addition to** every row above, never instead of them.

## React decomposition hazards at `/dev-feature-start`

Call these out so two tasks do not collide:

- **Shared-registry contention.** Two tasks both editing the route table, the store registry, or a barrel/index file will conflict; sequence them or assign both edits to one task.
- **A `'use client'` boundary change ripples to importers.** Moving a module across the boundary is not a local edit — it changes what every importer ships. Scope it as its own task with its importers named.
- **A dependency change touches the lockfile.** Any task adding or upgrading a dependency owns the lockfile edit alone; parallel tasks doing so conflict every time.

## Red flags — STOP and report instead of proceeding

- A required input is missing, or `device_type` is absent, empty, or not exactly `mobile`/`tv`.
- Repository evidence is missing, contradictory, or ambiguous on a dimension the plan depends on.
- Two competing mechanisms exist (router, state, data-fetching, rendering model) and the one this feature should follow cannot be determined from evidence.
- A UI-changing feature has no design reference of any supported type.
- `device_type: tv` and a TV surface exists but its implementation model **cannot be identified** from evidence. (A repository with **no** TV surface at all is not this case — that is the greenfield path in §14, which continues rather than stopping.)
- A design reference is recorded but **cannot be read** (a dead link, an unreachable MCP server, a missing export) — report the exact error rather than proceeding. (An unconfirmed **backend contract** is *not* here: it is recorded as a blocking unresolved decision and planning continues — see [§9](#9-data-and-api-layer-analysis).)
- The plan would require introducing a new framework, router, state/data library, or migration as required work.
- The Feature Analysis and DD conflict, or an upstream document is unapproved, stale, or draft.
- A cited `standards/react/*` file is missing or is a structure-only placeholder (see `skills/platform-planning/SKILL.md` §2).
- You are about to state a repository fact you did not verify.

## Relationship with commands, agent, skills

- **`commands/analyze-feature.md`**, **`commands/dev-design-start.md`**, **`commands/dev-feature-start.md`** — detection, the confirmation gate, artifact resolution, approval gates and routing.
- **`skills/platform-planning/SKILL.md`** — the platform-independent planning methodology. It names every other owner; that table is not repeated here.
- **`skills/dev-design-start/SKILL.md`** — the DD section rules, Classification, Risk classification and the source-of-truth hierarchy.
- **`agents/react-architect.md`** — the React (web) specialist that executes all of it.
- **This skill** — the React (web) planning content itself, and nothing a platform-independent layer could state.
