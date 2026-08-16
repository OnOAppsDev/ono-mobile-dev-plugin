---
name: dd-consolidation
description: Merges the four partition outputs of a partitioned Detailed Design into the one canonical DD, per the Adaptive Multi-Stage DD design — removing duplication, resolving mechanical conflicts, enforcing terminology, validating cross references, running the contraction pass, and producing the final package. It resolves only what a rule in the partition contract already decides; a genuine semantic contradiction between two design positions is escalated to §24 and never decided here. NOT YET INVOKED — partitioned generation is not implemented.
---

## Purpose

Turn four partition outputs into one canonical DD that reads as though a single
author wrote it, per
[`docs/planning/ADAPTIVE_MULTI_STAGE_DD_GENERATION_DESIGN.md`](../../docs/planning/ADAPTIVE_MULTI_STAGE_DD_GENERATION_DESIGN.md).

> **Not yet invoked — partitioned generation is not implemented.**
>
> There is no orchestrator and no routing. Every feature takes the single-DD
> path, `dd_generation` is always `single`, and nothing calls this skill. It is
> authored now because the consolidator is the only component permitted to delete
> or rewrite another component's output, and those limits must exist in writing
> before anything invokes it.

**The consolidator is a merge step, not an author.** It applies rules that
already exist — the partition contract's ownership table, the feature analysis's
vocabulary, the DD's fixed numbering, and the Step 7 contraction gates. It
introduces no design content of its own.

## Inputs

- The four partition outputs: Foundation, Behavior, Technical, Quality
- `templates/dd-partition-template.md` — the ownership table and §11/§21 rules
- The context pack (read-only): `platform`, `device_type`, the four
  `design_reference_*` fields, the repository-knowledge resolution, the
  architect's sweep conclusions
- The approved feature analysis, for canonical vocabulary
- `skills/dev-design-start/SKILL.md` — the Step 7 exclusion table and inclusion
  test, which govern contraction

## The six duties

| # | Duty | Boundary |
|---|---|---|
| 1 | Remove duplication | Keep the owner's copy; delete restatements |
| 2 | Resolve contradictions | **Mechanical only.** Semantic contradictions escalate |
| 3 | Enforce terminology | Normalise to existing vocabulary; never rename a concept |
| 4 | Validate cross references | Verify; never invent a reference to fill a gap |
| 5 | Execute contraction pass | Reuse Step 7's gates; add no new size rule |
| 6 | Produce the final DD package | Assemble §0–§26; add nothing no partition produced |

## Duty 1 — Remove duplication

A fact stated by two partitions is kept **once**, in the partition that owns it
per `templates/dd-partition-template.md`. The non-owner's copy is deleted.

| Fact | Sole owner | Consolidator action |
|---|---|---|
| Scope / Out of scope boundary | Foundation §3/§4 | Delete restatements elsewhere; leave a reference if one clarifies |
| Domain terminology | Foundation §1/§3 | Normalise synonyms to the owner's term |
| Repository-knowledge citations | Foundation §0 | Delete restated blocks; keep path-plus-anchor citations |
| Assumptions | Foundation §23 | Move a locally-recorded assumption into §23; merge duplicates |
| API contract shapes | Behavior §10 | Delete re-specified payloads; replace with a §10 reference |
| Error policy | Behavior §17 | Delete restated failure handling |
| Analytics event names | Behavior §12 | Keep §12's definition; elsewhere by name only |
| Service / SDK dependency inventory | Technical §11 | Delete inventory content from §21 |
| Service change impact | Technical §21 | Delete impact assessments from §11 |
| Module map + change classes | Technical §20 | Delete re-derived change surfaces |
| Risks | Quality §22 | Move locally-recorded risks into §22; merge duplicates |
| Open questions | Quality §24 | Move into §24; merge duplicates |
| Acceptance criteria | Quality §25 | Delete pass/fail criteria embedded in behavior sections |
| `platform`, `device_type`, design reference | The context pack | Never alter. Correct a partition that contradicts the pack |

**Never delete a fact that appears only once**, wherever it appears. A statement
in the wrong section is *moved to its owner*, not dropped. Deleting a unique
decision is the worst failure this skill can produce, because nothing downstream
can tell it is missing.

### §11 and §21

Both sit in Technical and are the likeliest pair to collapse. Per the partition
contract: a service named in §11 may appear in §21 **only with a change
description**. Strip dependency metadata (versions, config surface, SDK
listings) from §21 and keep §11's copy. Strip impact assessments from §11 and
keep §21's. A statement doing both is **split between them, never duplicated**.

## Duty 2 — Resolve contradictions

**Almost every conflict is mechanical. Escalation is the rare exception.**

### The decision test

> Can this conflict be settled by applying a rule that already exists — the
> ownership table, the feature analysis's vocabulary, the DD's numbering, or the
> context pack — **without choosing between two design positions**?

- **Yes → resolve it.** Silently, and record it in the report.
- **No, because settling it means deciding which of two design positions is
  correct → escalate.**

### Resolve mechanically — never escalate these

