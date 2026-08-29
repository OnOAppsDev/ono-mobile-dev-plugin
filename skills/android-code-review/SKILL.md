---
name: android-code-review
description: Methodology for reviewing native Android code changes against the org's authored AND-* standards and the shared A11Y-*/I18N-* standards. Used by /review-code (diff-scoped) and /prepare-mobile-release (release-scoped), via the android-code-reviewer agent (Pass A — correctness, architecture, Kotlin, UI, data, navigation, logging, tests) and android-performance-reviewer agent (Pass B — AND-PERF-* and AND-REL-*), merging into templates/code-review-template.md. Assumes no UI toolkit, architecture pattern, DI framework, or library; files only what the reviewed change supports, and requests measurement for anything a diff cannot establish.
---

# Android Code Review

## Overview

The methodology the two Android reviewer agents follow once a command hands them a scope. **Two passes, one skill**: `agents/android-code-reviewer.md` runs Pass A, `agents/android-performance-reviewer.md` runs Pass B — this plugin has no separate performance-review skill in any lane. Both agents declare this file in `skills:` frontmatter so it loads with them; where a harness ignores that field, read this file before reviewing.

**This skill is not orchestration** — scope resolution, platform attribution, standards loading and the merge belong to the invoking command. **It never modifies the code under review**: neither agent declares `Edit` or `NotebookEdit`, but that is a backstop, not the rule. The rule is this sentence, and it binds equally through `Bash` and through any delegated sub-agent.

**It assumes no technology.** **Nine of the ten** `standards/android/*` files carry the same governing clause — follow the repository's *detected* stack rather than imposing one. (`android-performance.md` is the exception: its line 5 governs profiling, not stack choice.) So Compose or XML/Views with ViewBinding or DataBinding; MVVM, MVI, Clean or the project's own layered variant; Hilt, Dagger, Koin or manual DI; coroutines/Flow, `LiveData` or RxJava; Retrofit or Ktor; Room, DataStore, SharedPreferences or files — **each is a possible finding, never a default.** **"The repository does not use X" is never a finding**; the finding is that the change departs from what the repository does use.

**Custom-wrapper carve-out.** Where a concern is routed through the repository's own abstraction — a project logger rather than `Log`, an injected dispatcher-provider rather than `Dispatchers.IO`, the shared client rather than a per-call-site `Retrofit.Builder()` — apply the standard's **intent to the wrapper's observable behaviour**, and never demand the framework API the standard's example happens to name. Demanding the example is the characteristic false finding on a wrapped codebase.

## What this skill does not own

Referencing these is correct; restating them is duplication.

| Concern | Owner |
|---|---|
| The output document's shape — severity headings, finding format, organizing axis, verdict values | **`templates/code-review-template.md`** |
| Scope resolution, platform attribution, standards loading, approval gates, agent routing, the merge | **the invoking commands** — `/review-code` and `/prepare-mobile-release` |
| Repository-knowledge resolution and its citation shape | **`skills/repo-knowledge-consumer/SKILL.md`** and `docs/repo-knowledge-contract.md` |
| The release checklist itself | **`skills/mobile-release-readiness/SKILL.md`** |
| Security findings | **`standards/shared/mobile-security.md`** → `mobile-security-reviewer`, via `/review-security` |
| The static-analysis and formatting tool list | **`AND-KT-LINT-1`** — cite the ID, never restate the tools |

## 0. Standards readiness gate

Android's rules live in **ten files under `standards/android/`, carrying 145 `AND-*` IDs**, plus the two shared files — the routing table is [§ Standards citation](#standards-citation). Before reviewing, confirm that the files **this pass will cite** are authored and not structure-only placeholders: Pass A's eight plus the two shared files, or Pass B's two ([§6](#6-the-two-passes)).

A **structure-only placeholder** is a standards file that carries its headings but not its rules — it declares itself unauthored rather than listing `AND-*` bullets. If a file this pass cites is missing or is one, **stop and report that Android review is blocked until it is authored.** Never fall back to unwritten expectations, and never substitute another platform's standard for a missing Android one. **Perform the check — do not assume the answer from a previous run.**

## 1. Resolve scope

Use the Android-attributed file list or diff handed in by the caller — **do not re-derive it.** Record the mode — diff review, whole-repo audit, or release — in Scope.

