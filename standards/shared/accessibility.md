# Accessibility Standards

## Purpose & Scope

These standards apply to any screen or component reviewed by whichever platform's code-reviewer agent is active (`rn-code-reviewer`, `ios-code-reviewer`, `android-code-reviewer`, `react-code-reviewer`), and are used by the matching platform feature-developer agent during implementation. Each rule states a **platform-neutral requirement** (the normative rule); where a platform's concrete API adds real value, it appears as a labelled example (React Native / iOS / Android / React), and any TV form-factor difference is noted inside that platform's example. They loosely follow WCAG 2.1 and the platform accessibility guidelines from Apple and Google; see [References](#references). Each bullet carries a stable ID so review findings can cite the exact rule they violate. This list is a baseline, not exhaustive — reviewers should use judgment for app-specific risk.

**Verification reach.** Which of these rules can be proven mechanically and which cannot is governed by `standards/shared/verification.md`, which owns the Tier 1 / Tier 2 / Tier 3 vocabulary — this document does not restate it. The distinction matters here more than in most domains: most rules below have a Tier 1 component that proves an attribute is present, and a Tier 3 component — whether the resulting experience is actually usable — that only a screen-reader walkthrough on a device can settle. Per `VERIFY-2`, a green automated audit is never evidence that `A11Y-SR-1` was satisfied.

## Accessibility Roles, Labels & State

- `A11Y-ROLES-1` Every interactive element exposes a semantic role matching its function (`button`, `link`, `switch`, `header`, etc.).
  - React Native: `accessibilityRole` on `Pressable`/`TouchableOpacity`/custom buttons.
  - iOS: `UIAccessibilityTraits` / `.accessibilityAddTraits(...)`.
  - Android: semantics `role` / `contentDescription` with role semantics.
  - React: `role`.
- `A11Y-ROLES-2` Every interactive element without adjacent visible text exposes an accessible label describing its action, not its appearance (e.g. "Delete item", not "Trash icon").
  - React Native: `accessibilityLabel`.
  - iOS: `.accessibilityLabel`.
  - Android: `contentDescription`.
  - React: `aria-label` (or associated `<label>`).
- `A11Y-ROLES-3` Stateful controls (toggles, checkboxes, tabs, expandable sections) expose their state (`checked`, `selected`, `expanded`, `disabled`) programmatically, not via visual styling alone.
  - React Native: `accessibilityState`.
  - iOS: `.accessibilityValue` / traits.
  - Android: `stateDescription` / toggleable semantics.
  - React: `aria-checked` / `aria-selected` / `aria-expanded` / `aria-disabled`.
- `A11Y-ROLES-4` Purely decorative images/icons are hidden from assistive tech so screen readers don't announce them.
  - React Native: `accessible={false}` / `accessibilityElementsHidden` / `importantForAccessibility="no"`.
  - iOS: `.accessibilityHidden(true)`.
  - Android: `importantForAccessibility="no"`.
  - React: `aria-hidden="true"` or empty `alt=""`.
- `A11Y-ROLES-5` Grouped content that should be read as one unit (e.g. a list row with title + subtitle) is exposed as a single element with a combined label, not separate announcements per child.
  - React Native: `accessible={true}` on the container with a combined `accessibilityLabel`.
  - iOS: `.accessibilityElement(children: .combine)`.
  - Android: `focusable` container with merged semantics.
  - React: a grouping element with a single label.

- `A11Y-ROLES-6` Grouping preserves independently actionable children: when a container is exposed as one element, any action its children offered separately is re-exposed on the container as a named custom action, so the action does not become unreachable.
  - React Native: `accessibilityActions` + `onAccessibilityAction` on the grouped container.
  - iOS: `.accessibilityAction(named:)` / `accessibilityCustomActions`.
  - Android: `customActions` in `Modifier.semantics` / `ViewCompat.addAccessibilityAction`.
  - React: keep the control separately focusable, or expose an equivalent labelled control.
- `A11Y-ROLES-7` An error message is programmatically associated with the field it describes, so assistive technology reaches the message from the field rather than relying on visual proximity.
  - React Native: `accessibilityLabelledBy` (Android) / include the error in the field's `accessibilityLabel` or `accessibilityHint` (iOS).
  - iOS: `.accessibilityValue` / a combined label carrying the error text.
  - Android: `error(...)` in `Modifier.semantics`; `TextInputLayout.setError` in Views.
  - React: `aria-describedby` / `aria-errormessage` with `aria-invalid`.
## Touch Target Sizes

- `A11Y-TOUCH-1` Interactive elements meet the platform's minimum activation target (44x44pt on iOS, 48x48dp on Android), expanding the interactive region when the visual element is smaller. On TV form factors there is no touch target — the equivalent requirement is a reliably focusable element with a clearly visible focus state.
  - React Native: `hitSlop` or padding (mobile); on TV builds, ensure focusability + a visible focus style instead.
  - iOS: enlarge the frame / `contentEdgeInsets` (mobile). TV (tvOS): the focus engine drives navigation — ensure the element is focusable with a focus effect, not a tap-size target.
  - Android: `minWidth`/`minHeight` or `TouchDelegate` (mobile). TV: no touch — ensure D-pad focusability and a visible focus highlight.
  - React: adequate padding / min target size (browser). Smart TV: remote/D-pad focusability with a visible focus ring.
