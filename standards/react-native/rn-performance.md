# React Native Performance Standards

## Purpose & Scope

These standards apply to React Native app code audited by the `rn-performance-reviewer` agent via `/review-code` (diff-scoped) and `/prepare-mobile-release` (release-scoped). Extracted from `rn-performance-reviewer`'s prior inline instructions so findings can cite a stable ID instead of restating the concern as prose each time. Each bullet below carries a stable `RN-PERF-*` ID. This is a baseline, not exhaustive — flag suspected issues that need profiling to confirm as such, rather than stating a guess as a confirmed Blocking finding.

## Re-renders

- `RN-PERF-RERENDER-1` [WARNING] Apply memoization (`React.memo`, `useMemo`, `useCallback`) when passing non-primitive props, complex derived calculations, or heavy render trees to child components. **Exemptions:** standard primitive UI components (`<Text>`, `<View>`, `<TouchableOpacity>`, and equivalents) receiving scalar primitives (`string`, `number`, `boolean`) or a simple inline handler (a one-line arrow function with no closure over non-primitive state) do NOT require `useCallback`/`useMemo`, unless that component is wrapped in `React.memo` or is rendered inside a list with more than 20 items — in either of those cases the exemption no longer applies and memoization is required.
- `RN-PERF-RERENDER-2` [WARNING] Inline callbacks/objects passed as props to expensive children are stabilized (e.g. `useCallback`, hoisted constants) rather than recreated every render.
- `RN-PERF-RERENDER-3` [WARNING] Derived values (filtering, sorting, formatting, aggregating) use `useMemo` when the computation is non-trivial or the input is large.
- `RN-PERF-RERENDER-4` [WARNING] Callbacks passed to children — especially list items and memoized components — use `useCallback` with a correct dependency array.
- `RN-PERF-RERENDER-5` [WARNING] A component that re-renders on every parent render despite unchanged props is investigated (unmemoized context value, unstable selector reference, missing `React.memo`).
- `RN-PERF-RERENDER-6` [WARNING] Context provider values are memoized (`useMemo`) so consumers don't re-render from a new object/array literal on every provider render.

## List Virtualization

- `RN-PERF-LIST-1` [WARNING] A list backed by data whose size isn't fixed and small at build time — pagination, search results, user-generated content, or anything that can grow past roughly a screen's worth of rows — renders via `FlatList`/`FlashList` with a correct `keyExtractor` (and `getItemLayout` where row height is known), not `ScrollView` with `.map()`. A short, fixed list (a settings screen's dozen static rows) is not this finding — `ScrollView` is the right choice there, and citing this rule against it is a false finding.

## JS-Thread Blocking

- `RN-PERF-JSTHREAD-1` [WARNING] Heavy synchronous work on the JS thread is batched, debounced, or moved off-thread. "Heavy" is quantified as: a synchronous loop iterating over more than 100 items, or any synchronous operation (JSON parsing of a large payload, synchronous crypto, string/regex processing) that blocks the JS thread for more than 16ms (one frame at 60fps). Work below both thresholds does not require batching/offloading under this rule.

## Animations & Deferred Work

- `RN-PERF-ANIM-1` [WARNING] `Animated` API animations set `useNativeDriver: true` wherever the animated properties support it (`transform`, `opacity`), so the animation runs on the native/UI thread instead of the JS thread. An animation that must drive a native-driver-incompatible property (layout properties like `width`/`height`) is flagged for migration to Reanimated or `LayoutAnimation` rather than left running synchronously on the JS thread with no native driver.
- `RN-PERF-ANIM-2` [WARNING] Gesture- or scroll-driven per-frame updates run on the UI thread via a worklet-based library (e.g. Reanimated) or a native gesture handler, not by reading the gesture/scroll value on the JS thread and re-dispatching a style update every frame. This rule does not require adopting a worklet-based dependency the project doesn't already have — where none exists, cite the JS-thread cost under `RN-PERF-JSTHREAD-1` instead.
- `RN-PERF-DEFER-1` [INFO] Non-urgent work triggered by a user interaction (a heavy computation, a secondary fetch, an analytics call) that would otherwise compete with an in-flight transition or animation is deferred via `InteractionManager.runAfterInteractions` (or the project's equivalent), not run synchronously inside the interaction handler.

## Image Handling

- `RN-PERF-IMAGE-1` [WARNING] Images are requested or resized to the pixel dimensions they render at — the display container's point size × the device's pixel ratio (`PixelRatio.get()`) — not the source asset's native resolution, so a thumbnail-sized view does not load a full-resolution source. `resizeMode` (or the equivalent `resizeMode`/`contentFit` prop on the detected image library) is set explicitly rather than left to the platform default. Where the backend/CDN can serve a resized variant (a `width`/`height` query param or transformation URL), the image is requested at that size rather than fetched full-size and downscaled client-side.

## Bundle Size

- `RN-PERF-BUNDLE-1` [WARNING] A new dependency's contribution to bundle size is stated when it's proposed — measured via the project's bundle-analysis tooling (e.g. `npx react-native-bundle-visualizer`, Metro's bundle report) rather than guessed from the `package.json` diff. A dependency that duplicates one already in the project (a second date library, a second icon set, a second HTTP client) is flagged regardless of its individual size. An unmeasured "this feels big/small" claim is reported at `[INFO]` as needing verification, per the Anti-hallucination thresholds in `react-native-coding-standards.md` — not asserted as a `[WARNING]` finding.

## References

- This document is a living baseline; reviewers should flag standards gaps found during review rather than working around them silently.
- Extracted from `agents/rn-performance-reviewer.md`'s prior inline process description as part of the mobile-division plugin migration.
- See the "AI Agent Execution Directives" section in `standards/react-native/react-native-coding-standards.md` for the severity hierarchy, citation format, and anti-hallucination thresholds that govern how findings against the IDs above are reported.
