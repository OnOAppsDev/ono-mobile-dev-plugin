# REACT-002 independent adversarial review — findings

**Run:** 2026-08-20 · **Method:** four independent reviewer agents (pipeline wiring · self-consistency & false claims · executability · contract compliance & precedent parity), each blocked from reading `BORIS-REACT-TASKS.md` and `REACT-003-independent-review-findings.md`, and with Smart TV scoped **out** so attention stayed on wiring never previously examined.

**Why this ran:** REACT-002 was the only epic that never had its acceptance-bar item 9 adversarial review — its progress entry recorded a *mechanical* verification only. The REACT-003 pass had already found REACT-002-authored defects incidentally, which suggested more.

**Outcome: ~55 findings. All Section A items are now fixed — see *Resolution status* below.** Confirmed: the Inputs-vs-Constraints defect was a **pattern, not an instance**. Also confirmed: one of my own REACT-003 fixes never fully landed (R1 below), and the CHANGELOG claimed it had.

---

## Resolution status (2026-08-20)

**All Section A (React-lane) findings are fixed.** Scope held to the React lane; Section B remains logged for its owners. No `REACT-*` or `REACT-TV-*` rule was renumbered or deleted — the frozen 111 base IDs are byte-identical to `463fc14` and the TV standard still carries 54 rules.

