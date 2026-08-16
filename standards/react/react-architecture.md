# React Architecture Principles

## Purpose & Scope

These principles apply to how React (web) application code is organized and layered — reviewed by `react-code-reviewer` via `/review-code` and used by `react-architect` when proposing a technical approach via `/analyze-feature` and `/dev-design-start`. Each rule below carries a stable ID so review findings and design proposals can cite the exact rule they apply. This is a baseline, not exhaustive — reviewers use judgment for app-specific structure inherited from `repo-analyst`'s detection.

This document inherits the **React lane conventions** defined in `standards/react/react-coding-standards.md` — the repository-first source-of-truth hierarchy (a repo's established structure, as detected by `repo-analyst`, outranks these principles; official docs are rank-5 supporting only, and absence of a convention is not compliance), technology-neutrality (no assumed framework/router/state library — the layering model is read from the repository, not prescribed), the no-modernization-aside stance, the `REACT-` ID prefix, and the `## External references` pattern. Findings are limited to code introduced or modified in the reviewed scope.

## Layered Architecture

- `REACT-ARCH-LAYERS-1` The app is organized into three layers: pages/routes → features → services/store. (In a route-segment framework such as the Next.js App Router, a "page/route" is the route segment; in a client router such as React Router or TanStack Router it is the routed view component — the layer role is the same.)
- `REACT-ARCH-LAYERS-2` Page/route components are thin — they compose feature components, read route inputs (path/query params from the URL), and render layout. They do not contain business logic or direct data-fetching calls. (URL-as-input conventions will be defined in `standards/react/react-routing.md` — *reconciled in REACT-001-7*.)
- `REACT-ARCH-LAYERS-3` Features hold the business logic for a unit of product functionality — hooks, selectors, and orchestration that decide what happens and when.
- `REACT-ARCH-LAYERS-4` Services/store hold data access and app-wide state — API clients, the data-fetching/cache layer, store slices, and persistence. They know nothing about which page or feature is calling them. (Data-layer and state conventions will be defined in `standards/react/react-api-service-layer.md` and `standards/react/react-state-management.md` — *reconciled in REACT-001-7*.)

## Server / Client Component Boundary

**[Applies only in a repository using React Server Components — e.g. the Next.js App Router. Where the repository ships a purely client-rendered SPA (no RSC), this section is N/A; do not raise its rules as findings.]**

- `REACT-ARCH-BOUNDARY-1` Data fetching and server-only work (direct data access, code that reads secrets) default to the server side of the tree; interactivity — hooks, event handlers, browser-only APIs — is what pulls a module to the client, marked with the `'use client'` directive (see `REACT-NAME-6` in `react-coding-standards.md`). The boundary is decided per surface by what the code actually needs, not applied to the whole app by default.
- `REACT-ARCH-BOUNDARY-2` The client boundary is pushed as far down the tree as practical: mark the smallest interactive leaf `'use client'` rather than a whole page, so the server-rendered portion of the subtree is not forfeited for one interactive child.
- `REACT-ARCH-BOUNDARY-3` A server-only module (direct database/filesystem access, secret material) is never imported into a client component, and code shared across the boundary is free of server-only and client-only dependencies. Secrets must not reach client code, where a bundler would inline them (see shared `SEC-SECRETS-2`).

## Feature-Folder Structure

- `REACT-ARCH-FOLDERS-1` A feature's routes/pages, components, store slice, API endpoints, and hooks are colocated under one feature folder rather than split across type-based folders (e.g. a global `components/`, `slices/`, `hooks/` at the top level).
- `REACT-ARCH-FOLDERS-2` Only genuinely cross-feature code (design-system primitives, shared utilities, app-wide store and router setup) lives outside a feature folder.
- `REACT-ARCH-FOLDERS-3` A feature folder's internal structure is consistent across features so navigating any feature follows the same pattern.

## Dependency Direction

- `REACT-ARCH-DEPS-1` Dependencies point downward only: pages/routes may depend on features, features may depend on services/store — never the reverse.
- `REACT-ARCH-DEPS-2` A service/store module never imports from a feature or page module.
- `REACT-ARCH-DEPS-3` Cross-feature imports (one feature depending directly on another feature's internals) are avoided — shared logic is pulled up into services/store or a shared module instead.

## Business Logic Out of Components

- `REACT-ARCH-LOGIC-1` Components render and dispatch — they do not contain business rules (validation logic, derived calculations, conditional flows tied to domain rules), and they do not mutate state or perform side effects during render.
- `REACT-ARCH-LOGIC-2` Business rules live in hooks, selectors, or service functions that a component calls, so the logic is testable independent of rendering.
- `REACT-ARCH-LOGIC-3` Derived/computed values are produced by memoized selectors or hooks, not recomputed inline inside JSX or via effects scattered across components.

## References

- This document is a living baseline; reviewers flag structural gaps found during review rather than working around them silently.
- Where a repo's existing structure predates these principles, `repo-analyst`'s detected conventions take precedence for that repo until a migration is planned — the same repo-detection-first approach will be applied to routing in `standards/react/react-routing.md` (*reconciled in REACT-001-7*).
- Companion React standards: `standards/react/react-coding-standards.md` (authored — this document inherits its governing conventions); and `standards/react/react-routing.md`, `standards/react/react-state-management.md`, `standards/react/react-api-service-layer.md` (cross-references *reconciled in REACT-001-7*).
- Shared standards cited (not restated) here: `standards/shared/mobile-security.md` (`SEC-SECRETS-2`).

## External references

Rank-5 supporting material only (see *External references* under the governing conventions in `react-coding-standards.md`): consult for background, never as a rule and never fetched at review time; a repository convention (rank 2) always wins. Links verified live 2026-08-16.

- [React — Keeping Components Pure](https://react.dev/learn/keeping-components-pure) — supports `REACT-ARCH-LOGIC-1`, `REACT-ARCH-LOGIC-3`. *Consult* for what "no side effects or mutation during render" means and where such work belongs instead.
- [React — Server Components](https://react.dev/reference/rsc/server-components) — supports `REACT-ARCH-BOUNDARY-1`, `REACT-ARCH-BOUNDARY-2`. *Consult* **only** in an RSC repository, for how server and client components compose in one tree.
- [React — `'use client'` directive](https://react.dev/reference/rsc/use-client) — supports `REACT-ARCH-BOUNDARY-1`, `REACT-ARCH-BOUNDARY-3`. *Consult* **only** in an RSC repository, to confirm what marking a module `'use client'` does to the boundary.
