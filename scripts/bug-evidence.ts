/**
 * bug-evidence.ts
 *
 * The canonical Bug Evidence Snapshot (Bug Flow P1.5): one normalized copy of a bug's evidence,
 * docs/bugs/<bug_key>/bug-report.json, written once by /analyze-bug and read by every later
 * Bug Flow helper, so the original source — a QA ledger, a JSON report, a document's one-time
 * extraction — is never asked for or converted again.
 *
 *   source evidence  ──normalize once (bug-intake.ts)──▶  canonical snapshot  ──▶  plan, gates, handoff
 *
 * What it holds: the bug's identity (QA id, external ref, origin, found-in build, surfaces,
 * capability, related feature), its evidence (title, description, steps, expected, actual,
 * environment), bug-intake's own `bug_evidence_fingerprint`, and provenance — the source type
 * (`qa-ledger`, `json-report`, `document`, `manual`), a non-absolute reference to it, the
 * SHA-256 of its bytes (provenance only, never equality), and for a QA bug the QA repository's
 * location relative to the repository root, so QA's live state can still be read. It never
 * holds QA's state: assigned, reopened, delivered or closed stay live in QA.
 *
 * Integrity: on every read the schema, the identity (the key the bug-intake rules derive for
 * it, and the file it lives in), the required evidence and the evidence fingerprint are
 * recomputed, and `snapshot_fingerprint` — sha256 over the canonical JSON of every other field
 * — must match. A failure is `invalid`, never trusted.
 *
 * Writes are atomic (a temp file renamed into place) and idempotent: the same semantic evidence
 * is never rewritten, whatever its source bytes. New evidence replaces the snapshot only when no
 * plan exists yet or the plan already records it — the existing /analyze-bug reconciliation
 * (a regenerated draft, an appended cycle) decides; an identity conflict never does.
 *
 * It runs no process, reads no clock, reaches no network and never writes a QA repository.
 * Feature work never has a snapshot.
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "path";
import { createHash } from "crypto";
import { DEV_ORIGINS, deriveBugKey, evidenceFingerprint, isSafeKey, lookupQaBug, normalizeBug } from "./bug-intake.ts";
import { canonical } from "./qa-release-gate.ts";

export const SNAPSHOT_SCHEMA = "bug-evidence-snapshot/v1";
export const SOURCE_TYPES = ["qa-ledger", "json-report", "document", "manual"] as const;
const ORIGINS = ["qa-execution", "qa-standalone", ...DEV_ORIGINS];
const EVIDENCE_FIELDS = ["title", "steps", "expected", "actual", "surfaces", "found_in_build"] as const;

const sha = (s: string | Buffer) => `sha256:${createHash("sha256").update(s).digest("hex")}`;
const text = (v: unknown) => String(v ?? "").replace(/\r\n?/g, "\n").trim();

export function snapshotPath(key: string): string | null {
  return isSafeKey(key) ? `docs/bugs/${key}/bug-report.json` : null;
}

export interface Source { source_type: (typeof SOURCE_TYPES)[number]; source_ref: string | null; source_fingerprint: string | null; qa_repo_hint?: string }
export interface Snapshot {
  schema: string;
  bug_key: string;
  identity: { qa_bug_id: string | null; external_ref: string | null; origin: string; found_in_build: string | null; surfaces: string[]; capability: string | null; related_feature: string | null };
  evidence: { title: string; description: string | null; steps: string[]; expected: string; actual: string; environment: string | null };
  bug_evidence_fingerprint: string;
  provenance: Source;
  snapshot_fingerprint: string;
}

const seal = (s: Omit<Snapshot, "snapshot_fingerprint">) => sha(canonical(s));

/** The snapshot of an intake result — the stable evidence only, never QA's state. */
export function buildSnapshot(intake: Record<string, any>, source: Source): Snapshot {
  const id = intake.identity;
  const ev = intake.evidence;
  const body = {
    schema: SNAPSHOT_SCHEMA,
    bug_key: id.bug_key,
    identity: {
      qa_bug_id: id.qa_bug_id ?? null, external_ref: id.external_ref ?? null, origin: id.origin, found_in_build: id.found_in_build ?? null,
      surfaces: [...(id.surfaces ?? [])], capability: id.capability ?? null, related_feature: id.related_feature ?? null,
    },
    evidence: {
      title: text(ev.title), description: ev.description === null || ev.description === undefined ? null : text(ev.description),
      steps: (ev.steps ?? []).map(text).filter(Boolean), expected: text(ev.expected), actual: text(ev.actual),
      environment: ev.environment === null || ev.environment === undefined ? null : text(ev.environment),
    },
    bug_evidence_fingerprint: intake.bug_evidence_fingerprint,
    provenance: { ...source },
  };
  return { ...body, snapshot_fingerprint: seal(body) };
}

