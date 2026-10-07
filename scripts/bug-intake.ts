/**
 * bug-intake.ts
 *
 * Bug Development Flow, Step 1: deterministic, read-only bug intake and one normalized
 * Dev-side bug identity. It consumes four kinds of bug:
 *
 *   QA bug        from a QA repository — its hash-verified ledger and its rendered
 *                 `bugs/<id>/bug.md` view (docs/qa-bug-view-contract.md)
 *   external      a tracker key plus the report (flags or a JSON report file)
 *   production    a production incident report
 *   dev-review / dev-testing
 *                 a defect developers found that escaped its task
 *
 * and prints one JSON object with the normalized identity, the evidence, the
 * `bug_evidence_fingerprint`, and — for a QA bug — QA's state, the history Dev needs and
 * whether Dev may start a fix cycle at all. QA ownership is never overridden: a bug QA has
 * not handed to Dev is reported, never started.
 *
 * Every result declares its `context_level`. `full` means QA's state is verified and decides,
 * a denial included. `partial` means the evidence verifies but QA's state does not: Dev may
 * proceed, with warnings, and no state is assumed. `insufficient` means there is no
 * reliable evidence, so the bug is blocked and what is missing is named. Only the absence of
 * a verified QA state degrades (docs/qa-bug-view-contract.md).
 *
 * Read-only by construction: it writes nothing anywhere — not the QA repository, not the
 * code repository, not Project Knowledge — runs no process and reads no clock. It produces
 * no planning artifact; later steps consume its output.
 *
 * Always exits 0 and prints one JSON object; callers branch on `status`.
 *
 *   node --no-warnings scripts/bug-intake.ts lookup   <bug-ref> --qa-repo <path>
 *   node --no-warnings scripts/bug-intake.ts validate <bug-ref> --qa-repo <path>
 *   node --no-warnings scripts/bug-intake.ts normalize --origin <external|production|dev-review|dev-testing>
 *        [--external <key>] [--report <file.json>] [--title …] [--description …] [--step …]…
 *        [--expected …] [--actual …] [--surfaces a,b] [--found-in-build <id>] [--environment …]
 *        [--related-feature <dev-feature-id>]
 *
 * <bug-ref> is `BUG-27`, `bug:BUG-27`, `qa=BUG-27`, `external=PAY-1182`, or
 * `qa=BUG-27,external=PAY-1182` — the release gate's bug-item grammar.
 */

import { readFileSync, existsSync, readdirSync, realpathSync } from "fs";
import { join, resolve } from "path";
import { createHash } from "crypto";
import { canonical, parseBugItem } from "./qa-release-gate.ts";

const sha = (s: string | Buffer): string => `sha256:${createHash("sha256").update(s).digest("hex")}`;

/* ------------------------------------------------------------------ identity */

export const DEV_ORIGINS = ["external", "production", "dev-review", "dev-testing"] as const;
export type Origin = "qa-execution" | "qa-standalone" | (typeof DEV_ORIGINS)[number];

/**
 * A key that can safely name files and appear in paths: a letter or digit first, then
 * letters, digits, `.`, `_` or `-`, at most 64 characters. A tracker URL, a path segment or
 * whitespace is refused — pass the tracker's key instead.
 */
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export function isSafeKey(v: unknown): v is string {
  return typeof v === "string" && SAFE_KEY.test(v) && !v.includes("..");
}

export interface Identity {
  work_type: "bug";
  bug_key: string;
  qa_bug_id: string | null;
  external_ref: string | null;
  origin: Origin;
  found_in_build: string | null;
  surfaces: string[];
  capability: string | null;
  related_feature: string | null;
}

/**
 * The canonical Dev key: the QA id, else the external ref, else
 * `DEV-<first 8 hex of sha256(origin \n title \n first reproduction step)>`. No clock, no
 * randomness — the same report always gets the same key.
 */
export function deriveBugKey(i: { qa_bug_id: string | null; external_ref: string | null; origin: string; title: string; steps: string[] }): string {
  if (i.qa_bug_id) return i.qa_bug_id;
  if (i.external_ref) return i.external_ref;
  return `DEV-${createHash("sha256").update([i.origin, i.title, i.steps[0] ?? ""].join("\n")).digest("hex").slice(0, 8)}`;
}

/* ------------------------------------------------------------- fingerprint */

const text = (v: unknown): string => String(v ?? "").replace(/\r\n?/g, "\n").trim();

/**
 * The evidence fingerprint: sha256 over the canonical title, reproduction steps, expected,
 * actual, affected surfaces (as a set) and found-in build. Nothing else participates — not
 * QA state, fix claims, re-tests, severity, description or any timestamp — so a reopen alone
 * never makes the evidence look materially different.
 */
export function evidenceFingerprint(e: Record<string, unknown>): string {
  const steps = Array.isArray(e.steps) ? (e.steps as unknown[]).map(text) : [];
  const surfaces = Array.isArray(e.surfaces) ? [...new Set((e.surfaces as unknown[]).map(text))].sort() : [];
  return sha(
    canonical({
      title: text(e.title),
      steps,
      expected: text(e.expected),
      actual: text(e.actual),
      surfaces,
      found_in_build: e.found_in_build === undefined || e.found_in_build === null ? null : text(e.found_in_build),
    }),
  );
}

