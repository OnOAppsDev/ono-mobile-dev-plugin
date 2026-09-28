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

/**
 * Stage 4B. Paths the producer owns, exactly as docs/repo-knowledge-contract.md
 * § "Producer-side source drift" lists them (pinned by repo-knowledge-staleness.test.ts).
 * A change confined to these is the inspector's own bookkeeping, never source drift.
 */
export const INSPECTOR_OWNED_PATHS = [
  ".ono/**",
  "CLAUDE.md",
  "AUDIT.md",
  "CLAUDE.md.bak",
  "AUDIT.md.bak",
  "docs/project/**",
  "audits/**",
] as const;

function isInspectorOwned(rel: string): boolean {
  return INSPECTOR_OWNED_PATHS.some((p) => (p.endsWith("/**") ? rel.startsWith(p.slice(0, -2)) : rel === p));
}

/**
 * Stage 4B. Mirrors the producer's build/dependency/CI manifest signal (Stage 4A
 * `inspection-state.ts`): a change to one can move what CLAUDE.md records as stack
 * and commands, so the analysis-backed categories must be verified on use.
 */
const ANALYSIS_MANIFEST_BASENAMES = new Set([
  "package.json", "pnpm-workspace.yaml", "lerna.json", "nx.json", "turbo.json",
  "Podfile", "Package.swift", "Cartfile", "project.pbxproj",
  "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts",
  "pom.xml", "Cargo.toml", "go.mod", "pyproject.toml", "setup.py", "setup.cfg",
  "requirements.txt", "Pipfile", "Gemfile", "pubspec.yaml", "composer.json",
  "Makefile", "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
  ".gitlab-ci.yml", "Jenkinsfile",
]);

function isAnalysisManifest(rel: string): boolean {
  const base = rel.split("/").pop() ?? rel;
  return (
    ANALYSIS_MANIFEST_BASENAMES.has(base) ||
    /\.csproj$/.test(base) ||
    rel.startsWith(".github/workflows/") ||
    rel.startsWith(".circleci/")
  );
}

/** Source-backed categories, split by which inspection stage regenerates them. */
const ANALYSIS_BACKED = ["stack", "commands", "structure"];
const DOCS_BACKED = ["inventory", "conventions", "integrations"];

const MAX_LISTED_FILES = 50;

const REFRESH_RECOMMENDATION =
  "Run /inspect and choose Refresh Project Knowledge to regenerate source-backed knowledge.";

export type SourceDriftStatus = "COMPLETE" | "REFRESH_RECOMMENDED" | "BASELINE_UNKNOWN";

export interface SourceDrift {
  /** The producer's Stage 4A vocabulary, derived here the same way (it is never persisted). */
  status: SourceDriftStatus;
  knowledgeHead: string | null;
  currentHead: string | null;
  reason: string;
  changedSourceCount: number;
  /** Sorted; capped at 50 — changedSourceCount is the full count. */
  changedSourceFiles: string[];
  analysisSignals: string[];
}

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
  /** Categories the consumer may reuse — as-is (`trustedCategories`) or as a starting point (`verifyOnUse`). */
  usableCategories: string[];
  /** Stage 4B. Usable categories that are authoritative as-is. */
  trustedCategories: string[];
  /**
   * Stage 4B. Usable categories that source drift may have moved: reuse them as a starting
   * point only, verify each fact actually used against the current repository, and derive
   * it live when verification fails. Never authoritative as-is.
   */
  verifyOnUse: string[];
  /** Stage 4B. Source drift since `fingerprint.knowledgeHead`; null when knowledge is unavailable. */
  sourceDrift: SourceDrift | null;
  /** Stage 4B. `/inspect` → Refresh Project Knowledge when source drift is possible; otherwise null. */
  refreshRecommendation: string | null;
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
    trustedCategories: [],
    verifyOnUse: [],
    sourceDrift: null,
    refreshRecommendation: null,
    deriveLive: [...ALL_CATEGORIES],
    knowledge: null,
    platformHintsAreAdvisory: true,
    summary,
  };
}

