/**
 * pre-pr.ts — the evidence half of `/pre-pr`, the Pre-PR regression checklist this plugin owns.
 *
 * The checklist itself is produced by the vendored `regression-checklist` skill
 * (skills/regression-checklist/ — the original Pre-PR skill and its md_to_pdf_open.py, unchanged).
 * This helper does what must come out the same twice:
 *
 *   gate    read-only. Is the work ready for a Pre-PR — implemented, developer-tested, and with a
 *           fresh internal review with no Blocking finding? Are python3 and a Chromium-family
 *           browser available, and is the plugin's data directory outside every git repository?
 *           Returns the exact PR scope for the skill, or that an unchanged Pre-PR is already
 *           fresh (nothing is rerun), or that only the PDF must be regenerated.
 *   record  validates the checklist the skill wrote (outside the repository; at most 8 checks;
 *           the template's shape) and its PDF (exactly one page), copies both into the plugin's
 *           persistent data directory, and writes the completion record there. Refuses — and
 *           records nothing — without a one-page PDF: the PDF is mandatory.
 *   verify  read-only. `fresh` | `pdf-missing` | `stale` | `missing` | `invalid`, with reasons.
 *
 * Everything lives outside the target repository, under the plugin's persistent data directory
 * (${CLAUDE_PLUGIN_DATA}, which survives plugin updates):
 *
 *   <data>/pre-pr/<repo-key>/<work-key>/regression-checklist.md
 *   <data>/pre-pr/<repo-key>/<work-key>/regression-checklist.pdf
 *   <data>/pre-pr/<repo-key>/<work-key>/record.json
 *
 * Freshness is content-based, like the review's: a commit of exactly the reviewed content keeps
 * the Pre-PR fresh; a change to the PR's code, a new review, or a moved merge base makes it stale.
 * Never commits, never stages, never writes inside the repository, reads no clock.
 *
 * Always exits 0 and prints one JSON object.
 *
 *   node --no-warnings scripts/pre-pr.ts gate   <bug:<key>|feature:<f>> --root <TARGET_ROOT> --data <plugin data dir> [--base <branch>] [--doc <Task Breakdown>]
 *   node --no-warnings scripts/pre-pr.ts record <bug:<key>|feature:<f>> --root <TARGET_ROOT> --data <plugin data dir> --checklist <md> --pdf <pdf> [--base <branch>]
 *   node --no-warnings scripts/pre-pr.ts verify <bug:<key>|feature:<f>> --root <TARGET_ROOT> --data <plugin data dir> [--base <branch>]
 */

