---
name: platform-review
description: The platform-independent review methodology — repository-convention-first review, the filing gate, citation discipline, severity, evidence reach, predicate versus claim, mechanism versus magnitude, scope discipline, and delegation to enabled tooling. Used by the code-reviewer and performance-reviewer agents alongside the resolved platform's review skill, which supplies the standards families, buckets, tool inventory and per-rule stage rows. The live review methodology for /review-code and /prepare-mobile-release across all four platforms.
---

# Platform Review

## Overview

The **methodology half** of reviewing a change: how a finding is decided, evidenced, cited
and graded, independent of which platform the code is written in. The other half is the
resolved **platform lane**, which owns standards families and ID roots, review buckets,
the tool inventory, per-rule stage assignments, predicate/claim rows, measurement
instruments, and that platform's own stop conditions. This skill never restates the lane
and never names a platform.

## Authoritative owners — cite these, never restate them

| What | Owner |
|---|---|
| Scope resolution, platform detection, per-file attribution | **`commands/review-code.md`** steps 1–2 |
| Which standards load for which platforms | **`commands/review-code.md`** steps 3–4 |
| Lane routing and the exclude-and-declare readiness gate | **`commands/review-code.md`** step 5 |
| Merging findings into one document | **`commands/review-code.md`** step 6 |
| Release-stage sign-off and the no-go rule | **`commands/prepare-mobile-release.md`** step 4 |
| Security findings — a separate command and reviewer | **`commands/review-security.md`**, `agents/mobile-security-reviewer.md` |
| Verification tiers and what may be recorded as proven | **`standards/shared/verification.md`** |
| Standards families, ID roots, buckets, tools, stage rows, measurement instruments | **the resolved platform lane** |
| **Out-of-lane asides and modernization/preference observations** | **the resolved platform lane** — see [Out-of-lane policy](#out-of-lane-policy) |

**This skill reviews; it never fixes.** Remediation is `/fix-review-comments`. It writes no
code, modifies no planning document, and writes no repository-knowledge artifact.

## 1. Repository convention comes first

Review against what the repository actually does, not against an ideal. A change that
follows an established convention is correct even where another approach would be
defensible. Where the repository has no convention for something the change needs, say so
rather than inventing one and filing against it.

**Never file because another implementation would be more modern, more idiomatic, or
preferred by current vendor documentation.** Official platform and framework documentation
is supporting guidance only; it never overrides a valid existing implementation, and "the
ecosystem now prefers X" is never by itself a finding.

## 2. The delegation ladder

**Route every check to the cheapest authority that can soundly settle it, and never
re-derive what another component owns.** Descend only when the rung above cannot decide.

| Rung | Authority | What it settles |
|---|---|---|
| 1 | The repository's **resolved, enabled** tooling and CI | Formatting, and the lane's tool-owned lint rules |
| 2 | Repository knowledge | The repository's established conventions |
| 3 | Another reviewer's lane | Security, release and the other pass's roots |
| 4 | An authored standard the lane cites | Whether the change violates a written rule — **this is the review** |
| 5 | Judgment against repository convention or architecture | Layering, boundaries, dependency direction, internal inconsistency |

**Do not run the tools.** Reviewing a diff and running a build are different acts assigned
to different participants; Build-stage verification belongs to CI or the implementer.

### 2.1 Rung 1 is conditional

Suppressing a finding because "a tool owns it" is only sound when the tool **actually has
that rule switched on in this repository**. Establish it, or do not suppress.

**An authored ID always wins.** Where a tool rule and an authored standard cover the same
defect, file it under the standard's ID — `/fix-review-comments` re-verifies by citation,
so a suppressed finding leaves the Fix stage nothing to check.

A configuration file present in the repository proves nothing on its own. A rule is
tool-owned **only if it is in the resolved enabled set**, and many of the rules that matter
are opt-in or default-off. **Where the configuration cannot be resolved, file the finding**
— a duplicate costs the author one line; a miss costs them the defect.

Record what rung 1 absorbed, and on what evidence, in Not Applicable / Skipped.

## 3. The filing gate

**Every finding names a concrete violation of exactly one of four things:**

1. A **repository convention** — an established pattern the change departs from.
2. The **project's architecture** — layering, module boundaries, dependency direction.
3. An authored **platform standard** the lane cites.
4. A **shared standard**.

**A finding that cannot name which is not a finding, and is not filed.**

Categories 3–4 cite the ID. **Categories 1–2 carry a citation in the same slot** so the Fix
stage can re-verify them — a convention pointer, or the boundary or direction violated
where no document records it. **A finding with an empty citation slot is not filable.**

- **Nit is not an exemption.** A Nit still carries a citation.
- **Framework, library and architecture preference are never findings.** Competing valid choices are repository conventions, not defects.

## 4. Evidence reach — what you may claim

### 4.1 By applicability stage

**Mark a rule Not Applicable — never "passed" — when its stage has not been reached.**

- **Diff** — decidable from the changed code. The default.
- **Build** — requires compiling, linting or archiving. A diff-reading reviewer does not assert a verdict on these.
- **Release** — checked at `/prepare-mobile-release`. Not Applicable at Review; live at Release.

The lane assigns each of its rules to a stage.

### 4.2 Split the predicate from the claim

Several rules carry no stage marker while part of their text demands a runtime act. **The
source-side predicate is filable; the runtime claim is a verification request.** Filing the
first as though it were the second loses real defects; filing the second as though it were
the first is overclaiming. The lane supplies the per-rule rows.

Where a rule is a **required check** for this command, the source-side predicate is filed
as a finding and the runtime part is a verification request **inside Findings**, never
parked in the skipped bucket.

### 4.3 Mechanism versus magnitude

**A magnitude claim — "this is slow", "this leaks", "this regressed startup" — is never
asserted from reading code.**

- A **mechanism** finding — unbounded growth, work on the wrong thread, per-item cost in a loop, or a retention cycle whose edges are readable in the reviewed files — needs no measurement and is filed at its own severity.
- A **magnitude** claim carries a measurement, or is filed as a **measurement request**. Unmeasured, it caps at Minor and never blocks.

The lane names the retention shapes and measurement instruments that apply to it.

## 5. Scope discipline

Review the resolved scope and nothing else. Pre-existing defects in untouched code are not
findings; a pre-existing defect the change *makes worse* is. Do not file against legacy
code the diff merely sits next to, and do not expand a review into an audit — if a
whole-repository audit is wanted, say so explicitly at the top of the output.

## 6. The two passes

Correctness/style/standards and performance are **two independent passes over the same
scope**, not one pass with a performance section. Running them separately is what stops a
performance-only change being miscategorised as a correctness finding, and vice versa.
Security is a third responsibility entirely, owned by its own command and reviewer.

## 7. Severity

- **Blocking** — breaks functionality, or violates a hard rule.
- **Major** — likely to cause a real bug, or meaningfully hurts maintainability.
- **Minor** — a standards deviation with no immediate functional risk.
- **Nit** — style or hygiene.

Every finding carries `file:line`, its citation, and **concrete remediation** — a specific
fix pointer, not a restatement that something is wrong.

## 8. Output

Populate the shared review template in full, including an explicit "None found" for
sections with no issues, the Not Applicable / Skipped bucket with its evidence, and an
overall verdict. The command merges the passes and the platforms into one document; do not
produce a separate document per platform or per pass.

## Out-of-lane policy

**This skill is deliberately neutral on whether an out-of-lane observation may be noted,
and on whether a modernization or preference observation may appear anywhere in the
output.** Those policies differ by platform today, the difference is long-standing and
deliberate, and **the resolved lane owns it.** Read the lane's policy and follow it
exactly. Do not infer a default from this skill's silence, do not normalise the lanes in
either direction, and do not introduce an override mechanism.

## Red flags — STOP and report instead of proceeding

Platform-independent stop conditions; the lane adds its own.

- The review scope cannot be resolved.
- A standard the lane cites is missing or is a structure-only placeholder.
- You are about to file a finding with an empty citation slot.
- You are about to assert a magnitude claim without a measurement.
- You are about to record a rule as passed when its applicability stage was never reached.
- You are about to suppress a finding on a tool rule you have not established is enabled.
- You are about to file outside the resolved scope, or to review a platform you were not invoked for.

## Relationship with commands, agents, lane

- **`commands/review-code.md`** — scope, attribution, standards loading, lane routing, the readiness gate, and the merge.
- **`commands/prepare-mobile-release.md`** — the release-stage performance sign-off and the no-go rule.
- **`agents/code-reviewer.md`** and **`agents/performance-reviewer.md`** — the two executors that run this methodology against one resolved lane.
- **The resolved platform lane** — standards families, buckets, tools, stage rows, measurement instruments, the out-of-lane policy, and platform stop conditions.
- **This skill** — the platform-independent review methodology, and nothing a lane or a command already owns.