/* ------------------------------------------------------------------- read */

export function readSnapshot(root: string, key: string): { status: "missing" } | { status: "invalid"; code: string; reason: string } | { status: "valid"; snapshot: Snapshot; path: string } {
  const rel = snapshotPath(key);
  if (rel === null) return { status: "invalid", code: "UNSAFE_KEY", reason: `${JSON.stringify(key)} is not a safe bug key` };
  const abs = join(root, rel);
  if (!existsSync(abs)) return { status: "missing" };
  const bad = (code: string, reason: string) => ({ status: "invalid" as const, code, reason: `${rel}: ${reason}` });
  let s: any;
  try {
    s = JSON.parse(readFileSync(abs, "utf-8"));
  } catch {
    return bad("MALFORMED", "not readable JSON");
  }
  if (!s || typeof s !== "object" || s.schema !== SNAPSHOT_SCHEMA) return bad("SCHEMA", `not a ${SNAPSHOT_SCHEMA} snapshot`);
  if (s.bug_key !== key) return bad("IDENTITY_MISMATCH", `records bug ${JSON.stringify(s.bug_key)}, not ${key}`);
  const id = s.identity, ev = s.evidence, pv = s.provenance;
  const strOrNull = (v: unknown) => v === null || typeof v === "string";
  if (!id || !ORIGINS.includes(id.origin) || !strOrNull(id.qa_bug_id) || !strOrNull(id.external_ref) || !strOrNull(id.found_in_build) || !strOrNull(id.capability) || !strOrNull(id.related_feature) || !Array.isArray(id.surfaces)) return bad("IDENTITY", "the identity is incomplete");
  if (!ev || !text(ev.title) || !Array.isArray(ev.steps) || ev.steps.length === 0 || !ev.steps.every((x: unknown) => typeof x === "string" && text(x)) || !text(ev.expected) || !text(ev.actual)) return bad("EVIDENCE", "required evidence (title, steps, expected, actual) is missing");
  if (!pv || !(SOURCE_TYPES as readonly string[]).includes(pv.source_type) || !strOrNull(pv.source_ref) || !strOrNull(pv.source_fingerprint)) return bad("PROVENANCE", "the provenance is incomplete");
  const derived = deriveBugKey({ qa_bug_id: id.qa_bug_id, external_ref: id.external_ref, origin: id.origin, title: text(ev.title), steps: ev.steps.map(text) });
  if (derived !== s.bug_key) return bad("IDENTITY_MISMATCH", `its identity derives bug key ${derived}, not ${s.bug_key}`);
  if (evidenceFingerprint({ ...ev, surfaces: id.surfaces, found_in_build: id.found_in_build }) !== s.bug_evidence_fingerprint) return bad("FINGERPRINT_MISMATCH", "the evidence does not match its bug_evidence_fingerprint");
  const { snapshot_fingerprint, ...body } = s;
  if (seal(body) !== snapshot_fingerprint) return bad("SEAL_MISMATCH", "the snapshot was changed outside scripts/bug-evidence.ts");
  return { status: "valid", snapshot: s as Snapshot, path: rel };
}

/* ---------------------------------------------------------------- compare */

