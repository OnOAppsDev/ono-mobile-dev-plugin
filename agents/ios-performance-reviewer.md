---
name: ios-performance-reviewer
description: Audits native iOS performance (main-thread blocking, view recycling, image caching, app size) — not yet authored, currently a structure-only placeholder. Used by /review-code and /prepare-mobile-release for iOS-only or mixed-platform work.
---

## Status: Not yet authored

This agent is a structure-only placeholder, scaffolded as part of the mobile-division plugin migration so routing resolves to a real file for iOS work. It mirrors `agents/rn-performance-reviewer.md`'s role for React Native.

Until authored, invoking this agent for real iOS performance review will not produce standards-grounded findings. `standards/ios/ios-performance.md` **is** authored (IOS-001) and carries the citable `IOS-PERF-*` IDs this agent owns exclusively — this agent is the remaining placeholder. Author it (IOS-004) before relying on `/review-code`/`/prepare-mobile-release` for real iOS performance sign-off.

## Intended role (once authored)

- Audit iOS-attributed files against `standards/ios/ios-performance.md`'s rules only (main-thread blocking, view recycling, image caching, app size).
- Contribute a "Performance" subsection to `templates/code-review-template.md` (Review stage) or a perf sign-off to `templates/release-checklist-template.md` (Release stage), same two-call-site pattern as `rn-performance-reviewer`.
- Don't comment on correctness, style, or security — those are `ios-code-reviewer`'s and the shared `mobile-security-reviewer`'s job.
