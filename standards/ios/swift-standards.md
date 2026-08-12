# Swift Standards

## Governing sections (all five iOS documents)

These four sections govern **all five** `standards/ios/*` documents. They define *how* a finding is filed, not *what* is a defect. A consumer that reads only one of the other four documents — `ios-performance-reviewer`, `mobile-release-engineer` — reads this block and stops; it is deliberately placed first so it can be loaded without the Swift rules below.

### Lane boundaries

Findings are filed by ID root:

| ID root | Document | Filed by |
|---|---|---|
| `IOS-SWIFT-*` | this file | `ios-code-reviewer` |
| `IOS-UI-*` | `swiftui-uikit-standards.md` | `ios-code-reviewer` |
| `IOS-ARCH-*` | `ios-architecture.md` | `ios-code-reviewer` |
| `IOS-PERF-*` | `ios-performance.md` | `ios-performance-reviewer` |
| `IOS-BUILD-*` | `xcode-build-signing.md` | `mobile-release-engineer` |
| `A11Y-*`, `I18N-*` | `standards/shared/accessibility.md`, `i18n-rtl.md` | `ios-code-reviewer` |
| `SEC-*` | `standards/shared/mobile-security.md` | `mobile-security-reviewer` (via `/review-security`) |
| `REL-*` | `standards/shared/release-readiness.md` | `mobile-release-engineer` |
| `QA-*` | `standards/shared/qa-handoff.md` | the QA-handoff skill |

TV-context rules take their host document's root (`IOS-UI-TV-*`, `IOS-PERF-TV-*`); a bare `IOS-TV-*` root has no owner and is not permitted.

**One defect, one finding**, filed under the most specific applicable ID. File what your lane sees; never suppress an observation assuming another agent will file it. The `ios-code-review` skill dedupes at merge using this table.

| Defect | Owning ID | Supporting IDs, cited inside |
|---|---|---|
| Blocking primitive on main thread or cooperative pool | `IOS-PERF-MAIN-2` | `IOS-SWIFT-CONC-4` (bridge design only) |
| Unstable collection identity | `IOS-UI-ID-1` | `IOS-PERF-RENDER-7` |
| Self-retaining resource preventing deallocation | `IOS-PERF-MEM-3` | `IOS-SWIFT-LIFETIME-5` |
| Dependency added without stated cost | `IOS-ARCH-MODULE-5` | `IOS-PERF-SIZE-3`, `IOS-PERF-LAUNCH-3`, `IOS-BUILD-DEP-4` |
| Networking/persistence/business rules in a view | `IOS-ARCH-LAYERS-2` (I/O) or `IOS-ARCH-LAYERS-3` (rules) | `IOS-UI-VIEW-1`, `IOS-UI-UIKIT-1`, `IOS-ARCH-DATA-5` |
| Missing loading/empty/error/success state | `IOS-UI-VIEW-4` | `IOS-ARCH-LAYERS-5` — file alone only if the model is deficient but the view is not |

### Severity

Severity is derived from the rule, not improvised. Default by category:

| Severity | Applies to |
|---|---|
| **Blocking** | Data loss or corruption; a crash the change makes reachable; a shipped secret or a security control disabled in a release build; a schema change with no migration; a release artifact that cannot be signed, symbolicated, or lawfully submitted. |
| **Major** | A defect users will hit — an unhandled failure path, a leak or unbounded growth, a hang, a data race, an API-contract or DD deviation, a broken accessibility or localisation path. |
| **Minor** | Consistency and maintainability — layering, naming, access control, duplication, test-authoring gaps, diagnostics mechanism. |
| **Nit** | Style with no behavioural consequence. Never blocks. |

Two overrides: a rule naming its own severity uses that; and a Minor-category defect the Detailed Design explicitly specified otherwise is a Major, because deviating from an approved DD is itself the defect. Where a rule could sit in two categories, the consequence *in this change* decides.

### When the repository has no convention

Many rules are phrased against "the repository's convention", and that antecedent is often unavailable. **Its absence is never, by itself, compliance.** Resolve in order:

1. **Convention established** → apply the rule against it.
2. **Not established, but the change is internally inconsistent** (does one thing two ways, or contradicts the file it edits) → file against the inconsistency.
3. **Not established, nothing to compare against** → apply the platform default the rule states, label the finding `unverified-convention`, which caps it at Minor and asks the author to confirm.

State which case applied. "This repo has no service layer / no tests / no design tokens" is never evidence that adding more of the same is acceptable.

### Applicability stage

Each rule is checkable at one stage. Mark a rule Not Applicable — never "passed" — when its stage has not been reached:

