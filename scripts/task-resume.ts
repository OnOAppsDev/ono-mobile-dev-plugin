/**
 * task-resume.ts
 *
 * ENG-003. The deterministic evidence behind resuming an interrupted `/implement-task`
 * run and reconciling an upstream change: repository snapshots, content fingerprints,
 * the SDLC chain verdict, and the resume verdict itself.
 *
 * This module never reads or writes the task-state file. `scripts/task-state.ts` stays
 * the only component that does (docs/task-state-contract.md, guarantee 4); it passes the
 * record in and persists whatever this module computes. Keeping the two apart means the
 * store has one parser and the evidence has one definition.
 *
 * Every verdict here is a comparison of hashes this module computed itself — of file
 * bytes, of planning-document bodies and sections, of task-row cells. No clock is read,
 * no file timestamp is consulted, and nothing the caller asserts in prose is trusted: a
 * timestamp can move without the content moving, and the content is what the work was
 * built against.
 *
 * It reuses the existing fingerprint infrastructure rather than adding a second one:
 * `fingerprintBody` (SHARED-013) for planning-document bodies, and `splitDocument` for
 * the single definition of where frontmatter ends.
 */

import { readFileSync, readdirSync } from "fs";
import { join, isAbsolute, relative, resolve, sep } from "path";
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { splitDocument, fingerprintBody } from "./migrate-planning-doc.ts";

/* --------------------------------------------------------------- hashing */

const sha = (data: Buffer | string): string => `sha256:${createHash("sha256").update(data).digest("hex")}`;

type Bytes = { kind: "file"; buf: Buffer } | { kind: "dir" } | null;

function readBytes(path: string): Bytes {
  try {
    return { kind: "file", buf: readFileSync(path) };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EISDIR") return { kind: "dir" };
    return null;
  }
}

/**
 * The content fingerprint of a file — its raw bytes — or of a directory, as the sorted
 * list of its files' relative paths and fingerprints. `null` means absent. A deleted file
 * therefore has a well-defined value, and "still deleted" matches it.
 */
export function fingerprintFile(path: string): string | null {
  const b = readBytes(path);
  if (b === null) return null;
  if (b.kind === "file") return sha(b.buf);
  const lines: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) lines.push(`${relative(path, p).split(sep).join("/")}\0${fingerprintFile(p)}`);
    }
  };
  walk(path);
  return sha(lines.join("\n"));
}

export interface FileHash {
  path: string;
  hash: string | null;
}

export function hashRel(root: string, rel: string): string | null {
  return fingerprintFile(join(root, rel));
}

/** A repository-relative path that stays inside the root, or null. Never persisted absolute. */
export function normalizeRel(root: string, p: string): string | null {
  if (typeof p !== "string" || p.trim() === "") return null;
  const abs = isAbsolute(p) ? p : resolve(root, p);
  const rel = relative(root, abs);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

/* ----------------------------------------------------------- frontmatter */

export type Frontmatter = Record<string, string | null>;

const NULLISH = new Set(["", "null", "~"]);

/** Flat `key: value` frontmatter through the one shared splitter. Null when there is none. */
export function readFrontmatter(buf: Buffer): Frontmatter | null {
  const split = splitDocument(buf);
  if ("error" in split) return null;
  const out: Frontmatter = {};
  for (const line of split.inner) {
    const m = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/.exec(line);
    if (m === null) continue;
    let v = m[2].replace(/\s+#.*$/, "").trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = NULLISH.has(v) ? null : v;
  }
  return out;
}

/* ------------------------------------------------ design-reference fingerprint */

export const DESIGN_FIELDS = ["design_reference_status", "design_reference_type", "design_reference", "figma_link"] as const;

const norm = (v: unknown): string => (v === null || v === undefined || NULLISH.has(String(v).trim()) ? "" : String(v).trim());

/**
 * The design-reference fingerprint: the four carried fields, plus the content of the
 * reference when it is a local file or folder inside the repository (a spec document,
 * exported mockups). A URL — Figma included — contributes only its text: no MCP exposes a
 * version or content hash, so content drift behind an unchanged URL stays an attestation,
 * exactly as `/implement-task` §5a already says.
 */
export function designReferenceFingerprint(root: string, fields: Record<string, unknown>): string {
  const parts = DESIGN_FIELDS.map((k) => `${k}=${norm(fields[k])}`);
  const ref = norm(fields.design_reference);
  if (ref !== "" && !/^[a-z][a-z0-9+.-]*:\/\//i.test(ref)) {
    const rel = normalizeRel(root, ref);
    const fp = rel === null ? null : hashRel(root, rel);
    if (fp !== null) parts.push(`content=${fp}`);
  }
  return sha(parts.join("\n"));
}

/* ------------------------------------------------------ section fingerprints */

/** GitHub-style heading anchor, so a basis reference reads like the link a human would write. */
export function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/**
 * One fingerprint per heading, covering that heading's whole section — up to the next
 * heading at the same or a higher level — so `dd#19-…` covers its subsections and
 * `dd#191-hook` does not see an edit to `dd#192-screen`. Bytes are hashed as they are:
 * there is no normalization to drift from `fingerprintBody`'s.
 */
export function sectionFingerprints(body: string): Record<string, string> {
  const lines = body.split("\n");
  const heads: Array<{ level: number; slug: string; start: number }> = [];
  const seen = new Map<string, number>();
  let fence = false;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) return;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m === null) return;
    const base = slugify(m[2]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    heads.push({ level: m[1].length, slug: n === 0 ? base : `${base}-${n}`, start: i });
  });
  const out: Record<string, string> = {};
  heads.forEach((h, idx) => {
    let end = lines.length;
    for (let j = idx + 1; j < heads.length; j++) {
      if (heads[j].level <= h.level) {
        end = heads[j].start;
        break;
      }
    }
    out[h.slug] = sha(lines.slice(h.start, end).join("\n"));
  });
  return out;
}

