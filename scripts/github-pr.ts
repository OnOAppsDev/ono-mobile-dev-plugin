/**
 * github-pr.ts — read a GitHub pull request for /review-pr, through the developer's own GitHub
 * CLI login. GET only. Used through scripts/pr-source.ts, never on its own.
 *
 *   fetchPr(url)        the pull request's metadata, changed files (with their patches), commits,
 *                       staged in a new directory under the OS temp directory (the same staging,
 *                       files and result shape as scripts/bitbucket-pr.ts)
 *   fetchFile(url, path, commit)
 *                       one file at one commit — the caller always names the commit
 *   prHead(url)         the pull request's current head and base commits
 *
 * GitHub REST API (https://docs.github.com/rest), through `gh api`:
 *   GET repos/{owner}/{repo}/pulls/{n}                       metadata (head.sha, base.sha, …)
 *   GET repos/{owner}/{repo}/pulls/{n}/files?per_page=100    changed files with their patches (≤ 3000)
 *   GET repos/{owner}/{repo}/pulls/{n}/commits?per_page=100  commits (≤ 250)
 *   GET repos/{owner}/{repo}/contents/{path}?ref={sha}       file content at a commit (raw)
 *
 * Read-only by construction: the one call site runs `gh api --method GET` with an explicit
 * `repos/{owner}/{repo}/…` path — no request body, no field flags, no `{owner}` placeholder, so
 * the local repository is never consulted — and with the OS temp directory as its working
 * directory. No git, no checkout, no fetch into any local repository.
 *
 * Authentication is the developer's existing `gh auth login` (or GH_TOKEN / GITHUB_TOKEN, as gh
 * reads them). This helper never reads, prints or stores a token, and redacts anything
 * token-shaped from gh's messages before reporting them.
 *
 * Revision snapshot: the head and base commits are read before and after the file list and
 * commits; when either moved, `fetch` stops with GH_PR_MOVED. The diff is assembled from the
 * per-file patches GitHub returns for the pull request (merge base → head); a file without a
 * patch (binary, or too large for GitHub to inline) is reported as not retrieved, as is every file
 * past the size cap. Never full coverage when anything is missing.
 */

import { spawnSync } from "child_process";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createStaging, onoReferences, DEFAULT_MAX_DIFF_BYTES } from "./bitbucket-pr.ts";

