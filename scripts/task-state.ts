/**
 * task-state.ts
 *
 * Deterministic per-task lifecycle store for `/implement-task` (SHARED-004).
 * See docs/task-state-contract.md for the schema, the states, the trust levels and
 * the fingerprint normalization this file implements.
 *
 * This is the ONLY component in the plugin that reads or writes
 * `<TARGET_ROOT>/docs/tasks/{FEATURE}-task-state.json`. Commands receive its
 * normalized output and never touch the file themselves, so the contract lives in
 * exactly one place.
 *
 * Two properties matter most, and both are boundary conditions rather than features:
 *
 *   1. It never blocks a command. An absent, malformed, invalid or too-new file
 *      degrades to `unknown` for every task and the caller falls back to asking a
 *      human — exactly the behaviour that existed before this store did.
 *   2. A terminal `complete` cannot be recorded without verification evidence. The
 *      writer refuses it structurally rather than trusting the caller's prose, the
 *      same posture PROTECTED_KEYS takes in migrate-planning-doc.ts.
 *
 * Deterministic and clock-free by construction: no clock is read and no randomness is
 * used. "When, and by whom" is answered by Git. The caller supplies HEAD; this script
 * never shells out to git.
 *
 * ENG-003 adds the execution record behind a deterministic resume: an in-progress record
 * carries an `execution` block (baseline, context, plan, checkpoints, validations), the
 * shared implementation methodology appends checkpoints to it for the active run, and
 * `resume` evaluates it against the repository. The evidence itself — hashes, git state,
 * the upstream chain — is computed in scripts/task-resume.ts, which never touches this
 * file; this script remains its only reader and writer. Git is read only through that
 * module, and only to capture and verify tree state.
 *
 * Always exits 0 and always prints one JSON object. Callers branch on `status`.
 *
 *   node --no-warnings scripts/task-state.ts read  --root <dir> --feature <slug> [--breakdown <path>]
 *   node --no-warnings scripts/task-state.ts write --root <dir> --feature <slug> --task <id>
 *                                                 --state <in-progress|complete|blocked|failed>
 *                                                 [--mode <start|resume|restart>]
 *                                                 [--breakdown <path>] [--payload <json>] [--head <sha>]
 *   node --no-warnings scripts/task-state.ts checkpoint --root <dir> --feature <slug> --task <id> --run <runId>
 *                                                 --kind <kind> --payload <json> --breakdown <path>
 *   node --no-warnings scripts/task-state.ts resume --root <dir> --feature <slug> --task <id> --breakdown <path>
 *   node --no-warnings scripts/task-state.ts abandon --root <dir> --feature <slug> --task <id> --run <runId>
 *                                                 --reason <text> --breakdown <path>
 *   node --no-warnings scripts/task-state.ts chain --root <dir> --breakdown <path>
 *   node --no-warnings scripts/task-state.ts fingerprint --file <path> [--raw]
 *   node --no-warnings scripts/task-state.ts design-fingerprint --root <dir> --file <planning doc> [--design-evidence <json>]
 *   node --no-warnings scripts/task-state.ts source-fingerprint --root <dir> --source <path|url> [--source-evidence <json>]
 *
 * chain, resume, write and checkpoint also accept --design-evidence / --source-evidence: the
 * evidence file the design- or spec-reading step saved, so an external source is judged by
 * the content actually read rather than by its URL.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  openSync,
  fsyncSync,
  closeSync,
  realpathSync,
} from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";
import { fingerprintBody } from "./migrate-planning-doc.ts";
import {
  UPSTREAM_KEYS,
  captureBaseline,
  chainStatus,
  changedSinceBaseline,
  currentBasis,
  designReferenceState,
  evaluateExecution,
  filesFromCell,
  fingerprintFile,
  hashRel,
  isStoreArtifact,
  latestValidations,
  loadEvidenceFile,
  normalizeRel,
  readFrontmatter,
  resolveDocs,
  rowCells,
  sourceFingerprint,
  stepFingerprint,
  taskOwnedFiles,
  unverifiableRefs,
  upstreamArtifacts,
  validationVerdicts,
  type ExecutionBlock,
  type ExternalInput,
  type PlanStep,
  type ResumeVerdict,
} from "./task-resume.ts";

/** Highest schema version this helper understands. Pinned by docs/task-state-contract.md. */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * This plugin's version, stamped into `producedBy.version`. Held as a constant rather
 * than read from plugin.json so the helper performs no I/O beyond the state file and the
 * breakdown; `scripts/task-state.test.ts` asserts it matches .claude-plugin/plugin.json
 * so the two cannot drift. It records the version that actually wrote a record, never a
 * planned future release — a release bump is separate work.
 */
export const PLUGIN_VERSION = "0.6.0";

export const WRITABLE_STATES = ["in-progress", "complete", "blocked", "failed"] as const;
export type TaskState = (typeof WRITABLE_STATES)[number];

export type Provenance = "plugin-verified" | "human-attested";

export type ReadStatus =
  | "ok"
  | "absent"
  | "unparseable"
  | "invalid"
  | "schema-too-new"
  | "feature-mismatch";

export interface AcceptanceCriterion {
  criterion: string;
  met: boolean;
}

export interface ValidationEntry {
  command: string;
  result: string;
}

/**
 * SHARED-014. A mechanically verifiable accessibility check. Tier is constrained to 1|2
 * by construction: Tier 3 has no representation here, so a Tier 3 "pass" is not a value
 * this type can hold. See `standards/shared/verification.md` (`VERIFY-1`).
 */
export interface AccessibilityCheck {
  ruleId: string;
  tier: 1 | 2;
  result: "pass" | "fail";
  evidence?: string;
}

/**
 * SHARED-014. Accessibility as a recorded completion dimension.
 *
 * `applicable: false` is a positive statement with a required reason — a TV task, or a
 * task that touches no accessibility-relevant surface. It is NOT what an absent block
 * means: absence reads as `notRecorded` (see `accessibilityStatus`), never as a pass and
 * never as "not applicable".
 */
export interface AccessibilityBlock {
  applicable: boolean;
  reason: string | null;
  deviceType: string | null;
  standardIds: string[];
  checks: AccessibilityCheck[];
}

/**
 * SHARED-014. Generic verification debt: an obligation the plugin cannot discharge.
 *
 * Deliberately domain-tagged rather than accessibility-specific — performance, battery
 * and device-capability domains are expected to use the same field without a migration.
 * SHARED-014 populates only `domain: "accessibility"`.
 *
 * There is no `result` field, and `status` is only ever written as `pending`. Neither
 * omission is an oversight: it makes "the plugin recorded this as verified" unrepresentable,
 * which is the structural form of `VERIFY-2`.
 */
export interface VerificationDebtEntry {
  domain: string;
  ruleId: string;
  requiredVerification: string;
  whyNotAutomatable: string;
  owner: string;
  status: "pending";
}

/** Absent block vs. a recorded decision — three distinct readings, never collapsed. */
export type AccessibilityStatus = "notRecorded" | "applicable" | "notApplicable";

/**
 * Stage 3. One developer test command that actually executed. `result` is `pass` or
 * `fail` and nothing softer — "assumed", "expected" and "skipped" are not results — and
 * the command must also appear, with the same result, in the record's `validation`.
 */
export interface DeveloperTestingRun {
  command: string;
  result: "pass" | "fail";
}

/**
 * Stage 3. The mandatory developer-testing decision: tests that live in the code
 * repository (unit, component, repository integration). Not QA automation.
 *
 * A terminal `complete` cannot be written without it. Absent on records written before
 * Stage 3 — that reads as `notRecorded`, never as "not required".
 */
export interface DeveloperTestingBlock {
  /** The in-repo developer test framework detected, or null when the repository has none. */
  framework: string | null;
  required: boolean;
  /** Test files added or updated by this change. */
  testsChanged: string[];
  /** Required when not required, or when a framework exists and no test was touched. */
  justification: string | null;
  /** Only what actually ran. */
  runs: DeveloperTestingRun[];
  /** Required when tests are required and none ran. */
  notRunReason: string | null;
}

export type DeveloperTestingStatus = "notRecorded" | "required" | "notRequired";

/** Stage 3. The debt domain developer testing records, and the only owner it may name. */
export const DEVELOPER_TESTING_DOMAIN = "developer-testing";
export const DEVELOPER_OWNER = "developer";

