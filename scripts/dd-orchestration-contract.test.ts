/**
 * dd-orchestration-contract.test.ts
 *
 * Structural tests for skills/dd-orchestration/SKILL.md — the DD Orchestrator
 * (Adaptive Multi-Stage DD, Slice C step C3).
 *
 * No runtime code under test. Two properties matter most here, and both are
 * boundary conditions rather than features:
 *
 *   1. The orchestrator must NOT redefine contracts it does not own. C1
 *      (templates/dd-partition-template.md) remains the single source of truth
 *      for the context pack, the section allocation, the budgets, the generation
 *      order and the per-pass inputs; C2 owns the consolidation duties. This
 *      suite asserts the orchestrator REFERENCES them and does not restate them
 *      — a second copy would be the drift risk, not a safety net.
 *
 *   2. Its failure ladder must begin only AFTER partitioned generation has been
 *      entered. Classification and routing failures belong to the caller, and
 *      claiming them here would put a single-DD fallback inside the orchestrator,
 *      which the approved D6 rule forbids.
 *
 * No external test framework. Run with:
 *   node scripts/dd-orchestration-contract.test.ts
 *   bun  scripts/dd-orchestration-contract.test.ts
 */

import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const SKILL = join(REPO_ROOT, "skills", "dd-orchestration", "SKILL.md");
const PARTITION_CONTRACT = join(REPO_ROOT, "templates", "dd-partition-template.md");
const CONSOLIDATOR = join(REPO_ROOT, "skills", "dd-consolidation", "SKILL.md");
const DD_TEMPLATE = join(REPO_ROOT, "templates", "dd-template.md");
const DESIGN_START_CMD = join(REPO_ROOT, "commands", "dev-design-start.md");
const SCORER = join(REPO_ROOT, "scripts", "assess-dd-complexity.ts");

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

const skill = readFileSync(SKILL, "utf-8");
const partitionContract = readFileSync(PARTITION_CONTRACT, "utf-8");
const ddTemplate = readFileSync(DD_TEMPLATE, "utf-8");

/** Blockquotes stripped, whitespace collapsed — for prose assertions that wrap. */
const flat = skill.replace(/^>\s?/gm, "").replace(/\s+/g, " ");

// --- 0. Well-formed and discoverable ---------------------------------------
{
  check("0 skill file exists", existsSync(SKILL));
  check("0 has YAML frontmatter", /^---\nname: dd-orchestration\ndescription: /.test(skill));
  const desc = /^description: (.+)$/m.exec(skill)?.[1] ?? "";
  check("0 description says it is not yet wired", /NOT YET WIRED|not yet wired/i.test(desc));
  check("0 description disclaims design authority", /makes no design decision|defines no contract of its own/.test(desc));
}

