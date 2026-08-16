---
name: ios-feature-implementation
description: Methodology for implementing exactly one planned task in a native iOS codebase (Swift, SwiftUI, UIKit) per org standards, and for proving the result — including the Build-stage evidence a reviewer working from a diff cannot supply. Used by /implement-task via the ios-feature-developer agent, and by /fix-review-comments and /create-dev-qa-notes for their iOS halves.
---

# iOS Feature Implementation

## Overview

This skill is the methodology `ios-feature-developer` follows to implement **exactly one** task in a native iOS codebase, fix a defect in one, and hand the result to QA. It owns *how* iOS work is grounded, written, verified and reported.

It is not orchestration. `/implement-task` resolves the task, enforces the approval gates and routes here; the `require-approval-before-code`, `block-main-branch-changes` and `protect-secrets` hooks gate the writes. Nor is it planning: `skills/ios-dev-planning` produced the approved technical approach, and this skill starts from the decisions the DD records ([§4](#4-what-design-handed-over-and-drift)).

**Nothing about the repository's technology is assumed** — UI family, observation model, concurrency mechanism, dependency manager, persistence stack and test framework are possible findings in no order of preference, governed by `standards/ios/swift-standards.md` § *Neutrality, TV, and status*.

Two properties distinguish this stage. It compiles the code, so it can supply **Build-stage evidence** a diff-reading reviewer cannot ([§11](#11-build-stage-evidence)); and it is the stage most able to **overclaim**, so what may and may not be asserted is defined explicitly ([§15](#15-verification-reach--what-you-may-claim)).

## 0. Standards readiness gate

Every iOS rule here is grounded in an authored `standards/ios/*` document. If a cited standards document still carries the same unauthored-placeholder marker `/implement-task` tests for, **stop and report that iOS implementation is blocked** — never fall back to an assumed default. (All five iOS standards and the shared `A11Y-*`/`I18N-*`/`SEC-*`/`QA-*` documents are authored; this gate exists so the skill fails loudly if that regresses.)

## 1. Inputs this skill requires (resolved, never invented)

**Sections 1–4, 7 and 19 govern the Implement stage.** At **Fix** the input is the review-notes path and the platform-attributed, root-caused findings `mobile-debugging` hands over — [§16](#16-fix-stage) governs. At **QA** the input is the feature name and the Implement-stage record — [§17](#17-qa-stage) governs; if no such record exists, say so rather than reconstructing it from the diff.

At Implement, `/implement-task` resolves and verifies these and passes them in. Confirm each exists before acting; **never guess a path to a feature document**, and never re-derive a value that was passed:

- Absolute `TARGET_ROOT`, and absolute paths to the approved **Feature Analysis**, **DD**, **Dev Plan** and **Task Breakdown**.
- The **task id** and the **selected task row**.
- **`platform: ios`** and **`device_type`** (`mobile` or `tv`) — authoritative, never re-detected, never `mixed`.
- The recorded **design reference** fields, and dependency / approval / blocker status.

If a required input is missing or its target does not exist, **stop and report exactly which one**.

## 2. Source-of-truth hierarchy

Read the approved context **before editing any code**: Feature Analysis → DD → Dev Plan → Task Breakdown → the selected task row.

| Document | Authoritative for |
|---|---|
| Feature Analysis | Business objective, platform context, original intent |
| **Detailed Design** | **Architecture, technical approach, API contracts, state design, impacted modules, every approved decision** |
| Dev Plan | Sequencing, dependencies, rollout, rollback |
| Task Breakdown + task row | **Scope of this implementation** |
| The task's acceptance criteria | **The completion contract** |

Never implement from the original request when approved downstream documents exist. Never reinterpret a decision already approved in the DD. If the documents **conflict**, stop and report it rather than picking one. If the task requires violating or expanding the DD, stop and request approval. If a referenced document is missing, unapproved, stale or dry-run only, stop.

## 3. Task readiness

`/implement-task` §5 already gates approval, dependency completeness, blockers, `device_type`, the design reference and the branch, and passes the results in. **Confirm those results were passed rather than re-deriving them** — a second copy of that gate list would drift from the command's.

Read the task row's objective, files expected to change, acceptance criteria, `depends-on`, out-of-scope items and any linked DD sections or standard IDs. Then stop and name the condition if a passed status is absent or negative, or if the task is too large for one run — report that it should be split rather than absorbing it.

## 4. What Design handed over, and drift

`skills/ios-dev-planning` ran an evidence sweep, but that sweep is **research, not a deliverable** — `templates/dd-template.md` §19 is explicit that the DD receives its *conclusions* and that the survey is never pasted in. So do not expect a full recorded model, and do not go looking for one.

What you actually inherit is two things:

- **The Feature Analysis's Repo Context / Proposed Technical Approach** — the evidence base, at *Analyze* depth. Dimensions the feature was not expected to touch are deliberately marked `[unknown — not inspected at Analyze]`, and untouched ones `N/A`. An `[unknown]` is a gap by design, not a defect.
- **DD §19 and §20** — the decisions taken, the impacted modules, and the standard IDs each follows.

Read both. **For every dimension this task touches that the Feature Analysis marks `[unknown]`, or that DD §19 decides without stating the surrounding convention, inspect it yourself — scoped to the files this task changes.** That is not re-running the Design sweep; it is the minimum evidence needed to write the change correctly.

Then conform. Where an evidence-labelled finding contradicts the repository as it is now, **report the drift and stop** — do not silently code against either version. Where the repository is internally inconsistent, report the inconsistency rather than picking a side.

Where a rule is phrased against "the repository's convention" and none exists, resolve it with the ladder in `standards/ios/swift-standards.md` § *When the repository has no convention*, and **state which of its three cases applied**. An absent convention is never, by itself, compliance.

Before creating any new type, abstraction, component, navigation entry, state container, cache or networking primitive, **search for an existing one** and prefer extending it. The standards state this as a family of "no second mechanism" rules — navigation (`IOS-ARCH-NAV-1`), persistence (`IOS-ARCH-DATA-1`), dependency manager (`IOS-BUILD-DEP-1`), image caching (`IOS-PERF-IMG-4`) — and the same principle governs anything else the repository already solves once.

## 5. Toolchain probe

The repository determines the code; the **installed toolchain determines what can be verified**. Both are discovered. **Run this first — every later check is parameterised by its output.** Every command here is non-building and safe.

1. `xcodebuild -version` — record it; the result-reading branch in [§11](#11-build-stage-evidence) depends on it. Never hardcode a version.
2. Container: a `.xcworkspace` makes `-workspace` **and** `-scheme` mandatory; a bare `.xcodeproj` does not require `-scheme`, but omitting it silently builds the first target in project order — always pass one. A `Package.swift` root is a third case.
3. `xcodebuild -list -json 2>/dev/null` — the scheme inventory (JSON on stdout, noise on stderr). **An empty or missing scheme list is a stop-and-report condition**, not something to route around with `-target`.
4. `xcodebuild -showTestPlans -scheme <S> -json` — if any plan exists, **every test invocation must pass `-testPlan`**; otherwise the scheme's default plan silently governs the target set, coverage and parallelism. If the command errors, treat the repository as having no plan and say so rather than assuming one.
5. `xcodebuild -showdestinations -scheme <S>` — pin one simulator **UDID** and reuse it, corroborated against `xcrun simctl list devices available --json`. If no simulator destination is available, **stop and report it** — do not fall back to a device destination, which drags in signing you are not there to solve.
6. Record whether `Package.resolved`, `Podfile.lock` and `*.xcconfig` exist. If `XCODE_XCCONFIG_FILE` is set in the environment, **stop and report it** before building: it overrides every other setting *including command-line ones*, so any build you run is not the build you specified.

### Probe traps

- **`-showdestinations` output is not `-destination` input** — it prints `platform:iOS Simulator, id:…` with colons; `-destination` requires `key=value`.
- **A malformed option makes `xcodebuild` dump its whole help text**, so the real message is at the *top* of stderr. Match the first lines, never the tail.
- **`-json` is a narrow whitelist** — `-list`, `-showsdks`, `-showBuildSettings`, `-version`, `-showComponent`, and undocumented on `-showTestPlans`. It is **not** supported on `-showdestinations`, which *silently accepts the flag and prints plain text anyway*, so a JSON parser fails at runtime rather than at invocation. `-json` also implies `-quiet`, and is absent from `man xcodebuild` entirely — check `xcodebuild -help` for the current set.
- **A scheme that was never shared does not exist for you** — shared schemes live in `<container>/xcshareddata/xcschemes/`, unshared ones in the author's `xcuserdata/`. No `xcodebuild` flag creates or shares one; report it rather than improvising.

## 6. Pre-write checks

Each prevents a class of error otherwise discovered by a failed build — or not at all.

### Deployment target of the target that owns the file

Precedence, highest first: `xcodebuild -showBuildSettings -json` with the container and scheme the probe resolved. It collapses project, target and `.xcconfig` layering correctly and is the value the compiler will use — but it returns a **JSON array with one entry per target in the scheme**, so select the entry whose `"target"` matches the one that owns your file. **`-target` is silently ignored when `-scheme` is passed** (`man xcodebuild`: *"Use with -target **or** with -scheme"*) — no error, no warning, and reading element `[0]` hands you the app target's value while you edit a test or extension target. To query one target without a scheme, use `-project <P> -target <T>` → the owning target's `IPHONEOS_DEPLOYMENT_TARGET` → the project-level value → `Package.swift` `platforms:` for package code. A Podfile's `platform` governs the Pods project only; it corroborates, it never decides. Expect several different values in one `project.pbxproj` — app, test and extension targets each carry their own (`IOS-BUILD-CONFIG-*`).

**Trap:** a `Package.swift` with **no** `platforms:` clause means "the oldest version the installed SDK supports", not "modern". Never read its absence as permission to use a recent API.

### Availability, before using an unfamiliar API

`xcrun --sdk iphonesimulator swiftc -target arm64-apple-ios<TARGET>-simulator -typecheck Scratch.swift` is sub-second, needs no project, and names the exact version required. **Write the scratch file to a temporary directory, never into `TARGET_ROOT`** — a stray file there contradicts the clean-scope confirmation [§19](#19-completion--reporting) must make. Use it rather than discovering the gate in a full build.

**`if #available` rescues statements, not declarations.** A runtime check lets you *call* a newer API, but cannot rescue a declaration whose signature or stored-property type names a newer symbol. The compiler distinguishes the two: a note reading *add `@available` attribute to enclosing …* means the declaration is the problem; *add `if #available` version check* means a statement guard suffices. When a repository pins an older Xcode, the installed SDK's `.swiftinterface` is authoritative over any documentation page.

**Toolchain gates and runtime gates differ.** A macro that expands to ordinary code carries the runtime floor of what it expands into, not of the toolchain that compiled it. Decide which kind applies before adding an `@available`.

### Isolation, before adding to an existing type

Detect the **effective** language mode and isolation posture of the owning target — `SWIFT_VERSION`, `SWIFT_STRICT_CONCURRENCY` and default-actor-isolation settings can differ per target, and recent project templates may make main-actor isolation the default. Detect; never assume, and never weaken a setting to land a change (`IOS-SWIFT-CONC-7`).

### Observation model of the surface

`IOS-UI-STATE-3` and `IOS-UI-STATE-4` already state which ownership and binding wrapper belongs to which observation model, including that `@Bindable` requires `Observable` conformance and is inapplicable to `ObservableObject`. Follow them; do not improvise a pairing, and never introduce a second observation model into a surface that already has one.

Three failure modes those rules do not cover, each of which **compiles and silently never updates**:

- **Inherited properties are invisible.** When an `@Observable` class inherits from a non-observable superclass, the superclass's stored properties are not tracked. The annotation is present and correct, so no grep of the type being used will find it — walk the superclass chain.
- **Observation is read-driven.** Only properties actually read while producing the view's body are tracked; a property the body never reads will not invalidate it.
- **`@Observable` provides no isolation.** Its stored properties are ordinary mutable properties. A model touched from the main actor still needs the isolation the repository uses.

### Previews are not a verification signal

A preview's only headless-observable property is that it **compiles** — which the build already tells you. `xcodebuild` has no preview action, and the external-agent bridge requires the Xcode application to be open. Never claim a preview was rendered or checked. If the repository uses previews, match what its deployment target allows: a plain or named `#Preview` on a SwiftUI view goes back to iOS 13, while `traits:`, `@Previewable` and any UIKit or AppKit `#Preview` require iOS 17 and must be wrapped in `@available` below that.

## 7. Pre-implementation plan

Before the first edit, produce a concise plan: objective; acceptance criteria; files expected to change; files read for context; existing patterns being reused; implementation sequence; validation strategy; risks and side effects; applicable standard IDs. The command-level `require-approval-before-code` hook governs approval — this plan does not need a second one, but it must exist before the first edit.

## 8. Implementation guidance by area

Apply these as you write, grounded in what [§4](#4-what-design-handed-over-and-drift) established about the repository. The `IOS-*` documents carry the rules; consult the cited document when a decision is not obvious from the surrounding code.

| Area | What to get right | IDs |
|---|---|---|
| Swift language & safety | Nullability, no gratuitous force-unwrapping or unsafe casts, error handling that matches the repo, naming, no unjustified experimental API | `IOS-SWIFT-NULL-*`, `IOS-SWIFT-ERR-*`, `IOS-SWIFT-TYPE-*`, `IOS-SWIFT-NAME-*`, `IOS-SWIFT-LINT-*` |
| Object lifetime | Capture semantics in closures, delegates, notification observers, cancellables and task handles; nothing self-retaining that prevents deallocation | `IOS-SWIFT-LIFETIME-*`, `IOS-PERF-MEM-3` |
| Concurrency & isolation | Conform to the target's language mode and isolation posture; never block the main thread or the cooperative pool; respect cancellation | `IOS-SWIFT-CONC-*`, `IOS-PERF-MAIN-*` |
| Architecture & layers | Preserve layer and module boundaries; no I/O or business rules in a view; no new pattern for one task | `IOS-ARCH-LAYERS-*`, `IOS-ARCH-MODULE-*`, `IOS-ARCH-DI-*` |
| Presentation state | Follow the surface's observation model exactly; one owner per piece of state; loading, empty, error and success all explicit | `IOS-UI-STATE-*`, `IOS-UI-VIEW-4`, `IOS-ARCH-LAYERS-5` |
| SwiftUI | Reuse the design system; stable identity in collections; `body` pure and side-effect free; intentional state and effect lifetimes | `IOS-UI-VIEW-*`, `IOS-UI-ID-*`, `IOS-PERF-RENDER-*` |
| UIKit | Respect view-controller lifecycle; clear references on teardown; reuse existing cells and styles; no retained views or contexts | `IOS-UI-UIKIT-*`, `IOS-UI-CELL-*` |
| SwiftUI/UIKit interop | Bridge at the boundary the repo already uses; do not introduce a second UI family into a surface | `IOS-UI-INTEROP-*`, `IOS-UI-FRAMEWORK-3` |
| Navigation | Reuse existing destinations and argument models; validate deep-link inputs; no navigation from data or domain layers | `IOS-ARCH-NAV-*`, `SEC-DEEPLINK-*` |
| Data & persistence | Use the stack the repo already uses; migrate on schema change; never clear user data to dodge a migration; keep disk work off the main thread | `IOS-ARCH-DATA-1`, `SEC-STORAGE-*` |
| Networking | Go through the repo's client and auth layer, never an ad-hoc request at a call site; follow approved DD contracts exactly — invent no paths, fields or response shapes. **If a backend contract is unconfirmed, stop** | `IOS-ARCH-DATA-5`, `SEC-AUTH-*`, `SEC-NET-*` |
| Performance | Avoid main-thread work and unbounded growth; use the repo's image pipeline; consider launch, render and size impact. **Never assert a magnitude from reading code** — measure it or file it as a measurement request | `IOS-PERF-*`, `IOS-PERF-MEASURE-1` |
| Security & privacy | Approved secure storage; validate external input; no weakened transport security; least-privilege permissions at point of need. **Never log tokens, request bodies or PII** — this row owns that rule for every surface above | `SEC-SECRETS-*`, `SEC-STORAGE-*`, `SEC-NET-*`, `SEC-PERMS-*`, `SEC-LOG-*` |
| Diagnostics & analytics | Reuse existing logging and analytics conventions; only the events the DD requires; debug logging gated | `IOS-SWIFT-LOG-*`, `IOS-SWIFT-ANALYTICS-*` |
| Build & configuration | Do not change deployment target, language mode or signing configuration to make code compile; a new dependency needs a stated cost | `IOS-BUILD-CONFIG-3`, `IOS-BUILD-DEP-*`, `IOS-ARCH-MODULE-5` |

The rows are a checklist, not a ladder — the file being changed decides which UI family applies (`IOS-UI-FRAMEWORK-1`).

**`device_type: tv`** is a context signal, not a platform — `swift-standards.md` § *Apple TV* governs. Additionally: never silently carry a touch assumption into a TV surface, and never cite a TV standard ID, since those roots stay reserved until `ATV-001`.

## 9. Scope control

Implement **only** the selected task. Do not opportunistically fix unrelated issues, refactor unrelated code, absorb another task, change an approved contract or business rule, edit the DD silently, mark a dependency complete without evidence, or add speculative abstraction.

On discovering additional work: **stop** it, **document** the finding, **explain** what it needs (a new task, a DD amendment, a product or backend answer, a security review, a migration), and **continue** only within the approved scope. If the task itself cannot be completed without expanding scope, stop and report it blocked.

## 10. The implement loop

```
xcodebuild build -workspace <W>.xcworkspace -scheme <S> \
  -destination 'platform=iOS Simulator,id=<UDID>' -configuration Debug \
  -derivedDataPath ./.build/dd -resultBundlePath ./.build/run-<n>.xcresult -quiet
```

- **`-derivedDataPath` inside the working tree is mandatory.** It isolates you from the developer's global DerivedData, and makes a stale-cache reset `rm -rf ./.build/dd` rather than deleting their incremental state and indexes. Never delete `~/Library/Developer/Xcode/DerivedData` — it is the human's, not yours. Keep the path stable so dSYMs stay findable for symbolication (`IOS-BUILD-REPRO-*`).
- **`-resultBundlePath` must be unique per run** — reusing an existing path is a hard error, so a naive retry loop fails on its second iteration for a reason unrelated to the code.
- **Confirm `.build/` is ignored before the first build.** If it is not, put the derived-data and result-bundle paths outside `TARGET_ROOT` rather than adding an ignore rule — that would be an unrelated change (`IOS-BUILD-CONFIG-*`).
- For a pure compile check prefer `-destination 'generic/platform=iOS Simulator'` — no boot, no signing. `-quiet` still prints warnings and errors, so output on success is not empty.

Implement in small steps and build after each meaningful one — do not discover at the end that the target no longer compiles.

## 11. Build-stage evidence

`standards/ios/swift-standards.md` § *Applicability stage* marks a rule **Build** when it requires compiling, linting or archiving, and assigns that verification to **CI or the implementer**; a reviewer working from a diff marks those rules Not Applicable rather than asserting a verdict. Diff is the default — only four iOS rules carry the Build marker: `IOS-SWIFT-LINT-1` and `IOS-SWIFT-LINT-3`, which are this lane's, and `IOS-BUILD-REPRO-1`/`-2`, which `mobile-release-engineer` files but which you are the participant able to evidence. **Where CI has not already run for this change, you are the only participant who can supply that evidence** — treat it as a deliverable, not a side effect.

**Read the verdict structurally; do not parse `xcodebuild` stdout.** Exit codes follow `sysexits(3)` but the man page states other codes occur, so an exit code is not a reliable classifier.

- Xcode **≥ 16**: `xcrun xcresulttool get build-results --path <bundle> --compact` → branch on `status`, `errorCount`, `errors[]`, **and `warningCount`/`warnings[]` — a newly introduced warning is itself the `IOS-SWIFT-LINT-3` finding.**
- Xcode **< 16**: `xcrun xcresulttool get object --format json --path <bundle>` (the `--legacy` flag does not exist there).

Derive the branch from the recorded `xcodebuild -version`. Xcode 16 deprecated `get object` — it now requires `--legacy`, which still functions but should be treated as imminent-risk. **As of Xcode 26.0.1, Apple's own help text recommends `get test-report` — a subcommand that does not exist**, and the call falls through to `object` and errors on a missing argument. The real replacements are `get build-results` and `get test-results`. Re-check this against the version the probe recorded; it is an Apple help-text bug fixable in any point release.

Gate any coverage or test-results read on `xcrun xcresulttool get content-availability --path <bundle>` rather than discovering emptiness by failure.

Run the project's configured Swift analysis and formatting tools the way the repository invokes them, and record the result (`IOS-SWIFT-LINT-1`); where the repository configures none, say so rather than substituting one.

Record, per acceptance criterion, the exact command run and its structured result, and what could not be verified — [§15](#15-verification-reach--what-you-may-claim) governs what may be claimed.

## 12. Tests: detect the regime, then write to it

The repository's testing regime is discovered, never chosen. Record five things before writing a test — unit framework in current use, the test targets and their bundle kinds, the test plans and the **exact CI invocation**, the Xcode/Swift version, and the support libraries — then conform (`IOS-ARCH-TEST-*`).

| Question | Evidence |
|---|---|
| Which unit framework? | `import Testing` + `@Test`/`@Suite`/`#expect` vs `import XCTest` + `: XCTestCase`/`XCTAssert*`/`func test…()` |
| Which regime is *current*? | The convention of the nearest neighbouring code in the same target, by the most recent commit touching it — **not** repo-wide counts. Where that is ambiguous, report the ambiguity rather than picking |
| What kind of target? | `project.pbxproj` `productType` `…bundle.unit-test` vs `…bundle.ui-testing`; `TEST_HOST`/`BUNDLE_LOADER` ⇒ app-hosted unit tests; `.testTarget` in `Package.swift` ⇒ SwiftPM, unit only |
| How does CI actually run them? | `.github/workflows/*`, `fastlane/Fastfile`, `Makefile`, `*.sh` — grep `xcodebuild test`, `-testPlan`, `-only-testing:`, `swift test`. **Authoritative over any invocation you invent** |
| Which support libraries? | `Package.resolved`/`Podfile.lock`. A `__Snapshots__/` directory means a golden-image contract exists |

Both frameworks may legally coexist in one target and even one file. A mixed repository is **not** a defect to fix while implementing a feature.

**Route by test kind, not by preference.** Logic and unit tests → whichever unit framework the neighbouring tests use. **UI automation → XCTest/XCUIAutomation, always.** **Performance measurement → `XCTestCase.measure`, always.** Objective-C-exception-throwing code → Objective-C XCTest.

### Testing traps

1. **Silent assertion loss.** An `XCTAssert*` reached from a Swift Testing `@Test` is **discarded** — the test passes while asserting nothing, and the result bundle records nothing. Verified still true on Xcode 26.0.1 / Swift 6.2; **no toolchain fixes this**, because XCTest assertions are only usable from `XCTestCase`-based tests. Never share an assertion helper across the two families.
2. **`@Test` inside an `XCTestCase` subclass is a compile error**, even though both may share a file. In Swift Testing, new suites are a `struct`, or a `final class`/`actor` when `deinit` teardown is needed.
3. **"This code has no tests" concluded from file inspection is unsound.** Both frameworks discover tests at *runtime*. A covering test may carry no `test` prefix, sit in an unrelated file, or be one parameterized case. Answer by running `-only-testing`, never by grepping.
4. **The test plan can silently exclude the new test** via include/exclude lists or tag filters — it passes locally and never runs in CI. Check `-showTestPlans` and the plan's selected/skipped sets.
5. **Isolation differs between the frameworks.** XCTest runs synchronous test methods on the main *thread*, but the method is **`nonisolated`** — `XCTestCase` is not `@MainActor`, so touching `@MainActor` state from one is a compile error under strict concurrency until you annotate the test class or method. Swift Testing runs tests on an arbitrary task, in parallel, in-process. Shared global state needs `.serialized`, which orders only *within* a suite.
6. **Adding one parallel test can destabilise a suite that assumed serial execution.** Never rewrite other people's tests mid-feature to accommodate yours; in Swift Testing, `.serialized` on your own suite is the contained fix.

### Rules that hold regardless of regime

- Identify UI elements by **accessibility identifier**, never by localised or literal copy; adding identifiers to the feature's views is part of the change. Identifiers are test hooks, not a substitute for a label (`IOS-UI-ID-*`, `A11Y-ROLES-*`).
- Inject test-only state through `launchArguments`/`launchEnvironment` set **before** `launch()`. Wait with `waitForExistence(timeout:)`, never `sleep`.
- **Snapshot tests only where the repository already has a snapshot library**, following its recording convention. Introducing one is an architecture decision, not a test. **Never regenerate an existing reference image to make a suite green.**
- **Coverage is a diagnostic, never a gate.** Report the delta on the files this task changed: skipped tests are excluded, known-issue tests are *included*, and coverage measures execution, not assertion. Never gather it on a run used for performance numbers.
- Prove the new test actually **executed** — confirm it in the result bundle, do not infer it from a green suite. Run it in isolation *and* in the full suite: divergence is an ordering defect in your test, not a flake.

## 13. Running tests

Discover identifiers instead of guessing them: `xcodebuild test -scheme <S> -destination '<pinned>' -enumerate-tests -test-enumeration-style flat -test-enumeration-format json -test-enumeration-output-path -`. What it emits is exactly what `-only-testing`/`-skip-testing` accept; a `-destination` is still required to enumerate.

- **Narrow first**, then broaden. `-only-testing` takes precedence over `-skip-testing`.
- **When iterating, split the phases**: `build-for-testing` once, then repeated `test-without-building -xctestrun <path>`. `-xctestrun` cannot be combined with `-workspace`/`-project`.
- CLI flags **override the test plan's own settings** (coverage among them), so a flag-driven run stops matching what the developer sees in Xcode. Say which you used.
- Read results structurally: `get test-results summary --compact`, then `get test-results test-details --test-id <id>` for failures only. A crash's structured `failureText` is a summary — the sanitizer or assertion detail is in the console output, so capture both.
- Pull failure evidence without opening Xcode: `xcrun xcresulttool export attachments --path <bundle> --output-path <dir> --only-failures`.
- Flake controls exist (`-test-iterations`, `-retry-tests-on-failure`, `-run-tests-until-failure`) — **a retry flag is a diagnostic, never a way to make a failing test report success.** If a test passes only on retry, report it as flaky.

**What you cannot do:** `simctl` has **no tap, swipe or type primitive**. Any verification depending on interacting with the UI must be an XCUITest run through `xcodebuild test`. A static screenshot is available after `simctl install` + `launch`, app logs go to **stderr** under `--console`, and `booted` picks nondeterministically when several simulators run — pin the UDID.

### Build failures → the non-destructive diagnostic

| Symptom | Read-only diagnostic |
|---|---|
| Scheme missing or unshared | `xcodebuild -list -json`; then check `*/xcshareddata/xcschemes/` |
| Destination unavailable | `xcodebuild -showdestinations`; `xcrun simctl list devices available --json` |
| Simulator runtime absent | `xcrun simctl list runtimes` → `xcodebuild -downloadPlatform iOS` |
| Signing failure on a device destination | `xcodebuild -showBuildSettings -json` → `CODE_SIGN_IDENTITY`, `DEVELOPMENT_TEAM`. **Avoid entirely by targeting a simulator** (`IOS-BUILD-SIGN-*`) |
| Unresolved package checkout | `xcodebuild -resolvePackageDependencies -clonedSourcePackagesDirPath ./.build/spm`; check `Package.resolved` staleness |
| Macro or package-plugin trust prompt | `-skipMacroValidation`/`-skipPackagePluginValidation` exist but are a **security decision — surface it, never pass it silently** (`IOS-BUILD-DEP-*`) |
| Suspected stale derived data | rebuild into a fresh `-derivedDataPath`; never delete the global one |
| Xcode components not installed | `xcodebuild -checkFirstLaunchStatus` (non-zero ⇒ needs `-runFirstLaunch`, privileged) |

## 14. Accessibility, localization and RTL

Detect the repository's conventions before writing; introduce nothing app-wide for one feature.

| Dimension | Evidence to collect |
|---|---|
| Localization system | `*.xcstrings` (String Catalog) vs `*.strings`/`*.stringsdict` (string tables). Both present ⇒ follow the file the neighbouring feature uses; neither is the target of a migration |
| Localization API | `String(localized:` vs `NSLocalizedString(` vs `LocalizedStringResource` — resolved the same way as the testing regime above: nearest neighbouring code in the same target, most recently touched |
| Vendor pipeline or generator | `crowdin.yml`, `.lokalise`, `phrase.yml`, `swiftgen.yml`, `L10n.`/`R.string` accessors ⇒ **hard stop on hand-editing**; strings enter through that tool's source of truth |
| Shipped languages | `*.lproj` directories / `knownRegions`. An `ar.lproj` or `he.lproj` makes RTL a shipping requirement |
| Identifier convention | `accessibilityIdentifier` usage and any central identifier enum |
| Dynamic Type pattern | `preferredFont(forTextStyle:)`, `UIFontMetrics`, `@ScaledMetric`, `adjustsFontForContentSizeCategory` |
| Existing audit coverage | `performAccessibilityAudit` call sites, the audit types passed, and any `issueHandler` allowlist |

**Adding a string.** With a String Catalog, use a localizable API and **build** — Xcode extracts the key; hand-editing the JSON fights the extractor. With string tables, add the key to **every** `*.lproj` in `knownRegions` in the same change — a real string in the base locale and a placeholder elsewhere, never a missing key (`I18N-COPY-5`) — and put plurals in `.stringsdict`. Namespace the key per the repository's convention (`I18N-COPY-2`), and supply a `comment:`: it is the only context a translator receives (`I18N-COPY-*`).

**The literal-versus-variable trap.** In SwiftUI a string *literal* binds the localizing overload and a `String` *variable* does not: `Text(someVariable)` and `.accessibilityLabel(someVariable)` silently ship untranslated. This is the most common silent localization regression and it is greppable.

**Identifier is not label.** Labels, traits, decorative hiding and composite grouping are governed by `IOS-UI-A11Y-1` and `IOS-UI-A11Y-3` with `A11Y-ROLES-*`. The implementation detail those rules do not carry: an element needs a stable, unlocalized `accessibilityIdentifier` for tests **as well as** its label, and the two must never be the same expression — an identifier is invisible to VoiceOver, and a test token placed in a label gets spoken aloud (`IOS-UI-ID-*`).

**Dynamic Type.** `IOS-UI-A11Y-2` and `A11Y-FONT-*` govern text scaling and the UIKit obligations. Additionally, scale *non-text* dimensions — spacing, icon sizes — with `UIFontMetrics.scaledValue(for:)` or `@ScaledMetric`, which the rules do not cover.

**Direction.** Use leading/trailing. `left`/`right` is correct only with a deliberate `semanticContentAttribute` or a documented physical-direction reason — playback transport controls and scrubbers are the legitimate case in a media app, and flagging them is a false positive (`I18N-RTL-*`).

## 15. Verification reach — what you may claim

Determine which tier a check falls in **before** reporting it. Overclaiming is the failure mode this section exists to prevent.

**Tier 1 — mechanical; may gate the task.**

- `try app.performAccessibilityAudit()` in a UI test, run **once per new or changed screen** — the audit is screen-scoped, so one call is not coverage. It fails the test by itself. Requires an **OS version of iOS 17 / tvOS 17 / watchOS 10 / macOS 14 or later** — the floor is the OS the test runs against, simulator or device, not the Xcode version.
- Audit types are platform-dependent: element description, hit region, contrast and element detection everywhere; **clipped text, traits and Dynamic Type on iOS/tvOS/watchOS only**.
- Re-run the flow with double-length and right-to-left pseudolocalization launch arguments, and under each accessibility setting the platform exposes — Tier 3 names the complete set and how to reach the ones `simctl ui` does not.
- Confirm new keys reached the catalogue — a `git diff` on `*.xcstrings`, or `xcodebuild -exportLocalizations` and check the XLIFF.
- Static greps: hardcoded font sizes, fixed text-container heights, `left`/`right` anchors, non-literal `Text(…)`, identifier equal to label.

**Tier 2 — needs a snapshot baseline a human approved once.** Visual correctness at accessibility sizes, RTL mirroring correctness, and the visual result of increased contrast. The audit catches *clipping*, never *wrong*. Applicable only where the repository already has snapshot infrastructure.

**Tier 3 — no headless mechanism exists. Report as unverified; never as passed.**

| Not verifiable | Why |
|---|---|
| Whether a label is *meaningful* | The audit checks a label exists. `accessibilityLabel("image1")` passes |
| VoiceOver order, rotor, custom actions, announcements | VoiceOver cannot be run on the Simulator at all. Note `UIAccessibility.isVoiceOverRunning` returns **true spuriously** on a simulator once the automation accessibility bridge is up — never gate on it |
| Reduce Motion, Bold Text, Invert Colours — whether the branch is visually *right* | `simctl ui` reaches only `appearance`, `increase_contrast` and `content_size` (Xcode 26.0.1), but the rest can be forced with `xcrun simctl spawn <UDID> defaults write com.apple.Accessibility …` plus the matching `notifyutil -p com.apple.accessibility.cache.*` post. That proves the code **branches** — Tier 1. Whether the branch looks correct is Tier 2, not verifiable here |
| Contrast of text over video, images, gradients or custom drawing | The contrast audit is scoped to overlapping *elements* — the media case sits outside it |
| Anything on a screen the test never reached | The audit sees only the current screen |
| Translation quality; plural correctness | Pseudolanguages simulate length and direction, not meaning |

Accessibility Inspector is a GUI application with no command-line entry point; the headless equivalent of its audit is `performAccessibilityAudit`.

A green audit means *no detected defect on the screens the test visited*. It does not mean the feature is accessible. **Your handoff input states what was not verified and why — if that list is empty, you have overclaimed; re-derive it from the tiers above before handing off.** Treat an `issueHandler` returning `true` as recorded debt that needs a reference, and never add an entry to silence an issue this task introduced.

## 16. Fix stage

`skills/mobile-debugging` owns parsing the review notes, grouping findings by severity, attributing each to a platform and root-causing it. Do not restate it. What is iOS-specific is **proving the fix**.

Three artifacts are required, in this order:

1. **A test that reproduces the defect and is red before the change**, where the defect has an observable behaviour — the regression test is the evidence. Where it does not (a naming, layering, access-control or configuration finding), say so and prove it by the diff plus artifact 3; do not manufacture a test to satisfy this list. If the layer has no test infrastructure at all, report that as a blocker on *proving* the fix rather than building a harness inside a fix pass.
2. **A one-paragraph cause statement** — what caused it, not where it surfaced. This *is* the root-cause field of `mobile-debugging`'s fix log, not a second document. That skill's root-cause-over-workaround constraint applies unchanged; the iOS-specific addition is that a main-queue hop papering over an isolation bug is such a workaround (`IOS-SWIFT-CONC-3`).
3. **The class-appropriate diagnostic below, green after the change**, which is how `mobile-debugging` step 6's re-verification is satisfied on iOS.

| Defect class | Cheapest headless proof |
|---|---|
| Data race | Strict-concurrency diagnostics first — if the compiler can express it, that is the proof. Then `xcodebuild test -enableThreadSanitizer YES` on a **simulator** destination. A single clean pass proves nothing for an intermittent race — repeat with `-test-iterations` |
| Memory corruption | `-enableAddressSanitizer YES`. Expect the process to **abort** and the run to relaunch with merged results — that is normal, not a second failure. Address Sanitizer does **not** detect leaks |
| Retain cycle | A weak-reference teardown check — `addTeardownBlock { [weak sut] in XCTAssertNil(sut) }` in XCTest, the equivalent scope-exit or `deinit` check in a Swift Testing suite. Use whichever regime [§12](#12-tests-detect-the-regime-then-write-to-it) detected |
| Off-main-thread UI | Free, no injection: UIKit self-reports layer mutation off the main thread in the unified log under `com.apple.UIKit` / `Assert`, with a backtrace |
| Runtime issues | The `com.apple.runtime-issues` subsystem carries the same diagnostics Xcode shows as runtime warnings |
| Constraint conflict | **Off by default (measured on iOS 26.0)** — enable unsatisfiable-constraint logging by launch argument, then read `com.apple.UIKit` / `LayoutConstraints`. Grepping the log *without* enabling it is a false pass. Confirm against the runtime the probe recorded |
| Crash | A reproducing test, then the `.ips` from the result bundle (`export attachments --only-failures`). System frames arrive symbolicated; your own frames need the matching dSYM |
| Regression | `-only-testing:` the new test first, then the repo's full invocation |

**Limits, stated so they are not worked around.** `leaks` and the Instruments Leaks template **cannot attach to a simulator application** — the failure is in simulator process introspection, not the tools, and re-signing to force it is not a workaround. The Memory Graph and View debuggers are Xcode-only. Instruments can be recorded headlessly, but its exports carry raw addresses until symbolicated. On iOS, leak investigation beyond a teardown assertion is a **human hand-off** — say so rather than inventing a check.

Address and Thread Sanitizer **cannot build together** (`error: argument '-sanitize=thread' is not allowed with '-sanitize=address'`); `-enableUndefinedBehaviorSanitizer YES` composes with either. Sanitizers do conflict with the malloc diagnostics.

## 17. QA stage

`skills/mobile-testing-and-qa-handoff` owns the handoff document. This skill supplies the iOS half: how to build, install and run the change, the surfaces it touches, the standard IDs applied, and — non-negotiably — **what could not be verified and why** ([§15](#15-verification-reach--what-you-may-claim)).

Answer `QA-A11Y-1` with the Tier 3 list explicitly rather than leaving it implicit, and note that device install and TestFlight paths are `mobile-release-engineer`'s (`IOS-BUILD-SIGN-*`) — this skill is simulator-based by design.

**The logging privacy trap.** The Simulator does not redact dynamic string values; a device does. A check that reads a value out of the log therefore passes in development and silently breaks in device CI unless that value is logged explicitly public. Never make a QA criterion depend on a log value that is not (`SEC-LOG-*`).

## 18. Self-review

Before reporting, review against: task scope · DD compliance · layer and module boundaries · naming and duplication · dead code · lifetime and isolation safety · state consistency · error handling · accessibility · localization and RTL · performance · security and PII in logs · test coverage of the change · unintended file changes · migration and rollback impact. Report every unresolved concern — do not hide one.

## 19. Completion & reporting

Produce a structured report: task implemented · objective · files changed · summary · existing patterns reused · **acceptance criteria checked one by one** · dependencies verified · **validation commands run with their exact results** · Build-stage evidence · tests added or updated · **standard IDs actually applied** · what could not be verified and why · deviations from the DD · risks and limitations · unresolved blockers · follow-up tasks discovered · confirmation that no unrelated scope was added and that writes landed inside `TARGET_ROOT`.

This list is a superset of `/implement-task` §10's required coverage; never drop an item from that list. **Do not mark the task complete** — there is no approved status-mutation mechanism; report for a human to act on. **Do not report success if** any acceptance criterion failed, required validation failed, a dependency is unproven, a blocker remains, the implementation deviates from the DD without approval, or the changes exist only in a worktree.

## 20. Standards citation

Record which IDs were **applied**, not merely reviewed — this is the trace `ios-code-reviewer`, `ios-performance-reviewer` and the QA handoff rely on.

| Area | Document | IDs |
|---|---|---|
| Swift language, lifetime, concurrency, diagnostics | `standards/ios/swift-standards.md` | `IOS-SWIFT-*` |
| SwiftUI, UIKit, interop, cells, identity | `standards/ios/swiftui-uikit-standards.md` | `IOS-UI-*` |
| Architecture, navigation, data, DI, modules, testing | `standards/ios/ios-architecture.md` | `IOS-ARCH-*` |
| Performance & memory | `standards/ios/ios-performance.md` | `IOS-PERF-*` |
| Build, signing, dependencies, distribution | `standards/ios/xcode-build-signing.md` | `IOS-BUILD-*` |
| Accessibility · Localization & RTL · Security · QA handoff | `standards/shared/` | `A11Y-*` · `I18N-*` · `SEC-*` · `QA-*` |

Findings are **filed** by lane (`IOS-PERF-*` by `ios-performance-reviewer`, `IOS-BUILD-*` by `mobile-release-engineer`); this skill **applies** and cites them. Do not use React Native's `ARCH-*`/`API-*`/`STATE-*`/`NAV-*` or Android's `AND-*` IDs.

## Red flags — STOP and report

- A cited `standards/ios/*` document is an unauthored stub ([§0](#0-standards-readiness-gate)).
- A referenced document is missing, unapproved, stale, draft or dry-run only, or the documents conflict.
- An approved document contradicts the repository as it is now ([§4](#4-what-design-handed-over-and-drift)).
- The task needs to violate or expand the DD, or change an approved contract or business rule.
- A `depends-on` is not verifiably complete, or a blocker or open question remains.
- The task depends on an unconfirmed backend contract.
- A UI task has no readable design reference of any supported type.
- No scheme is visible, or the required scheme exists only in the author's `xcuserdata`.
- Completing the task requires touching files outside its approved scope, or a migration, deployment-target or language-mode change.
- You are about to claim a build, test or check you did not run — or a verification with no headless mechanism ([§15](#15-verification-reach--what-you-may-claim)).

## Relationship with command, agent, skills, hooks

- **`commands/implement-task.md`** — task selection, repo-root and document resolution, approval gates, platform routing, invocation.
- **`agents/ios-feature-developer.md`** — the iOS specialist that runs this methodology.
- **This skill** — the implementation methodology.
- **`skills/ios-dev-planning`** — produced the DD's technical approach; its recorded model is this skill's starting point.
- **`skills/mobile-debugging`** — owns Fix-stage finding-parsing and root-causing across platforms.
- **`skills/mobile-testing-and-qa-handoff`** — owns the QA handoff document.
- **Hooks** — `require-approval-before-code`, `block-main-branch-changes`, `protect-secrets`.

This skill does not restate command logic, does not re-run the Design-stage sweep, and does not invent paths to feature documents.