export interface TaskRecord {
  state: TaskState;
  provenance: Provenance;
  attempt: number;
  runId: string;
  rowFingerprint: string | null;
  platform: string | null;
  head: string | null;
  filesChanged: string[];
  standardIds: string[];
  validation: ValidationEntry[];
  acceptanceCriteria: AcceptanceCriterion[];
  deviations: string[];
  blockers: string[];
  /** SHARED-014. Absent on records written before it — read via `accessibilityStatus`. */
  accessibility?: AccessibilityBlock;
  /** SHARED-014. Absent on records written before it; absence is not "no debt". */
  verificationDebt?: VerificationDebtEntry[];
  /** Stage 3. Absent on records written before it — read via `developerTestingStatus`. */
  developerTesting?: DeveloperTestingBlock;
  /** ENG-003. The run's execution evidence. Absent on records written before it: nothing to resume. */
  execution?: ExecutionBlock;
}

export interface TaskStateFile {
  taskStateSchemaVersion: number;
  feature: string;
  producedBy: { plugin: string; version: string };
  tasks: Record<string, TaskRecord>;
}

export interface TaskView {
  state: TaskState | "unknown";
  provenance: Provenance | null;
  attempt: number | null;
  runId: string | null;
  /** null when no breakdown was supplied — staleness cannot be judged without the current row. */
  stale: boolean | null;
  /** Only true for a plugin-verified, non-stale `complete`. The sole deterministic proof. */
  deterministicProof: boolean;
  /** Read from the Task Breakdown, never from the store. null when no breakdown was supplied. */
  dependsOn: string[] | null;
  filesChanged: string[];
  standardIds: string[];
  /** SHARED-014. `notRecorded` for legacy records: never conflated with `notApplicable`. */
  accessibilityStatus: AccessibilityStatus;
  /** Null when the block is absent — distinct from a recorded block with no checks. */
  accessibility: AccessibilityBlock | null;
  /** Empty for a legacy record; `accessibilityStatus` says whether that means anything. */
  verificationDebt: VerificationDebtEntry[];
  /** Stage 3. The subset of `verificationDebt` owned by QA — what a QA handoff lists. */
  qaVerificationDebt: VerificationDebtEntry[];
  /** Stage 3. The subset owned by the developer. Never presented as owed to QA. */
  developerVerificationDebt: VerificationDebtEntry[];
  /** Stage 3. `notRecorded` for legacy records: never conflated with `notRequired`. */
  developerTestingStatus: DeveloperTestingStatus;
  developerTesting: DeveloperTestingBlock | null;
  /** The HEAD the run was based on, as recorded. */
  head: string | null;
  platform: string | null;
  blockers: string[];
  /** ENG-003. Null for a record written before execution tracking — never read as an empty run. */
  execution: ExecutionBlock | null;
}

/** A structurally usable execution block, or null. Anything less is treated as absent. */
function readExecution(v: unknown): ExecutionBlock | null {
  if (!isRecord(v) || typeof v.runId !== "string" || !isRecord(v.baseline)) return null;
  if (!Array.isArray(v.checkpoints) || !Array.isArray(v.validations) || !isRecord(v.context)) return null;
  const ex = v as unknown as ExecutionBlock;
  return {
    ...ex,
    baseline: { ...ex.baseline, dirty: Array.isArray(ex.baseline.dirty) ? ex.baseline.dirty : [] },
    upstream: isRecord(ex.upstream) ? ex.upstream : {},
    expectedFiles: Array.isArray(ex.expectedFiles) ? ex.expectedFiles : [],
    probes: Array.isArray(ex.probes) ? ex.probes : [],
    plan: ex.plan ?? null,
    developerTesting: ex.developerTesting ?? null,
    review: ex.review ?? null,
    seq: typeof ex.seq === "number" ? ex.seq : 0,
    resumes: typeof ex.resumes === "number" ? ex.resumes : 0,
    restartedFrom: ex.restartedFrom ?? null,
    outcome: ex.outcome ?? null,
  };
}

/**
 * SHARED-014. Reads the accessibility dimension off a raw record.
 *
 * The load-bearing case is the legacy record written before SHARED-014: the block is
 * absent, and absence must read as `notRecorded`. It is NOT `notApplicable` (which is a
 * recorded decision with a reason) and NOT a pass. Collapsing those three would let a
 * record that never considered accessibility look like one that cleared it.
 */
function readAccessibility(raw: Record<string, unknown>): {
  accessibilityStatus: AccessibilityStatus;
  accessibility: AccessibilityBlock | null;
  verificationDebt: VerificationDebtEntry[];
} {
  const debtRaw = Array.isArray(raw.verificationDebt) ? raw.verificationDebt : [];
  const verificationDebt = debtRaw.filter(isRecord).map((d) => ({
    domain: String(d.domain ?? ""),
    ruleId: String(d.ruleId ?? ""),
    requiredVerification: String(d.requiredVerification ?? ""),
    whyNotAutomatable: String(d.whyNotAutomatable ?? ""),
    owner: String(d.owner ?? ""),
    status: "pending" as const,
  }));

  const a = raw.accessibility;
  if (!isRecord(a) || typeof a.applicable !== "boolean") {
    return { accessibilityStatus: "notRecorded", accessibility: null, verificationDebt };
  }

  const checksRaw = Array.isArray(a.checks) ? a.checks : [];
  const block: AccessibilityBlock = {
    applicable: a.applicable,
    reason: typeof a.reason === "string" ? a.reason : null,
    deviceType: typeof a.deviceType === "string" ? a.deviceType : null,
    standardIds: strArray(a.standardIds),
    checks: checksRaw.filter(isRecord).map((c) => ({
      ruleId: String(c.ruleId ?? ""),
      tier: (c.tier === 2 ? 2 : 1) as 1 | 2,
      result: (c.result === "fail" ? "fail" : "pass") as "pass" | "fail",
      ...(typeof c.evidence === "string" ? { evidence: c.evidence } : {}),
    })),
  };
  return {
    accessibilityStatus: block.applicable ? "applicable" : "notApplicable",
    accessibility: block,
    verificationDebt,
  };
}

/**
 * Stage 3. Reads the developer-testing dimension and splits debt by owner, so a consumer
 * never has to filter — and never forgets to — before telling QA what it owes.
 */
function readDeveloperTesting(
  raw: Record<string, unknown>,
  verificationDebt: VerificationDebtEntry[],
): Pick<
  TaskView,
  "qaVerificationDebt" | "developerVerificationDebt" | "developerTestingStatus" | "developerTesting"
> {
  const qaVerificationDebt = verificationDebt.filter((d) => d.owner === "qa");
  const developerVerificationDebt = verificationDebt.filter((d) => d.owner === DEVELOPER_OWNER);
  const t = raw.developerTesting;
  if (!isRecord(t) || typeof t.required !== "boolean") {
    return { qaVerificationDebt, developerVerificationDebt, developerTestingStatus: "notRecorded", developerTesting: null };
  }
  const runsRaw = Array.isArray(t.runs) ? t.runs : [];
  const block: DeveloperTestingBlock = {
    framework: typeof t.framework === "string" ? t.framework : null,
    required: t.required,
    testsChanged: strArray(t.testsChanged),
    justification: typeof t.justification === "string" ? t.justification : null,
    runs: runsRaw.filter(isRecord).map((r) => ({
      command: String(r.command ?? ""),
      result: (r.result === "pass" ? "pass" : "fail") as "pass" | "fail",
    })),
    notRunReason: typeof t.notRunReason === "string" ? t.notRunReason : null,
  };
  return {
    qaVerificationDebt,
    developerVerificationDebt,
    developerTestingStatus: block.required ? "required" : "notRequired",
    developerTesting: block,
  };
}

export interface ReadResult {
  available: boolean;
  status: ReadStatus;
  path: string;
  feature: string;
  schema: number | null;
  tasks: Record<string, TaskView>;
  summary: string;
  detail?: string;
}

export type WriteStatus = "written" | "refused" | "unreadable";

export interface WriteResult {
  status: WriteStatus;
  path: string;
  taskId: string;
  state?: TaskState;
  attempt?: number;
  runId?: string;
  reason?:
    | "complete-without-verification"
    | "complete-without-developer-testing"
    | "complete-with-stale-validation"
    | "invalid-accessibility"
    | "invalid-developer-testing"
    | "invalid-checkpoint"
    | "active-run-exists"
    | "resume-inconsistent"
    | "no-active-run"
    | "run-mismatch"
    | "feature-mismatch"
    | "schema-too-new"
    | "invalid-state"
    | "unparseable"
    | "write-failed";
  summary: string;
  detail?: string;
  /** abandon only: task-owned files whose content differs from the run's baseline. Never touched. */
  taskOwnedChanges?: string[];
}

/* ------------------------------------------------------------------ paths */

/**
 * The single discovery rule. There is no link field on any planning document: the
 * Task Breakdown is human-approved and is never mutated for discovery.
 */
