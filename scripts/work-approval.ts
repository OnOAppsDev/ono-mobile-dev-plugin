/**
 * work-approval.ts
 *
 * Content-bound approval for work packages — Bug Development Flow, Step 3. A package is
 * approved for exactly the content a human approved. The approval fingerprint binds:
 *   - the planning-document body;
 *   - the text above the frontmatter;
 *   - the identity and evidence fields implementation trusts.
 * Any edit to them, or a new fix cycle, leaves the approval stale until a human approves
 * again. Approval validity never depends on a clock.
 *
 * One kind today, `bug-work-plan` (docs/bug-work-plan-contract.md, "Approval"). Every
 * kind-specific choice is held in PACKAGES, so another work package can be added there:
 *   - how to validate the package;
 *   - which frontmatter fields are bound;
 *   - which field names the current cycle;
 *   - the algorithm id.
 *
 *   verify   read-only. One of `draft` | `approved` | `approval_stale` | `invalid`, with
 *            the reasons. A stale plan is reported, never rewritten back to draft.
 *   approve  needs an explicit human identity (--by); the approver is never inferred.
 *            Writes exactly four frontmatter values: status, approved_by,
 *            approved_fingerprint, approved_cycle. It then asserts:
 *              - the body and the text above the frontmatter are byte-identical;
 *              - the result verifies as approved;
 *            and writes atomically. Same content and same approver is an idempotent no-op.
 *
 * Always exits 0 and prints one JSON object; callers branch on `status`.
 *
 *   node --no-warnings scripts/work-approval.ts verify  <path> [--kind bug-work-plan]
 *   node --no-warnings scripts/work-approval.ts approve <path> --by <identity> [--kind bug-work-plan]
 */

import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, statSync, openSync, fsyncSync, closeSync, realpathSync } from "fs";
import { createHash } from "crypto";
import { basename, dirname, join } from "path";
import { fingerprintBody, splitDocument, splitValueAndComment } from "./migrate-planning-doc.ts";
import { canonical } from "./qa-release-gate.ts";
import { validateBugWorkPlan } from "./bug-work-plan.ts";

const sha = (b: string | Buffer): string => `sha256:${createHash("sha256").update(b).digest("hex")}`;

/** The frontmatter values approval writes, in order. Nothing else is ever written. */
export const APPROVAL_FIELDS = ["status", "approved_by", "approved_fingerprint", "approved_cycle"] as const;

/** The bug-work-plan frontmatter fields an approval binds — what implementation trusts. */
export const APPROVAL_BOUND_FIELDS = [
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
] as const;

interface PackageKind {
  /** Names the algorithm inside the fingerprint, so a future change can never collide with it. */
  algorithm: string;
  boundFields: readonly string[];
  /** Fields bound as sets: order-free, de-duplicated, sorted. */
  setFields: readonly string[];
  cycleField: string;
  validate(buf: Buffer): { ok: boolean; errors?: Array<{ code: string; message: string }>; frontmatter?: Record<string, any> };
}

const PACKAGES: Record<string, PackageKind> = {
  "bug-work-plan": {
    algorithm: "work-approval/bug-work-plan/v1",
    boundFields: APPROVAL_BOUND_FIELDS,
    setFields: ["surfaces"],
    cycleField: "fix_cycle",
    validate: validateBugWorkPlan,
  },
};

export type ApprovalStatus = "draft" | "approved" | "approval_stale" | "invalid";
type Reason = { code: string; message: string };

/* ----------------------------------------------------------- fingerprint */

/**
 * What an approval binds, for a structurally valid package; null otherwise:
 *   { algorithm, body: fingerprintBody, leading: sha256 of the bytes above the
 *     frontmatter block, fields: the bound fields' typed values }
 */
export function approvalPayload(buf: Buffer, kind = "bug-work-plan"): { algorithm: string; body: string; leading: string; fields: Record<string, unknown> } | null {
  const pkg = PACKAGES[kind];
  if (!pkg) return null;
  const split = splitDocument(buf);
  const v = pkg.validate(buf);
  if ("error" in split || !v.ok || !v.frontmatter) return null;
  const fields: Record<string, unknown> = {};
  for (const f of pkg.boundFields) {
    const x = v.frontmatter[f] ?? null;
    fields[f] = pkg.setFields.includes(f) && Array.isArray(x) ? [...new Set(x as string[])].sort() : x;
  }
  return { algorithm: pkg.algorithm, body: fingerprintBody(buf) as string, leading: sha(split.leading), fields };
}

/** sha256 over the canonical JSON (keys sorted recursively, no whitespace) of the payload. */
export function fingerprintPayload(payload: Record<string, unknown>): string {
  return sha(canonical(payload));
}

export function approvalFingerprint(buf: Buffer, kind = "bug-work-plan"): string | null {
  const p = approvalPayload(buf, kind);
  return p === null ? null : fingerprintPayload(p);
}

/* ---------------------------------------------------------------- verify */

