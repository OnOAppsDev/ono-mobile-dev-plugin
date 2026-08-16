/**
 * dd-partition-contract.test.ts
 *
 * Structural tests for templates/dd-partition-template.md — the DD partition
 * contract used by partitioned Detailed Design generation (Adaptive
 * Multi-Stage DD, Slice C step C1).
 *
 * This suite has no runtime code under test. It guards the CONTRACT against
 * drift, because the orchestrator and consolidator will both be built against
 * it and a silent change to the allocation would let them disagree about who
 * owns a section. Specifically it asserts:
 *
 *   - every one of §0–§26 is allocated to exactly one partition
 *   - the section TITLES match templates/dd-template.md verbatim, so renaming a
 *     DD section cannot silently desynchronise the allocation
 *   - `## Approval` is allocated to nobody
 *   - per-partition section counts agree with the budget table
 *   - budgets sum to the stated combined total, and that total sits below the
 *     mandatory contraction trigger in skills/dev-design-start/SKILL.md
 *   - the §11 / §21 separation rules are present and mutually exclusive
 *   - the contract still declares partitioned generation unimplemented
 *
 * No external test framework. Run with:
 *   node scripts/dd-partition-contract.test.ts
 *   bun  scripts/dd-partition-contract.test.ts
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const CONTRACT = join(REPO_ROOT, "templates", "dd-partition-template.md");
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

const contract = readFileSync(CONTRACT, "utf-8");
const ddTemplate = readFileSync(DD_TEMPLATE, "utf-8");
const ddSkill = readFileSync(DD_SKILL, "utf-8");

const PARTITIONS = ["Foundation", "Behavior", "Technical", "Quality"] as const;

/**
 * Blockquote markers stripped and all whitespace collapsed, so prose assertions
 * survive reflowing and line wrapping. Structural assertions still run against
 * the raw text, where line boundaries matter.
 */
const flat = contract.replace(/^>\s?/gm, "").replace(/\s+/g, " ");

// --- parse the allocation table ---------------------------------------------
interface Row {
  section: number;
  title: string;
  partition: string;
}
const allocation: Row[] = [];
for (const m of contract.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([A-Za-z]+)\s*\|/gm)) {
  allocation.push({ section: Number(m[1]), title: m[2].trim(), partition: m[3].trim() });
}

// --- parse the budget table -------------------------------------------------
const budgets: Array<{ partition: string; budget: number; sections: number }> = [];
for (const m of contract.matchAll(/^\|\s*\**([A-Za-z]+)\**\s*\|\s*\**(\d+)\**\s*\|\s*\**(\d+)\**\s*\|/gm)) {
  budgets.push({ partition: m[1].trim(), budget: Number(m[2]), sections: Number(m[3]) });
}
const budgetOf = (p: string) => budgets.find((b) => b.partition === p);
const combined = budgets.find((b) => /^Combined$/i.test(b.partition));

