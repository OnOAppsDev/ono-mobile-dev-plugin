/**
 * dd-consolidation-contract.test.ts
 *
 * Structural tests for skills/dd-consolidation/SKILL.md — the DD Consolidator
 * (Adaptive Multi-Stage DD, Slice C step C2).
 *
 * No runtime code under test. This suite guards the consolidator's LIMITS,
 * because it is the only component permitted to delete or rewrite another
 * component's output. It asserts:
 *
 *   - all six design-document responsibilities are present
 *   - the resolve/escalate boundary is explicit, and escalation is restricted to
 *     genuine semantic contradictions — duplication, wording, terminology,
 *     stale counts and broken references must be resolved, never escalated
 *   - the fact -> owner mapping matches templates/dd-partition-template.md
 *     EXACTLY, so the two contracts cannot drift into disagreeing about ownership
 *   - contraction reuses the Step 7 gates rather than defining new size rules
 *   - it produces one canonical DD and introduces no routing, no dd_partitions,
 *     and no schema change
 *
 * No external test framework. Run with:
 *   node scripts/dd-consolidation-contract.test.ts
 *   bun  scripts/dd-consolidation-contract.test.ts
 */

import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const SKILL = join(REPO_ROOT, "skills", "dd-consolidation", "SKILL.md");
const PARTITION_CONTRACT = join(REPO_ROOT, "templates", "dd-partition-template.md");
const DD_TEMPLATE = join(REPO_ROOT, "templates", "dd-template.md");
const DD_SKILL = join(REPO_ROOT, "skills", "dev-design-start", "SKILL.md");

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
const ddSkill = readFileSync(DD_SKILL, "utf-8");

/** Blockquotes stripped and whitespace collapsed, for prose assertions that wrap. */
const flat = skill.replace(/^>\s?/gm, "").replace(/\s+/g, " ");

// --- 0. Skill is well-formed and discoverable -------------------------------
{
  check("0 skill file exists", existsSync(SKILL));
  check("0 has YAML frontmatter", /^---\nname: dd-consolidation\ndescription: /.test(skill));
  const desc = /^description: (.+)$/m.exec(skill)?.[1] ?? "";
  check("0 description states it is not yet invoked", /NOT YET INVOKED|not yet invoked/i.test(desc), desc.slice(0, 80));
  check("0 description names the escalate-not-decide boundary", /never decided here|escalated to §24/.test(desc));
}

