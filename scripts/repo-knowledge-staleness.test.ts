/**
 * repo-knowledge-staleness.test.ts
 *
 * Pins Stage 4B: the consumer side of Project Knowledge staleness.
 *
 * Stage 4A (ono-project-inspector 0.10.0) records `fingerprint.knowledgeHead` — the HEAD
 * at which source-backed knowledge was actually generated — and classifies a completed
 * inspection as COMPLETE / REFRESH_RECOMMENDED / BASELINE_UNKNOWN. That status is not
 * persisted in the manifest, so this plugin's reader derives it the same way and turns it
 * into a per-category lifecycle:
 *
 *   fresh                 → reuse
 *   potentially stale     → reuse as a starting point, verify on use, current code wins
 *   unavailable / invalid → derive live (unchanged)
 *
 * What this suite protects:
 *   1. Fresh knowledge is reused, exactly as before.
 *   2. Source drift turns reused knowledge into verify-on-use.
 *   3. Only the categories the drift can affect are marked.
 *   4. Unrelated categories stay reusable as-is.
 *   5. Unavailable knowledge still derives live.
 *   6. Stale knowledge never silently becomes authoritative.
 *   7. Refresh recommendations point to /inspect → Refresh Project Knowledge, never /inspect-sync.
 *   8. docs/repo-knowledge-contract.md is byte-identical to the current producer copy.
 *
 * OFFLINE. Builds throwaway git repositories under a temp directory.
 *
 *   node --no-warnings scripts/repo-knowledge-staleness.test.ts
 *   node scripts/check.ts --only repo-knowledge-staleness
 */

import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as Reader from "./read-repo-knowledge.ts";

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

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf-8");
const flat = (s: string): string => s.replace(/\s+/g, " ");
const sha = (s: string) => createHash("sha256").update(s, "utf-8").digest("hex");
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();

function write(root: string, rel: string, body: string): void {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body, "utf-8");
}

const CLAUDE_BODY = "# CLAUDE.md — Demo\n";
const PATTERNS_BODY = "# Patterns\n\n## State Management\nRedux Toolkit.\n";
const COMPONENTS_BODY = "# Components\n\n## Screens\nHome.\n";
const INTEGRATIONS_BODY = "# Integrations\n\n## Analytics\nSegment.\n";

const SOURCE_BACKED = ["stack", "commands", "structure", "inventory", "conventions", "integrations"];
const DOCS_BACKED = ["inventory", "conventions", "integrations"];
const ANALYSIS_BACKED = ["stack", "commands", "structure"];

function manifest(gitHead: string | null, knowledgeHead: string | null | undefined, overrides: Record<string, any> = {}): any {
  const fingerprint: Record<string, any> = {
    gitHead,
    artifacts: {
      "CLAUDE.md": sha(CLAUDE_BODY),
      "AUDIT.md": null,
      "docs/project/overview.md": null,
      "docs/project/components.md": sha(COMPONENTS_BODY),
      "docs/project/patterns.md": sha(PATTERNS_BODY),
      "docs/project/integrations.md": sha(INTEGRATIONS_BODY),
    },
  };
  if (knowledgeHead !== undefined) fingerprint.knowledgeHead = knowledgeHead;
  return {
    repoKnowledgeSchemaVersion: 1,
    producedBy: { plugin: "ono-project-inspector", version: "0.10.0" },
    generatedAt: "2026-09-28T00:00:00.000Z",
    fingerprint,
    coverage: {
      stack: "populated", commands: "partial", structure: "populated", inventory: "populated",
      conventions: "populated", integrations: "populated", auditTopics: "populated",
    },
    stack: { languages: ["TypeScript"], frameworks: ["React Native"], platformHints: ["iOS"], runtimeTooling: ["Metro"], packageManagers: ["yarn"] },
    commands: { install: "yarn", run: "yarn ios", test: "yarn test", build: null },
    structure: { repositoryTree: "CLAUDE.md#repository-structure", keyModules: "CLAUDE.md#key-modules", entryPoints: "CLAUDE.md#entry-points" },
    documents: {
      claudeMd: { path: "CLAUDE.md", exists: true, anchors: [] },
      auditMd: { path: "AUDIT.md", exists: false, anchors: [] },
      overview: { path: "docs/project/overview.md", exists: false, anchors: [] },
      inventory: { path: "docs/project/components.md", exists: true, anchors: ["#screens"] },
      conventions: { path: "docs/project/patterns.md", exists: true, anchors: ["#state-management"] },
      integrations: { path: "docs/project/integrations.md", exists: true, anchors: ["#analytics"] },
    },
    auditTopics: [{ topic: "Networking", slug: "networking", status: "Approved", file: "audits/networking/networking.md" }],
    ...overrides,
  };
}

const tmp = mkdtempSync(join(realpathSync(tmpdir()), "rk-stale-"));
let seq = 0;

