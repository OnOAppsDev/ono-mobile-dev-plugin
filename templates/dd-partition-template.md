# DD Partition Contract

The shared shape for the four generation passes used by **partitioned** Detailed
Design generation, per
[`docs/planning/ADAPTIVE_MULTI_STAGE_DD_GENERATION_DESIGN.md`](../docs/planning/ADAPTIVE_MULTI_STAGE_DD_GENERATION_DESIGN.md).

> **Specification only — partitioned generation is not implemented.**
>
> Nothing invokes these passes yet. There is no orchestrator, no consolidator,
> and no routing: every feature takes the single-DD path regardless of its
> complexity band, and `dd_generation` is always `single`. This file exists so
> that the orchestrator and consolidator, when they are built, cannot each
> invent their own section allocation. Do not treat it as an available mode.

## What a partition is

A partition is a **scoped generation pass over the one shared context pack**,
producing the sections it owns in `templates/dd-template.md` — never a separate
deliverable. All four passes converge into the single canonical DD, whose
`§0–§26` contract is unchanged. Downstream consumers read that one file and
cannot tell how it was produced.

The same platform architect runs all four passes. **Four passes, one architect,
one repository sweep** — not four agents, and never a second sweep.

## Section allocation

Every numbered section is owned by **exactly one** partition. Sections marked ◆
are named directly by the approved design document and are placed where it puts
them; the rest are placed by cohesion with the owning partition's purpose.

| § | Section | Partition |
|---|---|---|
| 0 | Repo Knowledge Reference | Foundation |
| 1 | Feature Overview | Foundation |
| 2 | Business Goal | Foundation |
| 3 | Scope | Foundation |
| 4 | Out of Scope | Foundation |
| 5 | User Flows | Behavior |
| 6 | Screen Flows | Behavior |
| 7 | UI Behavior | Behavior |
| 8 | Navigation Changes | Behavior |
| 9 | Data Flow | Behavior |
| 10 | API Requirements | Behavior |
| 11 | Service Dependencies | Technical |
| 12 | Analytics Requirements | Behavior |
| 13 | Permissions | Behavior |
| 14 | Validation Rules | Behavior |
| 15 | Loading States | Behavior |
| 16 | Empty States | Behavior |
| 17 | Error Handling | Behavior |
| 18 | Edge Cases | Behavior |
| 19 | Technical Implementation Approach | Technical |
| 20 | Impacted Modules | Technical |
| 21 | Impacted Services | Technical |
| 22 | Risks | Quality |
| 23 | Assumptions | Foundation |
| 24 | Open Questions | Quality |
| 25 | Acceptance Criteria Mapping | Quality |
| 26 | Definition of Ready for Development | Quality |

◆ design-named: §1, §3, §4, §23 (Foundation) · §5, §7, §8, §9 (Behavior) ·
§11, §19, §20, §21 (Technical) · §22, §24, §25, §26 (Quality).

**`## Approval` is deliberately unowned.** It is document furniture, not design
content, and is written when the canonical DD is assembled. No partition may
produce it, and no partition may record an approval state.

## Budgets

| Partition | Budget | Sections |
|---|---|---|
| Foundation | 80 | 6 |
| Behavior | 220 | 13 |
| Technical | 260 | 4 |
| Quality | 140 | 4 |
| **Combined** | **700** | **27** |

Technical carries the most lines per section because §19 and §20 hold the actual
design decisions. Behavior carries the most sections on the tightest per-section
allowance — most of its sections are one or two lines, or `N/A — [reason]`, for
any given feature.

**Budgets are review triggers, not caps, and never truncation rules** — the same
rule `skills/dev-design-start/SKILL.md` applies to the whole DD. A pass that
exceeds its budget must run a contraction pass **on its own output, before
handing off**, and that contraction is mandatory rather than optional. It must
never drop a real design decision to fit a number. If a pass is still over
budget after honest contraction, it hands off over budget and says so.

The combined 700 is chosen against the two existing thresholds: it sits exactly
at the ceiling of the Comprehensive band (~400–700) and **100 lines below** the
mandatory contraction trigger (~800). Four partitions at full budget therefore
produce no more raw material than one Comprehensive DD. Because consolidation
only ever removes, the consolidated DD should land below 700.

**The slice-level acceptance test:** a high-complexity feature's consolidated DD
must not be larger than a single-generation DD of the same feature. Partitioning
that produces a bigger document has failed, however well-organised it is.

## Generation order and inputs

**Strictly sequential.** Each pass receives its predecessors' *outputs*, never
their reasoning — that is the mechanism that reduces each pass's context.

| Order | Pass | Receives |
|---|---|---|
| 1 | Foundation | Context pack only |
| 2 | Behavior | Context pack + Foundation §3/§4 |
| 3 | Technical | Context pack + Foundation §3/§4 + Behavior §9/§10 |
| 4 | Quality | Context pack + all three predecessors' outputs (read-only) |

