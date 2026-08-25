---
name: android-dev-planning
description: Repository-first planning methodology for a native Android feature. Inspects the repository's actual implementation model before proposing anything, then supplies the Android vocabulary and the AND-*/A11Y-*/I18N-*/SEC-* standard IDs cited by a feature analysis's Proposed Technical Approach, a Detailed Design's Technical Implementation Approach and Impacted Modules, and a task breakdown. Use when planning, designing, or decomposing native Android work through /analyze-feature, /dev-design-start, or /dev-feature-start via the android-architect agent. Assumes no UI toolkit, architecture pattern, DI framework, concurrency model, or library — each is a finding, never a default. Handles device_type mobile and tv in one lane.
---

# Android Dev Planning

## Overview

The methodology `android-architect` follows to plan native Android work: how a feature is
grounded in repository evidence, analysed, classified, and expressed as a design.

**This skill owns the Android content.** It does not own orchestration. `dev-design-start`
and `dev-feature-start` own DD structure, gap discipline, existing-file strategy, task
decomposition, dependencies, rollback plans, and the draft-until-approved gates. Nothing
here re-implements any of that.

**Nothing about the repository's technology is assumed.** Compose, XML/Views, Fragments,
Activities, single-activity, Hilt, Dagger, Koin, manual DI, Room, DataStore, Retrofit,
Ktor, Coroutines/Flow, RxJava, LiveData, WorkManager, MVVM, MVI, Clean Architecture, and
multi-module layout are **possible findings, never defaults**. Official Android
documentation is supporting guidance; it never overrides a valid existing implementation.

**This skill never writes code and never modifies a repository file.** It plans.

## Reference index

Read a reference when its lane applies — not before.

| Read this | When |
|---|---|
| [references/analysis-domains.md](references/analysis-domains.md) | Composing the approach — state, lifecycle, navigation, persistence, networking, testing, performance, security, a11y, i18n, and the concrete IDs each cites |
| [references/output-contracts.md](references/output-contracts.md) | Writing the output — what Analyze vs. Design vs. Feature-start each receive, Impacted-Modules resolution, and traceability rules |
| [references/tv-context.md](references/tv-context.md) | **`device_type: tv` only** — the TV discovery pass and TV planning rules |

## Inputs (resolved by the command, never invented)

Obtain these and **verify each resolves on disk** before doing anything else. Artifact
resolution belongs to `commands/dev-design-start.md`; this skill **never guesses a path**
to a feature document.

- **`platform`** — must be `android`. If it is anything else, stop: this lane does not run.
- **`device_type`** — exactly `mobile` or `tv`, **never re-detected**. **At Analyze it comes
  from the user confirmation at `commands/analyze-feature.md` step 2**, because no feature
  analysis exists yet; from Design onward it is read from the upstream document's
  frontmatter. Missing, empty, or any other value including `mixed` → **stop and report
  it**. Never default to `mobile`.
- The target repository / module root.
- **At Analyze** — the feature description and `repo-analyst`'s findings summary.
- **At Design** — the absolute path to the **approved** Feature Analysis.
- **At Feature-start** — the absolute path to the **approved** Detailed Design.
- The four design-reference fields: `design_reference_status`, `design_reference_type`,
  `design_reference`, `figma_link`.

A missing input is a **stop**, reported by name. Never proceed against an assumed location.

## The planning workflow

Copy this checklist and tick items as you complete them:

```
Android planning progress:
- [ ] Step 0: Standards readiness gate
- [ ] Step 1: Source-of-truth hierarchy + canonical repository knowledge
- [ ] Step 2: Collect repository evidence (every dimension)
- [ ] Step 3: Identify the implementation model per surface
- [ ] Step 4: Branch on device_type
- [ ] Step 5: Compose the approach
- [ ] Step 6: Classify every statement
- [ ] Step 7: Verify against the Definition of Done — fix and re-verify
```

### Step 0 — Standards readiness gate

Every Android rule this skill applies must be grounded in an authored standard under
`standards/android/`. Before planning, confirm each standard you intend to cite is
authored rather than a structure-only placeholder. **A placeholder declares itself in its
own *Purpose & Scope*** — "Not yet authored", "structure-only placeholder" — which is the
same marker `commands/implement-task.md` tests for before opening a platform route. Read
the file; never rule on it from memory. If one is missing or a placeholder,
**stop and report that Android planning is blocked until it is authored** — never fall
back to an assumed default. **This gate is expected to pass** — it exists so the lane
fails loudly if authorship regresses, not because a gap is anticipated.

### Step 1 — Apply the source-of-truth hierarchy, then reuse canonical repository knowledge

