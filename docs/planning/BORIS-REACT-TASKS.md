# Boris — React (web) + Smart TV Lane: Task Plan

**Owner:** Boris Molotsky · **Platform:** `react` (web) + `device_type:tv` (Smart TV) · **Prepared:** 2026-08-13
**Source of truth:** `docs/planning/PLUGIN_COMPLETION_PLAN.html` (REACT-001, REACT-002, REACT-003)
**Reference to mirror:** the React Native module (`standards/react-native/`, `skills/rn-*`, `agents/rn-*`)
**Completed precedents (quality bar):** ANDROID-001/002 ✓, IOS-001/002 ✓

> This breakdown was produced by fanning research across the RN reference, the Android/iOS precedents, and the shared contracts, then reconciled against three adversarial reviews (completeness, correctness, executability). The review notes are folded into the acceptance criteria below.

---

## At a glance

Your lane is the **program critical path** — React is the only platform still placeholder end-to-end. Three work items, strict epic order **REACT-001 → REACT-002 → REACT-003** (with overlap, see *Sequencing*), ~17 focused days after the review re-estimate.

| Epic | Title | Priority | Effort | External deps |
|---|---|---|---|---|
| **REACT-001** | Author the 6 React web standards + freeze the ID skeleton | Blocker | ~5d | SHARED-002 ✓, SHARED-003 ✓ (done) |
| **REACT-002** | Author 4 React agents + 3 React skills | Blocker | ~9d | REACT-001 |
| **REACT-003** | Add React Smart TV knowledge via `device_type:tv` | High | ~4d | REACT-001 (overlaps REACT-002) |

**Chosen for REACT-003:** a **standalone `standards/react/react-smart-tv.md`** file (+ threading into the base docs). *(Note: this diverges from ATV-001/ANDROID-003, which threaded TV context into existing standards with no new file — decision made deliberately.)*

## The acceptance bar (applies to every deliverable)

Derived from the completed Android/iOS work — a deliverable is **not done** until it:

1. **Repository-first** — grounds every repo claim in a labelled path; source-of-truth hierarchy is *approved upstream > inspected repo evidence > canonical repo knowledge > Ono standards > official React/TS docs (rank 5, supporting only)*; rank 5 never overrides rank 2.
2. **Framework-neutral** — assumes zero stack defaults (CRA/Vite/Next/Remix, JS/TS, any router/state lib/bundler are *possible findings in no order*), proposes no migration unless the feature explicitly requests it, identifies the model **per surface**, not per repository.
3. **Stable citable IDs** — every rule uniquely and stably numbered; **no reuse** of `RN-*`/`AND-*`/`IOS-*` IDs (React is a separate module).
4. **Cites existing shared IDs** rather than re-authoring them: `SEC-WEB-1..6`, `SEC-COOKIE-1..3`, `SEC-STORAGE-1/3`, `SEC-SECRETS-2`, `SEC-LOG-1`, `SEC-HARDEN-2/3`, `A11Y-TOUCH-1/2`, `A11Y-FONT-1..3`, `I18N-TEST-1`, `QA-A11Y-1` — enforcement stays with the shared `mobile-security-reviewer`.
5. **Labels every repository claim** `[evidence:path]` / `[reused:#anchor]` / `[inference]` / `[unknown]`; an unlabelled repo-claim is a defect.
6. **No modernization asides** — "more idiomatic / official docs now recommend" is never a finding or Required work (React follows Android's strict no-aside rule — decided once in REACT-001-1).
7. **React-specific "Detection traps" section** (planning/review deliverables) — build tool inferred from lockfile/scripts not one config file; `tsconfig.compilerOptions.strict` + `extends` chain (TS present ≠ strict); dependency present ≠ used; monorepo hoisting; `type:module` vs CJS; Next App vs Pages Router coexisting; `.env*` inlining (`NEXT_PUBLIC_`/`VITE_`); peer-dep skew; test runner per config. Each trap names the confident-but-wrong finding it prevents.
8. **Correctness / performance / security in separate lanes** decided by ID root.
9. **Survives a batched adversarial review + whole-repo false-claim grep** per epic (correcting any README/`commands/*` justification the React authoring invalidates).
10. **Closes with an `## External references` section** — rank-5 supporting official-doc links, each with a *when to consult* note and the `REACT-` rule IDs it supports; links verified to resolve when added and re-checked in the freeze pass, never fetched at review time. (Pattern set by REACT-001-1; applied to every React standard.)

---

## REACT-001 — Author the 6 React web standards + freeze the ID skeleton  ·  Blocker  ·  ~5d

External deps satisfied (SHARED-002 ✓, SHARED-003 ✓). Author `react-coding-standards.md` first — it fixes two lane-wide decisions everything else inherits.

| # | Subtask | Deliverable | Order after |
|---|---|---|---|
| 001-1 | Coding standards **+ set lane ID scheme & no-aside stance** | `standards/react/react-coding-standards.md` | — |
| 001-2 | Architecture (RN port + server/client boundary) | `standards/react/react-architecture.md` | 001-1 |
| 001-3 | API / service layer (web auth, CSRF, SSR fetch) | `standards/react/react-api-service-layer.md` | 001-1 |
| 001-4 | Routing (**largest rewrite** — URL as source of truth) | `standards/react/react-routing.md` | 001-1 |
| 001-5 | State management (+ URL-as-state boundary) | `standards/react/react-state-management.md` | 001-1, 001-4 |
| 001-6 | Performance (Core Web Vitals, bundles, virtualization) | `standards/react/react-performance.md` | 001-1 |
| 001-7 | **Freeze full ID skeleton + reconcile cross-refs** (gate) | all 6 files | 001-1…6 |

**Key content deltas from the RN port**
- **001-1** records: (a) ID-prefix scheme = **`REACT-` prefix on every family** (`REACT-TS-*`, `REACT-ARCH-LAYERS-*`, `REACT-ROUTE-*`, `REACT-STATE-SLICE-*`, `REACT-PERF-*`, `REACT-TV-*`) — collision-free against RN's `RN-*`/bare-topic families, Android `AND-*`, and iOS `IOS-*`, and consistent with how Android/iOS prefix every family (decided 2026-08-13); (b) aside/modernization stance = no asides. Web-only: DOM listener cleanup, `AbortController`, StrictMode double-fire, `.module.css` / `use client` / `use server`.
- **001-2** — recast Screens → pages/routes; add the **server-component vs client-component boundary** as an architectural layer (no RN equivalent).
- **001-3** — web auth transport (HttpOnly cookies + `credentials:'include'` + CSRF vs bearer-in-JS), CORS/preflight, **never store tokens in localStorage/sessionStorage**, SSR/RSC fetch, `AbortController` cancellation. Cite `SEC-COOKIE-1/2`, `SEC-WEB-3/6`, `SEC-SECRETS-2`, and the **same** all-platform `SEC-LOG-1` (carried forward, not "replaced").
- **001-4** — **rewrite**, not port. URL path/query/`URLSearchParams`/history state as source of truth; deep links collapse into URLs (versioning → URL stability/redirects/canonical/SEO); **decide-and-state** whether the `NAV-SERVICE` abstraction survives; add SSR/hydration-safe routing, `<Link>` prefetch, scroll restoration, Back/Forward, redirect-target validation. Cite `SEC-WEB-5` (the browser-nav counterpart to `SEC-DEEPLINK-1`) + `SEC-WEB-3`.
- **001-5** — add the **URL-as-state boundary** (prefer `searchParams` for shareable UI state before local/global store); browser storage as a persistence tier. Cite `SEC-COOKIE-2`, `SEC-STORAGE-1/3`.
- **001-6** — half-new: virtualization, main-thread long tasks + Web Workers, image `srcset`/`loading=lazy`/CLS, bundle-size/code-splitting, hydration cost, **Core Web Vitals (LCP/CLS/INP)** as targets. Magnitude claims written as **measurement requests**, never asserted from reading code. Owns the `*-PERF-*` family.
- **001-7** *(added by the executability review)* — the single owner of the "freeze IDs before REACT-002" obligation. Fixes the forward-referential-AC defect (routing↔state cross-refs), and **re-verifies every `## External references` link across the six docs resolves**. **After 001-7, no REACT-001 rule may be renumbered.**

---

## REACT-002 — Author 4 React agents + 3 React skills  ·  Blocker  ·  ~9d  ·  after REACT-001-7

Thin agents, thick skills — mirror the RN counterparts section-for-section.

| # | Subtask | Deliverables | Notes |
|---|---|---|---|
| 002-1 | **Planning lane** (vocabulary anchor — do first) | `agents/react-architect.md` + `skills/react-dev-planning/SKILL.md` | gates the vocabulary |
| 002-2 | **Implementation lane** | `agents/react-feature-developer.md` + `skills/react-feature-implementation/SKILL.md` | flipping its marker opens `/implement-task` for React |
| 002-3 | **Review lane** (heaviest) | `agents/react-code-reviewer.md` + `agents/react-performance-reviewer.md` + `skills/react-code-review/SKILL.md` | exercises the whole standards surface |

**Schedule insight (executability review):** at *authoring* time 002-2 and 002-3 depend on 002-1 only as a **soft vocabulary-alignment** constraint — each mirrors its RN counterpart and cites only frozen REACT-001 IDs, never another React agent's markdown. So after 001-7 freezes IDs, **the three lanes can be staffed concurrently** to compress the calendar. The only hard end-gate is **flipping the placeholder markers** — do that per file only once its body is genuinely authored (flipping `react-feature-developer`'s marker opens `implement-task.md` §7's react route).

**Per-lane must-haves**
- **002-1** — §0 standards-readiness gate (STOP if any cited standard is still a placeholder); four-class planning classification (Existing / Required extension / Recommended deviation w/ approval / Unresolved) with modernization always class 3/4; consumes repo knowledge **only** via `scripts/read-repo-knowledge.ts` + `repo-knowledge-consumer` (degrade-not-fail, never parse the manifest directly); `device_type` treated as inherited context; React Detection-traps section.
- **002-2** — reads+honors `platform` AND `device_type` with **no silent "mobile" default**; per-surface standards mapping; design-reference gate mirrored (UI needs a reference, non-UI never asked); **security defers entirely** to the shared `mobile-security-reviewer`; step-7 emits the applied React-ID trace.
- **002-3** — four-category filing gate (every finding names exactly one of repo convention / architecture / a REACT-* standard / a shared standard, else not filed); **lane separation by ID root** (`*-PERF-*` → perf reviewer, everything else → code reviewer); perf reviewer writes magnitude as measurement requests and runs the two invocations (`/review-code` subsection + `/prepare-mobile-release` sign-off); reviewers never fix code; inherits the no-aside stance (does not re-decide it).

---

## REACT-003 — React Smart TV via `device_type:tv`  ·  High  ·  ~4d  ·  after REACT-001 (overlaps REACT-002)

| # | Subtask | Deliverable | Order after |
|---|---|---|---|
| 003-1 | Author the **standalone Smart TV standard** | `standards/react/react-smart-tv.md` (new) | REACT-001 |
| 003-2 | Thread `device_type:tv` branches into the base docs | edits to `react-performance / -coding-standards / -architecture / -routing.md` | REACT-001, 003-1 |
| 003-3 | State the `device_type` contract in the React skills & agents (DOC-002) | 3 skills + 4 agents | 003-1, 003-2, **REACT-002** |

**Coverage (with review gaps folded in):** 10-foot UI, remote/D-pad spatial navigation & focus management, visible focus ring, overscan-safe layout; **Tizen `.wgt` / webOS `.ipk` packaging + `config.xml`/`appinfo.json` manifests + store/cert signing** (GAP 1 — satisfies DoD §7 "TV signing/packaging"); media playback + TV lifecycle, or an explicit `N/A — reason` (GAP 2); an explicit **constrained-runtime/memory-budget** rule under `*-PERF-*` (GAP 3). Frame Smart TV strictly as `device_type:tv` **inside** the React platform (enum is `mobile|tv` only — no `react-tv`, no `mixed`). Threading in 003-2 is **additive** — never renumber frozen REACT-001 IDs. 003-3 is the only REACT-003 subtask that needs REACT-002's bodies to exist.

---

## Sequencing (the realistic path)

```
REACT-001-1 ──┬─► 001-2 ─┐
              ├─► 001-3 ─┤
              ├─► 001-4 ─┼─► 001-5 ─┐
              └─► 001-6 ─┴──────────┴─► 001-7 (FREEZE IDs) ─┐
                                                            ├─► REACT-002 lanes 1/2/3 (parallelizable) ─┐
                                                            ├─► 003-1 ─► 003-2 (parallel w/ REACT-002) ─┼─► 003-3 ─► done
                                                            └────────────────────────────────────────┘
```

- **REACT-001 must land AND freeze IDs (001-7) before REACT-002 begins** — every agent/skill cites frozen REACT-* IDs and STOPs on a placeholder.
- Author order within REACT-001 (most net-new first): **routing > performance > api-service-layer > coding ≈ state > architecture**, then the freeze pass.
- The genuine schedule compressions: (1) staff REACT-002's three lanes concurrently; (2) overlap REACT-003-1/-2 with REACT-002 (they need only REACT-001).

## Day-one checklist

- [ ] Confirm the shared web IDs (`SEC-WEB-1..6`, `SEC-COOKIE-1..3`, `A11Y-TOUCH-1/2`, `I18N-TEST-1`, `QA-A11Y-1`, `SEC-STORAGE-*`, `SEC-HARDEN-2/3`, `SEC-SECRETS-2`, `SEC-LOG-1`) exist in `standards/shared/` with the exact spellings you'll cite. *(Correctness review confirmed all present as of 2026-08-13.)*
- [ ] Confirm `scripts/read-repo-knowledge.ts` + `repo-knowledge-consumer` exist and that REACT-002 **uses** the existing script (extending it to React is what unblocks SHARED-010 — not a circular dep).
- [x] Lock the two lane-wide calls up front (in 001-1): the `REACT-`-prefix-on-every-family ID scheme (decided 2026-08-13), and the no-aside stance.
- [ ] Confirm the REACT-003 filename `react-smart-tv.md` and whether media playback/lifecycle are in React's Smart TV scope (else record explicit `N/A — reason`).
- [ ] Work on a feature branch (the `block-main-branch-changes` hook blocks edits on `main`/`master`); code edits also trip the `require-approval-before-code` hook.

## Risks (from the reviews)

- **Modernization creep** — the recurring quality-bar failure; neutralized by the lane-wide no-aside decision.
- **ID / cross-reference drift** — mirror the iOS bar: verify every cited ID exists and applies (state the count); 001-7 owns the freeze so REACT-002 citations stay stable.
- **Routing exposure during the gap** — only `implement-task.md` is defensively fenced; the other seven commands route into placeholder React components with no readiness guard. Flip placeholder markers only when bodies are genuinely authored.
- **Verification overhead** — ~25 deliverable-touches each mandate an adversarial pass + grep. Run it **batched per epic**, not per file (reflected in the 5/9/4-day estimates).

## References to read before starting

- Reference module: `standards/react-native/*`, `skills/rn-{dev-planning,feature-implementation,code-review}/SKILL.md`, `agents/rn-{architect,feature-developer,code-reviewer,performance-reviewer}.md`
- Precedents (quality bar): `agents/android-architect.md`, `skills/android-dev-planning/`, `agents/android-code-reviewer.md`, `skills/ios-dev-planning/`, `agents/ios-architect.md`
- Contracts: `docs/planning-doc-contract.md`, `docs/repo-knowledge-contract.md`
- Shared standards to cite: `standards/shared/{mobile-security,accessibility,i18n-rtl,release-readiness,qa-handoff}.md`
- The plan: `docs/planning/PLUGIN_COMPLETION_PLAN.html`

---

## Frozen REACT-001 ID skeleton (as of 2026-08-16, REACT-001-7)

All six React standards are authored and their IDs are **frozen** — no rule is renumbered after this point, because REACT-002 agents/skills cite these IDs. Every family carries the `REACT-` prefix (collision-free vs RN `RN-*`/bare-topic, Android `AND-*`, iOS `IOS-*`). 111 defined rules; every intra-lane cross-reference resolves to a defined ID; all 12 cited shared IDs exist in `standards/shared/`.

| Doc | Families (rule counts) |
|---|---|
| `react-coding-standards.md` | `REACT-TS-1..4`, `REACT-FC-1..7`, `REACT-NAME-1..6`, `REACT-PROPS-1..5`, `REACT-LINT-1..3` (25) |
| `react-architecture.md` | `REACT-ARCH-LAYERS-1..4`, `REACT-ARCH-BOUNDARY-1..3`, `REACT-ARCH-FOLDERS-1..3`, `REACT-ARCH-DEPS-1..3`, `REACT-ARCH-LOGIC-1..3` (16) |
| `react-api-service-layer.md` | `REACT-API-ORG-1..4`, `REACT-API-CACHE-1..4`, `REACT-API-BASEQ-1..7`, `REACT-API-ASYNC-1`, `REACT-API-SSR-1..2`, `REACT-API-ERR-1..3` (21) |
| `react-routing.md` | `REACT-ROUTE-URL-1..5`, `REACT-ROUTE-STABILITY-1..4`, `REACT-ROUTE-SECURITY-1..2`, `REACT-ROUTE-SSR-1..3`, `REACT-ROUTE-UX-1..4`, `REACT-ROUTE-SERVICE-1..3` (21) |
| `react-state-management.md` | `REACT-STATE-SLICE-1..4`, `REACT-STATE-SELECT-1..3`, `REACT-STATE-ENTITY-1..3`, `REACT-STATE-BOUNDARY-1..4`, `REACT-STATE-PERSIST-1..2` (16) |
| `react-performance.md` | `REACT-PERF-RERENDER-1..2`, `REACT-PERF-LIST-1`, `REACT-PERF-MAINTHREAD-1`, `REACT-PERF-IMAGE-1..2`, `REACT-PERF-BUNDLE-1..3`, `REACT-PERF-HYDRATION-1`, `REACT-PERF-THIRDPARTY-1`, `REACT-PERF-CWV-1` (12) |

**Reserved (not yet defined — REACT-003):** `REACT-TV-*` (e.g. `REACT-TV-FOCUS-*`, `REACT-TV-PKG-*`) for the Smart TV standard. The `REACT-` prefix reserves this space so REACT-003 routes without changing the lane scheme.

## Progress log & resume state

**REACT-001 ✓ (2026-08-16). REACT-002 ✓ (2026-08-20). REACT-003 ✓ (2026-08-20). All three epics complete, each with an adversarial review and its findings fixed.** The independent adversarial pass (four agents, blocked from reading this file) returned ~45 findings on 2026-08-19; **all P0 functional blockers and P1 factual errors are fixed**, and the standard now carries 54 rules. Findings and per-item resolutions: [`REACT-003-independent-review-findings.md`](REACT-003-independent-review-findings.md). Remaining open items are the **cross-lane** ones, which are another lane's to fix — see *Deferred*.

**Done**
- **REACT-003-3** ✓ (2026-08-19) — the `device_type` contract stated across all 3 skills and 4 agents. Every one of the **17 located lines** that told an agent `REACT-TV-*` was unauthored/not citable is replaced with the positive contract: on `device_type: tv`, cite `REACT-TV-*` **in addition to** the base `REACT-*` rules, which all still apply on a TV surface.
  - **All three standards-readiness gates now count seven** `standards/react/*` files and cover `react-smart-tv.md`, so the gate still fails loudly if a standard regresses to a placeholder. (This was the stale "all six" count 003-2 surfaced; both previously-unlisted instances are fixed.)
  - **Lane-wide decision 4 carried into the review lane, as required.** `react-code-reviewer`, `react-performance-reviewer`, and the `react-code-review` skill each state the `REACT-TV-*` routing, and the code-review skill's Standards-citation table gained **two** TV rows rather than one — TV families to the code reviewer, `REACT-TV-PERF-*` to the performance reviewer — with a note explaining that a standalone TV root has no owner under the "root decides the filer" rule that governs every other row. `REACT-TV-UI-6` and `REACT-TV-MEDIA-3` are named explicitly in both reviewers as code-reviewer-owned despite being performance-adjacent.
  - **Review's missing `device_type` handled as a first-class constraint, not a footnote.** Review has no upstream frontmatter, so both reviewers must establish the TV surface from **evidence** before citing any TV rule, and where none is established the TV rules are **Not Applicable rather than passed or violated**. §14 of the code-review skill now names the two detection traps that bite hardest at review time: a TV dependency in `package.json` does not make the reviewed file a TV file, and a shared component used by both surfaces must satisfy both.
  - The **pre-existing 002-2 wording defect** at `react-feature-implementation/SKILL.md` (it read "the Smart TV standard *is* authored under REACT-003" where siblings said "is *not yet* authored") is gone — that line was rewritten wholesale.
  - The planning skill's TV checklist item now requires citations **grounded in the discovered model**: citing `REACT-TV-FOCUS-2` without having identified the repo's focus model is an unlabelled repository claim and a defect.
  - `README.md` and `CHANGELOG.md` corrected — the React platform is now described as complete end to end, with TV as a `device_type` rather than "pending REACT-003".
  - **Verification:** zero stale "TV unauthored/not citable/pending" claims remain anywhere in `agents/`, `skills/`, `standards/`, `commands/`, README, or CHANGELOG; all 16 distinct `REACT-TV-*` IDs newly cited across the agents and skills resolve to defined rules, as do all non-TV IDs cited there; all intra-document anchors in the three skills resolve; both edited citation tables are column-consistent; and the frozen base rule IDs in all six base documents remain **byte-identical to `463fc14`** (pre-REACT-003) — 111 base + 51 TV = **162 React rules**.
- **REACT-003-2** ✓ (2026-08-19) — additive `device_type: tv` branches threaded into the four base documents named in the subtask table: `react-coding-standards.md`, `react-architecture.md`, `react-routing.md`, `react-performance.md`. Each gets a `## Smart TV context (device_type: tv)` section placed immediately before `## References`, plus a `react-smart-tv.md` entry in that document's companion-standards list.
  - **Verified additive:** every frozen REACT-001 rule ID in all six base documents is **byte-identical to the pre-003-2 commit** — 25/16/21/12/16/21 = **111**, nothing renumbered, dropped, or added to a frozen family. All 50 IDs cited across the four new branches resolve to a defined rule.
  - **Each branch authors no rule.** Every branch opens with an explicit "authors no rule" marker and routes each obligation to the owning `REACT-TV-*` ID, so a finding is filed once under its owner and never duplicated into a base document. Each branch also repeats the applicability gate (no TV surface → the section is N/A).
  - **The governing document (`react-coding-standards.md`) additionally carries the lane-level contract**: a new **Device type** paragraph in the governing-conventions block (enum `mobile|tv`, no `mixed`, no silent default, TV is a context signal not a platform, `REACT-TV-*` lives in `react-smart-tv.md` with its own routing table), and the freeze blockquote now records that **adding a root is the only sanctioned way to extend the lane after a freeze** — its previous "all six standards are authored" claim was false once the seventh existed, and is corrected.
  - **Substantive divergences recorded rather than glossed** — the point of the subtask. `react-routing.md` diverges most, because two of its premises weaken on TV: a packaged app's URLs are generally **not shareable/bookmarkable**, so `REACT-ROUTE-URL-5` and `REACT-ROUTE-STABILITY-2` judgments rest on reload-survival instead, and a finding resting on shareability must not be raised; `REACT-ROUTE-STABILITY-3` (SEO/canonical) and the whole `REACT-ROUTE-SSR-*` section are normally **N/A** on a packaged app; scroll restoration is superseded in user-visible terms by focus restoration (`REACT-TV-FOCUS-4`), and restoring scroll while dropping focus is a `REACT-TV-FOCUS-1` defect, not a routing pass. `react-architecture.md`: `REACT-ARCH-BOUNDARY-*` normally N/A (no server half in a `.wgt`/`.ipk`), while its *secrets* concern survives via `REACT-TV-PKG-6`. `react-performance.md`: `REACT-PERF-HYDRATION-1` normally N/A; `REACT-PERF-CWV-1` is reinterpreted, not deleted (LCP/CLS hold, INP's pointer model gives way to key-press responsiveness). `react-coding-standards.md`: `REACT-NAME-6` normally N/A.
  - **Lane routing restated where it could be misread.** The `react-performance.md` branch spells out that `REACT-TV-PERF-*` is the performance reviewer's at both call sites, but that `REACT-TV-UI-6` (virtualization vs. focus) and `REACT-TV-MEDIA-3` (player teardown) are **code-reviewer-owned** and are cited there for context only, not filed — the two places the split is most likely to be got wrong.
