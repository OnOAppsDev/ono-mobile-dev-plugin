---
name: react-code-review
description: Methodology for reviewing React web code changes against org standards — not yet authored, currently a structure-only placeholder. Used by /review-code, scoped to files attributed to the React platform, via the react-code-reviewer and react-performance-reviewer agents.
---

## Status: Not yet authored

This skill is a structure-only placeholder, scaffolded as part of the mobile-division plugin migration. It mirrors `skills/rn-code-review/SKILL.md`'s role for React Native — but is a fully separate module, not shared with it.

Until this is authored, React-attributed files in a review will not be checked against grounded `standards/react/*` IDs — those standards are also placeholder-only right now. Author both together before relying on `/review-code` for real React (web) review coverage.

## Intended methodology (once authored)

This skill runs only against files the command has attributed to the React (web) platform — for a mixed-repo review, other platforms' files are handled by their own platform's code-review skill in parallel, merged into one `templates/code-review-template.md` with `[platform]` tags.

1. Triage changed files into `standards/react/*`-relevant buckets; `react-code-reviewer` walks correctness/style/standards-adherence, `react-performance-reviewer` independently audits performance.
2. Merge both agents' findings, tagged `[react]`, into the shared `templates/code-review-template.md`.
3. Exclude security findings — defer to `mobile-security-review`'s methodology, which covers web-specific concerns through the `[web only]` rules in `standards/shared/mobile-security.md` (`SEC-WEB-*` for XSS/CSP/CSRF/redirects/CORS/third-party scripts, `SEC-COOKIE-*` for browser session handling).