export function verifyApproval(buf: Buffer, kind = "bug-work-plan"): Record<string, any> {
  const pkg = PACKAGES[kind];
  if (!pkg) return { ok: false, status: "invalid", kind, reasons: [{ code: "UNKNOWN_KIND", message: `no approval contract for kind "${kind}" (known: ${Object.keys(PACKAGES).join(", ")})` }] };
  const v = pkg.validate(buf);
  const fm = v.frontmatter ?? {};
  const recorded = { status: fm.status ?? null, approved_by: fm.approved_by ?? null, approved_fingerprint: fm.approved_fingerprint ?? null, approved_cycle: fm.approved_cycle ?? null };
  const cycle = fm[pkg.cycleField] ?? null;
  if (!v.ok) {
    return {
      ok: false,
      status: "invalid",
      kind,
      reasons: [{ code: "PLAN_INVALID", message: `the ${kind} is not structurally valid, so it cannot be approved: ${(v.errors ?? []).map((e) => e.code).join(", ")}` }],
      errors: v.errors ?? [],
      approval_fingerprint: null,
      cycle,
      recorded,
    };
  }
  const fingerprint = approvalFingerprint(buf, kind) as string;
  const base = { kind, approval_fingerprint: fingerprint, cycle, recorded };
  if (recorded.status !== "approved") {
    return { ok: false, status: "draft", reasons: [{ code: "NOT_APPROVED", message: `status is ${recorded.status ?? "unset"} — a human approves with \`approve --by <identity>\`` }], ...base };
  }

  // A hand-written or partial approval: never valid, whatever the content.
  const incomplete: Reason[] = [];
  if (!recorded.approved_by) incomplete.push({ code: "APPROVER_MISSING", message: "status is approved but approved_by is empty" });
  if (!recorded.approved_fingerprint) incomplete.push({ code: "APPROVAL_FINGERPRINT_MISSING", message: "status is approved but approved_fingerprint is empty" });
  if (recorded.approved_cycle === null) incomplete.push({ code: "APPROVAL_CYCLE_MISSING", message: "status is approved but approved_cycle is empty" });
  if (incomplete.length) return { ok: false, status: "invalid", reasons: incomplete, ...base };

  // A complete approval for other content, or for another cycle: stale until approved again.
  const stale: Reason[] = [];
  if (recorded.approved_fingerprint !== fingerprint) {
    stale.push({ code: "APPROVAL_FINGERPRINT_MISMATCH", message: `approved_fingerprint ${recorded.approved_fingerprint} does not match the current ${fingerprint} — the approved content, identity or cycle changed` });
  }
  if (recorded.approved_cycle !== cycle) {
    stale.push({ code: "APPROVAL_CYCLE_MISMATCH", message: `approved_cycle ${recorded.approved_cycle} is not the current ${pkg.cycleField} ${cycle} — each cycle needs its own approval` });
  }
  return stale.length ? { ok: false, status: "approval_stale", reasons: stale, ...base } : { ok: true, status: "approved", reasons: [], ...base };
}

/* --------------------------------------------------------------- approve */

/**
 * A plain identity that survives a YAML scalar unchanged: a letter or digit first, then
 * letters, digits, spaces, `. _ @ + -`, at most 100 characters. No `#` (a comment), no
 * `:`, no line break, and not a placeholder.
 */
const APPROVER = /^[A-Za-z0-9][A-Za-z0-9 ._@+-]{0,99}$/;
const PLACEHOLDERS = new Set(["null", "none", "n/a", "na", "tbd", "todo", "true", "false", "yes", "no"]);

/** Why `by` is not an explicit, plain human identity — or null when it is. Shared by every approval. */
export function plainIdentityProblem(by: string | undefined): { code: string; message: string } | null {
  if (by === undefined || by.trim() === "") return { code: "APPROVER_REQUIRED", message: "approval needs an explicit human identity (--by <identity>); the approver is never inferred" };
  if (by !== by.trim() || !APPROVER.test(by) || PLACEHOLDERS.has(by.toLowerCase())) {
    return { code: "APPROVER_INVALID", message: `approver ${JSON.stringify(by)} is not a plain identity (letters, digits, spaces, . _ @ + -; at most 100 characters)` };
  }
  return null;
}

function refuse(code: string, message: string, extra: Record<string, unknown> = {}): Record<string, any> {
  return { ok: false, status: "invalid", code, error: message, changed: false, ...extra };
}

/** Rebuild a document from its split parts the way the migration framework writes one. */
function assemble(split: { leading: Buffer; open: string; inner: string[]; close: string; body: Buffer; eol: string }, inner: string[]): Buffer {
  return Buffer.concat([split.leading, Buffer.from([split.open, ...inner, split.close].join(split.eol) + split.eol, "utf-8"), split.body]);
}

/**
 * Set frontmatter values in place, byte-faithfully: each key must appear exactly once, each
 * line keeps its comment, and the body and the text above the frontmatter are asserted
 * byte-identical. Pure — the caller writes the result. Shared by every approval writer.
 */