export function stateFilePath(targetRoot: string, feature: string): string {
  return join(targetRoot, "docs", "tasks", `${feature}-task-state.json`);
}

/* ----------------------------------------------------- row fingerprinting */

/** Normalization is specified in docs/task-state-contract.md and must not drift. */
export function normalizeRow(rawLine: string): string {
  let line = rawLine.trim();
  if (line.startsWith("|")) line = line.slice(1);
  if (line.endsWith("|")) line = line.slice(0, -1);
  return line
    .split("|")
    .map((cell) => cell.trim().replace(/\s+/g, " "))
    .join(" ");
}

export function fingerprintRow(rawLine: string): string {
  return `sha256:${createHash("sha256").update(normalizeRow(rawLine), "utf-8").digest("hex")}`;
}

const TASK_ID = /^[A-Za-z]+[0-9]+$/;

export interface ParsedRow {
  id: string;
  fingerprint: string;
  dependsOn: string[];
  platform: string | null;
}

/**
 * Extract task rows from a Task Breakdown. Column order follows
 * templates/task-breakdown-template.md: id | description | platform | files touched |
 * depends-on | size | acceptance criteria. A row whose first cell is not a task id is
 * skipped, which drops the header and the `|---|` separator without special-casing them.
 */
export function parseBreakdown(markdown: string): Record<string, ParsedRow> {
  const rows: Record<string, ParsedRow> = {};
  for (const rawLine of markdown.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = splitCells(rawLine);
    const id = (cells[0] ?? "").trim();
    if (!TASK_ID.test(id)) continue;
    const dependsRaw = (cells[4] ?? "").trim();
    rows[id] = {
      id,
      fingerprint: fingerprintRow(rawLine),
      dependsOn: parseDependsOn(dependsRaw),
      platform: (cells[2] ?? "").trim() || null,
    };
  }
  return rows;
}

function splitCells(rawLine: string): string[] {
  let line = rawLine.trim();
  if (line.startsWith("|")) line = line.slice(1);
  if (line.endsWith("|")) line = line.slice(0, -1);
  return line.split("|").map((c) => c.trim());
}

/** `—`, `-`, `none` and an empty cell all mean "no dependencies". */
export function parseDependsOn(cell: string): string[] {
  const cleaned = cell.replace(/`/g, "").trim();
  if (cleaned === "" || cleaned === "—" || cleaned === "-" || /^none$/i.test(cleaned)) return [];
  return cleaned
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => TASK_ID.test(t));
}

/* ---------------------------------------------------------------- reading */

function unknownView(dependsOn: string[] | null): TaskView {
  return {
    state: "unknown",
    provenance: null,
    attempt: null,
    runId: null,
    stale: null,
    deterministicProof: false,
    dependsOn,
    filesChanged: [],
    standardIds: [],
    accessibilityStatus: "notRecorded",
    accessibility: null,
    verificationDebt: [],
    qaVerificationDebt: [],
    developerVerificationDebt: [],
    developerTestingStatus: "notRecorded",
    developerTesting: null,
    head: null,
    platform: null,
    blockers: [],
    execution: null,
  };
}

/**
 * A degraded read still enumerates every task the breakdown declares, each explicitly
 * `unknown` with `deterministicProof: false` and its real `dependsOn` list. Returning an
 * empty map instead would let a caller iterate zero dependencies and conclude — vacuously
 * — that all of them are proven. Absence of a record must read as "not proven", never as
 * "nothing to check".
 */
function emptyRead(
  status: ReadStatus,
  path: string,
  feature: string,
  summary: string,
  breakdownRows: Record<string, ParsedRow> | null,
  detail?: string,
): ReadResult {
  const tasks: Record<string, TaskView> = {};
  if (breakdownRows !== null) {
    for (const [id, row] of Object.entries(breakdownRows)) tasks[id] = unknownView(row.dependsOn);
  }
  const out: ReadResult = {
    available: false,
    status,
    path,
    feature,
    schema: null,
    tasks,
    summary,
  };
  if (detail !== undefined) out.detail = detail;
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** One step on a dependency path, for a stop message that names the exact chain. */
export interface DependencyProblem {
  /** `["T7","T3","T1"]` — requested task first, offending task last. */
  path: string[];
  reason: "stale" | "removed" | "in-progress" | "missing" | "cycle" | "unproven";
}

/**
 * Walk the requested task's TRANSITIVE dependency closure and return every problem that
 * must block it, each with the exact path that reached it.
 *
 * Why transitive: T1 -> T3 -> T7. If T1's row changes, T3's own row is untouched and T3
 * still reports `deterministicProof: true`, so a direct-only check lets T7 proceed on a
 * foundation that moved. Direct checking cannot see that.
 *
 * Cycles are detected defensively with three-colour marking rather than a depth cap: a
 * cycle in an approved breakdown is a defect, and dependency proof inside one is
 * undecidable, so it is reported as a stop with the cycle path rather than being walked
 * forever.
 *
 * No persisted graph and no new state: `dependsOn` is read from the breakdown row on
 * every call, exactly as the store's contract already requires, and this result is
 * thrown away when the command exits.
 */
export function walkDependencies(
  tasks: Record<string, TaskView>,
  requested: string,
): DependencyProblem[] {
  const problems: DependencyProblem[] = [];
  const state = new Map<string, "visiting" | "done">();

  const visit = (id: string, path: string[]): void => {
    const mark = state.get(id);
    if (mark === "done") return;
    if (mark === "visiting") {
      problems.push({ path: [...path, id], reason: "cycle" });
      return;
    }
    state.set(id, "visiting");

    const view = tasks[id];
    if (view === undefined) {
      problems.push({ path: [...path, id], reason: "missing" });
      state.set(id, "done");
      return;
    }

    // The requested task's own condition is judged by the caller; this walk reports
    // only what its dependencies contribute.
    if (id !== requested) {
      if (view.stale === true && view.dependsOn === null) {
        problems.push({ path: [...path, id], reason: "removed" });
      } else if (view.stale === true) {
        problems.push({ path: [...path, id], reason: "stale" });
      } else if (view.state === "in-progress") {
        problems.push({ path: [...path, id], reason: "in-progress" });
      } else if (!view.deterministicProof) {
        problems.push({ path: [...path, id], reason: "unproven" });
      }
    }

    for (const dep of view.dependsOn ?? []) visit(dep, [...path, id]);
    state.set(id, "done");
  };

  visit(requested, []);
  return problems;
}

export interface ImpactReport {
  unchanged: string[];
  modified: string[];
  removed: string[];
  unrecorded: string[];
}

/**
 * Classify every task in the feature by comparing current rows against the fingerprints
 * already stored in the state file. Deterministic set-and-hash arithmetic over data the
 * reader has already produced — no regeneration, which could not be deterministic
 * because decomposing a DD into rows is model work.
 *
 * `unrecorded` deliberately conflates "newly introduced by the upstream change" with
 * "existed all along, never implemented": both are simply absent from the store, and
 * neither has work to invalidate. Distinguishing them would require persisting the whole
 * prior row set.
 */
export function impactReport(tasks: Record<string, TaskView>): ImpactReport {
  const out: ImpactReport = { unchanged: [], modified: [], removed: [], unrecorded: [] };
  for (const id of Object.keys(tasks).sort()) {
    const v = tasks[id];
    if (v.state === "unknown" && v.attempt === null) out.unrecorded.push(id);
    else if (v.stale === true && v.dependsOn === null) out.removed.push(id);
    else if (v.stale === true) out.modified.push(id);
    else out.unchanged.push(id);
  }
  return out;
}

export function readTaskState(
  targetRoot: string,
  feature: string,
  breakdownPath?: string,
): ReadResult {
  const path = stateFilePath(targetRoot, feature);

  let breakdownRows: Record<string, ParsedRow> | null = null;
  if (breakdownPath !== undefined && breakdownPath !== "" && existsSync(breakdownPath)) {
    try {
      breakdownRows = parseBreakdown(readFileSync(breakdownPath, "utf-8"));
    } catch {
      breakdownRows = null;
    }
  }

  if (!existsSync(path)) {
    return emptyRead(
      "absent",
      path,
      feature,
      "Task state: none recorded for this feature. Every task is unknown; dependency completeness must be confirmed with the developer.",
      breakdownRows,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    return emptyRead(
      "unparseable",
      path,
      feature,
      "Task state: file exists but could not be parsed. Treating every task as unknown.",
      breakdownRows,
      e instanceof Error ? e.message : String(e),
    );
  }

  if (!isRecord(parsed) || !isRecord(parsed.tasks) || typeof parsed.feature !== "string") {
    return emptyRead(
      "invalid",
      path,
      feature,
      "Task state: file is not a valid task-state document. Treating every task as unknown.",
      breakdownRows,
    );
  }

  const schema = typeof parsed.taskStateSchemaVersion === "number" ? parsed.taskStateSchemaVersion : null;
  if (schema === null) {
    return emptyRead("invalid", path, feature, "Task state: missing taskStateSchemaVersion. Treating every task as unknown.", breakdownRows);
  }
  if (schema > CURRENT_SCHEMA_VERSION) {
    return emptyRead(
      "schema-too-new",
      path,
      feature,
      `Task state: written against schema ${schema}, which is newer than the supported ${CURRENT_SCHEMA_VERSION}. Treating every task as unknown.`,
      breakdownRows,
    );
  }
  if (parsed.feature !== feature) {
    return emptyRead(
      "feature-mismatch",
      path,
      feature,
      `Task state: file records feature "${parsed.feature}" but "${feature}" was requested. Treating every task as unknown.`,
      breakdownRows,
    );
  }

  const tasks: Record<string, TaskView> = {};
  for (const [id, raw] of Object.entries(parsed.tasks)) {
    if (!isRecord(raw)) continue;
    const state = (WRITABLE_STATES as readonly string[]).includes(String(raw.state))
      ? (raw.state as TaskState)
      : "unknown";
    const provenance: Provenance | null =
      raw.provenance === "plugin-verified" || raw.provenance === "human-attested"
        ? raw.provenance
        : null;
    const recordedFp = typeof raw.rowFingerprint === "string" ? raw.rowFingerprint : null;

    let stale: boolean | null = null;
    if (breakdownRows !== null) {
      const current = breakdownRows[id];
      stale = current === undefined || recordedFp === null ? true : current.fingerprint !== recordedFp;
    }

    const a11y = readAccessibility(raw);
    tasks[id] = {
      state,
      provenance,
      attempt: typeof raw.attempt === "number" ? raw.attempt : null,
      runId: typeof raw.runId === "string" ? raw.runId : null,
      stale,
      deterministicProof: state === "complete" && provenance === "plugin-verified" && stale === false,
      dependsOn: breakdownRows === null ? null : (breakdownRows[id]?.dependsOn ?? null),
      filesChanged: strArray(raw.filesChanged),
      standardIds: strArray(raw.standardIds),
      ...a11y,
      ...readDeveloperTesting(raw, a11y.verificationDebt),
      head: typeof raw.head === "string" ? raw.head : null,
      platform: typeof raw.platform === "string" ? raw.platform : null,
      blockers: strArray(raw.blockers),
      execution: readExecution(raw.execution),
    };
  }

  // Tasks present in the breakdown but never recorded are explicitly unknown, so a caller
  // never has to distinguish "absent from the file" from "not asked about".
  if (breakdownRows !== null) {
    for (const [id, row] of Object.entries(breakdownRows)) {
      if (tasks[id] !== undefined) continue;
      tasks[id] = unknownView(row.dependsOn);
    }
  }

  const counts: Record<string, number> = {};
  let staleCount = 0;
  for (const v of Object.values(tasks)) {
    counts[v.state] = (counts[v.state] ?? 0) + 1;
    if (v.stale === true) staleCount += 1;
  }
  const parts = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${n} ${k}`);

  return {
    available: true,
    status: "ok",
    path,
    feature,
    schema,
    tasks,
    summary: `Task state: ${parts.join(", ")}${staleCount > 0 ? ` (${staleCount} stale)` : ""}.`,
  };
}

