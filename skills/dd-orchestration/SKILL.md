---
name: dd-orchestration
description: Runs partitioned Detailed Design generation — builds the shared context pack once, sequences the four partition passes defined by templates/dd-partition-template.md, enforces their budgets, handles partition failure, and hands off to the dd-consolidation skill. It owns sequencing and failure handling only; it makes no design decision and defines no contract of its own. NOT YET WIRED — nothing routes to it, so every feature still takes the single-DD path.
---

## Purpose

Sequence partitioned generation, per
[`docs/planning/ADAPTIVE_MULTI_STAGE_DD_GENERATION_DESIGN.md`](../../docs/planning/ADAPTIVE_MULTI_STAGE_DD_GENERATION_DESIGN.md).

> **Not yet wired — nothing routes to this skill.**
>
> `/dev-design-start` does not invoke it. Every feature takes the single-DD path
> regardless of its complexity band, and the band remains advisory. **Do not run
> this skill on your own initiative** — it may only execute when
> `/dev-design-start` routes to it, which it does not yet do.

**The orchestrator is a sequencer, not an architect.** It decides *what runs
next* and *what happens when a pass fails*. It never writes a design decision,
never interprets the repository, never supplies platform vocabulary, and never
authors a section. If it ever needs to decide something a pass left open, that is
a defect — it escalates or stops instead.

## What this skill does not own

Referencing these contracts is correct; restating them is duplication.

| Concern | Owner |
|---|---|
| Context-pack contents, immutability, per-pass inputs | **`templates/dd-partition-template.md`** |
| Section allocation, budgets, generation order | **`templates/dd-partition-template.md`** |
| Duplication, terminology, cross-references, contraction, package assembly | **`skills/dd-consolidation/SKILL.md`** |
| DD section rules, detail levels, the Step 7 gates | **`skills/dev-design-start/SKILL.md`** |
| Complexity classification and the routing decision | **Not implemented.** See below |

**Classification and routing happen before this skill is entered.** Selecting
partitioned generation, and deciding what to do when complexity cannot be
classified, are the caller's responsibility and lie **outside the orchestrator's
failure handling**. A feature that cannot be classified never reaches this skill.

## Preconditions

Every one of these must already hold on entry. The orchestrator verifies them and
**stops** if any is false — it does not repair them.

- The caller routed this feature to partitioned generation
- The feature analysis is `approved`
- Exactly one confirmed platform, and a resolved `device_type`
- The design-reference gate is satisfied
- The context pack has been built per the partition contract

## Stage 1 — Build the context pack, once

Have the platform architect perform its repository evidence sweep **exactly
once**, producing the context pack **as defined in
`templates/dd-partition-template.md`**. That contract is the single source of
truth for what the pack contains and for its immutability; do not restate its
contents here or anywhere else.

The orchestrator's job is to **enforce** it:

- One sweep. No pass may re-scan the repository, re-resolve repository
  knowledge, or re-fetch the design reference.
- The pack is immutable once built. A pass that would modify it is stopped.
- `platform`, `device_type` and the design-reference fields are read-only and
  carried verbatim from the approved feature analysis. **Never re-detect,
  re-ask, or alter them.**

Record the complexity band the caller supplies. It is **advisory** — the
orchestrator does not act on it, and no threshold, cap, dimension or band value
gates anything here.

## Stage 2 — Run the four passes

Invoke the **same platform architect** for the feature's single confirmed
platform **four times**, once per partition. Not four agents — four scoped passes
over one context pack.

Run them strictly sequentially, in this order:

**Foundation → Behavior → Technical → Quality**

**What each pass receives is defined by `templates/dd-partition-template.md`, not
here.** Read the per-pass inputs from that contract; do not restate them. The
order is named above only so this skill is actionable without cross-referencing —
the contract remains authoritative for the inputs, the section allocation, and
the budgets.

For each pass:

1. Give it the context pack plus exactly the predecessor outputs the contract
   assigns it — **outputs, never reasoning**.
2. Scope it to exactly the sections the contract allocates to that partition.
3. Require every allocated section to carry content or an explicit
   `N/A — [reason]`.