import { spawnSync, execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { bugKeyOf } from "./task-state.ts";
import { verifyReviewRecord, readReviewRecord } from "./bug-review.ts";
import { verifyVerification } from "./bug-verification.ts";
import { verifyFeatureReview } from "./feature-review.ts";
import { resolveFeatureDocs, isFeatureDocPath, FEATURE_SLUG } from "./feature-docs.ts";
import { prScope, codeMap, type PrScope } from "./pr-scope.ts";
import { canonical } from "./qa-release-gate.ts";
import { PLUGIN_NAME, nextCommand } from "./next-command.ts";
import { writeStdout } from "./write-output.ts";

const PLUGIN_ROOT = join(import.meta.dirname, "..");
export const SKILL_DIR = join(PLUGIN_ROOT, "skills", "regression-checklist");
export const PDF_SCRIPT = join(SKILL_DIR, "scripts", "md_to_pdf_open.py");
export const PRE_PR_CONTRACT = 1;
export const MAX_CHECKS = 8;
export const CHECKLIST = "regression-checklist.md";
export const PDF = "regression-checklist.pdf";
export const LOCAL_ONLY_LINE = "Local only. Do not commit or include in the PR.";

const sha = (s: string | Buffer): string => `sha256:${createHash("sha256").update(s).digest("hex")}`;

/* -------------------------------------------------------- the data directory */

/** Claude Code's configuration directory (CLAUDE_CONFIG_DIR, else ~/.claude). */
export const claudeConfigDir = (): string => process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");

/** Claude Code's data-directory name for a plugin id: every character outside [A-Za-z0-9_-] becomes '-'. */
export const dataDirName = (pluginId: string): string => pluginId.replace(/[^A-Za-z0-9_-]/g, "-");

/**
 * This plugin's persistent data directory, for a caller that has no ${CLAUDE_PLUGIN_DATA}
 * substitution (the Platform Guardian, running pr-readiness.ts). Located through Claude Code's
 * own registry: the installed entry whose installPath is this script's plugin root. The
 * CLAUDE_PLUGIN_DATA environment variable is deliberately NOT read: inside another plugin's hook
 * it holds that plugin's directory.
 */
export function locateDataDir(pluginRoot = PLUGIN_ROOT, configDir = claudeConfigDir()): { dir: string; via: string } | null {
  let me: string;
  try {
    me = realpathSync(pluginRoot);
  } catch {
    return null;
  }
  try {
    const reg = JSON.parse(readFileSync(join(configDir, "plugins", "installed_plugins.json"), "utf-8"));
    for (const [id, entries] of Object.entries((reg?.plugins ?? {}) as Record<string, any[]>)) {
      for (const e of Array.isArray(entries) ? entries : []) {
        if (typeof e?.installPath !== "string") continue;
        let p: string;
        try {
          p = realpathSync(e.installPath);
        } catch {
          continue;
        }
        if (p === me) return { dir: join(configDir, "plugins", "data", dataDirName(id)), via: `installed_plugins.json (${id})` };
      }
    }
  } catch {
    /* no registry: fall through */
  }
  // A plugin loaded from a directory (claude --plugin-dir) has the `<name>-inline` data directory.
  const inline = join(configDir, "plugins", "data", dataDirName(`${PLUGIN_NAME}-inline`));
  return existsSync(inline) ? { dir: inline, via: "inline plugin data directory" } : null;
}

export function resolveDataDir(flag: string | null | undefined): { dir: string; via: string } | null {
  if (flag) return isAbsolute(flag) ? { dir: flag, via: "--data" } : null;
  return locateDataDir();
}

/** The git working tree that contains `p` (or its nearest existing parent), or null. */
export function gitTopOf(p: string): string | null {
  let probe = resolve(p);
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  try {
    const out = execFileSync("git", ["-C", statSync(probe).isDirectory() ? probe : dirname(probe), "rev-parse", "--show-toplevel"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return out ? realpathSync(out) : null;
  } catch {
    return null;
  }
}

const inside = (child: string, parent: string): boolean => {
  const r = relative(parent, child);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
};

/** A repository's key in the data directory: its name plus a hash of its git common directory. */
export function repoKey(root: string): string {
  let common = join(root, ".git");
  try {
    const out = execFileSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (out) common = realpathSync(out);
  } catch {
    /* fall back to <root>/.git */
  }
  return `${basename(root).replace(/[^A-Za-z0-9._-]/g, "-")}-${createHash("sha256").update(common).digest("hex").slice(0, 12)}`;
}
export const workKey = (work: string): string => work.replace(/[^A-Za-z0-9._-]/g, "-");
export const prePrDir = (data: string, root: string, work: string): string => join(data, "pre-pr", repoKey(root), workKey(work));

/* ------------------------------------------------------------- dependencies */

/** The browser candidates md_to_pdf_open.py searches, read from the script itself so they never drift. */
export function browserCandidates(script = PDF_SCRIPT): { paths: string[]; names: string[] } {
  const src = readFileSync(script, "utf-8");
  const block = /candidates = \[([\s\S]*?)\]/.exec(src)?.[1] ?? "";
  const paths = [...block.matchAll(/r?"([^"]+)"/g)].map((m) => m[1]);
  const namesBlock = /for name in \(([\s\S]*?)\):/.exec(src)?.[1] ?? "";
  const names = [...namesBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  return { paths, names };
}

function which(name: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":")) {
    if (!dir) continue;
    const p = join(dir, name);
    try {
      if (statSync(p).isFile()) return p;
    } catch {
      /* next */
    }
  }
  return null;
}

/** The same lookup md_to_pdf_open.py makes: PRE_PR_BROWSER, the known install paths, then PATH. */
export function findBrowser(): string | null {
  const env = process.env.PRE_PR_BROWSER;
  if (env && existsSync(env)) return env;
  const { paths, names } = browserCandidates();
  for (const c of paths) if (existsSync(c)) return c;
  for (const n of names) {
    const p = which(n);
    if (p) return p;
  }
  return null;
}

export function findPython(): string | null {
  for (const cmd of process.platform === "win32" ? ["python", "python3"] : ["python3", "python"]) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf-8" });
    if (r.status === 0 && /Python 3\./.test(`${r.stdout}${r.stderr}`)) return cmd;
  }
  return null;
}

/* ------------------------------------------------------------ the checklist */

/** Pages in a PDF — the exact count md_to_pdf_open.py makes (`/Type /Page`, not `/Pages`). */
export function pdfPageCount(buf: Buffer): number {
  return (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

/** The checklist's shape, read deterministically from the skill's exact template. */
export function parseChecklist(md: string): { ok: true; must: number; should: number; watch: number; critical: number; title: string } | { ok: false; reason: string } {
  const lines = md.split(/\r?\n/);
  const title = lines.find((l) => l.startsWith("# ")) ?? "";
  if (!/^# Pre-PR checklist\b/.test(title)) return { ok: false, reason: 'the checklist does not start with the template\'s "# Pre-PR checklist" title' };
  const sections: Record<string, string[]> = {};
  let cur: string | null = null;
  for (const l of lines) {
    const h = /^## (.+)$/.exec(l);
    if (h) {
      cur = h[1].trim();
      sections[cur] = [];
      continue;
    }
    if (cur !== null) sections[cur].push(l);
  }
  const find = (re: RegExp) => Object.keys(sections).find((k) => re.test(k));
  const what = find(/What changed/);
  const mustKey = find(/Must test/);
  if (!what || !mustKey) return { ok: false, reason: 'the checklist is missing the template\'s "What changed" or "🔴 Must test" section' };
  const items = (k: string | undefined) => (k ? sections[k].filter((l) => /^\s*- \[[ xX]\]/.test(l)).length : 0);
  const bullets = (k: string | undefined) => (k ? sections[k].filter((l) => /^\s*- (?!\[)/.test(l)).length : 0);
  const must = items(mustKey);
  const should = items(find(/Should test/));
  const watch = bullets(find(/Watch out/));
  const critical = bullets(find(/Critical areas/));
  if (must + should === 0) return { ok: false, reason: "the checklist has no test item" };
  if (must + should > MAX_CHECKS) return { ok: false, reason: `the checklist has ${must + should} test items — at most ${MAX_CHECKS}` };
  if (watch > 3) return { ok: false, reason: `"Watch out" has ${watch} lines — at most 3` };
  if (critical > 3) return { ok: false, reason: `"Critical areas" has ${critical} lines — at most 3` };
  if (!md.includes(LOCAL_ONLY_LINE)) return { ok: false, reason: `the checklist does not end with "${LOCAL_ONLY_LINE}"` };
  return { ok: true, must, should, watch, critical, title: title.slice(2).trim() };
}

/** The vendored skill's identity: its SKILL.md and PDF script, hashed together. */
export function skillFingerprint(): string {
  return sha(canonical({ skill: sha(readFileSync(join(SKILL_DIR, "SKILL.md"))), script: sha(readFileSync(PDF_SCRIPT)) }));
}

/* ------------------------------------------------------------------- work */

type Stop = { ok: false; outcome: string; reason: string; [k: string]: unknown };

interface WorkState {
  ok: true;
  work: string;
  type: "bug" | "feature";
  id: string;
  root: string;
  scope: PrScope;
  review: { status: string; record_path: string | null; findings_fingerprint: string | null; counts: Record<string, number> | null; reasons: any[] };
}

/** The work's review and PR scope now — shared by gate, record and verify. */
export function workState(req: { root: string; work: string; base?: string | null; doc?: string | null }): WorkState | Stop {
  const work = req.work ?? "";
  const bug = bugKeyOf(work);
  const feature = work.startsWith("feature:") ? work.slice("feature:".length) : null;
  if (bug === null && (feature === null || !FEATURE_SLUG.test(feature))) return { ok: false, outcome: "PRE_PR_WORK_INVALID", reason: `"${work}" is not Ono work — name it bug:<bug_key> or feature:<feature>` };
  if (!req.root || !existsSync(req.root)) return { ok: false, outcome: "PRE_PR_ROOT_INVALID", reason: `repository root ${req.root ?? ""} does not exist` };
  const root = realpathSync(req.root);
  if (bug !== null) {
    const v = verifyReviewRecord({ root, work });
    let fp: string | null = null;
    const cycle = /review-c(\d+)\.md$/.exec(v.record_path ?? "")?.[1];
    if (cycle) fp = readReviewRecord(root, bug, Number(cycle))?.frontmatter.findings_fingerprint ?? null;
    const scope = prScope(root, { base: req.base ?? null });
    if (!scope.ok) return { ok: false, outcome: "PRE_PR_SCOPE_UNAVAILABLE", reason: scope.reason };
    return { ok: true, work, type: "bug", id: bug, root, scope, review: { status: v.status, record_path: v.record_path ?? null, findings_fingerprint: fp, counts: v.counts ?? null, reasons: v.reasons ?? [] } };
  }
  const docs = resolveFeatureDocs(root, feature!, req.doc ?? null);
  const scope = prScope(root, { base: req.base ?? null, isDoc: docs.ok ? isFeatureDocPath(docs) : () => false });
  if (!scope.ok) return { ok: false, outcome: "PRE_PR_SCOPE_UNAVAILABLE", reason: scope.reason };
  const v = verifyFeatureReview({ root, feature: feature!, base: req.base ?? null, doc: req.doc ?? null });
  return { ok: true, work, type: "feature", id: feature!, root, scope, review: { status: v.status, record_path: v.record_path ?? null, findings_fingerprint: v.findings_fingerprint ?? null, counts: v.counts ?? null, reasons: v.reasons ?? [] } };
}

/** Development and testing done, and a fresh review with no Blocking finding — or why not. */
function readiness(w: WorkState): Stop | null {
  const reviewCmd = w.type === "bug" ? nextCommand("review-code", `--bug ${w.id}`) : nextCommand("review-code", `--feature ${w.id}`);
  if (w.type === "bug") {
    const ver = verifyVerification({ root: w.root, work: w.work });
    if (!ver.ok) return { ok: false, outcome: "PRE_PR_TESTING_REQUIRED", reason: `the fix cycle has no current, passed developer verification (${ver.status}) — Pre-PR runs after development and testing`, next_command: nextCommand("verify-fix-cycle", w.work) };
  }
  if (w.review.status !== "fresh") {
    return { ok: false, outcome: w.review.status === "missing" ? "PRE_PR_REVIEW_MISSING" : "PRE_PR_REVIEW_STALE", reason: w.review.status === "missing" ? "there is no internal code review for this work" : `the internal code review is ${w.review.status}: ${w.review.reasons.map((r: any) => r.code).join(", ")}`, next_command: reviewCmd };
  }
  if ((w.review.counts?.blocking ?? 0) > 0) {
    return { ok: false, outcome: "PRE_PR_BLOCKING_FINDINGS", reason: `the internal review has ${w.review.counts!.blocking} unresolved Blocking finding(s)`, next_command: w.review.record_path ? nextCommand("fix-review-comments", w.review.record_path) : null };
  }
  return null;
}

function commits(root: string, from: string): string[] {
  try {
    return execFileSync("git", ["-C", root, "log", "--format=%h %s", `${from}..HEAD`], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 }).toString().trim().split("\n").filter(Boolean).slice(0, 50);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------- verify */

interface PrePrRecord {
  contract: number;
  plugin: { name: string; version: string };
  work: string;
  branch: string | null;
  base_branch: string;
  /** The ref the target resolved to (diagnostics only — never compared on its own). */
  base_ref?: string;
  merge_base: string;
  code_fingerprint: string;
  code_map: Record<string, string>;
  review: { record_path: string; findings_fingerprint: string; counts: Record<string, number> };
  skill_fingerprint: string;
  checklist_fingerprint: string;
  counts: { must: number; should: number; watch: number; critical: number };
  title: string;
  checklist_path: string;
  pdf_path: string;
  result: "completed";
}

export function verifyPrePr(req: { root: string; work: string; data?: string | null; base?: string | null; doc?: string | null }, w0?: WorkState | Stop): Record<string, any> {
  const data = resolveDataDir(req.data);
  if (data === null) return { ok: false, status: "invalid", reasons: [{ code: "PRE_PR_DATA_UNRESOLVED", message: "the plugin's data directory could not be located — pass --data" }] };
  const w = w0 ?? workState(req);
  if (!w.ok) return { ok: false, status: "invalid", reasons: [{ code: w.outcome, message: w.reason }] };
  const dir = prePrDir(data.dir, w.root, w.work);
  const recPath = join(dir, "record.json");
  if (!existsSync(recPath)) return { ok: false, status: "missing", dir, reasons: [{ code: "PRE_PR_MISSING", message: "no Pre-PR has been recorded for this work" }] };
  let rec: PrePrRecord;
  try {
    rec = JSON.parse(readFileSync(recPath, "utf-8"));
  } catch {
    return { ok: false, status: "invalid", dir, reasons: [{ code: "PRE_PR_RECORD_INVALID", message: "the Pre-PR record is not readable JSON" }] };
  }
  if (rec?.contract !== PRE_PR_CONTRACT || rec.work !== w.work || rec.result !== "completed") return { ok: false, status: "invalid", dir, reasons: [{ code: "PRE_PR_RECORD_INVALID", message: "the Pre-PR record is not a completed record for this work" }] };

  const reasons: Array<{ code: string; message: string }> = [];
  const md = join(dir, CHECKLIST);
  const pdf = join(dir, PDF);
  if (!existsSync(md) || sha(readFileSync(md)) !== rec.checklist_fingerprint) reasons.push({ code: "PRE_PR_CHECKLIST_MISSING", message: "the recorded checklist is missing or was changed — run /pre-pr again" });
  if (w.review.status !== "fresh") reasons.push({ code: "PRE_PR_REVIEW_NOT_FRESH", message: `the internal review is ${w.review.status}` });
  else if (w.review.findings_fingerprint !== rec.review.findings_fingerprint || w.review.record_path !== rec.review.record_path) reasons.push({ code: "PRE_PR_REVIEW_CHANGED", message: "the internal review was recorded again since this Pre-PR" });
  if (w.scope.code_fingerprint !== rec.code_fingerprint) reasons.push({ code: "PRE_PR_CODE_CHANGED", message: "the pull request's code changed since this Pre-PR" });
  if (w.scope.merge_base !== rec.merge_base || w.scope.base.branch !== rec.base_branch) {
    const refMoved = rec.base_ref !== undefined && rec.base_ref !== w.scope.base.ref;
    reasons.push({ code: "PRE_PR_SCOPE_BASE_CHANGED", message: w.scope.base.branch !== rec.base_branch ? `the Pre-PR targeted ${rec.base_branch}; the pull request now targets ${w.scope.base.branch}` : refMoved ? `the target ${w.scope.base.branch} now resolves to ${w.scope.base.ref} (it was ${rec.base_ref} — a remote-tracking branch appeared or disappeared), and its merge base differs` : "the target branch's merge base moved since this Pre-PR (the target was merged in, or the branch was rebased)" });
  }
  // The checklist is for the pull request from this branch: another branch is another pull request.
  if (w.scope.branch !== rec.branch) reasons.push({ code: "PRE_PR_BRANCH_CHANGED", message: `this Pre-PR was recorded on ${rec.branch ?? "a detached HEAD"}; the current branch is ${w.scope.branch ?? "a detached HEAD"}` });

  const pdfOk = existsSync(pdf) && pdfPageCount(readFileSync(pdf)) === 1;
  const regenerate = { command: `python3 "${PDF_SCRIPT}" "${md}" --no-open`, then: `node --no-warnings "${join(PLUGIN_ROOT, "scripts", "pre-pr.ts")}" verify ${w.work} --root "${w.root}" --data "${data.dir}"` };
  const status = reasons.length > 0 ? "stale" : pdfOk ? "fresh" : "pdf-missing";
  return {
    ok: status === "fresh",
    status,
    dir,
    reasons: status === "pdf-missing" ? [{ code: "PRE_PR_PDF_MISSING", message: "the checklist is still valid but its PDF is missing — regenerate it (no new analysis)" }] : reasons,
    checklist_path: md,
    pdf_path: pdf,
    pdf_available: pdfOk,
    counts: rec.counts,
    title: rec.title,
    review: rec.review,
    code_map: rec.code_map,
    skill_current: rec.skill_fingerprint === skillFingerprint(),
    ...(status === "pdf-missing" ? { regenerate } : {}),
  };
}

/* --------------------------------------------------------------------- gate */

/** The dependency probes, replaceable through the function API (tests); the CLI always uses the real ones. */
export interface Probes {
  python: () => string | null;
  browser: () => string | null;
}
const REAL_PROBES: Probes = { python: findPython, browser: findBrowser };

export function prePrGate(req: { root: string; work: string; data?: string | null; base?: string | null; doc?: string | null }, probes: Probes = REAL_PROBES): Record<string, any> {
  const w = workState(req);
  if (!w.ok) return w;
  const blocked = readiness(w);
  if (blocked !== null) return blocked;
  const data = resolveDataDir(req.data);
  if (data === null) return { ok: false, outcome: "PRE_PR_DATA_UNRESOLVED", reason: "the plugin's persistent data directory could not be located — pass --data \"${CLAUDE_PLUGIN_DATA}\"" };
  if (inside(resolve(data.dir), w.root) || gitTopOf(data.dir) !== null) return { ok: false, outcome: "PRE_PR_DATA_DIR_IN_REPOSITORY", reason: `${data.dir} is inside a git repository — the checklist and PDF must stay outside every repository` };

  const existing = verifyPrePr(req, w);
  if (existing.status === "fresh") return { ok: true, outcome: "PRE_PR_FRESH", reason: "an unchanged Pre-PR is already recorded for exactly this code and review — nothing to rerun", pdf_path: existing.pdf_path, checklist_path: existing.checklist_path, counts: existing.counts, next: readyNext(w) };
  if (existing.status === "pdf-missing") return { ok: true, outcome: "PRE_PR_PDF_MISSING", reason: existing.reasons[0].message, regenerate: existing.regenerate, checklist_path: existing.checklist_path, pdf_path: existing.pdf_path };

  const python = probes.python();
  const browser = probes.browser();
  const missing = [python === null && "python3 (Python 3)", browser === null && "a Chromium-based browser (Chrome, Edge, Brave or Chromium — or set PRE_PR_BROWSER to its executable)"].filter(Boolean);
  if (missing.length > 0) return { ok: false, outcome: "PRE_PR_DEPENDENCY_MISSING", reason: `the Pre-PR PDF is mandatory and cannot be built without ${missing.join(" and ")}`, missing };

  const code = w.scope.files.filter((f) => f.class === "code");
  return {
    ok: true,
    outcome: "PRE_PR_READY",
    work: w.work,
    stale_reasons: existing.status === "stale" ? existing.reasons : [],
    python,
    skill: { name: "regression-checklist", qualified: `${PLUGIN_NAME}:regression-checklist`, script: PDF_SCRIPT },
    scope: {
      branch: w.scope.branch,
      target: w.scope.base.branch,
      merge_base: w.scope.merge_base,
      head: w.scope.head,
      commits: commits(w.root, w.scope.merge_base),
      files: code.map((f) => ({ path: f.path, change: f.change, committed: f.committed })),
      uncommitted: code.filter((f) => !f.committed).map((f) => f.path),
    },
    review: { record_path: w.review.record_path, counts: w.review.counts },
    store: prePrDir(data.dir, w.root, w.work),
  };
}

function readyNext(w: WorkState) {
  return w.type === "bug" ? nextCommand("create-dev-qa-notes", w.work) : null;
}

/* ------------------------------------------------------------------- record */

const refuse = (code: string, reason: string) => ({ ok: false, outcome: "PRE_PR_REFUSED", code, reason });

export function recordPrePr(req: { root: string; work: string; data?: string | null; base?: string | null; doc?: string | null; checklist: string; pdf: string }): Record<string, any> {
  const w = workState(req);
  if (!w.ok) return w;
  const blocked = readiness(w);
  if (blocked !== null) return { ...blocked, code: blocked.outcome };
  const data = resolveDataDir(req.data);
  if (data === null) return refuse("PRE_PR_DATA_UNRESOLVED", "the plugin's persistent data directory could not be located — pass --data");
  if (inside(resolve(data.dir), w.root) || gitTopOf(data.dir) !== null) return refuse("PRE_PR_DATA_DIR_IN_REPOSITORY", `${data.dir} is inside a git repository`);

  for (const [what, p] of [["checklist", req.checklist], ["PDF", req.pdf]] as const) {
    if (!p || !isAbsolute(p) || !existsSync(p) || !statSync(p).isFile()) return refuse("INVALID_ARGUMENT", `--${what === "PDF" ? "pdf" : "checklist"} must be the absolute path of the ${what} the skill wrote`);
    if (inside(realpathSync(p), w.root) || gitTopOf(p) !== null) return refuse("PRE_PR_INSIDE_REPOSITORY", `the ${what} ${p} is inside a git repository — it must never be part of a repository or a PR`);
  }
  const mdBuf = readFileSync(req.checklist);
  const parsed = parseChecklist(mdBuf.toString("utf-8"));
  if (!parsed.ok) return refuse("PRE_PR_CHECKLIST_INVALID", parsed.reason);
  const pdfBuf = readFileSync(req.pdf);
  if (pdfBuf.subarray(0, 5).toString("latin1") !== "%PDF-") return refuse("PRE_PR_PDF_INVALID", `${req.pdf} is not a PDF — the PDF is mandatory`);
  const pages = pdfPageCount(pdfBuf);
  if (pages !== 1) return refuse("PRE_PR_PDF_NOT_ONE_PAGE", `the PDF has ${pages} pages — it must be exactly one; shorten the checklist and build it again`);
  if (w.review.findings_fingerprint === null || w.review.record_path === null) return refuse("PRE_PR_REVIEW_MISSING", "the internal review record could not be read");

  const dir = prePrDir(data.dir, w.root, w.work);
  const record: PrePrRecord = {
    contract: PRE_PR_CONTRACT,
    plugin: { name: PLUGIN_NAME, version: JSON.parse(readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf-8")).version },
    work: w.work,
    branch: w.scope.branch,
    base_branch: w.scope.base.branch,
    base_ref: w.scope.base.ref,
    merge_base: w.scope.merge_base,
    code_fingerprint: w.scope.code_fingerprint,
    code_map: codeMap(w.scope),
    review: { record_path: w.review.record_path, findings_fingerprint: w.review.findings_fingerprint, counts: w.review.counts ?? {} },
    skill_fingerprint: skillFingerprint(),
    checklist_fingerprint: sha(mdBuf),
    counts: { must: parsed.must, should: parsed.should, watch: parsed.watch, critical: parsed.critical },
    title: parsed.title,
    checklist_path: join(dir, CHECKLIST),
    pdf_path: join(dir, PDF),
    result: "completed",
  };
  try {
    mkdirSync(dir, { recursive: true });
    const put = (target: string, write: (tmp: string) => void) => {
      const tmp = `${target}.pre-pr.tmp`;
      write(tmp);
      renameSync(tmp, target);
    };
    put(record.checklist_path, (t) => copyFileSync(req.checklist, t));
    put(record.pdf_path, (t) => copyFileSync(req.pdf, t));
    put(join(dir, "record.json"), (t) => writeFileSync(t, JSON.stringify(record, null, 2) + "\n"));
  } catch (e) {
    for (const f of [CHECKLIST, PDF, "record.json"]) {
      try {
        const t = join(dir, `${f}.pre-pr.tmp`);
        if (existsSync(t)) unlinkSync(t);
      } catch {
        /* best effort */
      }
    }
    return refuse("WRITE_FAILED", `could not write the Pre-PR record: ${(e as Error).message}`);
  }
  return {
    ok: true,
    outcome: "PRE_PR_RECORDED",
    pdf_path: record.pdf_path,
    checklist_path: record.checklist_path,
    counts: record.counts,
    next_command: readyNext(w),
  };
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
  const [cmd, work] = positional;
  const req = { root: flags.root ?? "", work: work ?? "", data: flags.data || null, base: flags.base || null, doc: flags.doc || null };
  if (cmd === "gate") print(prePrGate(req));
  if (cmd === "record") print(recordPrePr({ ...req, checklist: flags.checklist ?? "", pdf: flags.pdf ?? "" }));
  if (cmd === "verify") print(verifyPrePr(req));
  print({ ok: false, outcome: "UNKNOWN_COMMAND", reason: "usage: pre-pr.ts gate|record|verify <bug:<key>|feature:<feature>> --root <dir> --data <plugin data dir> [--checklist <md> --pdf <pdf>] [--base <branch>]" });
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /pre-pr\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) main();