| Finding | Resolution |
|---|---|
| **R1** regression | The PKG-5/6 carve-out is **deleted** from `react-code-review/SKILL.md` — the routing sentence now reads "every other TV family, `REACT-TV-PKG-*` included, → `react-code-reviewer`", the security row is removed from the citation table, and the triage table's all-of-PKG row is consistent with both. The standard is named as the single authority so the split cannot drift again. |
| **R2** | §8's never-suppress rule is **scoped to the *One defect, one finding* collision cases only**; outside them §16 governs and a performance or security observation is not filed here. The two sections no longer contradict. |
| **R3** | The red flag now stops on **filing** a `REACT-TV-PERF-*` ID, not citing one, and says citing it as supporting context is expected. `react-performance.md` and `mobile-security.md` are declared **read-only inputs** — readable for routing and context, never filable. |
| **R4** | **Stated as a known lane gap** rather than papered over or unilaterally resolved. §11 of the planning skill records that no `REACT-TEST-*`/`REACT-LOG-*` family exists, that this is the one place §0's grounding claim does not hold, and that no such ID may be invented. The review skill's §5 adds the matching rule: a test-quality or logging concern fitting none of the first three filing-gate categories is **not filable**, and is recorded once as an unauthored-standard gap. Authoring the two families remains the standards owner's decision. |
| **R5** | An unconfirmed backend contract is now unambiguously **record-and-continue** at Design: removed from both stop lists, with a note that it blocks *decomposition* at Feature-start, not the design. |
| **R6** | The Blocking example reads "a class component in new code **outside `REACT-FC-1`'s authored error-boundary exception**", so compliant code no longer returns as Blocking. |
| **R7** | `react-performance-reviewer` now **hands its findings to `react-code-reviewer` and does not merge or write the document**; its Role line matches. One assembler, one merger. |
| **R8** | The completion report gains items **17 (`device_type`)** and **18 (the two manual walkthrough results)**, the walkthroughs become explicit validation candidates, and the developer's `/create-dev-qa-notes` contribution names them — so `QA-A11Y-1` is satisfiable from React's own output. |
| **R9** | "A recorded reference that **cannot be read**" is now a stop-and-report path in the architect, the developer, the planning skill's red flags, and the implementation readiness check — matching all three precedents. |
| **R10** | `react-feature-developer` gains **`## Inputs`, `## Output format`, and `## Red flags`** sections, and `mobile-security.md` is added to its standards list. 49 → 76 lines, still thin on methodology. |
| **R11** | The rendering model is identified **per surface** in the implementation skill's §3 (cross-linked to the planning skill's §5) and in the performance reviewer's technology paragraph. |
| **R12** | §3 gains a **16th dimension: environment and config supply** — `.env*` files, the public prefix, where config reaches the client — the load-bearing fact for `REACT-API-BASEQ-6`/`SEC-SECRETS-2`. |
| **R13** | The false premise is gone; the rule is stated abstractly ("the ID's own root decides the owner, wherever the ID appears") with only the genuine cross-file cases named. |
| **R14/R15** | Architect Output part 2 gains **Testing**, **Logging & Analytics**, and **Build & Configuration Impact**; part 4 is renamed **Existing · Required · Recommended** and carries the skill's two qualifiers (justification, approval-gated, never applied silently). |
| **R16/R17** | Both readiness gates stop on a **missing or placeholder** cited `standards/react/*` file, the performance reviewer's naming `react-smart-tv.md` explicitly. |
| **R18** | The build-tool trap is restated correctly: `package.json` scripts plus the installed dev dependency, never a lone config file — no lockfile signal. |
| **R19** | The planning skill's frontmatter names all three call sites, including `/analyze-feature`. |
| **R20** | The `AND-*`/`IOS-*` prohibition now appears in all seven files, not one. |
| **R21** | §9 cites `REACT-API-BASEQ-1..7`, naming the previously skipped `-4` and `-7`. |
| **R22** | The isolated-worktree clause is restored to the do-not-complete list. |
| **R23** | `A11Y-SR-1` carries an explicit **web reading** (a named desktop screen reader) wherever the React lane cites it, so it is neither unsatisfiable nor silently skipped. |
| **R24** | §17 maps **Recommended → DD §23** and **Unresolved → DD §24**, states optional modernization is never written to the DD, and adds three React decomposition hazards (shared-registry contention, `'use client'` boundary ripple, lockfile ownership). |
| **R26** | `platform`/`device_type` are **passed by the command at Analyze** (no document exists yet) and read from frontmatter from Design onward — the input gate no longer stops on its own first check. |
| **R27** | §15's N/A output is now **grouped by family or workspace, never per file**, per-rule tracking is declared internal working state, and a **Large diffs** subsection adds chunking, explicit coverage reporting, blast-radius prioritisation, and a ban on silent sampling. |
| **R28** | The Fix-stage cross-reference now says the developer works from the finding, its cited ID, and the file — not from the implementation skill's task-resolution path, whose input gate the Fix stage cannot satisfy. |
| **R29** | The repository-re-read clause is restored: `/dev-feature-start` re-reads the repository and **that** is the source of the breakdown's `files touched` column; per-file paths are never invented at Design. |
| **R30** | Both reviewers say security is a **separate `/review-security` pass, not a co-runner**, and the developer's Fix-stage text no longer waits for an adjudicator the command never invokes — a disputed `SEC-*` finding is recorded in the fix log for a human. |
| **R31** | `commands/implement-task.md`'s `react` row is **`active`**, and the placeholder-marker rule is scoped to iOS and defined precisely (frontmatter description **and** a `## Status: Not yet authored` heading), so ordinary prose mentioning "structure-only placeholder" can no longer trip it. |
| **R32** | **Left as-is deliberately.** The reviewer agents' TV bullets do duplicate skill methodology, but collapsing them to a pointer would re-open the R1/R3 class of defect by moving load-bearing routing behind indirection. Recorded as accepted duplication, with the standard named as the single authority. |

**Verified after the fixes:** 111 frozen base IDs byte-identical to `463fc14`; 54 TV rules; every cited ID across the seven files and the standards resolves; all intra-skill anchors resolve (one I introduced was caught and fixed); no stale security-lane routing remains anywhere.

---

## A. React-lane findings — fixed 2026-08-20

**Regressions and live contradictions**

