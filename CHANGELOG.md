# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this plugin adheres to [Semantic Versioning](https://semver.org/). The
version below is the plugin's own `version` in
[`plugin.json`](.claude-plugin/plugin.json).

## [0.6.0] - 2026-08-19

### Added
- `/rn-sync-figma-theme` — a standalone utility command (React Native only — alerts and
  hard-fails on any other platform) that reads a Figma design system's **variables**
  (colors, spacing, radii, typography) via the `figma` MCP server and generates/updates
  the repo's NativeWind theme. When the linked Figma file has more than one page/part,
  it scopes the read to the design-system page/frame rather than the whole file. Before
  writing, it diffs generated tokens against whatever the target theme module already
  holds and asks for explicit confirmation before overriding any existing value. It sits
  outside the eight-stage pipeline: no feature analysis, DD, or task breakdown is
  produced or required, though the existing write hooks
  (`require-approval-before-code`, `block-main-branch-changes`, `protect-secrets`) still
  gate every file change.
- `skills/rn-nativewind-theme-sync` — the scoping/extraction/classification/naming/
  diff/write methodology this command follows: a hard platform gate, resolving the
  Figma URL, scoping to the design-system part of the file via `get_metadata`/
  `search_design_system`, reading variables through `get_variable_defs`, resolving
  aliases to primitive values, classifying each variable into a token category,
  normalizing Figma variable paths into NativeWind token keys, routing multi-mode
  variables (Light/Dark, brand variants) to NativeWind v4 CSS variables rather than
  baking one mode into the JS config, diffing against existing values with a
  confirm-before-override gate, and writing everything into a clearly delimited,
  re-syncable managed block in the repo's actual single theme/tokens module (falling
  back to `tailwind.config.js` and the global stylesheet when no such module exists) so
  a later re-run only touches Figma-sourced tokens. No dedicated agent — grounded
  directly in `RN-STYLE-3`'s "single theme/tokens module" rule from
  `standards/react-native/rn-coding-standards.md`.

### Unchanged (deliberately)
- The eight-stage pipeline, every approval gate, all three safety hooks, all
  `standards/**`, and every other command.

## [Unreleased]

Work merged since the 0.5.0 bump (`d829d78`). **`plugin.json` still declares `0.5.0`** —
these items ship with the next version bump, which is deliberately separate work. Until
then, a git-sourced install pinned by that version string does not receive them.

### Added
- **The iOS platform standards** (IOS-001, `173785f`) — five documents under
  `standards/ios/` with citable `IOS-SWIFT-*`, `IOS-UI-*`, `IOS-ARCH-*`, `IOS-PERF-*` and
  `IOS-BUILD-*` IDs; `swift-standards.md` defines the lane table routing each ID root to
  exactly one reviewer. tvOS guidance is deliberately out of scope until `ATV-001`.
- **The iOS planning lane** (IOS-002, `ded9be0`) — `agents/ios-architect.md` plus
  `skills/ios-dev-planning/SKILL.md`, so `/analyze-feature`, `/dev-design-start` and
  `/dev-feature-start` produce grounded, standards-cited iOS output.
- **The iOS implementation lane** (IOS-003, `9d5f30d`) — `agents/ios-feature-developer.md`
  plus `skills/ios-feature-implementation/SKILL.md`, including the Build-stage evidence a
  reviewer working from a diff cannot supply. Serves `/implement-task` and the iOS halves
  of `/fix-review-comments` and `/create-dev-qa-notes`.
- **The iOS review lane** (IOS-004, `9e7170d`) — `agents/ios-code-reviewer.md`,
  `agents/ios-performance-reviewer.md` and `skills/ios-code-review/SKILL.md`, completing
  the iOS lifecycle: standards → planning → implementation → review.
