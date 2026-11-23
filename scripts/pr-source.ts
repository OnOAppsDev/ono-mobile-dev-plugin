/**
 * pr-source.ts — the one entry point /review-pr reads a pull request through, for GitHub and
 * Bitbucket Cloud. Read-only. Always exits 0 and prints one JSON object.
 *
 *   parse <PR URL>
 *       Which provider the URL names — PR_URL_PARSED with `provider`, or PR_URL_UNSUPPORTED /
 *       PR_URL_INVALID. No network. (/review-code uses it to redirect a PR URL to /review-pr.)
 *   fetch <PR URL> [--max-diff-bytes <n>]
 *       Retrieve and stage the pull request; prints the review `snapshot` — the provider, the
 *       pull request, and the head and base commits the whole review is pinned to.
 *   file <PR URL> --path <repo path> --commit <sha>
 *       One file at one commit. `--commit` is required: the snapshot's head commit for the
 *       changed code, its base commit for the code before the change, or the commit a reference
 *       names. A review never reads "the pull request's latest".
 *   head <PR URL> --expect <head sha>
 *       Whether the pull request's head is still the reviewed one: PR_HEAD_UNCHANGED, or
 *       PR_HEAD_CHANGED with the reviewed and current commits.
 *   cleanup <staging dir>
 *       Delete the staging directory `fetch` created (only such a directory).
 *
 * Providers — selected by the URL, nothing else:
 *   https://github.com/<owner>/<repo>/pull/<n>                  scripts/github-pr.ts (gh CLI login)
 *   https://bitbucket.org/<workspace>/<repo>/pull-requests/<n>  scripts/bitbucket-pr.ts (BITBUCKET_API_TOKEN)
 *
 * Outcomes are provider-neutral — a provider's BB_X / GH_X is reported as PR_X, with the
 * original in `provider_outcome` — so the command has one table to act on. Nothing here reads or
 * writes the current directory or any local repository: the review's code comes only from the
 * provider, at the snapshot's commits.
 */

import { realpathSync } from "fs";
import * as BB from "./bitbucket-pr.ts";
import * as GH from "./github-pr.ts";
import { writeStdout } from "./write-output.ts";

export type Provider = "github" | "bitbucket";
const SHA = /^[0-9a-f]{7,40}$/;

export function parseUrl(url: string): { ok: true; outcome: "PR_URL_PARSED"; provider: Provider; url: string; repository: string; number: number } | { ok: false; outcome: string; reason: string } {
  const u = (url ?? "").trim();
  const gh = GH.parsePrUrl(u);
  if (gh) return { ok: true, outcome: "PR_URL_PARSED", provider: "github", url: u, repository: `${gh.owner}/${gh.repo}`, number: gh.number };
  const bb = BB.parsePrUrl(u);
  if (bb) return { ok: true, outcome: "PR_URL_PARSED", provider: "bitbucket", url: u, repository: `${bb.workspace}/${bb.repo}`, number: bb.id };
  let host: string | null = null;
  try {
    host = new URL(u).host.toLowerCase();
  } catch {
    host = null;
  }
  if (host && host !== "github.com" && host !== "bitbucket.org") {
    return { ok: false, outcome: "PR_URL_UNSUPPORTED", reason: `${host} is not a supported pull request host — /review-pr reads GitHub (https://github.com/<owner>/<repo>/pull/<number>) and Bitbucket Cloud (https://bitbucket.org/<workspace>/<repo>/pull-requests/<id>)` };
  }
  return { ok: false, outcome: "PR_URL_INVALID", reason: "expected one pull request URL: https://github.com/<owner>/<repo>/pull/<number> or https://bitbucket.org/<workspace>/<repo>/pull-requests/<id>" };
}

/** BB_X / GH_X (and BB_PR_X / GH_PR_X) → PR_X, keeping the provider's own code. */
export function neutralOutcome(code: string): string {
  const m = /^(?:BB|GH)_(?:PR_)?(.+)$/.exec(code);
  return m ? `PR_${m[1]}` : code;
}
function neutral(o: Record<string, any>, provider: Provider): Record<string, any> {
  const code = String(o.outcome ?? "");
  const n = neutralOutcome(code);
  return { ...o, provider, outcome: n, ...(n !== code ? { provider_outcome: code } : {}) };
}

