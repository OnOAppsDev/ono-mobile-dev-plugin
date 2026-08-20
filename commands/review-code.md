---
description: Review the current changes against the org's shared and platform-specific mobile/web standards.
argument-hint: [scope]
---

Review the current changes for correctness, style, standards-adherence, and performance.

1. Resolve the review scope: if `$ARGUMENTS` is given, treat it as a path, branch, or PR reference to diff against; otherwise default to the current diff against the repo's base branch.
2. Invoke `repo-analyst` to establish the base repo classification (including the RN-native-shell linkage check) if not already known this session, then attribute each changed file to a platform using the file-attribution rule (iOS: under an iOS project tree or `.swift`/`.m`/`.mm`/`.h`; Android: under `android/` or `.kt`/`.java`; React: in a React-web workspace; otherwise react-native). Do not reimplement platform classification from scratch in this command.
3. **Always** load the shared standards: `standards/shared/accessibility.md` and `standards/shared/i18n-rtl.md`.
4. Load platform-specific standards only for platforms actually touched: `standards/react-native/*` (rn-coding-standards.md, rn-api-service-layer.md, rn-state-management.md, rn-architecture.md, rn-navigation.md, rn-performance.md), `standards/ios/*`, `standards/android/*`, `standards/react/*` — do not mix in a platform's standards for files it doesn't own.
5. For each touched platform, apply that platform's code-review skill (`rn-code-review` / `ios-code-review` / `android-code-review` / `react-code-review`) via its code-reviewer agent (correctness/style/standards) and performance-reviewer agent (platform-specific performance concerns). Run each touched platform's pair independently — there is no shared code-review skill; the "shared" component is the two standards docs loaded in step 3.
6. Merge all agents' output into a single `templates/code-review-template.md`, keeping **severity as the primary organizing axis** even for a mixed-platform diff — tag each finding inline with `[platform]` rather than sectioning the whole document by platform. Note the platform(s) reviewed in Scope.

This command is complementary to `/review-security`, not a replacement for it — a full Review-stage pass runs both. Do not duplicate security commentary here; that belongs to `/review-security`'s reviewer. Findings here are strictly correctness/style/standards/performance, cited against the standards loaded above.
