---
name: ios-code-review
description: Methodology for reviewing native iOS code changes against the org's authored IOS-* and shared standards. Used by /review-code, scoped to files attributed to the iOS platform, via the ios-code-reviewer and ios-performance-reviewer agents, and by /prepare-mobile-release for the iOS perf sign-off. Files only concrete violations within the reviewed change — never modernization suggestions, and never a verdict the reviewed diff cannot support.
---

# iOS Code Review

## Overview

The methodology the two iOS reviewer agents follow once a command hands them a scope. It is **not orchestration**: `/review-code` resolves scope, attributes files to platforms, loads standards, and merges.

**This skill never modifies the code under review.** Neither agent declares `Edit` or `NotebookEdit`, so neither can change a file in place — but that is a backstop, not the rule. The rule is this paragraph, and it binds equally through `Bash` and through any delegated sub-agent.

It runs only against files the command attributed to iOS. Other platforms' files are handled by their own skill in parallel and merged into one document with `[platform]` tags.

## 0. Standards readiness gate

Before reviewing, confirm the standards files **this pass will cite** are authored and not structure-only placeholders — Pass A: `swift-standards.md`, `swiftui-uikit-standards.md`, `ios-architecture.md`, `accessibility.md`, `i18n-rtl.md`; Pass B: `ios-performance.md`. Both passes read `swift-standards.md`'s governing block regardless, since it governs all five iOS documents.

If a file this pass cites is missing or is a placeholder, **stop and report that iOS review is blocked until it is authored.** Never fall back to unwritten expectations. Perform the check — do not assume the answer from a previous run.

## 1. Resolve scope

Use the iOS-attributed file list or diff handed in by the caller — **do not re-derive it**. `/review-code` owns scope resolution and platform attribution.

Two rules operate together; neither is correct alone:

- **Review only code introduced or modified within the resolved scope.** Never file against pre-existing code — not adjacent lines, not the rest of the file. A pre-existing violation the change sits near is out of scope.
- **A concrete violation inside the scope is reviewable even where similar legacy code exists.** Consistency with existing wrong code is not a defence.

