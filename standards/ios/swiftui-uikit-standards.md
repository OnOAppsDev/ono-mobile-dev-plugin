# SwiftUI / UIKit Standards

## Purpose & Scope

These standards govern the iOS UI layer — how views are composed, who owns state, how lists and cells behave, and how SwiftUI and UIKit meet. They are used by `ios-architect` when proposing a technical approach (`/analyze-feature`, `/dev-design-start`), by `ios-feature-developer` during implementation, and by `ios-code-reviewer` in `/review-code`. Each bullet carries a stable `IOS-UI-*` ID so proposals, implementation summaries, and review findings can cite the exact rule. Lane boundaries between the five iOS documents are defined once, in `standards/ios/swift-standards.md`.

**Framework neutrality is the governing principle of this document.** SwiftUI, UIKit, and hybrid codebases are all first-class. Rules are grouped by the family they apply to, and `IOS-UI-FRAMEWORK-1` governs which family a given file is judged under.

The four **governing sections** at the top of `standards/ios/swift-standards.md` — lane boundaries, severity, missing antecedents, applicability stage, plus the shared neutrality/TV/status notes — govern this document too and are not repeated here.

## Framework Selection

- `IOS-UI-FRAMEWORK-1` **The file being changed selects the family, not the repository majority.** A UIKit view controller in a mostly-SwiftUI app is reviewed as UIKit and vice versa. Cross-applying one family's rules to the other family's file is prohibited. An interop file — a `UIViewRepresentable`, a `UIViewControllerRepresentable`, a hosting controller — belongs to *both* families: its SwiftUI surface is reviewed under the SwiftUI rules and the UIKit object it wraps under the UIKit rules, since that is the one place both genuinely apply.
- `IOS-UI-FRAMEWORK-2` A new screen uses the family the surrounding feature already uses. Introducing the other family for one screen is an architectural decision that belongs in the DD, not an implementation choice.
- `IOS-UI-FRAMEWORK-3` Migration between families — SwiftUI-ifying a UIKit screen, or the reverse — is never proposed, started, or bundled into a feature unless the feature explicitly requests that migration. Incidental modernisation of untouched code is out of scope for every task.
- `IOS-UI-FRAMEWORK-4` In a hybrid screen, the boundary between families is explicit and singular; a screen does not interleave both families at several levels without the DD saying so.

## View Composition (both families)

- `IOS-UI-VIEW-1` View code contains no business rules, networking, persistence, or transport calls; it renders state and forwards intent to the layer below (`IOS-ARCH-LAYERS-*`).
- `IOS-UI-VIEW-2` A view that has grown past readable size is decomposed into named subviews or child controllers rather than extended with further nested conditionals.
- `IOS-UI-VIEW-3` Layout constants, colours, spacing, and typography come from the repository's design-token or theme layer where one exists; new hardcoded values are not introduced alongside it.
- `IOS-UI-VIEW-4` Every user-facing state the feature can reach is rendered — loading, empty, error, and success are each handled explicitly, not left as an implicit blank screen.
- `IOS-UI-VIEW-5` User-facing strings go through the repository's localisation mechanism; a hardcoded display string is not added where a catalogue exists (see `I18N-*` in `standards/shared/i18n-rtl.md`).

## State Ownership — SwiftUI

Applies to SwiftUI files only. The project's observation model — the Observation framework, `ObservableObject`, or a redux/store pattern — is a detected fact, not a choice this document makes.

