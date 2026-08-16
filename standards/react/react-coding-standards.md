# React Coding Standards

## Purpose & Scope

These standards apply to all React (web) application code reviewed by `react-code-reviewer` via `/review-code` — components, hooks, utilities, and TypeScript types across a browser SPA (Vite/CRA/Next.js/Remix or any other bundler/framework). They cover general code shape and hygiene; architecture, routing, API service layer, state management, performance, i18n/RTL, and accessibility have their own dedicated standards documents. Each rule below carries a stable ID so review findings can cite the exact rule they violate. This list is a baseline, not exhaustive — reviewers use judgment for cases not covered here.

Findings are limited to code **introduced or modified in the reviewed scope**; that similar legacy code already exists is not a defense for a new violation, but pre-existing untouched code is not in scope. This is a deliberately separate module from React Native — the two overlap on JS/TS/React fundamentals but target different runtimes (browser vs. native shell), so they do not share standards or rule IDs.

## React lane conventions (governing)

This document is authored first in the React lane and records the conventions every other React standard, skill, and agent inherits. They are stated here once and are not re-decided elsewhere.

**Source-of-truth hierarchy (repository-first).** When guidance conflicts, resolve in this order:

1. An approved upstream artifact for the feature (feature analysis / DD / task breakdown).
2. Inspected evidence in the repository under review (existing code and its established conventions).
3. Canonical repository knowledge (`.ono/repo-knowledge.json` via `repo-knowledge-consumer`, when present).
4. These Ono React standards.
5. Official React / TypeScript / framework documentation — **supporting only**.

Rank 5 never overrides a valid rank-2 repository convention. Absence of a convention is not compliance: when the repository establishes no convention for a case, say so explicitly rather than treating the gap as a pass.

**Technology neutrality.** These standards assume **no specific stack**. The build tool (Vite, webpack, esbuild, Turbopack, CRA), framework (plain React, Next.js, Remix, or none), language level (JavaScript or TypeScript), styling approach, state library, and test runner are all findings to be established from the repository, in no order of precedence. No rule below prescribes a default stack, and none proposes migrating an existing one. A rule that only applies under a particular technology (e.g. React Server Components) says so, and reads as **N/A** where that technology is absent.

**No modernization asides.** A finding names a concrete violation of a rule or an established repository convention. "More idiomatic", "the newer API", or "the official docs now recommend" is **never**, on its own, a finding or required work — it is at most an optional, approval-gated suggestion kept out of the standards themselves. (This lane follows the stricter no-aside stance; it does not carry RN-style "prefer the newer form" asides.)

**External references.** Every React standard closes with an `## External references` section: a short list of official-documentation links, each with a *when to consult* note and the `REACT-` rule IDs it supports. These are **rank-5, supporting only** — consult them for background and rationale; they never override a repository convention, and a review cites a rule by its `REACT-` ID, never by a link. Links are verified to resolve on the date they are added (and re-checked during the REACT-001-7 freeze) and are **not** fetched at review time — the standard, not the live page, is authoritative, so a rule's meaning cannot drift when an external page changes.

**ID scheme.** Every React rule is prefixed `REACT-` followed by a topic segment and a number (`REACT-TS-1`, `REACT-ARCH-LAYERS-1`, `REACT-ROUTE-URL-1`, `REACT-STATE-SLICE-1`, `REACT-PERF-CWV-1`, `REACT-TV-FOCUS-1`). The `REACT-` prefix is mandatory on every family so React IDs never collide with the React Native (`RN-*` and the bare `ARCH-*`/`API-*`/`STATE-*`/`NAV-*` families it owns), Android (`AND-*`), or iOS (`IOS-*`) modules. **Do not reuse an `RN-*`/`AND-*`/`IOS-*` ID or a bare RN topic family for a React rule.** Shared standards keep their own prefixes (`SEC-*`, `A11Y-*`, `I18N-*`, `REL-*`, `QA-*`) and are cited, not re-authored, by React documents.

> The coding-standards families below (`REACT-TS/FC/NAME/PROPS/LINT`) are frozen by this document. The **full** lane ID skeleton across all six React standards was frozen in REACT-001-7 (2026-08-16) — no rule is renumbered after that point, because REACT-002 agents and skills cite these IDs. All six standards are authored and every intra-lane cross-reference resolves to a defined ID.