- **Diff** — decidable from the changed code. The default; assume it unless the rule says otherwise.
- **Build** — requires compiling, linting, or archiving. Verified by CI or the implementer and reported as evidence; a reviewer working from a diff does not assert a verdict.
- **Release** — requires state outside the repository (App Store Connect, the developer portal, field metrics). Checked at `/prepare-mobile-release`.

### Neutrality, TV, and status

**Neutrality.** No rule mandates a pattern, UI framework, language version, or toolchain. A rule naming a feature the project's configuration or deployment target does not offer is **inapplicable, not violated**. The repository's detected implementation is the source of truth; Apple's guidance never overrides it. Migration and incidental modernisation are never proposed, started, or bundled into a feature unless the feature explicitly requests it (`IOS-UI-FRAMEWORK-3`).

**Apple TV.** tvOS-specific guidance is out of scope for all five documents until task `ATV-001` adds clearly-marked TV-context sections inside each. When `device_type` is `tv`, apply the existing rules unchanged, assume no TV-specific framework, and flag the gap rather than inventing guidance.

These are living baselines — flag standards gaps rather than working around them. Which document owns which topic is the [Lane boundaries](#lane-boundaries) table.

---

## Purpose & Scope

These standards apply to native iOS application code written in Swift, implemented by `ios-feature-developer` via `/implement-task` and reviewed by `ios-code-reviewer` via `/review-code`. They cover Swift language and style only: naming, optionals and types, error handling, object lifetime, concurrency *correctness*, diagnostics, and static analysis. Each bullet carries a stable `IOS-SWIFT-*` ID so proposals, implementation summaries, and review findings can cite the exact rule. This list is a baseline, not exhaustive; the repository's detected Swift style, language mode, and deployment target take precedence.

This file also hosts the shared governing block above, which is why it is the largest of the five.

## Naming & API Design

- `IOS-SWIFT-NAME-1` Names follow the [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/) — clarity at the point of use over brevity; argument labels form a grammatical phrase at the call site; needless words are omitted.
- `IOS-SWIFT-NAME-2` Types, properties, and constants read as nouns. Mutating/non-mutating pairs: where the operation is a verb, the mutating form is the imperative (`sort()`) and the non-mutating takes `-ed`/`-ing` (`sorted()`); where it is a noun, the non-mutating form is the noun (`union`) and the mutating takes the `form` prefix (`formUnion`). A side-effecting method with no non-mutating counterpart (`save()`, `send()`) is simply an imperative verb phrase.
- `IOS-SWIFT-NAME-3` New Swift types are not given Objective-C-era prefixes (`XYZUserManager`); the module is the namespace. Existing prefixed types are left alone — renaming them is a migration, not a task.
- `IOS-SWIFT-NAME-4` Abbreviations follow the repository's existing vocabulary; a new abbreviation is not invented for a term the codebase already spells out.
- `IOS-SWIFT-NAME-5` Boolean members read as assertions about the receiver (`isEmpty`, `canRetry`, `hasChanges`), not as commands or bare nouns.

## Optionals & Types

- `IOS-SWIFT-NULL-1` No force-unwrap (`!`) on lines the change adds or edits — the scope is the changed lines, not every line of a function the diff touches. Prefer `guard let`, `if let`, `??`, or a non-optional type. Two exemptions: a preceding check that provably guarantees non-`nil`, with a comment saying why; and a value whose validity is fixed at compile time and committed to the repository — a literal `URL(string:)`, a bundled resource looked up by name.
- `IOS-SWIFT-NULL-2` No `try!` and no force-cast (`as!`). Use `do`/`catch`, `try?` with an explicit handled branch, or `as?` with a `nil` branch. `try!` is acceptable only against a checked-in, provably-valid input (decoding a committed fixture) with a comment saying so. A regular expression is not such a case: a Swift `Regex` literal is compile-time checked and does not throw, so `try! NSRegularExpression(pattern:)` is a finding wherever a literal is available.
- `IOS-SWIFT-NULL-3` Implicitly-unwrapped optionals (`T!`) are confined to the repository's established two-phase-initialisation surfaces (Interface Builder outlets, framework-required late binding); they are not used to defer thinking about ownership in new types.
- `IOS-SWIFT-NULL-4` Absence in types the project owns is modelled as `T?` rather than with sentinel values (`-1`, `""`, a magic string). Framework sentinels Apple's own APIs define and require — `NSNotFound`, `UITableView.automaticDimension`, `UISegmentedControl.noSegment` — are used as documented; citing this rule against them is a false finding.
- `IOS-SWIFT-NULL-5` Indexing is bounds-safe. A subscript with an index derived from another source — a data-source callback, a stored offset, an index captured before an async hop — is guarded, because the collection can change between the two. `IOS-SWIFT-NULL-1` does not cover this. The same applies to `String.Index` arithmetic across a mutated string.
- `IOS-SWIFT-TYPE-1` Value types (`struct`, `enum`) are the default for models and state; a `class` is used when reference identity, inheritance, or a framework requirement demands it.
- `IOS-SWIFT-TYPE-2` Access control is as narrow as the code allows: `private`/`fileprivate` for implementation detail, `internal` (the default) for module-internal API, `package` for API shared across modules of the same package, `public`/`open` for a module's intended external surface. Widening to make one *production* call site compile is a finding; widening `private` to `internal` for a `@testable import` is not — that is the supported mechanism, and `IOS-ARCH-TEST-4` requires the test.
- `IOS-SWIFT-TYPE-3` Closed sets of states, results, and events are modelled with `enum` and consumed by an exhaustive `switch`; a catch-all `default` that would silently absorb a future case is not added to an enum the repository owns.
- `IOS-SWIFT-TYPE-4` Stringly-typed keys, identifiers, and routes use the typed vocabulary the repository already has; a new raw-`String` key is not introduced alongside an existing `enum` or typed wrapper.

## Error Handling

- `IOS-SWIFT-ERR-1` Errors propagate through the repository's established mechanism (`throws`, `Result`, a domain error `enum`) rather than a second mechanism introduced for one call path.
- `IOS-SWIFT-ERR-2` No silently discarded failure: a `try?` whose `nil` branch is unhandled, an empty `catch`, or a dropped `Result` failure is a finding. A comment discharges this only if it names what the user or the system does instead — a fallback, a retry, a logged degradation. "Best effort" and "can't fail here" are not discharges.
- `IOS-SWIFT-ERR-3` `fatalError`, `preconditionFailure`, and `assertionFailure` mark unreachable programmer error only. Expected runtime failure — network loss, absent file, malformed payload, denied permission — is handled, never trapped.
- `IOS-SWIFT-ERR-4` Errors surfaced to a user are mapped to an intelligible message at the presentation boundary; a raw transport-layer `localizedDescription` is not shown as user-facing text where the repository has a mapping layer.
- `IOS-SWIFT-ERR-5` A thrown error carries enough context to diagnose the failure — a typed case, or a domain/code/underlying-error triple — rather than an anonymous generic error.

## Object Lifetime

- `IOS-SWIFT-LIFETIME-1` A closure captures `self` weakly whenever its holder outlives, or can outlive, `self`. The distinction is the holder's lifetime, not whether `self` "owns" it:
  - **Stored on `self`, or on something `self` owns** → `[weak self]`; a strong capture is a retain cycle. The optional is unwrapped, not force-unwrapped.
  - **Held by a long-lived registry `self` does not own** — `NotificationCenter` block observers, a shared cache, a singleton's callback list, a scheduled `Timer` → `[weak self]`. A strong capture keeps `self` alive for the life of the registration, and storing a removal token does not fix it, because the removal sits in a `deinit` that can no longer run.
  - **One-shot, released after invocation** — a completion handler, an animation block, a `Task` body that finishes → a strong capture is acceptable and merely delays deallocation. Demanding `[weak self]` here is a false finding, unless the operation has no bounded completion.
- `IOS-SWIFT-LIFETIME-2` `unowned` is used only where the referent is guaranteed alive at every point the reference is *accessed* — access after deallocation traps at runtime. Where uncertain, `weak` is correct. `unowned(unsafe)` is undefined behaviour on a dead referent and is not used.
- `IOS-SWIFT-LIFETIME-3` A delegate back-reference does not keep its owner alive: `weak var` on a class-bound protocol (`protocol FooDelegate: AnyObject`). Where the protocol is not class-bound, `weak` does not compile — the fix is to bind the protocol to `AnyObject`, not to annotate the property, and citing this rule for the annotation alone is a false finding.
- `IOS-SWIFT-LIFETIME-4` Singletons and type-level (`static`) storage do not accumulate per-screen or per-request state, and do not hold view or view-controller references.
- `IOS-SWIFT-LIFETIME-5` Observations requiring explicit teardown are stored and released with their owner: block-based `NotificationCenter` tokens (`addObserver(forName:object:queue:using:)`), manual KVO (`addObserver(_:forKeyPath:…)`), Combine cancellables, and `Task` handles. Selector-based `NotificationCenter` observers (auto-cleared since iOS 9) and block-based `NSKeyValueObservation` (self-invalidating on `deinit`) need no manual removal. Where teardown would have to happen in a `deinit` the registration itself prevents from running, the finding is `IOS-SWIFT-LIFETIME-1`.

## Concurrency Correctness

Correctness only — responsiveness is `IOS-PERF-MAIN-*`.

- `IOS-SWIFT-CONC-1` Shared mutable state reachable from more than one isolation domain is protected by the project's established mechanism (actor isolation, a serial queue, or a lock) — not by convention alone.
- `IOS-SWIFT-CONC-2` **UIKit and SwiftUI objects are touched only from the main thread or main actor.** This holds regardless of the project's concurrency configuration, and mutating a view from a completion handler or background queue is a Blocking finding. *How* it is guaranteed follows the project: where there is a configured isolation setting, use it rather than scattering `DispatchQueue.main.async` to repair isolation the compiler could enforce; where the project predates that, an explicit main-queue hop at the boundary **is** the compliant fix and is not a finding (`IOS-SWIFT-CONC-7`).
- `IOS-SWIFT-CONC-3` `@unchecked Sendable` and `nonisolated(unsafe)` disable the compiler's data-race checking, so they carry the same gate as `IOS-SWIFT-CONC-7`: an explicit DD decision, plus a comment naming the mechanism that enforces the invariant (which queue, which lock, which access discipline). A comment merely asserting safety does not discharge this rule.
- `IOS-SWIFT-CONC-4` An async API is not re-exposed as synchronous by blocking at the bridge; crossing between GCD and Swift Concurrency uses an async-aware adaptor (a continuation, an `AsyncSequence`). **The blocking primitive itself is `IOS-PERF-MAIN-2`, not here** — this rule owns only the bridge design.
- `IOS-SWIFT-CONC-5` Unstructured tasks (`Task { }`) have a deliberate lifetime. Work whose result only matters to the current screen is tied to that screen's lifecycle (`.task`, or a stored handle cancelled on teardown). Work that must complete regardless of navigation — persisting user data, flushing an event, finishing an upload — is deliberately *not* cancelled on teardown, and demanding a cancellable handle for it is a false finding. What is a finding either way: an unbounded loop with no cancellation check, and a task whose lifetime was clearly not considered.
- `IOS-SWIFT-CONC-6` GCD and Swift Concurrency are mixed only at a deliberate, commented boundary; a single call chain does not alternate between them without a stated reason.
- `IOS-SWIFT-CONC-7` The project's concurrency diagnostics are not weakened to land a change — the strict-concurrency setting, language mode, and default isolation are not lowered, and per-file opt-outs are not added, without an explicit DD decision.

## Diagnostics, Logging & Analytics

What may be logged is `SEC-LOG-*`; this section covers mechanism only.

- `IOS-SWIFT-LOG-1` Diagnostics use the repository's logging facility (typically [`os.Logger`](https://developer.apple.com/documentation/os/logging), or the project's wrapper); `print`/`NSLog` are not added to shipping code paths.
- `IOS-SWIFT-LOG-2` Log statements carry a subsystem/category and a level matching severity, so they can be filtered.
- `IOS-SWIFT-ANALYTICS-1` Analytics events implement the names, parameters, and trigger points the approved DD specifies; an event name or parameter is not invented, renamed, or dropped during implementation.
- `IOS-SWIFT-ANALYTICS-2` An event fires exactly once per occurrence of the thing it measures — a screen-view event is not emitted from both a lifecycle callback and a navigation handler, and a retry does not double-count.
- `IOS-SWIFT-ANALYTICS-3` Events go through the repository's analytics layer rather than a vendor SDK called from a view, and the payload carries no personal data beyond what the DD approved (`SEC-LOG-*`).

