---
name: react-performance-reviewer
description: Audits React web performance (re-renders, code-splitting, bundle size, Core Web Vitals) — not yet authored, currently a structure-only placeholder. Used by /review-code and /prepare-mobile-release for React-web-only or mixed-platform work.
---

## Status: Not yet authored

This agent is a structure-only placeholder, scaffolded as part of the mobile-division plugin migration so routing resolves to a real file for React (web) work. It mirrors `agents/rn-performance-reviewer.md`'s role for React Native — but is a fully separate module, not shared with it.

Until authored, invoking this agent for real React (web) performance review will not produce standards-grounded findings — the `standards/react/react-performance.md` standard is now authored and ID-frozen (REACT-001); this agent must cite it once it is authored under REACT-002, before `/review-code`/`/prepare-mobile-release` give grounded React (web) performance sign-off.

## Intended role (once authored)

- Audit React-attributed files against `standards/react/react-performance.md`'s rules only (re-renders, code-splitting, bundle size, Core Web Vitals).
- Contribute a "Performance" subsection to `templates/code-review-template.md` (Review stage) or a perf sign-off to `templates/release-checklist-template.md` (Release stage), same two-call-site pattern as `rn-performance-reviewer`.
- Don't comment on correctness, style, or security — those are `react-code-reviewer`'s and the shared `mobile-security-reviewer`'s job.
