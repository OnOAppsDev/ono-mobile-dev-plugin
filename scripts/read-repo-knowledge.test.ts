/**
 * read-repo-knowledge.test.ts
 *
 * Self-contained tests for scripts/read-repo-knowledge.ts. Builds throwaway
 * git repositories with fixture .ono/repo-knowledge.json files and exercises
 * the CLI end-to-end (stdout JSON + exit code).
 *
 * The degradation matrix IS the backward-compatibility guarantee, so every row
 * of it has a test here: absent, malformed, schema-too-new, fresh, stale-head,
 * stale-artifacts, and partial/unknown coverage.
 *
 * No external test framework. Run with:
 *   node scripts/read-repo-knowledge.test.ts
 *   bun  scripts/read-repo-knowledge.test.ts
 */

import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";

const HELPER = join(import.meta.dirname ?? __dirname, "read-repo-knowledge.ts");
const RUNTIME = process.execPath;

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`); }
}

function run(targetRoot: string): { code: number; json: any; stderr: string } {
  try {
    const stdout = execFileSync(RUNTIME, [HELPER, targetRoot], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, json: JSON.parse(stdout), stderr: "" };
  } catch (err: any) {
    let json: any = null;
    try { json = JSON.parse(err.stdout?.toString() ?? ""); } catch { /* leave null */ }
    return { code: typeof err.status === "number" ? err.status : 1, json, stderr: err.stderr?.toString() ?? "" };
  }
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function write(root: string, rel: string, body: string): void {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body, "utf-8");
}

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  write(dir, "README.md", "# test\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "init");
}

const sha = (s: string) => createHash("sha256").update(s, "utf-8").digest("hex");

const CLAUDE_BODY = "# CLAUDE.md — Demo\n";
const PATTERNS_BODY = "# Patterns\n\n## State Management\nRedux Toolkit.\n";

/** A schema-v1 manifest matching the fixture artifacts written by seedRepo(). */
function manifest(head: string | null, overrides: Record<string, any> = {}): any {
  return {
    repoKnowledgeSchemaVersion: 1,
    producedBy: { plugin: "ono-project-inspector", version: "0.9.0" },
    generatedAt: "2026-07-28T00:00:00.000Z",
    fingerprint: {
      gitHead: head,
      artifacts: {
        "CLAUDE.md": sha(CLAUDE_BODY),
        "AUDIT.md": null,
        "docs/project/overview.md": null,
        "docs/project/components.md": null,
        "docs/project/patterns.md": sha(PATTERNS_BODY),
        "docs/project/integrations.md": null,
      },
    },
    coverage: {
      stack: "populated",
      commands: "partial",
      structure: "populated",
      inventory: "unknown",
      conventions: "populated",
      integrations: "unknown",
      auditTopics: "unknown",
    },
    stack: { languages: ["TypeScript"], frameworks: ["React Native"], platformHints: ["Android", "iOS"], runtimeTooling: ["Metro"], packageManagers: ["yarn"] },
    commands: { install: "yarn", run: "yarn ios", test: null, build: null },
    structure: { repositoryTree: "CLAUDE.md#repository-structure", keyModules: "CLAUDE.md#key-modules", entryPoints: "CLAUDE.md#entry-points" },
    documents: {
      claudeMd: { path: "CLAUDE.md", exists: true, anchors: [] },
      auditMd: { path: "AUDIT.md", exists: false, anchors: [] },
      overview: { path: "docs/project/overview.md", exists: false, anchors: [] },
      inventory: { path: "docs/project/components.md", exists: false, anchors: [] },
      conventions: { path: "docs/project/patterns.md", exists: true, anchors: ["#state-management"] },
      integrations: { path: "docs/project/integrations.md", exists: false, anchors: [] },
    },
    auditTopics: [],
    ...overrides,
  };
}

/** A repo with the fixture artifacts committed, ready for a manifest. */
function seedRepo(dir: string): string {
  initRepo(dir);
  write(dir, "CLAUDE.md", CLAUDE_BODY);
  write(dir, "docs/project/patterns.md", PATTERNS_BODY);
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "artifacts");
  return git(dir, "rev-parse", "HEAD");
}

const root = mkdtempSync(join(realpathSync(tmpdir()), "rrk-"));
try {
  // --- Row 1: absent manifest -> available false, exit 0 (scope point 7) ---
  {
    const repo = join(root, "absent");
    seedRepo(repo);
    const r = run(repo);
    check("1 absent: exit 0", r.code === 0, `code=${r.code} stderr=${r.stderr}`);
    check("1 absent: available false", r.json?.available === false);
    check("1 absent: reason absent", r.json?.reason === "absent", String(r.json?.reason));
    check("1 absent: usableCategories empty", Array.isArray(r.json?.usableCategories) && r.json.usableCategories.length === 0);
    check("1 absent: deriveLive lists every category", Array.isArray(r.json?.deriveLive) && r.json.deriveLive.length === 7, JSON.stringify(r.json?.deriveLive));
    check("1 absent: knowledge is null", r.json?.knowledge === null);
    check("1 absent: summary mentions no manifest", typeof r.json?.summary === "string" && /not available|no repository knowledge/i.test(r.json.summary), r.json?.summary);
  }

  // --- Row 2: fresh manifest -> usable categories exclude unknowns ---
  {
    const repo = join(root, "fresh");
    const head = seedRepo(repo);
    write(repo, ".ono/repo-knowledge.json", JSON.stringify(manifest(head), null, 2));
    const r = run(repo);
    check("2 fresh: exit 0", r.code === 0, `code=${r.code} stderr=${r.stderr}`);
    check("2 fresh: available true", r.json?.available === true);
    check("2 fresh: freshness fresh", r.json?.freshness === "fresh", String(r.json?.freshness));
    check("2 fresh: schemaVersion 1", r.json?.schemaVersion === 1);
    check("2 fresh: conventions usable", r.json?.usableCategories?.includes("conventions"));
    check("2 fresh: partial commands usable", r.json?.usableCategories?.includes("commands"));
    check("2 fresh: unknown inventory not usable", !r.json?.usableCategories?.includes("inventory"));
    check("2 fresh: unknown inventory in deriveLive", r.json?.deriveLive?.includes("inventory"));
    check("2 fresh: knowledge carries stack", JSON.stringify(r.json?.knowledge?.stack?.languages) === JSON.stringify(["TypeScript"]));
    check("2 fresh: conventions pointer exposed", r.json?.knowledge?.documents?.conventions?.path === "docs/project/patterns.md");
  }

  // --- Row 3: stale-head — HEAD moved but artifacts unchanged ---
  {
    const repo = join(root, "stale-head");
    const head = seedRepo(repo);
    write(repo, ".ono/repo-knowledge.json", JSON.stringify(manifest(head), null, 2));
    write(repo, "src/unrelated.ts", "export const x = 1;\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", "unrelated change");
    const r = run(repo);
    check("3 stale-head: available true", r.json?.available === true);
    check("3 stale-head: freshness stale-head", r.json?.freshness === "stale-head", String(r.json?.freshness));
    check("3 stale-head: conventions still usable", r.json?.usableCategories?.includes("conventions"));
    check("3 stale-head: staleDetail explains", typeof r.json?.staleDetail === "string" && r.json.staleDetail.length > 0);
  }

  // --- Row 4: stale-artifacts — a source document was hand-edited ---
  {
    const repo = join(root, "stale-art");
    const head = seedRepo(repo);
    write(repo, ".ono/repo-knowledge.json", JSON.stringify(manifest(head), null, 2));
    write(repo, "docs/project/patterns.md", PATTERNS_BODY + "\n## Testing Patterns\nJest.\n");
    const r = run(repo);
    check("4 stale-art: available true", r.json?.available === true);
    check("4 stale-art: freshness stale-artifacts", r.json?.freshness === "stale-artifacts", String(r.json?.freshness));
    check("4 stale-art: affected category NOT usable", !r.json?.usableCategories?.includes("conventions"), JSON.stringify(r.json?.usableCategories));
    check("4 stale-art: affected category in deriveLive", r.json?.deriveLive?.includes("conventions"));
    check("4 stale-art: unaffected category still usable", r.json?.usableCategories?.includes("stack"), JSON.stringify(r.json?.usableCategories));
    check("4 stale-art: staleDetail names the file", typeof r.json?.staleDetail === "string" && r.json.staleDetail.includes("docs/project/patterns.md"), r.json?.staleDetail);
  }

  // --- Row 5: malformed JSON -> treated as absent ---
  {
    const repo = join(root, "malformed");
    seedRepo(repo);
    write(repo, ".ono/repo-knowledge.json", "{ this is not json");
    const r = run(repo);
    check("5 malformed: exit 0", r.code === 0, `code=${r.code}`);
    check("5 malformed: available false", r.json?.available === false);
    check("5 malformed: reason unparseable", r.json?.reason === "unparseable", String(r.json?.reason));
    check("5 malformed: deriveLive is complete", r.json?.deriveLive?.length === 7);
  }

  // --- Row 6: schema too new -> treated as absent, never mis-parsed ---
  {
    const repo = join(root, "future");
    const head = seedRepo(repo);
    write(repo, ".ono/repo-knowledge.json", JSON.stringify(manifest(head, { repoKnowledgeSchemaVersion: 99 }), null, 2));
    const r = run(repo);
    check("6 future: exit 0", r.code === 0, `code=${r.code}`);
    check("6 future: available false", r.json?.available === false);
    check("6 future: reason schema-too-new", r.json?.reason === "schema-too-new", String(r.json?.reason));
    check("6 future: schemaVersion reported", r.json?.schemaVersion === 99);
    check("6 future: summary names the versions", typeof r.json?.summary === "string" && r.json.summary.includes("99"), r.json?.summary);
  }

  // --- Row 7: structurally invalid (right version, wrong shape) -> absent ---
  {
    const repo = join(root, "invalid");
    seedRepo(repo);
    write(repo, ".ono/repo-knowledge.json", JSON.stringify({ repoKnowledgeSchemaVersion: 1 }, null, 2));
    const r = run(repo);
    check("7 invalid: available false", r.json?.available === false);
    check("7 invalid: reason invalid", r.json?.reason === "invalid", String(r.json?.reason));
  }

  // --- Row 8: no git -> freshness unknown, still usable ---
  {
    const repo = join(root, "nogit");
    mkdirSync(repo, { recursive: true });
    write(repo, "CLAUDE.md", CLAUDE_BODY);
    write(repo, "docs/project/patterns.md", PATTERNS_BODY);
    write(repo, ".ono/repo-knowledge.json", JSON.stringify(manifest(null), null, 2));
    const r = run(repo);
    check("8 nogit: available true", r.json?.available === true);
    check("8 nogit: freshness unknown", r.json?.freshness === "unknown", String(r.json?.freshness));
    check("8 nogit: conventions usable", r.json?.usableCategories?.includes("conventions"));
  }

  // --- Row 9: worktree refusal is reported, not thrown (K6) ---
  {
    const repo = join(root, "wt");
    const head = seedRepo(repo);
    write(repo, ".ono/repo-knowledge.json", JSON.stringify(manifest(head), null, 2));
    const wt = join(repo, ".claude", "worktrees", "agent-1");
    git(repo, "worktree", "add", "-q", wt);
    const r = run(wt);
    check("9 worktree: exit 0", r.code === 0, `code=${r.code} stderr=${r.stderr}`);
    check("9 worktree: available false", r.json?.available === false);
    check("9 worktree: reason worktree", r.json?.reason === "worktree", String(r.json?.reason));
  }

  // --- Row 10: nonexistent target root -> reported, exit 0 ---
  {
    const r = run(join(root, "does-not-exist"));
    check("10 missing root: exit 0", r.code === 0, `code=${r.code}`);
    check("10 missing root: available false", r.json?.available === false);
    check("10 missing root: reason root-not-found", r.json?.reason === "root-not-found", String(r.json?.reason));
  }

  // --- Row 11: advisory-only platformHints is never surfaced as a decision (K5) ---
  {
    const repo = join(root, "hints");
    const head = seedRepo(repo);
    write(repo, ".ono/repo-knowledge.json", JSON.stringify(manifest(head), null, 2));
    const r = run(repo);
    check("11 hints: no top-level platform field", r.json?.knowledge?.platform === undefined);
    check("11 hints: platformHints marked advisory", r.json?.platformHintsAreAdvisory === true);
    check("11 hints: 'platform' is not a category", !r.json?.usableCategories?.includes("platform"));
  }

  // --- Row 12: coverage claims stack is populated but stack itself is missing (Defect B) ---
  {
    const repo = join(root, "stack-missing");
    const head = seedRepo(repo);
    const bad = manifest(head);
    delete bad.stack;
    write(repo, ".ono/repo-knowledge.json", JSON.stringify(bad, null, 2));
    const r = run(repo);
    check("12 stack missing: exit 0", r.code === 0, `code=${r.code} stderr=${r.stderr}`);
    check("12 stack missing: available false", r.json?.available === false);
    check("12 stack missing: reason invalid", r.json?.reason === "invalid", String(r.json?.reason));
    check("12 stack missing: 'stack' not in usableCategories", !r.json?.usableCategories?.includes("stack"), JSON.stringify(r.json?.usableCategories));
  }

  // --- Row 13: a malformed auditTopics entry (missing required string field) ---
  {
    const repo = join(root, "audit-topic-malformed");
    const head = seedRepo(repo);
    const bad = manifest(head, {
      auditTopics: [{ topic: "Architecture", slug: "architecture", status: "Approved" /* missing `file` */ }],
    });
    write(repo, ".ono/repo-knowledge.json", JSON.stringify(bad, null, 2));
    const r = run(repo);
    check("13 audit topic malformed: exit 0", r.code === 0, `code=${r.code} stderr=${r.stderr}`);
    check("13 audit topic malformed: available false", r.json?.available === false);
    check("13 audit topic malformed: reason invalid", r.json?.reason === "invalid", String(r.json?.reason));
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
