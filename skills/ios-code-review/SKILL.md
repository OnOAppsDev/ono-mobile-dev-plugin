---
name: ios-code-review
description: Methodology for reviewing native iOS code changes against org standards — not yet authored, currently a structure-only placeholder. Used by /review-code, scoped to files attributed to the iOS platform, via the ios-code-reviewer and ios-performance-reviewer agents.
---

## Status: Not yet authored

This skill is a structure-only placeholder, scaffolded as part of the mobile-division plugin migration. It mirrors `skills/rn-code-review/SKILL.md`'s role for React Native.

Until this is authored, iOS-attributed files in a review will not be checked against grounded `standards/ios/*` IDs. Those standards **are** authored (IOS-001) and the IDs exist — this skill is the remaining placeholder. Author it (IOS-004) before relying on `/review-code` for real iOS review coverage.

## Intended methodology (once authored)

This skill runs only against files the command has attributed to the iOS platform — for a mixed-repo review, other platforms' files are handled by their own platform's code-review skill in parallel, merged into one `templates/code-review-template.md` with `[platform]` tags.

1. Triage changed files into `standards/ios/*`-relevant buckets; `ios-code-reviewer` walks correctness/style/standards-adherence, `ios-performance-reviewer` independently audits performance.
2. Merge both agents' findings, tagged `[ios]`, into the shared `templates/code-review-template.md`.
3. Exclude security findings — defer to `mobile-security-review`'s methodology.
