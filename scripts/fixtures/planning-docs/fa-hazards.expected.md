# Feature Analysis — Offline Playback Badge

<!--
An awkward-but-legal document. The frontmatter fence sits behind this HTML
comment (as templates/dev-plan-template.md's does), several keys were left with
their template explanations and no value, and the body below contains a `---`
rule, a ```yaml block, and trailing whitespace. None of it may change.
-->

```yaml
doc_schema_version: 3
feature: offline-playback-badge
dd_link:
design_reference_status: provided
design_reference_type: figma
design_reference: null # null when the type is `figma`
figma_link: https://www.figma.com/design/Hh3Jj4/Offline?node-id=57-902#badge
platform: react-native
device_type: mobile
repo_knowledge_status: unavailable
repo_knowledge_schema: null
repo_knowledge_fingerprint: null
repo_knowledge_freshness: null
repo_knowledge_reused: none
repo_knowledge_derived: stack, commands, structure, inventory, conventions, integrations, auditTopics
author: rn-architect
status: approved
date: 2026-06-18
migrated_from_version: 1
migrated_by: ono-mobile-dev-plugin 0.5.0
```

## Feature Request

Badge any title that is fully downloaded, so a viewer can tell at a glance what   
plays without a connection. The trailing spaces on the line above are load-bearing   
for this fixture — they must survive the migration byte-for-byte.

---

## Repo Conventions Detected

The stack survey below is quoted verbatim from the analyst's notes, fence and all:

```yaml
navigation: react-navigation@6
state: redux-toolkit
data: rtk-query
testing: jest + rntl
```

That fenced block is body content, not frontmatter, and the splitter must not
mistake it for one.

## Proposed Technical Approach

- Reuse `TitleCard`; add a `DownloadedBadge` slot (ARCH-COMP-2).

## Open Questions & Risks

- None outstanding.

## Approval

Reviewed and approved 2026-06-20.
