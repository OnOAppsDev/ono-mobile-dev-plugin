/**
 * bug-work-plan.test.ts
 *
 * Pins Bug Development Flow Step 2: the `bug-work-plan` planning-document kind (v1) — its
 * frontmatter, fixed section layout, task-row reuse, append-friendly fix cycles, body and
 * section fingerprints, and its place in the planning-document migration framework.
 * Contract only: nothing here generates, approves or implements a plan.
 *
 *   node --no-warnings scripts/bug-work-plan.test.ts
 */

import { spawnSync } from "child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as Plan from "./bug-work-plan.ts";
import { CURRENT_SCHEMA_VERSION, fingerprintBody, migratePlanningDoc, splitDocument } from "./migrate-planning-doc.ts";
import { sectionFingerprints } from "./task-resume.ts";
import { parseBreakdown } from "./task-state.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const FIXTURES = join(HERE, "fixtures/bug-work-plans");

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf-8");
const sha = (s: string | Buffer) => `sha256:${createHash("sha256").update(s).digest("hex")}`;
const api = Plan as any;
const CYCLE1 = readFileSync(join(FIXTURES, "bwp-cycle1.md"), "utf-8");
const CYCLE2 = readFileSync(join(FIXTURES, "bwp-cycle2.md"), "utf-8");
const V = (doc: string) => api.validateBugWorkPlan?.(Buffer.from(doc, "utf-8"));
const codes = (r: any): string[] => (r?.errors ?? []).map((e: any) => e.code);
const show = (r: any) => JSON.stringify(r?.errors ?? r);
/** Replace exactly one occurrence, so a fixture edit can never silently miss. */
function edit(doc: string, from: string | RegExp, to: string): string {
  const hits = typeof from === "string" ? doc.split(from).length - 1 : (doc.match(new RegExp(from.source, from.flags.includes("g") ? from.flags : from.flags + "g")) ?? []).length;
  if (hits !== 1) throw new Error(`fixture edit expected exactly one match for ${String(from)}, found ${hits}`);
  return doc.replace(from, to);
}
const SECTIONS = [
  "Reproduction Evidence", "Observed vs Expected", "Affected Capability & Surfaces", "Root Cause", "Blast Radius",
  "Fix Design", "Verification Strategy", "Tasks", "Fix Cycles", "Repo Knowledge Reference", "Open Questions",
];

/* ── 1–3. the kind, its version, and the existing kinds ───────────────── */
{
  check("1 bug-work-plan is a planning-document kind", "bug-work-plan" in CURRENT_SCHEMA_VERSION);
  check("2 bug-work-plan is at v1", (CURRENT_SCHEMA_VERSION as any)["bug-work-plan"] === 1 && api.BUG_WORK_PLAN_VERSION === 1);
  check("3 existing kinds are unchanged", JSON.stringify(Object.entries(CURRENT_SCHEMA_VERSION).filter(([k]) => k !== "bug-work-plan")) ===
    JSON.stringify([["feature-analysis", 3], ["dd", 2], ["dev-plan", 1], ["task-breakdown", 1]]));
  check("1 the artifact path is docs/bugs/<bug_key>/bug-work-plan.md", api.bugWorkPlanPath?.("BUG-43") === "docs/bugs/BUG-43/bug-work-plan.md");
  check("1 an unsafe bug_key never becomes a path", api.bugWorkPlanPath?.("../etc") === null && api.bugWorkPlanPath?.("a/b") === null);
  const contract = read("docs/planning-doc-contract.md");
  check("2 the planning-doc contract's version table records bug-work-plan = 1", /^\|\s*`bug-work-plan`\s*\|\s*1\s*\|/m.test(contract));
}

