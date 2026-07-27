---
description: Write QA handoff notes for a completed feature.
argument-hint: [feature-name]
---

Write QA handoff notes for the completed feature named in `$ARGUMENTS`.

1. Resolve `$ARGUMENTS` as the feature name; gather what was implemented for it (task breakdown, implementation summary, standard IDs applied) from the Implement stage's output. The task breakdown carries exactly one confirmed platform, so gather from that platform's feature-developer agent (`rn-feature-developer` / `ios-feature-developer` / `android-feature-developer` / `react-feature-developer`) — the one matching the breakdown's `platform`.
2. Apply the shared `mobile-testing-and-qa-handoff` skill methodology via those feature-developer agent(s).
3. Have the agent(s) populate `templates/qa-handoff-template.md` in full — including the i18n/RTL and accessibility check sections (citing the actual `I18N-*`/`A11Y-*` standard IDs applied during implementation, per `standards/shared/qa-handoff.md`'s `QA-A11Y-1`) and the platform-specific Build / Install / Testing Instructions section, one subsection per platform the feature touches.
4. Output the completed QA handoff document.

If no record of what was implemented for this feature can be found, say so explicitly rather than guessing at test steps.
