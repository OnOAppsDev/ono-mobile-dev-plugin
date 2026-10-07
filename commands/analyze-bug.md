---
description: Prepare a bug for implementation in one flow — intake, routing, Project Knowledge, root cause, fix design, verification, tasks — ending in one Bug Work Plan and one content-bound approval.
argument-hint: <BUG-27 | qa=BUG-27 [--qa-repo=<path>] | --external=<key> --report=<path> | --origin=dev-review|dev-testing|production --report=<path>>
---

Prepare the bug named in `$ARGUMENTS` for implementation. This is the single entry point for first-time bug preparation. It produces **one** artifact, `docs/bugs/<bug_key>/bug-work-plan.md` (`docs/bug-work-plan-contract.md`), and ends with **one** human approval. It plans; it never implements, never creates task state, and never writes anywhere but that plan.

The deterministic decisions all come from `scripts/analyze-bug.ts` (`start` · `scaffold` · `check`), which runs bug intake through `scripts/bug-intake.ts`. Never re-derive in prose what a helper decided. All three helpers always exit 0 and print one JSON object, so branch on its `outcome` / `ok`.

## 1. Read the bug reference

Accept exactly one of:

- **A QA bug.** `BUG-27`, `qa=BUG-27` or `qa=BUG-27,external=PAY-1182`, plus the QA repository path, `--qa-repo=<path>`. If the path is missing, ask the developer for it once. Never search sibling folders or guess a location.
- **An external tracker bug.** `--external=<key>` (a tracker key, not a URL) plus `--report=<path>` (the report as JSON: `title`, `steps`, `expected`, `actual`, optionally `surfaces`, `found_in_build`, `environment`, `description`).
- **A Dev-discovered bug.** `--origin=dev-review|dev-testing|production` plus `--report=<path>` in the same shape.

Pass these to every helper call below as `<ref-args>`, unchanged.

## 2. Resolve one authoritative repository root

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-target-repo-root.ts" "<candidate>"
```

`<candidate>` is the developer-supplied repository path if given, otherwise the current working directory.
- **Exit `0` and `ok: true`.** Use `targetRoot` as `TARGET_ROOT` for the rest of this command.
- **Anything else.** Exit `1` or `3`, `ok: false`, or `targetIsWorktree: true`: stop and report. Never treat a `.claude/worktrees/…` path as the target.
- **`unwrapped: true`.** Tell the developer the command is targeting the main working tree.

## 3. Intake and plan state — one outcome

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/analyze-bug.ts" start <ref-args> --root "<TARGET_ROOT>"
```

`start` performs intake exactly as `scripts/bug-intake.ts` defines it. It returns intake's JSON verbatim under `intake`, then reads any existing plan:
- validates it;
- verifies its approval through `scripts/work-approval.ts`;
- compares its `bug_evidence_fingerprint` and identity with the current intake.

Act on `outcome` exactly:

