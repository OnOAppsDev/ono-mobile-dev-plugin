# iOS Performance

## Purpose & Scope

These standards cover the performance of native iOS app code: main-thread responsiveness, scrolling and rendering cost, image and memory handling, launch time, and app size. This is the **only source of rules** for `ios-performance-reviewer`, which serves both `/review-code` and `/prepare-mobile-release` — it files no finding that is not an `IOS-PERF-*` rule below. Correctness, style, architecture, and security are other reviewers' lanes and must not appear in performance findings. Each bullet carries a stable `IOS-PERF-*` ID.

The four **governing sections** at the top of `standards/ios/swift-standards.md` — lane boundaries, severity, missing antecedents, applicability stage, plus the shared neutrality/TV/status notes — govern this document too and are not repeated here. Three rules below (`RENDER-7`, `SIZE-3`, `LAUNCH-3`) describe costs whose owning IDs live in documents this reviewer does not read: file them when observed and let the merge step dedupe.

## Main-Thread Responsiveness

A hang produces no crash report, so these defects are found by review rather than by the crash pipeline. A hang is Major unless it also loses data or is unbounded.

- `IOS-PERF-MAIN-1` No synchronous I/O on the main thread or main actor: network requests, file reads of unbounded size, database queries, keychain access on a hot path, or `Data(contentsOf:)` against a remote URL.
- `IOS-PERF-MAIN-2` Nothing blocks the main thread **or a task on the cooperative concurrency pool** while *waiting for other work to finish* — no `DispatchSemaphore.wait` awaiting an async result, no `DispatchQueue.sync` onto a queue that performs I/O or long work, no `Thread.sleep`, no run loop spun to await a completion. A blocked cooperative-pool thread starves the pool (width ≈ core count) and stalls main-actor work too, so `semaphore.wait()` inside a detached background task is a finding, not a safe workaround.
  A short, bounded critical section is **not** this finding: `queue.sync { _value }` used as a lock, `NSLock`, and `os_unfair_lock` guard in-memory state for a few instructions and are the mechanism `IOS-SWIFT-CONC-1` endorses. The distinction is what is being waited on — other work (a finding) versus exclusive access to memory (not a finding). A "lock" that performs I/O or calls out to unknown code inside the critical section is the former.
- `IOS-PERF-MAIN-3` Expensive computation on the main thread is bounded and justified: JSON or image decoding, cryptography, large sorts and diffs, regular expressions over large inputs, and layout of large text are moved off the main actor or performed incrementally.
- `IOS-PERF-MAIN-4` Results are batched into a single main-actor update rather than hopping per item inside a loop. Progress reporting is the deliberate exception `IOS-PERF-MAIN-5` requires — but it is coalesced (throttled to a display-refresh cadence, or emitted on a meaningful step change), not one hop per item over an unbounded collection.
- `IOS-PERF-MAIN-5` A long-running user-initiated operation reports progress and remains cancellable rather than freezing the interface until it completes.
- `IOS-PERF-MAIN-6` Notification, KVO, and observation handlers that fire frequently do only trivial work synchronously; heavier reactions are coalesced or deferred.

## Rendering & Scrolling

- `IOS-PERF-RENDER-1` Per-row and per-cell work is bounded: no synchronous image decode, no file or database access, no unbounded string formatting during cell configuration.
- `IOS-PERF-RENDER-2` Expensive-to-create helpers — `DateFormatter`, `NumberFormatter`, `Calendar`, `NSRegularExpression`, `JSONEncoder`/`JSONDecoder` — are created once and reused, never constructed per row or per `body` evaluation. Reuse follows the project: injected where the project injects, otherwise a `static let` on the type that uses it, which `IOS-ARCH-DI-4` explicitly permits for stateless formatting helpers. Foundation `FormatStyle` values (`date.formatted(.dateTime)`) and Swift `Regex` literals are exempt: they are designed to be constructed inline and citing this rule against them is a false finding.
- `IOS-PERF-RENDER-3` *(SwiftUI)* `body` performs no expensive computation. Derived values that cost more than trivial work are computed in the model and stored, not recomputed on every invalidation.
- `IOS-PERF-RENDER-4` *(SwiftUI)* View invalidation is scoped: a frequently-changing value is not observed at a level that redraws a large subtree when only a leaf depends on it.
- `IOS-PERF-RENDER-5` *(UIKit)* A single-item change does not trigger a whole-collection reload where the repository's update mechanism supports incremental application.
- `IOS-PERF-RENDER-6` Off-screen rendering and blend cost is not introduced casually — shadows without a path, unnecessary rasterisation, unbounded blur, and large translucent overlays on scrolling content each need a reason.
- `IOS-PERF-RENDER-7` Identity that changes on each redraw forces a full teardown and rebuild of every row, which is a real rendering cost on a large or scrolling collection. Report it when observed; at merge time it is folded into `IOS-UI-ID-1`, which owns the defect.
- `IOS-PERF-RENDER-8` A container holding unbounded content that neither recycles nor discards rows accumulates view instances for the whole scrolled distance. The container-choice aspect is `IOS-UI-ID-2`; this rule owns the *memory and rendering cost* when such a container is already in place on a large collection.

## Images & Assets