/* ── 4–6. fixed section layout ───────────────────────────────────────── */
{
  const r = V(CYCLE1);
  check("15 a cycle-1 plan validates", r?.ok === true && r.errors.length === 0, show(r));
  check("4 the sections are exactly the fixed eleven, in order", JSON.stringify(api.BUG_WORK_PLAN_SECTIONS) === JSON.stringify(SECTIONS));
  check("4 the parsed plan reports them in order", JSON.stringify(r?.sections?.map((s: any) => s.heading)) === JSON.stringify(SECTIONS));
  for (const s of ["Root Cause", "Fix Design", "Open Questions"]) {
    const start = CYCLE1.indexOf(`\n## ${s}\n`);
    const next = CYCLE1.indexOf("\n## ", start + 1);
    const without = CYCLE1.slice(0, start) + (next === -1 ? "\n" : CYCLE1.slice(next));
    const m = V(without);
    check(`5 missing "${s}" is rejected`, m?.ok === false && m.errors.some((e: any) => e.code === "SECTION_MISSING" && e.message.includes(s)), show(m));
  }
  const dup = V(edit(CYCLE1, "## Open Questions\n", "## Root Cause\n\nAgain.\n\n## Open Questions\n"));
  check("6 a duplicate required section is rejected", dup?.ok === false && codes(dup).includes("SECTION_DUPLICATE"), show(dup));
  const swapped = V(edit(edit(edit(CYCLE1, "## Root Cause\n", "## @@\n"), "## Blast Radius\n", "## Root Cause\n"), "## @@\n", "## Blast Radius\n"));
  check("4 sections out of order are rejected", swapped?.ok === false && codes(swapped).includes("SECTION_ORDER"), show(swapped));
  const extra = V(edit(CYCLE1, "## Reproduction Evidence\n", "## Identity\n\nBUG-43\n\n## Reproduction Evidence\n"));
  check("4 identity is frontmatter, not a body section — an extra section is rejected", extra?.ok === false && codes(extra).includes("SECTION_UNEXPECTED"), show(extra));
  const fenced = V(edit(CYCLE1, "## Open Questions\n\n- None.\n", "## Open Questions\n\n```md\n## Root Cause\n```\n"));
  check("4 a heading inside a code fence is not a section", fenced?.ok === true, show(fenced));
}