/* ------------------------------------------------------------------ result */

export type Status =
  | "ready_for_dev"
  | "reopened"
  | "needs_qa_verification"
  | "awaiting_qa_retest"
  | "closed"
  | "ambiguous"
  | "invalid"
  | "valid"
  | "degraded";

export type ContextLevel = "full" | "partial" | "insufficient";

/** A refusal: Dev cannot work from this — there is no reliable evidence, or no usable source for it. */
function invalid(code: string, reason: string, extra: Record<string, unknown> = {}): Record<string, any> {
  return { ok: false, status: "invalid", context_level: "insufficient", code, reason, dev_may_start: false, ...extra };
}

/** The evidence Dev needs to analyze a bug at all. Surfaces and found-in build may be unknown. */
function missingEvidence(e: { title: string; steps: string[]; expected: string; actual: string }): string[] {
  return [
    ...(text(e.title) ? [] : ["title"]),
    ...(e.steps.map(text).filter(Boolean).length ? [] : ["steps"]),
    ...(text(e.expected) ? [] : ["expected"]),
    ...(text(e.actual) ? [] : ["actual"]),
  ];
}

/* --------------------------------------------------- non-QA bugs (normalize) */

/**
 * Normalize an external, production or developer-discovered bug. No QA id, no QA scope and
 * no feature is required — and none is invented.
 */
export function normalizeBug(input: Record<string, unknown>, source: Record<string, unknown> = { source: "input" }): Record<string, any> {
  const origin = input.origin;
  if (typeof origin !== "string" || !(DEV_ORIGINS as readonly string[]).includes(origin)) {
    return invalid("INVALID_ORIGIN", `origin must be one of ${DEV_ORIGINS.join(", ")} (a QA bug is read with \`lookup\`)`);
  }
  const ext = input.external_ref === undefined || input.external_ref === null ? null : String(input.external_ref);
  if (origin === "external" && (ext === null || ext.trim() === "")) {
    return invalid("MISSING_IDENTITY", "an external bug needs its tracker key (--external)", { missing: ["external_ref"] });
  }
  if (ext !== null && !isSafeKey(ext)) {
    return invalid("UNSAFE_IDENTITY", `external ref ${JSON.stringify(ext)} is not a safe key — pass the tracker key (e.g. PAY-1182), not a URL or path`);
  }

  const steps = Array.isArray(input.steps) ? (input.steps as unknown[]).map(text).filter((s) => s !== "") : [];
  const evidence = {
    title: text(input.title),
    description: input.description === undefined || input.description === null ? null : text(input.description),
    steps,
    expected: text(input.expected),
    actual: text(input.actual),
    severity: input.severity === undefined || input.severity === null ? null : text(input.severity),
    environment: input.environment === undefined || input.environment === null ? null : text(input.environment),
    linked_cases: [] as string[],
    related_scopes: [] as string[],
  };
  const missing = missingEvidence(evidence);
  if (missing.length) return invalid("MISSING_EVIDENCE", `required evidence missing: ${missing.join(", ")}`, { missing });

  const surfaces = Array.isArray(input.surfaces) ? [...new Set((input.surfaces as unknown[]).map(text).filter(Boolean))] : [];
  const found = input.found_in_build === undefined || input.found_in_build === null || input.found_in_build === "" ? null : text(input.found_in_build);
  const related = input.related_feature === undefined || input.related_feature === null || input.related_feature === "" ? null : text(input.related_feature);
  for (const [what, v] of [["surface", surfaces], ["found_in_build", found === null ? [] : [found]], ["related_feature", related === null ? [] : [related]]] as const) {
    const bad = (v as string[]).find((x) => !isSafeKey(x));
    if (bad !== undefined) return invalid("UNSAFE_IDENTITY", `${what} ${JSON.stringify(bad)} is not a safe id`);
  }

  const identity: Identity = {
    work_type: "bug",
    bug_key: deriveBugKey({ qa_bug_id: null, external_ref: ext, origin, title: evidence.title, steps }),
    qa_bug_id: null,
    external_ref: ext,
    origin: origin as Origin,
    found_in_build: found,
    surfaces,
    capability: null,
    related_feature: related,
  };
  // Full context for this origin: QA ownership does not apply to it, so none is claimed.
  return {
    ok: true,
    status: "ready_for_dev",
    reason: `${origin} bug normalized — no QA scope or feature is required.`,
    dev_may_start: true,
    context_level: "full",
    qa_state: null,
    qa_state_verified: false,
    warnings: [],
    provenance: { evidence: source, state: null },
    identity,
    evidence,
    bug_evidence_fingerprint: evidenceFingerprint({ ...evidence, surfaces, found_in_build: found }),
    qa: null,
    reopened: null,
  };
}

/* ------------------------------------------------------------- the QA ledger */

