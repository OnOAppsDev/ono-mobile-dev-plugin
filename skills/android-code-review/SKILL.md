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

Android's rules live in **ten files under `standards/android/`, carrying 198 `AND-*` IDs**, plus the two shared files — the routing table is [§ Standards citation](#standards-citation). Before reviewing, confirm that the files **this pass will cite** are authored and not structure-only placeholders: Pass A's eight plus the two shared files, or Pass B's two ([§6](#6-the-two-passes)).

A **structure-only placeholder** is a standards file that carries its headings but not its rules — it declares itself unauthored rather than listing `AND-*` bullets. If a file this pass cites is missing or is one, **stop and report that Android review is blocked until it is authored.** Never fall back to unwritten expectations, and never substitute another platform's standard for a missing Android one. **Perform the check — do not assume the answer from a previous run.**

## 1. Resolve scope

Use the Android-attributed file list or diff handed in by the caller — **do not re-derive it.** Record the mode — diff review, whole-repo audit, or release — in Scope.

| Invocation | Scope | What is live |
|---|---|---|
| `/review-code` | **Diff-scoped** — only code introduced or modified within the resolved scope | Pass A in full; Pass B's `AND-PERF-*`. **`AND-REL-*` is not live here** — see below |
| `/prepare-mobile-release` | **Release-scoped** — the shipping build, not a diff | **Pass B only — Pass A does not run at this stage.** `AND-PERF-*` stays live and `AND-REL-*` goes live in full ([§15](#15-release-stage-pass-b-only)); the diff-oriented rules below do not apply, and neither does per-rule Not Applicable bookkeeping over unchanged files |

**`AND-REL-*` is release-scoped only, and a changed build file is still reviewed.** `standards/android/gradle-build-signing.md:5` names `mobile-release-engineer` / `android-performance-reviewer` **in `/prepare-mobile-release`**, and no reviewer at `/review-code`; those rules are *applied by the feature developer* during implementation and *audited* at release. What a changed `build.gradle.kts` does and does not get at diff scope, stated exactly rather than reassuringly:

- **Covered here:** a dependency addition that grows APK/AAB size or method count — `AND-PERF-SIZE-2`, a Pass B root, live at review. Committed signing credentials are covered too, but by **another lane**: `SEC-SECRETS-1` names signing credentials explicitly and is `mobile-security-reviewer`'s via `/review-security`.
- **Not covered here:** `AND-REL-VARIANT-1`…`-4` and `AND-REL-DEP-1` — **five rules with no diff-time reviewer.** They are applied by `agents/android-feature-developer.md` at implementation and audited at [§15](#15-release-stage-pass-b-only). **The rule moved; it did not vanish — but the independent second look at diff time is genuinely absent.** Record such a file in Not Applicable / Skipped with that reason, rather than implying it was reviewed.

Two rules operate together at diff scope; neither is correct alone:

- **Never file against pre-existing code** — not adjacent lines, not the rest of the file. A pre-existing violation the change merely sits near is out of scope.
- **A concrete violation inside the scope is reviewable even where similar legacy code exists.** Consistency with existing wrong code is not a defence.

## 2. The filing gate — what may be filed

**Only a concrete violation inside the reviewed change may be filed.** Every finding names which one of four things it violates: an authored **`AND-*` standard**; a **shared standard** (`A11Y-*` or `I18N-*`); the **project's architecture** — layering, module boundaries, dependency direction; or an established **repository convention** the change departs from. **A finding that cannot name which is not a finding and is not filed.**

The first two cite the ID. The other two carry a citation in the same slot — `[convention: <path>#<anchor>]`, or `[architecture: <the boundary or direction violated>]` where no document records it — so the fix stage can re-verify them. **An empty citation slot is not filable.**

**A written rule is what makes a finding assertable; anything outside one is preference.** Where a point is in no written standard and is neither a design nor a convention violation, it is **not a finding and is not filed** — not in Findings, not as an aside, nowhere in the output. **Design is the named exception** — aspects of software design are almost never pure style or personal preference, so an architecture, layering or dependency-direction finding is assertable without a line-level rule behind it.

- **Never file a modernization suggestion.** A deprecated-but-present toolkit, DI approach, async model or persistence stack is a **legitimate baseline, not a defect**. `standards/android/compose-xml-standards.md` states the same rule from the standards' side: do not migrate a surface unless the DD explicitly approves it.
- **Modernization must appear nowhere in the output** — not in Findings, not in Not Applicable / Skipped, not in the Verdict, and **not in the release sign-off** ([§15](#15-release-stage-pass-b-only)). Performance is where it leaks in most easily: a newer library, a newer image loader or a newer profiling technique is not a finding unless the change concretely violates a rule.
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

**Never read `device_type` off the repository-knowledge manifest — it carries none.** The **Android** manifest is still the primary *evidence* for a TV surface ([§11](#11-establishing-a-tv-surface-from-evidence)); it is not a delivered field ([§12](#12-device_type-handling-at-review)).

Still required: **read enough surrounding code to judge the change before filing.** A finding drawn from the hunk alone, without checking the file's existing pattern, is the characteristic review defect — and on Android the deciding line is usually in another file: the scope a coroutine is launched in, whether a dispatcher is injected, whether a Fragment's binding is cleared in `onDestroyView`, which DI component a binding is declared in.

## 5. Framework-neutral family selection

**The changed surface decides the family — never the repository majority.** In a mixed repository this is resolved **per changed surface, file by file.**

| Surface changed | Family |
|---|---|
| A Compose screen | `AND-UI-COMPOSE-*` |
| An XML/Fragment/Activity screen, ViewBinding or DataBinding | `AND-UI-XML-*` |
| A `RecyclerView`-backed list | `AND-UI-LIST-*` — written for adapters; its diffing, stable-identity and per-row-state rules apply to a lazy list item as much as to a dequeued holder |
| Strings, dimensions, colours, drawables, typography | `AND-UI-RES-*` — surface-neutral |
| A screen built on a **custom or in-house UI layer** — neither Compose nor XML/Views | **`AND-UI-COMPOSE-*` and `AND-UI-XML-*` are not citable against it.** The surface-neutral families are: `AND-UI-RES-*`, `AND-UI-LIST-*` where a list is involved, and the `AND-*TV-*` families on a TV surface. **A custom layer is an expected surface here — this organization's TV app is one — and is never a finding in itself** |
| A screen on an **established TV surface** ([§11](#11-establishing-a-tv-surface-from-evidence)) | its toolkit family above **plus** `AND-UI-TV-*` — additive, never instead of. Where the toolkit is custom, the row above governs which base families apply |
| TV focus movement, D-pad handling, Back, or destination entry focus | `AND-NAV-TV-*` — additive over `AND-NAV-*` |
| A TV base screen type, framework module, or capability gate | `AND-ARCH-TV-*` — additive over `AND-ARCH-*` |

- **The TV families are additive, never a fork.** Each `standards/android/*` TV section opens with the same bracket: the base family applies on a TV surface unchanged, and nothing in the TV section relaxes or replaces it. Citing `AND-UI-TV-*` *instead of* `AND-UI-COMPOSE-*` on a TV Compose screen is the characteristic error.
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
| `AND-REL-R8-1` | the AGP version — **either DSL may be in use** | see [§15](#15-release-stage-pass-b-only) |
| Any `AND-*TV-*` rule | that a TV surface is established, and the repository's own TV inset, scale and components | unestablished ⇒ the rule is **not raised at all** ([§11](#11-establishing-a-tv-surface-from-evidence)); the traps that most often defeat this are tabled there |

## 6. The two passes

**Pass B runs separately, not as a sub-step of Pass A** — so a performance-only change is not miscategorised, and a correctness-only change absorbs no performance commentary. Neither agent can see the other's findings.

| Pass | Files | Roots | IDs |
|---|---|---|---|
| **A** — `android-code-reviewer` | `android-architecture.md`, `kotlin-standards.md`, `compose-xml-standards.md`, `android-networking.md`, `android-persistence.md`, `android-navigation.md`, `android-logging-analytics.md`, `android-testing.md` | `AND-ARCH-*`, `AND-VM-*`, `AND-DI-*`, `AND-KT-*`, `AND-UI-*`, `AND-NET-*`, `AND-DATA-*`, `AND-NAV-*`, `AND-LOG-*`, `AND-TEST-*` — **including `AND-UI-TV-*`, `AND-NAV-TV-*`, `AND-ARCH-TV-*`, `AND-UI-A11Y-*`** | **154** |
| **A**, shared | `standards/shared/accessibility.md`, `standards/shared/i18n-rtl.md` | `A11Y-*`, `I18N-*` | **26** |
| **B** — `android-performance-reviewer` | `android-performance.md`, `gradle-build-signing.md` | `AND-PERF-*` (24, incl. `AND-PERF-TV-*`), `AND-REL-*` (20, incl. `AND-REL-TV-*`) | **44** |

154 + 44 = **198**, the full `AND-*` total — the split is complete and has no overlap. **Each of the ten files states its own reviewer binding on its own line 5: this split is read from the repository, not chosen here.** The two shared files name `android-code-reviewer` the same way.

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
| any of the above **on an established TV surface** | the bucket's own family **plus** `AND-UI-TV-*` / `AND-NAV-TV-*` / `AND-ARCH-TV-*` as [§5](#5-framework-neutral-family-selection) selects |
| the **TV manifest** — launcher intent filter, `uses-feature`, `android:banner` — or the banner drawable | Pass B's `AND-REL-TV-*` **at release** ([§15](#15-release-stage-pass-b-only)); at diff scope it is recorded Not Applicable naming that stage |

**A TV file never exits triage in one line.** A config-only or manifest-only change is exactly where a
TV surface hides, so the manifest row above is mandatory: skipping it as "config only" drops the five
manifest-and-banner `AND-REL-TV-*` rules and, worse, discards the evidence [§11](#11-establishing-a-tv-surface-from-evidence) needs.

**`AND-PERF-*` and `AND-REL-*` are deliberately absent from this table** — both are Pass B's
([§13](#13-lane-ownership-and-the-merge-contract)), and `AND-PERF-TV-*` and `AND-REL-TV-*` inherit that
placement unchanged.

**Preserve `android-testing.md`'s weaker verb.** Seven Pass A files say the code reviewer *reviews* them; `standards/android/android-testing.md` says the code reviewer **references** `AND-TEST-*` — it is applied by the feature developer and referenced by the reviewer and by QA handoff. So Pass A cites `AND-TEST-*` for a missing, non-deterministic or framework-inconsistent test **inside the reviewed change**, and does not audit the repository's test suite.

## 7. Severity

**The four levels are fixed by `templates/code-review-template.md`** — Blocking, Major, Minor, Nit — and are not chosen here. **`Nit` is not an invented label**: it is official review vocabulary for a point that technically should be done but will not hugely impact things, which is why the template has that bucket at all.

**`standards/android/` carries no severity vocabulary** — no severity marker on any rule, no applicability-stage heading, no numeric threshold. Severity cannot be read off an Android rule, so this section states the derivation rule; it is deliberately **not** a copy of another platform's category table, whose wording is built on that platform's language and release mechanics.

**Derive severity from the consequence in the reviewed change**, anchored to a real `AND-*` family:

| Level | The consequence in this change | Anchored to |
|---|---|---|
| **Blocking** | Data loss, a categorical violation the platform itself rejects, or an unshippable build: a schema change with no migration, destructive migration on real user data, a database call on the main thread, PII or a token in a log or analytics property; and **at release only** ([§15](#15-release-stage-pass-b-only)), a distributable signed with the debug config | `AND-DATA-MIGRATE-1`, `AND-DATA-MIGRATE-2`, `AND-DATA-THREAD-1`, `AND-LOG-PII-1`, `AND-REL-SIGN-2` |
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

4. **The rule defers to a repository value that does not exist yet** — `AND-UI-TV-OVERSCAN-2`, `AND-UI-TV-SCALE-1` and `AND-UI-TV-COMP-1` deliberately state **no** default, because Android's own guidance conflicts or offers none. Case 3's "apply the platform default the rule itself states" has nothing to apply. **Record an unresolved decision naming the value the repository must define, capped at the lowest severity. Never invent the default, and never file it as a violation** — there is no antecedent to violate.

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
| Confirming a TV requirement's **tier** before blocking on it — TV Ready is baseline, TV Differentiated is not | [TV app quality](https://developer.android.com/docs/quality-guidelines/tv-app-quality) |
| Confirming the TV memory figures and their no-bindings/single-stream assumption before a measurement request | [Memory optimization for TV](https://developer.android.com/training/tv/playback/memory) |
| Confirming a TV manifest declaration's exact literal before filing its absence | [Get started with TV apps](https://developer.android.com/training/tv/get-started/create) · [`uses-feature`](https://developer.android.com/guide/topics/manifest/uses-feature-element) |

**Name the mechanism; do not run it**, and never name a tool the repository has not adopted.

- **Android Lint is the one tool with an official CI recommendation** — variant-scoped, a Gradle invocation, no device.
- The static-analysis and formatting tools themselves are **`AND-KT-LINT-1`'s list, cited by ID and not restated here**.
- **Check ktlint's major version before saying anything about its Maven coordinate**: ktlint is no longer Pinterest-affiliated, and while **1.x — the current stable line — still publishes `com.pinterest.ktlint`**, the move to `io.github.ktlint` is announced in the **2.0.0 alpha** line, which is pre-release. So the coordinate is a finding on neither line by default: on 1.x it is correct as-is, and on a 2.0 pre-release it has genuinely moved.

## 10. Android TV rule families and their review stages

Six additions arrive at once. A two-pass review must say where each is decidable, because a rule with no
stage is silently never checked. **All of them are additive over their base family** ([§5](#5-framework-neutral-family-selection)).

| Family · host file | Pass | Decidable from the diff | Needs more than the diff |
|---|---|---|---|
| `AND-UI-TV-*` (10) · `compose-xml-standards.md` | A | `AND-UI-TV-FOCUS-1/-2/-3`, `AND-UI-TV-OVERSCAN-1`, `AND-UI-TV-LAYOUT-1`, `AND-UI-TV-SCALE-2`, `AND-UI-TV-IME-1` — behaviours visible in the changed screen | `AND-UI-TV-OVERSCAN-2`, `AND-UI-TV-SCALE-1` and `AND-UI-TV-COMP-1` need the repository's declared inset, TV scale and component set |
| `AND-NAV-TV-*` (9) · `android-navigation.md` | A | `AND-NAV-TV-BACK-1/-2/-3`, `AND-NAV-TV-DPAD-2/-3/-4`, `AND-NAV-TV-FOCUS-1` — handler shape and declared focus targets | `AND-NAV-TV-DPAD-1` and `AND-NAV-TV-AXIS-1` are whole-app traversal claims: **unreachable** without a D-pad walkthrough |
| `AND-ARCH-TV-*` (6) · `android-architecture.md` | A | `AND-ARCH-TV-1/-2/-3/-5/-6` — base type, lifecycle pairing, capability gate, no second player abstraction | `AND-ARCH-TV-4` governs planning output, not code: at review it is **Not Applicable — planning lane** |
| `AND-TEST-INSTR-2` · `android-testing.md` | A | a TV playback test inside the reviewed change | **referenced, not audited** ([§6](#6-the-two-passes)) |
| `AND-PERF-TV-*` (8) · `android-performance.md` | B | `AND-PERF-TV-2` … `-8` are mechanisms | `AND-PERF-TV-1`'s memory budget is a **magnitude** — a measurement request ([§9](#9-measurement-requests)), never asserted from reading code |
| `AND-REL-TV-*` (9) · `gradle-build-signing.md` | B | — | **release-scoped in full** ([§15](#15-release-stage-pass-b-only)), like every other `AND-REL-*` |

**An unreachable rule is recorded Not Applicable with its reason — never as passed, and never as a
finding.** The legitimate reasons are: its stage is elsewhere; its evidence needs a run; no TV surface is
established ([§11](#11-establishing-a-tv-surface-from-evidence)); the surface is `[unknown]`; or the rule
defers to a repository value that does not exist yet (§8's last rung). **"Not observed" is none of them.**

## 11. Establishing a TV surface from evidence

`device_type` never arrives at review ([§12](#12-device_type-handling-at-review)), so the surface is
settled here — before any `AND-*TV-*` rule is raised, and before triage discards the file.

**The evidence, and it is not all equal.** **Either of these two settles the surface as `tv` on its
own**, because both are TV-specific: an `android.intent.category.LEANBACK_LAUNCHER` intent filter on a
launcher activity (`AND-REL-TV-LAUNCH-1`), or a `<uses-feature android:name="android.software.leanback">`
declaration (`AND-REL-TV-FEATURE-1`) — Android defines that feature as *"the app is designed to run on
Android TV devices"*. **A TV source set, module, product flavour, variant, target or base screen type
settles it too** — each is TV-specific, and at release scope the whole artefact is in view so the build
configuration is readable ([§15](#15-release-stage-pass-b-only)); within a diff such a signal settles it
whenever it is actually in the changed files, which for a flavour declaration is uncommon. **The list is
open, not exhaustive.**

**Corroborating-only, and never sufficient alone:** `android.hardware.touchscreen` declared
`android:required="false"`, and a banner. Both also serve non-TV form factors — see the paragraph below.

**`android.hardware.touchscreen` declared `android:required="false"` is corroborating evidence only and
never settles it alone.** Android documents that declaration as also serving *"devices that provide a
fake touch interface, or even on devices that provide only a D-pad controller"* — Chromebooks and
desktop form factors included. A phone app declaring it for Chromebook reach is **not** a TV app, and
reading it as one is the characteristic false positive here. `AND-REL-TV-FEATURE-2` still *requires* it
on a TV build, because Play filters the app off every TV device without it; requiring it and detecting
from it are different jobs. **They identify a TV *target*; nothing identifies the UI framework except
reading the repository** — this organization's is a custom in-house one, so the absence of `androidx.tv`,
Leanback or Compose for TV is not evidence against a TV surface, and never a reason to propose one.

**A circularity nothing catches automatically.** `AND-REL-TV-LAUNCH-1` and `AND-REL-TV-FEATURE-1` govern
**the two strings this section settles on**, so an app breaking both reads as non-TV and skips this
section entirely — and `AND-REL-TV-FEATURE-2` is then never reached either. **At release the whole
shipping artefact is in scope, not a diff** ([§15](#15-release-stage-pass-b-only)), and a TV product
flavour, variant or target settles the surface independently of the manifest. Check all three there,
where their absence is itself the finding — never by inference from a diff that omits the manifest.

| State | Reached when | Consequence |
|---|---|---|
| `tv` | a **settling** signal is in scope — the leanback launcher category or the `android.software.leanback` declaration — or a TV source set, module, flavour or base screen type. **Corroborating evidence alone does not reach this state**: `android.hardware.touchscreen required="false"` and a banner both also serve non-TV form factors | TV families live and additive; record surface and evidence in Scope |
| `mobile` | positive mobile-only evidence | TV families entirely N/A; no `AND-*TV-*` rule may be raised |
| `[unknown]` | neither settles it — a shared module, a diff with no manifest | **Raise no `AND-*TV-*` rule and no touch-specific mobile remedy.** Record it in Not Applicable / Skipped naming the evidence sought, and ask in the output. **`[unknown]` is not `mobile`** — defaulting it there silently applies touch assumptions, the one forbidden outcome. Never block the review to ask |

**Traps — each is a wrong finding reached with high confidence.**

| The wrong call | What settles it |
|---|---|
| Manifest says leanback ⇒ the UI is Leanback-based | the dependency graph and real class usage; those tokens are Play and device identifiers |
| No `androidx.tv`, Leanback or `BrowseSupportFragment` ⇒ not a TV app | the two manifest declarations; a library's absence outweighs nothing |
| A shared component meets 48dp ⇒ it is a mobile component | its module's reachability; reachable from both, both `A11Y-TOUCH-1` clauses bind |
| A `TV-xx` criterion requires some **UI** focus behaviour | no TV app-quality criterion states a UI-focus requirement — `TV-DP` covers reachability only. The one criterion mentioning "focus" is about **audio** focus, not focus traversal |
| `TV-TO` makes hover or pointer support mandatory | its tier — `TV-TO` is aspirational, not the baseline gate |
| A TV app ⇒ click listeners are dead code | click **is** the D-pad select path; only a gesture-*only* path is the defect |
| The inset is 48dp (or 58dp), so this is wrong | the repository's declared inset; the platform requires no visible clipping, not a number |
| Content bleeds to the edge ⇒ overscan violated | interactive or text to read? decorative background bleeding is correct |
| No `nextFocus*` ⇒ focus order is unhandled | the positional default is recommended — and its presence proves nothing: an unlooped override is a dead end |
| `configChanges="keyboard\|keyboardHidden\|navigation"` is over-broad | on a TV activity that exact value is prescribed; a broader value is a different claim |
| A back handler exists ⇒ back is correct | repeated presses must terminate at the TV home screen, via no handler that both opens and closes |
| Focus is visible ⇒ the focus story is done | focus must also be *placed*, be *unique*, and read distinctly from selected and pressed |
| `sp` units everywhere ⇒ font scaling is right | can the box grow? `sp` in a pinned component clips or pushes past the inset |
| No TalkBack on TV ⇒ `A11Y-SR-1` is unsatisfiable | it does exist on Android TV; the rule is satisfiable there as written |
| `screenOrientation="landscape"` ⇒ layout is met | how non-16:9 content scales, and whether the theme is opaque and full-screen, are separate conditions |

## 12. `device_type` handling at review

Review has **no confirmed `device_type`**, and the repository-knowledge manifest cannot supply one — it
carries no such field ([§4](#4-repository-knowledge)). [§11](#11-establishing-a-tv-surface-from-evidence)
establishes the surface; this section governs what follows from it.

- **Infer, never demand.** Read the evidence out of the reviewed files. Note a TV surface, and the evidence that established it, in Scope; **never block a review to ask.**
- **Suppress inapplicable mobile rules rather than fork a rule.** A touch-target remedy has nothing to mean where there is no touch. **Never apply touch or gesture assumptions to a TV surface** — and never the converse either: an `AND-*TV-*` rule is raised on an established TV surface only.
- **Never file a TV finding against a rule that does not exist.** The `AND-*TV-*` IDs are real now, and confined to the six host documents [§10](#10-android-tv-rule-families-and-their-review-stages) tables; an ID outside that set is invented. Confirm it in `standards/android/` before filing — a finding with nothing to cite is not filed ([§2](#2-the-filing-gate--what-may-be-filed)).
- `A11Y-TOUCH-1` and `A11Y-TOUCH-2` **already carry explicit Android-TV clauses** — D-pad focusability with a visible focus highlight, and enough separation that focus moves predictably. The `AND-UI-TV-FOCUS-*` rules are additive to them and deliberately do not restate them, so **honouring the shared pair is reading the standard, not filling a TV gap.**
- A TV concern with no rule behind it is still not invented here. Record it in Not Applicable / Skipped as a standards gap ([§8](#8-when-the-repository-has-no-convention)) — the same treatment any other absent antecedent gets.

**Focus handling, D-pad traversal, the launcher banner and the Play TV track are in scope for this
skill**, each with a pass and a stage assigned in [§10](#10-android-tv-rule-families-and-their-review-stages).
The former blanket exclusion is **withdrawn**: it was written when no `AND-*TV-*` ID existed, and keeping
it would leave the five manifest-and-banner `AND-REL-TV-*` rules filable by nobody at any stage.

## 13. Lane ownership and the merge contract

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

**Out-of-lane strictness.** If a performance, security or release issue is noticed incidentally in Pass A — or a correctness issue in Pass B — it is **not filed here and not noted here.** No aside, no parenthetical, nowhere in the document. **This is deliberately stricter than `rn-code-reviewer`, which permits a one-line out-of-lane aside: do not restore symmetry with it.** Both Android passes merge into one document, so an aside there duplicates the other pass's work rather than adding coverage. **The merge itself is the caller's** ([§14](#14-what-each-pass-returns)).

## 14. What each pass returns

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

## 15. Release stage (Pass B only)

At `/prepare-mobile-release` the scope is the shipping release, not a diff, and the diff-oriented rules of §§1–3 do not apply. **`skills/mobile-release-readiness/SKILL.md` owns the checklist**; this section governs only the Android performance and build material inside it. **`agents/mobile-release-engineer.md` owns the verdict, and consumes this pass's sign-off rather than re-auditing performance** — so a concern this pass does not surface is a concern the release never sees.

- **`AND-REL-*` is live here in full**: variant and flavour structure, `minSdk`/`targetSdk`/`compileSdk` changes, config supply, debug-only configuration confined to debug, dependency declaration style and pinning, signing, minification and keep rules.
- Return **one `[android]` sign-off block** into `templates/release-checklist-template.md`'s **Perf Sign-off** section — APK/AAB size delta, the Android performance concerns for this release, and a verdict of **pass / pass-with-follow-ups / fail**.
- **`AND-REL-TV-*` is live here, and this stage establishes the TV surface itself.** Nothing upstream supplies a confirmed `device_type` — `/prepare-mobile-release` has no device step — so do not wait for one. **At this stage the whole shipping artefact is in scope rather than a diff**, so apply [§11](#11-establishing-a-tv-surface-from-evidence)'s evidence to the artefact's own manifest and build configuration: a TV product flavour, variant or target, or a **settling** manifest declaration — the leanback launcher category or the `android.software.leanback` feature — establishes it. **`android.hardware.touchscreen required="false"` does not**: it is required on a TV build but also serves fake-touch and D-pad-only devices, so an artefact carrying only that is not thereby a TV release. **This is the one stage that can settle the circularity** — where a declaration is absent, its absence is the finding rather than a reason to skip the section. If the artefact genuinely carries no TV target, record `AND-REL-TV-*` as Not Applicable with that reason; if it is a TV release, all nine are live: the launcher intent filter, the `uses-feature` declarations, the **in-app** `android:banner` drawable, the **separate** store-listing TV asset, the form-factor and TV-track decision, the bundle and TV target-API floor, and the signing identity. **This is the only stage at which those nine are filable**, so a TV release that skips it leaves them unreviewed by anyone.
- **An item that cannot be verified is not silently passed.** It is a no-go by default, surfaced to the human.

Three Android facts this section must not get wrong:

- **Establish the repository's AGP version before asserting which optimization flag is missing, because either DSL may be in use.** `AND-REL-R8-1` **names no DSL, flag or filename** — it is outcome-shaped, and is satisfied under either. AGP 9.3 *added* an `optimization { }` DSL covering code and resources together, with keep rules in a file suffixed `.keep` under a `src/<variant>/keepRules` source set; it **replaced nothing** — the legacy `isMinifyEnabled` / `isShrinkResources` / `proguardFiles(...)` form is still supported. So the finding is never "the wrong DSL"; it is that the release variant does not reach the optimized outcome in whichever DSL this repository uses. `AND-REL-R8-2` survives unchanged; both DSLs support the `keepRules` source set, so a keep rule is looked for in either location.
- **Checking only "minification is on" checks half the requirement.** Baseline and Startup Profile *generation* requires R8 **off**, while the shipped release requires R8 **on**. Both are correct, in different builds — so verify both states, not one flag.
- **Keep-rule sufficiency is not statically decidable.** The filable finding is *"reflective, serialization or native-interop code arrived with no keep rule"* — never *"these keep rules are insufficient"*.

## Red flags — STOP and report instead of proceeding

- A `standards/android/*` or shared standards file this pass cites is missing or is a structure-only placeholder.
- You cannot name which filing-gate category a finding violates, or its citation slot is empty.
- You are about to cite an ID you have not confirmed exists — in particular an `AND-A11Y-*` or `AND-SEC-*` ID, neither of which exists in this repository. **`AND-*TV-*` IDs now do exist**, in the six host documents [§10](#10-android-tv-rule-families-and-their-review-stages) lists; confirm the exact ID there rather than composing one from a root.
- You are about to raise an `AND-*TV-*` rule with no TV surface established, or to treat `device_type: [unknown]` as `mobile` ([§11](#11-establishing-a-tv-surface-from-evidence)); or to cite a TV rule *instead of* its base family rather than in addition to it.
- You are about to file `SEC-*`, generic `REL-*` or `QA-*`, or to note an out-of-lane issue as an aside.
- You are about to file a modernization, a migration, a toolkit/library/architecture preference, or a finding against pre-existing code outside the resolved scope.
- You are about to assert a magnitude from reading a diff, or to name a measurement without device model, OS version, build type and compilation state.
- You are about to cite a rule whose precondition is unestablished — Kotlin/Compose-compiler version for `AND-UI-COMPOSE-6`, AGP version for `AND-REL-R8-1`, Room major version for `AND-DATA-MIGRATE-3`, the changed surface for `AND-PERF-LIST-3` and `A11Y-TOUCH-1` — or to cite an `AND-UI-XML-*` rule against a Compose file, or the reverse.
- You are about to run Gradle, a linter, a benchmark or a profiler; to modify the code under review; or to write over a template.
- The scope handed in is missing or ambiguous — ask the caller rather than re-deriving it.

## Relationship with command, agents, skills

- **`/review-code`** — scope resolution, platform attribution, standards loading, invoking both agents, and the merge. **`/prepare-mobile-release`** — the release-scoped invocation ([§15](#15-release-stage-pass-b-only)).
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
| Layering, modules, ViewModel & UI state, DI | `standards/android/android-architecture.md` | `AND-ARCH-*`, `AND-VM-*`, `AND-DI-*` (27, incl. `AND-ARCH-TV-*` 6) |
| Kotlin language, null-safety, coroutines & Flow, static analysis | `standards/android/kotlin-standards.md` | `AND-KT-*` (19) |
| Compose, XML/Views, lists, resources | `standards/android/compose-xml-standards.md` | `AND-UI-*` (46, incl. `AND-UI-TV-*` 10 and `AND-UI-A11Y-*` 10) |
| Networking, contracts, DTOs, auth, errors | `standards/android/android-networking.md` | `AND-NET-*` (14) |
| Persistence, migrations, threading, cache | `standards/android/android-persistence.md` | `AND-DATA-*` (11) |
| Navigation, arguments, deep links, back stack | `standards/android/android-navigation.md` | `AND-NAV-*` (18, incl. `AND-NAV-TV-*` 9) |
| Logging, analytics, PII in both | `standards/android/android-logging-analytics.md` | `AND-LOG-*` (9) |
| Tests — **referenced, not audited** ([§6](#6-the-two-passes)) | `standards/android/android-testing.md` | `AND-TEST-*` (10, incl. `AND-TEST-INSTR-2`) |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-*` (13) |
| Localization & RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-*` (13) |
| Performance — threading, lists, images, memory, startup, size | `standards/android/android-performance.md` | `AND-PERF-*` (24, incl. `AND-PERF-TV-*` 8) — **Pass B** |
| Gradle variants, dependencies, signing, R8 | `standards/android/gradle-build-signing.md` | `AND-REL-*` (20, incl. `AND-REL-TV-*` 9) — **Pass B** |

**198 `AND-*` across the ten Android files, plus 26 shared** — counted, not estimated. Five boundary rules, each factual rather than stylistic:

- **`AND-REL-*` (Gradle build, variants, signing, R8) and shared `REL-*` (release readiness) are unrelated families.** Conflating them is a factual error, not a naming quibble.
- **`AND-DI-*` has no topic segment** — the IDs are `AND-DI-1` through `AND-DI-4`. Do not invent one.
- **Accessibility now has an `AND-*` family; i18n/RTL still does not.** `AND-UI-A11Y-1` … `-10` in `standards/android/compose-xml-standards.md` state **how** a shared `A11Y-*` requirement is met on Android — cite them alongside the shared root, which still owns whether the requirement applies. **There is no `AND-I18N-*` root, and no `AND-A11Y-*` root either** — the family is `AND-UI-A11Y-*`, under `AND-UI-*`; never write the shorter form. **Security is narrower than it looks:** there is no `AND-SEC-*` root and shared `SEC-*` is `mobile-security-reviewer`'s, **but `AND-DATA-SEC-1`/`-2`/`-3` do exist** inside `standards/android/android-persistence.md` — data-at-rest security — and they are **Pass A's to file**. Do not mistake them for the other lane's.
- **`AND-*` and those two shared roots only.** Never cite an `IOS-*` root, and never React Native's generically-named `ARCH-*`/`API-*`/`STATE-*`/`NAV-*`.
- **The TV rules take host-document roots, not a family of their own.** There is no `AND-TV-*` root and no TV standards file: `AND-UI-TV-*` lives in the Compose/XML standard, `AND-NAV-TV-*` in navigation, and so on, so **the cited ID's root still decides its owning pass** ([§13](#13-lane-ownership-and-the-merge-contract)). `AND-TEST-TV-*` deliberately does not exist — the single TV testing obligation is `AND-TEST-INSTR-2`.
