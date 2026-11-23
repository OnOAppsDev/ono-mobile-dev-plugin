/**
 * pr-readiness.ts — the read-only, versioned PR-readiness contract the Platform Guardian queries.
 *
 * Contract `ono-pr-readiness`, version 1 (docs/pr-readiness-contract.md). The Guardian runs it
 * after its commit and before it pushes and opens the pull request:
 *
 *   node --no-warnings "<this plugin's installPath>/scripts/pr-readiness.ts" check --root <repo> --contract 1 [--base <target>] [--work <bug:<key>|feature:<f>>]
 *
 * It answers, for the Ono work on the current branch: which work it is; the branch and the
 * target; the code the pull request carries and whether exactly that code was reviewed; the
 * internal review and the Pre-PR; the required planning and review documents and whether the
 * pull request includes them; the specification and Figma references; blockers and warnings;
 * the pull request description; and `ready_for_pr`.
 *
 *   An active Ono workflow is ready only when its internal review is fresh with no Blocking
 *   finding, its Pre-PR is fresh with its PDF, every required document is committed, and the
 *   committed code is exactly the reviewed code.
 *   A branch with no identifiable Ono work is not blocked: it carries the warning NO_ONO_WORK.
 *   An unsupported or missing contract version is never ready: `compatible: false`.
 *
 * `describe` returns the pull request metadata alone, for /pre-pr to show before the commit.
 *
 * Read-only: git is read, never written; nothing in the repository or the data directory changes.
 * Finds this plugin's own data directory through Claude Code's plugin registry — never through
 * the CLAUDE_PLUGIN_DATA environment variable, which in the Guardian's hooks is the Guardian's.
 * Always exits 0 and prints one JSON object.
 */

import { execFileSync } from "child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "fs";
import { join } from "path";
import { GIT_MAX_BUFFER, rowCells } from "./task-resume.ts";
import { prScope, committedCodeMap, DELETED, type PrScope } from "./pr-scope.ts";
import { resolveFeatureDocs, detectKind, FEATURE_SLUG, type FeatureDoc } from "./feature-docs.ts";
import { verifyFeatureReview, reviewRecordPath } from "./feature-review.ts";
import { verifyReviewRecord, readState, readReviewRecord } from "./bug-review.ts";
import { readSnapshot } from "./bug-evidence.ts";
import { bugWorkPlanPath } from "./bug-work-plan.ts";
import { bugKeyOf, BUG_WORK_ID } from "./task-state.ts";
import { verifyPrePr, resolveDataDir, workState } from "./pre-pr.ts";
import { buildMetadata, parseRemote, type DocStatus, type RequiredDoc } from "./pr-metadata.ts";
import { readFrontmatter } from "./task-resume.ts";
import { PLUGIN_NAME, nextCommand, type NextCommand } from "./next-command.ts";
import { writeStdout } from "./write-output.ts";

export const CONTRACT = "ono-pr-readiness";
export const SUPPORTED_VERSIONS = [1];
const PLUGIN_VERSION: string = JSON.parse(readFileSync(join(import.meta.dirname, "..", ".claude-plugin", "plugin.json"), "utf-8")).version;

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", root, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: GIT_MAX_BUFFER }).toString("utf-8");
  } catch {
    return null;
  }
}

/** Where a required document stands relative to the pull request. */
export function docStatus(root: string, scope: PrScope, path: string): DocStatus {
  const abs = join(root, path);
  let exists = false;
  try {
    exists = statSync(abs).isFile();
  } catch {
    exists = false;
  }
  const at = (rev: string) => git(root, ["rev-parse", "-q", "--verify", `${rev}:${path}`])?.trim() || null;
  const head = at(scope.head);
  if (!exists) return head === null ? "missing" : "uncommitted"; // deleted in the working tree
  const now = git(root, ["hash-object", "--", path])?.trim() ?? null;
  if (head === null) {
    // never committed: an ignored path cannot be included by a normal commit
    let ignored = false;
    try {
      execFileSync("git", ["-C", root, "check-ignore", "-q", "--", path], { stdio: "ignore" });
      ignored = true;
    } catch {
      ignored = false;
    }
    return ignored ? "ignored" : "uncommitted";
  }
  if (head !== now) return "uncommitted";
  return at(scope.merge_base) === head ? "in-base" : "in-pr";
}

