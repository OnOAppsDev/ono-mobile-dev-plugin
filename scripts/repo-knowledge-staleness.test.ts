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
  const PRODUCER_CONTRACT_SHA256 = "b9822771b19460eadf32440bec562cc2508612a41700e399e6be9b8632413957";
  const contract = read("docs/repo-knowledge-contract.md");
  check("8 contract copy is byte-identical to the current producer copy (Stage A)",
    sha(contract) === PRODUCER_CONTRACT_SHA256, sha(contract));
  check("8 contract documents Guarantee 7 (knowledgeHead)", /Knowledge-authoring HEAD is never advanced by a re-emit/.test(contract));
  check("8 contract documents producer-side source drift", /^## Producer-side source drift$/m.test(contract));

  // The reader's Inspector-owned path list is the contract's, not an independent copy.
  const m = /ignores changes confined to producer-owned paths — (.+?)\. Any other/.exec(flat(contract));
  const fromContract = m ? [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]) : [];
  const fromReader: string[] = (Reader as any).INSPECTOR_OWNED_PATHS ?? [];
  check("8 the reader's Inspector-owned paths match the contract", same(fromReader, fromContract) && fromContract.length === 7,
    `${JSON.stringify(fromReader)} vs ${JSON.stringify(fromContract)}`);
}

rmSync(tmp, { recursive: true, force: true });

if (failures > 0) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall repo-knowledge staleness checks passed");
