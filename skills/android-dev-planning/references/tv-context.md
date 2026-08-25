# `device_type: tv` — the Android TV lane

Read this **only** when the confirmed `device_type` is `tv`. TV is a context signal inside
the Android platform, never a separate platform: there is no TV platform value, agent,
skill, or command.

## Contents

- The governing assumption
- The TV discovery pass
- The toolkit-independent anchor
- TV planning rules
- Scope boundary

## The governing assumption

**An Android TV application may use any implementation model.** Inspect and identify the
actual implementation *before* making any planning or architectural decision. It may use
standard Android TV frameworks, a custom in-house framework, or another repository-specific
solution. **Never assume Leanback, Compose for TV, or any standard Android TV component
set.**

Repository conventions are the source of truth. Android platform documentation is guidance
only and never overrides an existing repository implementation.

## The TV discovery pass

Run this **before proposing anything**, recording evidence for each item that exists and
marking the rest `[unknown]`:

1. **Focus handling** — how focus is moved, tracked, and restored; any custom focus engine or focus manager.
2. **D-pad and remote input** — where key events are received and dispatched; custom key handling; media and remote button support.
3. **Navigation abstractions** — the TV navigation mechanism, which may differ from any mobile navigation in the same repository.
4. **TV UI components** — the component set actually used: framework widgets, Compose for TV, Leanback widgets, or in-house components.
5. **Playback integration** — the player, its lifecycle ownership, surface handling, and playback-state model, where the feature touches playback.
6. **Lifecycle conventions** — TV-specific screen lifecycle handling, including background and resume behavior.
7. **Reusable base classes** — TV base activities, fragments, screens, or view wrappers the feature should extend.
8. **Framework modules** — in-house TV framework modules and their public surface.
9. **Launcher and banner configuration** — the manifest entries that make the app a TV app.
10. **Packaging and release configuration** — TV-specific variants, flavors, or distribution configuration.

## The toolkit-independent anchor

An Android TV app declares its TV entry point in the manifest **regardless of UI toolkit**.
Look for:

- a launcher activity carrying the `android.intent.category.LEANBACK_LAUNCHER` intent
  category — without it the app is invisible in Google Play on TV and absent from the TV
  launcher;
- `<uses-feature android:name="android.hardware.touchscreen" android:required="false">` —
  without it the app does not appear in Google Play on TV;
- a `<uses-feature android:name="android.software.leanback">` declaration, whose `required`
  attribute decides whether the app is TV-only or shared with mobile;
- an `android:banner` attribute on the `<application>` element, localized per language.

These manifest facts confirm a TV target **without implying anything about the UI
framework.** Use them to orient. **Never read them as evidence that the UI is
Leanback-based.** The intent category and the feature flag carry the Leanback name but are
platform and Play-filtering identifiers, not a library dependency — they remain the current
declarations even though the Leanback *library* is now deprecated in favour of Compose for
TV, and they apply equally to a Compose-for-TV or fully custom app.

Likewise, **D-pad traversal, an always-visible focus indicator, and predictable back
behavior are expectations of any TV implementation** — framework, Compose for TV, or fully
custom. Every visible control must be reachable and actionable with a five-way D-pad, and
something must always hold focus. Plan for this regardless of which model is found.

## TV planning rules

- **Never propose migrating** to Leanback, Compose for TV, or another framework unless the
  feature explicitly requests that migration and it is approved.
- **Never silently apply touch or mobile assumptions.** Touch targets, tap and swipe
  gestures, scroll affordances, and soft-keyboard flows do not transfer to a D-pad and
  remote model. On a TV surface `A11Y-TOUCH-1` is satisfied by a reliably focusable element
  with a clearly visible focus state rather than by a touch-target size.
- **Reuse the existing custom components and conventions** wherever they cover the need.
- **Identify gaps or risks in the existing model without redesigning it.** Naming a weakness
  is in scope; unilaterally re-architecting around it is not.
- **If the repository contains both mobile and TV surfaces**, plan only for the confirmed
  `device_type`, and never assume the mobile surface's conventions apply to the TV one.
- **If the TV implementation model cannot be identified from evidence, stop and report it**
  rather than planning against an assumed one.

## Scope boundary

This lane's TV responsibility is **discovery and respect for the existing model**. It does
not author TV standards or TV-specific rules — that is a separate scope. Until those rules
exist, do not cite a TV standard ID that has not been authored; name the gap instead.