/* ── 7–13. frontmatter ───────────────────────────────────────────────── */
{
  for (const bad of ["doc_schema_version: 2\n", "doc_schema_version: 0\n", ""]) {
    const r = V(edit(CYCLE1, "doc_schema_version: 1\n", bad));
    check(`2 the validator accepts only v1 (${JSON.stringify(bad.trim() || "unstamped")})`, r?.ok === false && codes(r).includes("SCHEMA_VERSION"), show(r));
  }
  const w = V(edit(CYCLE1, "work_type: bug\n", "work_type: feature\n"));
  check("7 work_type must be bug", w?.ok === false && codes(w).includes("WORK_TYPE"), show(w));
  const wMissing = V(edit(CYCLE1, "work_type: bug\n", ""));
  check("7 work_type is required", wMissing?.ok === false && codes(wMissing).includes("WORK_TYPE"));
  const k = V(edit(CYCLE1, "bug_key: BUG-43\n", "bug_key:\n"));
  check("8 bug_key is required", k?.ok === false && k.errors.some((e: any) => e.code === "MISSING_FIELD" && /bug_key/.test(e.message)), show(k));
  const kUnsafe = V(edit(CYCLE1, "bug_key: BUG-43\n", "bug_key: ../BUG-43\n"));
  check("8 an unsafe bug_key is rejected", kUnsafe?.ok === false && codes(kUnsafe).includes("INVALID_FIELD"));
  const kRule = V(edit(CYCLE1, "bug_key: BUG-43\n", "bug_key: PAY-1182\n"));
  check("8 bug_key follows the intake rule (QA id first)", kRule?.ok === false && codes(kRule).includes("IDENTITY_MISMATCH"), show(kRule));
  for (const [bad, label] of [["", "missing"], ["sha256:abc", "short"], ["md5:95d68ae65a0758e098e12de059aec106752c1c4e0e21502486395fefce9633b6", "not sha256"], ["sha256:95D68AE65A0758E098E12DE059AEC106752C1C4E0E21502486395FEFCE9633B6", "uppercase"]]) {
    const f = V(edit(CYCLE1, /^bug_evidence_fingerprint: .*$/m, `bug_evidence_fingerprint: ${bad}`.trimEnd()));
    check(`9 bug_evidence_fingerprint ${label} is rejected`, f?.ok === false && f.errors.some((e: any) => /bug_evidence_fingerprint/.test(e.message)), show(f));
  }
  check("9 a valid sha256 fingerprint is carried", V(CYCLE1)?.frontmatter?.bug_evidence_fingerprint === "sha256:95d68ae65a0758e098e12de059aec106752c1c4e0e21502486395fefce9633b6");
  const noCycle = V(edit(CYCLE1, "fix_cycle: 1\n", ""));
  check("10 fix_cycle defaults to 1", noCycle?.ok === true && noCycle.frontmatter.fix_cycle === 1, show(noCycle));
  check("10 fix_cycle 1 is accepted", V(CYCLE1)?.frontmatter?.fix_cycle === 1);
  for (const bad of ["0", "2", "x", "1.5"]) {
    const c = V(edit(CYCLE1, "fix_cycle: 1\n", `fix_cycle: ${bad}\n`));
    check(`10 fix_cycle ${bad} on a plan with no further cycles is rejected`, c?.ok === false && c.errors.some((e: any) => /fix_cycle/.test(e.message)), show(c));
  }
  check("11 status draft is accepted", V(CYCLE1)?.frontmatter?.status === "draft");
  const st = V(edit(CYCLE1, "status: draft\n", "status: proposed\n"));
  check("11 an unknown status is rejected", st?.ok === false && st.errors.some((e: any) => /status/.test(e.message)));
  const reserved = V(edit(edit(edit(CYCLE1, "approved_by: null\n", "approved_by: dana\n"),
    "approved_fingerprint: null\n", "approved_fingerprint: sha256:1111111111111111111111111111111111111111111111111111111111111111\n"), "approved_cycle: null\n", "approved_cycle: 1\n"));
  check("12 reserved approval fields parse, with no approval semantics (still a draft)",
    reserved?.ok === true && reserved.frontmatter.approved_by === "dana" && reserved.frontmatter.approved_cycle === 1 && reserved.frontmatter.status === "draft" &&
      reserved.frontmatter.approved_fingerprint === "sha256:1111111111111111111111111111111111111111111111111111111111111111", show(reserved));
  check("12 reserved approval fields default to explicit null", JSON.stringify([V(CYCLE1)?.frontmatter?.approved_by, V(CYCLE1)?.frontmatter?.approved_fingerprint, V(CYCLE1)?.frontmatter?.approved_cycle]) === "[null,null,null]");
  const badApproved = V(edit(CYCLE1, "approved_fingerprint: null\n", "approved_fingerprint: yes\n"));
  check("12 a reserved field still has a syntax", badApproved?.ok === false);
  check("12 the reserved approval fields are declared", ["approved_by", "approved_fingerprint", "approved_cycle"].every((f) => api.BUG_WORK_PLAN_FIELDS?.includes(f)));

  // 13 — nullable QA and external identity, kept explicit.
  const devKey = `DEV-${createHash("sha256").update(["production", "Checkout total ignores coupon", "Add an item to the cart"].join("\n")).digest("hex").slice(0, 8)}`;
  const dev = edit(edit(edit(edit(CYCLE1, "bug_key: BUG-43\n", `bug_key: ${devKey}\n`), "qa_bug_id: BUG-43\n", "qa_bug_id: null\n"), "external_ref: PAY-1182\n", "external_ref: null\n"), "origin: qa-standalone\n", "origin: production\n");
  const d = V(dev);
  check("13 a production bug with no QA id and no external ref validates", d?.ok === true && d.frontmatter.qa_bug_id === null && d.frontmatter.external_ref === null && d.frontmatter.bug_key === devKey, show(d));
  const ext = V(edit(edit(edit(CYCLE1, "bug_key: BUG-43\n", "bug_key: PAY-1182\n"), "qa_bug_id: BUG-43\n", "qa_bug_id: null\n"), "origin: qa-standalone\n", "origin: external\n"));
  check("13 an external-only bug validates", ext?.ok === true && ext.frontmatter.external_ref === "PAY-1182" && ext.frontmatter.qa_bug_id === null, show(ext));
  const implicit = V(edit(CYCLE1, "external_ref: PAY-1182\n", ""));
  check("13 nullable identity stays explicit — an absent key is rejected", implicit?.ok === false && implicit.errors.some((e: any) => e.code === "MISSING_FIELD" && /external_ref/.test(e.message)), show(implicit));
  const qaNoId = V(edit(CYCLE1, "qa_bug_id: BUG-43\n", "qa_bug_id: null\n"));
  check("13 a QA origin needs its QA id", qaNoId?.ok === false && codes(qaNoId).includes("IDENTITY_MISMATCH"), show(qaNoId));
  const nullSurfaces = V(edit(edit(CYCLE1, "surfaces: [android]\n", "surfaces: []\n"), "found_in_build: and-201\n", "found_in_build: null\n"));
  check("13 unknown surfaces and found_in_build are allowed", nullSurfaces?.ok === true && nullSurfaces.frontmatter.surfaces.length === 0 && nullSurfaces.frontmatter.found_in_build === null, show(nullSurfaces));
  check("13 surfaces parse as a list", JSON.stringify(V(CYCLE2)?.frontmatter?.surfaces) === '["android-tv"]');
  for (const [field, bad] of [["origin", "qa"], ["platform", "mixed"], ["device_type", "watch"]]) {
    const r = V(edit(CYCLE1, new RegExp(`^${field}: .*$`, "m"), `${field}: ${bad}`));
    check(`13 ${field}: ${bad} is rejected`, r?.ok === false && r.errors.some((e: any) => e.message.includes(field)), show(r));
  }
  check("3 every declared field is in the frontmatter contract order", JSON.stringify(api.BUG_WORK_PLAN_FIELDS?.slice(0, 4)) === '["doc_schema_version","work_type","bug_key","qa_bug_id"]');
}