class Refusal extends Error {
  code: string;
  extra: Record<string, unknown>;
  constructor(code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

const BUG_STATES = ["new", "verification_blocked", "assigned", "fix_delivered", "reopened", "closed_verified", "closed_not_reproducible", "closed_duplicate", "closed_wont_fix"];

/** One record, hash re-verified exactly as the release gate does. */
function verified(rec: any, where: string): any {
  const { hash, ...rest } = rec ?? {};
  if (typeof hash !== "string" || hash !== sha(canonical(rest))) {
    throw new Refusal("QA_LEDGER_UNVERIFIABLE", `${where}: record hash does not verify — the ledger was edited outside the QA helper`);
  }
  return rec;
}

/** A JSONL stream: every record verified, and every record chained to the one before it. */
function stream(file: string, where: string): any[] {
  const recs: any[] = [];
  readFileSync(file, "utf-8").split("\n").filter(Boolean).forEach((line, i) => {
    let rec: any;
    try {
      rec = JSON.parse(line);
    } catch {
      throw new Refusal("QA_LEDGER_UNVERIFIABLE", `${where}:${i + 1} is not valid JSON`);
    }
    verified(rec, `${where}:${i + 1}`);
    const prev = i === 0 ? null : recs[i - 1].hash;
    if (rec.prev !== prev) throw new Refusal("QA_LEDGER_UNVERIFIABLE", `${where}:${i + 1} breaks the record chain`);
    recs.push(rec);
  });
  return recs;
}

interface Ledger {
  root: string;
  bugIds: () => string[];
  bugStream: (id: string) => any[] | null;
  featureStream: (slug: string) => any[] | null;
  runs: () => Array<{ id: string; records: any[] }>;
  builds: () => any[];
}

function openLedger(qaRoot: string): Ledger {
  const root = existsSync(qaRoot) ? realpathSync(resolve(qaRoot)) : resolve(qaRoot);
  const ledger = join(root, "qa-ledger");
  const marker = join(ledger, "ledger.json");
  if (!existsSync(marker)) throw new Refusal("NOT_A_QA_REPO", `${root} has no qa-ledger/ledger.json`);
  let meta: any;
  try {
    meta = verified(JSON.parse(readFileSync(marker, "utf-8")), "ledger.json");
  } catch (e) {
    if (e instanceof Refusal) throw e;
    throw new Refusal("QA_LEDGER_UNVERIFIABLE", "ledger.json is not valid JSON");
  }
  if (meta.qa_ledger_schema !== 1) throw new Refusal("QA_LEDGER_UNSUPPORTED", `qa_ledger_schema ${meta.qa_ledger_schema} is not supported (expected 1)`);
  const list = (...d: string[]): string[] => {
    const dir = join(ledger, ...d);
    return existsSync(dir) ? readdirSync(dir).sort() : [];
  };
  const scopeFile = (kind: string, id: string) => join(ledger, "scopes", kind, `${id}.jsonl`);
  return {
    root,
    bugIds: () => list("scopes", "bug").filter((n) => n.endsWith(".jsonl")).map((n) => n.slice(0, -6)),
    bugStream: (id) => (existsSync(scopeFile("bug", id)) ? stream(scopeFile("bug", id), `scopes/bug/${id}.jsonl`) : null),
    featureStream: (slug) => (isSafeKey(slug) && existsSync(scopeFile("feature", slug)) ? stream(scopeFile("feature", slug), `scopes/feature/${slug}.jsonl`) : null),
    runs: () => list("runs").filter((n) => n.endsWith(".jsonl")).map((n) => ({ id: n.slice(0, -6), records: stream(join(ledger, "runs", n), `runs/${n}`) })),
    builds: () => list("builds").filter((n) => n.endsWith(".json")).map((n) => {
      try {
        return verified(JSON.parse(readFileSync(join(ledger, "builds", n), "utf-8")), `builds/${n}`);
      } catch (e) {
        if (e instanceof Refusal) throw e;
        throw new Refusal("QA_LEDGER_UNVERIFIABLE", `builds/${n} is not valid JSON`);
      }
    }),
  };
}

const SET_FIELDS = new Set(["title", "surfaces", "capability", "severity", "external_ref", "assignee", "dev_handoff"]);
const ADD_FIELDS = new Set(["linked_cases", "related_scopes", "evidence"]);

/** The scope's context, folded exactly as QA folds the fields intake reads. */
function foldContext(records: any[]): Record<string, any> {
  const c: Record<string, any> = {};
  for (const e of records) {
    if (e.kind === "context.set" && SET_FIELDS.has(e.field)) c[e.field] = e.value;
    else if (e.kind === "context.add" && ADD_FIELDS.has(e.field)) {
      const list: unknown[] = (c[e.field] ??= []);
      if (!list.includes(e.value)) list.push(e.value);
    } else if (e.kind === "context.retract" && ADD_FIELDS.has(e.field)) {
      const list: unknown[] = c[e.field] ?? [];
      const i = list.indexOf(e.value);
      if (i >= 0) list.splice(i, 1);
    }
  }
  return c;
}

/** The recorded facts of one bug — no replay, so no QA state logic is duplicated here. */
function recordedBug(id: string, recs: any[]) {
  const report = recs.find((r) => r.kind === "bug.reported");
  if (!report) throw new Refusal("UNKNOWN_BUG", `bug:${id} has no bug.reported record`);
  const c = foldContext(recs);
  return {
    report,
    title: c.title ?? report.title,
    severity: c.severity ?? report.severity,
    external_ref: c.external_ref !== undefined ? c.external_ref : report.external_ref,
    surfaces: (c.surfaces ?? report.surfaces) as string[],
    capability: (c.capability ?? null) as string | null,
    linked_cases: [...report.linked_cases, ...(c.linked_cases ?? [])] as string[],
    related_scopes: [...new Set([...report.related_scopes, ...(c.related_scopes ?? [])])] as string[],
  };
}

/* ------------------------------------------------------------- the QA view */

/** The view's field table, in the contracted order (docs/qa-bug-view-contract.md). */
export const VIEW_FIELDS = [
  "Bug", "State", "Next action", "Severity", "Origin", "Affected surfaces", "Found in build", "Fix under test",
  "Pending re-test surfaces", "Fixed in build", "Resolution", "External reference", "Assignee", "Capability", "Reported",
];
export const VIEW_SECTIONS = [
  "Summary", "Reproduction Steps", "Devices", "Linked Test Cases", "Related Scopes", "Fix Claims",
  "Reproduction History", "Re-test History", "Evidence", "History",
];
const TABLES: Record<string, string[]> = {
  "Fix Claims": ["Build", "Claimed at", "Outcome"],
  "Reproduction History": ["Run", "Build", "Surface", "Device", "Outcome", "At", "Notes"],
  "Re-test History": ["Run", "Build", "Fix build", "Surface", "Device", "Outcome", "At", "Notes"],
};

const cellValue = (c: string): string | null => {
  const v = c.trim().replace(/\\\|/g, "|");
  return v === "—" || v === "" ? null : v;
};
function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((c) => c.trim());
}
function parseTable(body: string, head: string[], where: string): Array<Record<string, string | null>> {
  const t = body.trim();
  if (t === "None.") return [];
  const lines = t.split("\n");
  if (splitRow(lines[0]).join("|") !== head.join("|") || !/^\|(-+\|)+$/.test(lines[1]?.trim() ?? "")) {
    throw new Refusal("QA_VIEW_CONTRACT", `${where}: the table header is not the contracted one`);
  }
  return lines.slice(2).map((l) => {
    const cells = splitRow(l);
    if (cells.length !== head.length) throw new Refusal("QA_VIEW_CONTRACT", `${where}: a row does not have ${head.length} cells`);
    return Object.fromEntries(head.map((h, i) => [h, cellValue(cells[i])]));
  });
}

export interface BugView {
  id: string;
  title: string;
  fields: Record<string, string | null>;
  steps: string[];
  expected: string;
  actual: string;
  fixClaims: Array<Record<string, string | null>>;
  reproductions: Array<Record<string, string | null>>;
  retests: Array<Record<string, string | null>>;
  evidence: string[];
}

/** Parse QA's rendered bug view against the contracted, fixed shape — never a guess. */
export function parseBugView(md: string, id: string): BugView {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const head = new RegExp(`^# ${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} — (.+)$`).exec(lines[0] ?? "");
  if (!head) throw new Refusal("QA_VIEW_CONTRACT", `bug.md does not open with "# ${id} — <title>"`);
  const sectionAt = (name: string) => lines.findIndex((l) => l === `## ${name}`);
  const order = VIEW_SECTIONS.map(sectionAt);
  if (order.some((i) => i < 0) || order.some((v, i) => i > 0 && v <= order[i - 1]) || lines.filter((l) => l.startsWith("## ")).length !== VIEW_SECTIONS.length) {
    throw new Refusal("QA_VIEW_CONTRACT", `bug.md sections are not exactly: ${VIEW_SECTIONS.join(", ")}`);
  }
  const body = (i: number) => lines.slice(order[i] + 1, i + 1 < order.length ? order[i + 1] : lines.length).join("\n");

  const fieldRows = parseTable(lines.slice(lines.findIndex((l) => l.startsWith("| Field |")), order[0]).join("\n"), ["Field", "Value"], "field table");
  if (fieldRows.map((r) => r.Field).join("|") !== VIEW_FIELDS.join("|")) {
    throw new Refusal("QA_VIEW_CONTRACT", `bug.md field table is not exactly: ${VIEW_FIELDS.join(", ")}`);
  }
  const fields = Object.fromEntries(fieldRows.map((r) => [r.Field as string, r.Value]));
  if (!BUG_STATES.includes(fields.State ?? "")) throw new Refusal("QA_VIEW_CONTRACT", `unknown state ${JSON.stringify(fields.State)}`);

  const repro = body(VIEW_SECTIONS.indexOf("Reproduction Steps")).trim().split("\n");
  const steps = repro.filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, ""));
  // QA renders an empty value as "**Actual:** " — the trailing space may be trimmed away.
  const labelled = (label: string) => {
    const m = new RegExp(`^\\*\\*${label}:\\*\\*(?: (.*))?$`, "m").exec(repro.join("\n"));
    return m ? (m[1] ?? "") : undefined;
  };
  const expected = labelled("Expected");
  const actual = labelled("Actual");
  if (!steps.length || expected === undefined || actual === undefined) throw new Refusal("QA_VIEW_CONTRACT", "Reproduction Steps is not steps + **Expected:** + **Actual:**");

  const ev = body(VIEW_SECTIONS.indexOf("Evidence")).trim();
  return {
    id,
    title: head[1],
    fields,
    steps,
    expected,
    actual,
    fixClaims: parseTable(body(VIEW_SECTIONS.indexOf("Fix Claims")), TABLES["Fix Claims"], "Fix Claims"),
    reproductions: parseTable(body(VIEW_SECTIONS.indexOf("Reproduction History")), TABLES["Reproduction History"], "Reproduction History"),
    retests: parseTable(body(VIEW_SECTIONS.indexOf("Re-test History")), TABLES["Re-test History"], "Re-test History"),
    evidence: ev === "None." ? [] : ev.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2)),
  };
}

