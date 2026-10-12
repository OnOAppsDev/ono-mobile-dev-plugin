/**
 * qa-release-gate.ts
 *
 * The QA gate of /prepare-mobile-release. It reads QA-owned readiness artifacts —
 * ono-plugin-qa's `readiness/<kind>/<id>.md`, specified by docs/qa-readiness-contract.md
 * (vendored verbatim) — and decides, deterministically, whether they cover this
 * release's contents with valid QA sign-off. It is the ONLY component in this plugin
 * that parses a readiness artifact.
 *
 * The Dev QA handoff is Dev → QA input; it is never QA sign-off, and nothing here reads it.
 *
 * It reads only the files it is given (`--readiness`, repeatable) — it never searches
 * sibling folders — and it never infers or repairs a missing field: an artifact that
 * does not match the contract is refused as malformed.
 *
 * Integrity: every artifact carries artifact_integrity, sha256 over its own rendered bytes
 * without that line. The gate recomputes it FIRST, before trusting any content; a mismatch
 * means the Markdown was edited after QA rendered it (QA_ARTIFACT_TAMPERED → No-Go).
 *
 * Freshness: every artifact carries the QA ledger freshness token it was rendered from.
 * The gate recomputes that token from the ledger of the QA repository the artifact lives
 * in (`<qa-repo>/readiness/<kind>/<id>.md` → `<qa-repo>/qa-ledger/`, nothing else), with
 * the contract's algorithm, re-verifying every record hash it reads. A different token
 * means the ledger changed after rendering (outdated → No-Go); a missing or corrupt
 * ledger cannot prove freshness (unverifiable → No-Go).
 *
 * It ALWAYS exits 0 and ALWAYS prints one JSON object; callers branch on `status`:
 *   pass                  every release item is covered by READY, validly signed readiness
 *   pass_with_exceptions  the same, but at least one covering artifact is
 *                         READY_WITH_EXCEPTIONS — its exceptions go to the checklist and the
 *                         final Go remains a human decision
 *   no_go                 any blocker (missing, malformed, NOT_READY, unsigned, stale,
 *                         uncovered item, build mismatch, …) — REL-VERDICT-1
 *
 * Usage:
 *   node --no-warnings scripts/qa-release-gate.ts --readiness <path>… [--feature <dev-feature-id>]…
 *        [--bug <qa-bug-id> | --bug qa=<qa-bug-id> | --bug external=<tracker-key> |
 *         --bug qa=<qa-bug-id>,external=<tracker-key>]… [--release-build <surface>=<qa-build-id>]…
 */

import { readFileSync, readdirSync, existsSync, realpathSync } from "fs";
import { createHash } from "crypto";
import { basename, dirname, join } from "path";

export const SUPPORTED_SCHEMA = "2";
const VERDICTS = ["READY", "READY_WITH_EXCEPTIONS", "NOT_READY"];
const SIGNOFF_STATUSES = ["valid", "stale", "superseded", "none"];
const KINDS = ["feature", "bug", "release"];
const MEMBER_KINDS = ["feature", "bug"];
const FRONTMATTER_KEYS = ["qa_readiness_schema", "scope", "scope_kind", "dev_feature", "qa_bug_id", "external_ref", "candidate_builds", "verdict", "blocker_count", "exception_count", "fingerprint", "freshness_token", "generated_at", "signed_off_by", "signed_off_date", "signoff_fingerprint", "signoff_status"];
const REQUIRED_SECTIONS = ["Exceptions", "Known Issues", "Tested Builds", "QA Notes", "Release Notes Input"];
const FINGERPRINT_RE = /^sha256:[0-9a-f]{64}$/;
const SCOPE_RE = /^(feature|bug|release):([A-Za-z0-9][A-Za-z0-9._-]*)$/;
const PLAN_PATH_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const LIMITATIONS = [
  "Identity is exact and case-sensitive: a bug matches by its QA bug id, its external_ref, or both (both must then name the same bug); nothing is matched fuzzily.",
  "Integrity proves the artifact is byte-for-byte what the QA helper rendered and freshness proves the QA ledger is unchanged since; the verdict itself is QA's derivation and is not recomputed here, and who rendered it is proven by the QA repository's history, not by a key.",
];

export interface Member {
  scope: string;
  kind: string;
  dev_feature: string | null;
  qa_bug_id: string | null;
  external_ref: string | null;
  verdict: string;
  fingerprint: string;
}
export interface Freshness {
  status: "fresh" | "outdated" | "unverifiable";
  recorded: string;
  computed: string | null;
  problem: string | null;
}
export interface Artifact {
  ok: true;
  source: string;
  scope: string;
  kind: string;
  id: string;
  dev_feature: string | null;
  qa_bug_id: string | null;
  external_ref: string | null;
  members: Member[];
  freshness_token: string;
  freshness: Freshness;
  candidate_builds: Array<{ surface: string; build_id: string | null; pinned: boolean }>;
  verdict: string;
  blocker_count: number;
  exception_count: number;
  fingerprint: string;
  generated_at: string | null;
  signed_off_by: string | null;
  signed_off_date: string | null;
  signoff_fingerprint: string | null;
  signoff_status: string;
  tested_builds: string[];
  known_issues: Array<{ item: string; reason: string; approved_by: string }>;
  exceptions: Array<{ id: string; item: string; kind: string; reason: string; approved_by: string; date: string | null; build: string | null; applied: boolean }>;
  qa_notes: string | null;
  release_notes_input: Record<string, string>;
}
export interface Failed {
  ok: false;
  source: string;
  code: string;
  problems: string[];
}

