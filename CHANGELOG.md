# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this plugin adheres to [Semantic Versioning](https://semver.org/). The
version below is the plugin's own `version` in
[`plugin.json`](.claude-plugin/plugin.json).

## [Unreleased]

REACT-001 — the six React (web) standards. REACT-002 — the four React agents and
three React skills. REACT-003 — React Smart TV via `device_type: tv`, including the
batched adversarial review and the fixes it produced.

### Added
- `standards/react/react-smart-tv.md` (REACT-003-1) — the standalone React Smart TV
  standard, a new seventh React standards document. 51 rules across
  `REACT-TV-FOCUS-1..8`, `REACT-TV-INPUT-1..6`, `REACT-TV-UI-1..7`,
  `REACT-TV-MEDIA-1..6`, `REACT-TV-LIFECYCLE-1..5`, `REACT-TV-API-1..4`,
  `REACT-TV-PERF-1..7`, and `REACT-TV-PKG-1..8`. **Purely additive** — it defines a new `REACT-TV-*` root and
  renumbers nothing, so every REACT-001 ID frozen on 2026-08-16 keeps its number and
  meaning. Smart TV is framed strictly as `device_type: tv` **inside** the `react`
  platform: no `react-tv` platform value, no TV-specific agent, skill, or command.
  Because a standalone `REACT-TV-*` root does not resolve under the lane's mechanical
  "the ID's own root decides the filer" rule, the document opens with an explicit
  lane-routing table — `REACT-TV-PERF-*` to `react-performance-reviewer`, every other
  family to `react-code-reviewer`, `REACT-TV-PKG-*` at Build/Release stage — plus an
  applicability stage so a rule the reviewed scope cannot reach is recorded Not
  Applicable rather than passed. Vendor-neutral across Tizen, webOS, and browser-based
  TV runtimes: the repository's existing focus model, key map, player, and packaging
  toolchain are findings, never defaults, and no rule freezes a vendor manifest schema
  or key-code value into the file. Covers 10-foot UI, D-pad spatial navigation and focus
  management with a never-lose-focus guarantee, visible focus treatment as the TV reading
  of shared `A11Y-TOUCH-1`, overscan-safe layout, remote/Back key handling, media
  playback and TV app lifecycle, an explicit constrained-runtime/memory budget under
  `REACT-TV-PERF-*`, and vendor packaging/manifest/signing. Seven TV detection traps,
  each naming the confident-but-wrong finding it prevents. Also records where a shared
  mobile-oriented rule does not transfer: `A11Y-SR-1`'s VoiceOver/TalkBack walkthrough
  and `A11Y-FONT-1`'s OS font-scale premise have no reliable TV equivalent, so the
  semantic obligation is kept and the gap is stated rather than silently passed.
  Closes with 13 rank-5 external references, each fetched and confirmed to resolve,
  grouped Tizen / webOS / standards-and-platform-APIs. No manifest schema, key code,
  safe-area inset, or memory limit is frozen into any rule — such values appear only in
  the reference list and are marked illustrative, because vendor docs are reorganized
  and vendor tooling retired without notice (the reference list cites the current webOS
  CLI guide and says why the webOS TV CLI one, deprecated March 2024, is not used; and
  it flags W3C CSS Spatial Navigation as a 2019 Working Draft rather than an available
  browser capability).
  REACT-003-2 threaded the `device_type: tv` branches into the base documents and
  REACT-003-3 stated the contract across the React skills and agents (both below).
  The batched adversarial review then found 9 defects, all fixed, which changed three
  things worth naming: `REACT-TV-FOCUS-8` originally required RTL focus movement to
  "advance in reading order", which **contradicted** `REACT-TV-FOCUS-5`'s spatial-adjacency
  rule and was simply wrong — a D-pad maps to screen geometry, so a mirrored rail is
  navigated by geometry; the document gained a **One defect, one finding** collision table
  (8 rows) plus a merge-time dedup step, because `REACT-TV-MEDIA-3` and `REACT-TV-PERF-2`
  can describe one defect across two different owners; and `REACT-TV-PKG-5`/`-6` were
  re-routed to the shared `mobile-security-reviewer`, since they are secrets rules and
  routing them to the React lane contradicted this document's own deferral of security.
  A fourth family, `REACT-TV-API-1..4`, was added afterwards to settle the auth-transport
  question: `REACT-API-BASEQ-2` mandates `httpOnly`/`Secure`/`SameSite` cookie transport
  as though unconditional, but a TV platform distinguishes a **packaged** app (resources
  installed locally, non-`http(s)` scheme) from a **hosted** app served over `http(s)`,
  and cookie behavior differs between them — so the transport is now established from
  vendor documentation for the targeted firmware rather than assumed. Where cookies are
  unavailable the in-memory-token path becomes the primary design rather than a
  compromise, with no relaxation of the no-script-readable-storage, no-logging and
  no-inlining rules — reaching for `localStorage` because "cookies don't work on TV" is
  named as a defect, not a workaround. The same family records that Samsung documents the
  CORS `Origin` request header as **unsupported** on its TVs and requires reachable
  origins declared in `config.xml`, so adding a backend host can be a packaging change,
  and that CSRF exposure is re-derived against the established transport rather than
  inherited.
