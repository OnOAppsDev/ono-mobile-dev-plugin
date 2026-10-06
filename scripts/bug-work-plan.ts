/**
 * bug-work-plan.ts
 *
 * Bug Development Flow, Step 2: the `bug-work-plan` planning document (v1) — one plan per
 * bug, at `docs/bugs/<bug_key>/bug-work-plan.md` in the target repository. This module is
 * its structural contract: it reads a plan and reports whether it has the v1 shape — the
 * frontmatter identity, the eleven fixed sections in order, the required Fix Design and
 * Verification Strategy labels, the cycle-1 task table, and any appended fix cycles — plus
 * the body and section fingerprints later steps bind to. See docs/bug-work-plan-contract.md.
 *
 * It is built on the planning-document framework, not beside it:
 *   - frontmatter        readFrontmatter / splitDocument      (migrate-planning-doc.ts)
 *   - body fingerprint   fingerprintBody                      (migrate-planning-doc.ts)
 *   - section anchors    sectionFingerprints / slugify        (task-resume.ts)
 *   - task rows          fingerprintRow, the Task Breakdown's columns (task-state.ts)
 *   - bug identity       isSafeKey and the intake key rule    (bug-intake.ts)
 * Version detection and migration stay with scripts/migrate-planning-doc.ts.
 *
 * Read-only and deterministic: it generates nothing, approves nothing and writes nothing.
 *
 * Always exits 0 and prints one JSON object; callers branch on `ok`.
 *
 *   node --no-warnings scripts/bug-work-plan.ts validate <path>
 */

import { readFileSync, existsSync, realpathSync } from "fs";
import { CURRENT_SCHEMA_VERSION, fingerprintBody, readFrontmatter, splitDocument } from "./migrate-planning-doc.ts";
import { sectionFingerprints, slugify } from "./task-resume.ts";
import { fingerprintRow } from "./task-state.ts";
import { DEV_ORIGINS, isSafeKey } from "./bug-intake.ts";

export const BUG_WORK_PLAN_KIND = "bug-work-plan";
export const BUG_WORK_PLAN_VERSION = CURRENT_SCHEMA_VERSION[BUG_WORK_PLAN_KIND];

/** The fixed body layout, in order. Identity lives in frontmatter, never in a section. */
export const BUG_WORK_PLAN_SECTIONS = [
  "Reproduction Evidence",
  "Observed vs Expected",
  "Affected Capability & Surfaces",
  "Root Cause",
  "Blast Radius",
  "Fix Design",
  "Verification Strategy",
  "Tasks",
  "Fix Cycles",
  "Repo Knowledge Reference",
  "Open Questions",
] as const;

/** The frontmatter keys, in the template's order. */
export const BUG_WORK_PLAN_FIELDS = [
  "doc_schema_version",
  "work_type",
  "bug_key",
  "qa_bug_id",
  "external_ref",
  "origin",
  "found_in_build",
  "platform",
  "device_type",
  "surfaces",
  "capability",
  "related_feature",
  "bug_evidence_fingerprint",
  "fix_cycle",
  "repo_knowledge_status",
  "repo_knowledge_schema",
  "repo_knowledge_fingerprint",
  "repo_knowledge_freshness",
  "repo_knowledge_reused",
  "repo_knowledge_derived",
  "author",
  "status",
  "approved_by",
  "approved_fingerprint",
  "approved_cycle",
  "date",
] as const;

/**
 * Keys a plan must carry explicitly — nullable ones as the bare `null`. `fix_cycle` defaults
 * to 1 when absent. `repo_knowledge_*` belong to the repo-knowledge-consumer skill, and
 * `author` and `date` to the generator; neither is validated here.
 */
const REQUIRED_FIELDS = [
  "doc_schema_version", "work_type", "bug_key", "qa_bug_id", "external_ref", "origin", "found_in_build", "platform", "device_type",
  "surfaces", "capability", "related_feature", "bug_evidence_fingerprint", "status", "approved_by", "approved_fingerprint", "approved_cycle",
];
const NULLABLE = new Set(["qa_bug_id", "external_ref", "found_in_build", "capability", "related_feature", "approved_by", "approved_fingerprint", "approved_cycle"]);
const ID_FIELDS = ["bug_key", "qa_bug_id", "external_ref", "found_in_build", "capability", "related_feature"];

/** The Task Breakdown's row schema, verbatim — templates/task-breakdown-template.md. */
export const TASK_COLUMNS = ["id", "description", "platform", "files touched", "depends-on", "size", "acceptance criteria"] as const;

