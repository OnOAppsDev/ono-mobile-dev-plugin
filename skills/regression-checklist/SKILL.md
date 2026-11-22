---
name: regression-checklist
description: The Pre-PR regression checklist methodology, vendored unchanged from the original Pre-PR skill (body and scripts/md_to_pdf_open.py byte-identical). Internal to /pre-pr, which verifies development, testing and a fresh internal review first, hands this skill the exact pull-request scope, and records the result — never invoked on its own.
user-invocable: false
---

# Pre-PR regression check — my changes only

Main question, the whole time:
**"Given only the code I changed, what existing behavior could I have accidentally broken?"**

The analysis is deep. **The output is tiny.** A long checklist does not get read, and a checklist nobody reads protects nothing. See Step 5.

Hard rules:
- Analyze ONLY the changes the developer introduced for this task. Not other developers' changes, and not the whole branch diff unless all of it is theirs.
- Inspecting the whole repo is expected, but only to trace outward FROM the changed code. A flow is in scope only if it reaches, depends on, or consumes something the developer changed. No concrete link means leave it out.
- If ownership of a change is unclear, say so. Do not assume it is theirs.
- No generic QA scenarios.
- Do NOT modify code, `.gitignore`, project config or docs.

## Step 0 — Define scope

Pick "my changes" in this priority order:
1. Commits/SHAs the user gave (arguments).
2. The latest commit, if the user asked for it.
3. The user's commits since the task branch diverged from the target branch (`git merge-base <target> HEAD`, then `git log --author="$(git config user.email)" <merge-base>..HEAD`). Target branch: argument, else `origin/HEAD`, else `main`/`master`/`develop`.
4. If the range mixes authors, use `git log`, `git blame` and commit metadata to separate the user's hunks.

Include uncommitted/staged changes only if the user says they belong to the task; mention them either way.

**Ask when the scope is not obvious.** If the branch is long-lived (more than ~50 commits ahead of the target, or the user is on `main`/`master`/the target itself), do NOT analyze everything since divergence. Show the user their most recent commits (hash, date, subject) and ask which are "this task" before doing anything else.

Tell the user in two or three lines: which commits are in scope, and what was excluded (other authors, other tasks, unclear ownership). Then continue.

## Step 1 — Understand my change
What behavior changed; which files/functions/classes; which code is local to the task and which is shared.

## Step 2 — Trace the impact outward
For every meaningful function, class, component, model, state object, config value or utility changed, find where it is used across the repo and follow callers until you reach a user-visible flow or entry point. Example: a changed `getProfilePermissions()` also feeds adult profile switching and session restore, so those are in scope even though their files were not edited.

## Step 3 — Impact map
For each changed piece, note only what actually applies: callers (direct/indirect), shared paths, reused components, other screens, other user/profile types, other entry points, navigation, background/resume, deep links, push entry points, cached/offline paths, retry/error paths, feature flags, platform branches, auth/session branches, subscription/permission branches. Each needs a concrete reason tied to a changed symbol.

## Step 4 — Hunt for hidden regressions
Check: shared functions changed for a local fix; changed conditions/defaults/guards/early returns; state (first launch, logout/login, profile switch, restart, stale/restored); data (nil, empty, old persisted data, partial responses, enums); async/timing (races, duplicate callbacks, cancellation, retry, ordering); navigation (back, tabs, deep links, modals, restore). Only what touches the changed code.

Steps 1–4 are your working notes. **Do not paste them into the deliverable.**

## Step 5 — The checklist: SHORT, or it is useless

Hard limits. If you exceed them, cut.
- **One A4 page.** Never more.
- **Max 8 test items in total.** If you have more, keep the ones most likely to be broken and drop the rest. Fewer is better. Do not pad.
- **One line per item**, about 20 words: *where / what to do → what should happen.* No "preconditions", no numbered steps, no "why this is affected" paragraphs (the item itself must make the link obvious).
- **Priority:** 🔴 Must test (direct fix + real consumers of changed shared code), 🟠 Should test (realistic indirect risk). **Omit 🟡 low risk entirely.**
- **"Watch out":** max 3 one-line risks in the code itself, each with `file:line`. Only real ones, not style or hypotheticals. (Critical areas = where a mistake would hurt most. Watch out = suspicious code you actually found. Do not repeat the same point in both.)
- **"What changed":** 2 lines max, plain words. What behavior is different now, not which files. Written so the developer sees the point of the tests below.
- **"Critical areas":** max 3 lines. The shared code or flows where a mistake would hurt most, each as `area — why it is exposed (what changed there)`. These come from your impact map (Steps 2–3); pick the 3 with the biggest blast radius.
- **Left out on purpose:** the files list, automated-test suggestions, edge-case sections, error-path sections, method notes. If the developer wants more detail, they will ask in chat.
- Plain words. A developer should understand every line in five seconds.

Exact template (keep this shape):

```
# Pre-PR checklist — <task name> (<short commit hashes>)

## What changed
<1–2 lines: what behaves differently now>

## 🎯 Critical areas
- <area> — <why it is exposed>

## 🔴 Must test
- [ ] <where / what to do> → <expected>
- [ ] ...

## 🟠 Should test
- [ ] ...

## ⚠️ Watch out
- <one-line risk> (`file:line`)

---
Local only. Do not commit or include in the PR.
```

## Step 6 — Write it OUTSIDE the project (never inside it)

1. `OUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pre-pr.XXXXXX")"` and write `$OUT_DIR/regression-checklist.md` (template above).
2. The checklist is a throwaway for the developer's eyes. **Never save it in the project, not even temporarily.** If the developer wants to keep it, they copy it themselves.
3. Never `git add`, commit or push it. Never edit `.gitignore` or any config. Never reference it from code or docs.

## Step 7 — Build the PDF (do not open it yet)

Use the base directory shown when this skill loaded (`python3`, or `python` on Windows):

```
python3 "<skill base directory>/scripts/md_to_pdf_open.py" "$OUT_DIR/regression-checklist.md" --no-open
```

- Exit 0: done, the PDF is next to the markdown.
- Exit 5 (more than one page): cut items until it fits, then run again. Do not hand over a multi-page checklist.
- Exit 3 (no Chromium-based browser) or 4 (PDF failed): say so plainly and use the `.md` as the deliverable in Step 9. Never skip the PDF silently. `PRE_PR_BROWSER` can point at a browser executable.
- The script refuses to run inside a git repository.

## Step 8 — Final safety check (mandatory, run fresh)

1. `git status --short` in the repo.
2. Confirm `regression-checklist.*` is NOT staged, NOT untracked inside the repo, NOT among modified files (`git status --short --ignored | grep regression-checklist` returns nothing).
3. If it shows up in the repo, move it outside and re-check.
4. Confirm `.gitignore` is unmodified.

If any check could not be run, say so. Never claim it passed without running it.

## Step 9 — Open the PDF for the developer, as the LAST action

Only now, after the safety check passed, open it. Never wait for the developer to ask.

```
python3 "<skill base directory>/scripts/md_to_pdf_open.py" "$OUT_DIR/regression-checklist.md" --open-only
```

(If there is no PDF, open the `.md` instead: `open` on macOS, `xdg-open` on Linux.)

Then reply in chat with **at most 5 lines**: the scope used, the count of 🔴/🟠 items, the single most important risk, that the PDF was opened (with its path), and exactly this line:
`Regression checklist created locally only — not staged, not committed, and not part of the PR.`
