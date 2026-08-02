/**
 * read-repo-knowledge.ts
 *
 * Deterministic reader for the repository-knowledge manifest at
 * `<target-root>/.ono/repo-knowledge.json`, produced by the sibling
 * ono-project-inspector plugin. See docs/repo-knowledge-contract.md for the
 * schema and the obligations this plugin accepts as a consumer.
 *
 * This is the ONLY component in this plugin that parses the manifest. Commands,
 * skills, and agents receive its normalized output via the
 * `repo-knowledge-consumer` skill and never read the file themselves — so the
 * contract lives in exactly one place and structured facts are never parsed by
 * an LLM.
 *
 * CRITICAL: this helper ALWAYS exits 0 and ALWAYS prints a valid JSON object,
 * including when the manifest is absent, malformed, or written by a newer
 * schema. A missing manifest is a normal state, not an error — that is what
 * keeps every command byte-for-byte backward compatible on a repository that
 * was never inspected. Callers branch on `available`, never on the exit code.
 *
 * Runtime: Node >= 23.6 (`node scripts/read-repo-knowledge.ts`) or Bun. No
 * external deps, and it does NOT rely on CLAUDE_PLUGIN_ROOT or
 * CLAUDE_PROJECT_DIR.
 *
 * Node emits an ExperimentalWarning on stderr for direct .ts execution, so the
 * `--no-warnings` flag is part of the canonical invocation below — without it,
 * a caller that merges stderr into stdout (e.g. `2>&1`) would be handed
 * non-JSON, defeating the always-valid-JSON guarantee above.
 *
 * Usage:
 *   node --no-warnings scripts/read-repo-knowledge.ts [target-root]   (default: CWD)
 */

import { readFileSync, existsSync, realpathSync } from "fs";
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { join, resolve, sep } from "path";

/** Highest contract version this plugin understands. A higher one is treated as absent. */
export const MAX_SUPPORTED_SCHEMA_VERSION = 1;

const CLAUDE_WORKTREE_MARKER = `${sep}.claude${sep}worktrees${sep}`;

/** Every category in contract v1, in a stable order. */
const ALL_CATEGORIES = [
  "stack",
  "commands",
  "structure",
  "inventory",
  "conventions",
  "integrations",
  "auditTopics",
] as const;

/** Which source document backs each category, for stale-artifact attribution. */
const CATEGORY_SOURCE: Record<string, string> = {
  stack: "CLAUDE.md",
  commands: "CLAUDE.md",
  structure: "CLAUDE.md",
  inventory: "docs/project/components.md",
  conventions: "docs/project/patterns.md",
  integrations: "docs/project/integrations.md",
  auditTopics: "AUDIT.md",
};

type Unavailable = "absent" | "unparseable" | "invalid" | "schema-too-new" | "worktree" | "root-not-found";
type Freshness = "fresh" | "stale-head" | "stale-artifacts" | "unknown";

export interface KnowledgeResult {
  available: boolean;
  reason: Unavailable | null;
  schemaVersion: number | null;
  producedBy: { plugin: string; version: string } | null;
  generatedAt: string | null;
  freshness: Freshness | null;
  staleDetail: string | null;
  /** Categories the consumer may trust as-is. */
  usableCategories: string[];
  /** Categories the consumer MUST derive itself. */
  deriveLive: string[];
  /** The manifest, verbatim, when available. Never partially rewritten. */
  knowledge: Record<string, any> | null;
  /** Always true — a reminder that platformHints is never authoritative (contract obligation 8). */
  platformHintsAreAdvisory: true;
  /** One line for a command to show the developer. */
  summary: string;
}

function unavailable(reason: Unavailable, summary: string, schemaVersion: number | null = null): KnowledgeResult {
  return {
    available: false,
    reason,
    schemaVersion,
    producedBy: null,
    generatedAt: null,
    freshness: null,
    staleDetail: null,
    usableCategories: [],
    deriveLive: [...ALL_CATEGORIES],
    knowledge: null,
    platformHintsAreAdvisory: true,
    summary,
  };
}

