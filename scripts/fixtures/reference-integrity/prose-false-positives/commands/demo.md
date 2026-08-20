---
description: A command whose prose contains slash-separated phrases that look like paths.
argument-hint: [scope]
---

Review the changes.

1. `repo-analyst` is invoked by other `agents/skills` rather than a dedicated command, and downstream `skills/agents` build on its findings.
2. Findings are strictly `correctness/style/standards/performance`, never security.
3. A feature folder holds screens, components, business logic (`hooks/slices`), and endpoints.
4. Reuse the neutral stack inventory from `docs/project/patterns.md` and the component inventory from `docs/project/components.md`; integrations live in `docs/project/integrations.md`.
5. Write handoff notes to `docs/qa/` and lifecycle state under `docs/tasks/`.
6. Link the generated artifact (e.g. `docs/biometric-login-DD.md`), never a plugin template.
7. Anchors in a target repository's own docs, such as `docs/patterns.md#anchor`, survive intact.
8. Hook directories in the reviewed app — `hooks/checkout/` and `hooks/profile/` — are application code.
9. The producer's own `scripts/inspection-state.ts` runs a recorded migration trail.
