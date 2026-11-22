/**
 * pr-scope.ts — the intended pull request's scope, computed deterministically.
 *
 * What a pull request from the current branch would contain, as git sees it, without
 * committing, fetching or changing anything:
 *
 *   target branch  --base, else `.platform-guardian.json` `centralBranch` (the source the
 *                  Platform Guardian plugin itself uses), else `origin/HEAD`, else the first of
 *                  main / master / develop that exists. The remote-tracking ref is preferred
 *                  to the local branch, because that is what a pull request targets. Nothing
 *                  is fetched: a stale remote-tracking ref is reported, never refreshed.
 *   merge base     `git merge-base <target> HEAD`.
 *   files          every path that differs between the merge base and the working tree:
 *                  committed on the branch, staged, unstaged, and untracked but not ignored.
 *                  A path whose content is back to the merge base's is not in scope.
 *
 * Each path carries its git blob id as it is NOW (the working tree's content, through
 * `git hash-object`, so the repository's clean filters apply) or `deleted`. A blob id does not
 * move when exactly that content is committed, so anything bound to this map survives a
 * content-preserving commit — and moves on any edit, addition or removal.
 *
 * Paths are split into three classes, so that writing evidence never invalidates what the
 * evidence is about:
 *
 *   code         implementation files — what a review is bound to.
 *   docs         planning and review documents of Ono work (the caller says which, plus the
 *                fixed docs/bugs/, docs/reviews/ and docs/qa/ trees). Bound separately, by
 *                their own content and approval.
 *   operational  the plugin's own working state (task-state store, cycle approvals, temp
 *                files). Never bound, never required in a PR.
 *
 * Read-only: git is read, never written. Always exits 0 and prints one JSON object.
 *
 *   node --no-warnings scripts/pr-scope.ts --root <TARGET_ROOT> [--base <branch>]
 */

import { execFileSync } from "child_process";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { GIT_MAX_BUFFER, gitState, isStoreArtifact } from "./task-resume.ts";
import { writeStdout } from "./write-output.ts";

export const DELETED = "deleted";
export const DEFAULT_BRANCHES = ["main", "master", "develop"] as const;
export const GUARDIAN_CONFIG = ".platform-guardian.json";

const sha = (s: string | Buffer): string => `sha256:${createHash("sha256").update(s).digest("hex")}`;

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", root, ...args], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: GIT_MAX_BUFFER }).toString("utf-8");
  } catch {
    return null;
  }
}

export interface BaseResolution {
  /** The target branch's name, e.g. `develop`. */
  branch: string;
  /** The ref the merge base was computed from, e.g. `refs/remotes/origin/develop`. */
  ref: string;
  source: "argument" | "guardian-config" | "origin-head" | "default";
}

/** The ref a branch name resolves to — the remote-tracking ref first, then the local branch. */
function refFor(root: string, branch: string): string | null {
  if (!/^[A-Za-z0-9._\/-]+$/.test(branch) || branch.includes("..") || branch.startsWith("-")) return null;
  for (const r of [`refs/remotes/origin/${branch}`, `refs/heads/${branch}`]) {
    if (git(root, ["rev-parse", "-q", "--verify", `${r}^{commit}`]) !== null) return r;
  }
  return null;
}

/** The Platform Guardian's configured central branch, when the repository declares one. */
export function guardianCentralBranch(root: string): string | null {
  const p = join(root, GUARDIAN_CONFIG);
  if (!existsSync(p)) return null;
  try {
    const v = JSON.parse(readFileSync(p, "utf-8"))?.centralBranch;
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  } catch {
    return null;
  }
}

export function resolveBase(root: string, explicit?: string | null): BaseResolution | { error: string; reason: string } {
  if (explicit) {
    const ref = refFor(root, explicit);
    return ref === null ? { error: "BASE_NOT_FOUND", reason: `the target branch "${explicit}" does not exist locally or as origin/${explicit}` } : { branch: explicit, ref, source: "argument" };
  }
  const central = guardianCentralBranch(root);
  if (central !== null) {
    const ref = refFor(root, central);
    if (ref !== null) return { branch: central, ref, source: "guardian-config" };
  }
  const originHead = git(root, ["symbolic-ref", "-q", "--short", "refs/remotes/origin/HEAD"])?.trim();
  if (originHead && originHead.startsWith("origin/")) {
    const branch = originHead.slice("origin/".length);
    const ref = refFor(root, branch);
    if (ref !== null) return { branch, ref, source: "origin-head" };
  }
  for (const b of DEFAULT_BRANCHES) {
    const ref = refFor(root, b);
    if (ref !== null) return { branch: b, ref, source: "default" };
  }
  return { error: "BASE_NOT_FOUND", reason: `no target branch: pass --base, or declare centralBranch in ${GUARDIAN_CONFIG}` };
}

