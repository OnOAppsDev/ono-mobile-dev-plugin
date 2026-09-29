---
name: repo-knowledge-consumer
description: Resolves the canonical repository knowledge published by the ono-project-inspector plugin at .ono/repo-knowledge.json, decides which knowledge categories may be reused and which must still be derived live, resolves a confirmed surface's scope and a requested capability's first-degree relationships, and defines the Repo Knowledge Reference block downstream documents record instead of embedding repository facts verbatim. Used by /analyze-feature, /dev-design-start and /review-code. This is the only component in this plugin that understands the manifest format. It never writes any inspector-owned artifact and never blocks a command when the manifest is absent.
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
| `usableCategories` | Categories you may reuse — the union of the next two. |
| `trustedCategories` | Usable categories you may reuse **as-is** (Step 3). |
| `verifyOnUse` | Usable categories source drift may have moved: a **starting point only**, verified on use (Step 3a). |
| `deriveLive` | Categories you **must** derive yourself. |
| `sourceDrift` | Source drift since `fingerprint.knowledgeHead`, in the producer's vocabulary: `status` `COMPLETE` / `REFRESH_RECOMMENDED` / `BASELINE_UNKNOWN`, with `reason`, `changedSourceFiles` and `analysisSignals`. `null` when unavailable. |
| `refreshRecommendation` | The one-line refresh advice when source drift is possible, otherwise `null`. |
| `knowledge` | The manifest: `stack`, `commands`, `structure`, `documents`, `auditTopics`. |
| `extendedCategories` | The additive `surfaces` and `capabilities` categories, each `trusted` / `verifyOnUse` / `deriveLive` with its `reason`. Reported apart from the seven base categories, so an older manifest's base lists are unchanged. An older manifest reads `deriveLive` for both — derive live, never an error. |
| `surfaces`, `sharedCode`, `capabilities`, `capabilityRelationships` | The validated model, or `null` when that category is `deriveLive`. |
| `invalidRelationships` | Relationships rejected one by one (unknown type, missing endpoint, no evidence) — never context; derive them live. |
| `sourceDrift.affectedSurfaces` / `affectedCapabilities` / `affectedRelationships` | Which recorded facts the changed files fall under — where to verify first; a hint, never a verdict. |
| `knowledge.fingerprint.gitHead` | The recorded git HEAD — the value the citation block's `repo_knowledge_fingerprint` records. |
| `summary` | The one line to show the developer. |

## Step 3 — Reuse the trusted categories

For every category in `trustedCategories`, use the manifest instead of deriving it. A category in `verifyOnUse` is read the same way, but only as a starting point — Step 3a applies to it:

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

## Step 3a — Verify on use

A category lands in `verifyOnUse` when the repository's source changed after its knowledge was generated (`sourceDrift.status: REFRESH_RECOMMENDED`), or when that cannot be established (`BASELINE_UNKNOWN`). The helper marks only the categories the drift can affect — `inventory`, `conventions` and `integrations` on any source change; `stack`, `commands` and `structure` too when a build/dependency manifest or a top-level entry changed. Everything else stays in `trustedCategories`. Knowledge in `verifyOnUse` is **potentially stale, never authoritative as-is**:

1. **Use it as a starting point.** Read the cited document to learn where to look, exactly as in Step 3.
2. **Verify only the facts this feature actually uses** — the specific convention, component, integration, command or module the design or change relies on — against the current repository source. Keep verification proportional to the feature's scope. **Never re-scan the whole repository**, never re-verify a category the feature does not use, and never treat the drift as invalidating Project Knowledge wholesale.
3. **Verification succeeds** → reuse continues, but the evidence shown comes from the current repository: label the fact `[evidence: <path>]` with the current source path, never `[reused: <path>#<anchor>]` citing the stale document alone.
4. **Verification fails** (the fact no longer holds, or cannot be confirmed) → the current repository code is authoritative: derive that knowledge live, label it `[evidence: <path>]`, and record the category as derived in Step 6.

`changedSourceFiles` narrows where to look first; it is a hint, not the boundary of what verification may read.

## Step 3b — Surfaces: scope, never routing

When `extendedCategories.surfaces` is not `deriveLive`, the repository declares its
independently built targets. Surface knowledge may **corroborate** the detected context,
**scope** the work once the context is confirmed, and identify shared versus
surface-specific code, build selectors and source roots. It **may not silently choose
routing**: `platform` and `device_type` are still detected and confirmed by the human at
`/analyze-feature`'s gate every time, and `formFactor` (`handheld`, `tv`, …) is never read as
a `device_type`.

After the human confirmed the context, resolve the surface the feature targets:

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/read-repo-knowledge.ts" "<TARGET_ROOT>" --surface "<surface-id>"
```

`query.surface` returns the surface (build selector, source roots, packaging), the shared code
it builds from, and its **convention overrides**: read each shared `docs/project/patterns.md`
section, then the override `conventions.overrides` lists for it — a section with no override
is inherited. Inventory and integration rows carry a `Surface` cell; read the rows for this
surface and `all`. When more than one declared surface fits the confirmed platform, the human
picks it — never pick one here. When `verification.status` is `failed`, the surface moved:
the current source is authoritative, derive that scope live.

## Step 3c — Capability lookup and first-degree relationships

When `extendedCategories.capabilities` is not `deriveLive`, try to locate the requested
feature in the Feature & Capability Map — by **capability id**, by its exact **name**, or by a
**source root** / entry point the request names:

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/read-repo-knowledge.ts" "<TARGET_ROOT>" --capability "<id or exact name>" [--path "<repo-relative path>"]...
```