- **A deterministic per-task lifecycle store** (SHARED-004, `7248cd2`) —
  `docs/task-state-contract.md` and `scripts/task-state.ts`, the only reader/writer, at
  one path per feature: `<TARGET_ROOT>/docs/tasks/{FEATURE}-task-state.json`. Four writable
  states, SHA-256 row fingerprinting for staleness, an attempt counter, and a `provenance`
  axis keeping *human-attested* distinct from *plugin-verified*. `/implement-task` gates on
  `deterministicProof` — complete **and** plugin-verified **and** not stale — and records
  `in-progress` before handing off, so a crashed attempt is visible. `/create-dev-qa-notes`
  reads the persisted record first. Clock-free: no `Date`, no randomness; *when and by
  whom* comes from git.
- **A deterministic check harness** (SHARED-005, `b5916b2`) — `scripts/check.ts` aggregates
  every deterministic suite in phases with PASS/FAIL/SKIPPED totals and a non-zero exit.
  Adds the first coverage of the three `hooks/*.sh` safety scripts, and a **document-chain
  dry-run** that drives the real helpers head-to-tail over fixture target repositories, so
  each stage's real output is proven to be valid input to the next stage's reader. It is
  **not** a Claude-driven end-to-end run and contains no mock runtime.
- **A reference-integrity validator** (SHARED-006, `d1cc7f4`) —
  `scripts/reference-integrity.ts` checks that every cited skill, agent, standard, template,
  script and contract path resolves, that every anchor and relative link resolves, that
  component frontmatter is valid with `name` matching its filename or directory, and that
  each component's readiness is classified from its own on-disk marker. Its headline rule:
  **no command may route to a placeholder lane without a readiness gate.** Its first run
  found and fixed seven ungated React routes and five stale README status claims.
  `--strict` makes a skipped suite a failure.
- **`scripts/release-metadata.test.ts`** (SHARED-007, `c66a6be`) — asserts `plugin.json`'s
  version matches the newest release heading in this file, and that no marketplace-owned
  field leaks into the manifest.

### Changed
- **Metadata ownership between this plugin and its marketplace** (SHARED-007, `c66a6be`) —
  `.claude-plugin/plugin.json` is the authoritative source for this plugin's version, and
  the `ono-plugin-marketplace` entry now declares none. Claude Code always uses the
  `plugin.json` value **without warning**, so a marketplace copy could only mask the truth
  — and had: the marketplace listed 0.2.0 against an actual 0.5.0. README documents the
  ownership split under *Metadata ownership*.
- **Repository-knowledge orchestration** (SHARED-010, `911d47c`) —
  `/analyze-feature` step 3 now states the rule *every authored lane reuses canonical
  repository knowledge; the lanes differ only in which layer does the reusing*, with one
  bullet per lane: React Native reused at `repo-analyst`, iOS and Android reused at the
  architect through `repo-knowledge-consumer`, React deferred **because its lane is not
  authored** (`REACT-002`). It previously grouped all three non-RN lanes under a rationale
  that was false for a placeholder, and read as though canonical reuse were
  React-Native-only. No architect, dev-planning skill, `repo-analyst` or
  `repo-knowledge-consumer` changed — only the command's description was stale.

## [0.5.0] - 2026-08-12

SHARED-011 — the legacy planning-document migration framework. Implements
[`docs/planning/SHARED-011-legacy-document-migration-design.md`](docs/planning/SHARED-011-legacy-document-migration-design.md).

Three further items shipped in this window and were missing from this entry until DOC-001
backfilled them: the web and native security extensions (SHARED-003, `feb691b`) and the
Android planning and review lanes (ANDROID-001, `9177aaa`; ANDROID-002, `b3e4a3f`).
ANDROID-004 has no entry of its own because it had no separate work — its whole scope was
removing text that claimed the Android standards were placeholders, which those two
commits removed as they authored the skills.