export type FileClass = "code" | "docs" | "operational";

/** The plugin's own working state: never task work, never required in a pull request. */
export function isOperational(rel: string): boolean {
  return isStoreArtifact(rel) || /(^|\/)\.[^/]*\.(tmp|task-state\.tmp|cycle-approval\.tmp)$/.test(rel) || /\.(bug-review|feature-review|qa-handoff|pre-pr)\.tmp$/.test(rel);
}

/** Ono work documents that live in fixed trees, whichever work they belong to. */
export function isWorkDocument(rel: string): boolean {
  return rel.startsWith("docs/bugs/") || rel.startsWith("docs/reviews/") || /^docs\/qa\/[^/]+-qa-handoff\.md$/.test(rel);
}

export interface ScopeEntry {
  path: string;
  /** The blob id as it is now, or `deleted`. */
  blob: string;
  /** The blob id at the merge base, or null when the path did not exist there. */
  base_blob: string | null;
  change: "added" | "modified" | "deleted";
  class: FileClass;
  /** True when the path's current content is exactly what HEAD has committed. */
  committed: boolean;
  /** The blob id HEAD has committed for the path, or null when HEAD does not have it. */
  head_blob: string | null;
}

export interface PrScope {
  ok: true;
  root: string;
  branch: string | null;
  head: string;
  base: BaseResolution;
  merge_base: string;
  files: ScopeEntry[];
  /** sha256 over the code files' `path\0blob` lines — the identity of the reviewed implementation. */
  code_fingerprint: string;
  docs_fingerprint: string;
}

export type ScopeFailure = { ok: false; outcome: string; reason: string };

/** Every blob id under `rev`, keyed by path (one ls-tree for the whole tree). */
function treeBlobs(root: string, rev: string): Map<string, string> | null {
  const out = git(root, ["-c", "core.quotepath=false", "ls-tree", "-r", "-z", "--full-tree", rev]);
  if (out === null) return null;
  const map = new Map<string, string>();
  for (const e of out.split("\0")) {
    const m = /^\d+ \w+ ([0-9a-f]+)\t([\s\S]+)$/.exec(e);
    if (m !== null) map.set(m[2], m[1]);
  }
  return map;
}

export function fingerprintEntries(entries: Array<{ path: string; blob: string }>): string {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return sha(sorted.map((e) => `${e.path}\0${e.blob}`).join("\n"));
}

/**
 * The intended pull request's scope. `isDoc` names the work's own planning documents (wherever
 * the repository keeps them); the fixed Ono document trees are always docs.
 */
