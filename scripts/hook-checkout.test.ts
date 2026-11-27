/**
 * hook-checkout.test.ts
 *
 * Pins 0.9.1: the guards still START, and still ENFORCE, in a plugin copy that Git checked out
 * with `core.autocrlf=true` — Git for Windows' default, and how Claude Code installs a plugin.
 *
 * Before 0.9.1 such a checkout gave every hook CRLF line endings: invoked as hooks/*.json
 * configures it, the shebang read `bash\r` and the hook never started (exit 127, "No such file
 * or directory"); invoked through bash, `set -o pipefail\r` failed. Claude Code treats a hook
 * that cannot start as a non-blocking error, so main-branch protection, approval-before-code,
 * secrets scanning and the read-only /review-pr guard were silently not enforced. The fix is
 * .gitattributes (LF on checkout for every text file), never a rewrite of the hooks.
 *
 *   1. Git produces the checkout: a source repository holding this repository's tracked blobs
 *      and its .gitattributes is cloned by Git with core.autocrlf=true (set on the clone only —
 *      no global or system configuration is read or changed), and the clone's configuration is
 *      checked. Every tracked file is byte-identical to its stored blob: zero carriage returns,
 *      except the two documented CRLF hazard fixtures, which keep their CRLF bytes exactly.
 *   2. The control: the same tree WITHOUT .gitattributes, cloned the same way, really does get
 *      CRLF hook scripts, and the secrets guard really does fail to start there — so section 1
 *      proves the attributes, not a Git that happens not to convert.
 *   3. Every guard in the fresh checkout, started exactly as its hooks/*.json `command` says
 *      (through `bash -c`, as Claude Code does — Git Bash on Windows), under both readers of
 *      hooks/lib/hook-json.sh — jq, and Node.js with no jq on PATH — allows an allowed call and
 *      blocks / asks / denies a prohibited one, with the exact exit status and output channel
 *      of the hook contract (scripts/hooks.test.ts, scripts/bitbucket-pr.test.ts). An allow is
 *      exit 0 with nothing on stdout or stderr, so a hook that failed to start can never pass
 *      for one.
 *
 * Portable on purpose — it runs on the Windows CI runner (Git for Windows, Git Bash): paths are
 * native, executables are found through PATH and PATHEXT, and no MSYS path is handed to Node.
 * Needs git, bash, jq and Node.js; without jq the jq half prints SKIP, and `check.ts --strict`
 * reports the run as incomplete — a skip is never a pass.
 *
 *   node --no-warnings scripts/hook-checkout.test.ts
 */

import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { delimiter, dirname, join } from "path";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const WIN = process.platform === "win32";

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

/**
 * Evidence for a CI run: printed as INFO lines, and — on GitHub Actions — appended to the job's step
 * summary, because scripts/check.ts prints only a suite's FAIL lines. Exit codes, decisions, CR
 * counts and tool versions only: never a payload, a secret value or anything from a client.
 */
const evidence: string[] = [];
function info(s: string): void {
  console.log(`INFO  ${s}`);
  evidence.push(s);
}

/** The hook scripts and the library they all source — what a CRLF checkout broke. */
const GUARDS = ["block-main-branch-changes.sh", "require-approval-before-code.sh", "scan-for-secrets.sh", "review-pr-guard.sh"];
const LIBRARY = "hooks/lib/hook-json.sh";
/** The only tracked files whose stored bytes are CRLF, on purpose (scripts/fixtures/planning-docs/README.md). */
const CRLF_FIXTURES = ["scripts/fixtures/planning-docs/fa-hazards.md", "scripts/fixtures/planning-docs/fa-hazards.expected.md"];