export const FIX_DESIGN_LABELS = ["Root-cause fix", "Minimal change surface", "Affected files / areas", "Non-goals", "No unrelated refactoring", "Risks"] as const;
export const VERIFICATION_LABELS = ["Reproduction path", "Developer Testing", "Regression test", "Affected surfaces", "QA re-test", "Verification debt"] as const;
export const CYCLE_LABELS = ["Failed build", "Failed surfaces", "Failed re-test evidence", "Fix-design delta"] as const;

const QA_ORIGINS = ["qa-execution", "qa-standalone"];
const ORIGINS = [...QA_ORIGINS, ...DEV_ORIGINS];
const PLATFORMS = ["react-native", "react", "ios", "android"];
const DEVICE_TYPES = ["mobile", "tv"];
const STATUSES = ["draft", "approved"];
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const POSITIVE = /^[1-9][0-9]*$/;

/** Where a bug's plan lives in the target repository; null for a key that is not safe as a path. */
export function bugWorkPlanPath(bugKey: string): string | null {
  return isSafeKey(bugKey) ? `docs/bugs/${bugKey}/bug-work-plan.md` : null;
}

export interface PlanTask {
  id: string;
  cycle: number;
  fingerprint: string;
  depends_on: string[];
  platform: string;
}

export interface PlanCycle {
  cycle: number;
  anchor: string;
  failed_build: string;
  failed_surfaces: string[];
  failed_retest_evidence: string;
  fix_design_delta: string;
  tasks: PlanTask[];
}

type Problem = { code: string; message: string };

/* ----------------------------------------------------------------- body */

interface Heading {
  level: number;
  text: string;
  line: number;
}

/** Headings exactly as sectionFingerprints sees them: code fences are skipped, nothing else. */
function headings(lines: string[]): Heading[] {
  const out: Heading[] = [];
  let fence = false;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) return;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2], line: i });
  });
  return out;
}

/** The text of a labelled line — `- **Label:** text` — or null when absent. */
function labelled(text: string, label: string): string | null {
  const esc = label.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const m = new RegExp(`^\\s*(?:[-*]\\s+)?\\*\\*${esc}:\\*\\*(.*)$`, "m").exec(text);
  return m ? m[1].trim() : null;
}

function requireLabels(text: string, labels: readonly string[], where: string, problems: Problem[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const label of labels) {
    const v = labelled(text, label);
    if (v === null || v === "") problems.push({ code: "LABEL_MISSING", message: `${where} must state "**${label}:**" with content` });
    else out[label] = v;
  }
  return out;
}

const cellsOf = (line: string): string[] => {
  let l = line.trim();
  if (l.startsWith("|")) l = l.slice(1);
  if (l.endsWith("|")) l = l.slice(0, -1);
  return l.split("|").map((c) => c.trim());
};

/** `—`, `-`, `none` and an empty cell mean no dependencies — the Task Breakdown's rule. */
function dependsOn(cell: string): string[] {
  const cleaned = cell.replace(/`/g, "").trim();
  if (cleaned === "" || cleaned === "—" || cleaned === "-" || /^none$/i.test(cleaned)) return [];
  return cleaned.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
}

/** Exactly one task table in the Task Breakdown's schema, with at least one row, ids for its cycle. */
function taskTable(lines: string[], cycle: number, where: string, platform: string | null, problems: Problem[]): PlanTask[] {
  const starts = lines.flatMap((l, i) => (l.trim().startsWith("|") && !(lines[i - 1] ?? "").trim().startsWith("|") ? [i] : []));
  if (starts.length !== 1) {
    problems.push({ code: "TASK_TABLE", message: `${where} must hold exactly one task table (found ${starts.length})` });
    return [];
  }
  const start = starts[0];
  const header = cellsOf(lines[start]).map((c) => c.toLowerCase());
  if (header.join("|") !== TASK_COLUMNS.join("|") || !/^\|(\s*:?-+:?\s*\|)+$/.test((lines[start + 1] ?? "").trim())) {
    problems.push({ code: "TASK_TABLE", message: `${where}'s task table must use the Task Breakdown columns: ${TASK_COLUMNS.join(" | ")}` });
    return [];
  }
  const idRule = cycle === 1 ? /^T[1-9][0-9]*$/ : new RegExp(`^C${cycle}-T[1-9][0-9]*$`);
  const tasks: PlanTask[] = [];
  for (let i = start + 2; i < lines.length && lines[i].trim().startsWith("|"); i++) {
    const c = cellsOf(lines[i]);
    if (c.length !== TASK_COLUMNS.length) {
      problems.push({ code: "TASK_TABLE", message: `${where}: a task row has ${c.length} cells, not ${TASK_COLUMNS.length}` });
      continue;
    }
    const [id, , rowPlatform, , deps] = c;
    if (!idRule.test(id)) problems.push({ code: "TASK_ID", message: `${where}: task id "${id}" is not ${cycle === 1 ? "T<n>" : `C${cycle}-T<n>`}` });
    if (platform !== null && rowPlatform !== platform) problems.push({ code: "TASK_PLATFORM", message: `${where}: task ${id} carries platform "${rowPlatform}", not the plan's "${platform}"` });
    tasks.push({ id, cycle, fingerprint: fingerprintRow(lines[i]), depends_on: dependsOn(deps), platform: rowPlatform });
  }
  if (tasks.length === 0) problems.push({ code: "TASK_TABLE", message: `${where}'s task table has no rows` });
  return tasks;
}