/* ── ledger freshness token (docs/qa-readiness-contract.md, "Freshness token") ── */
const sha = (s: string | Buffer): string => `sha256:${createHash("sha256").update(s).digest("hex")}`;

/** The ledger's canonical JSON: object keys sorted recursively, no whitespace. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

class LedgerUnverifiable extends Error {}

// Reads ONLY <qaRoot>/qa-ledger/ and the plan files the ledger names inside <qaRoot>.
// Every record's hash is re-verified; anything that does not verify is unverifiable.
function openLedger(qaRoot: string) {
  const ledger = join(qaRoot, "qa-ledger");
  if (!existsSync(join(ledger, "ledger.json"))) throw new LedgerUnverifiable(`no QA ledger at ${ledger}`);
  const verified = (rec: any, where: string): any => {
    const { hash, ...rest } = rec ?? {};
    if (typeof hash !== "string" || hash !== sha(canonical(rest))) throw new LedgerUnverifiable(`${where}: record hash does not verify — the ledger was edited outside the QA helper`); // invariant:freshness-integrity
    return rec;
  };
  const parse = (text: string, where: string): any => {
    try {
      return JSON.parse(text);
    } catch {
      throw new LedgerUnverifiable(`${where} is not valid JSON`);
    }
  };
  const lines = (f: string): any[] => readFileSync(f, "utf-8").split("\n").filter(Boolean).map((l, i) => verified(parse(l, `${f}:${i + 1}`), `${f}:${i + 1}`));
  const list = (...d: string[]): string[] => {
    const dir = join(ledger, ...d);
    return existsSync(dir) ? readdirSync(dir).sort() : [];
  };
  const streams = new Map<string, any[] | null>();
  const stream = (ref: string): any[] | null => {
    const m = SCOPE_RE.exec(ref);
    if (!m) throw new LedgerUnverifiable(`the ledger names an invalid scope ${JSON.stringify(ref)}`);
    if (!streams.has(ref)) {
      const f = join(ledger, "scopes", m[1], `${m[2]}.jsonl`);
      streams.set(ref, existsSync(f) ? lines(f) : null);
    }
    return streams.get(ref)!;
  };
  const runs = list("runs").filter((n) => n.endsWith(".jsonl")).map((n) => ({ id: n.slice(0, -6), records: lines(join(ledger, "runs", n)) }));
  const builds = new Map<string, any>(list("builds").filter((n) => n.endsWith(".json")).map((n) => [n.slice(0, -5), verified(parse(readFileSync(join(ledger, "builds", n), "utf-8"), n), `builds/${n}`)]));
  const bugRefs = list("scopes", "bug").filter((n) => n.endsWith(".jsonl")).map((n) => `bug:${n.slice(0, -6)}`);
  const plan = (p: string): string => {
    if (typeof p !== "string" || !PLAN_PATH_RE.test(p) || p.split("/").includes("..")) throw new LedgerUnverifiable(`the ledger names a plan outside the QA repository: ${JSON.stringify(p)}`);
    const f = join(qaRoot, p);
    return existsSync(f) ? sha(readFileSync(f)) : "missing";
  };
  return { stream, runs, builds, bugRefs, plan };
}

const addsOf = (records: any[], field: string): any[] => records.filter((r) => r.kind === "context.add" && r.field === field).map((r) => r.value);
const ownHashes = (records: any[]): string[] => records.filter((r) => r.field !== "signoffs").map((r) => r.hash); // invariant:freshness-excludes-signoffs

function scopeToken(db: ReturnType<typeof openLedger>, ref: string): string {
  const own = db.stream(ref);
  if (!own) return sha(canonical({ scope: ref, missing: true }));
  if (ref.startsWith("release:")) {
    const members = [...new Set(addsOf(own, "members"))].sort();
    return sha(canonical({ scope: ref, stream: ownHashes(own), members: members.map((m) => [m, scopeToken(db, m)]) })); // invariant:freshness-release-members
  }
  const bugs = new Set<string>(ref.startsWith("bug:") ? [ref] : []);
  for (const b of db.bugRefs) {
    const recs = db.stream(b) ?? [];
    if (recs.some((r) => (r.kind === "bug.reported" && (r.related_scopes ?? []).includes(ref)) || (r.field === "related_scopes" && r.value === ref))) bugs.add(b); // invariant:freshness-bugs
  }
  const watched = new Set([ref, ...bugs]);
  const header = (run: { records: any[] }): any => run.records[0] ?? {};
  const direct = db.runs.filter((run) => watched.has(header(run).scope) || bugs.has(header(run).bug_ref)); // invariant:freshness-runs
  const builds = new Set<string>(direct.map((run) => header(run).build_id));
  for (const [id, b] of db.builds) if ((b.related_scopes ?? []).includes(ref) || (b.fixes_claimed ?? []).some((x: string) => bugs.has(x))) builds.add(id); // invariant:freshness-builds
  const smoke = db.runs.filter((run) => header(run).execution_type === "smoke" && builds.has(header(run).build_id));
  const runs = [...new Map([...direct, ...smoke].map((run) => [run.id, run])).values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  const plans = new Set<string>(addsOf(own, "plans"));
  for (const d of addsOf(own, "regression_decisions")) for (const k of d.cases ?? []) if (!k.includes("#")) plans.add(`${k.slice(0, k.lastIndexOf("/"))}/test-plan.md`);
  return sha(
    canonical({
      scope: ref,
      streams: [...watched].sort().map((s) => [s, ownHashes(db.stream(s) ?? [])]),
      runs: runs.map((run) => [run.id, run.records.map((r) => r.hash)]),
      builds: [...builds].sort().map((id) => [id, db.builds.get(id)?.hash ?? "missing"]),
      plans: [...plans].sort().map((p) => [p, db.plan(p)]), // invariant:freshness-plans
    }),
  );
}

/** Recomputes the freshness token of `scope` from `<qaRoot>/qa-ledger/`. */
export function freshnessToken(qaRoot: string, scope: string): string {
  return scopeToken(openLedger(qaRoot), scope);
}