/* ------------------------------------------------------------ QA bug lookup */

const sameList = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

/** Resolve a bug reference to exactly one QA bug id, or refuse. */
function resolveRef(db: Ledger, ref: string): string {
  const raw = ref.trim().replace(/^bug:/, "");
  const item = parseBugItem(raw);
  if (!item) throw new Refusal("INVALID_REF", `${JSON.stringify(ref)} is not a bug reference (BUG-27, qa=BUG-27, external=PAY-1182, or both)`);
  for (const v of [item.qa_bug_id, item.external_ref]) {
    if (v !== null && !isSafeKey(v)) throw new Refusal("UNSAFE_IDENTITY", `${JSON.stringify(v)} is not a safe id`);
  }
  if (item.qa_bug_id) {
    const recs = db.bugStream(item.qa_bug_id);
    if (!recs) throw new Refusal("UNKNOWN_BUG", `the QA repository has no bug ${item.qa_bug_id}`);
    if (item.external_ref !== null && recordedBug(item.qa_bug_id, recs).external_ref !== item.external_ref) {
      throw new Refusal("IDENTITY_MISMATCH", `bug ${item.qa_bug_id}'s external ref is not ${item.external_ref}`);
    }
    return item.qa_bug_id;
  }
  const matches = db.bugIds().filter((id) => {
    const recs = db.bugStream(id);
    return recs !== null && recordedBug(id, recs).external_ref === item.external_ref;
  });
  if (matches.length === 0) throw new Refusal("UNKNOWN_BUG", `no QA bug carries external ref ${item.external_ref}`);
  if (matches.length > 1) {
    throw new Refusal("AMBIGUOUS", `external ref ${item.external_ref} is carried by several QA bugs — name the QA id`, { candidates: matches });
  }
  return matches[0];
}

