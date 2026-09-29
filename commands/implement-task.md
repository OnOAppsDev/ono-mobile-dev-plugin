---
description: Implement a single approved task from a feature's task breakdown.
argument-hint: [feature] [task-id] [--restart | --abandon]
---

Orchestrate the implementation of **exactly one** approved task. This command is an orchestrator only: it resolves and verifies the full implementation context, enforces the approval/readiness gates, routes to the correct platform, and hands the resolved context to that platform's feature-implementation skill. It contains **no platform coding methodology** — the platform skill owns how the code is written; the `require-approval-before-code`, `block-main-branch-changes`, and `protect-secrets` hooks gate the writes.

Do not invoke any implementation agent until every step below has passed. If any step fails, **stop, state the exact missing/failed condition, and do not edit code.**

## 1. Resolve the task identity from `$ARGUMENTS`

Parse `$ARGUMENTS` as `[feature] [task-id]` (e.g. `biometric-login T3`).

- A **task id is required** and must be explicit (e.g. `T3`). Do not accept a vague feature description as a substitute for a task id.
- A **feature identifier is required** to disambiguate — task ids are not globally unique (every feature's breakdown starts at `T1`).
- If the task id is missing, or the feature is missing/ambiguous, or the pair cannot identify exactly one task, **stop and ask the user for `[feature] [task-id]`.** Do not guess.
- An optional **lifecycle flag** may follow: `--restart` (discard the active run and start a new attempt) or `--abandon` (end the active run as `failed`). Without one, an interrupted run is **resumed automatically** when §6 verifies it — the developer is never asked to choose. Both flags act only on an `in-progress` task; see §6.

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

## 5a. Consistency preflight (runs on every invocation)

Before any of the checks below, confirm this breakdown was derived from the DD that is on disk **now**. This runs on every invocation, so a change made between two task runs is caught at the next one — there is no background monitor and none is needed. It uses documents you already read, so it costs no extra work.

**Upstream fingerprint.** Compute the DD's body fingerprint and compare it to the `source_fingerprint` recorded in the Task Breakdown's frontmatter:

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" fingerprint --file "<absolute DD path>"
```

- **Equal** → continue.
- **Different** → **do not implement against this breakdown.** Every row in it, including the one you were asked to implement, was derived from a DD that has since changed, so no row's validity is known. Report both values and say: **"The DD changed after this breakdown was generated. Re-approve the DD, then run `/dev-feature-start` to regenerate the breakdown."** The full chain check below confirms whether this is the earliest stale stage, and reconciles it rather than leaving the developer to.
- **Absent** on the breakdown (a document written before SHARED-013) → report `source_fingerprint: unknown` in one line and continue. **Absent is never a mismatch.**

**Design reference.** Compare the four design-reference fields carried in the Task Breakdown against the same four in the DD. They are contractually carried byte-verbatim, so any difference means the reference was re-pointed after the breakdown was generated. On a difference, **do not implement** and say: **"The design reference changed after this breakdown was generated. Run `/dev-design-start` to rebuild the DD against the current reference."** — then reconcile through the full chain check below, which names the earliest stage to rerun.

**External sources are judged by their content, not their URL.** A Figma design — or a hosted specification — can change behind an unchanged link, and the Figma MCP exposes no version or content hash, so the fingerprint `/analyze-feature` stamped is of the content it actually read. For a UI-touching task with an external design reference, **re-read the linked node now** with the same two reads (`get_metadata` and `get_design_context`) — the design read the implementation needs anyway — and save them as the design evidence file, outside `TARGET_ROOT` (`commands/analyze-feature.md` step 6 defines the shape). Do the same for an external `source_link`. Pass the files as `--design-evidence` / `--source-evidence` to every `chain`, `resume`, `write` and `checkpoint` call in this run, and hand their paths to the agent in §8.

**When an external source cannot be read** (MCP unavailable, authentication, timeout), its checks come back `unverifiable` — never `current`, never `stale`. Fall back to the attestation gate: ask the developer to confirm the reference is still what was planned against, and record the answer as the run's `designAttestation` — an attestation, never verification. Work that cites the unread source is neither redone nor treated as verified (`unverified` in the resume verdict), and a validation built on it cannot back a `complete`: if the source is still unreadable when the task is otherwise done, record `blocked` naming it. On a **resumed** run the recorded attestation is re-read, not asked again.

**Full upstream chain (ENG-003).** The two checks above guard the last link. Then check the whole chain — source specification, design reference, feature analysis, DD and Task Breakdown — through the helper:

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" chain \
  --root "<TARGET_ROOT>" --breakdown "<absolute Task Breakdown path>"
```

Each stage is compared with the stage above it using the fingerprints it recorded at generation (`docs/task-state-contract.md` § *The upstream chain and the earliest stale stage*). Show the returned `summary` in one line. When `earliestStale` is set, **reconcile instead of stopping blind**:

1. **Rerun only the earliest stale stage** — the `command` the verdict names (`/analyze-feature`, `/dev-design-start` or `/dev-feature-start`) — for this feature, now. Never rerun a stage above it, and never rerun every stage by reflex.
2. **The regenerated document is a draft; approval stays a human act.** Pause and ask the developer to review and re-approve it — the plugin never flips `status`, and §5's gates are not bypassed. This pause is the approval gate working, not a failure.
3. **Re-run `chain` after each re-approval** and rerun the next stage only if the verdict now marks it stale. Stages reported `pending-upstream` wait for the stage above them; if regenerating it left their input byte-identical, they come back `current` and are **not** rerun.
4. Once the chain is current, continue to §6: implementation already written is reconciled there, checkpoint by checkpoint — never discarded wholesale.

Hard stop only when the reconciliation cannot proceed deterministically — the stage command itself stops (for example it needs a design reference nobody has supplied), or the chain is stale in a way no single command resolves — and name the stage command that must be run: `/analyze-feature`, `/dev-design-start` or `/dev-feature-start`.

## 5b. Accessibility applicability (decide once, from the confirmed context)

Decide here whether the accessibility flow applies to this task, and carry the
decision into steps 8 and 10. On a **resumed** run, the decision is already recorded in the
run's `context` — re-read it from the resume verdict; never decide it a second time. `device_type` was resolved in step 5 — **never re-detect it
here, and never default it.** The same decision applies to both device types: the shared
accessibility standard covers any screen, and its rules state their own TV clauses. **Never
skip accessibility, or record it not applicable, merely because `device_type` is `tv`.**

- **The flow applies whenever the task touches an accessibility-relevant surface.** That is
  broader than "renders a screen". It includes shared UI primitives, design tokens,
  theming, navigation and focus infrastructure, list and collection containers, and any
  component other screens compose. A task that changes a primitive every screen uses is
  accessibility-relevant even though it renders nothing by itself. **Do not equate
  "non-UI" with "not applicable" by reflex** — ask whether the change can alter what
  assistive technology perceives anywhere downstream.
- **`device_type: tv` → the flow applies, through each rule's TV clause.** Apply the
  shared `A11Y-*` rules as their TV clauses state them — `A11Y-TOUCH-1` and
  `A11Y-TOUCH-2` require a reliably focusable element with a clearly visible focus state and
  enough separation for D-pad movement, not a touch-target size — and keep the focus-driven
  rules (`A11Y-FOCUS-*`) fully applicable: they matter more on a focus-driven surface, not
  less. A rule whose mechanism is touch-only and which states no TV clause is not cited as
  met on a TV surface. For React Smart TV, cite the applicable `REACT-TV-*` rules alongside
  the shared ones. Verification with the TV platform's own screen reader has no headless
  mechanism: record it as Tier 3 `verificationDebt` with `owner: "qa"`, exactly as for a
  mobile screen reader.
- **Genuinely not accessibility-relevant** (a build script, a networking helper, a pure
  data transform) → `applicable: false` with a reason saying so, on either device type.
  Never omit the block. A silent skip is the failure mode this rule exists to prevent: the
  decision must appear in the record.

When the flow applies, the platform lane's accessibility rules apply alongside the shared
ones: `AND-UI-A11Y-*` (Android), `RN-A11Y-*` (React Native), `IOS-UI-A11Y-*` (iOS). The
shared standard states the requirement; the platform standard states how it is met. No
stable TV-specific rules exist yet beyond the shared TV clauses and `REACT-TV-*`; cite none.

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
- **`in-progress`** → a previous run was interrupted. **Evaluate it deterministically — never hand the decision to the developer:**

  ```
  node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" resume \
    --root "<TARGET_ROOT>" --feature "<feature>" --task "<task-id>" --breakdown "<absolute Task Breakdown path>"
  ```

  The verdict compares the recorded baseline, checkpoints and validations with the repository and the current documents, by hash (`docs/task-state-contract.md` § *The resume verdict*). Show its `summary` in one line, then branch on `status`:

  | `status` | Action |
  |---|---|
  | `resume` | **Resume automatically**, as the same run. If the verdict lists `unverified` inputs, the external source was not read: re-read it and evaluate again, or take the attestation fallback in §5a first. Then: §7a writes `--mode resume` (same `runId`, same `attempt`), and §8 hands the verdict to the agent so it continues from `nextStep`, keeps every `matches-checkpoint` file, finishes each `partial` file, re-runs only `validations.rerun` and re-reads the saved `context` instead of recomputing it |
  | `reconcile-upstream` | the chain check above found a stale stage — reconcile it there first, then evaluate again |
  | `restart` | nothing recorded can be verified (a legacy record), or the platform or `device_type` changed. Say which in one line and start a new attempt: §7a writes `--mode restart`. The current tree is the new baseline |
  | `hard-stop` | **hard stop** and report every entry in `mismatches` verbatim — the exact path, the recorded hash and the current one, or the HEAD/branch difference. The repository changed in a way the run cannot account for. Continue only when the developer tells you what happened: then `/implement-task <feature> <task-id> --restart` builds on the tree as it now is, or `/implement-task <feature> <task-id> --abandon` ends the run |

  **`--restart`** on an `in-progress` task skips the verdict and writes `--mode restart`. **`--abandon`** ends the run through the helper and stops — it never touches the working tree:

  ```
  node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" abandon \
    --root "<TARGET_ROOT>" --feature "<feature>" --task "<task-id>" --run "<runId>" \
    --reason "<the developer's reason>" --breakdown "<absolute Task Breakdown path>"
  ```

  Report `taskOwnedChanges` — the task's edits still in the tree. Reverting any of them is a separate action the developer must confirm; never revert them as part of abandoning.
- **`blocked` or `failed`** → report the prior outcome and its `blockers`, then continue only if the condition that caused it is resolved.
- **`unknown`** → nothing was recorded; continue.

**Each task in the selected task's `depends-on`** — the graph comes from the Task Breakdown row, never from the store:

- **`deterministicProof: true`** → the dependency is proven. This is the only machine proof; it means a `plugin-verified`, non-stale `complete`.
- **Anything else** — `unknown`, `in-progress`, `blocked`, `failed`, a `stale` completion, or a `human-attested` completion — is **not** proof. **Stop and ask the user for explicit evidence or confirmation** (e.g. merged commits/PRs), exactly as this step always did.
- A `human-attested` record is surfaced as an attestation, never as verification. Do **not** treat it as equivalent to a task that passed step 10.
- Do **not** silently assume a dependency is complete, and do **not** implement dependency tasks yourself.

**Walk the whole transitive closure, not just the direct `depends-on` list.** Consider `T1 → T3 → T7`: if T1's row changes, T3's own row is untouched, so T3 still reports `deterministicProof: true` and a direct-only check would let T7 proceed on a foundation that moved. Follow `dependsOn` from the requested task through every level.

For each problem found, **hard stop and report the exact dependency path** — `T7 → T3 → T1 (stale: row changed)` — never a bare "a dependency is not proven":

| What the walk finds | Recovery command to name |
|---|---|
| a task in the closure is **stale** (its row changed) | `/implement-task <that task>` |
| a task in the closure was **removed** from the breakdown | `/dev-feature-start` — the dependency graph itself is wrong |
| a task in the closure is **in-progress** | `/implement-task <that task>` — it resumes automatically; or `--abandon` it |
| a `depends-on` names a task with **no row** | `/dev-feature-start` — the graph references a task that does not exist |
| a **dependency cycle** (`T3 → T5 → T3`) | `/dev-feature-start` — proof is undecidable inside a cycle and an approved breakdown should not contain one |

Detect cycles defensively rather than following the graph indefinitely; report the repeated task in the path.

## 6a. Feature-wide impact report (always printed, blocks only what it must)

The store read above already returns **every** task in the feature, not just the one requested. Classify all of them and show the result before implementing:

| Bucket | Meaning |
|---|---|
| **Unchanged** | recorded, row fingerprint still matches — prior work valid, still dependency proof |
| **Modified** | recorded, row fingerprint differs — the recorded work no longer describes the row |
| **Removed** | recorded, no row in the breakdown — the record is kept, and is never proof |
| **Unrecorded** | a row with no record — nothing to invalidate |

Then state the recommended actions, ordered: the upstream mismatch first if there is one, then each blocking item in the requested task's closure with the command that resolves it, then the tasks that need no action.

**A stale or removed task outside the requested task's transitive closure is reported, never blocking.** Implementing an unrelated task is safe, and stopping for it would teach the developer to override every stop — including the ones that matter. Say plainly which tasks are affected and which are not.

Never say "safe to continue" while an upstream fingerprint mismatch is unresolved: in that state nothing is known to be safe.

When the store is `absent`, `unparseable`, `invalid`, `schema-too-new` or `feature-mismatch`, every task reads `unknown` and this step behaves exactly as it did before the store existed — say so in one line and fall back to asking. **A missing store never blocks the command.**

## 7. Platform routing (read from the task row; never re-detect)

Read the `platform` value from the selected task row — do **not** re-run platform detection. Route:

| Row `platform` | Agent | Shared methodology | Platform lane | Status |
|---|---|---|---|---|
| `react-native` | `feature-implementer` | `platform-implementation` | `rn-feature-implementation` | active |
| `android` | `feature-implementer` | `platform-implementation` | `android-feature-implementation` | active |
| `ios` | `feature-implementer` | `platform-implementation` | `ios-feature-implementation` | active |
| `react` | `feature-implementer` | `platform-implementation` | `react-feature-implementation` | active |

**Exactly one platform lane is ever loaded.** The agent and the shared methodology are
platform-independent; the lane resolved from the row's `platform` is the only source of
platform content, and no other platform's lane or standards may be loaded.

- **Readiness gate (any platform):** before invoking, check the **resolved platform lane** for the placeholder marker — a frontmatter `description` ending "not yet authored, currently a structure-only placeholder" **and** a `## Status: Not yet authored` heading. Match on those markers only, never on the phrase appearing in ordinary prose (an authored skill may legitimately mention "structure-only placeholder" when telling an agent to stop if a *standards* file is one). If present, **stop with: "Platform implementation methodology for `<platform>` is not yet authored"** — do not pretend the route is production-ready and do not author it here. The gate is on the lane, not the agent: `feature-implementer` and `platform-implementation` are platform-independent and always authored, so a lane's readiness is the only thing that can gate a route. All four lanes currently pass it.
- **Multiple platforms on one row:** the task model is single-platform-per-row. If a row lists more than one platform, **stop and require it to be split into one task per platform** at `/dev-feature-start`. Do not invent a cross-platform lead agent, and do not invoke unrelated platform agents.

## 7a. Record `in-progress` before handing off

Immediately before invoking the agent, record the attempt through the helper, with the mode §6 decided — `start` for a task with no active run, `resume` or `restart` for an interrupted one:

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" write \
  --root "<TARGET_ROOT>" --feature "<feature>" --task "<task-id>" --state in-progress \
  --mode <start|resume|restart> \
  --breakdown "<absolute Task Breakdown path>" --head "<git HEAD sha>" \
  --payload '{"platform":"<platform>"}'
```

This is what makes an interrupted run recoverable by the next one. `start` and `restart` advance the attempt counter, stamp the `runId` (`<task-id>-attempt-N`) and capture the run's **baseline** — HEAD, branch, and every pre-existing dirty or untracked file with its hash — plus the upstream fingerprints the run is built against. `resume` keeps the `runId` and `attempt` and every recorded checkpoint; the helper re-verifies the run itself and refuses (`resume-inconsistent`) if the repository no longer matches. A plain `start` over an active checkpointed run is refused (`active-run-exists`), so an interruption is never silently discarded.

Right after a `start` or `restart`, record the §5b accessibility decision and any design-reference attestation as the run's `context` checkpoint (below), so a resume re-reads them instead of deciding again.

**Write lifecycle state only through this helper.** Never hand-edit the state file, and never record lifecycle state from a platform skill or agent — the command owns lifecycle, the skill owns implementation. The one write the shared implementation methodology may make is to **append checkpoints to the active run** (`skills/platform-implementation/SKILL.md` § *Checkpoints*):

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" checkpoint \
  --root "<TARGET_ROOT>" --feature "<feature>" --task "<task-id>" --run "<runId>" \
  --kind <context|plan|step|validation|probe|developer-testing|review> \
  --breakdown "<absolute Task Breakdown path>" --payload '<json>'
```

A checkpoint can never set a lifecycle state, and is refused for any run other than the active one.

## 8. Pass explicit resolved context to the selected agent + skill

Invoke the `feature-implementer` agent with the shared `platform-implementation` methodology and the resolved platform lane, passing these resolved, verified values as authoritative inputs (the skill must not search ambiently or guess filenames):

- absolute `TARGET_ROOT` (repository root)
- absolute **Feature Analysis** path
- absolute **DD** path
- absolute **Dev Plan** path
- absolute **Task Breakdown** path
- selected **task id**
- selected **task row content**
- **platform**
- **device_type** (`mobile` or `tv`) — the resolved mobile-vs-TV context signal from step 5; passed through as authoritative context. It does **not** change platform routing (§7): a `tv` task runs on the same agent, the same shared methodology and the same platform lane as a `mobile` task.
- the **design reference** — `design_reference_status`, `design_reference_type`, `design_reference`, and `figma_link` as recorded upstream
- **dependency status** (from step 6)
- **approval status** (from step 5)
- **unresolved-blocker status**
- the active **`runId`** from §7a, which every checkpoint names
- the **design and source evidence files** from §5a, when the design reference or the specification is external — checkpoints citing `design` or `requirements` pass them
- on a resumed run, the **resume verdict** from §6 — `nextStep`, `checkpoints.valid` and `checkpoints.invalidated`, `files`, `partialFiles`, `validations.carried` and `validations.rerun`, `developerTesting` and the saved `context`. It is authoritative: completed work it lists is not redone, and decisions it carries are not recomputed

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
- the **accessibility outcome** decided in step 5b — the applicability decision and, where
  it applies, the rules cited, the mechanical checks run with their tier and result, and
  the manual verification that remains outstanding,
- the **developer-testing outcome** (`skills/platform-implementation/SKILL.md` §7a) — the
  framework detected, whether developer tests were required, the tests added or updated or
  the justification for none, the developer tests that actually ran with their real
  results, and the developer-owned debt for anything that could not be written or run,
- confirmation that no unrelated scope was added,
- confirmation that the writes landed inside `TARGET_ROOT` (not in `.claude/worktrees/…`).

**Then record the outcome — this is the one lifecycle write the command owns.** SHARED-004's task-state store is the approved task-status mechanism, and `scripts/task-state.ts` is the only way to write it. **Still never edit the Task Breakdown to flip a task's status**; the breakdown is a human-approved artifact and is not a lifecycle store.

- **All of the above satisfied** → record `complete`, passing the report as the payload:

  ```
  node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/task-state.ts" write \
    --root "<TARGET_ROOT>" --feature "<feature>" --task "<task-id>" --state complete \
    --breakdown "<absolute Task Breakdown path>" --head "<git HEAD sha>" \
    --payload '{"platform":"…","filesChanged":[…],"standardIds":[…],"validation":[{"command":"…","result":"pass"}],"acceptanceCriteria":[{"criterion":"…","met":true}],"developerTesting":{…},"deviations":[],"blockers":[]}'
  ```

  **A terminal `complete` may only be written after the verification above succeeds.** The helper enforces this structurally: it refuses `complete` unless every acceptance criterion is recorded and met and at least one validation entry is present, returning `refused: complete-without-verification`. If it refuses, report that verbatim and record `failed` instead.

  **Every validation the report cites must still hold.** On a resumed run, a result carried forward is valid only while its covered files and planning basis are unchanged; anything in `validations.rerun` must have been re-run and checkpointed. The helper refuses `complete` citing a recorded validation that no longer holds (`refused: complete-with-stale-validation`) — re-run it rather than restating the old result.

**Accessibility and verification debt.** `standards/shared/verification.md` owns the
Tier 1 / Tier 2 / Tier 3 vocabulary; do not restate it here or in a platform skill.

- **Tier 1 and Tier 2 checks** — what the plugin actually ran and read a result from — go
  in `accessibility.checks`. A **failing** Tier 1/2 check blocks `complete`: record
  `failed`.
- **Tier 3 requirements** — a VoiceOver or TalkBack walkthrough, whether a label is
  *meaningful*, whether an announcement is actually heard, focus restoration after a modal
  dismiss, carousel behaviour with a screen reader active — have **no headless mechanism**
  and are never recorded as checks. Each becomes a `verificationDebt` entry with
  `domain: "accessibility"`, the rule it serves, the verification required, why the plugin
  cannot perform it, and `owner: "qa"`. **Outstanding debt does not block `complete`** —
  making it block would tie completion to device availability rather than to the state of
  the code.
- **Never present automated evidence as screen-reader proof.** A green audit means no
  detected defect on the surfaces the run reached. It is not evidence that VoiceOver or
  TalkBack was run, and `A11Y-SR-1` can never be satisfied by a Tier 1 or Tier 2 check
  (`VERIFY-2`). The helper refuses this structurally rather than trusting the report.

The payload carries both fields; keep the shape exactly as below (the helper validates it
and refuses a malformed block whatever the state):

```json
{
  "accessibility": {
    "applicable": true,
    "reason": null,
    "deviceType": "mobile",
    "standardIds": ["A11Y-ROLES-1", "A11Y-COLLECTION-1", "AND-UI-A11Y-7"],
    "checks": [
      { "ruleId": "A11Y-ROLES-1", "tier": 1, "result": "pass", "evidence": "<what was run>" }
    ]
  },
  "verificationDebt": [
    {
      "domain": "accessibility",
      "ruleId": "A11Y-SR-1",
      "requiredVerification": "TalkBack walkthrough of the changed flow",
      "whyNotAutomatable": "TalkBack cannot be driven headlessly; announcement audibility is not observable in an instrumented run",
      "owner": "qa",
      "status": "pending"
    }
  ]
}
```

**Developer testing.** The payload of every terminal write carries the `developerTesting`
decision. The helper refuses `complete` without it (`refused:
complete-without-developer-testing`), and refuses a malformed one in any state
(`invalid-developer-testing`):

- **Not required**, or a framework exists but **no test was added or updated** → a
  `justification` is required.
- Each entry in `runs` is a developer test that **actually ran**, with result `pass` or
  `fail`, and must also appear with the same result in `validation`. A failing run blocks
  `complete`: record `failed`.
- **Required but not run** (or not writable) → a `notRunReason` and a `verificationDebt`
  entry with `domain: "developer-testing"`, `ruleId: "VERIFY-4"` and `owner: "developer"`.
  That debt is the developer's, never QA's; like all debt it does not block `complete`.

```json
{
  "developerTesting": {
    "framework": "<detected in-repo test framework, or null>",
    "required": true,
    "testsChanged": ["<test file added or updated>"],
    "justification": null,
    "runs": [{ "command": "<narrowest test command actually run>", "result": "pass" }],
    "notRunReason": null
  },
  "verificationDebt": [
    {
      "domain": "developer-testing",
      "ruleId": "VERIFY-4",
      "requiredVerification": "<the developer tests still to write or run>",
      "whyNotAutomatable": "<why they could not be written or run here>",
      "owner": "developer",
      "status": "pending"
    }
  ]
}
```

The debt entry appears only when required tests did not run; the example shows both
shapes together.

Choose validation commands from the repository's own tooling. Do **not** assume or
introduce a particular automation framework; if the repository has no mechanical
accessibility check, say so and record the requirement as debt rather than inventing a
tool to satisfy it.

- **Verification failed** → record `failed` with the failing criteria and validation results in `blockers`.
- **A blocker or unproven dependency stopped the run** → record `blocked` with the blocker text.

The recorded `filesChanged`, `standardIds`, `validation`, `acceptanceCriteria`, `accessibility`, `developerTesting` and `verificationDebt` are what `/create-dev-qa-notes` later reads, so a QA handoff — including the list of accessibility verification still owed — no longer depends on a session transcript.

Do not report success if any acceptance criterion failed, required validation failed, a dependency is unproven, a blocker remains, the implementation deviates from the DD without approval, or changes exist only inside a worktree. **Approval is unaffected: recording lifecycle state neither confers nor revokes any document's `status`.**

## Responsibility boundary

This command orchestrates (task-id resolution, repo-root resolution via the helper, document-path resolution, approval/dependency/blocker checks, upstream-chain reconciliation, the resume verdict, platform routing, hook gating, invoking the correct agent+skill, passing resolved context, and recording lifecycle state through `scripts/task-state.ts` — it is the only lifecycle writer: start, resume, restart, abandon, complete, failed, blocked). The shared implementation methodology may only append checkpoints to the run this command started. It does **not** contain Android/iOS/RN/React coding methodology, architecture guidance, review methodology, or the implementation logic itself — those live in the platform feature-implementation skills.
