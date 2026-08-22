---
description: Write QA handoff notes for a completed feature.
argument-hint: [feature-name]
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

**Then fill the gaps from the platform feature-developer agent.** The task breakdown carries exactly one confirmed platform, so use that platform's agent (`rn-feature-developer` / `ios-feature-developer` / `android-feature-developer` / `react-feature-developer`) for anything the record does not hold — narrative summary, screens/flows in user-facing language, and the build/install instructions.

**Readiness gate — React.** Before invoking, check that platform's feature-developer agent for a "not yet authored / structure-only placeholder" marker. If present, **stop with: "Platform QA-handoff methodology for `<platform>` is not yet authored"** — do not invoke a placeholder agent and do not write build/install instructions for a lane whose methodology does not exist. (When that lane is later authored and the marker is gone, the route opens automatically.) React (web) is the only lane still gated — `react-native`, `ios` and `android` are authored.

If the store reports nothing recorded **and** no record of what was implemented can be found from the agent, **say so explicitly and write nothing** — a handoff of guessed test steps is worse than no handoff.

## 5. Write the handoff content

Apply the shared `mobile-testing-and-qa-handoff` skill methodology via that feature-developer agent, and have it populate `templates/qa-handoff-template.md` in full — including the i18n/RTL and accessibility check sections (citing the actual `I18N-*`/`A11Y-*` standard IDs applied during implementation, per `standards/shared/qa-handoff.md`'s `QA-A11Y-1`) and the platform-specific Build / Install / Testing Instructions section, one subsection per platform the feature touches.

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
