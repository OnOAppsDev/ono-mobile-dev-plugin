---
name: mobile-testing-and-qa-handoff
description: Shared methodology for writing QA handoff notes for a completed feature, across any platform, with platform-specific build/install/testing instructions. Used by /create-dev-qa-notes via the relevant platform feature-developer agent(s) and the qa-handoff template.
---

## Methodology

1. **Gather the source material.** Pull the feature summary from the relevant platform feature-developer agent's report for `[feature-name]`: what was built, which screens/flows it touches, and which standard IDs were applied. The feature's task breakdown carries exactly one confirmed platform, so gather from that platform's feature-developer agent (`rn-feature-developer`/`ios-feature-developer`/`android-feature-developer`/`react-feature-developer`).

2. **Write test steps for a non-engineer**, per `QA-STEPS-1` in `standards/shared/qa-handoff.md`. Convert the implementation into numbered, step-by-step instructions someone with no codebase context can follow exactly — name the actual screen/button/label text, not component names.

3. **Call out edge cases explicitly**, per `QA-EDGE-1`. List boundary/error conditions that were exercised (empty states, offline, slow network, permission-denied, validation errors) — don't assume QA will think to try them.

4. **State known limitations plainly**, per `QA-LIMIT-1`. Anything intentionally out of scope for this change gets a one-line reason and, if there's a follow-up task, a reference to it. Never omit this section to make the handoff look more complete than it is.

5. **Confirm i18n/RTL and accessibility were actually checked**, not just implemented, per `QA-A11Y-1`. Cite the specific `I18N-*`/`A11Y-*` standard IDs the feature-developer applied, and whether the required manual walkthroughs were performed — a generic "looks fine" checkbox is not sufficient.

6. **Add platform-specific build/install/testing instructions**, one subsection per platform the feature touches: RN — Metro/Expo Go, simulator/device run, or an internal build link; iOS — Xcode run, TestFlight; Android — Android Studio run, internal APK/Play Console track; React (web) — local dev server, preview/staging URL.

7. **Populate `templates/qa-handoff-template.md` in full**, per `QA-COMPLETE-1` — including every section even when the answer is "None" (e.g. Known Limitations), so QA has a complete, unambiguous handoff.

8. **Fill the frontmatter from the Task Breakdown, not from inspection.** `feature`, `platform`, `device_type`, and `dd_link` are carried verbatim from the breakdown the calling command resolved; `task_breakdown_link` points at that breakdown. `status` is always written as `draft` — a human flips it to `ready-for-qa` after reviewing the notes, and until they do, the handoff is not dev-signed-off. `generated_by` is `create-dev-qa-notes`. No `doc_schema_version`: the handoff is not one of the versioned kinds in `docs/planning-doc-contract.md`. Write the block as **delimited frontmatter** — the file opens with `---` and `# QA Handoff` follows the closing `---`, never a fenced ` ```yaml ` block, because these fields exist to be read by tooling and a fence is document content.

9. **Write it to `docs/qa/{FEATURE-NAME}-qa-handoff.md`** under the resolved repository root, per `QA-FILE-1`, creating `docs/qa/` if needed. A handoff that exists only in a chat transcript cannot be reviewed, linked, or diffed. **Never blindly overwrite an existing handoff** — offer `Overwrite` / `Update` / `Preserve` (new filename) / `Version` (rename the existing file first), the same choice `dev-design-start` offers for an existing DD, since the previous handoff may already be in QA's hands.

10. **Record the written path in the Task Breakdown's `qa_handoff_link`**, per `QA-LINK-1`, so the breakdown stays the canonical index of every artifact produced for the feature and later commands follow a link instead of searching the filesystem. Touch that one frontmatter line and nothing else; never rewrite `feature`, `status`, `author`, or `date`. If the breakdown cannot be written, report that the link was not recorded and name the path the handoff was written to — the handoff itself stays on disk.

## Output

The deliverable is a file, not a message: `docs/qa/{FEATURE-NAME}-qa-handoff.md` at `status: draft`, plus a `qa_handoff_link` in the Task Breakdown pointing at it. Report the path written, the existing-file strategy applied, and whether the link was recorded.
