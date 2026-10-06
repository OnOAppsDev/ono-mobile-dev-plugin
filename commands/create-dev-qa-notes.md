---
description: Write QA handoff notes for a completed feature — or, with bug:<bug_key>, a gated Bug QA handoff handed to QA through one explicit approval.
argument-hint: [feature-name | bug:<bug_key> [--qa-repo=<path> | --report=<path>]]
---

Write QA handoff notes for the completed feature named in `$ARGUMENTS`, and write them to disk under the target repository.

## 1. Resolve the feature identity from `$ARGUMENTS`

Treat `$ARGUMENTS` as the feature name/slug. If it is missing or too vague to identify exactly one feature, **stop and ask** — do not guess.

## 2. Resolve one authoritative repository root (via the helper)

Run the plugin's deterministic helper — do not reimplement worktree logic here:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-target-repo-root.ts" "<candidate>"
```

(`bun` works too.) `${CLAUDE_PLUGIN_ROOT}` is substituted inline in this command's text at load time, so it expands to the installed plugin's absolute root before you run the command. `<candidate>` is the developer-supplied repo path if given, otherwise the current working directory. Read the JSON on stdout:

- Exit `0` and `ok: true` → use `targetRoot` as the single repository-root authority for the rest of this command (`TARGET_ROOT`).
- Exit `1` (path not found), exit `3`, `ok: false`, or `targetIsWorktree: true` → **stop and report.** Never write a handoff into a `.claude/worktrees/…` path.

Do not trust ambient CWD as the root on its own — the helper's `targetRoot` is authoritative.

## 3. Locate the Task Breakdown and read its frontmatter

Locate this feature's **Task Breakdown** under `TARGET_ROOT` (where the repo keeps design docs — check `docs/` conventions and the repo root; the breakdown is the generated feature artifact, never `templates/task-breakdown-template.md`). If you cannot locate exactly one Task Breakdown for the feature, **stop and ask the user for its path** — do not guess filenames.

Read its frontmatter for the values this handoff carries: `feature`, `platform`, `device_type`, `dd_link`. Carry them **verbatim** — the platform is confirmed upstream and is never re-detected here. Confirm `dd_link` resolves to a file inside `TARGET_ROOT`; if it does not, report it and continue with the link recorded as-is rather than inventing a path.

## 4. Gather what was implemented

**Read the persisted implementation record first.** `/implement-task` records what each task actually produced through the task-state store, so this no longer depends on a session transcript:

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" read \
  --root "<TARGET_ROOT>" --feature "<feature>" --breakdown "<absolute Task Breakdown path>"
```

It always exits 0 and prints one JSON object; branch on `status`. See `docs/task-state-contract.md`. For every task recorded `complete`, the record carries `filesChanged`, `standardIds`, `validation` and `acceptanceCriteria` — that is the source for the handoff's screens/flows, the applied `I18N-*`/`A11Y-*` IDs, and the edge cases actually exercised. Note any task that is not `complete`, or whose completion is `stale`, under Known Limitations rather than describing it as delivered.

**Read the accessibility dimension from the same records — never reconstruct it.** Each task carries `accessibilityStatus`, `accessibility` and `verificationDebt`:

- `accessibilityStatus: "applicable"` → the task recorded cited rules and mechanical checks. Report the cited IDs and the checks' results.
- `accessibilityStatus: "notApplicable"` → report the recorded reason verbatim (a `tv` device type, or a surface with no accessibility relevance). Do not re-argue the decision.
- `accessibilityStatus: "notRecorded"` → the task predates the accessibility contract, or never recorded it. Say exactly that. **This is never reported as "not applicable" and never as a pass** — nothing is known, and a handoff that implies otherwise is worse than one that admits the gap.
- `qaVerificationDebt` → every entry is verification the plugin could not perform and QA now owns. Carry each into the handoff's Pending Verification section with its `domain`, `ruleId`, `requiredVerification`, `whyNotAutomatable` and `owner`. Entries are `pending` by construction; the plugin never records them discharged.
- `developerVerificationDebt` → developer tests that could not be written or run (`domain: "developer-testing"`, `VERIFY-4`). That obligation stays with the developer: it is **never listed as owed to QA** and never goes in Pending Verification. Note it under Known Limitations as outstanding developer verification. Read the two lists from the store rather than filtering `verificationDebt` yourself.

These come from the persisted store, so they survive a lost session. Do not ask `feature-implementer` to re-derive accessibility evidence that the store already carries, and do not infer a VoiceOver or TalkBack pass from a recorded mechanical check — `VERIFY-2` forbids it.

**Then fill the gaps from `feature-implementer`.** The task breakdown carries exactly one confirmed platform, so invoke the agent with the shared `platform-implementation` methodology and that platform's lane for anything the record does not hold — narrative summary, screens/flows in user-facing language, and the build/install instructions.

