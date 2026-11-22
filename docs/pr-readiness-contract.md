# PR Readiness Contract

**Contract:** `ono-pr-readiness` · **Version: 1**
**Owner:** `ono-mobile-dev-plugin` (0.8.0+)
**Helper:** [`scripts/pr-readiness.ts`](../scripts/pr-readiness.ts) — metadata built by [`scripts/pr-metadata.ts`](../scripts/pr-metadata.ts)
**Consumer:** the Platform Guardian's session closer, after its commit and before it pushes and opens the pull request — see [`guardian-integration.md`](guardian-integration.md)

The one read-only question another plugin asks this plugin: **is the Ono work on this branch ready for a pull request, and what should the pull request say?**

## Invocation

```
node --no-warnings "<installPath>/scripts/pr-readiness.ts" check --root <repository> --contract 1 [--base <target branch>] [--work <bug:<key>|feature:<feature>>]
```

- `<installPath>` is this plugin's entry in Claude Code's `~/.claude/plugins/installed_plugins.json` (`ono-mobile-dev-plugin@<marketplace>`; `CLAUDE_CONFIG_DIR` relocates `~/.claude`).
- `--contract` is **required**. Without it the result is `status: contract-required`; with a version this plugin does not support, `status: unsupported-contract`. Neither is ever ready.
- `--base` is the pull request's target. Omitted, it is resolved exactly as `scripts/pr-scope.ts` does: `.platform-guardian.json` `centralBranch`, then `origin/HEAD`, then `main` / `master` / `develop`.
- `--work` names the work when more than one is on the branch (`AMBIGUOUS_WORK`). Work is identified from the branch's own changes — its planning documents, review records and task-state stores; the file claims of task-state stores the branch did not change are consulted only when the branch names no work at all.
- `--doc` names the feature's Task Breakdown when several exist (a Preserve or Version copy). Without it, the breakdown the internal review was taken against is used, when it still exists and still matches the review.
- `--data` overrides the plugin's data directory (tests). Without it the helper finds its own data directory through the plugin registry; it never reads the `CLAUDE_PLUGIN_DATA` environment variable, which inside another plugin's hook is that plugin's.
- Node.js 22.18+ or 24+ (`scripts/node-preflight.mjs`), git. No network.

It **always exits 0** and prints **one JSON object**. It writes nothing — not in the repository, not in the data directory — and runs no git command that changes anything. Branch on `ready_for_pr`, `compatible` and `blockers`, never on the exit code.

## Result (version 1)

```json
{
  "contract": "ono-pr-readiness",
  "contract_version": 1,
  "supported_versions": [1],
  "plugin": { "name": "ono-mobile-dev-plugin", "version": "0.8.0" },
  "status": "ok",
  "compatible": true,
  "ready_for_pr": false,
  "managed": true,
  "repo": {
    "root": "/abs/repo", "branch": "feature/login", "head": "<sha>",
    "base": { "branch": "develop", "ref": "refs/remotes/origin/develop", "source": "guardian-config" },
    "merge_base": "<sha>",
    "remote": { "host": "bitbucket.org", "owner": "onoapps", "repo": "yes-tv", "kind": "bitbucket" }
  },
  "work": { "type": "feature", "id": "feature:login" },
  "scope": { "code_files": 3, "committed": ["src/…"], "reviewed_files": 3, "committed_matches_reviewed": true, "not_reviewed": [], "uncommitted_reviewed": [] },
  "review": { "status": "fresh", "record_path": "docs/reviews/login/review.md", "counts": { "blocking": 0, "major": 1, "minor": 2, "nit": 0 }, "ui_conformance": "verified", "reasons": [] },
  "pre_pr": { "status": "fresh", "pdf_path": "/…/plugins/data/…/regression-checklist.pdf", "pdf_available": true, "counts": { "must": 3, "should": 2, "watch": 1, "critical": 2 }, "reasons": [] },
  "documents": {
    "required": [ { "kind": "feature-analysis", "label": "Feature Analysis", "path": "docs/login/login-feature-analysis.md", "status": "in-pr" } ],
    "missing": [],
    "not_committed": ["docs/reviews/login/review.md"]
  },
  "references": [ "… see Pull request metadata …" ],
  "blockers": [ { "code": "REQUIRED_DOCS_NOT_COMMITTED", "message": "…", "paths": ["docs/reviews/login/review.md"] } ],
  "warnings": [ { "code": "MAJOR_FINDINGS", "message": "…" } ],
  "pr_metadata": { "schema": 1, "…": "…", "description_markdown": "## …" },
  "next_command": null
}
```

| Field | Meaning |
|---|---|
| `status` | `ok` · `contract-required` · `unsupported-contract` · `error` |
| `compatible` | `false` for `contract-required` and `unsupported-contract` — the caller and this plugin do not speak the same contract; update the plugin that is out of date |
| `ready_for_pr` | `true` only when `blockers` is empty |
| `managed` | `true` — Ono work was identified; `false` — none was (`NO_ONO_WORK`); `null` — not evaluated |
| `documents.required[].status` | `in-pr` (committed on this branch) · `in-base` (already on the target, unchanged) · `uncommitted` · `missing` · `ignored` (git-ignored, so a commit can never include it) |
| `next_command` | the first blocker's command, `{ skill, args, display }` (docs/command-handoff.md) — the developer runs it; the Guardian never runs it on their behalf |

## Required documents