| `outcome` | Meaning | Do |
|---|---|---|
| `BUG_REF_REQUIRED` · `BUG_REF_CONFLICT` · `BUG_REPORT_REQUIRED` · `BUG_ROOT_INVALID` | The request is incomplete | Report `reason` and ask for what is missing. |
| `BUG_QA_REPO_REQUIRED` | A QA ref without its repository | Ask for `--qa-repo` once, then rerun `start`. |
| `BUG_INSUFFICIENT_EVIDENCE` | Intake has no reliable evidence | **Stop.** Report `missing` (and `candidates` for an ambiguous external ref) exactly. No plan is created. |
| `BUG_QA_DENIED` | QA's **verified** state says Dev must not start: QA has not verified the bug, a fix awaits QA re-test, or the bug is closed | **Stop.** Report intake's `reason`, which names QA's next step. A verified QA denial is never overridden. |
| `BUG_REOPENED` | QA re-tested a fix and it failed, and there is no Bug Work Plan to continue | **Stop.** Report the failed build, failed surfaces, latest re-test and its evidence from `reopened`. A reopened bug continues the plan of the fix that failed, so nothing is created. |
| `BUG_CYCLE_NEW` | A **verified reopen**: QA re-tested the fix of the current cycle — which was handed to QA — and it failed | Continue at step 3a and append the next fix cycle (`next_cycle`) to the same plan. |
| `BUG_CYCLE_INCOMPLETE` | A cycle was appended and its analysis is unfinished | Continue at step 3a, item 3. Do **not** append again. |
| `BUG_REOPEN_UNMATCHED` | QA reopened the bug, but this plan's current cycle was never handed to QA | **Stop.** The reopen does not follow this plan's fix, so no cycle is appended. |
| `BUG_REOPEN_UNVERIFIED` | The current cycle was handed to QA, and QA's state is unavailable (partial context) | **Stop.** Whether QA reopened the bug cannot be verified, so no new cycle starts. Run again once QA's state is available. |
| `BUG_CYCLE_HANDED_OFF` | The current cycle is implemented and handed to QA | Do **not** regenerate. Report it; QA re-tests next, and a new cycle starts only after a verified reopen. |
| `BUG_PLAN_NEW` | No plan exists | Continue at step 4 and create the cycle-1 plan. |
| `BUG_PLAN_REGENERATE` | The evidence changed under an unapproved draft with no task state | Say which fields drifted (`plan.drift`), then continue at step 4 and regenerate the draft in place. |
| `BUG_PLAN_AWAITING_APPROVAL` | A current draft exists, or the plan was edited after approval | Do **not** regenerate. Go straight to step 9 with the existing plan. |
| `BUG_PLAN_APPROVED` | The plan is approved for its current fix cycle and still matches the evidence | Do **not** regenerate. Report the plan, its approval and the next action (`next_action`: the cycle's next task, or review and handoff once its tasks are done; `next_action_note`), then stop. |
| `BUG_PLAN_STALE` | The evidence changed under an approved plan, or under one already in implementation | **Stop.** Report `reason` and `plan.drift`. Reconciling a plan with work already approved or begun belongs to a later step. Nothing is regenerated. |
| `BUG_PLAN_INVALID` | The file at the plan path is not a valid plan for this bug | **Stop.** Report `plan.errors`. The file is never overwritten. If it is an unfinished scaffold from an interrupted run, the developer may fix it or remove it and rerun. |

**Partial QA context.** `context_level: partial` means the bug evidence verifies but QA's state does not.
- Continue. Analysis is never blocked only because QA state is unavailable.
- Keep every entry in `warnings`. The scaffold records them, and step 9 surfaces them.
- Never state, assume or write a QA state the intake did not verify.

## 3a. Reopened bug — the next fix cycle

A failed QA re-test continues the **same** bug in its next fix cycle:
- the same identity, Bug Work Plan and task-state store;
- the same routing, carried from the plan and never asked again.

Only a **verified reopen** (full QA context) after a fix this plan handed to QA starts a cycle. Partial context never does.

1. **Append the cycle.** Run (skipped for `BUG_CYCLE_INCOMPLETE`):

   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/analyze-bug.ts" append-cycle <ref-args> --root "<TARGET_ROOT>"
   ```

   It appends `### Cycle <N+1>` under `## Fix Cycles` and sets `fix_cycle: N+1`. From QA's re-test it writes:
   - the failed build and failed surfaces;
   - the failed re-test run and result, with provenance;
   - QA's notes and evidence;
   - the previous fix claims.

   It leaves every judgement label empty and asserts every earlier cycle byte-identical. The previous approval no longer matches, so the plan is `approval_stale` until step 9 approves the new cycle. Report a refusal verbatim.
2. **The evidence class (`evidence_class`).**
   - `unchanged`: the failed re-test does not change the bug's evidence. Root Cause, Fix Design and the rest of the shared analysis stay exactly as approved. Never rewrite them because QA reopened the bug.
   - `changed`: QA's evidence moved (`drift`). `append-cycle` has already refreshed Reproduction Evidence, Observed vs Expected and the evidence frontmatter, marked them refreshed, and kept their previous text in the new cycle. Refresh the earliest analysis the change makes stale (Root Cause first, then Fix Design) and mark each refreshed passage `[Refreshed in Cycle <N+1>]`, keeping the evidence labels.
3. **Analyse the failed fix.** Invoke `feature-architect` with the `platform-planning` methodology and the plan's lane (the step 7 table and readiness gate), applying `mobile-debugging` to the **failed re-test**. Fill the new cycle only, labelling every claim:
   - **Why the previous fix was insufficient**: an incomplete hypothesis, a missed path, or another contributing cause. This is the cycle's root-cause note; the shared Root Cause is not rewritten for unchanged evidence.
   - **Fix-design delta**: what changes now compared with the previous fix, not a copy of the Fix Design. Also fill **New risks**, **Changed non-goals** and **Changed affected files / areas** (write `none` when nothing changed).
   - **Verification delta**: the failed re-test path is mandatory acceptance evidence. It names the cycle task that writes or updates the regression test (or begins `Not feasible:`), and covers every failed surface.
   - **The cycle's task table**: rows `C<N+1>-T1`, `C<N+1>-T2`, … in the Task Breakdown's schema.
     - The fix task's first acceptance criterion begins `The reported reproduction path no longer fails` and names the failed path.
     - A dependency may name an earlier cycle's completed task when the work builds on it, never a later cycle.

   **Never edit an earlier cycle.** The Tasks section and every earlier `### Cycle k` are history.
4. **Continue at step 8**, then step 9. Validate and check the whole plan. In the approval summary, put the new cycle first: what failed, why, the delta, the tasks and the verification. One approval binds the plan to the new fix cycle.

## 4. Routing — platform and device type

Read `routing` from `start`:

- **`requires_confirmation: false`.** The routing is inherited. It comes either from the existing plan or from the related feature's **one approved Task Breakdown**, whose platform and device type a human confirmed at `/analyze-feature` step 2. Show it with its `source` and use it. Do not ask again.
- **`requires_confirmation: true`.** Ask once, with the same gate as `/analyze-feature` step 2. Invoke `repo-analyst` with the `mobile-repo-analysis` methodology to detect the context, then present it:

  ```
  Detected development context:

  Platform: <detected platform>
  Device type: <detected device type>

  Is this bug in this context?
  1. Yes, continue
  2. No, select another context
  ```

  The confirmed context resolves to exactly **one** platform (`react-native` / `react` / `ios` / `android`) and exactly one device type (`mobile` / `tv`). Validate the answer and re-ask on invalid input. If `repo-analyst` detected several platforms, offer no "Yes, continue" path: the developer selects one.

QA's affected surfaces (`routing.corroborating_surfaces`) are corroborating evidence only. Show them beside the detected context, but they never choose the platform or device type, and neither does Project Knowledge. When the repository declares surfaces, scope the confirmed context to one through the `repo-knowledge-consumer` skill (Step 3b). Scope is never routing.

## 5. Project Knowledge

Apply the `repo-knowledge-consumer` skill.

1. **Resolve.** Resolve `.ono/repo-knowledge.json` through its helper. When it is unavailable, say so in one line and derive everything live. That never blocks.
2. **Locate the capability (Step 3c), in priority order:**
   1. the capability bound by QA (`knowledge.capability`, with `capability_source: qa-intake`);
   2. otherwise a source path the bug evidence actually names (`--path`);
   3. otherwise normal live discovery.

   Never match by similarity.
3. **Use what it returns as context:**
   - the capability's evidence;
   - its surfaces, source roots and entry points;
   - its components and services;
   - existing tests;
   - its **first-degree** relationships, with why each matters to this bug.
4. **Respect the limits:**
   - Never follow the graph past the first degree.
   - Never expand scope to a related capability.
   - The current source wins over recorded knowledge.
   - A stale relationship is re-checked against the source, or derived live.
5. **Keep the boundary.** Project Knowledge is advisory. **Project Knowledge never decides whether the bug exists.** The bug evidence from step 3 does.
6. **Report staleness.** When the reader reports source drift, carry its `refreshRecommendation`, unchanged, into the plan's Repo Knowledge Reference and into the step 9 summary.

## 6. Scaffold the plan

Pass `--platform` / `--device-type` only when step 4 asked. Pass `--capability` only when step 5 located one that QA had not bound.

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/analyze-bug.ts" scaffold <ref-args> --root "<TARGET_ROOT>" \
  [--platform <confirmed> --device-type <confirmed>] [--capability <located id>] --author "<author>" --date <YYYY-MM-DD>
```

`scaffold` writes the draft from `templates/bug-work-plan-template.md`:
- the identity, evidence fingerprint, routing and capability in frontmatter, verbatim from intake and steps 4–5;
- `fix_cycle: 1` and `status: draft`;
- **Reproduction Evidence** and **Observed vs Expected**, with their provenance and every partial-context warning;
- the routing and capability sources in Affected Capability & Surfaces;
- every other section empty, for step 7 to fill.

It refuses:
- anything but `BUG_PLAN_NEW` / `BUG_PLAN_REGENERATE`;
- a missing or unconfirmed routing (`ROUTING_REQUIRED`);
- a value that contradicts the inherited routing (`ROUTING_CONFLICT`);
- a looked-up capability that contradicts the one QA bound (`CAPABILITY_CONFLICT`).

Report a refusal and stop. Never write the plan yourself.

Then fill the six `repo_knowledge_*` frontmatter fields exactly as the `repo-knowledge-consumer` skill's Step 6 defines them.

## 7. Analyze: root cause, fix design, verification, tasks

Invoke the `feature-architect` agent. It applies the shared `platform-planning` methodology against exactly one planning lane, resolved from the confirmed platform and never re-detected:

| Confirmed `platform` | Agent | Shared methodology | Planning lane | Status |
|---|---|---|---|---|
| `react-native` | `feature-architect` | `platform-planning` | `rn-dev-planning` | active |
| `ios` | `feature-architect` | `platform-planning` | `ios-dev-planning` | active |
| `android` | `feature-architect` | `platform-planning` | `android-dev-planning` | active |
| `react` | `feature-architect` | `platform-planning` | `react-dev-planning` | active |

**Exactly one planning lane is ever loaded.**

- **Readiness gate (any platform).** Before invoking, check the resolved planning lane for the placeholder marker. The marker is a frontmatter `description` ending "not yet authored, currently a structure-only placeholder" **and** a `## Status: Not yet authored` heading; match on those markers only. If present, **stop with: "Platform architecture methodology for `<platform>` is not yet authored"**. Do not fall back to another platform's lane. **No lane is gated today.**

Give the agent:
- the intake evidence;
- the confirmed context;
- the Project Knowledge context from step 5;
- the scaffold.

For root cause, it applies the `mobile-debugging` methodology: reproduce first, then root-cause, and never treat a symptom as the cause.

**This is not a Detailed Design.** The plan stays focused on four things: root cause, the **minimal fix**, its tests, and regression risk. There are no new screens, no architecture survey and no unrelated design.

Fill the scaffold in place. Label every repository claim with the planning lanes' existing labels: `[evidence: <path>]`, `[reused: <path>#<anchor>]`, `[inference]` or `[unknown]`.

- **Reproduction Evidence.** Record whether the bug reproduced locally.
  - If local reproduction is unavailable (no device, environment or data), say so and **continue**: reliable QA evidence is enough to plan from.
  - In that case the root cause is a hypothesis, labelled `[inference]`, and what would confirm it goes under Open Questions.
- **Affected Capability & Surfaces.** Record the Project Knowledge verification state of the capability (trusted, verified on use, or derived live).
- **Root Cause.**
  - The cause, not the symptom. Never claim it as fact without `[evidence: …]`.
  - The suspected code areas and the relevant source roots.
- **Blast Radius.**
  - Direct related capabilities only, each with why it matters.
  - Context, never automatic scope.
- **Fix Design.** Every label filled:
  - root-cause fix;
  - minimal change surface;
  - affected files / areas;
  - explicit non-goals;
  - no unrelated refactoring;
  - risks.
- **Verification Strategy.** Every label filled: reproduction path, Developer Testing, Regression test, affected surfaces, QA re-test expectation, verification debt.
  - **Regression test** names the task that writes it (or the fix task that extends an existing test).
  - Or it begins `Not feasible:` with the reason, recorded as verification debt.
- **Tasks.** Cycle-1 rows `T1`, `T2`, … in the Task Breakdown's row schema, unchanged. Every row carries the confirmed platform. Every task is implementation-ready.
  - **The fix task's first acceptance criterion begins `The reported reproduction path no longer fails`** and names that path.
  - Include a regression-test task, unless an existing test is extended inside the fix task or the plan records why a regression test cannot be written.
- **Fix Cycles.** Leave as scaffolded: no additional cycles yet. This command never appends a cycle.
- **Repo Knowledge Reference.** Use the consumer skill's Step 6 block, plus `refreshRecommendation` when present.
- **Open Questions.** What still needs a human decision. Never resolve it silently.

## 8. Validate and check

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/bug-work-plan.ts" validate "<absolute plan path>"
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/analyze-bug.ts" check <ref-args> --root "<TARGET_ROOT>"
```

Both must report `ok: true`. Fix every reported problem in the plan and run both again. Never present a plan that fails either.

## 9. One human approval

Present a concise summary:
- the bug (key, origin, context level);
- the root cause or hypothesis, with its labels;
- the fix surface;
- the risks;
- the tasks;
- the verification strategy;
- any `refreshRecommendation`.

**When intake was partial, say first that QA ownership state is unverified, and list the warnings.**

Then ask once, for the plan as written and for the approver's identity:

```
Approve this Bug Work Plan for <bug_key>?
1. Approve — as: <your name>
2. Not now — leave it as a draft
```

- **Approved.** Run:

  ```
  node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/work-approval.ts" approve "<absolute plan path>" --by "<approver>"
  ```

  - The identity is the one the human gave. It is never inferred.
  - The helper binds the approval to the plan's content, identity and cycle.
  - Never write `status` or any `approved_*` field yourself.
  - Report a refusal verbatim.
- **Declined.** Leave the plan as a draft. Say that rerunning `/analyze-bug <ref>` resumes at approval without regenerating it.

## 10. Report

Report:
- the plan path and its approval status;
- the context level and any warnings;
- the next action, `/implement-task bug:<bug_key> T1` — or `C<n>-T1` for fix cycle n.

Run it with the bug's evidence source (`--qa-repo=<path>` for a QA bug, `--report=<path>` otherwise): `/implement-task` re-reads the bug evidence and re-verifies the approval before every task (`commands/implement-task.md` §1a). This command does not invoke implementation, and it never creates task state.