export function verifyFreshness(qaRoot: string | null, scope: string, recorded: string): Freshness {
  if (!qaRoot) return { status: "unverifiable", recorded, computed: null, problem: "the artifact is not inside a QA repository (<qa-repo>/readiness/<kind>/<id>.md), so its ledger cannot be read" };
  try {
    const computed = freshnessToken(qaRoot, scope);
    return { status: computed === recorded ? "fresh" : "outdated", recorded, computed, problem: null }; // invariant:freshness-compare
  } catch (e) {
    if (e instanceof LedgerUnverifiable) return { status: "unverifiable", recorded, computed: null, problem: e.message };
    throw e;
  }
}

/**
 * Contract "Artifact integrity": LF-normalize, require exactly one frontmatter line
 * `artifact_integrity: sha256:<64 hex>`, remove it, sha256 the remaining bytes.
 */
export function artifactIntegrity(text: string): { stored: string | null; computed: string | null; problem: string | null } {
  const t = text.replace(/\r\n/g, "\n");
  const end = t.indexOf("\n---\n", 4);
  if (!t.startsWith("---\n") || end < 0) return { stored: null, computed: null, problem: "no delimited frontmatter (the artifact must open with --- and close it with ---)" };
  const lines = t.slice(4, end).split("\n");
  const at = lines.flatMap((l, i) => (l.startsWith("artifact_integrity:") ? [i] : []));
  if (at.length !== 1) return { stored: null, computed: null, problem: at.length ? "artifact_integrity appears more than once" : "artifact_integrity is missing — the artifact cannot prove it is unedited (ask QA to re-render with /qa-readiness)" };
  const stored = /^artifact_integrity: (sha256:[0-9a-f]{64})$/.exec(lines[at[0]])?.[1] ?? null;
  if (!stored) return { stored: null, computed: null, problem: "artifact_integrity is not sha256:<64 hex>" };
  const rest = [...lines.slice(0, at[0]), ...lines.slice(at[0] + 1)];
  const computed = sha(`---\n${rest.join("\n")}${t.slice(end)}`); // invariant:integrity-excludes-own-line
  return { stored, computed, problem: null };
}

/** `<qa-repo>/readiness/<kind>/<id>.md` → `<qa-repo>`, else null. Never looks anywhere else. */
export function qaRootOf(artifactPath: string, scope: string): string | null {
  const m = SCOPE_RE.exec(scope);
  const kindDir = dirname(artifactPath);
  if (!m || basename(artifactPath) !== `${m[2]}.md` || basename(kindDir) !== m[1] || basename(dirname(kindDir)) !== "readiness") return null;
  return dirname(dirname(kindDir));
}

const nul = (v: string | undefined): string | null => (v === undefined || v === "null" || v === "—" || v === "" ? null : v);

