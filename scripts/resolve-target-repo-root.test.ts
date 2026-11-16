/**
 * resolve-target-repo-root.test.ts
 *
 * Self-contained tests for scripts/resolve-target-repo-root.ts. Builds throwaway
 * git repositories in a temp dir and exercises the CLI end-to-end (stdout JSON
 * + exit code), covering the scenarios the command relies on:
 *   1. normal repository root
 *   2. execution from a subdirectory
 *   3. execution inside .claude/worktrees/... (agent worktree is unwrapped)
 *   4. ambiguous / non-git paths (non-git dir, nonexistent path, and a
 *      .claude/worktrees path that cannot be unwrapped -> loud failure)
 *
 * No external test framework. Run with:
 *   node scripts/resolve-target-repo-root.test.ts
 *   bun  scripts/resolve-target-repo-root.test.ts
 */

import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const HELPER = join(import.meta.dirname ?? __dirname, "resolve-target-repo-root.ts");
const RUNTIME = process.execPath; // node or bun, whichever ran this file

interface CliRun {
  code: number;
  json: Record<string, unknown> | null;
  stdout: string;
  stderr: string;
}

function runHelper(candidate: string): CliRun {
  try {
    const stdout = execFileSync(RUNTIME, [HELPER, candidate], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, json: safeParse(stdout), stdout, stderr: "" };
  } catch (err: any) {
    const stdout = err.stdout?.toString() ?? "";
    return {
      code: typeof err.status === "number" ? err.status : 1,
      json: safeParse(stdout),
      stdout,
      stderr: err.stderr?.toString() ?? "",
    };
  }
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  writeFileSync(join(dir, "README.md"), "# test\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "init");
}

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`PASS  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

const root = mkdtempSync(join(realpathSync(tmpdir()), "rtrr-"));
try {
  // --- Scenario 1: normal repository root ---
  const repo = join(root, "main");
  initRepo(repo);
  const repoReal = realpathSync(repo);
  {
    const r = runHelper(repo);
    check("1 normal-root: exit 0", r.code === 0, `code=${r.code} stderr=${r.stderr}`);
    check("1 normal-root: targetRoot == repo", r.json?.targetRoot === repoReal, `${r.json?.targetRoot} != ${repoReal}`);
    check("1 normal-root: isGit true", r.json?.isGit === true);
    check("1 normal-root: ok true", r.json?.ok === true);
    check("1 normal-root: not unwrapped", r.json?.unwrapped === false);
  }

  // --- Scenario 2: execution from a subdirectory ---
  {
    const sub = join(repo, "src", "features");
    mkdirSync(sub, { recursive: true });
    const r = runHelper(sub);
    check("2 subdir: exit 0", r.code === 0, `code=${r.code}`);
    check("2 subdir: targetRoot == repo root", r.json?.targetRoot === repoReal, `${r.json?.targetRoot}`);
    check("2 subdir: ok true", r.json?.ok === true);
  }

  // --- Scenario 3: inside .claude/worktrees/... (unwrap to main) ---
  {
    const wt = join(repo, ".claude", "worktrees", "agent-1");
    git(repo, "worktree", "add", "-q", wt);
    const r = runHelper(wt);
    check("3 worktree: exit 0", r.code === 0, `code=${r.code} stderr=${r.stderr}`);
    check("3 worktree: isClaudeWorktree true", r.json?.isClaudeWorktree === true);
    check("3 worktree: unwrapped true", r.json?.unwrapped === true);
    check("3 worktree: targetRoot == main repo", r.json?.targetRoot === repoReal, `${r.json?.targetRoot} != ${repoReal}`);
    check("3 worktree: targetIsWorktree false", r.json?.targetIsWorktree === false);
    check("3 worktree: ok true", r.json?.ok === true);
  }

  // --- Scenario 4a: non-git path (not ambiguous, just not a repo) ---
  {
    const plain = join(root, "plain");
    mkdirSync(plain, { recursive: true });
    const r = runHelper(plain);
    check("4a non-git: isGit false", r.json?.isGit === false);
    check("4a non-git: exit 0 (not a worktree)", r.code === 0, `code=${r.code}`);
    check("4a non-git: targetRoot == candidate", r.json?.targetRoot === realpathSync(plain));
  }

  // --- Scenario 4b: nonexistent path -> exit 1 ---
  {
    const r = runHelper(join(root, "does-not-exist"));
    check("4b missing: exit 1", r.code === 1, `code=${r.code}`);
  }

  // --- Scenario 4c: worktree path that cannot be unwrapped -> exit 3 (loud) ---
  {
    const trapped = join(root, "trap", ".claude", "worktrees", "standalone");
    initRepo(trapped); // its own main worktree IS under the marker -> unsafe
    const r = runHelper(trapped);
    check("4c unsafe-worktree: exit 3", r.code === 3, `code=${r.code}`);
    check("4c unsafe-worktree: ok false", r.json?.ok === false);
    check("4c unsafe-worktree: warning present", typeof r.json?.warning === "string" && (r.json?.warning as string).length > 0);
  }

  // --- Scenarios 5–9 (0.7.5): knowledgeRoot, resolved apart from targetRoot ---
  const M = ".ono/repo-knowledge.json";
  const manifestAt = (dir: string): void => {
    mkdirSync(join(dir, ".ono"), { recursive: true });
    writeFileSync(join(dir, M), "{}\n");
  };
  const runArgs = (...args: string[]): CliRun => {
    try {
      const stdout = execFileSync(RUNTIME, [HELPER, ...args], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
      return { code: 0, json: safeParse(stdout), stdout, stderr: "" };
    } catch (err: any) {
      const stdout = err.stdout?.toString() ?? "";
      return { code: typeof err.status === "number" ? err.status : 1, json: safeParse(stdout), stdout, stderr: err.stderr?.toString() ?? "" };
    }
  };

  // --- Scenario 5: root-level project — exactly the pre-0.7.5 answer ---
  {
    const repo = join(root, "root-level");
    initRepo(repo);
    const real = realpathSync(repo);
    const none = runHelper(repo);
    check("5 no manifest anywhere: knowledgeRoot is the Git root", none.json?.knowledgeRoot === real && none.json?.projectPath === "" && none.json?.knowledgeSource === "git-root" && none.json?.knowledgeDecision === null, none.stdout);
    manifestAt(repo);
    mkdirSync(join(repo, "src", "deep"), { recursive: true });
    const deep = runHelper(join(repo, "src", "deep"));
    check("5 root manifest: found from a subdirectory", deep.json?.knowledgeRoot === real && deep.json?.knowledgeSource === "git-root", deep.stdout);
    check("5 root manifest: targetRoot unchanged", deep.json?.targetRoot === real && deep.code === 0);
  }

  // --- Scenario 6: one nested project (yestvos/YesTVOS) ---
  {
    const repo = join(root, "yestvos");
    initRepo(repo);
    const project = join(repo, "YesTVOS");
    mkdirSync(join(project, "src", "player"), { recursive: true });
    manifestAt(project);
    mkdirSync(join(repo, "Other", "src"), { recursive: true });
    const real = realpathSync(repo);
    const realProject = realpathSync(project);

    const inside = runHelper(join(project, "src", "player"));
    check("6 from inside the project: targetRoot stays the Git root", inside.json?.targetRoot === real, String(inside.json?.targetRoot));
    check("6 from inside the project: knowledgeRoot is the nearest manifest", inside.json?.knowledgeRoot === realProject && inside.json?.projectPath === "YesTVOS" && inside.json?.knowledgeSource === "nearest", inside.stdout);
    check("6 from inside the project: exit 0, ok", inside.code === 0 && inside.json?.ok === true);

    const atRoot = runHelper(repo);
    check("6 from the Git root: the developer must choose", atRoot.json?.knowledgeDecision === "select-project" && atRoot.json?.knowledgeRoot === null && atRoot.json?.projectPath === null, atRoot.stdout);
    check("6 from the Git root: even a single candidate is never auto-selected", JSON.stringify(atRoot.json?.knowledgeCandidates) === JSON.stringify(["YesTVOS"]), atRoot.stdout);
    check("6 from the Git root: the decision does not fail the root", atRoot.code === 0 && atRoot.json?.ok === true && atRoot.json?.targetRoot === real);

    const sibling = runHelper(join(repo, "Other", "src"));
    check("6 from a sibling directory: no other project's knowledge, Git root as before", sibling.json?.knowledgeRoot === real && sibling.json?.knowledgeSource === "git-root" && sibling.json?.knowledgeDecision === null, sibling.stdout);

    const explicit = runArgs(repo, "--project", project);
    check("6 --project names the project explicitly", explicit.code === 0 && explicit.json?.knowledgeRoot === realProject && explicit.json?.knowledgeSource === "explicit" && explicit.json?.targetRoot === real, explicit.stdout);
    const explicitRoot = runArgs(repo, "--project", repo);
    check("6 --project at the Git root is the Git root", explicitRoot.json?.knowledgeRoot === real && explicitRoot.json?.knowledgeSource === "git-root", explicitRoot.stdout);
  }

  // --- Scenario 7: several projects in one repository ---
  {
    const repo = join(root, "multi");
    initRepo(repo);
    for (const p of ["TVApp", "MobileApp"]) manifestAt(join(repo, p));
    manifestAt(join(repo, "node_modules", "pkg"));
    manifestAt(join(repo, ".hidden"));
    manifestAt(join(repo, "apps", "Deep"));
    const r = runHelper(repo);
    check("7 several projects: the developer chooses", r.json?.knowledgeDecision === "select-project" && r.json?.knowledgeRoot === null, r.stdout);
    check("7 several projects: only immediate children, sorted; node_modules, hidden and deeper directories never offered",
      JSON.stringify(r.json?.knowledgeCandidates) === JSON.stringify(["MobileApp", "TVApp"]), JSON.stringify(r.json?.knowledgeCandidates));
    const tv = runHelper(join(repo, "TVApp"));
    check("7 from inside one project: that project, no question", tv.json?.knowledgeRoot === realpathSync(join(repo, "TVApp")) && tv.json?.knowledgeDecision === null, tv.stdout);

    const both = join(root, "root-and-child");
    initRepo(both);
    manifestAt(both);
    manifestAt(join(both, "TVApp"));
    const rb = runHelper(both);
    check("7 a Git root with its own manifest keeps it (no question)", rb.json?.knowledgeRoot === realpathSync(both) && rb.json?.knowledgeDecision === null, rb.stdout);

    const deepOnly = join(root, "deep-only");
    initRepo(deepOnly);
    manifestAt(join(deepOnly, "apps", "Deep"));
    const rd = runHelper(deepOnly);
    check("7 a manifest two levels down is never searched for", rd.json?.knowledgeRoot === realpathSync(deepOnly) && rd.json?.knowledgeDecision === null, rd.stdout);
  }

  // --- Scenario 8: an explicit project that is not usable stops loudly ---
  {
    const repo = join(root, "bad-project");
    initRepo(repo);
    const outside = join(root, "elsewhere");
    mkdirSync(outside, { recursive: true });
    const out = runArgs(repo, "--project", outside);
    check("8 --project outside the repository: exit 3, ok false", out.code === 3 && out.json?.ok === false && /outside the repository/.test(String(out.json?.warning)), out.stdout);
    const missing = runArgs(repo, "--project", join(repo, "nope"));
    check("8 --project that does not exist: exit 3, ok false", missing.code === 3 && missing.json?.ok === false, missing.stdout);
  }

  // --- Scenario 9: a worktree keeps the selected project when it is unwrapped ---
  {
    const repo = join(root, "wt-nested");
    initRepo(repo);
    mkdirSync(join(repo, "YesTVOS"), { recursive: true });
    writeFileSync(join(repo, "YesTVOS", "README.md"), "# app\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", "project");
    manifestAt(join(repo, "YesTVOS"));
    const wt = join(repo, ".claude", "worktrees", "agent-1");
    git(repo, "worktree", "add", "-q", wt);
    const r = runHelper(join(wt, "YesTVOS"));
    check("9 worktree: targetRoot is the main tree", r.json?.targetRoot === realpathSync(repo) && r.json?.unwrapped === true, r.stdout);
    check("9 worktree: the nested project is kept, in the main tree", r.json?.knowledgeRoot === realpathSync(join(repo, "YesTVOS")) && r.json?.projectPath === "YesTVOS", r.stdout);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
