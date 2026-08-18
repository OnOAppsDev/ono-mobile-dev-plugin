# Architecture Principles

## Purpose & Scope

These principles apply to how React Native app code is organized and layered, and to how it interacts with React Native's runtime architecture (New Architecture / Bridgeless Mode vs. Legacy Architecture) — reviewed by `rn-code-reviewer` via `/review-code` and used by `rn-architect` when proposing a technical approach via `/analyze-feature` and `/dev-design-start`. Each bullet below carries a stable ID so review findings and design proposals can cite the exact rule they apply. This is a baseline, not exhaustive — reviewers should use judgment for app-specific structure inherited from `repo-analyst`'s detection.

## Layered Architecture

- `ARCH-LAYERS-1` [WARNING] Regardless of folder naming or convention, the app separates three concerns: UI entry points (screens/pages) → feature/domain logic (hooks, components, orchestration) → services/store (data access, app-wide state). Before evaluating this or any rule below, identify via `repo-analyst`'s detection which organizational convention the repo actually uses — a feature-based layout (`src/features/<feature-name>/`) or a type-based layout (top-level kind folders, e.g. `app/pages`, `app/components`, `app/hooks`, `app/services`) — and evaluate structural findings against that convention, not against an assumed default. Neither convention is inherently correct; requiring a feature-folder layout in a repo that has deliberately standardized on a type-based layout (or vice versa) is not a valid finding.
- `ARCH-LAYERS-2` [WARNING] Screens/pages are thin — they compose feature components, wire navigation params, and render layout; no business logic or direct data-fetching calls. A screen/page may still contain light logic strictly to prepare/derive props for the components it renders (reading and shaping navigation params, simple conditional prop selection); this is wiring, not a violation, as long as it stays under the `ARCH-LOGIC-1` thresholds — once it crosses them (validation rules, derived calculations, multi-step data transforms), that logic must move into a hook or utility as `ARCH-LOGIC-1` requires, even though it lives in a screen/page file.
- `ARCH-LAYERS-3` [WARNING] The feature/domain logic layer holds the business logic for a unit of product functionality — hooks, selectors, and orchestration — whether that layer is organized as per-feature folders or as the repo's shared `hooks`/`components` directories.
- `ARCH-LAYERS-4` [WARNING] Services/store hold data access and app-wide state — API clients/endpoints, global state, and persistence — with no knowledge of which screen/page or feature is calling them.

## Project Structure Convention

- `ARCH-STRUCT-1` [INFO] Confirm the repo's actual structural convention (via `repo-analyst`'s detection, or by inspecting the existing top-level layout) before applying any rule in this section. Both a feature-based layout and a type-based layout (`app/pages` + `app/components` + `app/hooks` + `app/services`, or equivalent) are valid baselines — the goal is internal consistency with whichever one the repo has already adopted, not migration to a specific layout. Apply `ARCH-FOLDERS-*` to a repo already using a feature-based layout; apply `ARCH-TYPE-*` to a repo using a type-based layout. Once the convention is identified, the rules below apply strictly to it — "no feature folder" is not itself grounds for a finding in a type-based repo, but inconsistent or mixed placement within the identified convention is.

### Feature-Based Layout

- `ARCH-FOLDERS-1` [INFO] Place a feature's screens, components, business logic (hooks/slices), and API endpoints inside its dedicated feature folder (`src/features/<feature-name>/`), not split across top-level type folders.
- `ARCH-FOLDERS-2` [INFO] Only genuinely cross-feature code (design-system primitives, shared utilities, app-wide store setup) lives outside a feature folder.
- `ARCH-FOLDERS-3` [INFO] A feature folder's internal structure is consistent across features.
- `ARCH-FOLDERS-4` [INFO] Nested folder depth within a feature directory does not exceed 3 levels beneath `src/features/<feature-name>/` (e.g. `src/features/checkout/components/summary/rows/` is at the limit; a further nested subfolder must be flattened or extracted into its own top-level feature/shared module instead).

### Type-Based Layout

- `ARCH-TYPE-1` [INFO] Each kind of code lives in its designated top-level folder consistently (e.g. screens/pages in `app/pages`, reusable components in `app/components`, hooks in `app/hooks`, data access in `app/services`) — a file placed by kind in one part of the app is placed the same way everywhere, not scattered ad hoc.
- `ARCH-TYPE-2` [INFO] Where a type-based repo groups related files by domain within a kind folder (e.g. `app/components/checkout/`, `app/hooks/checkout/`), that domain sub-grouping is applied consistently across the kind folders it touches, not applied to only some.
- `ARCH-TYPE-3` [INFO] Nested folder depth within any kind folder does not exceed 3 levels beneath the kind folder itself (e.g. `app/components/checkout/summary/rows/` is at the limit; deeper nesting must be flattened or extracted into its own shared module instead).

## Dependency Direction

- `ARCH-DEPS-1` [WARNING] Dependencies point downward only: screens may depend on features, features may depend on services/store — never the reverse.
- `ARCH-DEPS-2` [WARNING] A service/store module never imports from a feature or screen module.
- `ARCH-DEPS-3` [WARNING] One feature/domain area reaching directly into another's internals is avoided — in a feature-based layout this means cross-feature imports between feature folders; in a type-based layout it means one domain's hook/component reaching into another domain's files within the same kind folder (e.g. `app/hooks/checkout/` importing from `app/hooks/profile/`). Either way, shared logic is pulled up into services/store or a shared module instead.

