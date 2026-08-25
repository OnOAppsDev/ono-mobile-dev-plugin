# Analysis domains — Android planning depth and citations

Per-domain planning requirements for `skills/android-dev-planning`. Work through every
domain that the feature touches; mark the rest `N/A — [reason]`. Silence is not the same
as "not applicable", and an unexplained omission is a defect.

## Contents

- Surfaces and the UI implementation model
- Module and dependency impact
- State and data flow
- Lifecycle, process recreation and concurrency
- Navigation
- Persistence
- Networking
- Testing
- Performance
- Security
- Accessibility
- Localization and RTL
- Logging and analytics

## Surfaces and the UI implementation model

**Owned elsewhere — this section is a pointer, not a copy.** The per-surface UI model, the
five outcomes it can take, and the `AND-UI-*` family that follows from each are defined in
[SKILL.md § Step 3](../SKILL.md#step-3--identify-the-implementation-model-per-surface).
Establish the surface first: it decides which UI family applies, and several domains below
(lists, resources, accessibility, performance) resolve differently depending on it. Nothing
about the UI model is restated here, so the two cannot drift.

## Module and dependency impact

**Inspect broadly; report at module and change-class resolution.** Analysis may — and for a
wide-reaching change should — read every relevant file to understand the true blast radius.
What the design records is the conclusion of that reading, never its transcript. The
reporting resolution rule lives in [output-contracts.md](output-contracts.md).

Confirm all of the following:

- No new **circular dependency** between classes or modules → `AND-ARCH-DEPS-2`.
- No **inverted layer dependency** → `AND-ARCH-DEPS-1`.
- No **new module** and no new dependency edge between existing modules without DD
  approval → `AND-ARCH-MODULE-3`.
- A **new third-party dependency** is an unresolved decision, never a silent addition →
  `AND-REL-DEP-1`, `AND-REL-DEP-2`, `AND-REL-DEP-3`.
- **Build-config changes** follow the repository's existing variant/flavor structure →
  `AND-REL-VARIANT-1`, `AND-REL-VARIANT-3`. `minSdk`, `targetSdk`, and `compileSdk` are
  never changed as a side effect of a feature → `AND-REL-VARIANT-2`.

## State and data flow

Describe each of these in the repository's own idiom:

- **State ownership** — who owns each piece of state, and what the single source of truth
  is → `AND-VM-STATE-1`, `AND-VM-STATE-3`.
- **State shape** — the explicit loading / success / empty / error representation this
  feature needs → `AND-VM-STATE-2`.
- **Immutability** — the state owner emits a new state object rather than mutating one the
  UI already holds, where that is the existing convention → `AND-VM-STATE-4`.
- **Event flow** — how user events reach the state owner, and how one-time effects
  (navigation, toasts, snackbars, dialogs) are delivered exactly once through the
  repository's established pattern → `AND-VM-EVENT-1`.
- **Data flow end to end** — input → state holder → domain/repository → data source → back
  to the surface, naming the actual classes involved.
- **Framework independence** — no Android UI type is held where the repository keeps them
  out → `AND-VM-LIFECYCLE-1`.

Use the repository's vocabulary. **If the repository has no ViewModel layer, do not invent
one** — describe the state holder it actually uses, and cite `AND-VM-*` only for behavior
those rules genuinely govern.

## Lifecycle, process recreation and concurrency

- **Lifecycle** — which lifecycle owns each piece of work, and how the feature behaves
  across configuration change and backgrounding → `AND-VM-LIFECYCLE-1`, `AND-VM-LIFECYCLE-2`.
- **Collection** — UI-state flows are collected lifecycle-aware, not with a raw unscoped
  collector → `AND-VM-LIFECYCLE-3`.
- **Process recreation and state restoration** — what must survive process death, and where
  it is saved. Decide explicitly **per piece of state**: transient UI state, restorable UI
  state, or persisted data. **State this even when the answer is "nothing needs to
  survive"** — silence here is a common defect → `AND-VM-LIFECYCLE-2`.
- **Concurrency** — which work runs off the main thread, on which dispatcher or scheduler,
  following the repository's injection convention → `AND-KT-COROUTINE-1`,
  `AND-KT-COROUTINE-2`, `AND-PERF-THREAD-1`.
- **Cancellation and scoping** — which scope owns each operation, and what cancels it; a
  suspend function that blocks switches dispatcher internally rather than relying on every
  caller → `AND-KT-COROUTINE-3`, `AND-KT-COROUTINE-4`.
- **Background work** — when work must outlive the surface, choose the mechanism the
  repository already uses and justify it against the feature's needs: must it survive
  process death, is it deferrable, is it user-visible, is it time-critical. **Do not
  introduce a new background mechanism when an existing one fits.**

## Navigation

Plan against the repository's detected mechanism — **never a second, parallel one** →
`AND-NAV-DEST-1`. Reuse existing destinations and helpers rather than adding new ones for a
screen that already exists → `AND-NAV-DEST-2`, `AND-NAV-DEST-3`. Define arguments and any
deep-link entry points, validating external input → `AND-NAV-ARGS-1`, `AND-NAV-ARGS-2`,
`AND-NAV-ARGS-3`, `SEC-DEEPLINK-1`, `SEC-DEEPLINK-2`. Specify back-stack behavior and where
the user lands on back and up → `AND-NAV-STACK-1`, and guard navigation against a
re-emitted state or a rapid double tap firing it twice → `AND-NAV-STACK-2`. Navigation is never
triggered from a domain or data layer → `AND-NAV-LAYER-1`.

Back-stack expectations, a fixed start destination, and predictable up/back behavior are
requirements of **any** navigation implementation, including a fully custom one. Plan them
regardless of mechanism.

## Persistence

Choose the repository's existing mechanism for the kind of data involved; do not introduce a
second store for data an existing one already covers → `AND-DATA-STORE-1`,
`AND-DATA-STORE-2`, `AND-DATA-STORE-3`. Plan schema migrations explicitly, and **never clear
user data to avoid one** → `AND-DATA-MIGRATE-1`, `AND-DATA-MIGRATE-2`, `AND-DATA-MIGRATE-3`.
Keep disk work off the main thread → `AND-DATA-THREAD-1`. Define cache invalidation and the
source of truth → `AND-DATA-CACHE-1`. Sensitive data uses the repository's secure storage →
`AND-DATA-SEC-1`, `AND-DATA-SEC-2`, `AND-DATA-SEC-3`, `SEC-STORAGE-1`, `SEC-STORAGE-2`.

## Networking

Use the repository's existing client and its cross-cutting configuration; **no ad-hoc client
per feature** → `AND-NET-CLIENT-1`, `AND-NET-CLIENT-2`, `AND-NET-CLIENT-3`. Follow the DD's
API contracts exactly and **never invent an endpoint, field, or response shape** →
`AND-NET-CONTRACT-1`, `AND-NET-CONTRACT-2`. Keep transport models separate from domain
models per the repository's mapping convention → `AND-NET-DTO-1`, `AND-NET-DTO-2`. Plan auth
handling → `AND-NET-AUTH-1`, `AND-NET-AUTH-2`, `SEC-AUTH-1`. Specify error, timeout, retry,
and offline behavior → `AND-NET-ERR-1`, `AND-NET-ERR-2`, `AND-NET-ERR-3`, `AND-NET-ERR-4`,
`AND-NET-ERR-5`.

**If the feature depends on an unconfirmed backend contract, record it as a blocking
unresolved decision.**

## Testing

Plan what will be tested and at which level, matching the repository's existing setup rather
than introducing a framework → `AND-TEST-UNIT-2`. Cover:

- Business and domain logic, including the failure and edge paths the design defines → `AND-TEST-UNIT-1`.
- Determinism, with time and dispatchers controlled → `AND-TEST-UNIT-3`.
- State-holder behavior and the emitted state sequence → `AND-TEST-VM-1`, `AND-TEST-VM-2`, `AND-TEST-VM-3`.
- Instrumentation or UI tests where the repository uses them → `AND-TEST-INSTR-1`, `AND-TEST-COMPOSE-1`, `AND-TEST-COMPOSE-2`.
- Localization and RTL checks where relevant → `I18N-TEST-1`, `I18N-TEST-2`.

If the repository has **no test infrastructure** for a layer the feature touches, say so
plainly and record it as an unresolved decision. Do not silently plan tests that cannot run,
and do not propose building a test framework as part of an unrelated feature.

## Performance

Identify **this feature's realistic** performance risks rather than reciting generic ones:

- Main-thread work → `AND-PERF-THREAD-1`, `AND-PERF-THREAD-2`, `AND-PERF-THREAD-3`.
- List rendering and item identity → `AND-PERF-LIST-1`, `AND-PERF-LIST-2`, `AND-PERF-LIST-3`.
- Image loading and sizing → `AND-PERF-IMAGE-1`, `AND-PERF-IMAGE-2`, `AND-PERF-IMAGE-3`.
- Leaks and retention → `AND-PERF-MEM-1`, `AND-PERF-MEM-2`, `AND-PERF-MEM-3`, `AND-PERF-MEM-4`.
- Startup, download size, and battery → `AND-PERF-SIZE-1`, `AND-PERF-SIZE-2`, `AND-PERF-SIZE-3`.

**Flag a risk that needs profiling as needing profiling** — never state a guess as a
confirmed finding.

## Security

Secrets and token handling → `SEC-SECRETS-1`, `SEC-SECRETS-2`. Transport security →
`SEC-NET-1`, `SEC-NET-2`. Exported components, intents, and deep links → `SEC-DEEPLINK-1`,
`SEC-DEEPLINK-3`. Permissions requested at the point of need → `SEC-PERMS-1`, `SEC-PERMS-2`.
WebView surfaces, when present → `SEC-WEBVIEW-1`, `SEC-WEBVIEW-2`. Sensitive data is never
logged → `SEC-LOG-1`, `AND-LOG-PII-1`.

## Accessibility

Roles and labels for non-text controls → `A11Y-ROLES-1`, `A11Y-ROLES-2`. Screen-reader
support and focus order → `A11Y-SR-1`, `A11Y-SR-2`. Font scaling → `A11Y-FONT-1`,
`A11Y-FONT-2`. Activation targets → `A11Y-TOUCH-1`, `A11Y-TOUCH-2`.

On a TV surface, `A11Y-TOUCH-1` is satisfied by a reliably focusable element with a clearly
visible focus state rather than by a touch-target size.

## Localization and RTL

No hardcoded user-visible strings → `I18N-COPY-1`, `AND-UI-RES-1`. Formatting of dates,
numbers, and currency → `I18N-FMT-1`, `I18N-FMT-2`. RTL layout and mirroring → `I18N-RTL-1`,
`I18N-RTL-2`, `I18N-RTL-3`, `I18N-RTL-4`.

## Logging and analytics

Reuse the repository's existing conventions, define the events the feature genuinely needs,
and keep debug logging gated → `AND-LOG-HYGIENE-1`, `AND-LOG-HYGIENE-2`,
`AND-LOG-HYGIENE-3`, `AND-LOG-ANALYTICS-1`, `AND-LOG-ANALYTICS-2`, `AND-LOG-ANALYTICS-3`,
`AND-LOG-PII-2`, `AND-LOG-PII-3`.
