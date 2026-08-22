# React Native Coding Standards

## Purpose & Scope

These standards apply to all React Native application code reviewed by `rn-code-reviewer` via `/review-code` — components, hooks, utilities, and TypeScript types across the app. They cover general code shape and hygiene; API service layer, state management, i18n/RTL, and accessibility have their own dedicated standards documents. Each bullet below carries a stable ID so review findings can cite the exact rule they violate. This list is a baseline, not exhaustive — reviewers should use judgment for cases not covered here.

## TypeScript Strictness

- `RN-TS-1` [CRITICAL] `strict` mode is enabled in `tsconfig.json` and not locally weakened per-file.
- `RN-TS-2` [CRITICAL] No `any` without an inline comment justifying why a more specific type isn't feasible, using the deterministic format `// typed-any: [TICKET-ID] <reason>` directly above or beside the `any` usage (e.g. `// typed-any: [RN-482] third-party SDK ships no types`); prefer `unknown` plus a narrowing check. A justification in any other comment format (a bare `// any because...`, a TODO, a commit-message explanation, or `// typed-any:` missing the `[TICKET-ID]` segment) does not satisfy this rule.
- `RN-TS-3` [CRITICAL] Exported functions and hooks have explicit return types.
- `RN-TS-4` [CRITICAL] No `as` type assertions to force a mismatched shape past the compiler; fix the underlying type, or narrow with a type guard.

## Functional Components & Hooks

- `RN-FC-1` [WARNING] No class components in new or modified code — functional components with hooks only.
- `RN-FC-2` [WARNING] Reusable stateful logic is extracted into a custom hook rather than duplicated across components.
- `RN-FC-3` [WARNING] Hooks follow the Rules of Hooks (no conditional/looped hook calls); `eslint-plugin-react-hooks` rules are not disabled to work around a violation.
- `RN-FC-4` [WARNING] Side effects live in `useEffect`/`useLayoutEffect` (or an equivalent data-fetching hook) with a complete, accurate dependency array — not in the render body.

## Naming & File Conventions

- `RN-NAME-1` [INFO] Components are PascalCase and the file name matches the component name (`UserAvatar.tsx` exports `UserAvatar`).
- `RN-NAME-2` [INFO] Hooks are camelCase and prefixed `use` (`useUserProfile`).
- `RN-NAME-3` [INFO] One component per file; helper sub-components that aren't reused elsewhere may be co-located but are not separately exported from the module's public surface.
- `RN-NAME-4` [INFO] Non-component utility/helper files are camelCase and named for what they export, not generically (`formatCurrency.ts`, not `utils.ts`, unless the file is a genuine barrel/index).
- `RN-NAME-5` [INFO] Cross-module imports use the project's configured path aliases (e.g. `@features/`, `@components/`, `@services/`) rather than relative paths that traverse up more than one directory level. A same-folder or one-level-up relative import (`./sibling`, `../localHelper`) is acceptable; an import path containing `../../` or deeper must be rewritten as an alias import instead.
- `RN-NAME-6` [INFO] A platform divergence substantial enough to change layout, behavior, or native dependencies is expressed as a platform-specific file (`Component.ios.tsx`/`Component.android.tsx`), letting the bundler pick the right one; a small, localized difference is handled inline with `Platform.OS`/`Platform.select` instead of forking the whole file. Neither mechanism is inherently correct — a file forked into `.ios.tsx`/`.android.tsx` over a one-line style difference is a finding just as much as a component whose body is threaded with `Platform.OS` branches when a per-platform file would read more cleanly.

## Prop Typing

- `RN-PROPS-1` [WARNING] Component props are typed via a named `interface` or `type`, not inline object literals or untyped destructuring.
- `RN-PROPS-2` [WARNING] Default prop values are supplied via default parameters in the function signature, not the legacy `defaultProps` static.
- `RN-PROPS-3` [WARNING] Optional props are marked `?` rather than typed as `T | undefined` and required everywhere they're passed.
- `RN-PROPS-4` [WARNING] Callback props are typed with explicit parameter and return types (`onSelect: (id: string) => void`), not `Function` or untyped arrow types.

## Constants

