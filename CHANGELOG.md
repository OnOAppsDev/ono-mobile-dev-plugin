# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this plugin adheres to [Semantic Versioning](https://semver.org/). The
version below is the plugin's own `version` in
[`plugin.json`](.claude-plugin/plugin.json).

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
