---
name: react-dev-planning
description: React (web)-specific vocabulary and standard IDs for the technical-approach content of a Detailed Design and its task breakdown — not yet authored, currently a structure-only placeholder. Used by /dev-design-start and /dev-feature-start alongside the shared dev-design-start / dev-feature-start skills, which own the overall mechanics.
---

## Status: Not yet authored

This skill is a structure-only placeholder, scaffolded as part of the mobile-division plugin migration. It mirrors `skills/rn-dev-planning/SKILL.md`'s role for React Native — but is a fully separate module, not shared with it. It supplies only the React (web)-specific vocabulary and standard-ID citations for the Detailed Design's Technical Implementation Approach and the task breakdown, while the shared `dev-design-start` and `dev-feature-start` skills own the overall mechanics.

Until this is authored, React (web)-specific dev plans will not cite grounded `standards/react/*` IDs — those standards are also placeholder-only right now. Author both together before relying on `/dev-design-start` and `/dev-feature-start` for real React (web) planning.

## Intended methodology (once authored)

1. Use `react-architect`'s technical approach and `repo-analyst`'s detected React (web) conventions as the basis for the approach.
2. Cite the relevant `standards/react/*` standard IDs the approach follows.
3. Write the approach in web vocabulary (views, state & data, routing, folder placement) — the flat Technical Approach section. This skill only runs when `react` is the feature's single confirmed platform, so the section is always flat, never a per-platform subsection.