| Breakdown `platform` | Agent | Shared methodology | Platform lane | Status |
|---|---|---|---|---|
| `react-native` | `feature-implementer` | `platform-implementation` | `rn-feature-implementation` | active |
| `ios` | `feature-implementer` | `platform-implementation` | `ios-feature-implementation` | active |
| `android` | `feature-implementer` | `platform-implementation` | `android-feature-implementation` | active |
| `react` | `feature-implementer` | `platform-implementation` | `react-feature-implementation` | active |

**Exactly one platform lane is ever loaded.** The agent and the shared methodology are
platform-independent; the lane resolved from the finding's platform is the only source of
platform content, and no other platform's lane or standards may be loaded.

**Readiness gate (any platform).** Before invoking, check the **resolved platform lane** for the placeholder marker — a frontmatter `description` ending "not yet authored, currently a structure-only placeholder" **and** a `## Status: Not yet authored` heading. Match on those markers only, never on the phrase appearing in ordinary prose (an authored skill may legitimately mention "structure-only placeholder" when telling an agent to stop if a *standards* file is one). If present, **stop with: "Platform QA-handoff methodology for `<platform>` is not yet authored"** — do not invoke a placeholder lane and do not write build/install instructions for a lane whose methodology does not exist. The gate is on the lane, not the agent: `feature-implementer` and `platform-implementation` are platform-independent and always authored, so a lane's readiness is the only thing that can gate a route. (When a lane is later authored and the marker is gone, the route opens automatically.) **No lane is gated today** — `react-native`, `ios`, `android` and `react` are all authored. The gate is retained because it is the invariant, not a note about any one platform: a lane added or reverted to placeholder state is caught here automatically, with no edit to this command.

If the store reports nothing recorded **and** no record of what was implemented can be found from the agent, **say so explicitly and write nothing** — a handoff of guessed test steps is worse than no handoff.

## 5. Write the handoff content

