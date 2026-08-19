---
name: react-code-review
description: Methodology for reviewing React (web) code changes against the org's authored REACT-* and shared standards. Used by /review-code, scoped to files attributed to the React platform, via the react-code-reviewer and react-performance-reviewer agents and the code-review template. Assumes no framework, router, state, or data library. Files only concrete standards violations within the reviewed change — never modernization suggestions.
---

# React Code Review

## Methodology

This skill runs only against files the command has attributed to the **React (web)** platform. For a mixed-repo review, iOS/Android/React-Native-attributed files are handled by their own platform's code-review skill in parallel, and findings are merged into one `templates/code-review-template.md` with `[platform]` tags — never produced as separate documents.

It is not orchestration. `/review-code` resolves the scope, attributes files to platforms, and loads the standards; this skill is the methodology the two React reviewer agents follow once handed that scope.

**This skill never writes or modifies code.** It reviews.

**This skill assumes no technology.** The bundler (Vite, webpack, CRA, esbuild, Turbopack), framework and rendering model (plain client SPA, Next.js Pages/App Router, Remix), language (JS/TS), router, state library, data-fetching library, and styling approach are **read from the repository under review**, never assumed. This is a separate module from React Native and never cites `RN-*` or the bare `ARCH-*`/`API-*`/`STATE-*`/`NAV-*` IDs.

It inherits the **React lane conventions** recorded once in `standards/react/react-coding-standards.md` — the repository-first source-of-truth hierarchy (an approved upstream artifact > inspected repository evidence > canonical repo knowledge > these standards > official documentation, *supporting only*), technology neutrality, and the **no-modernization-aside stance**. Those decisions are inherited here, **not re-decided**.

## 1. Resolve scope

Use the React-attributed file list/diff handed in by the caller — **do not re-derive it**. `/review-code` owns scope resolution and the file-attribution rule (React = a React-web workspace: a `react`/`react-dom` dependency without `react-native`, plus a web bundler/framework marker).

If this is a whole-repo audit rather than a diff review, state that mode explicitly at the top of the output.

In a monorepo, review each changed file against **its own workspace's** configuration — a sibling package's `tsconfig`, router, or state library is not this file's convention.

## 2. Standards readiness gate

Every React finding cites an authored `REACT-*` standard under `standards/react/`. Before reviewing, confirm those standards are authored (not placeholders). If a cited `standards/react/*` file is missing or is still a structure-only placeholder, **stop and report that real React review is blocked until it is authored** — do not fall back to unwritten expectations. (As of authoring, all **seven** `standards/react/*` files are authored — the six base standards with the `REACT-*` ID skeleton frozen (REACT-001-7), plus `react-smart-tv.md` (`REACT-TV-*`, added additively by REACT-003-1) — as are the shared `A11Y-*`/`I18N-*`/`SEC-*` standards; this gate exists so the skill fails loudly if that regresses.)

