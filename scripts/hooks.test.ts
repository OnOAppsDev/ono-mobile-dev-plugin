/**
 * hooks.test.ts
 *
 * Tests the three PreToolUse hooks in hooks/. They are the plugin's safety layer —
 * the only thing standing between a model and a secret committed to a repository, or a
 * write straight onto `main` — and until now they were the only executable code in the
 * repo with no coverage at all.
 *
 * Each hook reads a tool-call JSON payload on stdin and signals its decision the way
 * Claude Code expects:
 *
 *   require-approval-before-code  exit 0 + a permissionDecision JSON object -> ask
 *                                 exit 0 + no output                       -> pass through
 *   block-main-branch-changes     exit 2 + stderr -> blocked   exit 0 -> allowed
 *   scan-for-secrets              exit 2 + stderr -> blocked   exit 0 -> allowed
 *
 * NOTE ON THE FIXTURES, because it will look strange otherwise: every credential-shaped
 * string below is ASSEMBLED FROM FRAGMENTS at runtime rather than written as a literal.
 * scan-for-secrets.sh is registered as a live hook in this very repository, so a literal
 * `AKIA…` or `ghp_…` in this file would be blocked on write — the hook refuses to let its
 * own test fixtures exist. Concatenation keeps the source clean while the runtime value
 * still exercises the pattern. Do not "simplify" these back into literals.
 *
 * The hooks shell out to `jq`, and block-main-branch-changes needs a real git branch.
 * Neither is vendored, so this suite declares its dependency instead of pretending:
 * without `jq` it prints `SUITE SKIPPED` and scripts/check.ts reports the run as
 * incomplete. A skip is never a pass.
 *
 * Blocking assertions check the exit code and that stderr explains the block. They
 * deliberately do not pin the message wording, which is developer-facing prose.
 *
 * No external test framework. Run with:
 *   node scripts/hooks.test.ts
 *   bun  scripts/hooks.test.ts
 */

import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync, realpathSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const HOOKS = join(REPO_ROOT, "hooks");

const APPROVAL = join(HOOKS, "require-approval-before-code.sh");
const MAIN_BRANCH = join(HOOKS, "block-main-branch-changes.sh");
const SECRETS = join(HOOKS, "scan-for-secrets.sh");

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

/* ── dependency gate: declare, never fake ─────────────────────────────── */

const haveJq = spawnSync("jq", ["--version"], { encoding: "utf-8" }).status === 0;
const haveGit = spawnSync("git", ["--version"], { encoding: "utf-8" }).status === 0;

if (!haveJq) {
  console.log("SUITE SKIPPED: jq is not installed; all three hooks parse their payload with jq.");
  process.exit(0);
}

interface HookRun {
  code: number;
  stdout: string;
  stderr: string;
}

function runHook(script: string, payload: unknown, env: Record<string, string> = {}): HookRun {
  const proc = spawnSync("bash", [script], {
    input: JSON.stringify(payload),
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
  return { code: proc.status ?? -1, stdout: proc.stdout ?? "", stderr: proc.stderr ?? "" };
}

const asks = (r: HookRun): boolean => {
  if (r.code !== 0 || r.stdout.trim() === "") return false;
  try {
    const j = JSON.parse(r.stdout);
    return j?.hookSpecificOutput?.permissionDecision === "ask";
  } catch {
    return false;
  }
};
const passesThrough = (r: HookRun): boolean => r.code === 0 && r.stdout.trim() === "";
const blocks = (r: HookRun): boolean => r.code === 2 && r.stderr.trim() !== "";
const allows = (r: HookRun): boolean => r.code === 0;

/* ── 1. the hooks and their configs exist and are wired up ────────────── */
{
  for (const [name, p] of [
    ["require-approval-before-code.sh", APPROVAL],
    ["block-main-branch-changes.sh", MAIN_BRANCH],
    ["scan-for-secrets.sh", SECRETS],
  ] as const) {
    check(`1 hook exists: ${name}`, existsSync(p));
  }
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, ".claude-plugin", "plugin.json"), "utf-8"));
  check("1 plugin.json registers three hook configs",
    Array.isArray(manifest.hooks) && manifest.hooks.length === 3, JSON.stringify(manifest.hooks));

  for (const cfg of ["protect-secrets", "require-approval-before-code", "block-main-branch-changes"]) {
    const p = join(HOOKS, `${cfg}.json`);
    check(`1 hook config exists: ${cfg}.json`, existsSync(p));
    if (!existsSync(p)) continue;
    const body = readFileSync(p, "utf-8");
    for (const sh of new Set([...body.matchAll(/([a-z-]+\.sh)/g)].map((m) => m[1]))) {
      check(`1 ${cfg}.json -> hooks/${sh} exists`, existsSync(join(HOOKS, sh)));
    }
  }
}

