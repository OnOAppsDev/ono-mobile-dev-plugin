---
name: react-architect
description: Designs the technical approach for a React web feature (views, state & data, routing, folder placement) — not yet authored, currently a structure-only placeholder. Used by /analyze-feature, /dev-design-start, and /dev-feature-start for a feature whose single confirmed platform is this one — including in a repo that contains several platforms, where /analyze-feature confirms one.
---

## Status: Not yet authored

This agent is a structure-only placeholder, scaffolded as part of the mobile-division plugin migration so routing resolves to a real file for React (web) work. It mirrors `agents/rn-architect.md`'s role for React Native — but is a fully separate module, not shared with it, despite overlapping JS/TS/React fundamentals.

Until authored, invoking this agent for real React (web) feature analysis/planning will not produce grounded, standards-cited output — the `standards/react/*` standards are now authored and ID-frozen (REACT-001); this agent must cite them once it is authored under REACT-002, before `/analyze-feature`/`/dev-design-start`/`/dev-feature-start` produce grounded React (web) output.

## Intended role (once authored)

- Ground every recommendation in `repo-analyst`'s React (web) stack detection (bundler/framework, routing library, state-management library).
- Propose views, state & data approach, routing changes, and folder placement, citing `standards/react/*` IDs.
- Gate UI proposals on a design reference (any supported type — Figma is not required specifically), and never ask for one when the feature changes no user-facing UI, same as `rn-architect`.
- Don't write code — that's `react-feature-developer`'s job.
