# Platform Guardian integration — what changes with ono-mobile-dev-plugin 0.8.0

**For:** the Platform Guardian maintainer · **From:** ono-mobile-dev-plugin 0.8.0 · **Guardian baseline:** 0.6.0 (`routes.json` `verifiedAgainst` 0.7.7)

0.8.0 moves the Pre-PR regression check into this plugin, makes the internal code review mandatory for feature work as well as bug work, requires the planning and review documents to be part of the pull request, and adds a read-only contract the Guardian queries before it opens a pull request. **Nothing in the Guardian was changed by this release.** The changes below are the Guardian's to make, ideally in a release shipped together with 0.8.0.

## Responsibilities (agreed)

| Platform Guardian | ono-mobile-dev-plugin |
|---|---|
| Task routing | Bug Flow and Feature Flow |
| Discovering pending PR review requests, and presenting them | Developer testing, internal code review (`/review-code`) |
| Branch protection; commit and push authorization | Pre-PR (`/pre-pr`) — the only Pre-PR for repositories that use this plugin |
| Pull request creation | Developer-owned QA handoff preparation (`/create-dev-qa-notes`) |
| Enforcing PR readiness — by reading this plugin's readiness contract | Independent PR code review (`/review-pr`) |
| — | PR readiness evidence (`scripts/pr-readiness.ts`) |

The Guardian performs no code review and generates no Pre-PR. This plugin discovers no review requests. Neither duplicates the other's implementation.

The resulting workflow:

```
Development (/implement-task) → Developer testing → Internal code review (/review-code --bug | --feature)
→ Pre-PR (/pre-pr, this plugin) → [bug: QA handoff, /create-dev-qa-notes]
→ Commit · readiness check · push · PR (Guardian) → Independent PR review (/review-pr) → Human approval
```

## 1. Remove the Guardian's own Pre-PR implementation

- **Session closer step 4b** — remove the `platform-guardian:pre-pr` run. Pre-PR now happens before the session closer, in `/pre-pr`, and the closer only reads its result (step 3).
- **`skills/pre-pr/`** — remove the Guardian's copy. The original skill now ships, unchanged, as this plugin's internal `regression-checklist` skill.
- **`prompt-submit.sh` `routed()`** — drop `platform-guardian:pre-pr` from the routed set.
- **No fallback Pre-PR.** Do not keep the Guardian's skill as a fallback for repositories without this plugin: a second implementation would compete with this one. A repository that does not use this plugin (no Ono work, or the plugin not installed) **is not blocked** for missing Pre-PR evidence — the PR proceeds as it does today (§3, `managed: false`).

## 2. Route Pre-PR to this plugin

In the work router and `routing/routes.json`, the Pre-PR intent ("pre-PR", "before I open a PR", "what could I have broken", "regression checklist", "ready for PR") routes to:

```
/ono-mobile-dev-plugin:pre-pr bug:<bug_key>
/ono-mobile-dev-plugin:pre-pr feature:<feature>
```

It refuses until development, developer testing and a fresh internal review with no Blocking finding are done, and says which command comes first — the router does not need to check that. The command is model-invocable, so the closer may start it for the developer.

**Comparison scope — `--base`, not a commit list.** `/pre-pr` (and the readiness check) take `--base <target branch>`: the branch the pull request will target — for the Guardian, its central branch. The scope is then exactly what that pull request will contain: the commits from the merge base of `<target>` and `HEAD` up to `HEAD`, plus the staged, unstaged and untracked changes on top (the gate reports them as `scope.commits` and `scope.uncommitted`). Omitted, the base is resolved as `.platform-guardian.json` `centralBranch` → `origin/HEAD` → `main`/`master`/`develop`. There is no `[commits]` argument: the target branch already determines the commits, and a hand-picked list could disagree with the pull request.

**Result line.** `/pre-pr` ends with one machine-readable line, derived from its recorded result:

```
PRE_PR {"contract":1,"work":"feature:login","head":"<sha>","must":3,"should":2,"watch":1,"topRisk":"…","pdf":"/…/regression-checklist.pdf"}
```