The ranked hierarchy is defined once in `skills/dev-design-start/SKILL.md`
§ *Shared planning rules → Source-of-truth hierarchy*. Apply it as written; it is not
restated here. Ranks 4 and 5 are parameterised, and this lane's parameters are:

- **Rank 4** — `standards/android/*` plus `standards/shared/*`.
- **Rank 5** — official Android documentation.

Two consequences of that hierarchy bind this lane directly. **Never reinterpret an approved
scope, requirement, or explicitly recorded decision** — if the plan would require violating
or expanding one, stop and request approval. And **never resolve conflicting evidence
silently** — report the conflict.

The `repo-knowledge-consumer` skill owns the resolution procedure, what may be reused, and
the citation shape. Apply it as written. **Never parse `.ono/repo-knowledge.json`
yourself.** An absent manifest is the normal case: say so in one line and proceed with
full live inspection — never block on it.

What this lane adds: **derive live the Android detail no repository-wide document can
hold** — the actual signatures, state shape, and call sites of the specific classes *this
feature* touches, alongside every category the consumer reports as `deriveLive`. That
feature-specific reading is required, and it is not duplication of the manifest.

### Step 2 — Repository evidence collection

Inspect the codebase before proposing anything. **Detect — do not assume.** `repo-analyst`
performs only lightweight Android existence checks (Gradle DSL flavour, Compose-vs-XML
presence), and its Standards Conformance section compares folder structure against React
Native's `ARCH-LAYERS-*`/`ARCH-FOLDERS-*` expectations, which **do not apply to Android**.
This sweep is therefore this lane's own responsibility, and its structural comparison runs
against `AND-ARCH-LAYERS-*` and `AND-ARCH-MODULE-*` instead. **Never present
`repo-analyst`'s React Native conformance verdict as an Android finding.**

Collect evidence for each dimension, recording the path that proves it:

