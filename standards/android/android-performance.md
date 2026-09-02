# Android Performance

## Purpose & Scope

These standards apply to native Android app code audited by the `android-performance-reviewer` agent via `/review-code` (diff-scoped) and `/prepare-mobile-release` (release-scoped), and are applied by `android-feature-developer` during implementation. Each bullet carries a stable `AND-PERF-*` ID so findings can cite a rule instead of restating the concern. This is a baseline, not exhaustive — flag suspected issues that need profiling (Android Studio Profiler, Macrobenchmark, LeakCanary) to confirm as such, rather than stating a guess as a confirmed blocking finding.

## Main-Thread & Threading

- `AND-PERF-THREAD-1` No blocking or long-running work on the main thread — I/O, disk, database, JSON parsing of large payloads, bitmap decoding, and crypto run off-main via the repo's dispatcher convention.
- `AND-PERF-THREAD-2` Work is not needlessly duplicated across the main and background threads (e.g. parsing the same payload twice); results are computed once and reused.
- `AND-PERF-THREAD-3` Frequent or high-rate updates (scroll, text input, sensor/location streams) are debounced/throttled/conflated rather than triggering per-event recomposition or layout.

## Lists & Rendering

- `AND-PERF-LIST-1` Large or unbounded collections are rendered through a recycling/lazy container (`RecyclerView`, `LazyColumn`/`LazyRow`) — not a `ScrollView`/`Column` that inflates or composes every item unconditionally.
- `AND-PERF-LIST-2` List rebinds are minimized via diffing (`AND-UI-LIST-2`) rather than full-list refreshes; per-row work in `onBindViewHolder`/item composables is kept cheap.
- `AND-PERF-LIST-3` Overdraw and deep view hierarchies are avoided on hot screens; expensive layout passes are not introduced on scroll-critical surfaces.

## Images

- `AND-PERF-IMAGE-1` Images are loaded through the repo's existing image-loading/caching library (Coil, Glide, Fresco — whichever is present) rather than manual `BitmapFactory` decoding on a UI path.
- `AND-PERF-IMAGE-2` Images are decoded/downsampled to the display size — thumbnails do not decode full-resolution source bitmaps into memory.
- `AND-PERF-IMAGE-3` Image requests are cancelled/cleared when their target view or composable leaves the screen, per the loading library's convention.

## Memory & Leaks

- `AND-PERF-MEM-1` No leaks of `Activity`/`Fragment`/`View`/`Context` via long-lived references — static fields, singletons, retained callbacks/listeners, or a `Context` captured by a longer-lived object (ties to `AND-VM-LIFECYCLE-1`, `AND-UI-XML-2/3`).
- `AND-PERF-MEM-2` Registered listeners, observers, `BroadcastReceiver`s, and coroutine collectors are unregistered/cancelled at the matching lifecycle boundary.
- `AND-PERF-MEM-3` Unnecessary allocations in hot paths (per-frame, per-bind, per-recomposition) are avoided — objects/lambdas are hoisted or remembered rather than re-created each pass.
- `AND-PERF-MEM-4` Temporary files and caches created from large or sensitive data are cleaned up after use (ties to `SEC-STORAGE-4`).

## Startup, Size & Battery

- `AND-PERF-SIZE-1` Work is not added to app/Activity cold-start paths that could be deferred (lazy initialization, `androidx.startup`, or the repo's pattern) — startup-critical code stays lean.
- `AND-PERF-SIZE-2` A dependency addition that meaningfully grows APK/AAB size or method count is called out explicitly and justified, not added silently.
- `AND-PERF-SIZE-3` Reactive updates (Flow/LiveData/observers) are preferred over polling; background polling, wake locks, and frequent alarms are avoided unless the DD requires them and they are scoped to need (battery/network cost).

## Android TV Context (device_type: tv)

**[Applies only on an established TV surface — `device_type: tv` arrives confirmed and is never
re-detected here. Where no TV surface is established this section is entirely N/A and none of its rules
may be raised. Every rule below is additive: the base `AND-PERF-*` rules apply on a TV surface unchanged,
and nothing here relaxes or forks one.]**

- `AND-PERF-TV-1` On 1 GB low-RAM TV devices foreground memory stays within Android's published 280 MB total, which assumes no active bindings and a single video stream.
- `AND-PERF-TV-2` Artwork is decoded at the device's UI resolution, not its panel or video resolution — a 720p-UI TV decodes 720p (extends `AND-PERF-IMAGE-2`).
- `AND-PERF-TV-3` Media buffer size follows device RAM and stream resolution, buffers are freed when the played item changes, and seek pre-buffering stays bounded.
- `AND-PERF-TV-4` Player instance, decoder session, buffers and surface are released on the lifecycle event that ends visible playback, not held off-screen (ties to `AND-PERF-MEM-2`).
- `AND-PERF-TV-5` Leaving a non-audio TV app stops its foreground services and releases cross-app bindings, each of which holds another process in memory.
- `AND-PERF-TV-6` D-pad rows and grids recycle their items, and a focus move rebinds only the affected items, never the whole row (extends `AND-PERF-LIST-1`).
- `AND-PERF-TV-7` The keep-screen-on flag is held only during user-initiated playback or animation and cleared when it ends, letting an otherwise idle TV reach Ambient Mode.
- `AND-PERF-TV-8` No blocking network or disk call precedes the first frame, Live-tab deep links included; entitlement checks run behind the loading surface.

## References

- Android performance guidance, Macrobenchmark, and the Android Studio Profiler / LeakCanary tooling.
- List/binding rules are shared with `standards/android/compose-xml-standards.md` (`AND-UI-LIST-*`); this document covers the performance dimension of them.
- The TV memory budget behind `AND-PERF-TV-1` splits as Anon+Swap below 160 MB, Graphics 30-40 MB, File 60-80 MB, and the 280 MB total is what must stay inside the limit on a 1 GB device. Separately, Android **strongly recommends** not exceeding **200 MB on Anon+Swap + Graphics only** — a narrower measure that excludes File, not a lower total. Both figures assume the app decodes a single video stream and holds no active bindings — except to processes already classed Perceptible, Foreground, Persistent or System by the low-memory killer, which the source exempts. Decoding more streams reduces the app's share, so the published figures tighten. Android publishes further TV memory figures — media buffers by device class, a seek-buffer cap and a background-job cap — but **no TV figure for CPU, GPU, heap class, start-up, playback start or navigation latency**, so no rule here states one.
- This document is a living baseline; flag standards gaps found during review rather than working around them silently.
