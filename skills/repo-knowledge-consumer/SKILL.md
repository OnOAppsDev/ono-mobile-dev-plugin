---
name: repo-knowledge-consumer
description: Resolves the canonical repository knowledge published by the ono-project-inspector plugin at .ono/repo-knowledge.json, decides which knowledge categories may be reused and which must still be derived live, and defines the Repo Knowledge Reference block downstream documents record instead of embedding repository facts verbatim. Used by /analyze-feature and /dev-design-start. This is the only component in this plugin that understands the manifest format. It never writes any inspector-owned artifact and never blocks a command when the manifest is absent.
---

## Purpose

Before this plugin re-derives anything about the repository, check whether the repository already has approved knowledge and reuse it. The Ono Project Inspector derives repository knowledge once, gates it behind human review, and publishes a deterministic index at `.ono/repo-knowledge.json`. Without this step, every command re-scans the repository, reaches its own conclusions, and then freezes them into per-feature documents that go stale silently.

**This skill never blocks.** A repository with no manifest is the normal case, not an error — behavior falls back to full live derivation, exactly as before this skill existed.

See `docs/repo-knowledge-contract.md` for the schema and the obligations this plugin accepts.

## Step 1 — Resolve `TARGET_ROOT`

If the calling command has already resolved `TARGET_ROOT`, use it unchanged. Otherwise run the existing helper — do not reimplement worktree logic:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-target-repo-root.ts" "<candidate>"
```

Use `targetRoot` from its JSON on exit 0. On exit 1/3, `ok: false`, or `targetIsWorktree: true`, stop and report — that failure is about the repository root, not about repository knowledge.

## Step 2 — Read the manifest through the helper

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/read-repo-knowledge.ts" "<TARGET_ROOT>"
```

The `--no-warnings` flag is part of the canonical invocation, not optional. Node emits an `ExperimentalWarning` on stderr when executing a `.ts` file directly; any caller that merges stderr into stdout would be handed non-JSON and fail to parse it, defeating the always-valid-JSON contract below.

**Never read or parse `.ono/repo-knowledge.json` yourself.** The helper is the only parser, so freshness and coverage are computed identically everywhere. It always exits 0 and always prints a JSON object — treat a non-zero exit as a broken installation, not as "no knowledge."

Read these fields:

| Field | Use |
|---|---|
| `available` | `false` → skip to Step 5 (full live derivation). |
| `reason` | Why it is unavailable: `absent`, `unparseable`, `invalid`, `schema-too-new`, `worktree`, `root-not-found`. |
| `freshness` | `fresh`, `stale-head`, `stale-artifacts`, or `unknown`. |
| `staleDetail` | Human-readable staleness explanation, when present. |
| `usableCategories` | Categories you may reuse. |
| `deriveLive` | Categories you **must** derive yourself. |
| `knowledge` | The manifest: `stack`, `commands`, `structure`, `documents`, `auditTopics`. |
| `knowledge.fingerprint.gitHead` | The recorded git HEAD — the value the citation block's `repo_knowledge_fingerprint` records. |
| `summary` | The one line to show the developer. |

## Step 3 — Reuse the usable categories

For every category in `usableCategories`, use the manifest instead of deriving it:

| Category | What you get | Read it from |
|---|---|---|
| `stack` | languages, frameworks, runtime tooling, package managers | `knowledge.stack` |
| `commands` | install / run / test / build | `knowledge.commands` |
| `structure` | repository tree, key modules, entry points | the `CLAUDE.md#…` pointers in `knowledge.structure` |
| `inventory` | existing screens, components, hooks, navigation map, known duplicates | open `knowledge.documents.inventory.path` |
| `conventions` | state management, API, navigation, styling, errors, i18n/RTL, naming, testing | open `knowledge.documents.conventions.path` |
| `integrations` | services, SDKs, auth, analytics, push, payments, env-var names | open `knowledge.documents.integrations.path` |
| `auditTopics` | which audit topics exist and their approval status | `knowledge.auditTopics` |

For a pointer category, **open the document and read the relevant section** — the manifest deliberately carries no prose. Use `anchors` to cite the exact section. Do not re-derive a fact the document already states.

**Reuse means read, not copy.** Record a citation (path plus anchor), never a verbatim paste, per Step 6.

## Step 4 — Derive only what is in `deriveLive`