Use it for display at close. **For any decision, use the readiness contract (§3)** — its `pre_pr` block (`status`, `counts`, `pdf_path`) is the authoritative answer and says whether the Pre-PR is still fresh for the current code. The line is not stored anywhere: nothing about the Pre-PR is written into the bug work plan, the task state or the repository.

## 3. Query the PR-readiness contract before push and PR

After the commit (closer step 4) and before the push (step 5):

```
node --no-warnings "<installPath>/scripts/pr-readiness.ts" check --root "<repository root>" --contract 1 --base "<central branch>"
```

- `<installPath>`: the `installPath` of `ono-mobile-dev-plugin@<marketplace>` in `~/.claude/plugins/installed_plugins.json` (`$CLAUDE_CONFIG_DIR/plugins/…` when set).
- `--base`: the branch the pull request targets — the Guardian's central branch. Omitted, the helper resolves `.platform-guardian.json` `centralBranch`, then `origin/HEAD`, then `main`/`master`/`develop`.
- Do **not** pass the Guardian's own `CLAUDE_PLUGIN_DATA`; the helper locates its own data directory.
- Requires Node.js 22.18+ or 24+ and git; no network; read-only; always exits 0 with one JSON object.

The full schema is [`pr-readiness-contract.md`](pr-readiness-contract.md). Branch on it:

| Result | Guardian does |
|---|---|
| `compatible: false` (`CONTRACT_UNSUPPORTED`, `CONTRACT_VERSION_REQUIRED`) | Do not push or open the PR as "ready". Tell the developer which plugin is out of date (`supported_versions` vs the version you asked for). |
| `managed: true`, `ready_for_pr: true` | Push and open the pull request with `pr_metadata.description_markdown` as its body (step 5). Show `warnings` (Major findings, UI not verified, reviewed code left uncommitted). |
| `managed: true`, `ready_for_pr: false` | Do not open the pull request. Show each `blockers[].message`; offer `next_command.display` (`{ skill, args, display }`) for the developer to run. |
| `managed: false` (`NO_ONO_WORK` warning) | Not blocked: proceed as today and show the warning — new development should go through the Ono workflow. Missing Pre-PR evidence never blocks unmanaged work. |
| `AMBIGUOUS_WORK` | Ask which work the PR is for (`candidates`) and query again with `--work <id>`. |
| `status: error` | Show `blockers[0].message`; do not claim readiness. |
| no `scripts/pr-readiness.ts` under the installPath | This plugin is older than 0.8.0: tell the developer to update it; do not assume readiness, and do not run a Pre-PR of your own. |
| this plugin not installed in the session at all | Not a managed repository: proceed as today — no Pre-PR is required and none is run. |

**Managed work keeps its gate.** When the result is `managed: true`, a missing, stale or invalid Pre-PR (`PRE_PR_MISSING`, `PRE_PR_STALE`, `PRE_PR_INVALID`, `PRE_PR_PDF_MISSING`) blocks the pull request — offer `next_command` (`/pre-pr …`); never substitute a Pre-PR of your own.

## 4. Commit the required documents with the code

Planning and review documents are now part of the pull request. When the Guardian commits Ono work, its commit hygiene must **include** these paths (they are listed per work in `documents.required` of the readiness result, and `documents.not_committed` lists the ones a commit left out):

| Work | Paths to commit |
|---|---|
| Feature | the Feature Analysis, Detailed Design, Task Breakdown and Dev Plan — generated Markdown files wherever the repository keeps them (e.g. `docs/<feature>/…`, `docs/<feature>-DD.md`), identified by `documents.required[].path`; and `docs/reviews/<feature>/review.md` |
| Bug | `docs/bugs/<bug_key>/bug-report.json`, `docs/bugs/<bug_key>/bug-work-plan.md`, `docs/bugs/<bug_key>/review-c<cycle>.md` |
| Optional, when present | `docs/qa/<feature>-qa-handoff.md`, `docs/qa/bug-<bug_key>-qa-handoff.md` |

**What each rule rests on — keep the three apart:**