/* ---------------------------------------------------------------- writing */

/** Sibling temp file, fsync, rename. A crash leaves the old inode or the new one. */
function writeAtomic(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${process.pid}.task-state.tmp`);
  try {
    writeFileSync(tmp, contents);
    const fd = openSync(tmp, "r+");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* the original file is untouched either way */
    }
    throw e;
  }
}

export interface WritePayload {
  platform?: string | null;
  head?: string | null;
  filesChanged?: string[];
  standardIds?: string[];
  validation?: ValidationEntry[];
  acceptanceCriteria?: AcceptanceCriterion[];
  deviations?: string[];
  blockers?: string[];
  accessibility?: AccessibilityBlock;
  verificationDebt?: VerificationDebtEntry[];
  developerTesting?: DeveloperTestingBlock;
}

/**
 * SHARED-014. Validates the accessibility block and verification debt.
 *
 * Returns null when the payload is acceptable, or the refusal reason. Called for every
 * write, not only `complete`: a malformed block is a malformed record whatever the state.
 *
 * The rules enforced here are the ones that must not be left to prose, because prose is
 * what a caller can quietly not follow:
 *   - Tier 3 cannot appear as a check at all (the type says 1|2; this enforces it at runtime).
 *   - A Tier 1/2 check cannot claim to satisfy a manual-only rule (`VERIFY-2`).
 *   - Debt is only ever written `pending` — the plugin cannot mark it discharged.
 *   - `applicable: false` requires a reason and forbids citing rules anyway.
 */
export const MANUAL_ONLY_RULE_IDS = ["A11Y-SR-1"] as const;

export function accessibilityProblem(payload: WritePayload): string | null {
  const a = payload.accessibility;
  const debt = payload.verificationDebt ?? [];

  for (const d of debt) {
    if (!d.domain || !d.ruleId || !d.requiredVerification || !d.whyNotAutomatable || !d.owner) {
      return "Refused: every verificationDebt entry requires domain, ruleId, requiredVerification, whyNotAutomatable and owner.";
    }
    if (d.status !== "pending") {
      return `Refused: verificationDebt status may only be written as "pending" — the plugin cannot record an obligation it did not discharge as "${d.status}".`;
    }
  }

  if (a === undefined) return null;

  if (a.applicable === false) {
    if (typeof a.reason !== "string" || a.reason.trim() === "") {
      return "Refused: accessibility.applicable=false requires a non-empty reason.";
    }
    if (a.standardIds.length > 0 || a.checks.length > 0) {
      return "Refused: accessibility.applicable=false must cite no standard IDs and record no checks.";
    }
    return null;
  }

  for (const c of a.checks) {
    if (c.tier !== 1 && c.tier !== 2) {
      return `Refused: accessibility check "${c.ruleId}" declares tier ${String(c.tier)}. Only Tier 1 and Tier 2 are recordable checks; a Tier 3 requirement is recorded as verificationDebt (VERIFY-1).`;
    }
    if (c.result !== "pass" && c.result !== "fail") {
      return `Refused: accessibility check "${c.ruleId}" has result "${String(c.result)}"; expected "pass" or "fail".`;
    }
    if ((MANUAL_ONLY_RULE_IDS as readonly string[]).includes(c.ruleId)) {
      return `Refused: "${c.ruleId}" requires assistive-technology validation and cannot be satisfied by Tier ${c.tier} evidence (VERIFY-2). Record it as verificationDebt instead.`;
    }
  }
  return null;
}

const nonEmpty = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";

/**
 * Stage 3. Validates the developer-testing block and developer-owned debt.
 *
 * Returns null when acceptable, or the refusal reason. Called for every write: a
 * malformed decision is a malformed record whatever the state. What must not be left to
 * prose:
 *   - Not required → a justification. A framework exists but no test touched → a justification.
 *   - A run is `pass`/`fail` only, and must be a command `validation` records with the same
 *     result — a test result cannot be asserted that the completion report never ran.
 *   - Required tests that did not run need a reason AND a `developer-testing` debt entry.
 *   - `developer-testing` debt is owned by the developer, never by QA.
 */
export function developerTestingProblem(payload: WritePayload): string | null {
  for (const d of payload.verificationDebt ?? []) {
    if (d.domain === DEVELOPER_TESTING_DOMAIN && d.owner !== DEVELOPER_OWNER) {
      return `Refused: developer-testing verification debt is owned by "${DEVELOPER_OWNER}", not "${d.owner}". It is the developer's obligation and is never transferred to QA (VERIFY-4).`;
    }
  }

  const t = payload.developerTesting as unknown;
  if (t === undefined) return null;
  if (!isRecord(t) || typeof t.required !== "boolean") {
    return "Refused: developerTesting.required must be a boolean.";
  }
  const framework = t.framework === null || t.framework === undefined ? null : t.framework;
  if (framework !== null && !nonEmpty(framework)) {
    return "Refused: developerTesting.framework must be the detected framework's name, or null when the repository has none.";
  }
  const testsChanged = Array.isArray(t.testsChanged) ? t.testsChanged : null;
  const runs = Array.isArray(t.runs) ? t.runs : null;
  if (testsChanged === null || runs === null) {
    return "Refused: developerTesting requires testsChanged and runs arrays (empty when none).";
  }

  if (t.required === false && !nonEmpty(t.justification)) {
    return "Refused: developerTesting.required=false requires a non-empty justification.";
  }
  if (framework !== null && testsChanged.length === 0 && !nonEmpty(t.justification)) {
    return `Refused: the repository has a developer test framework ("${String(framework)}") but no test was added or updated; record a justification for not modifying tests.`;
  }

  const validation = payload.validation ?? [];
  for (const r of runs) {
    if (!isRecord(r) || !nonEmpty(r.command)) {
      return "Refused: every developerTesting run requires the command that was executed.";
    }
    if (r.result !== "pass" && r.result !== "fail") {
      return `Refused: developer test "${String(r.command)}" has result "${String(r.result)}"; only "pass" or "fail" from an actual run is recordable.`;
    }
    if (!validation.some((v) => v.command === r.command && v.result === r.result)) {
      return `Refused: developer test "${String(r.command)}" (${String(r.result)}) is not in the validation commands this report says were run. A test result is recorded only for a test that actually ran.`;
    }
  }

  if (t.required === true && runs.length === 0) {
    if (!nonEmpty(t.notRunReason)) {
      return "Refused: developer tests are required but none ran; record notRunReason.";
    }
    const debt = (payload.verificationDebt ?? []).filter((d) => d.domain === DEVELOPER_TESTING_DOMAIN);
    if (debt.length === 0) {
      return `Refused: developer tests are required but none ran; record a "${DEVELOPER_TESTING_DOMAIN}" verificationDebt entry owned by "${DEVELOPER_OWNER}".`;
    }
  }
  return null;
}

