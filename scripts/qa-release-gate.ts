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
 *        [--bug <qa-bug-id>]… [--release-build <surface>=<qa-build-id>]…
 */

import { readFileSync, existsSync, realpathSync } from "fs";

export const SUPPORTED_SCHEMA = "1";
const VERDICTS = ["READY", "READY_WITH_EXCEPTIONS", "NOT_READY"];
const SIGNOFF_STATUSES = ["valid", "stale", "superseded", "none"];
const KINDS = ["feature", "bug"];
const FRONTMATTER_KEYS = ["qa_readiness_schema", "scope", "scope_kind", "candidate_builds", "verdict", "blocker_count", "exception_count", "fingerprint", "generated_at", "signed_off_by", "signed_off_date", "signoff_fingerprint", "signoff_status"];
const REQUIRED_SECTIONS = ["Exceptions", "Known Issues", "Tested Builds", "QA Notes", "Release Notes Input"];
const FINGERPRINT_RE = /^sha256:[0-9a-f]{64}$/;
const SCOPE_RE = /^(feature|bug|release):([A-Za-z0-9][A-Za-z0-9._-]*)$/;
const LIMITATIONS = [
  "Bugs match by their exact QA bug id only: the QA readiness contract carries no external_ref, so a tracker key is never matched.",
  "An artifact reflects the QA ledger when it was rendered; ask QA to re-render (/qa-readiness) right before release — this gate cannot see ledger changes made after that.",
];

export interface Artifact {
  ok: true;
  source: string;
  scope: string;
  kind: string;
  id: string;
  dev_feature: string | null;
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

const nul = (v: string | undefined): string | null => (v === undefined || v === "null" || v === "—" || v === "" ? null : v);

function tableRows(section: string): string[][] {
  const lines = section.split("\n").filter((l) => l.trim().startsWith("|"));
  return lines
    .slice(2)
    .map((l) => l.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|")));
}

/** Parses one readiness artifact strictly against the contract. Never repairs anything. */
export function parseQaReadiness(text: string, source: string): Artifact | Failed {
  const problems: string[] = [];
  const bad = (): Failed => ({ ok: false, source, code: "QA_READINESS_MALFORMED", problems });
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
  for (const k of FRONTMATTER_KEYS) if (!(k in fm)) problems.push(`frontmatter is missing ${k}`);
  if (problems.length) return bad();

  if (fm.qa_readiness_schema !== SUPPORTED_SCHEMA) problems.push(`qa_readiness_schema ${fm.qa_readiness_schema} is not supported (this plugin reads ${SUPPORTED_SCHEMA})`);
  const scope = SCOPE_RE.exec(fm.scope);
  if (!scope) problems.push(`scope "${fm.scope}" is not <feature|bug>:<id>`);
  else if (scope[1] !== fm.scope_kind) problems.push(`scope ${fm.scope} does not match scope_kind ${fm.scope_kind}`);
  if (!KINDS.includes(fm.scope_kind)) problems.push(`scope_kind "${fm.scope_kind}" has no readiness artifact in the contract (feature and bug only — a release scope is aggregated, never rendered)`);
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
  if (problems.length) return bad();

  const rni: Record<string, string> = {};
  for (const line of sections.get("Release Notes Input")!.split("\n")) {
    const m = /^- ([^:]+): (.*)$/.exec(line);
    if (m) rni[m[1]] = m[2];
  }
  for (const k of ["Scope", "Bug fixes verified", "Builds tested", "Surfaces tested", "Known issues", "Exceptions", "QA verdict"]) if (!(k in rni)) problems.push(`Release Notes Input is missing "${k}"`);
  if (rni["QA verdict"] !== undefined && rni["QA verdict"] !== fm.verdict) problems.push(`Release Notes Input says ${rni["QA verdict"]}, frontmatter says ${fm.verdict}`);
  const scopeLine = /^(\S+)(?: \(Dev feature ([^)]+)\))?$/.exec(rni.Scope ?? "");
  if (!scopeLine || scopeLine[1] !== fm.scope) problems.push(`Release Notes Input scope "${rni.Scope}" does not match ${fm.scope}`);

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
    dev_feature: scopeLine![2] ?? null,
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
  return parseQaReadiness(readFileSync(realpathSync(path), "utf-8"), path);
}

export interface GateInput {
  artifacts: Array<Artifact | Failed>;
  features: string[];
  bugs: string[];
  releaseBuilds: Record<string, string>;
}

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
  for (const f of failed.filter((x) => x.code !== "QA_READINESS_MISSING")) block("QA_READINESS_MALFORMED", `${f.source}: ${f.problems.join("; ")}`, { source: f.source }); // invariant:malformed-blocks

