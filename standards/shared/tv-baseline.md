# Shared TV Baseline

## Purpose & Scope

These standards state the small set of **stable obligations every TV surface carries**,
whatever platform builds it — tvOS, Android TV or a React Smart TV runtime. They apply
**only when** the confirmed `device_type` is `tv` (at Analyze, Design and Implement) or a TV
surface is established from evidence (at Review, which has no confirmed `device_type`). They
are **never** applied to a mobile task, a mobile surface, or a mobile section of a plan.

Each rule states a **platform-neutral obligation**. It deliberately names no mechanism — no
focus API, no remote-control semantics, no manifest declaration, no media-session or player
framework, no key code, and no OS, SDK or vendor version. Those change, or differ per
platform, and belong elsewhere:

```
shared TV baseline  →  platform-specific additions  →  Project Knowledge  →  current source
```

- **Platform-specific additions** state how a platform meets an obligation, or add one only
  that platform has. React Smart TV's are authored (`REACT-TV-*`,
  `standards/react/react-smart-tv.md`); tvOS's and Android TV's are not yet authored, and until
  they are, no platform TV rule ID is cited for them.
- **Project Knowledge** supplies the repository-specific facts — which focus model, remote
  handling, navigation, TV components, playback integration, lifecycle conventions and budget a
  given repository actually uses — resolved through the planning lane, with live discovery as
  the fallback.
- **The current source** is authoritative wherever it and anything above disagree.
- **Platform and vendor facts** — what an SDK offers, how a runtime behaves, what a store
  requires — are verified against the target SDK or runtime when the work needs them, never
  written down here.

A rule is met by following the repository's own established model. Proposing to replace that
model — a different focus library, a different player — is never implied by this baseline.

Shared `A11Y-*` (`standards/shared/accessibility.md`) remains authoritative for every
accessibility requirement; `TVB-A11Y-1` states how the two relate and adds nothing to it.
Verification tiers and verification debt are governed by `standards/shared/verification.md`.

## Focus

- `TVB-FOCUS-1` **Exactly one element holds focus while a TV surface is interactive, it is always visibly indicated, and it is never lost.** Every screen, transition, asynchronous load, list refresh, filter change and removal of the focused item has a defined focus destination, so focus is never dropped to nothing and the user never has to press a key to find where they are. The focus indicator is legible at viewing distance, not a subtle tint (shared `A11Y-TOUCH-1` TV clause, `A11Y-FOCUS-3`, `A11Y-CONTRAST-1`).
- `TVB-FOCUS-2` **Directional navigation follows the visual layout.** A directional press moves focus to the element visually adjacent in that direction — not to the next element in declaration order — including under a mirrored right-to-left layout. Every interactive element is reachable by directional input alone, and non-interactive content is not placed in the focus order (shared `A11Y-SR-2`, `I18N-RTL-1`).
- `TVB-FOCUS-3` **Focus is contained in overlays and restored on return.** While an overlay, modal, dialog or player surface is open, directional focus cannot reach the content behind it; when it closes, focus returns to the element that opened it. Returning to a previously visited screen restores the element the user left rather than resetting to the first one (shared `A11Y-FOCUS-2`).

## Input & Navigation

- `TVB-INPUT-1` **Directional and select input is the only guaranteed input, and it reaches the active interaction hierarchy.** No essential interaction depends only on touch, hover, pointer or gesture; anything reachable that way is also reachable by directional and select input. Remote input is delivered through the platform's own dispatch to the focused element and its ancestors — the active hierarchy — and is not intercepted globally by a component that is not active.
- `TVB-INPUT-2` **Back is deterministic at every level.** Back closes the topmost overlay first, then navigates up one level; at the root it follows the platform's root convention, which the platform lane states. Back is never a no-op, never traps the user, and never depends on which component happens to have registered for it last.

## Media

- `TVB-MEDIA-1` **Playback has exactly one owner.** One module outside the view layer owns the player instance, and playback state has one writer, derived from the player's own events. Transport controls sit inside the focus model (`TVB-FOCUS-1`), and media-control input reaches the owner rather than being handled independently by whichever view is visible.
- `TVB-MEDIA-2` **Playback is lifecycle-aware and torn down completely.** Leaving the playback surface, or changing the source, releases the player and everything it holds — listeners, buffers, decoder and display resources. Suspension, backgrounding and the system idle state either pause and resume at the recorded position or continue by explicit decision, never by default. Where the platform lets an app keep the display awake, that is held only while playback is active and released when it stops.

## Lifecycle

- `TVB-LIFECYCLE-1` **State is preserved before suspension, and work stops while the surface is not active.** Playback position, focus position and in-progress input are captured when the app is notified it is leaving the foreground, not reconstructed on resume. Timers, polling, animations, prefetching and subscriptions stop while the app or surface is not active, and resume deliberately when it returns.

## Performance

- `TVB-PERF-1` **Work is held to the repository's TV budget, and large resources are released on navigation.** Where the repository states a TV memory or performance budget, TV work is planned and verified against it — never against a phone or desktop budget. Where it states none, that absence is recorded as a gap rather than a number being invented. Images are sized to their display size, and large image, video and cached resources are released when the user navigates away from the screen that holds them.

## Accessibility

- `TVB-A11Y-1` **A focus-driven TV surface stays accessible under the shared `A11Y-*` rules, through their TV clauses — there is no separate TV accessibility model.** Where a shared rule states a TV clause (`A11Y-TOUCH-1`, `A11Y-TOUCH-2`), that clause is the requirement; the focus rules (`A11Y-FOCUS-*`) apply in full, and matter more on a focus-driven surface, not less. Verification with the TV platform's own screen reader has no headless mechanism: it is Tier 3, recorded as `verificationDebt` with `owner: "qa"` exactly as for a mobile screen reader (`VERIFY-1`, `VERIFY-2`).

## Verification

Most of this baseline is behaviour a diff cannot prove and a headless run reaches only in
part. Record what was verified at the tier it was verified at, and state what was not; an
obligation that cannot be verified here is recorded as verification debt rather than
omitted (`standards/shared/verification.md`). Never present a passing build, or a mobile run,
as evidence for a TV obligation.

## References

- Shared standards cited, not restated: `standards/shared/accessibility.md`,
  `standards/shared/i18n-rtl.md`, `standards/shared/verification.md`.
- React Smart TV realisation of these obligations: `standards/react/react-smart-tv.md`
  § *Relationship to the shared TV baseline*.