| Work | Required in the pull request |
|---|---|
| Feature | the Feature Analysis, Detailed Design, Task Breakdown and Dev Plan (wherever the repository keeps them — resolved from their link fields), and the internal review record `docs/reviews/<feature>/review.md` |
| Bug | the Bug Report snapshot `docs/bugs/<key>/bug-report.json`, the Bug Fix Plan `docs/bugs/<key>/bug-work-plan.md`, and the internal review record `docs/bugs/<key>/review-c<cycle>.md` |

Acceptance criteria live in the Task Breakdown (feature) and the Bug Fix Plan (bug), and are listed in the pull request description. External references — Figma, a hosted specification, a tracker — are **references**, never copied into the repository. Not required, and not judged, by this contract: the task-state store (`docs/tasks/**`, committed under the existing task-state contract), cycle approvals, and atomic-write `*.tmp` files. Pre-PR output is never in the repository: it lives in the plugin's data directory.

**A legacy bug** — its Bug Work Plan already on the target at the merge base (planned before this branch) and no evidence snapshot — does not require `bug-report.json`; the warning `LEGACY_BUG_NO_SNAPSHOT` says so. A bug planned on the branch, or a new fix cycle (which writes the snapshot with its plan), keeps the requirement.

## Blockers and warnings

| Code | Blocks | When |
|---|---|---|
| `REVIEW_MISSING` · `REVIEW_STALE` | yes | no internal review, or it no longer describes the code, specification, design or task state |
| `BLOCKING_FINDINGS` | yes | the fresh internal review has an unresolved Blocking finding |
| `PRE_PR_MISSING` · `PRE_PR_STALE` · `PRE_PR_INVALID` · `PRE_PR_PDF_MISSING` | yes | no valid, current Pre-PR with its one-page PDF |
| `REQUIRED_DOCS_MISSING` | yes | a required document does not exist or is git-ignored |
| `REQUIRED_DOCS_NOT_COMMITTED` | yes | a required document exists but HEAD does not carry its current content |
| `SCOPE_NOT_REVIEWED` | yes | committed code differs from the code that was reviewed and Pre-PR'd |
| `PLAN_NOT_APPROVED` · `FEATURE_DOCS_UNRESOLVED` | yes | a planning document is not approved, or the documents cannot be resolved |
| `AMBIGUOUS_WORK` | yes | more than one Ono work item is on the branch — query again with `--work` |
| `CONTRACT_VERSION_REQUIRED` · `CONTRACT_UNSUPPORTED` | yes | see Invocation |
| `NO_ONO_WORK` | **no** (warning) | no Ono work tracks the branch's changes — the pull request is not blocked; new development should use the Ono workflow |
| `REVIEWED_CODE_NOT_COMMITTED` | no | reviewed changes left out of the commit will not be in the pull request |
| `LEGACY_BUG_NO_SNAPSHOT` | no | a bug planned before the evidence snapshot existed — `bug-report.json` is not required |
| `MAJOR_FINDINGS` · `UI_NOT_VERIFIED` | no | reported in the pull request description |
| `DOC_MISSING` · `DOC_NOT_COMMITTED` · `DESIGN_REFERENCE_MISSING` · `DESIGN_INACCESSIBLE` · `DESIGN_NOT_VERIFIED` · `DESIGN_EVIDENCE_MISMATCH` · `DESIGN_CHANGED` · `FIGMA_NODE_MISSING` · `FIGMA_LINK_UNRECOGNISED` | no | metadata warnings (below) |

## Pull request metadata (`pr_metadata`, schema 1)

| Field | Meaning |
|---|---|
| `work`, `title_suggestion` | the work's identity and a title from its own documents |
| `references[]` | `{ kind: spec \| ui \| review, type, label, from, status, url, path?, figma?, access?, note? }` |
| `references[].status` | `linked` · `not-committed` · `missing` · `not-applicable` · `identifier-only` |
| `references[].access` | external references: `accessed` — the internal review proved the read with ENG-003 evidence of this exact Figma file and node (`review.design_verification: verified`) · `inaccessible` (the read failed) · `not-verified` (no evidence, evidence of another node or file, or a design that drifted from the analysis) |
| `acceptance_criteria[]` | `{ task, criterion }` for the tasks in the pull request |
| `review_summary`, `pre_pr_summary` | counts, UI conformance, Major findings |
| `warnings[]` | missing or inaccessible references |
| `description_markdown` | the pull request description, ready to use as the body |

Rules: a repository document is linked at the commit that carries it — `https://bitbucket.org/<ws>/<repo>/src/<sha>/<path>` (GitHub: `https://github.com/<owner>/<repo>/blob/<sha>/<path>`) — only when HEAD carries exactly the working tree's content; the link resolves once the commit is pushed. Figma keeps its original URL and node id. A bare identifier (a tracker key) is shown as text; no URL is ever built from it. No local filesystem path and no Pre-PR output appear in the description. Its `### Ono references (v1)` heading is the stable anchor `/review-pr` reads back.

## Compatibility

- **Additive changes** (new fields, new warning codes) keep version 1. A consumer ignores fields it does not know.
- **A breaking change** (a field removed or its meaning changed, a new blocking rule a v1 consumer would misread) is version 2, and this plugin then answers both `--contract 1` and `--contract 2` for at least one release.
- **The plugin does not have the script** (older than 0.8.0) — the consumer finds no `scripts/pr-readiness.ts` under the installPath: it must not assume readiness; it tells the developer to update `ono-mobile-dev-plugin`.