/** One intake against the snapshot: the semantic fingerprint decides; source bytes never do. */
export function compareEvidence(snapshot: Snapshot, intake: Record<string, any>): { outcome: "SAME_EVIDENCE" | "NEW_EVIDENCE" | "IDENTITY_CONFLICT" | "INVALID_SOURCE"; changed: string[]; reason: string } {
  if (!intake || intake.ok === false || intake.context_level === "insufficient" || !intake.identity) return { outcome: "INVALID_SOURCE", changed: [], reason: intake?.reason ?? "the source could not be normalized" };
  const id = intake.identity;
  const conflict = ["bug_key", "qa_bug_id", "external_ref", "origin"].filter((f) => (f === "bug_key" ? id.bug_key !== snapshot.bug_key : (id[f] ?? null) !== (snapshot.identity as any)[f]));
  if (conflict.length) return { outcome: "IDENTITY_CONFLICT", changed: conflict, reason: `the source is a different bug (${conflict.join(", ")})` };
  if (intake.bug_evidence_fingerprint === snapshot.bug_evidence_fingerprint) return { outcome: "SAME_EVIDENCE", changed: [], reason: "the source normalizes to the same evidence" };
  const now: Record<string, unknown> = { ...intake.evidence, surfaces: id.surfaces, found_in_build: id.found_in_build };
  const then: Record<string, unknown> = { ...snapshot.evidence, surfaces: snapshot.identity.surfaces, found_in_build: snapshot.identity.found_in_build };
  const norm = (f: string, v: unknown) =>
    f === "steps" ? JSON.stringify(((v as unknown[]) ?? []).map(text).filter(Boolean)) : f === "surfaces" ? JSON.stringify([...new Set(((v as unknown[]) ?? []).map(text))].sort()) : v === null || v === undefined ? "null" : text(v);
  const changed = EVIDENCE_FIELDS.filter((f) => norm(f, now[f]) !== norm(f, then[f]));
  return { outcome: "NEW_EVIDENCE", changed, reason: `the evidence changed: ${changed.join(", ")}` };
}

/* ------------------------------------------------------------------- save */

/**
 * Persist an intake as the bug's snapshot. `plan`: "none" (no Bug Work Plan yet), "reconciled"
 * (the plan already records this evidence) or "unreconciled". New evidence is written only for
 * the first two; the same evidence is never rewritten.
 */
export function saveSnapshot(root: string, intake: Record<string, any>, source: Source, o: { plan: "none" | "reconciled" | "unreconciled" }): Record<string, any> {
  if (!intake || intake.ok === false || intake.context_level === "insufficient" || !intake.identity) return { ok: false, outcome: "INVALID_SOURCE", reason: intake?.reason ?? "nothing to persist" };
  const key = intake.identity.bug_key as string;
  const rel = snapshotPath(key);
  if (rel === null) return { ok: false, outcome: "INVALID_SOURCE", reason: `${JSON.stringify(key)} is not a safe bug key` };
  const cur = readSnapshot(root, key);
  let outcome = "CREATED";
  let changed: string[] = [];
  if (cur.status === "valid") {
    const c = compareEvidence(cur.snapshot, intake);
    if (c.outcome === "SAME_EVIDENCE") return { ok: true, outcome: "UNCHANGED", changed: false, path: rel, bug_key: key, bug_evidence_fingerprint: cur.snapshot.bug_evidence_fingerprint, reason: "same evidence — the snapshot and its provenance are kept as they are" };
    if (c.outcome !== "NEW_EVIDENCE") return { ok: false, outcome: c.outcome, changed: c.changed, path: rel, reason: c.reason };
    if (o.plan === "unreconciled") return { ok: false, outcome: "NEW_EVIDENCE", changed: c.changed, path: rel, reason: `${c.reason} — the Bug Work Plan has not reconciled to it, so the snapshot is kept; /analyze-bug decides` };
    outcome = "REPLACED";
    changed = c.changed;
  } else if (o.plan === "unreconciled") {
    return { ok: false, outcome: "EVIDENCE_NOT_RECONCILED", path: rel, reason: "the Bug Work Plan records different evidence — reconcile it through /analyze-bug before the snapshot is written" };
  } else if (cur.status === "invalid") outcome = "REPLACED";
  const snap = buildSnapshot(intake, source);
  const abs = join(root, rel);
  const tmp = join(dirname(abs), ".bug-report.json.tmp");
  try {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(tmp, JSON.stringify(snap, null, 2) + "\n");
    renameSync(tmp, abs);
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best effort */
    }
    return { ok: false, outcome: "WRITE_FAILED", path: rel, reason: `could not write ${rel}: ${(e as Error).message}` };
  }
  return { ok: true, outcome, changed: true, fields: changed, path: rel, bug_key: key, bug_evidence_fingerprint: snap.bug_evidence_fingerprint };
}

