---
name: react-feature-implementation
description: Methodology for implementing a planned task in a React web codebase per org standards — not yet authored, currently a structure-only placeholder. Used by /implement-task via the react-feature-developer agent.
---

## Status: Not yet authored

This skill is a structure-only placeholder, scaffolded as part of the mobile-division plugin migration. It mirrors `skills/rn-feature-implementation/SKILL.md`'s role for React Native — but is a fully separate module, not shared with it.

Until this is authored, React (web) implementation guidance will not cite grounded `standards/react/*` IDs — the `standards/react/*` standards are now authored and ID-frozen (REACT-001); this skill must cite them once it is authored under REACT-002, before `/implement-task` gives grounded React (web) implementation guidance.

## Intended methodology (once authored)

1. Resolve the task from `templates/task-breakdown-template.md`, check dependencies, resolve a design reference for UI-touching tasks (any supported type — Figma is not required specifically; none is needed when the task changes no user-facing UI) — same process shape as `rn-feature-implementation`.
2. Identify applicable `standards/react/*` standards for the surface touched (coding conventions, routing, state management, architecture, performance).
3. Implement, self-check against acceptance criteria, and record applied standard IDs in the output summary.