- `agents/react-architect.md` + `skills/react-dev-planning/SKILL.md` (REACT-002-1),
  `agents/react-feature-developer.md` + `skills/react-feature-implementation/SKILL.md`
  (REACT-002-2), and `agents/react-code-reviewer.md` +
  `agents/react-performance-reviewer.md` + `skills/react-code-review/SKILL.md`
  (REACT-002-3) — the React (web) planning, implementation, and review lanes, replacing
  the structure-only placeholders. Thin agents, thick skills, mirroring the React Native
  and Android lanes. Every lane opens with a standards-readiness gate that stops on a
  placeholder standard, assumes no bundler/framework/router/state/data library, honors
  `device_type` (`mobile`/`tv`) with no silent default, and cites only the frozen
  `REACT-*` IDs plus the shared `A11Y-*`/`I18N-*`/`SEC-*` rules — never React Native's
  `RN-*` or the bare `ARCH-*`/`API-*`/`STATE-*`/`NAV-*` families. The review lane adds
  the four-category filing gate (repository convention / architecture / a `REACT-*`
  standard / a shared standard), lane separation by ID root (`REACT-PERF-*` to the
  performance reviewer, everything else to the code reviewer), and performance magnitude
  written as a measurement request rather than an asserted number. Security defers
  entirely to the shared `mobile-security-reviewer`. Flipping these markers opens the
  React routes in `/analyze-feature`, `/dev-design-start`, `/dev-feature-start`,
  `/implement-task`, `/fix-review-comments`, `/create-dev-qa-notes`, `/review-code`, and
  `/prepare-mobile-release`.
- `standards/react/react-coding-standards.md`, `react-architecture.md`,
  `react-api-service-layer.md`, `react-routing.md`, `react-state-management.md`,
  `react-performance.md` — the React (web) standards, replacing the structure-only
  placeholders. 111 rules across the `REACT-TS/FC/NAME/PROPS/LINT`, `REACT-ARCH-*`,
  `REACT-API-*`, `REACT-ROUTE-*`, `REACT-STATE-*`, and `REACT-PERF-*` families; every
  family carries the `REACT-` prefix so IDs never collide with the React Native,
  Android, or iOS modules. Repository-first and framework-neutral (no assumed stack),
  citing the shared `SEC-WEB-*`/`SEC-COOKIE-*`/`A11Y-*` rules for web security and
  accessibility. The lane ID skeleton is frozen (REACT-001-7), which is what let the
  REACT-002 agents and skills above cite stable IDs.

