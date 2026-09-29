---
name: android-code-review
description: Android-specific review content — the standards families and AND-* citation map, the review buckets, family selection, stage applicability and this lane's own out-of-lane policy. Used by /review-code, scoped to files attributed to this platform, alongside the shared platform-review skill which owns the review methodology.
---

# Android Code Review

## Overview

This skill is the **Android half** of a code review. It owns what a platform-independent
layer could not state: which standards families and `AND-*` IDs may be cited, how changed
files map to review buckets, which rules apply at which stage, and this lane's own
out-of-lane policy.

The methodology half — the delegation ladder, the filing gate, citation discipline,
evidence reach, predicate versus claim, mechanism versus magnitude, scope discipline,
severity and the two-pass rule — lives in **`skills/platform-review/SKILL.md`** and is not
restated here. Apply both.

This skill runs only against files the command attributed to this platform. Other
platforms' files are handled by their own lane in parallel, and findings merge into one
`templates/code-review-template.md` with `[platform]` tags — never a document per platform.

**Out-of-lane policy for this lane: no out-of-lane aside is permitted anywhere in the
document, and a modernization or preference observation must not appear anywhere in the
output** — not in Findings, not in Not Applicable / Skipped, not in the Verdict. This is
deliberately stricter than `skills/rn-code-review/SKILL.md`, which owns React Native's
permissive policy; the divergence is intentional and long-standing. Do not restore
symmetry with it. `skills/platform-review/SKILL.md` is deliberately neutral here.

## 2. Standards readiness gate

Every Android finding cites an authored `AND-*` standard under `standards/android/`. Before reviewing, confirm those standards are authored (not placeholders). If a cited `standards/android/*` file is missing or is still a structure-only placeholder, **stop and report that real Android review is blocked until it is authored** — do not fall back to unwritten expectations. (As of authoring, all ten `standards/android/*` files and the shared `A11Y-*`/`I18N-*` standards are authored; this gate exists so the skill fails loudly if that regresses.)

## 5. Triage into standards-relevant buckets

Map each changed file to zero or more buckets. Files matching no bucket are marked **Not Applicable / Skipped** with a one-line reason and are not reviewed further — this keeps the review free of manufactured noise.

| Bucket | Applies to | Standard |
|---|---|---|
| `AND-KT-*` | any Kotlin/Java source file | `standards/android/kotlin-standards.md` |
| `AND-ARCH-*`, `AND-VM-*`, `AND-DI-*` | layering, module placement, state holders, DI wiring | `standards/android/android-architecture.md` |
| `AND-UI-*` | UI surfaces, lists, resources | `standards/android/compose-xml-standards.md` |
| `AND-NAV-*` | navigation destinations, arguments, back stack, deep links | `standards/android/android-navigation.md` |
| `AND-NET-*` | networking clients, DTOs, mappers, auth, error handling | `standards/android/android-networking.md` |
| `AND-DATA-*` | databases, key-value stores, files, caches, migrations | `standards/android/android-persistence.md` |
| `AND-TEST-*` | test sources, and production code whose testability the standards govern | `standards/android/android-testing.md` |
| `AND-LOG-*` | logging and analytics call sites | `standards/android/android-logging-analytics.md` |
| `AND-REL-*` | Gradle files, build config, variants, signing, minification | `standards/android/gradle-build-signing.md` |
| `A11Y-*` | user-facing interactive surfaces | `standards/shared/accessibility.md` |
| `I18N-*` | files carrying user-visible copy, formatting, or layout direction | `standards/shared/i18n-rtl.md` |

`AND-PERF-*` is deliberately absent from this table — it belongs to `performance-reviewer` (`skills/platform-review/SKILL.md` §2 rung 3).

## 6. Framework-neutral family selection

The **file being reviewed** decides which UI family applies — never the repository majority, and never a preferred toolkit.

