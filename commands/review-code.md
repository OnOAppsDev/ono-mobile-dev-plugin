---
description: Review the current changes against the org's shared and platform-specific mobile/web standards — with --bug, also persist the bug's review record for its fix cycle.
argument-hint: [scope] [--bug <bug_key>]
---

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
   | `BUG_WORK_ID_INVALID` · `BUG_ROOT_INVALID` · `BUG_REPOSITORY_UNAVAILABLE` | **Stop** and report `reason`. |

   The QA state is not re-read here. The review is about the implementation now in the repository, against the plan that was approved for it.
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
