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
 * Runtime: Node 22.18+ or 24+ (`node scripts/read-repo-knowledge.ts`; see scripts/node-preflight.mjs) or Bun. No
 * external deps, and it does NOT rely on CLAUDE_PLUGIN_ROOT or
 * CLAUDE_PROJECT_DIR.
 *
 * Node emits an ExperimentalWarning on stderr for direct .ts execution, so the
 * `--no-warnings` flag is part of the canonical invocation below — without it,
 * a caller that merges stderr into stdout (e.g. `2>&1`) would be handed
 * non-JSON, defeating the always-valid-JSON guarantee above.
 *
 * Stage B adds the consumer side of the generic surface and capability model
 * (producer 0.11.0): surfaces, shared code, surface-scoped conventions, capabilities and
 * first-degree capability relationships. They are reported as `extendedCategories`, apart
 * from the seven base categories, so an older manifest yields exactly the output it always
 * did. Queries resolve one surface, one capability and its DIRECT relationships, and the
 * surfaces/capabilities a set of paths falls under — by deterministic identity only, never
 * by similarity, and never beyond the first degree. Stale facts are re-checked against the
 * current source; the current source always wins.
 *
 * 0.7.5 (Inspector 0.11.2 Project Roots): the target root is the inspected Project Root,
 * which may sit below the Git root. Every path the manifest carries is relative to it, so
 * source drift is computed with `git diff --relative` (changes outside the project are not
 * its drift), `projectPrefix` reports where the project sits in the Git root, and `--path`
 * accepts a Git-root-relative path by stripping that prefix. At the Git root all of this is
 * a no-op. Callers resolve the Project Root with resolve-target-repo-root.ts (`knowledgeRoot`).
 *
 * Usage:
 *   node --no-warnings scripts/read-repo-knowledge.ts [target-root]   (default: CWD)
 *        [--surface <id>] [--capability <id-or-name>] [--path <repo-relative path>]... [--verify]
 */

import { readFileSync, existsSync, realpathSync, statSync, lstatSync } from "fs";
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { join, resolve, sep } from "path";
import { writeStdout } from "./write-output.ts";

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
  // Stage A: files that declare targets / surfaces / flavors / packaging — Xcode project
  // generators, Android app manifests, RN/Expo app config, Smart TV app descriptors.
  "project.yml", "Project.swift", "Workspace.swift", "AndroidManifest.xml",
  "app.json", "eas.json", "config.xml", "appinfo.json",
]);

