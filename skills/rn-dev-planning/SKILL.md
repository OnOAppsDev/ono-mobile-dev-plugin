---
name: rn-dev-planning
description: React Native-specific planning methodology — the repository evidence dimensions to inspect, the vocabulary a Detailed Design's Technical Implementation Approach and Impacted Modules are written in, the RN+TV unsupported stop, and the RN standard-ID citation map. Used by /analyze-feature, /dev-design-start and /dev-feature-start via the rn-architect agent, alongside the shared platform-planning skill which owns the planning methodology.
---

# React Native Dev Planning

## Overview

This skill is the **React Native half** of planning a feature. It owns what a
platform-independent layer could not state: which dimensions of a React Native repository
must be inspected, the RN vocabulary the approach and change surface are written in, and
which RN standard IDs may be cited.

The methodology half — the confirmed-context rule, standards readiness, repository-knowledge
resolution, evidence discipline and its labelling vocabulary, reuse-before-new,
detected-conventions-govern, output discipline and the generic stop conditions — lives in
**`skills/platform-planning/SKILL.md`** and is not restated here. The DD's section rules,
Classification, the risk taxonomy and the source-of-truth hierarchy belong to
**`skills/dev-design-start/SKILL.md`**. Apply all three.

**This skill assumes no technology.** React Navigation, Expo Router, Redux Toolkit, Zustand,
MobX, RTK Query, TanStack Query, Apollo, plain `fetch`/axios, `StyleSheet`, a styling
library, a feature-based layout, a type-based layout, the New Architecture, the Legacy
Architecture — all are *possible findings, never defaults*.

**This skill plans. It never writes code and never modifies repository files.**

**React Native is mobile-only here.** There is no TV branch in this lane; `device_type` is carried in frontmatter by the shared pipeline and is not a planning variable for React Native.

**`platform: react-native` with `device_type: tv` is unsupported — report the unsupported context and stop.** The combination is reachable: `repo-analyst` treats `react-native-tvos` as a decisive TV marker, and a developer can select `tv` at `/analyze-feature`'s confirmation gate. When it reaches this lane, **stop and report that React Native TV is not supported by this plugin**, naming the confirmed `platform` and `device_type` so the developer sees exactly which context was rejected.

- **Never plan it as mobile.** Touch targets, gestures, and phone navigation patterns do not transfer to a D-pad/remote model, and proceeding silently would ship a mobile design for a TV surface.
- **Never invent an RN TV branch, an RN TV standard, or an RN TV convention.** No `standards/react-native/*` document carries TV rules, so there is nothing to cite and nothing to detect against.
- **Do not route elsewhere.** This is not a placeholder lane awaiting authoring and it is not another platform's work — Apple TV is `ios` + `tv` and Android TV is `android` + `tv`, each handled by its own authored lane. There is no equivalent React Native lane to fall back to.

Supporting React Native TV would be a separate product and architecture decision, deliberately outside this plugin's current scope. Until such a decision exists, this stop **is** the defined behaviour — not a gap to work around.

## 3. React Native repository evidence collection

Inspect the actual codebase before proposing anything. `repo-analyst` supplies a neutral stack inventory and a folder-structure conformance check; it is a starting signal, **not** the evidence base for a design. This sweep is this lane's own responsibility.

Collect evidence for each dimension, recording the path that proves it:

1. **Workspace and package layout** — single package vs. monorepo (Yarn/PNPM workspaces, Nx, Turborepo); which package this feature belongs to; how shared code is resolved across packages.
2. **App framework and tooling** — bare React Native vs. Expo (managed or bare), Metro configuration, path aliases, and the env/config mechanism in use.
3. **TypeScript configuration** — strictness, path mapping, and any per-directory overrides that change what is enforceable.
4. **Structural convention** — feature-based (`src/features/<name>/`) or type-based (top-level kind folders), per `ARCH-STRUCT-1`; which one the repository has actually standardised on, and how consistently.
5. **Navigation** — which library (React Navigation, Expo Router, or another), how routes and params are typed, whether a navigation abstraction exists, and how deep links are declared.
6. **State management** — which library or mechanism holds global state, where stores/slices/selectors live, and what stays local.
7. **Data fetching** — which layer talks to the backend, its shared client or base query, its cache/invalidation mechanism, and its error-normalisation convention.
8. **Styling** — `StyleSheet`, a styling library, or a mix; whether a theme/design-token module exists and how consistently it is used.
9. **Reusable components and hooks** — existing screens, shared components, and hooks this feature should reuse rather than duplicate.
10. **Internationalisation** — the i18n library, where keys live, the namespacing convention, and whether RTL is exercised.
11. **Testing** — the runner, the component-testing library, the test-file convention (colocated, `__tests__/`, or other), and what is actually covered today.
12. **Native surface and architecture mode** — whether the app runs the New Architecture (Bridgeless, TurboModules, Fabric, Codegen) or the Legacy Architecture, and which native modules or custom native views the feature would touch.
13. **Platform divergence** — where the codebase forks behaviour by platform (`.ios.tsx`/`.android.tsx` files, `Platform.OS`/`Platform.select` branches) and how consistently.
14. **Existing analogous feature** — the nearest comparable feature in the repository, which becomes the pattern to follow.

