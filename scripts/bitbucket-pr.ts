/**
 * bitbucket-pr.ts — read a Bitbucket Cloud pull request for /review-pr. GET only.
 *
 *   fetch <PR URL> [--max-diff-bytes <n>]
 *       The pull request's metadata, changed files (diffstat), commits and diff, staged in a new
 *       directory under the OS temp directory; prints a summary with the staging path, the files
 *       whose diff was and was not retrieved, and the specification and design references the
 *       description's `### Ono references (v1)` section links.
 *   file <PR URL> --path <repo path> [--side source|destination] [--commit <sha>]
 *   cleanup <staging dir>
 *       Delete the staging directory `fetch` created, once the review is reported — only a
 *       directory this helper created, holding only what it staged. Directories interrupted
 *       reviews left behind are pruned by `fetch` after a day.
 *       One file's content at the pull request's source (default) or destination commit — or at
 *       a commit a reference names — for the context around a change.
 *
 * Official Bitbucket Cloud REST API 2.0 (https://developer.atlassian.com/cloud/bitbucket/rest/):
 *   GET /repositories/{ws}/{repo}/pullrequests/{id}            metadata
 *   GET /repositories/{ws}/{repo}/pullrequests/{id}/diffstat   changed files (paginated; 302 to the repository diffstat)
 *   GET /repositories/{ws}/{repo}/pullrequests/{id}/diff       unified diff (302 to the repository diff)
 *   GET /repositories/{ws}/{repo}/pullrequests/{id}/commits    commits (paginated)
 *   GET /repositories/{ws}/{repo}/src/{commit}/{path}          file content
 *
 * Read-only by construction, not by instruction: the one request function sends `GET` and has
 * no way to send anything else; there is no git, no child process, and nothing is written but
 * the staging directory in the OS temp directory (refused if that is inside a git repository).
 *
 * Authentication: an Atlassian API token with the scopes read:pullrequest:bitbucket and
 * read:repository:bitbucket, from the environment — BITBUCKET_API_TOKEN, sent as a Bearer
 * token, or with BITBUCKET_EMAIL also set, as HTTP Basic (email + token). The token is never
 * printed, logged, written or sent to any host but the API's: redirects are followed manually,
 * and only to the API host. (A read:pullrequest scope also allows commenting — which is why the
 * read-only guarantee is this helper's, not the token's.)
 *
 * Revision snapshot: the pull request's source and destination commits are read before and
 * after the file list, commits and diff; when either moved in between (the author pushed, or the
 * target branch moved), `fetch` stops with BB_PR_MOVED rather than stage a diff of one revision
 * next to metadata of another. `/review-pr` reads it through scripts/pr-source.ts, which pins
 * every later file read to the snapshot's commits.
 *
 * Pagination follows `next` (page sizes are not part of the API). Rate limiting (429) stops at
 * once and reports the X-RateLimit-* headers — no retry loop. A 5xx is retried once. A diff
 * beyond the cap is cut at a file boundary; the files after it are reported as not retrieved.
 *
 * Always exits 0 and prints one JSON object.
 */

