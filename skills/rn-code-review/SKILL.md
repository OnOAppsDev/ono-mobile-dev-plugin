---
name: rn-code-review
description: Methodology for reviewing React Native code changes against org standards. Used by /review-code, scoped to files attributed to the react-native platform, via the rn-code-reviewer and rn-performance-reviewer agents and the code-review template.
---

## Methodology

This skill runs only against files the command has attributed to the react-native platform — for a mixed-repo review, iOS/Android/React-web-attributed files are handled by their own platform's code-review skill in parallel, and findings are merged into one `templates/code-review-template.md` with `[platform]` tags, not produced as separate documents.

1. **Resolve scope.** Use the react-native-attributed file list/diff handed in by the caller. If this is a whole-repo audit rather than a diff review, state that mode explicitly at the top of the output.

2. **Triage changed files into standards-relevant buckets.** Map each changed file to zero or more of: `RN-*` (any component/hook/TS file), `API-*` (endpoint/service files — the Universal Principles in `rn-api-service-layer.md` always apply; its RTK Query section only when `repo-analyst` detected RTK Query as the data-fetching layer), `STATE-*` (slices/selectors — the Universal Principles in `rn-state-management.md` always apply; its Redux Toolkit section only when `repo-analyst` detected Redux Toolkit as the state-management library), `I18N-*` (files with user-facing copy), `A11Y-*` (screens/interactive components), `ARCH-*` (folder placement, layering, composition, reuse), `NAV-*` (navigator/route files). Files matching no bucket are marked out of scope and skipped — keep the review free of manufactured noise, mirroring `mobile-security-review`'s triage-and-skip step.

3. **`rn-code-reviewer` walks each bucketed file** against its standards section's checklist, recording pass / fail / not-applicable per bullet, noting the standard ID for anything that fails.

4. **`rn-performance-reviewer` independently audits the same scope** against `standards/react-native/rn-performance.md`'s `RN-PERF-*` rules — this step runs separately from step 3, not as a sub-step of it, so a perf-only change doesn't get miscategorized as a correctness finding.

5. **Merge both agents' findings, tagged `[react-native]`, into the single `templates/code-review-template.md`** shared across all platforms touched by this review. Do not produce a separate document per platform.

6. **Assign severity** using this rubric, consistent with the security lane:
   - **Blocking** — breaks functionality or violates a hard rule (e.g. a class component in new code, an untyped exported function, a missing `keyExtractor` causing incorrect list behavior).
   - **Major** — likely to cause a real bug or meaningfully hurts maintainability (e.g. business logic inside a component instead of a hook/service, a non-normalized error shape leaking to the UI).
   - **Minor** — a standards deviation without immediate functional risk (e.g. hardcoded copy instead of an i18n key, a missing memoized selector).
   - **Nit** — style/hygiene suggestion (e.g. inconsistent naming, a missing prop-typing default).

7. **Write concrete remediation per finding** — a specific fix pointer, not just a restatement that something is wrong.

8. **Cite the standard ID** for every finding so it traces back to the specific standards doc.

9. **Populate `templates/code-review-template.md` in full**, including explicit "None found" for sections with no issues, and an overall verdict (Approved / Approved with follow-ups / Blocked).

10. **Exclude security and out-of-scope performance findings.** Security issues defer to `mobile-security-review`'s methodology; anything outside `RN-PERF-*`'s scope stays with `rn-code-reviewer`, not `rn-performance-reviewer`.
