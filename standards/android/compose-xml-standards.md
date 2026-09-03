# Compose / XML Standards

## Purpose & Scope

These standards govern the Android UI layer — Jetpack Compose, XML/View-based UI (ViewBinding/DataBinding, Fragments, Activities), RecyclerView-backed lists, and resource usage. They are implemented by `android-feature-developer` via `/implement-task` and reviewed by `android-code-reviewer` via `/review-code`. Each bullet carries a stable `AND-UI-*` ID. This list is a baseline, not exhaustive. **Which subsection applies depends on the surface the task touches:** a Compose screen applies `AND-UI-COMPOSE-*`, an XML/Fragment screen applies `AND-UI-XML-*`, and a mixed project applies whichever matches each changed surface. Do not migrate a surface from XML to Compose (or the reverse) unless the DD explicitly approves it. Follow the repository's existing design-system components, theme, and tokens rather than introducing new ones.

## Jetpack Compose

- `AND-UI-COMPOSE-1` Composables use the repository's existing design-system components and theme tokens (colors, typography, spacing) rather than hardcoded values or ad-hoc `Modifier` dimensions.
- `AND-UI-COMPOSE-2` Composables are stateless where practical; state is hoisted to the level the repo hoists it to (ViewModel or a caller), and business logic is not performed inside a `@Composable`.
- `AND-UI-COMPOSE-3` `LazyColumn`/`LazyRow` items declare a stable, unique `key`; item content does not rely on composition position for identity.
- `AND-UI-COMPOSE-4` `remember`, `rememberSaveable`, and `derivedStateOf` are used intentionally — expensive computations are `remember`ed with correct keys, and state that must survive recomposition vs. configuration change uses the matching API.
- `AND-UI-COMPOSE-5` Side-effect APIs (`LaunchedEffect`, `DisposableEffect`, `SideEffect`, `produceState`) use correct keys so effects restart when — and only when — their inputs change; `DisposableEffect` cleans up in `onDispose`.
- `AND-UI-COMPOSE-6` Unnecessary recomposition is avoided: unstable lambdas/objects passed to children are hoisted or remembered, and state reads are scoped as narrowly as the layout allows rather than read high in the tree.
- `AND-UI-COMPOSE-7` Accessibility semantics are preserved — `contentDescription`/`Modifier.semantics`, merged semantics for grouped rows, correct roles and state — per `standards/shared/accessibility.md` (`A11Y-*`).
- `AND-UI-COMPOSE-8` `@Preview` composables are added only if the project already uses previews, and previews do not perform real I/O or require live dependencies.

## XML, Views, Fragments & Activities

- `AND-UI-XML-1` View access uses the binding mechanism already in the repo (ViewBinding or DataBinding); `findViewById` is not reintroduced into a project that has moved to binding.
- `AND-UI-XML-2` A Fragment's binding reference is cleared in `onDestroyView` (the `_binding = null` pattern) so the view hierarchy is not leaked past the fragment-view lifecycle.
- `AND-UI-XML-3` Views, Activities, and Fragments are not retained beyond their lifecycle — listeners, observers, and callbacks registered on them are removed/scoped so they do not outlive the view.
- `AND-UI-XML-4` Observers and flow collectors in a Fragment use `viewLifecycleOwner` (not the Fragment itself) and a lifecycle-aware scope, so they stop when the view is destroyed.
- `AND-UI-XML-5` Layouts reuse existing styles, themes, dimensions, drawables, and design-system components; equivalent resources are not duplicated.
- `AND-UI-XML-6` View hierarchies are kept shallow (`ConstraintLayout`/merge where appropriate) to avoid deep nesting and overdraw; a new deeply-nested hierarchy is not added where a flatter one is idiomatic in the repo.
- `AND-UI-XML-7` State is preserved across configuration change per the feature's needs (via the ViewModel and, where relevant, `onSaveInstanceState`), not dropped on rotation.

## RecyclerView & Lists

