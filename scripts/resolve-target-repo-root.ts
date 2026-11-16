/**
 * resolve-target-repo-root.ts
 *
 * Deterministic helper that resolves the *real* target repository root for
 * `/implement-task` (and any other command that needs one authoritative repo
 * root), unwrapping Claude Code agent worktrees. It never writes anything.
 *
 * Why this exists: Claude Code may run an agent inside an isolated git worktree
 * at `<repo>/.claude/worktrees/agent-<id>/`. Inside that worktree, CWD and
 * `git rev-parse --show-toplevel` both point at the worktree — itself a
 * legitimate git root — not the developer's main working tree. Resolving
 * feature documents or writing code there silently strands the work in a
 * throwaway copy. This helper collapses that ambiguity to a single
 * authoritative absolute path, or fails loudly when it cannot.
 *
 * This is ono-mobile-dev-plugin's own self-contained copy. Its algorithm and
 * JSON/exit-code contract intentionally mirror the proven
 * `resolve-repo-root.ts` design from the sibling ono-project-inspector plugin;
 * it is duplicated here (not imported) so this plugin has no cross-plugin
 * runtime dependency.
 *
 * Runtime: runs under Node 22.18+ or 24+ (`node scripts/resolve-target-repo-root.ts`; see scripts/node-preflight.mjs)
 * or Bun (`bun scripts/resolve-target-repo-root.ts`). No external deps, and it
 * does NOT rely on CLAUDE_PLUGIN_ROOT or CLAUDE_PROJECT_DIR.
 *
 * Knowledge root (0.7.5, additive). The Ono Project Inspector (0.11.2+) writes its
 * knowledge — `.ono/repo-knowledge.json`, CLAUDE.md, docs/project/ — at the inspected
 * Project Root, which may sit below the Git root (`yestvos/YesTVOS/` inside `yestvos/`).
 * `targetRoot` stays the Git root: every Dev Plugin artifact, task state and Bug Flow
 * document keeps living there, unchanged. `knowledgeRoot` is resolved separately, only
 * for reading Project Knowledge, and never by guessing:
 *
 *   1. `--project <path>` (the developer named the project) → that directory, which must
 *      be inside the repository.
 *   2. Otherwise walk UP from the candidate to the Git root and take the nearest directory
 *      holding `.ono/repo-knowledge.json` — the candidate is inside that project.
 *   3. Otherwise, only when the candidate IS the Git root: look at its immediate
 *      subdirectories (one level, never deeper). If any holds a manifest, the developer
 *      chooses (`knowledgeDecision: "select-project"`) — never picked automatically, not
 *      even when there is only one.
 *   4. Otherwise the Git root — the pre-0.7.5 behaviour (the manifest may simply be absent).
 *
 * A worktree candidate keeps its subdirectory when it is unwrapped to the main tree. A
 * knowledge decision never changes `ok` or the exit code: `targetRoot` is valid either way.
 *
 * Usage:
 *   node scripts/resolve-target-repo-root.ts [candidate-path] [--project <path>]   (default: CWD)
 *
 * Stdout: a single JSON object (see ResolveResult).
 * Exit codes:
 *   0 - resolved a safe, non-worktree targetRoot (read targetRoot from stdout)
 *   1 - candidate path does not exist
 *   3 - resolution is ambiguous/unsafe (e.g. a Claude worktree that could not
 *       be unwrapped to a main working tree); callers MUST NOT proceed
 */

import { existsSync, readdirSync, realpathSync, statSync } from "fs";
import { execFileSync } from "child_process";
import { dirname, join, relative, resolve, sep } from "path";

const CLAUDE_WORKTREE_MARKER = `${sep}.claude${sep}worktrees${sep}`;

interface ResolveResult {
  candidate: string;
  targetRoot: string;
  isGit: boolean;
  isClaudeWorktree: boolean;
  unwrapped: boolean;
  mainWorktree: string | null;
  targetIsWorktree: boolean;
  ok: boolean;
  warning: string | null;
  /** Where Project Knowledge is read from; null while the developer must choose. */
  knowledgeRoot: string | null;
  /** knowledgeRoot relative to targetRoot ("" for the Git root itself); null when undecided. */
  projectPath: string | null;
  knowledgeSource: "explicit" | "nearest" | "git-root" | "decision-required";
  /** Set when the developer must choose; the plugin never picks one. */
  knowledgeDecision: "select-project" | null;
  /** The projects to offer, relative to targetRoot, sorted. Empty unless a decision is required. */
  knowledgeCandidates: string[];
}

export const MANIFEST_REL = join(".ono", "repo-knowledge.json");
/** Never treated as a project directory when scanning the Git root's children. */
const SKIP_CHILD_DIRS = new Set(["node_modules", "Pods", "build", "dist", "vendor", "DerivedData"]);

const hasManifest = (dir: string): boolean => existsSync(join(dir, MANIFEST_REL));
const isInside = (child: string, parent: string): boolean => {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep) && rel !== "..");
};

type Knowledge = Pick<ResolveResult, "knowledgeRoot" | "projectPath" | "knowledgeSource" | "knowledgeDecision" | "knowledgeCandidates">;