/* ── 14–17. tasks and fix cycles ──────────────────────────────────────── */
{
  const tbHeader = /^\| id \|.*\|$/m.exec(read("templates/task-breakdown-template.md"))?.[0];
  check("14 the task columns are the Task Breakdown's, verbatim", JSON.stringify(api.TASK_COLUMNS) === JSON.stringify(["id", "description", "platform", "files touched", "depends-on", "size", "acceptance criteria"]) &&
    tbHeader === `| ${api.TASK_COLUMNS?.join(" | ")} |`);
  check("14 task-resume's row reader uses the same columns", read("scripts/task-resume.ts").includes(`const DEFAULT_COLUMNS = ${JSON.stringify(api.TASK_COLUMNS)}`.replace(/","/g, '", "')));
  const r = V(CYCLE1);
  const tasksBody = CYCLE1.slice(CYCLE1.indexOf("## Tasks"), CYCLE1.indexOf("## Fix Cycles"));
  const viaTaskState = parseBreakdown(tasksBody);
  check("14 cycle-1 rows read identically through task-state's own parser (ids, row fingerprints, depends-on)",
    JSON.stringify(r?.tasks?.map((t: any) => [t.id, t.fingerprint, t.depends_on])) === JSON.stringify(Object.values(viaTaskState).map((t) => [t.id, t.fingerprint, t.dependsOn])), show(r));
  check("15 cycle-1 tasks are T1, T2 in cycle 1", JSON.stringify(r?.tasks?.map((t: any) => [t.id, t.cycle])) === '[["T1",1],["T2",1]]');
  const header = V(edit(CYCLE1, "| id | description | platform | files touched | depends-on | size | acceptance criteria |\n|---|---|---|---|---|---|---|\n| T1", "| id | description | platform | files | depends-on | size | acceptance criteria |\n|---|---|---|---|---|---|---|\n| T1"));
  check("14 a task table in another schema is rejected", header?.ok === false && codes(header).includes("TASK_TABLE"), show(header));
  const empty = V(edit(CYCLE1, /\| T1 \|.*\n\| T2 \|.*\n/, ""));
  check("15 Tasks needs at least one row", empty?.ok === false && codes(empty).includes("TASK_TABLE"), show(empty));
  const cId = V(edit(CYCLE1, "| T2 | Compute", "| C2-T2 | Compute"));
  check("15 cycle-1 ids use the normal T<n> format", cId?.ok === false && codes(cId).includes("TASK_ID"), show(cId));
  const dupId = V(edit(CYCLE1, "| T2 | Compute", "| T1 | Compute"));
  check("15 duplicate task ids are rejected", dupId?.ok === false && codes(dupId).includes("TASK_DUPLICATE"));
  const plat = V(edit(CYCLE1, "| T2 | Compute the total from the discounted subtotal | android |", "| T2 | Compute the total from the discounted subtotal | ios |"));
  check("14 every row carries the plan's platform", plat?.ok === false && codes(plat).includes("TASK_PLATFORM"), show(plat));
  const dep = V(edit(CYCLE1, "| T1 | S | T1's test passes", "| T9 | S | T1's test passes"));
  check("14 depends-on must name a task in the plan", dep?.ok === false && codes(dep).includes("TASK_DEPENDENCY"), show(dep));

  // 16 — no further cycles yet.
  check("16 empty Fix Cycles parses", r?.cycles?.length === 0 && r.frontmatter.fix_cycle === 1);
  const blank = V(edit(CYCLE1, "No additional fix cycles yet. Cycle 1 is the Tasks section above.\n", ""));
  check("16 a Fix Cycles section with no text at all also parses", blank?.ok === true, show(blank));

  // 17 — the appended Cycle 2 shape.
  const c2 = V(CYCLE2);
  check("17 a Cycle 2 plan validates", c2?.ok === true, show(c2));
  const cyc = c2?.cycles?.[0];
  check("17 Cycle 2 carries failed build, surfaces, re-test evidence and fix-design delta",
    cyc?.cycle === 2 && cyc.anchor === "cycle-2" && cyc.failed_build === "atv-202" && JSON.stringify(cyc.failed_surfaces) === '["android-tv"]' &&
      /Still frozen/.test(cyc.failed_retest_evidence) && /onResume/.test(cyc.fix_design_delta), JSON.stringify(cyc));
  check("17 Cycle 2 tasks are C2-T1, C2-T2, with their own dependency", JSON.stringify(c2?.tasks?.filter((t: any) => t.cycle === 2).map((t: any) => [t.id, t.depends_on])) === '[["C2-T1",[]],["C2-T2",["C2-T1"]]]');
  check("17 cycle 1 stays the Tasks section", JSON.stringify(c2?.tasks?.filter((t: any) => t.cycle === 1).map((t: any) => t.id)) === '["T1","T2"]');
  const c2BadId = V(edit(CYCLE2, "| C2-T2 |", "| C3-T2 |"));
  check("17 Cycle 2 ids must be C2-T<n>", c2BadId?.ok === false && codes(c2BadId).includes("TASK_ID"), show(c2BadId));
  const c2Label = V(edit(CYCLE2, "- **Failed build:** atv-202\n", ""));
  check("17 a cycle without its failed build is rejected", c2Label?.ok === false && codes(c2Label).includes("CYCLE_LABEL"), show(c2Label));
  const c2Count = V(edit(CYCLE2, "fix_cycle: 2\n", "fix_cycle: 1\n"));
  check("17 fix_cycle must name the latest cycle", c2Count?.ok === false && c2Count.errors.some((e: any) => /fix_cycle/.test(e.message)), show(c2Count));
  const skip = V(edit(edit(CYCLE2, "### Cycle 2\n", "### Cycle 3\n"), "fix_cycle: 2\n", "fix_cycle: 3\n"));
  check("17 cycles are consecutive from 2", skip?.ok === false && codes(skip).includes("CYCLE_SEQUENCE"), show(skip));
  const c2NoTable = V(CYCLE2.replace(/\n\| id \| description[^\n]*\n\|---[^\n]*\n\| C2-T1[^\n]*\n\| C2-T2[^\n]*\n/, "\n"));
  check("17 a cycle needs its own task table", c2NoTable?.ok === false && codes(c2NoTable).includes("TASK_TABLE"), show(c2NoTable));
}

