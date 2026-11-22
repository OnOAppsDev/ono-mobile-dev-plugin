---
description: Review the current changes against the org's shared and platform-specific mobile/web standards — with --bug or --feature, also persist the work's internal review record.
argument-hint: [scope] [--bug <bug_key> | --feature <feature>]
---

**Node.js preflight — first, before any plugin script.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/node-preflight.mjs"`. If it exits non-zero, stop: show the developer its `message` verbatim and run nothing else — this command's helper scripts cannot run on that Node.js (README § Requirements).

Review the current changes for correctness, style, standards-adherence, and performance.

1. Resolve the review scope: if `$ARGUMENTS` is given, treat it as a path, branch, or PR reference to diff against; otherwise default to the current diff against the repo's base branch.
2. Invoke `repo-analyst` to establish the base repo classification (including the RN-native-shell linkage check) if not already known this session, then attribute each changed file to a platform using the file-attribution rule (iOS: under an iOS project tree or `.swift`/`.m`/`.mm`/`.h`; Android: under `android/` or `.kt`/`.java`; React: in a React-web workspace; otherwise react-native). Do not reimplement platform classification from scratch in this command.
2a. **Resolve Project Knowledge for the changed files, once.** Apply the `repo-knowledge-consumer` skill with the changed paths (its Step 3d): it reports which surfaces, shared code and capabilities each changed file falls under. For each surface the change touches, resolve its convention overrides (Step 3b); for each capability it touches, its direct relationships (Step 3c). Hand each platform's agents only the context for the files attributed to that platform: the relevant surface conventions, the project architecture conventions (`docs/project/patterns.md`), and the capability relationships the change sits on. The diff and the current code are judged first — Project Knowledge tells the reviewer what the repository's established convention is and which adjacent capabilities a change can reach; it never outranks what the code shows, and a relationship is never by itself a finding. When knowledge is unavailable or a category is derive-live, the review establishes convention from the surrounding code exactly as before.
3. **Always** load the shared standards: `standards/shared/accessibility.md` and `standards/shared/i18n-rtl.md`.
3a. **Load `standards/shared/tv-baseline.md` only when** the review establishes a TV surface for the changed files (per the resolved lane's `device_type` section — surface attribution with `formFactor: tv`, or TV evidence in the code). Never load it for a mobile-only review.
4. Load platform-specific standards only for platforms actually touched: `standards/react-native/*` (rn-coding-standards.md, rn-api-service-layer.md, rn-state-management.md, rn-architecture.md, rn-navigation.md, rn-performance.md), `standards/ios/*`, `standards/android/*`, `standards/react/*` — do not mix in a platform's standards for files it doesn't own.
5. For each touched platform, invoke the `code-reviewer` agent (correctness/style/standards) and the `performance-reviewer` agent (platform-specific performance concerns), each applying the shared `platform-review` methodology against **exactly one** resolved platform review lane:

   | Touched platform | Agents | Shared methodology | Platform lane |
   |---|---|---|---|
   | `react-native` | `code-reviewer` + `performance-reviewer` | `platform-review` | `rn-code-review` |
   | `android` | `code-reviewer` + `performance-reviewer` | `platform-review` | `android-code-review` |
   | `ios` | `code-reviewer` + `performance-reviewer` | `platform-review` | `ios-code-review` |
   | `react` | `code-reviewer` + `performance-reviewer` | `platform-review` | `react-code-review` |

   **Run each touched platform's pair independently** — one isolated invocation per platform, each carrying one lane. The agents and `platform-review` are platform-independent; the lane is the only source of platform content, and no other platform's lane or standards may be loaded. The two passes stay independent of each other, so a performance-only change is never miscategorised as a correctness finding.

   **The out-of-lane and modernization policy belongs to the lane, not to `platform-review`.** It differs by platform today — React Native permits a one-line out-of-lane aside, iOS, Android and React forbid any aside or modernization observation anywhere in the output — and `platform-review` is deliberately neutral on it. Read the resolved lane's policy and follow it exactly; never infer a default, and never normalise the lanes in either direction.

   - **Readiness gate (any platform).** Before invoking a platform's pair, check the **resolved platform lane** for the placeholder marker — a frontmatter `description` ending "not yet authored, currently a structure-only placeholder" **and** a `## Status: Not yet authored` heading. Match on those markers only, never on the phrase appearing in ordinary prose (an authored skill may legitimately mention "structure-only placeholder" when telling an agent to stop if a *standards* file is one). If present, **do not abort the review and do not route to the placeholder.** Exclude that platform's files from this step, review every authored platform in full, and record the exclusion in Scope and as an explicit **Unreviewed** entry naming the platform and the reason. An excluded lane is a **declared gap, never a silent pass**, and this exclusion is intended behavior rather than a routing failure. (When a lane is later authored and the marker is gone, the route opens automatically.) **No lane is gated today** — `react-native`, `ios`, `android` and `react` are all authored. The gate is retained because it is the invariant, not a note about any one platform: a lane added or reverted to placeholder state is caught here automatically, with no edit to this command.
6. Merge all agents' output into a single `templates/code-review-template.md`, keeping **severity as the primary organizing axis** even for a mixed-platform diff — tag each finding inline with `[platform]` rather than sectioning the whole document by platform. Note the platform(s) reviewed in Scope.

This command is complementary to `/review-security`, not a replacement for it — a full Review-stage pass runs both. Do not duplicate security commentary here; that belongs to `/review-security`'s reviewer. Findings here are strictly correctness/style/standards/performance, cited against the standards loaded above.

## Bug review (`--bug <bug_key>`)

Without `--bug`, nothing in this section applies: the review above is the whole command, unchanged. With it, the same review runs over the current bug fix, and its result is persisted as the bug's review record for the current fix cycle (`review-c<fix_cycle>.md`: a cycle-1 review never stands for cycle 2). There is no separate bug review engine.

1. **Resolve `TARGET_ROOT`** exactly as `/implement-task` §2 does (`scripts/resolve-target-repo-root.ts`). Remove `--bug <bug_key>` from `$ARGUMENTS` before step 1 resolves the scope.
2. **Read the bug's review context:**

   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/bug-review.ts" context bug:<bug_key> --root "<TARGET_ROOT>"
   ```

   It always exits 0 and prints one JSON object. Act on `outcome`:

   | `outcome` | Do |
   |---|---|
   | `BUG_REVIEW_READY` | Continue. Show `incomplete_tasks` in one line if any task of the cycle is not complete. |
   | `BUG_PLAN_MISSING` · `BUG_PLAN_INVALID` · `BUG_PLAN_NOT_APPROVED` · `BUG_APPROVAL_STALE` · `BUG_APPROVAL_INVALID` | **Stop** and give the `route`: the bug is (re)planned and approved through `/analyze-bug`. |
   | `BUG_TASK_STATE_MISSING` | **Stop.** Nothing has been implemented for this cycle yet; give the `route` (`/implement-task bug:<bug_key> T1`). |
   | `BUG_VERIFICATION_REQUIRED` | **Stop.** The cycle has no current, passed consolidated developer verification (`verification.status`: missing, stale, incomplete or failed). Review never bypasses it: offer `next_command`, `/verify-fix-cycle bug:<bug_key>`, under the Continue rule below. |
   | `BUG_WORK_ID_INVALID` · `BUG_ROOT_INVALID` · `BUG_REPOSITORY_UNAVAILABLE` | **Stop** and report `reason`. |

   The bug's evidence is its canonical snapshot (`evidence_snapshot`, from `docs/bugs/<bug_key>/bug-report.json`) — never re-read from the original source, and no `--report` or `--qa-repo` is needed. The QA state is not re-read here. The review is about the implementation now in the repository, against the plan that was approved for it.
3. **Steps 1–6 run as written**, over the default scope (the current diff against the base branch), with the same `code-reviewer` and `performance-reviewer` agents, the shared `platform-review` methodology and one lane per touched platform. Each platform's pair also receives the bug context from step 2:
   - the bug identity, reproduction evidence and Observed vs Expected;
   - Root Cause (and `root_cause_inference`), Fix Design, its minimal change surface and **non-goals**, and the Verification Strategy;
   - each task's row and recorded developer-testing evidence;
   - the affected surfaces and capability, the Blast Radius, and the Repo Knowledge Reference.

   Step 2a's Project Knowledge is limited to what the plan already records: the capability and its **first-degree** relationships named in the plan. Never expand the graph from here.
4. **The four bug-specific checks** are run once over the merged review, as `skills/platform-review/SKILL.md` § *Bug review* defines them: `root-cause`, `reproduction-path`, `plan-conformance` and `regression-risk`. A concern is filed as an ordinary finding, citing its `BUG-CHECK-*` rule, with the usual severity, location and remediation. Platform and shared rules apply exactly as today.
5. **Merge** into `templates/code-review-template.md` as step 6 says. That document is the review.
6. **Persist the record.** Write the merged result as JSON, outside `TARGET_ROOT` (the session's scratch directory):
   - `binding`: exactly the object step 2 returned;
   - `reviewed_by`: the reviewers;
   - `generated_at`: the current UTC time;
   - `findings`: every finding, with `severity`, `platform`, `path`, `line`, `rule`, `description` and `remediation`, as in the template;
   - `checks`: `{ id, status, note }` for each of the four.

   Then run:

   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/bug-review.ts" record bug:<bug_key> --root "<TARGET_ROOT>" --review "<review json>"
   ```

   It writes `docs/bugs/<bug_key>/review-c<fix_cycle>.md` atomically, replacing an earlier record of the same cycle. It refuses, and writes nothing, when the code, plan or task state moved since step 2 (`REVIEW_STATE_MOVED` — review again) or when a finding or check is malformed. Report a refusal verbatim.
7. **Report** the record path and its counts. `verify` says later whether the record still describes the code, plan and task state:

   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/bug-review.ts" verify bug:<bug_key> --root "<TARGET_ROOT>"
   ```

The record is evidence of the latest review for the cycle. It does not approve a QA handoff: what its findings mean for a handoff is decided in a later step of the Bug Development Flow. This command never writes task state and never creates a git commit.

**Continue.** Once `record` reports `BUG_REVIEW_RECORDED`, offer its `next_command` — the Pre-PR regression checklist, `/pre-pr bug:<bug_key>`, which then offers the QA handoff — in one short message: `✓ Review recorded (<counts>). Next: Pre-PR regression checklist. Continue?` Chain only on an explicit yes. Then invoke the Skill tool with `skill` set to `next_command.skill` and `args` set to `next_command.args`, verbatim; never a bare command name, and the developer never retypes it. If that invocation is unavailable or fails, show `next_command.display` as the command to run, and never guess another. On `BUG_TASK_STATE_MISSING`, the same applies to the context's `next_command`. The next command re-runs every one of its own gates, so chaining never replaces an approval: the QA handoff still asks its own approval (`docs/command-handoff.md`).

## Feature review (`--feature <feature>`)

Without `--feature`, nothing in this section applies. With it, the same review runs over the code of the pull request the feature's branch would open, against the feature's approved specification, and its result is persisted as the feature's internal review record, `docs/reviews/<feature>/review.md`. There is no separate feature review engine: the agents, `platform-review`, the lanes, the standards and the severity model are the ones above, and the record uses the bug record's findings model. The internal review is **mandatory** before `/pre-pr` and before a pull request.

1. **Resolve `TARGET_ROOT`** exactly as `/implement-task` §2 does. Remove `--feature <feature>` from `$ARGUMENTS`; the scope is not the step 1 default, it is the pull request's.
2. **Read the review context:**

   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/feature-review.ts" context --root "<TARGET_ROOT>" --feature "<feature>" [--base "<target branch>"]
   ```

   It always exits 0 and prints one JSON object. Act on `outcome`:

   | `outcome` | Do |
   |---|---|
   | `FEATURE_REVIEW_READY` | Continue. Show `scope.unattributed` in one line when it is not empty — those files are reviewed and reported, never dropped. |
   | `FEATURE_PLAN_MISSING` · `FEATURE_PLAN_NOT_APPROVED` | **Stop.** Name the document and its `status:` line (`waiting_on`); approval is a human step and is never set here. |
   | `FEATURE_UPSTREAM_STALE` | **Stop** and offer `next_command`, the earliest stale stage. |
   | `FEATURE_TESTING_REQUIRED` · `FEATURE_TASK_STATE_MISSING` | **Stop.** Implementation and developer testing come first; offer `next_command`. |
   | `FEATURE_NOTHING_TO_REVIEW` | **Stop**: the branch has no code change against its target. |
   | `FEATURE_DOCS_AMBIGUOUS` | **Stop**, list `candidates` and ask which document is meant; pass it back as `--doc`. |
   | any other | **Stop** and report `reason`. |

3. **Steps 1–6 run as written**, over exactly `scope.code_files` (the pull request's code: committed on the branch since the merge base with `scope.base.branch`, plus staged, unstaged and untracked changes), with the same agents, one lane per touched platform. Each platform's pair also receives, as context:
   - the specification — the Feature Analysis (and its `source_link`), the Detailed Design (approach §19, impacted modules §20, acceptance criteria mapping §25, non-goals), the Task Breakdown and the Dev Plan — from `documents`;
   - each scoped task's row, acceptance criteria and recorded developer-testing evidence (`tasks`);
   - the design reference (`design`).

   The whole specification is context; the findings are about the pull request's code.
4. **Read the design from its source of truth.** When `design.figma` is set, read **exactly** that node through the Figma MCP — `get_design_context`, `get_metadata` and `get_screenshot` with `design.figma.file_key` and `design.figma.node_id` (another node of the same file is not the design) — and compare the implemented UI with what came back. For another reference type, read the recorded `design_reference`. **Keep the read as evidence** (ENG-003, exactly as `/analyze-feature` step 6 does): one JSON file outside `TARGET_ROOT`, shaped as `design.evidence_format` says — `{ "source": "<the Figma URL>", "parts": [{ "name": "get_design_context", "content": "<raw output>" }, { "name": "get_metadata", "content": "<raw output>" }] }`; the screenshot is for comparison only. When the MCP returns an error, save `{ "error": "<the message>" }` instead. Never copy a Figma file, screenshot or exported asset into the repository. Record every read attempt for step 6 (`design_access`). **When the read fails or access is denied, say so, record it, and never claim UI conformance:** the `ui-reference` check is then `not-verifiable`, and no design detail is invented.
5. **The four feature-specific checks** run once over the merged review, as `skills/platform-review/SKILL.md` § *Feature review* defines them: `acceptance-criteria`, `design-conformance`, `ui-reference` and `developer-testing`. A concern is filed as an ordinary finding citing its `FEATURE-CHECK-*` rule.
6. **Persist the record.** Write the merged result as JSON outside `TARGET_ROOT` (the session's scratch directory): `binding` exactly as step 2 returned it; `reviewed_by`; `generated_at` (UTC); `findings` (as for `--bug`); `checks` (`{ id, status, note }` for each of the four; `ui-reference` is `not-applicable` only when `design.design_reference_status` is `not_required`); `design_access` — one `{ reference, node_id, status: retrieved | unavailable | denied | not-attempted, note }` per design read. Then run:

   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/feature-review.ts" record --root "<TARGET_ROOT>" --feature "<feature>" --review "<review json>" [--design-evidence "<evidence file from step 4>"] [--base "<target branch>"]
   ```

   It writes `docs/reviews/<feature>/review.md` atomically. It refuses, and writes nothing, when the reviewed state moved since step 2 (`REVIEW_STATE_MOVED` — review again), when a check or finding is malformed, or when `ui-reference` passes without proof of the read: the evidence is verified by `scripts/task-resume.ts` (`evidenceFingerprint`) against the exact Figma file and node, and checked against the design the Feature Analysis recorded. A reported `retrieved` status is never proof. The record's `design_verification` says which it was — `verified`, `local-reference`, `stale` (the design drifted from the analysis), `wrong-node`, `wrong-file`, `invalid-evidence`, `failed`, `missing-evidence`, `not-performed`, `missing-reference` or `not-applicable`. Report a refusal verbatim.
7. **Report** the record path, its counts and `ui_conformance` (`verified`, `not-verified`, `concern` or `not-applicable` — never "verified" without the design read). `verify` says later whether the record still describes the pull request:

   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/feature-review.ts" verify --root "<TARGET_ROOT>" --feature "<feature>" [--base "<target branch>"]
   ```

   It is `stale` when a reviewed file changed, a file was added to or removed from the pull request, the target's merge base moved, a planning document's body or approval changed, the design reference changed, or a scoped task's state changed. A commit of exactly the reviewed content keeps it `fresh`, and writing the record or any other Ono document never makes it stale.

**Findings and what they stop.** Blocking findings stop the flow: `/pre-pr` and the PR-readiness contract refuse them until they are fixed (`/fix-review-comments <record>`) and the feature is reviewed again. Major findings are reported in the record, the Pre-PR summary and the pull request description; there is no separate Major approval for a feature. Minor and Nit findings never block. The record approves nothing, and this command never writes task state and never creates a git commit.

**Continue.** Once `record` reports `FEATURE_REVIEW_RECORDED`, offer its `next_command` — the Pre-PR regression checklist (`/pre-pr feature:<feature>`), or `/fix-review-comments` when a Blocking finding was recorded — in one short message: `✓ Review recorded (<counts>, UI <ui_conformance>). Next: Pre-PR regression checklist. Continue?` Chain only on an explicit yes, invoking the Skill tool with `next_command.skill` and `next_command.args` verbatim, or show `next_command.display` (`docs/command-handoff.md`).
