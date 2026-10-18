# Command handoff — the next command and how it is continued

A Bug Flow helper that knows what comes next returns it as data, in one shape, built only by `scripts/next-command.ts`:

```json
{ "skill": "ono-mobile-dev-plugin:implement-task", "args": "bug:YET-1052 T1", "display": "/implement-task bug:YET-1052 T1" }
```

- `skill` is the command fully qualified with the plugin's name, read from `.claude-plugin/plugin.json`. A plugin command is invoked through the Skill tool only by this qualified name; the bare name (`implement-task`) is not a skill Claude Code knows, which is what failed with "Args from unknown skill".
- `args` are the command's arguments, exactly — never rebuilt, reordered or extended. A Bug command never carries an evidence source (`--report`, `--qa-repo`): once `/analyze-bug` persisted the canonical evidence snapshot, every later command resolves it.
- `display` is the slash command a developer can copy and run.

Which helper returns it:

| Helper | Field | Next command |
|---|---|---|
| `analyze-bug.ts start` → `BUG_PLAN_APPROVED` | `next_command` | `implement-task bug:<key> <first unfinished task>`; once the cycle's tasks are done, `verify-fix-cycle bug:<key>`, then `review-code --bug <key>` once that passed |
| `bug-implementation.ts status` | `next_command` | the cycle's next unfinished task; then `verify-fix-cycle bug:<key>`; then `review-code --bug <key>` |
| `bug-review.ts context` → `BUG_TASK_STATE_MISSING` | `next_command` | `implement-task bug:<key> <first task of the cycle>` |
| `bug-review.ts context` → `BUG_VERIFICATION_REQUIRED` | `next_command` | `verify-fix-cycle bug:<key>` |
| `bug-verification.ts check` | `next_command` | `review-code --bug <key>` once passed; `verify-fix-cycle bug:<key>` while missing, stale or incomplete; the failed task when an item failed in implementation |
| `bug-review.ts record` → `BUG_REVIEW_RECORDED` | `next_command` | `create-dev-qa-notes bug:<key>` |
| `qa-handoff-gate.ts check` → `HANDOFF_BLOCKED` | `next_command` | the first blocker's route, when it needs no placeholder filled |

A route that still has a placeholder (`/analyze-bug <bug-ref>`) is never turned into a next command: the developer supplies it.

The same module builds subagent types: `bug-implementation.ts gate` returns `delegate.subagent_type` (`<plugin>:feature-implementer`) and `analyze-bug.ts start` returns `planner.subagent_type` (`<plugin>:feature-architect`) whenever plan content is to be written.

## Continuing

1. **Offer it in one short message** — what finished, what is next, `Continue?`. For example:

   ```
   Bug plan approved.
   Next: implement Cycle 1 (T1).
   Continue?
   ```

2. **Chain only on an explicit yes.** Silence, an unrelated reply, or an approval given for something else is not a yes.
3. **Invoke the Skill tool** with `skill` = `next_command.skill` and `args` = `next_command.args`, verbatim. Never a bare command name, never args rebuilt from memory, and the developer never retypes anything.
4. **Fallback.** If the Skill tool is unavailable or the invocation fails, show `next_command.display` as the command to run. Never guess another skill name or another form.

Chaining is a convenience, never an approval. The invoked command re-runs every one of its own gates and preconditions — approval, evidence, task state, branch — exactly as if the developer had typed it. A human approval gate (plan approval, QA handoff approval, a commit) is never skipped or implied by continuing.