function currentHead(targetRoot: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: targetRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

function sha256OfFile(targetRoot: string, rel: string): string | null {
  const p = join(targetRoot, rel);
  if (!existsSync(p)) return null;
  return createHash("sha256").update(readFileSync(p, "utf-8"), "utf-8").digest("hex");
}

const VALID_COVERAGE_VALUES = new Set(["populated", "partial", "unknown"]);
const STACK_LIST_FIELDS = ["languages", "frameworks", "platformHints", "runtimeTooling", "packageManagers"] as const;
const COMMAND_FIELDS = ["install", "run", "test", "build"] as const;
const AUDIT_TOPIC_STRING_FIELDS = ["topic", "slug", "status", "file"] as const;

/**
 * Structural validation. Mirrors the producer's validateManifest but goes
 * further: it also guards every shape a downstream consumer will dereference
 * without a null check (e.g. `knowledge.stack.languages`), so a manifest that
 * is internally inconsistent (coverage claims a category is populated but the
 * category itself is missing or malformed) is rejected here rather than
 * crashing whichever command trusted `usableCategories`.
 */
function structuralErrors(m: any): string[] {
  const errors: string[] = [];
  if (!m || typeof m !== "object") return ["manifest is not an object"];
  if (!m.producedBy?.plugin) errors.push("producedBy.plugin missing");
  if (typeof m.generatedAt !== "string") errors.push("generatedAt missing");
  if (!m.fingerprint || typeof m.fingerprint.artifacts !== "object") errors.push("fingerprint.artifacts missing");

  if (!m.coverage || typeof m.coverage !== "object") {
    errors.push("coverage missing");
  } else {
    for (const [key, value] of Object.entries(m.coverage)) {
      if (!VALID_COVERAGE_VALUES.has(value as string)) {
        errors.push(`coverage.${key} is not one of populated|partial|unknown`);
      }
    }
  }

  if (!m.stack || typeof m.stack !== "object") {
    errors.push("stack missing or not an object");
  } else {
    for (const field of STACK_LIST_FIELDS) {
      if (!Array.isArray(m.stack[field])) errors.push(`stack.${field} is not an array`);
    }
  }

  if (!m.commands || typeof m.commands !== "object") {
    errors.push("commands missing or not an object");
  } else {
    for (const field of COMMAND_FIELDS) {
      const value = m.commands[field];
      if (value !== null && typeof value !== "string") errors.push(`commands.${field} is not a string or null`);
    }
  }

  if (!m.structure || typeof m.structure !== "object") errors.push("structure missing or not an object");

  if (!m.documents || typeof m.documents !== "object") {
    errors.push("documents missing");
  } else {
    for (const [key, doc] of Object.entries(m.documents as Record<string, any>)) {
      if (!doc || typeof doc !== "object") {
        errors.push(`documents.${key} is not an object`);
        continue;
      }
      if (typeof doc.path !== "string") errors.push(`documents.${key}.path is not a string`);
      if (typeof doc.exists !== "boolean") errors.push(`documents.${key}.exists is not a boolean`);
      if (!Array.isArray(doc.anchors)) errors.push(`documents.${key}.anchors is not an array`);
    }
  }

  if (!Array.isArray(m.auditTopics)) {
    errors.push("auditTopics is not an array");
  } else {
    m.auditTopics.forEach((entry: any, i: number) => {
      if (!entry || typeof entry !== "object") {
        errors.push(`auditTopics[${i}] is not an object`);
        return;
      }
      for (const field of AUDIT_TOPIC_STRING_FIELDS) {
        if (typeof entry[field] !== "string") errors.push(`auditTopics[${i}].${field} is not a string`);
      }
    });
  }

  return errors;
}

export function readRepoKnowledge(targetRootInput: string): KnowledgeResult {
  const targetRootAbs = resolve(targetRootInput);
  if (!existsSync(targetRootAbs)) {
    return unavailable("root-not-found", `Target root not found: ${targetRootAbs}. Deriving all repository knowledge live.`);
  }
  const targetRoot = realpathSync(targetRootAbs);

  // A manifest read from an ephemeral agent worktree would mislead every
  // consumer, so refuse it the same way the producer does.
  if (targetRoot.includes(CLAUDE_WORKTREE_MARKER)) {
    return unavailable(
      "worktree",
      "Target root is inside .claude/worktrees — refusing to read repository knowledge from an agent worktree. Deriving all repository knowledge live."
    );
  }

  const manifestRel = join(".ono", "repo-knowledge.json");
  const manifestPath = join(targetRoot, manifestRel);
  if (!existsSync(manifestPath)) {
    return unavailable(
      "absent",
      "Repository knowledge is not available (no .ono/repo-knowledge.json). Deriving all repository knowledge live — running /inspect with the Ono Project Inspector would let this plugin reuse approved knowledge instead."
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    return unavailable("unparseable", `.ono/repo-knowledge.json is not valid JSON (${(err as Error).message}). Deriving all repository knowledge live.`);
  }

  const schemaVersion = typeof parsed?.repoKnowledgeSchemaVersion === "number" ? parsed.repoKnowledgeSchemaVersion : null;
  if (schemaVersion === null) {
    return unavailable("invalid", ".ono/repo-knowledge.json has no repoKnowledgeSchemaVersion. Deriving all repository knowledge live.");
  }
  if (schemaVersion > MAX_SUPPORTED_SCHEMA_VERSION) {
    return unavailable(
      "schema-too-new",
      `.ono/repo-knowledge.json uses contract schema v${schemaVersion}; this plugin supports up to v${MAX_SUPPORTED_SCHEMA_VERSION}. Deriving all repository knowledge live — upgrade ono-mobile-dev-plugin to consume it.`,
      schemaVersion
    );
  }

  const errors = structuralErrors(parsed);
  if (errors.length) {
    return unavailable("invalid", `.ono/repo-knowledge.json failed structural validation (${errors.join("; ")}). Deriving all repository knowledge live.`, schemaVersion);
  }

  // --- Freshness ---
  const recordedHead: string | null = parsed.fingerprint.gitHead ?? null;
  const head = currentHead(targetRoot);

  const changedArtifacts: string[] = [];
  for (const [rel, recordedHash] of Object.entries(parsed.fingerprint.artifacts as Record<string, string | null>)) {
    if (sha256OfFile(targetRoot, rel) !== recordedHash) changedArtifacts.push(rel);
  }
  changedArtifacts.sort();

  let freshness: Freshness;
  let staleDetail: string | null = null;
  if (changedArtifacts.length > 0) {
    freshness = "stale-artifacts";
    staleDetail = `Changed since the manifest was written: ${changedArtifacts.join(", ")}. Categories backed by these documents are derived live. Run /inspect-sync (or /inspect) to refresh.`;
  } else if (recordedHead === null || head === null) {
    freshness = "unknown";
    staleDetail = "Freshness could not be established (no git HEAD recorded, or git unavailable). Using the manifest as-is.";
  } else if (recordedHead !== head) {
    freshness = "stale-head";
    staleDetail = `HEAD moved since the manifest was written (recorded ${recordedHead.slice(0, 8)}, current ${head.slice(0, 8)}), but every indexed document is unchanged. Using the manifest as-is.`;
  } else {
    freshness = "fresh";
  }

  // --- Usable vs derive-live, per contract obligations 5 and 6 ---
  const usableCategories: string[] = [];
  const deriveLive: string[] = [];
  for (const category of ALL_CATEGORIES) {
    const coverage = parsed.coverage?.[category];
    const source = CATEGORY_SOURCE[category];
    const sourceChanged = changedArtifacts.includes(source);
    if (coverage === "populated" || coverage === "partial") {
      if (sourceChanged) deriveLive.push(category);
      else usableCategories.push(category);
    } else {
      deriveLive.push(category);
    }
  }

  const summary =
    `Repository knowledge available (contract v${schemaVersion}, produced by ${parsed.producedBy.plugin} ${parsed.producedBy.version}, ${freshness}). ` +
    `Reusing: ${usableCategories.length ? usableCategories.join(", ") : "nothing"}. ` +
    `Deriving live: ${deriveLive.length ? deriveLive.join(", ") : "nothing"}.`;

  return {
    available: true,
    reason: null,
    schemaVersion,
    producedBy: parsed.producedBy,
    generatedAt: parsed.generatedAt,
    freshness,
    staleDetail,
    usableCategories,
    deriveLive,
    knowledge: parsed,
    platformHintsAreAdvisory: true,
    summary,
  };
}

function main(): void {
  const target = process.argv[2] ?? process.cwd();
  // Always exit 0 with valid JSON — see the header note.
  console.log(JSON.stringify(readRepoKnowledge(target), null, 2));
  process.exit(0);
}

// Only run the CLI when executed directly, so the test file can import the
// pure function without triggering process.exit.
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  /read-repo-knowledge\.ts$/.test(realpathSync(process.argv[1]));

if (invokedDirectly) {
  main();
}