/**
 * Structural gate for the terminal `complete` state: at least one acceptance criterion,
 * every one met, and at least one validation entry. The contract requires that a
 * `complete` record can only exist after section 10 verification succeeded, so the
 * helper refuses rather than trusting the caller.
 */
export function verificationSatisfied(payload: WritePayload): boolean {
  const ac = payload.acceptanceCriteria ?? [];
  const val = payload.validation ?? [];
  if (!(ac.length > 0 && ac.every((c) => c.met === true) && val.length > 0)) return false;

  // SHARED-014. Accessibility gates completion only where it applies, and only on the
  // evidence the plugin actually produced: a failing Tier 1/2 check is a proven defect
  // and blocks. Outstanding verification debt does NOT block — the plugin proved nothing
  // either way, and blocking would make completion depend on device availability.
  const a = payload.accessibility;
  if (a !== undefined && a.applicable === true) {
    if (a.standardIds.length === 0 || a.checks.length === 0) return false;
    if (a.checks.some((c) => c.result === "fail")) return false;
  }

  // Stage 3. A failing developer test is a proven defect and blocks, exactly like a
  // failing Tier 1 check. Developer-testing debt, like all debt, does not.
  if (payload.developerTesting?.runs?.some((r) => r.result === "fail")) return false;
  return true;
}

/**
 * ENG-003. How an `in-progress` write relates to a run already on record:
 *
 *   start    (default) a new run: attempt + 1 and a fresh execution block. Refused over an
 *            active checkpointed run, so an interruption is never silently discarded.
 *   resume   the SAME run: attempt and runId unchanged, evidence kept. Refused unless the
 *            helper itself verifies the repository still matches the recorded execution.
 *   restart  a new run chosen explicitly over an active one: attempt + 1, fresh execution,
 *            `restartedFrom` naming the run it replaced.
 */
export interface WriteOptions {
  mode?: "start" | "resume" | "restart";
  /** Evidence for external upstream sources (a Figma design, a hosted spec) read in this invocation. */
  external?: ExternalInput;
}

export function writeTaskState(
  targetRoot: string,
  feature: string,
  taskId: string,
  state: string,
  payload: WritePayload = {},
  breakdownPath?: string,
  options: WriteOptions = {},
): WriteResult {
  const path = stateFilePath(targetRoot, feature);

  if (!(WRITABLE_STATES as readonly string[]).includes(state)) {
    return {
      status: "refused",
      path,
      taskId,
      reason: "invalid-state",
      summary: `Refused: "${state}" is not a writable state (${WRITABLE_STATES.join(", ")}).`,
    };
  }
  const nextState = state as TaskState;

  const a11yProblem = accessibilityProblem(payload);
  if (a11yProblem !== null) {
    return {
      status: "refused",
      path,
      taskId,
      reason: "invalid-accessibility",
      summary: a11yProblem,
    };
  }

  const devTestProblem = developerTestingProblem(payload);
  if (devTestProblem !== null) {
    return {
      status: "refused",
      path,
      taskId,
      reason: "invalid-developer-testing",
      summary: devTestProblem,
    };
  }

  if (nextState === "complete" && !verificationSatisfied(payload)) {
    return {
      status: "refused",
      path,
      taskId,
      reason: "complete-without-verification",
      summary:
        "Refused: a terminal `complete` requires every acceptance criterion recorded and met, plus at least one validation entry; and where accessibility applies, cited standard IDs, at least one recorded check, and no failing Tier 1/2 check or developer test. Record `failed` or `blocked` instead.",
    };
  }

  if (nextState === "complete" && payload.developerTesting === undefined) {
    return {
      status: "refused",
      path,
      taskId,
      reason: "complete-without-developer-testing",
      summary:
        "Refused: a terminal `complete` requires the developer-testing decision — whether developer tests were required, which were added or updated or why none were, what actually ran, and developer-owned debt for anything that could not be written or run.",
    };
  }

  const loaded = loadForWrite(path, feature, taskId);
  if ("refusal" in loaded) return loaded.refusal;
  const file = loaded.file;

  const prior = file.tasks[taskId];
  const priorExec = readExecution(prior?.execution);
  const mode = options.mode ?? "start";
  const fingerprint = rowFingerprintFor(breakdownPath, taskId) ?? prior?.rowFingerprint ?? null;

  // ENG-003. Resume continues the SAME run: same attempt, same runId, same execution
  // evidence. It is refused unless the helper itself verifies the repository still
  // matches that evidence — the caller's say-so is never enough.
  if (nextState === "in-progress" && mode === "resume") {
    if (prior?.state !== "in-progress" || priorExec === null || breakdownPath === undefined) {
      return refuse(path, taskId, "resume-inconsistent",
        `Refused: ${taskId} has no checkpointed in-progress run to resume${breakdownPath === undefined ? " (and --breakdown is required to verify one)" : ""}. Start or restart it instead.`);
    }
    const verdict = evaluateExecution({
      root: targetRoot, taskId, state: prior.state, runId: prior.runId, attempt: prior.attempt,
      execution: priorExec, rowFingerprint: fingerprint, breakdownPath, external: options.external,
    });
    if (verdict.status !== "resume") {
      return { ...refuse(path, taskId, "resume-inconsistent", `Refused: ${verdict.summary}`), detail: JSON.stringify(verdict.mismatches) };
    }
    file.tasks[taskId] = { ...prior, execution: { ...priorExec, resumes: priorExec.resumes + 1 } };
    const failed = saveFile(path, file);
    if (failed !== null) return failed(taskId);
    return { status: "written", path, taskId, state: "in-progress", attempt: prior.attempt, runId: prior.runId,
      summary: `Resumed ${prior.runId} (resume ${priorExec.resumes + 1}); attempt unchanged.` };
  }

  if (nextState === "in-progress" && mode === "start" && prior?.state === "in-progress" && priorExec !== null) {
    return refuse(path, taskId, "active-run-exists",
      `Refused: ${prior.runId} is an active, checkpointed run. Evaluate it with \`resume\`, then write --mode resume or --mode restart — a plain start would silently discard it.`);
  }

  // A new run is announced by `in-progress`, and that is the only thing that advances the
  // attempt counter. A terminal write belongs to the run already in flight and keeps its number.
  const attempt =
    nextState === "in-progress" ? (prior?.attempt ?? 0) + 1 : (prior?.attempt ?? 1);
  const runId = `${taskId}-attempt-${attempt}`;

  let execution: ExecutionBlock | undefined;
  if (nextState === "in-progress") {
    execution = newExecution(targetRoot, taskId, runId, payload, breakdownPath, fingerprint,
      mode === "restart" ? (prior?.runId ?? null) : null, options.external);
  } else if (priorExec !== null && priorExec.runId === runId) {
    execution = { ...priorExec, outcome: nextState };
  }

  // Part D. A terminal `complete` may not cite a validation the run recorded if that
  // result no longer holds — its files or its planning basis moved after it ran.
  if (nextState === "complete" && execution !== undefined) {
    const docs = resolveDocs(targetRoot, breakdownPath, options.external);
    const now = currentBasis(docs, taskId, fingerprint, execution.probes);
    const verdicts = validationVerdicts(targetRoot, execution, now, unverifiableRefs(docs));
    const stale: string[] = [];
    for (const v of payload.validation ?? []) {
      const match = verdicts.find((x) => x.record.command === v.command);
      if (match === undefined) continue;
      if (!match.valid) stale.push(`"${v.command}": ${match.reasons.join("; ")}`);
      else if (match.record.result !== v.result) stale.push(`"${v.command}": recorded ${match.record.result}, reported ${v.result}`);
    }
    if (stale.length > 0) {
      return refuse(path, taskId, "complete-with-stale-validation",
        `Refused: the completion report cites validation results that no longer hold — ${stale.join(" | ")}. Rerun them, checkpoint the new results, then record completion.`);
    }
  }

  file.tasks[taskId] = {
    state: nextState,
    provenance: "plugin-verified",
    attempt,
    runId,
    rowFingerprint: fingerprint,
    platform: payload.platform ?? prior?.platform ?? null,
    head: payload.head ?? null,
    filesChanged: payload.filesChanged ?? [],
    standardIds: payload.standardIds ?? [],
    validation: payload.validation ?? [],
    acceptanceCriteria: payload.acceptanceCriteria ?? [],
    deviations: payload.deviations ?? [],
    blockers: payload.blockers ?? [],
    ...(payload.accessibility !== undefined ? { accessibility: payload.accessibility } : {}),
    ...(payload.verificationDebt !== undefined ? { verificationDebt: payload.verificationDebt } : {}),
    ...(payload.developerTesting !== undefined ? { developerTesting: payload.developerTesting } : {}),
    ...(execution !== undefined ? { execution } : {}),
  };

  const failed = saveFile(path, file);
  if (failed !== null) return failed(taskId);

  return {
    status: "written",
    path,
    taskId,
    state: nextState,
    attempt,
    runId,
    summary: `Recorded ${taskId} as ${nextState} (${runId}).`,
  };
}

