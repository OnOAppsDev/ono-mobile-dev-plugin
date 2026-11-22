/**
 * pr-scope.test.ts
 *
 * Pins the deterministic PR scope (scripts/pr-scope.ts): target-branch resolution, the merge
 * base, the scope's files across committed / staged / unstaged / untracked changes, the
 * code / docs / operational split, content-preserving commits, and read-only behaviour.
 *
 *   node --no-warnings scripts/pr-scope.test.ts
 */

import { execFileSync, spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { prScope, resolveBase, codeMap, diffMaps, attribute, DELETED } from "./pr-scope.ts";

const HERE = import.meta.dirname ?? __dirname;
let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
const TMP = realpathSync(mkdtempSync(join(tmpdir(), "pr-scope-")));
let n = 0;
const git = (root: string, ...a: string[]) => execFileSync("git", ["-C", root, ...a], { encoding: "utf-8" }).trim();
function put(root: string, rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}
/** main has app.ts + old.ts; the work branch `feature/x` is checked out. */
function repo(): string {
  const root = join(TMP, `r${++n}`);
  mkdirSync(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@t");
  git(root, "config", "user.name", "t");
  put(root, "src/app.ts", "a\n");
  put(root, "src/old.ts", "old\n");
  put(root, ".gitignore", "build/\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  git(root, "checkout", "-qb", "feature/x");
  return root;
}
const ok = (s: any) => (s.ok ? s : (() => { throw new Error(JSON.stringify(s)); })());
const paths = (s: any, cls?: string) => s.files.filter((f: any) => !cls || f.class === cls).map((f: any) => f.path);

// 1. Base resolution order.
{
  const r = repo();
  const b = resolveBase(r) as any;
  check("base: falls back to main when nothing else declares a target", b.branch === "main" && b.source === "default", JSON.stringify(b));
  git(r, "branch", "develop", "main");
  writeFileSync(join(r, ".platform-guardian.json"), JSON.stringify({ centralBranch: "develop" }));
  const g = resolveBase(r) as any;
  check("base: the Guardian's centralBranch wins over the defaults", g.branch === "develop" && g.source === "guardian-config", JSON.stringify(g));
  const a = resolveBase(r, "main") as any;
  check("base: --base wins over everything", a.branch === "main" && a.source === "argument");
  const missing = resolveBase(r, "nope") as any;
  check("base: an explicit target that does not exist is an error, never a fallback", missing.error === "BASE_NOT_FOUND");
  check("base: an option-like branch name is rejected", (resolveBase(r, "--output=x") as any).error === "BASE_NOT_FOUND");
}

// 2. Scope across committed / staged / unstaged / untracked; ignored files excluded.
{
  const r = repo();
  put(r, "src/committed.ts", "c\n");
  git(r, "add", "-A");
  git(r, "commit", "-qm", "c");
  put(r, "src/staged.ts", "s\n");
  git(r, "add", "src/staged.ts");
  put(r, "src/app.ts", "a2\n");
  put(r, "src/untracked.ts", "u\n");
  put(r, "build/out.js", "ignored\n");
  unlinkSync(join(r, "src/old.ts"));
  const s = ok(prScope(r));
  check("scope: committed, staged, unstaged, untracked and deleted files are all in scope",
    JSON.stringify(paths(s)) === JSON.stringify(["src/app.ts", "src/committed.ts", "src/old.ts", "src/staged.ts", "src/untracked.ts"]), JSON.stringify(paths(s)));
  check("scope: an ignored file is never in scope", !paths(s).includes("build/out.js"));
  const old = s.files.find((f: any) => f.path === "src/old.ts");
  check("scope: a deleted file is `deleted`, with its base blob", old.blob === DELETED && old.change === "deleted" && old.base_blob !== null);
  check("scope: committed flag — committed file true, worktree edits false",
    s.files.find((f: any) => f.path === "src/committed.ts").committed === true && s.files.find((f: any) => f.path === "src/app.ts").committed === false);
  check("scope: merge base is main's commit", s.merge_base === git(r, "rev-parse", "main"));

  // A file edited back to the merge base's content leaves the scope.
  put(r, "src/app.ts", "a\n");
  check("scope: a file restored to the merge base's content is not in scope", !paths(ok(prScope(r))).includes("src/app.ts"));
}

// 3. Content-preserving commit: same fingerprint. Any edit / add / remove: different.
{
  const r = repo();
  put(r, "src/app.ts", "a2\n");
  put(r, "src/new.ts", "n\n");
  const before = ok(prScope(r));
  git(r, "add", "-A");
  git(r, "commit", "-qm", "work");
  const after = ok(prScope(r));
  check("fingerprint: unchanged across a commit of exactly the reviewed content", before.code_fingerprint === after.code_fingerprint);
  check("fingerprint: HEAD moved though", before.head !== after.head);
  put(r, "src/app.ts", "a3\n");
  const edited = ok(prScope(r));
  check("fingerprint: moves on an edit", edited.code_fingerprint !== after.code_fingerprint);
  const d = diffMaps(codeMap(after), codeMap(edited));
  check("diffMaps: names the changed file", JSON.stringify(d.changed) === '["src/app.ts"]' && d.added.length === 0 && d.removed.length === 0);
  put(r, "src/app.ts", "a2\n");
  put(r, "src/extra.ts", "e\n");
  const d2 = diffMaps(codeMap(after), codeMap(ok(prScope(r))));
  check("diffMaps: names an added file", JSON.stringify(d2.added) === '["src/extra.ts"]');
  unlinkSync(join(r, "src/extra.ts"));
  unlinkSync(join(r, "src/new.ts"));
  const d3 = diffMaps(codeMap(after), codeMap(ok(prScope(r))));
  check("diffMaps: a deleted new file leaves the scope (removed)", JSON.stringify(d3.removed) === '["src/new.ts"]');
}

// 4. Merge base moves when the target is merged in.
{
  const r = repo();
  put(r, "src/app.ts", "work\n");
  git(r, "commit", "-qam", "work");
  const before = ok(prScope(r));
  git(r, "checkout", "-q", "main");
  put(r, "src/other.ts", "o\n");
  git(r, "add", "-A");
  git(r, "commit", "-qm", "main moves");
  git(r, "checkout", "-q", "feature/x");
  check("merge base: unchanged while the branch has not merged main", ok(prScope(r)).merge_base === before.merge_base);
  git(r, "merge", "-q", "--no-edit", "main");
  const after = ok(prScope(r));
  check("merge base: moves after merging the target in", after.merge_base !== before.merge_base);
  check("merge base: the target's own new file is not in the branch's scope", !paths(after).includes("src/other.ts"));
}

// 5. Classes: docs and operational state are split from code.
{
  const r = repo();
  put(r, "src/app.ts", "x\n");
  put(r, "docs/bugs/BUG-1/bug-work-plan.md", "p\n");
  put(r, "docs/reviews/login/review.md", "r\n");
  put(r, "docs/qa/login-qa-handoff.md", "q\n");
  put(r, "docs/tasks/login-task-state.json", "{}\n");
  put(r, "docs/tasks/bugs/BUG-1.task-state.json", "{}\n");
  put(r, "docs/tasks/bugs/BUG-1.cycle-approval.json", "{}\n");
  put(r, "docs/login-DD.md", "dd\n");
  const s = ok(prScope(r, { isDoc: (p) => p === "docs/login-DD.md" }));
  check("classes: code is only the implementation", JSON.stringify(paths(s, "code")) === '["src/app.ts"]', JSON.stringify(paths(s, "code")));
  check("classes: Ono documents and the caller's planning docs are docs",
    JSON.stringify(paths(s, "docs")) === JSON.stringify(["docs/bugs/BUG-1/bug-work-plan.md", "docs/login-DD.md", "docs/qa/login-qa-handoff.md", "docs/reviews/login/review.md"]), JSON.stringify(paths(s, "docs")));
  check("classes: task state and cycle approvals are operational",
    JSON.stringify(paths(s, "operational")) === JSON.stringify(["docs/tasks/bugs/BUG-1.cycle-approval.json", "docs/tasks/bugs/BUG-1.task-state.json", "docs/tasks/login-task-state.json"]));
  const codeBefore = s.code_fingerprint;
  put(r, "docs/reviews/login/review.md", "r2\n");
  check("classes: writing review evidence never moves the code fingerprint", ok(prScope(r, { isDoc: (p) => p === "docs/login-DD.md" })).code_fingerprint === codeBefore);
}

// 6. Attribution.
{
  const a = attribute(["src/a.ts", "src/b.ts", "src/c.ts"], { T1: { filesChanged: ["src/a.ts"] }, T2: { filesChanged: ["src/b.ts", "src/zzz.ts"] } });
  check("attribute: files map to the tasks that recorded them", JSON.stringify(a.byTask) === '{"T1":["src/a.ts"],"T2":["src/b.ts"]}');
  check("attribute: a file no task claims is reported unattributed", JSON.stringify(a.unattributed) === '["src/c.ts"]');
}

// 7. Failures and read-only.
{
  const plain = join(TMP, "plain");
  mkdirSync(plain);
  check("failure: not a git repository", (prScope(plain) as any).outcome === "SCOPE_NOT_A_REPOSITORY");
  const empty = join(TMP, "empty");
  mkdirSync(empty);
  git(empty, "init", "-q");
  check("failure: no commits yet", (prScope(empty) as any).outcome === "SCOPE_NO_COMMITS");
  check("failure: missing root", (prScope(join(TMP, "nope")) as any).outcome === "SCOPE_ROOT_INVALID");

  const r = repo();
  put(r, "src/app.ts", "y\n");
  const status = git(r, "status", "--porcelain");
  const refs = git(r, "for-each-ref");
  const cli = spawnSync(process.execPath, ["--no-warnings", join(HERE, "pr-scope.ts"), "--root", r], { encoding: "utf-8" });
  const parsed = JSON.parse(cli.stdout);
  check("cli: exits 0 and prints one JSON object", cli.status === 0 && parsed.ok === true);
  check("read-only: the working tree and refs are unchanged", git(r, "status", "--porcelain") === status && git(r, "for-each-ref") === refs);
}

rmSync(TMP, { recursive: true, force: true });
if (failures > 0) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall pr-scope checks passed");
