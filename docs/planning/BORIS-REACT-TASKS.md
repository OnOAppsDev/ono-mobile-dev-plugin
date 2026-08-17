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

**REACT-001 EPIC COMPLETE (2026-08-16). REACT-002 EPIC COMPLETE (2026-08-17). REACT-003 IN PROGRESS — 003-1 body authored, its `## External references` list still open (paused 2026-08-17, resuming 2026-08-18).**

**Done**
- **REACT-003-1** ⚠️ *body done, one section open* — `standards/react/react-smart-tv.md` authored: **47 rules** across `REACT-TV-FOCUS-1..8`, `REACT-TV-INPUT-1..6`, `REACT-TV-UI-1..7`, `REACT-TV-MEDIA-1..6`, `REACT-TV-LIFECYCLE-1..5`, `REACT-TV-PERF-1..7`, `REACT-TV-PKG-1..8`. Purely additive — **no REACT-001 ID renumbered**. Day-one checklist items resolved: filename `react-smart-tv.md` confirmed, and **media playback + lifecycle are IN scope** (authored as `REACT-TV-MEDIA-*` / `REACT-TV-LIFECYCLE-*`, not recorded `N/A`) — a TV app is overwhelmingly a media app.
  - **New lane-wide decision (see decision 4 below): the `REACT-TV-*` lane-routing table.** A standalone `REACT-TV-*` root does **not** resolve under the lane's mechanical "the ID's own root decides the filer" rule, so the document states the routing explicitly: `REACT-TV-PERF-*` → `react-performance-reviewer`; every other `REACT-TV-*` family → `react-code-reviewer`; `REACT-TV-PKG-*` at Build/Release stage with a Not-Applicable path when the diff cannot reach it. This is the divergence cost of the standalone-file choice — iOS avoided it by forbidding a bare `IOS-TV-*` root outright (`standards/ios/swift-standards.md:23`).
  - Also carries: an applicability gate (this whole document is N/A on a repo with no TV surface) and **7 TV detection traps**, each naming the wrong finding it prevents.
  - Records where a shared mobile rule does **not** transfer, keeping the semantic obligation and stating the gap: `A11Y-SR-1` (VoiceOver/TalkBack don't exist on TV) → `REACT-TV-UI-7`; `A11Y-FONT-1` (OS font-scale premise unreliable on TV) → `REACT-TV-UI-4`. Adds a genuinely new cross-reference the RN/Android TV work has no equivalent of: **D-pad direction must mirror under RTL** (`REACT-TV-FOCUS-8`, citing `I18N-RTL-1/2` + `I18N-TEST-2`).
  - `README.md` (standards tree + `standards/react/` bullet) and `CHANGELOG.md` updated. README's "Smart TV context … is pending REACT-003" summary line is deliberately **left as-is** — it stays true until 003-2 and 003-3 land.
  - ⚠️ **OPEN — the only thing blocking 003-1 sign-off:** the `## External references` link list. The section currently holds an explicit `INCOMPLETE` block naming the 8 vendor/W3C doc areas needed and the `REACT-TV-*` IDs each supports. **Do not fill it in from memory** — the lane contract requires every link verified to resolve on the day it is added. No rule depends on it (rules defer to the vendor's current docs by design), so the standard is usable meanwhile. A research agent was gathering these facts and was stopped before returning anything, so **no vendor fact in this file came from a verified source** — the rule text was written to avoid needing one (no manifest schema, no key-code value, no memory limit is frozen into the file). Verify that this held when the links are added.
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

**Next (in order) — resume here 2026-08-18**
1. **Finish REACT-003-1** — author the `## External references` link list in `standards/react/react-smart-tv.md`, replacing the `INCOMPLETE` block that names the 8 required doc areas. Verify each link resolves as it is added; each entry needs a *when to consult* note + the `REACT-TV-*` IDs it supports. **Then run 003-1's adversarial review + false-claim grep** (not yet run — see the acceptance bar, items 9 and 10).
2. **REACT-003-2** — additive `device_type: tv` branches into `react-performance.md`, `react-coding-standards.md`, `react-architecture.md`, `react-routing.md`. Never renumber frozen REACT-001 IDs; point each branch at the `REACT-TV-*` rule that owns it.
3. **REACT-003-3** — state the `device_type` contract in the 3 skills + 4 agents. **The exact lines to update are already located** — 15 of them, all currently claiming `REACT-TV-*` is unauthored/not citable:
   - `agents/react-architect.md:43,67` · `agents/react-code-reviewer.md:66,74` · `agents/react-feature-developer.md:45` · `agents/react-performance-reviewer.md:68,76`
   - `skills/react-code-review/SKILL.md:32,149,185,229,237` · `skills/react-dev-planning/SKILL.md:37,214,271,294` · `skills/react-feature-implementation/SKILL.md:31,165,183`
   - While there: `skills/react-feature-implementation/SKILL.md:165` has a **pre-existing wording defect from 002-2** — it reads "the Smart TV standard *is* authored under REACT-003" where every sibling line says "is *not yet* authored". 003-3 rewrites the line anyway; make sure the replacement is accurate.
   - 003-3 must also carry lane-wide decision 4 above (the `REACT-TV-*` routing table) into `react-code-reviewer` / `react-performance-reviewer` / `react-code-review`, so the two reviewers cannot double-file a TV finding.
- Day-one checklist items **now closed** by 003-1: filename `react-smart-tv.md` confirmed; media playback + lifecycle confirmed **in scope** (authored, not `N/A`).

**Deferred — need a deliberate decision (not blockers for REACT-003)**
- **Completion-plan dashboard** (`PLUGIN_COMPLETION_PLAN.html`) still shows React as placeholder in its exec summary, readiness matrix, owner-workload, and inventory row. Left for a *full, consistent* status pass rather than a one-row patch (it's the shared team dashboard). For that update: REACT-001 = 6/6 standards done, REACT-002 = 4/4 agents + 3/3 skills done.
- **Version bump / release** — REACT-001 and REACT-002 are logged under `## [Unreleased]` in CHANGELOG; bumping `plugin.json` (e.g. → 0.6.0) is a release decision for the Plugin Owner, not done here.
- **Stale non-React status claims in `README.md`** — lines describing the **Android** lane (summary bullet, the `skills/` and `agents/` trees, `standards/android/`) still say "placeholders", but `android-architect`, `android-code-reviewer`, `android-performance-reviewer`, `android-code-review`, and the ten `standards/android/*` docs are authored; the iOS trees have the same drift. Not touched here — it belongs to those lanes' own claims pass, not React's.

**Where the work lives**
- Branch: **`feat/react-001-coding-standards`**. ⚠️ The working clone is a *temporary* checkout — the durable copy is whatever was pushed to the remote / copied out (see the pause handoff).

**To resume on Sunday**
- The session task tracker (#1–#13) is session-scoped and will not persist — rebuild it from the *REACT-001 / -002 / -003* epic tables above (ask Claude to "recreate the React task tracker from BORIS-REACT-TASKS.md"). Durable memory (`ono-plugin-completion-program`) also records this state.
- Re-clone/checkout the branch, confirm the seven React agent/skill files are authored (no "Status: Not yet authored" heading in any of them), and start REACT-003-1.