type Issue = { code: string; message: string; next_command?: NextCommand | null; [k: string]: unknown };

/* ------------------------------------------------------------- work detection */

/** The Ono work the branch's changes belong to: from its documents, task state and reviews in the PR scope. */
export function detectWork(root: string, scope: PrScope): string[] {
  const found = new Set<string>();
  const code = new Set(scope.files.filter((f) => f.class === "code").map((f) => f.path));
  for (const f of scope.files) {
    let m: RegExpExecArray | null;
    if ((m = /^docs\/bugs\/([^/]+)\//.exec(f.path)) || (m = /^docs\/tasks\/bugs\/([^/.]+(?:\.[^/.]+)*)\.(?:task-state|cycle-approval)\.json$/.exec(f.path)) || (m = /^docs\/qa\/bug-([^/]+)-qa-handoff\.md$/.exec(f.path))) {
      if (BUG_WORK_ID.test(`bug:${m[1]}`)) found.add(`bug:${m[1]}`);
    }
    if ((m = /^docs\/tasks\/([^/]+)-task-state\.json$/.exec(f.path)) || (m = /^docs\/reviews\/([^/]+)\/review\.md$/.exec(f.path))) {
      if (FEATURE_SLUG.test(m[1])) found.add(`feature:${m[1]}`);
    }
    if (f.path.endsWith(".md") && f.blob !== DELETED) {
      try {
        const fm = readFrontmatter(readFileSync(join(root, f.path)));
        if (detectKind(fm) !== null && fm?.feature && FEATURE_SLUG.test(fm.feature)) found.add(`feature:${fm.feature}`);
      } catch {
        /* unreadable: no evidence */
      }
    }
  }
  // Direct evidence from the branch decides. Only when it names no work at all are the task-state
  // stores' file claims consulted — a store merged long ago that once touched a file this branch
  // edits is history, not the active work, and must never make a clear branch ambiguous.
  if (found.size > 0) return [...found].sort();
  const claims = (dir: string, re: RegExp, prefix: string) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
      const m = re.exec(f);
      if (m === null) continue;
      try {
        const j = JSON.parse(readFileSync(join(dir, f), "utf-8"));
        if (Object.values((j?.tasks ?? {}) as Record<string, any>).some((t) => (t?.filesChanged ?? []).some((p: string) => code.has(p)))) found.add(`${prefix}${m[1]}`);
      } catch {
        /* unreadable */
      }
    }
  };
  claims(join(root, "docs/tasks"), /^(.+)-task-state\.json$/, "feature:");
  claims(join(root, "docs/tasks/bugs"), /^(.+)\.task-state\.json$/, "bug:");
  return [...found].sort();
}

/* ------------------------------------------------------------------ evaluate */

interface Evaluated {
  scope: PrScope;
  blockers: Issue[];
  warnings: Issue[];
  review: Record<string, any>;
  prePr: Record<string, any>;
  documents: RequiredDoc[];
  pr_metadata: Record<string, any>;
  scopeReport: Record<string, any>;
}