function resolveKnowledge(targetRoot: string, start: string, explicit: string | null): Knowledge | { error: string } {
  const at = (root: string, source: Knowledge["knowledgeSource"]): Knowledge => ({
    knowledgeRoot: root,
    projectPath: relative(targetRoot, root).split(sep).join("/"),
    knowledgeSource: source,
    knowledgeDecision: null,
    knowledgeCandidates: [],
  });
  if (explicit !== null) {
    const abs = resolve(explicit);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) return { error: `Project path not found or not a directory: ${abs}` };
    const real = realpathSync(abs);
    if (real.includes(CLAUDE_WORKTREE_MARKER)) return { error: "Project path is inside .claude/worktrees; name the project in the main working tree." };
    if (!isInside(real, targetRoot)) return { error: `Project path ${real} is outside the repository ${targetRoot}.` };
    return at(real, real === targetRoot ? "git-root" : "explicit");
  }
  // 2. Walk up from the candidate to the Git root; the nearest manifest wins.
  let dir = isInside(start, targetRoot) ? start : targetRoot;
  for (;;) {
    if (hasManifest(dir)) return at(dir, dir === targetRoot ? "git-root" : "nearest");
    if (dir === targetRoot) break;
    dir = dirname(dir);
  }
  // 3. Only at the Git root: one level of children, and the developer chooses.
  if (start === targetRoot) {
    let names: string[] = [];
    try {
      names = readdirSync(targetRoot);
    } catch {
      names = [];
    }
    const candidates = names
      .filter((n) => !n.startsWith(".") && !SKIP_CHILD_DIRS.has(n))
      .filter((n) => {
        try {
          return statSync(join(targetRoot, n)).isDirectory() && hasManifest(join(targetRoot, n));
        } catch {
          return false;
        }
      })
      .sort();
    if (candidates.length > 0) {
      return { knowledgeRoot: null, projectPath: null, knowledgeSource: "decision-required", knowledgeDecision: "select-project", knowledgeCandidates: candidates };
    }
  }
  // 4. The Git root, exactly as before.
  return at(targetRoot, "git-root");
}

function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** The first `worktree <path>` line of `git worktree list --porcelain` is always the main working tree. */
function mainWorktree(cwd: string): string | null {
  const out = git(["worktree", "list", "--porcelain"], cwd);
  if (!out) return null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) return line.slice("worktree ".length).trim();
  }
  return null;
}

export function resolveTargetRepoRoot(candidatePath: string, opts: { project?: string | null } = {}): ResolveResult {
  const candidateAbs = resolve(candidatePath);
  if (!existsSync(candidateAbs)) {
    // Signalled to callers via exit code 1 in main(); represented here so the
    // function stays pure for tests.
    throw new PathNotFoundError(candidateAbs);
  }
  const candidate = realpathSync(candidateAbs);

  const toplevel = git(["rev-parse", "--show-toplevel"], candidate);
  const isGit = toplevel !== null;
  const isClaudeWorktree = candidate.includes(CLAUDE_WORKTREE_MARKER);
  const main = isGit ? mainWorktree(candidate) : null;

  let targetRoot = toplevel ? realpathSync(toplevel) : candidate;
  let unwrapped = false;
  let warning: string | null = null;

  if (isClaudeWorktree) {
    if (main && existsSync(main) && !main.includes(CLAUDE_WORKTREE_MARKER)) {
      targetRoot = realpathSync(main);
      unwrapped = true;
    } else {
      warning =
        "Candidate is inside .claude/worktrees but the main working tree could not be resolved; refusing to treat the worktree as the target repository root.";
    }
  }

  const targetIsWorktree = targetRoot.includes(CLAUDE_WORKTREE_MARKER);

  // The candidate's place inside the repository, carried over to the main tree when a
  // worktree was unwrapped, so a nested project is still found from inside an agent worktree.
  let start = targetRoot;
  if (toplevel) {
    const rel = relative(realpathSync(toplevel), candidate);
    const mapped = rel === "" ? targetRoot : join(targetRoot, rel);
    if (!rel.startsWith("..") && existsSync(mapped)) start = realpathSync(mapped);
  }
  let knowledge: Knowledge = { knowledgeRoot: targetRoot, projectPath: "", knowledgeSource: "git-root", knowledgeDecision: null, knowledgeCandidates: [] };
  if (!targetIsWorktree && !warning) {
    const k = resolveKnowledge(targetRoot, start, opts.project ?? null);
    if ("error" in k) warning = k.error;
    else knowledge = k;
  }
  const ok = !targetIsWorktree && !warning;

  return {
    candidate,
    targetRoot,
    isGit,
    isClaudeWorktree,
    unwrapped,
    mainWorktree: main,
    targetIsWorktree,
    ok,
    warning,
    ...knowledge,
  };
}

export class PathNotFoundError extends Error {
  readonly path: string;
  constructor(path: string) {
    super(`Candidate path not found: ${path}`);
    this.name = "PathNotFoundError";
    this.path = path;
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const pi = args.indexOf("--project");
  const project = pi >= 0 ? args[pi + 1] ?? null : null;
  if (pi >= 0 && project === null) {
    console.error("--project needs a path");
    process.exit(1);
  }
  const candidateArg = args.find((a, i) => !a.startsWith("--") && (pi < 0 || i !== pi + 1)) ?? process.cwd();
  let result: ResolveResult;
  try {
    result = resolveTargetRepoRoot(candidateArg, { project });
  } catch (err) {
    if (err instanceof PathNotFoundError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 3);
}

// Only run the CLI when executed directly, so the test file can import the
// pure function without triggering process.exit.
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  /resolve-target-repo-root\.ts$/.test(realpathSync(process.argv[1]));

if (invokedDirectly) {
  main();
}