### Added
- `scripts/migrate-planning-doc.ts` — detects which frontmatter contract version a
  planning document was written against and applies the sequential chain of migrations
  up to the current version, rewriting **only** the frontmatter. The body is held as an
  opaque byte slice and asserted byte-identical before writing; `feature`, `status`,
  `author`, and `date` are structurally unwritable, so **approval survives migration by
  construction**. Ambiguous values are never guessed — they return `needs-input` with
  every question batched into one result and the file left byte-untouched. **Always
  exits 0 with valid JSON**; callers branch on `status`. Canonical invocation is
  `node --no-warnings scripts/migrate-planning-doc.ts <path> --kind <kind>`.
- `skills/planning-doc-migration` — the loader, and the single compatibility layer for
  planning-document frontmatter. Commands load a document through it and then read
  exactly one shape; no command carries its own legacy-tolerance rules any more.
- `docs/planning-doc-contract.md` — the versioned frontmatter contract per document
  kind, the Feature Analysis version history recovered from this repository's own git
  history (`c77c75d` → `6c56ec5` → `c90c78c` → `2cadba7`), the operation rules, and the
  frozen-step discipline for adding a version later.
- `scripts/migrate-planning-doc.test.ts` + `scripts/fixtures/planning-docs/` — 174
  assertions over on-disk golden fixtures, covering every migration path, both
  frontmatter encodings, CRLF, body-byte preservation, idempotency, the true no-op, all
  refusal paths, and drift between the script, the contract document, and
  `repo-knowledge-consumer`'s canonical values.
- `doc_schema_version` in all four planning templates, so every document generated from
  0.5.0 onward is self-describing. Stamped at generation; upgraded only by the framework.

### Added
- **Web and native security extensions** (SHARED-003) — `standards/shared/mobile-security.md`
  gained `[web only]` rule families for React web and embedded web content: `SEC-WEB-*`
  (XSS, CSP, CSRF, redirects, CORS, third-party scripts) and `SEC-COOKIE-*` (browser
  session handling), alongside native platform detail on the existing rules.
  `/review-security` instructs its reviewer to apply the `[web only]` rules for React
  rather than silently skipping the surface, so the one shared security reviewer covers
  every platform from one checklist.
- **The Android planning lane** (ANDROID-001) — `agents/android-architect.md` and
  `skills/android-dev-planning/SKILL.md` authored (+403 lines): a repository-first
  methodology that discovers the repo's actual implementation model before proposing
  anything, supplies Android vocabulary and `AND-*` citations for a DD's Technical
  Implementation Approach and Impacted Modules, and handles `device_type` `mobile` and
  `tv` in one agent and one skill. It assumes no UI toolkit, architecture, or library.
- **The Android review lane** (ANDROID-002) — `agents/android-code-reviewer.md`,
  `agents/android-performance-reviewer.md`, and `skills/android-code-review/SKILL.md`
  authored (+317 lines), so `/review-code` and the Android perf sign-off in
  `/prepare-mobile-release` file concrete `AND-*` violations from the reviewed change
  rather than modernization suggestions.

### Changed
- `/dev-design-start` loads the feature analysis through `planning-doc-migration` before
  reading any field, and **its hand-written "accept a feature analysis written before
  these fields existed" paragraph is deleted** — that tolerance covered exactly one of
  the three historical transitions and was invisible to every other consumer. A
  migration is now reported in one line and the workflow continues automatically.
- `/analyze-feature`, `/dev-feature-start`, and their skills stamp `doc_schema_version`
  at generation.

### Deviations from the approved design (both recorded in the contract document)
- **No `migrated_at` field and no `--now` flag.** The design's §8.11 metadata block
  listed a migration timestamp; it had no consumer, was fully redundant with git and
  with `migration_inputs`, and was the only reason the framework would need a clock. It
  was dropped so the framework is deterministic and clock-free — a property a test now
  enforces. The merged design document is left unamended as the historical record.
- **A `fill` operation** was added to the design's operation set: giving a value to an
  existing key that has none. The templates ship keys as `field: # explanation`, so an
  `add`-only framework would reject documents that retained them. No human decision is
  overwritten, because there is no value.

