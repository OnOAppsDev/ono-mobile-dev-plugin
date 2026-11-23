/**
 * pr-source.test.ts
 *
 * Pins /review-pr's provider layer (0.8.0 integration remediation):
 *   - scripts/pr-source.ts: URL validation and provider detection (GitHub, Bitbucket Cloud,
 *     unsupported hosts), provider-neutral outcomes, the review snapshot, `file` requiring a
 *     commit, and the end-of-review head check;
 *   - scripts/github-pr.ts against a fake GitHub CLI that records every invocation: metadata,
 *     paginated files and commits, the diff assembled from patches, large and incomplete pull
 *     requests, every error class (gh missing, not logged in, 401, 403/SSO, rate limit, 404 /
 *     private repository, unavailable revision, 5xx), credential redaction, a pull request that
 *     moves while it is read, and reads pinned to the snapshot's commits — deleted, renamed and
 *     Hebrew-named files included;
 *   - read-only by construction: every gh call is `gh api --method GET repos/…`, nothing else;
 *   - no local checkout contamination: run from a repository on another branch with uncommitted
 *     changes to the same file, or from an unrelated repository, the review reads the provider's
 *     content, and the local repositories are left exactly as they were;
 *   - the CLI end to end, with a fake `gh` executable on PATH.
 *
 * Bitbucket's own retrieval and its snapshot are pinned in scripts/bitbucket-pr.test.ts; the
 * review-pr-guard hook and the command/agent contract in both suites.
 *
 *   node --no-warnings scripts/pr-source.test.ts
 */

import { spawnSync, execFileSync } from "child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as PS from "./pr-source.ts";
import * as GH from "./github-pr.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf-8");
const TMP = realpathSync(mkdtempSync(join(tmpdir(), "pr-source-")));
const STAGE = join(TMP, "stage");
mkdirSync(STAGE);

const URL_GH = "https://github.com/OnOAppsDev/yes-tv/pull/12";
const H1 = "1".repeat(40), H2 = "2".repeat(40), B1 = "b".repeat(40);
// Token-shaped strings, assembled at run time so no secret-shaped literal sits in the source.
const TOKEN = ["gh", "o_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");
const ENV_TOKEN = ["fake", "gh", "env", "token", "for", "tests", "0002"].join("-");

/* ------------------------------------------------------------ fake GitHub CLI */

interface Fixture {
  headSeq: string[]; // the head sha each successive metadata read returns (the last one repeats)
  base: string;
  files: Array<Record<string, unknown>>;
  changedFiles?: number;
  commits: number;
  contents: Record<string, string>; // "<path>@<sha>" → content
  knownCommits: string[];
  fail?: { match: RegExp; status: number | null; stderr: string; error?: string };
  body?: string;
}
const DESCRIPTION = `## Login\n\n### Ono references (v1)\n\n**Specification**\n- Detailed Design: [docs/login/login-DD.md](https://github.com/OnOAppsDev/yes-tv/blob/${H1}/docs/login/login-DD.md)\n**UI / design**\n- Figma: [Login](https://www.figma.com/design/AbC123/Login?node-id=42-7) — node \`42:7\`\n`;
const patch = (i: number) => `@@ -1 +1 @@\n-old ${i}\n+new ${i} ${"x".repeat(100)}`;
function fixture(n = 3, extra: Partial<Fixture> = {}): Fixture {
  return {
    headSeq: [H1],
    base: B1,
    files: Array.from({ length: n }, (_, i) => ({ filename: `src/f${i}.ts`, status: "modified", additions: 1, deletions: 1, patch: patch(i) })),
    commits: 2,
    contents: { [`src/f0.ts@${H1}`]: "export const head1 = 1;\n", [`src/f0.ts@${H2}`]: "export const head2 = 2;\n", [`src/f0.ts@${B1}`]: "export const base = 0;\n", [`docs/login/login-DD.md@${H1}`]: "# DD\n" },
    knownCommits: [H1, H2, B1],
    body: DESCRIPTION,
    ...extra,
  };
}

