---
name: android-code-review
description: Methodology for reviewing native Android code changes against the org's authored AND-* and shared standards. Used by /review-code, scoped to files attributed to the Android platform, via the android-code-reviewer and android-performance-reviewer agents and the code-review template. Files only concrete standards violations within the reviewed change — never modernization suggestions.
---

# Android Code Review

## Methodology

This skill runs only against files the command has attributed to the Android platform. For a mixed-repo review, iOS/React-web/React-Native-attributed files are handled by their own platform's code-review skill in parallel, and findings are merged into one `templates/code-review-template.md` with `[platform]` tags — never produced as separate documents.

It is not orchestration. `/review-code` resolves the scope, attributes files to platforms, and loads the standards; this skill is the methodology the two Android reviewer agents follow once handed that scope.

**This skill never writes or modifies code.** It reviews.

## 1. Resolve scope

Use the Android-attributed file list/diff handed in by the caller — **do not re-derive it**. `/review-code` owns scope resolution and the file-attribution rule (Android = under `android/` or `.kt`/`.java`).

If this is a whole-repo audit rather than a diff review, state that mode explicitly at the top of the output.

## 2. Standards readiness gate

Every Android finding cites an authored `AND-*` standard under `standards/android/`. Before reviewing, confirm those standards are authored (not placeholders). If a cited `standards/android/*` file is missing or is still a structure-only placeholder, **stop and report that real Android review is blocked until it is authored** — do not fall back to unwritten expectations. (As of authoring, all ten `standards/android/*` files and the shared `A11Y-*`/`I18N-*` standards are authored; this gate exists so the skill fails loudly if that regresses.)

## 3. What may be filed — the filing gate

**Every finding must identify a concrete violation of one of exactly four things:**

1. A **repository convention** — an established pattern the changed code departs from.
2. The **project's architecture** — layering, module boundaries, dependency direction.
3. An authored **`AND-*` standard**.
4. A **shared standard** — `A11Y-*` or `I18N-*`.

**A finding that cannot name which of those four it violates is not a finding and must not be filed.**

Hard consequences of this gate:

- **Never file because a different implementation would be more modern, more idiomatic, or preferred by official Android documentation.** "The repo uses X, but Y is now recommended" is not reviewable.
- **Modernization suggestions must not appear anywhere in the review output** — not in Findings, not in Not Applicable/Skipped, not as an aside, not in the Verdict. If it is not a violation of one of the four, it does not enter the document. Modernization belongs to a separate feature or technical-debt process, not code review.
- **Nit severity is not an exemption.** A Nit still cites a real standard ID. Without that rule, Nit silently becomes the bucket where opinions land.
- Architectural preference, library preference, and toolkit preference are never findings.

This is deliberately stricter than `skills/rn-code-review/SKILL.md`, which permits a one-line out-of-lane aside. The divergence is intentional, not an oversight — do not "restore" symmetry with the React Native skill.

## 4. Scope discipline — legacy code and the review boundary

Two rules that operate together; neither is correct alone:

- **A concrete `AND-*` violation is reviewable even when the repository already contains similar legacy code.** Consistency with existing wrong code is not a defense. If the changed code blocks the main thread, `AND-PERF-THREAD-1` is violated whether or not ten other files do the same.
- **Review only code introduced or modified within the resolved review scope.** Never file a finding against pre-existing code outside the reviewed change — not adjacent lines, not the rest of the file, not the module. A pre-existing violation the change happens to sit near is out of scope and is not filed anywhere.

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