/* ── 2. require-approval-before-code: code asks, docs pass through ────── */
{
  const write = (file_path: string) => ({ tool_name: "Write", tool_input: { file_path } });

  for (const ext of ["ts", "tsx", "js", "jsx", "swift", "kt", "kts", "java", "m", "mm", "cpp", "h"]) {
    check(`2 .${ext} requires approval`, asks(runHook(APPROVAL, write(`/repo/src/File.${ext}`))));
  }
  // .kts was added for Gradle Kotlin DSL; a regression here silently drops approval
  // gating on Android build scripts.
  check("2 .kts covers a Gradle Kotlin DSL path", asks(runHook(APPROVAL, write("/repo/app/build.gradle.kts"))));

  for (const ext of ["md", "json", "yml", "yaml", "txt", "lock"]) {
    check(`2 .${ext} passes through`, passesThrough(runHook(APPROVAL, write(`/repo/docs/file.${ext}`))));
  }

  check("2 Edit on a code file requires approval",
    asks(runHook(APPROVAL, { tool_name: "Edit", tool_input: { file_path: "/repo/a.ts" } })));
  check("2 MultiEdit on a code file requires approval",
    asks(runHook(APPROVAL, { tool_name: "MultiEdit", tool_input: { file_path: "/repo/a.ts" } })));
  check("2 Read is not a write and passes through",
    passesThrough(runHook(APPROVAL, { tool_name: "Read", tool_input: { file_path: "/repo/a.ts" } })));
  check("2 Bash is not a write and passes through",
    passesThrough(runHook(APPROVAL, { tool_name: "Bash", tool_input: { command: "ls" } })));
  check("2 a missing file_path passes through",
    passesThrough(runHook(APPROVAL, { tool_name: "Write", tool_input: {} })));
  check("2 the ask names the file, so the prompt is meaningful", (() => {
    const r = runHook(APPROVAL, write("/repo/src/Widget.tsx"));
    try {
      return JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason.includes("Widget.tsx");
    } catch {
      return false;
    }
  })());
}

