---
description: Pre-PR regression checklist for bug or feature work — after development, developer testing and a fresh internal review — as a one-page PDF kept outside the repository, with completion evidence.
argument-hint: [bug:<bug_key> | feature:<feature>] [--base <target branch>]
---

**Node.js preflight — first, before any plugin script.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/node-preflight.mjs"`. If it exits non-zero, stop: show the developer its `message` verbatim and run nothing else — this command's helper scripts cannot run on that Node.js (README § Requirements).

The Pre-PR regression check: **"Given only the code this pull request changes, what existing behavior could it have broken?"** — answered as a short checklist of at most eight focused checks, on one PDF page, for the developer to test before the pull request is opened. This plugin owns it: this command checks that the work is ready for it, gives the vendored `regression-checklist` skill (the original Pre-PR skill, unchanged) the exact scope, and records the result. The Platform Guardian then commits, pushes and opens the pull request; it no longer runs a Pre-PR of its own.

Nothing this command produces is ever inside the repository: the checklist and its PDF are kept in the plugin's persistent data directory, never staged, never committed, never part of a pull request.

1. **Resolve the work** from `$ARGUMENTS`: `bug:<bug_key>` or `feature:<feature>`. If neither is given, ask once which work this is. Resolve `TARGET_ROOT` exactly as `/implement-task` §2 does (`scripts/resolve-target-repo-root.ts`).
2. **Gate:**

   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/pre-pr.ts" gate <work> --root "<TARGET_ROOT>" --data "${CLAUDE_PLUGIN_DATA}" [--base "<target branch>"]
   ```

   It is read-only, always exits 0 and prints one JSON object. Act on `outcome`:

   | `outcome` | Do |
   |---|---|
   | `PRE_PR_READY` | Continue with step 3. With several Task Breakdowns for the feature, pass the one meant as `--doc <path>` to every helper call here (the internal review's breakdown is used when it still matches).  When `stale_reasons` is not empty, say in one line why the earlier Pre-PR no longer holds. |
   | `PRE_PR_FRESH` | **Stop — nothing to rerun.** An unchanged Pre-PR is already recorded for exactly this code and review. Show its `pdf_path` and `counts`, and go to step 5 (which ends with its `pre_pr_line`). |
   | `PRE_PR_PDF_MISSING` | The recorded checklist is still valid; only its PDF is gone. **Do not analyse again:** run `regenerate.command`, then `regenerate.then`, and report the PDF path. If the rebuild fails, say why (step 3's dependency rule). |
   | `PRE_PR_TESTING_REQUIRED` · `PRE_PR_REVIEW_MISSING` · `PRE_PR_REVIEW_STALE` · `PRE_PR_BLOCKING_FINDINGS` | **Stop** and say why in one line. Pre-PR runs only after development, developer testing and a fresh internal review with no unresolved Blocking finding. Offer `next_command` under the Continue rule. |
   | `PRE_PR_DEPENDENCY_MISSING` | **Stop.** The PDF is mandatory. Explain each entry of `missing` and how to provide it (Python 3; Chrome, Edge, Brave or Chromium — or `PRE_PR_BROWSER` pointing at one). Do not produce a Markdown-only checklist and do not mark Pre-PR complete. |
   | `PRE_PR_DATA_DIR_IN_REPOSITORY` · `PRE_PR_DATA_UNRESOLVED` · any other | **Stop** and report `reason`. |

3. **Run the checklist.** Invoke the Skill tool with `skill` = the gate's `skill.qualified` (the `regression-checklist` skill). Its Steps 0–9 run as written. Give it, as the developer's explicit scope (its Step 0, rule 1), the gate's `scope` verbatim:

   > Scope for this Pre-PR: the pull request from `<scope.branch>` to `<scope.target>` — changes since merge base `<scope.merge_base>`: the commits `<scope.commits>`, and the staged, unstaged and untracked changes to `<scope.uncommitted>`, **which belong to this task**. Files in scope: `<scope.files>`. Nothing else is in scope.

   The work's internal review record (`review.record_path`) may inform where to look; the checklist is still built from the code. **Note the absolute paths the skill printed** — the checklist it wrote in its Step 6 and the PDF its Step 7 printed. Shell variables (such as the skill's `$OUT_DIR`) do not survive from one Bash call to the next, so step 4 uses those printed paths, never a variable.

   **The PDF is mandatory.** If the skill's Step 7 ends with exit 3 (no browser) or 4 (the PDF could not be built), the skill itself goes on to offer the Markdown file and ends with its fixed "created locally only" line. **That is not completion here:** override it plainly — `✗ Pre-PR not complete: the one-page PDF could not be built (<exit code and the script's message>). <how to fix it>.` — do not run step 4, and never present the Markdown checklist as the result — a Markdown checklist alone never completes this command. Exit 5 (more than one page) is handled by the skill: it cuts items and builds again.
4. **Record it**, with the absolute paths from step 3 written out in full:

   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/pre-pr.ts" record <work> --root "<TARGET_ROOT>" --data "${CLAUDE_PLUGIN_DATA}" \
     --checklist "<absolute path of regression-checklist.md>" --pdf "<absolute path of regression-checklist.pdf>" [--base "<target branch>"]
   ```

   It refuses — and records nothing — a checklist or PDF inside any git repository, a checklist with more than eight checks or without the template's shape, and a PDF that is not exactly one page. On `PRE_PR_RECORDED` it has copied both into the plugin's persistent data directory: report `pdf_path` (the developer can reopen it there later — the copy the skill opened in its temporary folder may be removed by the system), the 🔴/🟠 `counts`, and the skill's fixed line. On a refusal, report `reason` verbatim, say `✗ Pre-PR not complete`, and never repeat the skill's closing line as if it were.
5. **Next.**
   - **Bug work:** offer `next_command` — the QA handoff (`/create-dev-qa-notes bug:<bug_key>`, every gate and approval of which is unchanged) — in one short message: `✓ Pre-PR checklist ready (<must> 🔴 / <should> 🟠). Next: prepare the QA handoff. Continue?`
   - **Feature work:** the work is ready for a pull request. Show the pull request description this plugin generates, for the developer to use as is:

     ```
     node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/pr-readiness.ts" describe --root "<TARGET_ROOT>" --work <work> --data "${CLAUDE_PLUGIN_DATA}" [--base "<target branch>"]
     ```

     Print its `description_markdown` verbatim and list its `warnings` (missing or inaccessible references, planning documents not yet in the pull request). Then: `Ready for PR. Commit, push and the pull request are done by the Platform Guardian's session closer — say "close the session".`
   - Either way, add one line while the Platform Guardian still carries its own pre-PR step: `If the session closer offers its own pre-PR check, answer "skip" — this Pre-PR is done.`
   - **Always end with the result line**, verbatim and alone on the last line: the `pre_pr_line` that `record` (or the gate's `PRE_PR_FRESH`) returned — `PRE_PR {"contract":1,"work":…,"head":…,"must":…,"should":…,"watch":…,"topRisk":…,"pdf":…}`. It is derived from the recorded Pre-PR, for a consumer that reads command output; the authoritative, machine-readable answer stays the readiness contract (`pr-readiness.ts check --contract 1`, its `pre_pr`). Never print it for a Pre-PR that was not recorded.

   Chain only on an explicit yes, invoking the Skill tool with `next_command.skill` and `next_command.args` verbatim, or showing `next_command.display` when that is unavailable (`docs/command-handoff.md`). Continuing is never an approval.

This command never commits, stages or pushes, never edits code, `.gitignore` or configuration, and never writes inside the repository. It approves nothing.