import { mkdtempSync, writeFileSync, realpathSync, existsSync, readdirSync, rmSync, statSync, lstatSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { figmaTarget } from "./figma-ref.ts";
import { writeStdout } from "./write-output.ts";

export const DEFAULT_API = "https://api.bitbucket.org/2.0";
export const DEFAULT_MAX_DIFF_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_PAGES = 20;
const MAX_REDIRECTS = 5;
const PR_URL = /^https:\/\/bitbucket\.org\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull-requests\/(\d+)(?:[/?#].*)?$/;

type Fail = { ok: false; outcome: string; reason: string; [k: string]: unknown };

/** The API base: the real one, or — for tests only — a loopback http server. */
export function apiBase(env = process.env): string {
  const o = env.BITBUCKET_API_BASE;
  if (o && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[^?#]*)?$/.test(o)) return o.replace(/\/$/, "");
  return DEFAULT_API;
}

export function parsePrUrl(url: string): { workspace: string; repo: string; id: number } | null {
  const m = PR_URL.exec((url ?? "").trim());
  return m === null ? null : { workspace: m[1], repo: m[2], id: Number(m[3]) };
}

interface Auth {
  header: string;
  secret: string;
}
export function auth(env = process.env): Auth | null {
  const token = env.BITBUCKET_API_TOKEN?.trim();
  if (!token) return null;
  const email = env.BITBUCKET_EMAIL?.trim();
  return { header: email ? `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}` : `Bearer ${token}`, secret: token };
}

/** Text with every trace of the credential removed. */
const redact = (s: string, a: Auth): string => s.split(a.secret).join("[redacted]").split(a.header).join("[redacted]");

interface Got {
  status: number;
  body: Buffer;
  truncated: boolean;
  headers: Record<string, string>;
}

/**
 * The only network call in this helper. GET, with the credential, to the API host only;
 * redirects followed by hand so the credential is never sent to another host.
 */
async function get(url: string, a: Auth, maxBytes: number, base: string, counter: { n: number }): Promise<Got | Fail> {
  const host = new URL(base).host;
  let target = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(target);
    if (u.host !== host || u.protocol !== new URL(base).protocol) return { ok: false, outcome: "BB_REDIRECT_REFUSED", reason: `refused to send the credential to ${u.protocol}//${u.host} — only ${host} is contacted` };
    let res: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      counter.n++;
      try {
        res = await fetch(target, { method: "GET", redirect: "manual", headers: { Authorization: a.header, Accept: "application/json, text/plain;q=0.9, */*;q=0.1", "User-Agent": "ono-mobile-dev-plugin/review-pr" } });
      } catch (e) {
        res = null;
        if (attempt === 1) return { ok: false, outcome: "BB_UNAVAILABLE", reason: `Bitbucket could not be reached: ${redact((e as Error).message, a)}` };
        continue;
      }
      if (res.status >= 500 && attempt === 0) {
        await res.body?.cancel();
        continue;
      }
      break;
    }
    if (res === null) return { ok: false, outcome: "BB_UNAVAILABLE", reason: "Bitbucket could not be reached" };
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      if (/^(x-ratelimit-|retry-after|location|content-type)/i.test(k)) headers[k.toLowerCase()] = v;
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel();
      if (!headers.location) return { ok: false, outcome: "BB_UNAVAILABLE", reason: `a ${res.status} redirect without a location` };
      target = new URL(headers.location, target).toString();
      continue;
    }
    const fail = (outcome: string, reason: string, extra: Record<string, unknown> = {}): Fail => ({ ok: false, outcome, reason, http_status: res!.status, ...extra });
    if (res.status === 401) return fail("BB_UNAUTHORIZED", "the API token was rejected (invalid, expired or revoked) — check BITBUCKET_API_TOKEN (and BITBUCKET_EMAIL when using Basic authentication)");
    if (res.status === 410) return fail("BB_GONE", "Bitbucket reports this credential as no longer accepted (app passwords are disabled) — use an Atlassian API token");
    if (res.status === 403) return fail("BB_FORBIDDEN", "the token has no access to this — it needs read:pullrequest:bitbucket and read:repository:bitbucket, and access to the repository");
    if (res.status === 404) return fail("BB_NOT_FOUND", "not found — the pull request URL is wrong, or the token cannot see this private repository");
    if (res.status === 429) {
      const rate = Object.fromEntries(Object.entries(headers).filter(([k]) => k.startsWith("x-ratelimit-") || k === "retry-after"));
      return fail("BB_RATE_LIMITED", "Bitbucket's rate limit for this resource is exceeded (a rolling one-hour window) — stopped without retrying", { rate_limit: rate });
    }
    if (res.status >= 500) return fail("BB_UNAVAILABLE", `Bitbucket answered ${res.status} twice`);
    if (res.status !== 200) return fail("BB_UNEXPECTED", `Bitbucket answered ${res.status}`);
    // Read up to the cap, never more.
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    const reader = res.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const b = Buffer.from(value);
        if (size + b.length > maxBytes) {
          chunks.push(b.subarray(0, maxBytes - size));
          size = maxBytes;
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(b);
        size += b.length;
      }
    }
    return { status: res.status, body: Buffer.concat(chunks), truncated, headers };
  }
  return { ok: false, outcome: "BB_UNAVAILABLE", reason: "too many redirects" };
}

const isFail = (x: unknown): x is Fail => typeof x === "object" && x !== null && (x as Fail).ok === false;

async function getJson(url: string, a: Auth, base: string, counter: { n: number }): Promise<any | Fail> {
  const g = await get(url, a, 16 * 1024 * 1024, base, counter);
  if (isFail(g)) return g;
  try {
    return JSON.parse(g.body.toString("utf-8"));
  } catch {
    return { ok: false, outcome: "BB_UNEXPECTED", reason: "Bitbucket returned something that is not JSON" };
  }
}

/** Every page of a paginated collection, following `next` on the same host. */
async function getAll(url: string, a: Auth, base: string, counter: { n: number }): Promise<{ values: any[]; complete: boolean } | Fail> {
  const values: any[] = [];
  let next: string | undefined = url;
  for (let page = 0; next && page < MAX_PAGES; page++) {
    const j = await getJson(next, a, base, counter);
    if (isFail(j)) return j;
    values.push(...(Array.isArray(j.values) ? j.values : []));
    next = typeof j.next === "string" ? j.next : undefined;
  }
  return { values, complete: next === undefined };
}

/** The links of the description's `### Ono references (v1)` section — what the author's PR says the spec and design are. */
export function onoReferences(description: string): { found: boolean; links: Array<Record<string, unknown>> } {
  const sec = /(^|\n)### Ono references \(v1\)\s*\n([\s\S]*?)(?=\n### |\n## |$)/.exec(description ?? "");
  const text = sec ? sec[2] : "";
  const links: Array<Record<string, unknown>> = [];
  for (const m of text.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)>\]]+)/g)) {
    const url = m[2] ?? m[3];
    const fig = figmaTarget(url);
    const src = /^https:\/\/bitbucket\.org\/[^/]+\/[^/]+\/src\/([0-9a-f]{7,40})\/(.+)$/.exec(url);
    // The same repository document on GitHub (pr-metadata.ts links it at the commit that carries it).
    const gh = src ? null : /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/([0-9a-f]{7,40})\/([^?#]+)/.exec(url);
    const at = src ?? gh;
    links.push({ label: m[1] ?? null, url, kind: fig ? "figma" : src ? "bitbucket-src" : gh ? "github-src" : "external", ...(fig ? { figma: { file_key: fig.file_key, node_id: fig.node_id } } : {}), ...(at ? { src: { commit: at[1], path: decodeURIComponent(at[2]) } } : {}) });
  }
  return { found: sec !== null, links };
}

/** The staging directory: a new one under the OS temp directory, never inside a git working tree. */
/** The files a review stages — nothing else is ever in a staging directory this helper created. */
export const STAGED_FILES = ["pr.json", "description.md", "diffstat.json", "diff.patch"];
const STAGING_PREFIX = "ono-review-pr-";
/** A staging directory left by an interrupted review is removed after this long. */
const STALE_STAGING_MS = 24 * 60 * 60 * 1000;

/**
 * Whether `dir` is a staging directory this helper created: directly under the temp directory,
 * named ono-review-pr-*, a real directory (not a link), holding only the staged files. Anything
 * else is never deleted.
 */
function ownStaging(dir: string, tmp: string): boolean {
  try {
    const st = lstatSync(dir);
    if (!st.isDirectory()) return false;
    const real = realpathSync(dir);
    if (dirname(real) !== realpathSync(tmp) || !real.split(/[\\/]/).pop()!.startsWith(STAGING_PREFIX)) return false;
    return readdirSync(real).every((f) => STAGED_FILES.includes(f) && lstatSync(join(real, f)).isFile());
  } catch {
    return false;
  }
}

/** Delete one review's staging directory — only one this helper created (`ownStaging`). */
export function cleanupStaging(dir: string, env: NodeJS.ProcessEnv = process.env): Record<string, any> {
  const tmp = env.TMPDIR || tmpdir();
  if (!dir || !ownStaging(dir, tmp)) return { ok: false, outcome: "BB_CLEANUP_REFUSED", reason: `${dir || "(none)"} is not a staging directory created by this helper — nothing was deleted` };
  rmSync(realpathSync(dir), { recursive: true, force: true });
  return { ok: true, outcome: "BB_STAGING_REMOVED", removed: dir };
}

/** Remove staging directories that interrupted reviews left behind more than a day ago. */
function pruneStaleStaging(tmp: string): void {
  try {
    for (const name of readdirSync(tmp)) {
      if (!name.startsWith(STAGING_PREFIX)) continue;
      const d = join(tmp, name);
      if (Date.now() - statSync(d).mtimeMs > STALE_STAGING_MS && ownStaging(d, tmp)) rmSync(d, { recursive: true, force: true });
    }
  } catch {
    /* best effort: pruning never stops a review */
  }
}

/** A new staging directory for one review — shared by every provider (scripts/pr-source.ts). */
export function createStaging(env: NodeJS.ProcessEnv = process.env): string | Fail {
  return staging(env);
}

function staging(env: NodeJS.ProcessEnv): string | Fail {
  let dir: string;
  try {
    dir = realpathSync(env.TMPDIR || tmpdir());
  } catch {
    return { ok: false, outcome: "BB_STAGING_UNAVAILABLE", reason: "the temp directory does not exist" };
  }
  // A git working tree contains a .git entry in one of its ancestors.
  for (let d = dir; ; d = dirname(d)) {
    if (existsSync(join(d, ".git"))) return { ok: false, outcome: "BB_STAGING_IN_REPOSITORY", reason: `the temp directory ${dir} is inside a git repository — set TMPDIR to a directory outside any repository` };
    if (dirname(d) === d) break;
  }
  pruneStaleStaging(dir);
  return mkdtempSync(join(dir, STAGING_PREFIX));
}

/** Per-file sections of a unified diff, and whether the last one was cut. */
function splitDiff(diff: string): Array<{ path: string; text: string }> {
  const parts = diff.split(/(?=^diff --git )/m).filter((p) => p.startsWith("diff --git "));
  return parts.map((p) => {
    const m = /^diff --git a\/(.+?) b\/(.+)$/m.exec(p);
    return { path: m ? m[2] : "?", text: p };
  });
}

export async function fetchPr(url: string, opts: { maxDiffBytes?: number; env?: NodeJS.ProcessEnv } = {}): Promise<Record<string, any>> {
  const env = opts.env ?? process.env;
  const pr = parsePrUrl(url);
  if (pr === null) return { ok: false, outcome: "BB_URL_INVALID", reason: "expected a Bitbucket Cloud pull request URL: https://bitbucket.org/<workspace>/<repo>/pull-requests/<id>" };
  const a = auth(env);
  if (a === null) return { ok: false, outcome: "BB_AUTH_MISSING", reason: "set BITBUCKET_API_TOKEN (an Atlassian API token with read:pullrequest:bitbucket and read:repository:bitbucket) — and BITBUCKET_EMAIL for Basic authentication — in your environment before starting Claude Code; never paste a token into the chat" };
  const base = apiBase(env);
  const counter = { n: 0 };
  const repoUrl = `${base}/repositories/${encodeURIComponent(pr.workspace)}/${encodeURIComponent(pr.repo)}`;
  const prUrl = `${repoUrl}/pullrequests/${pr.id}`;
  const done = (o: Record<string, any>) => JSON.parse(redact(JSON.stringify({ ...o, requests: counter.n }), a));

  const meta = await getJson(prUrl, a, base, counter);
  if (isFail(meta)) return done(meta);
  const stats = await getAll(`${prUrl}/diffstat`, a, base, counter);
  if (isFail(stats)) return done(stats);
  const commits = await getAll(`${prUrl}/commits`, a, base, counter);
  if (isFail(commits)) return done(commits);
  const cap = opts.maxDiffBytes ?? DEFAULT_MAX_DIFF_BYTES;
  const diff = await get(`${prUrl}/diff`, a, cap, base, counter);
  if (isFail(diff)) return done(diff);
  // The snapshot: the same source and destination commits after everything was read.
  const after = await getJson(prUrl, a, base, counter);
  if (isFail(after)) return done(after);
  const before = { source: meta.source?.commit?.hash ?? null, destination: meta.destination?.commit?.hash ?? null };
  const now = { source: after.source?.commit?.hash ?? null, destination: after.destination?.commit?.hash ?? null };
  if (!before.source || !before.destination) return done({ ok: false, outcome: "BB_UNEXPECTED", reason: "the pull request names no source or destination commit — the review cannot be pinned to a revision" });
  if (!sameCommit(before.source, now.source) || !sameCommit(before.destination, now.destination)) {
    return done({ ok: false, outcome: "BB_PR_MOVED", reason: "the pull request changed while it was being read (a new push, or the target branch moved) — run the review again", before, after: now });
  }

  const dir = staging(env);
  if (isFail(dir)) return done(dir);
  let sections = splitDiff(diff.body.toString("utf-8"));
  if (diff.truncated && sections.length > 0) sections = sections.slice(0, -1); // the last section was cut mid-way
  const retrieved = new Set(sections.map((s) => s.path));
  const files = stats.values.map((s: any) => {
    const path = s.new?.path ?? s.old?.path ?? "?";
    return { path, old_path: s.old?.path ?? null, status: s.status ?? null, lines_added: s.lines_added ?? null, lines_removed: s.lines_removed ?? null, diff_retrieved: retrieved.has(path), listed: true };
  });
  // Files in the diff that an incomplete file list did not name are still reported — never dropped.
  for (const sec of sections) if (sec.path !== "?" && !files.some((f: any) => f.path === sec.path)) files.push({ path: sec.path, old_path: null, status: null, lines_added: null, lines_removed: null, diff_retrieved: true, listed: false });
  const complete = stats.complete && !diff.truncated;
  const description = String(meta.description ?? meta.summary?.raw ?? "");
  writeFileSync(join(dir, "pr.json"), JSON.stringify({ id: meta.id, title: meta.title, state: meta.state, author: meta.author?.display_name ?? null, source: meta.source, destination: meta.destination, links: { html: meta.links?.html?.href ?? null } }, null, 2));
  writeFileSync(join(dir, "description.md"), description);
  writeFileSync(join(dir, "diffstat.json"), JSON.stringify(files, null, 2));
  writeFileSync(join(dir, "diff.patch"), sections.map((s) => s.text).join(""));
  return done({
    ok: true,
    outcome: complete ? "BB_PR_FETCHED" : "BB_PR_FETCHED_PARTIAL",
    /** `incomplete` whenever the file list or the diff is not whole: the review then never claims full coverage. */
    coverage: complete ? "complete" : "incomplete",
    pr: {
      workspace: pr.workspace, repo: pr.repo, id: pr.id, title: meta.title ?? null, state: meta.state ?? null, author: meta.author?.display_name ?? null,
      source: { branch: meta.source?.branch?.name ?? null, commit: meta.source?.commit?.hash ?? null },
      destination: { branch: meta.destination?.branch?.name ?? null, commit: meta.destination?.commit?.hash ?? null },
    },
    staging_dir: dir,
    staged: ["pr.json", "description.md", "diffstat.json", "diff.patch"],
    files,
    files_not_retrieved: files.filter((f: any) => !f.diff_retrieved).map((f: any) => f.path),
    diffstat_complete: stats.complete,
    diff: { bytes: diff.body.length, truncated: diff.truncated, cap },
    commits: commits.values.map((c: any) => ({ hash: c.hash ?? null, message: String(c.message ?? "").split("\n")[0] })),
    commits_complete: commits.complete,
    ono_references: onoReferences(description),
    warnings: [
      ...(diff.truncated ? [{ code: "BB_DIFF_TOO_LARGE", message: `the diff exceeds ${cap} bytes — the files listed in files_not_retrieved were not reviewed from the diff; read them with \`file\` or report them as unreviewed` }] : []),
      ...(!stats.complete ? [{ code: "BB_FILE_LIST_INCOMPLETE", message: `the pull request's file list has more than ${MAX_PAGES} pages; only the files listed here were discovered — more files may exist and were not reviewed` }] : []),
    ],
  });
}

export async function fetchFile(url: string, path: string, opts: { side?: string; commit?: string; env?: NodeJS.ProcessEnv } = {}): Promise<Record<string, any>> {
  const env = opts.env ?? process.env;
  const pr = parsePrUrl(url);
  if (pr === null) return { ok: false, outcome: "BB_URL_INVALID", reason: "expected a Bitbucket Cloud pull request URL" };
  if (!path || path.startsWith("/") || path.split("/").includes("..")) return { ok: false, outcome: "BB_PATH_INVALID", reason: "a repository-relative path is required" };
  if (opts.commit !== undefined && !/^[0-9a-f]{7,40}$/.test(opts.commit)) return { ok: false, outcome: "BB_COMMIT_INVALID", reason: "--commit is a commit hash" };
  const a = auth(env);
  if (a === null) return { ok: false, outcome: "BB_AUTH_MISSING", reason: "set BITBUCKET_API_TOKEN in your environment before starting Claude Code; never paste a token into the chat" };
  const base = apiBase(env);
  const counter = { n: 0 };
  const done = (o: Record<string, any>) => JSON.parse(redact(JSON.stringify({ ...o, requests: counter.n }), a));
  const repoUrl = `${base}/repositories/${encodeURIComponent(pr.workspace)}/${encodeURIComponent(pr.repo)}`;
  let commit = opts.commit;
  if (commit === undefined) {
    const meta = await getJson(`${repoUrl}/pullrequests/${pr.id}`, a, base, counter);
    if (isFail(meta)) return done(meta);
    commit = (opts.side === "destination" ? meta.destination : meta.source)?.commit?.hash;
    if (!commit) return done({ ok: false, outcome: "BB_UNEXPECTED", reason: "the pull request names no commit for that side" });
  }
  const g = await get(`${repoUrl}/src/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`, a, MAX_FILE_BYTES, base, counter);
  if (isFail(g)) return done({ ...g, path, commit });
  return done({ ok: true, outcome: "BB_FILE", path, commit, side: opts.commit ? "commit" : opts.side === "destination" ? "destination" : "source", truncated: g.truncated, content: g.body.toString("utf-8") });
}

/** Two commit hashes name the same commit — Bitbucket abbreviates to 12 characters in places. */
export function sameCommit(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = a.toLowerCase(), y = b.toLowerCase();
  return x.length >= 7 && y.length >= 7 && (x.startsWith(y) || y.startsWith(x));
}

/** The pull request's current source and destination commits — for the end-of-review check. */
export async function prHead(url: string, opts: { env?: NodeJS.ProcessEnv } = {}): Promise<Record<string, any>> {
  const env = opts.env ?? process.env;
  const pr = parsePrUrl(url);
  if (pr === null) return { ok: false, outcome: "BB_URL_INVALID", reason: "expected a Bitbucket Cloud pull request URL" };
  const a = auth(env);
  if (a === null) return { ok: false, outcome: "BB_AUTH_MISSING", reason: "set BITBUCKET_API_TOKEN in your environment before starting Claude Code; never paste a token into the chat" };
  const base = apiBase(env);
  const counter = { n: 0 };
  const meta = await getJson(`${base}/repositories/${encodeURIComponent(pr.workspace)}/${encodeURIComponent(pr.repo)}/pullrequests/${pr.id}`, a, base, counter);
  const done = (o: Record<string, any>) => JSON.parse(redact(JSON.stringify({ ...o, requests: counter.n }), a));
  if (isFail(meta)) return done(meta);
  return done({ ok: true, outcome: "BB_PR_HEAD", state: meta.state ?? null, source: meta.source?.commit?.hash ?? null, destination: meta.destination?.commit?.hash ?? null });
}

/* --------------------------------------------------------------------- CLI */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(args[i]);
    if (!m) positional.push(args[i]);
    else flags[m[1]] = m[2] !== undefined ? m[2] : args[++i] ?? "";
  }
  let out: Record<string, any>;
  try {
    if (positional[0] === "fetch") out = await fetchPr(positional[1] ?? "", { maxDiffBytes: flags["max-diff-bytes"] ? Number(flags["max-diff-bytes"]) : undefined });
    else if (positional[0] === "file") out = await fetchFile(positional[1] ?? "", flags.path ?? "", { side: flags.side, commit: flags.commit || undefined });
    else if (positional[0] === "cleanup") out = cleanupStaging(positional[1] ?? "");
    else out = { ok: false, outcome: "UNKNOWN_COMMAND", reason: "usage: bitbucket-pr.ts fetch <PR URL> [--max-diff-bytes <n>] | file <PR URL> --path <path> [--side source|destination] [--commit <sha>]" };
  } catch (e) {
    const a = auth();
    const msg = (e as Error).message ?? String(e);
    out = { ok: false, outcome: "BB_INTERNAL_ERROR", reason: a ? redact(msg, a) : msg };
  }
  writeStdout(JSON.stringify(out, null, 2) + "\n");
  process.exit(0);
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /bitbucket-pr\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) void main();
