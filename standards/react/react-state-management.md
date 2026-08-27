# State Management Standards

## Purpose & Scope

These standards apply to how React (web) application code manages client state. They are **library-neutral** — the org does not mandate Redux Toolkit; Redux Toolkit, Zustand, Jotai, Recoil, MobX, or plain Context + `useReducer` are all possible findings, and detecting which a repo uses is the `repo-analyst` agent's job. Rules are stated at the concept level and name specific libraries only as examples. Reviewed by `react-code-reviewer` via `/review-code` and used by `react-architect` via `/analyze-feature` and `/dev-design-start`. Each rule carries a stable ID so findings can cite the exact rule they apply. This is a baseline, not exhaustive.

This document inherits the **React lane conventions** in `standards/react/react-coding-standards.md` — the repository-first source-of-truth hierarchy (the repo's detected state approach outranks these rules; official docs are rank-5 supporting only; absence of a convention is not compliance), technology-neutrality, the no-modernization-aside stance, the `REACT-` ID prefix, and the `## External references` pattern. Findings are limited to code introduced or modified in the reviewed scope.

> **Port + web additions.** Store-module, selector, and normalized-entity rules port from the React Native standard (made library-neutral). The **URL-as-state boundary** and the **browser-storage persistence tier** are web-specific and have no React Native analog. Server-state/cache conventions are owned by `standards/react/react-api-service-layer.md`, not here.

## Store Module Conventions

- `REACT-STATE-SLICE-1` Each feature/domain owns exactly one store module (a Redux slice via `createSlice`, one Zustand store, one Jotai atom family) — store modules are not shared across unrelated features.
- `REACT-STATE-SLICE-2` Store state is fully typed (no implicit `any`); the state shape is exported for use in selectors and components.
- `REACT-STATE-SLICE-3` State is mutated only through the store's sanctioned update path (a Redux reducer's Immer draft, a Zustand `set` action) — never mutated directly from a component, an async flow, or another module.
- `REACT-STATE-SLICE-4` Async flows use the store's sanctioned async mechanism (`createAsyncThunk`, a store action) or the server-cache library (per `standards/react/react-api-service-layer.md`) — not hand-rolled action-dispatching side effects.

## Memoized Selectors

- `REACT-STATE-SELECT-1` Derived/computed state (filtering, sorting, aggregating) is read through a memoized selector (`createSelector`, a memoized store selector, the library equivalent), not recomputed inline in a component's render body.
- `REACT-STATE-SELECT-2` Selectors are the sanctioned way other code reads a store module's state — components do not reach into `state.feature.field` directly.
- `REACT-STATE-SELECT-3` Selector inputs are kept stable (no new object/array literals passed as selector args on every render) so memoization actually holds.

## Normalized Entities

- `REACT-STATE-ENTITY-1` Collections of records (items with an id) are stored normalized — keyed by id (`createEntityAdapter`, or a `Record<Id, T>` map) — not as a plain array requiring linear scans to find/update an item.
- `REACT-STATE-ENTITY-2` Relationships between entities are stored by id reference, not by nesting full copies of related records (which duplicate and diverge).
- `REACT-STATE-ENTITY-3` Adapter/lookup selectors (`selectAll`, `selectById`, or their equivalent) are used instead of re-implementing lookup/sort logic ad hoc.

## Local vs. URL vs. Global Boundary

- `REACT-STATE-BOUNDARY-1` State read/written by exactly one component stays in local `useState`/`useReducer` — it does not default into the global store.
- `REACT-STATE-BOUNDARY-2` State that should be **shareable, bookmarkable, or survive reload** — active filters, the selected tab, pagination, a search query, the current record id — lives in the **URL** (path/query), not the global store and not local state, so the URL reproduces the view. This rule owns the state-placement decision; the routing mechanics of reading/writing the URL are owned by `REACT-ROUTE-URL-*` in `standards/react/react-routing.md`.
- `REACT-STATE-BOUNDARY-3` State goes into the global store only when it is shared across routes, must survive navigation/unmount, or is needed by multiple independent features — **and** is not URL-appropriate per `REACT-STATE-BOUNDARY-2`.
- `REACT-STATE-BOUNDARY-4` Purely presentational/UI state (open/closed toggles, input focus, in-progress form values) stays local even when the containing feature has a store module for its domain data.

> On a React Server Components / SSR stack, part of what would be client "server-state" is fetched and held server-side (server components, route loaders), which shrinks the client store — prefer that over mirroring server data into a global client store. See `standards/react/react-api-service-layer.md` (`REACT-API-SSR-*`).

## Persistence & Browser Storage

- `REACT-STATE-PERSIST-1` Browser storage (`localStorage`/`sessionStorage`/`IndexedDB`, cookies) is a deliberate persistence tier — the web analog of React Native's `AsyncStorage` — used for non-sensitive, reload-survivable state (a persisted store slice via `redux-persist`, Zustand `persist`), chosen for a stated reason rather than as a default dumping ground.
- `REACT-STATE-PERSIST-2` Access and refresh **tokens** are **never** persisted to a script-readable browser store (`localStorage`/`sessionStorage`/`IndexedDB`) — a successful XSS reads all of them (shared `SEC-COOKIE-2`). More broadly, persisted application/UI state (`redux-persist`, Zustand `persist`) excludes tokens and PII unless the persistence layer itself is encrypted (shared `SEC-STORAGE-3`).

## References

- This document is a living baseline; reviewers flag state-management gaps found during review rather than working around them silently.
- Server-state/cache conventions (the data-fetching library) are handled in `standards/react/react-api-service-layer.md`, separate from the client-state conventions above.
- Companion React standards: `standards/react/react-coding-standards.md` (authored — governing conventions) and `standards/react/react-routing.md` (authored — `REACT-ROUTE-URL-*`, the URL-as-state mechanics); and `standards/react/react-api-service-layer.md` (authored — `REACT-API-SSR-*`), `standards/react/react-architecture.md` (all authored; cross-references frozen in REACT-001-7).
- Shared standards cited (not restated) here: `standards/shared/mobile-security.md` (`SEC-COOKIE-2`, `SEC-STORAGE-3`).

## External references

Rank-5 supporting material only (see *External references* under the governing conventions in `react-coding-standards.md`): consult for background, never as a rule and never fetched at review time; a repository convention (rank 2) always wins. Links verified live 2026-08-16.

- [React — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) — supports `REACT-STATE-ENTITY-1`, `REACT-STATE-ENTITY-2`. *Consult* for avoiding redundant/duplicated/deeply-nested state and normalizing collections.
- [MDN — Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API) — supports `REACT-STATE-PERSIST-1`, `REACT-STATE-PERSIST-2`. *Consult* for `localStorage`/`sessionStorage` semantics (synchronous, origin-scoped, script-readable) before persisting state there.
- [MDN — `URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) — supports `REACT-STATE-BOUNDARY-2`. *Consult* for reading/writing bookmarkable UI state in the query string.
