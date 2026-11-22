/**
 * hook-json.test.ts
 *
 * Pins A1 (Windows 11 / Git Bash without jq): the four hooks read their payload through one
 * shared reader, hooks/lib/hook-json.sh — jq when installed, otherwise Node.js
 * (hooks/lib/hook-json.mjs), otherwise fail closed.
 *
 *   1. The reader itself: jq and Node.js give identical answers for every spec over a corpus of
 *      payloads — strings, missing fields, null, escapes, Unicode, Hebrew, Windows paths, nested
 *      inputs and unexpected shapes — and both refuse the same malformed input.
 *   2. The decision writer: hook_decision builds valid JSON for any reason text, with no runtime.
 *   3. Each of the four hooks under three runtimes — jq, Node.js only, neither — plus a Node.js
 *      that is installed but cannot start: the same allow / ask / block / deny decisions with
 *      either runtime; with neither (or a broken one), the hook's fail-closed decision and the
 *      `winget install jqlang.jq` hint.
 *
 * Needs jq for the parity half (section 1); without it that half prints SKIP, and
 * `check.ts --strict` reports the run as incomplete — a skip is never a pass.
 *
 *   node --no-warnings scripts/hook-json.test.ts
 */

import { spawnSync, execFileSync } from "child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const HOOKS = join(REPO_ROOT, "hooks");
const LIB = join(HOOKS, "lib", "hook-json.sh");
let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
const TMP = realpathSync(mkdtempSync(join(tmpdir(), "hook-json-")));
const which = (c: string) => spawnSync("bash", ["-c", `command -v ${c}`], { encoding: "utf-8" }).stdout.trim();
const BASH = which("bash");

/* PATHs: jq (the developer's normal PATH), Node.js only, neither, and a broken Node.js. */
function binDir(name: string, tools: string[], extra: Record<string, string> = {}): string {
  const d = join(TMP, name);
  mkdirSync(d);
  for (const t of tools) {
    const at = which(t);
    if (at) symlinkSync(at, join(d, t));
  }
  for (const [n, body] of Object.entries(extra)) {
    writeFileSync(join(d, n), body);
    chmodSync(join(d, n), 0o755);
  }
  return d;
}
const BASE_TOOLS = ["cat", "dirname", "git", "grep"];
const NODE_ONLY = binDir("node-only", [...BASE_TOOLS, "node"]);
const NEITHER = binDir("neither", BASE_TOOLS);
const BROKEN_NODE = binDir("broken-node", BASE_TOOLS, { node: "#!/bin/sh\necho 'dyld: Library not loaded: libicui18n' >&2\nexit 134\n" });
const haveJq = which("jq") !== "";
const JQ_PATH = process.env.PATH ?? "";
// Token-shaped values, assembled at run time so no secret-shaped literal sits in the source.
const AWS = `AKIA${"IOSFODNN7EXAMPLE"}`;

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}
function sh(script: string, args: string[], input: string, path: string, env: Record<string, string> = {}): Run {
  const p = spawnSync(BASH, [script, ...args], { input, encoding: "utf-8", env: { HOME: process.env.HOME ?? "", PATH: path, CLAUDE_PLUGIN_ROOT: REPO_ROOT, ...env } });
  return { code: p.status ?? -1, stdout: p.stdout ?? "", stderr: p.stderr ?? "" };
}

/* ── 1. The reader: jq and Node.js agree ─────────────────────────────── */

const GET = join(TMP, "get.sh");
writeFileSync(GET, `. "${LIB}"\nrc=0\nv="$(json_get "$(cat)" "$1")" || rc=$?\nprintf '%s' "$v"\nexit $rc\n`);
const getWith = (path: string, json: string, spec: string) => sh(GET, [spec], json, path);