/** A repo with the knowledge artifacts committed; returns [dir, knowledgeHead]. */
function seed(): [string, string] {
  const dir = join(tmp, `r${++seq}`);
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t");
  git(dir, "config", "user.name", "t");
  write(dir, "src/app.ts", "export const a = 1;\n");
  write(dir, "package.json", '{ "name": "demo" }\n');
  write(dir, "CLAUDE.md", CLAUDE_BODY);
  write(dir, "docs/project/patterns.md", PATTERNS_BODY);
  write(dir, "docs/project/components.md", COMPONENTS_BODY);
  write(dir, "docs/project/integrations.md", INTEGRATIONS_BODY);
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "knowledge");
  return [dir, git(dir, "rev-parse", "HEAD")];
}

function commit(dir: string, rel: string, body: string): string {
  write(dir, rel, body);
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", `change ${rel}`);
  return git(dir, "rev-parse", "HEAD");
}

function putManifest(dir: string, m: any): void {
  write(dir, ".ono/repo-knowledge.json", JSON.stringify(m, null, 2));
}

const R = (dir: string): any => Reader.readRepoKnowledge(dir);
const sorted = (a: string[] = []) => [...a].sort();
const same = (a: string[] = [], b: string[] = []) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const noSyncAdvice = (r: any) =>
  !/\/inspect-sync/.test(`${r.refreshRecommendation ?? ""} ${r.summary ?? ""} ${r.sourceDrift?.reason ?? ""}`);

// =========================================================================
// 1. Fresh knowledge is reused — no change
// =========================================================================
{
  const [dir, kh] = seed();
  putManifest(dir, manifest(kh, kh));
  const r = R(dir);
  check("1 fresh: available", r.available === true);
  check("1 fresh: source drift COMPLETE", r.sourceDrift?.status === "COMPLETE", JSON.stringify(r.sourceDrift));
  check("1 fresh: nothing to verify on use", Array.isArray(r.verifyOnUse) && r.verifyOnUse.length === 0,
    JSON.stringify(r.verifyOnUse));
  check("1 fresh: every covered category reusable",
    same(r.usableCategories, [...SOURCE_BACKED, "auditTopics"]), JSON.stringify(r.usableCategories));
  check("1 fresh: every reusable category is trusted as-is", same(r.trustedCategories, r.usableCategories),
    JSON.stringify(r.trustedCategories));
  check("1 fresh: no refresh recommendation", r.refreshRecommendation === null);

  // Only Inspector-owned paths changed since the knowledge was generated → still COMPLETE.
  const [dir2, kh2] = seed();
  const head2 = commit(dir2, "audits/networking/networking.md", "# Networking audit\n");
  putManifest(dir2, manifest(head2, kh2));
  const r2 = R(dir2);
  check("1 inspector-owned changes only: COMPLETE", r2.sourceDrift?.status === "COMPLETE", JSON.stringify(r2.sourceDrift));
  check("1 inspector-owned changes only: nothing to verify", (r2.verifyOnUse ?? [null]).length === 0);
}