| Invocation | Scope | What is live |
|---|---|---|
| `/review-code` | **Diff-scoped** — only code introduced or modified within the resolved scope | Pass A in full; Pass B's `AND-PERF-*`. **`AND-REL-*` is not live here** — see below |
| `/prepare-mobile-release` | **Release-scoped** — the shipping build, not a diff | **Pass B only — Pass A does not run at this stage.** `AND-PERF-*` stays live and `AND-REL-*` goes live in full ([§13](#13-release-stage-pass-b-only)); the diff-oriented rules below do not apply, and neither does per-rule Not Applicable bookkeeping over unchanged files |

**`AND-REL-*` is release-scoped only, and a changed build file is still reviewed.** `standards/android/gradle-build-signing.md:5` names `mobile-release-engineer` / `android-performance-reviewer` **in `/prepare-mobile-release`**, and no reviewer at `/review-code`; those rules are *applied by the feature developer* during implementation and *audited* at release. What a changed `build.gradle.kts` does and does not get at diff scope, stated exactly rather than reassuringly:

- **Covered here:** a dependency addition that grows APK/AAB size or method count — `AND-PERF-SIZE-2`, a Pass B root, live at review. Committed signing credentials are covered too, but by **another lane**: `SEC-SECRETS-1` names signing credentials explicitly and is `mobile-security-reviewer`'s via `/review-security`.
- **Not covered here:** `AND-REL-VARIANT-1`…`-4` and `AND-REL-DEP-1` — **five rules with no diff-time reviewer.** They are applied by `agents/android-feature-developer.md` at implementation and audited at [§13](#13-release-stage-pass-b-only). **The rule moved; it did not vanish — but the independent second look at diff time is genuinely absent.** Record such a file in Not Applicable / Skipped with that reason, rather than implying it was reviewed.

Two rules operate together at diff scope; neither is correct alone:

- **Never file against pre-existing code** — not adjacent lines, not the rest of the file. A pre-existing violation the change merely sits near is out of scope.
- **A concrete violation inside the scope is reviewable even where similar legacy code exists.** Consistency with existing wrong code is not a defence.

## 2. The filing gate — what may be filed

**Only a concrete violation inside the reviewed change may be filed.** Every finding names which one of four things it violates: an authored **`AND-*` standard**; a **shared standard** (`A11Y-*` or `I18N-*`); the **project's architecture** — layering, module boundaries, dependency direction; or an established **repository convention** the change departs from. **A finding that cannot name which is not a finding and is not filed.**

The first two cite the ID. The other two carry a citation in the same slot — `[convention: <path>#<anchor>]`, or `[architecture: <the boundary or direction violated>]` where no document records it — so the fix stage can re-verify them. **An empty citation slot is not filable.**

**A written rule is what makes a finding assertable; anything outside one is preference.** Where a point is in no written standard and is neither a design nor a convention violation, it is **not a finding and is not filed** — not in Findings, not as an aside, nowhere in the output. **Design is the named exception** — aspects of software design are almost never pure style or personal preference, so an architecture, layering or dependency-direction finding is assertable without a line-level rule behind it.

- **Never file a modernization suggestion.** A deprecated-but-present toolkit, DI approach, async model or persistence stack is a **legitimate baseline, not a defect**. `standards/android/compose-xml-standards.md` states the same rule from the standards' side: do not migrate a surface unless the DD explicitly approves it.
- **Modernization must appear nowhere in the output** — not in Findings, not in Not Applicable / Skipped, not in the Verdict, and **not in the release sign-off** ([§13](#13-release-stage-pass-b-only)). Performance is where it leaks in most easily: a newer library, a newer image loader or a newer profiling technique is not a finding unless the change concretely violates a rule.
- **Nit is not an exemption.** A Nit carries a citation like any other finding, or it is not filed.
- **Comment on the code and name the mechanism** — what breaks, and when. *"Why did you use threads here"* is not a finding; *"this concurrency model adds complexity with no performance benefit"* is.

## 3. Evidence reach — mechanism versus magnitude

**The spine: a diff establishes *mechanisms* and categorical rule violations; only a run establishes *magnitudes*.** Google's own performance split is inspect / improve / monitor plus field vitals, and a diff-stage reviewer sits entirely in *inspect*. `standards/android/android-performance.md` says the same in its own words — flag a suspected issue as needing profiling rather than stating a guess as a confirmed blocking finding.

- A **mechanism** finding needs no measurement and is filed at its own severity: work on the wrong thread, unbounded growth, per-item cost on a hot path, a retained `Activity`/`Fragment`/`View`/`Context` **whose both edges are readable in the reviewed files**, a listener or collector registered with no matching unregister or cancel. For a main-thread finding, Google's ANR diagnosis list is the legitimate vocabulary — slow I/O on the main thread, a long calculation on the main thread, a synchronous binder call to another process, blocking on a `synchronized` block, a deadlock. Note that **`@MainThread` and `@WorkerThread` guarantee nothing at runtime** — they are lint hints, so their presence is not evidence that `AND-DATA-THREAD-1` is met.
- A **magnitude** claim — *"this is slow"*, *"this leaks"*, *"this regressed startup"* — is **never asserted from reading code.** It carries a measurement, or it is filed as a measurement request ([§9](#9-measurement-requests)). Unmeasured, it caps at Minor and never blocks.

**Three cases are categorically decidable from the diff rather than estimated:** a database call on the main thread (Room does not support database access on the main thread — `AND-DATA-THREAD-1`, `AND-PERF-THREAD-1`); a Compose backwards write (recomposition on every frame, endlessly); and a same-direction nested scrollable **with no predefined size** (throws `IllegalStateException`) — **the qualifier is the finding**: a nested child given a fixed size is explicitly allowed, so a same-direction nesting is not, by itself, a defect. **And exactly one number is derivable from source alone:** bitmap memory for `ARGB_8888` is `width × height × 4` bytes. Every other magnitude needs a run.

## 4. Repository knowledge

**Do not re-derive conventions by reading source when the repository already publishes them.**

**Seven of the eight consumer obligations in `docs/repo-knowledge-contract.md` bind a reviewer directly:**

- **Read-only** — never write the manifest or any producer-owned artifact.
- **Cite, do not copy** — record `{path, anchor, fingerprint}`, never a verbatim paste.
- **Degrade, never fail** — an absent, malformed, stale or too-new manifest is the normal case, not a fault.
- **Do not re-derive a covered, fresh category.**
- **Derive any `unknown` category yourself**, scoped to the changed files. This never blocks a review.
- **Report drift, never repair it** — recommend `/inspect` or `/inspect-sync` in one line.
- **`platformHints` is advisory — never the platform.**

The one that does not — ***One reader***, contract **item 2** — **binds the plugin rather than this skill**, and its consequence here is negative: **never parse `.ono/repo-knowledge.json` yourself.** Obtain knowledge through `skills/repo-knowledge-consumer/SKILL.md`, or from whatever the caller supplies.

Record the categories used in one line under Standards Checked. `templates/code-review-template.md` has no repo-knowledge section, and adding one is a cross-platform change this skill does not own.

**Never read `device_type` off the manifest — it carries none** ([§10](#10-device_type-handling-at-review)).

Still required: **read enough surrounding code to judge the change before filing.** A finding drawn from the hunk alone, without checking the file's existing pattern, is the characteristic review defect — and on Android the deciding line is usually in another file: the scope a coroutine is launched in, whether a dispatcher is injected, whether a Fragment's binding is cleared in `onDestroyView`, which DI component a binding is declared in.

## 5. Framework-neutral family selection

**The changed surface decides the family — never the repository majority.** In a mixed repository this is resolved **per changed surface, file by file.**

| Surface changed | Family |
|---|---|
| A Compose screen | `AND-UI-COMPOSE-*` |
| An XML/Fragment/Activity screen, ViewBinding or DataBinding | `AND-UI-XML-*` |
| A `RecyclerView`-backed list | `AND-UI-LIST-*` — written for adapters; its diffing, stable-identity and per-row-state rules apply to a lazy list item as much as to a dequeued holder |
| Strings, dimensions, colours, drawables, typography | `AND-UI-RES-*` — surface-neutral |

- **Never cross-apply a family-restricted rule.** An `AND-UI-XML-*` rule cited against a Compose file is a false finding, and the reverse likewise.
- **"Should have used Compose" is never a finding.** `standards/android/compose-xml-standards.md` is explicit: **never migrate a surface unless the DD approved it.**
- Introducing a **new** toolkit, DI approach, async model or persistence stack into a file that does not use it **is** reviewable — as a convention and `AND-ARCH-*`/`AND-UI-*` consistency violation.
- A rule naming a capability the project's toolchain or `minSdk` does not offer is **inapplicable, not violated.**

### Rules whose applicability has a precondition

**The reviewer always files against the repository's rule.** Where the repo's rule and current official Android guidance diverge, **the repo governs** — the divergence changes *when* the rule applies, never which rule wins. Establish the precondition, or the finding is false.

| Rule | Establish first | Otherwise |
|---|---|---|
| `AND-VM-EVENT-1` | that the repository **has** an established one-shot event pattern | the rule mandates consistency with the established pattern; on a repo that reduces effects to state it does not mandate introducing a `Channel` |
| `AND-UI-COMPOSE-4` | the state's required lifetime, and that any saved key is a `Bundle`-supported type | `remember` does not survive configuration change and `rememberSaveable` does not survive the user dismissing the task, so demanding either for data that must outlive dismissal is a false finding — that needs real persistence. A `key = { it }` over non-`Parcelable` objects satisfies `AND-UI-COMPOSE-3` textually and still breaks saved state |
| `AND-UI-COMPOSE-6` | the Kotlin / Compose-compiler version | from Kotlin 2.0.20 strong skipping makes unstable-parameter composables skippable and remembers lambdas automatically, so the manual hoist-or-remember clause is **version-dependent**. Its state-read-scoping clause is not, and collection types stay unstable as *types* regardless |
| `AND-UI-COMPOSE-7` | whether the modifier already merges | `clickable` and `toggleable` merge semantic descendants by default, so "missing merged semantics" on a clickable row is a false finding — and `contentDescription = null` on a decorative icon inside an already-labelled element is **correct**. A label must not name the element type |
| `AND-KT-COROUTINE-1` | that there is a `GlobalScope.launch` **call site** | the token's presence is not the test: `coroutineScope { }` and `supervisorScope { }` inside a suspend function are officially recommended. A `CoroutineExceptionHandler` on a child coroutine or on `async` is dead code, except on a coroutine **launched directly inside** `supervisorScope` — an `AND-KT-COROUTINE-6` finding, not a `-1` finding |
| `AND-DATA-MIGRATE-3` | the project's Room major version | the rule names no artifact coordinate. **Never assert one** |
| `AND-PERF-LIST-3` | the surface | its **view-hierarchy-depth** clause is officially retired for Compose — the UI tree is laid out in a single pass regardless of nesting — so it is **not citable against a Compose surface**, and stays apt for `AND-UI-XML-*`. Its overdraw and scroll-critical-layout clauses are unaffected |
| `A11Y-ROLES-4` | the surface | on Compose cite the Compose API (`hideFromAccessibility`, `contentDescription = null`); the rule's View-attribute example stays apt for `AND-UI-XML-*` |
| `A11Y-TOUCH-1` | the surface | the 48x48dp threshold is verbatim official and always applies, but the rule's View-system **remedy** is not the test on Compose, which expands the touch target outside the composable's bounds. A finding from **visual size alone** is false there — with the inverse trap that `onCheckedChange = null` removes that expansion |
| `AND-REL-R8-1` | the AGP version | see [§13](#13-release-stage-pass-b-only) |

## 6. The two passes

**Pass B runs separately, not as a sub-step of Pass A** — so a performance-only change is not miscategorised, and a correctness-only change absorbs no performance commentary. Neither agent can see the other's findings.

| Pass | Files | Roots | IDs |
|---|---|---|---|
| **A** — `android-code-reviewer` | `android-architecture.md`, `kotlin-standards.md`, `compose-xml-standards.md`, `android-networking.md`, `android-persistence.md`, `android-navigation.md`, `android-logging-analytics.md`, `android-testing.md` | `AND-ARCH-*`, `AND-VM-*`, `AND-DI-*`, `AND-KT-*`, `AND-UI-*`, `AND-NET-*`, `AND-DATA-*`, `AND-NAV-*`, `AND-LOG-*`, `AND-TEST-*` | **118** |
| **A**, shared | `standards/shared/accessibility.md`, `standards/shared/i18n-rtl.md` | `A11Y-*`, `I18N-*` | **26** |
| **B** — `android-performance-reviewer` | `android-performance.md`, `gradle-build-signing.md` | `AND-PERF-*` (16), `AND-REL-*` (11) | **27** |

118 + 27 = **145**, the full `AND-*` total — the split is complete and has no overlap. **Each of the ten files states its own reviewer binding on its own line 5: this split is read from the repository, not chosen here.** The two shared files name `android-code-reviewer` the same way.

### Pass A triage — what a changed file puts in scope

Map each changed file to zero or more buckets and review only those. **A file matching no bucket is
recorded in Not Applicable / Skipped with a one-line reason and reviewed no further** — that is what
keeps a review free of manufactured noise.

| A change to… | Puts in scope |
|---|---|
| any Kotlin or Java source file | `AND-KT-*` |
| layering, module placement, state holders, DI wiring | `AND-ARCH-*`, `AND-VM-*`, `AND-DI-*` |
| a UI surface, a list, or a resource | `AND-UI-*` — family chosen per [§5](#5-framework-neutral-family-selection) |
| navigation destinations, arguments, back stack, deep links | `AND-NAV-*` |
| a networking client, DTO, mapper, auth or error path | `AND-NET-*` |
| a database, key-value store, file store, cache or migration | `AND-DATA-*` |
| a test source, or production code whose testability the standards govern | `AND-TEST-*` — referenced, not audited, see below |
| a logging or analytics call site | `AND-LOG-*` |
| a user-facing interactive surface | `A11Y-*` |
| user-visible copy, formatting, or layout direction | `I18N-*` |

**`AND-PERF-*` and `AND-REL-*` are deliberately absent from this table** — both are Pass B's
([§11](#11-lane-ownership-and-the-merge-contract)).

**Preserve `android-testing.md`'s weaker verb.** Seven Pass A files say the code reviewer *reviews* them; `standards/android/android-testing.md` says the code reviewer **references** `AND-TEST-*` — it is applied by the feature developer and referenced by the reviewer and by QA handoff. So Pass A cites `AND-TEST-*` for a missing, non-deterministic or framework-inconsistent test **inside the reviewed change**, and does not audit the repository's test suite.

## 7. Severity

**The four levels are fixed by `templates/code-review-template.md`** — Blocking, Major, Minor, Nit — and are not chosen here. **`Nit` is not an invented label**: it is official review vocabulary for a point that technically should be done but will not hugely impact things, which is why the template has that bucket at all.

**`standards/android/` carries no severity vocabulary** — no severity marker on any rule, no applicability-stage heading, no numeric threshold. Severity cannot be read off an Android rule, so this section states the derivation rule; it is deliberately **not** a copy of another platform's category table, whose wording is built on that platform's language and release mechanics.

**Derive severity from the consequence in the reviewed change**, anchored to a real `AND-*` family:

| Level | The consequence in this change | Anchored to |
|---|---|---|
| **Blocking** | Data loss, a categorical violation the platform itself rejects, or an unshippable build: a schema change with no migration, destructive migration on real user data, a database call on the main thread, PII or a token in a log or analytics property; and **at release only** ([§13](#13-release-stage-pass-b-only)), a distributable signed with the debug config | `AND-DATA-MIGRATE-1`, `AND-DATA-MIGRATE-2`, `AND-DATA-THREAD-1`, `AND-LOG-PII-1`, `AND-REL-SIGN-2` |
| **Major** | Likely to cause a real bug or meaningfully hurt maintainability, and reachable by a user in a normal flow: a leaked `Activity` or view, a duplicate analytics event on configuration change or from an off-screen composition, an unscoped coroutine, a collector still running while the UI is stopped, a transport model leaking into UI state | `AND-PERF-MEM-1`, `AND-LOG-ANALYTICS-2`, `AND-KT-COROUTINE-1`, `AND-VM-LIFECYCLE-3`, `AND-NET-DTO-1` |
| **Minor** | A standards deviation with no immediate functional risk, or reachable only by a future maintainer: a hardcoded user-visible string, a bare suppression, an unexplained `!!`, a duplicated dimension resource | `AND-UI-RES-1`, `AND-KT-LINT-2`, `AND-KT-NULL-1`, `AND-UI-RES-4` |
| **Nit** | Hygiene with no behavioural consequence: naming, ordering, a redundant construct | the nearest applicable `AND-*` ID — **a Nit with no citable rule is not filed** ([§2](#2-the-filing-gate--what-may-be-filed)) |

Two overrides, both carried over rather than invented: **a rule that names its own severity wins** over this table; and **where a rule could sit in two levels, the consequence in *this* change decides** — reachable by a user in a normal flow → Major, reachable only by a future maintainer → Minor. Two caps: a finding labelled `unverified-convention` ([§8](#8-when-the-repository-has-no-convention)) caps at **Minor**, and an **unmeasured magnitude claim** caps at **Minor** and never blocks (§3). And **the approval standard is code-health improvement, not perfection** — a change that definitely improves the codebase is approvable with follow-ups; there is no perfect code, only better code.

## 8. When the repository has no convention

Nine of the ten `standards/android/*` files phrase rules against *the repository's detected convention*. **When that antecedent does not exist, resolve in this order — and state which case applied.**

1. **The convention is established** — apply the rule against it. The normal case.
2. **Not established, but the change is internally inconsistent** — two new call sites, two different mechanisms. **File against the inconsistency**, citing the rule. The change is its own antecedent.
3. **Nothing to compare against** — no logging abstraction, no dispatcher-injection convention, no established navigation mechanism. **Apply the platform default the rule itself states, cite that rule, and append `— unverified-convention`.** The label does the work: it caps the finding at **Minor**, states that the antecedent could not be established, and **asks the author to confirm** rather than asserting a settled violation. Record the absent convention in Not Applicable / Skipped as a **standards gap** in the same pass.

**Case 3 files a real, citable finding — it is not a suggestion with an empty citation slot**, which [§2](#2-the-filing-gate--what-may-be-filed) forbids. This matches the resolution the shipped iOS lane uses for the identical ladder — `standards/ios/swift-standards.md` § *When the repository has no convention* — so the two lanes behave the same way where their standards are silent.

**State which case applied.** The reasoning behind the ladder: where no other rule applies, an author should maintain consistency with the existing code — so with no existing code to be consistent with, the rule's own stated default is the only remaining antecedent, and it is offered as *unverified* rather than enforced. **An absent convention is never, by itself, compliance.**

## 9. Measurement requests

A claim a diff cannot settle is filed as a **request** — never as a verdict, and never as a vague *"needs profiling"*. Every request names six fields:

**metric · scenario or user journey · threshold, and which kind of number it is · tool · conditions · what result would confirm or kill it.**

- **Conditions are not optional: device model, OS version, build type, compilation state.** And **never measure on a debug build** — Android's own words are that debug builds have severe impacts on performance.
- **Engineering targets and Play floors are different kinds of number.** A cold start under 500 ms is an engineering *goal*; Play's vitals figures are field *bad-behaviour floors*. Say which kind the threshold is, and never present one as the other.
- **"Janky" is not "over budget".** JankStats defines jank as a frame taking **twice** as long as the current refresh rate, deliberately buffered — and a frame budget quoted with no refresh rate is incomplete, because the deadline is the device's, not a fixed 16 ms.

| Question | Tool | Its real limit |
|---|---|---|
| Startup and frame timing on a device | **Macrobenchmark** | **errors on an emulator** — not merely warns — and on a debuggable or non-profileable target. **Microbenchmark**, for the CPU cost of isolated code, errors on an emulator the same way. Neither number from an emulator is usable |
| First-run and startup improvement | **Baseline / Startup Profiles** | generation needs R8 **off**, the shipped release needs R8 **on**; they do not fix an algorithmic cost |
| Latency, waits, scheduling, lock contention · CPU hotspots · leaks and duplicated objects · allocation churn | **Android Studio profiler** — system trace · stack sample · heap dump · heap profile respectively; **Perfetto** for the cross-process and scheduling questions the in-app profiler cannot reach | development-time inspection only |
| Main-thread file I/O or network access | **StrictMode** | only two claims about it are verifiable and only these two are made: `detectAll().penaltyDeath()` guarded by `BuildConfig.DEBUG`, and detection of main-thread file I/O and network access |
| A retained-instance leak, proven at runtime | **LeakCanary** | **Square's — third-party, not Google's.** Named in prose by `standards/android/android-performance.md`; carries no `AND-*` ID |
| Whether a recomposition claim is true at all | Compose compiler metrics, composition tracing, Layout Inspector recomposition counts | a recomposition claim is a **build-configuration fact, not a code fact** |
| Field jank with app state attached | **JankStats** (`androidx.metrics:metrics-performance`) | `FrameData` is reused every frame and **must be copied**; the callback must return quickly; it needs an active window or throws |
| A trace, heap dump or stack sample from production | **`ProfilingManager`** | Android 15 / API 35+, with a built-in rate limiter — so "only reproducible in production" is no longer automatically a dead end |
| — | **Android Performance Analyzer** | **never request it for an app**: its own page scopes it to games and Vulkan graphics and directs all other apps to the Android Studio profilers |

**Consult the source, not memory.** Each row below is the page that settles the question in its left column — the same shape `skills/ios-code-review/SKILL.md` uses for its own lane.

| When | Source |
|---|---|
| Deciding whether a benchmark run is even valid — build type, device, emulator | [Macrobenchmark overview](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview) |
| Choosing between a system trace, a stack sample, a heap dump and a heap profile | [Profile types overview](https://developer.android.com/topic/performance/tracing/profile-types-overview) |
| Stating the conditions a measurement request must carry, and why a debug build is not one | [Measuring performance](https://developer.android.com/topic/performance/measuring-performance) |
| Separating an engineering target from a Play bad-behaviour floor | [Android vitals](https://developer.android.com/topic/performance/vitals) |
| Checking what a frame deadline actually is on the device under test | [Frame vitals](https://developer.android.com/topic/performance/vitals/render) |
| Confirming what a Baseline or Startup Profile does, and which build must have R8 off | [Baseline Profiles](https://developer.android.com/topic/performance/baselineprofiles/overview) |
| Establishing which optimization DSL a repo's AGP version uses | [Enable app optimization](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization) |
| Confirming Lint's CI position and its severity vocabulary | [Improve your code with lint checks](https://developer.android.com/studio/write/lint) |

**Name the mechanism; do not run it**, and never name a tool the repository has not adopted.

- **Android Lint is the one tool with an official CI recommendation** — variant-scoped, a Gradle invocation, no device.
- The static-analysis and formatting tools themselves are **`AND-KT-LINT-1`'s list, cited by ID and not restated here**.
- **Check ktlint's major version before saying anything about its Maven coordinate**: ktlint is no longer Pinterest-affiliated, and while **1.x — the current stable line — still publishes `com.pinterest.ktlint`**, the move to `io.github.ktlint` is announced in the **2.0.0 alpha** line, which is pre-release. So the coordinate is a finding on neither line by default: on 1.x it is correct as-is, and on a 2.0 pre-release it has genuinely moved.

## 10. device_type handling at review

Review has **no confirmed `device_type`**, and the repository-knowledge manifest cannot supply one — it carries no such field ([§4](#4-repository-knowledge)).

- **Infer, never demand.** The signals are in the reviewed files themselves: a `<uses-feature android:name="android.software.leanback">` declaration, an `android.intent.category.LEANBACK_LAUNCHER` intent filter on a launcher activity, a TV module or source set, or TV base classes. **The manifest declarations are what make an app a TV app — the Leanback UI *library* is optional and separate**, so its absence is not evidence against a TV surface. Note a TV surface in Scope; **never block a review to ask.**
- **Suppress inapplicable mobile rules rather than invent TV rules.** A touch-target remedy has nothing to mean where there is no touch, and **touch or gesture assumptions are never carried into a TV surface.**
- **Never file against a rule that does not exist.** **There is no `AND-*TV*` ID of any kind**, so a TV-specific Android finding has nothing to cite — and a finding with nothing to cite is not filed (§2).
- `A11Y-TOUCH-1` and `A11Y-TOUCH-2` **already carry explicit Android-TV clauses** — D-pad focusability with a visible focus highlight, and enough separation that focus moves predictably. **Honouring them is reading the standard, not filling a TV gap, and they must never be reported as one.**
- A TV rule that is genuinely needed and genuinely absent is **recorded against `ANDROID-003`**, which owns Android TV guidance. It is not invented here.

**No focus-handling, D-pad, launcher-banner or Play TV-track checklist belongs in this skill.**

## 11. Lane ownership and the merge contract

**The ID's own root decides the owner, not the file the ID appears in.** Android standards cross-reference each other's roots freely — that is pointing at another lane, not taking it over. Three files do it, and each case resolves the same way:

| Cited in | The ID | Whose to file |
|---|---|---|
| `standards/android/android-performance.md` | `AND-UI-LIST-*`, `AND-UI-XML-*`, `AND-VM-LIFECYCLE-*` | **Pass A's** — do not file them here even though they appear in Pass B's own standards file |
| `standards/android/android-persistence.md` | `AND-PERF-THREAD-1` | **Pass B's** |
| `standards/android/gradle-build-signing.md` | `AND-PERF-SIZE-*` | **Pass B's** |

This is what stops the two passes double-filing one issue from two directions.

**`merge-candidate` — the marking both passes use.** Where a finding's own root is this pass's but the concern visibly overlaps a rule the other pass owns, file it under your own root and append `— merge-candidate: <the other pass's ID>`. The caller sees both halves at the merge and drops the duplicate. **Both passes use it, in both directions** — it is not Pass B's alone.

| Not this skill's to file | Owner |
|---|---|
| `SEC-*` — secrets, storage, transport, auth, deep links, WebView, permissions, logging | `mobile-security-reviewer`, via `/review-security`, following `standards/shared/mobile-security.md` |
| Generic `REL-*`, and the release verdict | `agents/mobile-release-engineer.md`, following `skills/mobile-release-readiness/SKILL.md` |
| `QA-*` | the QA-handoff lane |
| Any `IOS-*` root, or React Native's unprefixed `ARCH-*`/`API-*`/`STATE-*`/`NAV-*` | those platforms' lanes |

**The `SEC-*` asymmetry is deliberate, not an inconsistency to fix.** A *planner* proposing a technical approach may cite a security standard as a constraint on the design; **a *reviewer* may not file a security finding.** Citable in one activity, filable only in another. Where an Android rule ties to a `SEC-*` rule, file the `AND-*` half and leave the `SEC-*` half to its owner.

**Out-of-lane strictness.** If a performance, security or release issue is noticed incidentally in Pass A — or a correctness issue in Pass B — it is **not filed here and not noted here.** No aside, no parenthetical, nowhere in the document. **This is deliberately stricter than `rn-code-reviewer`, which permits a one-line out-of-lane aside: do not restore symmetry with it.** Both Android passes merge into one document, so an aside there duplicates the other pass's work rather than adding coverage. **The merge itself is the caller's** ([§12](#12-what-each-pass-returns)).

## 12. What each pass returns

Each pass returns **only its own** material, to the caller. Neither writes a document, and neither can see the other's findings. Write an explicit **"None found"** for an empty section.

- **Scope** — files reviewed, mode (diff review | whole-repo audit | release), commit or branch, and the TV-surface note where one applies.
- **Standards Checked** — the IDs applicable to this scope, plus the repo-knowledge categories used ([§4](#4-repository-knowledge)).
- **Findings** — this pass's own, each at its severity, each tagged `[android]`. Pass B's are the **Performance** material; **Pass A emits no Performance section.**
- **Not Applicable / Skipped** — **one line with a reason for each**: a rule whose surface the change does not touch, a case-3 standards gap ([§8](#8-when-the-repository-has-no-convention)), a `device_type` suppression.
- **No Verdict.** A verdict over one pass is not a verdict over the change.

**Finding format, exactly as `templates/code-review-template.md` fixes it:**

`` `[android] file:line` — [standard ID] description — remediation ``

Append `— unverified-convention` where case 3 applied. A measurement request carries §9's six fields in place of a remediation.

**The remediation slot has its own bar:**

- **A specific fix pointer, not a restatement that something is wrong.** *"Handle this properly"* is not a remediation; *"move the query to `Dispatchers.IO` via the injected dispatcher"* is.
- **One line, then stop.** The reviewer points at the fix; it does not design or write it. Implementation is `agents/android-feature-developer.md`'s at the Fix stage. **`/fix-review-comments` re-verifies each fix against the ID the finding cited**, so an absent or invented citation breaks the Fix stage outright. Three things are load-bearing for it: a real citation, a concrete `file:line`, and **a re-checkable condition**. *"This is fragile"* cannot be re-verified; *"the collector is scoped to the Fragment rather than `viewLifecycleOwner`, so it outlives view destruction"* can.

**The verdict inputs**, applied by the caller across every pass and platform: any **Blocking** → **`Blocked`**; else any **Major** → **`Approved with follow-ups`**; else **`Approved`**. **Never write over `templates/code-review-template.md`** — it is the blank template every platform's review is built from; a persisted review goes to the path the caller names.

## 13. Release stage (Pass B only)

At `/prepare-mobile-release` the scope is the shipping release, not a diff, and the diff-oriented rules of §§1–3 do not apply. **`skills/mobile-release-readiness/SKILL.md` owns the checklist**; this section governs only the Android performance and build material inside it. **`agents/mobile-release-engineer.md` owns the verdict, and consumes this pass's sign-off rather than re-auditing performance** — so a concern this pass does not surface is a concern the release never sees.

- **`AND-REL-*` is live here in full**: variant and flavour structure, `minSdk`/`targetSdk`/`compileSdk` changes, config supply, debug-only configuration confined to debug, dependency declaration style and pinning, signing, minification and keep rules.
- Return **one `[android]` sign-off block** into `templates/release-checklist-template.md`'s **Perf Sign-off** section — APK/AAB size delta, the Android performance concerns for this release, and a verdict of **pass / pass-with-follow-ups / fail**.
- **An item that cannot be verified is not silently passed.** It is a no-go by default, surfaced to the human.

Three Android facts this section must not get wrong:

- **Establish the repository's AGP version before asserting which optimization flag is missing.** `AND-REL-R8-1` is written to the pre-9.3 DSL — `isMinifyEnabled` and `isShrinkResources` plus a `proguardFiles(...)` list; from AGP 9.3 that is a single `optimization { enable = true }` block covering **both code and resources**, with keep rules moved to a file suffixed `.keep` in a `src/<variant>/keepRules` source set. The rule is not wrong for the legacy DSL — it is **silent about the current one**. `AND-REL-R8-2` survives unchanged, but the expected file location moves.
- **Checking only "minification is on" checks half the requirement.** Baseline and Startup Profile *generation* requires R8 **off**, while the shipped release requires R8 **on**. Both are correct, in different builds — so verify both states, not one flag.
- **Keep-rule sufficiency is not statically decidable.** The filable finding is *"reflective, serialization or native-interop code arrived with no keep rule"* — never *"these keep rules are insufficient"*.

## Red flags — STOP and report instead of proceeding

- A `standards/android/*` or shared standards file this pass cites is missing or is a structure-only placeholder.
- You cannot name which filing-gate category a finding violates, or its citation slot is empty.
- You are about to cite an ID you have not confirmed exists — in particular an `AND-*TV*`, `AND-A11Y-*` or `AND-SEC-*` ID, none of which exist in this repository.
- You are about to file `SEC-*`, generic `REL-*` or `QA-*`, or to note an out-of-lane issue as an aside.
- You are about to file a modernization, a migration, a toolkit/library/architecture preference, or a finding against pre-existing code outside the resolved scope.
- You are about to assert a magnitude from reading a diff, or to name a measurement without device model, OS version, build type and compilation state.
- You are about to cite a rule whose precondition is unestablished — Kotlin/Compose-compiler version for `AND-UI-COMPOSE-6`, AGP version for `AND-REL-R8-1`, Room major version for `AND-DATA-MIGRATE-3`, the changed surface for `AND-PERF-LIST-3` and `A11Y-TOUCH-1` — or to cite an `AND-UI-XML-*` rule against a Compose file, or the reverse.
- You are about to run Gradle, a linter, a benchmark or a profiler; to modify the code under review; or to write over a template.
- The scope handed in is missing or ambiguous — ask the caller rather than re-deriving it.

## Relationship with command, agents, skills

- **`/review-code`** — scope resolution, platform attribution, standards loading, invoking both agents, and the merge. **`/prepare-mobile-release`** — the release-scoped invocation ([§13](#13-release-stage-pass-b-only)).
- **`agents/android-code-reviewer.md`** — Pass A. **`agents/android-performance-reviewer.md`** — Pass B, and the Android release sign-off.
- **This skill** — the methodology both follow, declared in their `skills:` frontmatter so it loads with them. **They apply it and do not restate it.**
- **`skills/repo-knowledge-consumer/SKILL.md`** — the only component permitted to parse the repository-knowledge manifest.
- **`skills/mobile-security-review/SKILL.md`** — the `SEC-*` lane, via `/review-security`.
- **`agents/mobile-release-engineer.md`** — the release verdict and generic `REL-*`, following `skills/mobile-release-readiness/SKILL.md`.
- **`agents/android-feature-developer.md`**, following `skills/android-feature-implementation/SKILL.md` — the Implement and Fix stages. **It repairs what this review files; neither reviewer does.** That skill is also the source of the applied-ID trace both reviewers rely on. That trace is an **in-session structured report, not a file on disk** — never instruct a reviewer to go and open one.
- **`templates/code-review-template.md`** — the output shape, owned there and not restated here.

**Nothing in this list is a second source of Android review methodology, and this file is not a source of anything they own.**

## Standards citation

**Cite only IDs that exist in these twelve files and genuinely apply to the change.**

| Area | Standard file | IDs |
|---|---|---|
| Layering, modules, ViewModel & UI state, DI | `standards/android/android-architecture.md` | `AND-ARCH-*`, `AND-VM-*`, `AND-DI-*` (21) |
| Kotlin language, null-safety, coroutines & Flow, static analysis | `standards/android/kotlin-standards.md` | `AND-KT-*` (19) |
| Compose, XML/Views, lists, resources | `standards/android/compose-xml-standards.md` | `AND-UI-*` (26) |
| Networking, contracts, DTOs, auth, errors | `standards/android/android-networking.md` | `AND-NET-*` (14) |
| Persistence, migrations, threading, cache | `standards/android/android-persistence.md` | `AND-DATA-*` (11) |
| Navigation, arguments, deep links, back stack | `standards/android/android-navigation.md` | `AND-NAV-*` (9) |
| Logging, analytics, PII in both | `standards/android/android-logging-analytics.md` | `AND-LOG-*` (9) |
| Tests — **referenced, not audited** ([§6](#6-the-two-passes)) | `standards/android/android-testing.md` | `AND-TEST-*` (9) |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-*` (13) |
| Localization & RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-*` (13) |
| Performance — threading, lists, images, memory, startup, size | `standards/android/android-performance.md` | `AND-PERF-*` (16) — **Pass B** |
| Gradle variants, dependencies, signing, R8 | `standards/android/gradle-build-signing.md` | `AND-REL-*` (11) — **Pass B** |

Four boundary rules, each factual rather than stylistic:

- **`AND-REL-*` (Gradle build, variants, signing, R8) and shared `REL-*` (release readiness) are unrelated families.** Conflating them is a factual error, not a naming quibble.
- **`AND-DI-*` has no topic segment** — the IDs are `AND-DI-1` through `AND-DI-4`. Do not invent one.
- **No `AND-*` family exists for accessibility or i18n/RTL** — cite the shared roots, and never write an `AND-A11Y-*` or `AND-I18N-*` ID. **Security is narrower than it looks:** there is no `AND-SEC-*` root and shared `SEC-*` is `mobile-security-reviewer`'s, **but `AND-DATA-SEC-1`/`-2`/`-3` do exist** inside `standards/android/android-persistence.md` — data-at-rest security — and they are **Pass A's to file**. Do not mistake them for the other lane's.
- **`AND-*` and those two shared roots only.** Never cite an `IOS-*` root, and never React Native's generically-named `ARCH-*`/`API-*`/`STATE-*`/`NAV-*`.
