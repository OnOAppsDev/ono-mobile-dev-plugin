# QA Handoff Standards

## Purpose & Scope

These standards apply to any QA handoff written via `/create-dev-qa-notes`, regardless of platform — extracted from the `mobile-testing-and-qa-handoff` skill's checklist so findings/handoffs can cite a stable ID instead of restating the criterion as prose each time. Each bullet below carries a stable `QA-*` ID. Platform-specific build/install/testing instructions (how to actually get the build onto a device/browser) are produced per platform by the command, not standardized here.

## Source Material

- `QA-SOURCE-1` The handoff is built from the relevant platform feature-developer agent's report for the feature: what was built, which screens/flows it touches, and which standard IDs were applied — not guessed from the diff alone.

## Test Steps

- `QA-STEPS-1` Test steps are numbered, written for a non-engineer, and name the actual screen/button/label text a tester will see — not component or internal names.

## Edge Cases

- `QA-EDGE-1` Boundary/error conditions that were exercised during implementation (empty states, offline, slow network, permission-denied, validation errors) are called out explicitly — QA is not left to discover them unprompted.

## Known Limitations

- `QA-LIMIT-1` Anything intentionally out of scope for the change is stated plainly with a one-line reason and, if a follow-up task exists, a reference to it. This section is never omitted to make the handoff look more complete than it is.

## i18n / Accessibility Verification

- `QA-A11Y-1` i18n/RTL and accessibility are confirmed as actually checked, not just implemented — cite the specific `I18N-*`/`A11Y-*` standard IDs applied, and whether the required manual walkthroughs (e.g. a bidirectional-layout check, a screen-reader/assistive-tech check) were performed. A generic "looks fine" is not sufficient.

## Completeness

- `QA-COMPLETE-1` `templates/qa-handoff-template.md` is populated in full, including every section even when the answer is "None," so QA receives a complete, unambiguous handoff.

## Output & Discoverability

- `QA-FILE-1` The handoff is **written to disk** at `docs/qa/{FEATURE-NAME}-qa-handoff.md`, under the repository root resolved by `scripts/resolve-target-repo-root.ts` — never into a `.claude/worktrees/…` path, and never left as chat output only. It carries identity frontmatter (`feature`, `platform`, `device_type`, `dd_link`, `task_breakdown_link`, `status`, `generated_by`, `date`) in **delimited** form — the file opens with `---` and `# QA Handoff` follows the closing `---`, never a fenced ` ```yaml ` block, so the fields are machine-readable frontmatter rather than document content. Values are carried verbatim from the feature's Task Breakdown rather than re-detected, and it is written at `status: draft` for a human to flip to `ready-for-qa`. An existing handoff is never blindly overwritten — the developer chooses `Overwrite` / `Update` / `Preserve` / `Version`, as for an existing DD. The handoff carries no `doc_schema_version`: it is not one of the versioned kinds in `docs/planning-doc-contract.md`.

- `QA-LINK-1` After the handoff is written, the feature's Task Breakdown records the written path in a `qa_handoff_link` frontmatter field, so the breakdown remains the canonical index of every artifact produced for the feature and later commands resolve the handoff by link rather than by path convention or filesystem search. Only that one line changes; `feature`, `status`, `author`, and `date` are never rewritten, and the breakdown's `doc_schema_version` is not bumped — `qa_handoff_link` is additive and sits outside the versioned contract. If the link cannot be recorded, that is reported explicitly alongside the path written; it is never silently skipped.

## References

- This document is a living baseline; reviewers should flag standards gaps found during handoff writing rather than working around them silently.
- Extracted from the `mobile-testing-and-qa-handoff` skill's checklist as part of the mobile-division plugin migration.