const regenerate = (id: string) => `regenerate it in the QA repository (QA helper: \`bug render --bug bug:${id}\`)`;

/**
 * The bug's evidence source: the QA repository, the bug resolved to exactly one id, and its
 * hash-verified record. Any failure here leaves Dev with no reliable evidence.
 */
function readSource(qaRoot: string, ref: string) {
  const raw = ref.trim().replace(/^bug:/, "");
  const pre = parseBugItem(raw);
  for (const v of [pre?.qa_bug_id ?? null, pre?.external_ref ?? null]) {
    if (v !== null && !isSafeKey(v)) throw new Refusal("UNSAFE_IDENTITY", `${JSON.stringify(v)} is not a safe id`);
  }
  const db = openLedger(qaRoot);
  const id = resolveRef(db, ref);
  const stream = db.bugStream(id) as any[];
  const rec = recordedBug(id, stream);
  // A resolution is a recorded, terminal QA fact: QA records one only on an open bug, and a
  // closed bug never reopens. It is verified by the hash chain alone — no replay.
  const resolution = [...stream].reverse().find((e) => e.kind === "bug.resolved") ?? null;
  return { db, id, scopeRef: `bug:${id}`, rec, resolution, related: relatedFeature(db, rec.related_scopes) };
}

/**
 * QA's derived state and history: its own view, in the contracted shape, cross-checked
 * against the ledger. Any failure here leaves the state unverified — never the evidence.
 */
