/**
 * branch-policy.test.ts
 *
 * Pins the 0.7.5 branch policy: the developer decides which Git branch to work on, and
 * the plugin never blocks a file change because of the current branch. Choosing a branch
 * grants nothing in Git — the plugin never commits, pushes, rewrites history or deletes a
 * branch on its own, and permission to modify files is never permission for any of those.
 *
 *   1. No live component carries a branch-based write guard (hook, helper refusal, or a
 *      readiness gate in a command or skill).
 *   2. No plugin script or hook runs a mutating Git command.
 *   3. No hook grants a Git operation on any branch — a `git commit`, `push`, history
 *      rewrite or branch deletion is left to Claude Code's own permission prompt.
 *   4. The commands still say commits are the developer's act, and the bug cycle approval
 *      still says it grants no Git operation.
 *
 * hooks.test.ts §3 covers the per-branch behaviour of the two remaining hooks, and
 * edit-approval.test.ts §20 covers a cycle approved on main.
 *
 * No external test framework. Run with:
 *   node scripts/branch-policy.test.ts
 */

import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from "fs";
import { join, dirname, relative } from "path";
import { tmpdir } from "os";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf-8");

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

function walk(dir: string, keep: (rel: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(REPO_ROOT, dir))) {
    const rel = join(dir, name);
    if (statSync(join(REPO_ROOT, rel)).isDirectory()) out.push(...walk(rel, keep));
    else if (keep(rel)) out.push(rel);
  }
  return out;
}

/* ── 1. no branch-based write guard anywhere live ─────────────────────── */
{
  // Live components: what Claude Code loads or runs. docs/planning/ and CHANGELOG.md are
  // history and keep describing the old hook as it was.
  const live = [
    ...["commands", "skills", "agents", "hooks", "templates", "standards"].flatMap((d) => walk(d, (r) => /\.(md|json|sh)$/.test(r))),
    "README.md",
    ...readdirSync(join(REPO_ROOT, "docs")).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`),
    ".claude-plugin/plugin.json",
  ];
  const GUARDS: Array<[string, RegExp]> = [
    ["the removed hook", /block-main-branch/],
    ["a not-main/master readiness gate", /branch is \*{0,2}not\*{0,2} `?main`?\s*\/\s*`?master`?/i],
    ["a never-on-main/master rule", /never (on |a write on )?`main`\s*\/\s*`master`/i],
    ["a protected-branch refusal", /BRANCH_PROTECTED/],
    ["an instruction to create a feature branch before changes", /create a (feature|fix) branch (first|before)/i],
  ];
  for (const [what, re] of GUARDS) {
    const hits = live.filter((f) => re.test(read(f)));
    check(`1 no live component carries ${what}`, hits.length === 0, hits.join(", "));
  }
  const ea = read("scripts/edit-approval.ts");
  check("1 edit-approval.ts has no protected-branch list", !/PROTECTED_BRANCHES|["']main["']\s*,\s*["']master["']/.test(ea));
  check("1 the cycle approval is still bound to the branch it was approved on", /WRONG_BRANCH/.test(ea));
  check("1 README states the branch policy", /The developer decides which Git branch to work on/.test(read("README.md")));
}

/* ── 2. no plugin script or hook runs a mutating Git command ──────────── */
{
  const MUTATING = ["commit", "push", "merge", "rebase", "reset", "branch", "tag", "checkout", "switch", "stash",
    "update-ref", "filter-branch", "filter-repo", "gc", "prune", "clean", "cherry-pick", "revert", "am", "apply", "rm", "mv"];
  const scripts = walk("scripts", (r) => r.endsWith(".ts") && !r.endsWith(".test.ts") && !r.includes("fixtures"));
  const literal = new RegExp(`["'\`](${MUTATING.join("|")})["'\`]`);
  const offenders: string[] = [];
  for (const f of scripts) {
    read(f).split("\n").forEach((line, i) => {
      if (!literal.test(line)) return;
      // A type tag or a field value, not a git argument (task-resume's mismatch kind "branch").
      if (/kind\b/.test(line)) return;
      offenders.push(`${f}:${i + 1}`);
    });
  }
  check("2 no plugin script passes a mutating subcommand to git", offenders.length === 0, offenders.join(", "));
  const shell = walk("hooks", (r) => r.endsWith(".sh"));
  const shellHits = shell.filter((f) => new RegExp(`\\bgit\\s+(?:-[Cc]\\s+\\S+\\s+)*(?:${MUTATING.join("|")})\\b`).test(read(f)));
  check("2 no hook runs a mutating git command", shellHits.length === 0, shellHits.join(", "));
}

/* ── 3. no hook grants a Git operation, on any branch ─────────────────── */
{
  const haveJq = spawnSync("jq", ["--version"], { encoding: "utf-8" }).status === 0;
  const haveGit = spawnSync("git", ["--version"], { encoding: "utf-8" }).status === 0;
  if (!haveJq || !haveGit) {
    console.log("SKIP  3 hook behaviour (jq or git not installed)");
  } else {
    const repo = mkdtempSync(join(tmpdir(), "branch-policy-"));
    const git = (...a: string[]) => spawnSync("git", ["-C", repo, ...a], { encoding: "utf-8" });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    writeFileSync(join(repo, "a.txt"), "x");
    git("add", ".");
    git("commit", "-qm", "init");
    const hooks = walk("hooks", (r) => r.endsWith(".sh"));
    const OPS = [
      "git commit -m change",
      "git commit --amend --no-edit",
      "git push origin main",
      "git push --force origin main",
      "git reset --hard HEAD~1",
      "git rebase -i HEAD~3",
      "git branch -D feature/x",
      "git push origin --delete feature/x",
    ];
    for (const branch of ["main", "develop", "feature/x"]) {
      if (branch !== "main") git("checkout", "-qb", branch);
      for (const hook of hooks) {
        for (const command of OPS) {
          const p = spawnSync("bash", [join(REPO_ROOT, hook)], {
            input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: repo }),
            encoding: "utf-8",
            env: { ...process.env, CLAUDE_PROJECT_DIR: repo, CLAUDE_PLUGIN_ROOT: REPO_ROOT },
          });
          const granted = /"permissionDecision"\s*:\s*"allow"/.test(p.stdout ?? "");
          check(`3 on ${branch}: ${relative("hooks", hook)} grants nothing for \`${command}\``, p.status === 0 && !granted, `${p.status} ${p.stdout}`);
        }
      }
    }
    rmSync(repo, { recursive: true, force: true });
  }
}

/* ── 4. Git operations stay the developer's act ───────────────────────── */
{
  const it = read("commands/implement-task.md");
  check("4 /implement-task never creates a git commit", /never creates a git commit/i.test(it));
  check("4 /implement-task: a commit waits for explicit developer approval", /commit waits for explicit developer approval/i.test(it));
  check("4 /implement-task: no branch grants a commit, push, history rewrite or branch deletion",
    /working on any branch, `main` included, grants no commit, push, history rewrite or branch deletion/.test(it));
  check("4 the cycle approval grants no commit, push, merge, history rewrite or branch deletion",
    /does not grant a commit, a push, a merge, a history rewrite or a branch deletion/.test(it));
  check("4 /analyze-bug: the cycle approval covers code edits only", /covers code edits only — never a commit, a push or a merge/.test(read("commands/analyze-bug.md")));
  check("4 README: choosing a branch never grants a Git operation", /Choosing a branch never grants a Git operation/.test(read("README.md")));
  check("the suite is registered", read("scripts/check.ts").includes('"branch-policy"'));
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall branch-policy checks passed");