const PR_URL = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]+)\/pull\/(\d+)(?:[/?#].*)?$/;
const MAX_FILE_BYTES = 512 * 1024;
const FILE_PAGES = 30; // 30 × 100 = GitHub's 3000-file limit for this endpoint
const COMMIT_PAGES = 3; // GitHub lists at most 250 commits for a pull request
const SHA = /^[0-9a-f]{7,40}$/;

type Fail = { ok: false; outcome: string; reason: string; [k: string]: unknown };
const isFail = (x: unknown): x is Fail => typeof x === "object" && x !== null && (x as Fail).ok === false;

/** One gh invocation: what the process printed, and how it ended. Injected in tests. */
export interface GhResult {
  status: number | null;
  stdout: Buffer;
  stderr: string;
  /** ENOENT when gh is not installed; ENOBUFS when the output exceeded the buffer. */
  error?: string;
}
export type GhRunner = (args: string[]) => GhResult;

export function parsePrUrl(url: string): { owner: string; repo: string; number: number } | null {
  const m = PR_URL.exec((url ?? "").trim());
  return m === null ? null : { owner: m[1], repo: m[2], number: Number(m[3]) };
}

/** The real runner: `gh` from PATH, never prompting, in the temp directory, output capped. */
export function defaultRunner(env: NodeJS.ProcessEnv = process.env): GhRunner {
  return (args) => {
    const p = spawnSync("gh", args, {
      cwd: tmpdir(),
      env: { ...env, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1", GH_SPINNER_DISABLED: "1" },
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    const code = (p.error as NodeJS.ErrnoException | undefined)?.code;
    return { status: p.status, stdout: p.stdout ?? Buffer.alloc(0), stderr: (p.stderr ?? Buffer.alloc(0)).toString("utf-8"), ...(code ? { error: code } : {}) };
  };
}

/** Anything token-shaped, and the environment's own tokens, removed from a message. */
export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text.replace(/\b(gh[opsur]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/g, "[redacted]");
  for (const k of ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"]) {
    const v = env[k]?.trim();
    if (v && v.length >= 8) out = out.split(v).join("[redacted]");
  }
  return out;
}

/** gh's failure, as an outcome the command can act on. */
function failure(r: GhResult, env: NodeJS.ProcessEnv, what: string): Fail {
  if (r.error === "ENOENT") return { ok: false, outcome: "GH_CLI_MISSING", reason: "the GitHub CLI (gh) is not installed — install it (Windows: winget install GitHub.cli · macOS: brew install gh), run `gh auth login`, then start Claude Code again. It is never installed for you." };
  if (r.error === "ENOBUFS") return { ok: false, outcome: "GH_TOO_LARGE", reason: `${what} is larger than this helper reads` };
  const msg = redact(r.stderr.trim(), env).split("\n").slice(0, 3).join(" ").slice(0, 400);
  const http = /HTTP (\d{3})/.exec(r.stderr)?.[1];
  if (r.status === 4 || /gh auth login|authentication required|not logged in/i.test(r.stderr)) return { ok: false, outcome: "GH_AUTH_MISSING", reason: "the GitHub CLI is not logged in — run `gh auth login` in a terminal, then start Claude Code again. Never paste a token into the chat." };
  if (http === "401") return { ok: false, outcome: "GH_UNAUTHORIZED", reason: "GitHub rejected the GitHub CLI's credential (expired or revoked) — run `gh auth login` again", http_status: 401 };
  if (http === "403" || http === "429") {
    if (/rate limit/i.test(r.stderr)) return { ok: false, outcome: "GH_RATE_LIMITED", reason: "GitHub's API rate limit is exceeded — stopped without retrying; try again later", http_status: Number(http) };
    return { ok: false, outcome: "GH_FORBIDDEN", reason: `your GitHub account has no access to ${what} (for an organisation with SSO, authorise the GitHub CLI's token for it: gh auth refresh) — ${msg}`, http_status: Number(http) };
  }
  if (http === "404") {
    if (/No commit found/i.test(r.stderr)) return { ok: false, outcome: "GH_REVISION_UNAVAILABLE", reason: `${what}: that commit is not available on GitHub (force-pushed away or never pushed) — it is reported as not reviewed, never replaced by another revision`, http_status: 404 };
    return { ok: false, outcome: "GH_NOT_FOUND", reason: `${what} was not found — the URL is wrong, it does not exist at that commit, or your GitHub account cannot see this private repository`, http_status: 404 };
  }
  if (http && Number(http) >= 500) return { ok: false, outcome: "GH_UNAVAILABLE", reason: `GitHub answered ${http}`, http_status: Number(http) };
  if (/could not resolve|error connecting|timeout|network/i.test(r.stderr)) return { ok: false, outcome: "GH_UNAVAILABLE", reason: `GitHub could not be reached — ${msg}` };
  return { ok: false, outcome: "GH_UNEXPECTED", reason: `gh failed${http ? ` (HTTP ${http})` : ""}: ${msg || `exit ${r.status}`}`, ...(http ? { http_status: Number(http) } : {}) };
}

/** The only call to GitHub: `gh api --method GET <explicit repos/… path>`. */
function api(run: GhRunner, path: string, accept: string): GhResult {
  if (!/^repos\/[^{}\s]+$/.test(path)) throw new Error(`refused a non-repository API path: ${path}`);
  return run(["api", "--method", "GET", "-H", `Accept: ${accept}`, "-H", "X-GitHub-Api-Version: 2022-11-28", path]);
}

function json(run: GhRunner, path: string, env: NodeJS.ProcessEnv, what: string): any | Fail {
  const r = api(run, path, "application/vnd.github+json");
  if (r.error || r.status !== 0) return failure(r, env, what);
  try {
    return JSON.parse(r.stdout.toString("utf-8"));
  } catch {
    return { ok: false, outcome: "GH_UNEXPECTED", reason: `GitHub returned something that is not JSON for ${what}` };
  }
}

const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

interface Ctx {
  run: GhRunner;
  env: NodeJS.ProcessEnv;
}
function ctx(opts: { env?: NodeJS.ProcessEnv; run?: GhRunner }): Ctx {
  const env = opts.env ?? process.env;
  return { env, run: opts.run ?? defaultRunner(env) };
}

export async function fetchPr(url: string, opts: { maxDiffBytes?: number; env?: NodeJS.ProcessEnv; run?: GhRunner } = {}): Promise<Record<string, any>> {
  const pr = parsePrUrl(url);
  if (pr === null) return { ok: false, outcome: "GH_URL_INVALID", reason: "expected a GitHub pull request URL: https://github.com/<owner>/<repo>/pull/<number>" };
  const { run, env } = ctx(opts);
  const repo = `repos/${pr.owner}/${pr.repo}`;
  const what = `pull request ${pr.owner}/${pr.repo}#${pr.number}`;

  const meta = json(run, `${repo}/pulls/${pr.number}`, env, what);
  if (isFail(meta)) return meta;
  const head = meta.head?.sha ?? null, baseSha = meta.base?.sha ?? null;
  if (!head || !baseSha) return { ok: false, outcome: "GH_UNEXPECTED", reason: "the pull request names no head or base commit — the review cannot be pinned to a revision" };

  // Changed files, with their patches; every page, bounded.
  const listed: any[] = [];
  let filesComplete = false;
  for (let page = 1; page <= FILE_PAGES; page++) {
    const batch = json(run, `${repo}/pulls/${pr.number}/files?per_page=100&page=${page}`, env, `the file list of ${what}`);
    if (isFail(batch)) return batch;
    if (!Array.isArray(batch)) return { ok: false, outcome: "GH_UNEXPECTED", reason: "GitHub's file list is not a list" };
    listed.push(...batch);
    if (batch.length < 100) {
      filesComplete = true;
      break;
    }
  }
  // GitHub states how many files the pull request changes; fewer listed is never complete.
  if (typeof meta.changed_files === "number" && listed.length < meta.changed_files) filesComplete = false;

  const commits: any[] = [];
  let commitsComplete = false;
  for (let page = 1; page <= COMMIT_PAGES; page++) {
    const batch = json(run, `${repo}/pulls/${pr.number}/commits?per_page=100&page=${page}`, env, `the commits of ${what}`);
    if (isFail(batch)) return batch;
    if (!Array.isArray(batch)) return { ok: false, outcome: "GH_UNEXPECTED", reason: "GitHub's commit list is not a list" };
    commits.push(...batch);
    if (batch.length < 100) {
      commitsComplete = true;
      break;
    }
  }
  if (typeof meta.commits === "number" && commits.length < meta.commits) commitsComplete = false;

  // The snapshot: the same head and base after everything was read.
  const after = json(run, `${repo}/pulls/${pr.number}`, env, what);
  if (isFail(after)) return after;
  if (after.head?.sha !== head || after.base?.sha !== baseSha) {
    return { ok: false, outcome: "GH_PR_MOVED", reason: "the pull request changed while it was being read (a new push, or its base moved) — run the review again", before: { head, base: baseSha }, after: { head: after.head?.sha ?? null, base: after.base?.sha ?? null } };
  }

  // The diff, from the per-file patches, cut at a file boundary at the cap.
  const cap = opts.maxDiffBytes ?? DEFAULT_MAX_DIFF_BYTES;
  let bytes = 0;
  let truncated = false;
  const sections: string[] = [];
  const files = listed.map((f: any) => {
    const path = String(f.filename ?? "?");
    const old = f.previous_filename ? String(f.previous_filename) : null;
    let retrieved = false;
    if (typeof f.patch === "string" && !truncated) {
      const a = f.status === "added" ? "/dev/null" : `a/${old ?? path}`;
      const b = f.status === "removed" ? "/dev/null" : `b/${path}`;
      const text = `diff --git a/${old ?? path} b/${path}\n${old ? `rename from ${old}\nrename to ${path}\n` : ""}--- ${a}\n+++ ${b}\n${f.patch}${f.patch.endsWith("\n") ? "" : "\n"}`;
      const size = Buffer.byteLength(text);
      if (bytes + size > cap) truncated = true;
      else {
        sections.push(text);
        bytes += size;
        retrieved = true;
      }
    }
    return { path, old_path: old, status: f.status ?? null, lines_added: f.additions ?? null, lines_removed: f.deletions ?? null, diff_retrieved: retrieved, listed: true, ...(typeof f.patch !== "string" ? { no_patch: true } : {}) };
  });
  const noPatch = files.filter((f) => f.no_patch).map((f) => f.path);
  const complete = filesComplete && !truncated && noPatch.length === 0;

  const dir = createStaging(env);
  if (isFail(dir)) return dir;
  const description = String(meta.body ?? "");
  writeFileSync(join(dir, "pr.json"), JSON.stringify({ id: meta.number, title: meta.title, state: meta.state, draft: meta.draft ?? false, merged: meta.merged ?? false, author: meta.user?.login ?? null, source: { branch: { name: meta.head?.ref ?? null }, commit: { hash: head } }, destination: { branch: { name: meta.base?.ref ?? null }, commit: { hash: baseSha } }, links: { html: meta.html_url ?? null } }, null, 2));
  writeFileSync(join(dir, "description.md"), description);
  writeFileSync(join(dir, "diffstat.json"), JSON.stringify(files, null, 2));
  writeFileSync(join(dir, "diff.patch"), sections.join(""));
  return {
    ok: true,
    outcome: complete ? "GH_PR_FETCHED" : "GH_PR_FETCHED_PARTIAL",
    coverage: complete ? "complete" : "incomplete",
    pr: {
      owner: pr.owner, repo: pr.repo, id: pr.number, title: meta.title ?? null, state: meta.state ?? null, draft: meta.draft ?? false, author: meta.user?.login ?? null,
      source: { branch: meta.head?.ref ?? null, commit: head },
      destination: { branch: meta.base?.ref ?? null, commit: baseSha },
    },
    staging_dir: dir,
    staged: ["pr.json", "description.md", "diffstat.json", "diff.patch"],
    files,
    files_not_retrieved: files.filter((f) => !f.diff_retrieved).map((f) => f.path),
    diffstat_complete: filesComplete,
    diff: { bytes, truncated, cap },
    commits: commits.map((c: any) => ({ hash: c.sha ?? null, message: String(c.commit?.message ?? "").split("\n")[0] })),
    commits_complete: commitsComplete,
    ono_references: onoReferences(description),
    warnings: [
      ...(truncated ? [{ code: "GH_DIFF_TOO_LARGE", message: `the diff exceeds ${cap} bytes — the files listed in files_not_retrieved were not reviewed from the diff; read them with \`file\` or report them as unreviewed` }] : []),
      ...(noPatch.length > 0 ? [{ code: "GH_PATCH_UNAVAILABLE", message: `GitHub returned no patch for ${noPatch.length} file(s) (binary, or too large to inline) — read them with \`file\` at the snapshot's commits or report them as unreviewed`, paths: noPatch }] : []),
      ...(!filesComplete ? [{ code: "GH_FILE_LIST_INCOMPLETE", message: `GitHub listed ${listed.length} of ${meta.changed_files ?? "?"} changed files (it lists at most 3000) — more files may exist and were not reviewed` }] : []),
    ],
  };
}

/** One file at one commit. The commit is required: a review never reads "the latest". */
export async function fetchFile(url: string, path: string, commit: string, opts: { env?: NodeJS.ProcessEnv; run?: GhRunner } = {}): Promise<Record<string, any>> {
  const pr = parsePrUrl(url);
  if (pr === null) return { ok: false, outcome: "GH_URL_INVALID", reason: "expected a GitHub pull request URL" };
  if (!path || path.startsWith("/") || path.split("/").includes("..") || /[?#]/.test(path)) return { ok: false, outcome: "GH_PATH_INVALID", reason: "a repository-relative path is required" };
  if (!SHA.test(commit ?? "")) return { ok: false, outcome: "GH_COMMIT_INVALID", reason: "--commit is a commit hash (the review snapshot's head or base commit)" };
  const { run, env } = ctx(opts);
  const r = api(run, `repos/${pr.owner}/${pr.repo}/contents/${enc(path)}?ref=${commit}`, "application/vnd.github.raw+json");
  if (r.error || r.status !== 0) return { ...failure(r, env, `${path} at ${commit.slice(0, 12)}`), path, commit };
  const truncated = r.stdout.length > MAX_FILE_BYTES;
  return { ok: true, outcome: "GH_FILE", path, commit, side: "commit", truncated, content: r.stdout.subarray(0, MAX_FILE_BYTES).toString("utf-8") };
}

/** The pull request's current head and base — for the end-of-review check. */
export async function prHead(url: string, opts: { env?: NodeJS.ProcessEnv; run?: GhRunner } = {}): Promise<Record<string, any>> {
  const pr = parsePrUrl(url);
  if (pr === null) return { ok: false, outcome: "GH_URL_INVALID", reason: "expected a GitHub pull request URL" };
  const { run, env } = ctx(opts);
  const meta = json(run, `repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`, env, `pull request ${pr.owner}/${pr.repo}#${pr.number}`);
  if (isFail(meta)) return meta;
  return { ok: true, outcome: "GH_PR_HEAD", state: meta.state ?? null, source: meta.head?.sha ?? null, destination: meta.base?.sha ?? null };
}
