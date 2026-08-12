---
name: ios-feature-developer
description: Implements Swift/SwiftUI/UIKit code per the org's standards — not yet authored, currently a structure-only placeholder. Used by /implement-task and /fix-review-comments for iOS-only or mixed-platform work.
---

## Status: Not yet authored

This agent is a structure-only placeholder, scaffolded as part of the mobile-division plugin migration so routing resolves to a real file for iOS work. It mirrors `agents/rn-feature-developer.md`'s role for React Native.

Until authored, invoking this agent for real iOS implementation will not produce standards-grounded output. The five `standards/ios/*` documents **are** authored (IOS-001) and carry citable `IOS-*` IDs — this agent is the remaining placeholder. Author it (IOS-003) before relying on `/implement-task`/`/fix-review-comments` for real iOS work.

## Intended role (once authored)

- Implement against every applicable `standards/ios/*` standard for the surface being touched (Swift language rules, SwiftUI/UIKit conventions, architecture, performance).
- Gate UI implementation on a design reference (any supported type — Figma is not required specifically), and never ask for one for a task that changes no user-facing UI, same as `rn-feature-developer`.
- Self-check against the task's acceptance criteria; report applied standard IDs.
- Also used by `/fix-review-comments` (applying the fix for iOS-attributed findings, diagnosed by the shared `mobile-debugging` skill) and by `/create-dev-qa-notes` (summarizing what was built for iOS-attributed work).
