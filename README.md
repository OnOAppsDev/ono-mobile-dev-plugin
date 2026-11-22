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

## Requirements

- **Node.js 22.18.0 or later on Node 22, or Node.js 24 or later.** The plugin's helper scripts are TypeScript files run directly by `node`, which needs built-in type stripping without a flag. Node 20, Node 22 before 22.18, and every Node 23 release are **not supported**.
- **`jq`** — the safety hooks read each tool call with it.
- **`git`**.
- **For `/pre-pr`:** Python 3 (`python3`) and a Chromium-based browser (Chrome, Edge, Brave or Chromium — or `PRE_PR_BROWSER` pointing at one). The one-page PDF is mandatory; without them `/pre-pr` stops and says what is missing.
- **For `/review-pr`:** `BITBUCKET_API_TOKEN` — an Atlassian API token with the scopes `read:pullrequest:bitbucket` and `read:repository:bitbucket` — set in the environment Claude Code starts in (`BITBUCKET_EMAIL` too, for Basic authentication; otherwise it is sent as a Bearer token). Never paste a token into the chat.

**The Node.js that counts is the one Claude Code runs, which can differ from the one in your terminal** — a version manager such as nvm may set it only for interactive shells, and an app launched outside a terminal may see a different `PATH`. Check it inside Claude Code with `! node -v` and `! which node`.

Every command that runs a plugin script first runs `scripts/node-preflight.mjs` — plain JavaScript, so it runs on any Node — and stops with a message naming the Node.js found, where it is, and what is required. On an unsupported Node, the `require-approval-before-code` hook cannot check a Bug Fix Cycle approval, so it asks for every code edit — and says why.

## What this plugin supports

- **React Native** — the plugin's original, most fully-built-out platform. Full standards, skills, and agents.
- **Native iOS** — routing, platform detection, and folder structure are fully wired up. The five iOS **standards are authored** (IOS-001) with citable `IOS-*` IDs, and the **planning lane is authored** (IOS-002) — `feature-architect` + `platform-planning` against the `ios-dev-planning` lane, so `/analyze-feature`, `/dev-design-start`, and `/dev-feature-start` produce grounded, standards-cited iOS output. The **implementation lane is authored** (IOS-003) — `feature-implementer` + `platform-implementation` against the `ios-feature-implementation` lane, so `/implement-task` produces grounded, standards-cited iOS work and the iOS halves of `/fix-review-comments` and `/create-dev-qa-notes` are served. The **review lane is authored** (IOS-004) — `code-reviewer` and `performance-reviewer` + `platform-review` against the `ios-code-review` skill, so `/review-code` and the iOS perf sign-off in `/prepare-mobile-release` produce grounded, standards-cited output. tvOS-context sections are pending ATV-001/002.
- **Native Android** — routing, platform detection, and folder structure are fully wired up, and the lane is **authored**: ten `standards/android/` documents with citable `AND-*` IDs (ANDROID-001), the planning lane (`feature-architect` + `platform-planning` + `android-dev-planning`, ANDROID-002), the implementation lane (`feature-implementer` + `platform-implementation` + `android-feature-implementation`), and the review lane (`code-reviewer` + `performance-reviewer` + `platform-review` + `android-code-review`). Device types `mobile` and `tv` are both handled.
- **React (web)** — a plain browser SPA (Vite/CRA/Next.js), not React Native for Web. **Complete end to end.** The six base React **standards are authored** (REACT-001) with citable `REACT-*` IDs (111 rules, ID skeleton frozen), and all three lanes are authored (REACT-002) — planning (`feature-architect` + `platform-planning` + `react-dev-planning`), implementation (`feature-implementer` + `platform-implementation` + `react-feature-implementation`), and review (`code-reviewer` + `performance-reviewer` + `platform-review` + `react-code-review`) — so the full pipeline produces grounded, `REACT-*`-cited output. **Smart TV is supported as `device_type: tv`** (REACT-003): a seventh standard, `react-smart-tv.md`, adds 54 `REACT-TV-*` rules covering focus and D-pad spatial navigation, remote input (including cursor mode and the platform IME), 10-foot UI, playback and screensaver handling, app lifecycle, network and auth transport, a constrained-runtime memory budget, and Tizen/webOS packaging — vendor-neutral, and additive over the frozen base IDs. TV is a **context signal inside this platform**, not a platform of its own: there is no `react-tv` value and no TV-specific agent, skill, or command. Kept as a fully separate module from React Native despite overlapping JS/TS/React fundamentals, since the two target genuinely different runtimes (browser vs. native shell).
- **Mixed repos** — a React Native repo with native iOS and/or Android changes, or a native monorepo containing both an iOS and an Android project, or a monorepo pairing a React web app with an RN/native app.

