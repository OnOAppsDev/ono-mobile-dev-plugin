# iOS Architecture

## Purpose & Scope

These principles govern how native iOS app code is layered, organised into targets and Swift packages, wired with dependency injection, and structured around presentation state, navigation, and the data layer. They are used by `ios-architect` when proposing a technical approach (`/analyze-feature`, `/dev-design-start`), by `ios-feature-developer` during implementation, and by `ios-code-reviewer` in `/review-code`. Each bullet carries a stable `IOS-ARCH-*` ID so proposals, implementation summaries, and review findings can cite the exact rule. Lane boundaries between the five iOS documents are defined once, in `standards/ios/swift-standards.md`.

**Pattern neutrality is the governing principle of this document.** Nothing here prescribes a pattern. Every rule asks the same question: *is this change consistent with the architecture the repository already has?* Planning output keeps three things separate: the existing implementation, the work the feature requires, and any optional suggestion — labelled optional and never actioned without approval.

**Discovery before proposal.** No architectural proposal is made before the repository's actual implementation has been identified; the discovery method is owned by `skills/ios-dev-planning`.

The four **governing sections** at the top of `standards/ios/swift-standards.md` — lane boundaries, severity, missing antecedents, applicability stage, plus the shared neutrality/TV/status notes — govern this document too and are not repeated here.

## Layering & Dependency Direction

- `IOS-ARCH-LAYERS-1` Code follows the layering the repository already uses (e.g. view → presentation state → use-case/service → repository/client, or the project's detected variant); a new architectural pattern is not introduced for a single task.
- `IOS-ARCH-LAYERS-2` Views and view controllers do not perform networking, persistence, or transport calls directly. Where the repository has a service or repository layer, the call goes through it. Where the repository has none, new I/O is still placed in a separate type the view calls — the absence of a layer is not a licence to add more direct I/O to a view (see *When the repository has no convention* in `swift-standards.md`); resolve it under that section.
- `IOS-ARCH-LAYERS-3` Business rules are not embedded in views, view controllers, or app/scene delegates; they live where they are testable without a UI host. "Business rule" here means logic whose correctness is independent of presentation — pricing, eligibility, validation, state transitions, retry policy — as distinct from view configuration and formatting, which belong in the view layer.
- `IOS-ARCH-LAYERS-4` Dependencies point in one direction, matching the repository's convention — the data layer knows nothing about which screen calls it, and no circular dependency between types or modules is introduced.
- `IOS-ARCH-LAYERS-5` Presentation state exposes loading, empty, success, and error explicitly rather than leaving them to be inferred from ambiguous combinations such as "no data and no error".
- `IOS-ARCH-LAYERS-6` Presentation-state types do not hold `UIView`, `UIViewController`, or window references, and are constructible in a test without instantiating a UI.

## Module & Target Boundaries

- `IOS-ARCH-MODULE-1` Code is placed in the target or package the DD specifies, or that the existing convention dictates (feature package, a shared `Core`/`Networking`/`DesignSystem` package, the app target) — not defaulted into the app target because that compiles fastest.
- `IOS-ARCH-MODULE-2` Cross-module access goes through each module's intended public surface; implementation detail is not widened to `public` to make one call site work, and a feature module does not reach into another feature module's internals. Where the consumer is another module of the same package, `package` is the correct level rather than `public` (`IOS-SWIFT-TYPE-2`).
- `IOS-ARCH-MODULE-3` A new module, package, or dependency edge between existing modules is not added for one task without DD approval — module topology is an architectural decision, not an implementation detail.
- `IOS-ARCH-MODULE-4` In a single-target project, folder and namespace boundaries are respected as the equivalent of module boundaries; feature code is not scattered across unrelated groups.
- `IOS-ARCH-MODULE-5` A new third-party dependency requires DD approval and a stated justification, including its effect on build, binary size, and launch (`IOS-PERF-SIZE-*`); it is added through the repository's existing dependency mechanism, and a second mechanism is not introduced alongside it.

## Navigation

- `IOS-ARCH-NAV-1` Navigation is driven by the repository's established mechanism (a coordinator/router, a SwiftUI navigation path, storyboard segues, or the project's own abstraction). A second mechanism is not introduced for one flow.
- `IOS-ARCH-NAV-2` Exactly one component owns a given navigation stack's state; a screen does not both mutate a shared path and imperatively push onto the same stack.
- `IOS-ARCH-NAV-3` A view or view controller does not construct the next screen's dependencies itself where the repository has a factory, coordinator, or container that does.
- `IOS-ARCH-NAV-4` Externally-supplied entry points — deep links, universal links, notification payloads, shortcuts — are validated and mapped to an internal route before use, and cannot navigate to a screen the user is not entitled to reach. This is filed as a routing/architecture finding by `ios-code-reviewer`; the parallel security requirement `SEC-DEEPLINK-*` stays with `mobile-security-reviewer` under `/review-security` and is not duplicated into a code review.
- `IOS-ARCH-NAV-5` Navigation state that must survive backgrounding, process death, or a state restoration path is persisted per the feature's requirement rather than assumed to be in memory.