### Unchanged (deliberately)
- **A current document takes a true no-op path** — stamped at the current version, the
  framework returns before any chain logic runs: no parse, no write, no message.
- **Migration never runs during generation**, only on load, so there are never two
  writers on one document.
- `/dev-feature-start` and `/implement-task` are **not** wired to the loader yet. Their
  document kinds have no authored migration chain, so wiring would call a no-op;
  `/implement-task`'s existing gates already stop loudly on a missing `device_type`.
  Tracked in the contract document's Consumers table.
- End-to-end confirmation against a real legacy feature analysis requires a live
  `/dev-design-start` run and **has not yet been performed** — same posture as 0.4.0's
  manual-verification note.
- The eight-stage pipeline, every approval gate, all three safety hooks, all
  `standards/**`, and the six commands outside the four touched above.

## [0.4.0] - 2026-07-28

Repository-knowledge consumption (SHARED-009), plus three shared-layer changes that
shipped in the same window and were missing from this entry until DOC-001 backfilled
them: the mobile-vs-TV context signal (SHARED-001, `6c56ec5`), the platform-neutral
rewrite of the shared standards (SHARED-002, `f39ed74`), and the single-confirmed-platform
and design-reference gates (SHARED-008, `c90c78c`).

### Added
- **`device_type` — the mobile-vs-TV context signal** (SHARED-001). Exactly one of
  `mobile` or `tv`, with no `mixed` value. **TV is a context inside a platform, never a
  fifth platform**: `repo-analyst` resolves it from packaging and framework markers
  (Step 6.5), `/analyze-feature` has the developer confirm it alongside the platform, and
  all four planning templates carry it in frontmatter so every later stage reads it
  instead of re-detecting. When a repository holds both a mobile and a TV target and the
  workflow's target is undeterminable, the resolution **stops and asks** rather than
  defaulting to `mobile`. `/implement-task` refuses a task row with no `device_type` —
  there is no silent default.
- `scripts/read-repo-knowledge.ts` — deterministic reader for the repository-knowledge
  manifest `ono-project-inspector` publishes at `.ono/repo-knowledge.json`. Computes
  freshness (git HEAD plus per-document SHA-256) and applies the degradation matrix,
  reporting which knowledge categories may be reused and which must still be derived
  live. **Always exits 0 with valid JSON**, including when the manifest is absent,
  malformed, or written by a newer contract version — so a missing manifest can never
  fail a command. Canonical invocation is `node --no-warnings scripts/read-repo-knowledge.ts`;
  the flag suppresses Node's experimental-type-stripping warning so a caller that
  merges stderr into stdout still gets valid JSON.
- `skills/repo-knowledge-consumer` — the single component in this plugin that
  understands the manifest format. Defines the resolution procedure and the
  `Repo Knowledge Reference` block that generated documents record.
- `docs/repo-knowledge-contract.md` — the contract schema and this plugin's obligations
  as a consumer, pinned to schema v1 and duplicated verbatim in the producer.
- `scripts/read-repo-knowledge.test.ts` — a test per degradation-matrix row.

### Changed
- `repo-analyst` resolves canonical repository knowledge before detecting anything, and
  no longer re-derives the neutral stack inventory (navigation, state management, data
  fetching, test runner, monorepo tooling, lint/format) when `docs/project/patterns.md`
  already records it. Its findings summary now leads with a Repository Knowledge section
  and labels every stack finding `[reused: <path>#<anchor>]` or `[derived live]`.
- `/analyze-feature` resolves repository knowledge as its first step, and the feature
  analysis **cites** repository knowledge instead of embedding `repo-analyst`'s findings
  verbatim. `templates/feature-analysis-template.md`'s `## Repo Conventions Detected`
  section becomes `## Repo Knowledge Reference` plus `## Repo Context`, with six new
  `repo_knowledge_*` frontmatter fields. Repository facts pasted into an approved
  document went stale the moment the repository changed, while three downstream stages
  were instructed to trust them.