## TypeScript Strictness

Applies to TypeScript repositories. In a JavaScript-only repository this section is **N/A** — do not raise its rules as findings; the naming, component, and lint sections still apply.

- `REACT-TS-1` `strict` mode is in effect and not weakened per-file. Confirm it from `compilerOptions.strict` **and** the `extends` chain — a base or shared `tsconfig` may set it, so the presence of a `tsconfig.json` does not by itself prove strictness. A local `// @ts-nocheck` or per-file relaxation of a strict flag is a violation unless justified in a comment.
- `REACT-TS-2` No `any` without an inline comment justifying why a more specific type isn't feasible; prefer `unknown` plus a narrowing check when the type genuinely can't be known upfront. This includes values crossing the DOM/browser boundary (`event.target`, `JSON.parse`, `window` globals) — narrow them rather than widening to `any`.
- `REACT-TS-3` Exported functions, hooks, and components have explicit return types — don't rely on inference across a module boundary. A component's return type is its declared node type (e.g. `React.ReactNode`), stated rather than inferred.
- `REACT-TS-4` No `as` type assertion to force a mismatched shape past the compiler; fix the underlying type or narrow with a type guard. A cast that only serves to silence an error is a violation; a genuinely unavoidable DOM cast (e.g. narrowing an `EventTarget` a guard cannot express) carries a comment stating why.

## Functional Components & Hooks