function tableRows(section: string): string[][] {
  const lines = section.split("\n").filter((l) => l.trim().startsWith("|"));
  return lines
    .slice(2)
    .map((l) => l.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|")));
}

/**
 * Parses one readiness artifact strictly against the contract. Never repairs anything.
 * `qaRoot` is the QA repository whose ledger proves the artifact fresh (readQaReadiness
 * derives it from the artifact's own path); without it the artifact is unverifiable.
 */
export function parseQaReadiness(text: string, source: string, opts: { qaRoot?: string | null } = {}): Artifact | Failed {
  const problems: string[] = [];
  const bad = (): Failed => ({ ok: false, source, code: "QA_READINESS_MALFORMED", problems });
  // Integrity first: nothing in an artifact is read until its bytes are proven unedited.
  const integrity = artifactIntegrity(text);
  if (integrity.problem) {
    problems.push(integrity.problem);
    return bad();
  }
  if (integrity.computed !== integrity.stored) return { ok: false, source, code: "QA_ARTIFACT_TAMPERED", problems: [`artifact_integrity ${integrity.stored} does not match its content (${integrity.computed}) — the artifact was edited after QA rendered it`] }; // invariant:integrity-compare
  text = text.replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) {
    problems.push("no delimited frontmatter (the artifact must open with ---)");
    return bad();
  }
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) {
    problems.push("frontmatter is not closed by ---");
    return bad();
  }
  const fmLines = text.slice(4, end).split("\n");
  const body = text.slice(end + 5);
  const fm: Record<string, string> = {};
  const candidates: Artifact["candidate_builds"] = [];
  let inCandidates = false;
  for (const line of fmLines) {
    const cand = /^ {2}- ([A-Za-z0-9][A-Za-z0-9._-]*): (\S+)( # pinned)?$/.exec(line);
    if (inCandidates && cand) {
      candidates.push({ surface: cand[1], build_id: nul(cand[2]), pinned: Boolean(cand[3]) });
      continue;
    }
    if (inCandidates && line === "  []") continue;
    const kv = /^([a-z_]+): ?(.*)$/.exec(line);
    if (!kv) {
      problems.push(`unrecognized frontmatter line: ${line}`);
      continue;
    }
    inCandidates = kv[1] === "candidate_builds";
    fm[kv[1]] = kv[2];
  }
  if (fm.qa_readiness_schema !== undefined && fm.qa_readiness_schema !== SUPPORTED_SCHEMA) {
    problems.push(`qa_readiness_schema ${fm.qa_readiness_schema} is not supported (this plugin reads ${SUPPORTED_SCHEMA}${fm.qa_readiness_schema === "1" ? "; schema 1 carries no freshness token — ask QA to re-render with /qa-readiness" : ""})`);
    return bad();
  }
  for (const k of FRONTMATTER_KEYS) if (!(k in fm)) problems.push(`frontmatter is missing ${k}`);
  if (fm.scope_kind === "release" && !("member_count" in fm)) problems.push("frontmatter is missing member_count");
  if (problems.length) return bad();

  const scope = SCOPE_RE.exec(fm.scope);
  if (!scope) problems.push(`scope "${fm.scope}" is not <feature|bug|release>:<id>`);
  else if (scope[1] !== fm.scope_kind) problems.push(`scope ${fm.scope} does not match scope_kind ${fm.scope_kind}`);
  if (!KINDS.includes(fm.scope_kind)) problems.push(`scope_kind "${fm.scope_kind}" is not one of ${KINDS.join(", ")}`);
  const qaBugId = nul(fm.qa_bug_id);
  const externalRef = nul(fm.external_ref);
  if (fm.scope_kind === "bug" && scope && qaBugId !== scope[2]) problems.push(`qa_bug_id ${fm.qa_bug_id} does not match ${fm.scope}`);
  if (fm.scope_kind !== "bug" && (qaBugId !== null || externalRef !== null)) problems.push("qa_bug_id and external_ref are null outside a bug scope");
  if (fm.scope_kind === "release" && nul(fm.dev_feature) !== null) problems.push("a release scope has no dev_feature");
  if (!FINGERPRINT_RE.test(fm.freshness_token)) problems.push("freshness_token is not sha256:<64 hex>");
  if (!VERDICTS.includes(fm.verdict)) problems.push(`verdict "${fm.verdict}" is not one of ${VERDICTS.join(", ")}`);
  const blockers = Number(fm.blocker_count);
  const exceptionsCount = Number(fm.exception_count);
  if (!Number.isInteger(blockers) || blockers < 0 || !Number.isInteger(exceptionsCount) || exceptionsCount < 0) problems.push("blocker_count and exception_count must be non-negative integers");
  if (fm.verdict === "READY" && (blockers !== 0 || exceptionsCount !== 0)) problems.push("READY requires blocker_count 0 and exception_count 0");
  if (fm.verdict === "READY_WITH_EXCEPTIONS" && (blockers !== 0 || exceptionsCount < 1)) problems.push("READY_WITH_EXCEPTIONS requires blocker_count 0 and at least one exception");
  if (fm.verdict === "NOT_READY" && blockers < 1) problems.push("NOT_READY requires at least one blocker");
  if (!FINGERPRINT_RE.test(fm.fingerprint)) problems.push("fingerprint is not sha256:<64 hex>");
  if (!SIGNOFF_STATUSES.includes(fm.signoff_status)) problems.push(`signoff_status "${fm.signoff_status}" is not one of ${SIGNOFF_STATUSES.join(", ")}`);
  if (fm.signoff_status === "valid" && (!nul(fm.signed_off_by) || !nul(fm.signed_off_date) || !FINGERPRINT_RE.test(fm.signoff_fingerprint))) problems.push("a valid sign-off needs signed_off_by, signed_off_date and signoff_fingerprint");

  // Level-2 sections of the body.
  const sections = new Map<string, string>();
  let current: string | null = null;
  for (const line of body.split("\n")) {
    const h = /^## (.+)$/.exec(line);
    if (h) {
      current = h[1];
      sections.set(current, "");
    } else if (current) sections.set(current, `${sections.get(current)}${line}\n`);
  }
  for (const s of REQUIRED_SECTIONS) if (!sections.has(s)) problems.push(`section "## ${s}" is missing`);
  if (fm.scope_kind === "release" && !sections.has("Members")) problems.push('section "## Members" is missing');
  if (problems.length) return bad();

  // A release artifact's members: its identities for coverage, parsed as strictly.
  const members: Member[] = [];
  if (fm.scope_kind === "release") {
    const rows = sections.get("Members")!.trim() === "None." ? [] : tableRows(sections.get("Members")!);
    for (const r of rows) {
      const [mScope, mKind, devFeature, mQa, mExt, mVerdict, mFp] = r;
      const ms = SCOPE_RE.exec(mScope ?? "");
      if (r.length !== 7 || !ms || ms[1] !== mKind || !MEMBER_KINDS.includes(mKind)) {
        problems.push(`Members row "${r.join(" | ")}" is not <feature|bug scope> | kind | Dev feature | QA bug id | External ref | Verdict | Fingerprint`);
        continue;
      }
      const m: Member = { scope: mScope, kind: mKind, dev_feature: nul(devFeature), qa_bug_id: nul(mQa), external_ref: nul(mExt), verdict: mVerdict, fingerprint: mFp };
      if (mKind === "bug" && m.qa_bug_id !== ms[2]) problems.push(`member ${mScope} has QA bug id ${mQa}`);
      if (mKind !== "bug" && (m.qa_bug_id !== null || m.external_ref !== null)) problems.push(`member ${mScope} is not a bug but carries a bug identity`);
      if (!VERDICTS.includes(mVerdict) || !FINGERPRINT_RE.test(mFp)) problems.push(`member ${mScope} has an invalid verdict or fingerprint`);
      if (members.some((x) => x.scope === mScope)) problems.push(`member ${mScope} is listed twice`);
      members.push(m);
    }
    if (String(members.length) !== fm.member_count) problems.push(`member_count ${fm.member_count} does not match ${rows.length} Members rows`);
    if (problems.length) return bad();
  }

  const rni: Record<string, string> = {};
  for (const line of sections.get("Release Notes Input")!.split("\n")) {
    const m = /^- ([^:]+): (.*)$/.exec(line);
    if (m) rni[m[1]] = m[2];
  }
  for (const k of ["Scope", "Bug fixes verified", "Builds tested", "Surfaces tested", "Known issues", "Exceptions", "QA verdict", ...(fm.scope_kind === "release" ? ["Features tested"] : [])]) if (!(k in rni)) problems.push(`Release Notes Input is missing "${k}"`);
  if (rni["QA verdict"] !== undefined && rni["QA verdict"] !== fm.verdict) problems.push(`Release Notes Input says ${rni["QA verdict"]}, frontmatter says ${fm.verdict}`);
  const scopeLine = /^(\S+)(?: \(Dev feature ([^)]+)\))?$/.exec(rni.Scope ?? "");
  if (!scopeLine || scopeLine[1] !== fm.scope) problems.push(`Release Notes Input scope "${rni.Scope}" does not match ${fm.scope}`);
  else if ((scopeLine[2] ?? null) !== nul(fm.dev_feature)) problems.push(`Release Notes Input Dev feature "${scopeLine[2] ?? "none"}" does not match dev_feature ${fm.dev_feature}`);

  const exRows = sections.get("Exceptions")!.trim() === "None." ? [] : tableRows(sections.get("Exceptions")!);
  if (exRows.some((r) => r.length !== 8)) problems.push("Exceptions table rows must have 8 columns");
  const exceptions = exRows.filter((r) => r.length === 8).map(([id, item, kind, reason, approved_by, date, build, applied]) => ({ id, item, kind, reason, approved_by, date: nul(date), build: nul(build), applied: applied === "yes" }));
  if (exceptions.filter((x) => x.applied).length !== exceptionsCount) problems.push(`exception_count ${exceptionsCount} does not match ${exceptions.filter((x) => x.applied).length} applied exceptions in the table`);
  const kiRows = sections.get("Known Issues")!.trim() === "None." ? [] : tableRows(sections.get("Known Issues")!);
  if (kiRows.some((r) => r.length !== 3)) problems.push("Known Issues table rows must have 3 columns");
  if (problems.length) return bad();

  const tested = sections.get("Tested Builds")!.split("\n").map((l) => /^- (\S+)$/.exec(l)?.[1]).filter((x): x is string => Boolean(x));
  const notes = sections.get("QA Notes")!.trim();
  return {
    ok: true,
    source,
    scope: fm.scope,
    kind: fm.scope_kind,
    id: scope![2],
    dev_feature: nul(fm.dev_feature),
    qa_bug_id: qaBugId,
    external_ref: externalRef,
    members,
    freshness_token: fm.freshness_token,
    freshness: verifyFreshness(opts.qaRoot ?? null, fm.scope, fm.freshness_token),
    candidate_builds: candidates,
    verdict: fm.verdict,
    blocker_count: blockers,
    exception_count: exceptionsCount,
    fingerprint: fm.fingerprint,
    generated_at: nul(fm.generated_at),
    signed_off_by: nul(fm.signed_off_by),
    signed_off_date: nul(fm.signed_off_date),
    signoff_fingerprint: nul(fm.signoff_fingerprint),
    signoff_status: fm.signoff_status,
    tested_builds: tested,
    known_issues: kiRows.map(([item, reason, approved_by]) => ({ item, reason, approved_by })),
    exceptions,
    qa_notes: notes === "—" ? null : notes,
    release_notes_input: rni,
  };
}