/* ── 3. block-main-branch-changes ─────────────────────────────────────── */
{
  if (!haveGit) {
    console.log("SKIP  3 block-main-branch-changes (git not installed)");
  } else {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), "hooks-branch-")));
    const git = (...args: string[]) => spawnSync("git", ["-C", repo, ...args], { encoding: "utf-8" });
    git("init", "-q");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    writeFileSync(join(repo, "a.txt"), "x");
    git("add", ".");
    git("commit", "-qm", "init");

    const write = { tool_name: "Write", tool_input: { file_path: join(repo, "a.txt") } };

    git("branch", "-M", "main");
    const onMain = runHook(MAIN_BRANCH, write, { CLAUDE_PROJECT_DIR: repo });
    check("3 a write on main is blocked", blocks(onMain));
    check("3 the block explains why", /feature branch/i.test(onMain.stderr), onMain.stderr.trim());

    git("branch", "-M", "master");
    check("3 a write on master is blocked", blocks(runHook(MAIN_BRANCH, write, { CLAUDE_PROJECT_DIR: repo })));

    git("checkout", "-qb", "feat/thing");
    check("3 a write on a feature branch is allowed",
      allows(runHook(MAIN_BRANCH, write, { CLAUDE_PROJECT_DIR: repo })));

    git("checkout", "-qb", "main-ish");
    check("3 a branch merely starting with 'main' is allowed",
      allows(runHook(MAIN_BRANCH, write, { CLAUDE_PROJECT_DIR: repo })));

    git("branch", "-M", "main");
    check("3 a non-write tool is allowed even on main",
      allows(runHook(MAIN_BRANCH, { tool_name: "Read", tool_input: {} }, { CLAUDE_PROJECT_DIR: repo })));

    // Fails open by design: no git repo means no branch to judge.
    const nonGit = mkdtempSync(join(tmpdir(), "hooks-nongit-"));
    check("3 fails open outside a git repository",
      allows(runHook(MAIN_BRANCH, write, { CLAUDE_PROJECT_DIR: nonGit })));

    // ── 0.7.6: scope, fail-closed reading, NotebookEdit ──
    const env = { CLAUDE_PROJECT_DIR: repo };
    const W = (file_path: string, tool = "Write") => ({ tool_name: tool, tool_input: { file_path } });
    const outside = mkdtempSync(join(tmpdir(), "hooks-outside-"));
    check("3 on main: a file outside any repository is not blocked", allows(runHook(MAIN_BRANCH, W(join(outside, "notes.md")), env)));
    check("3 on main: a new file in new directories outside the repository is not blocked", allows(runHook(MAIN_BRANCH, W(join(outside, "a", "b", "c.md")), env)));
    check("3 on main: a new file in a new directory inside the repository is blocked", blocks(runHook(MAIN_BRANCH, W(join(repo, "src", "new", "x.ts")), env)));
    check("3 on main: a path that climbs back into the repository is blocked", blocks(runHook(MAIN_BRANCH, W(`${outside}/../${repo.split("/").pop()}/a.txt`), env)));
    check("3 on main: a relative path resolves against the session directory", blocks(runHook(MAIN_BRANCH, { ...W("src/x.ts"), cwd: repo }, env)));
    symlinkSync(repo, join(outside, "dirlink"));
    check("3 on main: a symlinked directory into the repository is blocked", blocks(runHook(MAIN_BRANCH, W(join(outside, "dirlink", "a.txt")), env)));
    symlinkSync(join(repo, "a.txt"), join(outside, "filelink.txt"));
    check("3 on main: a symlinked file is blocked (fail closed)", blocks(runHook(MAIN_BRANCH, W(join(outside, "filelink.txt")), env)));
    symlinkSync(join(repo, "not-there"), join(outside, "dangling"));
    check("3 on main: a dangling symlinked directory is blocked (fail closed)", blocks(runHook(MAIN_BRANCH, W(join(outside, "dangling", "a.txt")), env)));
    check("3 on main: a tool call with no file path is blocked (fail closed)", blocks(runHook(MAIN_BRANCH, { tool_name: "Write", tool_input: {} }, env)));
    const garbage = spawnSync("bash", [MAIN_BRANCH], { input: "not json", encoding: "utf-8", env: { ...process.env, ...env } });
    check("3 on main: an unreadable payload is blocked (fail closed)", garbage.status === 2 && garbage.stderr.trim() !== "");
    for (const tool of ["Edit", "MultiEdit"]) check(`3 on main: ${tool} in the repository is blocked`, blocks(runHook(MAIN_BRANCH, W(join(repo, "a.txt"), tool), env)));
    const nb = (notebook_path: string) => ({ tool_name: "NotebookEdit", tool_input: { notebook_path, new_source: "x" } });
    check("3 on main: NotebookEdit in the repository is blocked", blocks(runHook(MAIN_BRANCH, nb(join(repo, "analysis.ipynb")), env)));
    check("3 on main: NotebookEdit outside the repository is not blocked", allows(runHook(MAIN_BRANCH, nb(join(outside, "scratch.ipynb")), env)));
    const cfg = JSON.parse(readFileSync(join(HOOKS, "block-main-branch-changes.json"), "utf-8"));
    const matcher = String(cfg.hooks?.PreToolUse?.[0]?.matcher ?? "");
    check("3 the matcher covers every file-editing tool: Write, Edit, MultiEdit, NotebookEdit",
      ["Write", "Edit", "MultiEdit", "NotebookEdit"].every((t) => new RegExp(`^(${matcher})$`).test(t)), matcher);

    // Missing jq: the hook cannot read the payload, so on main/master it blocks (it used to allow).
    const noJq = mkdtempSync(join(tmpdir(), "hooks-nojq-"));
    for (const c of ["git", "cat", "dirname"]) {
      const at = spawnSync("bash", ["-c", `command -v ${c}`], { encoding: "utf-8" }).stdout.trim();
      if (at) symlinkSync(at, join(noJq, c));
    }
    const bash = spawnSync("bash", ["-c", "command -v bash"], { encoding: "utf-8" }).stdout.trim();
    const runNoJq = (payload: unknown) => {
      const p = spawnSync(bash, [MAIN_BRANCH], { input: JSON.stringify(payload), encoding: "utf-8", env: { ...process.env, ...env, PATH: noJq } });
      return { code: p.status ?? -1, stdout: p.stdout ?? "", stderr: p.stderr ?? "" };
    };
    check("3 the no-jq PATH really has no jq", spawnSync(bash, ["-c", "command -v jq"], { encoding: "utf-8", env: { ...process.env, PATH: noJq } }).status !== 0);
    const nj = runNoJq(W(join(repo, "a.txt")));
    check("3 on main without jq: a write is blocked (fail closed), never silently allowed", blocks(nj), `${nj.code} ${nj.stderr}`);
    check("3 on main without jq: the block says jq is missing", /jq is not installed/.test(nj.stderr), nj.stderr);
    git("checkout", "-qb", "feat/no-jq");
    check("3 on a feature branch without jq: still allowed", allows(runNoJq(W(join(repo, "a.txt")))));
    check("3 on a feature branch: NotebookEdit is allowed", allows(runHook(MAIN_BRANCH, nb(join(repo, "analysis.ipynb")), env)));
    git("checkout", "-q", "main");

    rmSync(repo, { recursive: true, force: true });
    rmSync(nonGit, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
    rmSync(noJq, { recursive: true, force: true });
  }
}

