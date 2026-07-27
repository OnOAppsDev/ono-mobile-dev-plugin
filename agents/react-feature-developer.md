---
name: react-feature-developer
description: Implements React/TypeScript web code per the org's standards — not yet authored, currently a structure-only placeholder. Used by /implement-task and /fix-review-comments for React-web-only or mixed-platform work.
---

## Status: Not yet authored

This agent is a structure-only placeholder, scaffolded as part of the mobile-division plugin migration so routing resolves to a real file for React (web) work. It mirrors `agents/rn-feature-developer.md`'s role for React Native — but is a fully separate module, not shared with it.

Until authored, invoking this agent for real React (web) implementation will not produce standards-grounded output — `standards/react/*` is also placeholder-only right now. Author both together before relying on `/implement-task`/`/fix-review-comments` for real React (web) work.

## Intended role (once authored)

- Implement against every applicable `standards/react/*` standard for the surface being touched (coding conventions, routing, state management, architecture, performance).
- Gate UI implementation on a design reference (any supported type — Figma is not required specifically), and never ask for one for a task that changes no user-facing UI, same as `rn-feature-developer`.
- Self-check against the task's acceptance criteria; report applied standard IDs.
- Also used by `/fix-review-comments` (applying the fix for React-attributed findings, diagnosed by the shared `mobile-debugging` skill) and by `/create-dev-qa-notes` (summarizing what was built for React-attributed work).