export function readQaReadiness(path: string): Artifact | Failed {
  if (!existsSync(path)) return { ok: false, source: path, code: "QA_READINESS_MISSING", problems: [`${path} does not exist`] };
  const real = realpathSync(path);
  const text = readFileSync(real, "utf-8");
  const scope = /^scope: (\S+)$/m.exec(text)?.[1] ?? "";
  return parseQaReadiness(text, path, { qaRoot: qaRootOf(real, scope) });
}

/** A release's bug item: a QA bug id, an external tracker ref, or both — never neither. */
export interface BugItem {
  qa_bug_id: string | null;
  external_ref: string | null;
}
/** `BUG-27` (QA id) · `qa=BUG-27` · `external=JIRA-4411` · `qa=BUG-27,external=JIRA-4411`. Null when invalid. */
export function parseBugItem(raw: string): BugItem | null {
  if (!raw.includes("=")) return raw.trim() && !raw.includes(",") ? { qa_bug_id: raw.trim(), external_ref: null } : null;
  const out: BugItem = { qa_bug_id: null, external_ref: null };
  for (const part of raw.split(",")) {
    const i = part.indexOf("=");
    const [k, v] = [part.slice(0, i).trim(), part.slice(i + 1).trim()];
    const key = k === "qa" ? "qa_bug_id" : k === "external" ? "external_ref" : null;
    if (i < 0 || !key || !v || out[key] !== null) return null;
    out[key] = v;
  }
  return out;
}

export interface GateInput {
  artifacts: Array<Artifact | Failed>;
  features: string[];
  bugs: Array<string | BugItem>;
  releaseBuilds: Record<string, string>;
}

// One coverable identity: a feature/bug artifact itself, or one member row of a release artifact.
interface Unit {
  a: Artifact;
  kind: string;
  scope: string;
  id: string;
  dev_feature: string | null;
  qa_bug_id: string | null;
  external_ref: string | null;
}
const unitsOf = (a: Artifact): Unit[] =>
  a.kind === "release" ? a.members.map((m) => ({ a, kind: m.kind, scope: m.scope, id: m.scope.slice(m.kind.length + 1), dev_feature: m.dev_feature, qa_bug_id: m.qa_bug_id, external_ref: m.external_ref })) : [{ a, kind: a.kind, scope: a.scope, id: a.id, dev_feature: a.dev_feature, qa_bug_id: a.qa_bug_id, external_ref: a.external_ref }]; // invariant:release-units

