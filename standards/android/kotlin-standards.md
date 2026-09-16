# Kotlin Standards

## Purpose & Scope

These standards apply to all native Android application code written in Kotlin, implemented by `feature-implementer` via `/implement-task` (using the `android-feature-implementation` skill) and reviewed by `code-reviewer` via `/review-code`. They cover Kotlin language and style: null-safety, type usage, language constructs, coroutines/Flow usage, and static analysis. Architecture, UI-framework, and threading-topology concerns have their own dedicated Android standards documents. Each bullet below carries a stable `AND-KT-*` ID so review findings and implementation summaries can cite the exact rule. This list is a baseline, not exhaustive — follow the repository's detected Kotlin style and language level first, and use judgment for cases not covered here.

## Null Safety & Types

- `AND-KT-NULL-1` No non-null assertion `!!` in new or modified code except where a preceding check provably guarantees non-null and a comment explains why; prefer `?.`, `?:`, `requireNotNull`/`checkNotNull` with a message, or a smart-cast after an explicit guard.
- `AND-KT-NULL-2` Nullability is modeled in the type (`T?`) rather than using sentinel values (`-1`, `""`, `EMPTY`) to mean "absent".
- `AND-KT-NULL-3` Platform types crossing from Java/Android framework APIs are given an explicit nullable/non-null Kotlin type at the boundary rather than left as `T!` and dereferenced blindly.
- `AND-KT-TYPE-1` Public/`internal` declarations that cross a module or layer boundary have explicit types (parameters and return) rather than relying on inference across the boundary.
- `AND-KT-TYPE-2` No unchecked or unsafe casts (`as`) to force a mismatched type past the compiler; use `as?` with a null branch, a `when`/`is` smart-cast, or fix the underlying type.
- `AND-KT-TYPE-3` Visibility is as narrow as possible — declarations not part of a module's public surface are `private`/`internal`, not left `public` by default.

## Language Constructs

- `AND-KT-SEALED-1` Closed sets of states/results (UI state, domain results, screen events) are modeled with `sealed class`/`sealed interface` or `enum`, and consumed with an exhaustive `when` (no `else` branch that would silently swallow a new variant) — only where this matches the repository's existing convention.
- `AND-KT-SEALED-2` Value-holder types are `data class`es with immutable `val` properties by default; `var` is used only where mutation is a deliberate, local requirement.
- `AND-KT-SEALED-3` Extension and utility functions are pure and side-effect-free relative to their receiver; a function that mutates external state or performs I/O is named and placed so that effect is obvious, not hidden behind an innocuous extension.
- `AND-KT-SEALED-4` `object`/`companion object` singletons do not hold mutable app state or `Context` references that outlive their intended scope.

## Coroutines & Flow

- `AND-KT-COROUTINE-1` Coroutines are launched in a lifecycle- or DI-provided scope (`viewModelScope`, `lifecycleScope`, an injected scope) — never `GlobalScope` or an ad-hoc unscoped `CoroutineScope()` in new code.
- `AND-KT-COROUTINE-2` The dispatcher for off-main work is obtained through the repository's dispatcher-injection convention (an injected `CoroutineDispatcher`/dispatcher-provider) rather than hardcoding `Dispatchers.IO`/`Default` where the project injects them, so the code stays testable.
- `AND-KT-COROUTINE-3` Suspend functions are main-safe: a suspend function that does blocking or CPU-heavy work switches dispatcher internally (`withContext`) rather than requiring every caller to remember to.
- `AND-KT-COROUTINE-4` Structured concurrency is respected — child coroutines are not detached from their parent scope, and cancellation is cooperative (blocking calls are cancellable or wrapped so cancellation propagates).
- `AND-KT-COROUTINE-5` A cold `Flow` is collected once per consumer with a clear owner; converting between `Flow`, `LiveData`, callbacks, and Rx is avoided unless there is a specific interop need, and the replay/buffering behavior of any `SharedFlow`/`StateFlow` is chosen deliberately, not left at an accidental default.
- `AND-KT-COROUTINE-6` Exceptions inside coroutines are handled (per-launch `try/catch`, a `CoroutineExceptionHandler`, or a `Result`/`runCatching` boundary) rather than allowed to crash the scope or vanish silently.

## Lint & Static Analysis

- `AND-KT-LINT-1` The project's configured Kotlin static-analysis and formatting tools (ktlint, detekt, Android Lint, Spotless — whichever the repo uses) pass with no new warnings before a change is sent for review.
- `AND-KT-LINT-2` Suppressions (`@Suppress`, ktlint/detekt disable comments, `lint` baseline additions) carry a justification comment; a bare suppression to silence a real finding is not acceptable.
- `AND-KT-LINT-3` No new use of an experimental/opt-in API (`@OptIn`, `@ExperimentalXxx`) without a justification and confirmation the project already depends on and opts into it.

## References

- Kotlin coding conventions (kotlinlang.org) and the Android Kotlin style guide.
- This document is a living baseline; flag standards gaps found during implementation or review rather than working around them silently.
- Threading topology and reactive-stream architecture beyond language usage live in `standards/android/android-architecture.md` and `standards/android/android-performance.md`.