/* ── Fix Design and Verification Strategy are planning contracts ───────── */
{
  for (const label of ["Root-cause fix", "Minimal change surface", "Affected files / areas", "Non-goals", "No unrelated refactoring", "Risks"]) {
    const r = V(CYCLE1.replace(new RegExp(`^- \\*\\*${label.replace(/[/]/g, "\\/")}:\\*\\*.*\\n`, "m"), ""));
    check(`Fix Design requires "${label}"`, r?.ok === false && r.errors.some((e: any) => e.code === "LABEL_MISSING" && e.message.includes(label)), show(r));
  }
  for (const label of ["Reproduction path", "Developer Testing", "Regression test", "Affected surfaces", "QA re-test", "Verification debt"]) {
    const r = V(CYCLE1.replace(new RegExp(`^- \\*\\*${label}:\\*\\*.*\\n`, "m"), ""));
    check(`Verification Strategy requires "${label}"`, r?.ok === false && r.errors.some((e: any) => e.code === "LABEL_MISSING" && e.message.includes(label)), show(r));
  }
  const emptyLabel = V(edit(CYCLE1, "- **Risks:** stacked coupons [inference]; covered by the regression test.", "- **Risks:**"));
  check("a required label must carry content", emptyLabel?.ok === false && codes(emptyLabel).includes("LABEL_MISSING"), show(emptyLabel));
  check("labels are declared", api.FIX_DESIGN_LABELS?.length === 6 && api.VERIFICATION_LABELS?.length === 6 && api.CYCLE_LABELS?.length === 4);
}