const CORPUS: Array<[string, string]> = [
  ["plain Write", JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/repo/src/a.ts", content: "x" }, cwd: "/repo" })],
  ["missing tool_input", JSON.stringify({ tool_name: "Write" })],
  ["null fields", JSON.stringify({ tool_name: null, tool_input: { file_path: null, notebook_path: "/n.ipynb", content: null } })],
  ["notebook only", JSON.stringify({ tool_name: "NotebookEdit", tool_input: { notebook_path: "/repo/a.ipynb", new_source: "print(1)" } })],
  ["escapes", JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/repo/q\"uote\\back.ts", content: "line1\nline2\t\"q\"\\" } })],
  ["\\u escapes in the raw JSON", '{"tool_name":"Write","tool_input":{"file_path":"/repo/\\u0061.ts","content":"\\u0041KIA"}}'],
  ["Unicode and emoji", JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "/repo/src/ünïcødé-✓.ts", new_string: "const s = '🚀';" } })],
  ["Hebrew path", JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/Users/dev/פרויקט/src/מסך-בית.tsx", content: "שלום" } })],
  ["Windows path", JSON.stringify({ tool_name: "Write", tool_input: { file_path: "C:\\Users\\ekaterina.s\\YesPlusSmartTV\\src\\App.tsx", content: "x" }, cwd: "C:\\Users\\ekaterina.s\\YesPlusSmartTV" })],
  ["MultiEdit edits", JSON.stringify({ tool_name: "MultiEdit", tool_input: { file_path: "/r/a.ts", edits: [{ old_string: "a", new_string: "b" }, null, { old_string: "x" }, { old_string: "c", new_string: "d\ne" }] } })],
  ["MultiEdit no edits", JSON.stringify({ tool_name: "MultiEdit", tool_input: { file_path: "/r/a.ts" } })],
  ["boolean and number", JSON.stringify({ supported: false, version: 22, decision: "allow", hook_note: "T1 in scope" })],
  ["nested object value", JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/r/a.ts", content: { nested: ["x", 1] } } })],
  ["agent payload", JSON.stringify({ tool_name: "Bash", agent_type: "ono-mobile-dev-plugin:pr-reviewer", tool_input: { command: "node --no-warnings \"/p/scripts/pr-source.ts\" fetch https://github.com/o/r/pull/1" } })],
];
const SPECS = [".tool_name", ".tool_input.file_path // .tool_input.notebook_path", ".tool_input.file_path", ".tool_input.content", ".tool_input.new_string", ".tool_input.new_source", "@edits", ".cwd", ".agent_type", ".tool_input.command", ".supported", ".version", ".decision", ".hook_note"];
const MALFORMED: Array<[string, string]> = [
  ["not JSON", "not json"],
  ["truncated", '{"tool_name": "Write", "tool_input": '],
  ["empty", ""],
  ["whitespace only", "   \n"],
  ["two documents", '{"tool_name":"Write"} {"tool_name":"Read"}'],
];
const SHAPES: Array<[string, string, string]> = [
  ["tool_input is a string", JSON.stringify({ tool_name: "Write", tool_input: "C:\\x" }), ".tool_input.file_path"],
  ["tool_input is an array", JSON.stringify({ tool_name: "Write", tool_input: ["a"] }), ".tool_input.content"],
  ["payload is an array", JSON.stringify([{ tool_name: "Write" }]), ".tool_name"],
  ["payload is a string", JSON.stringify("Write"), ".tool_name"],
  ["edits is an object", JSON.stringify({ tool_name: "MultiEdit", tool_input: { edits: { a: { new_string: "x" } } } }), "@edits"],
  ["an edit is a string", JSON.stringify({ tool_name: "MultiEdit", tool_input: { edits: ["x"] } }), "@edits"],
];

if (!haveJq) {
  console.log("SKIP  1 jq/Node.js parity: jq is not installed on this machine");
} else {
  let agree = 0;
  const disagree: string[] = [];
  for (const [name, json] of CORPUS) {
    for (const spec of SPECS) {
      const a = getWith(JQ_PATH, json, spec), b = getWith(NODE_ONLY, json, spec);
      if (a.code === b.code && a.stdout === b.stdout) agree++;
      else disagree.push(`${name} ${spec}: jq ${a.code} ${JSON.stringify(a.stdout)} / node ${b.code} ${JSON.stringify(b.stdout)}`);
    }
  }
  check(`1 jq and Node.js agree on all ${CORPUS.length * SPECS.length} payload × spec reads`, disagree.length === 0, disagree.slice(0, 4).join(" | "));
  for (const [name, json] of MALFORMED) {
    const a = getWith(JQ_PATH, json, ".tool_name"), b = getWith(NODE_ONLY, json, ".tool_name");
    check(`1 malformed (${name}): both runtimes refuse it (status 1)`, a.code === 1 && b.code === 1, `jq ${a.code} node ${b.code}`);
  }
  for (const [name, json, spec] of SHAPES) {
    const a = getWith(JQ_PATH, json, spec), b = getWith(NODE_ONLY, json, spec);
    check(`1 unexpected shape (${name}): both runtimes refuse it`, a.code === 1 && b.code === 1, `jq ${a.code} ${a.stdout} / node ${b.code} ${b.stdout}`);
  }
}
{
  const n = (json: string, spec: string) => getWith(NODE_ONLY, json, spec);
  const win = CORPUS.find(([k]) => k === "Windows path")![1];
  check("1 Node.js: a Windows path is returned byte for byte", n(win, ".tool_input.file_path").stdout === "C:\\Users\\ekaterina.s\\YesPlusSmartTV\\src\\App.tsx");
  const heb = CORPUS.find(([k]) => k === "Hebrew path")![1];
  check("1 Node.js: a Hebrew path is returned byte for byte", n(heb, ".tool_input.file_path").stdout === "/Users/dev/פרויקט/src/מסך-בית.tsx");
  check("1 Node.js: \\u escapes are decoded", n(CORPUS[5][1], ".tool_input.content").stdout === "AKIA");
  check("1 Node.js: a missing field is empty, not an error", n(CORPUS[1][1], ".tool_input.file_path").code === 0 && n(CORPUS[1][1], ".tool_input.file_path").stdout === "");
  check("1 Node.js: null falls through to the next alternative", n(CORPUS[2][1], ".tool_input.file_path // .tool_input.notebook_path").stdout === "/n.ipynb");
  check("1 Node.js: false is the text false (not empty)", n(CORPUS[11][1], ".supported").stdout === "false");
  check("1 Node.js: MultiEdit new_strings joined, a null edit is empty", n(CORPUS[9][1], "@edits").stdout === "b\n\n\nd\ne");
  check("1 neither runtime: json_get returns 3", getWith(NEITHER, CORPUS[0][1], ".tool_name").code === 3);
  check("1 a broken Node.js (cannot start) is a read failure, never a pass", getWith(BROKEN_NODE, CORPUS[0][1], ".tool_name").code === 1);
  check("1 an unsupported spec is refused", n(CORPUS[0][1], ".tool_input[0]").code === 1 && (!haveJq || getWith(JQ_PATH, CORPUS[0][1], ".tool_input[0]").code === 1));
}

/* ── 2. The decision writer needs no runtime ─────────────────────────── */
{
  const DEC = join(TMP, "dec.sh");
  writeFileSync(DEC, `. "${LIB}"\nhook_decision "$1" "$2"\n`);
  const reasons = ['plain', 'a "quoted" \\back\\slash C:\\Users\\x', "new\nline\ttab\rreturn", "עברית ✓ 🚀", `bell${String.fromCharCode(7)}esc${String.fromCharCode(27)}`];
  for (const r of reasons) {
    const out = sh(DEC, ["ask", r], "", NEITHER);
    let parsed: any = null;
    try {
      parsed = JSON.parse(out.stdout);
    } catch {
      parsed = null;
    }
    check(`2 hook_decision: valid JSON, reason preserved — ${JSON.stringify(r).slice(0, 30)}`, parsed?.hookSpecificOutput?.permissionDecision === "ask" && parsed.hookSpecificOutput.permissionDecisionReason === r && parsed.hookSpecificOutput.hookEventName === "PreToolUse", out.stdout);
  }
}

/* ── 3. The four hooks under every runtime ───────────────────────────── */

const SECRETS = join(HOOKS, "scan-for-secrets.sh");
const MAIN = join(HOOKS, "block-main-branch-changes.sh");
const APPROVAL = join(HOOKS, "require-approval-before-code.sh");
const GUARD = join(HOOKS, "review-pr-guard.sh");
const RUNTIMES: Array<[string, string]> = [...(haveJq ? ([["jq", JQ_PATH]] as Array<[string, string]>) : []), ["Node.js only", NODE_ONLY]];
const J = (o: unknown) => JSON.stringify(o);
const blocks = (r: Run) => r.code === 2 && r.stderr.trim() !== "";
const allows = (r: Run) => r.code === 0 && r.stdout.trim() === "";
const decision = (r: Run) => {
  try {
    return r.code === 0 ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : null;
  } catch {
    return null;
  }
};
const hint = (s: string) => /winget install jqlang\.jq/.test(s) && /jq is not installed/.test(s);

// scan-for-secrets
for (const [rt, path] of RUNTIMES) {
  const w = (file_path: string, content: string) => J({ tool_name: "Write", tool_input: { file_path, content } });
  check(`3 secrets (${rt}): a clean write is allowed`, allows(sh(SECRETS, [], w("/repo/src/a.ts", "export const x = 1;"), path)));
  check(`3 secrets (${rt}): a secret in a Write is blocked`, blocks(sh(SECRETS, [], w("/repo/src/a.ts", `k = "${AWS}"`), path)));
  const ms = sh(SECRETS, [], J({ tool_name: "MultiEdit", tool_input: { file_path: "/r/a.ts", edits: [{ old_string: "a", new_string: "fine" }, { old_string: "b", new_string: `k = "${AWS}"` }] } }), path);
  check(`3 secrets (${rt}): a secret in the second MultiEdit edit is blocked`, blocks(ms));
  const esc = sh(SECRETS, [], `{"tool_name":"Edit","tool_input":{"file_path":"/r/a.ts","new_string":"k = \\"\\u0041KIA${"IOSFODNN7EXAMPLE"}\\""}}`, path);
  check(`3 secrets (${rt}): a secret hidden behind \\u escapes is still blocked`, blocks(esc));
  const heb = sh(SECRETS, [], w("/Users/dev/פרויקט/src/הגדרות.ts", `k = "${AWS}"`), path);
  check(`3 secrets (${rt}): a Hebrew path — blocked, and named in the message`, blocks(heb) && heb.stderr.includes("הגדרות.ts"), heb.stderr);
  const win = sh(SECRETS, [], w("C:\\Users\\ekaterina.s\\YesPlusSmartTV\\src\\config.ts", `k = "${AWS}"`), path);
  check(`3 secrets (${rt}): a Windows path — blocked, and named in the message`, blocks(win) && win.stderr.includes("C:\\Users\\ekaterina.s\\YesPlusSmartTV\\src\\config.ts"), win.stderr);
  check(`3 secrets (${rt}): a Windows-path clean write is allowed (the A1 bug)`, allows(sh(SECRETS, [], w("C:\\Users\\ekaterina.s\\YesPlusSmartTV\\src\\App.tsx", "export default App;"), path)));
  check(`3 secrets (${rt}): a .env credential is blocked`, blocks(sh(SECRETS, [], w("/r/.env", "API_KEY=abcdefghijklmnop1234"), path)));
  check(`3 secrets (${rt}): malformed JSON is blocked`, blocks(sh(SECRETS, [], "not json", path)));
  check(`3 secrets (${rt}): tool_input that is not an object is blocked`, blocks(sh(SECRETS, [], J({ tool_name: "Write", tool_input: "x" }), path)));
  check(`3 secrets (${rt}): edits that are not a list are blocked`, blocks(sh(SECRETS, [], J({ tool_name: "MultiEdit", tool_input: { edits: { a: 1 } } }), path)));
  check(`3 secrets (${rt}): a Write with no content has nothing to scan — allowed (unchanged)`, allows(sh(SECRETS, [], J({ tool_name: "Write", tool_input: { file_path: "/r/a.ts" } }), path)));
  check(`3 secrets (${rt}): a non-write tool passes`, allows(sh(SECRETS, [], J({ tool_name: "Read", tool_input: { file_path: "/r/a.ts" } }), path)));
}
{
  const r = sh(SECRETS, [], J({ tool_name: "Write", tool_input: { file_path: "/r/a.ts", content: "x" } }), NEITHER);
  check("3 secrets (neither): blocked — fail closed — with the winget hint", blocks(r) && hint(r.stderr), r.stderr);
  const noGrep = binDir("no-grep", ["cat", "dirname", "git", "node"]);
  const g = sh(SECRETS, [], J({ tool_name: "Write", tool_input: { file_path: "/r/a.ts", content: "x" } }), noGrep);
  check("3 secrets: grep unavailable — the content was not scanned, so blocked (never 'no match')", blocks(g) && /grep could not run/.test(g.stderr), g.stderr);
  const b = sh(SECRETS, [], J({ tool_name: "Write", tool_input: { file_path: "/r/a.ts", content: "x" } }), BROKEN_NODE);
  check("3 secrets (broken Node.js, no jq): blocked", blocks(b), b.stderr);
}

// require-approval-before-code
for (const [rt, path] of RUNTIMES) {
  const w = (file_path: string) => J({ tool_name: "Write", tool_input: { file_path, content: "x" }, cwd: "/tmp" });
  const code = sh(APPROVAL, [], w("/repo/src/App.tsx"), path);
  check(`3 approval (${rt}): a code write asks`, decision(code) === "ask", code.stdout + code.stderr);
  check(`3 approval (${rt}): a doc write passes through`, allows(sh(APPROVAL, [], w("/repo/docs/a.md"), path)));
  const win = sh(APPROVAL, [], w("C:\\Users\\ekaterina.s\\YesPlusSmartTV\\src\\App.tsx"), path);
  check(`3 approval (${rt}): a Windows-path code write asks, the reason valid JSON with the path intact`, decision(win) === "ask" && JSON.parse(win.stdout).hookSpecificOutput.permissionDecisionReason.includes("C:\\Users\\ekaterina.s\\YesPlusSmartTV\\src\\App.tsx"), win.stdout);
  check(`3 approval (${rt}): a Windows-path doc write passes through`, allows(sh(APPROVAL, [], w("C:\\Users\\ekaterina.s\\YesPlusSmartTV\\README.md"), path)));
  const heb = sh(APPROVAL, [], w("/Users/dev/פרויקט/src/מסך.tsx"), path);
  check(`3 approval (${rt}): a Hebrew-path code write asks, the path intact`, decision(heb) === "ask" && JSON.parse(heb.stdout).hookSpecificOutput.permissionDecisionReason.includes("פרויקט/src/מסך.tsx"), heb.stdout);
  const quote = sh(APPROVAL, [], w('/repo/src/we"ird\\name.ts'), path);
  check(`3 approval (${rt}): a path with quotes and backslashes still yields valid JSON`, decision(quote) === "ask", quote.stdout);
  check(`3 approval (${rt}): a cycle approval record asks`, decision(sh(APPROVAL, [], w("/repo/docs/tasks/bugs/K.cycle-approval.json"), path)) === "ask");
  check(`3 approval (${rt}): malformed JSON asks`, decision(sh(APPROVAL, [], '{"tool_name":', path)) === "ask");
  check(`3 approval (${rt}): tool_input that is not an object asks`, decision(sh(APPROVAL, [], J({ tool_name: "Write", tool_input: "x" }), path)) === "ask");
  check(`3 approval (${rt}): a payload without tool_name is not a write — passes (unchanged)`, allows(sh(APPROVAL, [], J({ tool_input: { file_path: "/r/a.ts" } }), path)));
}
{
  const r = sh(APPROVAL, [], J({ tool_name: "Write", tool_input: { file_path: "/r/docs/a.md", content: "x" } }), NEITHER);
  check("3 approval (neither): asks — even for a doc, since the file cannot be told — with the winget hint", decision(r) === "ask" && hint(r.stdout), r.stdout);
  check("3 approval (broken Node.js, no jq): asks", decision(sh(APPROVAL, [], J({ tool_name: "Write", tool_input: { file_path: "/r/docs/a.md", content: "x" } }), BROKEN_NODE)) === "ask");
}

// block-main-branch-changes — a real repository on main.
{
  const repo = join(TMP, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  const git = (...a: string[]) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf-8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  git("init", "-q", "-b", "main");
  writeFileSync(join(repo, "src", "a.txt"), "x");
  git("add", "-A");
  git("commit", "-qm", "init");
  const outside = realpathSync(mkdtempSync(join(tmpdir(), "hook-json-outside-")));
  const env = { CLAUDE_PROJECT_DIR: repo };
  const w = (file_path: string, extra: Record<string, unknown> = {}) => J({ tool_name: "Write", tool_input: { file_path, content: "x" }, ...extra });
  for (const [rt, path] of RUNTIMES) {
    check(`3 main (${rt}): a write in the repository on main is blocked`, blocks(sh(MAIN, [], w(join(repo, "src", "a.txt")), path, env)));
    check(`3 main (${rt}): a write outside the repository is allowed`, allows(sh(MAIN, [], w(join(outside, "scratch.txt")), path, env)));
    check(`3 main (${rt}): a Hebrew-named file in the repository is blocked`, blocks(sh(MAIN, [], w(join(repo, "src", "מסך.tsx")), path, env)));
    check(`3 main (${rt}): a relative path resolved against the payload's cwd is blocked`, blocks(sh(MAIN, [], w("src/a.txt", { cwd: repo }), path, env)));
    check(`3 main (${rt}): malformed JSON on main is blocked`, blocks(sh(MAIN, [], "{", path, env)));
    check(`3 main (${rt}): a payload without tool_name on main is blocked`, blocks(sh(MAIN, [], J({ tool_input: { file_path: join(repo, "x") } }), path, env)));
  }
  const nn = sh(MAIN, [], w(join(outside, "scratch.txt")), NEITHER, env);
  check("3 main (neither): on main even an outside write is blocked — fail closed — with the winget hint", blocks(nn) && hint(nn.stderr), nn.stderr);
  check("3 main (broken Node.js, no jq): blocked on main", blocks(sh(MAIN, [], w(join(outside, "scratch.txt")), BROKEN_NODE, env)));
  git("checkout", "-qb", "feat/x");
  check("3 main (neither): on a feature branch nothing is read and the write is allowed (unchanged)", allows(sh(MAIN, [], w(join(repo, "src", "a.txt")), NEITHER, env)));
  rmSync(outside, { recursive: true, force: true });
}

// review-pr-guard
{
  const helper = `node --no-warnings "${REPO_ROOT}/scripts/pr-source.ts"`;
  const call = (tool: string, input: Record<string, unknown>, agent: string | null = "ono-mobile-dev-plugin:pr-reviewer") => J({ tool_name: tool, tool_input: input, ...(agent ? { agent_type: agent } : {}) });
  for (const [rt, path] of RUNTIMES) {
    check(`3 guard (${rt}): the helper is allowed in the reviewer`, allows(sh(GUARD, [], call("Bash", { command: `${helper} fetch https://github.com/o/r/pull/1` }), path)));
    check(`3 guard (${rt}): a write is denied in the reviewer`, decision(sh(GUARD, [], call("Write", { file_path: "/x" }), path)) === "deny");
    check(`3 guard (${rt}): gh pr review is denied in the reviewer`, decision(sh(GUARD, [], call("Bash", { command: "gh pr review 1 --approve" }), path)) === "deny");
    check(`3 guard (${rt}): another agent is untouched`, allows(sh(GUARD, [], call("Bash", { command: "git push" }, "ono-mobile-dev-plugin:code-reviewer"), path)));
    check(`3 guard (${rt}): a malformed reviewer payload is denied`, decision(sh(GUARD, [], '{"agent_type":"pr-reviewer","tool_name":', path)) === "deny");
  }
  const nn = sh(GUARD, [], call("Bash", { command: `${helper} fetch https://github.com/o/r/pull/1` }), NEITHER);
  check("3 guard (neither): the reviewer is denied — fail closed — with the winget hint", decision(nn) === "deny" && hint(nn.stdout), nn.stdout);
  check("3 guard (broken Node.js, no jq): the reviewer is denied", decision(sh(GUARD, [], call("Read", { file_path: "/x" }), BROKEN_NODE)) === "deny");
  check("3 guard (neither): the main session is untouched", allows(sh(GUARD, [], call("Write", { file_path: "/x" }, null), NEITHER)));
}

/* ── 4. One parser, not four ─────────────────────────────────────────── */
{
  const hooks = ["scan-for-secrets.sh", "block-main-branch-changes.sh", "require-approval-before-code.sh", "review-pr-guard.sh"];
  for (const h of hooks) {
    const src = readFileSync(join(HOOKS, h), "utf-8").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
    check(`4 ${h}: reads through hooks/lib/hook-json.sh, never jq or node -e directly`, src.includes("lib/hook-json.sh") && !/(^|[\s(|;&$])jq\s+-/m.test(src) && !/<<<\s*"\$payload"/.test(src) && !/node -e/.test(src), h);
  }
  check("4 README: the jq dependency, the Node.js fallback, the winget line and the Bash-write limitation", (() => {
    const r = readFileSync(join(REPO_ROOT, "README.md"), "utf-8");
    return r.includes("winget install jqlang.jq") && /Node\.js fallback|falls back to Node\.js/.test(r) && /neither jq nor Node\.js/.test(r) && /protect-secrets[^\n]*Bash|Bash[^\n]*protect-secrets/.test(r);
  })());
  check("4 the suite is registered", readFileSync(join(HERE, "check.ts"), "utf-8").includes('"hook-json"'));
}

rmSync(TMP, { recursive: true, force: true });
console.log(failures === 0 ? "\nall hook-json checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
