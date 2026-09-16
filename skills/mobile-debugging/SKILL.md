---
name: mobile-debugging
description: Methodology for root-causing bugs and reviewer feedback and applying a minimal fix, across any platform. Used by /fix-review-comments, delegating the actual code change to the relevant platform's feature-developer agent.
---

## Methodology

1. **Parse the review notes file** (`[review-notes-path]`) — identify which template produced it (code review, security review, or a plain bug report) so findings are read in their original structure. A mixed-repo review may contain findings across multiple platforms, each tagged `[platform]`; a plain bug report has no such tag.

2. **Group findings by severity** and address Blocking first, then Major. Minor/Nit are handled after, and explicitly deferred (not silently skipped) if scope/time doesn't allow.

3. **Reproduce and root-cause each finding before touching code.** Understand why the issue happened, not just where.

4. **Determine which platform owns each finding**, using the same file-attribution rule `repo-analyst` uses (a file belongs to `ios` if under an iOS project tree or has extension `.swift`/`.m`/`.mm`/`.h`; to `android` if under `android/` or extension `.kt`/`.java`; to `react` if in a React-web workspace; otherwise `react-native`) — either from the finding's own `[platform]` tag if present, or from its file path.

5. **Delegate the actual code change to `feature-implementer`**, run against the resolved platform's implementation lane, passing along the standard ID the finding cited so the fix is written consistent with that standard rather than as an ad hoc patch. A mixed-repo fix pass groups findings by platform first, then runs this delegation once per platform group.

6. **Re-verify the fix against the originating finding** — confirm the specific condition the reviewer flagged no longer holds, not just that the code compiles/runs.

7. **Note anything that couldn't be fixed as-is** (e.g. it needs a larger refactor than this pass allows) instead of forcing a fix that technically resolves the finding but violates another standard.

## Output format

A short fix log: one entry per finding addressed, stating the root cause, the fix applied, and the file(s) changed. Findings that couldn't be resolved as proposed are listed separately with why, rather than forced into a bad fix.

## Constraints

- **Root-cause over workaround**: if the only available fix would just suppress a symptom (e.g. swallowing an error, adding a type-cast to silence a lint rule), say so explicitly and propose the real fix instead of taking the shortcut.
- Don't expand scope beyond what the review flagged — unrelated cleanup belongs in a separate change.
- Don't re-litigate a finding's validity; if a finding looks wrong, say so in the fix log rather than silently ignoring it.