## Business Logic Out of Components

- `ARCH-LOGIC-1` [WARNING] Components render and dispatch — they do not contain business rules (validation logic, derived calculations, conditional flows tied to domain rules). A single, simple array operation used to shape data directly for rendering (a single `.filter()` to hide/show list items, a single `.map()` to project fields into a list/prop) is normal component code, not a violation, as long as its callback is a short, obvious expression rather than domain logic. The line is crossed — and the logic must move into a custom hook or utility module, with the component calling it and rendering the result — once a component body has: more than 3 conditional branching statements (`if`/`else if`/`switch case`/ternary chains) tied to domain logic; `.reduce`, or a chained sequence of two or more array operations (e.g. `.filter().map().sort()`) operating on domain data; any regex-based parsing/validation; or the component file exceeds 150 lines of code.
- `ARCH-LOGIC-2` [WARNING] Business rules live in hooks, selectors, or service functions that a component calls.
- `ARCH-LOGIC-3` [WARNING] Derived/computed values are produced by memoized selectors or hooks, not recomputed inline inside JSX or effects.

## Prop Drilling & Composition

- `ARCH-COMPOSE-1` [WARNING] Do not thread props through three or more intermediate components (prop drilling). Restructure using composition slots (`children`) or context/store.
- `ARCH-COMPOSE-2` [WARNING] A family of tightly-coupled parts that are always configured together (e.g. `Card`/`CardHeader`/`CardBody`, `List`/`ListItem`) is expressed as compound components sharing implicit context, not as one component with a growing prop surface.
- `ARCH-COMPOSE-3` [WARNING] A boolean/enum prop that switches a component between rendering unrelated markup is replaced with a `children`/render-prop slot.

## Code & Component Reuse

- `ARCH-REUSE-1` [WARNING] Before adding a new component, hook, or utility, check the component inventory and existing shared modules for one that already covers the need — do not duplicate logic that already exists elsewhere in the codebase.
- `ARCH-REUSE-2` [WARNING] Logic or markup duplicated in two or more places is extracted into a shared hook, utility function, or component rather than copy-pasted.
- `ARCH-REUSE-3` [INFO] Genuinely reusable components, hooks, and utilities live in a shared/common location discoverable by the rest of the app — a shared module in a feature-based layout, or the app-wide `components`/`hooks` folder itself in a type-based layout — not buried inside a single feature or domain sub-grouping.

## New Architecture & Legacy Bridge Awareness

`repo-analyst` determines whether a repo has adopted React Native's New Architecture (Bridgeless Mode, TurboModules, Fabric, Codegen, JSI) or still runs the Legacy Architecture (the async bridge, `NativeModules`, the legacy `UIManager`) — apply the relevant rules below to whichever mode a given repo/module is actually running; a repo mid-migration may need both.

- `ARCH-NEW-1` [CRITICAL] Once a repo has adopted Bridgeless Mode, new code does not depend on the legacy bridge (`ReactContext.getBridge()` on native, inspecting `window.__fbBatchedBridge` on JS). Cross-boundary events use TurboModule event emitters or JSI bindings, not the legacy `DeviceEventEmitter` bridge queue.
- `ARCH-NEW-2` [CRITICAL] New native modules define a typed Codegen spec (`TurboModuleRegistry.getEnforcing<Spec>`) rather than untyped `NativeModules.ModuleName` access.
- `ARCH-NEW-3` [WARNING] Synchronous methods exposed via JSI/TurboModules complete quickly enough not to block the main/UI thread — ties to the blocking threshold in `RN-PERF-JSTHREAD-1` (`standards/react-native/rn-performance.md`).
- `ARCH-NEW-4` [WARNING] New custom native views implement Fabric specs via Codegen (`codegenNativeComponent`) rather than a legacy `ViewManager`/`RCTViewManager`.
- `ARCH-NEW-5` [INFO] A legacy module still running through the Bridgeless Interop Layer is flagged with a recommendation to migrate directly to a TurboModule/Fabric component rather than left indefinitely on the interop path.
- `ARCH-LEGACY-1` [WARNING] On the Legacy Architecture, high-frequency data (raw touch sequences, scroll offsets, per-frame calculations) is not serialized over the JSON bridge via `NativeModules`. Where the project already depends on a worklet-capable library (Reanimated, `react-native-gesture-handler`), that data is routed through its worklets/native handlers instead; where it does not, route it through JSI directly. This rule does not mandate adopting a new animation/gesture dependency solely to satisfy it — a repo with neither is flagged at `[INFO]` for the architectural gap, not failed at `[WARNING]` for lacking a library it was never asked to add.
- `ARCH-LEGACY-2` [WARNING] On the Legacy Architecture, native modules are loaded lazily rather than eagerly at app startup; a module set that loads eagerly is flagged for migration toward TurboModules' lazy loading.

## References

- This document is a living baseline; reviewers should flag structural gaps found during review rather than working around them silently.
- Where a repo's existing structure predates these principles, `repo-analyst`'s detected conventions take precedence for that repo until a migration is planned — see `standards/react-native/rn-navigation.md` for the same repo-detection-first approach applied to navigation.
- See the "AI Agent Execution Directives" section in `standards/react-native/react-native-coding-standards.md` for the severity hierarchy, citation format, and anti-hallucination thresholds that govern how findings against the IDs above are reported.