/* ── 18–21. fingerprints ─────────────────────────────────────────────── */
{
  const r = V(CYCLE2);
  const split = splitDocument(Buffer.from(CYCLE2, "utf-8")) as any;
  const sections = sectionFingerprints(split.body.toString("utf-8"));
  check("18 the body fingerprint is the framework's fingerprintBody", r?.body_fingerprint === fingerprintBody(Buffer.from(CYCLE2, "utf-8")) && /^sha256:[0-9a-f]{64}$/.test(r.body_fingerprint));
  check("18 section anchors exist for root-cause, fix-design and cycle-2", ["root-cause", "fix-design", "cycle-2", "tasks", "fix-cycles"].every((a) => typeof sections[a] === "string"), Object.keys(sections).join(","));
  check("18 the validator reports the same anchors and fingerprints as task-resume", JSON.stringify(r?.section_fingerprints) === JSON.stringify(sections));
  check("18 every fixed section has a unique, stable anchor", JSON.stringify(r?.sections?.map((s: any) => s.anchor)) ===
    JSON.stringify(["reproduction-evidence", "observed-vs-expected", "affected-capability--surfaces", "root-cause", "blast-radius", "fix-design", "verification-strategy", "tasks", "fix-cycles", "repo-knowledge-reference", "open-questions"]));
  const fp = (d: string) => fingerprintBody(Buffer.from(d, "utf-8"));
  const sf = (d: string) => sectionFingerprints((splitDocument(Buffer.from(d, "utf-8")) as any).body.toString("utf-8"));
  const rc = edit(CYCLE2, "the discounted subtotal is computed but never read.", "the coupon is dropped by the mapper.");
  check("19 changing Root Cause changes the body fingerprint", fp(rc) !== fp(CYCLE2));
  check("19 …and the root-cause anchor, not the fix-design or cycle-2 anchors", sf(rc)["root-cause"] !== sections["root-cause"] && sf(rc)["fix-design"] === sections["fix-design"] && sf(rc)["cycle-2"] === sections["cycle-2"]);
  const fd = edit(CYCLE2, "- **Non-goals:** coupon validation, cart badge, tax rounding.", "- **Non-goals:** coupon validation.");
  check("20 changing Fix Design changes the body fingerprint", fp(fd) !== fp(CYCLE2) && sf(fd)["fix-design"] !== sections["fix-design"] && sf(fd)["root-cause"] === sections["root-cause"]);
  const c2 = edit(CYCLE2, "re-attach in `onResume`.", "re-attach in `onStart`.");
  check("18 a Cycle 2 edit moves cycle-2 and fix-cycles, not cycle 1's tasks", sf(c2)["cycle-2"] !== sections["cycle-2"] && sf(c2)["fix-cycles"] !== sections["fix-cycles"] && sf(c2)["tasks"] === sections["tasks"]);
  const fm = edit(edit(edit(CYCLE2, "status: draft\n", "status: approved\n"), "approved_by: null\n", "approved_by: dana\n"), "fix_cycle: 2\n", "fix_cycle: 2 # latest\n");
  check("21 frontmatter-only changes leave the body fingerprint unchanged (existing semantics)", fp(fm) === fp(CYCLE2) && V(fm)?.ok === true);
  check("21 …including the identity fields — the evidence fingerprint is its own field", fp(edit(CYCLE2, /^bug_evidence_fingerprint: .*$/m, "bug_evidence_fingerprint: sha256:" + "0".repeat(64))) === fp(CYCLE2));
}