export interface Opts {
  env?: NodeJS.ProcessEnv;
  run?: GH.GhRunner;
  maxDiffBytes?: number;
}

export async function fetch(url: string, opts: Opts = {}): Promise<Record<string, any>> {
  const p = parseUrl(url);
  if (!p.ok) return p;
  const r = p.provider === "github" ? await GH.fetchPr(p.url, opts) : await BB.fetchPr(p.url, { env: opts.env, maxDiffBytes: opts.maxDiffBytes });
  const out = neutral(r, p.provider);
  if (r.ok !== true) return out;
  // The snapshot every later read is pinned to.
  out.snapshot = {
    provider: p.provider,
    url: p.url,
    repository: p.repository,
    number: p.number,
    head_commit: r.pr.source.commit,
    base_commit: r.pr.destination.commit,
    head_branch: r.pr.source.branch,
    base_branch: r.pr.destination.branch,
  };
  return out;
}

export async function file(url: string, path: string, commit: string | undefined, opts: Opts = {}): Promise<Record<string, any>> {
  const p = parseUrl(url);
  if (!p.ok) return p;
  if (!commit || !SHA.test(commit)) return { ok: false, provider: p.provider, outcome: "PR_COMMIT_REQUIRED", reason: "--commit <sha> is required — the review snapshot's head_commit (the changed code) or base_commit (the code before the change); a review never reads the pull request's latest revision" };
  const r = p.provider === "github" ? await GH.fetchFile(p.url, path, commit, opts) : await BB.fetchFile(p.url, path, { env: opts.env, commit });
  return neutral(r, p.provider);
}

export async function head(url: string, expect: string | undefined, opts: Opts = {}): Promise<Record<string, any>> {
  const p = parseUrl(url);
  if (!p.ok) return p;
  if (!expect || !SHA.test(expect)) return { ok: false, provider: p.provider, outcome: "PR_COMMIT_REQUIRED", reason: "--expect <sha> is required — the snapshot's head_commit the review covered" };
  const r = p.provider === "github" ? await GH.prHead(p.url, opts) : await BB.prHead(p.url, { env: opts.env });
  if (r.ok !== true) return neutral(r, p.provider);
  const unchanged = BB.sameCommit(expect, r.source);
  return {
    ok: true,
    provider: p.provider,
    outcome: unchanged ? "PR_HEAD_UNCHANGED" : "PR_HEAD_CHANGED",
    reviewed_commit: expect,
    current_commit: r.source,
    state: r.state,
    ...(unchanged ? {} : { message: `the pull request has new commits since the review started — this review covers ${expect.slice(0, 12)}, not the current head ${String(r.source ?? "?").slice(0, 12)}; run /review-pr again for the latest revision` }),
  };
}

export function cleanup(dir: string, env: NodeJS.ProcessEnv = process.env): Record<string, any> {
  const r = BB.cleanupStaging(dir, env);
  return { ...r, outcome: neutralOutcome(String(r.outcome)) };
}

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
    const [verb, target] = positional;
    if (verb === "parse") out = parseUrl(target ?? "");
    else if (verb === "fetch") out = await fetch(target ?? "", { maxDiffBytes: flags["max-diff-bytes"] ? Number(flags["max-diff-bytes"]) : undefined });
    else if (verb === "file") out = await file(target ?? "", flags.path ?? "", flags.commit);
    else if (verb === "head") out = await head(target ?? "", flags.expect);
    else if (verb === "cleanup") out = cleanup(target ?? "");
    else out = { ok: false, outcome: "UNKNOWN_COMMAND", reason: "usage: pr-source.ts parse <PR URL> | fetch <PR URL> [--max-diff-bytes <n>] | file <PR URL> --path <path> --commit <sha> | head <PR URL> --expect <sha> | cleanup <staging dir>" };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    const a = BB.auth();
    out = { ok: false, outcome: "PR_INTERNAL_ERROR", reason: GH.redact(a ? msg.split(a.secret).join("[redacted]") : msg) };
  }
  writeStdout(JSON.stringify(out, null, 2) + "\n");
  process.exit(0);
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /pr-source\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) void main();
