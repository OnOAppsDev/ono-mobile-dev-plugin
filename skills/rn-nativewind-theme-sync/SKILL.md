---
name: rn-nativewind-theme-sync
description: Methodology for reading a Figma design system's variables (colors, spacing, radii, typography) via the Figma MCP server and generating/updating a NativeWind theme in a React Native repo. Used by /rn-sync-figma-theme.
---

# React Native NativeWind Theme Sync

## Purpose

Turn a Figma design system's **variables** (not styles, not layer inspection) into the single theme/tokens module a NativeWind-based React Native app should read from, per `RN-STYLE-3` ("shared design tokens are sourced from a single theme/tokens module, not hardcoded per component"). This skill owns *how* Figma variables are found, read, and turned into a write — it does not decide when to run (that is `/rn-sync-figma-theme`) and it never touches an unrelated part of the app.

This is a standalone utility, not a pipeline stage: it produces no planning document and needs no DD or task-breakdown approval. See [Approval model](#approval-model) for exactly what that does and doesn't mean.

## The split this skill enforces: observation vs. decision

Same split this plugin uses everywhere else for anything safety-critical (`assess-dd-complexity.ts`, `read-repo-knowledge.ts`, `migrate-planning-doc.ts`): **the agent observes, `scripts/figma-theme-tokens.ts` decides.** The agent's job is talking to the live `figma` MCP tools, reading the repository, and talking to the human. Classification, name/color/font-weight normalization, alias resolution, diffing, rendering, and verification are never re-derived by model judgment on the fly — they are computed by that script, which is a pure, deterministic, independently-tested function of its inputs (see `scripts/figma-theme-tokens.test.ts`). Two runs against the same Figma source and the same repository state always produce the same classification, the same normalized values, and the same generated text. This is what makes the sync idempotent and its output reviewable rather than a fresh guess every time.

Do not hand-classify a variable, hand-normalize a color, or hand-render the managed block "because it's obviously right this time" — call the script. If a case the script doesn't handle comes up, that is a script gap to report, not something to paper over with judgment in the moment.

## Approval model

This plugin distinguishes three independent kinds of approval, and this command interacts with exactly two of them:

1. **Pipeline approval** — the human sign-off between the eight SDLC stages (feature analysis → DD → task breakdown → ...). `/rn-sync-figma-theme` is a standalone utility, not a pipeline stage, so **this kind does not apply here** — no feature analysis, DD, or task breakdown is required or produced.
2. **Semantic change approval** — required whenever an operation would change an existing value or make a consequential decision a human hasn't already made. This command's override-confirmation gate ([Step 9](#9-diff-against-existing-values--notify-and-ask-before-overriding-anything), an existing token value would change) and its naming-collision gate ([Step 6](#6-normalize-names-into-token-keys), two incoming Figma values conflict) are both this kind. They always apply, regardless of pipeline status.
3. **Repository write hooks** — `require-approval-before-code`, `block-main-branch-changes`, `protect-secrets`. Global safety mechanisms that gate every file write in this plugin. They **always apply** and this command never bypasses them.

The precise statement, satisfying all three at once: **this command may bypass feature-pipeline approval because it is a standalone utility, but it never bypasses repository-level write hooks or semantic override confirmation.** Anywhere this skill or `commands/rn-sync-figma-theme.md` says "no approval gate," it means kind 1 only — never read it as "no approval at all."

## Human-interruption policy: ask only when semantics change

> Ask when the decision changes semantics. Decide when it only changes representation.

**MUST ASK** (semantic — a human decision the script cannot make for them; the answer feeds back in and the run continues):
- Conflicting normalized token keys (two variables collide, [Step 6](#6-normalize-names-into-token-keys)) — resolved by the human naming the winning source, or skipping the key.
- Ambiguous Figma scope — which page/part is the design system ([Step 3](#3-scope-to-the-design-system-part-of-the-file--never-read-the-whole-file-by-default)) — resolved by the human naming the page.
- A multi-mode variable read from separate mode-representing nodes where it's genuinely unclear which raw value belongs to which mode name ([Step 4](#4-read-variables-via-get_variable_defs)) — resolved by the human naming the mode.
- Ambiguous multi-mode strategy on NativeWind v2/v3, which has no CSS-variable mechanism ([Step 7](#7-handle-single-mode-vs-multi-mode-variables)) — resolved by the human picking a mode or saying defer.
- More than one candidate canonical token source with no clear single winner ([Step 8](#8-find-the-actual-single-source-of-truth-before-writing)) — resolved by the human naming the authoritative file.
- Any existing token value that would change ([Step 9](#9-diff-against-existing-values--notify-and-ask-before-overriding-anything)) — resolved by approve/skip per key or for the whole batch.
- Anything that would require scaffolding NativeWind from scratch, or otherwise touching build config beyond the theme module — resolved by the human approving the scaffold or aborting.

**MAY DECIDE DETERMINISTICALLY** (representation only — the script decides, nothing to ask about): JSON key ordering and indentation width (matched to the existing file), managed-block formatting, which serialization function runs for a given category, rounding of color/alpha values, kebab-case vs. numeric key casing, and any other choice with exactly one correct deterministic answer per [Section 4 of the script](../../scripts/figma-theme-tokens.ts).

**NEITHER — exclude and report, don't ask, don't stop the rest of the run:** an alias that cannot be resolved (cycle, missing target, excessive recursion — [Step 4](#4-read-variables-via-get_variable_defs)), or a variable that stays genuinely unclassified ([Step 5](#5-token-ir-and-classification-performed-by-the-script)). Neither has a human answer that fixes it *in this run* — an alias's fix lives in the Figma file itself, and an unclassified variable (e.g. `Icon/Size/Small`) is often an intentional, expected outcome, not an error. Exclude the specific token, note it in `counts`/warnings, and let everything else that resolved still get written. Only stop the whole run (`status: "blocked"`) if nothing at all came out usable.

Never ask about a MAY-DECIDE case. Never silently decide a MUST-ASK case. Never let a NEITHER case stop the whole run when other tokens still resolved.

## Inputs this skill requires

- The absolute `TARGET_ROOT` (repository root).
- The Figma URL supplied to `/rn-sync-figma-theme`.
- Whether `--dry-run` was passed (see [Dry run](#dry-run)).

If the URL is missing, stop and ask for one — never guess a design-system file from an unrelated Figma link already on file for a different feature.

## Workflow states and invariants

Execution is a strict forward chain. **Never execute a later state when a required invariant from an earlier one failed** — "best effort" through a safety-critical failure is not a supported mode; stop and report instead.

```text
INIT
  ↓  invariant: TARGET_ROOT and a Figma URL are both present
PLATFORM_VERIFIED        (Step 0)
  ↓  invariant: TARGET_ROOT is confirmed React Native
INPUT_VERIFIED            (Step 1 + Step 2)
  ↓  invariant: NativeWind is configured (or scaffolding was explicitly approved); the Figma URL parses to a file key
FIGMA_SCOPE_RESOLVED      (Step 3)
  ↓  invariant: exactly one design-system page/node is confirmed, not ambiguous
VARIABLES_READ            (Step 4, get_variable_defs)
  ↓  invariant: the MCP call succeeded; the read variable count is plausible for a design system
VARIABLES_RESOLVED        (Step 4, resolveAlias / script)
  ↓  invariant: every alias walked to a primitive value — no cycle, no missing target, no depth overrun
TOKENS_CLASSIFIED         (Step 5, classifyVariable / script)
  ↓  invariant: every variable has a category or is explicitly `unclassified` — nothing forced
TOKENS_NORMALIZED         (Step 6 + Step 7, buildTokenIR / script)
  ↓  invariant: no two variables normalize to the same key with different values (or the collision was asked about and resolved)
TARGET_RESOLVED           (Step 8, findCandidateThemeModules / script)
  ↓  invariant: exactly one canonical token source identified (or the conflict was asked about and resolved)
DIFF_COMPUTED             (Step 9, computeDiff / script)
  ↓  invariant: every added/unchanged/overridden/collision/unresolved case is categorized
CONFIRMATION_REQUIRED ──→ CANCELLED
  ↓  invariant: every override and every collision is either resolved (approved / a winning source named) or explicitly skipped — none left pending
WRITE                     (Step 10) — skipped entirely in dry-run mode
  ↓  invariant: the write hooks permitted the change; the write touched only the managed block/region
VERIFY                    (Step 11)
  ↓  invariant: re-reading the written file reproduces exactly what was approved
REPORT                    (Step 13)
```

Before `WRITE` specifically, every one of these must independently hold, or the run stops there and reports which one failed: platform confirmed React Native; Figma URL valid; Figma scope resolved and unambiguous; MCP reads succeeded; every naming collision resolved (a winning source named or skipped); every override explicitly approved or skipped; the target module identified; and the repository's write hooks permit the change. A variable whose alias fails to resolve, or that stays unclassified, is excluded from the write and surfaced via `counts`/`warnings` (never silently dropped) — it does **not** block writing everything else that did resolve. Only when a run resolves *nothing at all* usable does it stop before `WRITE` with `status: "blocked"`. `CANCELLED` is a normal, non-error terminal state when the human declines to proceed at the confirmation gate — it is reported as `status: "cancelled"`, not as a failure.

## Dry run

`--dry-run` runs every state through `DIFF_COMPUTED` (and, if overrides exist, still shows the confirmation table) but **never enters `WRITE`, `VERIFY`, or touches any file.** It is the preferred way to preview a large sync before committing to it: same reads, same classification, same diff, same report — just no write. Use it by default when the diff looks large or unfamiliar, and always available on request.

## 0. Platform gate — alert and fail if this isn't a React Native repo

Run this before anything else. Detect the platform with `scripts/figma-theme-tokens.ts detect-platform --files '<json>' --deps '<json>'` — a narrow, fast, testable pre-check that reuses the same raw signals `repo-analyst` documents (agents/repo-analyst.md), so the two never disagree about what counts as a React Native marker. **This intentionally does not re-run repo-analyst's full detection** (no device-type resolution, no monorepo workspace scoping, no human confirmation of an ambiguous result) — it only answers the narrower question this command actually needs: does NativeWind apply here at all.

If the result is anything other than `"react-native"`:

- **Stop immediately.** Do not proceed to `INPUT_VERIFIED`, do not call any Figma tool, do not write anything.
- **Alert with an explicit, unambiguous message**, e.g.:
  ```
  /rn-sync-figma-theme only runs against a React Native repository. TARGET_ROOT
  (<path>) was detected as <platform, or "not React Native">. Aborting — no
  Figma data was read and no files were changed.
  ```
- Treat this as a hard failure (`status: "failed"`), not a warning — it ends the command regardless of permission mode.

## 1. NativeWind readiness gate

Detect, do not assume:

- `nativewind` in `package.json` dependencies, and its major version (v2/v3 vs. v4 — the CSS-variable theming approach in Step 7 is v4-only).
- An existing `tailwind.config.js`/`.ts` at the repo root (or the RN app's package root in a monorepo).
- A global stylesheet imported at the app root (commonly `global.css`) containing `@tailwind` directives — required for v4's CSS-variable theming.

If NativeWind is not installed/configured at all, **stop and ask** whether to scaffold a minimal setup (`tailwind.config.js`, `global.css`, the babel/metro wiring NativeWind's own setup requires) before continuing, or to abort. Never scaffold silently — installing dependencies and editing build config is a bigger change than a theme edit and needs explicit go-ahead (a MUST-ASK case: it's architectural, not representational).

## 2. Resolve the Figma URL

Extract `fileKey` and, if present, `nodeId` from either URL shape Figma issues, matching what the Figma MCP tools expect:

- `https://www.figma.com/design/<file_key>/<file_name>?node-id=<node_id>`
- `https://www.figma.com/file/<file_key>/<file_name>?node-id=<node_id>`

`nodeId` is accepted by the tools as either `1234-56` or `1234:56`. If the URL has no `node-id` at all, that's fine — Step 3 resolves the right scope from the file's page list instead. If the URL can't be parsed into a valid file key, stop and ask for a corrected link rather than guessing.

## 3. Scope to the design-system part of the file — never read the whole file by default

A single Figma file is very often more than a design system: mockup screens, flows, and one-off exploration frames commonly sit alongside (or on separate pages from) the actual tokens. Reading variables from the whole file risks pulling in incidental values a mockup happens to use rather than the design system's real token set. Resolve the correct scope before reading any variable:

1. Call `get_metadata` with the `fileKey` and no `nodeId` — this lists the file's top-level pages (name + id) and is the cheapest way to see whether the file has more than one part.
2. **Exactly one page, or the URL's `nodeId` already lands inside the file's one design-system-like page** — use that page (or the given node, if it's more specific) as the scope for Step 4. No further disambiguation needed.
3. **More than one page/part** — identify the design-system page(s) by name, case-insensitively matching signals like `design system`, `foundations`, `tokens`, `design tokens`, `styles`, `variables`, `library`, `theme`.
   - If the URL's `nodeId` resolves into a page matching one of those signals, use that node directly — respect the frame actually linked rather than widening to the whole page or narrowing to a sub-frame nobody pointed at.
   - If the URL's `nodeId` resolves into a page that does **not** match (e.g. a mockup screen) while a different page clearly does, **stop and ask** (MUST ASK — this is exactly the "linked mockup page vs. actual design-system page" ambiguity): report both the page the link pointed at and the page(s) that look like the design system, and let the user confirm which to read from. Never silently switch pages, and never silently proceed on a non-design-system page just because it's what was linked.
   - If no page name clearly matches and the file has more than one page, **stop and ask** — list the candidate page names and ids and have the user pick, rather than guessing which one holds the tokens.
4. Once a page is confirmed, optionally call `get_metadata` again with that page's `nodeId` to see its child frames in the XML overview, so Step 4 targets the narrowest node that still covers every token category the design system defines — typically the page itself, unless it visibly separates a "Foundations"/"Tokens" section from unrelated content at the top level.
5. `search_design_system` (a text query scoped to this `fileKey`) is a useful cross-check once scope is set — e.g. querying `"color"`, `"spacing"`, `"font"` against the confirmed scope to sanity-check that the expected token collections actually show up there — but it is not a substitute for the page-scoping above, since it returns query matches, not a full enumeration.

## 4. Read variables via `get_variable_defs`

Call `get_variable_defs(fileKey, nodeId)` with the `nodeId` resolved in Step 3. This tool requires a concrete node and returns the variable definitions bound within that node's subtree — **not** a file-wide dump. For every variable returned, record its id, name (group/path), collection, type, and its raw value per mode.

**This tool returns what is actually bound to something inside the scoped subtree.** A variable that exists in the file's Variables panel but isn't visibly used anywhere inside the scoped node will not appear. If the returned variable count looks implausibly small for a design system (e.g. only a handful of colors, no spacing or typography at all), say so explicitly and suggest widening the scope to the confirmed design-system *page* — never to the whole file — rather than silently accepting a partial read.

**Multi-mode values**: if the design system represents modes (Light/Dark, brand variants) as separate frames/sections within the scoped page rather than exposing every mode in one response, call `get_variable_defs` once per mode-representing node and merge results by variable name into one `modes: { <modeName>: <rawValue> }` map per variable before handing off to the script — do not assume a single call returns every mode. If it's genuinely unclear which value belongs to which mode, ask rather than guessing.

If the file/node cannot be read (auth failure, wrong file key, no variables bound in scope), **stop and report the exact error** — do not fall back to guessing values from styles, layer inspection, or screenshots instead of variables.

Once every variable is assembled into the `RawFigmaVariable[]` shape `scripts/figma-theme-tokens.ts` expects (`{id, name, collection, type, modes}`), hand off to the script for everything from here on:

```
node scripts/figma-theme-tokens.ts build-ir --variables '<json array of RawFigmaVariable>'
```

This one call performs alias resolution (`VARIABLES_RESOLVED`), classification (`TOKENS_CLASSIFIED`), and normalization (`TOKENS_NORMALIZED`) in one deterministic pass and returns the full Token IR. The remaining "steps" below describe *what the script does and why*, for the record and for extending it — the agent's job at this point is to call it, not to re-derive its logic.

## 5. Token IR and classification (performed by the script)

Every Token IR entry preserves, per (variable, mode): `id`, `name`, `collection`, `path`, `type`, `mode`, `aliasChain` (the full semantic chain walked, e.g. `Text/Primary → Semantic/Text/Primary → Brand/900`, never just the resolved primitive), `category`, `confidence`, `reason`, `tokenPath`, the canonical serialized `value`, the original `raw` value, and `ok`/`error`. The Figma-parsing step never touches file-writing logic directly — everything downstream (diff, render, verify) consumes this IR, never the raw Figma response.

Classification priority (highest first): Figma variable **type** → **collection context** → an explicit semantic keyword anywhere in the **path** → `unclassified`. Generic words (`size`, `value`, `scale`, `default`, `small`, `large`, `medium`, `base`, `min`/`max`, `xs`/`sm`/`md`/`lg`/`xl`) never independently decide a category — `Icon/Size/Small`, `Button/Height/Small`, and `Border/Width/Default` are all `unclassified` (not spacing, not sizing), while `Typography/Font/Size` is `fontSize` specifically because the `Typography` collection already establishes context for the otherwise-overloaded word "size." When classification is genuinely ambiguous, the script reports `unclassified` with a `reason` — it never guesses.

## 6. Normalize names into token keys

`Figma variable path → Tailwind theme-namespace key`, computed by the script (`buildTokenPath`), not a mechanical per-segment lowercase: the category maps to Tailwind's own `theme.extend` namespace (`colors` — pluralized, matching Tailwind's own key — `spacing`, `borderRadius`, `opacity`, `fontSize`, `lineHeight`, `letterSpacing`, `fontWeight`, `fontFamily`), a duplicated leading collection segment is stripped, and the segment that triggered classification (if any) is consumed rather than repeated. Examples: `Color/Primary/500` → `colors.primary.500`; `Spacing/4` → `spacing.4`; `Typography/Heading/Weight` → `fontWeight.heading`. A purely numeric leaf (a scale step like `500`) is kept as-is; everything else is lowercased and kebab-cased.

**If two variables normalize to the same key with different values, stop and ask** which should win (MUST ASK — this is a semantic collision, not a formatting choice) — never silently overwrite one with the other. The script surfaces this as a `collision` diff entry carrying every conflicting source name and value (`collisionCandidates`). Present them exactly like a Step 9 override table — source name, value, one row per candidate — and resolve with the same `apply-approvals` call, naming the winning source (or `"skip"` to drop the key entirely):

```
node scripts/figma-theme-tokens.ts apply-approvals --diff '<json diff>' --decisions '{"<tokenPath>": "<winning source name>"}'
```

Nothing with a pending collision is written until a source is named or it's explicitly skipped — `approveAll` never resolves a collision on its own, since there is no default side to rubber-stamp.

## 7. Handle single-mode vs. multi-mode variables

- **Single-mode** (one value regardless of mode): the resolved literal is written directly.
- **Multi-mode** (Light/Dark, brand variants, etc.), **NativeWind v4 only**: do not bake one mode into the JS config. Instead:
  1. Emit a CSS custom property per token per mode into the project's global stylesheet, e.g.:
     ```css
     :root {
       --color-primary-500: 33 130 245;
     }
     .dark:root {
       --color-primary-500: 96 165 250;
     }
     ```
     (RGB triplets, space-separated — exactly the format `normalizeColor` produces — so Tailwind's alpha-channel syntax works.)
  2. Reference the variable from `tailwind.config.js`: `colors.primary['500'] = 'rgb(var(--color-primary-500) / <alpha-value>)'`.
- If the repo is on NativeWind v2/v3 (no CSS-variable theming support) and the file defines multiple modes, **stop and ask** (MUST ASK) which single mode to bake in, or whether to defer multi-mode theming until the repo upgrades — do not silently pick "Light".

## 8. Find the actual single source of truth before writing

Do not assume `tailwind.config.js` is where token literals belong. Run:

```
node scripts/figma-theme-tokens.ts find-theme-modules --files '<json file list>' --tailwind-config '<tailwind.config.js text>'
```

This surfaces both (a) filenames matching common theme/tokens module conventions (`theme.ts`, `tokens.ts`, `designTokens.ts`, `constants/theme(-tokens).*`, `tailwind.preset.js`) and (b) every local module `tailwind.config.js` actually `require()`s/imports. Trace the dependency graph from there — the module `tailwind.config.js` itself pulls from (and that a `theme.ts` may re-export) is the real "single theme/tokens module" `RN-STYLE-3` means, not `tailwind.config.js` itself.

- If a canonical module is found: write resolved values into it, keeping its existing shape (key names, nesting, value encoding — e.g. an RGB triplet string vs. a hex string) rather than imposing a shape from scratch. If the module already separates by mode (e.g. a `colors.light`/`colors.dark` split), map Figma's modes onto that existing split rather than introducing CSS variables — the repo has already solved multi-mode theming.
- If a token category genuinely has no home in the existing module (e.g. it defines colors/spacing/fonts but Figma also supplies a new `borderRadius` scale it doesn't yet cover), extend the module first — never bypass it by adding the new category straight into `tailwind.config.js`.
- **If more than one plausible canonical source exists** (e.g. both a `theme.ts` and an unrelated `tokens.ts` define overlapping keys, or the `require()` target and a sibling file both look canonical), **stop and ask** (MUST ASK) which is authoritative — never silently create a second source of truth by writing to a file that isn't the one the repo already treats as canonical.

Only when no such module exists at all do literals belong directly in `tailwind.config.js`/the global stylesheet, per Step 7 above (the fallback `renderManagedBlockJS` path).

## 9. Diff against existing values — notify and ask before overriding anything

```
node scripts/figma-theme-tokens.ts diff --ir '<json Token IR>' --existing '<json existing-value map>'
```

This categorizes every token as `added`, `unchanged`, `overridden`, `collision`, or `unresolved` (unclassified or a failed resolution). `unchanged` needs nothing further. `added` needs nothing further either — a brand-new key is never a semantic override.

**Every `overridden` entry is a MUST-ASK case.** Before writing anything, present one table of every override — token key, current value, incoming Figma value, and (for multi-mode tokens) which mode — and require an explicit decision:

```
Token                  Existing       Figma
colors.primary.500     #123456        #456789
spacing.4              12             16

approve all | approve selected | skip selected | cancel
```

Run:

```
node scripts/figma-theme-tokens.ts apply-approvals --diff '<json diff>' --decisions '<json>'
```

with `{"approveAll": true}`, or `{"decisions": {"<tokenPath>": "approve" | "skip", ...}}` for a selective answer. Get one go-ahead for the whole batch, or let the user say which specific overrides to accept and which to skip — either is acceptable, but nothing with a changed value is written without an explicit decision; an override with no decision leaves the run at `CONFIRMATION_REQUIRED` (reported as `status: "needs_confirmation"`) — never silently skipped, never silently applied. `cancel` ends the run at `CANCELLED` — a normal outcome, not a failure. A key that exists **outside** a prior managed block (a hand-authored token predating this skill) is still an override under this rule — never fold it into the managed block silently just because Figma also defines a token with that name.

Record any declined overrides in the report as "skipped by request," not as an error.

## 10. Write

Write only what `apply-approvals` returned in `toWrite` — additions plus explicitly approved overrides, nothing else. Skipped in dry-run mode entirely (see [Dry run](#dry-run)).

- **Canonical JSON tokens module found (Step 8):** call `render-json` and write its `text` output verbatim, preserving every untouched key:
  ```
  node scripts/figma-theme-tokens.ts render-json --existing '<json current file content>' --updates '<json {tokenPath,mode,value}[]>' --source-text '<raw file text, for indent detection>'
  ```
- **No canonical module (fallback path):** call `render-block` and insert/replace the managed block inside `theme.extend` (creating it if absent), touching nothing else in the file:
  ```
  node scripts/figma-theme-tokens.ts render-block --entries '<json diff entries to write>'
  ```
  ```js
  // --- BEGIN figma-theme-sync (do not edit by hand — regenerated by /rn-sync-figma-theme) ---
  ...generated content...
  // --- END figma-theme-sync ---
  ```
  Use the matching comment syntax for CSS. If a managed block already exists, replace its contents exactly with the freshly rendered text; if not, insert one without disturbing anything else in the file.

Because both renderers are pure functions of their inputs, re-running this skill against an unchanged Figma source and an unchanged repository reproduces byte-identical output — the idempotency guarantee this whole pipeline exists to provide. Do not hand-format, reorder, or "clean up" the rendered text before writing it; whatever deviates from the script's output breaks that guarantee on the next run.

Every write still passes through `require-approval-before-code`, `block-main-branch-changes`, and `protect-secrets` exactly as any other code change in this plugin — the diff/override gate above is a *complementary* semantic layer, not a replacement for them.

## 11. Verify

After a successful write, before reporting success:

1. Re-read the affected file(s).
2. Confirm the managed block/updated region actually exists (`node scripts/figma-theme-tokens.ts verify --file-content '<content>' --entries '<the entries that were written>'` for the fallback path; for the JSON path, re-parse and `deepGet` every written `tokenPath` and compare against the approved value).
3. Confirm every written value matches the approved Token IR exactly — no unapproved override slipped in.
4. Confirm nothing outside the intended region/keys changed (diff the file before/after; only the targeted paths should differ).
5. Where practical, run the repo's own typecheck/lint on the touched file as a syntax sanity check.

**If verification fails, report the failure clearly and do not claim success** — a successful filesystem write is not the same thing as a verified one.

## 12. Font-family follow-up

A `fontFamily` token naming a family that isn't already loaded as a custom font in this project (check the app's font-loading setup — `expo-font`, a native font-linking config, or equivalent) cannot be rendered correctly by NativeWind alone. Report this explicitly as a required manual follow-up (which family, where to add it) rather than assuming it will resolve at runtime.

## 13. Report

Produce both a human-readable summary and the machine-readable result:

```
node scripts/figma-theme-tokens.ts report --state '<json: platform, figmaScope, totalRead, diff, applied, filesChanged, warnings>'
```

which returns:

```json
{
  "status": "success",
  "platform": "react-native",
  "figmaScope": { "file": "...", "page": "...", "node": "..." },
  "counts": { "read": 42, "added": 8, "unchanged": 30, "overridden": 4, "skipped": 0, "unclassified": 0, "collisions": 0, "unresolved": 0 },
  "filesChanged": ["src/constants/theme-tokens.json"],
  "warnings": []
}
```

`status` is one of `success`, `needs_confirmation`, `blocked`, `cancelled`, `failed` — report it verbatim. The distinction that matters for what to do next: `needs_confirmation` means a human decision resolves it (a pending override or naming collision — go back and ask); `blocked` means the run resolved *nothing usable at all* (every variable read hit an unresolved alias or stayed unclassified) — report and stop, there's no decision to ask for; `failed` is a hard gate failure (wrong platform, unreadable Figma source); `cancelled` is the human declining at the confirmation gate, not an error. A `success` or `needs_confirmation` run can still carry unresolved entries in `counts` — that's a normal partial outcome (e.g. one unclassified variable alongside forty resolved ones), not a reason to withhold the rest of the write; call it out under warnings/follow-ups, don't inflate it into a full-run stop.

The default **human-facing** report stays concise — source, scope, counts, changed tokens, overrides, warnings, files changed, required follow-ups — and does not dump every unchanged variable; offer a verbose mode (the full variable → token table) on request.

## Standards citation

| Standard | ID | Applies to |
|---|---|---|
| `standards/react-native/rn-coding-standards.md` | `RN-STYLE-3` | Tokens sourced from a single theme/tokens module |
| `standards/react-native/rn-coding-standards.md` | `RN-CONST-2` | Where the generated theme file lives relative to other shared config |

## Red flags — STOP and report instead of proceeding

- The repo is not React Native (Step 0) — alert and fail before any other check runs.
- NativeWind is absent and scaffolding it is declined.
- The Figma URL cannot be resolved, or the MCP call fails/is unauthorized.
- The file has multiple pages/parts and the design-system scope is ambiguous (Step 3) — including a linked node that resolves to a mockup page while a different page looks like the real design system.
- Every single variable read is unresolved (alias failure or unclassified) — nothing usable came out of the run at all. (A handful of unresolved variables alongside otherwise-successful ones is not a red flag — exclude and report them, per [Human-interruption policy](#human-interruption-policy-ask-only-when-semantics-change).)
- Two variables normalize to the same token key with conflicting values and the user hasn't named a winning source or skipped the key.
- The repo is on NativeWind v2/v3 and the file defines multiple modes, with no mode choice from the user.
- More than one plausible canonical token source exists with no clear winner.
- Any existing token would be overridden and the user hasn't explicitly approved or skipped it.
- Post-write verification (Step 11) finds a mismatch between what was written and what was approved.

## Relationship with command, script, hooks

- **`commands/rn-sync-figma-theme.md`** — resolves `TARGET_ROOT`, the Figma URL argument, `--dry-run`, and the platform/readiness gates; invokes this methodology; verifies the completion report.
- **This skill** — the observation layer: talks to the live `figma` MCP tools, reads the repository, talks to the human at every MUST-ASK point, and hands data to/acts on results from the script below.
- **`scripts/figma-theme-tokens.ts`** — the decision layer: classification, normalization (names/colors/font-weights), alias resolution, diffing, approvals, rendering, and verification. Pure, deterministic, covered by `scripts/figma-theme-tokens.test.ts`. No filesystem or network access of its own — every call is a function of the data the skill supplies.
- **Hooks** — `require-approval-before-code`, `block-main-branch-changes`, `protect-secrets` gate every write exactly as elsewhere; they are complementary to, never replaced by, the semantic override-confirmation gate in Step 9.