// --- 1. Does NOT redefine C1's contracts (boundary clarification 1) --------
{
  // It must cite the contract as the authority…
  check("1 cites the partition contract for the context pack", /context pack \*\*as defined in\s*\n?`templates\/dd-partition-template\.md`\*\*|as defined in `templates\/dd-partition-template\.md`/.test(skill));
  check("1 names the contract the single source of truth for the pack", /single source of\s*\n?truth for what the pack contains and for its immutability|single source of truth for what the pack contains/.test(skill));
  check("1 defers per-pass inputs to the contract", /What each pass receives is defined by `templates\/dd-partition-template\.md`, not here/.test(flat));
  check("1 names the contract authoritative for inputs, allocation and budgets", /contract remains authoritative for the inputs, the section allocation, and\s*\n?the budgets|authoritative for the inputs, the section allocation, and the budgets/.test(skill));
  check("1 has a 'what this skill does not own' section", /## What this skill does not own/.test(skill));

  // …and must NOT restate it.
  check("1 no context-pack definition heading of its own", !/^##+\s+The context pack\s*$/m.test(skill));
  check("1 explicitly forbids restating the pack contents", /do not restate its\s*\n?contents here|do not restate its contents here/.test(skill));
  check("1 explicitly forbids restating the per-pass inputs", /Read the per-pass inputs from that contract; do not restate them/.test(flat));
  // The order IS named here — deliberately. The approved boundary protects the
  // context-pack contents, immutability and per-pass inputs, not the order, and
  // a skill that never names the four passes is not actionable.
  check("1 order is named so the skill is actionable", /\*\*Foundation → Behavior → Technical → Quality\*\*/.test(skill));

  // The distinctive C1 pack enumeration must not be reproduced.
  const packBullets = [
    /repository-knowledge resolution and its citation block/i,
    /evidence-sweep \*\*conclusions\*\*|sweep \*\*conclusions\*\*/,
    /resolved design reference, fetched once/i,
  ];
  const reproduced = packBullets.filter((re) => re.test(skill)).length;
  check("1 does not reproduce C1's context-pack enumeration", reproduced === 0, `${reproduced} of ${packBullets.length} C1 bullets found`);
  check("1 C1 really does still define the pack", /## The context pack/.test(partitionContract));

  // No section-allocation table of its own.
  const allocRows = (skill.match(/^\|\s*\d+\s*\|\s*[^|]+\|\s*(Foundation|Behavior|Technical|Quality)\s*\|/gm) ?? []).length;
  check("1 contains no section-allocation table", allocRows === 0, `${allocRows} allocation rows`);
  // No budget table of its own.
  const budgetRows = (skill.match(/^\|\s*(Foundation|Behavior|Technical|Quality)\s*\|\s*\d+\s*\|/gm) ?? []).length;
  check("1 contains no budget table", budgetRows === 0, `${budgetRows} budget rows`);
}

// --- 2. Sequencing: one architect, four scoped passes ---------------------
{
  check("2 same architect invoked four times", /same platform architect\*\* for the feature's single confirmed\s*\n?platform \*\*four\s*\n?times|same platform architect/.test(skill));
  check("2 explicitly not four agents", /Not four agents/.test(flat));
  check("2 four scoped passes over one context pack", /four scoped passes\s*\n?over one context pack|four scoped passes over one context pack/.test(skill));
  check("2 names all four partitions", ["Foundation", "Behavior", "Technical", "Quality"].every((p) => skill.includes(p)));
  check("2 outputs not reasoning", /\*\*outputs, never reasoning\*\*/.test(skill));
  check("2 scoped to the contract's allocation", /Scope it to exactly the sections the contract allocates/.test(flat));
  check("2 every allocated section filled or explicit N/A", /content or an explicit\s*\n?`N\/A — \[reason\]`|content or an explicit `N\/A — \[reason\]`/.test(skill));
  check("2 no cross-pass merging at this stage", /Do not merge, deduplicate, normalise or contract across passes at this stage/.test(flat));
}

// --- 3. One sweep, immutable pack ----------------------------------------
{
  check("3 one sweep only", /exactly\s*\n?once\*\*, producing the context pack|repository evidence sweep \*\*exactly/.test(skill));
  check("3 no pass may re-scan", /No pass may re-scan the repository, re-resolve repository\s*\n?knowledge, or re-fetch the design reference|No pass may re-scan the repository/.test(skill));
  check("3 pack is immutable once built", /The pack is immutable once built/.test(flat));
  check("3 never scans more than once (hard constraint)", /Never scan the repository more than once/.test(flat));
}

// --- 4. Authoritative context is never altered ---------------------------
{
  check("4 platform/device_type/design-reference are read-only", /are read-only and\s*\n?carried verbatim|read-only and carried verbatim/.test(skill));
  check("4 never re-detect, re-ask or alter", /Never re-detect,\s*\n?re-ask, or alter them|Never re-detect, re-ask, or alter them/.test(skill));
  check("4 hard constraint repeats it", /Never alter `platform`, `device_type`, or any design-reference field/.test(skill));
}

// --- 5. Consolidator invoked once, per C2 --------------------------------
{
  check("5 invokes dd-consolidation", /invoke `dd-consolidation`/.test(flat));
  check("5 exactly once, after all four passes", /When \*\*all four\*\* passes have completed, invoke `dd-consolidation` \*\*exactly\s*\n?once\*\*|invoke `dd-consolidation` \*\*exactly once\*\*/.test(skill));
  check("5 never incrementally or twice", /Never incrementally, never per pass, never twice/.test(flat));
  check("5 does not duplicate consolidator duties", /\*\*Do not duplicate any consolidator duty\.\*\*/.test(skill));
  check("5 never overrides a consolidator outcome", /Never override a consolidator outcome/.test(flat));
  check("5 the consolidator skill it cites exists", existsSync(CONSOLIDATOR));
}

// --- 6. Failure ladder starts AFTER entry (boundary clarification 2) -----
{
  check("6 ladder is scoped to post-entry", /ladder below begins only after partitioned generation has been\s*\n?entered|begins only after partitioned generation has been entered/.test(skill));
  check("6 classification/routing failure disclaimed", /Classification and routing failures occur earlier and are not the orchestrator's\s*\n?concern|Classification and routing failures occur earlier/.test(skill));
  check("6 unclassifiable features never reach this skill", /A feature that cannot be classified never reaches this skill/.test(flat));

  // The approved ladder, item by item.
  const ladder: Array<[string, RegExp]> = [
    ["retry once with tightened scope", /\*\*Retry that pass once\*\*, with tightened scope/],
    ["second failure -> hard stop", /fails a second time.*\*\*Stop the workflow and report/s],
    ["no partial canonical DD", /\*\*Never write a partial canonical DD\*\*/],
    ["no automatic single-DD fallback", /\*\*Never fall back to single-DD generation automatically\*\*/],
    ["explicit developer election only", /developer \*\*may explicitly\*\* elect the single-DD path/],
    ["never takes silence as consent", /never takes silence as consent/],
    ["contradiction -> DD stays draft", /leave `status: draft`, surface the §24 entry/],
    ["incomplete consolidation -> no DD", /\*\*Do not write the canonical DD\.\*\* Report the missing sections/],
  ];
  for (const [label, re] of ladder) check(`6 ladder: ${label}`, re.test(skill));

  // The single-DD fallback must NOT appear as an orchestrator-owned outcome.
  check(
    "6 no 'cannot be classified -> single DD' rule inside the ladder",
    !/cannot be classified.{0,80}(single[- ]DD|Single DD)/is.test(skill.split("## Failure handling")[1] ?? ""),
    "classification fallback leaked into the orchestrator's ladder"
  );
  check("6 the no-auto-fallback rationale is recorded", /recreates the\s*\n?exact failure this architecture exists to prevent|recreates the exact failure this architecture exists to prevent/.test(skill));
}

// --- 7. Budgets referenced, not redefined -------------------------------
{
  check("7 budgets read from the contract", /against the partition's budget in the contract/.test(flat));
  check("7 triggers not caps", /\*\*review triggers, not caps, and never truncation rules\*\*/.test(skill));
  check("7 pass contracts its own output", /contracts its own output before handing off/.test(flat));
  check("7 never drops a decision to fit", /never drops? a real\s*\n?design decision to fit|never drop a real design decision to fit/.test(skill));
  check("7 over-budget after contraction is not a failure", /hands off over budget and says so; that is not a failure/.test(flat));
  check("7 hard constraint: budget is not a cap", /Never treat a budget as a cap or a truncation rule/.test(skill));
}

// --- 8. C3 scope: no routing, no dd_partitions, no schema change --------
{
  check("8 declares nothing routes to it", /nothing routes to this skill/i.test(flat));
  check("8 states dev-design-start does not invoke it", /`\/dev-design-start` does not invoke it/.test(flat));
  check("8 forbids self-initiated runs", /Do not run\s*\n?this skill on your own initiative|Never run on your own initiative/.test(skill));
  check("8 introduces no dd_partitions", !/dd_partitions/.test(skill));
  check("8 introduces no doc_schema_version reference", !/doc_schema_version/.test(skill));
  check("8 never routes on the band", /\*\*Never route on the complexity band\*\*/.test(skill));
  check("8 band is advisory here", /It is \*\*advisory\*\*/.test(skill));
}

// --- 9. Slice B is untouched -------------------------------------------
{
  const scorer = readFileSync(SCORER, "utf-8");
  check("9 scorer still hard-codes single-dd routing", /routing: "single-dd"/.test(scorer));
  check("9 scorer has no partitioned routing value", !/"partitioned"/.test(scorer));
  // No Slice B threshold, cap or band value may appear as a gate in the skill.
  const numericGate = /\b(?:total|score|band)\s*(?:>=|<=|>|<|===)\s*\d+/.test(skill);
  check("9 no numeric band/threshold gate in the orchestrator", !numericGate);
  for (const n of ["12", "18"]) {
    check(`9 does not restate Slice B threshold ${n}`, !new RegExp(`(?:>=|>|total of )\\s*${n}\\b`).test(skill));
  }
  check("9 dev-design-start still does not mention the orchestrator", !/dd-orchestration/.test(readFileSync(DESIGN_START_CMD, "utf-8")));
}

// --- 10. Output shape --------------------------------------------------
{
  check("10 writes one canonical DD", /write \*\*one\*\* canonical DD/.test(flat));
  check("10 §0–§26 in template order", /sections §0–§26 in\s*\n?template order|sections §0–§26 in template order/.test(skill));
  check("10 no manifest, no package directory", /No manifest, no package directory/.test(flat));
  check("10 sets dd_generation: partitioned", /Set `dd_generation: partitioned`/.test(skill));
  check("10 declares itself the only writer of that value", /only writer of that\s*\n?value|only writer of that value/.test(skill));
  check("10 notes it is unreachable today", /unreachable in practice today/.test(flat));
  check("10 leaves status draft", /Leave `status: draft`/.test(skill));
  check("10 honours the existing-file strategy", /never blindly\s*\n?overwrite an existing DD|never blindly overwrite an existing DD/.test(skill));
}

// --- 11. Gates unchanged ----------------------------------------------
{
  check("11 adds no gate and no prompt", /\*\*The orchestrator adds no gate and no prompt\.\*\*/.test(skill));
  check("11 one human approval on the consolidated DD", /\*\*One\*\* human approval, on the consolidated DD/.test(skill));
  check("11 never a gate per partition", /Never a gate per partition/.test(flat));
  check("11 never re-asks resolved context", /Never re-ask for a design reference, a platform, a device type, or a detail\s*\n?level|Never re-ask for a design reference/.test(skill));
  check("11 never sets an approval state", /Never set or change an approval state/.test(skill));
}

// --- 12. Not an architect, and references resolve --------------------
{
  check("12 declared a sequencer, not an architect", /\*\*The orchestrator is a sequencer, not an architect\.\*\*/.test(skill));
  check("12 never makes a design decision", /\*\*Never make a design decision\.\*\*/.test(skill));
  check("12 escalates or stops instead of deciding", /it escalates or stops instead/.test(flat));
  check("12 has preconditions it verifies but does not repair", /it does not repair them/.test(flat));
  check("12 has a Hard constraints section", /## Hard constraints/.test(skill));
  const constraints = (skill.split("## Hard constraints")[1] ?? "").match(/^- \*\*Never /gm)?.length ?? 0;
  check(`12 constraints stated as Never rules (${constraints})`, constraints >= 10, String(constraints));

  const ddSections = new Set([...ddTemplate.matchAll(/^##\s+(\d+)\./gm)].map((m) => Number(m[1])));
  const unknown = [...new Set([...skill.matchAll(/§(\d+)/g)].map((m) => Number(m[1])))].filter((n) => !ddSections.has(n));
  check("12 every §N referenced exists in dd-template.md", unknown.length === 0, unknown.join(", "));
  for (const rel of [
    "templates/dd-partition-template.md",
    "skills/dd-consolidation/SKILL.md",
    "skills/dev-design-start/SKILL.md",
    "docs/planning/ADAPTIVE_MULTI_STAGE_DD_GENERATION_DESIGN.md",
  ]) {
    check(`12 cited path exists: ${rel}`, existsSync(join(REPO_ROOT, rel)));
  }
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
