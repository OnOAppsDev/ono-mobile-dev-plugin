---
name: platform-planning
description: The platform-independent planning methodology — the confirmed-context rule, repository evidence discipline and its labelling vocabulary, reuse-before-new, repository-knowledge resolution through repo-knowledge-consumer, the competing-mechanism stop, and generic output discipline. Used by the feature-architect agent alongside the resolved platform's dev-planning skill, which supplies the evidence dimensions, vocabulary and standard IDs. The live planning methodology for /analyze-feature, /dev-design-start and /dev-feature-start across all four platforms.
---

# Platform Planning

## Overview

The **methodology half** of planning a feature: how a repository is inspected, how claims
about it are labelled, and what discipline the resulting approach is held to — independent
of which platform the feature targets. The other half is the resolved **platform lane**,
which owns the evidence dimensions to inspect, the vocabulary the approach is written in,
and the standard IDs that may be cited. This skill never restates the lane and never names
a platform.

It is used at all three planning call sites — `/analyze-feature`, `/dev-design-start` and
`/dev-feature-start` — because the discipline is the same at each; only the shape of the
output differs, and the command and `dev-design-start` own that.

**This skill plans. It never writes code and never modifies a repository file.**

## Authoritative owners — cite these, never restate them

| What | Owner |
|---|---|
| Platform and device-type detection, and the human confirmation gate | **`commands/analyze-feature.md`** steps 1–2 |
| The design-reference branch and its stop conditions | **`commands/analyze-feature.md`** step 5, **`commands/dev-design-start.md`** step 4 |
| Locating the upstream artifact, migration loading, the approval gate | **`commands/dev-design-start.md`** steps 1–2 |
| Architect routing | **`commands/dev-design-start.md`** step 3 |
| Task decomposition mechanics and the breakdown contract | **`commands/dev-feature-start.md`**, **`skills/dev-feature-start/SKILL.md`** |
| **DD section rules, the `N/A — [reason]` discipline, the frontmatter contract, §20 change-class resolution and its site threshold, the contraction pass** | **`skills/dev-design-start/SKILL.md`** Steps 2, 6, 7 |
| **Statement classification, risk taxonomy, the ranked source-of-truth hierarchy** | **`skills/dev-design-start/SKILL.md`** § *Shared planning rules* — defined once there as Classification, Risk classification and Source-of-truth hierarchy. Apply them as written; never introduce a per-platform copy |
| Which repository knowledge may be reused, and what must still be derived | **`skills/repo-knowledge-consumer/SKILL.md`** |
| Evidence dimensions, platform vocabulary, standard IDs, detection traps, device-type discovery, platform stop conditions | **the resolved platform lane** |

## 1. The confirmed context is given

`platform` and `device_type` were confirmed by a human at `/analyze-feature` step 2 and are
carried in frontmatter from there. **Treat both as authoritative. Never re-detect either,
never ask for reconfirmation, and never emit `mixed`** — there is no mixed authoritative
platform and no mixed device type.

Exactly one lane is resolved from that platform, and it is the only source of platform
content. No other platform's lane or standards may be loaded.

Because exactly one confirmed platform always applies, the sections this planning produces are **always flat** — never split into per-platform subsections.

## 2. Standards readiness

Before planning, confirm the standards the resolved lane cites are authored rather than
structure-only placeholders. If a cited file is missing or is a placeholder, **stop and
report that planning is blocked for that platform until it is authored** — never fall back
to assumed defaults. The lane owns *which* files; this skill owns the obligation to check.

## 3. Repository knowledge before live derivation

Resolve canonical repository knowledge through **`skills/repo-knowledge-consumer`** before
deriving anything. Reuse every category it reports reusable by reading the cited document;
verify on use what it reports as `verifyOnUse` (the repository changed since that knowledge
was generated — its Step 3a); derive live only what it reports as `deriveLive`.

**Never parse `.ono/repo-knowledge.json` yourself** — one component owns that. **An absent
manifest is the normal case, not an error:** say so in one line and proceed with full live
inspection. Never block on it, never ask permission, and never tell the developer to run an
inspection first. Anything derived here is scoped to this run and is never written back —
those artifacts belong to `ono-project-inspector`.

## 4. Evidence discipline