/** An executable on PATH, as Windows resolves it (PATHEXT) or POSIX does — a native path, never an MSYS one. */
function findExe(name: string, path = process.env.PATH ?? ""): string | null {
  const exts = WIN ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean) : [""];
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    for (const ext of WIN ? [...exts, ""] : exts) {
      const p = join(dir, name + ext);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const GIT = findExe("git");
const BASH = findExe("bash");
const NODE = process.execPath;
if (!GIT || !BASH) {
  console.log(`FAIL  0 git and bash are on PATH  — git ${GIT} bash ${BASH}`);
  process.exit(1);
}

const TMP = realpathSync.native(mkdtempSync(join(tmpdir(), "hook-checkout-")));
const EMPTY_CONFIG = join(TMP, "empty.gitconfig");
writeFileSync(EMPTY_CONFIG, "");
/** Git with no global or system configuration (an empty file stands in for the global one), so nothing on the machine decides the line endings but this test. */
const GIT_ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: EMPTY_CONFIG, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" };
function git(cwd: string, args: string[], input?: string | Buffer): Buffer {
  const p = spawnSync(GIT!, args, { cwd, env: GIT_ENV, input, maxBuffer: 256 * 1024 * 1024 });
  if (p.status !== 0) throw new Error(`git ${args.join(" ")} (in ${cwd}) failed: ${p.stderr?.toString()}`);
  return p.stdout;
}
const gitText = (cwd: string, args: string[], input?: string | Buffer) => git(cwd, args, input).toString("utf-8").trim();

const fwd = (p: string) => p.replace(/\\/g, "/");

try {
  /* ── 0. The shell is the one Claude Code uses ─────────────────────────── */
  const uname = spawnSync(BASH, ["-c", "uname -s"], { encoding: "utf-8" }).stdout.trim();
  check("0 bash is Git Bash on Windows (never WSL's bash.exe)", !WIN || /MINGW|MSYS/i.test(uname), `${BASH}: ${uname}`);
  const machineAutocrlf = spawnSync(GIT, ["config", "--show-origin", "--get", "core.autocrlf"], { encoding: "utf-8" }).stdout.trim() || "unset";
  info(`platform ${process.platform} · node ${process.version} · ${spawnSync(GIT, ["--version"], { encoding: "utf-8" }).stdout.trim()} · ${spawnSync(BASH, ["--version"], { encoding: "utf-8" }).stdout.split("\n")[0]} · uname ${uname}`);
  info(`this machine's core.autocrlf (not read by the clones below): ${machineAutocrlf.replace(/\s+/, " ")}`);

  /* ── 1. Git produces the checkout ─────────────────────────────────────── */
  // This repository's tracked files as stored (the index: normalized blobs, exactly what a
  // remote serves), with the .gitattributes under test — the working-tree copy.
  const entries = gitText(REPO_ROOT, ["ls-files", "-s", "-z"]).split("\0").filter(Boolean).map((l) => {
    const [meta, path] = l.split("\t");
    const [mode, oid] = meta.split(" ");
    return { mode, oid, path };
  });
  const attributes = readFileSync(join(REPO_ROOT, ".gitattributes"));
  const objects = fwd(gitText(REPO_ROOT, ["rev-parse", "--path-format=absolute", "--git-common-dir"])) + "/objects";

  /** A source repository with this tree (borrowing this repository's objects) — optionally without .gitattributes. */
  function sourceRepo(name: string, withAttributes: boolean): string {
    const src = join(TMP, name);
    mkdirSync(src);
    git(src, ["init", "-q"]);
    writeFileSync(join(src, ".git", "objects", "info", "alternates"), objects + "\n");
    const attrOid = gitText(src, ["hash-object", "-w", "--stdin"], attributes);
    const list = entries
      .filter((e) => e.path !== ".gitattributes")
      .concat(withAttributes ? [{ mode: "100644", oid: attrOid, path: ".gitattributes" }] : [])
      .map((e) => `${e.mode} ${e.oid}\t${e.path}`)
      .join("\0") + "\0";
    git(src, ["update-index", "-z", "--index-info"], list);
    const tree = gitText(src, ["write-tree"]);
    const commit = gitText(src, ["commit-tree", tree, "-m", "plugin"]);
    git(src, ["update-ref", "refs/heads/main", commit]);
    git(src, ["symbolic-ref", "HEAD", "refs/heads/main"]);
    return src;
  }
  /** Git clones it — a real checkout, made by Git, with core.autocrlf=true on the clone alone. */
  function autocrlfClone(src: string, name: string): string {
    const dst = join(TMP, name);
    git(TMP, ["clone", "-q", "--no-local", "-c", "core.autocrlf=true", src, dst]);
    return dst;
  }

  const fixed = autocrlfClone(sourceRepo("src-fixed", true), "installed");
  check("1 the clone was made by Git with core.autocrlf=true (its own configuration)", gitText(fixed, ["config", "--local", "--get", "core.autocrlf"]) === "true");
  info(`fresh checkout: made by git clone with core.autocrlf=${gitText(fixed, ["config", "--local", "--get", "core.autocrlf"])} (local), system and global configuration excluded`);
  check("1 the clone carries the plugin's .gitattributes", existsSync(join(fixed, ".gitattributes")) && readFileSync(join(fixed, ".gitattributes")).equals(attributes));
  check("1 the clone is complete (every tracked file was checked out)", entries.every((e) => existsSync(join(fixed, e.path))), String(entries.filter((e) => !existsSync(join(fixed, e.path))).length));

  const cr = (p: string) => readFileSync(p).filter((b) => b === 13).length;
  for (const f of [...GUARDS.map((g) => `hooks/${g}`), LIBRARY]) {
    check(`1 ${f}: zero carriage returns in the autocrlf=true checkout`, cr(join(fixed, f)) === 0, `${cr(join(fixed, f))} CR`);
  }
  // Every other script a release runs: anything named *.sh, or starting with a shebang.
  const scripts = entries.map((e) => e.path).filter((p) => p.endsWith(".sh") || readFileSync(join(fixed, p)).subarray(0, 2).toString() === "#!");
  check("1 every shell script and shebang script is found (the four guards and the library included)", [...GUARDS.map((g) => `hooks/${g}`), LIBRARY].every((f) => scripts.includes(f)), scripts.join(", "));
  const withCr = scripts.filter((p) => cr(join(fixed, p)) > 0);
  check(`1 all ${scripts.length} shell and shebang scripts are LF-only`, withCr.length === 0, withCr.join(", "));
  // Byte for byte: every tracked file in the checkout is its stored blob — LF stays LF, and the
  // two CRLF hazard fixtures keep their CRLF bytes exactly (-text: never converted).
  const blob = (oid: string) => git(REPO_ROOT, ["cat-file", "blob", oid]);
  const differ = entries.filter((e) => e.path !== ".gitattributes" && !readFileSync(join(fixed, e.path)).equals(blob(e.oid))).map((e) => e.path);
  check(`1 all ${entries.length} tracked files are byte-identical to their stored blobs`, differ.length === 0, differ.slice(0, 8).join(", "));
  const stray = entries.filter((e) => !CRLF_FIXTURES.includes(e.path) && cr(join(fixed, e.path)) > 0).map((e) => e.path);
  check("1 no tracked file but the two documented CRLF fixtures holds a carriage return", stray.length === 0, stray.join(", "));
  for (const f of CRLF_FIXTURES) {
    const e = entries.find((x) => x.path === f);
    const bytes = readFileSync(join(fixed, f));
    check(`1 ${f}: still CRLF, byte-identical to the stored fixture`, e !== undefined && bytes.equals(blob(e.oid)) && bytes.includes("\r\n"), `${cr(join(fixed, f))} CR`);
  }

  /* ── 2. The control: without .gitattributes, the defect is real ───────── */
  const broken = autocrlfClone(sourceRepo("src-unfixed", false), "installed-unfixed");
  const brokenCr = [...GUARDS.map((g) => `hooks/${g}`), LIBRARY].map((f) => [f, cr(join(broken, f))] as const);
  info(`carriage returns, fixed checkout (with .gitattributes): ${[...GUARDS.map((g) => `hooks/${g}`), LIBRARY].map((f) => `${f}=${cr(join(fixed, f))}`).join(" ")}`);
  info(`carriage returns, control checkout (without .gitattributes): ${brokenCr.map(([f, n]) => `${f}=${n}`).join(" ")}`);
  // Git produced those CRs: the control was cloned with core.autocrlf=true, and the blobs it checked out hold none.
  const brokenBlobCr = [...GUARDS.map((g) => `hooks/${g}`), LIBRARY].map((f) => git(broken, ["cat-file", "blob", `HEAD:${f}`]).filter((b) => b === 13).length);
  check("2 control: Git produced the CRLF — the clone has core.autocrlf=true and its stored blobs are LF-only", gitText(broken, ["config", "--local", "--get", "core.autocrlf"]) === "true" && brokenBlobCr.every((n) => n === 0), JSON.stringify(brokenBlobCr));
  check("2 control: without .gitattributes the same Git checkout gives every hook CRLF line endings", brokenCr.every(([f, n]) => n > 0 && n === readFileSync(join(broken, f)).toString("latin1").split("\n").length - 1), JSON.stringify(brokenCr));

  /* ── 3. Every guard starts and enforces in the fresh checkout ─────────── */
  interface Run { code: number; stdout: string; stderr: string }
  /** A guard started exactly as its hooks/<config>.json command says, through bash -c — Claude Code's invocation. */
  function viaConfig(root: string, config: string, payload: unknown, path: string, cwd: string, env: Record<string, string> = {}): Run {
    const cfg = JSON.parse(readFileSync(join(root, "hooks", config), "utf-8"));
    const command: string = cfg.hooks.PreToolUse[0].hooks[0].command;
    const p = spawnSync(BASH!, ["-c", command], {
      cwd,
      input: JSON.stringify(payload),
      encoding: "utf-8",
      env: { ...process.env, PATH: path, CLAUDE_PLUGIN_ROOT: root, ...env },
    });
    return { code: p.status ?? -1, stdout: p.stdout ?? "", stderr: p.stderr ?? "" };
  }
  const decision = (r: Run): string | null => {
    try {
      return JSON.parse(r.stdout)?.hookSpecificOutput?.permissionDecision ?? null;
    } catch {
      return null;
    }
  };
  const show = (r: Run) => `exit ${r.code} stdout ${JSON.stringify(r.stdout.slice(0, 160))} stderr ${JSON.stringify(r.stderr.slice(0, 160))}`;
  /** An allow / pass-through: exit 0 and nothing at all on either channel — a hook that failed to start never looks like this. */
  const allowed = (r: Run) => r.code === 0 && r.stdout === "" && r.stderr === "";
  const blocked = (r: Run) => r.code === 2 && r.stdout === "" && r.stderr.trim() !== "";
  const decided = (r: Run, d: string) => r.code === 0 && r.stderr === "" && decision(r) === d;
  /** What a guard did, in the contract's words — for the evidence, never the payload. */
  const outcome = (r: Run) =>
    allowed(r) ? "exit 0, silent (allowed)" : blocked(r) ? "exit 2, reason on stderr (blocked)" : r.code === 0 && decision(r) ? `exit 0, ${decision(r)} decision` : `exit ${r.code} (NOT a contract result)`;

  // The control's secrets guard, started the same way: a startup failure, never an enforcement.
  const AWS = `AKIA${"IOSFODNN7EXAMPLE"}`; // assembled: this repository's own secrets hook scans this file
  const secretWrite = { tool_name: "Write", tool_input: { file_path: join(TMP, "work", "config.ts"), content: `const k = "${AWS}";` } };
  const startFail = viaConfig(broken, "protect-secrets.json", secretWrite, process.env.PATH ?? "", TMP);
  info(`control: the CRLF secrets guard, started through its hooks.json command — exit ${startFail.code}, stderr ${JSON.stringify(startFail.stderr.split("\n")[0].slice(0, 120))}`);
  if (WIN) {
    // Observed, not required: some Git Bash builds (5.3 on the GitHub runner) start a `bash\r`
    // shebang anyway, so a CRLF hook may run there; the defect was confirmed on an installed
    // Windows copy whose hooks did not start. The CRLF bytes above are the mandatory evidence.
    info(`control on Windows: ${startFail.code === 2 ? "this Git Bash STARTED the CRLF guard (it blocked)" : startFail.code === 127 ? "this Git Bash could NOT start the CRLF guard" : `exit ${startFail.code}`} — observational only`);
  } else {
    check("2 control: the CRLF secrets guard fails to start (neither an allow nor a block) — the defect 0.9.1 fixes", startFail.code !== 0 && startFail.code !== 2 && startFail.stderr !== "", show(startFail));
  }

  // Readers: jq (the PATH as it is), and Node.js with no jq anywhere on PATH.
  const haveJq = findExe("jq") !== null;
  const TOOLS = ["bash", "cat", "dirname", "git", "grep", "head", "node"]; // bash too: the shebang finds it through PATH
  const finds = (path: string, tool: string) => spawnSync(BASH!, ["-c", `command -v ${tool}`], { encoding: "utf-8", env: { ...process.env, PATH: path } }).status === 0;
  function nodeOnlyPath(): string {
    // Drop the PATH entries that hold jq; keep everything else (Git Bash's tools on Windows).
    const filtered = (process.env.PATH ?? "").split(delimiter).filter((d) => d && !existsSync(join(d, "jq")) && !existsSync(join(d, "jq.exe"))).join(delimiter);
    if (TOOLS.every((t) => finds(filtered, t))) return filtered;
    // jq shares a directory with the basic tools (/usr/bin on Linux): a directory of links to just those tools.
    const bin = join(TMP, "node-only-bin");
    mkdirSync(bin);
    for (const t of TOOLS) {
      const at = t === "node" ? NODE : findExe(t);
      if (at) spawnSync("ln", ["-s", at, join(bin, t)]);
    }
    return bin;
  }
  const NODE_ONLY = nodeOnlyPath();
  check("3 the Node.js-only PATH has the hooks' tools and Node.js, and no jq", TOOLS.every((t) => finds(NODE_ONLY, t)) && !finds(NODE_ONLY, "jq"), NODE_ONLY);
  // The library itself says which reader it will use — the fallback is really exercised, not assumed.
  const runtime = (path: string) => spawnSync(BASH!, ["-c", '. "$1" && json_runtime', "_", join(fixed, LIBRARY)], { encoding: "utf-8", env: { ...process.env, PATH: path } }).stdout.trim();
  check("3 under the Node.js-only PATH the fresh checkout's hook library reads with Node.js", runtime(NODE_ONLY) === "node", runtime(NODE_ONLY));
  if (haveJq) check("3 under the normal PATH it reads with jq", runtime(process.env.PATH ?? "") === "jq", runtime(process.env.PATH ?? ""));

  // A disposable project for the main-branch guard: a repository on main, then on a feature branch.
  const project = join(TMP, "project");
  mkdirSync(join(project, "src"), { recursive: true });
  git(project, ["init", "-q", "-b", "main"]);
  writeFileSync(join(project, "README.md"), "x\n");
  git(project, ["add", "-A"]);
  git(project, ["commit", "-qm", "init"]);
  const projectFile = join(project, "src", "App.ts");
  const write = (file_path: string, content = "export const a = 1;\n") => ({ tool_name: "Write", tool_input: { file_path, content }, cwd: project });
  const env = { CLAUDE_PROJECT_DIR: project };

  const readers: Array<[string, string]> = [["Node.js (no jq)", NODE_ONLY]];
  if (haveJq) readers.unshift(["jq", process.env.PATH ?? ""]);
  else console.log("SKIP  3 the jq reader: jq is not installed on this machine");

  for (const [reader, path] of readers) {
    const t = (s: string) => `3 [${reader}] ${s}`;
    // block-main-branch-changes — exit 2 + stderr on main; exit 0, silent, on a feature branch.
    git(project, ["checkout", "-q", "main"]);
    const onMain = viaConfig(fixed, "block-main-branch-changes.json", write(projectFile), path, project, env);
    check(t("block-main-branch-changes: a write on main is blocked (exit 2, the reason on stderr)"), blocked(onMain) && /feature branch/i.test(onMain.stderr), show(onMain));
    info(`[${reader}] block-main-branch-changes: a write on main is blocked (exit 2, the reason on stderr) → ${outcome(onMain)}`);
    git(project, ["checkout", "-q", "-B", "feature/x"]);
    const onBranch = viaConfig(fixed, "block-main-branch-changes.json", write(projectFile), path, project, env);
    check(t("block-main-branch-changes: the same write on a feature branch is allowed (exit 0, silent)"), allowed(onBranch), show(onBranch));
    info(`[${reader}] block-main-branch-changes: the same write on a feature branch is allowed (exit 0, silent) → ${outcome(onBranch)}`);

    // scan-for-secrets — exit 2 + stderr naming the pattern, never the value; a clean write passes.
    const secret = viaConfig(fixed, "protect-secrets.json", secretWrite, path, project, env);
    check(t("scan-for-secrets: a hardcoded AWS key is blocked (exit 2, the pattern on stderr, never the value)"), blocked(secret) && !secret.stderr.includes(AWS), show(secret));
    info(`[${reader}] scan-for-secrets: a hardcoded AWS key is blocked (exit 2, the pattern on stderr, never the value) → ${outcome(secret)}`);
    const clean = viaConfig(fixed, "protect-secrets.json", write(projectFile), path, project, env);
    check(t("scan-for-secrets: a clean write is allowed (exit 0, silent)"), allowed(clean), show(clean));
    info(`[${reader}] scan-for-secrets: a clean write is allowed (exit 0, silent) → ${outcome(clean)}`);

    // require-approval-before-code — a code write asks (exit 0 + decision JSON); a doc write passes through.
    const code = viaConfig(fixed, "require-approval-before-code.json", write(projectFile), path, project, env);
    check(t("require-approval-before-code: a code write asks for approval (exit 0, an ask decision naming the file)"), decided(code, "ask") && code.stdout.includes("App.ts"), show(code));
    info(`[${reader}] require-approval-before-code: a code write asks for approval (exit 0, an ask decision naming the file) → ${outcome(code)}`);
    const doc = viaConfig(fixed, "require-approval-before-code.json", write(join(project, "docs", "notes.md"), "notes\n"), path, project, env);
    check(t("require-approval-before-code: a doc write passes through (exit 0, silent)"), allowed(doc), show(doc));
    info(`[${reader}] require-approval-before-code: a doc write passes through (exit 0, silent) → ${outcome(doc)}`);

    // review-pr-guard — inside pr-reviewer a write is denied (exit 0 + deny JSON); a read is allowed; other agents pass.
    const reviewer = "ono-mobile-dev-plugin:pr-reviewer";
    const denied = viaConfig(fixed, "review-pr-guard.json", { ...write(projectFile), agent_type: reviewer }, path, project, env);
    check(t("review-pr-guard: a write inside the reviewer is denied (exit 0, a deny decision)"), decided(denied, "deny"), show(denied));
    info(`[${reader}] review-pr-guard: a write inside the reviewer is denied (exit 0, a deny decision) → ${outcome(denied)}`);
    const read = viaConfig(fixed, "review-pr-guard.json", { tool_name: "Read", tool_input: { file_path: projectFile }, agent_type: reviewer }, path, project, env);
    check(t("review-pr-guard: a read inside the reviewer is allowed (exit 0, silent)"), allowed(read), show(read));
    info(`[${reader}] review-pr-guard: a read inside the reviewer is allowed (exit 0, silent) → ${outcome(read)}`);
    const main = viaConfig(fixed, "review-pr-guard.json", write(projectFile), path, project, env);
    check(t("review-pr-guard: a call outside the reviewer passes through (exit 0, silent)"), allowed(main), show(main));
    info(`[${reader}] review-pr-guard: a call outside the reviewer passes through (exit 0, silent) → ${outcome(main)}`);
  }

  /* ── 4. Windows paths in block-main-branch-changes (0.9.2) ────────────── */
  // The fix is one marked block that runs only under Git Bash. 0.9.3 adds a second marked block
  // (filesystem identity, § 5). Removing the 0.9.3 block gives the released 0.9.2 hook byte for
  // byte, and removing both gives the released 0.9.1 hook: those copies are the negative controls.
  const HOOK_091_SHA256 = "08834255cd3a3e0226380a0b336214b88dda8baf9f30232676261070dab7e90e";
  const HOOK_092_SHA256 = "f01bb2da741a569e0cd508bfca7509c0063eab5bc1923953f8b8bd5398a19191";
  const BEGIN = "# >>> Windows paths (0.9.2)";
  const END = "# <<< Windows paths (0.9.2)\n";
  const BEGIN_093 = "# >>> Filesystem identity (0.9.3)";
  const END_093 = "# <<< Filesystem identity (0.9.3)\n";
  const cut = (buf: Buffer | null, begin: string, end: string): Buffer | null => {
    if (buf === null) return null;
    const a = buf.indexOf(begin), b = buf.indexOf(end);
    return a >= 0 && b > a ? Buffer.concat([buf.subarray(0, a), buf.subarray(b + end.length)]) : null;
  };
  const without093 = (buf: Buffer) => cut(buf, BEGIN_093, END_093);
  const withoutBlock = (buf: Buffer) => cut(without093(buf), BEGIN, END);
  const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  const hookNow = readFileSync(join(REPO_ROOT, "hooks", "block-main-branch-changes.sh"));
  const control092 = without093(hookNow);
  check("4 the 0.9.3 identity fix is one marked block; without it the hook is the released 0.9.2 hook byte for byte", control092 !== null && sha256(control092) === HOOK_092_SHA256, control092 ? sha256(control092) : "no block");
  const control091 = withoutBlock(hookNow);
  check("4 the Windows path fix is one marked block; without it (and the 0.9.3 block) the hook is the released 0.9.1 hook byte for byte", control091 !== null && sha256(control091) === HOOK_091_SHA256, control091 ? sha256(control091) : "no block");
  const blockText = hookNow.subarray(hookNow.indexOf(BEGIN), hookNow.indexOf(END)).toString("utf-8");
  check("4 the block runs only under Git Bash (OSTYPE msys or cygwin), so macOS and Linux behaviour is unchanged", /^case "\$\{OSTYPE:-\}" in\n  msys\*\|cygwin\*\)$/m.test(blockText) && (blockText.match(/^  \S[^\n]*\)$/gm) ?? []).length === 1 && /^esac$/m.test(blockText), blockText.slice(0, 120));
  // POSIX behaviour, executed: on this platform the hook still blocks a write on main and allows one outside the repository (scripts/hooks.test.ts § 3 pins the full POSIX matrix).

  if (!WIN) {
    info("section 4: the Windows path matrix runs on the Windows CI runner only — on this platform C:\\… is not an absolute path, so nothing here could reproduce it");
  } else {
    // A protected repository on main, one with a space in its path, and a folder outside both.
    const mkRepo = (dir: string) => {
      mkdirSync(join(dir, "src"), { recursive: true });
      git(dir, ["init", "-q", "-b", "main"]);
      writeFileSync(join(dir, "src", "App.ts"), "export {};\n");
      git(dir, ["add", "-A"]);
      git(dir, ["commit", "-qm", "init"]);
      return dir;
    };
    const P = mkRepo(join(TMP, "win-protected"));
    const SP = mkRepo(join(TMP, "with space", "protected repo"));
    const O = join(TMP, "win-outside");
    mkdirSync(O, { recursive: true });
    const fwdSlash = (p: string) => p.replace(/\\/g, "/");
    const msysPath = (p: string) => `/${p[0].toLowerCase()}${fwdSlash(p.slice(2))}`;
    const uncPath = (p: string) => `\\\\localhost\\${p[0]}$${p.slice(2)}`;
    const writeTo = (file_path: string, cwd?: string) => ({ tool_name: "Write", tool_input: { file_path, content: "x" }, ...(cwd === undefined ? {} : { cwd }) });
    const hookIn = (root: string, script: string, payload: unknown, projectDir: string, path = process.env.PATH ?? ""): Run => {
      const p = spawnSync(BASH!, ["-c", `"\${CLAUDE_PLUGIN_ROOT}/hooks/${script}"`], { cwd: projectDir, input: JSON.stringify(payload), encoding: "utf-8", env: { ...process.env, PATH: path, CLAUDE_PLUGIN_ROOT: root, CLAUDE_PROJECT_DIR: projectDir } });
      return { code: p.status ?? -1, stdout: p.stdout ?? "", stderr: p.stderr ?? "" };
    };
    const HOOK = "block-main-branch-changes.sh";
    const inside = join(P, "src", "App.ts"), outside = join(O, "notes.md");
    type Want = "BLOCK" | "ALLOW";
    const matrix: Array<[string, unknown, string, Want]> = [];
    for (const [form, f] of [["C:\\ backslashes", (p: string) => p], ["C:/ forward slashes", fwdSlash], ["/c/ Git Bash", msysPath]] as const) {
      for (const [where, cwd] of [["cwd inside", P], ["cwd OUTSIDE", O], ["no cwd", undefined]] as const) {
        matrix.push([`${form}, target inside, ${where}`, writeTo(f(inside), cwd), P, "BLOCK"]);
        matrix.push([`${form}, target outside, ${where}`, writeTo(f(outside), cwd), P, "ALLOW"]);
      }
    }
    matrix.push(["UNC, target inside, cwd outside (fail closed)", writeTo(uncPath(inside), O), P, "BLOCK"]);
    matrix.push(["UNC, target outside (fail closed on main)", writeTo(uncPath(outside), O), P, "BLOCK"]);
    matrix.push(["drive-relative C:src\\App.ts, cwd outside (ambiguous → fail closed)", writeTo(`${P[0]}:src\\App.ts`, O), P, "BLOCK"]);
    matrix.push(["relative src\\App.ts, cwd inside", writeTo("src\\App.ts", P), P, "BLOCK"]);
    matrix.push(["relative src\\App.ts, no cwd (the project directory)", writeTo("src\\App.ts"), P, "BLOCK"]);
    matrix.push(["relative notes.md, cwd outside (the file is outside)", writeTo("notes.md", O), P, "ALLOW"]);
    matrix.push(["relative path, drive-relative cwd (ambiguous → fail closed)", writeTo("src\\App.ts", `${P[0]}:win-protected`), P, "BLOCK"]);
    matrix.push(["a path with spaces, target inside, cwd outside", writeTo(join(SP, "src", "App.ts"), O), SP, "BLOCK"]);
    matrix.push(["a path with spaces, forward slashes, target inside, cwd outside", writeTo(fwdSlash(join(SP, "src", "App.ts")), O), SP, "BLOCK"]);

    /** A contract decision, or exactly why it is not one — an execution failure or malformed output is never read as an allow. */
    const decision = (r: Run): Want | string =>
      blocked(r) ? "BLOCK" : allowed(r) ? "ALLOW" : `NOT A DECISION (exit ${r.code}, stdout ${JSON.stringify(r.stdout.slice(0, 60))}, stderr ${JSON.stringify(r.stderr.slice(0, 100))})`;
    // Negative control: the released 0.9.1 logic (byte-identical, checked above), on the critical
    // cases, under both readers — recorded as observed, never assumed.
    const controlScript = "block-main-branch-changes.control-0.9.1.sh";
    const controlBytes = withoutBlock(readFileSync(join(fixed, "hooks", HOOK)));
    check("4 the negative control written for this run is the released 0.9.1 hook byte for byte", controlBytes !== null && sha256(controlBytes) === HOOK_091_SHA256);
    writeFileSync(join(fixed, "hooks", controlScript), controlBytes!);
    for (const [reader, path] of readers) {
      for (const [label, payload, projectDir] of matrix.filter(([l]) => /cwd OUTSIDE/.test(l) && /target inside/.test(l))) {
        const d = decision(hookIn(fixed, controlScript, payload, projectDir, path));
        const verdict = d === "ALLOW" ? "DEFECT REPRODUCED — 0.9.1 let a write to main through (exit 0, silent)" : d === "BLOCK" ? "not reproduced — 0.9.1 blocked it" : "inconclusive — the control did not produce a decision";
        info(`negative control [${reader}] (0.9.1 hook) — ${label}: ${d} → ${verdict}`);
      }
    }
    // The corrected hook, from the fresh checkout, under both readers.
    for (const [reader, path] of readers) {
      const wrong: string[] = [];
      for (const [label, payload, projectDir, want] of matrix) {
        const r = hookIn(fixed, HOOK, payload, projectDir, path);
        info(`0.9.2 hook [${reader}] — ${label}: ${decision(r)} (want ${want})`);
        if (decision(r) !== want) wrong.push(`${label}: ${decision(r)} (want ${want})`);
      }
      check(`4 [${reader}] Windows paths: all ${matrix.length} cases block or allow by where the file is, never by the session directory`, wrong.length === 0, wrong.join(" | "));
      info(`[${reader}] Windows path matrix: ${matrix.length - wrong.length}/${matrix.length} as required`);
    }
    git(P, ["checkout", "-q", "-b", "feature/x"]);
    for (const [reader, path] of readers) {
      const onFeature = hookIn(fixed, HOOK, writeTo(inside, O), P, path);
      check(`4 [${reader}] on a feature branch the same Windows-path write is allowed (the branch check is unchanged)`, allowed(onFeature), show(onFeature));
      info(`0.9.2 hook [${reader}] — feature branch, C:\\ target inside, cwd outside: ${decision(onFeature)} (want ALLOW)`);
    }

    /* ── 5. Filesystem identity and name aliases on Windows (0.9.3) ─────── */
    // NTFS is case-insensitive, has 8.3 short names (where the volume creates them) and junctions;
    // a file name keeps working with trailing dots/spaces and the ::$DATA stream suffix. Every case
    // below is executed here, from the fresh checkout, under both readers. A capability this runner
    // does not have is reported as NOT VALIDATED — never counted as a pass.
    const I = mkRepo(join(TMP, "win-ident"));
    const IO = join(TMP, "win-ident-outside");
    mkdirSync(IO, { recursive: true });
    mkdirSync(join(TMP, "win-ident-sibling"), { recursive: true });
    const cmd = (line: string) => spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${line}"`], { windowsVerbatimArguments: true, encoding: "utf-8" });
    const short = cmd(`for %I in ("${I}") do @echo %~sI`).stdout.trim();
    const fsutil = cmd(`fsutil 8dot3name query ${I.slice(0, 2)}`).stdout.replace(/\s+/g, " ").trim();
    info(`8.3 names on ${I.slice(0, 2)}: fsutil says «${fsutil.slice(0, 160)}»; the repository's short form is «${short}»`);
    const junctionIn = join(IO, "jn-into-repo");
    const jIn = cmd(`mklink /J "${junctionIn}" "${join(I, "src")}"`);
    const junctionOut = join(I, "jn-out");
    const jOut = cmd(`mklink /J "${junctionOut}" "${IO}"`);
    info(`junctions: into the repository ${jIn.status === 0 ? "created" : `NOT created (${jIn.stderr.trim()})`}; out of it ${jOut.status === 0 ? "created" : `NOT created (${jOut.stderr.trim()})`}`);

    const idCases: Array<[string, unknown, Want]> = [
      ["upper-case C:\\ path to an existing file", writeTo(I.toUpperCase() + "\\SRC\\APP.TS", IO), "BLOCK"],
      ["lower-case c:/ path", writeTo(fwdSlash(I).toLowerCase() + "/src/app.ts", IO), "BLOCK"],
      ["mixed-case /c/ Git Bash path, new file in new folders", writeTo(msysPath(I).replace(/win-ident/, "Win-Ident") + "/NEW/deep/x.ts", IO), "BLOCK"],
      ["relative path, upper-case session directory", writeTo("src\\App.ts", I.toUpperCase()), "BLOCK"],
      ["a sibling whose name starts with the repository's (positive)", writeTo(join(TMP, "win-ident-sibling", "x.ts"), IO), "ALLOW"],
      ["upper-case path outside the repository (positive)", writeTo(IO.toUpperCase() + "\\NOTES.MD", I), "ALLOW"],
      ["the folder holding the repository (positive)", writeTo(join(TMP, "notes.md"), IO), "ALLOW"],
    ];
    if (short && short.toLowerCase() !== I.toLowerCase()) idCases.push(["8.3 short name of the repository", writeTo(`${short}\\src\\App.ts`, IO), "BLOCK"]);
    else info("8.3 short names: NOT VALIDATED — this runner's volume gives the repository no short name distinct from its long name (8.3 creation off, or names already short); no 8.3 case was executed");
    if (jIn.status === 0) idCases.push(["a junction outside that points into the repository", writeTo(join(junctionIn, "new.ts"), IO), "BLOCK"]);
    else info("junction into the repository: NOT VALIDATED — the junction could not be created");
    if (jOut.status === 0) idCases.push(["a junction inside the repository that points outside (the file is outside — positive)", writeTo(join(junctionOut, "notes.md"), I), "ALLOW"]);
    else info("junction out of the repository: NOT VALIDATED — the junction could not be created");

    const control092Script = "block-main-branch-changes.control-0.9.2.sh";
    const c092 = without093(readFileSync(join(fixed, "hooks", HOOK)));
    check("5 the 0.9.2 negative control written for this run is the released 0.9.2 hook byte for byte", c092 !== null && sha256(c092) === HOOK_092_SHA256);
    writeFileSync(join(fixed, "hooks", control092Script), c092!);
    for (const [reader, path] of readers) {
      for (const [label, payload, want] of idCases.filter(([, , w]) => w === "BLOCK")) {
        const d = decision(hookIn(fixed, control092Script, payload, I, path));
        info(`negative control [${reader}] (0.9.2 hook) — ${label}: ${d} → ${d === "ALLOW" ? "DEFECT REPRODUCED" : d === "BLOCK" ? "not reproduced — 0.9.2 blocked it" : "inconclusive"} (0.9.3 wants ${want})`);
      }
      const wrong: string[] = [];
      for (const [label, payload, want] of idCases) {
        const d = decision(hookIn(fixed, HOOK, payload, I, path));
        info(`0.9.3 hook [${reader}] — ${label}: ${d} (want ${want})`);
        if (d !== want) wrong.push(`${label}: ${d} (want ${want})`);
      }
      check(`5 [${reader}] filesystem identity on Windows: all ${idCases.length} executed cases as required`, wrong.length === 0, wrong.join(" | "));

      // DEV-09 and DEV-12 on Windows, through the hooks as installed.
      const approval = (f: string) => hookIn(fixed, "require-approval-before-code.sh", { tool_name: "Write", tool_input: { file_path: f, content: "x" }, cwd: I }, I, path);
      const notAsked = [`${I}\\src\\APP.TS`, `${I}\\src\\App.ts.`, `${I}\\src\\App.ts `, `${I}\\src\\App.ts::$DATA`, `${fwdSlash(I)}/src/App.Ts:zone`].filter((f) => !decided(approval(f), "ask"));
      check(`5 [${reader}] DEV-09 upper case, trailing dot/space and ::$DATA spellings of a code file all ask`, notAsked.length === 0, notAsked.join(", "));
      check(`5 [${reader}] DEV-09 a doc file still passes through (positive)`, allowed(approval(`${I}\\docs\\NOTES.MD`)));
      const secretsIn = (f: string, content: string) => hookIn(fixed, "scan-for-secrets.sh", { tool_name: "Write", tool_input: { file_path: f, content } }, I, path);
      const V = `Zq8pR2vL9x${"T4mW7kN3bY"}`;
      check(`5 [${reader}] DEV-12 a credential in .ENV is blocked`, blocked(secretsIn(`${I}\\.ENV`, `DB_PASSWORD=${V}\n`)));
      check(`5 [${reader}] DEV-12 a placeholder in .ENV.EXAMPLE is allowed (positive)`, allowed(secretsIn(`${I}\\.ENV.EXAMPLE`, "API_KEY=your-key-here\n")));
    }
  }
} finally {
  if (process.env.GITHUB_STEP_SUMMARY && evidence.length > 0) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### hook-checkout evidence (${process.platform}, node ${process.version})\n\n${evidence.map((e) => `- ${e.replace(/\|/g, "\\|")}`).join("\n")}\n\n`);
    } catch {
      /* evidence is a convenience; the assertions decide */
    }
  }
  rmSync(TMP, { recursive: true, force: true });
}

if (failures > 0) {
  console.log(`\n${failures} hook checkout check(s) failed`);
  process.exit(1);
}
console.log("\nall hook checkout checks passed");
