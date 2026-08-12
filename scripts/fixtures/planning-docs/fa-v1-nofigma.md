# Feature Analysis — Media3 Player Migration

```yaml
feature: media3-player-migration
dd_link:
figma_link:
platform: android
device_type: mobile
author: android-architect
status: approved
date: 2026-02-20
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