/* ---------------------------------------------------------------- validate */

export function validateBugWorkPlan(buf: Buffer): Record<string, any> {
  const problems: Problem[] = [];
  const split = splitDocument(buf);
  const fm = readFrontmatter(buf);
  if ("error" in split || fm === null) {
    return { ok: false, kind: BUG_WORK_PLAN_KIND, version: BUG_WORK_PLAN_VERSION, errors: [{ code: "NO_FRONTMATTER", message: "no recognizable frontmatter block" }] };
  }

  /* frontmatter */
  const v = fm.values;
  const has = (k: string) => fm.keys.includes(k);
  const val = (k: string): string | null => (v[k] === undefined || v[k].trim() === "" || v[k].trim() === "null" ? null : v[k].trim());
  if ((v.doc_schema_version ?? "").trim() !== String(BUG_WORK_PLAN_VERSION)) {
    problems.push({ code: "SCHEMA_VERSION", message: `doc_schema_version must be ${BUG_WORK_PLAN_VERSION}` });
  }
  if ((v.work_type ?? "").trim() !== "bug") problems.push({ code: "WORK_TYPE", message: "work_type must be bug" });
  for (const k of REQUIRED_FIELDS) {
    if (k === "doc_schema_version" || k === "work_type") continue;
    const explicit = has(k) && v[k].trim() !== "";
    if (!explicit) problems.push({ code: "MISSING_FIELD", message: `${k} is required${NULLABLE.has(k) ? " (write null when it does not apply)" : ""}` });
    else if (!NULLABLE.has(k) && val(k) === null && k !== "surfaces") problems.push({ code: "MISSING_FIELD", message: `${k} is required and cannot be null` });
  }
  for (const k of ID_FIELDS) {
    const x = val(k);
    if (x !== null && !isSafeKey(x)) problems.push({ code: "INVALID_FIELD", message: `${k} "${x}" is not a safe id` });
  }
  const origin = val("origin");
  if (origin !== null && !ORIGINS.includes(origin)) problems.push({ code: "INVALID_FIELD", message: `origin must be one of ${ORIGINS.join(", ")}` });
  const platform = val("platform");
  if (platform !== null && !PLATFORMS.includes(platform)) problems.push({ code: "INVALID_FIELD", message: `platform must be one of ${PLATFORMS.join(", ")}` });
  const device = val("device_type");
  if (device !== null && !DEVICE_TYPES.includes(device)) problems.push({ code: "INVALID_FIELD", message: `device_type must be one of ${DEVICE_TYPES.join(", ")}` });
  const surfacesRaw = (v.surfaces ?? "").trim();
  const surfacesMatch = /^\[(.*)\]$/.exec(surfacesRaw);
  const surfaces = surfacesMatch ? surfacesMatch[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (has("surfaces") && (!surfacesMatch || surfaces.some((s) => !isSafeKey(s)))) problems.push({ code: "INVALID_FIELD", message: "surfaces must be a list of surface ids, e.g. [android] or []" });
  const fingerprint = val("bug_evidence_fingerprint");
  if (fingerprint !== null && !SHA256.test(fingerprint)) problems.push({ code: "INVALID_FIELD", message: "bug_evidence_fingerprint must be sha256:<64 lowercase hex>" });
  const status = val("status");
  if (status !== null && !STATUSES.includes(status)) problems.push({ code: "INVALID_FIELD", message: `status must be one of ${STATUSES.join(", ")}` });
  const fixCycleRaw = has("fix_cycle") ? v.fix_cycle.trim() : "1";
  if (!POSITIVE.test(fixCycleRaw)) problems.push({ code: "INVALID_FIELD", message: "fix_cycle must be a positive integer" });
  const approvedFp = val("approved_fingerprint");
  if (approvedFp !== null && !SHA256.test(approvedFp)) problems.push({ code: "INVALID_FIELD", message: "approved_fingerprint must be null or sha256:<64 lowercase hex>" });
  const approvedCycle = val("approved_cycle");
  if (approvedCycle !== null && !POSITIVE.test(approvedCycle)) problems.push({ code: "INVALID_FIELD", message: "approved_cycle must be null or a positive integer" });

  // The intake identity rule: the QA id, else the external ref, else a generated DEV key.
  const bugKey = val("bug_key");
  const qaId = val("qa_bug_id");
  const ext = val("external_ref");
  if (origin !== null && QA_ORIGINS.includes(origin) && qaId === null) problems.push({ code: "IDENTITY_MISMATCH", message: `a ${origin} bug needs its qa_bug_id` });
  if (origin !== null && !QA_ORIGINS.includes(origin) && qaId !== null) problems.push({ code: "IDENTITY_MISMATCH", message: `a ${origin} bug has no qa_bug_id` });
  if (origin === "external" && ext === null) problems.push({ code: "IDENTITY_MISMATCH", message: "an external bug needs its external_ref" });
  if (bugKey !== null) {
    const expected = qaId ?? ext;
    if (expected !== null ? bugKey !== expected : !/^DEV-[0-9a-f]{8}$/.test(bugKey)) {
      problems.push({ code: "IDENTITY_MISMATCH", message: `bug_key must be ${expected !== null ? `"${expected}" (${qaId !== null ? "the QA id" : "the external ref"})` : "DEV-<8 hex> when there is no QA id or external ref"}` });
    }
  }

  /* body: the fixed sections */
  const body = split.body.toString("utf-8");
  const lines = body.split("\n");
  const heads = headings(lines);
  const known = new Set<string>(BUG_WORK_PLAN_SECTIONS);
  for (const h of heads) {
    if (h.level === 1 || (h.level === 2 && !known.has(h.text))) problems.push({ code: "SECTION_UNEXPECTED", message: `unexpected section "${h.text}" — the body is exactly: ${BUG_WORK_PLAN_SECTIONS.join(", ")}` });
  }
  const h2 = heads.filter((h) => h.level === 2 && known.has(h.text));
  for (const s of BUG_WORK_PLAN_SECTIONS) {
    const n = h2.filter((h) => h.text === s).length;
    if (n === 0) problems.push({ code: "SECTION_MISSING", message: `required section "${s}" is missing` });
    if (n > 1) problems.push({ code: "SECTION_DUPLICATE", message: `section "${s}" appears ${n} times` });
  }
  const order = [...new Map(h2.map((h) => [h.text, h])).values()].map((h) => BUG_WORK_PLAN_SECTIONS.indexOf(h.text as any));
  if (order.some((x, i) => i > 0 && x < order[i - 1])) problems.push({ code: "SECTION_ORDER", message: `sections must appear in order: ${BUG_WORK_PLAN_SECTIONS.join(", ")}` });
  const seen = new Map<string, number>();
  for (const h of heads) seen.set(slugify(h.text), (seen.get(slugify(h.text)) ?? 0) + 1);
  for (const [slug, n] of seen) if (n > 1 && !h2.some((h) => slugify(h.text) === slug)) problems.push({ code: "ANCHOR_COLLISION", message: `anchor #${slug} is not unique` });

  const sectionLines = (name: string): string[] => {
    const h = h2.find((x) => x.text === name);
    if (!h) return [];
    const next = heads.find((x) => x.line > h.line && x.level <= 2);
    return lines.slice(h.line + 1, next ? next.line : lines.length);
  };

  requireLabels(sectionLines("Fix Design").join("\n"), FIX_DESIGN_LABELS, "Fix Design", problems);
  requireLabels(sectionLines("Verification Strategy").join("\n"), VERIFICATION_LABELS, "Verification Strategy", problems);

  /* cycle 1: the Tasks section */
  const tasks: PlanTask[] = h2.some((h) => h.text === "Tasks") ? taskTable(sectionLines("Tasks"), 1, "Tasks", platform, problems) : [];

  /* later cycles: ### Cycle <n> under Fix Cycles */
  const cycles: PlanCycle[] = [];
  const fc = h2.find((h) => h.text === "Fix Cycles");
  if (fc) {
    const end = heads.find((x) => x.line > fc.line && x.level <= 2)?.line ?? lines.length;
    const subs = heads.filter((h) => h.line > fc.line && h.line < end && h.level === 3);
    subs.forEach((h, i) => {
      const m = /^Cycle ([1-9][0-9]*)$/.exec(h.text);
      const expected = i + 2;
      if (!m || Number(m[1]) !== expected) {
        problems.push({ code: "CYCLE_SEQUENCE", message: `Fix Cycles holds only "### Cycle <n>" subsections, consecutive from 2 — expected "Cycle ${expected}", found "${h.text}"` });
        return;
      }
      const n = Number(m[1]);
      const text = lines.slice(h.line + 1, subs[i + 1]?.line ?? end);
      const where = `Cycle ${n}`;
      const before = problems.length;
      const got = requireLabels(text.join("\n"), CYCLE_LABELS, where, problems);
      for (const p of problems.slice(before)) p.code = "CYCLE_LABEL";
      const cycleTasks = taskTable(text, n, where, platform, problems);
      tasks.push(...cycleTasks);
      cycles.push({
        cycle: n,
        anchor: slugify(h.text),
        failed_build: (got["Failed build"] ?? "").replace(/`/g, ""),
        failed_surfaces: (got["Failed surfaces"] ?? "").replace(/`/g, "").split(",").map((s) => s.trim()).filter(Boolean),
        failed_retest_evidence: got["Failed re-test evidence"] ?? "",
        fix_design_delta: got["Fix-design delta"] ?? "",
        tasks: cycleTasks,
      });
    });
  }
  const latest = 1 + cycles.length;
  if (POSITIVE.test(fixCycleRaw) && Number(fixCycleRaw) !== latest) {
    problems.push({ code: "FIX_CYCLE_MISMATCH", message: `fix_cycle is ${fixCycleRaw}, but the plan's latest cycle is ${latest}` });
  }

  /* task ids and dependencies across the plan */
  const ids = new Map<string, number>();
  for (const t of tasks) {
    if (ids.has(t.id)) problems.push({ code: "TASK_DUPLICATE", message: `task id ${t.id} appears more than once` });
    ids.set(t.id, t.cycle);
  }
  for (const t of tasks) {
    for (const d of t.depends_on) {
      const c = ids.get(d);
      if (c === undefined || c > t.cycle) problems.push({ code: "TASK_DEPENDENCY", message: `task ${t.id} depends on ${d}, which is not a task of this or an earlier cycle` });
    }
  }

  return {
    ok: problems.length === 0,
    kind: BUG_WORK_PLAN_KIND,
    version: BUG_WORK_PLAN_VERSION,
    errors: problems,
    frontmatter: {
      doc_schema_version: Number(v.doc_schema_version) || null,
      work_type: val("work_type"),
      bug_key: bugKey,
      qa_bug_id: qaId,
      external_ref: ext,
      origin,
      found_in_build: val("found_in_build"),
      platform,
      device_type: device,
      surfaces,
      capability: val("capability"),
      related_feature: val("related_feature"),
      bug_evidence_fingerprint: fingerprint,
      fix_cycle: POSITIVE.test(fixCycleRaw) ? Number(fixCycleRaw) : null,
      status,
      approved_by: val("approved_by"),
      approved_fingerprint: approvedFp,
      approved_cycle: approvedCycle !== null && POSITIVE.test(approvedCycle) ? Number(approvedCycle) : null,
    },
    sections: h2.map((h) => ({ heading: h.text, anchor: slugify(h.text) })),
    tasks,
    cycles,
    body_fingerprint: fingerprintBody(buf),
    section_fingerprints: sectionFingerprints(body),
  };
}

/* --------------------------------------------------------------------- CLI */

function main(): void {
  const [cmd, path] = process.argv.slice(2);
  const print = (o: unknown): never => {
    console.log(JSON.stringify(o, null, 2));
    process.exit(0);
  };
  const refuse = (code: string, message: string) => print({ ok: false, kind: BUG_WORK_PLAN_KIND, version: BUG_WORK_PLAN_VERSION, errors: [{ code, message }] });
  if (cmd !== "validate") refuse("UNKNOWN_COMMAND", "usage: bug-work-plan.ts validate <path>");
  if (!path || !existsSync(path)) refuse("UNREADABLE", `file not found: ${path ?? ""}`);
  print(validateBugWorkPlan(readFileSync(path)));
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /bug-work-plan\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) main();