function refuse(path: string, taskId: string, reason: NonNullable<WriteResult["reason"]>, summary: string): WriteResult {
  return { status: "refused", path, taskId, reason, summary };
}

/** Load the existing store for a write, or the refusal that stops it. An absent file is an empty store. */
function loadForWrite(path: string, feature: string, taskId: string): { file: TaskStateFile } | { refusal: WriteResult } {
  const file: TaskStateFile = {
    taskStateSchemaVersion: CURRENT_SCHEMA_VERSION,
    feature,
    producedBy: { plugin: "ono-mobile-dev-plugin", version: PLUGIN_VERSION },
    tasks: {},
  };
  if (!existsSync(path)) return { file };
  let existing: unknown;
  try {
    existing = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    return {
      refusal: {
        status: "refused",
        path,
        taskId,
        reason: "unparseable",
        summary: "Refused: the existing task-state file could not be parsed. Fix or delete it before recording state.",
        detail: e instanceof Error ? e.message : String(e),
      },
    };
  }
  if (isRecord(existing)) {
    const schema =
      typeof existing.taskStateSchemaVersion === "number" ? existing.taskStateSchemaVersion : 0;
    if (schema > CURRENT_SCHEMA_VERSION) {
      return { refusal: refuse(path, taskId, "schema-too-new", `Refused: the existing file is schema ${schema}, newer than the supported ${CURRENT_SCHEMA_VERSION}.`) };
    }
    if (typeof existing.feature === "string" && existing.feature !== feature) {
      return { refusal: refuse(path, taskId, "feature-mismatch", `Refused: the existing file records feature "${existing.feature}", not "${feature}".`) };
    }
    if (isRecord(existing.tasks)) {
      for (const [id, raw] of Object.entries(existing.tasks)) {
        if (isRecord(raw)) file.tasks[id] = raw as unknown as TaskRecord;
      }
    }
  }
  return { file };
}