function readState(db: Ledger, id: string, scopeRef: string, rec: ReturnType<typeof recordedBug>, resolution: any) {
  const viewFile = join(db.root, "bugs", id, "bug.md");
  if (!existsSync(viewFile)) throw new Refusal("QA_VIEW_MISSING", `bugs/${id}/bug.md is missing — ${regenerate(id)}`);
  const view = parseBugView(readFileSync(viewFile, "utf-8"), id);

  // The view is QA's derivation; the ledger is the record. They must agree on every
  // recorded fact, and on which runs and fix claims exist — otherwise the view is stale.
  const runs = db.runs().filter((r) => r.records[0]?.kind === "run.opened" && r.records[0].bug_ref === scopeRef && r.records.some((x) => x.kind === "run.closed"));
  const runIds = (type: string) => runs.filter((r) => r.records[0].execution_type === type).map((r) => r.records[0].run_id).sort();
  const claimBuilds = db.builds().filter((b) => (b.fixes_claimed ?? []).includes(scopeRef)).map((b) => b.build_id).sort();
  const f = view.fields;
  const mismatches = [
    ...(f.Bug === scopeRef ? [] : ["Bug"]),
    ...(view.title === rec.title ? [] : ["title"]),
    ...(sameList(view.steps, rec.report.steps) ? [] : ["steps"]),
    ...(view.expected === rec.report.expected ? [] : ["expected"]),
    ...(view.actual === rec.report.actual ? [] : ["actual"]),
    ...(f.Severity === rec.severity ? [] : ["severity"]),
    ...((f["Affected surfaces"] ?? "") === rec.surfaces.join(", ") ? [] : ["affected surfaces"]),
    ...(f["External reference"] === (rec.external_ref ?? null) ? [] : ["external reference"]),
    ...(f.Capability === rec.capability ? [] : ["capability"]),
    ...(rec.report.found_in_build === null || f["Found in build"] === rec.report.found_in_build ? [] : ["found in build"]),
    ...(resolution === null || f.State === `closed_${resolution.resolution}` ? [] : ["state (the ledger records a resolution)"]),
    ...(sameList(view.reproductions.map((r) => r.Run as string).sort(), runIds("reproduction")) ? [] : ["reproduction history"]),
    ...(sameList(view.retests.map((r) => r.Run as string).sort(), runIds("retest")) ? [] : ["re-test history"]),
    ...(sameList(view.fixClaims.map((r) => r.Build as string).sort(), claimBuilds) ? [] : ["fix claims"]),
  ];
  if (mismatches.length) {
    throw new Refusal("QA_VIEW_STALE", `bugs/${id}/bug.md disagrees with the ledger on: ${mismatches.join(", ")} — ${regenerate(id)}`, { mismatches });
  }
  return { view, runs };
}

/** The Dev feature a QA feature scope is bound to (its recorded `dev_handoff.feature`), when exactly one. */
function relatedFeature(db: Ledger, relatedScopes: string[]): string | null {
  const devIds = new Set<string>();
  for (const s of relatedScopes) {
    if (!s.startsWith("feature:")) continue;
    const recs = db.featureStream(s.slice("feature:".length));
    const dev = recs ? foldContext(recs).dev_handoff?.feature : undefined;
    if (typeof dev === "string" && isSafeKey(dev)) devIds.add(dev);
  }
  return devIds.size === 1 ? [...devIds][0] : null;
}

const GATE: Record<string, { status: Status; dev: boolean; reason: (v: BugView) => string }> = {
  assigned: { status: "ready_for_dev", dev: true, reason: () => "QA reproduced the bug and it is Dev's to fix." },
  reopened: {
    status: "reopened",
    dev: true,
    reason: (v) => `QA re-tested the fix and it failed (${v.fixClaims.filter((c) => c.Outcome === "failed").map((c) => c.Build).join(", ")}) — Dev starts the next fix cycle for the same bug.`,
  },
  fix_delivered: {
    status: "awaiting_qa_retest",
    dev: false,
    reason: (v) => `Build ${v.fields["Fix under test"]} claims the fix and awaits QA re-test on ${v.fields["Pending re-test surfaces"] ?? "its surfaces"} (/retest-bug) — no new fix cycle starts until QA re-tests it.`,
  },
  new: { status: "needs_qa_verification", dev: false, reason: () => "QA has not reproduced this bug yet — QA's next step is /verify-bug; Dev starts only once QA assigns it." },
  verification_blocked: {
    status: "needs_qa_verification",
    dev: false,
    reason: () => "QA's reproduction attempt was blocked — QA's next step is another /verify-bug; Dev starts only once QA assigns it.",
  },
};
const CLOSED_REASON = (state: string) => `The bug is ${state} in QA — there is nothing for Dev to fix. A recurrence is a new bug (/report-bug).`;

/**
 * What a reopened bug's next fix cycle starts from: the fix build QA most recently failed,
 * the surfaces it failed on, the latest re-test (with its notes and recorded evidence) and
 * every previous fix claim. Pure — read off the view and the bug's run records.
 */
export function reopenedEvidence(view: BugView, runRecords: any[][], scopeRef: string) {
  const failed = view.fixClaims.filter((c) => c.Outcome === "failed");
  const failedBuild = failed.length ? (failed[failed.length - 1].Build as string) : null;
  const latest = view.retests.length ? view.retests[view.retests.length - 1] : null;
  const latestRun = latest ? runRecords.find((recs) => recs[0]?.run_id === latest.Run) : undefined;
  const r1 = latestRun ? latestRun.filter((x) => x.kind === "result.recorded" && x.case_key === `${scopeRef}#R1`) : [];
  return {
    failed_fix_build: failedBuild,
    failed_surfaces: [...new Set(view.retests.filter((r) => r["Fix build"] === failedBuild && r.Outcome === "fail").map((r) => r.Surface as string))].sort(),
    latest_retest: latest
      ? { run: latest.Run, build: latest.Build, fix_build: latest["Fix build"], surface: latest.Surface, device: latest.Device, outcome: latest.Outcome, at: latest.At, notes: latest.Notes }
      : null,
    evidence: r1.length ? (r1[r1.length - 1].evidence as string[]) : [],
    previous_fix_claims: view.fixClaims.map((c) => ({ build: c.Build, outcome: c.Outcome })),
  };
}

