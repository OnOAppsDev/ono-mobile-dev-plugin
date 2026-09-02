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
- Accessibility and i18n/RTL rules are owned by `standards/shared/accessibility.md` and `standards/shared/i18n-rtl.md`; this document points at them rather than restating them.
- This document is a living baseline; flag standards gaps found during implementation or review rather than working around them silently.