### Changed
- `standards/react/react-api-service-layer.md` — gains a Smart TV branch (added after the
  adversarial review, outside 003-2's original four documents) qualifying the two premises
  of this document that are browser premises: `REACT-API-BASEQ-2`'s cookie-first auth
  transport and `REACT-API-BASEQ-5`'s CORS model. Neither frozen rule's text changed;
  the branch routes to `REACT-TV-API-1..4`, which own establishing the transport and the
  cross-origin model from vendor documentation for the actual target and app type.
- `standards/react/react-coding-standards.md`, `react-architecture.md`, `react-routing.md`,
  `react-performance.md` (REACT-003-2) — each gains an additive
  `## Smart TV context (device_type: tv)` branch routing every TV obligation to the
  `REACT-TV-*` rule that owns it. **The branches author no rules**, so a TV finding is
  filed once under its owner and never duplicated into a base document, and each repeats
  the applicability gate (no TV surface → the section is N/A). Verified additive: every
  frozen REACT-001 rule ID across all six base documents is byte-identical to the
  previous commit — 111 rules, nothing renumbered, dropped, or added to a frozen family.
  The branches record where a base rule's *premise* weakens on TV rather than glossing
  it: a packaged app's URLs are generally not shareable, so `REACT-ROUTE-URL-5` and
  `REACT-ROUTE-STABILITY-2` rest on reload-survival instead and a shareability-based
  finding must not be raised; `REACT-ROUTE-STABILITY-3`, `REACT-ROUTE-SSR-*`,
  `REACT-ARCH-BOUNDARY-*`, `REACT-PERF-HYDRATION-1`, and `REACT-NAME-6` are normally
  N/A on a packaged app and are recorded Not Applicable with a reason rather than passed;
  `REACT-PERF-CWV-1` is reinterpreted rather than deleted, with key-press responsiveness
  replacing INP's pointer model. `react-coding-standards.md` additionally states the
  lane-level `device_type` contract (enum `mobile`/`tv`, no `mixed`, no silent default,
  TV is a context signal and not a platform) and records that adding a root is the only
  sanctioned way to extend the lane after an ID freeze — correcting its own now-false
  claim that six React standards are authored.
- `agents/react-architect.md`, `react-feature-developer.md`, `react-code-reviewer.md`,
  `react-performance-reviewer.md`, `skills/react-dev-planning/SKILL.md`,
  `react-feature-implementation/SKILL.md`, `react-code-review/SKILL.md` (REACT-003-3) —
  the `device_type` contract now states that Smart TV is authored and citable. All 17
  lines that told an agent `REACT-TV-*` was unauthored and not citable are replaced with
  the positive contract: on `device_type: tv`, cite `REACT-TV-*` **in addition to** the
  base `REACT-*` rules, which all still apply. Each standards-readiness gate now counts
  **seven** `standards/react/*` files and covers `react-smart-tv.md`. The two review
  agents and the code-review skill carry the `REACT-TV-*` routing table, since a
  standalone TV root has no owner under the lane's "the ID's own root decides the filer"
  rule: `REACT-TV-PERF-*` to `react-performance-reviewer`, every other TV family to
  `react-code-reviewer`, with `REACT-TV-UI-6` and `REACT-TV-MEDIA-3` called out by name
  as code-reviewer-owned despite being performance-adjacent. Because review has no
  confirmed `device_type`, both reviewers must establish the TV surface from evidence
  before citing any TV rule — a TV dependency in `package.json` does not make a reviewed
  file a TV file — and where no TV surface is established the TV rules are Not
  Applicable rather than passed or violated.
- `README.md` — the React standards, skills, and agents are no longer described as
  placeholders; the React (web) summary now states that the platform is complete end to
  end, including Smart TV support via `device_type: tv`.

## [0.5.0] - 2026-08-12

SHARED-011 — the legacy planning-document migration framework. Implements
[`docs/planning/SHARED-011-legacy-document-migration-design.md`](docs/planning/SHARED-011-legacy-document-migration-design.md).

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

### Added
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