- **REACT-003-1** ✓ (2026-08-19) — `standards/react/react-smart-tv.md` authored: **54 rules** across `REACT-TV-FOCUS-1..8`, `REACT-TV-INPUT-1..8`, `REACT-TV-UI-1..7`, `REACT-TV-MEDIA-1..7`, `REACT-TV-LIFECYCLE-1..5`, `REACT-TV-API-1..4`, `REACT-TV-PERF-1..7`, `REACT-TV-PKG-1..8` (three added by the independent review: cursor mode, the platform IME, screensaver suppression). Purely additive — **no REACT-001 ID renumbered**. Day-one checklist items resolved: filename `react-smart-tv.md` confirmed, and **media playback + lifecycle are IN scope** (authored as `REACT-TV-MEDIA-*` / `REACT-TV-LIFECYCLE-*`, not recorded `N/A`) — a TV app is overwhelmingly a media app.
  - **New lane-wide decision (see decision 4 below): the `REACT-TV-*` lane-routing table.** A standalone `REACT-TV-*` root does **not** resolve under the lane's mechanical "the ID's own root decides the filer" rule, so the document states the routing explicitly: `REACT-TV-PERF-*` → `react-performance-reviewer`; every other `REACT-TV-*` family → `react-code-reviewer`; `REACT-TV-PKG-*` at Build/Release stage with a Not-Applicable path when the diff cannot reach it. This is the divergence cost of the standalone-file choice — iOS avoided it by forbidding a bare `IOS-TV-*` root outright (`standards/ios/swift-standards.md:23`).
  - Also carries: an applicability gate (this whole document is N/A on a repo with no TV surface) and **7 TV detection traps**, each naming the wrong finding it prevents.
  - Records where a shared mobile rule does **not** transfer, keeping the semantic obligation and stating the gap: `A11Y-SR-1` (VoiceOver/TalkBack don't exist on TV) → `REACT-TV-UI-7`; `A11Y-FONT-1` (OS font-scale premise unreliable on TV) → `REACT-TV-UI-4`. Adds a genuinely new cross-reference the RN/Android TV work has no equivalent of: **D-pad direction must mirror under RTL** (`REACT-TV-FOCUS-8`, citing `I18N-RTL-1/2` + `I18N-TEST-2`).
  - `README.md` (standards tree + `standards/react/` bullet) and `CHANGELOG.md` updated. README's "Smart TV context … is pending REACT-003" summary line is deliberately **left as-is** — it stays true until 003-2 and 003-3 land.
  - **`## External references` authored (2026-08-19): 13 links, each fetched and confirmed to resolve**, grouped Tizen / webOS / standards-and-platform-APIs, each with a *when to consult* note and the `REACT-TV-*` IDs it supports. Two document-specific cautions stated up front: vendor docs are reorganized and vendor tooling retired without notice, and a value quoted in the list is illustrative of *what the vendor publishes*, never the rule.
  - **Verification found the rule text held up — no rule depended on an unverified fact, and the checks sharpened three of them:** Tizen's split between auto-delivered keys (arrows/Enter/Back) and keys reaching the app only after `registerKey` confirms `REACT-TV-INPUT-5`; Tizen `Back`=`10009` vs webOS `Back`=`461` confirms `REACT-TV-INPUT-2`'s premise that one merged key table breaks across platforms; webOS rendering graphics at a logical resolution independent of the panel and of video (UHD: 1920×1080 graphics, 3840×2160 video) confirms `REACT-TV-UI-3` **and** the detection trap against inferring the device from the viewport. webOS `appinfo.json`'s optional `requiredMemory` (MB) is the manifest field `REACT-TV-PERF-1` requires to agree with the budget.
  - Two verification catches worth keeping: the webOS **TV** CLI guide is **deprecated (March 2024)** — the list deliberately cites the current CLI guide instead and says why; and W3C CSS Spatial Navigation is still a **2019 Working Draft**, so its entry warns it is vocabulary for reasoning about a focus model, not an available browser capability, and must never be proposed as a replacement for a repo's working focus engine.
  - No value is frozen into a rule: no manifest schema, key code, safe-area inset, or memory limit appears in rule text — only in the reference list, explicitly marked illustrative.
- **REACT-002-1..3** ✓ — all four React agents and three React skills authored against the frozen `REACT-*` IDs, thin-agent/thick-skill, mirroring the RN and Android lanes.
  - **002-1** planning lane — `agents/react-architect.md` + `skills/react-dev-planning/SKILL.md` (§0 readiness gate, four-class classification, repo knowledge only via `repo-knowledge-consumer`, React detection traps).
  - **002-2** implementation lane — `agents/react-feature-developer.md` + `skills/react-feature-implementation/SKILL.md` (reads `platform` **and** `device_type` with no silent `mobile` default, per-surface standards mapping, design-reference gate, security defers to `mobile-security-reviewer`, step-7 applied-ID trace).
  - **002-3** review lane — `agents/react-code-reviewer.md` + `agents/react-performance-reviewer.md` + `skills/react-code-review/SKILL.md` (four-category filing gate; lane separation by ID root — `REACT-PERF-*` → perf reviewer, everything else → code reviewer; the two perf-reviewer call sites `/review-code` + `/prepare-mobile-release`; magnitude as measurement request; reviewers never fix code; no-aside stance inherited, not re-decided).
  - Verification pass: 37 distinct `REACT-*` IDs and 9 shared IDs cited across the three review-lane files all resolve to defined rules; every referenced repo path exists; all 11 intra-document anchors resolve; no `RN-*`/`AND-*`/`IOS-*` ID leaked.
  - Placeholder markers flipped for all seven React files; `README.md` and `CHANGELOG.md` claims corrected.
- **REACT-001-1..7** ✓ — all six React web standards authored, each adversarially reviewed and committed, then the lane ID skeleton frozen and all cross-references reconciled (REACT-001-7). See the *Frozen REACT-001 ID skeleton* section above. Every standard carries a verified `## External references` section.
  - 001-1 coding-standards · 001-2 architecture · 001-3 api-service-layer · 001-4 routing · 001-5 state-management · 001-6 performance · 001-7 freeze.

**Lane-wide decisions locked (inherited by every downstream React doc/agent — do not re-decide or renumber)**
1. **ID scheme** = `REACT-` prefix on *every* family (`REACT-TS/FC/NAME/PROPS/LINT`, `REACT-ARCH-*`, `REACT-ROUTE-*`, `REACT-STATE-*`, `REACT-PERF-*`, `REACT-TV-*`). Collision-free vs RN/AND/IOS.
2. **No-aside/no-modernization stance** (React follows Android's strict rule).
3. **External-references pattern** = every standard closes with a rank-5 `## External references` section (see acceptance-bar item 10).
4. **`REACT-TV-*` lane routing** (decided 2026-08-17 in 003-1, because a standalone TV root has no owner under "the ID's own root decides the filer"): `REACT-TV-PERF-*` → `react-performance-reviewer`; **every other** `REACT-TV-*` family → `react-code-reviewer`; `REACT-TV-PKG-*` is Build/Release-stage with a Not-Applicable path. 003-3 must state this same routing in the agents/skills — do not re-derive it differently there.

## REACT-003 batched adversarial review — RUN 2026-08-19 · 9 findings, ALL FIXED ✓

Four passes run across 003-1/-2/-3 together, per the acceptance bar's per-epic batching. The mechanical checks were already green; the findings below are what the adversarial passes produced. **All nine were fixed on 2026-08-19** (Boris: "fix them all"), including the three that needed a decision — the resolution taken is recorded under each. Re-verified after the fixes: no rule was added or removed to fix a finding (47 TV rules at that point; `REACT-TV-API-1..4` was added afterwards for the cookie question, making 51), every cited ID across the standard, the four base branches, and the seven agents/skills resolves; all skill anchors resolve; the frozen 111 base IDs remain byte-identical to `463fc14`; external links unchanged at that point and no unverified URL introduced (17 now, after the four added for `REACT-TV-API-*`).

**Method caveat, recorded for the next reviewer:** these four passes were run **in-context by the same author**, not by independent reviewer agents as the IOS-002 precedent did. Self-review is weaker precisely where the author is invested, so F1/F2/F4 being self-caught is encouraging but is **not** evidence the finding set is complete. If this lane gets one more quality investment, an independent adversarial pass on `react-smart-tv.md` is the highest-value place to spend it.

**Contract compliance**

- **F1 · High · lane-ownership contradiction.** `react-smart-tv.md:32` states security adjudication stays with the shared `mobile-security-reviewer` and that no rule re-authors a `SEC-*` rule. But `REACT-TV-PKG-5` (signing material in the repo) and `REACT-TV-PKG-6` (secrets in the package) **are** security rules, and the routing table assigns `REACT-TV-PKG-*` to `react-code-reviewer`. A committed certificate therefore has two plausible owners and one explicit disclaimer. Decide: either PKG-5/6 route to the security reviewer, or line 32 is narrowed to say the TV document *does* own packaging-security while deferring application-code security.
- **F2 · High · no one-defect-one-finding table, and 003-1 created the first cross-owner collision.** The iOS lane solves this explicitly (`standards/ios/swift-standards.md:25-35`: "One defect, one finding… the `ios-code-review` skill dedupes at merge using this table"). The React lane has **no such mechanism at all** — grepping `skills/react-code-review/SKILL.md` for dedup/collision/one-defect/double-file returns nothing. It got away with that while routing was purely root-based. It no longer is: an **undisposed player** is `REACT-TV-MEDIA-3` (code reviewer) *and* `REACT-TV-PERF-2` (performance reviewer), and the two rules cite each other. The reviewers cannot read each other's output, so this produces either a duplicate finding or — worse — both deferring. Same shape for a decoded-asset leak (`REACT-TV-PERF-3` vs `REACT-TV-UI-6`). Needs a collision table plus a merge-time dedup step in the code-review skill. **Note this is partly a pre-existing REACT-002 gap that REACT-003 made load-bearing.**
- **F3 · Medium · non-specific citation.** `REACT-TV-MEDIA-2` cites "the server-state principle in `REACT-STATE-*`" — a family, not an ID, where the lane requires the most specific applicable ID. `REACT-STATE-BOUNDARY-3` is the intended target.

**React/TV technical correctness**

- **F4 · High · `REACT-TV-FOCUS-8` contradicts `REACT-TV-FOCUS-5`.** FOCUS-5 requires focus to follow **visible spatial adjacency** ("the element that is actually adjacent on screen"). FOCUS-8 requires that under RTL, "Right advances in reading order rather than jumping backwards." In a mirrored RTL layout the next reading-order item sits visually to the **left** — so the two rules demand opposite behavior from the same key press. D-pad navigation is inherently spatial: arrow keys map to screen geometry, and a mirrored layout should navigate by geometry, which means Right moves to the visually-right element even though that is *earlier* in reading order. As written, FOCUS-8 is likely wrong and definitely inconsistent. Recommended resolution: keep FOCUS-5 as the governing rule and rewrite FOCUS-8 to require that mirroring be **deliberate and verified** — the layout mirrors, focus follows the mirrored geometry, and the RTL walkthrough confirms no rail navigates against its own visual order — rather than asserting reading-order semantics.
- **F5 · Medium · unverified vendor claim in rule text.** `REACT-TV-UI-4` asserts that `A11Y-FONT-1`'s OS font-scale premise "is not reliably available on TV runtimes." That was never verified — the vendor-facts research agent was stopped before returning anything, and this claim did not get re-checked during the external-references pass (which covered packaging, keys, lifecycle, overscan, and resolution, but not text scaling). It is hedged, but the lane treats an unlabelled vendor claim as a defect. Verify per platform or relabel.
- **F6 · Low-Medium · the accessibility hedge leans toward the easy exit.** `REACT-TV-UI-7` says the walkthrough uses the platform's own accessibility feature "where one exists" and otherwise records a gap. Samsung TVs **do** ship a screen reader (Voice Guide — verified 2026-08-19); how well it reads *web-app* content is genuinely uncertain. So the default should be "attempt the platform's own feature and record what it actually announced," with the gap reserved for a platform that truly offers nothing.

**Neutrality & density**

- **F7 · Low · self-ranking prose.** Largely clean: Tizen/webOS appear only as examples, no stack default is smuggled in, and no modernization aside was found in any of the seven files. One nit — `REACT-TV-PERF-2` calls itself "the single highest-consequence performance rule on the platform." Ranking rules against one another is not a rule and invites a reviewer to deprioritize the others.

**Executability**

- **F8 · Medium · the review-time applicability gate may be unobtainable.** The detection traps require knowing "the surface the changed file renders on"; for a shared component that means tracing consumers repo-wide, which a diff-scoped review may not support — while both reviewers are told never to block and ask. The N/A fallback exists in `react-smart-tv.md` but is **not** wired into the agent text, which says only "infer… and note it in Scope." Add the explicit fallback to both reviewers: surface undetermined → TV rules N/A with the reason, and say so once.
- **F9 · Low · `REACT-TV-PKG-*` has no routine enforcement point.** Eight rules are routed to a reviewer that, by the document's own admission, generally cannot reach them from an application-code diff. Worth stating plainly that `/prepare-mobile-release` is the real gate for that family (via shared `REL-*`), so it is not quietly recorded N/A forever.

**What the review did *not* find:** no false claim anywhere in `agents/`, `skills/`, `standards/`, `commands/`, README, or CHANGELOG; no renumbered or dropped base ID; no foreign-module ID; no broken anchor; no dead external link; no missing GAP-1/2/3 coverage (packaging+signing, media+lifecycle, and the constrained-runtime budget are all authored).

### Resolutions applied (2026-08-19)

No rule was added or removed to fix a finding — the count is still 47.

- **F1 → PKG-5/6 route to the security reviewer.** The routing table now splits the family: `REACT-TV-PKG-1..4`/`-7`/`-8` (ordinary config and release-process rules) stay with `react-code-reviewer`; `REACT-TV-PKG-5`/`-6` go to the shared `mobile-security-reviewer` and are **filed as the `SEC-*` IDs they cite**, with the TV number carried as the TV-specific pointer. One owner per defect, and the line-32 promise is honored rather than narrowed. Mirrored into `react-code-reviewer`, the code-review skill's §8 and §14, and its citation table — which gained a third TV row.
- **F2 → adopt the iOS architecture, including its stance.** `react-smart-tv.md` gained a **One defect, one finding** section with an 8-row collision table naming the owning ID and supporting IDs for each cross-rule defect (undisposed player, retained memory, decoded asset, virtualized-row focus loss, missing listener cleanup, lost focus, hardcoded key code, committed signing material). The stance is now iOS's: **file what your lane sees; never suppress an observation assuming the other reviewer will file it** — my earlier "don't file the other lane's ID" wording risked both reviewers deferring, which is the worse failure. The skill's §15 gained a 5-step merge-time dedup: same defect *and* same site → keep the owning ID, fold the other's reasoning in, keep the higher severity, keep the owning ID's section, never drop both — and different sites are not duplicates however similar the rule. Both reviewer agents carry it.
- **F3 → specific ID.** `REACT-TV-MEDIA-2` states the placement test directly and cites `REACT-STATE-BOUNDARY-3` alone; the family-level reference is gone.
- **F4 → spatial wins, and FOCUS-8 changes meaning.** `REACT-TV-FOCUS-5` is now explicitly governing. FOCUS-8 was rewritten to say what it should have said: a D-pad press moves to the **visually adjacent** element, and that does not change under RTL — so in a mirrored rail, pressing Right correctly lands on the item that is *earlier* in reading order. The rule now requires that mirroring be deliberate and verified, and names the real failure mode: a container whose CSS mirrors while its focus adjacency stays hardcoded LTR, or the reverse, which strands the user. A repository that has deliberately chosen reading-order semantics for a control is followed as a rank-2 convention, stated rather than assumed. **The original claim was wrong, not merely inconsistent** — worth remembering, since it was the rule I had singled out as a novel contribution.
- **F5 → claim withdrawn.** `REACT-TV-UI-4` no longer asserts anything about which runtimes expose a text-scale setting; it states that this is a per-platform, per-firmware fact to establish from vendor documentation and that the document makes no claim either way. The real obligation is kept (TV base type must be legible at the platform default, so legibility never *depends* on the user having enlarged it), with `A11Y-FONT-2`/`-3` unconditional.
- **F6 → try first, gap last.** `REACT-TV-UI-7` now defaults to performing the walkthrough with the platform's own screen reader and recording what it actually announced, notes that web-app coverage varies by platform and firmware, and reserves the QA-handoff gap for a platform that genuinely offers none — "never a shortcut around trying".
- **F7 → self-ranking removed** from `REACT-TV-PERF-2` and from the `react-performance.md` branch that repeated it; verified zero occurrences remain across `standards/`, `agents/`, `skills/`.
- **F8 → fallback wired in.** The code-review skill's §14 and both reviewer agents now carry the same words: where the surface cannot be established, say so once in Not Applicable / Skipped, cite no TV rule, do not guess a surface in order to have something to file, and do not treat the uncertainty as a pass. An unresolvable surface is `[unknown]`, never `mobile`.
- **F9 → release named as the real gate.** The TV standard's lane-ownership section states that `/prepare-mobile-release` is `REACT-TV-PKG-*`'s actual enforcement point, naming the shared `REL-*` rules that do the verifying, and that a review marking the family N/A is correct while a release doing so is not. Echoed in the skill's §14.

**Next — resume here**
1. ~~**The REACT-003 batched adversarial review**~~ — ✓ **run 2026-08-19; all 4 passes done, all 9 findings fixed and re-verified.** Details, resolutions, and the independence caveat are in the review section above. **The REACT-003 acceptance bar is now met, including items 9 and 10.**
2. ~~**Independent adversarial pass on the TV standard**~~ — ✓ **run 2026-08-19 (four agents), ~45 findings; all P0/P1 and all in-lane P2/P3 fixed 2026-08-20.** See [`REACT-003-independent-review-findings.md`](REACT-003-independent-review-findings.md). Worth having run: the in-context pass found 9 and missed every P0, and three of that pass's own "fixes" had each introduced a new defect.
3. ~~**REACT-002 adversarial review**~~ — ✓ **run 2026-08-20 (four agents), ~55 findings; every React-lane item fixed 2026-08-20.** Record and per-item resolutions: [`REACT-002-independent-review-findings.md`](REACT-002-independent-review-findings.md). It confirmed the Inputs-vs-Constraints defect was a **pattern**, and caught that one of my REACT-003 fixes (PKG-5/6 routing) had never reached the review skill while the CHANGELOG claimed it had — now fixed. **R4 remains a standards-owner decision** (no `REACT-TEST-*`/`REACT-LOG-*` family exists; the gap is now stated explicitly in both skills rather than papered over). Section B is cross-lane and still needs owners.
   - **It confirmed the hypothesis:** the Inputs-vs-Constraints defect was a **pattern, not an instance**, and it found that **one of my own REACT-003 fixes never fully landed** — `REACT-TV-PKG-5`/`-6` still route to the security lane in `skills/react-code-review/SKILL.md:136`/`:248` while the standard and the agent say the React code reviewer files them, and the same skill's triage table `:84` contradicts both. The CHANGELOG claims that fix landed. **Verified directly; fix this first (R1).**
   - **Fix order when resuming.** R1 (the regression) → R2/R3/R7 (live contradictions: never-suppress vs §16, cite-vs-file red flag, three components claiming the merge) → R5/R6 (backend-contract stop-vs-continue, `REACT-FC-1` Blocking without its authored error-boundary exception) → R8/R9/R10/R11 (QA walkthrough evidence never produced, unreadable-design-reference path missing, `react-feature-developer` missing Inputs/Output/Red-flags and `SEC-*`, rendering model identified per-repository instead of per-surface) → R12/R14/R15/R23/R26/R27/R28/R29/R30/R31 → the small items R13/R16–R22/R24/R25/R32.
   - ⚠️ **R4 needs a decision, not an edit.** Testing and logging are planned but grounded in **no `REACT-*` ID**, and no `REACT-TEST-*`/`REACT-LOG-*` family exists — so a test-quality or logging defect fails all four categories of the review filing gate and cannot be filed at all. iOS cites five `IOS-ARCH-TEST-*`; Android has both families. Authoring two new standards files is REACT-001 scope and adds IDs to a frozen lane, so **do not do it unilaterally**: either get approval to author them, or state the gap explicitly in §11 and the review skill's §5 as a known lane limitation.
   - **Section B of the findings doc is cross-lane and deliberately out of scope** under the React-lane-only decision — but several items there are serious and need an owner: every stage naming a plugin *template path* as the document to read/write (a literal reading writes into the installed plugin); `/analyze-feature` invoking the architect before its own design-reference gate; an unbounded design-reference re-ask loop; **`device_type` having no value for a desktop web SPA**, where the cheapest resolution is the one every file bans; and `block-main-branch-changes` blocking planning-document writes with only one of six doc-producing commands checking the branch.
2. ~~**REACT-003-3**~~ ✓ **done 2026-08-19** — kept below for the record of what was touched. The lines were located as 15, and 003-2 added 2 more (the stale "all six" gates), for 17 total:
   - `agents/react-architect.md:43,67` · `agents/react-code-reviewer.md:66,74` · `agents/react-feature-developer.md:45` · `agents/react-performance-reviewer.md:68,76`
   - `skills/react-code-review/SKILL.md:32,149,185,229,237` · `skills/react-dev-planning/SKILL.md:37,214,271,294` · `skills/react-feature-implementation/SKILL.md:31,165,183`
   - **Plus a stale count 003-2 surfaced:** all three skills' standards-readiness gates assert "**all six** `standards/react/*` files are authored" — there are now **seven**. `skills/react-code-review/SKILL.md:30` and `skills/react-dev-planning/SKILL.md:35` (the `react-feature-implementation/SKILL.md:31` instance is already in the list above). Update the count *and* make each gate check `react-smart-tv.md` too, so the gate keeps failing loudly if a standard regresses to a placeholder.
   - While there: `skills/react-feature-implementation/SKILL.md:165` has a **pre-existing wording defect from 002-2** — it reads "the Smart TV standard *is* authored under REACT-003" where every sibling line says "is *not yet* authored". 003-3 rewrites the line anyway; make sure the replacement is accurate.
   - 003-3 must also carry lane-wide decision 4 above (the `REACT-TV-*` routing table) into `react-code-reviewer` / `react-performance-reviewer` / `react-code-review`, so the two reviewers cannot double-file a TV finding.
- Day-one checklist items **now closed** by 003-1: filename `react-smart-tv.md` confirmed; media playback + lifecycle confirmed **in scope** (authored, not `N/A`).

**Deferred — need a deliberate decision (not blockers for REACT-003)**
- ✓ **RESOLVED 2026-08-19 — the auth-transport / cookie question is settled** (Boris: "fix the cookie question"). `react-api-service-layer.md` gained a Smart TV branch — a **fifth** document beyond 003-2's stated four — and the TV standard gained a new **`REACT-TV-API-1..4`** family (51 TV rules now, up from 47). `REACT-API-BASEQ-2`'s and `-5`'s **text is byte-identical** to pre-REACT-003; only an additive branch qualifies their premises.
  - **What was verified, and what deliberately was not.** Confirmed on vendor pages: Samsung documents the CORS **`Origin` request header as unsupported** on its Smart TVs, and requires reachable external origins declared in `config.xml` (`access` / `tizen:allow-origin`) — so adding a backend host can be a **packaging** change; LG documents webOS as following CORS with server-side control only, and distinguishes **packaged** apps (resources installed locally) from **hosted** apps (served over `http(s)`). **Not confirmed:** the widely-repeated claim that packaged (file-scheme) webOS apps cannot use cookies at all — it appears in search results and a community forum thread but could not be pinned to a vendor page, so it is **not stated as fact anywhere in rule text**; the reference list records it explicitly as an unconfirmed claim to verify per firmware. (Same discipline as the F5 fix — the rule requires establishing the transport rather than asserting a vendor behavior.)
  - **The rules:** `REACT-TV-API-1` establishes the transport from the target's app type and vendor docs, never assumed in either direction. `REACT-TV-API-2` makes the in-memory-token path the **primary** design where cookies are unavailable, rather than a compromise — with nothing relaxed (no script-readable store, no logs, no build-time inlining), and it names reaching for `localStorage` because "cookies don't work on TV" as a **defect, not a workaround**. `REACT-TV-API-3` establishes the cross-origin model per platform. `REACT-TV-API-4` re-derives CSRF exposure against the actual transport, recording a no-ambient-cookie target as a **reasoned N/A**, never a passed check.
  - **Still unbranched, and a genuinely smaller case:** `react-state-management.md`. `REACT-STATE-BOUNDARY-2`'s URL-appropriateness weakens on TV for the shareability reason already handled in the routing branch, `REACT-STATE-PERSIST-1/2` would benefit from a TV storage reading, and `REACT-TV-FOCUS-4` points into `REACT-STATE-BOUNDARY-*` without a reverse pointer. Left as a judgment call: nothing in it is *wrong* today, unlike `REACT-API-BASEQ-2`, which read as unconditional and now does not.
- **Completion-plan dashboard** (`PLUGIN_COMPLETION_PLAN.html`) still shows React as placeholder in its exec summary, readiness matrix, owner-workload, and inventory row. Left for a *full, consistent* status pass rather than a one-row patch (it's the shared team dashboard). For that update: REACT-001 = 6/6 standards done, REACT-002 = 4/4 agents + 3/3 skills done.
- **Version bump / release** — REACT-001 and REACT-002 are logged under `## [Unreleased]` in CHANGELOG; bumping `plugin.json` (e.g. → 0.6.0) is a release decision for the Plugin Owner, not done here.
- **Stale non-React status claims in `README.md`** — lines describing the **Android** lane (summary bullet, the `skills/` and `agents/` trees, `standards/android/`) still say "placeholders", but `android-architect`, `android-code-reviewer`, `android-performance-reviewer`, `android-code-review`, and the ten `standards/android/*` docs are authored; the iOS trees have the same drift. Not touched here — it belongs to those lanes' own claims pass, not React's.

**Where the work lives**
- Branch: **`feat/react-001-coding-standards`**. ⚠️ The working clone is a *temporary* checkout — the durable copy is whatever was pushed to the remote / copied out (see the pause handoff).

**To resume on Sunday**
- The session task tracker (#1–#13) is session-scoped and will not persist — rebuild it from the *REACT-001 / -002 / -003* epic tables above (ask Claude to "recreate the React task tracker from BORIS-REACT-TASKS.md"). Durable memory (`ono-plugin-completion-program`) also records this state.
- Re-clone/checkout the branch, confirm the seven React agent/skill files are authored (no "Status: Not yet authored" heading in any of them), and start REACT-003-1.