/* ------------------------------------------------------------- task rows */

const DEFAULT_COLUMNS = ["id", "description", "platform", "files touched", "depends-on", "size", "acceptance criteria"];

function cells(line: string): string[] {
  let l = line.trim();
  if (l.startsWith("|")) l = l.slice(1);
  if (l.endsWith("|")) l = l.slice(0, -1);
  return l.split("|").map((c) => c.trim().replace(/\s+/g, " "));
}

/** The selected row's cells keyed by the breakdown's own header names, lowercased. */
export function rowCells(markdown: string, taskId: string): Record<string, string> | null {
  let columns = DEFAULT_COLUMNS;
  for (const line of markdown.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const c = cells(line);
    if ((c[0] ?? "").toLowerCase() === "id") {
      columns = c.map((x) => x.toLowerCase());
      continue;
    }
    if (c[0] === taskId) {
      const out: Record<string, string> = {};
      columns.forEach((name, i) => (out[name] = c[i] ?? ""));
      return out;
    }
  }
  return null;
}

/** Paths named in a "files touched" cell: backticked tokens, else comma-separated text. */
export function filesFromCell(cell: string | undefined): string[] {
  if (cell === undefined) return [];
  const ticked = [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
  const raw = ticked.length > 0 ? ticked : cell.split(/,|;|<br\s*\/?>/i).map((s) => s.trim());
  return raw.filter((s) => s !== "" && s !== "—" && s !== "-");
}

/* -------------------------------------------------------------------- git */

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function gitBuf(root: string, args: string[]): Buffer | null {
  try {
    return execFileSync("git", ["-C", root, ...args], { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

export interface GitState {
  available: boolean;
  head: string | null;
  branch: string | null;
  /** Every path git reports modified, added, deleted, renamed or untracked. Sorted. */
  changed: string[];
}

export function gitState(root: string): GitState {
  if (git(root, ["rev-parse", "--is-inside-work-tree"])?.trim() !== "true") {
    return { available: false, head: null, branch: null, changed: [] };
  }
  const head = git(root, ["rev-parse", "-q", "--verify", "HEAD"])?.trim() || null;
  const branch = git(root, ["symbolic-ref", "-q", "--short", "HEAD"])?.trim() || null;
  const status = git(root, ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z", "--untracked-files=all"]) ?? "";
  const entries = status.split("\0");
  const changed = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.length < 4) continue;
    changed.add(e.slice(3));
    if (e[0] === "R" || e[0] === "C") {
      if (entries[i + 1]) changed.add(entries[i + 1]);
      i++;
    }
  }
  return { available: true, head, branch, changed: [...changed].sort() };
}

/** The file's fingerprint as committed at `rev`; null when it did not exist there. */
export function hashAtCommit(root: string, rev: string, rel: string): string | null {
  const buf = gitBuf(root, ["cat-file", "blob", `${rev}:${rel}`]);
  return buf === null ? null : sha(buf);
}

function diffNames(root: string, from: string, to: string): string[] | null {
  const out = git(root, ["-c", "core.quotepath=false", "diff", "--name-only", "--no-renames", "-z", from, to]);
  return out === null ? null : out.split("\0").filter(Boolean).sort();
}

function isAncestor(root: string, a: string, b: string): boolean {
  try {
    execFileSync("git", ["-C", root, "merge-base", "--is-ancestor", a, b], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** The plugin's own store and its atomic-write temp file — never task work, never external. */
export function isStoreArtifact(rel: string): boolean {
  return /^docs\/tasks\/[^/]+-task-state\.json$/.test(rel) || /^docs\/tasks\/\.[^/]*\.task-state\.tmp$/.test(rel);
}

export interface Baseline {
  gitAvailable: boolean;
  head: string | null;
  branch: string | null;
  /** Dirty and untracked files that existed before the run began, with their content hashes. */
  dirty: FileHash[];
}

export function captureBaseline(root: string, excluded: (rel: string) => boolean): Baseline {
  const g = gitState(root);
  return {
    gitAvailable: g.available,
    head: g.head,
    branch: g.branch,
    dirty: g.changed.filter((p) => !excluded(p)).map((path) => ({ path, hash: hashRel(root, path) })),
  };
}

/* ----------------------------------------------------------- the document chain */

interface Doc {
  rel: string | null;
  abs: string;
  buf: Buffer | null;
  fm: Frontmatter | null;
}

export interface ChainDocs {
  root: string;
  breakdown: Doc;
  analysis: Doc | null;
  dd: Doc | null;
  devPlanRel: string | null;
}

function loadDoc(root: string, p: string): Doc {
  const abs = isAbsolute(p) ? p : resolve(root, p);
  const b = readBytes(abs);
  const buf = b !== null && b.kind === "file" ? b.buf : null;
  return { rel: normalizeRel(root, abs), abs, buf, fm: buf === null ? null : readFrontmatter(buf) };
}

/** Every upstream document is resolved from the breakdown's own link fields — no filename guessing. */
export function resolveDocs(root: string, breakdownPath: string | undefined): ChainDocs {
  const breakdown = loadDoc(root, breakdownPath ?? "");
  const link = (d: Doc | null, key: string): Doc | null => {
    const v = d?.fm?.[key];
    return v ? loadDoc(root, v) : null;
  };
  const dd = link(breakdown, "dd_link");
  const analysis = link(breakdown, "feature_analysis_link") ?? link(dd, "feature_analysis_link");
  const devPlan = breakdown.fm?.dev_plan_link ? normalizeRel(root, breakdown.fm.dev_plan_link) : null;
  return { root, breakdown, analysis, dd, devPlanRel: devPlan };
}

/**
 * The upstream artifacts. Their changes are judged by the chain verdict, never by the
 * scope check — a regenerated DD is reconciliation input, not an out-of-scope edit.
 */
export function upstreamArtifacts(docs: ChainDocs): Set<string> {
  const out = new Set<string>();
  for (const d of [docs.breakdown, docs.dd, docs.analysis]) if (d?.rel) out.add(d.rel);
  if (docs.devPlanRel) out.add(docs.devPlanRel);
  const fa = docs.analysis?.fm;
  if (fa?.source_link) {
    const r = normalizeRel(docs.root, fa.source_link);
    if (r) out.add(r);
  }
  for (const fm of [fa, docs.dd?.fm, docs.breakdown.fm]) {
    const ref = fm?.design_reference;
    if (ref && !/^[a-z][a-z0-9+.-]*:\/\//i.test(ref)) {
      const r = normalizeRel(docs.root, ref);
      if (r && hashRel(docs.root, r) !== null) out.add(r);
    }
  }
  return out;
}

export type StageName = "feature-analysis" | "dd" | "task-breakdown";
export type CheckStatus = "current" | "stale" | "unknown";

export interface ChainCheck {
  name: string;
  status: CheckStatus;
  recorded: string | null;
  current: string | null;
  detail: string;
}

export interface StageVerdict {
  stage: StageName;
  /** The one command that regenerates this stage's document. */
  command: string;
  document: string | null;
  /** `pending-upstream`: an earlier stage is stale, so this stage waits for it to be regenerated. */
  status: CheckStatus | "pending-upstream";
  /** This stage's own checks, independent of the stages above it. */
  ownStatus: CheckStatus;
  checks: ChainCheck[];
}

export interface ChainResult {
  stages: StageVerdict[];
  earliestStale: StageVerdict | null;
  summary: string;
}

function compare(name: string, recorded: string | null | undefined, current: string | null, what: string): ChainCheck {
  if (!recorded) {
    return { name, status: "unknown", recorded: null, current, detail: `${what}: not recorded (a document written before this field existed) — unknown, never a mismatch` };
  }
  if (current === null) return { name, status: "stale", recorded, current, detail: `${what}: the recorded input no longer exists` };
  return recorded === current
    ? { name, status: "current", recorded, current, detail: `${what}: unchanged` }
    : { name, status: "stale", recorded, current, detail: `${what}: changed since this document was generated` };
}

function compareDesignFields(down: Doc | null, up: Doc | null): ChainCheck {
  if (!down?.fm || !up?.fm) return { name: "design-fields", status: "unknown", recorded: null, current: null, detail: "design-reference fields: a document is missing" };
  const diff = DESIGN_FIELDS.filter((k) => norm(down.fm?.[k]) !== norm(up.fm?.[k]));
  return diff.length === 0
    ? { name: "design-fields", status: "current", recorded: null, current: null, detail: "design-reference fields: carried verbatim" }
    : { name: "design-fields", status: "stale", recorded: null, current: null, detail: `design-reference fields re-pointed upstream: ${diff.join(", ")}` };
}

const bodyFp = (d: Doc | null): string | null => (d?.buf ? fingerprintBody(d.buf) : null);

function ownStatus(checks: ChainCheck[]): CheckStatus {
  if (checks.some((c) => c.status === "stale")) return "stale";
  return checks.some((c) => c.status === "current") ? "current" : "unknown";
}

/**
 * The SDLC chain verdict. Each stage is checked against the stage above it with the
 * fingerprints the stage recorded at generation. The EARLIEST stale stage is the one to
 * rerun; every stage below it is `pending-upstream` — not stale — because whether it
 * must be rerun depends on whether regenerating the stage above actually changes that
 * stage's body. Rerunning it with a byte-identical result leaves everything below current.
 */
export function chainFromDocs(docs: ChainDocs): ChainResult {
  const { root, analysis: fa, dd, breakdown: tb } = docs;

  const faChecks: ChainCheck[] = [];
  const src = fa?.fm?.source_link ? normalizeRel(root, fa.fm.source_link) : null;
  faChecks.push(
    fa?.fm?.source_link
      ? compare("requirements", fa.fm.source_fingerprint, src === null ? null : hashRel(root, src), `source specification ${fa.fm.source_link}`)
      : { name: "requirements", status: "unknown", recorded: null, current: null, detail: "source specification: none linked (the request was given inline, so the analysis body is the root)" },
  );
  faChecks.push(
    compare("design-reference", fa?.fm?.design_reference_fingerprint, fa?.fm ? designReferenceFingerprint(root, fa.fm) : null, "design reference"),
  );

  const ddChecks = [compare("source", dd?.fm?.source_fingerprint, bodyFp(fa), "feature analysis body"), compareDesignFields(dd, fa)];
  const tbChecks = [compare("source", tb.fm?.source_fingerprint, bodyFp(dd), "DD body"), compareDesignFields(tb, dd)];

  const raw: Array<Omit<StageVerdict, "status">> = [
    { stage: "feature-analysis", command: "/analyze-feature", document: fa?.rel ?? null, ownStatus: fa?.fm ? ownStatus(faChecks) : "unknown", checks: faChecks },
    { stage: "dd", command: "/dev-design-start", document: dd?.rel ?? null, ownStatus: dd?.fm ? ownStatus(ddChecks) : "unknown", checks: ddChecks },
    { stage: "task-breakdown", command: "/dev-feature-start", document: tb.rel, ownStatus: tb.fm ? ownStatus(tbChecks) : "unknown", checks: tbChecks },
  ];

  let earliest: StageVerdict | null = null;
  const stages: StageVerdict[] = raw.map((s) => {
    const v: StageVerdict = { ...s, status: earliest === null ? s.ownStatus : "pending-upstream" };
    if (earliest === null && s.ownStatus === "stale") earliest = v;
    return v;
  });
  const e = earliest as StageVerdict | null;
  return {
    stages,
    earliestStale: e,
    summary:
      e === null
        ? "Upstream chain: current — no stage needs regenerating."
        : `Upstream chain: ${e.stage} is the earliest stale stage (${e.checks.filter((c) => c.status === "stale").map((c) => c.detail).join("; ")}). Rerun ${e.command}; stages below it wait for its result.`,
  };
}

export function chainStatus(root: string, breakdownPath: string): ChainResult {
  return chainFromDocs(resolveDocs(root, breakdownPath));
}

/* ------------------------------------------------------------------ basis */

/**
 * Every basis reference a checkpoint or validation may cite, with its current hash:
 *
 *   row, row:<column>          the task row, or one of its cells
 *   dd, dd#<anchor>            the DD body, or one section of it
 *   analysis, analysis#<anchor>
 *   breakdown                  the Task Breakdown body
 *   requirements, design       the source specification and the design reference
 *   probe:<name>               the latest recorded output of a toolchain probe
 */
export function currentBasis(
  docs: ChainDocs,
  taskId: string,
  rowFingerprint: string | null,
  probes: ProbeRecord[] = [],
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  out.row = rowFingerprint;
  const text = docs.breakdown.buf?.toString("utf-8") ?? "";
  const row = rowCells(text, taskId);
  if (row !== null) for (const [k, v] of Object.entries(row)) out[`row:${k}`] = sha(v);
  for (const [key, doc] of [["dd", docs.dd], ["analysis", docs.analysis]] as const) {
    if (!doc?.buf) continue;
    out[key] = fingerprintBody(doc.buf);
    const split = splitDocument(doc.buf);
    const body = "error" in split ? doc.buf.toString("utf-8") : split.body.toString("utf-8");
    for (const [slug, fp] of Object.entries(sectionFingerprints(body))) out[`${key}#${slug}`] = fp;
  }
  out.breakdown = bodyFp(docs.breakdown);
  const fa = docs.analysis?.fm;
  const src = fa?.source_link ? normalizeRel(docs.root, fa.source_link) : null;
  out.requirements = src === null ? null : hashRel(docs.root, src);
  out.design = docs.breakdown.fm ? designReferenceFingerprint(docs.root, docs.breakdown.fm) : null;
  for (const p of latestProbes(probes)) out[`probe:${p.name}`] = p.outputFingerprint;
  return out;
}

/** The inputs a run records at its start, so a later resume can name exactly what moved. */
export const UPSTREAM_KEYS = ["requirements", "design", "analysis", "dd", "breakdown", "row"] as const;

/* -------------------------------------------------------- execution records */

export interface PlanStep {
  id: string;
  description: string;
  files: string[];
  basis: string[];
}

export interface Plan {
  expectedFiles: string[];
  steps: PlanStep[];
}

export interface StepCheckpoint {
  seq: number;
  stepId: string;
  /** The step's definition when it completed. A re-plan that redefines the step invalidates it. */
  stepFingerprint: string;
  files: FileHash[];
  basis: Record<string, string | null>;
}

export interface ValidationRecord {
  seq: number;
  kind: "validation" | "developer-test";
  command: string;
  result: "pass" | "fail";
  exitCode: number | null;
  covers: FileHash[];
  basis: Record<string, string | null>;
  evidence: { path: string; hash: string | null } | null;
}

export interface ProbeRecord {
  seq: number;
  name: string;
  command: string;
  output: string;
  outputFingerprint: string;
}

export interface ReviewRecord {
  seq: number;
  completed: string[];
  findings: string[];
  covers: FileHash[];
}

export interface ExecutionContext {
  platform: string | null;
  deviceType: string | null;
  accessibility: { applicable: boolean; reason: string | null; standardIds?: string[] } | null;
  designAttestation: string | null;
}

export interface DeveloperTestingCheckpoint {
  seq: number;
  developerTesting: {
    framework: string | null;
    required: boolean;
    testsChanged: string[];
    justification: string | null;
    runs: Array<{ command: string; result: "pass" | "fail" }>;
    notRunReason: string | null;
  };
  verificationDebt: unknown[];
}

export interface ExecutionBlock {
  runId: string;
  baseline: Baseline;
  context: ExecutionContext;
  upstream: Record<string, string | null>;
  /** The row's "files touched" when the run began. */
  expectedFiles: string[];
  plan: Plan | null;
  checkpoints: StepCheckpoint[];
  validations: ValidationRecord[];
  probes: ProbeRecord[];
  developerTesting: DeveloperTestingCheckpoint | null;
  review: ReviewRecord | null;
  /** Monotonic per-run counter: ordering without a clock. */
  seq: number;
  resumes: number;
  restartedFrom: string | null;
  /** Null while the run is active; the terminal state (or `abandoned`) once it is not. */
  outcome: string | null;
}

export function stepFingerprint(s: PlanStep): string {
  return sha(JSON.stringify({ id: s.id, description: s.description, files: [...s.files].sort(), basis: [...s.basis].sort() }));
}

export function latestProbes(probes: ProbeRecord[]): ProbeRecord[] {
  const by = new Map<string, ProbeRecord>();
  for (const p of probes) if ((by.get(p.name)?.seq ?? -1) < p.seq) by.set(p.name, p);
  return [...by.values()].sort((a, b) => a.seq - b.seq);
}

export function latestValidations(vs: ValidationRecord[]): ValidationRecord[] {
  const by = new Map<string, ValidationRecord>();
  for (const v of vs) {
    const k = `${v.kind}\0${v.command}`;
    if ((by.get(k)?.seq ?? -1) < v.seq) by.set(k, v);
  }
  return [...by.values()].sort((a, b) => a.seq - b.seq);
}

/** Files the task owns: named by the row, the plan, a checkpoint, or the developer-testing decision. */
export function taskOwnedFiles(ex: ExecutionBlock, currentRowFiles: string[], excluded: (rel: string) => boolean): string[] {
  const out = new Set<string>([...ex.expectedFiles, ...currentRowFiles]);
  for (const f of ex.plan?.expectedFiles ?? []) out.add(f);
  for (const s of ex.plan?.steps ?? []) for (const f of s.files) out.add(f);
  for (const c of ex.checkpoints) for (const f of c.files) out.add(f.path);
  for (const f of ex.developerTesting?.developerTesting.testsChanged ?? []) out.add(f);
  return [...out].filter((p) => !excluded(p)).sort();
}

/** Why a recorded file snapshot or basis no longer holds; empty when it still does. */
function drift(root: string, files: FileHash[], basis: Record<string, string | null>, now: Record<string, string | null>): string[] {
  const out: string[] = [];
  for (const f of files) {
    const cur = hashRel(root, f.path);
    if (cur !== f.hash) out.push(`${f.path} changed since it was recorded`);
  }
  for (const [ref, h] of Object.entries(basis)) {
    if (!(ref in now)) out.push(`basis ${ref} no longer exists`);
    else if (now[ref] !== h) out.push(`basis ${ref} changed`);
  }
  return out;
}

export interface ValidationVerdict {
  record: ValidationRecord;
  valid: boolean;
  reasons: string[];
}

/** Part D: a result is reusable only while its files AND its planning basis are unchanged. */
export function validationVerdicts(root: string, ex: ExecutionBlock, now: Record<string, string | null>): ValidationVerdict[] {
  return latestValidations(ex.validations).map((v) => {
    const reasons = drift(root, v.covers, v.basis, now);
    if (v.evidence !== null && hashRel(root, v.evidence.path) === null) reasons.push(`evidence ${v.evidence.path} is gone`);
    return { record: v, valid: reasons.length === 0, reasons };
  });
}

/* ---------------------------------------------------------- resume verdict */

export type FileClassName =
  | "matches-checkpoint"
  | "changed-after-checkpoint"
  | "expected-untouched"
  | "partial"
  | "preexisting-unchanged"
  | "outside-scope";

export interface FileClass {
  path: string;
  class: FileClassName;
  /** The checkpoint step for a checkpointed file, or the unfinished step that owns partial work. */
  stepId: string | null;
  recorded: string | null;
  current: string | null;
}

export interface Mismatch {
  kind: "head" | "branch" | "git" | "outside-scope" | "preexisting-changed";
  path: string | null;
  expected: string | null;
  actual: string | null;
  detail: string;
}

export type ResumeStatus = "no-active-run" | "resume" | "reconcile-upstream" | "restart" | "hard-stop";

export interface ResumeVerdict {
  status: ResumeStatus;
  taskId: string;
  runId: string | null;
  attempt: number | null;
  reasons: string[];
  mismatches: Mismatch[];
  files: FileClass[];
  checkpoints: { valid: string[]; invalidated: Array<{ stepId: string; reason: string }> };
  nextStep: { kind: "plan" | "step" | "validation" | "developer-testing" | "review" | "report"; stepId: string | null };
  partialFiles: string[];
  validations: {
    carried: Array<{ seq: number; command: string; kind: string; result: string }>;
    rerun: Array<{ seq: number; command: string; kind: string; reason: string }>;
  };
  developerTesting: { block: DeveloperTestingCheckpoint["developerTesting"]; verificationDebt: unknown[]; runs: Array<{ command: string; result: string; valid: boolean }> } | null;
  review: { completed: string[]; valid: boolean } | null;
  upstream: ChainResult;
  upstreamChanged: string[];
  context: ExecutionContext | null;
  summary: string;
}

export interface EvaluateInput {
  root: string;
  taskId: string;
  state: string | null;
  runId: string | null;
  attempt: number | null;
  execution: ExecutionBlock | null;
  rowFingerprint: string | null;
  breakdownPath: string;
}

/**
 * The resume verdict, in precedence order:
 *
 *   hard-stop           the repository no longer matches the recorded run and the
 *                       difference is not attributable to the run itself
 *   restart             nothing recorded can be verified (a legacy record), or the
 *                       platform / device type changed — the one upstream change that
 *                       genuinely invalidates everything written
 *   reconcile-upstream  a planning stage is stale; rerun the earliest one first
 *   resume              consistent: continue the same run from `nextStep`
 */
export function evaluateExecution(input: EvaluateInput): ResumeVerdict {
  const { root, taskId, execution: ex } = input;
  const docs = resolveDocs(root, input.breakdownPath);
  const upstream = chainFromDocs(docs);
  const verdict: ResumeVerdict = {
    status: "resume",
    taskId,
    runId: input.runId,
    attempt: input.attempt,
    reasons: [],
    mismatches: [],
    files: [],
    checkpoints: { valid: [], invalidated: [] },
    nextStep: { kind: "plan", stepId: null },
    partialFiles: [],
    validations: { carried: [], rerun: [] },
    developerTesting: null,
    review: null,
    upstream,
    upstreamChanged: [],
    context: ex?.context ?? null,
    summary: "",
  };
  const finish = (status: ResumeStatus, why: string[]): ResumeVerdict => {
    verdict.status = status;
    verdict.reasons.push(...why);
    verdict.summary = `Resume verdict for ${taskId}${input.runId ? ` (${input.runId})` : ""}: ${status}${verdict.reasons.length ? ` — ${verdict.reasons.join("; ")}` : ""}.`;
    return verdict;
  };

  if (input.state !== "in-progress") return finish("no-active-run", [`the task is ${input.state ?? "unrecorded"}, not in-progress`]);
  if (ex === null) {
    return finish("restart", ["legacy in-progress record: it carries no execution block, so there is nothing to verify and nothing to resume"]);
  }

  const artifacts = upstreamArtifacts(docs);
  const excluded = (p: string): boolean => artifacts.has(p) || isStoreArtifact(p);
  const bdText = docs.breakdown.buf?.toString("utf-8") ?? "";
  const row = rowCells(bdText, taskId);
  const rowFiles = filesFromCell(row?.["files touched"]).map((f) => normalizeRel(root, f)).filter((f): f is string => f !== null);
  const now = currentBasis(docs, taskId, input.rowFingerprint, ex.probes);
  verdict.upstreamChanged = UPSTREAM_KEYS.filter((k) => k in ex.upstream && ex.upstream[k] !== now[k]);

  /* 1. git: HEAD and branch */
  const g = gitState(root);
  const base = ex.baseline;
  let headMoved = false;
  if (base.gitAvailable) {
    if (!g.available) {
      verdict.mismatches.push({ kind: "git", path: null, expected: base.head, actual: null, detail: "the run began in a git repository and git state can no longer be read" });
    } else {
      if (g.branch !== base.branch) {
        verdict.mismatches.push({ kind: "branch", path: null, expected: base.branch, actual: g.branch, detail: `branch is ${g.branch ?? "(detached)"}, the run began on ${base.branch ?? "(detached)"}` });
      }
      if (g.head !== base.head) {
        headMoved = true;
        const names = base.head && g.head && isAncestor(root, base.head, g.head) ? diffNames(root, base.head, g.head) : null;
        const foreign = names?.filter((p) => !excluded(p)) ?? null;
        if (foreign === null) {
          verdict.mismatches.push({ kind: "head", path: null, expected: base.head, actual: g.head, detail: `HEAD moved from ${base.head} to ${g.head}, which is not a descendant of the run's baseline` });
        } else if (foreign.length > 0) {
          verdict.mismatches.push({ kind: "head", path: null, expected: base.head, actual: g.head, detail: `HEAD moved from ${base.head} to ${g.head} with commits touching files outside the upstream artifacts: ${foreign.join(", ")}` });
        }
      }
    }
  } else {
    verdict.reasons.push("the run began outside git: task-owned files are verified by hash, but out-of-scope changes cannot be enumerated");
  }

  const owned = taskOwnedFiles(ex, rowFiles, excluded);
  const ownedSet = new Set(owned);
  const dirtyAt = new Map(base.dirty.map((d) => [d.path, d.hash]));
  const baselineHash = (p: string): string | null | undefined =>
    dirtyAt.has(p) ? (dirtyAt.get(p) ?? null) : base.gitAvailable && base.head ? hashAtCommit(root, base.head, p) : undefined;

  /* 2. the developer's pre-existing work must be exactly as it was */
  for (const d of base.dirty) {
    if (ownedSet.has(d.path) || excluded(d.path)) continue;
    const cur = hashRel(root, d.path);
    if (cur === d.hash) verdict.files.push({ path: d.path, class: "preexisting-unchanged", stepId: null, recorded: d.hash, current: cur });
    else verdict.mismatches.push({ kind: "preexisting-changed", path: d.path, expected: d.hash, actual: cur, detail: `${d.path} was already modified before the run and has changed since` });
  }

  /* 3. nothing outside the task's scope may have changed */
  if (g.available) {
    const changedNow = new Set(g.changed);
    if (headMoved && base.head && g.head) for (const p of diffNames(root, base.head, g.head) ?? []) changedNow.add(p);
    for (const p of [...changedNow].sort()) {
      if (excluded(p) || ownedSet.has(p) || dirtyAt.has(p)) continue;
      const cur = hashRel(root, p);
      const was = base.head ? hashAtCommit(root, base.head, p) : null;
      if (cur === was) continue;
      verdict.files.push({ path: p, class: "outside-scope", stepId: null, recorded: was, current: cur });
      verdict.mismatches.push({ kind: "outside-scope", path: p, expected: was, actual: cur, detail: `${p} changed and is not owned by this task` });
    }
  }

  /* 4. checkpoints: planning basis and step definition */
  const plan = ex.plan;
  const steps = plan?.steps ?? [];
  const latestCp = new Map<string, StepCheckpoint>();
  for (const c of ex.checkpoints) if ((latestCp.get(c.stepId)?.seq ?? -1) < c.seq) latestCp.set(c.stepId, c);
  const invalid = new Map<string, string>();
  const done = new Set<string>();
  for (const s of steps) {
    const c = latestCp.get(s.id);
    if (c === undefined) continue;
    if (c.stepFingerprint !== stepFingerprint(s)) {
      invalid.set(s.id, "the step was redefined by a later plan");
      continue;
    }
    const d = drift(root, [], c.basis, now);
    if (d.length > 0) invalid.set(s.id, d.join("; "));
    else done.add(s.id);
  }
  const stepIndex = new Map(steps.map((s, i) => [s.id, i]));
  const ownerAfter = (p: string, after: number): string | null =>
    steps.find((s, i) => i > after && !done.has(s.id) && s.files.includes(p))?.id ?? null;

  /* 5. file classes (Part E) */
  for (const p of owned) {
    const cur = hashRel(root, p);
    let last: { stepId: string; seq: number; hash: string | null } | null = null;
    for (const c of ex.checkpoints) {
      const f = c.files.find((x) => x.path === p);
      if (f && (last === null || c.seq > last.seq)) last = { stepId: c.stepId, seq: c.seq, hash: f.hash };
    }
    if (last !== null) {
      if (cur === last.hash) {
        verdict.files.push({ path: p, class: "matches-checkpoint", stepId: last.stepId, recorded: last.hash, current: cur });
        continue;
      }
      verdict.files.push({ path: p, class: "changed-after-checkpoint", stepId: last.stepId, recorded: last.hash, current: cur });
      verdict.partialFiles.push(p);
      const owner = ownerAfter(p, stepIndex.get(last.stepId) ?? -1);
      if (owner === null && done.has(last.stepId)) {
        done.delete(last.stepId);
        invalid.set(last.stepId, `${p} changed after this step's checkpoint`);
      }
      continue;
    }
    const was = baselineHash(p);
    if (was !== undefined && cur === was) {
      verdict.files.push({ path: p, class: "expected-untouched", stepId: null, recorded: was, current: cur });
    } else {
      verdict.files.push({ path: p, class: "partial", stepId: ownerAfter(p, -1), recorded: was ?? null, current: cur });
      verdict.partialFiles.push(p);
    }
  }
  verdict.files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  verdict.partialFiles.sort();
  verdict.checkpoints.valid = steps.filter((s) => done.has(s.id)).map((s) => s.id);
  verdict.checkpoints.invalidated = steps.filter((s) => invalid.has(s.id)).map((s) => ({ stepId: s.id, reason: invalid.get(s.id) ?? "" }));

  /* 6. validations, developer testing, self-review (Part D) */
  const vv = validationVerdicts(root, ex, now);
  for (const v of vv) {
    const r = v.record;
    if (v.valid) verdict.validations.carried.push({ seq: r.seq, command: r.command, kind: r.kind, result: r.result });
    else verdict.validations.rerun.push({ seq: r.seq, command: r.command, kind: r.kind, reason: v.reasons.join("; ") });
  }
  if (ex.developerTesting !== null) {
    const dt = ex.developerTesting.developerTesting;
    verdict.developerTesting = {
      block: dt,
      verificationDebt: ex.developerTesting.verificationDebt,
      runs: dt.runs.map((run) => ({
        ...run,
        valid: vv.some((v) => v.valid && v.record.command === run.command && v.record.result === run.result),
      })),
    };
  }
  if (ex.review !== null) {
    verdict.review = { completed: ex.review.completed, valid: drift(root, ex.review.covers, {}, now).length === 0 };
  }

  const firstOpen = steps.find((s) => !done.has(s.id));
  verdict.nextStep =
    plan === null
      ? { kind: "plan", stepId: null }
      : firstOpen !== undefined
        ? { kind: "step", stepId: firstOpen.id }
        : verdict.validations.rerun.length > 0 || vv.length === 0
          ? { kind: "validation", stepId: null }
          : verdict.developerTesting === null || verdict.developerTesting.runs.some((r) => !r.valid)
            ? { kind: "developer-testing", stepId: null }
            : verdict.review === null || !verdict.review.valid
              ? { kind: "review", stepId: null }
              : { kind: "report", stepId: null };

  /* 7. the status, in precedence order */
  if (verdict.mismatches.length > 0) return finish("hard-stop", verdict.mismatches.map((m) => m.detail));
  const platformNow = row?.platform || docs.breakdown.fm?.platform || null;
  if (ex.context.platform && platformNow && platformNow !== ex.context.platform) {
    return finish("restart", [`the task's platform changed from ${ex.context.platform} to ${platformNow}; nothing written for the old platform can be reconciled`]);
  }
  const deviceNow = docs.breakdown.fm?.device_type ?? null;
  if (ex.context.deviceType && deviceNow && deviceNow !== ex.context.deviceType) {
    return finish("restart", [`device_type changed from ${ex.context.deviceType} to ${deviceNow}`]);
  }
  if (upstream.earliestStale !== null) {
    return finish("reconcile-upstream", [upstream.summary]);
  }
  const why: string[] = [];
  if (verdict.upstreamChanged.length > 0) why.push(`upstream inputs moved since the run began and the chain is current again: ${verdict.upstreamChanged.join(", ")}`);
  if (verdict.checkpoints.invalidated.length > 0) why.push(`invalidated checkpoints: ${verdict.checkpoints.invalidated.map((i) => i.stepId).join(", ")}`);
  why.push(`next: ${verdict.nextStep.kind}${verdict.nextStep.stepId ? ` ${verdict.nextStep.stepId}` : ""}`);
  return finish("resume", why);
}

/** Task-owned files whose current content differs from the run's baseline — what an abandoned run leaves behind. */
export function changedSinceBaseline(root: string, ex: ExecutionBlock, owned: string[]): string[] {
  const dirtyAt = new Map(ex.baseline.dirty.map((d) => [d.path, d.hash]));
  return owned.filter((p) => {
    const was = dirtyAt.has(p)
      ? (dirtyAt.get(p) ?? null)
      : ex.baseline.gitAvailable && ex.baseline.head
        ? hashAtCommit(root, ex.baseline.head, p)
        : null;
    return hashRel(root, p) !== was;
  });
}
