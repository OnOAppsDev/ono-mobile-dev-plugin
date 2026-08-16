# React Performance Standards

## Purpose & Scope

These standards apply to React (web) application code audited by the `react-performance-reviewer` agent via `/review-code` (diff-scoped) and `/prepare-mobile-release` (release-scoped). Each rule carries a stable `REACT-PERF-*` ID so findings cite a stable rule rather than restating the concern each time. This is a baseline, not exhaustive.

This document inherits the **React lane conventions** in `standards/react/react-coding-standards.md` — the repository-first source-of-truth hierarchy, technology/bundler-neutrality (Vite, webpack, esbuild, Turbopack, CRA are all possible findings; no default, no build-tool migration proposed), the no-modernization-aside stance, the `REACT-` ID prefix, and the `## External references` pattern. Findings are limited to code introduced or modified in the reviewed scope.

**Measurement discipline.** A magnitude or regression claim is written as a **measurement request** — the metric, the scenario, and the threshold to check — never asserted as a fact from reading code. A concern that needs profiling to confirm is flagged as *to-be-profiled*, not filed as a Blocking finding on a guess. Items observable only in a production build (minification, tree-shaking, bundle size) are marked as such and verified against a production build, not a dev server.

**Lane ownership.** Every `REACT-PERF-*` rule belongs to the `react-performance-reviewer`, even when a performance concern is cited from another document; correctness/security concerns are not filed here (see the lane separation in `react-coding-standards.md`).

## Re-renders

- `REACT-PERF-RERENDER-1` Expensive components are memoized (`React.memo`, `useMemo`, `useCallback`) where profiling or clear inspection shows unnecessary re-render cost — not applied reflexively everywhere.
- `REACT-PERF-RERENDER-2` Inline callbacks/objects passed as props to expensive children are stabilized (`useCallback`, hoisted constants) rather than recreated every render.

## List Virtualization

- `REACT-PERF-LIST-1` Large or unbounded lists are virtualized (`react-window`, TanStack Virtual, or the framework's own virtualization) rather than mapping every row into the DOM, and each row carries a stable key. For long runs of static content where full virtualization is overkill, CSS `content-visibility: auto` (with `contain-intrinsic-size`) is an acceptable lighter alternative.

## Main-Thread Work

- `REACT-PERF-MAINTHREAD-1` Heavy synchronous work (large loops, parsing a big JSON payload, synchronous crypto) is chunked, debounced, or moved to a Web Worker so it does not create long tasks that block input. The relevant user-facing signals are INP (interaction latency) and Total Blocking Time.

## Images & Media

- `REACT-PERF-IMAGE-1` Images are sized for their display context and served responsively (`srcset`/`sizes`, an efficient format such as WebP/AVIF, `loading="lazy"` for below-the-fold images) — a thumbnail does not download a full-resolution asset.
- `REACT-PERF-IMAGE-2` Images, embeds, and async-inserted content reserve their layout space ahead of load (explicit `width`/`height` or `aspect-ratio`, or a sized placeholder) so arriving content does not shift the page (contributes to CLS, see `REACT-PERF-CWV-1`).

## Bundle Size & Code-Splitting

- `REACT-PERF-BUNDLE-1` Large or duplicate dependencies are not added without justification; a dependency addition that meaningfully grows bundle size is called out explicitly rather than passing silently. (Bundle size is observable only on a production build.)
- `REACT-PERF-BUNDLE-2` The app is code-split so the initial download is not the whole application — route-level lazy loading (`React.lazy` + `Suspense`, dynamic `import()`, or the framework's route splitting), with heavy non-critical features loaded on demand.
- `REACT-PERF-BUNDLE-3` The build's tree-shaking is preserved: import only what is used (e.g. per-function imports rather than a whole utility library), and avoid side-effectful barrel imports that defeat dead-code elimination. (Tree-shaking is observable only on a production build.)

## Hydration & SSR Cost

**[Applies where the app renders on the server — SSR/RSC. For a purely client-rendered SPA this section is N/A; do not raise its rules as findings.]**

- `REACT-PERF-HYDRATION-1` Client JavaScript shipped for hydration is minimized: interactive (`'use client'`) boundaries are kept small (see `REACT-ARCH-BOUNDARY-2`) so a whole page is not hydrated when only a leaf is interactive, and static content is not shipped as hydrated client components.

## Third-Party Scripts

- `REACT-PERF-THIRDPARTY-1` Third-party scripts (analytics, tag managers, embeds, widgets) are loaded so they do not block first render or interaction (`async`/`defer`, on idle, or lazily), and their weight is accounted for in the performance budget. They are version-pinned and carry subresource integrity per shared `SEC-WEB-4` (a third-party script runs with full page privileges).

## Core Web Vitals

- `REACT-PERF-CWV-1` LCP (loading), CLS (visual stability), and INP (interactivity) are the explicit performance targets for user-facing routes; a change to a user-facing route is evaluated against them, and any regression claim follows the measurement discipline above (metric + scenario + threshold, measured on a production build).

## References

- This document is a living baseline; reviewers flag performance gaps found during review rather than working around them silently.
- Production-hardening items (minification/obfuscation, disabled debug channels) are owned by shared `SEC-HARDEN-2`/`SEC-HARDEN-3`; this document references them where a performance action (minification, stripping dev-only code) coincides with a hardening requirement.
- Companion React standards: `standards/react/react-coding-standards.md` (authored — governing conventions), `standards/react/react-architecture.md` (authored — `REACT-ARCH-BOUNDARY-2`), and `standards/react/react-routing.md` (authored — route-level prefetch, `REACT-ROUTE-UX-4`).
- Shared standards cited (not restated) here: `standards/shared/mobile-security.md` (`SEC-WEB-4`, `SEC-HARDEN-2`, `SEC-HARDEN-3`).

## External references

Rank-5 supporting material only (see *External references* under the governing conventions in `react-coding-standards.md`): consult for background, never as a rule and never fetched at review time; a repository convention (rank 2) always wins. Links verified live 2026-08-16.

- [web.dev — Web Vitals](https://web.dev/articles/vitals) — supports `REACT-PERF-CWV-1`, `REACT-PERF-MAINTHREAD-1`, `REACT-PERF-IMAGE-2`. *Consult* for what LCP/CLS/INP measure and their target thresholds.
- [React — `lazy`](https://react.dev/reference/react/lazy) — supports `REACT-PERF-BUNDLE-2`. *Consult* for code-splitting a component behind `Suspense`.
- [MDN — `content-visibility`](https://developer.mozilla.org/en-US/docs/Web/CSS/content-visibility) — supports `REACT-PERF-LIST-1`. *Consult* for skipping render work on offscreen content as a lighter alternative to full virtualization.