/* ── 22–23. the migration framework recognizes bug-work-plan@1 ───────────── */
{
  const tmp = mkdtempSync(join(tmpdir(), "bug-work-plan-"));
  const put = (name: string, content: string) => {
    const p = join(tmp, name);
    writeFileSync(p, content);
    return p;
  };
  const M = (p: string, kind: string) => migratePlanningDoc(p, { kind: kind as any, check: true });
  const p1 = put("c1.md", CYCLE1);
  const before = readFileSync(p1);
  const cur = M(p1, "bug-work-plan");
  check("22 a stamped v1 plan is current — a true no-op", cur.status === "current" && readFileSync(p1).equals(before), JSON.stringify(cur.status));
  check("22 the shipped template is current for --kind bug-work-plan", (() => {
    const t = join(tmp, "tpl.md");
    copyFileSync(join(REPO_ROOT, "templates/bug-work-plan-template.md"), t);
    return M(t, "bug-work-plan").status === "current";
  })());
  const unstamped = M(put("u.md", edit(CYCLE1, "doc_schema_version: 1\n", "")), "bug-work-plan");
  check("22 an unstamped plan is refused, never assumed or migrated", unstamped.status === "unsupported" && /stamped|no earlier/i.test(unstamped.error ?? ""), JSON.stringify([unstamped.status, unstamped.error]));
  const v0 = M(put("v0.md", edit(CYCLE1, "doc_schema_version: 1\n", "doc_schema_version: 0\n")), "bug-work-plan");
  check("22 a nonexistent earlier version is refused, never migrated", v0.status === "unsupported", JSON.stringify([v0.status, v0.error]));
  const v2 = M(put("v2.md", edit(CYCLE1, "doc_schema_version: 1\n", "doc_schema_version: 2\n")), "bug-work-plan");
  check("22 a newer version is schema-too-new", v2.status === "schema-too-new");
  const notBug = M(put("nb.md", edit(CYCLE1, "work_type: bug\n", "work_type: feature\n")), "bug-work-plan");
  check("22 a document that is not work_type: bug is a kind-mismatch for bug-work-plan", notBug.status === "kind-mismatch", JSON.stringify(notBug.status));
  const fa = M(join(HERE, "fixtures/planning-docs/fa-v3-stamped.md"), "bug-work-plan");
  check("22 a feature analysis passed as a bug-work-plan is a kind-mismatch", fa.status === "kind-mismatch", JSON.stringify(fa.status));
  for (const other of ["feature-analysis", "dd", "dev-plan", "task-breakdown"]) {
    const r = M(p1, other);
    check(`22 a bug-work-plan passed as ${other} is a kind-mismatch`, r.status === "kind-mismatch", JSON.stringify(r.status));
  }
  const cli = JSON.parse(
    spawnSync(process.execPath, ["--no-warnings", join(HERE, "migrate-planning-doc.ts"), p1, "--kind", "bug-work-plan"], { encoding: "utf-8" }).stdout,
  );
  check("22 the migrator CLI accepts --kind bug-work-plan", cli.status === "current", JSON.stringify(cli.status));
  rmSync(tmp, { recursive: true, force: true });

  // Existing migration fixtures and templates are byte-identical to before this step.
  const dir = join(HERE, "fixtures/planning-docs");
  const digest = sha(readdirSync(dir).sort().map((f) => `${f}\0${createHash("sha256").update(readFileSync(join(dir, f))).digest("hex")}`).join("\n"));
  check("22 existing migration fixtures are byte-identical", digest === "sha256:d4a2bd658aaf5989355318bd29500bd00cfa0e46ef032ed37bc5a4eae0f139ca", digest);
  const TEMPLATES: Record<string, string> = {
    "feature-analysis-template.md": "2bba7fc13a75acd08f423752f7b9fe41347f98f8b870261cbafa5650cb8f52d9",
    "dd-template.md": "2f8b8229b858c62087485366f6dddc7e1a0139f6a0d2123117b377a884227933",
    "dev-plan-template.md": "cbb9d0e4110708b54a7444aae189cac69b2b62783879bf7fa6ce86612aa910a2",
    "task-breakdown-template.md": "51de43491f82963e2c52b53df0829177304fddcd12ea212501cbde6ef4796a89",
  };
  for (const [f, h] of Object.entries(TEMPLATES)) check(`23 ${f} is unchanged`, createHash("sha256").update(readFileSync(join(REPO_ROOT, "templates", f))).digest("hex") === h);
  check("23 the migration suite still loads every shipped template, the new one included", read("scripts/migrate-planning-doc.test.ts").includes('["bug-work-plan-template.md", "bug-work-plan"]'));
}

