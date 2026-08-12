# ono-mobile-dev-plugin

A [Claude Code](https://claude.com/claude-code) plugin encoding Ono Apps' mobile-division SDLC workflow: an eight-stage pipeline that takes a feature from analysis to release, with a human approval gate between every stage — across **React Native**, native **iOS**, native **Android**, and **React (web)**, and any mix of them in the same repo.

Each stage is a slash command backed by a dedicated skill and specialized subagents. Process is shared across every platform; platform-specific knowledge (coding standards, architecture, performance concerns) is loaded only for the platform(s) a given task actually touches. Every stage reads the approved template output of the previous one, so the whole pipeline stays traceable from feature request to shipped release.

## Install

From the marketplace:

```
/plugin marketplace add OnOAppsDev/ono-plugin-marketplace
/plugin install ono-mobile-dev-plugin@ono-plugin-marketplace
```

Local (for development of the plugin itself):

```bash
claude --plugin-dir /path/to/ono-mobile-dev-plugin
```

## What this plugin supports

- **React Native** — the plugin's original, most fully-built-out platform. Full standards, skills, and agents.
- **Native iOS** — routing, platform detection, and folder structure are fully wired up. The five iOS **standards are authored** (IOS-001) with citable `IOS-*` IDs; the iOS skills and agents are still structure-only placeholders (see [Plugin internals](#plugin-internals)) pending IOS-002/003/004.
- **Native Android** — routing, platform detection, and folder structure are fully wired up; the standards/skills/agents themselves are currently structure-only placeholders (see [Plugin internals](#plugin-internals)) waiting to be authored.
- **React (web)** — a plain browser SPA (Vite/CRA/Next.js), not React Native for Web. Also structure-only placeholders today. Kept as a fully separate module from React Native despite overlapping JS/TS/React fundamentals, since the two target genuinely different runtimes (browser vs. native shell).
- **Mixed repos** — a React Native repo with native iOS and/or Android changes, or a native monorepo containing both an iOS and an Android project, or a monorepo pairing a React web app with an RN/native app.

The shared layer keeps its `mobile-*` naming (`mobile-repo-analysis`, `mobile-security-review`, `/prepare-mobile-release`, etc.) even though React (web) isn't literally mobile — Ono Apps is a mobile division that also owns a React web app, so the umbrella name stayed put rather than triggering a broader rename.

## Documentation

Architecture documentation for the whole plugin ecosystem lives in the **marketplace repository**, [`OnOAppsDev/ono-plugin-marketplace`](https://github.com/OnOAppsDev/ono-plugin-marketplace), which is the single source of truth for it:

| Document | Answers |
|---|---|
| [`docs/architecture/ecosystem-overview.html`](https://github.com/OnOAppsDev/ono-plugin-marketplace/blob/main/docs/architecture/ecosystem-overview.html) | **Start here.** How this plugin cooperates with the Project Inspector, what Repository Knowledge is, the complete command chain from inspection to merge, and how information flows between commands. |

Three documents stay here. The first is [`docs/repo-knowledge-contract.md`](docs/repo-knowledge-contract.md) — the schema this plugin consumes and the obligations it accepts. It ships with the plugin because `scripts/read-repo-knowledge.ts` and the `repo-knowledge-consumer` skill both cite it. Read it before changing anything that touches `.ono/repo-knowledge.json`. The second is [`docs/planning-doc-contract.md`](docs/planning-doc-contract.md) — the frontmatter contract for the planning documents this plugin generates, their version history, and the rules a migration obeys; `scripts/migrate-planning-doc.ts` and the `planning-doc-migration` skill both cite it, and a test asserts the two cannot drift. Read it before changing any template's frontmatter. The third is the planning dashboard described under [Project Planning](#project-planning) below.

The eight-stage pipeline, platform detection and routing, standards and templates are documented in the sections below — they are operational documentation for building and contributing to this plugin, so they stay in this repository.

## Project Planning

The implementation roadmap for building out the plugin is maintained as an interactive dashboard at:

```
docs/planning/PLUGIN_COMPLETION_PLAN.html
```

- **Download the HTML file and open it locally in a browser** — it is fully self-contained.
- The dashboard contains editable tables, implementation tracking, per-owner workload planning, and delivery timelines.
- Changes you make are stored **locally in your browser** (localStorage); they are **not** automatically committed to Git. Use **Export HTML** (or edit the file directly) and commit the file back to the repository to share updates.
- This dashboard is a **planning tool only** — it is not used by the plugin during execution.

## Repository knowledge comes from the inspector, not from re-analysis

When a repository has been inspected by [`ono-project-inspector`](https://github.com/OnOAppsDev/ono-plugin-project-inspector), it carries approved repository knowledge at `.ono/repo-knowledge.json` — a deterministic, versioned index over `CLAUDE.md`, `AUDIT.md`, and `docs/project/*.md`. `/analyze-feature` and `/dev-design-start` **read that instead of re-deriving it**: the stack, build/test commands, module map, component inventory, and coding conventions are consumed rather than re-scanned, and generated documents *cite* those sources by path and anchor instead of pasting a copy that goes stale.

Two properties matter:

- **It is optional.** A repository with no manifest is designed to behave exactly as it always has — full live detection, no prompt, no warning beyond one informational line. The reader and both commands' fallback path are covered by automated tests and a fixture check against a never-inspected repository; end-to-end confirmation via a live command run is tracked as a required manual verification step (see `CHANGELOG.md`). Most repositories start here.
- **It never overrides a decision.** The manifest's `platformHints` is advisory corroboration only. Platform detection and the human confirmation gate run in full on every feature, and `device_type` is resolved live every time — the manifest carries no device information.

What is still derived live on every run, regardless of the manifest: platform detection, device type, folder-structure conformance against the platform's `ARCH-*` standards, per-diff file attribution, and any knowledge category the manifest reports as `unknown` — for example `structure`, whose coverage is `unknown` (not merely "populated because `CLAUDE.md` exists") unless `CLAUDE.md` carries all three of its `Repository Structure`, `Key Modules`, and `Entry Points` headings.

See `docs/repo-knowledge-contract.md` for the schema and the obligations this plugin accepts as a consumer.

## How platform detection works

Every command starts by inspecting the repo (via the `repo-analyst` agent) before doing anything platform-specific:

1. **Raw signal checks** — for React Native: `package.json` with a `react-native` dependency, `metro.config.js`, `app.json`/`app.config.*`, `ios/`/`android/` folders. For native iOS: `.xcodeproj`/`.xcworkspace`/`Package.swift`, `Podfile`, `Info.plist`, Swift/Obj-C files. For native Android: `settings.gradle(.kts)`/`build.gradle(.kts)`, `app/src/main`, `AndroidManifest.xml`, Kotlin/Java files. For React (web): `react`/`react-dom` in `package.json` **without** a `react-native` dependency, plus a web bundler/framework marker (`vite.config.*`, `webpack.config.*`, `next.config.*`, or `react-scripts`).
2. **Disambiguate RN's own native shell from an unrelated native project** — when both RN and a native platform look present, `repo-analyst` checks *linkage* (does the `Podfile` call `use_react_native!`, does `build.gradle` apply the `com.facebook.react` plugin), not just location, before deciding whether the native folder is RN's shell or an independent project.
3. **Monorepo workspace scoping** — if monorepo tooling (Nx, Turborepo, Yarn/PNPM workspaces) is detected, the whole procedure runs per touched workspace/package rather than once for the whole repo. This is what lets a monorepo pairing `apps/web` (React) with `apps/mobile` (RN) resolve correctly.
4. **If detection isn't confident, the plugin asks.** A single-marker tie, no verdict at all, or an inconclusive linkage check stops the command and asks you to pick the platform explicitly — it never guesses a default.

The `platform` value — exactly one of `react-native` / `ios` / `android` / `react`, never `mixed` — is recorded in `templates/feature-analysis-template.md`'s frontmatter by `/analyze-feature` (detection may surface several candidates, but the user confirms one) and carried forward through every later stage — `/dev-design-start`, `/dev-feature-start`, `/implement-task`, and the rest read it rather than re-detecting.

## How shared vs. platform-specific context loads

- **Shared context always loads.** Repo/platform detection, security review taxonomy, accessibility/i18n principles, release-readiness checklist criteria, and QA-handoff criteria are platform-agnostic and used on every task regardless of platform.
- **Platform-specific context loads only for platforms actually touched.** A React-Native-only task never loads `standards/ios/*` or `standards/android/*`; a native-iOS-only repo never loads `standards/react-native/*`.
- **Mixed repos load shared + only the touched platform modules.** A React Native repo with a diff under `ios/` loads shared + react-native + ios. The same RN repo with a diff under `android/` loads shared + react-native + android. A diff touching both native folders loads all four. A native monorepo (iOS + Android, no RN) loads only whichever platform(s) the changed files/task scope actually touch — never both unconditionally.
- **No cross-platform mixing within a single-platform task.** React Native, iOS, and Android standards are never combined for a task that only touches one of them.

### Examples

- **React Native only**: `/analyze-feature "add biometric login"` detects `platform: react-native`, routes to `rn-architect`, and the resulting feature analysis, DD, task breakdown, and every later stage stay entirely within the react-native module.
- **Native iOS only**: a repo with `MyApp.xcodeproj`, a `Podfile` with no RN pod, and Swift sources detects `platform: ios`, routing to `ios-architect`/`ios-feature-developer`/etc.
- **Native Android only**: a repo with `settings.gradle.kts`, `app/src/main`, and Kotlin sources detects `platform: android`, routing to the `android-*` agents.
- **React (web) only**: a repo with `react`/`react-dom` in `package.json`, a `vite.config.ts`, and no `react-native` dependency detects `platform: react`, routing to the `react-*` agents.
- **Multi-platform repo (RN + native)**: an RN repo whose feature could touch `ios/` and/or `android/` native modules detects several *candidate* platforms — `/analyze-feature` then requires the user to select the **single** active platform for this feature, and routes to that one architect. There is no `mixed` authoritative platform; a piece of work that genuinely spans platforms is run as one feature per platform.
- **Mixed (monorepo, web + mobile)**: a monorepo with `apps/web` (React) and `apps/mobile` (RN) — a diff touching only `apps/web` loads shared + react; a diff touching only `apps/mobile` loads shared + react-native (+ native platforms if RN's own shells are touched).

## Quick start

Taking a feature from idea to release (this example is React Native; the flow is identical for any platform, with `platform` in the frontmatter driving which agents/standards get used):

```
# 1. Analyze the feature against the repo's actual conventions and detected platform
#    (include a design reference if the feature has new or changed UI — a Figma link,
#     spec document, mockups/screenshots, or an existing screen to mirror. Non-UI work
#     such as a migration or refactor needs none and won't be asked for one.)
/analyze-feature Add biometric login to the auth flow — design: https://figma.com/file/...

#    → produces a feature analysis with status: proposed, platform: react-native
#    → a human reviews it and flips status to approved

# 2. Turn the approved analysis into a Detailed Design (DD)
/dev-design-start biometric-login

#    → produces a DD with status: draft, platform carried over from the analysis
#    → a human reviews it and flips status to approved

# 3. Break the approved DD into a task breakdown + thin feature plan
/dev-feature-start biometric-login

#    → produces the task breakdown (status: draft); a human approves it

# 4. Implement tasks from the breakdown, one at a time
/implement-task T1

# 5. Review the changes (defaults to the current diff against the base branch)
/review-code
/review-security

# 6. Address the review findings from the filled-in review notes
/fix-review-comments docs/reviews/biometric-login-code-review.md

# 7. Hand off to QA
/create-dev-qa-notes biometric-login

# 8. When the release train is ready, validate shippability
/prepare-mobile-release 2.14.0
```

The pipeline is deliberately gated: `/dev-design-start` refuses to run on a feature analysis still marked `proposed`, `/dev-feature-start` refuses to run on a DD still in `draft`, and `/implement-task` only works from an approved plan — a human signs off between every stage. Code edits are additionally gated by the `require-approval-before-code` hook regardless of platform.

## Commands

| Command | Arguments | What it does |
|---|---|---|
| `/analyze-feature` | feature description (± a design reference) | Detects the platform and the repo's actual stack/conventions, has the user confirm a single platform, then proposes a technical approach via that platform's architect; requires a design reference only for UI-changing work; output starts as `status: proposed` |
| `/dev-design-start` | feature name | Turns an **approved** feature analysis into a Detailed Design (DD), reading `platform` rather than re-detecting; output starts as `status: draft` |
| `/dev-feature-start` | feature name | Turns an **approved** DD into a task breakdown + thin feature plan, carrying `platform` and the design-reference fields forward |
| `/implement-task` | task id | Implements a single task from the approved breakdown, using the task's own `platform` value; gated by the `require-approval-before-code` hook |
| `/review-code` | scope (optional) | Detects touched platform(s) from the diff; reviews for correctness, style, standards-adherence, and performance using shared + platform-specific standards; defaults to the current diff against the base branch |
| `/review-security` | scope (optional) | Always uses the shared mobile security standards; adds platform-specific concerns/examples only when relevant |
| `/fix-review-comments` | review-notes path | Root-causes findings (grouped by platform for a mixed review) and delegates each fix to the matching platform's feature-developer agent |
| `/create-dev-qa-notes` | feature name | Writes shared QA handoff notes with platform-specific build/install/testing instructions |
| `/prepare-mobile-release` | version | Validates shippability with a shared checklist plus platform-specific release validation for every platform the release ships |

## Pipeline

| Stage | Command | Shared skill/agent | Platform-specific skill/agent (per platform touched) |
|---|---|---|---|
| 1. Analyze | `/analyze-feature` | `mobile-repo-analysis`, `repo-analyst` | `rn-architect` / `ios-architect` / `android-architect` / `react-architect` |
| 2. Design | `/dev-design-start` | `dev-design-start` | `rn-dev-planning` / `ios-dev-planning` / `android-dev-planning` / `react-dev-planning` (via the matching architect) |
| 3. Feature start | `/dev-feature-start` | `dev-feature-start` | `rn-dev-planning` / `ios-dev-planning` / `android-dev-planning` / `react-dev-planning` (via the matching architect) |
| 4. Implement | `/implement-task` | — (no shared implementation skill; the approval gate applies to all) | `rn-feature-implementation`/`rn-feature-developer`, and the `ios-`/`android-`/`react-` equivalents |
| 5. Review | `/review-code`, `/review-security` | `mobile-security-review`, `mobile-security-reviewer` (security only) | `rn-code-review`/`rn-code-reviewer`/`rn-performance-reviewer`, and the `ios-`/`android-`/`react-` equivalents (code review + performance) |
| 6. Fix | `/fix-review-comments` | `mobile-debugging` (root-causing) | `rn-feature-developer` / `ios-feature-developer` / `android-feature-developer` / `react-feature-developer` (applies the fix) |
| 7. QA handoff | `/create-dev-qa-notes` | `mobile-testing-and-qa-handoff` | the relevant platform feature-developer agent(s), for build/install/testing instructions |
| 8. Release | `/prepare-mobile-release` | `mobile-release-readiness`, `mobile-release-engineer` | `rn-performance-reviewer` / `ios-performance-reviewer` / `android-performance-reviewer` / `react-performance-reviewer` (perf sign-off per shipping platform) |

`repo-analyst` has no dedicated command — it's invoked by other agents/skills as a first step, on every stage that needs to know the platform.

Note the asymmetry by design: code review and feature implementation have **no shared skill** (each platform's process differs enough that a shared layer wasn't worth it), while the design and feature-start stages, security review, debugging, QA handoff, and release readiness **are** shared, with platform-specific detail supplied either by a thin companion skill (the `*-dev-planning` skills) or by passing detected-platform context into one shared agent (security review, release engineering).

Each stage after Analyze reads its input from the previous stage's approved template output: `/analyze-feature` → `feature-analysis-template.md` → `/dev-design-start` → `dd-template.md` → `/dev-feature-start` → `task-breakdown-template.md` + `dev-plan-template.md` (feature plan) → `/implement-task` → … → `/prepare-mobile-release`.

## Standards and templates

Every agent works against the org's written standards rather than assumed defaults:

- **`standards/shared/`** — mobile security, accessibility, i18n/RTL, release readiness, and QA handoff. Loaded on every task regardless of platform. Today's rule text in `mobile-security.md`, `accessibility.md`, and `i18n-rtl.md` is written from React Native experience (prop names, library names); iOS/Android/React-native equivalents are noted as not-yet-authored gaps rather than silently assumed equivalent.
- **`standards/react-native/`** — React Native/TypeScript coding standards, navigation, state management, API service layer, architecture, and performance. The most fully authored module.
- **`standards/ios/`** — Swift language and style, SwiftUI/UIKit conventions, architecture, performance, and Xcode build/signing. Authored (IOS-001); every rule carries a citable `IOS-SWIFT-*`, `IOS-UI-*`, `IOS-ARCH-*`, `IOS-PERF-*`, or `IOS-BUILD-*` ID, and `swift-standards.md` defines the lane table that routes each root to exactly one reviewer.
- **`standards/android/`**, **`standards/react/`** — structure-only placeholders (Kotlin/React coding standards, UI-framework conventions, architecture, build/signing or bundler config, and performance) mirroring the react-native set, ready to be authored.
- **`templates/`** — one structured template per pipeline artifact: feature analysis, detailed design (DD), feature plan, task breakdown, code review, security review, QA handoff, and release checklist. Stages communicate exclusively through these filled-in templates. Every template that needs to know the platform carries a `platform` field (frontmatter or a per-row column), and the code-review/release-checklist templates support platform-tagged findings/subsections for mixed-platform work.

Reviews cite standard IDs in their findings.

## Safety hooks

Three hooks are always active while the plugin is installed:

| Hook | What it does |
|---|---|
| `protect-secrets` | Blocks any file write/edit that would introduce a hardcoded secret (API keys, tokens, private keys) |
| `require-approval-before-code` | Forces a human-approval prompt before any code file is written or edited — even in auto-approve modes; covers React/TypeScript, Swift/Obj-C, and Kotlin/Java/Kotlin-script (`.kts`) files across every platform; docs and config pass through untouched |
| `block-main-branch-changes` | Blocks file changes while checked out on `main`/`master`, enforcing a feature-branch workflow |

All three hooks are already platform-agnostic and required no changes for iOS/Android/React support beyond adding the `.kts` extension.

## MCP servers

- **`figma`** (`https://mcp.figma.com/mcp`) — the hosted Figma MCP server, used by `/analyze-feature` and `/implement-task` to pull design context, screenshots, and variables from a Figma file, regardless of platform. Figma is one supported design-reference type, not a requirement — a spec document, mockups/screenshots, or an existing screen to mirror works too, and non-UI work needs no design reference at all. Each developer authenticates once via OAuth on first use (`/mcp` to check connection status).

## Plugin internals

```
commands/                          (flat, platform-aware — one per lifecycle stage)
  analyze-feature.md
  dev-design-start.md               dev-feature-start.md
  implement-task.md
  review-code.md
  review-security.md
  fix-review-comments.md
  create-dev-qa-notes.md
  prepare-mobile-release.md

skills/                             (flat, one level — prefix = scope)
  mobile-repo-analysis/             mobile-security-review/
  mobile-debugging/                 mobile-testing-and-qa-handoff/ mobile-release-readiness/
  repo-knowledge-consumer/          (resolves canonical repository knowledge; the only reader of the contract)
  planning-doc-migration/           (loads a planning document through the migration framework; the single frontmatter compatibility layer)
  dev-design-start/  dev-feature-start/    (shared design + task-generation stages)
  rn-dev-planning/  rn-feature-implementation/  rn-code-review/
  ios-dev-planning/ ios-feature-implementation/ ios-code-review/      (placeholders)
  android-dev-planning/ android-feature-implementation/ android-code-review/  (placeholders)
  react-dev-planning/   react-feature-implementation/   react-code-review/    (placeholders)

agents/                             (flat)
  repo-analyst.md  mobile-security-reviewer.md  mobile-release-engineer.md
  rn-architect.md  rn-feature-developer.md  rn-code-reviewer.md  rn-performance-reviewer.md
  ios-architect.md ios-feature-developer.md ios-code-reviewer.md ios-performance-reviewer.md      (placeholders)
  android-architect.md android-feature-developer.md android-code-reviewer.md android-performance-reviewer.md  (placeholders)
  react-architect.md   react-feature-developer.md   react-code-reviewer.md   react-performance-reviewer.md    (placeholders)

standards/
  shared/       mobile-security.md, accessibility.md, i18n-rtl.md, release-readiness.md, qa-handoff.md
  react-native/ react-native-coding-standards.md, react-navigation.md, rn-state-management.md,
                rn-performance.md, rn-architecture.md, rn-api-service-layer.md
  ios/          swift-standards.md, swiftui-uikit-standards.md, ios-architecture.md,
                xcode-build-signing.md, ios-performance.md               (authored, IOS-* IDs)
  android/      kotlin-standards.md, compose-xml-standards.md, android-architecture.md,
                gradle-build-signing.md, android-performance.md          (placeholders)
  react/        react-coding-standards.md, react-routing.md, react-state-management.md,
                react-performance.md, react-architecture.md, react-api-service-layer.md  (placeholders)

templates/                          (flat — shared pipeline artifacts, now platform-aware)
  feature-analysis-template.md, dd-template.md, dev-plan-template.md (feature plan),
  task-breakdown-template.md, code-review-template.md, security-review-template.md,
  qa-handoff-template.md, release-checklist-template.md

hooks/                               (unchanged — already platform-agnostic)
  protect-secrets.json/scan-for-secrets.sh, require-approval-before-code.json/.sh,
  block-main-branch-changes.json/.sh
```

`standards/` nests into `shared/`/`react-native/`/`ios/`/`android/`/`react/` subfolders — it holds plain reference files, not components Claude Code discovers by name, so nesting is safe. `agents/` and `skills/` stay flat with prefix-based naming (`rn-`/`ios-`/`android-`/`react-`, unprefixed for shared) instead: Claude Code's plugin loader discovers agents as flat files and skills as one level of `skills/<name>/SKILL.md` nesting, with no documented support for a second nesting level, so the flat-with-prefix convention this repo already used for React Native was extended to the new platforms rather than introducing per-platform subfolders that discovery might not pick up.
