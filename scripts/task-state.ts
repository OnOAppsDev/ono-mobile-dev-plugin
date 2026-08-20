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
 * Always exits 0 and always prints one JSON object. Callers branch on `status`.
 *
 *   node --no-warnings scripts/task-state.ts read  --root <dir> --feature <slug> [--breakdown <path>]
 *   node --no-warnings scripts/task-state.ts write --root <dir> --feature <slug> --task <id>
 *                                                 --state <in-progress|complete|blocked|failed>
 *                                                 [--breakdown <path>] [--payload <json>] [--head <sha>]
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

/** Highest schema version this helper understands. Pinned by docs/task-state-contract.md. */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * This plugin's version, stamped into `producedBy.version`. Held as a constant rather
 * than read from plugin.json so the helper performs no I/O beyond the state file and the
 * breakdown; `scripts/task-state.test.ts` asserts it matches .claude-plugin/plugin.json
 * so the two cannot drift. It records the version that actually wrote a record, never a
 * planned future release — a release bump is separate work.
 */
export const PLUGIN_VERSION = "0.5.0";

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
    | "feature-mismatch"
    | "schema-too-new"
    | "invalid-state"
    | "unparseable"
    | "write-failed";
  summary: string;
  detail?: string;
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
  return ac.length > 0 && ac.every((c) => c.met === true) && val.length > 0;
}

export function writeTaskState(
  targetRoot: string,
  feature: string,
  taskId: string,
  state: string,
  payload: WritePayload = {},
  breakdownPath?: string,
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

  if (nextState === "complete" && !verificationSatisfied(payload)) {
    return {
      status: "refused",
      path,
      taskId,
      reason: "complete-without-verification",
      summary:
        "Refused: a terminal `complete` requires every acceptance criterion recorded and met, plus at least one validation entry. Record `failed` or `blocked` instead.",
    };
  }

  let file: TaskStateFile = {
    taskStateSchemaVersion: CURRENT_SCHEMA_VERSION,
    feature,
    producedBy: { plugin: "ono-mobile-dev-plugin", version: PLUGIN_VERSION },
    tasks: {},
  };

  if (existsSync(path)) {
    let existing: unknown;
    try {
      existing = JSON.parse(readFileSync(path, "utf-8"));
    } catch (e) {
      return {
        status: "refused",
        path,
        taskId,
        reason: "unparseable",
        summary: "Refused: the existing task-state file could not be parsed. Fix or delete it before recording state.",
        detail: e instanceof Error ? e.message : String(e),
      };
    }
    if (isRecord(existing)) {
      const schema =
        typeof existing.taskStateSchemaVersion === "number" ? existing.taskStateSchemaVersion : 0;
      if (schema > CURRENT_SCHEMA_VERSION) {
        return {
          status: "refused",
          path,
          taskId,
          reason: "schema-too-new",
          summary: `Refused: the existing file is schema ${schema}, newer than the supported ${CURRENT_SCHEMA_VERSION}.`,
        };
      }
      if (typeof existing.feature === "string" && existing.feature !== feature) {
        return {
          status: "refused",
          path,
          taskId,
          reason: "feature-mismatch",
          summary: `Refused: the existing file records feature "${existing.feature}", not "${feature}".`,
        };
      }
      if (isRecord(existing.tasks)) {
        for (const [id, raw] of Object.entries(existing.tasks)) {
          if (isRecord(raw)) file.tasks[id] = raw as unknown as TaskRecord;
        }
      }
    }
  }

  const prior = file.tasks[taskId];
  // A new run is announced by `in-progress`, and that is the only thing that advances the
  // attempt counter. A terminal write belongs to the run already in flight and keeps its number.
  const attempt =
    nextState === "in-progress" ? (prior?.attempt ?? 0) + 1 : (prior?.attempt ?? 1);

  let fingerprint: string | null = prior?.rowFingerprint ?? null;
  if (breakdownPath !== undefined && breakdownPath !== "" && existsSync(breakdownPath)) {
    try {
      const row = parseBreakdown(readFileSync(breakdownPath, "utf-8"))[taskId];
      if (row !== undefined) fingerprint = row.fingerprint;
    } catch {
      /* keep whatever the prior record had */
    }
  }

  file.tasks[taskId] = {
    state: nextState,
    provenance: "plugin-verified",
    attempt,
    runId: `${taskId}-attempt-${attempt}`,
    rowFingerprint: fingerprint,
    platform: payload.platform ?? prior?.platform ?? null,
    head: payload.head ?? null,
    filesChanged: payload.filesChanged ?? [],
    standardIds: payload.standardIds ?? [],
    validation: payload.validation ?? [],
    acceptanceCriteria: payload.acceptanceCriteria ?? [],
    deviations: payload.deviations ?? [],
    blockers: payload.blockers ?? [],
  };

  const ordered: Record<string, TaskRecord> = {};
  for (const id of Object.keys(file.tasks).sort((a, b) => a.localeCompare(b))) {
    ordered[id] = file.tasks[id];
  }
  file = { ...file, tasks: ordered };

  try {
    writeAtomic(path, `${JSON.stringify(file, null, 2)}\n`);
  } catch (e) {
    return {
      status: "unreadable",
      path,
      taskId,
      reason: "write-failed",
      summary: "Task state could not be written; the previous file is unchanged.",
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  return {
    status: "written",
    path,
    taskId,
    state: nextState,
    attempt,
    runId: `${taskId}-attempt-${attempt}`,
    summary: `Recorded ${taskId} as ${nextState} (${taskId}-attempt-${attempt}).`,
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

  if (mode === "read") {
    process.stdout.write(`${JSON.stringify(readTaskState(root, feature, breakdown), null, 2)}\n`);
    process.exit(0);
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
      `${JSON.stringify(writeTaskState(root, feature, taskId, state, payload, breakdown), null, 2)}\n`,
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
        summary: 'Refused: first argument must be "read" or "write".',
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