function git(targetRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: targetRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function currentHead(targetRoot: string): string | null {
  return git(targetRoot, ["rev-parse", "HEAD"]) || null;
}

/**
 * Stage 4B. Derives source drift since the knowledge-authoring HEAD exactly as the
 * producer's Stage 4A `detect` does: diff `knowledgeHead..HEAD`, ignore Inspector-owned
 * paths, and flag build/dependency manifests and top-level entries as analysis signals.
 */
function computeSourceDrift(targetRoot: string, knowledgeHead: string | null, head: string | null): SourceDrift {
  const base = { knowledgeHead, currentHead: head, changedSourceCount: 0, changedSourceFiles: [] as string[], analysisSignals: [] as string[] };
  const unknown = (reason: string): SourceDrift => ({ ...base, status: "BASELINE_UNKNOWN", reason });

  if (!knowledgeHead) {
    return unknown("No knowledge-authoring HEAD recorded (fingerprint.knowledgeHead absent or null). Freshness of source-backed knowledge cannot be established.");
  }
  if (!head) return unknown("Current git HEAD cannot be determined.");
  if (git(targetRoot, ["cat-file", "-e", `${knowledgeHead}^{commit}`]) === null) {
    return unknown(`Recorded knowledgeHead ${knowledgeHead.slice(0, 12)} is not in this repository's history (rewritten or shallow).`);
  }
  if (knowledgeHead === head) {
    return { ...base, status: "COMPLETE", reason: "Knowledge was generated at the current HEAD." };
  }

  const diff = git(targetRoot, ["diff", "--name-only", "--no-renames", knowledgeHead, head]);
  if (diff === null) return unknown("git diff between knowledgeHead and HEAD failed.");
  const changed = Array.from(new Set(diff.split("\n").filter((l) => l.length > 0)))
    .filter((rel) => !isInspectorOwned(rel))
    .sort();
  if (changed.length === 0) {
    return { ...base, status: "COMPLETE", reason: "Only Inspector-owned artifacts changed since knowledge was generated." };
  }

  const topAt = (rev: string): Set<string> =>
    new Set((git(targetRoot, ["ls-tree", "--name-only", rev]) ?? "").split("\n").filter(Boolean));
  const topBefore = topAt(knowledgeHead);
  const topNow = topAt(head);
  const signals = new Set<string>();
  for (const rel of changed) {
    if (isAnalysisManifest(rel)) signals.add(`build/dependency manifest changed: ${rel}`);
    const top = rel.split("/")[0];
    if (!topBefore.has(top)) signals.add(`top-level entry added: ${top}`);
    else if (!topNow.has(top)) signals.add(`top-level entry removed: ${top}`);
  }

  return {
    ...base,
    status: "REFRESH_RECOMMENDED",
    reason: `${changed.length} source file(s) changed since knowledge was generated.`,
    changedSourceCount: changed.length,
    changedSourceFiles: changed.slice(0, MAX_LISTED_FILES),
    analysisSignals: Array.from(signals).sort(),
  };
}

/** Stage 4B. The source-backed categories a drift verdict can have moved. */
function affectedCategories(drift: SourceDrift): string[] {
  if (drift.status === "BASELINE_UNKNOWN") return [...ANALYSIS_BACKED, ...DOCS_BACKED];
  if (drift.status === "COMPLETE") return [];
  return drift.analysisSignals.length > 0 ? [...ANALYSIS_BACKED, ...DOCS_BACKED] : [...DOCS_BACKED];
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
  const kh = m.fingerprint?.knowledgeHead;
  if (kh !== undefined && kh !== null && typeof kh !== "string") errors.push("fingerprint.knowledgeHead must be a string or null");

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
    staleDetail = `HEAD moved since the manifest was written (recorded ${recordedHead.slice(0, 8)}, current ${head.slice(0, 8)}), but every indexed document is unchanged.`;
  } else {
    freshness = "fresh";
  }

  // --- Source drift since the knowledge was generated (Stage 4B) ---
  const sourceDrift = computeSourceDrift(targetRoot, parsed.fingerprint.knowledgeHead ?? null, head);
  const affected = affectedCategories(sourceDrift);
  if (sourceDrift.status !== "COMPLETE") {
    const drift =
      sourceDrift.status === "REFRESH_RECOMMENDED"
        ? `Source changed since the knowledge was generated (${sourceDrift.reason})`
        : `Source-backed knowledge freshness is unknown (${sourceDrift.reason})`;
    staleDetail = `${staleDetail ? `${staleDetail} ` : ""}${drift} Affected reused categories are verified on use against the current repository. ${REFRESH_RECOMMENDATION}`;
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

  const verifyOnUse = usableCategories.filter((c) => affected.includes(c));
  const trustedCategories = usableCategories.filter((c) => !affected.includes(c));

  const summary =
    `Repository knowledge available (contract v${schemaVersion}, produced by ${parsed.producedBy.plugin} ${parsed.producedBy.version}, ${freshness}). ` +
    `Reusing: ${trustedCategories.length ? trustedCategories.join(", ") : "nothing"}. ` +
    (verifyOnUse.length ? `Verify on use (source changed since the knowledge was generated): ${verifyOnUse.join(", ")}. ` : "") +
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
    trustedCategories,
    verifyOnUse,
    sourceDrift,
    refreshRecommendation: sourceDrift.status === "COMPLETE" ? null : REFRESH_RECOMMENDATION,
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