| Conflict | Resolution |
|---|---|
| The same fact stated twice, identically or near-identically | Keep the owner's copy (Duty 1) |
| Two words for one concept | Normalise to the feature analysis's term (Duty 3) |
| Wording, phrasing, tone or formatting differences | Rewrite to one voice |
| A stale count or figure disagreeing with its owner's value | Correct to the owner's value |
| A `§N` reference pointing at the wrong or a renumbered section | Repoint it |
| A section ordered or nested wrongly | Move it into template order |
| A partition contradicting the context pack | Correct the partition — the pack is authoritative |
| A fact recorded outside its owning section | Move it to its owner |
| Differing levels of detail on the same point | Keep the owner's, fold in any detail the owner lacks |

**Do not escalate any of the above.** Escalating a mechanically resolvable
conflict blocks a DD that was never blocked, and that is a defect — as harmful
in practice as failing to escalate a real one.

### Escalate — genuine semantic contradictions only

A conflict qualifies only when **two partitions assert incompatible positions
and picking one is a design decision**:

| Example |
|---|
| Technical §19 places state ownership in one component; Behavior §9 describes it living in another |
| Behavior §10 specifies a contract shape the §19 approach cannot satisfy |
| Two partitions describe mutually exclusive behavior for the same trigger |
| Technical §20 excludes a module that Behavior's flows require |
| Quality §25 asserts an acceptance criterion no described behavior can meet |

For each, record in **§24 Open Questions**, verbatim, both positions and their
sources:

```
[CONTRADICTION — Technical §19 vs Behavior §9: §19 places session state in the
navigation container; §9 describes it owned by the screen. Both positions
recorded as written; unresolved.]
```

Then **leave the DD `status: draft`** and report it to the developer.

**Never pick a side.** Never merge two incompatible positions into a
compromise, never soften either into ambiguity, and never drop the weaker one.
Preserving both unresolved is the correct output — the human decides.

## Duty 3 — Enforce terminology

One name per concept, taken from the approved feature analysis and the context
pack. Where partitions differ, normalise to that source; where the source is
silent, normalise to the Foundation partition's usage as the earliest pass.

**Never rename a domain concept**, never introduce a term no input used, and
never normalise across a genuine distinction — two similarly-named things that
are actually different stay different. If it is unclear whether two terms name
one concept or two, that is a semantic question: escalate it per Duty 2 rather
than collapsing them.

## Duty 4 — Validate cross references

- Every `§N` reference resolves to a real section in `templates/dd-template.md`
- Every cited repository path exists
- Every cited standard ID exists in `standards/**`
- Every `feature_analysis_link` and design-reference value matches the context pack

A broken reference is **repointed when the intended target is unambiguous**, and
otherwise reported as broken. **Never invent a reference, a path, or a standard
ID to fill a gap** — a missing citation is reported, not manufactured.

§19, §20, §25 and §26 are cross-referenced **by number** by `/dev-feature-start`
and the task-breakdown template. Never renumber, merge, split or delete a
section heading to tidy the document.

## Duty 5 — Execute the contraction pass

Apply the **existing** gates in `skills/dev-design-start/SKILL.md` Step 7 — its
exclusion table and its inclusion test. **Define no new size rule here.**

- Content owned by the Feature Analysis, Task Breakdown, Dev Plan, Implementation
  or Verification is removed and attributed to its owner
- Enumerated preserved behavior, pasted evidence sweeps, per-file inventories,
  and any code or test procedure are removed
- The combined package's ~800-line trigger is unchanged

**Never remove a real design decision to satisfy a budget**, and never truncate.
A package still over the trigger after honest contraction is handed over with the
reason recorded in §23 Assumptions, exactly as the single-DD path does.

## Duty 6 — Produce the final DD package

Assemble the four outputs into **one canonical DD** with sections §0–§26 in
template order, every section carrying content or an explicit `N/A — [reason]`.

- **One file.** No manifest, no package directory, no split documents. The
  canonical DD is the sole authoritative interface, so downstream consumers
  cannot tell how it was produced.
- Write `## Approval` as the assembling step — no partition owns it.
- Leave `status: draft`. Approval is a human act.
- **Add nothing no partition produced.** A section no partition filled is an
  incomplete package, not something to write from scratch.

If any section is neither filled nor explicitly `N/A`, **do not write the
canonical DD** — report the missing sections instead. Never produce a partial
canonical DD.

## Reporting

Report in a few lines: what was deduplicated and where each kept copy lives,
what was mechanically resolved, any contradictions escalated to §24, what
contraction removed and which document owns it, and any broken reference that
could not be repointed. **Silent consolidation is not acceptable** — a reviewer
must be able to see what left the document and why.

## Hard constraints

- **Never invent a product or architectural decision.** The consolidator merges;
  it does not design.
- **Never decide a semantic contradiction** — record both positions in §24 and
  leave the DD `draft`.
- **Never escalate a mechanically resolvable conflict** — duplication, wording,
  terminology, stale counts and broken references are resolved, not escalated.
- **Never delete a fact that appears only once.** Move it to its owner instead.
- **Never rename a domain concept** or introduce unused vocabulary.
- **Never invent a reference, path or standard ID.**
- **Never renumber, merge, split or delete a section heading.**
- **Never remove a real design decision to hit a budget**, and never truncate.
- **Never alter `platform`, `device_type`, or any design-reference field** — the
  context pack is authoritative.
- **Never rewrite approved Feature Analysis content**, and never write into any
  document other than the canonical DD.
- **Never produce a partial canonical DD.**
- **Never set or change an approval state.**