- `IOS-UI-STATE-1` Each piece of state has exactly one owner. The same value is not stored in both a view and its model where they can drift apart.
- `IOS-UI-STATE-2` View-local, ephemeral state (a toggle, a text field's draft, a sheet flag) is owned by the view; state that outlives the view or is shared across screens is not.
- `IOS-UI-STATE-3` A model or view-model object is created with the ownership wrapper that binds its lifetime to the view (`@State` for an `@Observable` object, `@StateObject` under `ObservableObject`). Constructing it in `body`, or holding it in a wrapper that does not own its lifetime (`@ObservedObject`, or a plain stored property) while also constructing it, is a finding — the view struct is re-initialised on every parent update, so the object is rebuilt and its state lost. Note that `@State`/`@StateObject` still evaluate their initialiser expression on each view-struct init and discard the result; that is a cost question (`IOS-PERF-RENDER-3`), not a violation of this rule.
- `IOS-UI-STATE-4` Two-way access uses the project's binding mechanism: `@Binding` where the view is handed write access to state it does not own; `@Bindable` to derive bindings from an `@Observable` object the view already holds; `$` projection from `@StateObject`/`@ObservedObject` under `ObservableObject`. `@Bindable` requires `Observable` conformance and is inapplicable to `ObservableObject` types; citing it against one demands a change that does not compile.
- `IOS-UI-STATE-5` Environment values and injected dependencies are read at the level that needs them; a dependency is not threaded manually through intermediate views the repository would inject into.
- `IOS-UI-STATE-6` `body` is a pure function of state: it performs no side effects, starts no unowned work, and mutates no observed state. Work is started from a lifecycle modifier (`.task`, `.onAppear`, `.onChange`) with the ownership `IOS-SWIFT-CONC-5` requires.

## Lists, Identity & Cells

- `IOS-UI-ID-1` Collection identity is stable across redraws. The finding is identity **generated at the point of rendering** — `UUID()` called inside `body`, a `ForEach` closure, or a mapping performed on each redraw, and likewise a hash of formatted output. A `let id = UUID()` *stored property* on a model is stable for that instance's lifetime and is compliant; it becomes a defect only if the model itself is rebuilt on every redraw, which is the finding — cite the rebuild, not the property. An array index or offset is acceptable only for a collection that never inserts, deletes, or reorders (including `ForEach` over a constant `Range`), and is a finding for any mutable collection. `ObjectIdentifier` is valid identity for a reference-type model.
- `IOS-UI-ID-2` A container that can hold an unbounded number of rows does not instantiate every row eagerly. `List` (SwiftUI) and `UITableView`/`UICollectionView` (UIKit) recycle row views. `LazyVStack`/`LazyHStack` only *defer* creation — they do not recycle, and rows once created are retained — so they are acceptable for bounded content but not for an unbounded feed, where a recycling container is required.
- `IOS-UI-CELL-1` *(UIKit)* Content is set unconditionally on every dequeue by the configuration path (`cellForRowAt`, a `CellRegistration` handler, or a `UIContentConfiguration`), so stale content from a previous row cannot survive. `prepareForReuse` is used only for what the configuration path does not overwrite — cancelling in-flight async work, and resetting non-content state such as selection, highlight, alpha, and transform. Resetting content there instead of in the configuration path is redundant and masks the real defect: content set conditionally.
- `IOS-UI-CELL-2` *(UIKit)* Where the repository uses a diffable data source, updates apply a snapshot rather than a blanket `reloadData()`; where it does not, the existing update mechanism is followed rather than a second one introduced. Because snapshots diff by item identifier, a content change that leaves the identifier unchanged updates nothing on screen — those are applied with `reconfigureItems(_:)`, or `reloadItems(_:)` where the deployment target predates it, not by re-applying the snapshot alone.
- `IOS-UI-CELL-3` Asynchronous per-row work (image load, formatting, prefetch) is cancelled or guarded when the row is reused, so a late result cannot land on the wrong row.
- `IOS-UI-CELL-4` *(UIKit)* The backing model and the collection's reported counts stay consistent across an update. The model is not mutated between the count callback and the update, nor from another thread while an update is in flight — an inconsistency here raises `NSInternalInconsistencyException` ("invalid number of rows") and terminates the app. Mutation and update are performed together on the main thread, from a single snapshot of the data.

## UIKit View & Controller Conventions

Applies to UIKit files only.

- `IOS-UI-UIKIT-1` View controllers do not own networking, persistence, or business rules; they coordinate views and delegate to the layer below.
- `IOS-UI-UIKIT-2` Auto Layout constraints are created once and activated together; constraints are not rebuilt inside `layoutSubviews`, and no ambiguous or conflicting constraint is left in place.
- `IOS-UI-UIKIT-3` Lifecycle work is placed in the correct callback — one-time setup in `viewDidLoad`, appearance-dependent work in `viewWillAppear`/`viewDidAppear` — and repeated callbacks do not accumulate observers, gesture recognisers, or subviews on each invocation.
- `IOS-UI-UIKIT-4` View state is driven from the model rather than read back out of views; a label's text is not the source of truth for a value.
- `IOS-UI-UIKIT-5` Where the repository uses Interface Builder, outlets and actions are connected and non-dangling; where it builds views in code, a screen is not converted to storyboards (or the reverse) as part of an unrelated task.

## SwiftUI / UIKit Interop

- `IOS-UI-INTEROP-1` A representable wrapper (`UIViewRepresentable`, `UIViewControllerRepresentable`) creates its wrapped object in `makeUIView`/`makeUIViewController` only, and applies changes in `updateUIView`/`updateUIViewController`; re-creating the wrapped object on update is a finding.
- `IOS-UI-INTEROP-2` A representable's `Coordinator` owns delegate and target-action callbacks; the SwiftUI struct does not retain UIKit objects across updates.
- `IOS-UI-INTEROP-3` A hosting controller's SwiftUI content is updated through its `rootView`/observed state, not by rebuilding and re-adding the hosting controller on each change.
- `IOS-UI-INTEROP-4` Navigation is driven by exactly one system per flow — the repository's coordinator, a SwiftUI navigation path, or UIKit navigation — and the two are not made to push concurrently onto the same stack (`IOS-ARCH-NAV-*`).

## Accessibility & Dynamic Type

Normative accessibility requirements are `A11Y-*` in `standards/shared/accessibility.md`. These rules bind them to iOS mechanics; findings about *whether* a surface is accessible cite `A11Y-*`, findings about *how it is wired on iOS* cite these.

- `IOS-UI-A11Y-1` Interactive elements expose an accessibility label and the traits that describe their role; decorative elements are hidden from assistive technology rather than left to announce raw asset names.
- `IOS-UI-A11Y-2` Text scales with Dynamic Type — text styles (or the repository's scaling equivalent) are used rather than fixed point sizes, and containers holding text are not given fixed heights that clip at larger sizes. *(UIKit)* A text style alone is not sufficient: `adjustsFontForContentSizeCategory` is set on the view and custom fonts are scaled through `UIFontMetrics`, otherwise the font resolves once and never updates when the user changes text size.
- `IOS-UI-A11Y-3` Composite controls expose a single sensible element to assistive technology rather than a stream of fragments, using the repository's established grouping approach.


## References

Consult when a rule is ambiguous for the case in front of you — not routinely.

| Source | When to consult |
|---|---|
| [SwiftUI state and data flow](https://developer.apple.com/documentation/swiftui/state-and-data-flow) | Ownership questions (`IOS-UI-STATE-*`). |
| [Managing model data in your app](https://developer.apple.com/documentation/swiftui/managing-model-data-in-your-app) | Where a model object lives and who creates it (`IOS-UI-STATE-3`). |
| [Observation framework](https://developer.apple.com/documentation/observation) | Which property changes invalidate a view, under `@Observable`. |
| [`UICollectionViewDiffableDataSource`](https://developer.apple.com/documentation/uikit/uicollectionviewdiffabledatasource) | Snapshot semantics (`IOS-UI-CELL-2`). |
| [Human Interface Guidelines — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | Accessibility expectations for an interaction (`IOS-UI-A11Y-*`). |
| [Xcode localization](https://developer.apple.com/documentation/xcode/localization) | Wiring a string into the catalogue (`IOS-UI-VIEW-5`). |