- `/dev-design-start` re-resolves current knowledge and reads the approved documents
  first; `dev-design-start`'s Step 3.4 source inspection is now confined to gaps and to
  the feature-specific detail no repository-wide document can contain. The DD carries the
  same six frontmatter fields plus a `## 0. Repo Knowledge Reference` section.
- `rn-architect` consults `docs/project/components.md` before proposing new screens,
  components, or hooks, and states for each element whether it is reusing an existing one
  (by path) or introducing a new one (and why nothing existing fits).
- **The shared standards became platform-neutral** (SHARED-002) —
  `standards/shared/mobile-security.md`, `accessibility.md`, and `i18n-rtl.md` were
  rewritten so each rule states a platform-neutral requirement with **labelled**
  React Native / iOS / Android / React examples, rather than React Native prop and library
  names presented as if they were the requirement itself. A rule that only ever showed an
  RN example was unusable evidence for an iOS or Android reviewer.
- **A single confirmed platform, and a design reference of any supported type**
  (SHARED-008). Two changes across the feature flow. First, `/analyze-feature` now
  **presents the detected platform and device type and requires human confirmation** —
  always, even at high confidence — and the confirmed context resolves to exactly one
  platform and one device type, carried in frontmatter thereafter; no stage re-detects,
  and there is no `mixed` authoritative platform. Second, **Figma is no longer required**:
  a design reference is mandatory only when a feature introduces or changes user-facing
  UI, and any supported type satisfies it — a Figma link, a specification document,
  exported mockups, or an existing screen to mirror. Behaviour-preserving work
  (migrations, refactors, dependency upgrades, infrastructure, performance) records
  `design_reference_status: not_required` and is asked for nothing. The four
  `design_reference_*`/`figma_link` fields are carried by every template and every
  architect and feature-developer agent.

### Unchanged (deliberately)
- **Behavior with no `.ono/repo-knowledge.json` is designed to be identical to 0.3.0** —
  the reader always exits 0 with `available: false`, and both changed commands fall back
  to full live derivation, adding only one informational line. The deterministic layer is
  covered by tests and by a fixture check against a never-inspected repository.
  End-to-end confirmation requires a live `/analyze-feature` run, which is tracked as a
  required manual verification step and has not yet been performed.
- Platform detection, the single-platform confirmation gate, and `device_type` resolution
  run in full on every feature. `platformHints` is advisory only and never authoritative.
- Folder-structure conformance against the platform's `ARCH-*` standards is still derived
  live on every run — `docs/project/patterns.md` describes what the conventions are, not
  whether they comply with Ono's standards.
- The eight-stage pipeline, every approval gate, all three safety hooks, all templates
  outside the two above, all `standards/**`, and the seven commands outside
  `/analyze-feature` and `/dev-design-start`.

## [0.3.0] - 2026-07-07

### Added
- A dedicated **Design** stage: `/dev-design-start` + the `dev-design-start`
  skill turn an approved feature analysis into a Detailed Design (DD),
  written to the new `templates/dd-template.md`. The skill carries the
  `platform` and `figma_link` frontmatter forward (never re-detecting),
  routes the DD's Technical Implementation Approach through the matching
  platform architect + `*-dev-planning` companion skill, and keeps its
  consistency/gap-analysis discipline and existing-file strategy
  (Overwrite/Update/Preserve/Version) so a DD is never blindly overwritten.
- A dedicated **Feature-start** stage: `/dev-feature-start` + the
  `dev-feature-start` skill turn an approved DD into
  `templates/task-breakdown-template.md` plus a thin feature plan, verifying
  the DD's Definition of Ready before decomposing.

### Changed
- Split the former single planning stage (`/create-dev-plan`) into the two
  gated stages above, growing the pipeline from seven to eight stages
  (Analyze → Design → Feature start → Implement → Review → Fix → QA handoff
  → Release). Each stage still reads the previous stage's approved template
  output.