function evaluate(root: string, work: string, base: string | null, data: string | null, doc: string | null = null): Evaluated | { error: Issue } {
  const w = workState({ root, work, base, doc });
  if (!w.ok) return { error: { code: w.outcome, message: w.reason } };
  const scope = w.scope;
  const blockers: Issue[] = [];
  const warnings: Issue[] = [];
  const statusOf = (p: string) => docStatus(root, scope, p);
  const documents: RequiredDoc[] = [];
  const need = (kind: string, label: string, path: string | null) => {
    documents.push({ kind, label, path: path ?? "(not found)", status: path === null ? "missing" : statusOf(path) });
  };

  let review: Record<string, any>;
  let title: string;
  let source: { value: string | null; from: string; label: string };
  let design: { status: string | null; type: string | null; reference: string | null; figma_link: string | null; from: string } | null = null;
  let acceptance: Array<{ task: string; criterion: string }> = [];
  let majors: Array<{ path: string | null; line: number | null; rule: string; description: string }> = [];
  let reviewCmd: NextCommand;

  if (w.type === "feature") {
    const f = w.id;
    reviewCmd = nextCommand("review-code", `--feature ${f}`);
    const docs = resolveFeatureDocs(root, f, doc);
    const v = verifyFeatureReview({ root, feature: f, base, doc });
    review = { status: v.status, record_path: v.record_path ?? reviewRecordPath(f), counts: v.counts ?? null, ui_conformance: v.ui_conformance ?? null, design_verification: v.design_verification ?? null, reasons: v.reasons ?? [] };
    majors = (v.majors ?? []).map((m: any) => ({ path: m.path, line: m.line, rule: m.rule, description: m.description }));
    if (!docs.ok) {
      blockers.push({ code: "FEATURE_DOCS_UNRESOLVED", message: docs.reason, ...(docs.candidates ? { candidates: docs.candidates } : {}) });
      title = `Feature: ${f}`;
      source = { value: null, from: "feature analysis#source_link", label: "Source specification" };
    } else {
      const d = (x: FeatureDoc | null) => x?.rel ?? null;
      need("feature-analysis", "Feature Analysis", d(docs.fa));
      need("dd", "Detailed Design", d(docs.dd));
      need("task-breakdown", "Task Breakdown", d(docs.tb));
      need("dev-plan", "Dev Plan", d(docs.devPlan) ?? (docs.tb?.fm.dev_plan_link || null));
      for (const x of [docs.fa, docs.dd, docs.tb, docs.devPlan]) if (x !== null && !x.approved) blockers.push({ code: "PLAN_NOT_APPROVED", message: `${x.rel} is not approved (status: ${x.status ?? "none"}) — approval is a human step` });
      const req = docs.fa?.buf.toString("utf-8").split(/\r?\n## Feature Request\r?\n/)[1]?.split(/\r?\n## /)[0] ?? "";
      const first = req.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/).map((l) => l.trim()).find((l) => l !== "") ?? "";
      title = first ? `${f}: ${first.length > 90 ? `${first.slice(0, 87)}…` : first}` : `Feature: ${f}`;
      source = { value: docs.fa?.fm.source_link ?? null, from: `${docs.fa?.rel ?? "feature analysis"}#source_link`, label: "Source specification" };
      const holder = docs.tb ?? docs.dd ?? docs.fa;
      if (holder !== null) design = { status: holder.fm.design_reference_status ?? null, type: holder.fm.design_reference_type ?? null, reference: holder.fm.design_reference ?? null, figma_link: holder.fm.figma_link ?? null, from: holder.rel };
      if (docs.tb !== null) {
        const text = docs.tb.buf.toString("utf-8");
        const ids = (v.scoped_tasks?.length ? v.scoped_tasks : [...text.matchAll(/^\|\s*(T\d+)\s*\|/gm)].map((m) => m[1])) as string[];
        acceptance = ids.map((id) => ({ task: id, criterion: rowCells(text, id)?.["acceptance criteria"] ?? "" })).filter((a) => a.criterion !== "");
      }
    }
    need("internal-review", "Internal review", review.record_path);
  } else {
    const key = w.id;
    reviewCmd = nextCommand("review-code", `--bug ${key}`);
    const v = verifyReviewRecord({ root, work });
    review = { status: v.status, record_path: v.record_path ?? null, counts: v.counts ?? null, ui_conformance: null, reasons: v.reasons ?? [] };
    const snap = readSnapshot(root, key);
    title = snap.status === "valid" ? `${key}: ${snap.snapshot.evidence.title}` : `Bug ${key}`;
    const ext = snap.status === "valid" ? snap.snapshot.identity.external_ref ?? snap.snapshot.identity.qa_bug_id : null;
    source = { value: ext, from: `docs/bugs/${key}/bug-report.json#identity`, label: "Bug report (external)" };
    // A bug planned before the evidence snapshot existed has none, and none can be produced without
    // re-running /analyze-bug. Deterministic marker: the Bug Work Plan is already on the target at
    // the merge base (planned before this branch) and no snapshot exists. A bug planned on this
    // branch — or a new fix cycle, which writes the snapshot with its plan — keeps the requirement.
    const reportRel = `docs/bugs/${key}/bug-report.json`;
    const planOnTarget = git(root, ["cat-file", "-e", `${scope.merge_base}:${bugWorkPlanPath(key)}`]) !== null;
    if (snap.status === "missing" && planOnTarget && docStatus(root, scope, reportRel) === "missing") {
      warnings.push({ code: "LEGACY_BUG_NO_SNAPSHOT", message: `${key} was planned before the bug evidence snapshot existed (its plan predates this branch); ${reportRel} is not required — the Bug Fix Plan carries its evidence. Run /analyze-bug to persist a snapshot if one is wanted` });
    } else {
      need("bug-report", "Bug Report", reportRel);
    }
    need("fix-plan", "Bug Fix Plan", bugWorkPlanPath(key) as string);
    need("internal-review", "Internal review", review.record_path);
    const state = readState(root, key);
    acceptance = Object.entries((state?.tasks ?? {}) as Record<string, any>).flatMap(([id, t]) => (t.acceptanceCriteria ?? []).map((c: any) => ({ task: id, criterion: String(c.criterion ?? "") })));
    // The bug review record's own reader (bug-review.ts) — one parser for its findings.
    const cycle = /review-c(\d+)\.md$/.exec(review.record_path ?? "")?.[1];
    const parsed = cycle ? readReviewRecord(root, key, Number(cycle)) : null;
    majors = (parsed?.findings ?? []).filter((f) => f.severity === "major").map((f) => ({ path: f.path, line: f.line, rule: f.rule, description: f.description }));
  }

  // The internal review.
  if (review.status === "missing") blockers.push({ code: "REVIEW_MISSING", message: "no internal code review is recorded", next_command: reviewCmd });
  else if (review.status !== "fresh") blockers.push({ code: "REVIEW_STALE", message: `the internal review is ${review.status}: ${(review.reasons ?? []).map((r: any) => r.code).join(", ")}`, next_command: reviewCmd });
  else if ((review.counts?.blocking ?? 0) > 0) blockers.push({ code: "BLOCKING_FINDINGS", message: `the internal review has ${review.counts.blocking} unresolved Blocking finding(s)`, next_command: review.record_path ? nextCommand("fix-review-comments", review.record_path) : null });
  if (review.status === "fresh" && (review.counts?.major ?? 0) > 0) warnings.push({ code: "MAJOR_FINDINGS", message: `the internal review reports ${review.counts.major} Major finding(s) — listed in the pull request description` });
  if (review.ui_conformance === "not-verified") warnings.push({ code: "UI_NOT_VERIFIED", message: "UI conformance was not verified — the design could not be read during the internal review" });

  // The Pre-PR.
  const pp = verifyPrePr({ root, work, data, base, doc }, w);
  const prePr = { status: pp.status, pdf_path: pp.pdf_path ?? null, pdf_available: pp.pdf_available ?? false, counts: pp.counts ?? null, reasons: pp.reasons ?? [] };
  const prePrCmd = nextCommand("pre-pr", work);
  if (pp.status === "missing") blockers.push({ code: "PRE_PR_MISSING", message: "no Pre-PR regression checklist is recorded", next_command: prePrCmd });
  else if (pp.status === "pdf-missing") blockers.push({ code: "PRE_PR_PDF_MISSING", message: "the Pre-PR checklist is valid but its PDF is missing — /pre-pr regenerates it without a new analysis", next_command: prePrCmd });
  else if (pp.status !== "fresh") blockers.push({ code: pp.status === "invalid" ? "PRE_PR_INVALID" : "PRE_PR_STALE", message: `the Pre-PR is ${pp.status}: ${(pp.reasons ?? []).map((r: any) => r.code).join(", ")}`, next_command: prePrCmd });

  // Required documents must be in the pull request.
  const missing = documents.filter((d) => d.status === "missing" || d.status === "ignored");
  const notCommitted = documents.filter((d) => d.status === "uncommitted");
  if (missing.length) blockers.push({ code: "REQUIRED_DOCS_MISSING", message: `required documents are missing${missing.some((d) => d.status === "ignored") ? " or git-ignored" : ""}: ${missing.map((d) => d.path).join(", ")}`, paths: missing.map((d) => d.path) });
  if (notCommitted.length) blockers.push({ code: "REQUIRED_DOCS_NOT_COMMITTED", message: `required documents are not committed, so the pull request would not include them: ${notCommitted.map((d) => d.path).join(", ")}`, paths: notCommitted.map((d) => d.path) });

  // The committed code must be exactly the reviewed code.
  const reviewed: Record<string, string> = pp.code_map ?? {};
  const committed = committedCodeMap(scope);
  const notReviewed = Object.keys(committed).filter((p) => reviewed[p] !== committed[p]).sort();
  const leftOut = Object.keys(reviewed).filter((p) => !(p in committed)).sort();
  if (pp.status === "fresh" && notReviewed.length) blockers.push({ code: "SCOPE_NOT_REVIEWED", message: `committed code differs from what was reviewed: ${notReviewed.join(", ")}`, paths: notReviewed, next_command: reviewCmd });
  if (pp.status === "fresh" && leftOut.length) warnings.push({ code: "REVIEWED_CODE_NOT_COMMITTED", message: `reviewed changes are not committed and will not be in the pull request: ${leftOut.join(", ")}`, paths: leftOut });

  const md = buildMetadata({
    work: { type: w.type, id: work }, title, head: scope.head, remote: parseRemote(git(root, ["remote", "get-url", "origin"])), docs: documents, source, design,
    designVerification: w.type === "feature" ? (review.design_verification ?? null) : null,
    acceptance, review: { status: review.status, counts: review.counts, ui_conformance: review.ui_conformance, majors },
    prePr: { status: pp.status, must: pp.counts?.must ?? null, should: pp.counts?.should ?? null }, statusOf,
  });
  for (const x of md.warnings) if (!warnings.some((y) => y.code === x.code && y.message === x.message)) warnings.push(x);

  return {
    scope, blockers, warnings, review, prePr, documents, pr_metadata: md,
    scopeReport: { code_files: Object.keys(committed).length + leftOut.length, committed: Object.keys(committed), reviewed_files: Object.keys(reviewed).length, committed_matches_reviewed: notReviewed.length === 0, not_reviewed: notReviewed, uncommitted_reviewed: leftOut },
  };
}

