# Feature Analysis — Media3 Player Migration

```yaml
doc_schema_version: 3
feature: media3-player-migration
dd_link:
design_reference_status: not_required
design_reference_type: none
design_reference: null
figma_link: null
platform: android
device_type: mobile
repo_knowledge_status: unavailable
repo_knowledge_schema: null
repo_knowledge_fingerprint: null
repo_knowledge_freshness: null
repo_knowledge_reused: none
repo_knowledge_derived: stack, commands, structure, inventory, conventions, integrations, auditTopics
author: android-architect
status: approved
date: 2026-02-20
migrated_from_version: 1
migrated_by: ono-mobile-dev-plugin 0.5.0
migration_inputs: design_reference_status=human@migration, design_reference_type=human@migration, design_reference=human@migration
```

## Feature Request

Move all playback construction off the deprecated `SimpleExoPlayer` API and onto
`ExoPlayer.Builder` / Media3, with no change to what a viewer sees.

## Repo Conventions Detected

- Platform Detection: Gradle + Kotlin, single Android app module. Confidence: High.
- Playback: ExoPlayer 2.18, constructed in ~40 sites across `:player` and `:feature:watch`.

## Proposed Technical Approach

- Replace construction sites module by module, keeping the existing player
  wrapper interface unchanged (AND-ARCH-3).

## Open Questions & Risks

- No user-facing surface changes, so no design input was recorded at the time.

## Approval

Reviewed and approved 2026-02-24.