/** Provenance for a source: its type, a non-absolute reference, and its bytes' SHA-256. */
export function describeSource(root: string, s: { qaRepo?: string; qaId?: string; report?: string; document?: string; sourceType?: string }): Source {
  const bytes = (p: string | undefined) => (p && existsSync(p) && statSync(p).isFile() ? sha(readFileSync(p)) : null);
  if (s.qaRepo && s.qaId) {
    const ledger = `qa-ledger/scopes/bug/${s.qaId}.jsonl`;
    const real = existsSync(s.qaRepo) ? realpathSync(s.qaRepo) : resolve(s.qaRepo);
    const hint = relative(root, real).split(sep).join("/");
    return { source_type: "qa-ledger", source_ref: ledger, source_fingerprint: bytes(join(real, ledger)), ...(isAbsolute(hint) ? {} : { qa_repo_hint: hint }) };
  }
  const file = s.document ?? s.report;
  const type = s.document ? "document" : s.sourceType === "manual" ? "manual" : "json-report";
  return { source_type: type, source_ref: file ? file.split(/[\\/]/).pop() ?? null : null, source_fingerprint: bytes(file) };
}

/* ---------------------------------------------------------------- resolve */

/**
 * The bug's evidence for a downstream helper, without a source argument. A QA bug whose QA
 * repository is found at the snapshot's hint is read live (QA's state, current evidence);
 * otherwise the snapshot's evidence is used — for a QA bug at partial context, with no QA
 * state assumed. Shaped exactly like a bug-intake result.
 */
export function intakeFromSnapshot(root: string, key: string): { missing: true } | { invalid: string; code: string } | { result: Record<string, any>; evidence_source: "qa-live" | "snapshot"; evidenceRef: string } {
  const r = readSnapshot(root, key);
  if (r.status === "missing") return { missing: true };
  if (r.status === "invalid") return { invalid: r.reason, code: r.code };
  const s = r.snapshot;
  const where = { source: "bug-evidence-snapshot", path: r.path };
  if (s.identity.qa_bug_id) {
    const hint = s.provenance.qa_repo_hint;
    const qa = hint ? resolve(root, hint) : null;
    if (qa && existsSync(join(qa, "qa-ledger"))) {
      const live = lookupQaBug(qa, `qa=${s.identity.qa_bug_id}`);
      if (live.context_level !== "insufficient" && live.status !== "invalid" && live.status !== "ambiguous") return { result: live, evidence_source: "qa-live", evidenceRef: live.provenance?.evidence?.path ?? r.path };
    }
    return {
      result: {
        ok: true, status: "ready_for_dev", dev_may_start: true, context_level: "partial", qa_state: null, qa_state_verified: false,
        reason: "Partial context: QA's repository is not available here — the canonical evidence snapshot is used, and QA's state is neither read nor assumed.",
        warnings: [
          { code: "QA_STATE_UNAVAILABLE", message: "QA ownership state is unavailable — proceeding on the canonical evidence snapshot only. QA's state was not used and is not assumed." },
          { code: "QA_REPO_UNRESOLVED", message: `the QA repository recorded for this bug (${hint ?? "none"}) is not available from this repository` },
        ],
        provenance: { evidence: where, state: null },
        identity: { work_type: "bug", bug_key: s.bug_key, ...s.identity },
        evidence: { ...s.evidence, severity: null, linked_cases: [], related_scopes: [] },
        bug_evidence_fingerprint: s.bug_evidence_fingerprint,
        qa: null, reopened: null,
      },
      evidence_source: "snapshot", evidenceRef: r.path,
    };
  }
  // Not a QA bug: bug-intake's own normalization, run on the snapshot — the fingerprint is recomputed, never copied.
  const result = normalizeBug({ origin: s.identity.origin, external_ref: s.identity.external_ref, ...s.evidence, surfaces: s.identity.surfaces, found_in_build: s.identity.found_in_build, related_feature: s.identity.related_feature }, where);
  return { result, evidence_source: "snapshot", evidenceRef: r.path };
}
