---
description: Implement a single approved task from a feature's task breakdown.
argument-hint: [feature] [task-id]
---

Orchestrate the implementation of **exactly one** approved task. This command is an orchestrator only: it resolves and verifies the full implementation context, enforces the approval/readiness gates, routes to the correct platform, and hands the resolved context to that platform's feature-implementation skill. It contains **no platform coding methodology** — the platform skill owns how the code is written; the `require-approval-before-code`, `block-main-branch-changes`, and `protect-secrets` hooks gate the writes.

Do not invoke any implementation agent until every step below has passed. If any step fails, **stop, state the exact missing/failed condition, and do not edit code.**

## 1. Resolve the task identity from `$ARGUMENTS`

Parse `$ARGUMENTS` as `[feature] [task-id]` (e.g. `biometric-login T3`).

- A **task id is required** and must be explicit (e.g. `T3`). Do not accept a vague feature description as a substitute for a task id.
- A **feature identifier is required** to disambiguate — task ids are not globally unique (every feature's breakdown starts at `T1`).
- If the task id is missing, or the feature is missing/ambiguous, or the pair cannot identify exactly one task, **stop and ask the user for `[feature] [task-id]`.** Do not guess.

## 2. Resolve one authoritative repository root (via the helper)

Run the plugin's deterministic helper — do not reimplement worktree logic here:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-target-repo-root.ts" "<candidate>"
```

(`bun` works too.) `${CLAUDE_PLUGIN_ROOT}` is substituted inline in this command's text at load time (per the Claude Code plugins reference), so it expands to the installed plugin's absolute root before you run the command — it is **not** read from the shell environment, and does not require the user's shell to export it. The helper itself takes an explicit path argument and depends on no environment variable. `<candidate>` is the developer-supplied repo path if given, otherwise the current working directory. Read the JSON on stdout:

- Exit `0` and `ok: true` → use `targetRoot` as the single repository-root authority for the rest of this command (`TARGET_ROOT`).
- Exit `1` (path not found), exit `3`, `ok: false`, or `targetIsWorktree: true` → **stop and report.** Never treat a `.claude/worktrees/…` path as the target.
- If `unwrapped: true`, tell the user the command is targeting the main working tree, not the Claude agent worktree it was launched from.

Do not trust ambient CWD as the root on its own — the helper's `targetRoot` is authoritative.

## 3. Locate the Task Breakdown for the feature

Using the feature identifier from step 1, locate that feature's **Task Breakdown** file under `TARGET_ROOT` (where the repo keeps design docs — check `docs/` conventions and the repo root; the breakdown is the generated feature artifact, never `templates/task-breakdown-template.md`). If you cannot locate exactly one Task Breakdown for the feature, **stop and ask the user for its path** — do not guess filenames.

## 4. Resolve the upstream documents from frontmatter (no filename guessing)

Read the Task Breakdown's frontmatter and resolve the linked documents:

- `feature_analysis_link` → the approved **Feature Analysis**
- `dd_link` → the approved **Detailed Design (DD)**
- `dev_plan_link` → the approved **Dev Plan**
- the **Task Breakdown** itself (this file)

Then:

- Resolve each link to an absolute path and confirm the file exists. If a required link field is missing or its target does not exist, **stop and report which one** — resolve through the frontmatter links, do not reconstruct filenames.
- **Verify every resolved path is inside `TARGET_ROOT`.** Any path that escapes `TARGET_ROOT` or resolves under `.claude/worktrees/…` → stop and report.
- **Verify feature identity is consistent across documents:** the `feature` in the breakdown matches the DD and Dev Plan; the DD's `feature_analysis_link` points at the same Feature Analysis; the Dev Plan's `dd_link` points at the same DD. On any cross-feature mismatch → stop and report the mismatch.

## 5. Approval & readiness gates

Confirm **all** of the following before going further. On any failure, stop, name the exact condition, and do not invoke an implementation agent:

- Feature Analysis exists and `status: approved`.
- DD exists and `status: approved` — and is **not** marked dry-run only. A DD in `draft` or dry-run → stop.
- Dev Plan exists and `status: approved`.
- Task Breakdown exists and `status: approved` (not `draft`).
- The selected task row exists in the breakdown.
- The selected task is **not already complete** and is **not blocked**, per the task-state read in step 6.
- Every `depends-on` task is complete — see step 6.
- No unresolved blocker referenced by the task remains.
- `platform` is present and valid on the row.
- `device_type` is present and valid — exactly `mobile` or `tv` — resolved from the selected task row if it carries one, otherwise from the Task Breakdown frontmatter. If it is **missing/empty**, is an **invalid value** (anything other than `mobile`/`tv`, including `mixed`), or conflicts between the row and the frontmatter, **stop and report the exact condition** — never default to `mobile` and never re-detect it here.
- For UI-touching work, a **design reference** is available (breakdown/Dev Plan/DD): either `figma_link` (`design_reference_type: figma`) or `design_reference` (type `document` / `screenshots` / `existing_ui` / `other`). If the task touches UI and neither is present → **stop and ask for a design reference.** Figma specifically is not required — any recorded reference type satisfies this check. `design_reference_status: not_required` is only valid for a task that changes no user-facing UI; if a UI-touching task carries it, stop and report the contradiction.
- Branch is **not** `main`/`master` (the `block-main-branch-changes` hook enforces this on write; check it up front too) and repository policy allows edits.

## 6. Task state and dependency completeness (read the store, then decide)

Read the feature's lifecycle state through the plugin's helper — do not read or write the state file directly, and do not reimplement its rules:

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" read \
  --root "<TARGET_ROOT>" --feature "<feature>" --breakdown "<absolute Task Breakdown path>"
```

It always exits 0 and always prints one JSON object; branch on `status`, never on the exit code. See `docs/task-state-contract.md` for the schema, the four states, the two trust levels and the staleness rule. Show the developer the returned `summary` in one line.

**The selected task.** If its state is:

- **`complete` with `deterministicProof: true`** → **stop and report that it is already complete**, naming its `runId`. Proceed only if the developer explicitly overrides.
- **`complete` but `stale: true`** → **stop and report that the task row changed since it was completed.** The recorded work no longer describes this row; the developer decides whether to re-implement.
- **`in-progress`** → **stop and report the earlier attempt** by `runId`, together with the `filesChanged` it recorded. A previous run did not finish; the developer decides resume vs. restart.
- **`blocked` or `failed`** → report the prior outcome and its `blockers`, then continue only if the condition that caused it is resolved.
- **`unknown`** → nothing was recorded; continue.

**Each task in the selected task's `depends-on`** — the graph comes from the Task Breakdown row, never from the store:

- **`deterministicProof: true`** → the dependency is proven. This is the only machine proof; it means a `plugin-verified`, non-stale `complete`.
- **Anything else** — `unknown`, `in-progress`, `blocked`, `failed`, a `stale` completion, or a `human-attested` completion — is **not** proof. **Stop and ask the user for explicit evidence or confirmation** (e.g. merged commits/PRs), exactly as this step always did.
- A `human-attested` record is surfaced as an attestation, never as verification. Do **not** treat it as equivalent to a task that passed step 10.
- Do **not** silently assume a dependency is complete, and do **not** implement dependency tasks yourself.

When the store is `absent`, `unparseable`, `invalid`, `schema-too-new` or `feature-mismatch`, every task reads `unknown` and this step behaves exactly as it did before the store existed — say so in one line and fall back to asking. **A missing store never blocks the command.**

## 7. Platform routing (read from the task row; never re-detect)

Read the `platform` value from the selected task row — do **not** re-run platform detection. Route:

| Row `platform` | Agent | Skill | Status |
|---|---|---|---|
| `react-native` | `rn-feature-developer` | `rn-feature-implementation` | active |
| `android` | `android-feature-developer` | `android-feature-implementation` | active |
| `ios` | `ios-feature-developer` | `ios-feature-implementation` | active |
| `react` | `react-feature-developer` | `react-feature-implementation` | check readiness |

- **React:** before invoking, check the target skill and agent for a "not yet authored / structure-only placeholder" marker. If present, **stop with: "Platform implementation methodology for `<platform>` is not yet authored"** — do not pretend the route is production-ready and do not author it here. (When that skill is later authored and the marker is gone, the route opens automatically.) The iOS route passed this gate when `ios-feature-implementation` and `ios-feature-developer` were authored (IOS-003); `/review-code`'s iOS route opened when `ios-code-review`, `ios-code-reviewer` and `ios-performance-reviewer` were authored (IOS-004).
- **Multiple platforms on one row:** the task model is single-platform-per-row. If a row lists more than one platform, **stop and require it to be split into one task per platform** at `/dev-feature-start`. Do not invent a cross-platform lead agent, and do not invoke unrelated platform agents.

## 7a. Record `in-progress` before handing off

Immediately before invoking the agent, record the attempt through the helper:

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" write \
  --root "<TARGET_ROOT>" --feature "<feature>" --task "<task-id>" --state in-progress \
  --breakdown "<absolute Task Breakdown path>" --head "<git HEAD sha>" \
  --payload '{"platform":"<platform>"}'
```

This is what makes an interrupted run visible to the next one: the write advances the task's attempt counter and stamps its `runId` (`<task-id>-attempt-N`). If the run dies after this point, step 6 reports the unfinished attempt instead of silently starting over.

**Write lifecycle state only through this helper.** Never hand-edit the state file, and never record state from a platform skill or agent — the command owns lifecycle, the skill owns implementation.

## 8. Pass explicit resolved context to the selected agent + skill

Invoke the routed platform's feature-implementation skill via its feature-developer agent, passing these resolved, verified values as authoritative inputs (the skill must not search ambiently or guess filenames):

- absolute `TARGET_ROOT` (repository root)
- absolute **Feature Analysis** path
- absolute **DD** path
- absolute **Dev Plan** path
- absolute **Task Breakdown** path
- selected **task id**
- selected **task row content**
- **platform**
- **device_type** (`mobile` or `tv`) — the resolved mobile-vs-TV context signal from step 5; passed through as authoritative context. It does **not** change platform routing (§7): a `tv` task runs on the same platform feature-developer agent + feature-implementation skill as a `mobile` task.
- the **design reference** — `design_reference_status`, `design_reference_type`, `design_reference`, and `figma_link` as recorded upstream
- **dependency status** (from step 6)
- **approval status** (from step 5)
- **unresolved-blocker status**

Pass the actual document **paths**, preserving the source-of-truth hierarchy — do not collapse them into a single generated summary that omits the source documents:

- **Feature Analysis** — business objective, platform context, repository findings.
- **DD** — architecture, technical approach, API contracts, impacted modules, approved decisions.
- **Dev Plan** — sequencing, dependencies, rollout, rollback.
- **Task Breakdown** — the task inventory.
- **Selected task row** — current implementation scope and acceptance criteria (the completion contract).

## 9. Scope: exactly one task

Implement only the selected task. Do **not** auto-continue to the next task, implement dependency tasks, expand the task, change approved API contracts/business rules, edit the DD/plan silently, or resolve blockers. If the task cannot be completed within its approved scope, **stop, report the conflict, and recommend a new task or a DD amendment** rather than absorbing the extra work.

## 10. Completion handling (report; do not mutate status)

After the platform skill finishes, require its structured completion report and confirm it covers:

- each acceptance criterion checked individually,
- validation commands run and their exact results,
- files changed,
- applied standard IDs,
- deviations and blockers,
- confirmation that no unrelated scope was added,
- confirmation that the writes landed inside `TARGET_ROOT` (not in `.claude/worktrees/…`).

**Then record the outcome — this is the one lifecycle write the command owns.** SHARED-004's task-state store is the approved task-status mechanism, and `scripts/task-state.ts` is the only way to write it. **Still never edit the Task Breakdown to flip a task's status**; the breakdown is a human-approved artifact and is not a lifecycle store.

- **All of the above satisfied** → record `complete`, passing the report as the payload:

  ```
  node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" write \
    --root "<TARGET_ROOT>" --feature "<feature>" --task "<task-id>" --state complete \
    --breakdown "<absolute Task Breakdown path>" --head "<git HEAD sha>" \
    --payload '{"platform":"…","filesChanged":[…],"standardIds":[…],"validation":[{"command":"…","result":"pass"}],"acceptanceCriteria":[{"criterion":"…","met":true}],"deviations":[],"blockers":[]}'
  ```

  **A terminal `complete` may only be written after the verification above succeeds.** The helper enforces this structurally: it refuses `complete` unless every acceptance criterion is recorded and met and at least one validation entry is present, returning `refused: complete-without-verification`. If it refuses, report that verbatim and record `failed` instead.
- **Verification failed** → record `failed` with the failing criteria and validation results in `blockers`.
- **A blocker or unproven dependency stopped the run** → record `blocked` with the blocker text.

The recorded `filesChanged`, `standardIds`, `validation` and `acceptanceCriteria` are what `/create-dev-qa-notes` later reads, so a QA handoff no longer depends on a session transcript.

Do not report success if any acceptance criterion failed, required validation failed, a dependency is unproven, a blocker remains, the implementation deviates from the DD without approval, or changes exist only inside a worktree. **Approval is unaffected: recording lifecycle state neither confers nor revokes any document's `status`.**

## Responsibility boundary

This command orchestrates (task-id resolution, repo-root resolution via the helper, document-path resolution, approval/dependency/blocker checks, platform routing, hook gating, invoking the correct agent+skill, passing resolved context, and recording lifecycle state through `scripts/task-state.ts` — it is the only writer). It does **not** contain Android/iOS/RN/React coding methodology, architecture guidance, review methodology, or the implementation logic itself — those live in the platform feature-implementation skills.