The shared layer keeps its `mobile-*` naming (`mobile-repo-analysis`, `mobile-security-review`, `/prepare-mobile-release`, etc.) even though React (web) isn't literally mobile — Ono Apps is a mobile division that also owns a React web app, so the umbrella name stayed put rather than triggering a broader rename.

## Documentation

Architecture documentation for the whole plugin ecosystem lives in the **marketplace repository**, [`OnOAppsDev/ono-plugin-marketplace`](https://github.com/OnOAppsDev/ono-plugin-marketplace), which is the single source of truth for it:

| Document | Answers |
|---|---|
| [`docs/architecture/ecosystem-overview.html`](https://github.com/OnOAppsDev/ono-plugin-marketplace/blob/main/docs/architecture/ecosystem-overview.html) | **Start here.** How this plugin cooperates with the Project Inspector, what Repository Knowledge is, the complete command chain from inspection to merge, and how information flows between commands. |

Three documents stay here. The first is [`docs/repo-knowledge-contract.md`](docs/repo-knowledge-contract.md) — the schema this plugin consumes and the obligations it accepts. It ships with the plugin because `scripts/read-repo-knowledge.ts` and the `repo-knowledge-consumer` skill both cite it. Read it before changing anything that touches `.ono/repo-knowledge.json`. The second is [`docs/planning-doc-contract.md`](docs/planning-doc-contract.md) — the frontmatter contract for the planning documents this plugin generates, their version history, and the rules a migration obeys; `scripts/migrate-planning-doc.ts` and the `planning-doc-migration` skill both cite it, and a test asserts the two cannot drift. Read it before changing any template's frontmatter. The third is the planning dashboard described under [Project Planning](#project-planning) below.

Two documents describe what other plugins rely on: [`docs/pr-readiness-contract.md`](docs/pr-readiness-contract.md) — the read-only, versioned PR-readiness contract the Platform Guardian queries — and [`docs/guardian-integration.md`](docs/guardian-integration.md), the integration the Guardian makes for 0.8.0.

The eight-stage pipeline, platform detection and routing, standards and templates are documented in the sections below — they are operational documentation for building and contributing to this plugin, so they stay in this repository.

## Metadata ownership

This plugin is distributed through [`OnOAppsDev/ono-plugin-marketplace`](https://github.com/OnOAppsDev/ono-plugin-marketplace),
so two manifests describe it. The split is fixed:

| Field | Owner | Why |
|---|---|---|
| `version` | **`.claude-plugin/plugin.json`** | Claude Code reads the version from here. Its docs are explicit: *"If also set in the marketplace entry, `plugin.json` wins"* — and it wins **without warning**, so a marketplace copy can only ever mask the truth. The marketplace entry therefore declares no version at all. |
| `description` | **`plugin.json`** is canonical | The marketplace entry keeps a deliberate marketplace-facing duplicate, because it is what a user sees while *browsing* before anything is fetched. It must stay semantically aligned by hand; it is not authoritative. |
| `author`, `hooks`, `mcpServers`, components | **`plugin.json`** | They live with the code and move in the same commit. |
| `name` | both, and must match | It is the install identity — `/plugin install ono-mobile-dev-plugin@ono-plugin-marketplace`. Changing it breaks every existing install. |
| `source` (`url`, `ref`, `sha`) | **the marketplace** | Distribution facts this repository cannot know. |
| the marketplace's own `metadata.version` | **the marketplace** | It versions the catalog, not any plugin in it. |

Two consequences worth knowing:

**Bumping `version` here is a release action, not bookkeeping.** Setting a `version` pins
the plugin: users on a git source keep their cached copy until the string changes. Work
merged without a bump does not reach anyone who already installed.

**Nothing enforces the description alignment across repositories.** `scripts/check.ts` is
offline by design and never reads the marketplace repo, so the duplicate is a documented
manual obligation. What *is* machine-checked is the release metadata inside this
repository: `scripts/release-metadata.test.ts` asserts `plugin.json`'s version matches the
newest release heading in [`CHANGELOG.md`](CHANGELOG.md). Cross-repository enforcement is
deliberately out of scope — see SHARED-012 in the completion plan.

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
- **It never overrides a decision.** The manifest's `platformHints` is advisory corroboration only. Platform detection and the human confirmation gate run in full on every feature, and `device_type` is resolved live every time. Project Knowledge may declare surfaces and their form factor; those can corroborate and, after the human confirms the context, scope the work, but they never supply the `device_type`.

What is still derived live on every run, regardless of the manifest: platform detection, device type, folder-structure conformance against the platform's `ARCH-*` standards, per-diff file attribution, and any knowledge category the manifest reports as `unknown` — for example `structure`, whose coverage is `unknown` (not merely "populated because `CLAUDE.md` exists") unless `CLAUDE.md` carries all three of its `Repository Structure`, `Key Modules`, and `Entry Points` headings.

See `docs/repo-knowledge-contract.md` for the schema and the obligations this plugin accepts as a consumer.

## How platform detection works

Every command starts by inspecting the repo (via the `repo-analyst` agent) before doing anything platform-specific:

1. **Raw signal checks** — for React Native: `package.json` with a `react-native` dependency, `metro.config.js`, `app.json`/`app.config.*`, `ios/`/`android/` folders. For native iOS: `.xcodeproj`/`.xcworkspace`/`Package.swift`, `Podfile`, `Info.plist`, Swift/Obj-C files. For native Android: `settings.gradle(.kts)`/`build.gradle(.kts)`, `app/src/main`, `AndroidManifest.xml`, Kotlin/Java files. For React (web): `react`/`react-dom` in `package.json` **without** a `react-native` dependency, plus a web bundler/framework marker (`vite.config.*`, `webpack.config.*`, `next.config.*`, or `react-scripts`).
2. **Disambiguate RN's own native shell from an unrelated native project** — when both RN and a native platform look present, `repo-analyst` checks *linkage* (does the `Podfile` call `use_react_native!`, does `build.gradle` apply the `com.facebook.react` plugin), not just location, before deciding whether the native folder is RN's shell or an independent project.
3. **Monorepo workspace scoping** — if monorepo tooling (Nx, Turborepo, Yarn/PNPM workspaces) is detected, the whole procedure runs per touched workspace/package rather than once for the whole repo. This is what lets a monorepo pairing `apps/web` (React) with `apps/mobile` (RN) resolve correctly.
4. **If detection isn't confident, the plugin asks.** A single-marker tie, no verdict at all, or an inconclusive linkage check stops the command and asks you to pick the platform explicitly — it never guesses a default.

The `platform` value — exactly one of `react-native` / `ios` / `android` / `react`, never `mixed` — is recorded in `templates/feature-analysis-template.md`'s frontmatter by `/analyze-feature` (detection may surface several candidates, but the user confirms one) and carried forward through every later stage — `/dev-design-start`, `/dev-feature-start`, `/implement-task`, and the rest read it rather than re-detecting.

### Mobile vs. TV

Alongside `platform`, every feature carries a **device type** — exactly one of `mobile`
or `tv`. There is no `mixed` device type.

**TV is a context inside a platform, never another platform.** Android TV is `android`
with `device_type: tv`; Apple TV is `ios` with `device_type: tv`; Smart TV is `react`
with `device_type: tv`. There is no fifth platform value, and no TV-specific command,
agent, or skill — one agent and one skill serve both device types per lane.
**React Native is deliberately mobile-only**: that lane has no TV branch.

`device_type` is resolved by `repo-analyst` from packaging and framework markers, then
**confirmed by you** at `/analyze-feature` step 2 — the same gate that confirms the
platform. From there it is carried in frontmatter through every stage and never
re-detected. It is **never inferred from repository signals** later in the pipeline;
`docs/planning-doc-contract.md` records why, including the fact that this organisation's
Android TV surface uses a custom in-house framework, so the conventional markers do not
identify it. When a repository contains both a mobile and a TV target and which one the
work targets cannot be determined, the plugin **stops and asks** rather than assuming
`mobile`.

Where the detail lives, rather than repeated here: the resolution algorithm and TV
markers in [`agents/repo-analyst.md`](agents/repo-analyst.md) (Step 6.5), the frontmatter
contract in [`docs/planning-doc-contract.md`](docs/planning-doc-contract.md), and the
per-lane TV handling in each platform's `*-dev-planning` skill (§14) and `*-code-review`
skill.

**Current TV coverage.** `device_type` flows end to end. Repository-specific TV facts —
the focus model, remote/D-pad input, navigation, TV components, playback and packaging a
repository actually uses — come from Project Knowledge, with each planning lane's TV
discovery pass as the fallback. The platform-neutral TV obligations are the **shared TV
baseline** (`standards/shared/tv-baseline.md`, `TVB-*`), cited by the iOS, Android and React
planning, implementation and review lanes; Smart TV realises it through its authored
standard (`standards/react/react-smart-tv.md`), and Apple TV through five tvOS-specific
rules (`IOS-UI-TV-*`, `standards/ios/swiftui-uikit-standards.md` § *Apple TV (tvOS)*), which
the iOS planning, implementation and review lanes cite, and Android TV through three
Android-TV-specific rules (`AND-UI-TV-*`, `standards/android/compose-xml-standards.md`
§ *Android TV*), which the Android planning, implementation and review lanes cite. None
of them prescribes a UI toolkit, player, DI framework or navigation library.

## How shared vs. platform-specific context loads

- **Shared context always loads.** Repo/platform detection, security review taxonomy, accessibility/i18n principles, release-readiness checklist criteria, and QA-handoff criteria are platform-agnostic and used on every task regardless of platform.
- **Platform-specific context loads only for platforms actually touched.** A React-Native-only task never loads `standards/ios/*` or `standards/android/*`; a native-iOS-only repo never loads `standards/react-native/*`.
- **Mixed repos load shared + only the touched platform modules.** A React Native repo with a diff under `ios/` loads shared + react-native + ios. The same RN repo with a diff under `android/` loads shared + react-native + android. A diff touching both native folders loads all four. A native monorepo (iOS + Android, no RN) loads only whichever platform(s) the changed files/task scope actually touch — never both unconditionally.
- **No cross-platform mixing within a single-platform task.** React Native, iOS, and Android standards are never combined for a task that only touches one of them.

### Examples

- **React Native only**: `/analyze-feature "add biometric login"` detects `platform: react-native`, routes to `feature-architect` + `platform-planning` + `rn-dev-planning`, and the resulting feature analysis, DD, task breakdown, and every later stage stay entirely within the react-native module.
- **Native iOS only**: a repo with `MyApp.xcodeproj`, a `Podfile` with no RN pod, and Swift sources detects `platform: ios`, routing to the shared role agents against the `ios-` lanes.
- **Native Android only**: a repo with `settings.gradle.kts`, `app/src/main`, and Kotlin sources detects `platform: android`, routing to the shared role agents against the `android-` lanes.
- **React (web) only**: a repo with `react`/`react-dom` in `package.json`, a `vite.config.ts`, and no `react-native` dependency detects `platform: react`, routing to the shared role agents against the `react-` lanes.
- **Multi-platform repo (RN + native)**: an RN repo whose feature could touch `ios/` and/or `android/` native modules detects several *candidate* platforms — `/analyze-feature` then requires the user to select the **single** active platform for this feature, and routes `feature-architect` to that one lane. There is no `mixed` authoritative platform; a piece of work that genuinely spans platforms is run as one feature per platform.
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

#    → writes docs/qa/biometric-login-qa-handoff.md with status: draft, and records
#      qa_handoff_link in the task breakdown
#    → a human reviews it and flips status to ready-for-qa

# 8. When the release train is ready, validate shippability
/prepare-mobile-release 2.14.0
```

The pipeline is deliberately gated: `/dev-design-start` refuses to run on a feature analysis still marked `proposed`, `/dev-feature-start` refuses to run on a DD still in `draft`, and `/implement-task` only works from an approved plan — a human signs off between every stage. Code edits are additionally gated by the `require-approval-before-code` hook regardless of platform.

## Commands

| Command | Arguments | What it does |
|---|---|---|
| `/analyze-feature` | feature description (± a design reference) | Detects the platform and the repo's actual stack/conventions, has the user confirm a single platform, then proposes a technical approach via that platform's architect; requires a design reference only for UI-changing work; output starts as `status: proposed` |
| `/analyze-bug` | `BUG-27` / `qa=BUG-27` (`--qa-repo`), `--external=<key> --report`, or `--origin=dev-review\|dev-testing\|production --report` | Prepares a bug in one flow: deterministic bug intake (QA ownership honoured; partial QA context degrades with warnings), confirmed routing, Project Knowledge context, root cause, minimal fix design, verification and cycle-1 tasks, in one Bug Work Plan at `docs/bugs/<bug_key>/bug-work-plan.md` (`docs/bug-work-plan-contract.md`) with one content-bound approval through `scripts/work-approval.ts`. It plans only; the approved plan's tasks are then run with `/implement-task bug:<bug_key> T1` |
| `/dev-design-start` | feature name | Turns an **approved** feature analysis into a Detailed Design (DD), reading `platform` rather than re-detecting; output starts as `status: draft` |
| `/dev-feature-start` | feature name | Turns an **approved** DD into a task breakdown + thin feature plan, carrying `platform` and the design-reference fields forward |
| `/implement-task` | task id (`[feature] T3`, or `bug:<bug_key> T1` with `--qa-repo` / `--report`) | Implements a single task from the approved breakdown, using the task's own `platform` value; gated by the `require-approval-before-code` hook. Bug work runs on the same engine from an approved Bug Work Plan, after re-verifying its approval and the bug evidence |
| `/verify-fix-cycle` | `bug:<bug_key>` | Verifies a bug's current fix cycle once, as a whole: after every task is implemented and its automated checks passed, generates one consolidated checklist at `docs/bugs/<bug_key>/verification-c<n>.md` (reproduction path first, every affected surface), records pass / fail / blocked / not_run per item and surface, and resumes across sessions. A fresh, passed verification is required by `/review-code --bug` and the QA handoff (`docs/bug-work-plan-contract.md` § *Consolidated verification*) |
| `/review-code` | scope (optional), `--bug <bug_key>` or `--feature <feature>` | Detects touched platform(s) from the diff; reviews for correctness, style, standards-adherence, and performance using shared + platform-specific standards; defaults to the current diff against the base branch. With `--bug` or `--feature` it is the work's **mandatory internal review**, persisted as `docs/bugs/<key>/review-c<n>.md` or `docs/reviews/<feature>/review.md` and bound to what was reviewed. A feature review covers the code of the intended pull request (`scripts/pr-scope.ts`) against the approved Feature Analysis, DD, Task Breakdown and acceptance criteria, reads the Figma design through the Figma MCP, and never claims UI conformance it did not verify |
| `/pre-pr` | `bug:<bug_key>` or `feature:<feature>` | The Pre-PR regression checklist, owned by this plugin: after development, developer testing and a fresh internal review with no Blocking finding, the vendored `regression-checklist` skill (the original Pre-PR skill, unchanged) produces at most eight focused checks on one PDF page. The checklist and PDF are kept in the plugin's data directory — never in the repository or the PR — with completion evidence that goes stale when the reviewed code changes. Ends with the PR description to use |
| `/review-pr` | Bitbucket Cloud pull request URL | An independent, **read-only** review of someone else's pull request: metadata, diff and context through the Bitbucket Cloud REST API (GET only), the specification and Figma design the PR references, platform standards and tests. Reports Blocking / Major / Minor findings with `file:line`, missing tests, regressions and unverified assumptions; never comments, approves, merges or writes. Runs in the restricted `pr-reviewer` agent behind the `review-pr-guard` hook |
| `/review-security` | scope (optional) | Always uses the shared mobile security standards; adds platform-specific concerns/examples only when relevant |
| `/fix-review-comments` | review-notes path | Root-causes findings (grouped by platform for a mixed review) and delegates each fix to `feature-implementer` against the matching platform's implementation lane |
| `/create-dev-qa-notes` | feature name | Writes shared QA handoff notes with platform-specific build/install/testing instructions to `docs/qa/{FEATURE-NAME}-qa-handoff.md` as `status: draft`, then records `qa_handoff_link` in the task breakdown |
| `/prepare-mobile-release` | version, release contents (`--feature` / `--bug`), QA readiness (`--qa-readiness`) | Validates shippability with a shared checklist plus platform-specific release validation for every platform the release ships. QA evidence is QA-owned readiness from ono-plugin-qa (`docs/qa-readiness-contract.md`), checked by `scripts/qa-release-gate.ts` — signed, current, untampered, fresh against the QA ledger, covering every feature and bug fix (bugs by QA id and/or external ref, or through a release artifact); the Dev QA handoff is Dev → QA input, not QA sign-off |

### Utilities (outside the pipeline)

| Command | Arguments | What it does |
|---|---|---|
| `/rn-sync-figma-theme` | Figma design-system URL, optional `--dry-run` | React Native only — alerts and hard-fails on any other platform. Scopes to the design-system page/frame when the Figma file has more than one part, reads its variables (colors, spacing, radii, typography) via the `figma` MCP server, and runs them through the deterministic `scripts/figma-theme-tokens.ts` engine (classify → normalize → diff → render) to generate/update the repo's actual canonical theme/tokens module. Diffs against existing token values and requires explicit confirmation before overriding any of them; re-verifies the write afterward. `--dry-run` runs every read-only step and shows the diff without writing. Bypasses feature-pipeline approval only — see [Approval model](#approval-model) — never the write hooks or the override-confirmation gate. |

## Pipeline

Every stage runs one **role agent** plus one **shared lifecycle methodology**, against
**exactly one platform lane** resolved from the confirmed platform. The role agent and the
methodology are platform-independent; the lane is the only source of platform content.

| Stage | Command | Role agent | Shared methodology | Platform lane (exactly one) |
|---|---|---|---|---|
| 1. Analyze | `/analyze-feature` | `feature-architect` | `platform-planning` | `rn-` / `ios-` / `android-` / `react-dev-planning` |
| 2. Design | `/dev-design-start` | `feature-architect` | `platform-planning` + `dev-design-start` | `*-dev-planning` |
| 3. Feature start | `/dev-feature-start` | `feature-architect` | `platform-planning` + `dev-feature-start` | `*-dev-planning` |
| 4. Implement | `/implement-task` | `feature-implementer` | `platform-implementation` | `*-feature-implementation` |
| 5. Review | `/review-code` | `code-reviewer` + `performance-reviewer` | `platform-review` | `*-code-review` |
| 5b. Security | `/review-security` | `mobile-security-reviewer` | `mobile-security-review` | — (shared standards only) |
| 6. Fix | `/fix-review-comments` | `feature-implementer` | `mobile-debugging` (root-causing) + `platform-implementation` | `*-feature-implementation` |
| 7. QA handoff | `/create-dev-qa-notes` | `feature-implementer` | `mobile-testing-and-qa-handoff` | `*-feature-implementation` |
| 8. Release | `/prepare-mobile-release` | `mobile-release-engineer`, then `performance-reviewer` once per shipping platform | `mobile-release-readiness` + `platform-review` | `*-code-review` |

`repo-analyst` has no dedicated command — it's invoked by other agents/skills as a first step, on every stage that needs to know the platform.

Note the asymmetry by design: code review and feature implementation have **no shared skill** (each platform's process differs enough that a shared layer wasn't worth it), while the design and feature-start stages, security review, debugging, QA handoff, and release readiness **are** shared, with platform-specific detail supplied either by a thin companion skill (the `*-dev-planning` skills) or by passing detected-platform context into one shared agent (security review, release engineering).

**From development to a pull request (0.8.0).** Development (`/implement-task`) → developer testing → the mandatory internal review (`/review-code --bug` / `--feature`) → the Pre-PR checklist (`/pre-pr`) → for a bug, the QA handoff (`/create-dev-qa-notes`) → commit, push and the pull request (the Platform Guardian, after it checks `scripts/pr-readiness.ts`) → an independent review (`/review-pr`) → human approval. The planning and review documents are committed with the code and linked from the pull request description. In the feature flow each stage offers the next one (`scripts/feature-flow.ts`) and continues only on the developer's explicit yes; every human approval stays a human edit of `status`.

Each stage after Analyze reads its input from the previous stage's approved template output: `/analyze-feature` → `feature-analysis-template.md` → `/dev-design-start` → `dd-template.md` → `/dev-feature-start` → `task-breakdown-template.md` + `dev-plan-template.md` (feature plan) → `/implement-task` → … → `/prepare-mobile-release`.

## Standards and templates

Every agent works against the org's written standards rather than assumed defaults:

- **`standards/shared/`** — mobile security, accessibility, i18n/RTL, release readiness, and QA handoff. Loaded on every task regardless of platform. Today's rule text in `mobile-security.md`, `accessibility.md`, and `i18n-rtl.md` is written from React Native experience (prop names, library names); iOS/Android/React-native equivalents are noted as not-yet-authored gaps rather than silently assumed equivalent.
- **`standards/react-native/`** — React Native/TypeScript coding standards, navigation, state management, API service layer, architecture, and performance. The most fully authored module.
- **`standards/ios/`** — Swift language and style, SwiftUI/UIKit conventions, architecture, performance, and Xcode build/signing. Authored (IOS-001); every rule carries a citable `IOS-SWIFT-*`, `IOS-UI-*`, `IOS-ARCH-*`, `IOS-PERF-*`, or `IOS-BUILD-*` ID, and `swift-standards.md` defines the lane table that routes each root to exactly one reviewer.
- **`standards/android/`** — Kotlin language and style, Compose/XML conventions, architecture, navigation, networking, persistence, logging/analytics, testing, performance, and Gradle build/signing. Authored (ANDROID-001); every rule carries a citable `AND-*` ID (`AND-KT-*`, `AND-UI-*`, `AND-ARCH-*`, `AND-VM-*`, `AND-NAV-*`, `AND-NET-*`, `AND-DATA-*`, `AND-LOG-*`, `AND-TEST-*`, `AND-PERF-*`, `AND-REL-*`, `AND-DI-*`).
- **`standards/react/`** — React coding standards, architecture, routing, state management, API service layer, and performance. Authored (REACT-001); every rule carries a citable `REACT-*` ID (111 rules across `REACT-TS/FC/NAME/PROPS/LINT`, `REACT-ARCH-*`, `REACT-API-*`, `REACT-ROUTE-*`, `REACT-STATE-*`, `REACT-PERF-*`), repository-first and framework-neutral, citing the shared `SEC-WEB-*`/`A11Y-*` rules for web security and accessibility. `react-smart-tv.md` adds the Smart TV standard (REACT-003-1) — 54 `REACT-TV-*` rules for `device_type: tv`, purely additive over the frozen REACT-001 IDs, vendor-neutral across Tizen/webOS/browser-TV.
- **`templates/`** — one structured template per pipeline artifact: feature analysis, detailed design (DD), feature plan, task breakdown, code review, security review, QA handoff, and release checklist. Stages communicate exclusively through these filled-in templates. Every template that needs to know the platform carries a `platform` field (frontmatter or a per-row column), and the code-review/release-checklist templates support platform-tagged findings/subsections for mixed-platform work.

Reviews cite standard IDs in their findings.

## Safety hooks

Four hooks are always active while the plugin is installed:

| Hook | What it does |
|---|---|
| `protect-secrets` | Blocks any file write/edit that would introduce a hardcoded secret (API keys, tokens, private keys) — `Write`, `Edit`, `MultiEdit` and `NotebookEdit` cells. When it cannot read the call (`jq` missing, an unreadable call) it blocks rather than let an unscanned write through |
| `require-approval-before-code` | Forces a human-approval prompt before any code file is written or edited — even in auto-approve modes; covers React/TypeScript and JavaScript module variants (`.mjs` `.cjs` `.mts` `.cts`), Swift/Obj-C, C/C++ (`.c` `.cc` `.cxx` `.cpp` `.h` `.hh` `.hpp`), Kotlin/Java/Kotlin-script (`.kts`), Gradle/Groovy build scripts (`.gradle` `.groovy`) and stylesheets (`.css` `.scss` `.sass` `.less`) across every platform; docs and config pass through untouched. When no approved Bug Fix Cycle applies, the ask names the Ono command that starts or continues the work (`/ono-mobile-dev-plugin:analyze-bug`, `analyze-feature` or `implement-task`); it never routes and never turns guidance into an allow. Not covered, deliberately: configuration files (JSON/YAML/plist/XML), changes made through shell commands, and the Platform Guardian's routing. When it cannot read the call (`jq` missing, an unreadable call) it asks, as for a code file. On an unsupported Node.js it cannot check a Bug Fix Cycle approval, so it asks and names the Node.js version required ([Requirements](#requirements)) |
| `review-pr-guard` | Enforces `/review-pr`'s read-only guarantee: inside the `pr-reviewer` agent, only reads, the GET-only `scripts/bitbucket-pr.ts` and Figma/Atlassian read tools are allowed, and every other call is denied (fail closed without `jq`). Calls outside that agent pass through untouched |
| `block-main-branch-changes` | Blocks file changes to the project repository while it is checked out on `main`/`master`, enforcing a feature-branch workflow. Covers `Write`, `Edit`, `MultiEdit` and `NotebookEdit`; files outside the project repository (e.g. the session scratch directory) are not affected. When it cannot tell which file is changed — `jq` missing, an unreadable call, a symlink — it blocks on `main`/`master`. It does not cover writes made through shell commands |

The hooks are platform-agnostic. The extension list of `require-approval-before-code` is kept equal to `CODE_EXTENSIONS` in `scripts/edit-approval.ts` by a test.

## Repository validation

The plugin's deterministic parts — five helper scripts, three safety hooks, the four
documentation contracts, and the structural integrity of the component corpus — are
covered by a hand-rolled check suite with no external test framework and no
dependencies. Run it from the repository root:

```bash
node scripts/check.ts            # everything
node scripts/check.ts --strict   # the pre-PR form: a skipped suite is a failure
node scripts/check.ts --only reference-integrity
```

`--strict` exists because a suite can legitimately skip itself — the hooks suite needs
`jq` — and a run that skipped the entire safety layer must not report as healthy.

One of those suites is worth calling out. `scripts/reference-integrity.ts` validates
the repository's own structure: that every cited skill, agent, standard, template,
script and contract path resolves; that every component's frontmatter is valid and its
`name` matches its filename; that every anchor link resolves; that each component's
readiness is classified from its own on-disk marker; and — the point of it — that **no
command routes to a placeholder lane without a readiness gate**. It also checks that
this README's readiness claims match what is actually on disk, so an authored platform
cannot stay documented as a placeholder. It can be run on its own for a grouped report:

```bash
node scripts/reference-integrity.ts
```

**This is a developer and repository quality capability, not a runtime workflow step.**
Nothing a user of the plugin does requires it, no command invokes it, and it needs no
CI. A repository may choose to run the same command automatically in CI later; the
validator has no dependency on that ever happening.

## Approval model

"Approval" means three different, independent things in this plugin. Conflating them is what makes a command's docs claim "no approval" when a write is actually still gated — every command's docs are written to name which of these it means:

1. **Pipeline approval** — the human sign-off between the eight SDLC stages (feature analysis → DD → task breakdown → ...). Only pipeline stages need this; a standalone utility like `/rn-sync-figma-theme` has no pipeline stage to approve and so doesn't need it.
2. **Semantic change approval** — required whenever an operation would change an existing value or make a consequential decision a human hasn't already made, regardless of whether the command is part of the pipeline. `/rn-sync-figma-theme`'s override-confirmation gate (present any existing token that would change, then require an explicit approve/skip/cancel decision before writing) is this kind.
3. **Repository write hooks** — `require-approval-before-code`, `block-main-branch-changes`, `protect-secrets`. Global safety mechanisms that gate every file write in this plugin, regardless of pipeline stage or semantic content.

The rule that keeps these consistent everywhere: **a command may bypass feature-pipeline approval because it is a standalone utility, but it never bypasses repository-level write hooks or semantic override confirmation.** When a command's docs say "no approval gate" or "needs no approval," that always means kind 1 only — never read it as "no approval at all," and no command in this plugin should be written to imply otherwise.

## MCP servers

- **`figma`** (`https://mcp.figma.com/mcp`) — the hosted Figma MCP server, used by `/analyze-feature` and `/implement-task` to pull design context, screenshots, and variables from a Figma file, regardless of platform; by `/review-code --feature` and `/review-pr` to compare the implemented UI with the design actually retrieved (Figma is the source of truth, never copied into the repository); and by `/rn-sync-figma-theme` (React Native only) to read a design system's variables and generate a NativeWind theme. Figma is one supported design-reference type, not a requirement — a spec document, mockups/screenshots, or an existing screen to mirror works too, and non-UI work needs no design reference at all. Each developer authenticates once via OAuth on first use (`/mcp` to check connection status).

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
  rn-sync-figma-theme.md            (utility, outside the pipeline — React Native only)

skills/                             (flat, one level — prefix = scope)
  mobile-repo-analysis/             mobile-security-review/
  mobile-debugging/                 mobile-testing-and-qa-handoff/ mobile-release-readiness/
  repo-knowledge-consumer/          (resolves canonical repository knowledge; the only reader of the contract)
  planning-doc-migration/           (loads a planning document through the migration framework; the single frontmatter compatibility layer)
  dev-design-start/  dev-feature-start/    (shared design + task-generation stages)
  platform-planning/  platform-implementation/  platform-review/  (shared methodologies — platform-independent,
                                     each applied against exactly one platform lane)
  rn-dev-planning/  rn-feature-implementation/  rn-code-review/
  rn-nativewind-theme-sync/         (Figma variables -> NativeWind theme; observation layer only — classification, normalization,
                                     diffing, and rendering are decided by scripts/figma-theme-tokens.ts; no dedicated agent)
  ios-dev-planning/ ios-feature-implementation/ ios-code-review/      (authored)
  android-dev-planning/ android-feature-implementation/ android-code-review/  (authored)
  react-dev-planning/   react-feature-implementation/   react-code-review/    (authored, REACT-002)

agents/                             (flat)
  repo-analyst.md  mobile-security-reviewer.md  mobile-release-engineer.md
  feature-architect.md  feature-implementer.md  code-reviewer.md  performance-reviewer.md
                                      (four shared role agents — one per lifecycle stage,
                                       each run against exactly one platform lane)

standards/
  shared/       mobile-security.md, accessibility.md, i18n-rtl.md, release-readiness.md, qa-handoff.md,
                verification.md, tv-baseline.md                         (TVB-* — the shared TV baseline)
  react-native/ rn-coding-standards.md, rn-navigation.md, rn-state-management.md,
                rn-performance.md, rn-architecture.md, rn-api-service-layer.md
  ios/          swift-standards.md, swiftui-uikit-standards.md, ios-architecture.md,
                xcode-build-signing.md, ios-performance.md               (authored, IOS-* IDs; Apple TV: IOS-UI-TV-*)
  android/      kotlin-standards.md, compose-xml-standards.md, android-architecture.md,
                android-navigation.md, android-networking.md, android-persistence.md,
                android-logging-analytics.md, android-testing.md,
                gradle-build-signing.md, android-performance.md          (authored, AND-* IDs; Android TV: AND-UI-TV-*)
  react/        react-coding-standards.md, react-routing.md, react-state-management.md,
                react-performance.md, react-architecture.md, react-api-service-layer.md  (authored, REACT-* IDs)
                react-smart-tv.md                                       (authored, REACT-TV-* IDs, REACT-003-1)

templates/                          (flat — shared pipeline artifacts, now platform-aware)
  feature-analysis-template.md, dd-template.md, dev-plan-template.md (feature plan),
  task-breakdown-template.md, code-review-template.md, security-review-template.md,
  qa-handoff-template.md, release-checklist-template.md

hooks/                               (unchanged — already platform-agnostic)
  protect-secrets.json/scan-for-secrets.sh, require-approval-before-code.json/.sh,
  block-main-branch-changes.json/.sh
```

`standards/` nests into `shared/`/`react-native/`/`ios/`/`android/`/`react/` subfolders — it holds plain reference files, not components Claude Code discovers by name, so nesting is safe. `agents/` and `skills/` stay flat with prefix-based naming (`rn-`/`ios-`/`android-`/`react-`, unprefixed for shared) instead: Claude Code's plugin loader discovers agents as flat files and skills as one level of `skills/<name>/SKILL.md` nesting, with no documented support for a second nesting level, so the flat-with-prefix convention this repo already used for React Native was extended to the new platforms rather than introducing per-platform subfolders that discovery might not pick up.