A category appears in `deriveLive` when its coverage is `unknown` (the producer could not determine it) or its backing document changed since the manifest was written. Derive exactly those, and no others. Do not re-derive a category you just reused because it "seems cheap to double-check" — that is the duplication this skill exists to remove.

## Step 5 — Full live derivation when knowledge is unavailable

When `available` is `false`, behave **exactly as this plugin did before the manifest existed**: derive everything live via `repo-analyst`'s full procedure. This is a supported, first-class path — most repositories will be here.

Tell the developer once, in one line, and then proceed without further comment:

```
Repository knowledge: not available (<reason>). Deriving repository context live.
Running /inspect with the Ono Project Inspector would let this plugin reuse approved
repository knowledge instead of re-deriving it each time.
```

Never stop, never ask permission to continue, and never treat this as a warning that needs resolving.

## Step 6 — The Repo Knowledge Reference block

Any document this plugin generates that used repository knowledge records **what it used**, not a copy of it, so a later reader can resolve the same sources and tell whether they have moved since.

Frontmatter fields:

```yaml
repo_knowledge_status:      # available | unavailable
repo_knowledge_schema:      # the contract schema version, or null
repo_knowledge_fingerprint: # fingerprint.gitHead from the manifest, or null
repo_knowledge_freshness:   # fresh | stale-head | stale-artifacts | unknown | null
repo_knowledge_reused:      # comma-separated usableCategories actually used, or none
repo_knowledge_derived:     # comma-separated categories derived live, or none
```

Write the bare YAML keyword `null` (not the string `"null"`, and not an empty value) for any field that has no value. `repo_knowledge_reused` and `repo_knowledge_derived` are comma-separated category lists; write `none` only when the list is genuinely empty.

`repo_knowledge_reused` and `repo_knowledge_derived` mirror the reader's `usableCategories` and `deriveLive` verbatim — do not summarize, reorder, or abbreviate them. When knowledge is unavailable every category is derived live, so all seven are listed.

Body section:

```markdown
## Repo Knowledge Reference

Source: `.ono/repo-knowledge.json` (contract v<schema>, produced by <plugin> <version>, <freshness> @ <gitHead short>)

| Category | Reused from | Section |
|---|---|---|
| conventions | `docs/project/patterns.md` | `#state-management`, `#navigation-patterns` |
| inventory | `docs/project/components.md` | `#screens`, `#reusable-ui-components` |

Derived live for this feature: <categories, or "none">
```

When knowledge is unavailable, the frontmatter reads:

```yaml
repo_knowledge_status: unavailable
repo_knowledge_schema: null
repo_knowledge_fingerprint: null
repo_knowledge_freshness: null
repo_knowledge_reused: none
repo_knowledge_derived: stack, commands, structure, inventory, conventions, integrations, auditTopics
```

and the section reads:

```markdown
## Repo Knowledge Reference

Repository knowledge was not available (<reason>). All repository context in this document was derived live at authoring time and is a point-in-time observation.
```

That last sentence matters: it marks the content as a snapshot rather than a citation, which is the honest label for it.

## Step 7 — Report staleness, never repair it

When `freshness` is `stale-head` or `stale-artifacts`, state it in one line and recommend `/inspect-sync` (or `/inspect`). Then continue — the helper has already moved affected categories into `deriveLive`, so the work is already correct.

**Never** write, regenerate, or "fix" `.ono/repo-knowledge.json`, `CLAUDE.md`, `AUDIT.md`, `docs/project/**`, `audits/**`, or `.ono/state.json`. Those belong to the inspector. Repairing them from here would create two writers for the same file.

## Hard Constraints

- Never parse `.ono/repo-knowledge.json` directly — always go through `scripts/read-repo-knowledge.ts`.
- Never write any inspector-owned artifact.
- Never block, warn repeatedly, or ask the developer to run an inspection before continuing.
- Never re-derive a category listed in `usableCategories`.
- Never skip deriving a category listed in `deriveLive`.
- Never copy repository knowledge verbatim into a generated document — cite it per Step 6.
- **Never treat `knowledge.stack.platformHints` as the platform.** It is advisory corroboration only. The authoritative platform is whatever `repo-analyst` detects and the human confirms in `/analyze-feature`, every time, regardless of what the manifest says.
- Never use the manifest to resolve `device_type` — it carries no device information.