/** The QA gate. Pure: the same inputs always give the same result. */
export function evaluateQaGate(input: GateInput): Record<string, any> {
  const blockers: Array<{ code: string; message: string; item?: string; source?: string }> = [];
  const warnings: Array<{ code: string; message: string }> = [];
  const block = (code: string, message: string, extra: { item?: string; source?: string } = {}) => blockers.push({ code, message, ...extra });
  const artifacts = input.artifacts;
  const failed = artifacts.filter((a): a is Failed => !a.ok);
  const valid = artifacts.filter((a): a is Artifact => a.ok);

  if (!artifacts.length) block("QA_READINESS_MISSING", "no QA readiness artifact was supplied — ask QA for readiness/<kind>/<id>.md of every release item");
  if (!input.features.length && !input.bugs.length) block("RELEASE_CONTENTS_REQUIRED", "the release contents (features and bug fixes) were not given — they decide what QA readiness must cover");
  for (const f of failed.filter((x) => x.code === "QA_READINESS_MISSING")) block("QA_READINESS_MISSING", f.problems.join("; "), { source: f.source });
  for (const f of failed.filter((x) => x.code === "QA_ARTIFACT_TAMPERED")) block("QA_ARTIFACT_TAMPERED", `${f.source}: ${f.problems.join("; ")} — never trusted; QA must re-render it`, { source: f.source }); // invariant:tampered-blocks
  for (const f of failed.filter((x) => x.code !== "QA_READINESS_MISSING" && x.code !== "QA_ARTIFACT_TAMPERED")) block("QA_READINESS_MALFORMED", `${f.source}: ${f.problems.join("; ")}`, { source: f.source }); // invariant:malformed-blocks

  // Coverage: exact identity only. A feature matches its canonical Dev identity; only a
  // unit with no Dev identity may match by its exact QA scope id. A bug matches by its QA
  // id, its external_ref, or both — and when both are given they must name the same bug.
  const same = (x: string | null, y: string) => x === y;
  const units = valid.flatMap(unitsOf);
  const coverage = { features: [] as any[], bugs: [] as any[] };
  const used = new Set<Artifact>();
  const hitUnits = new Set<Unit>();
  const resolve = (kind: "feature" | "bug", item: string, id: string, hits: Unit[], by: string | null) => {
    const scopes = new Set(hits.map((h) => h.scope));
    if (scopes.size > 1) block("QA_AMBIGUOUS_MATCH", `${item} matches ${[...scopes].sort().join(", ")} — QA must disambiguate (give both ids, or correct the external_ref)`, { item }); // invariant:ambiguous
    else if (hits.length > 1) block("QA_DUPLICATE_COVERAGE", `${item} is claimed by ${hits.map((h) => h.a.source).join(", ")} — supply exactly one`, { item });
    const hit = hits.length === 1 ? hits[0] : null;
    if (hit) {
      used.add(hit.a);
      hitUnits.add(hit);
    }
    (kind === "feature" ? coverage.features : coverage.bugs).push({ id, item, covered_by: hit?.a.source ?? null, matched_by: hit ? by : null, scope: hit?.scope ?? null, via_release: hit?.a.kind === "release" });
  };
  for (const f of input.features) {
    const hits = units.filter((u) => u.kind === "feature" && (u.dev_feature !== null ? same(u.dev_feature, f) : same(u.id, f)));
    const item = `feature:${f}`;
    if (!hits.length) block("QA_NOT_COVERED", `${item} is in the release but no supplied QA readiness covers it`, { item }); // invariant:coverage
    resolve("feature", item, f, hits, hits.length && hits[0].dev_feature !== null ? "dev_feature" : "qa_scope_id");
  }
  for (const raw of input.bugs) {
    const b = typeof raw === "string" ? parseBugItem(raw) : raw;
    if (!b || (b.qa_bug_id === null && b.external_ref === null)) {
      block("RELEASE_ITEM_INVALID", `bug item ${JSON.stringify(raw)} names neither a QA bug id nor an external ref — use BUG-27, qa=BUG-27, external=JIRA-4411 or qa=BUG-27,external=JIRA-4411`); // invariant:bug-needs-an-id
      continue;
    }
    const bugUnits = units.filter((u) => u.kind === "bug");
    const byQa = b.qa_bug_id !== null ? bugUnits.filter((u) => same(u.qa_bug_id, b.qa_bug_id!)) : null;
    const byExt = b.external_ref !== null ? bugUnits.filter((u) => same(u.external_ref, b.external_ref!)) : null;
    const hits = byQa && byExt ? byQa.filter((u) => byExt.includes(u)) : (byQa ?? byExt)!; // invariant:bug-both-ids
    const item = byQa && byExt ? `bug:${b.qa_bug_id} (${b.external_ref})` : byQa ? `bug:${b.qa_bug_id}` : `bug:external=${b.external_ref}`;
    if (!hits.length && byQa && byExt && (byQa.length || byExt.length)) {
      const found = [...byQa.map((u) => `${u.scope} has external_ref ${u.external_ref ?? "none"}`), ...byExt.filter((u) => !byQa.includes(u)).map((u) => `${b.external_ref} is ${u.scope}`)];
      block("QA_BUG_IDENTITY_MISMATCH", `${item}: the QA id and the external ref do not identify the same bug (${found.join("; ")})`, { item }); // invariant:identity-mismatch
    } else if (!hits.length) block("QA_NOT_COVERED", `${item} is in the release but no supplied QA readiness covers it`, { item });
    resolve("bug", item, b.qa_bug_id ?? b.external_ref!, hits, byQa && byExt ? "qa_bug_id+external_ref" : byQa ? "qa_bug_id" : "external_ref");
  }

  // A release artifact states the release's contents: its members must be exactly the items.
  const releases = [...used].filter((a) => a.kind === "release");
  if (releases.length > 1) block("QA_RELEASE_MEMBERS_MISMATCH", `more than one release readiness artifact is used (${releases.map((a) => a.source).join(", ")}) — supply the one for this release`);
  for (const r of releases) {
    for (const u of unitsOf(r)) if (![...hitUnits].some((h) => h.a === r && h.scope === u.scope)) block("QA_RELEASE_MEMBERS_MISMATCH", `${r.scope} includes ${u.scope}, which is not in this release's contents`, { source: r.source }); // invariant:release-members-exact
    for (const h of hitUnits) if (h.a.kind !== "release") block("QA_RELEASE_MEMBERS_MISMATCH", `${h.scope} is covered by ${h.a.source}, but ${r.scope} does not list it as a member`, { source: h.a.source });
  }

  // Every covering artifact: a verdict that allows release, and a valid, current sign-off.
  for (const a of used) {
    if (a.verdict === "NOT_READY") block("QA_NOT_READY", `${a.scope} is NOT_READY (${a.blocker_count} blocker(s)) — ${a.source}`, { source: a.source }); // invariant:not-ready
    if (a.signoff_status === "none") block("QA_UNSIGNED", `${a.scope} has no QA sign-off — ${a.source}`, { source: a.source });
    else if (a.signoff_status !== "valid" || a.signoff_fingerprint !== a.fingerprint) block("QA_SIGNOFF_STALE", `${a.scope}'s sign-off is ${a.signoff_status === "valid" ? "for another fingerprint" : a.signoff_status} — QA must re-sign the current readiness`, { source: a.source });
    if (a.freshness.status === "outdated") block("QA_READINESS_OUTDATED", `${a.source} was rendered from an older QA ledger (${a.scope}: recorded ${a.freshness.recorded}, ledger now ${a.freshness.computed}) — QA must re-render and re-sign (/qa-readiness, /qa-signoff)`, { source: a.source }); // invariant:outdated-blocks
    else if (a.freshness.status === "unverifiable") block("QA_FRESHNESS_UNVERIFIABLE", `${a.source}: freshness cannot be proven — ${a.freshness.problem}`, { source: a.source });
  }
  for (const a of valid) if (!used.has(a)) warnings.push({ code: "QA_ARTIFACT_UNUSED", message: `${a.source} (${a.scope}) covers no item of this release` });

  // Build consistency: QA evidence for one build never proves another.
  const details: any[] = [];
  const releaseSurfaces = Object.keys(input.releaseBuilds);
  for (const a of used) {
    for (const c of a.candidate_builds) {
      const rel = input.releaseBuilds[c.surface];
      if (rel === undefined) continue;
      const ok = rel === c.build_id;
      details.push({ scope: a.scope, surface: c.surface, qa_candidate: c.build_id, release_build: rel, match: ok });
      if (!ok) block("QA_BUILD_MISMATCH", `${a.scope} was QA'd on ${c.build_id ?? "(no build)"} for ${c.surface}, but the release ships ${rel}`, { source: a.source });
    }
  }
  let buildStatus = "not_applicable";
  if (!releaseSurfaces.length) {
    buildStatus = used.size ? "unverified" : "not_applicable";
    if (used.size) warnings.push({ code: "QA_BUILD_UNVERIFIED", message: "the release build per surface was not given, so QA's candidate builds could not be compared — confirm them by hand (REL-VERDICT-1)" });
  } else buildStatus = details.some((d) => !d.match) ? "mismatch" : details.length ? "match" : "unverified";
  for (const s of releaseSurfaces) if (!details.some((d) => d.surface === s) && used.size) warnings.push({ code: "QA_BUILD_SURFACE_UNCOVERED", message: `no covering QA readiness has a candidate build on ${s}` });

  const usedList = [...used].sort((x, y) => (x.source < y.source ? -1 : 1));
  const exceptions = usedList.flatMap((a) => a.exceptions.filter((x) => x.applied).map((x) => ({ ...x, scope: a.scope, source: a.source })));
  const knownIssues = usedList.flatMap((a) => a.known_issues.map((k) => ({ ...k, scope: a.scope, source: a.source })));
  if (usedList.some((a) => a.verdict === "READY_WITH_EXCEPTIONS")) warnings.push({ code: "QA_EXCEPTIONS_PRESENT", message: `QA signed off with ${exceptions.length} exception(s) — each is listed in the checklist; shipping with them is a human decision` });

  // Release Notes Input: QA's evidence, filtered to what this release actually contains.
  const releaseBugs = new Set([...hitUnits].filter((u) => u.kind === "bug").map((u) => u.scope));
  const ignored: Array<{ text: string; reason: string }> = [];
  const fixes: Array<{ bug: string; fixed_in: string | null; source: string }> = [];
  for (const a of usedList) {
    const raw = a.release_notes_input["Bug fixes verified"] ?? "none";
    if (raw === "none") continue;
    for (const part of raw.split(/,\s*/)) {
      const m = /^(bug:\S+) \(fixed in ([^)]+)\)$/.exec(part);
      if (m && releaseBugs.has(m[1])) fixes.push({ bug: m[1], fixed_in: m[2], source: a.source });
      else ignored.push({ text: part, reason: m ? "not in this release's contents" : "not in the contract's format" });
    }
  }
  if (ignored.length) warnings.push({ code: "QA_RELEASE_NOTES_IGNORED", message: `${ignored.length} QA release-notes line(s) name items outside this release and were left out` });
  const release_notes_input = {
    features_tested: coverage.features.filter((f) => f.covered_by).map((f) => ({ feature: f.id, qa_scope: f.scope })),
    bugs_covered: coverage.bugs.filter((b) => b.covered_by).map((b) => ({ item: b.item, qa_scope: b.scope, matched_by: b.matched_by })),
    bug_fixes_verified: fixes,
    builds_tested: [...new Set(usedList.flatMap((a) => a.tested_builds))],
    surfaces_tested: [...new Set(usedList.flatMap((a) => a.candidate_builds.map((c) => c.surface)))],
    known_issues: knownIssues,
    exceptions,
    verdicts: usedList.map((a) => ({ scope: a.scope, verdict: a.verdict, signed_off_by: a.signed_off_by, signed_off_date: a.signed_off_date })),
    ignored,
  };

  const status = blockers.length ? "no_go" : usedList.some((a) => a.verdict === "READY_WITH_EXCEPTIONS") ? "pass_with_exceptions" : "pass"; // invariant:status
  return {
    status,
    blockers,
    warnings,
    coverage,
    artifacts: artifacts.map((a) => (a.ok ? { source: a.source, scope: a.scope, kind: a.kind, dev_feature: a.dev_feature, qa_bug_id: a.qa_bug_id, external_ref: a.external_ref, members: a.members.map((m) => m.scope), freshness: a.freshness.status, verdict: a.verdict, signoff_status: a.signoff_status, signed_off_by: a.signed_off_by, signed_off_date: a.signed_off_date, candidate_builds: a.candidate_builds, tested_builds: a.tested_builds, used: used.has(a) } : { source: a.source, error: a.code, problems: a.problems })),
    known_issues: knownIssues,
    exceptions,
    build_consistency: { status: buildStatus, details },
    release_notes_input,
    limitations: LIMITATIONS,
  };
}