/** A runner backed by a fixture, recording every argv. Mirrors gh's real exit codes and messages. */
function fakeGh(fx: Fixture, calls: string[][]): GH.GhRunner {
  let metaReads = 0;
  const ok = (body: string | Buffer) => ({ status: 0, stdout: Buffer.isBuffer(body) ? body : Buffer.from(body), stderr: "" });
  const http = (code: number, msg: string) => ({ status: 1, stdout: Buffer.from(`{"message":"${msg}"}`), stderr: `gh: ${msg} (HTTP ${code})\n` });
  return (args) => {
    calls.push(args);
    const path = args[args.length - 1];
    if (fx.fail && fx.fail.match.test(path)) return { status: fx.fail.status, stdout: Buffer.alloc(0), stderr: fx.fail.stderr, ...(fx.fail.error ? { error: fx.fail.error } : {}) };
    const u = new URL(`https://api.github.com/${path}`);
    const p = u.pathname.replace(/^\//, "");
    const page = Number(u.searchParams.get("page") ?? "1");
    const per = Number(u.searchParams.get("per_page") ?? "30");
    if (/^repos\/OnOAppsDev\/yes-tv\/pulls\/12$/.test(p)) {
      const head = fx.headSeq[Math.min(metaReads++, fx.headSeq.length - 1)];
      return ok(JSON.stringify({ number: 12, title: "Login with one-time code", state: "open", draft: false, merged: false, user: { login: "dana" }, body: fx.body, head: { ref: "feature/login", sha: head }, base: { ref: "develop", sha: fx.base }, changed_files: fx.changedFiles ?? fx.files.length, commits: fx.commits, html_url: URL_GH }));
    }
    if (/^repos\/OnOAppsDev\/yes-tv\/pulls\/12\/files$/.test(p)) return ok(JSON.stringify(fx.files.slice((page - 1) * per, page * per)));
    if (/^repos\/OnOAppsDev\/yes-tv\/pulls\/12\/commits$/.test(p)) return ok(JSON.stringify(Array.from({ length: fx.commits }, (_, i) => ({ sha: `${i}`.repeat(40).slice(0, 40), commit: { message: `Commit ${i}\n\nbody` } })).slice((page - 1) * per, page * per)));
    const c = /^repos\/OnOAppsDev\/yes-tv\/contents\/(.+)$/.exec(p);
    if (c) {
      const ref = u.searchParams.get("ref") ?? "";
      if (!fx.knownCommits.includes(ref)) return http(404, `No commit found for the ref ${ref}`);
      const key = `${decodeURIComponent(c[1])}@${ref}`;
      return key in fx.contents ? ok(fx.contents[key]) : http(404, "Not Found");
    }
    if (/^repos\/OnOAppsDev\/(secret|missing)\/pulls\/\d+$/.test(p)) return http(404, "Not Found");
    return http(404, "Not Found");
  };
}

const ENV = { ...process.env, TMPDIR: STAGE };
const run = (fx: Fixture, calls: string[][] = []) => ({ env: ENV, run: fakeGh(fx, calls) });

async function main(): Promise<void> {
  /* 1. URLs and providers — no network. */
  {
    const g = PS.parseUrl(URL_GH);
    check("url: a GitHub PR URL → github", g.ok === true && (g as any).provider === "github" && (g as any).repository === "OnOAppsDev/yes-tv" && (g as any).number === 12);
    const b = PS.parseUrl("https://bitbucket.org/onoapps/yes-tv/pull-requests/42");
    check("url: a Bitbucket Cloud PR URL → bitbucket", b.ok === true && (b as any).provider === "bitbucket" && (b as any).number === 42);
    check("url: trailing path, query and fragment are tolerated", (PS.parseUrl(`${URL_GH}/files?w=1#diff`) as any).provider === "github" && (PS.parseUrl("https://bitbucket.org/a/b/pull-requests/3/diff") as any).provider === "bitbucket");
    for (const bad of ["", "not a url", "https://github.com/o/r/issues/12", "https://github.com/o/r/pull/abc", "http://github.com/o/r/pull/1", "https://bitbucket.org/a/b/pull-request/3", "https://github.com/o/r/pull/1 ; rm -rf /"]) {
      check(`url: invalid — ${JSON.stringify(bad)}`, PS.parseUrl(bad).outcome === "PR_URL_INVALID", JSON.stringify(PS.parseUrl(bad)));
    }
    for (const host of ["https://gitlab.com/o/r/-/merge_requests/1", "https://github.example.com/o/r/pull/1", "https://bitbucket.example.org/projects/P/repos/r/pull-requests/1"]) {
      const r = PS.parseUrl(host);
      check(`url: unsupported host — ${new URL(host).host}`, r.outcome === "PR_URL_UNSUPPORTED" && /GitHub/.test((r as any).reason) && /Bitbucket/.test((r as any).reason));
    }
    check("outcomes: provider codes map to one neutral table", PS.neutralOutcome("BB_PR_FETCHED") === "PR_FETCHED" && PS.neutralOutcome("GH_PR_FETCHED_PARTIAL") === "PR_FETCHED_PARTIAL" && PS.neutralOutcome("GH_AUTH_MISSING") === "PR_AUTH_MISSING" && PS.neutralOutcome("BB_PR_MOVED") === "PR_MOVED" && PS.neutralOutcome("GH_PR_MOVED") === "PR_MOVED");
  }

  /* 2. GitHub retrieval. */
  {
    const calls: string[][] = [];
    const fx = fixture(150);
    const r = await PS.fetch(URL_GH, run(fx, calls));
    check("github fetch: retrieved", r.ok === true && r.outcome === "PR_FETCHED" && r.provider === "github" && r.provider_outcome === "GH_PR_FETCHED", JSON.stringify(r).slice(0, 300));
    check("github fetch: the snapshot pins head and base commits", r.snapshot?.head_commit === H1 && r.snapshot?.base_commit === B1 && r.snapshot?.head_branch === "feature/login" && r.snapshot?.base_branch === "develop" && r.snapshot?.repository === "OnOAppsDev/yes-tv" && r.snapshot?.number === 12);
    check("github fetch: pagination — 150 files over two pages of 100", r.files?.length === 150 && calls.filter((c) => /pulls\/12\/files/.test(c[c.length - 1])).length === 2 && r.diffstat_complete === true);
    check("github fetch: complete coverage, every file's patch in the staged diff", r.coverage === "complete" && r.files_not_retrieved.length === 0 && readFileSync(join(r.staging_dir, "diff.patch"), "utf-8").split("diff --git ").length - 1 === 150);
    check("github fetch: commits listed with their first line", r.commits?.length === 2 && r.commits[0].message === "Commit 0" && r.commits_complete === true);
    check("github fetch: staged under the temp directory, outside every repository", String(r.staging_dir).startsWith(STAGE) && ["pr.json", "description.md", "diffstat.json", "diff.patch"].every((f) => existsSync(join(r.staging_dir, f))));
    const prJson = JSON.parse(readFileSync(join(r.staging_dir, "pr.json"), "utf-8"));
    check("github fetch: pr.json has the same shape as Bitbucket's (source / destination commits)", prJson.source?.commit?.hash === H1 && prJson.destination?.commit?.hash === B1 && prJson.title === "Login with one-time code");
    check("github fetch: the Ono references section is read back — GitHub repository document and Figma node", r.ono_references?.found === true && r.ono_references.links.some((l: any) => l.kind === "github-src" && l.src.path === "docs/login/login-DD.md" && l.src.commit === H1) && r.ono_references.links.some((l: any) => l.kind === "figma" && l.figma.node_id === "42:7" && l.figma.file_key === "AbC123"));
    check("github fetch: metadata read before and after (the snapshot bracket)", calls.filter((c) => /pulls\/12$/.test(c[c.length - 1])).length === 2);
    check("read-only: every gh call is `gh api --method GET repos/…` with no body or field flags", calls.length > 0 && calls.every((c) => c[0] === "api" && c[1] === "--method" && c[2] === "GET" && /^repos\/OnOAppsDev\/yes-tv\//.test(c[c.length - 1]) && !c.some((a) => /^(-f|-F|--field|--raw-field|--input|-X|--method=(?!GET))/.test(a)) && c.filter((a) => a === "--method").length === 1), JSON.stringify(calls.find((c) => c[0] !== "api")));
    check("read-only: no `{owner}` placeholder — the local repository is never consulted", calls.every((c) => !c.join(" ").includes("{")));
    PS.cleanup(r.staging_dir, ENV);

    // Large pull request: cut at a file boundary.
    const big = await PS.fetch(URL_GH, { ...run(fixture(10)), maxDiffBytes: 600 });
    check("large PR: cut at a file boundary; the rest reported as not retrieved", big.outcome === "PR_FETCHED_PARTIAL" && big.coverage === "incomplete" && big.diff.truncated === true && big.files_not_retrieved.length >= 6 && big.warnings.some((w: any) => w.code === "GH_DIFF_TOO_LARGE"), JSON.stringify(big.files_not_retrieved));
    PS.cleanup(big.staging_dir, ENV);

    // A binary or oversized file without a patch.
    const fxBin = fixture(3);
    delete (fxBin.files[1] as any).patch;
    const bin = await PS.fetch(URL_GH, run(fxBin));
    check("incomplete diff: a file without a patch is not retrieved, coverage incomplete", bin.outcome === "PR_FETCHED_PARTIAL" && bin.files_not_retrieved.join() === "src/f1.ts" && bin.warnings.some((w: any) => w.code === "GH_PATCH_UNAVAILABLE"));
    PS.cleanup(bin.staging_dir, ENV);

    // GitHub lists at most 3000 files: bounded, and never full coverage.
    const calls2: string[][] = [];
    const huge = await PS.fetch(URL_GH, run(fixture(3000, { changedFiles: 3400 }), calls2));
    check("pagination: bounded at 30 pages", calls2.filter((c) => /pulls\/12\/files/.test(c[c.length - 1])).length === 30);
    check("incomplete file list: never full coverage, says more files may exist", huge.ok === true && huge.diffstat_complete === false && huge.coverage === "incomplete" && huge.warnings.some((w: any) => w.code === "GH_FILE_LIST_INCOMPLETE" && /more files may exist/.test(w.message)));
    PS.cleanup(huge.staging_dir, ENV);

    // Renamed and deleted files.
    const fxRn = fixture(1);
    fxRn.files.push({ filename: "src/new-name.ts", previous_filename: "src/old-name.ts", status: "renamed", additions: 0, deletions: 0, patch: "@@ -1 +1 @@\n-a\n+b" });
    fxRn.files.push({ filename: "src/gone.ts", status: "removed", additions: 0, deletions: 3, patch: "@@ -1,3 +0,0 @@\n-a\n-b\n-c" });
    fxRn.contents[`src/old-name.ts@${B1}`] = "old";
    fxRn.contents[`src/new-name.ts@${H1}`] = "new";
    fxRn.contents[`src/gone.ts@${B1}`] = "was here";
    const rn = await PS.fetch(URL_GH, run(fxRn));
    const diff = readFileSync(join(rn.staging_dir, "diff.patch"), "utf-8");
    check("renamed file: old and new paths kept, rename in the diff", rn.files.some((f: any) => f.path === "src/new-name.ts" && f.old_path === "src/old-name.ts" && f.status === "renamed") && /rename from src\/old-name\.ts\nrename to src\/new-name\.ts/.test(diff));
    check("deleted file: diffed against /dev/null", /\+\+\+ \/dev\/null/.test(diff) && rn.files.some((f: any) => f.path === "src/gone.ts" && f.status === "removed"));
    check("renamed file: the old path at the base commit", (await PS.file(URL_GH, "src/old-name.ts", B1, run(fxRn))).content === "old");
    check("renamed file: the new path at the head commit", (await PS.file(URL_GH, "src/new-name.ts", H1, run(fxRn))).content === "new");
    const gone = await PS.file(URL_GH, "src/gone.ts", H1, run(fxRn));
    check("deleted file: not found at the head — reported, never substituted", gone.ok === false && gone.outcome === "PR_NOT_FOUND" && gone.commit === H1);
    check("deleted file: its old content at the base commit", (await PS.file(URL_GH, "src/gone.ts", B1, run(fxRn))).content === "was here");
    PS.cleanup(rn.staging_dir, ENV);
  }

  /* 3. Revision pinning. */
  {
    // A stable pull request: the head check passes.
    const stable = fixture(2);
    const s = await PS.fetch(URL_GH, run(stable));
    const h = await PS.head(URL_GH, s.snapshot.head_commit, run(stable));
    check("stable PR: head unchanged at the end of the review", h.ok === true && h.outcome === "PR_HEAD_UNCHANGED" && h.reviewed_commit === H1 && h.current_commit === H1);
    PS.cleanup(s.staging_dir, ENV);

    // The author pushes while the pull request is being read: fetch stops.
    const moving = fixture(2, { headSeq: [H1, H2] });
    const mv = await PS.fetch(URL_GH, run(moving));
    check("moved during fetch: stops with PR_MOVED, stages nothing", mv.ok === false && mv.outcome === "PR_MOVED" && mv.before.head === H1 && mv.after.head === H2 && readdirSync(STAGE).length === 0, JSON.stringify(mv));

    // The author pushes during the review (after fetch): reads stay pinned; the end check says so.
    const later = fixture(2, { headSeq: [H1, H1, H2] });
    const calls: string[][] = [];
    const opts = run(later, calls);
    const snap = await PS.fetch(URL_GH, opts);
    check("pinned: fetch captured the first head", snap.ok === true && snap.snapshot.head_commit === H1);
    const f = await PS.file(URL_GH, "src/f0.ts", snap.snapshot.head_commit, opts);
    check("pinned: a file read after the push is the reviewed head's content, not the latest", f.ok === true && f.content === "export const head1 = 1;\n" && f.commit === H1, JSON.stringify(f));
    check("pinned: the read named the commit explicitly", calls.some((c) => c[c.length - 1].endsWith(`contents/src/f0.ts?ref=${H1}`)));
    const base = await PS.file(URL_GH, "src/f0.ts", snap.snapshot.base_commit, opts);
    check("pinned: the base side at the captured base commit", base.ok === true && base.content === "export const base = 0;\n");
    const end = await PS.head(URL_GH, snap.snapshot.head_commit, opts);
    check("head changed during review: reported with both commits and a rerun recommendation", end.ok === true && end.outcome === "PR_HEAD_CHANGED" && end.reviewed_commit === H1 && end.current_commit === H2 && /run \/review-pr again/.test(end.message));
    PS.cleanup(snap.staging_dir, ENV);

    const noCommit = await PS.file(URL_GH, "src/f0.ts", undefined, run(fixture()));
    check("file without --commit: refused — never the latest revision", noCommit.ok === false && noCommit.outcome === "PR_COMMIT_REQUIRED");
    check("file with a non-hash commit: refused", (await PS.file(URL_GH, "src/f0.ts", "HEAD", run(fixture()))).outcome === "PR_COMMIT_REQUIRED");
    check("head check without --expect: refused", (await PS.head(URL_GH, undefined, run(fixture()))).outcome === "PR_COMMIT_REQUIRED");
    const lost = await PS.file(URL_GH, "src/f0.ts", "9".repeat(40), run(fixture()));
    check("missing historical revision: PR_REVISION_UNAVAILABLE, no fallback", lost.ok === false && lost.outcome === "PR_REVISION_UNAVAILABLE" && /never replaced by another revision/.test(lost.reason));
    check("file: a path escaping the repository is refused", (await PS.file(URL_GH, "../etc/passwd", H1, run(fixture()))).outcome === "PR_PATH_INVALID");
    const calls3: string[][] = [];
    const heb = fixture();
    heb.contents[`docs/מסמך עיצוב.md@${H1}`] = "עברית";
    const hf = await PS.file(URL_GH, "docs/מסמך עיצוב.md", H1, run(heb, calls3));
    check("Hebrew path: encoded in the request, content returned", hf.ok === true && hf.content === "עברית" && calls3.some((c) => c[c.length - 1].includes("%D7%9E")), JSON.stringify(hf));
  }

  /* 4. Errors, authentication and redaction. */
  {
    const as = (status: number | null, stderr: string, error?: string) => fixture(1, { fail: { match: /pulls\/12$/, status, stderr, error } });
    const cases: Array<[string, Fixture, string, RegExp]> = [
      ["gh not installed", as(null, "", "ENOENT"), "PR_CLI_MISSING", /winget install GitHub\.cli/],
      ["not logged in (exit 4)", as(4, "To get started with GitHub CLI, please run:  gh auth login\n"), "PR_AUTH_MISSING", /gh auth login/],
      ["401", as(1, "gh: Bad credentials (HTTP 401)\n"), "PR_UNAUTHORIZED", /gh auth login/],
      ["403 SSO", as(1, "gh: Resource protected by organization SAML enforcement (HTTP 403)\n"), "PR_FORBIDDEN", /gh auth refresh/],
      ["403 rate limit", as(1, "gh: API rate limit exceeded for user (HTTP 403)\n"), "PR_RATE_LIMITED", /without retrying/],
      ["404 / private repository", as(1, "gh: Not Found (HTTP 404)\n"), "PR_NOT_FOUND", /private repository/],
      ["502", as(1, "gh: Bad Gateway (HTTP 502)\n"), "PR_UNAVAILABLE", /502/],
      ["network", as(1, "error connecting to api.github.com\n"), "PR_UNAVAILABLE", /could not be reached/],
    ];
    for (const [name, fx, outcome, reason] of cases) {
      const r = await PS.fetch(URL_GH, run(fx));
      check(`errors: ${name} → ${outcome}`, r.ok === false && r.outcome === outcome && reason.test(r.reason) && readdirSync(STAGE).length === 0, JSON.stringify(r));
    }
    check("errors: never asks for a token in the chat", /Never paste a token into the chat/.test((await PS.fetch(URL_GH, run(as(4, "gh auth login")))).reason));
    const leaky = fixture(1, { fail: { match: /pulls\/12$/, status: 1, stderr: `gh: something went wrong with token ${TOKEN} and ${ENV_TOKEN}\n` } });
    const lr = await PS.fetch(URL_GH, { env: { ...ENV, GH_TOKEN: ENV_TOKEN }, run: fakeGh(leaky, []) });
    check("redaction: a token-shaped string and GH_TOKEN never reach the output", !JSON.stringify(lr).includes(TOKEN) && !JSON.stringify(lr).includes(ENV_TOKEN) && JSON.stringify(lr).includes("[redacted]"), JSON.stringify(lr));
    const mid = fixture(1, { fail: { match: /pulls\/12\/files/, status: 1, stderr: "gh: Not Found (HTTP 404)\n" } });
    check("errors: a failure after the metadata stops the fetch, staging nothing", (await PS.fetch(URL_GH, run(mid))).outcome === "PR_NOT_FOUND" && readdirSync(STAGE).length === 0);
  }

  /* 5. Source: one call site, GET only, no git. */
  {
    const strip = (s: string) => s.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const gh = strip(read("scripts/github-pr.ts"));
    check("source (github-pr): one process call site, and it is gh", (gh.match(/spawnSync\(/g) ?? []).length === 1 && /spawnSync\("gh", args/.test(gh));
    check("source (github-pr): every API call goes through api(), which sends --method GET", (gh.match(/run\(\["api"/g) ?? []).length === 1 && gh.includes('run(["api", "--method", "GET"') && !/\b(POST|PUT|PATCH|DELETE)\b/.test(gh));
    check("source (github-pr): no git, no checkout", !/["'`]git["'`\s]|checkout|fetch origin/.test(gh));
    check("source (github-pr): gh runs in the temp directory, never the developer's repository", /cwd: tmpdir\(\)/.test(gh));
    const ps = strip(read("scripts/pr-source.ts"));
    check("source (pr-source): no process, no git, no filesystem writes", !/child_process|spawn|execFile|writeFileSync|["']git["']/.test(ps));
  }

  /* 6. No local checkout contamination, through the real CLI with a fake gh on PATH. */
  {
    const bin = join(TMP, "bin");
    mkdirSync(bin);
    const log = join(TMP, "gh.log");
    const fxPath = join(TMP, "fixture.json");
    writeFileSync(fxPath, JSON.stringify({ head: H1, base: B1, files: fixture(2).files, contents: { [`src/f0.ts@${H1}`]: "export const fromTheProvider = true;\n" } }));
    // A minimal gh: answers the fixture, logs argv and its working directory. Node, so it runs anywhere.
    writeFileSync(join(bin, "gh"), `#!${process.execPath}
const fs = require("fs");
const fx = JSON.parse(fs.readFileSync(process.env.FAKE_GH_FIXTURE, "utf-8"));
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify({ args, cwd: process.cwd() }) + "\\n");
const u = new URL("https://api.github.com/" + args[args.length - 1]);
const p = u.pathname;
const out = (s) => { process.stdout.write(s); process.exit(0); };
if (/\\/pulls\\/12$/.test(p)) out(JSON.stringify({ number: 12, title: "T", state: "open", body: "", head: { ref: "feature/x", sha: fx.head }, base: { ref: "develop", sha: fx.base }, changed_files: fx.files.length, commits: 1, user: { login: "dana" } }));
if (/\\/pulls\\/12\\/files$/.test(p)) out(JSON.stringify(Number(u.searchParams.get("page")) === 1 ? fx.files : []));
if (/\\/pulls\\/12\\/commits$/.test(p)) out(JSON.stringify([{ sha: fx.head, commit: { message: "c" } }]));
const c = /\\/contents\\/(.+)$/.exec(p);
if (c) { const k = decodeURIComponent(c[1]) + "@" + u.searchParams.get("ref"); if (k in fx.contents) out(fx.contents[k]); }
process.stderr.write("gh: Not Found (HTTP 404)\\n"); process.exit(1);
`);
    chmodSync(join(bin, "gh"), 0o755);

    // The reviewer's own checkout: another branch, the same file with uncommitted local changes.
    const local = join(TMP, "reviewer-checkout");
    mkdirSync(join(local, "src"), { recursive: true });
    const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-C", cwd, ...a], { encoding: "utf-8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
    git(local, "init", "-q", "-b", "main");
    writeFileSync(join(local, "src/f0.ts"), "export const local = 'committed';\n");
    git(local, "add", "-A");
    git(local, "commit", "-qm", "init");
    git(local, "checkout", "-qb", "my-own-work");
    writeFileSync(join(local, "src/f0.ts"), "export const local = 'UNCOMMITTED reviewer change';\n");
    writeFileSync(join(local, "notes.txt"), "untracked\n");
    const before = { head: git(local, "rev-parse", "HEAD"), branch: git(local, "rev-parse", "--abbrev-ref", "HEAD"), status: git(local, "status", "--porcelain"), refs: git(local, "for-each-ref") };
    const other = join(TMP, "unrelated-repo");
    mkdirSync(other);
    git(other, "init", "-q");

    const cli = (cwd: string, ...a: string[]) => {
      const p = spawnSync(process.execPath, ["--no-warnings", join(HERE, "pr-source.ts"), ...a], { cwd, encoding: "utf-8", env: { ...process.env, PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`, TMPDIR: STAGE, FAKE_GH_FIXTURE: fxPath, FAKE_GH_LOG: log, GH_TOKEN: "" } });
      try {
        return { code: p.status, json: JSON.parse(p.stdout) };
      } catch {
        return { code: p.status, json: null as any, raw: p.stdout + p.stderr };
      }
    };
    const fetched = cli(local, "fetch", URL_GH);
    check("cli: exits 0 with one JSON object", fetched.code === 0 && fetched.json?.ok === true && fetched.json.outcome === "PR_FETCHED", JSON.stringify(fetched).slice(0, 300));
    const f = cli(local, "file", URL_GH, "--path", "src/f0.ts", "--commit", fetched.json.snapshot.head_commit);
    check("contamination: run from a checkout on another branch with uncommitted changes, the PR file is the provider's", f.json?.ok === true && f.json.content === "export const fromTheProvider = true;\n" && !String(f.json.content).includes("UNCOMMITTED"));
    const f2 = cli(other, "file", URL_GH, "--path", "src/f0.ts", "--commit", H1);
    check("contamination: run from an unrelated repository, the same provider content", f2.json?.content === "export const fromTheProvider = true;\n");
    const missing = cli(local, "file", URL_GH, "--path", "notes.txt", "--commit", H1);
    check("contamination: a file the PR does not have is reported unavailable — the local file is never used", missing.json?.ok === false && missing.json.outcome === "PR_NOT_FOUND" && !JSON.stringify(missing.json).includes("untracked"));
    const after = { head: git(local, "rev-parse", "HEAD"), branch: git(local, "rev-parse", "--abbrev-ref", "HEAD"), status: git(local, "status", "--porcelain"), refs: git(local, "for-each-ref") };
    check("contamination: the reviewer's repository is untouched — same branch, HEAD, refs and uncommitted changes", JSON.stringify(before) === JSON.stringify(after) && readFileSync(join(local, "src/f0.ts"), "utf-8").includes("UNCOMMITTED"));
    const logged = readFileSync(log, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
    check("contamination: gh never ran inside a developer repository", logged.length > 0 && logged.every((e) => realpathSync(e.cwd) !== realpathSync(local) && realpathSync(e.cwd) !== realpathSync(other)));
    check("cli: every gh call was a GET", logged.every((e) => e.args[0] === "api" && e.args[1] === "--method" && e.args[2] === "GET"));
    check("cli: cleanup removes the staging directory", cli(local, "cleanup", fetched.json.staging_dir).json?.outcome === "PR_STAGING_REMOVED" && !existsSync(fetched.json.staging_dir));
    const noGh = spawnSync(process.execPath, ["--no-warnings", join(HERE, "pr-source.ts"), "fetch", URL_GH], { cwd: local, encoding: "utf-8", env: { ...process.env, PATH: `${dirname(process.execPath)}:/nonexistent-bin`, TMPDIR: STAGE } });
    check("cli: gh missing → PR_CLI_MISSING, never installed", JSON.parse(noGh.stdout).outcome === "PR_CLI_MISSING");
    check("cli: parse", cli(local, "parse", "https://gitlab.com/o/r/-/merge_requests/1").json?.outcome === "PR_URL_UNSUPPORTED");
    check("no temporary staging left behind", readdirSync(STAGE).length === 0, readdirSync(STAGE).join());
  }

  /* 7. The command, the agent, the naming and the Guardian contract. */
  {
    const cmd = read("commands/review-pr.md");
    const agent = read("agents/pr-reviewer.md");
    check("command: accepts GitHub and Bitbucket URLs", cmd.includes("https://github.com/<owner>/<repo>/pull/<number>") && cmd.includes("https://bitbucket.org/<workspace>/<repo>/pull-requests/<id>"));
    const fileReads = cmd.match(/pr-source\.ts" file [^\n`]*/g) ?? [];
    check("pinning: every file read in the command names --commit", fileReads.length > 0 && fileReads.every((l) => /--commit /.test(l)), fileReads.join(" | "));
    check("pinning: the agent's file reads name the snapshot commit", /pr-source\.ts file … --commit <snapshot\.head_commit>/.test(agent));
    check("pinning: the head is checked before reporting, a change reported, never a silent restart", cmd.includes('pr-source.ts" head <PR URL> --expect <snapshot.head_commit>') && /PR_HEAD_CHANGED/.test(cmd) && /Do not restart the review yourself/.test(cmd) && /\*\*Reviewed revision\*\*/.test(cmd));
    check("pinning: a moved PR stops the review (PR_MOVED)", /\| `PR_MOVED` \| \*\*Stop\.\*\*/.test(cmd));
    check("auth: gh login for GitHub, never installed, never a token in chat", /gh auth login/.test(cmd) && /never installed for them/.test(cmd) && /Never ask for the token in the chat/.test(cmd));
    check("provenance: local checkout never stands in for the PR", /the developer's local checkout is never the pull request/.test(agent) && /A local file never stands in for a pull-request file/.test(agent) && /Never fill the gap from local files/.test(agent) && /never by a local file/.test(cmd));
    check("provenance: local reads stay available (no new directory restriction)", /may read local files/.test(agent) && /^tools: Read, Grep, Glob, Bash, Skill/m.test(agent));
    // High-signal policy.
    const policy = agent.slice(agent.indexOf("## PR review policy"));
    check("policy: three severities, defined by impact; no Nit; no fourth level", ["**Blocking**", "**Major**", "**Minor**"].every((k) => policy.includes(k)) && /There is no Nit level in this review/.test(policy) && !/\bCritical\*\*/.test(policy));
    check("policy: a citation alone never makes a finding", /a citation alone never makes a finding/.test(policy));
    check("policy: the excluded classes — formatting, naming, wording, harmless comments, speculation, unrelated code", ["cosmetic formatting", "naming preferences", "alternative wording", "merely describes the code", "speculative defects without a credible failure scenario", "not caused or touched by this pull request"].every((k) => policy.includes(k)));
    check("policy: a comment is reported only for a concrete problem", /A comment is reported only when it causes a concrete problem/.test(policy));
    check("policy: every finding has defect, when, impact, file:line, evidence, fix", ["the concrete defect", "**when**", "**impact**", "`file:line`", "**evidence**", "**fix**"].every((k) => policy.includes(k)) && ["**When:**", "**Impact:**", "**Evidence:**", "**Fix:**"].every((k) => cmd.includes(k)));
    check("policy: verified before reporting — re-read, guards, inference vs evidence, duplicates", /Before reporting a candidate, verify it/.test(policy) && /existing guard already prevents it/.test(policy) && /unverified concern/.test(policy) && /merge duplicates/i.test(policy));
    check("policy: no downgrade and no inflation", /Do not downgrade a real defect/.test(policy));
    check("policy: a clean review says exactly 'No actionable findings.'", cmd.includes("**No actionable findings.**") && /no finding is manufactured/.test(cmd) && policy.includes("**No actionable findings.**"));
    check("policy: scoped to /review-pr — /review-code severity untouched", /governs `\/review-pr` only/.test(policy) && /`\/review-code` keeps its own severity handling/.test(policy) && /- \*\*Nit\*\* — style or hygiene\./.test(read("skills/platform-review/SKILL.md")));
    check("policy: no hidden dependency on Claude Code's built-in /code-review", !/\/code-review\b/.test(cmd) && !/\/code-review\b/.test(agent));
    // /review-code with a PR URL.
    const rc = read("commands/review-code.md");
    check("naming: /review-code classifies a URL scope with pr-source.ts parse", rc.includes('scripts/pr-source.ts" parse "<the URL>"'));
    check("naming: on a PR URL /review-code stops and offers /review-pr — never a diff baseline, never auto-run", /\*\*stop — review nothing\*\*/.test(rc) && rc.includes("/ono-mobile-dev-plugin:review-pr <the URL>") && /only on an explicit yes/.test(rc) && /never use the URL as a diff baseline/.test(rc));
    check("naming: /review-code has no --pr option", !/--pr\b/.test(rc.slice(0, rc.indexOf("\n---", 4))) && !/`--pr`/.test(rc));
    const readme = read("README.md");
    check("naming: README explains /review-code, /review-pr and the built-in /code-review", /### Three review commands/.test(readme) && /`\/code-review` \(alias `\/review`\) \| Claude Code \(built in, Anthropic\)/.test(readme));
    // Guardian contract.
    const g = read("docs/guardian-integration.md");
    check("guardian: invoke /review-pr with the exact URL, GitHub and Bitbucket examples", g.includes("/ono-mobile-dev-plugin:review-pr <exact PR URL>") && g.includes("/ono-mobile-dev-plugin:review-pr https://github.com/owner/repo/pull/12") && g.includes("/ono-mobile-dev-plugin:review-pr https://bitbucket.org/workspace/repo/pull-requests/12"));
    check("guardian: no checkout, no clean tree, no credentials, no review engine of its own", /check out the PR branch \(`gh pr checkout`\), require a clean working tree/.test(g) && /pass or prompt for any credential/.test(g) && /review the PR itself/.test(g));
    check("guardian: checks the command exists, explains how to update", g.includes("`commands/review-pr.md`") && /update `ono-mobile-dev-plugin`/.test(g));
    check("guardian: removes its Pre-PR, no fallback; unmanaged not blocked; managed keeps the gate", /## 1\. Remove the Guardian's own Pre-PR implementation/.test(g) && /No fallback Pre-PR/.test(g) && /\*\*is not blocked\*\* for missing Pre-PR evidence/.test(g) && /Managed work keeps its gate/.test(g));
    check("guardian: --base, not a commit list", /\*\*Comparison scope — `--base`, not a commit list\.\*\*/.test(g));
  }

  check("the suite is registered", read("scripts/check.ts").includes('"pr-source"'));
}

try {
  await main();
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
console.log(failures === 0 ? "\nall pr-source checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
