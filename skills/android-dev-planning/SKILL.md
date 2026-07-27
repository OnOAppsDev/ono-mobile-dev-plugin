---
name: android-dev-planning
description: Android-specific vocabulary and standard IDs for the technical-approach content of a Detailed Design and its task breakdown — not yet authored, currently a structure-only placeholder. Used by /dev-design-start and /dev-feature-start alongside the shared dev-design-start / dev-feature-start skills, which own the overall mechanics.
---

## Status: Not yet authored

This skill is a structure-only placeholder, scaffolded as part of the mobile-division plugin migration. It mirrors `skills/rn-dev-planning/SKILL.md`'s role for React Native: supplying only the Android-specific vocabulary and standard-ID citations for the Detailed Design's Technical Implementation Approach and the task breakdown, while the shared `dev-design-start` and `dev-feature-start` skills own the overall mechanics (DD structure and gap discipline; task decomposition, dependencies, rollback plan, draft-until-approved gates).

Until this is authored, Android-specific dev plans will not cite grounded `standards/android/*` IDs — those standards are also placeholder-only right now. Author both together before relying on `/dev-design-start` and `/dev-feature-start` for real Android planning.

## Intended methodology (once authored)

1. Use `android-architect`'s technical approach and `repo-analyst`'s detected Android conventions as the basis for the approach.
2. Cite the relevant `standards/android/*` standard IDs the approach follows.
3. Write the approach in Android vocabulary (screens, state & data, navigation, module/folder placement) — the flat Technical Approach section. This skill only runs when `android` is the feature's single confirmed platform, so the section is always flat, never a per-platform subsection.