- `REACT-FC-1` Functional components with hooks only — no class components in new or modified code. The sole exception is where the repository has no library-provided functional equivalent for a capability that still requires a class (a React error boundary is the canonical case); such a class stays minimal and is commented.
- `REACT-FC-2` Reusable stateful logic is extracted into a custom hook rather than duplicated across components.
- `REACT-FC-3` Hooks follow the Rules of Hooks (no conditional or looped hook calls); the `eslint-plugin-react-hooks` rules are not disabled to work around a violation — the code is restructured instead.
- `REACT-FC-4` Side effects live in `useEffect`/`useLayoutEffect` (or an equivalent data hook) with a complete, accurate dependency array — not in the render body. Rendering stays a pure function of props and state.
- `REACT-FC-5` An effect that attaches a DOM event listener, timer, subscription, or observer (`addEventListener`, `setInterval`, `matchMedia`, `ResizeObserver`, `IntersectionObserver`, `MutationObserver`, a store/WebSocket subscription) returns a cleanup that tears it down. A listener or observer added without a matching cleanup is a defect — it leaks and double-binds across re-renders.
- `REACT-FC-6` Data fetched inside an effect is cancellable: abort the in-flight request (`AbortController`, or the repository's data-layer cancellation) on unmount and on a dependency change, so a resolved response cannot set state on an unmounted component or let a stale response overwrite a newer one. (Service-layer cancellation conventions are defined in `react-api-service-layer.md`, `REACT-API-ASYNC-1`.)
- `REACT-FC-7` Effects tolerate React's development-mode double-invocation (setup → cleanup → setup, observable under StrictMode on React 18+; where it does not apply the idempotency requirement still holds): setup is idempotent and always paired with a cleanup that fully reverses it. Correctness must not depend on an effect running exactly once — a "fire once" side effect belongs to an event handler or a guarded ref, not to raw effect-body code.

## Naming & File Conventions

- `REACT-NAME-1` Components are PascalCase and the file name matches the component name (`UserAvatar.tsx` exports `UserAvatar`).
- `REACT-NAME-2` Hooks are camelCase and prefixed `use` (`useUserProfile`), matching the Rules of Hooks lint requirement.
- `REACT-NAME-3` One component per file; helper sub-components that aren't reused elsewhere may be co-located but are not separately exported from the module's public surface.
- `REACT-NAME-4` Non-component utility/helper files are camelCase and named for what they export, not generically (`formatCurrency.ts`, not `utils.ts`, unless the file is a genuine barrel/index).
- `REACT-NAME-5` Styling files follow the repository's established convention consistently and colocated with the component they style — for CSS Modules, `<Component>.module.css`; global/reset CSS is kept separate from module-scoped CSS. Whichever approach the repo uses (CSS Modules, CSS-in-JS, utility classes, plain CSS) is respected; do not introduce a second styling paradigm into a feature that already has one.
- `REACT-NAME-6` **[applies only in a repository using React Server Components, e.g. the Next.js App Router; otherwise N/A]** A `'use client'` / `'use server'` directive is the first statement in the file, and its presence matches the module's actual boundary: a component that uses hooks, event handlers, or browser-only APIs is not left in a server context without `'use client'`, and server-only code (secrets, direct data access) is never shipped into a client module.

## Prop Typing

- `REACT-PROPS-1` Component props are typed via a named `interface` or `type`, not inline object literals or untyped destructuring.
- `REACT-PROPS-2` Default prop values are supplied via default parameters in the function signature rather than the `defaultProps` static.
- `REACT-PROPS-3` Optional props are marked `?` rather than typed as `T | undefined` and then required everywhere they're passed.
- `REACT-PROPS-4` Callback props are typed with explicit parameter and return types (`onSelect: (id: string) => void`), not `Function` or an untyped arrow type.
- `REACT-PROPS-5` A component that wraps a native DOM element derives that element's attribute types from React's built-in helpers (`React.ComponentPropsWithoutRef<'button'>`, `React.InputHTMLAttributes`, …) rather than hand-redeclaring DOM attributes, and forwards the unconsumed rest onto the element so native and accessibility attributes (`type`, `disabled`, `aria-*`, `data-*`) pass through. (Accessibility rules for those attributes live in `standards/shared/accessibility.md`, `A11Y-ROLES-*`.)

## Lint & Format

- `REACT-LINT-1` ESLint and the project's configured formatter both pass with zero warnings before a change is sent for review.
- `REACT-LINT-2` Inline lint-rule disables (`eslint-disable-next-line`) carry a comment explaining why the rule doesn't apply here — a bare disable is not acceptable.
- `REACT-LINT-3` Formatting is applied via the project's configured formatter, not manual spacing — no pure-reformatting diffs mixed into a functional change.

## References

- This document is a living baseline; reviewers flag standards gaps found during review rather than working around them silently.
- Companion React standards (all authored; cross-references frozen in REACT-001-7): `standards/react/react-architecture.md`, `standards/react/react-routing.md`, `standards/react/react-state-management.md`, `standards/react/react-api-service-layer.md`, `standards/react/react-performance.md`.
- Shared standards that sit alongside these general coding rules and are cited (not restated) by React reviews: `standards/shared/accessibility.md` (`A11Y-*`), `standards/shared/i18n-rtl.md` (`I18N-*`), and `standards/shared/mobile-security.md` (web rules `SEC-WEB-*`, `SEC-COOKIE-*`).

## External references

Rank-5 supporting material only (see *External references* under the governing conventions above): consult for background, never as a rule and never fetched at review time; a repository convention (rank 2) always wins. Links verified live 2026-08-13.

- [React — Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks) — supports `REACT-FC-3`. *Consult* to confirm what the Rules of Hooks require before restructuring code rather than disabling the hooks lint rule.
- [React — Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects) — supports `REACT-FC-4`, `REACT-FC-5`, `REACT-FC-7`. *Consult* for the setup/cleanup pairing and the development-mode StrictMode double-invocation behavior when writing or reviewing an effect.
- [React — Using TypeScript](https://react.dev/learn/typescript) — supports `REACT-TS-3`, `REACT-PROPS-1`, `REACT-PROPS-4`, `REACT-PROPS-5`. *Consult* for the built-in element/prop helper types (`ComponentPropsWithoutRef`) and typing hooks and props.
- [React — `'use client'` directive](https://react.dev/reference/rsc/use-client) — supports `REACT-NAME-6`. *Consult* **only** in a React Server Components / App-Router repository, to confirm the client/server module boundary.
- [TypeScript — `tsconfig` `strict`](https://www.typescriptlang.org/tsconfig/#strict) — supports `REACT-TS-1`. *Consult* to see which flags `strict` implies when verifying strictness across a `tsconfig` `extends` chain.
- [MDN — `AbortController`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) — supports `REACT-FC-6`. *Consult* for the cancellation API used to abort an in-flight fetch on unmount or a dependency change.