- `A11Y-TOUCH-2` Adjacent interactive elements have enough spacing to avoid accidental activation, even after the interactive region is expanded to the minimum target size (or, on TV, enough separation that D-pad focus moves predictably).

## Dynamic Font Scaling

- `A11Y-FONT-1` Text respects the OS font-scale / Dynamic Type setting by default — opting out is only done with a specific, documented reason (e.g. a fixed-size icon label), never as a default choice.
  - React Native: avoid `allowFontScaling={false}`.
  - iOS: Dynamic Type / `adjustsFontForContentSizeCategory`.
  - Android: scalable `sp` text units.
  - React: relative units (`rem`/`em`); respect browser zoom.
- `A11Y-FONT-2` Layouts that contain text are tested at large accessibility font sizes and don't clip, truncate critical information, or overlap other elements.
- `A11Y-FONT-3` Containers around text grow with their content (minimum height, not a hard fixed height) so they don't clip when the font scales up.
  - React Native: `minHeight` / `flexWrap` instead of a fixed pixel height.
  - iOS: Auto Layout intrinsic content size.
  - Android: `wrap_content` / `minHeight`.
  - React: `min-height` / `height: auto`.

## Colour & Contrast

- `A11Y-CONTRAST-1` Text and meaningful non-text elements meet WCAG AA contrast against their background: 4.5:1 for body text, 3:1 for large text and for meaningful icons, borders and focus indicators. Text drawn over photography, gradients or video is measured against its worst-case background, not its best case.
  - React Native / iOS / Android / React: verify the rendered result; a token pair that passes on one surface can fail on another.
- `A11Y-CONTRAST-2` Meaning is never carried by colour alone. Any distinction shown by colour — error, success, selection, required, availability — is also carried by text, an icon, a shape or a state the platform exposes programmatically.

## Focus & Traversal Lifecycle

- `A11Y-FOCUS-1` On navigation to a new screen, assistive-technology focus is placed deliberately — normally on the screen's title or first meaningful element — and the screen change is announced. A push that leaves focus where it was is silent to a screen-reader user.
  - React Native: `AccessibilityInfo.sendAccessibilityEvent(handle, 'focus')`; on Android also emit a window-state-change event.
  - iOS: `UIAccessibility.post(notification: .screenChanged, argument:)`.
  - Android: `TYPE_WINDOW_STATE_CHANGED`; `paneTitle` in `Modifier.semantics` for pane-level changes.
  - React: move focus to the new view's heading and announce the route change.
- `A11Y-FOCUS-2` Modals, dialogs, sheets and overlays own the full focus lifecycle: focus moves **into** the surface when it opens, is **contained** while it is open so traversal cannot reach the content behind it, and is **restored to the control that invoked it** when it closes. Restoring focus is the half most often skipped, and its absence strands the user at the top of the screen.
  - React Native: `accessibilityViewIsModal` (iOS) paired with `importantForAccessibility="no-hide-descendants"` on the background (Android); store and restore the invoking element's handle.
  - iOS: `accessibilityViewIsModal` on the presented view; re-post focus to the trigger on dismiss.
  - Android: `importantForAccessibility="no-hide-descendants"` on the background; `requestFocus` on the trigger after dismiss.
  - React: a focus trap with `aria-modal="true"`; return focus to the trigger on close.
- `A11Y-FOCUS-3` Focus is never dropped to nothing. After a re-render, a list refresh, a filter change or the removal of the focused item, focus moves to a deliberate destination — a neighbouring item, the container, or a restated context — rather than being lost to the window root.
- `A11Y-FOCUS-4` Content that is present in the hierarchy but not currently perceivable is hidden from assistive technology: off-screen pages, collapsed sections, content behind an overlay, and items scrolled outside a container's visible bounds. This is distinct from `A11Y-ROLES-4`, which hides content that is decorative; this rule hides content that is meaningful but not currently available.
  - React Native: `accessibilityElementsHidden` (iOS) **and** `importantForAccessibility="no-hide-descendants"` (Android) — each is single-platform, so both are required.
  - iOS: `.accessibilityHidden(true)` on the inactive subtree.
  - Android: `clearAndSetSemantics {}` / `importantForAccessibility="no-hide-descendants"`.
  - React: `aria-hidden="true"` plus removal from the tab order.

## Collections, Lists & Carousels

- `A11Y-COLLECTION-1` Collections expose their structure and each item's position within it, so a user hears "2 of 5" rather than an unanchored stream of items. Grids expose row and column position. A looping or infinite collection exposes finite, non-repeating position information — a carousel that has cycled three times announces item 2 of 5, never item 47.
  - React Native: include position in the item's `accessibilityLabel` or `accessibilityValue`; RN exposes no collection API of its own.
  - iOS: `.accessibilityValue` carrying position; `UIAccessibilityTraits.tabBar` where appropriate.
  - Android: `collectionInfo` = `CollectionInfo(rowCount, columnCount)` on the container and `collectionItemInfo` = `CollectionItemInfo(...)` on items.
  - React: `role="list"`/`"listitem"`; `aria-setsize` and `aria-posinset`.