/* --------------------------------------------------------------------- check */

export function readinessCheck(req: { root: string; contract?: string | null; base?: string | null; work?: string | null; data?: string | null; doc?: string | null }): Record<string, any> {
  const head = { contract: CONTRACT, contract_version: null as number | null, supported_versions: SUPPORTED_VERSIONS, plugin: { name: PLUGIN_NAME, version: PLUGIN_VERSION } };
  const never = (status: string, code: string, message: string, extra: Record<string, unknown> = {}) => ({ ...head, status, compatible: status !== "unsupported-contract" && status !== "contract-required", ready_for_pr: false, managed: null, work: null, blockers: [{ code, message }], warnings: [], pr_metadata: null, next_command: null, ...extra });
  if (req.contract === undefined || req.contract === null || req.contract === "") return never("contract-required", "CONTRACT_VERSION_REQUIRED", `pass --contract <version>; this plugin supports ${SUPPORTED_VERSIONS.join(", ")}`);
  const v = Number(req.contract);
  if (!Number.isInteger(v) || !SUPPORTED_VERSIONS.includes(v)) {
    return never("unsupported-contract", "CONTRACT_UNSUPPORTED", `contract version ${req.contract} is not supported by ${PLUGIN_NAME} ${PLUGIN_VERSION} (supported: ${SUPPORTED_VERSIONS.join(", ")}) — update the plugin that is out of date; readiness is not claimed`, { requested_version: req.contract });
  }
  head.contract_version = v;
  if (!req.root || !existsSync(req.root)) return never("error", "ROOT_INVALID", `repository root ${req.root ?? ""} does not exist`);
  const root = realpathSync(req.root);
  const data = resolveDataDir(req.data ?? null);

  const generic = prScope(root, { base: req.base ?? null });
  if (!generic.ok) return never("error", generic.outcome, generic.reason);
  const repo = {
    root,
    branch: generic.branch,
    head: generic.head,
    base: generic.base,
    merge_base: generic.merge_base,
    remote: parseRemote(git(root, ["remote", "get-url", "origin"])),
  };
  const candidates = req.work ? [req.work] : detectWork(root, generic);
  if (candidates.length === 0) {
    const hasCode = generic.files.some((f) => f.class === "code");
    return {
      ...head, status: "ok", compatible: true, ready_for_pr: true, managed: false, repo, work: null,
      blockers: [],
      warnings: hasCode ? [{ code: "NO_ONO_WORK", message: `No Ono workflow tracks the changes on this branch. The pull request is not blocked, but new development should use the Ono workflow: /${PLUGIN_NAME}:analyze-feature for a feature, /${PLUGIN_NAME}:analyze-bug for a bug fix.` }] : [],
      pr_metadata: null, next_command: null,
    };
  }
  if (candidates.length > 1) {
    return { ...head, status: "ok", compatible: true, ready_for_pr: false, managed: true, repo, work: null, candidates, blockers: [{ code: "AMBIGUOUS_WORK", message: `more than one Ono work item is on this branch (${candidates.join(", ")}) — query again with --work <id>` }], warnings: [], pr_metadata: null, next_command: null };
  }
  const work = candidates[0];
  if (bugKeyOf(work) === null && !(work.startsWith("feature:") && FEATURE_SLUG.test(work.slice(8)))) return never("error", "WORK_INVALID", `"${work}" is not Ono work — bug:<key> or feature:<feature>`);
  const e = evaluate(root, work, req.base ?? null, data?.dir ?? null, req.doc ?? null);
  if ("error" in e) return { ...head, status: "error", compatible: true, ready_for_pr: false, managed: true, repo, work: { type: work.split(":")[0], id: work }, blockers: [e.error], warnings: [], pr_metadata: null, next_command: null };
  const scopeRepo = { ...repo, base: e.scope.base, merge_base: e.scope.merge_base };
  return {
    ...head,
    status: "ok",
    compatible: true,
    ready_for_pr: e.blockers.length === 0,
    managed: true,
    repo: scopeRepo,
    work: { type: work.split(":")[0], id: work },
    scope: e.scopeReport,
    review: e.review,
    pre_pr: e.prePr,
    documents: { required: e.documents, missing: e.documents.filter((d) => d.status === "missing" || d.status === "ignored").map((d) => d.path), not_committed: e.documents.filter((d) => d.status === "uncommitted").map((d) => d.path) },
    references: e.pr_metadata.references,
    blockers: e.blockers,
    warnings: e.warnings,
    pr_metadata: e.pr_metadata,
    next_command: e.blockers.find((b) => b.next_command)?.next_command ?? null,
  };
}

