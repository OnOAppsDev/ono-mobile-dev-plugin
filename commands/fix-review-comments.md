---
description: Address outstanding code review comments.
argument-hint: [review-notes-path]
---

Address outstanding review comments from a completed review notes file.

1. Read `$ARGUMENTS` as the path to a completed review notes file — typically a filled-in `templates/code-review-template.md` or `templates/security-review-template.md`, but any similarly structured findings document is acceptable. A mixed-repo review may contain findings across multiple platforms, each tagged `[platform]`.
2. Apply the `mobile-debugging` skill methodology directly: group findings by severity, and for each Blocking or Major finding, reproduce and root-cause it before touching any code.
3. Determine which platform owns each finding — from its `[platform]` tag if present, otherwise from its file path via the same file-attribution rule `repo-analyst` uses.
4. Hand each root-caused fix to the matching platform's feature-developer agent — `rn-feature-developer` / `ios-feature-developer` / `android-feature-developer` / `react-feature-developer` — to implement: a minimal fix addressing the root cause, not a workaround or an unrelated rewrite. Group findings by platform first when a fix pass spans multiple platforms.

   - **Readiness gate — React.** Before handing a fix to a platform's feature-developer agent, check that agent for a "not yet authored / structure-only placeholder" marker. If present, **do not abort the pass and do not route the fix to the placeholder.** Leave that platform's findings unfixed, fix every authored platform's findings in full, and report each skipped finding through step 6 with the reason "React lane not yet authored" — so it surfaces as explicitly unresolved rather than silently dropped or falsely closed. An excluded lane is a **declared gap, never a silent pass**, and this exclusion is intended behavior rather than a routing failure. (When that lane is later authored and the marker is gone, it participates automatically.) React (web) is the only lane still gated — `react-native`, `ios` and `android` are authored.
5. Re-verify each fix against the standard ID the originating finding cited, confirming the violation is actually resolved.
6. If a finding can't be fixed as-is (e.g. it needs a larger refactor than this pass allows), say so explicitly rather than forcing a partial or incorrect fix.