**Label every finding** `[evidence: <path>]`, `[reused: <path>#<anchor>]`, `[inference]`, or `[unknown]`. An unlabelled claim about the repository is a defect. Prefer `[unknown]` over a guess.

This vocabulary is **owned by the React Native planning lane as part of the platform planning contract** — `skills/dev-design-start/SKILL.md` delegates it to the platform dev-planning skill and neither defines nor requires it. It is **not a React Native concept**; it is a platform-owned responsibility under the current architecture.

**Record the change surface while sweeping**, not afterwards: which packages and feature folders the change enters, the distinct *kinds* of change it makes, and roughly how many sites each kind repeats across. Those observations are what [§4](#4-technical-implementation-approach-dd-19) and the change-surface inventory in [§4b](#4b-impacted-modules-dd-20) are written from, and they are also what the complexity assessment records during this same sweep — collect them once.

## 4. Technical Implementation Approach (DD §19)

Express the approach in the repository's own React Native vocabulary, grounded strictly in [§3](#3-react-native-repository-evidence-collection).

**Every statement carries its class.** Label each one Existing, Required, Recommended or Unresolved per `skills/dev-design-start/SKILL.md` § *Shared planning rules → Classification* — that rule is the definition and is not restated here.

- **Screens and components** — which surfaces are added or changed, and which existing components and hooks are reused (name them by path).
- **State and data** — where state lives and who owns it, in the mechanism the repository actually uses; what is local and what is shared; how the feature's data is fetched, cached, invalidated, and how its errors are normalised.
- **Navigation** — routes, params and their typing, entry points, back behaviour, and any deep link, in the detected library's terms.
- **Styling** — how the feature's styles are organised against the detected approach and theme/token module.
- **Placement** — where the new code lands under the repository's detected structural convention, and why.
- **Native surface** — where the feature touches a native module or custom view, expressed against the architecture mode found in §3.12.
- **Cross-cutting** — the i18n, accessibility, performance and security decisions the feature actually makes, each citing the ID it follows.

Cite the standard IDs each decision follows, from [§5](#5-react-native-standards-citation) only. The output is **decisions and their cited IDs** — the sweep itself is working material and does not belong in the DD.

## 4b. Impacted Modules (DD §20)

Name the change surface in React Native terms: **packages/workspaces, feature folders, screens, navigators, store slices or store modules, API/service modules, shared component and hook modules, native modules, and theme/token modules.** For each, state what class of change it undergoes and whether it is created, modified, or only read.

Where the same change repeats across many sites, give an approximate site count instead of listing files — for example "`src/features/checkout` — all `useAppNavigation` call sites move to typed route params, ~18 sites".

Every path must be evidence-backed. Mark a genuinely undetermined location `[unknown — target module not determined]` rather than inventing a plausible one.

**The resolution rule for this section — what counts as a change class, when files may be enumerated, and the site threshold — is `skills/dev-design-start/SKILL.md` Step 6 and `templates/dd-template.md` §20.** This section supplies only the React Native vocabulary those rules are applied to.

## 5. React Native standards citation

**This lane's parameters for the two parameterised source-of-truth ranks** (`skills/dev-design-start/SKILL.md` § *Shared planning rules → Source-of-truth hierarchy*): **rank 4** is `standards/react-native/*` plus `standards/shared/*`; **rank 5** is React Native, Expo and library documentation, which is supporting guidance only and never overrides rank 2.

Cite only IDs that exist in these files and genuinely apply to the point being made. Never invent an ID, and never cite one that is merely adjacent.

| Area | Standard file | ID roots |
|---|---|---|
| TypeScript, components, hooks, naming, props, constants, styling, lint, testing | `standards/react-native/rn-coding-standards.md` | `RN-TS-*`, `RN-FC-*`, `RN-NAME-*`, `RN-PROPS-*`, `RN-CONST-*`, `RN-STYLE-*`, `RN-LINT-*`, `RN-TEST-*` |
| Layering, structure, dependency direction, composition, reuse, architecture mode | `standards/react-native/rn-architecture.md` | `ARCH-LAYERS-*`, `ARCH-STRUCT-*`, `ARCH-FOLDERS-*`, `ARCH-TYPE-*`, `ARCH-DEPS-*`, `ARCH-LOGIC-*`, `ARCH-COMPOSE-*`, `ARCH-REUSE-*`, `ARCH-NEW-*`, `ARCH-LEGACY-*` |
| Data fetching, cache, errors, pagination, cancellation | `standards/react-native/rn-api-service-layer.md` | `API-ORG-*`, `API-ERR-*`, `API-PAGE-*`, `API-CANCEL-*`, `API-CACHE-*`, `API-BASEQ-*` |
| State, selectors, boundaries, serialisation, persistence | `standards/react-native/rn-state-management.md` | `STATE-SELECT-*`, `STATE-BOUNDARY-*`, `STATE-SERIAL-*`, `STATE-PERSIST-*`, `STATE-SLICE-*`, `STATE-ENTITY-*` |
| Navigation, typed routes, deep links, back behaviour | `standards/react-native/rn-navigation.md` | `NAV-TYPED-*`, `NAV-DEEPLINK-*`, `NAV-SERVICE-*`, `NAV-BACK-*` |
| Performance | `standards/react-native/rn-performance.md` | `RN-PERF-RERENDER-*`, `RN-PERF-LIST-*`, `RN-PERF-JSTHREAD-*`, `RN-PERF-ANIM-*`, `RN-PERF-DEFER-*`, `RN-PERF-IMAGE-*`, `RN-PERF-BUNDLE-*` |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-ROLES-*`, `A11Y-TOUCH-*`, `A11Y-FONT-*`, `A11Y-SR-*` |
| Localization & RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-COPY-*`, `I18N-RTL-*`, `I18N-FMT-*`, `I18N-TEST-*` |
| Security & privacy (shared) | `standards/shared/mobile-security.md` | `SEC-SECRETS-*`, `SEC-STORAGE-*`, `SEC-NET-*`, `SEC-AUTH-*`, `SEC-DEEPLINK-*`, `SEC-WEBVIEW-*`, `SEC-BRIDGE-*`, `SEC-PERMS-*`, `SEC-LOG-*` |

Several ID roots in `standards/react-native/rn-api-service-layer.md` and `standards/react-native/rn-state-management.md` apply **only when the corresponding library is detected** — those documents carry their own Applicability sections. Cite a gated root only after §3 established that the library is actually in use.

## 6. Red flags — STOP and report instead of proceeding

These are the React Native-specific conditions. Generic stop conditions belong to the command and the shared skill and are not repeated here.

- The architecture mode (New vs. Legacy) cannot be determined from evidence, and the feature touches a native module or custom native view.
- Two navigation libraries, two state-management libraries, or two data-fetching layers are in active use with no discernible primary, and the feature must choose between them.
- The repository's structural convention (feature-based vs. type-based) cannot be established, and the feature adds new modules.
- The feature cannot be built without introducing a new library, architecture mode, or styling approach — report it as an open decision rather than deciding it.
- A cited `standards/react-native/*` file is missing or is a structure-only placeholder (see `skills/platform-planning/SKILL.md` §2).
- You are about to state a repository fact you did not verify, or cite an ID you did not confirm exists.

## Relationship with commands, agent, skills

- **`commands/analyze-feature.md`**, **`commands/dev-design-start.md`**, **`commands/dev-feature-start.md`** — detection, the confirmation gate, artifact resolution, approval gates and routing.
- **`skills/platform-planning/SKILL.md`** — the platform-independent planning methodology. It names every other owner; that table is not repeated here.
- **`skills/dev-design-start/SKILL.md`** — the DD section rules, Classification, Risk classification and the source-of-truth hierarchy.
- **`agents/rn-architect.md`** — the React Native specialist that executes all of it.
- **This skill** — the React Native planning content itself, and nothing a platform-independent layer could state.