- **Existing Dev Plugin contracts (0.7.7, unchanged):** the Bug Flow commits its artifacts under `docs/bugs/<bug_key>/` and the task state under `docs/tasks/` (`docs/bug-work-plan-contract.md` § *Bug evidence snapshot*, "committed"; `docs/task-state-contract.md`, "committed to Git"). No existing contract says whether `docs/tasks/bugs/<key>.cycle-approval.json` is committed; it is recomputed from the plan on every check, and the readiness contract neither requires nor rejects it.
- **New in 0.8.0 (this plugin):** the documents in the table above are **required** in the pull request — readiness blocks a managed workflow without them (`REQUIRED_DOCS_MISSING`, `REQUIRED_DOCS_NOT_COMMITTED`). Pre-PR output is never in the repository at all: it lives in the plugin's data directory.
- **Proposed for the Guardian:** keep excluding atomic-write temp files (`*.tmp` — `.<key>.task-state.tmp`, `.<key>.cycle-approval.tmp`, `*.bug-review.tmp`, `*.feature-review.tmp`, `*.qa-handoff.tmp`, `*.pre-pr.tmp`), which exist only for the instant of a write; whether to commit the task-state stores and cycle approvals stays the Guardian's current policy — 0.8.0 does not depend on it.

In `routing/committed-artifacts.json`, move the plugin's planning and review documents from "kept out" to "committed". A readiness result with `REQUIRED_DOCS_NOT_COMMITTED` after the Guardian's commit means the hygiene rules still exclude one of them.

## 5. Use the generated PR description

- `gh pr create --base <target> --body-file <file holding pr_metadata.description_markdown> --title <pr_metadata.title_suggestion>` instead of `--fill`.
- Bitbucket (no `gh`): keep giving the compare link, and print `description_markdown` for the developer to paste. Creating Bitbucket pull requests through the API is a separate Guardian decision — it needs a write-scoped token, which `/review-pr` deliberately never uses.
- Until the Guardian does this, `/pre-pr` prints the same description (`pr-readiness.ts describe`) for manual use.

## 6. Specification and Figma references in the description

Already in `description_markdown`, under the stable heading `### Ono references (v1)`: the source specification, the Feature Analysis, Detailed Design, Task Breakdown and Dev Plan (or Bug Report and Fix Plan), the internal review record, the acceptance criteria of the tasks in the PR, and the Figma URL with its node id. Repository documents are linked at the commit (`https://bitbucket.org/<ws>/<repo>/src/<sha>/<path>`), so they resolve once the Guardian has pushed. Figma is never copied into the repository. Nothing is invented: a missing or unreadable reference appears in `pr_metadata.warnings` and as a ⚠️ line. Do not rewrite the section — `/review-pr` reads it back.

## 7. Feature and bug routing

`routing/routes.json`:

- **Feature pipeline:** `/analyze-feature` → (human approves) → `/dev-design-start` → (human approves) → `/dev-feature-start` → (human approves) → `/implement-task <feature> T<n>` … → **`/review-code --feature <feature>`** → **`/pre-pr feature:<feature>`** → ready for PR (session closer).
- **Bug pipeline:** … → `/verify-fix-cycle bug:<key>` → `/review-code --bug <key>` → **`/pre-pr bug:<key>`** → `/create-dev-qa-notes bug:<key>` → ready for PR.
- **Resume:** `node --no-warnings "<installPath>/scripts/feature-flow.ts" status --root <repo> --feature <feature>` returns the feature's `stage`, the human approval it waits on (`waiting_on[].where` = `<path>:<line>`), and `next_command`. It replaces inferring the feature stage from document frontmatter, and it knows whether the review was done ("no file records it" no longer applies: `docs/reviews/<feature>/review.md` does).
- `humanOnly.approvalEdits` is unchanged: the plugin still never sets a planning document's `status`.
- Bump `verifiedAgainst` to 0.8.0; the daily drift check (`check-routes.sh --strict`) flags 0.8.0 until then.

## 8. Independent PR review — invoke `/review-pr` for the selected pull request

Guardian 0.6.0 finds the pull requests waiting for the developer's review (`scripts/review-requests.sh`) and presents them. When the developer selects one, invoke, **with the selected URL unchanged**:

```
/ono-mobile-dev-plugin:review-pr <exact PR URL>
```

```
/ono-mobile-dev-plugin:review-pr https://github.com/owner/repo/pull/12
/ono-mobile-dev-plugin:review-pr https://bitbucket.org/workspace/repo/pull-requests/12
```

| The Guardian | |
|---|---|
| **does** | pass the URL exactly as `gh` (or Bitbucket) returned it — no rewriting, no PR number alone; check that the installed plugin has `commands/review-pr.md` under its `installPath` (0.8.0+), and otherwise tell the developer to update `ono-mobile-dev-plugin` (`/plugin` → **Installed** → update, or marketplace auto-update) instead of offering the review |
| **does not** | check out the PR branch (`gh pr checkout`), require a clean working tree, switch back afterwards, pass or prompt for any credential, run `/review-code` on the PR, or review the PR itself |

What `/review-pr` does with it: it detects the provider from the URL, reads the pull request's metadata, diff and files **from the provider, without checkout** — it works the same when the developer has uncommitted changes, is on another branch, or is in another repository — and pins the whole review to the head and base commits it captured at the start (if the author pushes meanwhile, the report says which commit it covers and suggests a rerun). It reads the specification and Figma frames the pull request references, reports only verified, high-signal findings (or "No actionable findings."), and never comments, approves, requests changes, merges or writes. The decision stays the developer's.

**Authentication** — nothing for the Guardian to pass:
- GitHub: the developer's existing GitHub CLI login (`gh auth login`) — the one the Guardian already uses to find the requests.
- Bitbucket Cloud: `BITBUCKET_API_TOKEN` (an Atlassian API token with `read:pullrequest:bitbucket` and `read:repository:bitbucket`; `BITBUCKET_EMAIL` optional, for Basic authentication) in the environment.

When it is missing, `/review-pr` says exactly what to do; it never asks for a token in the chat. The Guardian's protections do not need to change: the command never writes, commits, pushes, comments, approves, declines or merges.

**Not `/review-code`.** `/review-code` is the developer's internal review of their own changes in the current checkout. Given a pull request URL, it now stops and offers `/review-pr <URL>` (it never treats the URL as a diff baseline). There is no `--pr` option, and none is planned.

## 9. Incompatible versions

| Guardian | Dev plugin | Behaviour |
|---|---|---|
| current (runs Pre-PR) | 0.8.0 | Works; the developer may see two Pre-PR offers — `/pre-pr` tells them to answer **skip** in the closer's. |
| 0.6.0 (`/review-code <PR url>` after `gh pr checkout`) | 0.8.0 | `/review-code` stops on the URL and offers `/review-pr`. Switch to §8 — no checkout. |
| updated (queries the contract) | < 0.8.0 | No `scripts/pr-readiness.ts`: tell the developer to update the plugin. Never assume ready, never run the old Pre-PR as a fallback. |
| updated | 0.8.0 | `--contract 1`. |
| asks `--contract 2` (future) | 0.8.0 | `compatible: false`, `CONTRACT_UNSUPPORTED`, `supported_versions: [1]` — update the plugin. |

The contract version changes only on a breaking change, and the plugin then answers the previous version too for at least one release (`pr-readiness-contract.md` § Compatibility).

## 10. No duplicate Pre-PR

- The vendored skill is internal (`user-invocable: false`) and its description carries none of the Pre-PR trigger phrases, so it never races the Guardian's `platform-guardian:pre-pr` skill on a phrase.
- `/pre-pr` ends by telling the developer to answer "skip" if the closer offers its own pre-PR check.
- The updated closer reads `pre_pr.status` from the readiness result instead of running one; the session log's "pre-PR" line comes from `pre_pr.counts` (`must` / `should`) or "not run".
- Ship the Guardian change in the same release window as 0.8.0.

## Unchanged

The Guardian's protected-branch rules (`main`/`master` and the central branch), write guards, secret scanning and commit hygiene for everything not listed above. This plugin's own `block-main-branch-changes`, `protect-secrets` and `require-approval-before-code` hooks keep their behaviour; the code-edit hook's ask now names the Ono command that starts or continues the work, and it never routes.