| # | Finding | Sources |
|---|---|---|
| **R1** | **`REACT-TV-PKG-5`/`-6` regression — my REACT-003 fix never reached the review skill.** `standards/react/react-smart-tv.md:25` and `agents/react-code-reviewer.md:69` say the React code reviewer files them; `skills/react-code-review/SKILL.md:136`, `:248` still route them to `mobile-security-review`, and the same skill's triage table `:84` gives the code reviewer *all* of `REACT-TV-PKG-*` — inconsistent with itself. `CHANGELOG.md` claimed the fix landed. **Verified directly.** | self-consistency |
| **R2** | **`SKILL.md:140` ("never suppress an observation… a dropped finding is worse than a duplicated one") contradicts `:226-227` ("Performance stays with Pass B; everything else with Pass A… do not duplicate security commentary, even incidentally").** Outcome depends on which section the model reads last. Neither precedent has this collision. | parity, self-consistency |
| **R3** | `agents/react-code-reviewer.md:50` mandates citing the other lane's owning ID as context; `:80` red-flags being "about to **cite** a `REACT-TV-PERF-*` ID" → STOP. Should be *file*, not *cite*. Inputs also omit `mobile-security.md` while `:44`/`:48` cite `SEC-*`, and omit `react-performance.md` while lane routing requires reading it. | self-consistency |
| **R5** | An unconfirmed backend contract is both "record as a blocking unresolved decision **and keep planning**" (`react-dev-planning:159`, `:234`, `:240`) and "**stop and report** — never work around" (`:268`, `:311`). Identical inputs → either a DD or a refusal. | self-consistency |
| **R6** | `skills/react-code-review/SKILL.md:168` files "a class component in new code (`REACT-FC-1`)" as **Blocking** with no exception, but `react-coding-standards.md:48` authorises an error-boundary class and `react-feature-implementation:97` tells the developer to write one. Compliant code returns as Blocking. | self-consistency, parity |
| **R7** | Three components each claim to assemble the review document: `commands/review-code.md:13`, `agents/react-code-reviewer.md:34`, and `agents/react-performance-reviewer.md:33` ("Merge with what the other reviewers produced") — while `SKILL.md:144` says the perf reviewer **cannot**. §15's dedup assumes Pass B's findings are already in the file. | self-consistency, pipeline, executability |

**Contract and parity gaps**