`AND-PERF-*` is deliberately absent from this table — it belongs to `android-performance-reviewer` ([§7](#7-lane-ownership-for-overlapping-ids)).

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
- **"Should have used Compose" is never a finding.** Neither is "should have migrated off Fragments, RxJava, or LiveData." Those are architectural opinions, excluded by [§3](#3-what-may-be-filed--the-filing-gate).
- Introducing a **new** toolkit, DI framework, networking client, or concurrency model into a file that does not use it **is** reviewable — as a repository-convention and `AND-ARCH-*`/`AND-UI-*` consistency violation, not because one technology is better than another.
- The same neutrality applies beyond UI: RxJava, LiveData, callbacks, Coroutines/Flow, manual DI, Hilt, Dagger, Koin, Room, DataStore, Retrofit, and Ktor are all valid repository conventions.

## 7. Lane ownership for overlapping IDs

Three standards files cite IDs rooted in another family: `android-performance.md` cites `AND-UI-LIST-*`, `AND-UI-XML-*`, and `AND-VM-LIFECYCLE-*`; `android-persistence.md` cites `AND-PERF-THREAD-1`; `gradle-build-signing.md` cites `AND-PERF-SIZE-*`.

**The ID's own root decides the owner, not the file it appears in:**

- Any `AND-PERF-*` ID → `android-performance-reviewer`, always.
- Every other ID → `android-code-reviewer`, always.

This prevents the two agents double-filing the same issue from two directions.

## 8. The two review passes

**Pass A — `android-code-reviewer`** walks each bucketed file against its standards section, recording pass / fail / not-applicable per rule, and noting the standard ID for anything that fails.

**Pass B — `android-performance-reviewer`** independently audits the same scope against `standards/android/android-performance.md`'s `AND-PERF-*` rules.

**Pass B runs separately from Pass A, not as a sub-step of it** — so a performance-only change is not miscategorized as a correctness finding, and a correctness-only change does not absorb performance commentary.

## 9. Repository-convention-first review

- **Deviation from the repository's established convention is the finding — not deviation from a generic ideal.** If the repo uses RxJava and the change adds RxJava consistently, that is correct code.
- **Read enough surrounding code to judge the change before filing.** A finding based only on the diff hunk, without checking the file's existing pattern, is the characteristic review defect. Reading context is required; filing against that context is not ([§4](#4-scope-discipline--legacy-code-and-the-review-boundary)).
- **Never invent a rule mid-review.** Only cite IDs that exist in the standards files listed in [§5](#5-triage-into-standards-relevant-buckets) and [§7](#7-lane-ownership-for-overlapping-ids).
- **Prefer the most specific applicable ID** over a vague observation.

## 10. Severity rubric

| Severity | Meaning | Android examples |
|---|---|---|
| **Blocking** | Breaks functionality or violates a hard rule | Main-thread disk/network I/O (`AND-PERF-THREAD-1`); a Context or View retained in a state holder (`AND-VM-STATE-4`); an unhandled schema migration (`AND-DATA-MIGRATE-1`) |
| **Major** | Likely to cause a real bug or meaningfully hurts maintainability | Business logic in an Activity/Fragment/Composable (`AND-ARCH-LAYERS-3`); an ad-hoc networking client instead of the shared one (`AND-NET-CLIENT-1`); a lazy-list item without a stable key (`AND-UI-COMPOSE-3`) |
| **Minor** | Standards deviation without immediate functional risk | Hardcoded user-visible string instead of a resource (`AND-UI-RES-1`, `I18N-COPY-1`); a missing content description on a non-text control (`A11Y-ROLES-1`) |
| **Nit** | Style/hygiene deviation — **still requires a cited standard ID** | Raw `Log.d` instead of the repo's logging abstraction (`AND-LOG-HYGIENE-1`) |

## 11. Remediation and citation discipline

- **Cite the standard ID for every finding.** `/fix-review-comments` re-verifies each fix against the ID the finding cited, so an absent or invented ID breaks the Fix stage.
- **Write concrete remediation** — a specific fix pointer, not a restatement that something is wrong.
- **Format every finding** as `[android] file:line — [AND-* ID] description — remediation`.

## 12. `device_type` handling at review

Review has **no confirmed `device_type`** — there is no upstream frontmatter to read, unlike the Analyze and Design stages. Handle it minimally:

- **Infer, never demand.** If the reviewed files sit in a TV surface (leanback manifest entries, a TV module, TV base classes), note it in the review's Scope section. **Never block a review to ask** which device type is in play.
- **Suppress inapplicable mobile rules rather than invent TV rules.** `A11Y-TOUCH-1` already states that on TV form factors the requirement is a reliably focusable element with a clearly visible focus state instead of a touch-target size — honoring that is reading the authored shared standard, not adding TV knowledge.
- **Never file a TV finding against a rule that does not exist.** No Android TV `AND-*` rules exist yet. Where TV-specific review depth is genuinely unavailable, say so once in Not Applicable / Skipped and move on.
- **Never apply touch or gesture assumptions to a TV surface** — touch targets, tap/swipe gestures, and soft-keyboard flows do not transfer to a D-pad/remote model.

This skill does **not** author Android TV standards or rules — that is a separate, later scope.

## 13. Merge into the shared template

Populate `templates/code-review-template.md` in full, tagging every finding `[android]`:

- **Scope** — files reviewed, platforms reviewed, and the TV-surface note from [§12](#12-device_type-handling-at-review) when applicable.
- **Standards Checked** — the `AND-*` and shared IDs actually applicable to this scope.
- **Findings by Severity** — Blocking / Major / Minor / Nit. **Severity stays the primary organizing axis even for a mixed-platform diff** — tag findings inline, never section the document by platform.
- **Performance** — Pass B's findings, same severity scale.
- **Not Applicable / Skipped** — files and checks skipped, one-line reason each.
- **Verdict** — Approved / Approved with follow-ups / Blocked.

Write explicit **"None found"** for any empty section. **Merge with** whatever other reviewers produced for the same scope — never overwrite it, and never emit a separate Android document.

## 14. Exclusions

- **Security.** All `SEC-*` concerns defer to `mobile-security-review` via `/review-security`. Do not duplicate security commentary here, even incidentally.
- **Cross-lane findings.** Performance stays with Pass B; correctness stays with Pass A ([§7](#7-lane-ownership-for-overlapping-ids)).
- **Pre-existing code outside the reviewed change** ([§4](#4-scope-discipline--legacy-code-and-the-review-boundary)).
- **Modernization and architectural opinion**, everywhere in the document ([§3](#3-what-may-be-filed--the-filing-gate)).
- **Fixes.** This skill does not repair flagged code — that is `android-feature-developer`'s job in the Fix stage.

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
- You are about to file a finding you cannot tie to one of the four categories in [§3](#3-what-may-be-filed--the-filing-gate).
- You are about to file a modernization or architectural-preference observation anywhere in the document.
- You are about to file against pre-existing code outside the resolved review scope.
- You are about to cite a standard ID without confirming it exists.
- You are about to apply a UI family that does not match the reviewed file's actual surface.
- The scope handed in by the command is missing or ambiguous — ask the caller rather than re-deriving it.

## Relationship with command, agents, skills

Responsibilities stay separated:

- **`commands/review-code.md`** — scope resolution, platform attribution, standards loading, invoking both agents, merging all platforms into one document.
- **`agents/android-code-reviewer.md`** — Pass A executor (correctness / style / standards).
- **`agents/android-performance-reviewer.md`** — Pass B executor (`AND-PERF-*`), also invoked by `/prepare-mobile-release` for the release perf sign-off.
- **This skill** — the Android review methodology both agents follow.
- **`skills/mobile-security-review/SKILL.md`** — the separate security lane, invoked by `/review-security`.
- **`skills/android-feature-implementation/SKILL.md`** — the Implement-stage methodology that fixes what this review files.
