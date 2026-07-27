---
name: android-feature-implementation
description: Methodology for implementing exactly one planned task in a native Android (Kotlin/Compose/XML) codebase per org standards. Used by /implement-task via the android-feature-developer agent.
---

# Android Feature Implementation

## Overview

This skill is the methodology the `android-feature-developer` agent follows to implement **exactly one** task from an approved development workflow in a native Android codebase. It owns *how* Android work is understood, grounded in the repo, executed, validated, self-reviewed, and reported.

It is not orchestration. `/implement-task` resolves the task id, reads its `platform`, and routes here; the `require-approval-before-code` and `block-main-branch-changes` hooks gate code writes. This skill does not re-implement any of that — it assumes those gates are active and focuses on doing the implementation correctly. See [Relationship with command, agent, hooks](#relationship-with-command-agent-hooks).

## Inputs this skill requires (resolved, never invented)

Before anything else, obtain and **verify the existence of** the concrete inputs below. They are passed by the invoking command/agent or deterministically resolved from the feature name and repo layout — this skill **never guesses or fabricates a path** to a feature document.

- Absolute path to the approved **Feature Analysis** (`feature-analysis-template.md` output).
- Absolute path to the approved **Detailed Design (DD)** (`dd-template.md` output).
- Absolute path to the approved **Dev Plan** (`dev-plan-template.md` output).
- Absolute path to the **Task Breakdown** (`task-breakdown-template.md` output).
- The **task id** to implement, and the target **repository / module** root.

If any of these paths is not provided and cannot be resolved deterministically, **stop and report exactly which input is missing** — do not proceed against an assumed location. (When `/implement-task` does not yet pass these paths explicitly, resolving them and confirming they exist is part of this step; report the gap rather than inventing.)

## 0. Standards readiness gate

This skill grounds every Android-specific rule in an authored `AND-*` standard under `standards/android/`. Before implementing, confirm those standards are authored (not placeholders). If any cited `standards/android/*` file is still a structure-only placeholder, **stop and report that real Android implementation is blocked until it is authored** — do not silently fall back to assumed defaults. (As of authoring, all ten `standards/android/*` files and the shared `A11Y-*`/`I18N-*`/`SEC-*` standards are authored; this gate exists so the skill fails loudly if that regresses.)

## 1. Source-of-truth hierarchy

Read the complete approved context **before editing any code**, in this order:

1. Feature Analysis → 2. Detailed Design → 3. Dev Plan → 4. Task Breakdown → 5. the specific task row for the task id.

Each document's authority:

| Document | Authoritative for |
|---|---|
| Feature Analysis | Business objective, repo findings, platform context, original feature intent |
| **Detailed Design (DD)** | **Architecture, technical approach, API contracts, state design, impacted modules, risks, and every accepted implementation decision** |
| Dev Plan | Sequencing, dependencies, rollout, and rollback context |
| Task Breakdown + selected task row | **Scope of the current implementation** |
| The task's acceptance criteria | **The completion contract** |

Hard rules:

- Never implement from the original feature request when approved downstream documents exist — the DD supersedes it.
- Never rely on the task row alone without reading the DD and Dev Plan.
- Never reinterpret an architectural decision already approved in the DD.
- If the Feature Analysis, DD, Dev Plan, and task breakdown **conflict**, stop and report the conflict — do not pick one silently.
- If the task requires **violating or expanding the DD**, stop and request approval.
- If a referenced document is **missing, unapproved, stale, or still marked dry-run/draft**, stop.
- If the task is marked **blocked** or depends on unresolved open questions, do not implement it.

## 2. Task resolution & readiness checks

Resolve the task by id in the Task Breakdown and read its: id, title/description, objective, `platform`, files expected to be touched, acceptance criteria, `depends-on`, blockers, estimated size, explicit out-of-scope items, and any linked DD sections / standard IDs.

Confirm **all** of the following before editing. If any fails, **stop and report exactly what is missing** — do not work around it:

- [ ] The DD is `approved` (for real implementation, not dry-run).
- [ ] The Dev Plan is `approved`.
- [ ] The selected task is not already complete.
- [ ] Every `depends-on` task is complete (with evidence, not assumption).
- [ ] No blocking open question remains for this task.
- [ ] The task's `platform` is `android` or explicitly includes Android.
- [ ] The task is small enough for one implementation run (if not, report it should be split).
- [ ] For UI work, the required design reference exists (Dev Plan / DD `figma_link` or `design_reference` — any supported type; Figma is not required specifically). If neither is set, stop and ask — do not guess spacing/color/typography. A task that changes no user-facing UI (`design_reference_status: not_required`) needs none.
- [ ] The repository and target module are known.
- [ ] The current branch and approval hooks allow code changes (not on `main`/`master`).

## 3. Repository grounding

Inspect the actual Android codebase before proposing or writing code. **Detect — do not assume** — and then follow what you find rather than imposing any default (Compose, XML, MVVM, Clean Architecture, Hilt, Retrofit, Room, etc. are never assumed):

- Single-module vs. multi-module structure; app/feature module boundaries.
- Kotlin and Java usage; Gradle config (Groovy/Kotlin DSL, version catalogs) and build variants/flavors.
- Jetpack Compose vs. XML/ViewBinding/DataBinding, and mixed Compose/XML surfaces.
- Architecture pattern actually in use (MVVM, MVI, Clean, layered, other).
- ViewModel and UI-state conventions.
- Async/reactive: Coroutines, Flow, LiveData, RxJava; dispatcher-injection convention.
- DI framework: Hilt, Dagger, Koin, or manual DI.
- Networking: Retrofit, Ktor, raw HTTP; serialization library.
- Persistence: Room, DataStore, SharedPreferences, files.
- Navigation: Navigation Component, Compose Navigation, custom router.
- Repository/use-case/domain conventions; error/loading/empty/retry/offline patterns.
- Analytics, logging, feature flags, remote config; localization and RTL support.
- Testing setup; lint/detekt/ktlint/Android Lint/formatting/static analysis.
- `minSdk`/`targetSdk`/`compileSdk`, AGP and Kotlin versions.

## 4. Context loading before edits

Read, before editing:

- Every file named in the task; every impacted module named in the DD (§20).
- The nearest analogous implementation already in the repo.
- Related ViewModels, repositories, use-cases, models/DTOs/mappers, screens, fragments, composables, adapters, navigation entries, and their tests.
- Shared components/utilities the DD expects to reuse; relevant API contracts and backend models.
- The applicable platform and shared standards (see [§12](#12-standards-citation)).

**Search for an existing implementation before creating any** new abstraction, helper, use-case, repository, UI component, navigation pattern, state container, or networking primitive. Prefer reusing and extending existing patterns (`AND-ARCH-*`, `AND-UI-*`, `AND-NET-CLIENT-1`, `AND-NAV-DEST-2`).

## 5. Pre-implementation plan

Before modifying code, produce a concise plan containing: task objective; acceptance criteria; files expected to change; files reviewed for context; existing patterns to reuse; implementation sequence; validation strategy; risks; possible side effects; rollback considerations; applicable standard IDs.

This plan does **not** require a second user approval when the command-level `require-approval-before-code` hook already governs code writes — but it must be produced before the first edit.

## 6. Android implementation methodology

Apply the standards below as you write, grounded in the conventions detected in [§3](#3-repository-grounding). Every Android rule cites an authored `AND-*` ID; accessibility/i18n/security cite the shared `A11Y-*`/`I18N-*`/`SEC-*` docs, applied with Android-native APIs.

### Kotlin & language safety
Follow the repo's Kotlin style/level. Nullability correct, no unsafe casts or gratuitous `!!`, sealed/data/enum/result types only where consistent with the repo, no hidden side effects in extensions, Java interop kept in mind, no unjustified experimental APIs. → `AND-KT-NULL-*`, `AND-KT-TYPE-*`, `AND-KT-SEALED-*`, `AND-KT-LINT-*`.

### Architecture & dependency direction
Preserve existing layers and module boundaries; UI does not reach transport/persistence directly where repositories/use-cases exist; domain logic stays out of Activities/Fragments/Views/Composables; no circular deps; respect public/`internal` boundaries; no new architectural pattern for one task; keep business rules testable and Android-independent. → `AND-ARCH-LAYERS-*`, `AND-ARCH-DEPS-*`, `AND-ARCH-MODULE-*`.

### ViewModel & state handling
Follow the detected ViewModel/state model; immutable UI state where that's the convention; loading/success/empty/error explicit; single source of truth; no Activity/Fragment/View/Context in ViewModels; one-time effects follow the repo's pattern; handle process recreation and config change; prevent stale state, duplicated events, races. → `AND-VM-STATE-*`, `AND-VM-EVENT-1`, `AND-VM-LIFECYCLE-*`.

### Coroutines, Flow, LiveData & threading
Follow dispatcher-injection conventions; never block the main thread; lifecycle-aware collection; no unscoped coroutines; respect structured concurrency and cancellation; avoid unintended repeated collection; avoid needless Flow/LiveData/callback/Rx conversion; make Shared/StateFlow replay & subscription intentional; surface concurrency/ordering risks. → `AND-KT-COROUTINE-*`, `AND-VM-LIFECYCLE-3`, `AND-PERF-THREAD-1`.

### Dependency injection
Use the detected DI framework; follow existing scopes/component boundaries; no manual service locator where DI is used; avoid over-scoping; place bindings in the correct module; do not inject `Context` where a narrower dependency suffices. → `AND-DI-1`, `AND-DI-2`, `AND-DI-3`, `AND-DI-4`.

### Networking & API work
Use the repo's networking/auth layer and shared client; follow approved DD contracts exactly; do not invent paths/fields/enums/response shapes; use existing DTO/mapper conventions and keep transport separate from domain/UI; handle HTTP/parsing/auth/timeout/cancellation/retry/offline consistently; never log tokens/IDs/PII/bodies/photos/sensitive responses; no ad-hoc client instances; update targeted caches/streams, not global refreshes. **If the task depends on an unconfirmed backend contract, stop.** → `AND-NET-CLIENT-*`, `AND-NET-CONTRACT-*`, `AND-NET-DTO-*`, `AND-NET-AUTH-*`, `AND-NET-ERR-*`, `SEC-AUTH-*`, `SEC-LOG-1`.

### Persistence
Follow the existing Room/DataStore/SharedPreferences/file/cache pattern; migrate on schema changes; never silently clear user data to dodge a migration; keep DB/disk ops off the main thread; preserve encryption/secure-storage; define cache invalidation and source of truth; clean temp files holding sensitive data. → `AND-DATA-STORE-*`, `AND-DATA-MIGRATE-*`, `AND-DATA-THREAD-1`, `AND-DATA-CACHE-1`, `AND-DATA-SEC-*`, `SEC-STORAGE-*`.

### Navigation
Use the detected mechanism; reuse existing destinations/routes/argument models/helpers; no navigation from domain/data layers; validate route/deep-link inputs; preserve back-stack behavior; do not add a route when the DD specifies an existing screen; keep navigation side effects lifecycle-safe. → `AND-NAV-DEST-*`, `AND-NAV-ARGS-*`, `AND-NAV-STACK-*`, `AND-NAV-LAYER-1`, `SEC-DEEPLINK-*`.

### Jetpack Compose (when the surface uses Compose)
Use existing design-system components/theme tokens; stateless composables where appropriate; hoist state per repo patterns; no business logic in composables; stable keys in lazy lists; prevent unnecessary recomposition; intentional `remember`/`rememberSaveable`/derived state/effect APIs with correct keys; preserve accessibility semantics, focus order, content descriptions, touch targets; previews only if the project uses them. **Do not introduce Compose into an XML-only feature without DD approval.** → `AND-UI-COMPOSE-*`, `A11Y-*`.

### XML, Views, Fragments & Activities (when the surface uses Views)
Follow ViewBinding/DataBinding conventions; respect the Fragment view lifecycle and clear binding refs; avoid retaining Views/Activities/Fragments; keep listeners/observers lifecycle-safe; reuse styles/themes/dimensions/drawables/design-system components; avoid deep hierarchies/overdraw; preserve state across config change. **Do not migrate a View screen to Compose unless the DD approves it.** → `AND-UI-XML-*`.

### RecyclerView & lists
Reuse existing adapters/item models; use `DiffUtil`/`ListAdapter` if consistent; stable IDs only when valid; avoid full-list refreshes without reason; handle empty/loading/error/pagination; prevent recycled-view state leakage; validate accessibility/focus. → `AND-UI-LIST-*`, `AND-PERF-LIST-*`, `A11Y-*`.

### Resources, localization & RTL
No hardcoded user-visible strings; use existing resource/localization systems; maintain translation-key parity; support RTL layout and mirrored navigation/icon behavior; semantic resource names; reuse dimensions/styles/colors/typography tokens; no duplicated equivalent resources; no hardcoded PII/placeholder personal data. → `AND-UI-RES-*`, `I18N-COPY-*`, `I18N-RTL-*`.

### Accessibility
Content descriptions/semantic labels for non-text controls; preserve selected/checked/disabled/heading/error states; support TalkBack; logical focus order; minimum touch targets; never convey meaning by color alone; support font scaling without clipping essential text; custom components expose appropriate semantics. → `A11Y-ROLES-*`, `A11Y-TOUCH-*`, `A11Y-FONT-*`, `A11Y-SR-*` (applied via Compose `semantics`/View accessibility APIs).

### Performance & memory
Avoid main-thread I/O and expensive work; avoid Activity/Fragment/View/Context/callback/observer/coroutine leaks; avoid unnecessary allocations and recompositions; use the repo's image loading/caching; size/compress images; clean temp files; avoid polling where reactive updates exist; consider cold-start/render/list/network/battery/storage impact. → `AND-PERF-THREAD-*`, `AND-PERF-LIST-*`, `AND-PERF-IMAGE-*`, `AND-PERF-MEM-*`, `AND-PERF-SIZE-*`.

### Security & privacy
Do not log secrets/tokens/IDs/photos/certificate data/PII; use approved secure storage; validate external input; handle exported components/intents/files/deep links safely; use `FileProvider`/content URIs over unsafe file URIs; least-privilege permissions requested at point of need; do not weaken TLS/cert validation/WebView security/cleartext policy; clean shared/downloaded sensitive temp files per the DD. → `SEC-SECRETS-*`, `SEC-STORAGE-*`, `SEC-NET-*`, `SEC-DEEPLINK-*`, `SEC-WEBVIEW-*`, `SEC-PERMS-*`, `SEC-LOG-*`.

### Error handling
Implement the exact loading/empty/partial/error/retry/blocked states the DD defines; never silently swallow errors; do not expose raw backend errors to users; preserve diagnostics without leaking sensitive data; follow existing retry/token-expiry behavior; ensure a failed write does not leave inconsistent state. → `AND-NET-ERR-*`, `AND-VM-STATE-2`, `AND-LOG-HYGIENE-3`.

### Analytics & logging
Reuse existing analytics conventions; add only the events the DD requires; avoid duplicate events from recomposition/lifecycle re-entry; no PII in analytics; keep debug logging removable and gated. → `AND-LOG-ANALYTICS-*`, `AND-LOG-HYGIENE-*`, `AND-LOG-PII-*`, `SEC-LOG-*`.

## 7. Scope control & deviation rules

- Implement **only** the selected task. Do not opportunistically fix unrelated issues, refactor unrelated modules, absorb another task, change approved API contracts or business rules, update the DD/plan silently, mark dependencies complete without evidence, or introduce speculative abstractions.

If additional work is discovered:

1. **Stop** that additional work.
2. **Document** the finding.
3. **Explain** whether it needs: a new task · a DD amendment · a product/backend answer · a security review · a migration.
4. **Continue** only with work that stays within the selected task's approved scope.

If the selected task itself cannot be completed without expanding scope, **stop and report it as blocked**.

## 8. Incremental implementation

Implement in small logical steps. After each meaningful step: inspect the diff; check imports and compilation risks; verify architecture/module boundaries; verify no unrelated files changed; run the narrowest useful validation where practical. Do not wait until the end to discover the module no longer builds.

## 9. Validation methodology

Select checks based on the actual repo and affected modules. Candidates: Gradle sync/configuration; compile affected Kotlin; assemble the relevant variant; unit tests; ViewModel/use-case/repository tests; instrumentation tests; Compose UI tests; Android Lint; detekt; ktlint; formatting; dependency/module-boundary checks; screenshot/visual checks where supported; manual acceptance-criteria validation.

Rules:

- **Do not claim a command passed unless it was actually run successfully.**
- **Do not claim the app was manually validated unless it was actually run.**
- If a required tool, emulator, device, credential, environment, or backend is unavailable, **state exactly what could not be validated**.
- Run the narrowest relevant validation first, then broaden when practical.
- Do not fix unrelated pre-existing failures unless explicitly approved; distinguish new failures from pre-existing ones.
- **Validate every acceptance criterion individually.** → `AND-TEST-*`.

## 10. Self-review

Before reporting completion, self-review against: task scope · DD compliance · architecture consistency · module boundaries · naming · readability · duplication · unnecessary abstractions · dead code · nullability · lifecycle safety · coroutine/threading safety · state consistency · error handling · accessibility · localization/RTL · performance · memory leaks · security · PII logging · test coverage · unintended file changes · backward compatibility · migration and rollback impact.

Report any unresolved concern — do not hide it.

## 11. Completion & reporting

Produce a structured final report with:

1. Task implemented · 2. Business/technical objective · 3. Files changed · 4. Summary of implementation · 5. Existing patterns reused · 6. **Acceptance-criteria checklist, one by one** · 7. Dependencies verified · 8. Validation commands run and **exact results** · 9. Tests added/updated · 10. Applied Android and shared standard IDs · 11. Deviations from the DD/task · 12. Risks and known limitations · 13. Unresolved blockers · 14. Side effects · 15. Follow-up tasks discovered · 16. Confirmation that no unrelated scope was added.

**Do not mark the task complete if** any acceptance criterion failed · required validation failed · a dependency is incomplete · the implementation deviates from the DD without approval · a blocker remains · the code exists only in an isolated worktree and not the intended repository · files outside the approved task scope were modified without justification.

## 12. Standards citation

Record which standard IDs were **applied** (not merely reviewed) — this is the trace `android-code-reviewer`, `android-performance-reviewer`, and QA handoff rely on.

| Area | Standard file | IDs |
|---|---|---|
| Kotlin language & safety | `standards/android/kotlin-standards.md` | `AND-KT-*` |
| Architecture, ViewModel, DI | `standards/android/android-architecture.md` | `AND-ARCH-*`, `AND-VM-*`, `AND-DI-*` |
| Compose / XML / lists / resources | `standards/android/compose-xml-standards.md` | `AND-UI-*` |
| Performance & memory | `standards/android/android-performance.md` | `AND-PERF-*` |
| Gradle / build / signing | `standards/android/gradle-build-signing.md` | `AND-REL-*` |
| Networking & API | `standards/android/android-networking.md` | `AND-NET-*` |
| Navigation | `standards/android/android-navigation.md` | `AND-NAV-*` |
| Persistence | `standards/android/android-persistence.md` | `AND-DATA-*` |
| Testing | `standards/android/android-testing.md` | `AND-TEST-*` |
| Logging & analytics | `standards/android/android-logging-analytics.md` | `AND-LOG-*` |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-*` |
| Localization & RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-*` |
| Security & privacy (shared) | `standards/shared/mobile-security.md` | `SEC-*` |

Do not use React Native's generically-named `ARCH-*`/`API-*`/`STATE-*`/`NAV-*` IDs for Android — those are RN-specific. Android architecture/state/navigation cite the `AND-*` roots above.

## Red flags — STOP and report instead of proceeding

- A referenced document is missing, unapproved, stale, draft, or dry-run only.
- Feature Analysis, DD, Dev Plan, or task breakdown conflict.
- The task needs to violate or expand the DD, or change an approved API contract/business rule.
- A `depends-on` task is not verifiably complete, or a blocker/open question remains.
- The task depends on an unconfirmed backend contract.
- A UI task has no design reference of any supported type.
- Completing the task requires touching files outside its approved scope.
- You are about to claim a build/test/manual check passed that you did not actually run.
- A cited `standards/android/*` file is a placeholder (see [§0](#0-standards-readiness-gate)).

## Relationship with command, agent, hooks

Responsibilities stay separated:

- **`commands/implement-task.md`** — task selection, platform routing, approval gates, invocation.
- **`agents/android-feature-developer.md`** — the Android specialist persona/executor that runs this methodology.
- **This skill** — the implementation methodology itself.
- **Hooks** — `require-approval-before-code` (approval before any code write), `block-main-branch-changes` (feature-branch enforcement), `protect-secrets`.

This skill does not move command logic into itself, does not depend on undocumented ambient-CWD assumptions, and does not invent paths to the feature documents — the resolved absolute paths from [Inputs](#inputs-this-skill-requires-resolved-never-invented) are verified before use.