## Static Analysis

- `IOS-SWIFT-LINT-1` *(Build stage.)* The project's configured Swift analysis and formatting tools ([SwiftLint](https://github.com/realm/SwiftLint), SwiftFormat, `swift-format`, Xcode warnings — whichever the repo uses) pass with no new violations.
- `IOS-SWIFT-LINT-2` Suppressions (`// swiftlint:disable`, warning pragmas, baseline additions) carry a justification comment; a bare suppression to silence a real finding is not acceptable.
- `IOS-SWIFT-LINT-3` *(Build stage.)* No new compiler warning is introduced, and an existing warning is fixed rather than suppressed.
- `IOS-SWIFT-LINT-4` An experimental or opt-in API (`@_spi`, an underscored attribute, a preview-only feature flag) is not adopted without confirming the project already depends on it and stating why.

## References

Consult when a rule is ambiguous for the case in front of you — not routinely.

| Source | When to consult |
|---|---|
| [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/) | Naming disputes (`IOS-SWIFT-NAME-*`). |
| [Swift concurrency documentation](https://www.swift.org/documentation/concurrency/) | Whether a type needs actor isolation, and what `Sendable` requires (`IOS-SWIFT-CONC-*`). |
| [Swift 6 migration guide](https://www.swift.org/migration/documentation/migrationguide/) | A project mid-migration with noisy diagnostics — distinguishes real races from annotation gaps. |
| [SwiftLint](https://github.com/realm/SwiftLint) | Whether a style question is already mechanically enforced (`IOS-SWIFT-LINT-*`). |