- `AND-UI-LIST-1` Existing adapters and item models are reused where appropriate rather than creating a parallel adapter for the same item type.
- `AND-UI-LIST-2` List updates use `DiffUtil`/`ListAdapter` (or the repo's established diffing) rather than calling `notifyDataSetChanged()` for a full refresh when only some items changed.
- `AND-UI-LIST-3` `setHasStableIds(true)` is used only when items genuinely have stable, unique IDs; otherwise stable IDs are not claimed.
- `AND-UI-LIST-4` Recycled-view state does not leak between bindings — every `onBindViewHolder` fully sets each mutable view property (no reliance on a previous binding's leftover state).
- `AND-UI-LIST-5` Empty, loading, error, and pagination states are handled explicitly for the list per the DD, not left as a silently blank view.
- `AND-UI-LIST-6` List rows expose correct accessibility semantics and focus order per `standards/shared/accessibility.md` (`A11Y-*`).

## Resources, Localization & RTL

- `AND-UI-RES-1` No hardcoded user-visible strings in code or layouts — all user-facing text comes from string resources, tying to `standards/shared/i18n-rtl.md` (`I18N-COPY-*`).
- `AND-UI-RES-2` Layouts use start/end attributes (`layout_marginStart`/`End`, `paddingStart`/`End`, `layout_constraintStart`/`End`) rather than left/right, so they mirror correctly under RTL (`I18N-RTL-*`).
- `AND-UI-RES-3` Direction-implying icons/imagery are mirrored for RTL (`autoMirrored`/RTL-aware drawables) rather than assuming LTR.
- `AND-UI-RES-4` Resource names are semantic (`ic_back`, `spacing_medium`), and dimensions/colors/typography reuse the existing token resources rather than duplicating near-identical values.
- `AND-UI-RES-5` No PII or placeholder personal data is hardcoded into layouts, previews, or sample data shipped in the build.

## Accessibility

Android-specific implementation of the shared `A11Y-*` requirements, which
`standards/shared/accessibility.md` owns and this section does not restate. These rules
say **how** the requirement is met on Android; the requirement itself, and whether it
applies, is settled there.

- `AND-UI-A11Y-1` Non-text content carries a `contentDescription`; decorative content passes `null` rather than a placeholder string. In Compose set roles through `Modifier.semantics { role = Role.Button }` (or the `clickable`/`toggleable` overload that takes one); in Views set them through the accessibility delegate.
- `AND-UI-A11Y-2` State is exposed programmatically, not through styling: `stateDescription`, `heading()`, `error(...)`, `progressBarRangeInfo` and `ProgressBarRangeInfo` in `Modifier.semantics`, and `toggleable`/`selectable` for controls that carry a state. A `Modifier.clickable` on a styled `Box` announces nothing about what it is.
- `AND-UI-A11Y-3` Text uses `sp` and interactive targets meet the platform minimum of **48dp** — `Modifier.minimumInteractiveComponentSize()` in Compose, `minWidth`/`minHeight` or a `TouchDelegate` in Views. Layouts do not pin heights that clip when the font scale increases.
- `AND-UI-A11Y-4` Where visual order and composition order disagree, traversal is declared with `isTraversalGroup = true` on the container and `traversalIndex` (a `Float`, default `0f`, lower first) on its children; in Views, `accessibilityTraversalBefore`/`accessibilityTraversalAfter`.
- `AND-UI-A11Y-5` Focus lifecycle is explicit: `requestFocus` on screen entry, a `TYPE_WINDOW_STATE_CHANGED` event (or `paneTitle` in `Modifier.semantics`) on a pane change, and focus returned to the invoking control after a dialog or sheet is dismissed.
- `AND-UI-A11Y-6` Content that is present but not currently perceivable is hidden with `Modifier.clearAndSetSemantics {}` or `importantForAccessibility="no-hide-descendants"`. `alpha = 0f` and zero-size layouts do not remove a node from the semantics tree.
- `AND-UI-A11Y-7` Collections supply `collectionInfo = CollectionInfo(rowCount, columnCount)` on the container and `collectionItemInfo = CollectionItemInfo(...)` on each item, so position is announced rather than inferred. This applies to `LazyColumn`, `LazyVerticalGrid` and `RecyclerView` alike.
- `AND-UI-A11Y-8` Recycled views reset accessibility state. In Views, clear `contentDescription`, state and custom actions in `onViewRecycled` or on rebind; in Compose, give `LazyColumn`/`LazyRow` items a stable `key` so semantics are not carried across items. Stale semantics on a recycled row is the usual source of phantom TalkBack nodes.
- `AND-UI-A11Y-9` Dynamic updates use `liveRegion = LiveRegionMode.Polite` — `Assertive` only for content that must interrupt — or `announceForAccessibility` in Views. Continuously changing values are coalesced rather than announced per change.
- `AND-UI-A11Y-10` A merged container re-exposes its children's actions through `customActions = listOf(CustomAccessibilityAction(label, action))` in `Modifier.semantics`, or `ViewCompat.addAccessibilityAction` in Views. Timer-driven advancement is suspended while `AccessibilityManager.isTouchExplorationEnabled` reports an active touch-exploration service.

## Android TV Context (device_type: tv)

**[Applies only on an established TV surface — `device_type: tv` arrives confirmed and is never re-detected here. Where no TV surface is established this section is entirely N/A and none of its rules may be raised. Every rule below is additive: the base `AND-UI-*` rules apply on a TV surface unchanged, and nothing here relaxes or forks one.]**

Focusability itself and a visible focus highlight are already owned by `A11Y-TOUCH-1` and `A11Y-TOUCH-2` in `standards/shared/accessibility.md`; the rules below add distinct obligations and do not restate them. This organization's TV surface uses a custom in-house framework, so every rule states a behavior, never an API or library. A rule tagged *(derived)* or *(repo-convention)* is this repository's own policy — Android publishes no requirement behind it.

- `AND-UI-TV-FOCUS-1` Focus rests on an actionable element whenever a TV screen appears or goes idle; nothing holding focus is a defect, not an acceptable transient.
- `AND-UI-TV-FOCUS-2` When the focused element disappears or its container reloads, focus moves to a fallback the screen named in advance rather than being left unrecoverable. *(derived)*
- `AND-UI-TV-FOCUS-3` Exactly one element carries the focused treatment, and focused, pressed, selected, and disabled read as distinct states rather than one reused highlight.
- `AND-UI-TV-OVERSCAN-1` Text, controls, and always-visible elements stay inside the repository's overscan-safe inset; decorative background may bleed past it, never clipped to it.
- `AND-UI-TV-OVERSCAN-2` Android's own guidance gives conflicting insets, so the repository defines one dimension with its reference resolution, and every TV screen references it. *(derived)*
- `AND-UI-TV-LAYOUT-1` TV surfaces are landscape and fill the screen with an opaque background; portrait-only layouts, translucent themes, and non-black letterbox bars are not introduced.
- `AND-UI-TV-SCALE-1` Type, icon, and control sizing follows the repository's TV scale rather than the phone ramp, validated at its stated TV reference resolution and density.
- `AND-UI-TV-SCALE-2` Components that cannot flex are not sized in `sp`, and font-scale growth is absorbed inside the overscan-safe area rather than past the screen edge (`A11Y-FONT-2`/`A11Y-FONT-3`).
- `AND-UI-TV-COMP-1` TV screens reuse the repository's existing TV components and their focus treatment; a one-off focusable widget is not added where a component covers the interaction. *(repo-convention)*
- `AND-UI-TV-IME-1` A TV text field declares an input type the platform keyboard supports and places that keyboard clear of the field it is filling.

## References

- Jetpack Compose guidance and the Android Views/Fragments lifecycle documentation (developer.android.com).
- Accessibility *requirements* (`A11Y-*`) and i18n/RTL rules are owned by `standards/shared/accessibility.md` and `standards/shared/i18n-rtl.md`; this document points at them rather than restating them. The `AND-UI-A11Y-*` rules above add only the Android implementation path for those requirements.
- [Compose accessibility](https://developer.android.com/develop/ui/compose/accessibility), [semantics](https://developer.android.com/develop/ui/compose/accessibility/semantics) and [traversal order](https://developer.android.com/develop/ui/compose/accessibility/traversal) — the sources the `AND-UI-A11Y-*` APIs are grounded in.
- This document is a living baseline; flag standards gaps found during implementation or review rather than working around them silently.