1. **Gradle structure** — Groovy vs. Kotlin DSL, version catalogs, convention plugins, the `settings.gradle(.kts)` module list.
2. **Application and library modules** — single- vs. multi-module, module types, dependency-graph direction, `api`/`implementation` boundaries.
3. **Kotlin and Java usage** — language mix, Kotlin version, Java interop surfaces.
4. **SDK levels** — `minSdk`, `targetSdk`, `compileSdk`, AGP version, and the API-level constraints they impose.
5. **Build variants and product flavors** — build types, flavors, and how environment/config values are supplied.
6. **UI implementation model** — per surface; see [Step 3](#step-3--identify-the-implementation-model-per-surface).
7. **Activities and Fragments** — single- vs. multi-activity, Fragment usage, base classes, project-specific UI abstractions.
8. **Navigation approach** — Navigation Component, Compose Navigation, `FragmentTransaction`, `Intent`-based, a custom router, or a project-specific abstraction.
9. **State-management conventions** — ViewModel usage or its absence, state-holder shape, immutable vs. mutable state, the one-time-event pattern.
10. **Dependency injection** — Hilt, Dagger, Koin, manual DI, or a service locator; scopes and component boundaries.
11. **Networking** — client, serialization, interceptors, auth handling, DTO/mapper conventions.
12. **Persistence** — Room, DataStore, SharedPreferences, files, or a custom store; migration and cache conventions.
13. **Background work** — WorkManager, services, foreground services, broadcast receivers, `JobScheduler`, or an in-house scheduler.
14. **Concurrency model** — Coroutines/Flow, RxJava, LiveData, callbacks, or a mix; the dispatcher-injection convention; structured-concurrency and cancellation practice.
15. **Testing tools and coverage** — frameworks, assertion and mocking libraries, instrumentation and UI-test setup, and what is actually covered today.
16. **Reusable components** — existing screens, shared UI components, base classes, and utilities the feature should reuse.
17. **Existing feature boundaries** — how features are packaged, where a new one would sit, and what the nearest analogous feature looks like.
18. **Relevant platform integrations** — analytics, logging, feature flags, remote config, media/playback, push, deep links, and any SDK the feature touches.

**Label every finding** `[evidence: <path>]`, `[reused: <path>#<anchor>]`, `[inference]`,
or `[unknown]`. An unlabelled repository claim is a defect. Prefer `[unknown]` over a guess.

Then analyse in this order, so each step rests on established evidence:

1. **Module and layer map** — what exists, and which layer the feature belongs in.
2. **Nearest analogous feature** — the closest comparable feature becomes the pattern to follow.
3. **Layering and dependency direction** → `AND-ARCH-LAYERS-1`, `AND-ARCH-LAYERS-2`, `AND-ARCH-LAYERS-3`, `AND-ARCH-DEPS-1`, `AND-ARCH-DEPS-2`.
4. **Module placement**, and whether a new module is justified → `AND-ARCH-MODULE-1`, `AND-ARCH-MODULE-2`, `AND-ARCH-MODULE-3`, `AND-ARCH-MODULE-4`.
5. **Dependency injection** — how this feature's dependencies are provided in the repository's existing approach → `AND-DI-1`, `AND-DI-2`, `AND-DI-3`, `AND-DI-4`.

A new architectural pattern is never introduced for a single feature. If the feature
appears to require one, that is an **unresolved decision**, not a design choice.

### Step 3 — Identify the implementation model per surface

Identify the model **per surface, not per repository** — a repository may legitimately
contain several. Five outcomes, none privileged:

| Model | Evidence to look for | Family that applies |
|---|---|---|
| **Compose** | Compose dependencies, `setContent`, `@Composable` declarations | `AND-UI-COMPOSE-*` |
| **XML / Views** | `res/layout/`, ViewBinding/DataBinding, Fragment or Activity view inflation | `AND-UI-XML-*` |
| **Hybrid** | both present, on different surfaces | whichever matches each surface |
| **Mid-migration** | interop in both directions (Compose hosting a View, or a View hierarchy hosting Compose), migration notes or ADRs | whichever matches each surface; the migration's direction is respected, never accelerated |
| **Custom / project-specific** | in-house base classes, UI abstractions, or a bespoke rendering or navigation layer | `AND-UI-*` applied to the wrapper's observable behavior, plus the repository's own conventions |

- **The surface the feature touches decides the family.** Never apply Compose rules to a
  View surface or the reverse.
- **Never migrate a surface between models** unless the feature explicitly requires it and
  it is approved → record it as an unresolved decision.
- **A custom or legacy model is a first-class finding, not a defect.** Plan within it.
  Where a custom abstraction wraps a standard mechanism, apply the standard's *intent* to
  the wrapper's behavior rather than demanding the standard API.
- Lists and resources follow the surface too → `AND-UI-LIST-*`, `AND-UI-RES-*`. At planning
  altitude the load-bearing ones are `AND-UI-LIST-1` (reuse an existing adapter and item
  model rather than creating a parallel one for the same item type), `AND-UI-LIST-5` (empty,
  loading, error and pagination states named explicitly rather than left blank) and
  `AND-UI-LIST-6` (row accessibility semantics and focus order), alongside `AND-UI-RES-1`.
  Whether a large collection needs a recycling or lazy container at all is a performance
  question → `AND-PERF-LIST-1`.
- Where the repository is internally inconsistent — two navigation mechanisms in parallel,
  a half-finished migration, competing DI approaches — **report the inconsistency** rather
  than silently picking one.

### Step 4 — Branch on `device_type`

One agent and one skill serve both device types. **TV is a context signal, never a separate
platform** — there is no TV platform value, agent, skill, or command.

- **`mobile`** → the standard path. Touch interaction, touch targets, and mobile navigation
  patterns apply.
- **`tv`** → read [references/tv-context.md](references/tv-context.md) and run its discovery
  pass **before proposing anything**. Never carry a touch or mobile interaction assumption
  into a TV proposal.

### Step 5 — Compose the approach

Work through [references/analysis-domains.md](references/analysis-domains.md) for the
planning depth and the concrete standard IDs each domain cites, then shape the output per
[references/output-contracts.md](references/output-contracts.md).

Before proposing anything new, **check what already exists**. When the component inventory
is available, consult it for existing screens, reusable components, and the module map. For
each element the feature needs, state explicitly whether you are **reusing** an existing one
(name it by path) or **introducing** a new one (say why nothing existing fits) → reuse
destinations, clients, stores, and base classes per `AND-NAV-DEST-2`, `AND-NET-CLIENT-1`,
`AND-DATA-STORE-1`.

### Step 6 — Classify every statement

Every statement in an Android plan carries one of four labels — **Existing**, **Required**,
**Recommended**, **Unresolved** — and every risk carries one of three classes. Both
taxonomies are defined once in `skills/dev-design-start/SKILL.md` § *Shared planning rules*;
apply them as written. They are not restated here.

The three output lists are **never merged**: existing repository implementation, required
feature work, and recommended deviations. An optional modernization suggestion is *content
routed into* the Recommended list (or into Unresolved) — never a class of its own, never
folded into required work, and never actioned without approval.

### Step 7 — Verify, fix, re-verify

Check the plan against the Definition of Done below. If any item fails, **fix it and
re-check** — do not hand over a plan with a known failing item. This loop is not optional.

## Definition of Done

- [ ] `platform: android` and a valid `device_type` were taken from the confirmed context, not re-detected.
- [ ] Repository knowledge was resolved through `repo-knowledge-consumer`; reused categories are cited by path and anchor.
- [ ] Every dimension in [Step 2](#step-2--repository-evidence-collection) was inspected or explicitly marked `[unknown]`.
- [ ] The UI implementation model is identified **per affected surface**.
- [ ] Every repository claim carries an evidence, reuse, inference, or unknown label.
- [ ] State ownership, event flow, lifecycle, process-recreation behavior, and concurrency are each stated.
- [ ] Navigation, persistence, networking, testing, performance, security, accessibility, i18n and RTL are each addressed or marked `N/A — [reason]`.
- [ ] When `device_type: tv`, the TV discovery pass ran and no mobile or touch assumption was carried over.
- [ ] Every statement is classified Existing / Required / Recommended / Unresolved.
- [ ] Every cited standard ID exists and genuinely applies to the point it is attached to.
- [ ] Unresolved decisions are listed with their options and what each implies.
- [ ] No code was written and no repository file was modified.
- [ ] No new architecture, library, or migration appears as required work without an approval gate.

## Standards citation

Cite only IDs that exist in these files and genuinely apply. Never cite an ID that is merely
adjacent to the point being made, and **never use React Native's generically-named
`ARCH-*`/`API-*`/`STATE-*`/`NAV-*` IDs for Android** — those are RN-specific; Android cites
the `AND-*` roots.

| Area | Standard file | Root |
|---|---|---|
| Kotlin language & safety | `standards/android/kotlin-standards.md` | `AND-KT-*` |
| Architecture, state holders, DI | `standards/android/android-architecture.md` | `AND-ARCH-*`, `AND-VM-*`, `AND-DI-*` |
| Compose / XML / lists / resources | `standards/android/compose-xml-standards.md` | `AND-UI-*` |
| Navigation | `standards/android/android-navigation.md` | `AND-NAV-*` |
| Networking & API | `standards/android/android-networking.md` | `AND-NET-*` |
| Persistence | `standards/android/android-persistence.md` | `AND-DATA-*` |
| Performance & memory | `standards/android/android-performance.md` | `AND-PERF-*` |
| Testing | `standards/android/android-testing.md` | `AND-TEST-*` |
| Logging & analytics | `standards/android/android-logging-analytics.md` | `AND-LOG-*` |
| Gradle / build / signing | `standards/android/gradle-build-signing.md` | `AND-REL-*` |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-*` |
| Localization & RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-*` |
| Security & privacy (shared) | `standards/shared/mobile-security.md` | `SEC-*` |

## Approval gates and failure behavior

Approval gating belongs to `commands/dev-design-start.md` and
`commands/dev-feature-start.md`. **This skill never flips a status.** The design-reference
gate belongs to `commands/analyze-feature.md`; this lane reads what that gate recorded and
never re-runs it.

## Red flags — STOP and report instead of proceeding

- A required input is missing, or `device_type` is absent, empty, or not exactly `mobile`/`tv`.
- Repository evidence is missing, contradictory, or ambiguous on a dimension the plan depends on.
- Two competing mechanisms exist and the one this feature should follow cannot be determined from evidence.
- A UI-changing feature has no design reference of any supported type.
- `device_type: tv` but the TV implementation model cannot be identified from evidence.
- The feature depends on an unconfirmed backend contract — a design built on one is not ready for decomposition.
- The plan would require introducing a new architecture, toolkit, or library as **required** work.
- The plan would require **violating or expanding an approved scope, requirement, or recorded decision**.
- The Feature Analysis and the DD conflict, or an upstream document is unapproved, stale, or draft.
- A cited `standards/android/*` file is missing or is a structure-only placeholder.
- You are about to state a repository fact you did not verify.

## Relationship with commands, agent, skills

- **`commands/analyze-feature.md`** — platform and device-type detection, the user confirmation gate, the design-reference gate, and invoking the architect.
- **`commands/dev-design-start.md` / `commands/dev-feature-start.md`** — stage orchestration and approval gating.
- **`skills/dev-design-start` / `skills/dev-feature-start`** — DD structure and gap discipline; task decomposition, dependencies, rollback plan, draft-until-approved gates.
- **`agents/android-architect.md`** — the Android specialist that runs this methodology.
- **`skills/android-feature-implementation`** — the separate methodology used at Implement time, not here.
- **This skill** — the Android planning methodology itself.

This skill does not move command logic into itself, does not re-run platform or device-type
detection, and does not invent paths to feature documents — the resolved paths from
[Inputs](#inputs-resolved-by-the-command-never-invented) are verified before use.
