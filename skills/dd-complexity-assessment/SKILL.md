---
name: dd-complexity-assessment
description: Measures how architecturally complex a feature's design will be, from signals the platform architect records during the repository sweep it already performs, and classifies it as low / medium / high via scripts/assess-dd-complexity.ts. Used by /dev-design-start. The band is ADVISORY ONLY — it is reported and stamped into the DD, and it never changes how the DD is generated. It never re-scans the repository and never re-asks the developer anything.
---

## Purpose

Record how complex a feature actually is, as a measurement rather than an
impression, so the classification model can be calibrated against real features.

**This skill changes nothing about how a DD is produced.** Every feature — low,
medium, high, or unclassified — takes the existing single-DD path. The band is
recorded in the DD's `dd_complexity_band` frontmatter and reported to the
developer in one line. Nothing reads it back.

That is deliberate. Partitioned generation does not exist yet, and the scoring
model below is an initial hypothesis. It must be measured against real Low,
Medium and High features before it is allowed to influence anything.

## Step 1 — Collect the signals during the sweep you already do

The platform architect performs a repository evidence sweep for §19 and §20 of
the DD. **Record these eleven values while doing that sweep.** Do not perform a
second pass, do not re-read files you have already read, and do not run
`repo-analyst` again — the whole point is that this costs one extra observation,
not one extra scan.

| Signal | Type | What to record |
|---|---|---|
| `modules_touched` | int | Distinct modules / packages / feature folders the change enters |
| `change_classes` | int | Distinct *kinds* of change, not sites. One mechanical transformation repeated across many call sites is one class |
| `change_sites` | int | Approximate total edit sites. **Recorded for the reader; scored at zero** |
| `cross_module_change_classes` | int | How many of those classes span more than one module |
| `surfaces_changed` | int | Screens / views / user-facing surfaces added or changed |
| `new_contract` | bool | Introduces or changes a contract crossing a module boundary (API shape, event, public interface) |
| `new_pattern` | bool | Introduces an architectural pattern the repository does not already use |
| `new_dependency` | bool | Adds an external library, SDK or service |
| `data_migration` | bool | Requires migrating persisted data or stored state |
| `concurrency_change` | bool | Changes a threading, lifecycle or state-ownership model |
| `design_reference_status` | enum | Copy verbatim from the approved feature analysis: `provided` or `not_required` |

**Count decisions, not volume.** Many identical edits in one module are one
change class with many sites — that is repetition, not complexity, and scoring
it as complexity is the single most likely way to misclassify a feature.
Requirement counts, acceptance-criterion counts and Feature Analysis length are
**not signals** and must never be substituted for one.

**Estimate honestly rather than precisely.** These are counts of things you
observed, not exhaustive inventories. If you genuinely cannot observe a signal,
leave it out — see Step 3.

## Step 2 — Score it

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/scripts/assess-dd-complexity.ts" \
  --signals '{"modules_touched":2,"change_classes":1,"change_sites":40,
              "cross_module_change_classes":1,"surfaces_changed":0,
              "new_contract":false,"new_pattern":false,"new_dependency":true,
              "data_migration":false,"concurrency_change":false,
              "design_reference_status":"not_required"}'
```

`--no-warnings` is part of the canonical invocation, not optional — Node emits
an `ExperimentalWarning` on stderr for direct `.ts` execution, and a caller
merging stderr into stdout would be handed non-JSON.

**Never compute the band yourself.** The script owns every threshold, cap and
band rule, so the classification is arithmetic rather than judgement and two
runs over the same feature agree. You supply observations; it decides.

It always exits 0 and always prints JSON. Read `band`, `total`, `dimensions`,
`highDimensions`, `predictedLines` and `summary`.

## Step 3 — When a signal cannot be observed

Omit it. The script returns `band: "unclassified"` and names what was missing.

**Do not guess a value to force a classification.** An unclassified result is a
correct, useful outcome: it records that the feature could not be measured. It
changes nothing, because nothing routes on the band.

## Step 4 — Report one line, then continue

Show the developer the `summary` field, unchanged. For example:

```
Complexity medium (8/18 — repository 3/5, architecture 3/6, surface 1/4,
coupling 1/3; ~344 predicted lines). Advisory only — generation continues on
the single-DD path.
```

Then **continue generating the DD exactly as you would have without this skill.**
Do not ask the developer to confirm the band, do not offer a different
generation mode, and do not change the detail level, the section rules, the
contraction pass, or anything else based on the result.

## Step 5 — Stamp it

Set `dd_complexity_band` in the DD's frontmatter to the returned `band`
(`low` / `medium` / `high` / `unclassified`). Leave `dd_generation: single`.

Record the dimension breakdown nowhere else. It is a measurement, not a design
decision, so it does not belong in any numbered DD section — §23 Assumptions in
particular is for facts that would invalidate a design decision if wrong, and
this is not one.

## Hard Constraints

- **Never route on the band.** There is exactly one generation path. A `high`
  result produces the same DD, by the same method, as a `low` result.
- **Never re-scan the repository** for these signals — collect them during the
  sweep the architect already performs.
- **Never ask the developer anything.** This skill adds no prompt and no gate.
- **Never compute or override the band by hand** — the script is the classifier.
- **Never guess a missing signal** to avoid an `unclassified` result.
- **Never count volume as complexity** — not change sites, not requirements, not
  document length.
- **Never let the band change** the detail level, section scope, budgets, or the
  Step 7 contraction pass.
- **Never write the band anywhere except `dd_complexity_band`.**