Apply the shared `mobile-testing-and-qa-handoff` skill methodology via `feature-implementer`, and have it populate `templates/qa-handoff-template.md` in full — including the i18n/RTL and accessibility check sections (citing the actual `I18N-*`/`A11Y-*` standard IDs applied during implementation, per `standards/shared/qa-handoff.md`'s `QA-A11Y-1`) and the platform-specific Build / Install / Testing Instructions section, one subsection per platform the feature touches.

Populate the frontmatter from step 3: `feature`, `platform`, `device_type`, `dd_link`, `task_breakdown_link` (the breakdown resolved in step 3), `status: draft`, `generated_by: create-dev-qa-notes`, `date`. Always write `status: draft` — a human flips it to `ready-for-qa` after reviewing the notes. Do not add a `doc_schema_version`; the QA handoff is not one of the versioned kinds in `docs/planning-doc-contract.md`.

**Write it as delimited frontmatter** — the file opens with `---`, the block closes at the next line that is exactly `---`, and `# QA Handoff` follows it. Not a fenced ` ```yaml ` block: these fields exist to be read by tooling, and a fence is document content. This is the `delimited` encoding `docs/planning-doc-contract.md` resolves first when both forms could match.

## 6. Decide the existing-file strategy

The target path is `TARGET_ROOT/docs/qa/{FEATURE-NAME}-qa-handoff.md`. If a handoff already exists there for this feature, ask the developer how to handle it — `Overwrite` / `Update` (merge the new findings into the existing notes) / `Preserve` (write to a new filename) / `Version` (rename the existing file, e.g. append `-v1`, before writing). **Never blindly overwrite an existing QA handoff** — it may already be in QA's hands.

## 7. Write the file

Create `TARGET_ROOT/docs/qa/` if it does not exist, and write the completed document to the path chosen in step 6, per `QA-FILE-1`. Verify the resolved path is inside `TARGET_ROOT` before writing — any path that escapes it or resolves under `.claude/worktrees/…` → stop and report.

## 8. Record the handoff in the Task Breakdown

The Task Breakdown is the canonical index of every artifact produced for the feature, so a later command finds this handoff by following a link rather than by guessing at path conventions or searching the filesystem. Set `qa_handoff_link` in the breakdown's frontmatter to the path actually written in step 7 — repository-relative, and the real filename if step 6 chose `Preserve` or `Version`:

```yaml
qa_handoff_link: docs/qa/{FEATURE-NAME}-qa-handoff.md
```

Add the field after `dev_plan_link` if it is absent; update its value in place if it is already there. Per `QA-LINK-1`:

- **Touch that one line only.** Leave every other line of the breakdown byte-identical, including its `doc_schema_version` — recording a produced artifact is not a schema change, and `qa_handoff_link` is an additive field outside the versioned contract (`docs/planning-doc-contract.md` § Known limitations).
- **Never rewrite `feature`, `status`, `author`, or `date`** — the same keys the migration framework protects. Writing this link neither confers nor revokes approval.
- If the breakdown cannot be written (missing, read-only, ambiguous frontmatter), **report that the link was not recorded and name the path the handoff was written to.** The handoff itself already exists on disk; do not delete or roll it back.

## 9. Report

Report the absolute path written, the existing-file strategy applied, and whether `qa_handoff_link` was recorded in the Task Breakdown. State that the handoff is `status: draft` and needs a human to flip it to `ready-for-qa` before QA treats it as delivered.

## Bug handoff (`bug:<bug_key>`)

Without a `bug:` prefix, nothing in this section applies: the feature handoff above is the whole command, unchanged. With `bug:<bug_key>`, §2 still resolves `TARGET_ROOT`, and this section replaces §1 and §3–§9. The handoff is `docs/qa/bug-<bug_key>-qa-handoff.md` (`templates/qa-bug-handoff-template.md`, contract in `docs/bug-work-plan-contract.md` § *QA handoff*). It is generated and approved only through `scripts/qa-handoff-gate.ts`.

1. **The evidence source.** The bug evidence is re-read for the readiness check, so this command needs where it lives: `--qa-repo=<path>` for a QA bug, `--report=<path>` otherwise. When it is missing, ask once; never guess it.
2. **Check readiness (R1–R9):**

   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/qa-handoff-gate.ts" check bug:<bug_key> --root "<TARGET_ROOT>" [--qa-repo "<path>" | --report "<path>"]
   ```

   Show each check's result in one line. Branch on `next`:
   - `blocked`: **stop.** Report every blocker with its `route`, for example `/analyze-bug` for a stale or reopened bug, `/implement-task` for an incomplete task, or `/review-code --bug` for a missing, stale or blocking review.
   - `done`: the handoff is already `ready-for-qa` and current. Report it and the QA next action, then stop. Nothing is regenerated.
   - `generate`: go to step 3.
   - `approve`: go to step 4.

   A partial QA context (QA ownership state unavailable) is a warning to show, not a blocker.
3. **Generate the draft.** Write the build/install/testing instructions through `feature-implementer` with the shared `platform-implementation` methodology and the plan's platform lane. Use the same lane table and readiness gate as §4, and the `mobile-testing-and-qa-handoff` methodology for the instructions. Save them to a file outside `TARGET_ROOT`, using `###` headings only, one subsection per platform. Then run:

   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/qa-handoff-gate.ts" generate bug:<bug_key> --root "<TARGET_ROOT>" [--qa-repo "<path>" | --report "<path>"] --date <YYYY-MM-DD> --build-instructions "<file>"
   ```

   It writes every other section deterministically: bug summary, fix claim, reproduction scenario (verbatim from the plan), developer verification (from task state), regression scope, known limitations, and QA-owned pending verification. Inputs that changed regenerate the handoff as a draft, and any earlier approval no longer holds. It never overwrites a file at that path that is not this bug's handoff.
4. **Present, then ask once.** Show:
   - the bug and its fix cycle;
   - the review result;
   - the developer-testing summary, including developer-owned VERIFY-4 debt (the developer's, never QA's);
   - the QA verification debt;
   - **each Major finding**, with its id, location, rule, description and remediation;
   - the exact QA next action (`qa_next_action`).

   When the bug has no QA bug id, say plainly that QA must create or bind a QA bug before `/register-build --fixes`. Then ask:

   ```
   Hand this bug fix to QA?
   1. Yes — as: <your name>, acknowledging each Major finding listed above
   2. Not now — leave the handoff as a draft
   ```

   Major findings are acknowledged explicitly, one by one, never implicitly. If the human does not acknowledge every listed Major finding, there is no approval.
5. **On approval**, run (one `--ack-major` per Major finding):

   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/qa-handoff-gate.ts" approve bug:<bug_key> --root "<TARGET_ROOT>" [--qa-repo "<path>" | --report "<path>"] --by "<approver>" --ack-major <id> …
   ```

   It re-checks R1–R9, then records `status: ready-for-qa`, `approved_by`, `acknowledged_majors` and `approved_fingerprint`. The fingerprint binds the handoff body, its input fingerprint and the acknowledgements. Report a refusal verbatim.

   **When declined**, the handoff stays a draft. Rerunning `/create-dev-qa-notes bug:<bug_key>` returns to this step without regenerating it.
6. **Report:**
   - the handoff path and its status;
   - the QA next action, for example `/register-build <build-id> --fixes bug:<qa_bug_id> --surfaces …`, run by QA once CI produces the build.

   Never edit `status` or any `approved_*` field by hand. This command never registers a build, never writes task state, the plan or the review record, and never creates a git commit. The human commits after reviewing the changes, with every hook applying unchanged.