// =========================================================================
// 2-4. Source drift → verify-on-use, only for affected categories
// =========================================================================
{
  // Plain source change: docs-backed knowledge may have moved; analysis-backed has no signal.
  const [dir, kh] = seed();
  const head = commit(dir, "src/app.ts", "export const a = 2;\n");
  putManifest(dir, manifest(head, kh)); // gitHead advanced by a re-emit; knowledgeHead did not
  const r = R(dir);
  check("2 drift: REFRESH_RECOMMENDED", r.sourceDrift?.status === "REFRESH_RECOMMENDED", JSON.stringify(r.sourceDrift));
  check("2 drift: the changed source file is reported", (r.sourceDrift?.changedSourceFiles ?? []).includes("src/app.ts"));
  check("2 drift: knowledgeHead is reported", r.sourceDrift?.knowledgeHead === kh);
  check("2 drift: gitHead == HEAD does not make it fresh", r.sourceDrift?.status !== "COMPLETE");
  check("3 drift: docs-backed categories are verify-on-use", same(r.verifyOnUse, DOCS_BACKED), JSON.stringify(r.verifyOnUse));
  check("4 drift: stack/commands/structure stay trusted (no manifest or structure signal)",
    ANALYSIS_BACKED.every((c) => r.trustedCategories?.includes(c)), JSON.stringify(r.trustedCategories));
  check("4 drift: auditTopics is never verify-on-use", !r.verifyOnUse?.includes("auditTopics"));
  check("4 drift: auditTopics stays trusted", r.trustedCategories?.includes("auditTopics"));
  check("4 drift: nothing is invalidated wholesale — deriveLive is unchanged",
    (r.deriveLive ?? [null]).length === 0, JSON.stringify(r.deriveLive));
  check("4 drift: verify-on-use categories remain reusable as a starting point",
    DOCS_BACKED.every((c) => r.usableCategories?.includes(c)));

  // A build/dependency manifest change signals the analysis-backed categories too.
  const [dir2, kh2] = seed();
  const head2 = commit(dir2, "package.json", '{ "name": "demo", "dependencies": { "zustand": "5" } }\n');
  putManifest(dir2, manifest(head2, kh2));
  const r2 = R(dir2);
  check("3 manifest drift: stack/commands/structure become verify-on-use too",
    same(r2.verifyOnUse, SOURCE_BACKED), JSON.stringify(r2.verifyOnUse));
  check("3 manifest drift: the analysis signal is reported",
    (r2.sourceDrift?.analysisSignals ?? []).some((s: string) => s.includes("package.json")),
    JSON.stringify(r2.sourceDrift?.analysisSignals));
  check("4 manifest drift: auditTopics still trusted", r2.trustedCategories?.includes("auditTopics"));

  // A new top-level entry is a structure signal.
  const [dir3, kh3] = seed();
  const head3 = commit(dir3, "packages/core/index.ts", "export {};\n");
  putManifest(dir3, manifest(head3, kh3));
  const r3 = R(dir3);
  check("3 top-level drift: structure becomes verify-on-use", r3.verifyOnUse?.includes("structure"),
    JSON.stringify(r3.verifyOnUse));

  // Unknown coverage and changed artifacts keep their existing routing: derive live, not verify.
  const [dir4, kh4] = seed();
  const head4 = commit(dir4, "src/app.ts", "export const a = 3;\n");
  const m4 = manifest(head4, kh4);
  m4.coverage.integrations = "unknown";
  putManifest(dir4, m4);
  write(dir4, "docs/project/patterns.md", PATTERNS_BODY + "\nedited\n");
  const r4 = R(dir4);
  check("3 unknown coverage stays deriveLive, not verify-on-use",
    r4.deriveLive?.includes("integrations") && !r4.verifyOnUse?.includes("integrations"));
  check("3 a changed backing document stays deriveLive, not verify-on-use",
    r4.deriveLive?.includes("conventions") && !r4.verifyOnUse?.includes("conventions"));
  check("3 the remaining docs category is verify-on-use", same(r4.verifyOnUse, ["inventory"]), JSON.stringify(r4.verifyOnUse));
}

// =========================================================================
// 2b. BASELINE_UNKNOWN → every source-backed category is verify-on-use
// =========================================================================
{
  const cases: Array<[string, (dir: string, kh: string) => any]> = [
    ["knowledgeHead absent (pre-0.10.0 producer)", (_d, kh) => manifest(kh, undefined)],
    ["knowledgeHead null", (_d, kh) => manifest(kh, null)],
    ["knowledgeHead not in history", (_d, kh) => manifest(kh, "0".repeat(40))],
  ];
  for (const [label, build] of cases) {
    const [dir, kh] = seed();
    putManifest(dir, build(dir, kh));
    const r = R(dir);
    check(`2b ${label}: BASELINE_UNKNOWN`, r.sourceDrift?.status === "BASELINE_UNKNOWN", JSON.stringify(r.sourceDrift));
    check(`2b ${label}: every source-backed category is verify-on-use`,
      same(r.verifyOnUse, SOURCE_BACKED), JSON.stringify(r.verifyOnUse));
    check(`2b ${label}: auditTopics stays trusted`, r.trustedCategories?.includes("auditTopics"));
  }

  const nogit = join(tmp, "nogit");
  mkdirSync(nogit, { recursive: true });
  write(nogit, "CLAUDE.md", CLAUDE_BODY);
  write(nogit, "docs/project/patterns.md", PATTERNS_BODY);
  write(nogit, "docs/project/components.md", COMPONENTS_BODY);
  write(nogit, "docs/project/integrations.md", INTEGRATIONS_BODY);
  putManifest(nogit, manifest("a".repeat(40), "a".repeat(40)));
  const r = R(nogit);
  check("2b no git: BASELINE_UNKNOWN", r.sourceDrift?.status === "BASELINE_UNKNOWN", JSON.stringify(r.sourceDrift));
  check("2b no git: still available, never fatal", r.available === true);
}

// =========================================================================
// 5. Unavailable / invalid knowledge still derives live
// =========================================================================
{
  const [dir] = seed();
  const r = R(dir);
  check("5 absent: unavailable", r.available === false && r.reason === "absent");
  check("5 absent: everything derived live", (r.deriveLive ?? []).length === 7);
  check("5 absent: nothing verify-on-use", Array.isArray(r.verifyOnUse) && r.verifyOnUse.length === 0);
  check("5 absent: nothing trusted", Array.isArray(r.trustedCategories) && r.trustedCategories.length === 0);
  check("5 absent: no source-drift verdict", r.sourceDrift === null);

  const [dir2, kh2] = seed();
  const bad = manifest(kh2, kh2);
  bad.fingerprint.knowledgeHead = 42;
  putManifest(dir2, bad);
  const r2 = R(dir2);
  check("5 a non-string knowledgeHead is invalid → derive live",
    r2.available === false && r2.reason === "invalid" && (r2.deriveLive ?? []).length === 7, r2.summary);
}

