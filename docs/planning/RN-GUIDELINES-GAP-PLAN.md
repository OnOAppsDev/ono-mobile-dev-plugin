# RN AI Coding Guidelines — Gap Plan (approved 2026-10-12)

Source: "AI Agent Coding Guidelines" (React Native). Scope: **React Native only** — never edit
`skills/platform-*`, `standards/shared/*`, any iOS/Android/React file, or `rn-nativewind-theme-sync`.

## Approved decisions

- **i18n — Option A.** Gate `I18N-*` inside the React Native lanes only. `standards/shared/i18n-rtl.md` is NOT changed.
  Gate: `I18N-*` applies to RN work only when the repository already has a localization setup (an i18n
  library wired in — rn-dev-planning evidence dimension 10) **or** the approved DD/feature explicitly
  requires localization/RTL. Otherwise `I18N-*` is Not Applicable, plain string literals are not a
  finding, and no i18n is introduced. `I18N-FMT-*` under the gate: when the repository standardised
  on a formatting library (e.g. date-fns), using it satisfies the locale-aware formatting intent.
- **ARCH-LOGIC-1 — remedy only.** Keep every threshold (3 branches, `.reduce`/chains, regex, 150 lines).
  Crossing a threshold triggers **responsibility extraction**, not automatically a custom hook. Choose by the
  actual responsibility: plain function, helper/utility module, co-located sub-component, or custom hook.
  A custom hook only when the logic is genuinely stateful or reusable.

## Global constraints (all agents)