  // Coverage: exact identity only. A feature matches its canonical Dev identity; only an
  // artifact with no Dev identity may match by its exact QA scope id. Bugs match by exact id.
  const same = (x: string | null, y: string) => x === y;
  const coverage = { features: [] as any[], bugs: [] as any[] };
  const used = new Set<Artifact>();
  const cover = (kind: "feature" | "bug", id: string) => {
    const hits = valid
      .filter((a) => a.kind === kind)
      .map((a) => ({ a, by: kind === "feature" ? (a.dev_feature !== null ? (same(a.dev_feature, id) ? "dev_feature" : null) : same(a.id, id) ? "qa_scope_id" : null) : same(a.id, id) ? "qa_bug_id" : null }))
      .filter((h) => h.by !== null);
    const item = `${kind}:${id}`;
    if (!hits.length) block("QA_NOT_COVERED", `${item} is in the release but no supplied QA readiness covers it`, { item }); // invariant:coverage
    if (hits.length > 1) block("QA_DUPLICATE_COVERAGE", `${item} is claimed by ${hits.map((h) => h.a.source).join(", ")} — supply exactly one`, { item });
    const hit = hits.length === 1 ? hits[0] : null;
    if (hit) used.add(hit.a);
    (kind === "feature" ? coverage.features : coverage.bugs).push({ id, item, covered_by: hit?.a.source ?? null, matched_by: hit?.by ?? null, scope: hit?.a.scope ?? null });
  };
  for (const f of input.features) cover("feature", f);
  for (const b of input.bugs) cover("bug", b);

  // Every covering artifact: a verdict that allows release, and a valid, current sign-off.
  for (const a of used) {
    if (a.verdict === "NOT_READY") block("QA_NOT_READY", `${a.scope} is NOT_READY (${a.blocker_count} blocker(s)) — ${a.source}`, { source: a.source }); // invariant:not-ready
    if (a.signoff_status === "none") block("QA_UNSIGNED", `${a.scope} has no QA sign-off — ${a.source}`, { source: a.source });
    else if (a.signoff_status !== "valid" || a.signoff_fingerprint !== a.fingerprint) block("QA_SIGNOFF_STALE", `${a.scope}'s sign-off is ${a.signoff_status === "valid" ? "for another fingerprint" : a.signoff_status} — QA must re-sign the current readiness`, { source: a.source });
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
  const releaseBugs = new Set(input.bugs.map((b) => `bug:${b}`));
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
    artifacts: artifacts.map((a) => (a.ok ? { source: a.source, scope: a.scope, kind: a.kind, dev_feature: a.dev_feature, verdict: a.verdict, signoff_status: a.signoff_status, signed_off_by: a.signed_off_by, signed_off_date: a.signed_off_date, candidate_builds: a.candidate_builds, tested_builds: a.tested_builds, used: used.has(a) } : { source: a.source, error: a.code, problems: a.problems })),
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
    `**QA gate: ${label[r.status]}** (REL-QA-1 … REL-QA-5)`,
    "**QA readiness artifacts**",
    table(["Artifact", "Scope", "Verdict", "Sign-off", "Signed off by", "Signed off", "Candidate builds", "Tested builds"], r.artifacts.map((a: any) => (a.error ? [a.source, "—", `malformed/missing: ${a.problems.join("; ")}`, "—", "—", "—", "—", "—"] : [a.source, a.scope, a.verdict, a.signoff_status, a.signed_off_by, a.signed_off_date, a.candidate_builds.map((c: any) => `${c.surface}: ${c.build_id ?? "none"}${c.pinned ? " (pinned)" : ""}`).join(", "), a.tested_builds.join(", ")]))),
    "**Release contents covered**",
    table(["Item", "Covered by", "Matched by"], [...r.coverage.features, ...r.coverage.bugs].map((c: any) => [c.item, c.covered_by ?? "NOT COVERED", c.matched_by])),
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
