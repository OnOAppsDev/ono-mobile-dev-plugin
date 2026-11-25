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
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync, cpSync, renameSync, readFileSync, chmodSync, existsSync as existsSyncSafe } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { pathToFileURL } from "url";

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

  // --- Rows 14–16 (0.7.5): real Inspector manifests, at the Git root and nested below it ---
  const FIX = join(import.meta.dirname ?? __dirname, "fixtures", "inspector-knowledge");
  const VERSIONS = ["0.10.0", "0.11.0", "0.11.1", "0.11.2"];
  /** Copy the fixture project into `dir` (CLAUDE.fixture.md -> CLAUDE.md). */
  const copyApp = (dir: string): void => {
    cpSync(join(FIX, "app"), dir, { recursive: true });
    renameSync(join(dir, "CLAUDE.fixture.md"), join(dir, "CLAUDE.md"));
  };
  /** The emitted manifest, re-anchored to this repository's HEAD (artifact hashes untouched). */
  const anchored = (v: string, head: string): any => {
    const m = JSON.parse(readFileSync(join(FIX, "manifests", `${v}.json`), "utf-8"));
    m.fingerprint.gitHead = head;
    m.fingerprint.knowledgeHead = head;
    return m;
  };
  const runArgs = (...args: string[]): any =>
    JSON.parse(execFileSync(RUNTIME, [HELPER, ...args], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }));

  // --- Row 14: every Inspector release's manifest stays readable at the Git root ---
  for (const v of VERSIONS) {
    const repo = join(root, `inspector-${v}`);
    initRepo(repo);
    copyApp(repo);
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", "app");
    write(repo, ".ono/repo-knowledge.json", JSON.stringify(anchored(v, git(repo, "rev-parse", "HEAD")), null, 2));
    const r = run(repo);
    const modern = v !== "0.10.0";
    check(`14 Inspector ${v}: available`, r.json?.available === true, JSON.stringify([r.json?.reason, r.json?.summary]));
    check(`14 Inspector ${v}: fresh, no source drift`, r.json?.freshness === "fresh" && r.json?.sourceDrift?.status === "COMPLETE", JSON.stringify([r.json?.freshness, r.json?.sourceDrift?.status]));
    check(`14 Inspector ${v}: producer version reported`, r.json?.producedBy?.version === v);
    check(`14 Inspector ${v}: a root-level project has an empty prefix`, r.json?.projectPrefix === "", JSON.stringify(r.json?.projectPrefix));
    check(`14 Inspector ${v}: base categories reusable`, ["stack", "structure", "inventory", "conventions", "integrations"].every((c) => r.json?.trustedCategories?.includes(c)), JSON.stringify(r.json?.trustedCategories));
    check(`14 Inspector ${v}: surfaces ${modern ? "reused" : "derived live (pre-0.11 manifest)"}`,
      modern ? r.json?.extendedCategories?.surfaces?.status === "trusted" && r.json?.surfaces?.length === 2 : r.json?.extendedCategories?.surfaces?.status === "deriveLive" && r.json?.surfaces === null,
      JSON.stringify(r.json?.extendedCategories));
    check(`14 Inspector ${v}: capabilities ${modern ? "reused" : "derived live (pre-0.11 manifest)"}`,
      modern ? r.json?.extendedCategories?.capabilities?.status === "trusted" && r.json?.capabilities?.length === 5 : r.json?.capabilities === null);
  }

  // --- Row 15: a nested project (Inspector 0.11.2 Project Root below the Git root) ---
  {
    const mono = join(root, "mono");
    const project = join(mono, "TVApp");
    initRepo(mono);
    write(mono, "Other/src/other.ts", "export {};\n");
    mkdirSync(project, { recursive: true });
    copyApp(project);
    git(mono, "add", "-A");
    git(mono, "commit", "-qm", "two projects");
    const head = git(mono, "rev-parse", "HEAD");
    write(project, ".ono/state.json", JSON.stringify({ repository: { knowledgeHead: head } }));
    write(project, ".ono/repo-knowledge.json", JSON.stringify(anchored("0.11.2", head), null, 2));
    git(mono, "add", "-A");
    git(mono, "commit", "-qm", "inspector knowledge");

    const atGitRoot = run(mono);
    check("15 nested: the Git root alone has no manifest (the derive-live fallback)", atGitRoot.json?.available === false && atGitRoot.json?.reason === "absent");
    const fresh = run(project);
    check("15 nested: read at the Project Root it is available", fresh.json?.available === true, JSON.stringify(fresh.json?.reason));
    check("15 nested: the project prefix is reported", fresh.json?.projectPrefix === "TVApp/", JSON.stringify(fresh.json?.projectPrefix));
    check("15 nested: committing Inspector's own files is not source drift", fresh.json?.sourceDrift?.status === "COMPLETE", JSON.stringify(fresh.json?.sourceDrift));

    write(mono, "Other/src/other.ts", "export const x = 1;\n");
    git(mono, "commit", "-qam", "outside the project");
    const outside = run(project);
    check("15 nested: a change outside the project is not this project's drift", outside.json?.sourceDrift?.status === "COMPLETE" && outside.json?.sourceDrift?.changedSourceCount === 0, JSON.stringify(outside.json?.sourceDrift));

    write(project, "src/tv/FocusRow.tsx", "// changed\n");
    git(mono, "commit", "-qam", "inside the project");
    const inside = run(project);
    const d = inside.json?.sourceDrift;
    check("15 nested: a change inside the project is drift", d?.status === "REFRESH_RECOMMENDED", JSON.stringify(d));
    check("15 nested: changed files are project-relative", JSON.stringify(d?.changedSourceFiles) === JSON.stringify(["src/tv/FocusRow.tsx"]), JSON.stringify(d?.changedSourceFiles));
    check("15 nested: no false top-level-entry signal for the project directory", !(d?.analysisSignals ?? []).some((x: string) => /TVApp|Other/.test(x)), JSON.stringify(d?.analysisSignals));
    check("15 nested: the change is attributed to the recorded surface", (d?.affectedSurfaces ?? []).length > 0, JSON.stringify(d));

    write(project, "newdir/a.ts", "export {};\n");
    git(mono, "add", "-A");
    git(mono, "commit", "-qm", "new top-level entry in the project");
    const added = run(project);
    check("15 nested: a new top-level entry of the project is still signalled", (added.json?.sourceDrift?.analysisSignals ?? []).includes("top-level entry added: newdir"), JSON.stringify(added.json?.sourceDrift?.analysisSignals));

    // --- Row 16: --path accepts Git-root-relative and project-relative paths alike ---
    const fromGitRoot = runArgs(project, "--path", "TVApp/src/tv/FocusRow.tsx").query?.paths?.[0];
    const fromProject = runArgs(project, "--path", "src/tv/FocusRow.tsx").query?.paths?.[0];
    check("16 --path: a Git-root-relative path is scoped like the project-relative one",
      fromGitRoot?.surfaces?.length > 0 && JSON.stringify(fromGitRoot?.surfaces) === JSON.stringify(fromProject?.surfaces) && fromGitRoot?.path === "src/tv/FocusRow.tsx",
      JSON.stringify([fromGitRoot, fromProject]));
  }

  // --- Row 17 (A2): an inspection that predates the manifest names /inspect-sync, once ---
  {
    const plain = join(root, "a2-uninspected");
    mkdirSync(plain, { recursive: true });
    initRepo(plain);
    const u = run(plain).json;
    check("17 A2: an uninspected repository is absent, not flagged — no /inspect-sync hint", u?.reason === "absent" && u?.inspectionWithoutManifest === false && !/inspect-sync/.test(u?.summary ?? ""), JSON.stringify(u?.summary));

    const old = join(root, "a2-pre-manifest");
    mkdirSync(old, { recursive: true });
    initRepo(old);
    write(old, "AUDIT.md", "# Audit\n");
    write(old, ".ono/state.json", JSON.stringify({ pluginVersion: "0.9.0" }));
    const before = readFileSync(join(old, "AUDIT.md"), "utf-8");
    const o = run(old).json;
    check("17 A2: an inspection without the manifest is flagged", o?.available === false && o?.reason === "absent" && o?.inspectionWithoutManifest === true, JSON.stringify(o));
    check("17 A2: the summary names /ono-project-inspector:inspect-sync once", (o?.summary.match(/\/ono-project-inspector:inspect-sync/g) ?? []).length === 1 && !/running \/inspect /i.test(o?.summary), o?.summary);
    check("17 A2: knowledge is still derived live — never a blocker", (o?.deriveLive ?? []).length === 7 && (o?.trustedCategories ?? []).length === 0);
    check("17 A2: the reader writes nothing — no manifest, AUDIT.md unchanged", !existsSyncSafe(join(old, ".ono", "repo-knowledge.json")) && readFileSync(join(old, "AUDIT.md"), "utf-8") === before);

    const half = join(root, "a2-audit-only");
    mkdirSync(half, { recursive: true });
    initRepo(half);
    write(half, "AUDIT.md", "# Audit\n");
    check("17 A2: AUDIT.md alone (no inspector state) is not an inspection", run(half).json?.inspectionWithoutManifest === false);

    const skill = readFileSync(join(dirname(HELPER), "..", "skills", "repo-knowledge-consumer", "SKILL.md"), "utf-8");
    check("17 A2: the consumer shows it once per command run and never runs inspect-sync itself", /inspectionWithoutManifest: true/.test(skill) && /once per command run/.test(skill) && /never run `\/inspect-sync` on the developer's behalf/.test(skill));
  }

  // --- Row 18 (0.9.2): artifact hashes — docs/repo-knowledge-contract.md "Artifact hashes" (producer 0.14.0) ---
  {
    const R = await import(pathToFileURL(HELPER).href);
    const text = (t: string) => ({ state: "text", text: t }) as const;
    const ABSENT = { state: "absent" } as const;
    const lf = (t: string) => t.replace(/\r\n/g, "\n");
    const crlf = (t: string) => lf(t).replace(/\n/g, "\r\n");
    const DOC = "# CLAUDE.md\n\n## Targets and Surfaces\n- android-tv\n";
    const BOM = "﻿";
    const M = (recorded: unknown, doc: unknown, algo: unknown) => R.artifactMatches(recorded, doc, algo);
    const LEGACY = undefined;
    // [case, recorded, current document, algorithm, expected]
    const MATRIX: Array<[string, unknown, unknown, unknown, boolean]> = [
      ["sha256-lf · LF document", sha(DOC), text(DOC), "sha256-lf", true],
      ["sha256-lf · the same document, CRLF", sha(DOC), text(crlf(DOC)), "sha256-lf", true],
      ["sha256-lf · mixed line endings, same content", sha(DOC), text(DOC.replace("\n\n", "\r\n\n")), "sha256-lf", true],
      ["sha256-lf · a UTF-8 BOM added", sha(DOC), text(BOM + DOC), "sha256-lf", false],
      ["sha256-lf · a recorded BOM is kept (BOM + CRLF matches BOM + LF)", sha(BOM + DOC), text(BOM + crlf(DOC)), "sha256-lf", true],
      ["sha256-lf · a lone CR added (mid-line, not part of a CRLF pair)", sha(DOC), text(DOC.replace("## Targets", "## Tar\rgets")), "sha256-lf", false],
      ["sha256-lf · a classic-Mac (CR-only) document is not its LF text", sha(DOC), text(DOC.replace(/\n/g, "\r")), "sha256-lf", false],
      ["sha256-lf · the final newline removed", sha(DOC), text(DOC.slice(0, -1)), "sha256-lf", false],
      ["sha256-lf · a final newline added", sha(DOC), text(DOC + "\n"), "sha256-lf", false],
      ["sha256-lf · a real content change", sha(DOC), text(DOC.replace("android-tv", "android-tv-stg")), "sha256-lf", false],
      ["sha256-lf · a recorded CRLF (raw) hash is not sha256-lf", sha(crlf(DOC)), text(crlf(DOC)), "sha256-lf", false],
      ["null recorded · absent document", null, ABSENT, "sha256-lf", true],
      ["null recorded · an EMPTY document is not absent", null, text(""), "sha256-lf", false],
      ["empty recorded · empty document", sha(""), text(""), "sha256-lf", true],
      ["empty recorded · absent document", sha(""), ABSENT, "sha256-lf", false],
      ["hash recorded · absent document", sha(DOC), ABSENT, "sha256-lf", false],
      ["unreadable document is never a match (and never 'absent')", sha(DOC), { state: "unreadable", reason: "EACCES" }, "sha256-lf", false],
      ["unreadable document never matches a recorded null", null, { state: "unreadable", reason: "EACCES" }, LEGACY, false],
      ["legacy · LF-recorded, LF document (raw)", sha(DOC), text(DOC), LEGACY, true],
      ["legacy · LF-recorded, CRLF document (LF encoding)", sha(DOC), text(crlf(DOC)), LEGACY, true],
      ["legacy · CRLF-recorded, LF document (uniform CRLF encoding)", sha(crlf(DOC)), text(DOC), LEGACY, true],
      ["legacy · CRLF-recorded, CRLF document (raw)", sha(crlf(DOC)), text(crlf(DOC)), LEGACY, true],
      ["legacy · mixed-recorded, same mixed bytes (raw)", sha(DOC.replace("\n\n", "\r\n\n")), text(DOC.replace("\n\n", "\r\n\n")), LEGACY, true],
      ["legacy · mixed-recorded, an LF checkout (safe: stale)", sha(DOC.replace("\n\n", "\r\n\n")), text(DOC), LEGACY, false],
      ["legacy · a BOM added", sha(DOC), text(BOM + DOC), LEGACY, false],
      ["legacy · a lone CR added (mid-line)", sha(DOC), text(DOC.replace("## Targets", "## Tar\rgets")), LEGACY, false],
      ["legacy · the final newline removed", sha(DOC), text(DOC.slice(0, -1)), LEGACY, false],
      ["legacy · a real content change", sha(DOC), text(DOC + "x"), LEGACY, false],
      ["legacy · null recorded, absent", null, ABSENT, LEGACY, true],
      ["legacy · null recorded, empty", null, text(""), LEGACY, false],
      ["unknown algorithm · the raw hash matches, still no match", sha(DOC), text(DOC), "sha512", false],
      ["unknown algorithm · never read as legacy (CRLF encoding)", sha(crlf(DOC)), text(DOC), "sha256-raw", false],
      ["unknown algorithm · even null/absent does not match", null, ABSENT, "md5", false],
      ["malformed algorithm · null", sha(DOC), text(DOC), null, false],
      ["malformed algorithm · a number", sha(DOC), text(DOC), 256, false],
      ["malformed algorithm · different case", sha(DOC), text(DOC), "SHA256-LF", false],
      ["malformed recorded value · a number", 42, text(DOC), "sha256-lf", false],
    ];
    const wrong = MATRIX.filter(([, rec, doc, algo, want]) => M(rec, doc, algo) !== want).map(([n]) => n);
    check(`18 hash matrix: all ${MATRIX.length} cases follow the contract's four rules`, wrong.length === 0, wrong.join(" | "));
    for (const [name, rec, doc, algo, want] of MATRIX) if (M(rec, doc, algo) !== want) check(`18 ${name}`, false, `expected ${want}`);

    // readArtifact: absent, empty and unreadable are three different things.
    const ra = join(root, "artifact-read");
    mkdirSync(join(ra, "dir"), { recursive: true });
    write(ra, "empty.md", "");
    check("18 readArtifact: a missing file is absent", R.readArtifact(ra, "missing.md").state === "absent");
    check("18 readArtifact: a file below a non-directory is absent", R.readArtifact(ra, "empty.md/x").state === "absent");
    check("18 readArtifact: an empty file is text, not absent", R.readArtifact(ra, "empty.md").state === "text" && R.readArtifact(ra, "empty.md").text === "");
    check("18 readArtifact: a directory where a document should be is unreadable, never absent", R.readArtifact(ra, "dir").state === "unreadable");
    // A document that exists but cannot even be looked at (its folder has no permissions): unreadable, never "absent".
    write(ra, "locked/doc.md", "# doc\n");
    chmodSync(join(ra, "locked"), 0o000);
    let locked: any;
    try {
      locked = R.readArtifact(ra, "locked/doc.md");
    } finally {
      chmodSync(join(ra, "locked"), 0o755);
    }
    const asRoot = typeof process.getuid === "function" && process.getuid() === 0; // root ignores permissions
    check("18 readArtifact: a stat failure other than not-found is unreadable — a recorded null never matches it", asRoot || (locked.state === "unreadable" && R.artifactMatches(null, locked, undefined) === false), JSON.stringify(locked));
    check("18 readArtifact: the bytes are read as UTF-8 with nothing else changed (BOM and CRLF kept)", (() => { write(ra, "bom.md", BOM + "a\r\nb\r"); const d = R.readArtifact(ra, "bom.md"); return d.state === "text" && d.text === BOM + "a\r\nb\r"; })());

    // End to end through the CLI: a 0.14.0 manifest on a CRLF checkout, and an unsupported algorithm.
    const repo = join(root, "hash-crlf");
    const head = seedRepo(repo);
    const m14 = manifest(head);
    m14.fingerprint.artifactHash = "sha256-lf";
    write(repo, ".ono/repo-knowledge.json", JSON.stringify(m14));
    write(repo, "CLAUDE.md", crlf(CLAUDE_BODY));
    write(repo, "docs/project/patterns.md", crlf(PATTERNS_BODY));
    const r14 = run(repo).json;
    check("18 CLI: a sha256-lf manifest read on a CRLF checkout is fresh (not stale-artifacts)", r14?.freshness === "fresh", `${r14?.freshness} ${r14?.staleDetail}`);
    const legacyCrlf = manifest(head);
    legacyCrlf.fingerprint.artifacts["CLAUDE.md"] = sha(crlf(CLAUDE_BODY));
    write(repo, ".ono/repo-knowledge.json", JSON.stringify(legacyCrlf));
    write(repo, "CLAUDE.md", CLAUDE_BODY);
    write(repo, "docs/project/patterns.md", PATTERNS_BODY);
    const rl = run(repo).json;
    check("18 CLI: a legacy manifest emitted from a CRLF checkout, read on LF, is fresh", rl?.freshness === "fresh", `${rl?.freshness} ${rl?.staleDetail}`);
    const unknownAlgo = manifest(head);
    unknownAlgo.fingerprint.artifactHash = "sha3-256";
    write(repo, ".ono/repo-knowledge.json", JSON.stringify(unknownAlgo));
    const ru = run(repo).json;
    check("18 CLI: an unsupported artifactHash is stale-artifacts although every raw hash matches", ru?.available === true && ru?.freshness === "stale-artifacts" && /artifactHash "sha3-256" is not an algorithm this plugin supports/.test(ru?.staleDetail ?? ""), `${ru?.freshness} ${ru?.staleDetail}`);
    check("18 CLI: … and the categories those documents back are derived live, never reused", (ru?.deriveLive ?? []).includes("conventions") && !(ru?.usableCategories ?? []).includes("conventions"), JSON.stringify(ru?.usableCategories));
    write(repo, ".ono/repo-knowledge.json", JSON.stringify(m14));
    write(repo, "CLAUDE.md", crlf(CLAUDE_BODY) + "Edited.\r\n");
    const re = run(repo).json;
    check("18 CLI: a real content change on a CRLF checkout is still stale-artifacts", re?.freshness === "stale-artifacts" && /CLAUDE\.md/.test(re?.staleDetail ?? ""), `${re?.freshness}`);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