- Match each file's existing style: stable ID bullets `` `ID-N` [SEVERITY] text ``, same tone and density. Keep additions terse.
- IDs must be of form `PREFIX-<digit>` (tests check `` `FAMILY-\d `` exists in the cited standard).
- Do not rename, renumber or delete existing IDs. Do not change existing thresholds.
- Each rule is phrased as **follow the project's established convention** — preference alone is never a finding (`platform-review` §3).
- No duplication: a rule's text lives in exactly one standard; skills cite IDs, they never restate rules.

## Pinned new / changed IDs (authoritative names)

| ID | Sev | File | Guideline | Intent |
|---|---|---|---|---|
| `RN-STYLE-1` (rewrite) | WARNING | rn-coding-standards | G8 | Follow the styling approach established for the surrounding area; do not introduce another method (NativeWind / StyleSheet / makeStyles / inline / other) alongside it; never convert unrelated existing code as part of a change. Do not assume any particular library. |
| `RN-STYLE-2` (rewrite) | WARNING | rn-coding-standards | G8 | Library-neutral: styles are defined the detected approach's way, not as inline style objects recreated each render. When NativeWind is installed, supported for the component, and established for that area, new styling uses `className` rather than a new `StyleSheet`. |
| `RN-STYLE-3` (extend) | INFO | rn-coding-standards | G7 | Add: no arbitrary values (`max-w-[350px]`, `rounded-[32px]`, raw hex/px) when a token expresses the same design intent; a genuinely missing reusable value is added to the shared theme location; a genuinely one-off value is not abstracted. Repeated style blocks (e.g. a shadow) become a shared theme value/style. |
| `RN-STYLE-5` (new) | INFO | rn-coding-standards | G19 | A new theme value follows the naming convention of the theme section it joins (e.g. existing `sm/md/lg` scale vs specific semantic names); reuse an existing value for the same concept; never introduce a parallel naming system or rename established tokens. |
| `RN-TS-5` (new) | INFO | rn-coding-standards | G6 | A known finite set of values (states, types, variants) is typed with the project's established representation — enum or string-literal union — not bare `string` repeated across call sites. Do not introduce enums where unions are the convention (or vice versa). |
| `RN-PROPS-3` (extend) | WARNING | rn-coding-standards | G9 | Extend to optional function parameters; no `\| null` on optional props/params unless `null` carries a distinct meaning; no redundant unions, duplicated types, or defaults that add nothing. |
| `RN-FC-5` (new) | INFO | rn-coding-standards | G10 | Optional callbacks are invoked with `?.()` rather than defaulted to a local `noop`; one behaviour gets one handler pattern (toggle vs explicit open/close chosen by what callers need — keep explicit open/close when callers need deterministic state). |
| `RN-FC-6` (new) | INFO | rn-coding-standards | G11 | Do not create a custom hook just to move one component's single-use local state/callbacks out of the file; extract a hook when it gives real reuse, isolates genuinely complex stateful logic, or is required by `ARCH-LOGIC-1`'s remedy choice. |
| `RN-CONST-3` (tweak) | INFO | rn-coding-standards | G18 | Naming follows the project's established constant convention; the SCREAMING_SNAKE/PascalCase default applies only where the project has none. |
| `RN-CONST-4` (extend) | WARNING | rn-coding-standards | G18 | Add hit slop/touch targets, opacity, border radii, animation durations to the examples; check for an existing shared constant/theme value first; do not create a constant solely to hide an arbitrary number; incidental self-explanatory literals are exempt. |
| `RN-CMT-1` (new, new "Comments" section) | INFO | rn-coding-standards | G16 | Comments explain non-obvious reasoning, constraints, workarounds; no comments narrating what the code plainly does; no standard IDs or standard text in application code comments. Mandated comment formats (`RN-TS-2`, `RN-LINT-2`) are unaffected. |
| `RN-DEP-1` (new, new "Dependencies" section) | WARNING | rn-coding-standards | G17 | Before using a package: read the installed version (package.json/lockfile), use APIs supported by that version and compatible with the installed RN version, follow the project's existing usage, introduce no deprecated API. Newer docs never justify migrating unrelated code (cite `platform-implementation` §3 rather than restating). |
| `RN-DEP-2` (new) | WARNING | rn-coding-standards | G2 | Use an installed library or existing project utility (date formatting, validation, haptics, API response handling…) instead of re-implementing it or adding a competing one; do not add a dependency when the project already solves it cleanly. |
| `ARCH-LOGIC-1` (remedy only) | WARNING | rn-architecture | G11 | Replace "must move into a custom hook or utility module" with responsibility extraction: plain function / helper module / co-located sub-component / custom hook — hook only when stateful or reusable. Thresholds unchanged. Check `ARCH-LOGIC-2`/`ARCH-LAYERS-3` wording does not still imply hook-by-default; adjust minimally if it does. |
| `ARCH-COMPOSE-2` (extend) | WARNING | rn-architecture | G4 | Add counterweight: not for simple components that do not need composition. |
| `ARCH-COMPOSE-4` (new) | INFO | rn-architecture | G5 | Before adding a prop: check whether the variation belongs in a child/compound part, an existing component, or composition; props represent meaningful reusable configuration, not workarounds; avoid stacks of booleans toggling independent parts. |
| `ARCH-REUSE-4` (new) | WARNING | rn-architecture | G12+G15 | Consistent default behaviour (e.g. empty-text fallback, page-level loading) lives once in the shared component, not repeated by callers; extend an existing abstraction for a natural variation rather than adding a single-use wrapper component; never load a generic component with unrelated responsibilities or app-specific business rules. |
| `RN-PERF-LIST-1` (extend) | WARNING | rn-performance | G13 | Cover plain `.map()` (not only inside `ScrollView`); keys use a stable unique id, never the array index when an id exists. Keep the small-fixed-list exemption. |
| `RN-PERF-BUNDLE-1` (tweak) | WARNING | rn-performance | G2 | Keep measurement; the "duplicates an existing dependency" clause defers to `RN-DEP-2` (one-line cross-reference). |

## §A — Agent A: `standards/react-native/rn-coding-standards.md`

Apply every `rn-coding-standards` row above. Place `RN-CMT-1` in a new `## Comments` section and `RN-DEP-*`
in a new `## Dependencies` section (before `## References`). Update the Purpose & Scope / References only if needed to mention the new sections.

## §B — Agent B: `standards/react-native/rn-architecture.md`, `standards/react-native/rn-performance.md`

Apply every `rn-architecture` and `rn-performance` row above.

## §C — Agent C: RN lanes + agent

Files: `skills/rn-feature-implementation/SKILL.md`, `skills/rn-code-review/SKILL.md`,
`skills/rn-dev-planning/SKILL.md`, `agents/feature-implementer.md`.

**Canonical RN ID-family set** (all three lanes' citation tables must cite exactly this set, split into the same rows as `rn-dev-planning` §5):
`RN-TS, RN-FC, RN-NAME, RN-PROPS, RN-CONST, RN-STYLE, RN-LINT, RN-TEST, RN-CMT, RN-DEP, RN-A11Y` ·
`ARCH-LAYERS, ARCH-STRUCT, ARCH-FOLDERS, ARCH-TYPE, ARCH-DEPS, ARCH-LOGIC, ARCH-COMPOSE, ARCH-REUSE, ARCH-NEW, ARCH-LEGACY` ·
`API-ORG, API-ERR, API-PAGE, API-CANCEL, API-CACHE, API-BASEQ` ·
`STATE-SELECT, STATE-BOUNDARY, STATE-SERIAL, STATE-PERSIST, STATE-SLICE, STATE-ENTITY` ·
`NAV-TYPED, NAV-DEEPLINK, NAV-SERVICE, NAV-BACK` ·
`RN-PERF-RERENDER, RN-PERF-LIST, RN-PERF-JSTHREAD, RN-PERF-ANIM, RN-PERF-DEFER, RN-PERF-IMAGE, RN-PERF-BUNDLE` ·
shared: `A11Y-ROLES, A11Y-TOUCH, A11Y-FONT, A11Y-SR` · `I18N-COPY, I18N-RTL, I18N-FMT, I18N-TEST` ·
`SEC-SECRETS, SEC-STORAGE, SEC-NET, SEC-AUTH, SEC-DEEPLINK, SEC-WEBVIEW, SEC-BRIDGE, SEC-PERMS, SEC-LOG`.
(`rn-code-review`'s table may omit the `SEC-*` row — security is a separate reviewer — and must say so in one line.)

1. **`rn-feature-implementation`**
   - *Repository dimensions to inspect*: add (a) code-level style of the nearest analogous files — component declaration style (function vs `React.FC`), arrow-function body style, export style, file/naming patterns; (b) styling approach for the touched area, the theme/token module and its naming conventions, NativeWind presence + major version; (c) installed versions of every package the task uses (RN, Reanimated, navigation, NativeWind, …) per `RN-DEP-1`; (d) existing utilities/libraries covering the task's needs (dates, validation, haptics, API response handling) per `RN-DEP-2`.
   - One-line principle at the top of the methodology section: the code should read as if written by an existing project member.
   - **Consolidate**: remove the area→rules table in "React Native implementation methodology" (keep the heading — test-pinned — and its prose + the accessibility paragraph); keep ONE table under "Standards citation" (header `| Area | Standard file | IDs |`, ≥8 rows — test-pinned) covering the canonical set.
   - **i18n gate** (decision A) stated once, in this lane, citing `I18N-*` as gated.
   - Expand *React Native review points* with compact, ID-citing checks (guideline 20): existing way/utility? (`ARCH-REUSE-*`, `RN-DEP-2`) · installed-version API, nothing deprecated? (`RN-DEP-1`) · surrounding style matched? · simpler / no speculative abstraction, no single-use hook? (`RN-FC-6`) · composition over prop growth? (`ARCH-COMPOSE-*`) · styling approach + NativeWind where established, tokens not arbitrary values, theme naming kept? (`RN-STYLE-*`) · no magic numbers? (`RN-CONST-4`) · typed finite sets, clean optionals? (`RN-TS-5`, `RN-PROPS-3`) · no narrating comments? (`RN-CMT-1`) · i18n only under the gate.
   - Do not add `device_type`/TV text (test-forbidden). Do not mention `fix-review-comments` in this skill (test-forbidden).
2. **`rn-code-review`**
   - Buckets: add `RN-DEP-*` — `package.json`/lockfile changes and files adding a new third-party import or newly using a package API. Gate the `I18N-*` bucket per decision A (Not Applicable with a recorded reason when the gate is not met).
   - Sync the citation table to the canonical set.
   - Do not touch the out-of-lane policy section (test-pinned).
3. **`rn-dev-planning`**
   - §3 dimension 2: add installed versions of key libraries. Dimension 8: add NativeWind presence/major version and theme token naming conventions. Dimension 10: note it feeds the i18n gate.
   - §4 Cross-cutting: i18n/RTL decisions are planned only when the gate holds; otherwise record `N/A`.
   - §5 table: add `RN-CMT-*`, `RN-DEP-*` (and anything else missing from the canonical set).
4. **`agents/feature-implementer.md`** line "Don't restate a standard's text in code comments — cite the ID instead." → keep the first clause verbatim (test-pinned) and change the rest so standard IDs are recorded in the completion report, not in code comments.

## §D — Lead (after A–C)

- `scripts/rn-implementation-contract.test.ts`: drift guard — the three RN lanes cite the same ID-family set (review lane excepting `SEC-*`).
- `CHANGELOG.md` entry under `[Unreleased]` (no version bump — bump is separate release work).
- `node --no-warnings scripts/check.ts --strict` green.