| # | Finding | Sources |
|---|---|---|
| **R4** | **Testing and logging are planned but grounded in no `REACT-*` ID, and there is no family to cite.** `react-dev-planning:169-173` (§11) cites only `I18N-TEST-*`/`A11Y-*`; `standards/react/` has no `REACT-TEST-*` or `REACT-LOG-*` (six base files vs Android's ten). So §0's claim that the skill grounds every React rule in an authored `REACT-*` standard is **false for §11**, and the review lane has no bucket for a changed test file — a test-quality or logging-hygiene defect fails all four categories of the filing gate and **cannot be filed at all**. iOS cites five `IOS-ARCH-TEST-*`; Android has `AND-TEST-*` and `AND-LOG-*`. | parity |
| **R9** | **A design reference that exists but cannot be read is unhandled.** All three precedents have the clause (`rn-architect:27`, `android-architect:47`, `ios-architect:40` "stop and report to the caller"); the React lane handles only *absence*. A dead Figma link or unreachable MCP server most likely ends in invented layout — exactly what the gate prevents. | parity |
| **R10** | `agents/react-feature-developer.md` has **no `## Inputs`, no `## Output format`, no `## Red flags`** section, while all three React siblings have all three; its skill's 16-item report and 10 stop conditions never surface. Step 4's standards list also omits `standards/shared/mobile-security.md` though `:45` requires applying `SEC-*`. Verdict: thin by design on methodology, **underspecified on contract surface** — it inherited the gaps of the lane's two oldest agents rather than its siblings' template. | parity, self-consistency |
| **R11** | `react-feature-implementation:63-68` identifies the rendering model **per repository**; contract 2 and both sibling skills say **per surface** (`react-dev-planning:112`, `react-code-review:92`). Same slip at `agents/react-performance-reviewer.md:15`, contradicted by its own `:69`. Breaks the App-vs-Pages hybrid trap. | parity |
| **R12** | `react-dev-planning` §3's 15 discovery dimensions have **no environment/config-supply dimension**, though §4 carries an env-inlining trap and §9 plans against `REACT-API-BASEQ-6`/`SEC-SECRETS-2`. Both precedents have one. The DoD therefore never requires establishing the load-bearing fact for the bundle-secrets rules. | parity |
| **R14** | `agents/react-architect.md:55` Output part 2 has no **Testing**, **Logging & Analytics**, or **Build & Config** slot; both precedents do. The §11 testing plan has nowhere to land and evaporates between skill and DD §19. | parity |
| **R15** | Architect part 4 says "Existing · Required · **Optional**"; the skill's four-class model calls it "**Recommended** deviation with justification… requires an approval gate, never applied silently" (`:225-236`). The agent's bare label drops both qualifiers, conflating an approval-gated deviation with a never-actioned modernization note. | parity |
| **R23** | `A11Y-SR-1` requires a VoiceOver/TalkBack walkthrough and is the only `A11Y-*` rule with no `React:` sub-bullet in the shared standard, yet the React lane cites it unqualified for web (`react-dev-planning:184`, `react-feature-implementation:121`) — an unsatisfiable requirement inviting a silent pass. | parity |
| **R8** | The QA handoff needs *whether the manual bidirectional and screen-reader walkthroughs were performed* (`QA-A11Y-1`), but the developer's 16-item completion report produces neither, and never cites `I18N-TEST-*`. `device_type` is absent from the report too. `QA-A11Y-1` is unsatisfiable from React's output. | pipeline, executability |
| **R27** | Nothing in the review lane scales to a large diff: per-rule pass/fail recording per file, per-file evidence resolution, and a one-line N/A reason per skipped file, with no sampling, batching, grouping, or coverage-reporting rule. Predicted behaviour: a silent partial review presented as complete. | executability |
| **R28** | `skills/react-code-review/SKILL.md:229` names `react-feature-implementation` as the Fix-stage methodology, but that skill's input gate requires a task id and Task Breakdown and says stop if missing — `/fix-review-comments` supplies neither. The Android precedent makes no such cross-reference. | pipeline |
| **R29** | `react-dev-planning:165` drops the repository-re-read clause both the Android precedent and the shared `dev-design-start` carry, leaving `templates/task-breakdown-template.md`'s `files touched` column with no declared producer in the React lane. | pipeline |
| **R26** | `react-dev-planning:24-31` requires `platform`/`device_type` "read from frontmatter, never re-detected" with a stop-if-missing gate — but at `/analyze-feature` **no document exists yet**; the values live only in the conversation. A literal agent stops on its own first input gate. | executability |
| **R13** | `SKILL.md:127` and both reviewer agents assert `react-coding-standards.md` **cites** `REACT-PERF-CWV-1`; it appears there only as an example inside the ID-scheme paragraph. The routing rule it justifies is correct; the stated premise is false. | pipeline |
| **R30** | `agents/react-code-reviewer.md:10` and `react-performance-reviewer.md:13` say they run "alongside… the shared `mobile-security-reviewer`", but `/review-code` invokes only the two React reviewers and defers security to `/review-security`. `react-feature-developer.md:34` also expects `mobile-security-reviewer` at Fix, which never invokes it. | pipeline, self-consistency |
| **R31** | `commands/implement-task.md:89` still marks the `react` row **"check readiness"** and `:91` says to scan the skill for a "not yet authored / structure-only placeholder" marker and refuse — and React's §0 gate prose contains that literal phrase about an unrelated subject. iOS uses a real marker (frontmatter + `## Status:` heading); React has neither. **Verified directly.** | pipeline, self-consistency |

**Smaller items:** R16 perf reviewer's readiness stop names only `react-performance.md`, not the `react-smart-tv.md` just added to its Inputs · R17 `react-feature-implementation`'s gate stops only on a placeholder, not on a *missing* file (its three siblings do both) · R18 architect restates the build-tool trap as "lockfile/scripts" where the skill says `package.json` scripts + installed dev dependency, no lockfile signal · R19 `react-dev-planning` frontmatter omits `/analyze-feature`, its own body's third call site (iOS names all three) · R20 the `AND-*`/`IOS-*` prohibition appears in 1 of 7 files · R21 §9 enumerates `REACT-API-BASEQ-2/-3/-5/-6` and silently skips `-4` and `-7` · R22 the do-not-complete list drops Android's isolated-worktree clause · R24 §17 gives Recommended and Unresolved output no DD destination (§23/§24) and lists no React decomposition hazards · R25 no depth-scales-with-stage rule (an iOS-only refinement) · R32 both reviewer agents restate skill methodology at near-equal length where Android keeps it to one line.

---

## B. Cross-lane findings — logged, not this lane's to fix

Per the standing React-lane-only scope. Several are serious and worth an owner:

- **Every stage names a plugin *template path* as the document to read or write** ("locate its `templates/feature-analysis-template.md`", "Populate `templates/qa-handoff-template.md`"). Only the DD has a real output-location rule. A literal reading writes into the installed plugin — and `/dev-design-start` hands that path to `planning-doc-migration`, which migrates frontmatter **in place**. `/analyze-feature`'s output has no defined name or location at all, while the React skill forbids guessing a path.
- **`/analyze-feature` invokes the architect (step 4) before its own design-reference gate (step 5)**, but the architect must itself stop-and-ask on a UI feature with no reference — so the run halts before the command's gate is reached, and step 6 presumes the opposite order.
- **The design-reference re-ask is unbounded** — "re-ask until a usable reference is supplied", `not_required` never valid, while `pending` is a legal template value the next stage handles. No bounded exit.
- **`device_type` has no value for a desktop web SPA.** The enum is `mobile | tv`; `repo-analyst` says a React repo with no TV marker is *ambiguous* and must ask; `/analyze-feature` requires printing a detected value and forbids further asks. The cheapest resolution is the one every file bans — silently print `mobile`, which selects the touch/pointer branch for a desktop app.
- **An approved upstream document contradicted by repository evidence has no defined resolution** and no FA amendment or re-approval path (only the DD has one), producing a terminal stall.
- **`hooks/block-main-branch-changes` matches `Write|Edit|MultiEdit` with no path filter**, so it blocks planning-document writes too; only `/implement-task` checks the branch, and the five other doc-producing commands have no recovery branch.
- **`/implement-task` may not write any file**, so no persisted implementation record exists — making `QA-SOURCE-1` structurally unobtainable in a later session.
- **The task breakdown has no workspace/package column**, so the React implementation skill's "target package known" readiness check can never pass in a monorepo.
- **`dev-feature-start` never re-reads the repository**, so the `files touched` column has no source; and `mobile-debugging`'s reproduce-first rule does not fit static standards violations, which is most of the React rubric.
- Smaller: `repo-analyst.md:87` still says React deep detection is "deferred until `standards/react/*` is authored" (all seven are); the RN-only conformance sweep is mandated for all platforms; `require-approval-before-code` omits `.css`/`.scss`/`.mjs`/`.cjs`/`.html`; `repo-knowledge-consumer` never defines its `<candidate>` argument; DD §26's Definition of Ready is composed of facts an agent cannot verify with no `N/A` branch; `dev-design-start`'s Step 7 contraction pass is unfalsifiable.

---

## C. What survived scrutiny

- **Every one of the 200+ numbered IDs cited across the seven files resolves** to an authored rule, including every range's upper bound. No invented IDs. No `RN-*`, bare-family, `AND-*`, or `IOS-*` leakage.
- **Command→agent routing is complete for all eight stages**; DD §19/§20 exist and are correctly named; `dev-design-start` Steps 6/7 exist and govern what the architect claims; the reviewer output matches the review template's six sections in order; the release handoff is wired end to end through `REL-PERF-1`.
- **Every `#anchor` and `§N` cross-reference resolves**, including the em-dash slugs a naive slugger fails on. Every referenced script and hook exists and behaves as described.
- **Structural parity holds**: `react-dev-planning` maps 1:1 onto the Android/iOS planning skills and *adds* rendering-model, routing, and data-layer sections; `react-feature-implementation` maps 1:1 onto Android's; `react-code-review` covers every Android section and adds detection traps, measurement discipline, and remediation discipline.
- **Contract compliance verified** on technology neutrality (no stack default anywhere), the no-modernization-aside stance (banned "anywhere in the output" in all three review files, with the deliberate-divergence note), labelled evidence with all four labels, the measurement discipline including the production-build qualifier and the "cuts both ways" symmetry — rated a genuine improvement over the RN precedent — and the lane split by ID root, whose two real cross-file cases are both satisfiable.
- **The review lane's analytical core is sound**: triage and rule selection compose without contradiction for a two-workspace JS+TS diff, lane ownership is decidable in every case tried, and the dedup rules are executable. What breaks in that scenario is throughput and merge ownership, not the rules.
- Two scenarios came out clean where a deadlock was suspected: the absent-manifest path does not collide with the design-reference gate, and the "never plan tests that cannot run" rules compose into one defined action.
