# State Management Standards

## Purpose & Scope

These standards apply to state management in React Native app code reviewed by `rn-code-reviewer` via `/review-code`. `repo-analyst` detects which state-management library a project actually uses (Redux Toolkit, Zustand, MobX, Context + `useReducer`, etc.) before this document is applied — see [Applicability](#applicability). Each bullet below carries a stable ID so review findings can cite the exact rule they violate. This list is a baseline, not exhaustive — reviewers should use judgment for app-specific structure.

## Applicability

- **Universal Principles** apply no matter which state-management library is detected.
- **Redux Toolkit Rules** apply only when `repo-analyst` detects Redux Toolkit as the project's state-management library. If a different library is detected, apply the Universal Principles using that library's own mechanism (e.g. a Zustand store slice instead of `createSlice`, a plain memoized derivation instead of `createEntityAdapter`) — a file is never failed just for not using Redux Toolkit APIs.

## Universal Principles

### Memoized Selectors

- `STATE-SELECT-1` [WARNING] Derived/computed state (filtering, sorting, aggregating) is read through a memoized selector/derivation (e.g. `createSelector`, or the equivalent in the detected library), not recomputed inline in a component's render body.
- `STATE-SELECT-2` [WARNING] Selectors/derivations live alongside the state they read and are the only sanctioned way other code reads that state.
- `STATE-SELECT-3` [WARNING] Selector/derivation inputs are kept stable (avoid passing new object/array literals as args on every render).

### Local vs. Global State Boundary

- `STATE-BOUNDARY-1` [WARNING] State read/written by exactly one component or screen stays in local `useState`/`useReducer` — it does not default into the global store.
- `STATE-BOUNDARY-2` [WARNING] State goes into the global store only when it's shared across screens, must survive navigation/unmount, or is needed by multiple independent features.
- `STATE-BOUNDARY-3` [WARNING] Purely presentational/UI state (open/closed toggles, input focus, in-progress form values) stays local even if the containing feature has global state for its domain data.
- `STATE-BOUNDARY-4` [WARNING] If a state value is read or written by 3 or more non-nested screen components (siblings reached via navigation, not a parent/child chain within one screen tree), it must migrate out of local state into the global store or a shared context — passing it via props/params across 3+ independent screens is a boundary violation, not a valid alternative.

### Serializable State

- `STATE-SERIAL-1` [WARNING] Global store state holds only serializable data — plain objects, arrays, and primitives — not functions, class instances, Promises, or framework objects (a navigation ref, a `Date` instance stored directly rather than an ISO string, a `Map`/`Set`). Where the detected library ships a serializability check (Redux Toolkit's `serializableCheck` middleware), it is not disabled to work around a violation — the offending value is normalized instead.

### Persistence

- `STATE-PERSIST-1` [INFO] Where part of the store must survive an app restart, persistence goes through the project's existing mechanism (e.g. `redux-persist`, a Zustand `persist` middleware, or a manual hydrate/serialize step) rather than a second, ad hoc persistence path introduced alongside it.
- `STATE-PERSIST-2` [WARNING] Auth tokens and PII are not persisted by the store's persistence layer unless that layer is encrypted — ties to `SEC-STORAGE-3` in `standards/shared/mobile-security.md`.

## Redux Toolkit Rules (only when Redux Toolkit is the detected state-management library)

### Slice Conventions

- `STATE-SLICE-1` [WARNING] Each feature/domain owns exactly one slice, created with `createSlice`; slices are not shared across unrelated features.
- `STATE-SLICE-2` [WARNING] Slice initial state is fully typed (no implicit `any`); the slice's state shape is exported for use in selectors and components.
- `STATE-SLICE-3` [CRITICAL] State is only ever mutated inside a slice's own reducers (Redux Toolkit's Immer draft) — never mutated directly from a component, thunk, or another slice.
- `STATE-SLICE-4` [WARNING] Async flows use `createAsyncThunk` (or RTK Query, per `standards/react-native/rn-api-service-layer.md`) rather than hand-rolled action-dispatching side effects.

### Normalized Entities

- `STATE-ENTITY-1` [WARNING] Collections of records (lists of items with an id) are stored normalized via `createEntityAdapter`, keyed by id — not as a plain array requiring linear scans to find/update an item.
- `STATE-ENTITY-2` [WARNING] Relationships between entities are stored by id reference, not by nesting full copies of related records.
- `STATE-ENTITY-3` [WARNING] Entity adapter selectors (`selectAll`, `selectById`, etc.) are used instead of re-implementing lookup/sort logic ad hoc.

## References

- `repo-analyst`'s Stack Detection determines whether the Redux Toolkit section applies; the Universal Principles always apply regardless of its finding.
- This document is a living baseline; reviewers should flag standards gaps found during review rather than working around them silently.
- See `standards/react-native/rn-api-service-layer.md` for server-state/cache conventions, which are handled separately from the client-state conventions above.
- See the "AI Agent Execution Directives" section in `standards/react-native/rn-coding-standards.md` for the severity hierarchy, citation format, and anti-hallucination thresholds that govern how findings against the IDs above are reported.