/* ── 4. scan-for-secrets ──────────────────────────────────────────────── */
{
  const w = (content: string, file_path = "/repo/src/config.ts") => ({
    tool_name: "Write",
    tool_input: { file_path, content },
  });

  // Assembled, never literal — see the note at the top of this file.
  const Q = '"';
  const AWS = `AKIA${"IOSFODNN7EXAMPLE"}`;
  const PEM = `-----${"BEGIN"} RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----`;
  const GH = `gh${"p"}_abcdefghij0123456789ABCDEFGHIJ`;
  const PAT = `github${"_pat_"}abcdefghij0123456789_ABCDEFGHIJ`;
  const STRIPE = `sk${"_live_"}abcdefghij0123456789`;
  const SLACK = `xo${"xb"}-1234567890-abcdefghijkl`;
  const GENERIC_KEY = `api${"_key"} = ${Q}abcdefghij0123456789${Q}`;
  const GENERIC_PW = `pass${"word"}: ${Q}s3cretPassw0rdValue${Q}`;

  const secrets: Array<[string, string]> = [
    ["AWS access key id", `const k = ${Q}${AWS}${Q};`],
    ["private key block", PEM],
    ["GitHub token", `const t = ${Q}${GH}${Q};`],
    ["GitHub fine-grained PAT", `const t = ${Q}${PAT}${Q};`],
    ["Stripe live key", `const s = ${Q}${STRIPE}${Q};`],
    ["Slack token", `const s = ${Q}${SLACK}${Q};`],
    ["generic api_key assignment", GENERIC_KEY],
    ["generic password assignment", GENERIC_PW],
  ];
  for (const [label, content] of secrets) {
    check(`4 blocks ${label}`, blocks(runHook(SECRETS, w(content))));
  }
  check("4 the block names the pattern and never echoes the value", (() => {
    const r = runHook(SECRETS, w(`const k = ${Q}${AWS}${Q};`));
    return /hardcoded secret/i.test(r.stderr) && !r.stderr.includes(AWS);
  })());

  const clean: Array<[string, string]> = [
    ["ordinary source", "export const timeout = 5000;\nexport function go() { return 1; }"],
    ["a short token-ish value", `const t = ${Q}none${Q};`],
    ["a short placeholder", `apiKey: ${Q}TODO${Q}`],
    ["a url", `const base = ${Q}https://api.example.com/v1${Q};`],
  ];
  for (const [label, content] of clean) {
    check(`4 allows ${label}`, allows(runHook(SECRETS, w(content))));
  }

  check("4 scans Edit new_string",
    blocks(runHook(SECRETS, { tool_name: "Edit", tool_input: { file_path: "/a.ts", new_string: `k=${Q}${GH}${Q}` } })));
  check("4 scans every MultiEdit new_string",
    blocks(runHook(SECRETS, {
      tool_name: "MultiEdit",
      tool_input: { file_path: "/a.ts", edits: [{ new_string: "const a = 1;" }, { new_string: `k = ${Q}${STRIPE}${Q}` }] },
    })));
  check("4 a non-write tool is not scanned",
    allows(runHook(SECRETS, { tool_name: "Read", tool_input: { file_path: "/a.ts" } })));
  check("4 empty content is allowed", allows(runHook(SECRETS, w(""))));

  // .env handling: credential-named keys with real-looking values are blocked, while
  // ordinary config in the same file is not.
  check("4 .env with a real-looking secret is blocked",
    blocks(runHook(SECRETS, w("API_KEY=abcdefghijklmnop123456\n", "/repo/.env"))));
  check("4 .env.example with a placeholder is allowed",
    allows(runHook(SECRETS, w("API_KEY=your-key-here\n", "/repo/.env.example"))));
  check("4 .env non-credential config is allowed",
    allows(runHook(SECRETS, w("BASE_URL=https://api.example.com\nPORT=8080\n", "/repo/.env"))));
  check("4 .env comments are ignored",
    allows(runHook(SECRETS, w("# API_KEY=abcdefghijklmnop123456\n", "/repo/.env"))));
  check("4 .env short credential value is allowed",
    allows(runHook(SECRETS, w("API_KEY=none\n", "/repo/.env"))));

  // Documented behaviour, not a defect: the generic-assignment pattern has no
  // placeholder carve-out, so a >=16-char placeholder assigned to a credential-named
  // key in SOURCE is blocked. Placeholder exemptions live only in the .env branch,
  // where an example file legitimately carries them. Conservative by design; if this
  // is ever relaxed, relax it deliberately rather than by accident.
  check("4 a long placeholder in source is blocked (conservative default)",
    blocks(runHook(SECRETS, w(`apiKey: ${Q}YOUR-API-KEY-HERE${Q}`))));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