Record the review mode — diff review or whole-repo audit — in the Scope section ([§14](#14-what-each-pass-returns)).

## 2. The delegation ladder

**Route every check to the cheapest authority that can soundly settle it, and never re-derive what another component owns.** Descend only when the rung above cannot decide.

| Rung | Authority | What it settles |
|---|---|---|
| 1 | The repository's **resolved, enabled** tooling and CI | Formatting, and the two Build-stage lint rules — see [§2.1](#21-rung-1-is-conditional) |
| 2 | `repo-knowledge-consumer` | The repository's established conventions ([§5](#5-repository-knowledge)) |
| 3 | Another reviewer's lane | `SEC-*`, `IOS-BUILD-*`, `REL-*`, and the other pass's roots ([§7](#7-lane-ownership-and-the-merge-contract)) |
| 4 | An authored `IOS-*` / `A11Y-*` / `I18N-*` standard | Whether the change violates a written rule — **this is the review** |
| 5 | Judgment against repository convention or architecture | Layering, boundaries, dependency direction, internal inconsistency ([§3](#3-what-may-be-filed--the-filing-gate)) |

**Do not run the tools.** Reviewing a diff and running a build are different acts assigned to different participants: `swift-standards.md` § *Applicability stage* assigns Build-stage verification to **CI or the implementer**, and `skills/ios-feature-implementation` § 11 is where that evidence is produced.

### 2.1 Rung 1 is conditional

Suppressing a finding because "a tool owns it" is only sound when the tool **actually has that rule switched on in this repository**. Establish it, or do not suppress:

**An authored ID always wins.** Where a tool rule and an authored `IOS-*` ID cover the same defect, **file it under the `IOS-*` ID.** `/fix-review-comments` re-verifies by citation, so a suppressed finding leaves the Fix stage nothing to check, and the standards expect the ID filed. **Rung 1 suppresses only findings with no authored ID behind them** — pure formatting, and the two Build-stage lint rules `IOS-SWIFT-LINT-1` / `IOS-SWIFT-LINT-3`.

This is not hypothetical. SwiftLint's *default-on* `force_cast` and `force_try` are `IOS-SWIFT-NULL-2`, and `class_delegate_protocol` underlies `IOS-SWIFT-LIFETIME-3`. Those stay filed under their `IOS-*` IDs.

And a configuration file present in the repository proves nothing on its own:

1. Read `.swiftlint.yml`, `.swift-format`, any build-tool plugin declared in `Package.swift`, and the CI workflow.
2. A rule is tool-owned **only if it is in the resolved enabled set.** SwiftLint's `force_unwrapping` (`IOS-SWIFT-NULL-1`), `weak_delegate` and `implicitly_unwrapped_optional` are **opt-in**; `swift-format`'s `NeverForceUnwrap` and `NeverUseImplicitlyUnwrappedOptionals` are **default-off**.
3. **Where the configuration cannot be resolved, file the finding.** A duplicate costs the author one line; a miss costs them the defect.

`IOS-SWIFT-LINT-1` names three distinct products — SwiftLint, SwiftFormat, and Apple's `swift-format`. Check which the repository actually invokes; do not substitute one for another, and do not name one the repository has not adopted.

Record what rung 1 absorbed, and on what evidence, in Not Applicable / Skipped.

## 3. What may be filed — the filing gate

**Every finding names a concrete violation of exactly one of four things:**

1. A **repository convention** — an established pattern the change departs from.
2. The **project's architecture** — layering, module boundaries, dependency direction.
3. An authored **`IOS-*` standard**.
4. A **shared standard** — `A11Y-*` or `I18N-*`.

**A finding that cannot name which is not a finding and is not filed.**

Categories 3–4 cite the ID. **Categories 1–2 carry a citation in the same slot** so the Fix stage can re-verify them: `[convention: docs/project/patterns.md#<anchor>]`, or `[architecture: <the boundary or direction violated>]` where no document records it. A finding with an empty citation slot is not filable.

Consequences:

- **Never file because another implementation would be more modern or more idiomatic.** `IOS-UI-FRAMEWORK-3` states it from the standards' side: migration and incidental modernisation are never proposed unless the feature requests them.
- **Modernization must not appear anywhere in the output** — not in Findings, not in Not Applicable / Skipped, not in the Verdict.
- **Nit is not an exemption.** A Nit still carries a citation.
- **Framework, library and architecture preference are never findings.** SwiftUI, UIKit, both observation models, Swift Concurrency, GCD, Combine, SPM, CocoaPods, Core Data, SwiftData, XCTest and Swift Testing are all valid repository conventions.

Like the Android sibling, **no out-of-lane aside is permitted anywhere in the document.** The permission this diverges from lives in `agents/rn-code-reviewer.md`, not in `skills/rn-code-review/SKILL.md`, which is silent on it. The divergence is intentional.

## 4. Evidence reach — what you may claim

### 4.1 By applicability stage

`swift-standards.md` § *Applicability stage* directs: **mark a rule Not Applicable — never "passed" — when its stage has not been reached.**

- **Diff** — decidable from the changed code. The default.
- **Build** — requires compiling, linting or archiving. `IOS-SWIFT-LINT-1` and `IOS-SWIFT-LINT-3` are this skill's; `IOS-BUILD-REPRO-1`/`-2` are the release engineer's. A diff-reading reviewer does not assert a verdict on them.
- **Release** — `IOS-PERF-MEASURE-3`/`-4`, checked at `/prepare-mobile-release`. At the Review stage, mark Not Applicable; at the Release stage they become live ([§15](#15-release-stage-pass-b-only)).

### 4.2 Split the predicate from the claim

Several rules carry no stage marker while part of their text demands a runtime act. **The source-side predicate is filable; the runtime claim is a verification request.** Filing the first as though it were the second loses real defects; filing the second as though it were the first is overclaiming.

| Rule | The diff settles this — file it | The diff cannot settle this — request it |
|---|---|---|
| `IOS-SWIFT-CONC-1` | shared mutable state reachable from two isolation domains | that a race occurs → Thread Sanitizer |
| `IOS-SWIFT-CONC-3` | an isolation escape hatch with no comment naming the mechanism that enforces the invariant | whether the discipline actually holds |
| `IOS-SWIFT-LIFETIME-2` | an `unowned` reference whose lifetime the change does not evidently dominate | that it traps → run the scenario; safe `unowned` traps deterministically without a sanitizer |
| `IOS-ARCH-TEST-5` | a named non-deterministic construct — a `sleep`, wall-clock dependence, execution-order or shared-mutable-state dependence, live network | the flake rate → repeated execution |
| `IOS-PERF-LAUNCH-4` | a dynamic framework, a `+load`, or an expensive global constant added **without the change stating its cost** — the omission is the violation | the size of that cost → the dyld Activity instrument |
| `A11Y-SR-1` | a missing, duplicated or placeholder label; a control with no trait | whether the flow is coherent → a screen-reader run |
| `A11Y-FONT-2` | fixed text-container heights, hardcoded font sizes | the visual result at large sizes → render and inspect |
| `I18N-TEST-1`, `-2` | `left`/`right` anchors, non-literal user-visible strings, direction-dependent layout | visual correctness in RTL → a run in an RTL locale |

`I18N-TEST-1`/`-2` are a **required check in `/review-code`** per `standards/shared/i18n-rtl.md` — so the source-side predicate is filed as a finding, and the runtime part is a verification request **inside Findings**, never parked in the skipped bucket.

`IOS-PERF-MEM-4` is not in this table: [§4.3](#43-mechanism-versus-magnitude) already governs it.

### 4.3 Mechanism versus magnitude

`IOS-PERF-MEASURE-1` binds **both** passes:

> A magnitude claim — "this is slow", "this leaks", "this regressed launch" — is never asserted from reading code.

- A **mechanism** finding — unbounded growth, work on the wrong thread, per-item cost in a loop, or a retention cycle **whose both edges are readable in the reviewed files** — needs no measurement and is filed at its own severity.
- Retention has three shapes, and only the first is reliably diff-local: an escaping closure stored on `self` that captures `self`; a delegate assignment whose `weak`-ness lives in another file (read that declaration before filing — `IOS-SWIFT-LIFETIME-3`); and **external-registry retention** — a `NotificationCenter` block observer or a scheduled `Timer` — which is unidirectional, not a cycle, and which the Leaks instrument will not report. A bounded one-shot closure needing no `[weak self]` is a **false finding**; `IOS-SWIFT-LIFETIME-1` says so explicitly.
- A **magnitude** claim carries a measurement, or is filed as a **measurement request** ([§13](#13-measurement-requests)). Unmeasured, it caps at Minor and never blocks.

## 5. Repository knowledge

**Do not re-derive conventions by reading source when the repository already publishes them.**

- Obtain them through the **`repo-knowledge-consumer` skill**, or from whatever the caller supplies. Never parse `.ono/repo-knowledge.json` yourself — the contract permits one reader per plugin, and it is not you.
- Where a category is covered and fresh, read the cited section and **cite it** (`docs/project/patterns.md#<anchor>`, `docs/project/components.md#<anchor>`). Cite, never paste. Record the categories used in one line under Standards Checked — `templates/code-review-template.md` has no Repo Knowledge Reference section, and adding one is a cross-platform change this task does not own.
- Where knowledge is absent, stale or `unknown`, **derive live, scoped to the changed files.** That is the normal case and never blocks the review.
- **Never treat `platformHints` as the platform**, and **never use the manifest for `device_type`** — it carries none.
- **Report drift; never repair it.** Recommend `/inspect-sync` (or `/inspect`) in one line.

Still required: **read enough surrounding code to judge the change before filing.** A finding drawn from the hunk alone, without checking the file's existing pattern, is the characteristic review defect.

## 6. Triage into standards-relevant buckets

Files matching no bucket are **Not Applicable / Skipped** with a one-line reason.

| Bucket | Applies to | Standard |
|---|---|---|
| `IOS-SWIFT-NAME/NULL/TYPE/ERR-*` | any Swift or Objective-C source file | `swift-standards.md` |
| `IOS-SWIFT-LIFETIME/CONC-*` | captures, delegates, observation tokens, task handles, isolation | `swift-standards.md` |
| `IOS-SWIFT-LOG/ANALYTICS-*` | logging and analytics call sites | `swift-standards.md` |
| `IOS-UI-*` | UI surfaces, view models, lists, cells, SwiftUI/UIKit interop | `swiftui-uikit-standards.md` |
| `IOS-ARCH-*` | layering, module placement, navigation, DI, persistence, test architecture | `ios-architecture.md` |
| `A11Y-*` | user-facing interactive surfaces | `standards/shared/accessibility.md` |
| `I18N-*` | user-visible copy, formatting, layout direction | `standards/shared/i18n-rtl.md` |

`IOS-PERF-*` belongs to Pass B; `IOS-BUILD-*` to `mobile-release-engineer`; `SEC-*` to `mobile-security-reviewer`.

## 7. Lane ownership and the merge contract

`swift-standards.md` § *Lane boundaries* is authoritative for both the root→owner routing and the **one defect, one finding** table. **Apply that table; this file does not copy it.** A second copy drifts from the original, and both passes already read the governing block ([§0](#0-standards-readiness-gate)), so a copy buys nothing.

**The ID's own root decides the owner, not the file it appears in.** All five `standards/ios/*` files cite IDs rooted in another family; that is cross-referencing, not reassignment.

### 7.1 How the merge actually executes

Neither agent can see the other's findings, and the command that merges does not read this skill. So the dedupe is carried in the findings themselves:

**Each pass files what its lane sees — never suppress an observation assuming the other agent will file it — and marks any finding whose owning ID belongs to the other lane with a trailing `merge-candidate: <owning ID>`.**

The caller then folds each marked finding:

1. **Owning finding present** → merge the marked finding's evidence into it, keep the owning ID and its severity, drop the duplicate.
2. **Owning finding absent, and the owning defect is inside the review scope** → re-file under the owning ID.
3. **Owning finding absent because the owning aspect is pre-existing and out of scope** → the marked finding **stands alone under its own ID**. Never re-file it against unchanged code ([§1](#1-resolve-scope)).

Two pairs look like merges and are **not** — each side owns a distinct defect, and both are filed unmarked:

- `IOS-UI-ID-2` owns the **container choice**; `IOS-PERF-RENDER-8` owns the **memory and rendering cost** where such a container is already in place.
- `IOS-PERF-MEM-3` owns a resource that **retains its owner**; a **delegate back-reference** is `IOS-SWIFT-LIFETIME-3`, which `ios-performance.md` states is explicitly not that rule.

`IOS-ARCH-NAV-4` is likewise not a merge: the routing finding is filed here; the parallel `SEC-DEEPLINK-*` requirement stays with `mobile-security-reviewer`.

**`IOS-BUILD-DEP-4` is the one out-of-lane ID either pass may name**, and only as a supporting citation inside `IOS-ARCH-MODULE-5` per the governing table. Naming it there is not a lane violation; filing it as an owning ID is.

## 8. Framework-neutral family selection

**The file being reviewed decides the family** — never the repository majority.

**Family restriction is the exception, not the rule** — most `IOS-UI-*` rules are family-neutral, and treating them as SwiftUI-only silently makes them uncitable in UIKit files.

| Scope | IDs |
|---|---|
| **Both families** | `IOS-UI-VIEW-*` (the standard heads it "View Composition (both families)"), `IOS-UI-FRAMEWORK-*`, `IOS-UI-A11Y-*`, `IOS-UI-ID-*`, `IOS-UI-CELL-3` |
| **SwiftUI files only** | `IOS-UI-STATE-*` |
| **UIKit files only** | `IOS-UI-UIKIT-*`, `IOS-UI-CELL-1`, `-2`, `-4` |
| **Across a bridge** | `IOS-UI-INTEROP-*` — `UIHostingController`, `UIViewRepresentable`, `UIViewControllerRepresentable` and a representable's nested `Coordinator` — plus each side's own family on its own side |

`IOS-UI-ID-2` compares `List` with `UITableView`/`UICollectionView` by design; `IOS-UI-CELL-3` (cancelling per-row async work so a late result cannot land on the wrong row) applies to a SwiftUI row `.task` as much as to a dequeued cell. In a hybrid or mid-migration repository, the family-restricted sets follow **this file's** surface.

- **Never cross-apply a family-restricted rule.** `IOS-UI-FRAMEWORK-1` prohibits it — and it is about those sets, not the neutral ones.
- **"Should have used SwiftUI" is never a finding.**
- The **observation model of the surface** decides which `IOS-UI-STATE-*` rule applies, and the standard recognises three: the Observation framework, `ObservableObject`, and a redux/store pattern. The non-interchangeable part is the *object* wrappers — `@StateObject`/`@ObservedObject`/`@EnvironmentObject` require `ObservableObject`, `@Bindable` requires `Observable`, while `@State`, `@Binding` and `@Environment` are common to both. `@State` is the correct owning wrapper for an `@Observable` object, so seeing it in an `ObservableObject` file is not by itself a model mix. A rule naming a feature the deployment target does not offer is **inapplicable, not violated**.
- Introducing a **new** framework, DI approach, concurrency model or persistence stack into a file that does not use it **is** reviewable — as a convention and `IOS-ARCH-*`/`IOS-UI-*` consistency violation.

## 9. The two review passes

**Pass A — `ios-code-reviewer`**: `IOS-SWIFT-*`, `IOS-UI-*`, `IOS-ARCH-*`, `A11Y-*`, `I18N-*`.
**Pass B — `ios-performance-reviewer`**: `IOS-PERF-*` only.

**Pass B runs separately, not as a sub-step of Pass A** — so a performance-only change is not miscategorised, and a correctness-only change absorbs no performance commentary.

## 10. Severity

**Derived from the rule, not improvised.** `swift-standards.md` § *Severity* is authoritative — four levels, Blocking / Major / Minor / Nit, with its own two overrides. It is not restated here.

Two things that section leaves to the reviewer:

- **The tiebreak.** Where a rule could sit in two categories, the consequence in this change decides — and *"decides"* means: **if the consequence is reachable by a user in a normal flow, Major; if it is reachable only by a future maintainer, Minor.**
- **The caps.** A finding labelled `unverified-convention` ([§11](#11-when-the-repository-has-no-convention)) caps at Minor; an unmeasured magnitude claim caps at Minor and never blocks.

The DD-deviation override needs the Detailed Design. Where the caller supplied it, apply it. **Where it was not supplied, do not infer approval or its absence** — file at the rule's own category and say the DD was unavailable.

## 11. When the repository has no convention

Apply the three-case ladder in `swift-standards.md` § *When the repository has no convention*, and **state which case applied**. Case 3 is labelled `unverified-convention` and caps at Minor. **An absent convention is never, by itself, compliance.**

## 12. `device_type` handling at review

Review has **no confirmed `device_type`**, and repository knowledge cannot supply one.

- **Infer, never demand.** Note a TV surface in Scope; **never block a review to ask.**
- **Suppress inapplicable mobile rules rather than invent TV rules.** `A11Y-TOUCH-1` already states the TV form-factor requirement; honouring it is reading the standard, not adding TV knowledge.
- **Never file against a rule that does not exist.** No tvOS `IOS-*` rules exist yet — `ATV-001` owns them, `ATV-002` owns branching these skills, and a bare `IOS-TV-*` root has no owner.
- **Never apply touch or gesture assumptions to a TV surface.**

## 13. Measurement requests

A claim needing evidence a diff cannot supply is filed as a request, never a verdict and never a vague "needs profiling". Name **the metric, the scenario, the threshold that would make it a defect**, and the mechanism:

| Class | Mechanism |
|---|---|
| Main-thread stalls and hangs | Time Profiler, or the Hangs instrument, over the named scenario |
| Dropped frames / hitches | the **Animation Hitches** template (Frame Lifetimes, Core Animation FPS). Hitches and hangs are different classes: a hitch can occur with **no** main-thread stall, so a Time Profiler trace comes back clean on a real `IOS-PERF-RENDER-6` defect |
| Data race | Thread Sanitizer — **Simulator or macOS only; it cannot run against an iOS device build.** A clean strict-concurrency compile argues *absence* within checked code rather than observing a race, and `@unchecked Sendable` / `nonisolated(unsafe)` silence the checker entirely. Note also that language mode (`-swift-version`) and checking level (`-strict-concurrency`) are independent settings |
| Post-deallocation `unowned` access | **Run the scenario.** Safe `unowned` traps deterministically in any configuration and the crash report is the evidence. Address Sanitizer applies only to `unowned(unsafe)`, which `IOS-SWIFT-LIFETIME-2` already forbids |
| Retention cycle, external-registry retention, unbounded growth | Memory-graph capture, or Allocations generational marking. **The Leaks instrument reports nothing for registry retention** — the object stays reachable from a live root |
| Launch regression, pre-`main` cost | the **dyld Activity** instrument for static-initializer time; the App Launch *template* for the whole sequence — release configuration, representative device |
| App-size contribution | The size report from an archive — never a source-side estimate |
| Field-observed regression | `MetricKit` — iOS, iPadOS, macOS and visionOS only, **not tvOS or watchOS**; physical device only, and at most one payload per day, so it cannot settle anything inside a review cycle — or the repository's analytics equivalent (`IOS-PERF-MEASURE-4`) |

Thread Sanitizer and Address Sanitizer serve `IOS-SWIFT-CONC-*` and `IOS-SWIFT-LIFETIME-*`, which are Pass A's lane; the remaining rows are Pass B's.

Two constraints belong in the request's text: a Debug or Simulator timing is **not** evidence of shipping performance (`IOS-PERF-MEASURE-3`), and a fix is verified the way it was diagnosed, against a stated baseline (`IOS-PERF-MEASURE-2`).

**Name the mechanism; do not run it, and do not name a tool the repository has not adopted.**

Consult these only when a request needs the mechanism's own limits or setup — not to learn what a rule means, which is the standard's job:

| When | Source |
|---|---|
| Separating a hitch from a hang, or choosing between the responsiveness instruments | [Analyzing responsiveness issues](https://developer.apple.com/documentation/xcode/analyzing-responsiveness-issues-in-your-shipping-app) |
| Confirming what a sanitizer does and does not detect, and where it can run | [Diagnosing memory, thread and crash issues early](https://developer.apple.com/documentation/xcode/diagnosing-memory-thread-and-crash-issues-early) |
| Identifying what runs before `main`, and what a launch measurement covers | [Reducing your app's launch time](https://developer.apple.com/documentation/xcode/reducing-your-app-s-launch-time) |
| Checking a field metric's availability, cadence and payload shape | [MetricKit](https://developer.apple.com/documentation/metrickit) |

## 14. What each pass returns

Each pass returns **only its own** material, to the caller. Neither writes a document, and neither can see the other's findings.

- **Scope** — files reviewed, review mode (diff | whole-repo audit), commit or branch, and the TV-surface note where applicable.
- **Standards Checked** — the IDs applicable to this scope, plus the repo-knowledge categories used ([§5](#5-repository-knowledge)).
- **Findings** — this pass's findings only, each with its severity, tagged `[ios]`, `merge-candidate:` where [§7.1](#71-how-the-merge-actually-executes) applies. Pass B's are the Performance material; **Pass A emits no Performance section**.
- **Not Applicable / Skipped** — one line each: rules whose stage was not reached, what rung 1 absorbed and on what evidence, and any standards gap.
- **No Verdict.** A verdict over one pass is not a verdict over the change.

Write explicit **"None found"** for an empty section.

### 14.1 What the caller assembles

`/review-code` merges both passes and every other platform into one document in the shape of `templates/code-review-template.md` — severity as the primary axis, findings tagged inline, Performance as its own top-level section — then applies [§7.1](#71-how-the-merge-actually-executes) and sets a single **Verdict**: any Blocking → **Blocked**; else any Major → **Approved with follow-ups**; else **Approved**.

**Never write over `templates/code-review-template.md`.** It is this plugin's blank template; writing to it corrupts every future review on every platform. A persisted review goes to the path the caller names.

### 14.2 Finding format

`[ios] file:line — [<citation>] description — remediation`

where `<citation>` is an `IOS-*`/`A11Y-*`/`I18N-*` ID, or the convention/architecture form from [§3](#3-what-may-be-filed--the-filing-gate). Append `— merge-candidate: <owning ID>` where applicable, and `— unverified-convention` where case 3 applied.

A measurement request instead carries four named fields:

`[ios] file:line — [IOS-PERF-* ID] — metric: … · scenario: … · threshold: … · mechanism: …`

`/fix-review-comments` re-verifies each fix **against the citation the finding carried**, so three things are load-bearing: a real citation, a concrete `file:line`, and **a re-checkable condition** — remediation states a specific fix, and the finding states what must become true for the defect to be gone. "This is fragile" cannot be re-verified; "the observation token is never cancelled, so the object outlives dismissal" can.

## 15. Release stage (Pass B only)

At `/prepare-mobile-release` the scope is the shipping release, not a diff, and §§1, 4.1, 6 and 14 do not apply. `skills/mobile-release-readiness` governs the checklist; this section governs the iOS perf material within it.

- Return **one `[ios]` sign-off block**: app-size delta, the iOS performance concerns for this release, and a verdict of **pass / pass-with-follow-ups / fail**.
- `IOS-PERF-MEASURE-3` and `-4` are **live here**, not Not Applicable: measurements come from a release-configuration build on a representative device, and field metrics are consulted where the repository collects them.
- **An item that cannot be verified is not silently passed** — it is a no-go by default, surfaced to the human.

## 16. Red flags — STOP and report instead of proceeding

- A standards file this pass cites is missing or is a placeholder.
- You cannot name which filing-gate category a finding violates, or its citation slot is empty.
- You are about to file a modernization or preference observation.
- You are about to file against pre-existing code outside the resolved scope.
- You are about to cite an ID you have not confirmed exists, or to file **as an owning ID** one whose root is another lane's.
- You are about to state a magnitude claim without a measurement, or assert a Build- or Release-stage verdict from a diff.
- You are about to suppress a finding under rung 1 without having resolved the enabled rule set ([§2.1](#21-rung-1-is-conditional)).
- You are about to run a build, linter or profiler; to modify the code under review; or to write over a template.
- The scope handed in is missing or ambiguous — ask the caller rather than re-deriving it.

## 17. Relationship with command, agents, skills

- **`commands/review-code.md`** — scope resolution, platform attribution, standards loading, invoking both agents, and the merge ([§14.1](#141-what-the-caller-assembles)).
- **`agents/ios-code-reviewer.md`** — Pass A. **`agents/ios-performance-reviewer.md`** — Pass B, and the release sign-off ([§15](#15-release-stage-pass-b-only)).
- **This skill** — the methodology both follow. Both declare it in `skills:` frontmatter so it loads with them; where a harness ignores that field, read this file explicitly before reviewing.
- **`skills/repo-knowledge-consumer/SKILL.md`** — the only component permitted to parse the repository-knowledge manifest.
- **`skills/mobile-security-review/SKILL.md`** — the `SEC-*` lane, via `/review-security`.
- **`agents/mobile-release-engineer.md`** — files `IOS-BUILD-*` and `REL-*`, following `skills/mobile-release-readiness/SKILL.md`.
- **`skills/ios-feature-implementation/SKILL.md`** — the Implement and Fix stages. It records which IDs were **applied**, in an **in-session report, not a file on disk** — never instruct a reviewer to open one.

## Standards citation

Cite only IDs that exist in these files and genuinely apply to the change.

| Area | File | Root | Lane |
|---|---|---|---|
| Swift language, safety, lifetime, concurrency, diagnostics | `standards/ios/swift-standards.md` | `IOS-SWIFT-*` | code-reviewer |
| SwiftUI / UIKit / state / lists / interop | `standards/ios/swiftui-uikit-standards.md` | `IOS-UI-*` | code-reviewer |
| Layering, modules, navigation, DI, persistence, test architecture | `standards/ios/ios-architecture.md` | `IOS-ARCH-*` | code-reviewer |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-*` | code-reviewer |
| Localization & RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-*` | code-reviewer |
| Performance & memory | `standards/ios/ios-performance.md` | `IOS-PERF-*` | **performance-reviewer** |
| Xcode, build, signing, distribution | `standards/ios/xcode-build-signing.md` | `IOS-BUILD-*` | **release-engineer — not this review** |
| Security | `standards/shared/mobile-security.md` | `SEC-*` | **security-reviewer — not this review** |

Do not use React Native's `RN-*`/`ARCH-*`/`API-*`/`STATE-*`/`NAV-*` IDs or Android's `AND-*` roots for iOS.