| Surface in the changed file | Family applied |
|---|---|
| Jetpack Compose | `AND-UI-COMPOSE-*` |
| XML / Views / Fragments / Activities | `AND-UI-XML-*` |
| Hybrid or mid-migration repository | whichever matches **this file's** surface |
| Custom or project-specific UI abstraction | `AND-UI-*` applied to the wrapper's observable behavior |

Rules:

- **Never cross-apply.** Compose rules are not applied to a View file, or the reverse.
- **"Should have used Compose" is never a finding.** Neither is "should have migrated off Fragments, RxJava, or LiveData." Those are architectural opinions, excluded by `skills/platform-review/SKILL.md` §3.
- Introducing a **new** toolkit, DI framework, networking client, or concurrency model into a file that does not use it **is** reviewable — as a repository-convention and `AND-ARCH-*`/`AND-UI-*` consistency violation, not because one technology is better than another.
- The same neutrality applies beyond UI: RxJava, LiveData, callbacks, Coroutines/Flow, manual DI, Hilt, Dagger, Koin, Room, DataStore, Retrofit, and Ktor are all valid repository conventions.

## 12. `device_type` handling at review

Review has **no confirmed `device_type`** — there is no upstream frontmatter to read, unlike the Analyze and Design stages. Handle it minimally:

- **Infer, never demand.** If the reviewed files sit in a TV surface — `/review-code`'s surface attribution places them on a declared surface whose `formFactor` is `tv`, or, without Project Knowledge, leanback manifest entries, a TV module or TV base classes — note it in the review's Scope section. That corroborates TV scope; it is never treated as a `device_type`. **Never block a review to ask** which device type is in play.
- **Suppress inapplicable mobile rules rather than invent TV rules.** `A11Y-TOUCH-1` already states that on TV form factors the requirement is a reliably focusable element with a clearly visible focus state instead of a touch-target size — honoring that is reading the authored shared standard, not adding TV knowledge.
- **Never file a TV finding against a rule that does not exist.** No Android TV `AND-*` rules exist yet. Where TV-specific review depth is genuinely unavailable, say so once in Not Applicable / Skipped and move on.
- **File TV findings against the shared TV baseline.** On an established TV surface, `standards/shared/tv-baseline.md` (`TVB-*`) is authored: a concrete violation — focus dropped or invisible, directional order that ignores the layout, an overlay that leaks focus, a touch-only affordance, a Back that does nothing, a second playback owner or an undisposed player — is filed under its `TVB-*` ID. Judge it against the repository's own TV model, never against a preferred one.
- **Never apply touch or gesture assumptions to a TV surface** — touch targets, tap/swipe gestures, and soft-keyboard flows do not transfer to a D-pad/remote model.

This skill does **not** author Android TV rules. Repository-specific TV facts come from Project Knowledge; stable Android TV rules are open work (`ANDROID-003`).

## Standards citation

Cite only IDs that exist in these files and genuinely apply to the change under review.

| Area | Standard file | IDs | Lane |
|---|---|---|---|
| Kotlin language & safety | `standards/android/kotlin-standards.md` | `AND-KT-*` | code-reviewer |
| Architecture, state holders, DI | `standards/android/android-architecture.md` | `AND-ARCH-*`, `AND-VM-*`, `AND-DI-*` | code-reviewer |
| Compose / XML / lists / resources | `standards/android/compose-xml-standards.md` | `AND-UI-*` | code-reviewer |
| Navigation | `standards/android/android-navigation.md` | `AND-NAV-*` | code-reviewer |
| Networking & API | `standards/android/android-networking.md` | `AND-NET-*` | code-reviewer |
| Persistence | `standards/android/android-persistence.md` | `AND-DATA-*` | code-reviewer |
| Testing | `standards/android/android-testing.md` | `AND-TEST-*` | code-reviewer |
| Logging & analytics | `standards/android/android-logging-analytics.md` | `AND-LOG-*` | code-reviewer |
| Gradle / build / signing | `standards/android/gradle-build-signing.md` | `AND-REL-*` | code-reviewer |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-*` | code-reviewer |
| Localization & RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-*` | code-reviewer |
| Performance & memory | `standards/android/android-performance.md` | `AND-PERF-*` | **performance-reviewer** |

