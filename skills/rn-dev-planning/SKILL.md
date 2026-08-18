---
name: rn-dev-planning
description: React Native-specific vocabulary and standard IDs for the technical-approach content of a Detailed Design and its task breakdown. Used by /dev-design-start and /dev-feature-start alongside the shared dev-design-start / dev-feature-start skills, which own the overall mechanics.
---

## Methodology

The shared `dev-design-start` and `dev-feature-start` skills own the overall mechanics (DD structure and gap discipline; task decomposition, dependencies, rollback plan, draft-until-approved gates). This skill supplies only the React Native-specific content for the Detailed Design's Technical Implementation Approach and the task breakdown:

1. **Use `rn-architect`'s technical approach and `repo-analyst`'s detected conventions** (nav library, state mgmt, folder structure) as the basis for the approach — don't re-derive them from scratch.

2. **Cite the relevant standard IDs** (`ARCH-*` from `standards/react-native/rn-architecture.md`, `API-*` from `standards/react-native/rn-api-service-layer.md`, `STATE-*` from `standards/react-native/rn-state-management.md`, `NAV-*` from `standards/react-native/rn-navigation.md`) the approach follows.

3. **Write the approach in RN vocabulary** (screens, state/data slices or equivalents, navigation routes/params, feature-folder placement) — this becomes the flat Technical Implementation Approach section. This skill only runs when `react-native` is the feature's single confirmed platform, so the section is always flat, never a per-platform subsection.