// --- 1. All six design-document responsibilities ----------------------------
{
  const duties = [
    ["Remove duplication", /Remove duplication/],
    ["Resolve contradictions", /Resolve contradictions/],
    ["Enforce terminology", /Enforce terminology/],
    ["Validate cross references", /Validate cross references/],
    ["Execute contraction pass", /Execute (the )?contraction pass/],
    ["Produce the final DD package", /Produce the final DD package/],
  ] as const;
  for (const [label, re] of duties) check(`1 duty present: ${label}`, re.test(skill));
  const headings = [...skill.matchAll(/^## Duty (\d) — /gm)].map((m) => Number(m[1]));
  check("1 six numbered duty sections exist", JSON.stringify(headings) === JSON.stringify([1, 2, 3, 4, 5, 6]), JSON.stringify(headings));
}

// --- 2. fact -> owner mapping matches the partition contract EXACTLY --------
{
  /**
   * Scoped to a single table, because both documents contain other tables whose
   * rows have the same shape — the partition contract's escalation protocol
   * (`| A risk | Quality §22 |`) would otherwise be misread as an ownership row.
   */
  const sliceBetween = (text: string, startRe: RegExp, endRe: RegExp) => {
    const start = text.search(startRe);
    if (start === -1) return "";
    const rest = text.slice(start);
    const end = rest.slice(1).search(endRe);
    return end === -1 ? rest : rest.slice(0, end + 1);
  };

  /** `**The context pack** — no pass` and `The context pack` are the same owner. */
  const normalizeOwner = (cell: string) =>
    cell.replace(/\*/g, "").split("—")[0].replace(/`/g, "").trim();

  const parseOwners = (region: string) => {
    const map = new Map<string, string>();
    for (const m of region.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm)) {
      const fact = m[1].replace(/`/g, "").trim();
      const owner = normalizeOwner(m[2]);
      if (/^[-:\s|]+$/.test(fact) || /^Fact$/i.test(fact)) continue; // header / separator
      if (!/^(Foundation|Behavior|Technical|Quality)\s*§|^The context pack$/.test(owner)) continue;
      map.set(fact, owner);
    }
    return map;
  };

  const contractOwners = parseOwners(
    sliceBetween(partitionContract, /^## Cross-cutting ownership$/m, /^### §11 and §21/m)
  );
  const skillOwners = parseOwners(
    sliceBetween(skill, /^## Duty 1 — Remove duplication$/m, /^### §11 and §21$/m)
  );
  check("2 partition-contract ownership rows parsed", contractOwners.size >= 13, `${contractOwners.size}`);
  check("2 consolidator ownership rows parsed", skillOwners.size >= 13, `${skillOwners.size}`);

  const mismatched: string[] = [];
  const unknownFact: string[] = [];
  for (const [fact, owner] of skillOwners) {
    if (!contractOwners.has(fact)) unknownFact.push(fact);
    else if (contractOwners.get(fact) !== owner) mismatched.push(`"${fact}": contract=${contractOwners.get(fact)} skill=${owner}`);
  }
  check("2 every fact the consolidator cites exists in the partition contract", unknownFact.length === 0, unknownFact.join(" | "));
  check("2 every owner matches the partition contract exactly", mismatched.length === 0, mismatched.join(" | "));

  const missing = [...contractOwners.keys()].filter((f) => !skillOwners.has(f));
  check("2 the consolidator covers every owned fact", missing.length === 0, missing.join(" | "));
}

// --- 3. The resolve / escalate boundary -------------------------------------
{
  check("3 a decision test is stated", /### The decision test/.test(skill));
  check("3 the test hinges on choosing between design positions", /without choosing between two design positions/.test(flat));
  check("3 mechanical conflicts are resolved", /### Resolve mechanically — never escalate these/.test(skill));
  check("3 semantic contradictions escalate", /### Escalate — genuine semantic contradictions only/.test(skill));
  check("3 escalation is declared the rare exception", /Escalation is the rare exception/.test(flat));

  // The five classes the approved clarification says must NOT escalate.
  const mustResolve: Array<[string, RegExp]> = [
    ["duplicate statements", /The same fact stated twice/],
    ["wording differences", /Wording, phrasing, tone or formatting differences/],
    ["terminology normalisation", /Two words for one concept/],
    ["stale counts", /A stale count or figure disagreeing with its owner/],
    ["broken references", /A `§N` reference pointing at the wrong or a renumbered section/],
  ];
  for (const [label, re] of mustResolve) check(`3 must be resolved, not escalated: ${label}`, re.test(skill));
  check("3 escalating a mechanical conflict is called a defect", /Escalating a mechanically resolvable conflict blocks a DD that was never blocked, and that is a defect/.test(flat));
  check("3 over-escalation is called as harmful as under-escalation", /as harmful in practice as failing to escalate a real one/.test(flat));
}

// --- 4. Escalation mechanics ------------------------------------------------
{
  check("4 escalation target is §24", /§24 Open Questions/.test(skill));
  check("4 both positions recorded verbatim", /verbatim, both positions and their\s*\n?sources|verbatim, both positions/.test(skill));
  check("4 a CONTRADICTION marker format is given", /\[CONTRADICTION — /.test(skill));
  check("4 the DD is left draft", /leave the DD `status: draft`/.test(flat));
  check("4 never picks a side", /\*\*Never pick a side\.\*\*/.test(skill));
  check("4 never compromises or softens", /Never merge two incompatible positions into a compromise/i.test(flat));
  check("4 never drops the weaker position", /never drop the weaker one/.test(flat));
}

// --- 5. Duplication removal is safe ----------------------------------------
{
  check("5 never deletes a fact appearing once", /\*\*Never delete a fact that appears only once\*\*/.test(skill));
  check("5 a misplaced fact is moved, not dropped", /is \*moved to its owner\*, not dropped/.test(flat));
  check("5 deleting a unique decision is named the worst failure", /worst failure this skill can produce/.test(flat));
  check("5 §11/§21 rule carried through", /may appear in §21 \*\*only with a change\s*\n?description\*\*|only with a change description/.test(skill));
  check("5 strips dependency metadata from §21", /Strip dependency metadata .*from §21/s.test(skill));
  check("5 strips impact assessments from §11", /Strip impact assessments from §11/.test(flat));
  check("5 a dual-purpose statement is split, not duplicated", /\*\*split between them, never duplicated\*\*/.test(skill));
}

// --- 6. Contraction reuses the existing Step 7 gates -----------------------
{
  check("6 cites the DD skill's Step 7", /skills\/dev-design-start\/SKILL\.md` Step 7/.test(skill));
  check("6 names the exclusion table and inclusion test", /exclusion table and its inclusion test/.test(flat));
  check("6 defines no new size rule", /\*\*Define no new size rule here\.\*\*/.test(skill));
  check("6 never removes a decision to hit a budget", /Never remove a real design decision to satisfy a budget/.test(skill));
  check("6 never truncates", /never truncate/.test(flat));
  // The ~800 trigger must be referenced, not redefined: parse it from the DD skill.
  const trigger = /~(\d{3,4}) lines/.exec(ddSkill)?.[1];
  check("6 the DD skill still defines a line trigger", !!trigger, String(trigger));
  if (trigger) check(`6 the consolidator refers to the same ~${trigger} trigger`, new RegExp(`~${trigger}-line trigger`).test(skill));
}

// --- 7. Output shape -------------------------------------------------------
{
  check("7 produces one canonical DD", /\*\*One file\.\*\* No manifest, no package directory/.test(skill));
  check("7 assembles §0–§26 in template order", /sections §0–§26 in\s*\n?template order/.test(skill));
  check("7 every section filled or explicit N\\/A", /content or an explicit `N\/A — \[reason\]`/.test(skill));
  check("7 writes ## Approval as the assembling step", /Write `## Approval` as the assembling step/.test(skill));
  check("7 leaves status draft", /Leave `status: draft`/.test(skill));
  check("7 adds nothing no partition produced", /\*\*Add nothing no partition produced\.\*\*/.test(skill));
  check("7 never produces a partial canonical DD", /[Nn]ever produce a partial canonical DD/.test(skill));
}

// --- 8. Cross-references resolve --------------------------------------------
{
  const ddSections = new Set([...ddTemplate.matchAll(/^##\s+(\d+)\./gm)].map((m) => Number(m[1])));
  const referenced = [...skill.matchAll(/§(\d+)/g)].map((m) => Number(m[1]));
  const unknown = [...new Set(referenced)].filter((n) => !ddSections.has(n));
  check("8 every §N referenced exists in dd-template.md", unknown.length === 0, unknown.join(", "));
  for (const rel of ["templates/dd-partition-template.md", "skills/dev-design-start/SKILL.md", "templates/dd-template.md"]) {
    check(`8 cited file exists: ${rel}`, existsSync(join(REPO_ROOT, rel)));
  }
  check("8 the design document link resolves", existsSync(join(REPO_ROOT, "docs", "planning", "ADAPTIVE_MULTI_STAGE_DD_GENERATION_DESIGN.md")));
  check("8 never invents a reference", /Never invent a reference, a path, or a standard\s*\n?ID|Never invent a reference, path or standard ID/.test(skill));
  check("8 fixed numbering restated", /Never renumber, merge, split or delete a\s*\n?section heading|Never renumber, merge, split or delete a section heading/.test(skill));
}

// --- 9. C2 scope: no routing, no schema change, no dd_partitions -----------
{
  check("9 declares partitioned generation not implemented", /partitioned generation is not implemented/i.test(flat));
  check("9 states there is no orchestrator and no routing", /There is no orchestrator and no routing/.test(flat));
  check("9 states dd_generation is always single", /`dd_generation` is always `single`/.test(flat));
  check("9 introduces no dd_partitions field", !/dd_partitions/.test(skill));
  check("9 introduces no doc_schema_version change", !/doc_schema_version/.test(skill));
  check("9 does not claim to route anything", !/route(s)? (the |a )?(feature|generation)/i.test(skill));
}

// --- 10. The never-design guarantee ----------------------------------------
{
  check("10 declared a merge step, not an author", /\*\*The consolidator is a merge step, not an author\.\*\*/.test(skill));
  check("10 never invents a product or architectural decision", /[Nn]ever invent a product or architectural decision/.test(skill));
  check("10 never rewrites approved Feature Analysis content", /Never rewrite approved Feature Analysis content/.test(skill));
  check("10 never alters platform/device_type/design reference", /Never alter `platform`, `device_type`, or any design-reference field/.test(skill));
  check("10 never sets or changes approval state", /Never set or change an approval state/.test(skill));
  check("10 writes only into the canonical DD", /never write into any\s*\n?document other than the canonical DD|never write into any document other than the canonical DD/.test(skill));
  check("10 has a Hard constraints section", /## Hard constraints/.test(skill));
  const constraints = (skill.split("## Hard constraints")[1] ?? "").match(/^- \*\*Never /gm)?.length ?? 0;
  check(`10 hard constraints are stated as Never rules (${constraints})`, constraints >= 10, String(constraints));
}

// --- 11. Reporting is mandatory --------------------------------------------
{
  check("11 a reporting section exists", /## Reporting/.test(skill));
  check("11 silent consolidation is forbidden", /\*\*Silent consolidation is not acceptable\*\*/.test(skill));
  check("11 the report covers what was removed and who owns it", /which document owns it/.test(flat));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
