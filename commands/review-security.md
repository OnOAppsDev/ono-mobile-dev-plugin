---
description: Review the current changes for mobile/web security risks against the org's shared security standards.
argument-hint: [scope]
---

Review the current changes for security risk.

1. Resolve the review scope: if `$ARGUMENTS` is given, treat it as a path, branch, or PR reference to diff against; otherwise default to the current diff against the repo's base branch.
2. Invoke `repo-analyst` (if not already known this session) to detect the platform(s) touched — this is passed as context to the reviewer in step 4, not used to select a different agent.
3. **Always** load `standards/shared/mobile-security.md` as the authoritative checklist — this is the same file regardless of platform.
4. Apply the `mobile-security-review` skill methodology to the resolved scope, via the single shared `mobile-security-reviewer` agent (there are no per-platform security agents). Pass the detected platform(s) so the agent adds platform-specific concerns and remediation examples only when relevant (e.g. Keychain for iOS, Keystore/EncryptedSharedPreferences for Android, `react-native-keychain` for RN). For React (web) and any embedded web content, the agent must apply the `[web only]` rules in `standards/shared/mobile-security.md` — `SEC-WEB-*` (XSS/CSP/CSRF, redirects, CORS, third-party scripts) and `SEC-COOKIE-*` (browser session handling) — alongside the untagged rules, rather than silently skipping the surface.
5. Have the agent populate `templates/security-review-template.md` in full and output the completed document.

This command is complementary to `/review-code`, not a replacement for it — a full Review-stage pass runs both. Do not duplicate style, correctness, or performance commentary here; those belong to `/review-code`'s reviewers. Findings here are strictly security-related, cited against `standards/shared/mobile-security.md`.