/* ── the template ────────────────────────────────────────────────────── */
{
  const tpl = read("templates/bug-work-plan-template.md");
  const split = splitDocument(Buffer.from(tpl, "utf-8")) as any;
  const body: string = split.body?.toString("utf-8") ?? "";
  check("11 the template's sections are the fixed eleven, in order", JSON.stringify([...body.matchAll(/^## (.+)$/gm)].map((m) => m[1])) === JSON.stringify(SECTIONS));
  const keys = (split.inner ?? []).map((l: string) => /^([a-z_]+):/.exec(l)?.[1]).filter(Boolean);
  check("3 the template's frontmatter keys are the declared fields, in order", JSON.stringify(keys) === JSON.stringify(api.BUG_WORK_PLAN_FIELDS), JSON.stringify(keys));
  check("3 the template defaults: work_type bug, fix_cycle 1, status draft, stamped v1",
    /^doc_schema_version: 1\b/m.test(tpl) && /^work_type: bug\b/m.test(tpl) && /^fix_cycle: 1\b/m.test(tpl) && /^status: draft\b/m.test(tpl));
  check("13 the template keeps nullable identity explicit", ["qa_bug_id", "external_ref", "found_in_build", "capability", "related_feature", "approved_by", "approved_fingerprint", "approved_cycle"].every((f) => new RegExp(`^${f}: null\\b`, "m").test(tpl)));
  check("4 the template uses the existing evidence labels, not a new framework", ["[evidence: <path>]", "[reused: <path>#<anchor>]", "[inference]", "[unknown]"].every((l) => tpl.includes(l)));
  check("14 the template's task table is the Task Breakdown header", tpl.includes(`| ${["id", "description", "platform", "files touched", "depends-on", "size", "acceptance criteria"].join(" | ")} |`));
  check("16 the template's Fix Cycles starts with no additional cycles", /## Fix Cycles\n[\s\S]*No additional fix cycles yet/.test(body));
  for (const l of [...(api.FIX_DESIGN_LABELS ?? []), ...(api.VERIFICATION_LABELS ?? [])]) check(`the template carries the "${l}" label`, tpl.includes(`**${l}:**`));
  check("the template carries no command prose", !/\/analyze-bug|\/implement-task|\/review-code/.test(tpl));
}

/* ── 24–26. scope: no command, no task-state, no QA/Inspector writes ────── */
{
  // Step 4 added /analyze-bug, the plan's only producer; every other command stays unaware of it.
  // Step 5 made /implement-task the plan's consumer; every other command stays unaware of it.
  // Step 7 added the bug QA handoff to /create-dev-qa-notes.
  const others = readdirSync(join(REPO_ROOT, "commands")).filter((f) => !["analyze-bug.md", "implement-task.md", "create-dev-qa-notes.md"].includes(f)).map((f) => read(`commands/${f}`)).join("\n");
  check("24 only /analyze-bug, /implement-task and /create-dev-qa-notes reference the bug work plan", !/bug-work-plan/.test(others) && ["analyze-bug", "implement-task", "create-dev-qa-notes"].every((c) => /bug-work-plan/.test(read(`commands/${c}.md`))));
  for (const f of ["scripts/task-state.ts", "scripts/task-resume.ts", "scripts/bug-intake.ts"]) {
    check(`25 ${f} does not reference bug-work-plan`, !/bug-work-plan/.test(read(f)));
  }
  const src = read("scripts/bug-work-plan.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check("26 the helper is read-only", !/\b(writeFile|appendFile|mkdir|rmSync|rm\(|unlink|rename|copyFile|cpSync|createWriteStream|truncate)/.test(src));
  check("26 the helper never touches the QA repository, Inspector or Project Knowledge", !/qa-ledger|ono-plugin-qa|project-inspector|repo-knowledge|\.ono\b/.test(src));
  check("26 the helper is deterministic", !/new Date|Date\.now|Math\.random|randomUUID|child_process/.test(src));
  check("the suite is registered with the check harness", read("scripts/check.ts").includes('"bug-work-plan"'));
  check("the artifact contract exists and names the path and kind", /docs\/bugs\/<bug_key>\/bug-work-plan\.md/.test(read("docs/bug-work-plan-contract.md")) && /bug-work-plan/.test(read("docs/bug-work-plan-contract.md")));
}

/* ── CLI ─────────────────────────────────────────────────────────────── */
{
  const run = (args: string[]) => {
    const p = spawnSync(process.execPath, ["--no-warnings", join(HERE, "bug-work-plan.ts"), ...args], { encoding: "utf-8" });
    try {
      return { code: p.status, json: JSON.parse(p.stdout) };
    } catch {
      return { code: p.status, json: null };
    }
  };
  const ok = run(["validate", join(FIXTURES, "bwp-cycle2.md")]);
  check("CLI validate prints one JSON object, exit 0", ok.code === 0 && ok.json?.ok === true && ok.json.cycles.length === 1);
  const missing = run(["validate", join(FIXTURES, "nope.md")]);
  check("CLI a missing file is a JSON refusal, still exit 0", missing.code === 0 && missing.json?.ok === false);
  const bad = run(["frobnicate"]);
  check("CLI an unknown command is a JSON refusal, still exit 0", bad.code === 0 && bad.json?.ok === false);
}

console.log(failures === 0 ? "\nall bug-work-plan checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