/* ── the checklist's QA section ────────────────────────────────────────── */
const cell = (v: unknown): string => (v === null || v === undefined || v === "" ? "—" : String(v).replace(/\|/g, "\\|"));
const table = (head: string[], rows: unknown[][]): string => (rows.length ? [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n") : "None.");

/** Deterministic Markdown for the checklist's "QA Readiness (QA-owned)" section. */
export function renderQaSection(r: Record<string, any>): string {
  const label: Record<string, string> = { pass: "PASS", pass_with_exceptions: "PASS WITH EXCEPTIONS — human decision required", no_go: "NO-GO" };
  return [
    `**QA gate: ${label[r.status]}** (REL-QA-1 … REL-QA-7)`,
    "**QA readiness artifacts**",
    table(["Artifact", "Scope", "Verdict", "Sign-off", "Freshness", "Signed off by", "Signed off", "Candidate builds", "Tested builds"], r.artifacts.map((a: any) => (a.error ? [a.source, "—", `${a.error}: ${a.problems.join("; ")}`, "—", "—", "—", "—", "—", "—"] : [a.source, a.members.length ? `${a.scope} (${a.members.join(", ")})` : a.scope, a.verdict, a.signoff_status, a.freshness, a.signed_off_by, a.signed_off_date, a.candidate_builds.map((c: any) => `${c.surface}: ${c.build_id ?? "none"}${c.pinned ? " (pinned)" : ""}`).join(", "), a.tested_builds.join(", ")]))),
    "**Release contents covered**",
    table(["Item", "Covered by", "QA scope", "Matched by"], [...r.coverage.features, ...r.coverage.bugs].map((c: any) => [c.item, c.covered_by ?? "NOT COVERED", c.scope, c.matched_by])),
    `**Build consistency: ${r.build_consistency.status}**`,
    table(["Scope", "Surface", "QA candidate", "Release build", "Match"], r.build_consistency.details.map((d: any) => [d.scope, d.surface, d.qa_candidate, d.release_build, d.match ? "yes" : "NO"])),
    "**Known issues**",
    table(["Scope", "Item", "Reason", "Approved by"], r.known_issues.map((k: any) => [k.scope, k.item, k.reason, k.approved_by])),
    "**Exceptions**",
    table(["Scope", "Exception", "Item", "Kind", "Reason", "Approved by", "Date"], r.exceptions.map((x: any) => [x.scope, x.id, x.item, x.kind, x.reason, x.approved_by, x.date])),
    "**Blockers**",
    table(["Code", "Detail"], r.blockers.map((b: any) => [b.code, b.message])),
    "**Warnings**",
    table(["Code", "Detail"], r.warnings.map((w: any) => [w.code, w.message])),
  ].join("\n\n");
}

/* ── CLI ───────────────────────────────────────────────────────────────── */
function main(): void {
  const args = process.argv.slice(2);
  const values = (flag: string): string[] => args.flatMap((a, i) => (a === `--${flag}` && args[i + 1] !== undefined ? [args[i + 1]] : []));
  const releaseBuilds: Record<string, string> = {};
  for (const raw of values("release-build")) {
    const i = raw.indexOf("=");
    if (i > 0) releaseBuilds[raw.slice(0, i)] = raw.slice(i + 1);
  }
  const result = evaluateQaGate({ artifacts: values("readiness").map(readQaReadiness), features: values("feature"), bugs: values("bug"), releaseBuilds });
  result.qa_section_markdown = renderQaSection(result);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /qa-release-gate\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) main();