- `A11Y-COLLECTION-2` Recycled or reused item views reset every accessibility property they set — label, state, custom actions, hidden flag. A recycled row that keeps the previous item's accessibility state produces duplicate or phantom nodes: content the user hears that is not on screen, or a stale label on a new item.
  - Android: clear semantics in `onViewRecycled` / on key change; in Compose, key `LazyColumn` items so state is not carried across.
  - React Native: derive every accessibility prop from the item's own data; never from mutable state held outside the item.
- `A11Y-COLLECTION-3` A partially visible item shown as a visual affordance — the edge of the next card hinting that the list scrolls — is not exposed as a reachable element while it is only a hint. When an item does become reachable, moving focus to it scrolls it **fully** into view; focus must never land on content that is clipped or off-screen.
- `A11Y-COLLECTION-4` A change of page or position announces the new position, so a swipe or a programmatic advance is not silent.
- `A11Y-COLLECTION-5` Auto-advancing content is **suspended while a screen reader is active.** A carousel that advances on a timer moves the content out from under a user who is still reading it, and repeatedly steals or invalidates focus.
  - React Native: gate on `AccessibilityInfo.isScreenReaderEnabled()` and the `screenReaderChanged` event.
  - iOS: `UIAccessibility.isVoiceOverRunning` + `voiceOverStatusDidChangeNotification`.
  - Android: `AccessibilityManager.isTouchExplorationEnabled`.
  - React: pause on focus and when a reduced-motion or screen-reader signal is present.
- `A11Y-COLLECTION-6` Scrollable containers expose their scrollability and keep the focused element visible as focus moves. Nested scrollable regions do not trap traversal — a user must be able to leave an inner scroller.

## Screen Reader Testing

- `A11Y-SR-1` New or changed interactive flows are manually walked through with VoiceOver (iOS) and TalkBack (Android) before merging — automated checks alone are not sufficient.
- `A11Y-SR-2` Screen-reader traversal order follows the visual reading order. Where the visual order and the view/DOM order disagree, the intended order is declared explicitly rather than left to the platform's default. (Modal focus containment is `A11Y-FOCUS-2`.)
  - React Native: order the view hierarchy to match; group with `accessible={true}` containers.
  - iOS: `.accessibilitySortPriority` / `accessibilityElements`.
  - Android: `traversalIndex` / `isTraversalGroup` in `Modifier.semantics`; `accessibilityTraversalBefore`/`After` in Views.
  - React: DOM order first; `aria-flowto` only as a last resort.
- `A11Y-SR-3` Dynamic content changes (errors, loading states, toasts) are announced to assistive tech via a live-region / announcement mechanism, not silently rendered.
  - React Native: `AccessibilityInfo.announceForAccessibility`.
  - iOS: `UIAccessibility.post(notification: .announcement, ...)`.
  - Android: `announceForAccessibility` / live region.
  - React: `aria-live`.
- `A11Y-SR-4` Announcements use a politeness level matching their urgency and do not flood: a value that changes continuously (a slider drag, a progress tick, a keystroke-driven count) is not announced on every change. Assertive interruption is reserved for content the user must hear immediately.
  - React Native: `accessibilityLiveRegion="polite"|"assertive"` (Android); throttle `AccessibilityInfo.announceForAccessibility`.
  - iOS: `.announcement` notifications, coalesced rather than posted per change.
  - Android: `liveRegion = LiveRegionMode.Polite` or `Assertive` in `Modifier.semantics`.
  - React: `aria-live="polite"` / `"assertive"`.
- `A11Y-SR-5` Content that disappears on a timer stays available long enough to be reached by assistive technology, or the information it carries is reachable by another path. A message a screen-reader user cannot arrive at before it is dismissed has not been delivered.
  - Android: honour `AccessibilityManager.getRecommendedTimeoutMillis`.
  - React Native: `AccessibilityInfo.getRecommendedTimeoutMillis` (Android); avoid auto-dismiss as the only path on both platforms.

## Motion

- `A11Y-MOTION-1` Information conveyed by motion has a non-animated equivalent, and reduced-motion settings are honoured without losing that information. Disabling an animation removes the movement, never the meaning it carried.
  - React Native: `AccessibilityInfo.isReduceMotionEnabled()` + the `reduceMotionChanged` event.
  - iOS: `UIAccessibility.isReduceMotionEnabled`.
  - Android: the system `TRANSITION_ANIMATION_SCALE` / `ANIMATOR_DURATION_SCALE` settings.
  - React: the `prefers-reduced-motion` media query.


## References

- W3C Web Content Accessibility Guidelines (WCAG) 2.1 — including the AA contrast ratios cited by `A11Y-CONTRAST-1`.
- `standards/shared/verification.md` — verification tiers and how unprovable obligations are recorded.
- Apple Human Interface Guidelines — Accessibility.
- Android Accessibility developer guidelines (TalkBack, minimum touch target size).
- This document is a living baseline; reviewers should flag standards gaps found during review rather than working around them silently.