export function prScope(rootIn: string, opts: { base?: string | null; isDoc?: (rel: string) => boolean } = {}): PrScope | ScopeFailure {
  if (!rootIn || !existsSync(rootIn) || !statSync(rootIn).isDirectory()) return { ok: false, outcome: "SCOPE_ROOT_INVALID", reason: `repository root ${rootIn ?? ""} does not exist` };
  const root = realpathSync(rootIn);
  const g = gitState(root);
  if (!g.available) return { ok: false, outcome: "SCOPE_NOT_A_REPOSITORY", reason: "the repository root is not a git repository" };
  if (g.head === null) return { ok: false, outcome: "SCOPE_NO_COMMITS", reason: "the repository has no commit yet — there is nothing to compare with a target branch" };
  const base = resolveBase(root, opts.base);
  if ("error" in base) return { ok: false, outcome: base.error, reason: base.reason };
  const mb = git(root, ["merge-base", base.ref, "HEAD"])?.trim();
  if (!mb) return { ok: false, outcome: "SCOPE_NO_MERGE_BASE", reason: `the branch shares no history with ${base.branch}` };

  const baseTree = treeBlobs(root, mb);
  const headTree = treeBlobs(root, g.head);
  if (baseTree === null || headTree === null) return { ok: false, outcome: "SCOPE_GIT_FAILED", reason: "git ls-tree failed" };
  const committed = (git(root, ["-c", "core.quotepath=false", "diff", "--name-only", "--no-renames", "-z", mb, g.head]) ?? "").split("\0").filter(Boolean);
  const candidates = [...new Set([...committed, ...g.changed])].sort();

  // The working tree's content of every candidate that exists, hashed by git in one call.
  const present = candidates.filter((p) => {
    try {
      const st = lstatSync(join(root, p));
      return st.isFile() || st.isSymbolicLink();
    } catch {
      return false;
    }
  });
  const now = new Map<string, string>();
  for (let i = 0; i < present.length; i += 500) {
    const chunk = present.slice(i, i + 500);
    const out = git(root, ["hash-object", "--", ...chunk]);
    if (out === null) return { ok: false, outcome: "SCOPE_GIT_FAILED", reason: "git hash-object failed" };
    const ids = out.trim().split("\n");
    if (ids.length !== chunk.length) return { ok: false, outcome: "SCOPE_GIT_FAILED", reason: "git hash-object returned an unexpected number of ids" };
    chunk.forEach((p, j) => now.set(p, ids[j]));
  }

  const isDoc = opts.isDoc ?? (() => false);
  const files: ScopeEntry[] = [];
  for (const p of candidates) {
    const cur = now.get(p) ?? null;
    const was = baseTree.get(p) ?? null;
    if (cur === was) continue; // back to the merge base's content (or absent on both sides)
    const cls: FileClass = isOperational(p) ? "operational" : isWorkDocument(p) || isDoc(p) ? "docs" : "code";
    files.push({
      path: p,
      blob: cur ?? DELETED,
      base_blob: was,
      change: cur === null ? "deleted" : was === null ? "added" : "modified",
      class: cls,
      committed: (headTree.get(p) ?? null) === cur,
      head_blob: headTree.get(p) ?? null,
    });
  }
  const of = (c: FileClass) => files.filter((f) => f.class === c);
  return {
    ok: true,
    root,
    branch: g.branch,
    head: g.head,
    base,
    merge_base: mb,
    files,
    code_fingerprint: fingerprintEntries(of("code")),
    docs_fingerprint: fingerprintEntries(of("docs")),
  };
}

/** The code the branch's commits change — what a pull request opened now would contain — as `path → blob at HEAD`. */
export function committedCodeMap(scope: PrScope): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of scope.files) if (f.class === "code" && f.head_blob !== f.base_blob) out[f.path] = f.head_blob ?? DELETED;
  return out;
}

/** The scope's code files as a `path → blob` map. */
export function codeMap(scope: PrScope): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of scope.files) if (f.class === "code") out[f.path] = f.blob;
  return out;
}

/**
 * How the current scope differs from a recorded `path → blob` map: files added to the scope,
 * removed from it, and changed in content. Empty arrays mean the same implementation.
 */
export function diffMaps(recorded: Record<string, string>, current: Record<string, string>): { added: string[]; removed: string[]; changed: string[] } {
  const added = Object.keys(current).filter((p) => !(p in recorded)).sort();
  const removed = Object.keys(recorded).filter((p) => !(p in current)).sort();
  const changed = Object.keys(current).filter((p) => p in recorded && recorded[p] !== current[p]).sort();
  return { added, removed, changed };
}

/**
 * Which task each code file belongs to, from the tasks' recorded `filesChanged`. A file no
 * task claims is `unattributed` — reported, never silently dropped from the scope.
 */
export function attribute(codeFiles: string[], tasks: Record<string, { filesChanged?: string[] }>): { byTask: Record<string, string[]>; unattributed: string[] } {
  const byTask: Record<string, string[]> = {};
  const claimed = new Set<string>();
  for (const [id, t] of Object.entries(tasks)) {
    const mine = codeFiles.filter((f) => (t.filesChanged ?? []).includes(f));
    if (mine.length > 0) {
      byTask[id] = mine;
      mine.forEach((f) => claimed.add(f));
    }
  }
  return { byTask, unattributed: codeFiles.filter((f) => !claimed.has(f)) };
}

/* --------------------------------------------------------------------- CLI */

function main(): void {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(args[i]);
    if (m) flags[m[1]] = m[2] !== undefined ? m[2] : args[++i] ?? "";
  }
  writeStdout(JSON.stringify(prScope(flags.root ?? "", { base: flags.base || null }), null, 2) + "\n");
  process.exit(0);
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /pr-scope\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) main();