4. Check its output against the partition's budget in the contract. Budgets are
   **review triggers, not caps, and never truncation rules** — a pass over
   budget contracts its own output before handing off, and never drops a real
   design decision to fit. A pass still over budget after honest contraction
   hands off over budget and says so; that is not a failure.

Do not merge, deduplicate, normalise or contract across passes at this stage —
all of that belongs to the consolidator.

## Stage 3 — Consolidate, once

When **all four** passes have completed, invoke `dd-consolidation` **exactly
once**, with the four outputs and the context pack.

- Never incrementally, never per pass, never twice.
- **Do not duplicate any consolidator duty.** No deduplicating, no terminology
  normalising, no cross-reference validation, no contraction of the orchestrator's
  own devising.
- Never override a consolidator outcome, and never resolve a contradiction it
  escalated.

## Stage 4 — Write the canonical DD

On a clean consolidation, write **one** canonical DD — sections §0–§26 in
template order, in a single file. No manifest, no package directory: the
canonical DD is the sole authoritative interface, so downstream consumers cannot
tell how it was produced.

- Set `dd_generation: partitioned`. **This skill is the only writer of that
  value**, and because nothing routes here it is unreachable in practice today.
- Set `dd_complexity_band` to the band the caller supplied.
- Leave `status: draft`. Approval is a human act.
- Honour the existing-file strategy the caller already chose — never blindly
  overwrite an existing DD.

## Failure handling

**The ladder below begins only after partitioned generation has been entered.**
Classification and routing failures occur earlier and are not the orchestrator's
concern (see [What this skill does not own](#what-this-skill-does-not-own)).

| # | Situation | Behavior |
|---|---|---|
| 1 | A pass fails, or is unrecoverably over budget | **Retry that pass once**, with tightened scope |
| 2 | The same pass fails a second time | **Stop the workflow and report.** Name the pass and the reason |
| 3 | Any stop | **Never write a partial canonical DD** |
| 4 | Any stop | **Never fall back to single-DD generation automatically** |
| 5 | After a stop | The developer **may explicitly** elect the single-DD path. The orchestrator never elects it and never takes silence as consent |
| 6 | Consolidator escalates a contradiction | Write the canonical DD, leave `status: draft`, surface the §24 entry. Never resolve it |
| 7 | Consolidator reports the package incomplete | **Do not write the canonical DD.** Report the missing sections |

**Why there is no automatic fallback.** If the caller determined that single-DD
generation was unsafe for this feature, silently falling back to it recreates the
exact failure this architecture exists to prevent. A hard stop is the honest
outcome, and resuming on the single-DD path is a decision for the developer.

## Approval gates

**The orchestrator adds no gate and no prompt.**

- **One** human approval, on the consolidated DD, exactly as on the single-DD
  path. Never a gate per partition, and never an approval prompt between passes.
- Never re-ask for a design reference, a platform, a device type, or a detail
  level — the caller resolved all of those.
- Never set or change an approval state.

## Reporting

Report in a few lines: which passes ran and their sizes against budget, any pass
that was retried and why, the consolidator's report verbatim, and — on a stop —
the failing pass, the reason, and that no canonical DD was written. **Silent
orchestration is not acceptable**; a developer must be able to see what ran, what
was retried, and what stopped.

## Hard constraints

- **Never make a design decision.** Sequence, enforce, escalate, stop.
- **Never restate the context-pack contract, the section allocation, the
  budgets, or the pass inputs** — reference `templates/dd-partition-template.md`.
- **Never duplicate a consolidator duty** — reference
  `skills/dd-consolidation/SKILL.md`.
- **Never scan the repository more than once**, and never let a pass re-scan.
- **Never alter `platform`, `device_type`, or any design-reference field.**
- **Never let a pass write a section the contract allocates elsewhere.**
- **Never treat a budget as a cap or a truncation rule.**
- **Never route on the complexity band** — it is advisory, and routing is not
  implemented.
- **Never write a partial canonical DD**, and never fall back to single-DD
  generation automatically.
- **Never add an approval gate or a prompt.**
- **Never rewrite approved Feature Analysis content**, and never write into any
  document other than the canonical DD.
- **Never run on your own initiative** — only when `/dev-design-start` routes here.
