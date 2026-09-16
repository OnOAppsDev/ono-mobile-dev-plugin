---
name: rn-code-review
description: React Native-specific review content — the standards families and RN-*/ARCH-*/API-*/STATE-*/NAV-* citation map, the review buckets, and this lane's own out-of-lane policy. Used by /review-code, scoped to files attributed to the react-native platform, alongside the shared platform-review skill which owns the review methodology.
---

# React Native Code Review

## Overview

This skill is the **React Native half** of a code review. It owns what a platform-independent
layer could not state: which standards families and IDs may be cited, and how changed files
map to review buckets.

The methodology half — the delegation ladder, the filing gate, citation discipline, evidence
reach, predicate versus claim, mechanism versus magnitude, scope discipline, severity and the
two-pass rule — lives in **`skills/platform-review/SKILL.md`** and is not restated here.
Apply both.

This skill runs only against files the command attributed to the react-native platform. For
a mixed-repo review, iOS/Android/React-web files are handled by their own lane in parallel,
and findings merge into one `templates/code-review-template.md` with `[platform]` tags —
never a separate document per platform.

**React Native is mobile-only in this lane.**

## Triage into standards-relevant buckets

Map each changed file to zero or more buckets, and skip files matching none — keep the
review free of manufactured noise:

- `RN-*` — any component, hook or TypeScript file.
- `ARCH-*` — folder placement, layering, composition, reuse.
- `API-*` — endpoint and service files. The Universal Principles in `rn-api-service-layer.md` always apply; its RTK Query section only when RTK Query is the detected data-fetching layer.
- `STATE-*` — slices and selectors. The Universal Principles in `rn-state-management.md` always apply; its Redux Toolkit section only when Redux Toolkit is the detected state library.
- `NAV-*` — navigator and route files.
- `I18N-*` — files carrying user-facing copy.
- `A11Y-*` — screens and interactive components.

## The two passes over this lane

`code-reviewer` walks each bucketed file against its standards section's checklist,
recording pass / fail / not-applicable per bullet. `performance-reviewer` **independently**
audits the same scope against `standards/react-native/rn-performance.md`'s `RN-PERF-*` rules —
a separate pass, not a sub-step, so a perf-only change is never miscategorised.

## Exclusions

Security defers to `mobile-security-review`'s methodology. Anything outside `RN-PERF-*`'s
scope stays with `code-reviewer` rather than `performance-reviewer`.

## Standards citation

| Area | Standard file | IDs |
|---|---|---|
| TypeScript, components, hooks, naming, props, constants, styling, lint | `standards/react-native/rn-coding-standards.md` | `RN-TS-*`, `RN-FC-*`, `RN-NAME-*`, `RN-PROPS-*`, `RN-CONST-*`, `RN-STYLE-*`, `RN-LINT-*` |
| Layering, structure, dependency direction, reuse | `standards/react-native/rn-architecture.md` | `ARCH-LAYERS-*`, `ARCH-FOLDERS-*`, `ARCH-DEPS-*`, `ARCH-LOGIC-*`, `ARCH-REUSE-*` |
| Data fetching & API layer | `standards/react-native/rn-api-service-layer.md` | `API-ORG-*`, `API-CACHE-*`, `API-BASEQ-*`, `API-ERR-*` |
| Shared & global state | `standards/react-native/rn-state-management.md` | `STATE-SLICE-*`, `STATE-SELECT-*`, `STATE-ENTITY-*`, `STATE-BOUNDARY-*` |
| Navigation & deep links | `standards/react-native/rn-navigation.md` | `NAV-TYPED-*`, `NAV-SERVICE-*`, `NAV-DEEPLINK-*` |
| Performance | `standards/react-native/rn-performance.md` | `RN-PERF-RERENDER-*`, `RN-PERF-LIST-*`, `RN-PERF-JSTHREAD-*`, `RN-PERF-IMAGE-*`, `RN-PERF-BUNDLE-*` |
| Accessibility (shared) | `standards/shared/accessibility.md` | `A11Y-ROLES-*`, `A11Y-TOUCH-*`, `A11Y-FONT-*`, `A11Y-SR-*` |
| Localization & RTL (shared) | `standards/shared/i18n-rtl.md` | `I18N-COPY-*`, `I18N-RTL-*`, `I18N-FMT-*`, `I18N-TEST-*` |

## Out-of-lane observations — React Native's policy

**This lane permits a one-line out-of-lane aside.** A performance or security issue
noticed incidentally gets at most a one-line aside outside the Findings section — never a
filed finding here, since performance belongs to `performance-reviewer` and security to
`mobile-security-reviewer`.

**This policy is React Native's alone.** The iOS, Android and React lanes each forbid any
out-of-lane aside, and each forbids a modernization or preference observation appearing
anywhere in the output. That divergence is deliberate and long-standing — it is recorded
here, in the lane that owns it, rather than in shared methodology. Do not normalise it in
either direction without an explicit decision; `skills/platform-review/SKILL.md` is
deliberately neutral on this policy and delegates it to each lane.

## Relationship with command, agents, skills

- **`commands/review-code.md`** — scope, file attribution, standards loading, lane routing, the readiness gate, and the merge.
- **`skills/platform-review/SKILL.md`** — the platform-independent review methodology. It names every other owner; that table is not repeated here.
- **`agents/code-reviewer.md`** and **`agents/performance-reviewer.md`** — the two executors that run both halves over this platform's files.
- **This skill** — the React Native review content itself, and nothing a platform-independent layer could state.
