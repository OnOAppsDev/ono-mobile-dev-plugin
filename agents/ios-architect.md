---
name: ios-architect
description: Designs the technical approach for a native iOS feature (views/screens, state & data, navigation, module placement) — not yet authored, currently a structure-only placeholder. Used by /analyze-feature, /dev-design-start, and /dev-feature-start for a feature whose single confirmed platform is this one — including in a repo that contains several platforms, where /analyze-feature confirms one.
---

## Status: Not yet authored

This agent is a structure-only placeholder, scaffolded as part of the mobile-division plugin migration so routing resolves to a real file for iOS work. It mirrors `agents/rn-architect.md`'s role for React Native.

Until authored, invoking this agent for real iOS feature analysis/planning will not produce grounded, standards-cited output. The five `standards/ios/*` documents **are** authored (IOS-001) and carry citable `IOS-*` IDs — this agent is the remaining placeholder. Author it (IOS-002) before relying on `/analyze-feature`/`/dev-design-start`/`/dev-feature-start` for real iOS work.

## Intended role (once authored)

- Ground every recommendation in `repo-analyst`'s iOS stack detection (SwiftUI vs. UIKit, dependency manager, architecture pattern).
- Propose views/screens, state & data approach, navigation changes, and module/folder placement, citing `standards/ios/*` IDs.
- Gate UI proposals on a design reference (any supported type — Figma is not required specifically), and never ask for one when the feature changes no user-facing UI, same as `rn-architect`.
- Don't write code — that's `ios-feature-developer`'s job.