function isAnalysisManifest(rel: string): boolean {
  const base = rel.split("/").pop() ?? rel;
  return (
    ANALYSIS_MANIFEST_BASENAMES.has(base) ||
    /\.csproj$/.test(base) ||
    /\.(xcscheme|xcconfig)$/.test(base) ||
    /^(app\.config|vite\.config|webpack\.config|next\.config)\.(js|cjs|mjs|ts)$/.test(base) ||
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
  /**
   * Stage B. Change-surface attribution over the FULL changed-file list, as the producer
   * computes it: the recorded surfaces, capabilities and relationships whose source roots or
   * evidence contain a changed file. A hint for verify-on-use, never a verdict.
   */
  affectedSurfaces: string[];
  affectedCapabilities: string[];
  affectedRelationships: string[];
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
  /**
   * 0.9.2. Routing freshness — separate from `sourceDrift` (general freshness, unchanged): whether
   * anything that can change which platform / device type the repository builds changed since
   * the knowledge was generated, committed or not. Read only by `singleRoutingTarget`.
   */
  routingFreshness: RoutingFreshness | null;
  /** Stage 4B. `/inspect` → Refresh Project Knowledge when source drift is possible; otherwise null. */
  refreshRecommendation: string | null;
  /** Categories the consumer MUST derive itself. */
  deriveLive: string[];
  /** The manifest, verbatim, when available. Never partially rewritten. */
  knowledge: Record<string, any> | null;
  /** Always true — a reminder that platformHints is never authoritative (contract obligation 8). */
  platformHintsAreAdvisory: true;
  /**
   * Stage B. The additive surface and capability categories, reported apart from the seven
   * base categories so an older manifest's output is unchanged. `trusted` | `verifyOnUse`
   * | `deriveLive`, with the reason.
   */
  extendedCategories: { surfaces: ExtendedCategory; capabilities: ExtendedCategory };
  /** Validated surfaces, or null when the category is derive-live. */
  surfaces: Surface[] | null;
  sharedCode: SharedCode[] | null;
  capabilities: Capability[] | null;
  /** Structurally valid first-degree relationships, or null when capabilities are derive-live. */
  capabilityRelationships: Relationship[] | null;
  /** Relationships rejected individually (unknown type, missing endpoint, no evidence) — derive live. */
  invalidRelationships: Array<{ id: string; reason: string }>;
  /** Always true — surfaces scope a confirmation, never replace it (contract obligation 9). */
  surfacesAreAdvisory: true;
  /**
   * 0.7.5. The target root's prefix inside the Git root (`""` at the Git root, `"YesTVOS/"` for
   * a nested project); null when it is not in a git repository. Every path the manifest and
   * this result carry is relative to the target root, not the Git root.
   */
  projectPrefix: string | null;
  /**
   * A2 (0.8.0). True only when the manifest is `absent` but the repository was inspected — its
   * AUDIT.md and .ono/state.json exist: an inspection that predates the manifest (inspector
   * < 0.10.0). `summary` then names the one-time fix, `/ono-project-inspector:inspect-sync`.
   * False for an uninspected repository, which is not broken and needs nothing.
   */
  inspectionWithoutManifest: boolean;
  /** One line for a command to show the developer. */
  summary: string;
}

export type ExtendedStatus = "trusted" | "verifyOnUse" | "deriveLive";
export interface ExtendedCategory {
  status: ExtendedStatus;
  reason: string;
}

export interface Surface {
  id: string;
  platform: string | null;
  formFactor: string | null;
  buildSelector: string | null;
  sourceRoots: string[];
  sharedWith: string[];
  packaging: string | null;
  minimumRuntime: string | null;
  evidence: string[];
}
export interface SharedCode {
  root: string;
  sharedBy: string[];
  mechanism: string | null;
  evidence: string[];
}
export interface NamedRef {
  name: string;
  anchor: string | null;
}
export interface Capability {
  id: string;
  name: string | null;
  anchor: string;
  surfaceScope: string;
  surfaces: string[];
  sourceRoots: Array<{ path: string; surface: string | null }>;
  entryPoints: string[];
  components: NamedRef[];
  services: string[];
  routes: string[];
  dataDependencies: NamedRef[];
  stateOwnership: string[];
  tests: string[];
  evidence: string[];
  relationships: string[];
}
export interface Relationship {
  id: string;
  from: string;
  type: string;
  to: string;
  evidenceKind: string;
  evidence: string[];
  anchor: string;
}

/** Contract v1's relationship vocabulary. Anything else is rejected, never guessed at. */
export const RELATIONSHIP_TYPES = [
  "depends_on", "used_by", "contains", "navigates_to", "shares_component_with",
  "shares_state_with", "reads_from", "writes_to", "covered_by", "related_to",
] as const;
export const EVIDENCE_KINDS = [
  "import", "navigation-route", "shared-component", "shared-state", "shared-service",
  "shared-data-source", "test", "repository-doc",
] as const;

const DERIVE_LIVE_UNAVAILABLE: ExtendedCategory = { status: "deriveLive", reason: "Repository knowledge is unavailable." };

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
    routingFreshness: null,
    refreshRecommendation: null,
    deriveLive: [...ALL_CATEGORIES],
    knowledge: null,
    platformHintsAreAdvisory: true,
    extendedCategories: { surfaces: DERIVE_LIVE_UNAVAILABLE, capabilities: DERIVE_LIVE_UNAVAILABLE },
    surfaces: null,
    sharedCode: null,
    capabilities: null,
    capabilityRelationships: null,
    invalidRelationships: [],
    surfacesAreAdvisory: true,
    projectPrefix: null,
    inspectionWithoutManifest: false,
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

/**
 * The output cap for git path listings — the same 64 MiB as the plugin's other git helpers
 * (scripts/task-resume.ts GIT_MAX_BUFFER), so a large repository's diff is read whole instead
 * of failing at the 1 MiB default.
 */
export const GIT_PATH_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Path-listing git commands (0.9.0, adapted from ono-project-inspector 0.13.0 — no runtime
 * dependency on it). Git C-quotes non-ASCII and special names in its default output
 * (`"docs/project/\327\241…md"`), and `core.quotePath=false` alone still quotes names containing
 * `"`, `\`, tabs or newlines. NUL-delimited output (`-z`) is never quoted, so each entry is the
 * exact path Git stores — the identity every later comparison uses. Nothing is trimmed and
 * nothing is split on newlines. Returns null when git fails: the caller treats that as unknown,
 * never as "no paths".
 */
export function gitPaths(targetRoot: string, args: string[]): string[] | null {
  try {
    const out = execFileSync("git", ["-c", "core.quotePath=false", ...args], {
      cwd: targetRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: GIT_PATH_MAX_BUFFER,
    });
    return out.split("\0").filter((p) => p.length > 0);
  } catch {
    return null;
  }
}

/**
 * Unicode-normalized form used ONLY to compare a Git path with a path recorded in the manifest
 * (a document may hold NFC where Git stores NFD — names created on macOS). Never an identity:
 * two Git paths that differ only in normalization stay two paths.
 */
export const comparablePath = (p: string): string => p.normalize("NFC");

/** `isUnder` on comparable forms — for attribution of an exact path to a recorded root. */
function under(rel: string, root: string): boolean {
  return isUnder(comparablePath(rel), comparablePath(root));
}

function currentHead(targetRoot: string): string | null {
  return git(targetRoot, ["rev-parse", "HEAD"]) || null;
}

/**
 * Stage 4B. Derives source drift since the knowledge-authoring HEAD exactly as the
 * producer's Stage 4A `detect` does: diff `knowledgeHead..HEAD`, ignore Inspector-owned
 * paths, and flag build/dependency manifests and top-level entries as analysis signals.
 */
function computeSourceDrift(targetRoot: string, knowledgeHead: string | null, head: string | null, model: KnowledgeModel = EMPTY_MODEL): SourceDrift {
  const base = {
    knowledgeHead, currentHead: head, changedSourceCount: 0, changedSourceFiles: [] as string[], analysisSignals: [] as string[],
    affectedSurfaces: [] as string[], affectedCapabilities: [] as string[], affectedRelationships: [] as string[],
  };
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

  // `--relative`: paths relative to the target root and limited to it, exactly like the
  // manifest's own paths (contract: every path is relative to the Project Root). A no-op for
  // a project at the Git root; for a nested project it keeps the Git root's other files out.
  // NUL-delimited and unquoted (gitPaths): Hebrew, accents, spaces, quotes, backslashes, tabs and
  // newlines arrive as the exact stored path. `--no-renames`: a rename lists both its old and its
  // new path, so a move out of (or into) a recorded root is attributed on both sides.
  const diff = gitPaths(targetRoot, ["diff", "-z", "--name-only", "--no-renames", "--relative", knowledgeHead, head]);
  if (diff === null) return unknown("git diff between knowledgeHead and HEAD failed.");
  const changed = Array.from(new Set(diff))
    .filter((rel) => !isInspectorOwned(comparablePath(rel)))
    .sort();
  if (changed.length === 0) {
    return { ...base, status: "COMPLETE", reason: "Only Inspector-owned artifacts changed since knowledge was generated." };
  }

  const topAt = (rev: string): Set<string> | null => {
    const names = gitPaths(targetRoot, ["ls-tree", "-z", "--name-only", rev]);
    return names === null ? null : new Set(names);
  };
  const topBefore = topAt(knowledgeHead);
  const topNow = topAt(head);
  // A listing that cannot be read is never "no top-level change".
  if (topBefore === null || topNow === null) return unknown("git ls-tree of knowledgeHead or HEAD failed.");
  const signals = new Set<string>();
  for (const rel of changed) {
    if (isAnalysisManifest(rel)) signals.add(`build/dependency manifest changed: ${rel}`);
    const top = rel.split("/")[0];
    if (!topBefore.has(top)) signals.add(`top-level entry added: ${top}`);
    else if (!topNow.has(top)) signals.add(`top-level entry removed: ${top}`);
  }
  const attribution = attribute(changed, model);
  for (const sig of attribution.surfaceSignals) signals.add(sig);

  return {
    ...base,
    status: "REFRESH_RECOMMENDED",
    reason: `${changed.length} source file(s) changed since knowledge was generated.`,
    changedSourceCount: changed.length,
    changedSourceFiles: changed.slice(0, MAX_LISTED_FILES),
    analysisSignals: Array.from(signals).sort(),
    affectedSurfaces: attribution.affectedSurfaces,
    affectedCapabilities: attribution.affectedCapabilities,
    affectedRelationships: attribution.affectedRelationships,
  };
}

/* ------------------------------------------------ 0.9.2: routing freshness (Phase A) */

/**
 * Routing freshness answers one narrow question for the single-target routing exception: did
 * anything that can change WHICH platform / device type this repository builds change since the
 * knowledge was generated? General freshness (`computeSourceDrift`) is unchanged and still
 * recommends a refresh for any source change; routing freshness only decides whether ordinary
 * source drift may leave otherwise reliable single-target routing in place.
 *
 *   CLEAN            every changed path — committed since knowledgeHead, staged, unstaged or
 *                    untracked (deletions and both sides of a rename included) — is ordinary
 *                    source, resources or documentation.
 *   ROUTING_CHANGED  at least one changed path is routing-relevant (listed).
 *   UNKNOWN          the assessment could not be completed: no or unreachable knowledgeHead,
 *                    a git failure, not the repository root, an unsupported status record, an
 *                    unmerged path, or a build input it cannot resolve (an included build that
 *                    is not a plain path, or one outside the repository).
 *
 * Routing-relevant is the conservative default: a path is ordinary only when it is positively
 * recognised as source code, a resource, documentation or tooling state; every other path —
 * build and target configuration by name or location, and every unrecognised type — is
 * routing-relevant. Symlinks and submodules are always routing-relevant. Phase A classifies by
 * path and by the literal included builds of the settings scripts; it never evaluates a build.
 */
export type RoutingFreshnessStatus = "CLEAN" | "ROUTING_CHANGED" | "UNKNOWN";
export interface RoutingFreshness {
  status: RoutingFreshnessStatus;
  reason: string;
  /** Sorted; capped at 50 — routingChangeCount is the full count. Each entry is "path — why". */
  routingChanges: string[];
  routingChangeCount: number;
  /** How many changed paths were judged ordinary (counts only — never routing). */
  ordinaryChangeCount: number;
}

/** Build and target configuration, by file name — wherever it is in the repository. */
const ROUTING_CONFIG_BASENAMES = new Set([
  "settings.gradle", "settings.gradle.kts", "gradle.properties", "gradlew", "gradlew.bat", "AndroidManifest.xml",
  "Info.plist", "Podfile", "Podfile.lock", "Package.swift", "Package.resolved", "project.yml", "Project.swift", "Workspace.swift", "Tuist.swift", "Cartfile",
  "package.json", "app.json", "eas.json", "react-native.config.js", "react-native.config.ts", "config.xml", "appinfo.json", "tizen-manifest.xml",
]);
/** Build and target configuration, by type or by location. */
const ROUTING_CONFIG_PATTERNS: RegExp[] = [
  /\.gradle$/, /\.kts$/, /\.properties$/, /\.toml$/, /\.groovy$/,
  /\.xcconfig$/, /\.xcscheme$/, /\.pbxproj$/, /\.entitlements$/, /\.xctestplan$/,
  /(^|\/)(app|metro|babel|vite|webpack|next)\.config\.[cm]?[jt]s$/,
  /(^|\/)buildSrc\//, /(^|\/)build-logic\//, /(^|\/)gradle\//, /\.xcodeproj\//, /\.xcworkspace\//, /(^|\/)Tuist\//,
];
/** Positively ordinary: source code, resources, documentation — by extension. */
const ORDINARY_EXTENSIONS = new Set([
  "kt", "java", "scala", "swift", "m", "mm", "h", "hh", "hpp", "c", "cc", "cpp", "cxx",
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "svelte", "css", "scss", "sass", "less", "html", "htm",
  "md", "mdx", "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "ttf", "otf", "woff", "woff2",
  "mp3", "mp4", "m4a", "wav", "ogg", "mov", "webm", "xib", "storyboard", "strings", "stringsdict", "snap",
]);
/** Positively ordinary by location: documentation and workflow output, Android resources, asset catalogs, tooling state. */
const ORDINARY_LOCATIONS: RegExp[] = [
  /^docs\//, /(^|\/)res\//, /\.xcassets\//, /\.lproj\//, /(^|\/)__snapshots__\//, /^\.claude\//, /^\.idea\//, /^\.vscode\//, /(^|\/)\.DS_Store$/,
];

/** Why a changed path can change routing, or null when it is ordinary. Inspector-owned paths are the artifact check's, never routing's. */
export function routingRelevance(rel: string, includedBuilds: string[] = [], buildInputs: string[] = []): string | null {
  const p = comparablePath(rel);
  const base = p.split("/").pop() ?? p;
  if (ROUTING_CONFIG_BASENAMES.has(base)) return "build or target configuration";
  if (buildInputs.some((input) => comparablePath(input) === p)) return "read or applied by a build script";
  if (ROUTING_CONFIG_PATTERNS.some((re) => re.test(p))) return "build or target configuration";
  if (includedBuilds.some((root) => isUnder(p, comparablePath(root)))) return "inside an included build";
  if (ORDINARY_LOCATIONS.some((re) => re.test(p))) return null;
  const dot = base.lastIndexOf(".");
  if (dot > 0 && ORDINARY_EXTENSIONS.has(base.slice(dot + 1).toLowerCase())) return null;
  return "not a recognised source, resource or documentation file";
}

/** The literal included builds of a Gradle settings script; null when one cannot be resolved statically. */
export function includedBuildsOf(settingsRel: string, text: string): string[] | null {
  const dir = settingsRel.includes("/") ? settingsRel.slice(0, settingsRel.lastIndexOf("/")) : "";
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const all = code.match(/\bincludeBuild\b/g) ?? [];
  const literal = [...code.matchAll(/\bincludeBuild\s*\(?\s*(["'])([^"'$\\]+)\1/g)].map((m) => m[2]);
  if (literal.length !== all.length) return null;
  const out: string[] = [];
  for (const raw of literal) {
    const parts: string[] = [];
    for (const seg of `${dir}/${raw}`.split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") {
        if (parts.length === 0) return null; // outside the repository: its changes are not visible here
        parts.pop();
      } else parts.push(seg);
    }
    if (parts.length === 0) return null; // the repository itself as an included build: nothing would be ordinary
    out.push(`${parts.join("/")}/`);
  }
  return out;
}

/**
 * The build inputs a build script names explicitly (0.9.2): the scripts it applies and the
 * files it reads. Bounded on purpose — a fixed set of reference forms, never an evaluation:
 *
 *   Gradle  `apply from: …` / `apply(from = …)`, and `file(…)`, `files(…)`, `rootProject.file(…)`,
 *           `project.file(…)`, `File(…)` (one argument, or `rootDir` / `projectDir` and a literal)
 *   Xcode   `#include "…"` / `#include? "…"` in an .xcconfig
 *
 * A literal path inside the repository becomes a routing-relevant input (whatever its file
 * type). A reference the scan finds but cannot resolve — an interpolated or computed path, an
 * environment value, a URL, an absolute path or one outside the repository — returns
 * `{ unresolved }`: the assessment is UNKNOWN and the developer confirms.
 *
 * Two narrow exemptions, both pure data, never build structure: a signing keystore
 * (`storeFile …`) and a path under the build output directory (`$buildDir`, `layout.buildDirectory`).
 */
export function buildReferencesOf(scriptRel: string, text: string, gradleRootDir: string): { paths: string[] } | { unresolved: string } {
  const scriptDir = scriptRel.includes("/") ? scriptRel.slice(0, scriptRel.lastIndexOf("/")) : "";
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const paths: string[] = [];
  const LITERAL = /^(["'])([^"'$\\]*?(?:\$\{?(?:rootDir|projectDir|rootProject\.rootDir|project\.rootDir|project\.projectDir)\}?)?[^"'$\\]*)\1$/;
  const resolveArg = (arg: string, base: string): string | null | "skip" => {
    const a = arg.trim();
    if (/^["']?\$\{?(buildDir|project\.buildDir)\b|layout\.buildDirectory/.test(a)) return "skip";
    const lit = LITERAL.exec(a);
    if (!lit) return null;
    let p = lit[2];
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return null; // a URL
    let root = base;
    const m = /^\$\{?(rootDir|projectDir|rootProject\.rootDir|project\.rootDir|project\.projectDir)\}?\/?(.*)$/.exec(p);
    if (m) {
      root = /projectDir/.test(m[1]) ? scriptDir : gradleRootDir;
      p = m[2];
    } else if (p.includes("$")) return null;
    if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return null; // absolute: outside what this repository can show
    const parts: string[] = [];
    for (const seg of `${root}/${p}`.split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") {
        if (parts.length === 0) return null; // outside the repository
        parts.pop();
      } else parts.push(seg);
    }
    return parts.join("/");
  };
  const add = (r: string | null | "skip", what: string): string | null => {
    if (r === "skip" || r === "") return null; // "" is the repository root: a location, not an input
    if (r === null) return `${scriptRel}: ${what} that cannot be resolved to a path inside the repository`;
    paths.push(r);
    return null;
  };
  if (/\.xcconfig$/.test(scriptRel)) {
    for (const m of text.matchAll(/^\s*#include\??\s+(.+?)\s*$/gm)) {
      const bad = add(resolveArg(m[1], scriptDir), `#include ${m[1]}`);
      if (bad) return { unresolved: bad };
    }
    return { paths };
  }
  // apply from — Groovy `apply from: X` and Kotlin `apply(from = X)`.
  for (const m of code.matchAll(/\bapply\s*\(?\s*from\s*[:=]\s*([^,)\n]+)/g)) {
    let arg = m[1].trim();
    const fileCall = /^(?:rootProject\.|project\.)?file\s*\(\s*(.+?)\s*\)?$/.exec(arg);
    const base = /^rootProject\./.test(arg) ? gradleRootDir : scriptDir;
    if (fileCall) arg = fileCall[1];
    const bad = add(resolveArg(arg, base), `apply from ${m[1].trim()}`);
    if (bad) return { unresolved: bad };
  }
  // Files the script reads.
  for (const line of code.split(/\r?\n/)) { // script text (CRLF too), never a path listing
    if (/\bstoreFile\b/.test(line)) continue; // a signing keystore: data, never build structure
    for (const m of line.matchAll(/\b(rootProject\.file|project\.file|files?|File)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
      const fn = m[1], argsText = m[2].trim();
      if (argsText === "") continue;
      const args = argsText.split(",").map((s) => s.trim());
      let r: string | null | "skip";
      if (fn === "File" && args.length === 2) {
        const base = /^(rootDir|rootProject\.rootDir|project\.rootDir)$/.test(args[0]) ? gradleRootDir : /^(projectDir|project\.projectDir)$/.test(args[0]) ? scriptDir : null;
        r = base === null ? (/buildDir|buildDirectory/.test(args[0]) ? "skip" : null) : resolveArg(args[1], base);
      } else if (fn === "files") {
        for (const a of args) {
          const bad = add(resolveArg(a, scriptDir), `files(${argsText})`);
          if (bad) return { unresolved: bad };
        }
        continue;
      } else if (args.length === 1) {
        r = resolveArg(args[0], fn === "rootProject.file" ? gradleRootDir : scriptDir);
      } else r = null;
      const bad = add(r, `${fn}(${argsText})`);
      if (bad) return { unresolved: bad };
    }
  }
  return { paths: [...new Set(paths)] };
}

export function computeRoutingFreshness(targetRoot: string, knowledgeHead: string | null, head: string | null, model: KnowledgeModel = EMPTY_MODEL): RoutingFreshness {
  const unknown = (reason: string): RoutingFreshness => ({ status: "UNKNOWN", reason, routingChanges: [], routingChangeCount: 0, ordinaryChangeCount: 0 });
  if (!knowledgeHead) return unknown("no knowledge-authoring HEAD is recorded");
  if (!head) return unknown("the current git HEAD cannot be determined");
  if (git(targetRoot, ["cat-file", "-e", `${knowledgeHead}^{commit}`]) === null) return unknown(`knowledgeHead ${knowledgeHead.slice(0, 12)} is not in this repository's history (rewritten or shallow)`);
  if (git(targetRoot, ["rev-parse", "--show-prefix"]) !== "") return unknown("the knowledge root is not the repository root");

  const changes: Array<{ path: string; why: string | null }> = [];
  // Committed since knowledgeHead — raw records carry the modes (symlinks, submodules).
  const raw = gitPaths(targetRoot, ["diff", "-z", "--raw", "--no-renames", "--no-abbrev", knowledgeHead, head]);
  if (raw === null) return unknown("git diff between knowledgeHead and HEAD failed");
  for (let i = 0; i < raw.length; i += 2) {
    const meta = raw[i], path = raw[i + 1];
    if (!meta?.startsWith(":") || path === undefined) return unknown("git diff returned a record this assessment cannot read");
    const [m1, m2] = meta.slice(1).split(" ");
    const special = [m1, m2].includes("160000") ? "a submodule" : [m1, m2].includes("120000") ? "a symbolic link" : null;
    changes.push({ path, why: special });
  }
  // Staged, unstaged and untracked — porcelain v2 (modes, submodules, both sides of a rename).
  const st = gitPaths(targetRoot, ["status", "--porcelain=v2", "-z", "--untracked-files=all", "--ignore-submodules=none"]);
  if (st === null) return unknown("git status failed");
  for (let i = 0; i < st.length; i++) {
    const rec = st[i];
    const kind = rec[0];
    if (kind === "?") {
      // An untracked record carries no mode: look at the path itself (a symbolic link can point anywhere).
      const path = rec.slice(2);
      let why: string | null = null;
      try {
        if (lstatSync(join(targetRoot, path)).isSymbolicLink()) why = "a symbolic link";
      } catch {
        why = "an untracked path that cannot be inspected";
      }
      changes.push({ path, why });
      continue;
    }
    if (kind === "u") return unknown(`an unmerged path (${rec.split(" ").slice(10).join(" ")}) — routing cannot be assessed mid-merge`);
    if (kind !== "1" && kind !== "2") return unknown(`git status returned a record this assessment cannot read (${JSON.stringify(rec.slice(0, 20))})`);
    const fields = rec.split(" ");
    const fixed = kind === "1" ? 8 : 9;
    if (fields.length <= fixed) return unknown("git status returned a record this assessment cannot read");
    const path = fields.slice(fixed).join(" ");
    const modes = fields.slice(3, 6);
    const special = fields[2].startsWith("S") || modes.includes("160000") ? "a submodule" : modes.includes("120000") ? "a symbolic link" : null;
    changes.push({ path, why: special });
    if (kind === "2") {
      const orig = st[++i];
      if (orig === undefined) return unknown("git status returned a rename without its original path");
      changes.push({ path: orig, why: special });
    }
  }

  // Included builds, before and now: their code is build logic, whatever its file type.
  const settings = new Set<string>();
  const scripts = new Set<string>(); // every Gradle script and .xcconfig, before and now
  const BUILD_SCRIPT = /(\.gradle|\.gradle\.kts|\.xcconfig)$/;
  for (const rev of [knowledgeHead, head]) {
    const files = gitPaths(targetRoot, ["ls-tree", "-r", "-z", "--name-only", rev]);
    if (files === null) return unknown("git ls-tree failed");
    for (const f of files) {
      if (/(^|\/)settings\.gradle(\.kts)?$/.test(f)) settings.add(`${rev}:${f}`);
      if (BUILD_SCRIPT.test(f)) scripts.add(f);
    }
  }
  for (const c of changes) {
    if (/(^|\/)settings\.gradle(\.kts)?$/.test(c.path)) settings.add(`WORKTREE:${c.path}`);
    if (BUILD_SCRIPT.test(c.path)) scripts.add(c.path);
  }
  const includedBuilds: string[] = [];
  for (const key of settings) {
    const at = key.indexOf(":");
    const rev = key.slice(0, at), rel = key.slice(at + 1);
    let text: string | null;
    if (rev === "WORKTREE") {
      const doc = readArtifact(targetRoot, rel);
      if (doc.state === "unreadable") return unknown(`${rel} cannot be read`);
      text = doc.state === "text" ? doc.text : null;
    } else {
      text = gitRaw(targetRoot, ["show", `${rev}:${rel}`]);
      if (text === null) return unknown(`${rel} at ${rev.slice(0, 12)} cannot be read`);
    }
    if (text === null) continue;
    const found = includedBuildsOf(rel, text);
    if (found === null) return unknown(`${rel} includes a build this assessment cannot resolve (not a plain path inside the repository)`);
    includedBuilds.push(...found);
  }

  // Inputs the build scripts name explicitly — before and now. A reference that cannot be
  // resolved to a path inside the repository makes the assessment UNKNOWN (never assumed fine).
  const settingsDirs = [...settings].map((k) => k.slice(k.indexOf(":") + 1)).map((f) => (f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ""));
  const gradleRootOf = (rel: string): string => {
    const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    return settingsDirs.filter((d) => d === "" || dir === d || dir.startsWith(`${d}/`)).sort((a, b) => b.length - a.length)[0] ?? "";
  };
  const buildInputs: string[] = [];
  for (const rel of scripts) {
    if (isInspectorOwned(comparablePath(rel))) continue;
    const texts: string[] = [];
    const doc = readArtifact(targetRoot, rel);
    if (doc.state === "unreadable") return unknown(`${rel} cannot be read`);
    if (doc.state === "text") texts.push(doc.text);
    if (git(targetRoot, ["cat-file", "-e", `${knowledgeHead}:${rel}`]) !== null) {
      const before = gitRaw(targetRoot, ["show", `${knowledgeHead}:${rel}`]);
      if (before === null) return unknown(`${rel} at ${knowledgeHead.slice(0, 12)} cannot be read`);
      texts.push(before);
    }
    for (const text of texts) {
      const refs = buildReferencesOf(rel, text, gradleRootOf(rel));
      if ("unresolved" in refs) return unknown(`a build input this assessment cannot resolve — ${refs.unresolved}`);
      for (const p of refs.paths) {
        let isDir = false;
        try {
          isDir = statSync(join(targetRoot, p)).isDirectory();
        } catch {
          /* absent now: still an input (a deleted one counts) */
        }
        if (!isDir) buildInputs.push(p); // a directory is a location, not an input: its files are judged one by one
      }
    }
  }

  // Top-level entries added or removed, committed or not.
  const top = (rev: string) => gitPaths(targetRoot, ["ls-tree", "-z", "--name-only", rev]);
  const topBefore = top(knowledgeHead), topNow = top(head);
  if (topBefore === null || topNow === null) return unknown("git ls-tree failed");
  const before = new Set(topBefore), now = new Set(topNow);

  const relevant = new Map<string, string>();
  let ordinary = 0;
  const seen = new Set<string>();
  for (const c of changes) {
    if (seen.has(c.path)) continue;
    seen.add(c.path);
    if (isInspectorOwned(comparablePath(c.path))) continue;
    const t = c.path.split("/")[0];
    const why =
      c.why ??
      (!before.has(t) || !now.has(t) || !existsSync(join(targetRoot, t)) ? "a top-level entry was added or removed" : null) ??
      routingRelevance(c.path, includedBuilds, buildInputs);
    if (why === null) ordinary++;
    else relevant.set(c.path, why);
  }
  // A surface's evidence that no longer exists: the surface itself may be gone.
  for (const ref of [...model.surfaces.flatMap((s) => s.evidence), ...model.sharedCode.flatMap((c) => c.evidence)]) {
    const p = parseEvidenceRef(ref).path;
    if (p && !existsSync(join(targetRoot, p))) relevant.set(p, "surface evidence no longer exists");
  }

  const list = [...relevant.entries()].map(([p, why]) => `${p} — ${why}`).sort();
  if (list.length > 0) {
    return { status: "ROUTING_CHANGED", reason: `${list.length} routing-relevant change(s) since the knowledge was generated (committed or not)`, routingChanges: list.slice(0, MAX_LISTED_FILES), routingChangeCount: list.length, ordinaryChangeCount: ordinary };
  }
  return { status: "CLEAN", reason: ordinary === 0 ? "nothing changed since the knowledge was generated" : `${ordinary} ordinary source change(s), none routing-relevant`, routingChanges: [], routingChangeCount: 0, ordinaryChangeCount: ordinary };
}

/** Git output kept byte-exact (no trimming), or null on failure — for reading a file at a revision. */
function gitRaw(targetRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-c", "core.quotePath=false", ...args], { cwd: targetRoot, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: GIT_PATH_MAX_BUFFER });
  } catch {
    return null;
  }
}

/* ------------------------------------------------ Stage B: the surface & capability model */

interface KnowledgeModel {
  surfaces: Surface[];
  sharedCode: SharedCode[];
  capabilities: Capability[];
  relationships: Relationship[];
}
const EMPTY_MODEL: KnowledgeModel = { surfaces: [], sharedCode: [], capabilities: [], relationships: [] };

/** The producer's `isUnder`, verbatim in behaviour: a root ending in `/` is a prefix. */
export function isUnder(rel: string, root: string): boolean {
  if (root.endsWith("/")) return rel.startsWith(root);
  return rel === root || rel.startsWith(`${root}/`);
}

/** An evidence ref is `path` or `path::token`. */
export function parseEvidenceRef(ref: string): { path: string; token: string | null } {
  const i = ref.indexOf("::");
  return i < 0 ? { path: ref.trim(), token: null } : { path: ref.slice(0, i).trim(), token: ref.slice(i + 2) };
}

/**
 * Stage B. Which recorded surfaces, capabilities and relationships a set of changed files
 * falls under — the producer's attribution, over the manifest's own data.
 */
function attribute(changed: string[], m: KnowledgeModel) {
  // Comparison only (NFC): each changed path keeps its exact Git identity in the output.
  const touches = (refs: string[]) => refs.some((ref) => changed.some((rel) => under(rel, parseEvidenceRef(ref).path)));
  const surfaceEvidence = [...m.surfaces.flatMap((s) => s.evidence), ...m.sharedCode.flatMap((c) => c.evidence)].map((r) => parseEvidenceRef(r).path);
  const surfaceSignals = changed.filter((rel) => surfaceEvidence.some((p) => under(rel, p))).map((rel) => `surface evidence changed: ${rel}`);
  const affectedSurfaces = new Set<string>();
  for (const s of m.surfaces) if (touches([...s.sourceRoots, ...s.evidence])) affectedSurfaces.add(s.id);
  for (const c of m.sharedCode) if (touches([c.root])) c.sharedBy.forEach((id) => affectedSurfaces.add(id));
  const affectedCapabilities = m.capabilities
    .filter((c) => touches(capabilityRefs(c)))
    .map((c) => c.id);
  const affectedRelationships = m.relationships.filter((r) => touches(r.evidence)).map((r) => r.id);
  return {
    surfaceSignals,
    affectedSurfaces: [...affectedSurfaces].sort(),
    affectedCapabilities: affectedCapabilities.sort(),
    affectedRelationships: affectedRelationships.sort(),
  };
}

function capabilityRefs(c: Capability): string[] {
  return [...c.sourceRoots.map((r) => r.path), ...c.entryPoints, ...c.services, ...c.routes, ...c.stateOwnership, ...c.tests, ...c.evidence];
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isStrOrNull = (v: unknown): boolean => v === null || typeof v === "string";
const strList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const namedList = (v: unknown): boolean =>
  Array.isArray(v) && v.every((x) => x && typeof x === "object" && isStr(x.name) && isStrOrNull(x.anchor));

function surfaceErrors(m: any): string[] {
  const errors: string[] = [];
  if (!Array.isArray(m.surfaces)) errors.push("surfaces is not an array");
  else m.surfaces.forEach((x: any, i: number) => {
    if (!x || typeof x !== "object" || !isStr(x.id)) return void errors.push(`surfaces[${i}].id is not a string`);
    for (const f of ["platform", "formFactor", "buildSelector", "packaging", "minimumRuntime"]) if (!isStrOrNull(x[f])) errors.push(`surfaces[${i}].${f}`);
    for (const f of ["sourceRoots", "sharedWith", "evidence"]) if (!strList(x[f])) errors.push(`surfaces[${i}].${f} is not a string list`);
  });
  if (m.sharedCode !== undefined) {
    if (!Array.isArray(m.sharedCode)) errors.push("sharedCode is not an array");
    else m.sharedCode.forEach((x: any, i: number) => {
      if (!x || typeof x !== "object" || !isStr(x.root) || !strList(x.sharedBy) || !strList(x.evidence) || !isStrOrNull(x.mechanism)) {
        errors.push(`sharedCode[${i}] is malformed`);
      }
    });
  }
  return errors;
}

function capabilityErrors(m: any): string[] {
  const errors: string[] = [];
  if (!Array.isArray(m.capabilities)) return ["capabilities is not an array"];
  m.capabilities.forEach((x: any, i: number) => {
    if (!x || typeof x !== "object" || !isStr(x.id) || !isStr(x.anchor) || !isStrOrNull(x.name)) return void errors.push(`capabilities[${i}] identity is malformed`);
    for (const f of ["surfaces", "entryPoints", "services", "routes", "stateOwnership", "tests", "evidence", "relationships"]) {
      if (!strList(x[f])) errors.push(`capabilities[${i}].${f} is not a string list`);
    }
    if (!Array.isArray(x.sourceRoots) || !x.sourceRoots.every((r: any) => r && isStr(r.path) && isStrOrNull(r.surface))) errors.push(`capabilities[${i}].sourceRoots`);
    for (const f of ["components", "dataDependencies"]) if (!namedList(x[f])) errors.push(`capabilities[${i}].${f}`);
  });
  if (m.capabilityRelationships !== undefined && !Array.isArray(m.capabilityRelationships)) errors.push("capabilityRelationships is not an array");
  return errors;
}

/** Each relationship is judged on its own: an invalid edge is rejected, never the whole map. */
function splitRelationships(raw: unknown[], capIds: Set<string>): { valid: Relationship[]; invalid: Array<{ id: string; reason: string }> } {
  const valid: Relationship[] = [];
  const invalid: Array<{ id: string; reason: string }> = [];
  raw.forEach((x: any, i: number) => {
    const id = x && isStr(x.id) ? x.id : `capabilityRelationships[${i}]`;
    const reason =
      !x || typeof x !== "object" || !isStr(x.from) || !isStr(x.to) || !isStr(x.type) || !isStr(x.anchor) ? "malformed" :
      !(RELATIONSHIP_TYPES as readonly string[]).includes(x.type) ? `unknown relationship type "${x.type}"` :
      !isStr(x.evidenceKind) || !(EVIDENCE_KINDS as readonly string[]).includes(x.evidenceKind) ? `unknown evidence kind "${x.evidenceKind}"` :
      !strList(x.evidence) || x.evidence.length === 0 ? "no evidence — a relationship must be proven by a concrete source edge" :
      !capIds.has(x.from) || !capIds.has(x.to) ? `endpoint not a recorded capability (${x.from} → ${x.to})` :
      null;
    if (reason === null) valid.push({ id, from: x.from, type: x.type, to: x.to, evidenceKind: x.evidenceKind, evidence: [...x.evidence], anchor: x.anchor });
    else invalid.push({ id, reason });
  });
  return { valid, invalid: invalid.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) };
}

/** The additive model as far as it validates. A malformed category contributes nothing. */
function extractModel(m: any): { model: KnowledgeModel; surfaceProblems: string[]; capabilityProblems: string[]; invalid: Array<{ id: string; reason: string }> } {
  const surfaceProblems = m.surfaces === undefined ? [] : surfaceErrors(m);
  const capabilityProblems = m.capabilities === undefined ? [] : capabilityErrors(m);
  const surfaces: Surface[] = m.surfaces !== undefined && surfaceProblems.length === 0 ? m.surfaces : [];
  const sharedCode: SharedCode[] = surfaces.length > 0 && Array.isArray(m.sharedCode) ? m.sharedCode : [];
  const capabilities: Capability[] = m.capabilities !== undefined && capabilityProblems.length === 0 ? m.capabilities : [];
  const split = capabilities.length > 0 && Array.isArray(m.capabilityRelationships)
    ? splitRelationships(m.capabilityRelationships, new Set(capabilities.map((c) => c.id)))
    : { valid: [], invalid: [] };
  return { model: { surfaces, sharedCode, capabilities, relationships: split.valid }, surfaceProblems, capabilityProblems, invalid: split.invalid };
}

function extendedCategory(
  field: "surfaces" | "capabilities",
  m: any,
  problems: string[],
  changedArtifacts: string[],
  drift: SourceDrift,
): ExtendedCategory {
  const backing = field === "surfaces" ? "CLAUDE.md" : "docs/project/capabilities.md";
  if (m[field] === undefined) {
    return { status: "deriveLive", reason: `${field} absent — the manifest was produced by an older producer (before 0.11.0); treated as coverage unknown.` };
  }
  const coverage = m.coverage?.[field];
  if (coverage !== "populated" && coverage !== "partial") return { status: "deriveLive", reason: `coverage.${field} is ${coverage ?? "absent"}.` };
  if (problems.length > 0) return { status: "deriveLive", reason: `${field} failed structural validation (${problems.join("; ")}).` };
  if (changedArtifacts.includes(backing)) {
    return { status: "deriveLive", reason: `${backing} changed since the manifest was written. Run /inspect-sync (or /inspect) to re-index it.` };
  }
  const drifted =
    field === "surfaces"
      ? drift.status === "BASELINE_UNKNOWN" || (drift.status === "REFRESH_RECOMMENDED" && drift.analysisSignals.length > 0)
      : drift.status !== "COMPLETE";
  if (drifted) {
    return {
      status: "verifyOnUse",
      reason: `Source changed since the knowledge was generated (${drift.reason}) — verify each ${field === "surfaces" ? "surface" : "capability and relationship"} used against the current source.`,
    };
  }
  return { status: "trusted", reason: `coverage.${field} is ${coverage}, and nothing it depends on has moved.` };
}

/** Stage 4B. The source-backed categories a drift verdict can have moved. */
function affectedCategories(drift: SourceDrift): string[] {
  if (drift.status === "BASELINE_UNKNOWN") return [...ANALYSIS_BACKED, ...DOCS_BACKED];
  if (drift.status === "COMPLETE") return [];
  return drift.analysisSignals.length > 0 ? [...ANALYSIS_BACKED, ...DOCS_BACKED] : [...DOCS_BACKED];
}

/* ---------------------------------------- 0.9.2: artifact hashes (contract § "Artifact hashes") */

/**
 * The `fingerprint.artifactHash` values this consumer understands (producer 0.14.0+). Absent
 * (`undefined`) is the legacy raw-text hash; anything else — another name, `null`, a number —
 * is an algorithm the contract does not define: no artifact matches (`stale-artifacts`), and it
 * is never read as legacy.
 */
export const SUPPORTED_ARTIFACT_HASHES = ["sha256-lf"] as const;

/** One artifact as the comparison sees it. A read failure is never taken to mean "absent". */
export type ArtifactText = { state: "absent" } | { state: "text"; text: string } | { state: "unreadable"; reason: string };

export function readArtifact(targetRoot: string, rel: string): ArtifactText {
  const p = join(targetRoot, rel);
  try {
    statSync(p);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR" ? { state: "absent" } : { state: "unreadable", reason: code ?? String(e) };
  }
  try {
    // The producer hashes the document read as UTF-8 text; so does the consumer — no other transformation.
    return { state: "text", text: readFileSync(p, "utf-8") };
  } catch (e) {
    return { state: "unreadable", reason: (e as NodeJS.ErrnoException).code ?? String(e) };
  }
}

const sha256Text = (text: string): string => createHash("sha256").update(text, "utf-8").digest("hex");
/** Every CRLF pair → LF. A lone CR, a BOM and the final newline are untouched. */
const toLf = (text: string): string => text.replace(/\r\n/g, "\n");
/** Every LF → CRLF (applied to LF-normalized text: the uniformly CRLF encoding). */
const toCrlf = (lfText: string): string => lfText.replace(/\n/g, "\r\n");

/**
 * Whether one recorded artifact hash matches the document now — the contract's rules exactly:
 *   1. `null` matches only an absent document; an absent document matches only `null`.
 *   2. `sha256-lf`: sha256(lf(text)).
 *   3. absent (legacy): sha256(text), sha256(lf(text)) or sha256(crlf(lf(text))).
 *   4. any other algorithm: nothing matches.
 * An unreadable document never matches.
 */
export function artifactMatches(recorded: unknown, doc: ArtifactText, algorithm: unknown): boolean {
  if (algorithm !== undefined && !(SUPPORTED_ARTIFACT_HASHES as readonly unknown[]).includes(algorithm)) return false;
  if (doc.state === "unreadable") return false;
  if (recorded === null) return doc.state === "absent";
  if (doc.state === "absent" || typeof recorded !== "string") return false;
  const lf = toLf(doc.text);
  if (algorithm === "sha256-lf") return recorded === sha256Text(lf);
  return recorded === sha256Text(doc.text) || recorded === sha256Text(lf) || recorded === sha256Text(toCrlf(lf));
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
  const result = readAt(targetRootInput);
  const abs = resolve(targetRootInput);
  if (result.reason !== "root-not-found" && result.reason !== "worktree" && existsSync(abs)) {
    result.projectPrefix = git(realpathSync(abs), ["rev-parse", "--show-prefix"]);
  }
  return result;
}

/** A path as the manifest records it: relative to the target root (see `projectPrefix`). */
export function toProjectRelative(path: string, projectPrefix: string | null): string {
  const p = path.trim().replace(/^\.\//, "");
  return projectPrefix && p.startsWith(projectPrefix) ? p.slice(projectPrefix.length) : p;
}

function readAt(targetRootInput: string): KnowledgeResult {
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
    // An inspection that predates the manifest: one /inspect-sync (by anyone with Bun, then a PR)
    // writes it from the already-approved artifacts. Nothing here writes or regenerates it.
    if (existsSync(join(targetRoot, "AUDIT.md")) && existsSync(join(targetRoot, ".ono", "state.json"))) {
      return {
        ...unavailable(
          "absent",
          "No repo-knowledge manifest. This inspection predates it. One `/ono-project-inspector:inspect-sync` by anyone with Bun (then a PR) makes every analysis faster for the whole team. Deriving repository context live for now."
        ),
        inspectionWithoutManifest: true,
      };
    }
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

  // 0.9.2: compared by the contract's "Artifact hashes" rules (fingerprint.artifactHash; absent = legacy).
  const artifactHash: unknown = parsed.fingerprint.artifactHash;
  const unsupportedHash = artifactHash !== undefined && !(SUPPORTED_ARTIFACT_HASHES as readonly unknown[]).includes(artifactHash);
  const changedArtifacts: string[] = [];
  for (const [rel, recordedHash] of Object.entries(parsed.fingerprint.artifacts as Record<string, unknown>)) {
    if (!artifactMatches(recordedHash, readArtifact(targetRoot, rel), artifactHash)) changedArtifacts.push(rel);
  }
  changedArtifacts.sort();

  let freshness: Freshness;
  let staleDetail: string | null = null;
  if (changedArtifacts.length > 0) {
    freshness = "stale-artifacts";
    staleDetail = unsupportedHash
      ? `fingerprint.artifactHash ${JSON.stringify(artifactHash)} is not an algorithm this plugin supports (${SUPPORTED_ARTIFACT_HASHES.join(", ")}, or absent for the legacy hash), so no indexed document can be verified: ${changedArtifacts.join(", ")}. Categories backed by these documents are derived live. Run /inspect-sync with a current Inspector to refresh.`
      : `Changed since the manifest was written: ${changedArtifacts.join(", ")}. Categories backed by these documents are derived live. Run /inspect-sync (or /inspect) to refresh.`;
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
  const extracted = extractModel(parsed);
  const sourceDrift = computeSourceDrift(targetRoot, parsed.fingerprint.knowledgeHead ?? null, head, extracted.model);
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

  const surfacesCategory = extendedCategory("surfaces", parsed, extracted.surfaceProblems, changedArtifacts, sourceDrift);
  const capabilitiesCategory = extendedCategory("capabilities", parsed, extracted.capabilityProblems, changedArtifacts, sourceDrift);
  const extendedNote = (["surfaces", "capabilities"] as const)
    .map((k) => `${k} ${({ trusted: "reusable", verifyOnUse: "verify on use", deriveLive: "derive live" } as const)[(k === "surfaces" ? surfacesCategory : capabilitiesCategory).status]}`)
    .join(", ");

  const summary =
    `Repository knowledge available (contract v${schemaVersion}, produced by ${parsed.producedBy.plugin} ${parsed.producedBy.version}, ${freshness}). ` +
    `Reusing: ${trustedCategories.length ? trustedCategories.join(", ") : "nothing"}. ` +
    (verifyOnUse.length ? `Verify on use (source changed since the knowledge was generated): ${verifyOnUse.join(", ")}. ` : "") +
    `Deriving live: ${deriveLive.length ? deriveLive.join(", ") : "nothing"}.` +
    // An older manifest carries neither — its summary stays exactly what it always was.
    (parsed.surfaces !== undefined || parsed.capabilities !== undefined ? ` Surfaces and capabilities: ${extendedNote}.` : "");

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
    routingFreshness: computeRoutingFreshness(targetRoot, parsed.fingerprint.knowledgeHead ?? null, head, extracted.model),
    refreshRecommendation: sourceDrift.status === "COMPLETE" ? null : REFRESH_RECOMMENDATION,
    deriveLive,
    knowledge: parsed,
    platformHintsAreAdvisory: true,
    extendedCategories: { surfaces: surfacesCategory, capabilities: capabilitiesCategory },
    surfaces: surfacesCategory.status === "deriveLive" ? null : extracted.model.surfaces,
    sharedCode: surfacesCategory.status === "deriveLive" ? null : extracted.model.sharedCode,
    capabilities: capabilitiesCategory.status === "deriveLive" ? null : extracted.model.capabilities,
    capabilityRelationships: capabilitiesCategory.status === "deriveLive" ? null : extracted.model.relationships,
    invalidRelationships: capabilitiesCategory.status === "deriveLive" ? [] : extracted.invalid,
    surfacesAreAdvisory: true,
    projectPrefix: null,
    inspectionWithoutManifest: false,
    summary,
  };
}

/* ------------------------------------------------ Stage B: queries over the model */

export interface RefCheck {
  ref: string;
  ok: boolean;
  reason: string;
}

export interface Verification {
  /** `trusted` — not re-checked (fresh knowledge). `verified` — every ref still resolves. */
  status: "trusted" | "verified" | "failed";
  checked: number;
  failed: RefCheck[];
}

/**
 * Re-check one evidence ref against the CURRENT source: the path must exist inside the
 * repository and outside Inspector-owned knowledge, and a `path::token` ref's literal token
 * must occur in that file. A ref that no longer resolves means the fact moved — the current
 * code wins.
 */
export function verifyEvidenceRef(targetRoot: string, ref: string): RefCheck {
  const { path, token } = parseEvidenceRef(ref);
  const rel = path.replace(/^\.\//, "");
  if (rel === "" || rel.startsWith("/") || rel.split("/").includes("..")) return { ref, ok: false, reason: "not a repository-relative path" };
  if (isInspectorOwned(rel)) return { ref, ok: false, reason: "points at Inspector-owned knowledge, not at repository source" };
  const abs = join(targetRoot, rel);
  if (!existsSync(abs)) return { ref, ok: false, reason: `${rel} no longer exists` };
  if (token === null) return { ref, ok: true, reason: "path exists" };
  let text: string;
  try {
    text = readFileSync(abs, "utf-8");
  } catch {
    return { ref, ok: false, reason: `${rel} is not a readable file` };
  }
  return text.includes(token) ? { ref, ok: true, reason: "token found" } : { ref, ok: false, reason: `"${token}" no longer occurs in ${rel}` };
}

function verifyRefs(targetRoot: string, refs: string[]): Verification {
  const unique = [...new Set(refs)].sort();
  const failed = unique.map((r) => verifyEvidenceRef(targetRoot, r)).filter((c) => !c.ok);
  return { status: failed.length === 0 ? "verified" : "failed", checked: unique.length, failed };
}

const TRUSTED: Verification = { status: "trusted", checked: 0, failed: [] };

const normPath = (p: string): string => p.trim().replace(/^\.\//, "");
const normName = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Where a base category stands in a result: reuse as-is, verify on use, or derive live. */
function baseStatus(r: KnowledgeResult, category: string): ExtendedStatus {
  return r.trustedCategories.includes(category) ? "trusted" : r.verifyOnUse.includes(category) ? "verifyOnUse" : "deriveLive";
}

/* ------------------------------------------- 0.9.0: the single-target routing exception */

/** Where the manifest lives, relative to the knowledge root — named here, by its only parser. */
export const MANIFEST_REL = ".ono/repo-knowledge.json";

/**
 * The exact surface `platform` texts that name a routing platform — compared case-insensitively
 * after trimming surrounding whitespace, nothing else: no substring, no fuzzy match, no reading
 * of free-form descriptions. `device` is the device type the text itself implies (null: the
 * surface's `formFactor` decides). Any other text — "React web", "Samsung Tizen (React)",
 * "Android (TV + phone)" — is not mappable, and the bug's routing is confirmed by the developer.
 */
export const SURFACE_PLATFORM_ALIASES: Readonly<Record<string, { platform: "android" | "ios" | "react-native"; device: "mobile" | "tv" | null }>> = {
  android: { platform: "android", device: null },
  "android tv": { platform: "android", device: "tv" },
  "android-tv": { platform: "android", device: "tv" },
  androidtv: { platform: "android", device: "tv" },
  "google tv": { platform: "android", device: "tv" },
  "google-tv": { platform: "android", device: "tv" },
  ios: { platform: "ios", device: "mobile" },
  ipados: { platform: "ios", device: "mobile" },
  iphone: { platform: "ios", device: "mobile" },
  ipad: { platform: "ios", device: "mobile" },
  tvos: { platform: "ios", device: "tv" },
  "apple tv": { platform: "ios", device: "tv" },
  "apple-tv": { platform: "ios", device: "tv" },
  appletv: { platform: "ios", device: "tv" },
  "react native": { platform: "react-native", device: "mobile" },
  "react-native": { platform: "react-native", device: "mobile" },
  expo: { platform: "react-native", device: "mobile" },
};

/**
 * `formFactor` → `device_type`, for this routing decision only. `formFactor` stays descriptive
 * everywhere else; `desktop`, `wearable`, `other` and null map to nothing.
 */
export const FORM_FACTOR_DEVICE: Readonly<Record<string, "mobile" | "tv">> = { handheld: "mobile", tv: "tv" };

/** The routing pairs this exception may produce — existing canonical values only. */
export const SINGLE_TARGET_PAIRS = ["android/mobile", "android/tv", "ios/mobile", "ios/tv", "react-native/mobile"] as const;

export type SingleTarget =
  | { status: "single"; platform: string; device_type: string; surfaces: string[]; knowledgeHead: string; mapping: Array<{ surface: string; platform: string | null; formFactor: string | null }> }
  | { status: "none"; reason: string };

/**
 * Whether validated Project Knowledge proves that the repository at this root supports exactly
 * one routing pair — the only way Project Knowledge takes part in routing (docs/repo-knowledge-
 * contract.md § The single-target routing exception). Deterministic: no AI, no heuristics, and
 * anything that cannot be established is `none` — never a guess. Production and staging surfaces
 * that map to the same pair are one candidate; surface ids are never read for meaning.
 */
export function singleRoutingTarget(r: KnowledgeResult): SingleTarget {
  const none = (reason: string): SingleTarget => ({ status: "none", reason });
  if (!r.available) return none(`Project Knowledge is unavailable (${r.reason ?? "unknown"})`);
  if (r.projectPrefix !== "") return none(r.projectPrefix === null ? "the knowledge root is not in a git repository" : `the knowledge belongs to the nested project ${r.projectPrefix}, not to the repository root`);
  const cat = r.extendedCategories.surfaces;
  // deriveLive (a changed CLAUDE.md, failed validation, no coverage) is never manifest evidence.
  if (cat.status === "deriveLive") return none(`the surfaces are derived live (${cat.reason})`);
  if (r.knowledge?.coverage?.surfaces !== "populated") return none(`coverage.surfaces is ${r.knowledge?.coverage?.surfaces ?? "absent"}, not populated — not every target is known to be declared`);
  // 0.9.2: routing freshness, not general freshness — ordinary source drift leaves routing in place.
  if (!r.sourceDrift || r.sourceDrift.status === "BASELINE_UNKNOWN") return none(`the source-drift baseline is unknown (${r.sourceDrift?.reason ?? "not computed"})`);
  const rf = r.routingFreshness;
  if (!rf || rf.status !== "CLEAN") {
    return none(rf?.status === "ROUTING_CHANGED"
      ? `routing-relevant changes since the knowledge was generated: ${rf.routingChanges.slice(0, 5).join("; ")}${rf.routingChangeCount > 5 ? ` (+${rf.routingChangeCount - 5} more)` : ""}`
      : `routing freshness cannot be established (${rf?.reason ?? "not computed"})`);
  }
  // Trusted surfaces; or verifyOnUse ONLY when non-routing drift alone made them so — the drift
  // is established (REFRESH_RECOMMENDED) and routing freshness found no routing-relevant change.
  const nonRoutingDriftOnly = cat.status === "verifyOnUse" && r.sourceDrift.status === "REFRESH_RECOMMENDED";
  if (cat.status !== "trusted" && !nonRoutingDriftOnly) return none(`the surfaces are not trusted (${cat.status}: ${cat.reason})`);
  const knowledgeHead = r.sourceDrift.knowledgeHead;
  if (!knowledgeHead) return none("no knowledge-authoring HEAD is recorded");
  if (r.invalidRelationships.length > 0) return none(`${r.invalidRelationships.length} capability relationship(s) failed validation`);
  const surfaces = r.surfaces ?? [];
  if (surfaces.length === 0) return none("the repository declares no surfaces");

  const mapping = surfaces.map((s) => ({ surface: s.id, platform: s.platform, formFactor: s.formFactor }));
  const pairs = new Map<string, string[]>();
  for (const s of surfaces) {
    const alias = s.platform === null ? undefined : SURFACE_PLATFORM_ALIASES[s.platform.trim().toLowerCase()];
    const device = s.formFactor === null ? undefined : FORM_FACTOR_DEVICE[s.formFactor];
    if (alias === undefined) return none(`surface ${s.id}: platform ${JSON.stringify(s.platform)} is not a recognised routing platform`);
    if (device === undefined) return none(`surface ${s.id}: formFactor ${JSON.stringify(s.formFactor)} maps to no device type`);
    if (alias.device !== null && alias.device !== device) return none(`surface ${s.id}: platform ${JSON.stringify(s.platform)} contradicts formFactor ${s.formFactor}`);
    const pair = `${alias.platform}/${device}`;
    if (!(SINGLE_TARGET_PAIRS as readonly string[]).includes(pair)) return none(`surface ${s.id}: ${pair} is not a pair this routing exception supports`);
    pairs.set(pair, [...(pairs.get(pair) ?? []), s.id]);
  }
  if (pairs.size !== 1) return none(`the surfaces map to ${pairs.size} routing pairs (${[...pairs.keys()].sort().join(", ")}) — the developer chooses`);
  const [pair, ids] = [...pairs.entries()][0];
  const [platform, device_type] = pair.split("/");

  // React Native: its native shells must provably be the same application — every surface
  // declares every other one as sharing its code, and one shared-code root is shared by all.
  if (platform === "react-native" && ids.length > 1) {
    const linked = surfaces.every((s) => ids.filter((o) => o !== s.id).every((o) => s.sharedWith.includes(o)));
    const shared = (r.sharedCode ?? []).some((c) => ids.every((id) => c.sharedBy.includes(id)));
    if (!linked || !shared) return none("the React Native surfaces are not proven to be one application (sharedWith and one shared-code root shared by every surface)");
  }
  return { status: "single", platform, device_type, surfaces: [...ids].sort(), knowledgeHead, mapping };
}

/**
 * One surface's context — to scope a feature AFTER the human confirmed its platform and
 * device type. Never an input to routing: `formFactor` is not a `device_type`.
 */
export function querySurface(r: KnowledgeResult, targetRoot: string, surfaceId: string, opts: { verify?: boolean } = {}): Record<string, any> {
  const cat = r.extendedCategories.surfaces;
  if (!r.available || cat.status === "deriveLive" || r.surfaces === null) return { status: "derive-live", reason: cat.reason };
  const surface = r.surfaces.find((x) => x.id === surfaceId);
  if (surface === undefined) return { status: "not-found", surfaceId, declared: r.surfaces.map((x) => x.id) };
  const sharedCode = (r.sharedCode ?? []).filter((c) => c.sharedBy.includes(surfaceId));
  const conventionsDoc = r.knowledge?.documents?.conventions ?? null;
  const rawOverrides = conventionsDoc?.surfaceAnchors?.[surfaceId];
  const overrides: Array<{ section: string; anchor: string }> = Array.isArray(rawOverrides)
    ? rawOverrides.filter((o: any) => o && isStr(o.section) && isStr(o.anchor)).map((o: any) => ({ section: o.section, anchor: o.anchor }))
    : [];
  const verify = cat.status === "verifyOnUse" || opts.verify === true;
  return {
    status: "found",
    category: cat.status,
    surface,
    sharedCode,
    conventions: {
      path: conventionsDoc?.path ?? null,
      category: baseStatus(r, "conventions"),
      overrides,
      note: overrides.length > 0
        ? "Read each shared section, then this surface's override for it; a section with no override is inherited."
        : "No overrides: this surface inherits every shared convention section.",
    },
    inventory: { path: r.knowledge?.documents?.inventory?.path ?? null, category: baseStatus(r, "inventory"), note: "Rows carry a Surface cell (`all` or surface ids)." },
    integrations: { path: r.knowledge?.documents?.integrations?.path ?? null, category: baseStatus(r, "integrations"), note: "Rows carry a Surface cell (`all` or surface ids)." },
    verification: verify
      ? verifyRefs(targetRoot, [...surface.evidence, ...surface.sourceRoots, ...sharedCode.flatMap((c) => [c.root, ...c.evidence])])
      : TRUSTED,
  };
}

/**
 * Locate a requested capability by deterministic identity only: its id, its exact name
 * (case and whitespace aside), or a path under one of its recorded source roots / an entry
 * point. Never by similarity: "video" does not find "Video Playback".
 */
export function lookupCapability(r: KnowledgeResult, q: { capability?: string; paths?: string[] }): Record<string, any> {
  const cat = r.extendedCategories.capabilities;
  if (!r.available || cat.status === "deriveLive" || r.capabilities === null) return { status: "derive-live", reason: cat.reason, matches: [] };
  const found = new Map<string, string>();
  const add = (id: string, by: string) => { if (!found.has(id)) found.set(id, by); };
  if (q.capability !== undefined && q.capability.trim() !== "") {
    const want = normName(q.capability);
    for (const c of r.capabilities) if (normName(c.id) === want) add(c.id, "id");
    for (const c of r.capabilities) if (c.name !== null && normName(c.name) === want) add(c.id, "name");
  }
  for (const raw of q.paths ?? []) {
    const p = normPath(raw);
    for (const c of r.capabilities) {
      if (c.sourceRoots.some((sr) => under(p, normPath(sr.path)))) add(c.id, "source-root");
      else if (c.entryPoints.some((e) => comparablePath(normPath(parseEvidenceRef(e).path)) === comparablePath(p))) add(c.id, "entry-point");
    }
  }
  const matches = [...found.entries()].map(([id, matchedBy]) => ({ id, matchedBy })).sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    status: matches.length === 0 ? "not-found" : matches.length === 1 ? "found" : "ambiguous",
    category: cat.status,
    matches,
    note: matches.length === 0
      ? "Not in the Feature & Capability Map by id, name or source root — discover the change surface live."
      : matches.length > 1 ? "More than one capability matches — the developer picks; nothing is chosen here." : null,
  };
}

/**
 * A capability and its DIRECT relationships — first degree only. A neighbour is summarised
 * by id, name and anchor, never with its own relationships: expanding the graph further is
 * the analysis's own decision, never this reader's. Stale evidence is re-checked; an edge
 * that no longer holds, or that was rejected structurally, is handed back for live
 * derivation instead of being presented as context.
 */
export function capabilityContext(r: KnowledgeResult, targetRoot: string, id: string, opts: { verify?: boolean } = {}): Record<string, any> {
  const cat = r.extendedCategories.capabilities;
  if (!r.available || cat.status === "deriveLive" || r.capabilities === null) return { status: "derive-live", reason: cat.reason };
  const caps = r.capabilities;
  const c = caps.find((x) => x.id === id);
  if (c === undefined) return { status: "not-found", id };
  const verify = cat.status === "verifyOnUse" || opts.verify === true;
  const summary = (otherId: string) => {
    const o = caps.find((x) => x.id === otherId);
    return { id: otherId, name: o?.name ?? null, anchor: o?.anchor ?? null };
  };
  const edges = (r.capabilityRelationships ?? []).filter((e) => e.from === id || e.to === id);
  const deriveLive = new Set<string>();
  const relationships = edges.map((e) => {
    const checked = verify ? verifyRefs(targetRoot, e.evidence) : TRUSTED;
    const verification = { ...checked, status: checked.status === "failed" ? "invalid" : checked.status };
    if (verification.status === "invalid") deriveLive.add(e.id);
    return {
      id: e.id,
      type: e.type,
      direction: e.from === id ? "outgoing" : "incoming",
      other: summary(e.from === id ? e.to : e.from),
      evidenceKind: e.evidenceKind,
      evidence: e.evidence,
      anchor: e.anchor,
      verification,
    };
  });
  const validIds = new Set(edges.map((e) => e.id));
  for (const rid of c.relationships) if (!validIds.has(rid)) deriveLive.add(rid);
  for (const bad of r.invalidRelationships) if (bad.id.split(":").includes(id) || c.relationships.includes(bad.id)) deriveLive.add(bad.id);
  const related = new Map<string, { id: string; name: string | null; anchor: string | null; via: string[] }>();
  for (const rel of relationships) {
    if (rel.verification.status === "invalid") continue;
    const entry = related.get(rel.other.id) ?? { ...rel.other, via: [] as string[] };
    entry.via.push(rel.id);
    related.set(rel.other.id, entry);
  }
  return {
    status: "found",
    category: cat.status,
    capability: c,
    verification: verify ? verifyRefs(targetRoot, capabilityRefs(c)) : TRUSTED,
    relationships,
    relatedCapabilities: [...related.values()].sort((a, b) => (a.id < b.id ? -1 : 1)),
    deriveLive: [...deriveLive].sort(),
    note: "First-degree context only — a relationship is not proof of impact, and never expands scope by itself.",
  };
}

/** The surfaces, shared-code root and capabilities each path falls under — e.g. the files a review covers. */
export function pathScope(r: KnowledgeResult, paths: string[]): Array<{ path: string; surfaces: string[]; sharedCode: string | null; capabilities: string[] }> {
  const surfacesOk = r.available && r.extendedCategories.surfaces.status !== "deriveLive";
  const capsOk = r.available && r.extendedCategories.capabilities.status !== "deriveLive";
  return paths.map((raw) => {
    const p = normPath(raw);
    const surfaces = new Set<string>();
    let sharedCode: string | null = null;
    if (surfacesOk) {
      for (const s of r.surfaces ?? []) if (s.sourceRoots.some((root) => under(p, normPath(root)))) surfaces.add(s.id);
      for (const sc of r.sharedCode ?? []) {
        if (under(p, normPath(sc.root))) {
          sharedCode = sc.root;
          sc.sharedBy.forEach((x) => surfaces.add(x));
        }
      }
    }
    const capabilities = capsOk ? (r.capabilities ?? []).filter((c) => c.sourceRoots.some((sr) => under(p, normPath(sr.path)))).map((c) => c.id).sort() : [];
    return { path: p, surfaces: [...surfaces].sort(), sharedCode, capabilities };
  });
}

function main(): void {
  const args = process.argv.slice(2);
  const flagValues = (name: string): string[] => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] !== undefined ? [args[i + 1]] : []));
  const valueFlags = new Set(["--surface", "--capability", "--path"]);
  const target = args.find((a, i) => !a.startsWith("--") && !valueFlags.has(args[i - 1] ?? "")) ?? process.cwd();
  const result: Record<string, any> = readRepoKnowledge(target);
  const surface = flagValues("surface")[0];
  const capability = flagValues("capability")[0];
  // A path may be given relative to the Git root (a changed file) or to the project; the
  // manifest's roots are project-relative, so strip the project prefix before matching.
  const paths = flagValues("path").map((p) => toProjectRelative(p, (result as KnowledgeResult).projectPrefix));
  const verify = args.includes("--verify");
  if (surface !== undefined || capability !== undefined || paths.length > 0) {
    const root = existsSync(resolve(target)) ? realpathSync(resolve(target)) : resolve(target);
    const query: Record<string, any> = {};
    if (surface !== undefined) query.surface = querySurface(result as KnowledgeResult, root, surface, { verify });
    if (capability !== undefined || paths.length > 0) {
      const lookup = lookupCapability(result as KnowledgeResult, { capability, paths });
      query.capability = { ...lookup, context: lookup.status === "found" ? capabilityContext(result as KnowledgeResult, root, lookup.matches[0].id, { verify }) : null };
    }
    if (paths.length > 0) query.paths = pathScope(result as KnowledgeResult, paths);
    result.query = query;
  }
  // Always exit 0 with valid JSON — see the header note.
  writeStdout(JSON.stringify(result, null, 2) + "\n");
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