// =========================================================================
// 6. Stale knowledge never silently becomes authoritative
// =========================================================================
{
  const [dir, kh] = seed();
  const head = commit(dir, "package.json", '{ "name": "demo2" }\n');
  putManifest(dir, manifest(head, kh));
  const r = R(dir);
  const overlap = (r.verifyOnUse ?? []).filter((c: string) => (r.trustedCategories ?? []).includes(c));
  check("6 no verify-on-use category is trusted as-is", overlap.length === 0, overlap.join(","));
  check("6 trusted + verify-on-use = usable",
    same([...(r.trustedCategories ?? []), ...(r.verifyOnUse ?? [])], r.usableCategories));
  check("6 the summary names what must be verified on use", /verify on use/i.test(r.summary ?? ""), r.summary);
  check("6 the stale detail does not say 'as-is'", !/as-is/i.test(r.staleDetail ?? ""), r.staleDetail ?? "");

  const consumer = flat(read("skills/repo-knowledge-consumer/SKILL.md"));
  check("6 consumer skill has a verify-on-use step", /Verify on use/i.test(consumer) && /`verifyOnUse`/.test(consumer));
  check("6 it verifies only the facts the current feature uses",
    /only the facts (this|the current) feature (actually )?uses/i.test(consumer));
  check("6 it forbids a global re-scan", /never (re-scan|rescan) the (whole )?repository/i.test(consumer));
  check("6 current repository code is authoritative", /current repository (code )?is authoritative/i.test(consumer));
  check("6 verified facts cite current evidence, not the stale document",
    /`\[evidence: <path>\]`/.test(consumer) && /never `\[reused:/i.test(consumer));
  check("6 a failed verification derives the affected knowledge live",
    /verification fails[^.]*derive[^.]*live/i.test(consumer));
  check("6 only trustedCategories are reused as-is", /`trustedCategories`/.test(consumer));

  for (const rel of ["skills/platform-planning/SKILL.md", "agents/repo-analyst.md", "skills/dev-design-start/SKILL.md"]) {
    check(`6 ${rel} honours verifyOnUse`, /`verifyOnUse`/.test(read(rel)));
  }
}

// =========================================================================
// 7. Refresh recommendations point to /inspect, never /inspect-sync
// =========================================================================
{
  const [dir, kh] = seed();
  const head = commit(dir, "src/app.ts", "export const a = 9;\n");
  putManifest(dir, manifest(head, kh));
  const r = R(dir);
  check("7 drift recommends /inspect", /\/inspect\b/.test(r.refreshRecommendation ?? ""), String(r.refreshRecommendation));
  check("7 drift recommends Refresh Project Knowledge", /Refresh Project Knowledge/.test(r.refreshRecommendation ?? ""));
  check("7 drift never recommends /inspect-sync", noSyncAdvice(r));

  const [dir2, kh2] = seed();
  putManifest(dir2, manifest(kh2, null));
  const r2 = R(dir2);
  check("7 baseline-unknown recommends /inspect → Refresh Project Knowledge",
    /\/inspect\b/.test(r2.refreshRecommendation ?? "") && /Refresh Project Knowledge/.test(r2.refreshRecommendation ?? ""));
  check("7 baseline-unknown never recommends /inspect-sync", noSyncAdvice(r2));

  const consumer = flat(read("skills/repo-knowledge-consumer/SKILL.md"));
  check("7 consumer skill recommends /inspect → Refresh Project Knowledge for source drift",
    /`\/inspect` → \*\*Refresh Project Knowledge\*\*/.test(consumer));
  check("7 consumer skill forbids /inspect-sync for source drift",
    /Never recommend `\/inspect-sync` for source(-code)? drift/i.test(consumer));
}

// =========================================================================
// 8. The contract copy is the Stage 4A producer copy, byte for byte
// =========================================================================
{
  // sha256 of ono-project-inspector 6fa811d:docs/repo-knowledge-contract.md (Stage A, 0.11.0),
  // which carries Stage 4A's text unchanged and adds the surface and capability model.
  // When the producer changes the contract, update the copy AND this pin in the same release.
  // 0.7.5: re-synced with producer 0.11.2 (the Project Root paragraph).
  const PRODUCER_CONTRACT_SHA256 = "6fb8eff730a2064259fbc56428d2303424517ff9ded6d5c3b276be649c6226d8";
  const contract = read("docs/repo-knowledge-contract.md");
  // 0.9.0: this copy deliberately carries the consumer's single-target routing exception
  // (scripts/fixtures/repo-knowledge-contract-deviation.json). Reversing exactly those edits must
  // still give the producer copy byte for byte — any other drift fails here, as before.
  const dev = JSON.parse(read("scripts/fixtures/repo-knowledge-contract-deviation.json"));
  let producer = contract.endsWith(dev.appended) ? contract.slice(0, -dev.appended.length) : "<appendix missing>";
  for (const r of dev.replacements) producer = producer.split(r.deviation).length === 2 ? producer.replace(r.deviation, r.producer) : "<deviation edit missing>";
  check("8 contract copy is the producer copy plus exactly the documented consumer deviation",
    sha(producer) === PRODUCER_CONTRACT_SHA256, sha(producer));
  check("8 the deviation is announced in the copy itself", /Consumer deviation — ono-mobile-dev-plugin 0\.9\.0/.test(contract));
  check("8 contract documents Guarantee 7 (knowledgeHead)", /Knowledge-authoring HEAD is never advanced by a re-emit/.test(contract));
  check("8 contract documents producer-side source drift", /^## Producer-side source drift$/m.test(contract));

  // The reader's Inspector-owned path list is the contract's, not an independent copy.
  const m = /ignores changes confined to producer-owned paths — (.+?)\. Any other/.exec(flat(contract));
  const fromContract = m ? [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]) : [];
  const fromReader: string[] = (Reader as any).INSPECTOR_OWNED_PATHS ?? [];
  check("8 the reader's Inspector-owned paths match the contract", same(fromReader, fromContract) && fromContract.length === 7,
    `${JSON.stringify(fromReader)} vs ${JSON.stringify(fromContract)}`);
}

/* ── 9 (0.9.0). Non-ASCII and special Git paths — exact identities, NUL-delimited ─────────────
 * Git C-quotes non-ASCII and special names in its default output; the reader used to split that
 * output on newlines, so a Hebrew Inspector document counted as source drift with a false
 * `top-level entry added: "docs` signal, and non-ASCII source was never attributed. Names that a
 * platform cannot hold on disk (Windows: `"`, `\`, tab, newline) or would rewrite (macOS: NFD →
 * NFC) are committed through Git objects (hash-object, mktree -z, commit-tree) — portable, and
 * with per-command `-c` settings only (no global Git configuration). Adapted from Inspector 0.13.0.
 */
{
  const NUL = "\u0000";
  const fx = (dir: string, args: string[], input?: string): string =>
    execFileSync("git", ["-c", "core.protectNTFS=false", "-c", "core.precomposeUnicode=false", ...args], { cwd: dir, encoding: "utf-8", input, stdio: ["pipe", "pipe", "pipe"] }).replace(/\n$/, "");
  type Entry = { mode: string; type: string; sha: string; name: string };
  const entriesOf = (dir: string, tree: string | null): Entry[] =>
    tree === null ? [] : fx(dir, ["ls-tree", "-z", tree]).split(NUL).filter(Boolean).map((e) => {
      const tab = e.indexOf("\t");
      const [mode, type, sha] = e.slice(0, tab).split(" ");
      return { mode, type, sha, name: e.slice(tab + 1) };
    });
  /** `tree` with the blob at `parts` set (or removed when blob is null); null when the tree ends up empty. */
  const treeWith = (dir: string, tree: string | null, parts: string[], blob: string | null): string | null => {
    const entries = entriesOf(dir, tree);
    const [head, ...rest] = parts;
    const i = entries.findIndex((e) => e.name === head);
    if (rest.length === 0) {
      if (blob === null) { if (i !== -1) entries.splice(i, 1); }
      else { const entry = { mode: "100644", type: "blob", sha: blob, name: head }; if (i === -1) entries.push(entry); else entries[i] = entry; }
    } else {
      const sub = treeWith(dir, i !== -1 && entries[i].type === "tree" ? entries[i].sha : null, rest, blob);
      if (sub === null) { if (i !== -1) entries.splice(i, 1); }
      else { const entry = { mode: "040000", type: "tree", sha: sub, name: head }; if (i === -1) entries.push(entry); else entries[i] = entry; }
    }
    if (entries.length === 0) return null;
    return fx(dir, ["mktree", "-z"], entries.map((e) => `${e.mode} ${e.type} ${e.sha}\t${e.name}${NUL}`).join(""));
  };
  /** One commit setting (body) or deleting (null) EXACT paths through Git objects; work tree and index untouched. */
  const commitExact = (dir: string, changes: Record<string, string | null>): string => {
    let tree: string | null = fx(dir, ["rev-parse", "HEAD^{tree}"]);
    for (const [path, body] of Object.entries(changes)) tree = treeWith(dir, tree, path.split("/"), body === null ? null : fx(dir, ["hash-object", "-w", "--stdin"], body));
    const parent = fx(dir, ["rev-parse", "HEAD"]);
    const c = fx(dir, ["commit-tree", tree!, "-p", parent, "-m", "exact paths"]);
    fx(dir, ["update-ref", "HEAD", c, parent]);
    const stored = fx(dir, ["ls-tree", "-z", "-r", "--name-only", "HEAD"]).split(NUL);
    for (const [path, body] of Object.entries(changes)) if ((body !== null) !== stored.includes(path)) throw new Error(`fixture: ${JSON.stringify(path)} was not stored exactly`);
    return c;
  };
  /** The surface and capability model these cases attribute against (the Inspector's shapes). */
  const MODEL = {
    coverage: { stack: "populated", commands: "partial", structure: "populated", inventory: "populated", conventions: "populated", integrations: "populated", auditTopics: "populated", surfaces: "populated", capabilities: "populated" },
    surfaces: [{ id: "android-tv", platform: "android", formFactor: "tv", buildSelector: ":app:assembleProdRelease", sourceRoots: ["app/src/tv/", "מסכים/"], sharedWith: [], packaging: null, minimumRuntime: null, evidence: ["app/src/tv/AndroidManifest.xml", "תצורה/flavors.gradle"] }],
    sharedCode: [],
    capabilities: [{ id: "player", name: "Player", anchor: "docs/project/capabilities.md#capability-player", surfaceScope: "all", surfaces: ["android-tv"], sourceRoots: [{ path: "src/נגן/", surface: null }], entryPoints: [], components: [], services: [], routes: [], dataDependencies: [], stateOwnership: [], tests: [], evidence: [], relationships: [] }],
    capabilityRelationships: [],
  };
  const D = (dir: string, kh: string, extra: Record<string, any> = MODEL) => {
    putManifest(dir, manifest(git(dir, "rev-parse", "HEAD"), kh, extra));
    return R(dir);
  };
  const owned: Array<[string, string]> = [
    ["Hebrew", "docs/project/סקירה.md"],
    ["Hebrew audit", "audits/רשת/ביקורת.md"],
    ["accented", "docs/project/résumé.md"],
    ["double quote", 'docs/project/a"b.md'],
    ["backslash", "docs/project/a\\b.md"],
    ["tab", "docs/project/a\tb.md"],
    ["newline", "docs/project/a\nb.md"],
    ["space", "docs/project/a b.md"],
    ["leading and trailing spaces", "docs/project/ edge .md"],
    ["Hebrew under .ono/", ".ono/מצב.json"],
  ];
  for (const [what, path] of owned) {
    const [dir, kh] = seed();
    commitExact(dir, { [path]: "x\n" });
    const r = D(dir, kh);
    check(`9 an Inspector-owned path (${what}) is not source drift`, r.sourceDrift?.status === "COMPLETE" && r.sourceDrift.changedSourceCount === 0 && (r.sourceDrift.analysisSignals ?? []).length === 0, JSON.stringify(r.sourceDrift));
  }
  {
    const [dir, kh] = seed();
    commitExact(dir, { "src/מסך.kt": "x\n" });
    const d = D(dir, kh).sourceDrift;
    check("9 Hebrew source is drift, reported by its exact path", d?.status === "REFRESH_RECOMMENDED" && same(d.changedSourceFiles, ["src/מסך.kt"]), JSON.stringify(d));
    check("9 …with no false top-level signal (src already existed)", (d?.analysisSignals ?? []).length === 0, JSON.stringify(d?.analysisSignals));
  }
  for (const [what, path] of [["quote", 'src/a"b.kt'], ["backslash", "src/a\\b.kt"], ["tab", "src/a\tb.kt"], ["newline", "src/a\nb.kt"]] as const) {
    const [dir, kh] = seed();
    commitExact(dir, { [path]: "x\n" });
    const d = D(dir, kh).sourceDrift;
    check(`9 source with a ${what} in its name is reported exactly, not quoted`, d?.status === "REFRESH_RECOMMENDED" && same(d.changedSourceFiles, [path]), JSON.stringify(d?.changedSourceFiles));
  }
  {
    const [dir, kh] = seed();
    commitExact(dir, { "מודול/קובץ.kt": "x\n" });
    const d = D(dir, kh).sourceDrift;
    check("9 a Hebrew top-level entry added is signalled by its exact name", (d?.analysisSignals ?? []).includes("top-level entry added: מודול"), JSON.stringify(d?.analysisSignals));
    const [dir2] = seed();
    commitExact(dir2, { "מודול/קובץ.kt": "x\n" });
    const kh2 = git(dir2, "rev-parse", "HEAD");
    commitExact(dir2, { "מודול/קובץ.kt": null });
    const d2 = D(dir2, kh2).sourceDrift;
    check("9 a Hebrew top-level entry removed is signalled by its exact name", (d2?.analysisSignals ?? []).includes("top-level entry removed: מודול"), JSON.stringify(d2?.analysisSignals));
  }
  {
    const [dir, kh] = seed();
    commitExact(dir, { "מסכים/בית.kt": "x\n" });
    const d = D(dir, kh).sourceDrift;
    check("9 surface attribution: a Hebrew file under a Hebrew source root", (d?.affectedSurfaces ?? []).includes("android-tv"), JSON.stringify(d));
    const [dir2, kh2] = seed();
    commitExact(dir2, { "תצורה/flavors.gradle": "x\n" });
    const d2 = D(dir2, kh2).sourceDrift;
    check("9 surface evidence: a Hebrew evidence path raises its signal, exactly", (d2?.analysisSignals ?? []).includes("surface evidence changed: תצורה/flavors.gradle"), JSON.stringify(d2?.analysisSignals));
    const [dir3, kh3] = seed();
    commitExact(dir3, { "src/נגן/Player.kt": "x\n" });
    check("9 capability attribution: a file under a Hebrew capability root", (D(dir3, kh3).sourceDrift?.affectedCapabilities ?? []).includes("player"));
  }
  {
    // NFD on disk / in Git, NFC in the manifest: compared equal, reported as Git stores it.
    const [dir, kh] = seed();
    const model = { ...MODEL, capabilities: [{ ...MODEL.capabilities[0], sourceRoots: [{ path: "src/résumé.kt".normalize("NFC"), surface: null }] }] };
    commitExact(dir, { "src/re\u0301sume\u0301.kt": "x\n" });
    const d = D(dir, kh, model).sourceDrift;
    check("9 NFC/NFD: an NFD Git path is attributed to an NFC recorded root", (d?.affectedCapabilities ?? []).includes("player"), JSON.stringify(d));
    check("9 NFC/NFD: the reported path is Git's exact (NFD) path", same(d?.changedSourceFiles, ["src/re\u0301sume\u0301.kt"]), JSON.stringify(d?.changedSourceFiles));
    const [dir2, kh2] = seed();
    commitExact(dir2, { "src/r\u00e9sum\u00e9.kt": "nfc\n", "src/re\u0301sume\u0301.kt": "nfd\n" });
    const d2 = D(dir2, kh2).sourceDrift;
    check("9 NFC/NFD: two Git paths that differ only in normalization stay two changes", d2?.changedSourceCount === 2, JSON.stringify(d2?.changedSourceFiles));
  }
  {
    const [dir] = seed();
    commitExact(dir, { "מסכים/ישן.kt": "x\n" });
    const kh = git(dir, "rev-parse", "HEAD");
    commitExact(dir, { "מסכים/ישן.kt": null, "src/חדש.kt": "x\n" });
    const d = D(dir, kh).sourceDrift;
    check("9 rename (no rename detection): both the old and the new exact path are listed", same(d?.changedSourceFiles, ["src/חדש.kt", "מסכים/ישן.kt"]), JSON.stringify(d?.changedSourceFiles));
    check("9 rename out of a recorded root is attributed to it (old side)", (d?.affectedSurfaces ?? []).includes("android-tv"), JSON.stringify(d?.affectedSurfaces));
    const [dir2] = seed();
    commitExact(dir2, { "src/נמחק.kt": "x\n" });
    const kh2 = git(dir2, "rev-parse", "HEAD");
    commitExact(dir2, { "src/נמחק.kt": null });
    check("9 a deleted Hebrew file is listed by its exact path", same(D(dir2, kh2).sourceDrift?.changedSourceFiles, ["src/נמחק.kt"]));
  }
  {
    // Nested project in a Hebrew directory: --relative keeps the Git root's other files out.
    const top = join(tmp, `nested-${++seq}`);
    const proj = join(top, "פרויקט");
    mkdirSync(proj, { recursive: true });
    git(top, "init", "-q"); git(top, "config", "user.email", "t@t"); git(top, "config", "user.name", "t");
    for (const [rel, body] of [["src/app.ts", "x\n"], ["package.json", '{ "name": "demo" }\n'], ["CLAUDE.md", CLAUDE_BODY], ["docs/project/patterns.md", PATTERNS_BODY], ["docs/project/components.md", COMPONENTS_BODY], ["docs/project/integrations.md", INTEGRATIONS_BODY]]) write(proj, rel, body);
    write(top, "outside.txt", "x\n");
    git(top, "add", "-A"); git(top, "commit", "-qm", "seed");
    const kh = git(top, "rev-parse", "HEAD");
    commitExact(top, { "פרויקט/docs/project/סקירה.md": "x\n", "אחר/קובץ.kt": "x\n" });
    putManifest(proj, manifest(git(top, "rev-parse", "HEAD"), kh));
    const r = R(proj);
    check("9 nested Hebrew project: the project prefix is exact", r.projectPrefix === "פרויקט/", JSON.stringify(r.projectPrefix));
    check("9 nested Hebrew project: its own Hebrew Inspector document is not drift; other projects' files are out of scope", r.sourceDrift?.status === "COMPLETE", JSON.stringify(r.sourceDrift));
    commitExact(top, { "פרויקט/src/מסך.ts": "x\n" });
    const r2 = R(proj);
    check("9 nested Hebrew project: its own source change is reported relative to the project", same(r2.sourceDrift?.changedSourceFiles, ["src/מסך.ts"]), JSON.stringify(r2.sourceDrift?.changedSourceFiles));
  }
  {
    // Large repository: > 1 MiB of names in one diff (the old 1 MiB default buffer failed here).
    const [dir, kh] = seed();
    const blob = fx(dir, ["hash-object", "-w", "--stdin"], "x\n");
    const names = Array.from({ length: 20000 }, (_, i) => `file-with-a-deliberately-long-name-to-fill-the-buffer-${String(i).padStart(6, "0")}.kt`);
    const sub = fx(dir, ["mktree", "-z"], names.map((n) => `100644 blob ${blob}\t${n}${NUL}`).join(""));
    const root = entriesOf(dir, fx(dir, ["rev-parse", "HEAD^{tree}"]));
    const srcI = root.findIndex((e) => e.name === "src");
    root[srcI] = { ...root[srcI], sha: fx(dir, ["mktree", "-z"], [...entriesOf(dir, root[srcI].sha), { mode: "040000", type: "tree", sha: sub, name: "bulk" }].map((e) => `${e.mode} ${e.type} ${e.sha}\t${e.name}${NUL}`).join("")) };
    const tree = fx(dir, ["mktree", "-z"], root.map((e) => `${e.mode} ${e.type} ${e.sha}\t${e.name}${NUL}`).join(""));
    const c = fx(dir, ["commit-tree", tree, "-p", kh, "-m", "bulk"]);
    fx(dir, ["update-ref", "HEAD", c, kh]);
    const d = D(dir, kh).sourceDrift;
    check("9 large diff (> 1 MiB of names) is read whole, not reported unknown", d?.status === "REFRESH_RECOMMENDED" && d.changedSourceCount === 20000, `${d?.status} ${d?.changedSourceCount}`);
    check("9 the path buffer matches the plugin's other git helpers (64 MiB)", (Reader as any).GIT_PATH_MAX_BUFFER === 64 * 1024 * 1024 && /GIT_MAX_BUFFER = 64 \* 1024 \* 1024/.test(read("scripts/task-resume.ts")));
  }
  {
    // Failed git operations are BASELINE_UNKNOWN, never COMPLETE or "no change".
    const [dir, kh] = seed();
    commitExact(dir, { "src/b.kt": "x\n" });
    putManifest(dir, manifest(git(dir, "rev-parse", "HEAD"), kh, MODEL));
    const realGit = execFileSync("bash", ["-c", "command -v git"], { encoding: "utf-8" }).trim();
    const bin = join(tmp, `fake-git-${++seq}`);
    mkdirSync(bin);
    const failOn = (verb: string) => {
      writeFileSync(join(bin, "git"), `#!/bin/bash\nfor a in "$@"; do [ "$a" = "${verb}" ] && { echo "fatal: injected ${verb} failure" >&2; exit 128; }; done\nexec "${realGit}" "$@"\n`);
      execFileSync("chmod", ["+x", join(bin, "git")]);
      const out = execFileSync(process.execPath, ["--no-warnings", join(HERE, "read-repo-knowledge.ts"), dir], { encoding: "utf-8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
      return JSON.parse(out);
    };
    const lsTree = failOn("ls-tree");
    check("9 a failed ls-tree is BASELINE_UNKNOWN — never 'no top-level change'", lsTree.sourceDrift?.status === "BASELINE_UNKNOWN" && /ls-tree/.test(lsTree.sourceDrift.reason), JSON.stringify(lsTree.sourceDrift));
    check("9 …and surfaces are then not trusted", lsTree.extendedCategories?.surfaces?.status !== "trusted", JSON.stringify(lsTree.extendedCategories?.surfaces));
    const diff = failOn("diff");
    check("9 a failed diff is BASELINE_UNKNOWN", diff.sourceDrift?.status === "BASELINE_UNKNOWN" && /git diff/.test(diff.sourceDrift.reason), JSON.stringify(diff.sourceDrift));
    check("9 gitPaths returns null on failure — never an empty list", (Reader as any).gitPaths(dir, ["ls-tree", "-z", "--name-only", "no-such-revision"]) === null);
  }
  {
    // Exclusion rules unchanged.
    const [dir, kh] = seed();
    commitExact(dir, { "CLAUDE.md.bak": "x\n", "AUDIT.md": "x\n", ".ono/state.json": "{}\n" });
    check("9 the Inspector-owned exclusions are unchanged", D(dir, kh).sourceDrift?.status === "COMPLETE");
    const src = read("scripts/read-repo-knowledge.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("9 source: every path listing is NUL-delimited with quotePath off", /gitPaths\(targetRoot, \["diff", "-z"/.test(src) && /gitPaths\(targetRoot, \["ls-tree", "-z"/.test(src) && /"core\.quotePath=false"/.test(src) && !/split\("\\n"\)/.test(src));
  }
}

rmSync(tmp, { recursive: true, force: true });

if (failures > 0) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall repo-knowledge staleness checks passed");