Not parallel, deliberately: Behavior needs the scope boundary before it can
describe flows, Technical needs the data-flow and API contracts to design
against, and Quality derives acceptance criteria and risks from all three.
Concurrent passes would each have to guess at the others — which is exactly how
partitions end up making independent, conflicting architectural decisions.

The cost is latency: four sequential passes rather than the slowest of four.
Correctness over speed.

## The context pack

Collected **once**, before any pass, and immutable thereafter:

- `platform`, `device_type` and all four `design_reference_*` fields, verbatim
  from the approved feature analysis
- This run's repository-knowledge resolution and its citation block
- The architect's evidence-sweep **conclusions** — module map, reusable
  components by path, detected conventions, applicable standard IDs
- The resolved design reference, fetched once
- The complexity signals and band

**No pass may re-scan the repository, re-resolve knowledge, re-fetch the design
reference, or alter the platform or device type.**

## Cross-cutting ownership

The consolidator's duplication removal is undefined without this. One owner per
fact; everyone else references.

| Fact | Sole owner | Every other pass must |
|---|---|---|
| Scope / Out of scope boundary | Foundation §3/§4 | Reference it; never restate or re-litigate it |
| Domain terminology | Foundation §1/§3 | Reuse those exact terms; never coin a synonym |
| Repository-knowledge citations | Foundation §0 | Cite paths and anchors; never restate the block |
| Assumptions | Foundation §23 | **Escalate** a new assumption; never record one locally |
| API contract shapes | Behavior §10 | Cite §10 by number; never re-specify a payload |
| Error policy | Behavior §17 | Never restate failure handling |
| Analytics event names | Behavior §12 | Reference by name |
| Service / SDK dependency inventory | Technical §11 | Name a service; never enumerate its config or version |
| Service change impact | Technical §21 | Never describe what changes in a service |
| Module map + change classes | Technical §20 | Cite §20; never re-derive the change surface |
| Risks | Quality §22 | **Raise** a risk; never record one locally |
| Open questions | Quality §24 | **Escalate**; never resolve or park one locally |
| Acceptance criteria | Quality §25 | Never embed pass/fail criteria in a behavior section |
| `platform`, `device_type`, design reference | **The context pack** — no pass | Read-only. Never re-derive, re-ask, or alter |

### §11 and §21 are different questions about the same services

Both live in Technical, which makes them the likeliest pair to collapse into one
another. They must not.

| | §11 Service Dependencies | §21 Impacted Services |
|---|---|---|
| **Question** | What does this feature *depend on*? | What does this feature *change or affect*? |
| **Owns** | The dependency inventory | The change impact, and nothing else |
| **Contains** | External services, internal microservices, third-party SDKs, feature flags, infrastructure — named, with the version or config surface the feature relies on | For each affected service: what changes, and what the consequence is (contract change, load change, migration, deploy coupling, rollout ordering) |
| **Must never contain** | What changes in a service, or any impact assessment | A dependency listing, a version, a config surface, or an SDK inventory |

Three rules that keep them apart:

1. **A service named in §11 may reappear in §21 only with a change
   description.** Re-listing it with its dependency detail is duplication and
   the consolidator removes it from §21, keeping §11's copy.
2. **§21 may name a service that is not in §11.** A downstream consumer affected
   by an API change is impacted without being a dependency. When it does, §21
   still records only the impact — never dependency metadata for it.
3. **If a statement answers "what do we rely on", it belongs in §11. If it
   answers "what happens to it", it belongs in §21.** A statement doing both is
   split, not duplicated.

## Escalation protocol

A pass that discovers something owned by another partition **escalates it rather
than recording it**. This is how a pass contributes to a section it does not own
without duplicating it, and it is what stops four passes keeping four private
risk lists.

| Discovery | Route to |
|---|---|
| A new assumption | Foundation §23 |
| A risk | Quality §22 |
| A blocking unknown | Quality §24 |
| A contradiction with an earlier pass | Quality §24, verbatim, as a contradiction |

An escalation names the fact and the pass that found it. The owning partition
records it once. **A pass never resolves a contradiction it discovers** — that
belongs to the consolidator, which escalates rather than decides.

## Hard rules

- **Every numbered section is owned by exactly one partition.** A pass writes
  only its own sections, and writes every one of them (content or an explicit
  `N/A — [reason]`).
- **Never renumber, merge, split or delete a section heading.** §19, §20, §25 and
  §26 are cross-referenced by number by `/dev-feature-start` and the task
  breakdown template.
- **Never re-scan the repository** — one sweep, one context pack, four readers.
- **Never alter `platform`, `device_type`, or any design-reference field.**
- **Never duplicate a fact this contract assigns elsewhere** — reference or
  escalate.
- **Never let a pass produce `## Approval` or set an approval state.**
- **Never treat a budget as a truncation rule.**
- **Never produce a partial canonical DD.** If a pass fails twice, the workflow
  stops and reports; it does not silently fall back to single-DD generation.