**Inspect before proposing.** The lane lists the dimensions; this skill owns the discipline
applied to every one of them.

- **Detect — never assume.** Every technology the lane names as a possible finding is a finding to be established, not a default to be applied.
- **Label every finding** `[evidence: <path>]`, `[reused: <path>#<anchor>]`, `[inference]`, or `[unknown]`. **An unlabelled claim about the repository is a defect.** Prefer `[unknown]` over a guess.
- **Never invent** packages, modules, components, APIs, file paths, dependencies or repository facts. Where evidence is missing, contradictory or ambiguous, report it and ask.
- **Record the change surface during the same sweep**, not in a second pass: which modules the change enters, the distinct *kinds* of change it makes, and roughly how many sites each kind repeats across. Those observations are what the approach and the impacted-module inventory are written from — collect them once.
- **Where the repository is internally inconsistent** — two mechanisms in parallel, a half-finished migration — **report the inconsistency** rather than silently picking a side.
- **Where the repository has no convention** for something the feature needs, say so explicitly and record it as an open decision. Absence of a convention is not permission to invent one.

## 5. Reuse before new

For each element the feature needs, state explicitly whether you are **reusing** an
existing one — naming it by path — or **introducing** a new one, and why nothing existing
fits. Consult the component inventory when repository knowledge makes one available.
Proposing a "new" element that already exists is the most common defect this step prevents.

## 6. Detected conventions govern

The repository's existing conventions decide what a correct approach looks like. **Official
vendor documentation, release notes and community guidance are supporting guidance only** —
they never override a working implementation, and "the ecosystem now prefers X" is never by
itself a reason to propose X.

- **Never propose a migration** — of library, framework, architecture mode or structural convention — unless the feature explicitly requests it and it is approved.
- **Never introduce a new architecture, layer or abstraction during an unrelated feature**, and never add indirection the evidence does not justify.
- **Optional modernisation is reported to the developer, never folded into required work**, and never actioned without approval.

## 7. Output discipline

The approach is written in the lane's vocabulary, grounded strictly in what the sweep
found, and every statement carries its class per `skills/dev-design-start/SKILL.md`
§ *Shared planning rules → Classification*. Cite the IDs each decision follows, from the
lane's citation map only — never invent an ID, and never cite one that is merely adjacent.

**The sweep is working material, not output.** At `/analyze-feature` the evidence base
belongs in the analysis; at `/dev-design-start` the DD receives the *conclusions* and cites
them, never the transcript. The shared design skill's Steps 6 and 7 govern what actually
lands in the document — do not assume verbatim inclusion.

Every path named must be evidence-backed. Mark a genuinely undetermined location
`[unknown — …]` rather than inventing a plausible one.

## Red flags — STOP and report instead of proceeding

Platform-independent stop conditions; the lane adds its own.

- Repository evidence is missing, contradictory or ambiguous on a dimension the design depends on.
- **Two competing mechanisms are in active use for a layer the feature must touch, with no discernible primary** — report it rather than choosing.
- The feature cannot be built without introducing a new library, architecture or abstraction — record it as an open decision rather than deciding it unilaterally.
- A UI-changing feature has no readable design reference of any supported type.
- The approach would require modifying an approved upstream document, or the upstream documents conflict.
- A standard the lane cites is missing or is a structure-only placeholder.
- You are about to state a repository fact you did not verify, or cite an ID you did not confirm exists.
- You are about to write a repository-knowledge artifact owned by `ono-project-inspector`.

## Relationship with commands, agent, lane

- **`commands/analyze-feature.md`** — detection, the confirmation gate, the design-reference gate, and the analysis document.
- **`commands/dev-design-start.md`** and **`skills/dev-design-start/SKILL.md`** — artifact resolution, approval gates, routing, and every DD section rule.
- **`commands/dev-feature-start.md`** and **`skills/dev-feature-start/SKILL.md`** — task decomposition and the breakdown contract.
- **`agents/feature-architect.md`** — the executor that runs this methodology against one resolved lane.
- **The resolved platform lane** — evidence dimensions, vocabulary, standard IDs, detection traps, device-type discovery, platform stop conditions.
- **This skill** — the platform-independent planning methodology, and nothing a lane or a command already owns.