- `IOS-PERF-IMG-1` Images are downsampled to the **pixel** size they are displayed at — points × the target screen scale, not the point size — so a 100pt view on a 3× screen targets 300px. A full-resolution asset is not loaded into a thumbnail-sized view.
- `IOS-PERF-IMG-2` Decoding is *forced* off the main thread (`UIImage.preparingForDisplay()`, `CGImageSourceCreateThumbnailAtIndex` with immediate caching, or the repository's equivalent). Merely constructing `UIImage(data:)` on a background queue does not decode: UIKit decodes lazily at draw time, on the main thread — so background construction alone is not compliance. The decoded result, not the raw data, is what gets cached and handed to the view.
- `IOS-PERF-IMG-3` Caches are evictable. `NSCache` satisfies this by purging under memory pressure; its `countLimit`/`totalCostLimit` are advisory hints rather than hard ceilings, so a missing limit is not by itself a finding and a present limit is not proof of a bound. Where a hard ceiling is required it is enforced explicitly. A plain dictionary used as an image or response cache is a finding. Where cost is used, the unit is stated — for images, decoded bytes (pixels × 4).
- `IOS-PERF-IMG-4` Repeated remote fetches for the same asset are avoided through the repository's existing caching layer rather than a second one introduced alongside it.

## Memory

- `IOS-PERF-MEM-1` No unbounded in-memory accumulation: caches, buffers, logs, and collected results have a ceiling or an eviction policy.
- `IOS-PERF-MEM-2` Large payloads are streamed or paged rather than materialised whole in memory when the size is not bounded by the contract.
- `IOS-PERF-MEM-3` Resources with an explicit lifecycle are released deterministically. Where the resource holds its owner alive — a scheduled repeating `Timer`, `CADisplayLink`, a resumed `DispatchSourceTimer`, an `AVPlayer` periodic time observer — teardown is driven by an explicit lifecycle event (`viewWillDisappear`, `.onDisappear`, an explicit `stop()`) and never by `deinit`, which cannot run while the resource retains its owner. Teardown of resources that do *not* retain their owner is not this rule: a delegate back-reference is `IOS-SWIFT-LIFETIME-3`, and observation tokens, cancellables, and task handles are `IOS-SWIFT-LIFETIME-5`.
- `IOS-PERF-MEM-4` A memory finding is grounded in a measurement or a stated unbounded mechanism; suspected leaks without either are raised as `IOS-PERF-MEASURE-1` requests, not asserted.

## Launch

- `IOS-PERF-LAUNCH-1` The launch path does no work that can be deferred: third-party SDK initialisation, migrations, prefetching, analytics flushes, and remote-config fetches are moved off the critical path or made lazy.
- `IOS-PERF-LAUNCH-2` No synchronous network or unbounded disk work runs before the first frame is drawn.
- `IOS-PERF-LAUNCH-3` A change that adds work to app or scene startup states its launch cost. Where the work arrives with a new dependency, this rule supplies the launch dimension of `IOS-ARCH-MODULE-5` and is not filed separately.
- `IOS-PERF-LAUNCH-4` Pre-`main` cost is treated as part of the launch path: each additional dynamically-linked framework costs dyld work at every launch, and `+load` methods and non-trivial static initialisers run before the app gets control. A change that adds a dynamic framework, a `+load`, or an expensive global constant states that cost.

## App Size

- `IOS-PERF-SIZE-1` Image and media resources ship through asset catalogues at the resolutions actually used, so app thinning can strip what a device does not need.
- `IOS-PERF-SIZE-2` Large binary resources are not committed into the app bundle when the repository has a download-on-demand or remote-asset mechanism.
- `IOS-PERF-SIZE-3` A new third-party dependency's contribution to binary size is stated when it is proposed. This supplies the size dimension of `IOS-ARCH-MODULE-5`, which owns the finding; it is not filed separately.

## Measurement

- `IOS-PERF-MEASURE-1` A magnitude claim — "this is slow", "this leaks", "this regressed launch" — is never asserted from reading code. Either it is backed by a measurement, or it is filed as an explicit measurement request that names the metric, the scenario, and the threshold that would make it a defect. An unmeasured magnitude claim caps at Minor and never blocks; a *mechanism* finding (unbounded growth, work on the wrong thread, per-item cost in a loop) needs no measurement and is filed at its own severity.
- `IOS-PERF-MEASURE-2` A performance fix is verified the same way it was diagnosed, comparing against a stated baseline rather than asserted as improved.
- `IOS-PERF-MEASURE-3` *(Release stage.)* Measurements are taken on a release-configuration build on a representative device; a Debug-build or simulator timing is not offered as evidence of shipping performance.
- `IOS-PERF-MEASURE-4` *(Release stage.)* Where the repository collects field metrics (hangs, launch time, memory, crashes via [MetricKit](https://developer.apple.com/documentation/metrickit) or its analytics equivalent), a release-time performance sign-off consults them rather than relying only on local profiling.


## References

Consult when a rule is ambiguous for the case in front of you — not routinely.

| Source | When to consult |
|---|---|
| [Improving your app's performance](https://developer.apple.com/documentation/xcode/improving-your-app-s-performance) | Picking a measurement method for a finding. |
| [Analyzing responsiveness issues in your shipping app](https://developer.apple.com/documentation/xcode/analyzing-responsiveness-issues-in-your-shipping-app) | Hangs, and reading field hang data (`IOS-PERF-MAIN-*`). |
| [MetricKit](https://developer.apple.com/documentation/metrickit) | Field metrics at release sign-off (`IOS-PERF-MEASURE-4`). |
| [Reducing your app's launch time](https://developer.apple.com/documentation/xcode/reducing-your-app-s-launch-time) | Launch-phase breakdown and targets (`IOS-PERF-LAUNCH-*`). |
| [Reducing your app's size](https://developer.apple.com/documentation/xcode/reducing-your-app-s-size) | What app thinning does and does not strip (`IOS-PERF-SIZE-*`). |

