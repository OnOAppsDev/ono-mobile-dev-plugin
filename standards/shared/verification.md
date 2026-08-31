# Verification Standards

## Purpose & Scope

These standards govern **how verification evidence is recorded**, independent of what is
being verified. They exist because some obligations a task takes on cannot be discharged
by the plugin at all: a screen-reader walkthrough, a thermal measurement on a physical
device, a camera or Bluetooth interaction. The plugin must be able to say so precisely
rather than either blocking forever or quietly implying the work was proven.

They are domain-neutral. Accessibility is the first domain to use them; performance and
device-capability domains are expected to follow and are deliberately not authored here.

Each rule carries a stable ID so a review finding or a task record can cite it exactly.

## Verification Tiers

Every recorded check belongs to exactly one tier. The tier states the **reach** of the
evidence, not the effort spent producing it.

- **Tier 1 — mechanical.** A deterministic check the plugin can run and whose result it
  can read: a linter, a compiler, a static analyser, an automated audit, a test run. Tier 1
  evidence may gate task completion.
- **Tier 2 — human-approved baseline.** A check that is mechanical to re-run but whose
  correctness was established once by a human: an approved snapshot, a recorded baseline.
  Tier 2 evidence may gate task completion.
- **Tier 3 — outside the plugin's reach.** No headless mechanism exists. The evidence
  requires assistive technology, a physical device, a human sensory judgement, or a
  real-world condition the plugin cannot create. Tier 3 is **never recorded as passed.**

The boundary between Tier 1 and Tier 3 is frequently misjudged in one specific way: a
Tier 1 check can prove an attribute is *present* and almost never that the resulting
behaviour is *correct*. An accessible label of `"image1"` satisfies every automated audit
that checks a label exists. Presence is not meaning.

## Recording Verification

- `VERIFY-1` Every recorded check declares its tier explicitly. A check with no tier is
  not evidence, because its reach is unknown. **A Tier 3 requirement is never recorded as
  a passed check** — passing is not a state Tier 3 evidence can reach.
- `VERIFY-2` A requirement that depends on assistive technology, on-device behaviour, or
  human sensory judgement is **never satisfied by Tier 1 or Tier 2 evidence.** A green
  automated audit is evidence that no automated defect was detected on the surfaces the
  run reached; it is never evidence that a manual walkthrough was performed or succeeded.
  Citing mechanical evidence against such a requirement misrepresents what was proven.
- `VERIFY-3` A verification obligation the plugin cannot discharge is **recorded as
  verification debt, never silently omitted.** The record names the domain, the rule it
  serves, the verification still required, why the plugin cannot perform it, and who owns
  it. Verification debt does not block task completion — it transfers a known, named
  obligation to the party that can discharge it.

## Verification Debt and Completion

Verification debt and completion are separate dimensions, and conflating them fails in
both directions.

- A **failing Tier 1 or Tier 2 check blocks completion.** The plugin proved a defect.
- **Outstanding verification debt does not block completion.** The plugin proved nothing
  either way, and blocking would make completion depend on hardware availability rather
  than on the state of the code.

Recorded debt is discharged by the party named as its owner, through that party's own
process. The plugin never marks debt discharged on its own authority: doing so would
convert an unproven obligation into an apparent proof, which is exactly what `VERIFY-2`
forbids. Evidence produced by a human remains human-attested and never becomes
plugin-verified.

## References

- Tier vocabulary consumers: `standards/shared/accessibility.md` (`A11Y-*`),
  `standards/shared/qa-handoff.md` (`QA-*`).
- This document is a living baseline; flag gaps found during review rather than working
  around them silently.