## Dependency Injection & Composition

- `IOS-ARCH-DI-1` The repository's detected dependency mechanism is used — initialiser injection, an environment, a container, or a documented in-house approach. A service locator is not introduced into a project that injects, nor the reverse.
- `IOS-ARCH-DI-2` Initialiser injection is preferred where the framework and existing code allow it, keeping dependencies explicit and the type testable.
- `IOS-ARCH-DI-3` A narrow dependency is injected in preference to a broad one — the specific collaborator or protocol, rather than a whole container or a god-object.
- `IOS-ARCH-DI-4` A new singleton or `static` shared instance holding *state or behaviour* is not introduced in a project that injects dependencies, and existing `.shared` accessors are not newly reached into from the view layer. A `static let` holding a stateless, immutable helper — a configured formatter, a cached `Regex` — is not a singleton for this purpose and is the reuse mechanism `IOS-PERF-RENDER-2` calls for.
- `IOS-ARCH-DI-5` Lifetimes are deliberate — a dependency is not made process-wide when screen or request scope is correct, and scoped state is not silently shared between screens.

## Data & Model Layer

- `IOS-ARCH-DATA-1` Persistence uses the mechanism the repository already uses (Core Data, SwiftData, a SQLite wrapper, files, or the project's own store); a second persistence stack is not added for one feature.
- `IOS-ARCH-DATA-2` Where the repository separates transport models from domain models, that separation is preserved — a decoded network payload type is not passed through to the view layer, and a domain type is not annotated with transport concerns.
- `IOS-ARCH-DATA-3` Decoding is tolerant of the contract the backend actually guarantees: optionality, unknown enum cases, and absent fields are handled rather than allowed to fail the whole payload, per the repository's established decoding strategy.
- `IOS-ARCH-DATA-4` There is a single source of truth for a piece of data; the same value is not cached in two stores that can diverge without a defined reconciliation.
- `IOS-ARCH-DATA-5` Networking goes through the repository's client layer ([URL Loading System](https://developer.apple.com/documentation/foundation/url-loading-system) or its wrapper) rather than ad-hoc requests constructed at a call site.
- `IOS-ARCH-DATA-6` The implementation matches the API contract the approved Detailed Design specifies — endpoint, method, request and response fields, and error cases. An endpoint or field is never invented, guessed, or silently changed during implementation; where the contract turns out to be wrong or missing, the task stops and the DD is corrected rather than worked around in code.
- `IOS-ARCH-DATA-7` A change to a persisted schema ships its migration in the same change. A model-version change with no migration path is a defect regardless of whether it happens to work on a fresh install, and a migration that discards real user data is never applied without an explicit, approved decision to do so.
- `IOS-ARCH-DATA-8` Objects belonging to a managed persistence context are not passed across threads, queues, or contexts. Where a reference must cross, the stable identifier the store provides is passed and the object re-fetched on the destination context.
- `IOS-ARCH-DATA-9` Work that must survive the app leaving the foreground requests background execution through the platform's mechanism and **always** ends it on every exit path, including failure and cancellation. An unbalanced background-task assertion causes the system to terminate the app on the watchdog timeout.

## Testability

- `IOS-ARCH-TEST-1` New logic is reachable from a test without instantiating a UI host — collaborators are injected and abstracted the way the repository already abstracts them.
- `IOS-ARCH-TEST-2` Test doubles follow the repository's existing approach; a new mocking framework or generation strategy is not introduced for one task.
- `IOS-ARCH-TEST-3` Code is not restructured *purely* to raise coverage in a way that contradicts the repository's architecture; a genuine tension between testability and the existing structure is raised in the DD instead.
- `IOS-ARCH-TEST-4` New logic carries tests at the layer and to the depth the repository already tests, using the framework it already uses (XCTest, Swift Testing, or the project's harness). A change that adds a decision branch to an otherwise-tested type does not leave that branch untested.
- `IOS-ARCH-TEST-5` Tests are deterministic: asynchronous work is awaited through the framework's own mechanism (expectations, async test functions) rather than a fixed `sleep`, and a test does not depend on wall-clock timing, execution order, or shared mutable state left behind by another test.


## References

Consult when a rule is ambiguous for the case in front of you — not routinely. None overrides the repository's existing implementation.

| Source | When to consult |
|---|---|
| [Organizing your code with local packages](https://developer.apple.com/documentation/xcode/organizing-your-code-with-local-packages) | Module topology disputes (`IOS-ARCH-MODULE-*`). |
| [Adding package dependencies to your app](https://developer.apple.com/documentation/xcode/adding-package-dependencies-to-your-app) | Mechanics and cost of a proposed dependency (`IOS-ARCH-MODULE-5`). |
| [Configuring a new target in your project](https://developer.apple.com/documentation/xcode/configuring-a-new-target-in-your-project) | A change adding a target (extension, widget, test host). |
| [URL Loading System](https://developer.apple.com/documentation/foundation/url-loading-system) | Caching, session config, background transfer (`IOS-ARCH-DATA-5`). |