const qaBlock = (view: BugView, state: string) => ({
  state,
  next_action: view.fields["Next action"],
  fix_under_test: view.fields["Fix under test"],
  fixed_in_build: view.fields["Fixed in build"],
  pending_retest_surfaces: (view.fields["Pending re-test surfaces"] ?? "").split(", ").filter(Boolean),
  fix_claims: view.fixClaims,
  reproductions: view.reproductions.map((r) => ({ run: r.Run, build: r.Build, surface: r.Surface, device: r.Device, outcome: r.Outcome, at: r.At, notes: r.Notes })),
  retests: view.retests.map((r) => ({ run: r.Run, build: r.Build, fix_build: r["Fix build"], surface: r.Surface, device: r.Device, outcome: r.Outcome, at: r.At, notes: r.Notes })),
  evidence: view.evidence,
});

/**
 * Read one QA bug at the richest context level available:
 *
 *   full          QA's state is verified (its view, cross-checked; or a resolution the
 *                 ledger records) — QA's ownership decides, a denial included
 *   partial       the evidence is verified but QA's state is not — Dev may proceed, with a
 *                 warning; no state is assumed
 *   insufficient  no reliable evidence — blocked, with what is missing
 *
 * A verified QA state always wins: only the absence of one degrades to partial.
 */
export function lookupQaBug(qaRoot: string, ref: string): Record<string, any> {
  let src;
  try {
    src = readSource(qaRoot, ref);
  } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    if (e.code === "AMBIGUOUS") return { ok: false, status: "ambiguous", context_level: "insufficient", code: e.code, reason: e.message, dev_may_start: false, ...e.extra };
    return invalid(e.code, e.message, { missing: ["report_source"], ...e.extra });
  }
  const { db, id, scopeRef, rec, resolution, related } = src;

  const warnings: Array<{ code: string; message: string }> = [];
  let read: { view: BugView; runs: Array<{ id: string; records: any[] }> } | null = null;
  try {
    read = readState(db, id, scopeRef, rec, resolution);
  } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    warnings.push({ code: e.code, message: e.message });
  }

  // The verified QA state, and what verified it. Never assumed, never inferred.
  let state: string | null = null;
  let stateSource: Record<string, string> | null = null;
  if (read) {
    state = read.view.fields.State as string;
    stateSource = { source: "qa-bug-view", path: `bugs/${id}/bug.md`, verification: "contract + ledger cross-check" };
  } else if (resolution) {
    state = `closed_${resolution.resolution}`;
    stateSource = { source: "qa-ledger", path: `qa-ledger/scopes/bug/${id}.jsonl`, record: "bug.resolved", verification: "hash-chain" };
  }

  const origin: Origin = rec.report.origin?.kind === "execution" ? "qa-execution" : "qa-standalone";
  // Without QA's view, found-in build is only what the report recorded; QA's derived value
  // (the first reproduced build) is not re-derived here.
  const found = read ? read.view.fields["Found in build"] : (rec.report.found_in_build ?? null);
  if (state === null) {
    warnings.unshift({
      code: "QA_STATE_UNAVAILABLE",
      message: "QA ownership state is unavailable or unverified — proceeding on the hash-verified ledger evidence only. QA's state was not used and is not assumed.",
    });
  }
  if (!read && found === null) {
    warnings.push({ code: "FOUND_IN_BUILD_UNKNOWN", message: "found-in build is unknown: the report did not record one and QA's derived value is unavailable." });
  }

  const identity: Identity = {
    work_type: "bug",
    bug_key: deriveBugKey({ qa_bug_id: id, external_ref: rec.external_ref, origin, title: rec.title, steps: rec.report.steps }),
    qa_bug_id: id,
    external_ref: rec.external_ref ?? null,
    origin,
    found_in_build: found,
    surfaces: rec.surfaces,
    capability: rec.capability,
    related_feature: related,
  };
  const evidence = {
    title: rec.title,
    description: rec.report.description ?? null,
    steps: rec.report.steps ?? [],
    expected: rec.report.expected ?? "",
    actual: rec.report.actual ?? "",
    severity: rec.severity,
    environment: null,
    linked_cases: rec.linked_cases,
    related_scopes: rec.related_scopes,
  };
  const context = {
    identity,
    evidence,
    bug_evidence_fingerprint: evidenceFingerprint({ ...evidence, surfaces: identity.surfaces, found_in_build: identity.found_in_build }),
    provenance: { evidence: { source: "qa-ledger", path: `qa-ledger/scopes/bug/${id}.jsonl`, verification: "hash-chain" }, state: stateSource },
    warnings,
  };

  // 1. A verified QA state decides first — a denial is never degraded into partial.
  const gate = state === null ? null : (GATE[state] ?? { status: "closed" as Status, dev: false, reason: () => CLOSED_REASON(state as string) });
  if (gate && !gate.dev) {
    return {
      ok: true,
      status: gate.status,
      reason: read ? gate.reason(read.view) : CLOSED_REASON(state as string),
      dev_may_start: false,
      context_level: "full",
      qa_state: state,
      qa_state_verified: true,
      ...context,
      qa: read ? qaBlock(read.view, state as string) : null,
      reopened: null,
    };
  }

  // 2. Dev works only from sufficient evidence.
  const missing = missingEvidence(evidence);
  if (missing.length) return invalid("MISSING_EVIDENCE", `required evidence missing: ${missing.join(", ")}`, { missing, ...context });

  // 3. Full context: QA handed the bug to Dev.
  if (gate && read) {
    return {
      ok: true,
      status: gate.status,
      reason: gate.reason(read.view),
      dev_may_start: true,
      context_level: "full",
      qa_state: state,
      qa_state_verified: true,
      ...context,
      qa: qaBlock(read.view, state as string),
      // Reopened: the failed cycle's evidence, for a later fix-cycle step. No cycle is created here.
      reopened: state === "reopened" ? reopenedEvidence(read.view, read.runs.map((r) => r.records), scopeRef) : null,
    };
  }

  // 4. Partial context: verified evidence, unverified QA state — a degraded, declared proceed.
  return {
    ok: true,
    status: "ready_for_dev",
    reason: `Partial context: QA ownership state is unavailable (${warnings.filter((w) => w.code !== "QA_STATE_UNAVAILABLE" && w.code !== "FOUND_IN_BUILD_UNKNOWN").map((w) => w.code).join(", ")}) — Dev may proceed on the verified bug evidence; see warnings.`,
    dev_may_start: true,
    context_level: "partial",
    qa_state: null,
    qa_state_verified: false,
    ...context,
    qa: null,
    reopened: null,
  };
}