/** Sorted, pretty-printed, atomic. Returns null on success, or a builder for the failure result. */
function saveFile(path: string, file: TaskStateFile): null | ((taskId: string) => WriteResult) {
  const ordered: Record<string, TaskRecord> = {};
  for (const id of Object.keys(file.tasks).sort((a, b) => a.localeCompare(b))) {
    ordered[id] = file.tasks[id];
  }
  try {
    writeAtomic(path, `${JSON.stringify({ ...file, tasks: ordered }, null, 2)}\n`);
    return null;
  } catch (e) {
    return (taskId: string) => ({
      status: "unreadable",
      path,
      taskId,
      reason: "write-failed",
      summary: "Task state could not be written; the previous file is unchanged.",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}

function rowFingerprintFor(breakdownPath: string | undefined, taskId: string): string | null {
  if (breakdownPath === undefined || breakdownPath === "" || !existsSync(breakdownPath)) return null;
  try {
    return parseBreakdown(readFileSync(breakdownPath, "utf-8"))[taskId]?.fingerprint ?? null;
  } catch {
    return null;
  }
}

const excludedFor = (docs: ReturnType<typeof resolveDocs>): ((rel: string) => boolean) => {
  const artifacts = upstreamArtifacts(docs);
  return (rel) => artifacts.has(rel) || isStoreArtifact(rel);
};

function rowFilesFor(targetRoot: string, docs: ReturnType<typeof resolveDocs>, taskId: string): string[] {
  const row = rowCells(docs.breakdown.buf?.toString("utf-8") ?? "", taskId);
  const files = filesFromCell(row?.["files touched"]).map((f) => normalizeRel(targetRoot, f));
  return [...new Set(files.filter((f): f is string => f !== null))].sort();
}

/**
 * The execution block a new run starts with: the repository baseline, the confirmed
 * context, the upstream fingerprints the run is built against, and the row's files.
 */
function newExecution(
  targetRoot: string,
  taskId: string,
  runId: string,
  payload: WritePayload,
  breakdownPath: string | undefined,
  rowFingerprint: string | null,
  restartedFrom: string | null,
  external?: ExternalInput,
): ExecutionBlock {
  const docs = resolveDocs(targetRoot, breakdownPath, external);
  const now = currentBasis(docs, taskId, rowFingerprint);
  const upstream: Record<string, string | null> = {};
  for (const k of UPSTREAM_KEYS) upstream[k] = now[k] ?? null;
  const row = rowCells(docs.breakdown.buf?.toString("utf-8") ?? "", taskId);
  return {
    runId,
    baseline: captureBaseline(targetRoot, excludedFor(docs)),
    context: {
      platform: payload.platform ?? (row?.platform || null) ?? docs.breakdown.fm?.platform ?? null,
      deviceType: docs.breakdown.fm?.device_type ?? null,
      accessibility: null,
      designAttestation: null,
    },
    upstream,
    expectedFiles: rowFilesFor(targetRoot, docs, taskId),
    plan: null,
    checkpoints: [],
    validations: [],
    probes: [],
    developerTesting: null,
    review: null,
    seq: 0,
    resumes: 0,
    restartedFrom,
    outcome: null,
  };
}

/* ------------------------------------------------------------ checkpoints */

/**
 * ENG-003. What the shared implementation methodology may append for the ACTIVE run.
 * None of these is a lifecycle state: a checkpoint can never move a task to complete,
 * failed or blocked, and cannot be written for a run that is not in progress.
 */
export const CHECKPOINT_KINDS = ["context", "plan", "step", "validation", "probe", "developer-testing", "review"] as const;

const strList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;

export function writeCheckpoint(
  targetRoot: string,
  feature: string,
  taskId: string,
  runId: string,
  kind: string,
  payload: unknown,
  breakdownPath?: string,
  external?: ExternalInput,
): WriteResult {
  const path = stateFilePath(targetRoot, feature);
  const loaded = loadForWrite(path, feature, taskId);
  if ("refusal" in loaded) return loaded.refusal;
  const file = loaded.file;
  const prior = file.tasks[taskId];
  const ex0 = readExecution(prior?.execution);
  if (prior?.state !== "in-progress" || ex0 === null) {
    return refuse(path, taskId, "no-active-run",
      `Refused: ${taskId} has no active checkpointed run (state: ${prior?.state ?? "unrecorded"}). Only /implement-task starts a run.`);
  }
  if (prior.runId !== runId) {
    return refuse(path, taskId, "run-mismatch", `Refused: the active run is ${prior.runId}, not ${runId}.`);
  }
  const bad = (why: string): WriteResult => refuse(path, taskId, "invalid-checkpoint", `Refused: ${kind} checkpoint — ${why}`);
  if (!(CHECKPOINT_KINDS as readonly string[]).includes(kind)) {
    return bad(`"${kind}" is not a checkpoint kind (${CHECKPOINT_KINDS.join(", ")}). Lifecycle state is written only by /implement-task.`);
  }
  if (!isRecord(payload)) return bad("the payload must be a JSON object");

  const ex: ExecutionBlock = structuredClone(ex0);
  const docs = resolveDocs(targetRoot, breakdownPath, external);
  const unver = unverifiableRefs(docs);
  const fingerprint = rowFingerprintFor(breakdownPath, taskId) ?? prior.rowFingerprint ?? null;
  const now = currentBasis(docs, taskId, fingerprint, ex.probes);
  const excluded = excludedFor(docs);
  const owned = taskOwnedFiles(ex, rowFilesFor(targetRoot, docs, taskId), excluded);
  const seq = ex.seq + 1;
  const rels = (v: unknown): string[] | null => {
    const list = strList(v);
    if (list === null) return null;
    const out = list.map((p) => normalizeRel(targetRoot, p));
    return out.every((p): p is string => p !== null) ? [...new Set(out as string[])] : null;
  };
  const snapshot = (files: string[]) => files.map((p) => ({ path: p, hash: hashRel(targetRoot, p) }));
  const resolveBasis = (refs: string[]): Record<string, string | null> | string => {
    const out: Record<string, string | null> = {};
    for (const r of refs) {
      if (unver.has(r) && now[r] === null) {
        return `basis reference "${r}" cites an external source whose content was not read in this invocation — pass the evidence of the read the work was built against (--${r === "design" ? "design" : "source"}-evidence)`;
      }
      if (!(r in now) || now[r] === null) return `basis reference "${r}" does not resolve against the current documents`;
      out[r] = now[r];
    }
    return out;
  };

  switch (kind) {
    case "context": {
      const a = payload.accessibility;
      if (a !== undefined && (!isRecord(a) || typeof a.applicable !== "boolean")) return bad("accessibility.applicable must be a boolean");
      if (payload.deviceType !== undefined && typeof payload.deviceType !== "string") return bad("deviceType must be a string");
      ex.context = {
        ...ex.context,
        ...(typeof payload.deviceType === "string" ? { deviceType: payload.deviceType } : {}),
        ...(isRecord(a)
          ? { accessibility: { applicable: a.applicable as boolean, reason: typeof a.reason === "string" ? a.reason : null, ...(strList(a.standardIds) ? { standardIds: strList(a.standardIds) as string[] } : {}) } }
          : {}),
        ...(typeof payload.designAttestation === "string" ? { designAttestation: payload.designAttestation } : {}),
      };
      break;
    }
    case "plan": {
      const expected = rels(payload.expectedFiles ?? []);
      if (expected === null) return bad("expectedFiles must be repository-relative paths inside the target root");
      if (!Array.isArray(payload.steps) || payload.steps.length === 0) return bad("a plan needs at least one step");
      const steps: PlanStep[] = [];
      for (const s of payload.steps) {
        if (!isRecord(s) || typeof s.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(s.id)) return bad("every step needs an id of letters, digits, _ or -");
        if (steps.some((x) => x.id === s.id)) return bad(`duplicate step id ${s.id}`);
        const files = rels(s.files ?? []);
        const basis = strList(s.basis ?? []);
        if (files === null) return bad(`step ${s.id}: files must be repository-relative paths inside the target root`);
        if (basis === null) return bad(`step ${s.id}: basis must be a list of basis references`);
        const resolved = resolveBasis(basis);
        if (typeof resolved === "string") return bad(`step ${s.id}: ${resolved}`);
        steps.push({ id: s.id, description: typeof s.description === "string" ? s.description : "", files, basis });
      }
      ex.plan = { expectedFiles: expected, steps };
      break;
    }
    case "step": {
      const step = ex.plan?.steps.find((s) => s.id === payload.stepId);
      if (ex.plan === null) return bad("record the plan before any step");
      if (step === undefined) return bad(`step "${String(payload.stepId)}" is not in the recorded plan`);
      const files = payload.files === undefined ? step.files : rels(payload.files);
      if (files === null) return bad("files must be repository-relative paths inside the target root");
      const basis = resolveBasis(step.basis);
      if (typeof basis === "string") return bad(basis);
      ex.checkpoints.push({ seq, stepId: step.id, stepFingerprint: stepFingerprint(step), files: snapshot(files), basis });
      break;
    }
    case "validation": {
      if (typeof payload.command !== "string" || payload.command.trim() === "") return bad("command is required");
      if (payload.result !== "pass" && payload.result !== "fail") {
        return bad(`result "${String(payload.result)}" — only "pass" or "fail" from a command that actually ran is recordable`);
      }
      const vkind = payload.kind ?? "validation";
      if (vkind !== "validation" && vkind !== "developer-test") return bad('kind must be "validation" or "developer-test"');
      const covers = payload.covers === undefined ? owned : rels(payload.covers);
      if (covers === null) return bad("covers must be repository-relative paths inside the target root");
      let refs = strList(payload.basis ?? null);
      if (refs === null) {
        const set = new Set<string>();
        for (const s of ex.plan?.steps ?? []) if (s.files.some((f) => covers.includes(f))) for (const r of s.basis) set.add(r);
        if (now["row:acceptance criteria"]) set.add("row:acceptance criteria");
        refs = [...set].sort();
      }
      const basis = resolveBasis(refs);
      if (typeof basis === "string") return bad(basis);
      let evidence: { path: string; hash: string | null } | null = null;
      if (payload.evidence !== undefined) {
        const ev = typeof payload.evidence === "string" ? normalizeRel(targetRoot, payload.evidence) : null;
        if (ev === null) return bad("evidence must be a repository-relative path");
        evidence = { path: ev, hash: hashRel(targetRoot, ev) };
      }
      ex.validations.push({
        seq,
        kind: vkind,
        command: payload.command,
        result: payload.result,
        exitCode: typeof payload.exitCode === "number" ? payload.exitCode : null,
        covers: snapshot(covers),
        basis,
        evidence,
      });
      break;
    }
    case "probe": {
      if (typeof payload.name !== "string" || typeof payload.command !== "string" || typeof payload.output !== "string") {
        return bad("name, command and output are required strings");
      }
      ex.probes.push({ seq, name: payload.name, command: payload.command, output: payload.output, outputFingerprint: `sha256:${createHash("sha256").update(payload.output, "utf-8").digest("hex")}` });
      break;
    }
    case "developer-testing": {
      const dt = payload.developerTesting as DeveloperTestingBlock | undefined;
      const debt = (Array.isArray(payload.verificationDebt) ? payload.verificationDebt : []) as VerificationDebtEntry[];
      const validation = latestValidations(ex.validations).map((v) => ({ command: v.command, result: v.result }));
      const problem =
        (dt === undefined ? "developerTesting is required" : null) ??
        accessibilityProblem({ verificationDebt: debt }) ??
        developerTestingProblem({ developerTesting: dt, verificationDebt: debt, validation });
      if (problem !== null) return bad(problem);
      ex.developerTesting = { seq, developerTesting: dt as DeveloperTestingBlock, verificationDebt: debt };
      break;
    }
    case "review": {
      const completed = strList(payload.completed);
      const findings = strList(payload.findings ?? []);
      if (completed === null || findings === null) return bad("completed and findings must be lists of strings");
      ex.review = { seq, completed, findings, covers: snapshot(owned) };
      break;
    }
  }

  ex.seq = seq;
  file.tasks[taskId] = { ...prior, execution: ex };
  const failed = saveFile(path, file);
  if (failed !== null) return failed(taskId);
  return { status: "written", path, taskId, state: "in-progress", attempt: prior.attempt, runId, summary: `Checkpoint ${kind} #${seq} recorded for ${runId}.` };
}

/* ------------------------------------------------------- resume / abandon */

/** ENG-003. Read-only: the deterministic resume verdict for a task's recorded run. */
export function resumeTask(targetRoot: string, feature: string, taskId: string, breakdownPath: string, external?: ExternalInput): ResumeVerdict {
  const r = readTaskState(targetRoot, feature, breakdownPath);
  let raw: Record<string, unknown> | null = null;
  if (r.available) {
    try {
      const doc = JSON.parse(readFileSync(stateFilePath(targetRoot, feature), "utf-8"));
      raw = isRecord(doc) && isRecord(doc.tasks) && isRecord(doc.tasks[taskId]) ? (doc.tasks[taskId] as Record<string, unknown>) : null;
    } catch {
      raw = null;
    }
  }
  const view = r.tasks[taskId];
  return evaluateExecution({
    root: targetRoot,
    taskId,
    state: view?.state === "unknown" || view === undefined ? null : view.state,
    runId: view?.runId ?? null,
    attempt: view?.attempt ?? null,
    execution: readExecution(raw?.execution),
    rowFingerprint: rowFingerprintFor(breakdownPath, taskId),
    breakdownPath,
    external,
  });
}

/**
 * ENG-003. Abandon the active run: record it `failed` with an explicit `abandoned`
 * outcome, keeping its attempt and runId. The working tree is never touched — the result
 * lists the task-owned files that differ from the run's baseline, so reverting any of them
 * stays a separate, confirmed decision.
 */
export function abandonTask(
  targetRoot: string,
  feature: string,
  taskId: string,
  runId: string,
  reason: string,
  breakdownPath?: string,
): WriteResult {
  const path = stateFilePath(targetRoot, feature);
  const loaded = loadForWrite(path, feature, taskId);
  if ("refusal" in loaded) return loaded.refusal;
  const file = loaded.file;
  const prior = file.tasks[taskId];
  if (prior?.state !== "in-progress") {
    return refuse(path, taskId, "no-active-run", `Refused: ${taskId} is ${prior?.state ?? "unrecorded"}; only an in-progress run can be abandoned.`);
  }
  if (prior.runId !== runId) return refuse(path, taskId, "run-mismatch", `Refused: the active run is ${prior.runId}, not ${runId}.`);
  const ex = readExecution(prior.execution);
  const docs = resolveDocs(targetRoot, breakdownPath);
  const changes = ex === null ? [] : changedSinceBaseline(targetRoot, ex, taskOwnedFiles(ex, rowFilesFor(targetRoot, docs, taskId), excludedFor(docs)));
  file.tasks[taskId] = {
    ...prior,
    state: "failed",
    filesChanged: changes,
    blockers: [`abandoned: ${reason.trim() || "no reason given"}`],
    ...(ex !== null ? { execution: { ...ex, outcome: "abandoned" } } : {}),
  };
  const failed = saveFile(path, file);
  if (failed !== null) return failed(taskId);
  return {
    status: "written",
    path,
    taskId,
    state: "failed",
    attempt: prior.attempt,
    runId,
    taskOwnedChanges: changes,
    summary: `Abandoned ${runId}; recorded as failed. ${changes.length} task-owned file(s) still differ from the run's baseline and were left untouched.`,
  };
}

/* -------------------------------------------------------------------- CLI */

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function main(): void {
  const mode = process.argv[2];
  const root = flag("root") ?? process.cwd();
  const feature = flag("feature") ?? "";
  const breakdown = flag("breakdown");

  // SHARED-013: the upstream body fingerprint a command compares against a downstream
  // document's recorded `source_fingerprint`. Always exits 0 and always prints one JSON
  // object, like every other mode here, so a caller branches on `status` not exit code.
  if (mode === "fingerprint") {
    const file = flag("file");
    if (file === undefined) {
      process.stdout.write(`${JSON.stringify({ status: "invalid", detail: "--file is required" }, null, 2)}\n`);
      process.exit(0);
    }
    if (!existsSync(file)) {
      process.stdout.write(`${JSON.stringify({ status: "absent", path: file, fingerprint: null }, null, 2)}\n`);
      process.exit(0);
    }
    // ENG-003: --raw hashes the file's bytes, for an upstream input that is not a planning
    // document (a source specification). Planning documents keep the body-only fingerprint.
    const fp = process.argv.includes("--raw") ? fingerprintFile(file) : fingerprintBody(readFileSync(file));
    process.stdout.write(
      `${JSON.stringify(
        fp === null
          ? { status: "unparseable", path: file, fingerprint: null, detail: "no recognizable frontmatter block" }
          : { status: "ok", path: file, fingerprint: fp },
        null,
        2,
      )}\n`,
    );
    process.exit(0);
  }

  if (mode === "read") {
    process.stdout.write(`${JSON.stringify(readTaskState(root, feature, breakdown), null, 2)}\n`);
    process.exit(0);
  }

  // ENG-003: evidence the reading step saved for external upstream sources. Absent means
  // not read in this invocation — the sources are then unverifiable, never unchanged.
  const external: ExternalInput = {
    design: loadEvidenceFile(flag("design-evidence")),
    requirements: loadEvidenceFile(flag("source-evidence")),
  };

  const print = (v: unknown): never => {
    process.stdout.write(`${JSON.stringify(v, null, 2)}\n`);
    process.exit(0);
  };
  const requireBreakdown = (): string => {
    if (breakdown === undefined || breakdown === "") {
      print({ status: "invalid", detail: "--breakdown is required: resume and reconciliation are judged against the current documents" });
    }
    return breakdown as string;
  };

  // ENG-003: the design-reference fingerprint of a planning document's four fields,
  // which /analyze-feature stamps as `design_reference_fingerprint`.
  if (mode === "design-fingerprint") {
    const file = flag("file");
    const fm = file !== undefined && existsSync(file) ? readFrontmatter(readFileSync(file)) : null;
    if (fm === null) print({ status: file === undefined ? "invalid" : "unparseable", path: file ?? null, fingerprint: null });
    const st = designReferenceState(root, fm as Record<string, string | null>, external.design);
    print(st.fingerprint === null
      ? { status: "unverifiable", path: file, fingerprint: null, detail: st.detail }
      : { status: "ok", path: file, fingerprint: st.fingerprint, detail: st.detail });
  }

  // ENG-003: the content fingerprint of a source specification — a repository file by its
  // bytes, an external URL by the evidence of its content — stamped as `source_fingerprint`.
  if (mode === "source-fingerprint") {
    const source = flag("source");
    if (source === undefined) print({ status: "invalid", detail: "--source is required" });
    const r = sourceFingerprint(root, source as string, external.requirements);
    print(r.fingerprint === null
      ? { status: "unverifiable", source, fingerprint: null, detail: r.detail }
      : { status: "ok", source, fingerprint: r.fingerprint, detail: r.detail });
  }

  // ENG-003: the upstream SDLC chain verdict and its earliest stale stage.
  if (mode === "chain") print({ status: "ok", ...chainStatus(root, requireBreakdown(), external) });

  // ENG-003: the read-only resume verdict for one task's recorded run.
  if (mode === "resume") print(resumeTask(root, feature, flag("task") ?? "", requireBreakdown(), external));

  // ENG-003: append a checkpoint to the active run. The only write the shared
  // implementation methodology may perform; it can never set a lifecycle state.
  if (mode === "checkpoint") {
    let payload: unknown = {};
    try {
      payload = JSON.parse(flag("payload") ?? "{}");
    } catch (e) {
      print({ status: "refused", path: stateFilePath(root, feature), taskId: flag("task") ?? "", reason: "unparseable", summary: "Refused: --payload is not valid JSON.", detail: e instanceof Error ? e.message : String(e) });
    }
    print(writeCheckpoint(root, feature, flag("task") ?? "", flag("run") ?? "", flag("kind") ?? "", payload, requireBreakdown(), external));
  }

  // ENG-003: abandon the active run. Lifecycle — /implement-task only.
  if (mode === "abandon") {
    print(abandonTask(root, feature, flag("task") ?? "", flag("run") ?? "", flag("reason") ?? "", requireBreakdown()));
  }

  if (mode === "write") {
    const taskId = flag("task") ?? "";
    const state = flag("state") ?? "";
    const rawPayload = flag("payload");
    let payload: WritePayload = {};
    if (rawPayload !== undefined) {
      try {
        payload = JSON.parse(rawPayload) as WritePayload;
      } catch (e) {
        process.stdout.write(
          `${JSON.stringify(
            {
              status: "refused",
              path: stateFilePath(root, feature),
              taskId,
              reason: "unparseable",
              summary: "Refused: --payload is not valid JSON.",
              detail: e instanceof Error ? e.message : String(e),
            },
            null,
            2,
          )}\n`,
        );
        process.exit(0);
      }
    }
    const head = flag("head");
    if (head !== undefined) payload.head = head;
    process.stdout.write(
      `${JSON.stringify(writeTaskState(root, feature, taskId, state, payload, breakdown, { mode: (flag("mode") ?? "start") as WriteOptions["mode"], external }), null, 2)}\n`,
    );
    process.exit(0);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "refused",
        path: "",
        taskId: "",
        reason: "invalid-state",
        summary: 'Refused: first argument must be one of read, write, checkpoint, resume, abandon, chain, fingerprint, design-fingerprint, source-fingerprint.',
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] !== undefined && /task-state\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) main();