Do not use React Native's generically-named `RN-*`/`ARCH-*`/`API-*`/`STATE-*`/`NAV-*` IDs for Android — those are RN-specific. Android cites the `AND-*` roots above.

## Red flags — STOP and report instead of proceeding

- A cited `standards/android/*` file is missing or is a structure-only placeholder (see [§2](#2-standards-readiness-gate)).
- You are about to file a finding you cannot tie to one of the four categories in `skills/platform-review/SKILL.md` §3.
- You are about to file a modernization or architectural-preference observation anywhere in the document.
- You are about to file against pre-existing code outside the resolved review scope.
- You are about to cite a standard ID without confirming it exists.
- You are about to apply a UI family that does not match the reviewed file's actual surface.
- The scope handed in by the command is missing or ambiguous — ask the caller rather than re-deriving it.

## Scope discipline — legacy code and the review boundary

Two rules that operate together; neither is correct alone:

- **A concrete `AND-*` violation is reviewable even when the repository already contains similar legacy code.** Consistency with existing wrong code is not a defense. If the changed code blocks the main thread, `AND-PERF-THREAD-1` is violated whether or not ten other files do the same.
- **Review only code introduced or modified within the resolved review scope.** Never file a finding against pre-existing code outside the reviewed change — not adjacent lines, not the rest of the file, not the module. A pre-existing violation the change happens to sit near is out of scope and is not filed anywhere.

## Lane ownership for overlapping IDs

Three standards files cite IDs rooted in another family: `android-performance.md` cites `AND-UI-LIST-*`, `AND-UI-XML-*`, and `AND-VM-LIFECYCLE-*`; `android-persistence.md` cites `AND-PERF-THREAD-1`; `gradle-build-signing.md` cites `AND-PERF-SIZE-*`.

**The ID's own root decides the owner, not the file it appears in:**

- Any `AND-PERF-*` ID → `performance-reviewer`, always.
- Every other ID → `code-reviewer`, always.

This prevents the two agents double-filing the same issue from two directions.

## Severity rubric

| Severity | Meaning | Android examples |
|---|---|---|
| **Blocking** | Breaks functionality or violates a hard rule | Main-thread disk/network I/O (`AND-PERF-THREAD-1`); a Context or View retained in a state holder (`AND-VM-STATE-4`); an unhandled schema migration (`AND-DATA-MIGRATE-1`) |
| **Major** | Likely to cause a real bug or meaningfully hurts maintainability | Business logic in an Activity/Fragment/Composable (`AND-ARCH-LAYERS-3`); an ad-hoc networking client instead of the shared one (`AND-NET-CLIENT-1`); a lazy-list item without a stable key (`AND-UI-COMPOSE-3`) |
| **Minor** | Standards deviation without immediate functional risk | Hardcoded user-visible string instead of a resource (`AND-UI-RES-1`, `I18N-COPY-1`); a missing content description on a non-text control (`A11Y-ROLES-1`) |
| **Nit** | Style/hygiene deviation — **still requires a cited standard ID** | Raw `Log.d` instead of the repo's logging abstraction (`AND-LOG-HYGIENE-1`) |

## Relationship with command, agents, skills

- **`commands/review-code.md`** — scope, file attribution, standards loading, lane routing, the readiness gate, and the merge.
- **`skills/platform-review/SKILL.md`** — the platform-independent review methodology. It names every other owner; that table is not repeated here.
- **`agents/code-reviewer.md`** and **`agents/performance-reviewer.md`** — the two executors that run both halves over this platform's files.
- **This skill** — the Android review content itself, and nothing a platform-independent layer could state.
