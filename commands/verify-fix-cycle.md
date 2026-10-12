---
description: Verify a bug's current fix cycle once, as a whole — one consolidated checklist after every task is implemented and its automated checks passed (bug:<bug_key>).
argument-hint: bug:<bug_key>
---

Verify the **current fix cycle** of the bug named in `$ARGUMENTS` (`bug:<bug_key>`) in one session. Every task already ran its automated checks; what remains is the manual verification of the resulting behaviour — the whole cycle at once, never task by task. The checklist, its results and its freshness come from `scripts/bug-verification.ts` (`docs/bug-work-plan-contract.md` § *Consolidated verification*); never re-derive them in prose. Its commands always exit 0 and print one JSON object.

This command verifies; it never changes code, task state or the plan, never creates a new QA fix cycle — one comes only from a verified QA reopen through `/analyze-bug` — and never creates a git commit.

## 1. Resolve the bug and the repository root

`$ARGUMENTS` must be `bug:<bug_key>`; otherwise stop and ask for it. Resolve `TARGET_ROOT` exactly as `/implement-task` §2 does (`scripts/resolve-target-repo-root.ts`).

Verification needs no evidence source: the checklist is built from the approved plan and the task state, and the bug's evidence is its canonical snapshot (`docs/bugs/<bug_key>/bug-report.json`). Never ask for `--report` or `--qa-repo` here.

## 2. Generate, or resume, the checklist

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/bug-verification.ts" generate bug:<bug_key> --root "<TARGET_ROOT>"
```

| `outcome` | Do |
|---|---|
| `VERIFICATION_GENERATED` | A new checklist for the cycle. Continue. |
| `VERIFICATION_CURRENT` | The checklist is fresh: resume it. Results already recorded stay as they are; only the open items are walked. |
| `VERIFICATION_REGENERATED` | The earlier checklist was stale (`stale_reasons`: the code, plan, task state or cycle changed) and was replaced with a new run. Say so in one line, then continue. |
| `CYCLE_INCOMPLETE` | **Stop.** A task of the cycle is not complete; offer `next_command` (§5). |
| `PLAN_NOT_APPROVED` · `BUG_PLAN_MISSING` · `BUG_PLAN_INVALID` | **Stop** and give the `route`: the bug is (re)planned through `/analyze-bug`. |
| `AUTOMATED_TESTING_FAILED` · `REPOSITORY_UNAVAILABLE` · anything else | **Stop** and report `reason`. |

## 3. Show it, then ask once

Show only, without command output:

```
Automated verification complete:
- <command>: PASS
- regression test: PASS

Manual verification still required:
- <one line per open item>
```

Then ask:

```
Run Fix Cycle <n> verification now?
1. Yes — as: <your name>
2. Not now — keep the results so far
```

On "Not now", stop: rerunning `/verify-fix-cycle bug:<bug_key>` resumes this checklist from the artifact, not from memory.

## 4. Walk the checklist in one session

Walk the open items surface by surface, as the artifact groups them — each item on every surface listed under it; one surface never stands for another. Give each item in plain steps from its title and details; no implementation details unless the developer asks. Never ask how to verify a task: the checklist is the cycle's.

At the end, ask for the overall results in one go — for each item and surface: `pass`, `fail`, `blocked` or `not_run`, with notes and evidence where there are any. For a `fail`, ask where it goes back to: `implementation` (and which task of the cycle) when the approved Fix Design holds and the code is wrong, or `replan` when the Fix Design is wrong or the scope must materially change. When the artifact lists VERIFY-4 developer debt, ask whether the developer accepts it explicitly.

Write the results as a JSON array outside `TARGET_ROOT` (the session's scratch directory) — `[{"id":"V1","surface":"android","result":"pass","notes":"…","evidence":"…"}, …]`, with `"route"` and `"task"` on a failure — and record them:

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/bug-verification.ts" record bug:<bug_key> --root "<TARGET_ROOT>" --results "<results json>" --by "<name>" [--accept-debt]
```

Report a refusal verbatim. Never edit the artifact by hand.

## 5. Report and continue

Branch on the recorded `status`:

- **`passed`** —

  ```
  ✓ Fix Cycle <n> verified

  Next:
  Review the fix?
  ```

  Continue only on an explicit yes. Then invoke the Skill tool with `skill` set to `next_command.skill` and `args` set to `next_command.args`, verbatim — never a bare command name, and the developer never retypes it. If that invocation is unavailable or fails, show `next_command.display` as the command to run, and never guess another. The review re-runs every one of its own gates; continuing never replaces an approval (`docs/command-handoff.md`).
- **`failed`** — **do not proceed to review or the QA handoff.** Report exactly which item failed, on which surface, with its notes. An implementation failure offers `next_command` (the task to fix, re-implemented with the developer's explicit override of its completion) under the same Continue rule; a `replan` failure gives the `route`, `/analyze-bug`. No fix cycle is created here.
- **`incomplete`** — items are `blocked`, `not_run` or still pending, or developer debt is not accepted. The bug is not ready for review. Report what is open; rerunning this command resumes it.