The React Smart TV standard is authored: `standards/react/react-smart-tv.md` owns the `REACT-TV-*` root. It is only cited once a TV surface is **established from evidence** — see [§14](#14-device_type-handling-at-review).

## 3. What may be filed — the filing gate

**Every finding must identify a concrete violation of one of exactly four things:**

1. A **repository convention** — an established pattern the changed code departs from.
2. The **project's architecture** — layering, feature-folder placement, dependency direction, the server/client boundary.
3. An authored **`REACT-*` standard**.
4. A **shared standard** — `A11Y-*` or `I18N-*` (`SEC-*` is the security lane's, see [§16](#16-exclusions)).

**A finding that cannot name which of those four it violates is not a finding and must not be filed.**

Hard consequences of this gate:

- **Never file because a different implementation would be more modern, more idiomatic, or preferred by official React/framework documentation.** "The repo uses X, but Y is now recommended" is not reviewable. Official docs are rank-5 supporting guidance and never override a valid repository convention.
- **Modernization suggestions must not appear anywhere in the review output** — not in Findings, not in Not Applicable/Skipped, not as an aside, not in the Verdict. If it is not a violation of one of the four, it does not enter the document. Modernization belongs to a separate feature or technical-debt process, not code review.
- **Nit severity is not an exemption.** A Nit still cites a real standard ID. Without that rule, Nit silently becomes the bucket where opinions land.
- Framework preference, router preference, state-library preference, data-library preference, styling preference, and build-tool preference are **never** findings.

Concretely, none of these is filable: "should migrate Pages Router → App Router", "should adopt RSC", "should replace Redux with Zustand", "should move off CRA to Vite", "should use TanStack Query instead of this `fetch` wrapper", "should convert this JS file to TS", "`useEffect` data fetching should become a Suspense-based pattern".

This matches `skills/android-code-review/SKILL.md`'s strict stance and is deliberately stricter than `skills/rn-code-review/SKILL.md`, which permits a one-line out-of-lane aside. The divergence is intentional, not an oversight — do not "restore" symmetry with the React Native skill.

**Absence of a convention is not compliance.** Where the repository establishes no convention for a case and no `REACT-*` rule is violated, say so explicitly in Not Applicable / Skipped rather than treating the gap as a pass — and do not convert the gap into a finding by supplying a preference.

## 4. Scope discipline — legacy code and the review boundary

Two rules that operate together; neither is correct alone:

- **A concrete `REACT-*` violation is reviewable even when the repository already contains similar legacy code.** Consistency with existing wrong code is not a defense. If the changed effect attaches a listener and never removes it, `REACT-FC-5` is violated whether or not ten other components do the same.
- **Review only code introduced or modified within the resolved review scope.** Never file a finding against pre-existing code outside the reviewed change — not adjacent lines, not the rest of the file, not the module. A pre-existing violation the change happens to sit near is out of scope and is not filed anywhere.

## 5. Triage into standards-relevant buckets

Map each changed file to zero or more buckets. Files matching no bucket are marked **Not Applicable / Skipped** with a one-line reason and are not reviewed further — this keeps the review free of manufactured noise.

| Bucket | Applies to | Standard |
|---|---|---|
| `REACT-TS-*` | any TypeScript source file (**N/A** in a JavaScript-only repo) | `standards/react/react-coding-standards.md` |
| `REACT-FC-*` | any component or hook file | `standards/react/react-coding-standards.md` |
| `REACT-NAME-*` | new/renamed component, hook, utility, or style files; `'use client'`/`'use server'` placement | `standards/react/react-coding-standards.md` |
| `REACT-PROPS-*` | component props and callback typing | `standards/react/react-coding-standards.md` |
| `REACT-LINT-*` | lint/format state of the change, inline rule disables | `standards/react/react-coding-standards.md` |
| `REACT-ARCH-LAYERS-*`, `REACT-ARCH-FOLDERS-*`, `REACT-ARCH-DEPS-*`, `REACT-ARCH-LOGIC-*` | file placement, layering, import direction, where business logic sits | `standards/react/react-architecture.md` |
| `REACT-ARCH-BOUNDARY-*` | the server/client boundary (**RSC surfaces only**) | `standards/react/react-architecture.md` |
| `REACT-ROUTE-*` | route definitions/segments, params and query handling, redirects, links, navigation calls | `standards/react/react-routing.md` |
| `REACT-STATE-*` | store modules, selectors, entity collections, state-placement decisions, browser-storage persistence | `standards/react/react-state-management.md` |
| `REACT-API-*` | data-fetching definitions, base client, auth transport, cache keys/invalidation, error normalization | `standards/react/react-api-service-layer.md` |
| `A11Y-*` | user-facing interactive surfaces | `standards/shared/accessibility.md` |
| `I18N-*` | files carrying user-visible copy, formatting, or layout direction | `standards/shared/i18n-rtl.md` |

`REACT-PERF-*` is deliberately absent from this table — it belongs to `react-performance-reviewer` ([§8](#8-lane-ownership-for-overlapping-ids)).

Config-only changes (a lockfile bump, a formatter config, a CI file) carry no `REACT-*` bucket unless they change the reviewed code's language level, lint contract, or build output — say so in one line and skip them.

## 6. Stack- and rendering-model-neutral rule selection

The **file being reviewed**, in **its own workspace**, decides which rules apply — never the repository majority, never a preferred stack, and never what the framework's current documentation recommends.

| Surface in the changed file | Rules applied |
|---|---|
| Plain client SPA (Vite/webpack/CRA, client-only router) | the general families; the RSC and SSR families are **N/A** |
| SSR / framework route loaders (Next Pages Router, Remix) | the general families **+** `REACT-ROUTE-SSR-*`, `REACT-API-SSR-*` |
| React Server Components (Next App Router) | the general families **+** `REACT-ARCH-BOUNDARY-*`, `REACT-NAME-6`, `REACT-ROUTE-SSR-*`, `REACT-API-SSR-*` |
| Hybrid repository (an App Router beside a Pages Router, or an SSR shell with client-only islands) | whichever matches **this file's** surface |
| JavaScript-only repository or a `.js`/`.jsx` file in a mixed repo | `REACT-TS-*` is **N/A**; naming, component, architecture, routing, state, API, and lint families still apply |

Rules:

- **Never cross-apply.** Do not file `REACT-ARCH-BOUNDARY-2` or `REACT-PERF-HYDRATION-1` against a client-only SPA that has no server tree; do not file `REACT-ROUTE-SSR-1` against a route that never server-renders; do not file `REACT-NAME-6` where no RSC boundary exists.
- **"Should have used RSC / SSR / TypeScript" is never a finding.** Neither is "should have migrated off this router, store, or bundler." Those are stack opinions, excluded by [§3](#3-what-may-be-filed--the-filing-gate).
- Introducing a **second** router, store, data-fetching library, styling system, or concurrency pattern into a repository that already has one **is** reviewable — as a repository-convention and `REACT-ARCH-*`/`REACT-ROUTE-SERVICE-1`/`REACT-STATE-SLICE-1`/`REACT-API-ORG-4` consistency violation, not because one technology is better than another.
- The same neutrality applies beyond rendering: Redux Toolkit, Zustand, Jotai, Recoil, MobX, Context + `useReducer`; TanStack Query, RTK Query, SWR, a hand-rolled `fetch` wrapper; React Router, TanStack Router, a framework router; CSS Modules, CSS-in-JS, Tailwind, plain CSS; Jest and Vitest — all are valid repository conventions.
- A rule whose enabling technology is absent is recorded **N/A**, not passed and not failed.

## 7. Review-time detection traps

A reviewer who misreads the stack files confident, wrong findings. Confirm each of these from evidence before citing a rule that depends on it — these are the review-relevant subset of `skills/react-dev-planning/SKILL.md#4-react-detection-traps`:

- **`tsconfig` strict via the `extends` chain** — the presence of a `tsconfig.json` does not prove `strict`; resolve the chain before citing `REACT-TS-1`.
- **App Router vs. Pages Router** — check the actual route directory of the reviewed file, not the repository's dependency list, before applying an RSC or SSR family.
- **The `'use client'` boundary** — a file without the directive in an App Router tree is a *server* component; a file below a client boundary is a client component even without its own directive. Establish which side the reviewed file sits on before citing `REACT-ARCH-BOUNDARY-*`.
- **Dependency-present ≠ used** — a router, store, or data library in `package.json` may be unused or half-migrated. The reviewed file's imports decide its convention.
- **Monorepo hoisting** — a dependency resolved from the workspace root is not evidence that this package uses it.
- **Build-time env inlining** — whether a value reaches the client bundle depends on the bundler's env prefix and where it is read; confirm it before citing `REACT-API-BASEQ-6` on a secrets question that belongs to the security lane anyway ([§16](#16-exclusions)).
- **Test runner** — Jest vs. Vitest changes what a test file's conventions are.

When the evidence does not settle a dimension the finding depends on, **do not file the finding** — record the uncertainty in Not Applicable / Skipped in one line.

## 8. Lane ownership for overlapping IDs

Two React standards cite IDs rooted in another family: `react-coding-standards.md` cites `REACT-PERF-CWV-1`; `react-performance.md` cites `REACT-ARCH-BOUNDARY-2` and `REACT-ROUTE-UX-4`.

**The ID's own root decides the owner, not the file it appears in:**

- Any `REACT-PERF-*` ID → `react-performance-reviewer`, always — including `REACT-PERF-CWV-1` cited from `react-coding-standards.md`.
- Every other ID → `react-code-reviewer`, always — including `REACT-ARCH-BOUNDARY-2` and `REACT-ROUTE-UX-4` cited from `react-performance.md`.

This prevents the two agents double-filing the same issue from two directions. It is the same rule `standards/react/react-performance.md`'s *Lane ownership* note states, applied to both agents.

**Smart TV adds a case the root rule cannot settle by itself.** A standalone `REACT-TV-*` root has no owner under "the root decides", so its routing is stated explicitly in `standards/react/react-smart-tv.md`: `REACT-TV-PERF-*` → `react-performance-reviewer`; `REACT-TV-PKG-5`/`-6` → the shared `mobile-security-reviewer` via the `SEC-*` IDs they cite; every other TV family → `react-code-reviewer`.

**One defect, one finding.** Routing by root is not enough when a *single* real defect satisfies rules owned by *different* agents — an undisposed player is both `REACT-TV-MEDIA-3` (this lane) and `REACT-TV-PERF-2` (Pass B). The two agents cannot read each other's output, so:

- **File what your lane sees. Never suppress an observation assuming the other reviewer will file it** — silence is not coordination, and a dropped finding is worse than a duplicated one.
- Where a defect appears in the **One defect, one finding** table in `standards/react/react-smart-tv.md`, file it under that table's **owning ID**, citing the others inside the finding as supporting context.
- Where the owning ID belongs to the other lane, record the observation in your own finding with the owning ID named, and let [§15](#15-merge-into-the-shared-template) reconcile.
- That table is authoritative for TV collisions. This skill dedupes against it at merge.

## 9. The two review passes

**Pass A — `react-code-reviewer`** walks each bucketed file against its standards section, recording pass / fail / not-applicable per rule, and noting the standard ID for anything that fails.

**Pass B — `react-performance-reviewer`** independently audits the same scope against `standards/react/react-performance.md`'s `REACT-PERF-*` rules.

**Pass B runs separately from Pass A, not as a sub-step of it** — so a performance-only change is not miscategorized as a correctness finding, and a correctness-only change does not absorb performance commentary.

**Pass B has a second, different call site.** `react-performance-reviewer` is also invoked by `/prepare-mobile-release`, where the scope is the release candidate as a whole (not a diff) and the output is the React perf sign-off block in `templates/release-checklist-template.md` (pass / pass-with-follow-ups / fail), per the `mobile-release-readiness` skill and `REL-PERF-1`. The `REACT-PERF-*` rules and the measurement discipline in [§12](#12-performance-measurement-discipline) are identical across both call sites; only the scope and the destination document differ. Pass A has no release-stage call site.

## 10. Repository-convention-first review

- **Deviation from the repository's established convention is the finding — not deviation from a generic ideal.** If the repo fetches through an RTK Query base client and the change adds an endpoint consistently with it, that is correct code.
- **Read enough surrounding code to judge the change before filing.** A finding based only on the diff hunk, without checking the file's existing pattern, its workspace config, and its rendering surface, is the characteristic review defect. Reading context is required; filing against that context is not ([§4](#4-scope-discipline--legacy-code-and-the-review-boundary)).
- **Never invent a rule mid-review.** Only cite IDs that exist in the standards files listed in [§5](#5-triage-into-standards-relevant-buckets) and the [Standards citation](#standards-citation) table.
- **Prefer the most specific applicable ID** over a vague observation — `REACT-STATE-BOUNDARY-2` for shareable state kept out of the URL, not a general "state management could be better".
- **Cite a `REACT-TV-*` ID only once the TV surface is established from evidence** ([§14](#14-device_type-handling-at-review)). The family is authored, but a TV dependency in `package.json` does not make the reviewed file a TV file — and `REACT-TV-PERF-*` is the performance reviewer's, not this lane's.

## 11. Severity rubric

| Severity | Meaning | React (web) examples |
|---|---|---|
| **Blocking** | Breaks functionality or violates a hard rule | Refresh/access tokens written to `localStorage` (`REACT-STATE-PERSIST-2`); a redirect target taken unvalidated from a `?next=` param (`REACT-ROUTE-SECURITY-1`); a server-only module imported into a client component (`REACT-ARCH-BOUNDARY-3`); a class component in new code (`REACT-FC-1`); an effect listener/timer/subscription with no cleanup (`REACT-FC-5`) |
| **Major** | Likely to cause a real bug or meaningfully hurts maintainability | Business rules inline in a component instead of a hook/selector/service (`REACT-ARCH-LOGIC-1`); a second parallel data client bypassing the shared base layer (`REACT-API-BASEQ-1`); a raw library error union reaching the UI (`REACT-API-ERR-1`); effect data fetching that is not cancelled on unmount (`REACT-FC-6`, `REACT-API-ASYNC-1`); a service/store module importing from a feature (`REACT-ARCH-DEPS-2`); a mutation that blanket-invalidates unrelated cache tags (`REACT-API-CACHE-2`) |
| **Minor** | Standards deviation without immediate functional risk | Shareable filter/tab/pagination state held in the store instead of the URL (`REACT-STATE-BOUNDARY-2`, `REACT-ROUTE-URL-5`); a navigation path built by string concatenation instead of the typed route definition (`REACT-ROUTE-URL-4`); a hardcoded user-visible string instead of an i18n key (`I18N-COPY-1`); a non-text control with no accessible name (`A11Y-ROLES-1`); derived state recomputed inline instead of through a memoized selector (`REACT-ARCH-LOGIC-3`, `REACT-STATE-SELECT-1`) |
| **Nit** | Style/hygiene deviation — **still requires a cited standard ID** | A file name that does not match its exported component (`REACT-NAME-1`); inline-literal props typing instead of a named `interface` (`REACT-PROPS-1`); a bare `eslint-disable-next-line` with no explanation (`REACT-LINT-2`); a pure-reformatting diff mixed into a functional change (`REACT-LINT-3`) |

Severity describes the **impact of the violation in the reviewed change**, not how strongly the reviewer feels about the pattern.

## 12. Performance measurement discipline

This governs Pass B's output at both call sites, and any performance wording anywhere in the document.

- **Write magnitude as a measurement request, never as an asserted number.** "This adds ~300 ms to LCP" read off the source is not a finding. The filable form is: the `REACT-PERF-*` rule violated, the scenario, and the measurement that would confirm the impact — metric + scenario + threshold, measured on a **production build**.
- **`REACT-PERF-BUNDLE-1`/`-3` and `REACT-PERF-CWV-1` are observable only on a production build.** If no production-build measurement is available, file the rule violation and state the measurement needed; do not upgrade an unmeasured suspicion to Blocking.
- **Flag a suspected performance issue that needs profiling as needing profiling** — name the tool that would confirm it (React Profiler, Lighthouse/PageSpeed, a bundle analyzer, `web-vitals` field data, the browser Performance panel) rather than presenting a guess as confirmed.
- **`REACT-PERF-RERENDER-1` cuts both ways** — it requires memoization *where profiling or clear inspection shows unnecessary re-render cost*, not everywhere. "Add `React.memo` here" with neither profiling nor a clear inspection basis is not a finding, and reflexive memoization is not compliance.
- A newer library, image loader, virtualization package, or profiling technique is **not** a finding unless the current code concretely violates a `REACT-PERF-*` rule ([§3](#3-what-may-be-filed--the-filing-gate)).

## 13. Remediation and citation discipline

- **Cite the standard ID for every finding.** `/fix-review-comments` re-verifies each fix against the ID the finding cited, so an absent or invented ID breaks the Fix stage.
- **Write concrete remediation** — a specific fix pointer, not a restatement that something is wrong.
- **Format every finding** as `[react] file:line — [REACT-* ID] description — remediation`.
- Keep remediation to a **one-line pointer**; implementing it is `react-feature-developer`'s job in the Fix stage ([§16](#16-exclusions)).

## 14. `device_type` handling at review

Review has **no confirmed `device_type`** — there is no upstream frontmatter to read, unlike the Analyze and Design stages. Handle it minimally:

- **Infer, never demand.** If the reviewed files sit in a Smart TV surface (a Tizen/webOS target or manifest, TV-specific key-code handling, a TV entry point or layout), note it in the review's Scope section. **Never block a review to ask** which device type is in play.
- **The inference must clear the applicability gate before any `REACT-TV-*` rule is cited.** `standards/react/react-smart-tv.md` owns that gate and its seven **detection traps** — read them before filing. The two that bite most often at review time: a TV dependency in `package.json` does **not** make the reviewed file a TV file (a repo may ship both a phone web app and a TV app from shared code — the surface the changed file renders on decides), and a shared component used by both surfaces must satisfy both, so a pointer-only affordance in it is a finding only if the TV surface actually renders it. Where no TV surface is established, the whole TV document is **N/A** — not passed, not violated.
- **Cite the TV rules once the surface is established.** `REACT-TV-*` is authored. Every base `REACT-*` rule still applies on a TV surface too; the TV document adds obligations and names TV equivalents where a base rule assumes a pointer, and never relaxes a base rule.
- **When the surface cannot be determined, the TV rules are Not Applicable — and that is a complete, correct answer.** A diff-scoped review often *cannot* establish which surface a shared component renders on; that would need repo-wide consumer tracing. You are told never to block and ask, so the fallback is explicit: state once in **Not Applicable / Skipped** that the TV surface could not be established from the reviewed scope, and do not cite TV rules. **Do not** guess a TV surface in order to have something to say, and **do not** treat inability to establish it as a pass. An unresolvable surface is `[unknown]`, not `mobile`.
- **Lane split within the TV root.** This skill's code-review lane owns `REACT-TV-FOCUS-*`, `REACT-TV-INPUT-*`, `REACT-TV-UI-*`, `REACT-TV-MEDIA-*`, `REACT-TV-LIFECYCLE-*`, and `REACT-TV-PKG-1..4`/`-7`/`-8`. **`REACT-TV-PERF-*` belongs to `react-performance-reviewer`**, and it holds even when a TV concern sounds performance-adjacent (a focus-restoration bug that feels sluggish is `REACT-TV-FOCUS-*`, filed here). **`REACT-TV-PKG-5`/`-6` belong to the shared `mobile-security-reviewer`** — they are secrets rules wearing a packaging number; cite them as context, never file them here. `REACT-TV-PKG-*` is generally unreachable from an application-code diff — record it Not Applicable with the reason, and note that `/prepare-mobile-release` is that family's real enforcement point, not this review.
- **Suppress inapplicable pointer/touch rules rather than invent TV rules.** `A11Y-TOUCH-1` already states that on TV form factors the requirement is a reliably focusable element with a clearly visible focus state instead of a touch-target size; `REACT-TV-FOCUS-3` is the React rule that owns it. Two shared rules do **not** transfer cleanly and the TV document records how: `A11Y-SR-1`'s VoiceOver/TalkBack walkthrough (no TV equivalent — the semantic role/label/state obligation survives, per `REACT-TV-UI-7`) and `A11Y-FONT-1`'s OS font-scale premise (per `REACT-TV-UI-4`).
- **Never apply pointer or touch assumptions to a TV surface** — hover affordances, tap/swipe gestures, pointer-scroll, and soft-keyboard flows do not transfer to a D-pad/remote model. `REACT-TV-INPUT-6` owns this.
- **Never treat TV as a separate platform.** There is no separate TV reviewer, skill, or platform value; `tv` is a device type inside the React platform.

This skill does **not** author React Smart TV rules — `standards/react/react-smart-tv.md` owns them, and this skill cites them.

## 15. Merge into the shared template

Populate `templates/code-review-template.md` in full, tagging every finding `[react]`:

- **Scope** — files reviewed, platforms reviewed, the workspace(s) involved, the rendering surface(s) the rules were selected for ([§6](#6-stack--and-rendering-model-neutral-rule-selection)), and the TV-surface note from [§14](#14-device_type-handling-at-review) when applicable.
- **Standards Checked** — the `REACT-*` and shared IDs actually applicable to this scope.
- **Findings by Severity** — Blocking / Major / Minor / Nit. **Severity stays the primary organizing axis even for a mixed-platform diff** — tag findings inline, never section the document by platform.
- **Performance** — Pass B's findings, same severity scale, following [§12](#12-performance-measurement-discipline).
- **Not Applicable / Skipped** — files and checks skipped, one-line reason each, including families that are N/A for the surface (RSC/SSR families on a client SPA, `REACT-TS-*` in a JS repo).
- **Verdict** — Approved / Approved with follow-ups / Blocked.

Write explicit **"None found"** for any empty section. **Merge with** whatever other reviewers produced for the same scope — never overwrite it, and never emit a separate React document.

**Deduplicate at merge, using the *One defect, one finding* table in `standards/react/react-smart-tv.md`.** Because Pass A and Pass B audit the same scope independently and cannot see each other's output, the same physical defect can arrive from both. At merge:

1. Where two findings describe **the same defect at the same site**, keep the one filed under the table's owning ID, fold the other's reasoning into it as supporting context, and cite both IDs in the single surviving finding.
2. Keep the **higher** of the two severities, and keep Pass B's measurement framing where the surviving finding carries a magnitude claim ([§12](#12-performance-measurement-discipline)).
3. A merged finding stays in the section its owning ID implies — a player-teardown defect owned by `REACT-TV-MEDIA-3` belongs in Findings by Severity, not under **Performance**, even though Pass B also saw it.
4. **Two findings at different sites are not duplicates**, however similar the rule; do not collapse them.
5. Never resolve a duplicate by dropping both.

## 16. Exclusions

- **Security.** All `SEC-*` concerns defer to `mobile-security-review` via `/review-security`, including the web-specific `[web only]` rules — `SEC-WEB-*` (XSS/CSP/CSRF, redirects, CORS, third-party scripts) and `SEC-COOKIE-*` (browser session handling), plus `SEC-STORAGE-*`, `SEC-SECRETS-*`, `SEC-HARDEN-*`, and `SEC-LOG-1`. Do not duplicate security commentary here, even incidentally. Where a `REACT-*` rule and a `SEC-*` rule describe the same code (e.g. `REACT-STATE-PERSIST-2` and `SEC-COOKIE-2`; `REACT-ROUTE-SECURITY-1` and `SEC-WEB-5`; `REACT-API-BASEQ-6` and `SEC-SECRETS-2`), this lane files the **`REACT-*`** ID and leaves the `SEC-*` adjudication to the security reviewer.
- **Cross-lane findings.** Performance stays with Pass B; everything else stays with Pass A ([§8](#8-lane-ownership-for-overlapping-ids)).
- **Pre-existing code outside the reviewed change** ([§4](#4-scope-discipline--legacy-code-and-the-review-boundary)).
- **Modernization, stack preference, and architectural opinion**, everywhere in the document ([§3](#3-what-may-be-filed--the-filing-gate)).
- **Fixes.** This skill does not repair flagged code — that is `react-feature-developer`'s job in the Fix stage, via `/fix-review-comments` and `skills/react-feature-implementation/SKILL.md`.
- **Product scope and design decisions.** Whether the feature should behave this way is the Analyze/Design stage's question, not a review finding.

## Standards citation

Cite only IDs that exist in these files and genuinely apply to the change under review.

| Area | Standard file | IDs | Lane |
|---|---|---|---|
| TypeScript, components, hooks, naming, props, lint | `standards/react/react-coding-standards.md` | `REACT-TS-*`, `REACT-FC-*`, `REACT-NAME-*`, `REACT-PROPS-*`, `REACT-LINT-*` | code-reviewer |
| Architecture, layers, folders, dependency direction, server/client boundary | `standards/react/react-architecture.md` | `REACT-ARCH-*` | code-reviewer |
| Routing, URL state, redirects, navigation | `standards/react/react-routing.md` | `REACT-ROUTE-*` | code-reviewer |
| State management, selectors, entities, persistence | `standards/react/react-state-management.md` | `REACT-STATE-*` | code-reviewer |
| API / data layer, caching, auth transport, errors | `standards/react/react-api-service-layer.md` | `REACT-API-*` | code-reviewer |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-*` | code-reviewer |
| Localization & RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-*` | code-reviewer |
| Performance & Core Web Vitals | `standards/react/react-performance.md` | `REACT-PERF-*` | **performance-reviewer** |
| Smart TV — focus, remote input, 10-foot UI, playback, lifecycle, packaging config | `standards/react/react-smart-tv.md` | `REACT-TV-FOCUS-*`, `REACT-TV-INPUT-*`, `REACT-TV-UI-*`, `REACT-TV-MEDIA-*`, `REACT-TV-LIFECYCLE-*`, `REACT-TV-PKG-1..4`, `REACT-TV-PKG-7..8` | code-reviewer |
| Smart TV — constrained runtime & memory budget | `standards/react/react-smart-tv.md` | `REACT-TV-PERF-*` | **performance-reviewer** |
| Smart TV — signing material & secrets in the package | `standards/react/react-smart-tv.md` | `REACT-TV-PKG-5`, `REACT-TV-PKG-6` | **neither — `mobile-security-review`**, via the `SEC-*` IDs they cite |
| Security & privacy (shared) | `standards/shared/mobile-security.md` | `SEC-*` | **neither — `mobile-security-review`** |

Do not use React Native's `RN-*` or the generically-named `ARCH-*`/`API-*`/`STATE-*`/`NAV-*` IDs for React, and do not use Android's `AND-*` or iOS's `IOS-*` — React cites the `REACT-*` roots above.

**The two Smart TV rows above are conditional on the surface**, not on the repository: cite them only once the reviewed file's TV surface is established from evidence per [§14](#14-device_type-handling-at-review). A standalone `REACT-TV-*` root has no owner under the "root decides the filer" rule that governs every other row, which is why the TV families are split across two rows here and why `standards/react/react-smart-tv.md` states the same routing table itself.

## Red flags — STOP and report instead of proceeding

- A cited `standards/react/*` file is missing or is a structure-only placeholder (see [§2](#2-standards-readiness-gate)).
- You are about to file a finding you cannot tie to one of the four categories in [§3](#3-what-may-be-filed--the-filing-gate).
- You are about to file a modernization, stack-preference, or architectural-preference observation anywhere in the document.
- You are about to file against pre-existing code outside the resolved review scope.
- You are about to cite a standard ID without confirming it exists.
- You are about to cite a `REACT-TV-*` rule against a file whose TV surface you have not established from evidence ([§14](#14-device_type-handling-at-review)) — or a `REACT-TV-PERF-*` ID, which belongs to `react-performance-reviewer`.
- You are about to apply an RSC or SSR rule family to a file whose surface does not server-render, or `REACT-TS-*` to a JavaScript-only repository.
- You are about to state an unmeasured performance magnitude as fact, or an unprofiled guess as a confirmed Blocking finding.
- The scope handed in by the command is missing or ambiguous — ask the caller rather than re-deriving it.

## Relationship with command, agents, skills

Responsibilities stay separated:

- **`commands/review-code.md`** — scope resolution, platform attribution, standards loading, invoking both agents, merging all platforms into one document.
- **`commands/prepare-mobile-release.md`** — the Release-stage call site for `react-performance-reviewer` only ([§9](#9-the-two-review-passes)).
- **`agents/react-code-reviewer.md`** — Pass A executor (correctness / style / standards).
- **`agents/react-performance-reviewer.md`** — Pass B executor (`REACT-PERF-*`), also invoked by `/prepare-mobile-release` for the release perf sign-off.
- **This skill** — the React review methodology both agents follow.
- **`skills/mobile-security-review/SKILL.md`** — the separate security lane, invoked by `/review-security`.
- **`skills/react-feature-implementation/SKILL.md`** — the Implement/Fix-stage methodology that fixes what this review files.
- **`skills/rn-code-review/SKILL.md`** — React Native's separate module. Related, never shared: no `RN-*` ID, standards doc, or aside policy crosses over.