- Repurposed `templates/dev-plan-template.md` into the thin **feature plan**
  emitted by `/dev-feature-start` — frontmatter (`dd_link`, `figma_link`,
  `platform`), Overview, Task Breakdown, Sequencing & Dependencies, and the
  Rollback Plan (deliberately kept here rather than in the DD).
- Repointed the `rn-/ios-/android-/react-dev-planning` companion skills at
  `/dev-design-start` and `/dev-feature-start`.

### Removed
- The `/create-dev-plan` command and the `mobile-dev-planning` skill, whose
  role is fully replaced by the two new stages above. The plugin now exposes
  only the new SDLC lifecycle, with no backward-compatible alias.

## [0.2.0] - 2026-07-07

### Changed
- Evolved the plugin from a React-Native-only workflow into a mobile-division
  plugin: platform detection (React Native, native iOS, native Android,
  React web, or a mix) now runs before every command, with shared process
  loaded always and platform-specific standards/skills/agents loaded only
  for the platform(s) actually touched.
- Renamed the plugin from `ono-react-native-dev-plugin` to
  `ono-mobile-dev-plugin` to reflect the broader scope. `plugin.json`'s
  `name` and this repository were both renamed to match.
- Restructured `standards/` into `shared/`, `react-native/`, `ios/`,
  `android/`, and `react/` subfolders. `agents/` and `skills/` stay flat
  with prefix-based naming (`rn-`/`ios-`/`android-`/`react-`, unprefixed for
  shared), since Claude Code's plugin loader doesn't support a second
  nesting level for those component types.
- All 8 commands (`/analyze-feature`, `/create-dev-plan`, `/implement-task`,
  `/review-code`, `/review-security`, `/fix-review-comments`,
  `/create-dev-qa-notes`, `/prepare-mobile-release`) are now platform-aware:
  they detect/read the platform and route to the matching platform's
  skill/agent, merging output across platforms for mixed-repo work.
- Folded the `rn-debugger` agent's methodology into the shared
  `mobile-debugging` skill; `/fix-review-comments` now delegates the actual
  fix to whichever platform's feature-developer agent owns the finding.

### Added
- New shared standards: `standards/shared/release-readiness.md` and
  `qa-handoff.md`, extracted from prior skill prose into citable
  `REL-*`/`QA-*` IDs. New `standards/react-native/rn-performance.md`,
  extracted from `rn-performance-reviewer`'s prior inline instructions.
- Structure-only placeholder standards, skills, and agents for the iOS,
  Android, and React (web) platforms, mirroring the React Native module's
  shape, ready to be authored.
- A `platform` field/column across `templates/feature-analysis-template.md`,
  `dev-plan-template.md`, and `task-breakdown-template.md`; platform-tagged
  findings in `code-review-template.md`; platform-specific subsections in
  `qa-handoff-template.md` and `release-checklist-template.md`.

### Fixed
- `hooks/require-approval-before-code.sh` now also matches `.kts` (Kotlin
  build-script) files.

## [0.1.0] - 2026-07-05

### Added
- Initial React Native SDLC plugin: `/analyze-feature`, `/create-dev-plan`,
  `/implement-task`, `/review-code`, `/review-security`,
  `/fix-review-comments`, `/create-dev-qa-notes`, and
  `/prepare-mobile-release` commands, backed by matching skills
  (`rn-repo-analysis`, `rn-dev-planning`, `rn-feature-implementation`,
  `rn-code-review`, `rn-security-review`, `rn-debugging`,
  `rn-testing-and-qa-handoff`, `rn-release-readiness`), agents
  (`repo-analyst`, `rn-architect`, `rn-feature-developer`,
  `rn-code-reviewer`, `rn-performance-reviewer`, `rn-security-reviewer`,
  `rn-debugger`, `rn-release-engineer`), eight standards documents, seven
  pipeline templates, and three safety hooks (`protect-secrets`,
  `require-approval-before-code`, `block-main-branch-changes`).