// --- parse dd-template.md's real section inventory --------------------------
const ddSections = new Map<number, string>();
for (const m of ddTemplate.matchAll(/^##\s+(\d+)\.\s+(.+?)\s*$/gm)) {
  ddSections.set(Number(m[1]), m[2].trim());
}

// --- 1. Allocation completeness and exclusivity -----------------------------
{
  check("1 allocation table parsed", allocation.length > 0, `${allocation.length} rows`);
  const seen = new Map<number, string[]>();
  for (const r of allocation) {
    if (!seen.has(r.section)) seen.set(r.section, []);
    (seen.get(r.section) as string[]).push(r.partition);
  }
  const missing: number[] = [];
  const duplicated: string[] = [];
  for (let n = 0; n <= 26; n++) {
    const owners = seen.get(n);
    if (!owners) missing.push(n);
    else if (owners.length > 1) duplicated.push(`§${n} -> ${owners.join(", ")}`);
  }
  check("1 all 27 sections §0–§26 are allocated", missing.length === 0, `missing: ${missing.map((n) => "§" + n).join(", ")}`);
  check("1 no section is allocated twice", duplicated.length === 0, duplicated.join(" | "));
  check("1 allocation has exactly 27 rows", allocation.length === 27, String(allocation.length));
  const bad = allocation.filter((r) => !(PARTITIONS as readonly string[]).includes(r.partition));
  check("1 every partition name is one of the four", bad.length === 0, bad.map((r) => `§${r.section}=${r.partition}`).join(", "));
}

// --- 2. Titles match dd-template.md verbatim (drift guard) ------------------
{
  check("2 dd-template.md section inventory parsed", ddSections.size === 27, `${ddSections.size} numbered sections`);
  const mismatched: string[] = [];
  for (const r of allocation) {
    const real = ddSections.get(r.section);
    if (real !== r.title) mismatched.push(`§${r.section}: contract "${r.title}" vs template "${real}"`);
  }
  check("2 every allocated title matches dd-template.md exactly", mismatched.length === 0, mismatched.join(" | "));
}

// --- 3. `## Approval` is unowned -------------------------------------------
{
  check("3 dd-template.md really has an unnumbered Approval heading", /^##\s+Approval\s*$/m.test(ddTemplate));
  const claimed = allocation.some((r) => /approval/i.test(r.title));
  check("3 no partition is allocated an Approval section", !claimed);
  check("3 the contract states Approval is unowned", /`## Approval` is deliberately unowned/.test(flat));
  check("3 …and forbids a pass from producing it", /[Nn]ever let a pass produce `## Approval`|No partition may produce it/.test(flat));
}

// --- 4. Budgets agree with the allocation ----------------------------------
{
  for (const p of PARTITIONS) {
    const b = budgetOf(p);
    const actual = allocation.filter((r) => r.partition === p).length;
    check(`4 ${p} has a budget row`, b !== undefined);
    if (b) check(`4 ${p} section count (${b.sections}) matches the allocation (${actual})`, b.sections === actual, `${b.sections} vs ${actual}`);
  }
  check("4 a Combined row exists", combined !== undefined);
  if (combined) {
    const sum = PARTITIONS.reduce((a, p) => a + (budgetOf(p)?.budget ?? 0), 0);
    const sections = PARTITIONS.reduce((a, p) => a + (budgetOf(p)?.sections ?? 0), 0);
    check(`4 partition budgets sum to the combined total (${sum} vs ${combined.budget})`, sum === combined.budget, `${sum} vs ${combined.budget}`);
    check(`4 partition section counts sum to 27 (${sections})`, sections === 27, String(sections));
    check("4 combined section count is 27", combined.sections === 27, String(combined.sections));
  }
}

// --- 5. The combined budget sits below the contraction trigger -------------
{
  // Parsed from the DD skill so a change there breaks this, rather than being
  // hard-coded here where the two could drift apart silently.
  const trigger = Number(/(\d{3,4}) lines/.exec(/Above \*\*~(\d{3,4}) lines/.exec(ddSkill)?.[0] ?? "")?.[1] ?? /~(\d{3,4}) lines/.exec(ddSkill)?.[1]);
  check("5 the contraction trigger was found in the DD skill", Number.isFinite(trigger) && trigger > 0, String(trigger));
  if (combined && Number.isFinite(trigger)) {
    check(`5 combined budget (${combined.budget}) is below the contraction trigger (${trigger})`, combined.budget < trigger, `${combined.budget} vs ${trigger}`);
  }
  check("5 the contract states budgets are triggers, not caps", /triggers, not caps, and never truncation rules/.test(contract));
  check("5 the contract forbids dropping a decision to fit", /never drop a real design decision to fit/.test(contract));
}

// --- 6. §11 / §21 separation is explicit and mutually exclusive ------------
{
  check("6 §11 and §21 are both owned by Technical", allocation.find((r) => r.section === 11)?.partition === "Technical" && allocation.find((r) => r.section === 21)?.partition === "Technical");
  check("6 a dedicated §11 vs §21 section exists", /§11 and §21 are different questions about the same services/.test(contract));
  check("6 §11 owns the dependency inventory", /Service \/ SDK dependency inventory \| Technical §11/.test(contract));
  check("6 §21 owns the change impact", /Service change impact \| Technical §21/.test(contract));
  check("6 §11 is forbidden from carrying impact", /Must never contain\*\* \| What changes in a service, or any impact assessment/.test(contract));
  check("6 §21 is forbidden from carrying an inventory", /A dependency listing, a version, a config surface, or an SDK inventory/.test(contract));
  check("6 the reappearance rule is stated", /may reappear in §21 only with a change description/.test(flat));
  check("6 §21 may name a non-dependency service", /§21 may name a service that is not in §11/.test(flat));
  check("6 the rely-on vs happens-to test is stated", /what do we rely on.*belongs in §11.*what happens to it.*belongs in §21/.test(flat));
}

// --- 7. Ownership table integrity -----------------------------------------
{
  const ownerRows = [...contract.matchAll(/^\|\s*([^|]+?)\s*\|\s*(Foundation|Behavior|Technical|Quality|\*\*The context pack\*\*[^|]*)\s*(§[\d/]+)?\s*\|\s*([^|]+?)\s*\|$/gm)];
  check("7 ownership rows parsed", ownerRows.length >= 13, `${ownerRows.length} rows`);
  const referenced = [...contract.matchAll(/Foundation §(\d+)|Behavior §(\d+)|Technical §(\d+)|Quality §(\d+)/g)]
    .map((m) => Number(m[1] ?? m[2] ?? m[3] ?? m[4]));
  const unknown = referenced.filter((n) => !ddSections.has(n));
  check("7 every § referenced in ownership rows exists in dd-template.md", unknown.length === 0, unknown.join(", "));
  const wrongOwner = [...contract.matchAll(/(Foundation|Behavior|Technical|Quality) §(\d+)/g)].filter((m) => {
    const row = allocation.find((r) => r.section === Number(m[2]));
    return row && row.partition !== m[1];
  });
  check(
    "7 ownership rows attribute each § to its allocated partition",
    wrongOwner.length === 0,
    wrongOwner.map((m) => `${m[1]} §${m[2]}`).join(", ")
  );
}

// --- 8. Escalation protocol and generation order --------------------------
{
  check("8 an escalation protocol exists", /## Escalation protocol/.test(contract));
  for (const target of ["Foundation §23", "Quality §22", "Quality §24"]) {
    check(`8 escalation routes to ${target}`, contract.includes(target));
  }
  check("8 a pass never resolves a contradiction itself", /A pass never resolves a contradiction it discovers/.test(contract));
  check("8 generation order is declared sequential", /\*\*Strictly sequential\.\*\*/.test(contract));
  const order = ["Foundation", "Behavior", "Technical", "Quality"];
  const rows = [...contract.matchAll(/^\|\s*[1-4]\s*\|\s*(Foundation|Behavior|Technical|Quality)\s*\|/gm)].map((m) => m[1]);
  check("8 the order table lists all four passes in dependency order", JSON.stringify(rows) === JSON.stringify(order), JSON.stringify(rows));
}

// --- 9. The contract must still declare itself unimplemented --------------
{
  check("9 declares partitioned generation not implemented", /partitioned generation is not implemented/i.test(flat));
  check("9 states there is no orchestrator/consolidator/routing yet", /no orchestrator, no consolidator, and no routing/.test(flat));
  check("9 states dd_generation is always single", /`dd_generation` is always `single`/.test(flat));
  check("9 no dd_partitions field is introduced by this contract", !/dd_partitions/.test(contract));
}

// --- 10. Cross-references that other components rely on -------------------
{
  check("10 the fixed-numbering rule is restated", /Never renumber, merge, split or delete a section heading/.test(contract));
  for (const s of ["§19", "§20", "§25", "§26"]) {
    check(`10 ${s} is named as externally cross-referenced`, new RegExp(`${s}[,\\s]`).test(contract));
  }
  check("10 one-sweep rule is stated", /one sweep, one context pack, four readers/i.test(contract));
  check("10 no-partial-DD rule is stated", /[Nn]ever produce a partial canonical DD/.test(contract));
  check("10 no silent single-DD fallback", /does not silently fall back to single-DD/.test(contract));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
