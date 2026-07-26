# Accessibility Standards

## Purpose & Scope

These standards apply to any screen or component reviewed by whichever platform's code-reviewer agent is active (`rn-code-reviewer`, `ios-code-reviewer`, `android-code-reviewer`, `react-code-reviewer`), and are used by the matching platform feature-developer agent during implementation. Each rule states a **platform-neutral requirement** (the normative rule); where a platform's concrete API adds real value, it appears as a labelled example (React Native / iOS / Android / React), and any TV form-factor difference is noted inside that platform's example. They loosely follow WCAG 2.1 and the platform accessibility guidelines from Apple and Google; see [References](#references). Each bullet carries a stable ID so review findings can cite the exact rule they violate. This list is a baseline, not exhaustive — reviewers should use judgment for app-specific risk.

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

## Screen Reader Testing

- `A11Y-SR-1` New or changed interactive flows are manually walked through with VoiceOver (iOS) and TalkBack (Android) before merging — automated checks alone are not sufficient.
- `A11Y-SR-2` Screen-reader focus order follows the visual reading order; modals/overlays trap and manage focus so they don't break that order.
  - React Native: `accessibilityViewIsModal` / explicit focus management.
  - iOS: `accessibilityViewIsModal` / `.accessibilitySortPriority`.
  - Android: `accessibilityTraversalBefore`/`After`, focus containment.
  - React: a focus trap + `aria-modal="true"`.
- `A11Y-SR-3` Dynamic content changes (errors, loading states, toasts) are announced to assistive tech via a live-region / announcement mechanism, not silently rendered.
  - React Native: `AccessibilityInfo.announceForAccessibility`.
  - iOS: `UIAccessibility.post(notification: .announcement, ...)`.
  - Android: `announceForAccessibility` / live region.
  - React: `aria-live`.

## References

- W3C Web Content Accessibility Guidelines (WCAG) 2.1.
- Apple Human Interface Guidelines — Accessibility.
- Android Accessibility developer guidelines (TalkBack, minimum touch target size).
- This document is a living baseline; reviewers should flag standards gaps found during review rather than working around them silently.
