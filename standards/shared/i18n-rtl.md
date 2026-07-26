# i18n & RTL Standards

## Purpose & Scope

These standards apply to any screen, component, or copy that reaches an end user, reviewed by whichever platform's code-reviewer agent is active (`rn-code-reviewer`, `ios-code-reviewer`, `android-code-reviewer`, `react-code-reviewer`) via `/review-code`. Each rule states a **platform-neutral requirement** (the normative rule); where a platform's concrete API or library adds real value, it appears as a labelled example (React Native / iOS / Android / React). Each bullet below carries a stable ID so review findings can cite the exact rule they violate. This list is a baseline, not exhaustive — reviewers should use judgment for app-specific risk.

## Translation & Copy Conventions

- `I18N-COPY-1` No hardcoded user-facing strings in components — every user-visible string resolves through the platform's localization lookup.
  - React Native / React: `t()` / `useTranslation()` (i18next).
  - iOS: `String(localized:)` / String Catalogs / `NSLocalizedString`.
  - Android: `getString(R.string.…)` / string resources.
- `I18N-COPY-2` Translation keys are namespaced per feature (e.g. `checkout.summary.title`), not a single flat global namespace, so keys don't collide across features.
- `I18N-COPY-3` Dynamic values are passed via the localization system's parameter interpolation, never built with string concatenation or template literals around a translated string.
  - React Native / React: `t('greeting', { name })`.
  - iOS: `String(format:)` / catalog format arguments.
  - Android: `getString(id, args…)` with positional `%1$s` placeholders.
- `I18N-COPY-4` Pluralization uses the localization system's plural-category support (CLDR categories) instead of manual `count === 1 ? ... : ...` branching.
  - React Native / React: `react-i18next` plural key suffixes (`_one`/`_other`, etc.).
  - iOS: `.stringsdict` / automatic plural variants.
  - Android: `<plurals>` / `getQuantityString`.
- `I18N-COPY-5` New keys are added to every supported locale's resource file in the same change, even if only the base locale has a real translation initially (placeholder, not missing).

## RTL Layout Rules

- `I18N-RTL-1` Layout uses direction-relative (`start`/`end`) spacing and positioning instead of physical `left`/`right`, so layout mirrors automatically under RTL.
  - React Native: `start`/`end`, `marginStart`/`marginEnd`, `paddingStart`/`paddingEnd`.
  - iOS: leading/trailing Auto Layout constraints.
  - Android: `paddingStart`/`paddingEnd`, `layoutDirection`.
  - React: CSS logical properties (`margin-inline-start`, `inset-inline-end`, etc.).
- `I18N-RTL-2` Directional layouts derive their order from the resolved layout direction (or the platform's automatic mirroring), not a hardcoded visual order that assumes LTR.
  - React Native: `I18nManager.isRTL` / automatic mirroring of `flexDirection: 'row'`.
  - iOS: `effectiveUserInterfaceLayoutDirection`.
  - Android: `View.getLayoutDirection()`.
  - React: `dir="rtl"` + CSS logical/flex properties.
- `I18N-RTL-3` Icons and imagery that imply direction (back/forward arrows, chevrons, progress indicators) are explicitly flipped for RTL — automatic layout mirroring does not flip raster/vector icon content on its own.
- `I18N-RTL-4` Text alignment uses `start`/`end` (direction-aware defaults), not hardcoded `left`/`right` alignment.
  - React Native: `textAlign: 'start'`/`'end'`, `writingDirection`-aware defaults.
  - iOS: `.natural` text alignment.
  - Android: `textAlignment="viewStart"`/`"viewEnd"`.
  - React: `text-align: start`/`end`.

## Bidirectional Testing

- `I18N-TEST-1` Every new screen or flow is manually checked in both an LTR locale and an RTL locale (e.g. Hebrew or Arabic) before merge — this is a required check in `/review-code`, not optional polish.
- `I18N-TEST-2` Bidirectional checks include interactive elements (swipe gestures, sliders, carousels), not just static layout — gesture direction should also mirror under RTL where the platform expects it.

## Locale-Aware Formatting

- `I18N-FMT-1` Dates, times, numbers, and currency are formatted via the platform's locale-aware formatters — never built by manually slicing/concatenating date or number parts.
  - React Native / React: `Intl.DateTimeFormat` / `Intl.NumberFormat`.
  - iOS: `DateFormatter` / `NumberFormatter` / `.formatted()`.
  - Android: `DateTimeFormatter` / `NumberFormat` (ICU).
- `I18N-FMT-2` Currency formatting includes the correct currency symbol and decimal/grouping conventions for the active locale, not a hardcoded `$`/`.`/`,`.

## References

- Platform i18n documentation: `i18next`/`react-i18next` (React Native, React), Apple String Catalogs / `NSLocalizedString` (iOS), Android string resources & `<plurals>` (Android).
- This document is a living baseline; reviewers should flag standards gaps found during review rather than working around them silently.