/** The pull request metadata alone — for /pre-pr to show before the commit. Never a readiness verdict. */
export function describe(req: { root: string; work: string; base?: string | null; data?: string | null; doc?: string | null }): Record<string, any> {
  if (!req.root || !existsSync(req.root)) return { ok: false, outcome: "ROOT_INVALID", reason: `repository root ${req.root ?? ""} does not exist` };
  const root = realpathSync(req.root);
  const data = resolveDataDir(req.data ?? null);
  const e = evaluate(root, req.work, req.base ?? null, data?.dir ?? null, req.doc ?? null);
  if ("error" in e) return { ok: false, outcome: e.error.code, reason: e.error.message };
  const docWarnings = e.documents.filter((d) => d.status !== "in-pr" && d.status !== "in-base").map((d) => ({ code: d.status === "uncommitted" ? "DOC_NOT_COMMITTED_YET" : "DOC_MISSING", message: `${d.label} (${d.path}) is ${d.status === "uncommitted" ? "not committed yet — commit it with the code so the pull request includes it (links are added once committed)" : "missing"}` }));
  return { ok: true, outcome: "PR_DESCRIPTION", ...e.pr_metadata, warnings: [...e.pr_metadata.warnings.filter((w: any) => w.code !== "DOC_NOT_COMMITTED"), ...docWarnings] };
}

/* --------------------------------------------------------------------- CLI */

function main(): void {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(args[i]);
    if (!m) positional.push(args[i]);
    else flags[m[1]] = m[2] !== undefined ? m[2] : args[++i] ?? "";
  }
  const print = (o: unknown): never => {
    writeStdout(JSON.stringify(o, null, 2) + "\n");
    process.exit(0);
  };
  if (positional[0] === "check") print(readinessCheck({ root: flags.root ?? "", contract: flags.contract ?? null, base: flags.base || null, work: flags.work || null, data: flags.data || null, doc: flags.doc || null }));
  if (positional[0] === "describe") print(describe({ root: flags.root ?? "", work: flags.work ?? "", base: flags.base || null, data: flags.data || null, doc: flags.doc || null }));
  print({ contract: CONTRACT, status: "error", ready_for_pr: false, blockers: [{ code: "UNKNOWN_COMMAND", message: "usage: pr-readiness.ts check --root <repo> --contract <version> [--base <branch>] [--work <id>] [--data <dir>] | describe --root <repo> --work <id> [--base <branch>] [--data <dir>]" }] });
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /pr-readiness\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) main();