/** Contract and integrity only — whatever QA's state, can this bug be read faithfully? */
export function validateQaBug(qaRoot: string, ref: string): Record<string, any> {
  const r = lookupQaBug(qaRoot, ref);
  if (r.context_level === "insufficient") return r;
  const clean = r.context_level === "full" && r.warnings.length === 0;
  return {
    ok: true,
    status: clean ? "valid" : "degraded",
    reason: clean ? "the ledger verifies and the view matches it" : "the evidence verifies; QA's view does not — see warnings",
    context_level: r.context_level,
    qa_bug_id: r.identity.qa_bug_id,
    qa_state: r.qa_state,
    warnings: r.warnings,
  };
}

/* --------------------------------------------------------------------- CLI */

function main(): void {
  const args = process.argv.slice(2);
  const values = (name: string): string[] => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] !== undefined ? [args[i + 1]] : []));
  const value = (name: string): string | undefined => values(name)[0];
  const print = (v: unknown): never => {
    console.log(JSON.stringify(v, null, 2));
    process.exit(0);
  };
  const cmd = args[0];
  if (cmd === "lookup" || cmd === "validate") {
    const ref = args[1];
    const qaRepo = value("qa-repo");
    if (!ref || ref.startsWith("--") || !qaRepo) print(invalid("MISSING_ARGUMENT", `${cmd} needs <bug-ref> and --qa-repo <path>`));
    print(cmd === "lookup" ? lookupQaBug(qaRepo as string, ref) : validateQaBug(qaRepo as string, ref));
  }
  if (cmd === "normalize") {
    let report: Record<string, unknown> = {};
    const file = value("report");
    if (file !== undefined) {
      try {
        report = JSON.parse(readFileSync(file, "utf-8"));
      } catch (e) {
        print(invalid("INVALID_REPORT", `--report ${file} is not a readable JSON report: ${e instanceof Error ? e.message : String(e)}`));
      }
    }
    const flagged: Record<string, unknown> = {
      origin: value("origin"),
      external_ref: value("external"),
      title: value("title"),
      description: value("description"),
      steps: values("step").length ? values("step") : undefined,
      expected: value("expected"),
      actual: value("actual"),
      surfaces: value("surfaces")?.split(",").map((s) => s.trim()).filter(Boolean),
      found_in_build: value("found-in-build"),
      environment: value("environment"),
      related_feature: value("related-feature"),
    };
    const given = Object.fromEntries(Object.entries(flagged).filter(([, v]) => v !== undefined));
    const merged = { ...report, ...given };
    const overrides = Object.keys(given).filter((k) => k !== "origin" && k in report);
    print(normalizeBug(merged, file !== undefined ? { source: "report-file", path: resolve(file), overridden_by_flags: overrides } : { source: "cli-flags" }));
  }
  print(invalid("UNKNOWN_COMMAND", "first argument must be lookup, validate or normalize"));
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /bug-intake\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) main();