- `RN-CONST-1` [INFO] A value used more than once, or referenced across files, is extracted into a named constant, not repeated as an inline literal.
- `RN-CONST-2` [INFO] Constants are declared in a file scoped to what they configure (a feature's own constants module for feature-specific values, a shared `constants/` module for cross-feature values) — not scattered inline or redeclared per file.
- `RN-CONST-3` [INFO] Constant names use `SCREAMING_SNAKE_CASE` for primitive values and `PascalCase` for enum-like object maps, consistent across the codebase.
- `RN-CONST-4` [WARNING] No magic numbers: a numeric literal with domain meaning (timeouts, durations, retry counts, pagination sizes, dimensions, z-indices, thresholds) is extracted into a named constant rather than inlined at the call site. `0`, `1`, `-1`, and array/index bookkeeping in idiomatic use (loop counters, `.length - 1`) are exempt, as are values already covered by a design-token module under `RN-STYLE-3`.

## Security

- `RN-SEC-1` [CRITICAL] No API keys, tokens, or other secrets are hardcoded as string literals in `.tsx`/`.ts` source — they are read from env files (`.env` via the project's env-loading mechanism) or from files the repo's `.gitignore` excludes from source control. Ties to `SEC-SECRETS-1`/`SEC-SECRETS-3` in `standards/shared/mobile-security.md`; a value baked into the shipped bundle at build time is still public per `SEC-SECRETS-2` regardless of which file it started in.

## Styling

- `RN-STYLE-1` [WARNING] The app uses one styling method consistently (e.g. `StyleSheet.create`, a single styling library) — no mixing of approaches across the codebase.
- `RN-STYLE-2` [WARNING] Styles are defined via `StyleSheet.create` (or the detected styling library's equivalent) outside the render function, not as inline style objects/arrays recreated on every render.
- `RN-STYLE-3` [INFO] Shared design tokens (colors, spacing, typography) are sourced from a single theme/tokens module, not hardcoded per component.
- `RN-STYLE-4` [INFO] Component-specific styles are colocated with the component; only genuinely shared styles live in a common style/theme module.

## Lint & Format

- `RN-LINT-1` [INFO] ESLint and Prettier both pass with zero warnings before a change is sent for review.
- `RN-LINT-2` [INFO] Inline lint-rule disables (`eslint-disable-next-line`) carry a comment explaining why the rule doesn't apply here.
- `RN-LINT-3` [INFO] Formatting is applied via the project's configured formatter, not manual spacing — no diffs that are pure reformatting mixed into a functional change.

## Testing

- `RN-TEST-1` [WARNING] Every screen and non-trivial feature component has an accompanying `.test.tsx` file using `@testing-library/react-native`; tests query by accessibility role/label (`getByRole`, `getByLabelText`) rather than `testID` or raw text nodes.
- `RN-TEST-2` [WARNING] Custom business-logic hooks (`use*`) are tested in isolation with `renderHook` from `@testing-library/react-native`, not only indirectly through a component test.
- `RN-TEST-3` [WARNING] Every API module/service layer has unit test coverage for its normalized error shapes (`API-ERR-*` in `standards/react-native/rn-api-service-layer.md`) — network failures and server error responses are each asserted to normalize correctly, not just the happy path.
- `RN-TEST-4` [WARNING] Global state reducers and selectors (`STATE-*` in `standards/react-native/rn-state-management.md`) have isolated unit test coverage — state transitions and derived/selector output are tested directly, not only indirectly through a component test.

## References

- This document is a living baseline; reviewers should flag standards gaps found during review rather than working around them silently.
- See `standards/react-native/rn-api-service-layer.md`, `standards/react-native/rn-state-management.md`, `standards/shared/i18n-rtl.md`, and `standards/shared/accessibility.md` for domain-specific rules that sit alongside these general coding standards.

## AI Agent Execution Directives

This section is the single normative reference for how any agent (`rn-code-reviewer`, `rn-performance-reviewer`, `rn-architect`, `rn-feature-developer`, or a generic review/implementation agent) consumes every stable ID across all `standards/react-native/*.md` documents. It governs severity handling, citation format, and anti-hallucination behavior uniformly — an agent does not need a per-document version of this section.

- **Severity hierarchy is exact and non-negotiable:**
  - `[CRITICAL]` — blocks the build/PR. `/review-code` and any equivalent gate must report a failing/"changes requested" outcome when a `[CRITICAL]` finding is present, and the finding must be resolved (not suppressed) before merge.
  - `[WARNING]` — always surfaced as a review comment on the diff. It does not block merge by itself, but it must appear in the review output; it must never be silently dropped or downgraded to `[INFO]`.
  - `[INFO]` — non-blocking guidance. Surfaced in review output but never phrased as a blocking requirement and never used to fail a gate.
  - An agent must not invent a fourth severity, relabel a rule's documented severity, or omit the severity tag when citing a rule.
- **Citation format is fixed:** every finding cites the exact stable ID in backticks immediately followed by its bracketed severity, in the form `` `RULE-ID` [SEVERITY]: <finding text>`` — for example `` `RN-TS-2` [CRITICAL]: `any` used at line 42 with no `// typed-any:` comment``. A concern that does not map to an existing stable ID is a suggestion, not a standards violation, and must be presented as free-text guidance rather than formatted as a rule citation.
- **Anti-hallucination thresholds:**
  - Never cite a rule ID that does not appear verbatim in one of these documents. If unsure whether an ID exists, treat it as not existing rather than guessing a plausible-looking one.
  - Every numeric threshold stated in a rule (branch counts, item counts, folder depth, millisecond budgets, component counts) is a hard boundary, not a stylistic nudge. A finding that invokes a quantified rule must state the observed value against the threshold — e.g. "7 conditional branches observed in `handleSubmit`, exceeding the 3-branch limit in `ARCH-LOGIC-1`" — not merely assert that the rule was broken.
  - If the evidence needed to confirm a threshold crossing (e.g. actual render count, actual blocking duration) is not visible in the diff or context provided, the agent must report the concern at `[INFO]` severity as "needs verification/profiling," not assert a `[CRITICAL]` or `[WARNING]` violation from an unconfirmed guess.