- **Deterministic identity only — never by semantic similarity.** "video" does not find "Video
  Playback", and a capability is never inferred from a description that merely sounds alike.
  Pass `--capability` only with an id or name the request actually uses.
- `query.capability.status` is `found`, `ambiguous` (the developer picks one; re-query by its
  id), `not-found`, or `derive-live`. **Not found → keep the existing live discovery exactly as
  before.** Nothing is invented to fill the gap.
- On `found`, `query.capability.context` carries the capability's evidence and its **direct
  (first-degree) relationships** — each with direction, type, evidence kind, evidence refs and
  the neighbour's id, name and anchor. It never carries a neighbour's own relationships.
- **Stale relationships are re-checked.** While `capabilities` is `verifyOnUse`, the helper has
  re-checked each relationship's evidence against the current source: `verified` holds;
  `invalid` means the source edge moved — the current code is authoritative, so derive that
  adjacency live. `context.deriveLive` lists every relationship to derive live, including those
  rejected structurally. Pass `--verify` to re-check trusted knowledge when the source you are
  reading appears to contradict it.
- **Relationships are context, not scope.** Report the adjacent capabilities they point at and
  why each matters to this feature; the developer and architect decide the actual scope. Never
  traverse beyond first degree, never compute impact scores, never modify an unrelated feature
  because an edge exists, and never treat `related_to` as proof of impact.

## Step 3d — Path scope

`--path` (repeatable) returns, for each path, the surfaces, shared-code root and capabilities it
falls under — how `/review-code` scopes Project Knowledge to the files a change touches. A
path under no recorded root is reported with empty lists, never guessed.

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

`repo_knowledge_reused` and `repo_knowledge_derived` mirror the reader's `usableCategories` and `deriveLive` verbatim — do not summarize, reorder, or abbreviate them. The one exception is Step 3a: a `verifyOnUse` category whose verification failed moves from `repo_knowledge_reused` to `repo_knowledge_derived`. In the body table, a `verifyOnUse` category that passed verification lists the current source paths it was verified against, with `verified on use` in the Section column. When knowledge is unavailable every category is derived live, so all seven are listed.

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

When the feature used surface or capability knowledge, add one line each under the table —
`Surface: <id> (<trusted | verified on use>)` and `Capability: <id> — docs/project/capabilities.md#capability-<id>` —
and list `surfaces` / `capabilities` in `repo_knowledge_reused` (or `repo_knowledge_derived` when
Step 3a/3c verification failed). They are listed only when used, so a document built on an
older manifest reads exactly as before.

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

When `sourceDrift.status` is `REFRESH_RECOMMENDED` or `BASELINE_UNKNOWN`, state it in one line and recommend `/inspect` → **Refresh Project Knowledge** (the reader's `refreshRecommendation`). Never recommend `/inspect-sync` for source drift: it re-indexes the artifacts and the manifest but never refreshes source-backed knowledge. Then continue — Step 3a already keeps the work correct.

When `freshness` is `stale-artifacts` (an inspector-owned document was edited after the manifest was written), state it in one line and recommend `/inspect-sync` (or `/inspect`). Then continue — the helper has already moved affected categories into `deriveLive`, so the work is already correct.

**Never** write, regenerate, or "fix" `.ono/repo-knowledge.json`, `CLAUDE.md`, `AUDIT.md`, `docs/project/**`, `audits/**`, or `.ono/state.json`. Those belong to the inspector. Repairing them from here would create two writers for the same file.

## Hard Constraints

- Never parse `.ono/repo-knowledge.json` directly — always go through `scripts/read-repo-knowledge.ts`.
- Never write any inspector-owned artifact.
- Never block, warn repeatedly, or ask the developer to run an inspection before continuing.
- Never re-derive a category listed in `usableCategories`. A `verifyOnUse` category is verified fact-by-fact for what the feature uses (Step 3a), never re-derived wholesale.
- Never treat a `verifyOnUse` category as authoritative as-is.
- Never skip deriving a category listed in `deriveLive`.
- Never copy repository knowledge verbatim into a generated document — cite it per Step 6.
- **Never treat `knowledge.stack.platformHints` as the platform.** It is advisory corroboration only. The authoritative platform is whatever `repo-analyst` detects and the human confirms in `/analyze-feature`, every time, regardless of what the manifest says.
- Never use the manifest to resolve `device_type`, and never read `surfaces[].formFactor` as one.
- Never let a surface choose routing — it may corroborate and scope, never replace the human confirmation gate.
- Never match a capability by semantic similarity, never expand beyond first-degree relationships, and never treat a relationship as automatic scope — `related_to` in particular is never proof of impact.
- When current source and Project Knowledge disagree, the current code wins — derive live and recommend `/inspect` → **Refresh Project Knowledge**.