export function rewriteFrontmatterValues(buf: Buffer, values: Record<string, string>): { ok: true; buf: Buffer } | { ok: false; code: string; message: string } {
  const split = splitDocument(buf);
  if ("error" in split) return { ok: false, code: "FRONTMATTER_UNREWRITABLE", message: split.error };
  if (!assemble(split, split.inner).equals(buf)) {
    return { ok: false, code: "FRONTMATTER_UNREWRITABLE", message: "the frontmatter block cannot be rewritten byte-faithfully (mixed line endings?)" };
  }
  const seen: Record<string, number> = {};
  const inner = split.inner.map((raw) => {
    const m = /^([A-Za-z_][A-Za-z0-9_]*):(.*)$/.exec(raw);
    if (!m || !(m[1] in values)) return raw;
    seen[m[1]] = (seen[m[1]] ?? 0) + 1;
    const { comment } = splitValueAndComment(m[2]);
    return `${m[1]}: ${values[m[1]]}${comment ? ` ${comment}` : ""}`;
  });
  const wrong = Object.keys(values).filter((f) => seen[f] !== 1);
  if (wrong.length) return { ok: false, code: "FRONTMATTER_UNREWRITABLE", message: `each field must appear exactly once in the frontmatter: ${wrong.join(", ")}` };
  const out = assemble(split, inner);
  const outSplit = splitDocument(out);
  if ("error" in outSplit || !outSplit.body.equals(split.body) || !outSplit.leading.equals(split.leading)) {
    return { ok: false, code: "BODY_CHANGED", message: "body-preservation assertion failed" };
  }
  return { ok: true, buf: out };
}

export function approveWorkPackage(path: string, options: { by?: string; kind?: string }): Record<string, any> {
  const kind = options.kind ?? "bug-work-plan";
  const by = options.by;
  const who = plainIdentityProblem(by);
  if (who !== null) return refuse(who.code, who.message);
  if (!PACKAGES[kind]) return refuse("UNKNOWN_KIND", `no approval contract for kind "${kind}"`);
  if (!existsSync(path) || !statSync(path).isFile()) return refuse("UNREADABLE", `file not found: ${path}`);
  const buf = readFileSync(path);

  const now = verifyApproval(buf, kind);
  if (now.status === "invalid" && now.reasons.some((r: Reason) => r.code === "PLAN_INVALID")) {
    return refuse("PLAN_INVALID", now.reasons[0].message, { errors: now.errors });
  }
  const fingerprint = now.approval_fingerprint as string;
  const cycle = now.cycle as number;
  const body = (splitDocument(buf) as any).body as Buffer;
  const bodySha = createHash("sha256").update(body).digest("hex");
  const result = (changed: boolean, previous: Record<string, unknown> | null) => ({
    ok: true,
    status: "approved" as ApprovalStatus,
    kind,
    changed,
    approval_fingerprint: fingerprint,
    approved_by: by,
    approved_cycle: cycle,
    previous,
    body_sha256: { before: bodySha, after: bodySha },
  });

  // Idempotent: the same approver already approved exactly this content and cycle.
  if (now.status === "approved" && now.recorded.approved_by === by) return result(false, null);

  const values: Record<string, string> = { status: "approved", approved_by: by as string, approved_fingerprint: fingerprint, approved_cycle: String(cycle) };
  const rewritten = rewriteFrontmatterValues(buf, values);
  if (!rewritten.ok) return refuse(rewritten.code, `${rewritten.message} — nothing was written`);
  const out = rewritten.buf;
  if (verifyApproval(out, kind).status !== "approved") return refuse("APPROVAL_SELF_CHECK", "the rewritten document does not verify as approved — nothing was written");

  // Atomic and durable, as in the migration framework: temp sibling, fsync, rename.
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.work-approval.tmp`);
  try {
    writeFileSync(tmp, out);
    const fd = openSync(tmp, "r+");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best effort */
    }
    return refuse("WRITE_FAILED", `could not write ${path}: ${(err as Error).message} — nothing was written`);
  }
  return result(true, now.recorded.status === "approved" ? now.recorded : null);
}

/* --------------------------------------------------------------------- CLI */

function main(): void {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i !== -1 ? args[i + 1] : undefined;
  };
  const print = (o: unknown): never => {
    console.log(JSON.stringify(o, null, 2));
    process.exit(0);
  };
  const [cmd, path] = args;
  const kind = flag("kind") ?? "bug-work-plan";
  if (cmd !== "verify" && cmd !== "approve") print(refuse("UNKNOWN_COMMAND", "usage: work-approval.ts verify <path> | approve <path> --by <identity> [--kind bug-work-plan]"));
  if (!path || path.startsWith("--")) print(refuse("MISSING_ARGUMENT", `${cmd} needs <path>`));
  if (cmd === "approve") print({ path, ...approveWorkPackage(path, { by: flag("by"), kind }) });
  if (!existsSync(path) || !statSync(path).isFile()) print(refuse("UNREADABLE", `file not found: ${path}`));
  print({ path, ...verifyApproval(readFileSync(path), kind) });
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /work-approval\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) main();
