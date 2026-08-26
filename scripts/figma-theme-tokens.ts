/**
 * figma-theme-tokens.ts
 *
 * Deterministic policy engine behind `/rn-sync-figma-theme` and the
 * `rn-nativewind-theme-sync` skill. Same split this plugin uses everywhere
 * else (assess-dd-complexity.ts, read-repo-knowledge.ts,
 * migrate-planning-doc.ts): the skill OBSERVES (talks to the live `figma` MCP
 * tools, reads the repository, talks to the human), this script DECIDES.
 * Every classification rule, normalization rule, diff rule, and render rule
 * lives here as code, not as model judgment re-derived per run — that is what
 * makes two runs against the same inputs produce byte-identical output.
 *
 * Pipeline this file implements end to end:
 *
 *   Figma variable  ->  Token IR  ->  diff against existing  ->  approvals
 *                                                              ->  render
 *
 * Nothing here touches the filesystem or the network. The skill supplies
 * already-fetched Figma variable data and already-read file contents; this
 * file only computes. That is what makes it independently testable and what
 * lets a dry run execute the exact same code path as a real run, minus the
 * write.
 *
 * Runtime: Node >= 23.6 or Bun. No external deps, no filesystem access, no
 * network access, no clock, no randomness — the same input always produces
 * the same output.
 *
 * CLI usage (every subcommand always exits 0 and always prints one JSON
 * object; callers branch on `ok`/`status`, never on the exit code — the same
 * posture as assess-dd-complexity.ts and read-repo-knowledge.ts):
 *
 *   node scripts/figma-theme-tokens.ts detect-platform --files '<json>' --deps '<json>'
 *   node scripts/figma-theme-tokens.ts find-theme-modules --files '<json>' --tailwind-config '<string>'
 *   node scripts/figma-theme-tokens.ts build-ir --variables '<json>'
 *   node scripts/figma-theme-tokens.ts diff --ir '<json>' --existing '<json>'
 *   node scripts/figma-theme-tokens.ts apply-approvals --diff '<json>' --decisions '<json>'
 *   node scripts/figma-theme-tokens.ts render-json --existing '<json>' --updates '<json>'
 *   node scripts/figma-theme-tokens.ts render-block --entries '<json>'
 *   node scripts/figma-theme-tokens.ts verify --file-content '<string>' --entries '<json>'
 *   node scripts/figma-theme-tokens.ts report --state '<json>'
 */

// ---------------------------------------------------------------------------
// Section 1 — Token IR types
// ---------------------------------------------------------------------------

export type FigmaVariableType = "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";

export type TokenCategory =
  | "color"
  | "spacing"
  | "radius"
  | "opacity"
  | "fontSize"
  | "lineHeight"
  | "letterSpacing"
  | "fontWeight"
  | "fontFamily"
  | "unclassified";

export type Confidence = "high" | "medium" | "none";

/** Either a primitive leaf value, or a reference to another variable (an alias). */
export type RawVariableValue =
  | string
  | number
  | boolean
  | { r: number; g: number; b: number; a?: number }
  | { aliasId: string };

export interface RawFigmaVariable {
  id: string;
  /** Full Figma path, e.g. "Color/Primary/500". */
  name: string;
  /** Top-level Figma variable collection this variable belongs to, e.g. "Spacing". */
  collection: string;
  type: FigmaVariableType;
  /** One entry per mode this variable defines, e.g. { Light: "#fff", Dark: "#000" }. */
  modes: Record<string, RawVariableValue>;
}

export interface ClassificationResult {
  category: TokenCategory;
  confidence: Confidence;
  reason: string;
  /** Index into the `path` passed to classifyVariable of the segment that triggered the match, if any (e.g. "Weight" in ["Heading","Weight"]). */
  signalIndex?: number;
}

export interface AliasResolution {
  ok: boolean;
  /** Names walked through, root first, final primitive-holder last. Empty when not an alias. */
  chain: string[];
  value: RawVariableValue | null;
  error?: "cycle" | "missing-target" | "max-depth-exceeded";
}

export interface ColorNormalization {
  ok: boolean;
  /** Canonical "R G B" space-separated 0-255 integer triplet. */
  rgbTriplet?: string;
  /** Lowercase "#rrggbb". */
  hex?: string;
  /** 0-1, rounded to ALPHA_PRECISION decimals. */
  alpha?: number;
  reason?: string;
}

export interface FontWeightNormalization {
  ok: boolean;
  value?: number;
  raw: string | number;
  unknown: boolean;
}

export interface TokenIREntry {
  id: string;
  name: string;
  collection: string;
  path: string[];
  type: FigmaVariableType;
  mode: string;
  aliasChain: string[];
  category: TokenCategory;
  confidence: Confidence;
  reason: string;
  tokenPath: string;
  /** Canonical serialized value ready to write (string for colors/fontFamily, number otherwise). */
  value: string | number | null;
  raw: RawVariableValue;
  ok: boolean;
  error?: string;
}

export type DiffCase = "added" | "unchanged" | "overridden" | "collision" | "unresolved";

export interface DiffEntry {
  tokenPath: string;
  mode: string | null;
  case: DiffCase;
  incomingValue: string | number | null;
  existingValue: string | number | null;
  /** Populated only for case === "collision": every conflicting source name paired with its value — the choices a human picks between in applyApprovals. */
  collisionCandidates?: Array<{ source: string; value: string | number | null }>;
}

export interface DiffResult {
  added: DiffEntry[];
  unchanged: DiffEntry[];
  overridden: DiffEntry[];
  collisions: DiffEntry[];
  unresolved: DiffEntry[];
}

export type ApprovalDecision = "approve" | "skip";

export interface ApprovalDecisions {
  /** Approves every pending `overridden` entry. Never auto-resolves a `collision` — picking a winner between two Figma-side values always needs its own explicit decision, not a blanket rubber stamp. */
  approveAll?: boolean;
  /**
   * tokenPath (optionally "tokenPath@mode") -> decision.
   * For an `overridden` entry: "approve" | "skip".
   * For a `collision` entry: "skip", or the `source` name of the winning candidate (see `DiffEntry.collisionCandidates`).
   */
  decisions?: Record<string, string>;
}

export interface ApplyApprovalsResult {
  /** added entries plus overridden entries that were approved. */
  toWrite: DiffEntry[];
  skipped: DiffEntry[];
  /** true when an overridden entry has neither been approved nor explicitly skipped. */
  blocked: boolean;
  blockedEntries: DiffEntry[];
}

export type ExecutionStatus = "success" | "needs_confirmation" | "blocked" | "cancelled" | "failed";

export interface ExecutionResult {
  status: ExecutionStatus;
  platform: string | null;
  figmaScope: { file: string | null; page: string | null; node: string | null };
  counts: {
    read: number;
    added: number;
    unchanged: number;
    overridden: number;
    skipped: number;
    unclassified: number;
    collisions: number;
    unresolved: number;
  };
  filesChanged: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Section 2 — Platform gate (narrow, fast, testable pre-check)
//
// This intentionally does NOT reimplement repo-analyst's full platform
// detection (raw-signal checks + RN-native-shell linkage + monorepo scoping +
// human confirmation) — that stays the single source of truth for every other
// command. This is the narrower question /rn-sync-figma-theme actually asks:
// "does NativeWind apply here at all?" It reuses the same raw signals
// repo-analyst documents (agents/repo-analyst.md) so the two never disagree
// about what counts as a React Native marker.
// ---------------------------------------------------------------------------

export type PlatformSignal = "react-native" | "ios" | "android" | "react" | "ambiguous" | "none";

export interface PlatformDetectionInput {
  /** Repo-relative file/dir paths, forward-slash separated. */
  files: string[];
  /** package.json dependency + devDependency names, if package.json exists. */
  deps: string[];
}

const RN_DEPS = new Set(["react-native", "expo", "expo-router"]);
const RN_FILE_MARKERS = [/(^|\/)metro\.config\.[cm]?[jt]s$/, /(^|\/)app\.json$/, /(^|\/)app\.config\.[cjt]sx?$/];
const RN_DIR_MARKERS = [/(^|\/)ios(\/|$)/, /(^|\/)android(\/|$)/];

const IOS_FILE_MARKERS = [/\.xcodeproj(\/|$)/, /\.xcworkspace(\/|$)/, /(^|\/)Package\.swift$/, /(^|\/)Podfile$/];
const IOS_SOURCE_MARKERS = [/\.swift$/, /\.m$/, /\.mm$/];

const ANDROID_FILE_MARKERS = [/(^|\/)settings\.gradle(\.kts)?$/, /(^|\/)build\.gradle(\.kts)?$/, /(^|\/)AndroidManifest\.xml$/];
const ANDROID_SOURCE_MARKERS = [/\.kt$/, /\.java$/];

const WEB_BUNDLER_MARKERS = [/(^|\/)vite\.config\.[cmt]?[jt]s$/, /(^|\/)webpack\.config\.[cjt]s$/, /(^|\/)next\.config\.[cjm]?[jt]s$/];

function matchesAny(files: string[], patterns: RegExp[]): boolean {
  return files.some((f) => patterns.some((p) => p.test(f)));
}

/**
 * Narrow platform pre-check for the Figma-theme-sync gate. See the module
 * header for why this is deliberately not a re-derivation of repo-analyst.
 */
export function detectPlatformSignal(input: PlatformDetectionInput): PlatformSignal {
  const files = input.files ?? [];
  const deps = new Set(input.deps ?? []);

  const hasRnDep = [...deps].some((d) => RN_DEPS.has(d));
  const hasRnFileMarker = matchesAny(files, RN_FILE_MARKERS);
  const hasNativeDirs = matchesAny(files, RN_DIR_MARKERS);
  const isReactNative = hasRnDep || hasRnFileMarker || (hasNativeDirs && (deps.has("react") || hasRnDep));

  const hasIosFiles = matchesAny(files, IOS_FILE_MARKERS) || matchesAny(files, IOS_SOURCE_MARKERS);
  const hasAndroidFiles = matchesAny(files, ANDROID_FILE_MARKERS) || matchesAny(files, ANDROID_SOURCE_MARKERS);

  const hasReactWebDeps = deps.has("react") && deps.has("react-dom") && !hasRnDep;
  const hasWebBundler = matchesAny(files, WEB_BUNDLER_MARKERS) || deps.has("react-scripts");
  const isReactWeb = hasReactWebDeps && hasWebBundler;

  if (isReactNative) return "react-native";

  const nonRnHits = [hasIosFiles, hasAndroidFiles, isReactWeb].filter(Boolean).length;
  if (nonRnHits > 1) return "ambiguous";
  if (hasIosFiles) return "ios";
  if (hasAndroidFiles) return "android";
  if (isReactWeb) return "react";
  return "none";
}

// ---------------------------------------------------------------------------
// Section 3 — Canonical theme-source discovery
// ---------------------------------------------------------------------------

const LOCAL_MODULE_REF = /(?:require\(\s*|from\s+)['"](\.{1,2}\/[^'"]+|@\/[^'"]+)['"]\)?/g;

/** Extracts local (relative or `@/`-aliased) require()/import module specifiers from JS/TS source. */
export function extractLocalModuleReferences(source: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(LOCAL_MODULE_REF);
  while ((m = re.exec(source)) !== null) found.add(m[1]);
  return [...found];
}

const CANDIDATE_THEME_MODULE_NAMES = [
  /(^|\/)theme\.tsx?$/i,
  /(^|\/)tokens\.tsx?$/i,
  /(^|\/)design-?tokens\.[jt]sx?$/i,
  /(^|\/)constants\/theme(-tokens)?\.(tsx?|json)$/i,
  /(^|\/)tailwind\.preset\.[jt]s$/i,
  /(^|\/)theme-tokens\.json$/i,
];

/** Filters a repo-relative file list for filenames that commonly hold shared theme/tokens. */
export function findCandidateThemeModules(files: string[]): string[] {
  return files.filter((f) => CANDIDATE_THEME_MODULE_NAMES.some((p) => p.test(f)));
}

// ---------------------------------------------------------------------------
// Section 4 — Color normalization
//
// Supported input shapes: "#rgb"/"#rrggbb"/"#rgba"/"#rrggbbaa" hex strings,
// "rgb()"/"rgba()" CSS function strings, and Figma's own {r,g,b,a} object with
// 0-1 float channels. Anything else (named colors, hsl/hsla, lab/lch,
// gradients) is unsupported and never guessed at.
//
// Output: RGB channels rounded to the nearest integer (0-255); alpha rounded
// to ALPHA_PRECISION decimals, defaulting to 1 when absent. The canonical
// representation is a space-separated "R G B" triplet (matches the
// `rgb(var(--x) / <alpha-value>)` NativeWind v4 convention), plus a lowercase
// hex string for human-readable reports. Pure function of the input — same
// value in, same string out, every time.
// ---------------------------------------------------------------------------

const ALPHA_PRECISION = 2;

function roundAlpha(a: number): number {
  const factor = 10 ** ALPHA_PRECISION;
  return Math.round(a * factor) / factor;
}

function toHex2(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function fromHexPair(hex: string, i: number): number {
  return parseInt(hex.slice(i, i + 2), 16);
}

export function normalizeColor(input: unknown): ColorNormalization {
  if (input == null) return { ok: false, reason: "unsupported-color-space" };

  if (typeof input === "object" && "r" in (input as any) && "g" in (input as any) && "b" in (input as any)) {
    const { r, g, b, a } = input as { r: number; g: number; b: number; a?: number };
    if (![r, g, b].every((c) => typeof c === "number" && Number.isFinite(c) && c >= 0 && c <= 1)) {
      return { ok: false, reason: "unsupported-color-space" };
    }
    const alpha = a === undefined ? 1 : a;
    if (typeof alpha !== "number" || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
      return { ok: false, reason: "unsupported-color-space" };
    }
    const R = Math.round(r * 255);
    const G = Math.round(g * 255);
    const B = Math.round(b * 255);
    return { ok: true, rgbTriplet: `${R} ${G} ${B}`, hex: `#${toHex2(R)}${toHex2(G)}${toHex2(B)}`, alpha: roundAlpha(alpha) };
  }

  if (typeof input === "string") {
    const s = input.trim();

    const hexMatch = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(s);
    if (hexMatch) {
      let hex = hexMatch[1];
      if (hex.length === 3 || hex.length === 4) {
        hex = hex
          .split("")
          .map((c) => c + c)
          .join("");
      }
      const R = fromHexPair(hex, 0);
      const G = fromHexPair(hex, 2);
      const B = fromHexPair(hex, 4);
      const alpha = hex.length === 8 ? roundAlpha(fromHexPair(hex, 6) / 255) : 1;
      return { ok: true, rgbTriplet: `${R} ${G} ${B}`, hex: `#${toHex2(R)}${toHex2(G)}${toHex2(B)}`, alpha };
    }

    const rgbMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
    if (rgbMatch) {
      const R = Math.round(Number(rgbMatch[1]));
      const G = Math.round(Number(rgbMatch[2]));
      const B = Math.round(Number(rgbMatch[3]));
      const alpha = rgbMatch[4] === undefined ? 1 : roundAlpha(Number(rgbMatch[4]));
      if ([R, G, B].some((c) => !Number.isFinite(c) || c < 0 || c > 255)) return { ok: false, reason: "unsupported-color-space" };
      return { ok: true, rgbTriplet: `${R} ${G} ${B}`, hex: `#${toHex2(R)}${toHex2(G)}${toHex2(B)}`, alpha };
    }

    return { ok: false, reason: "unsupported-color-space" };
  }

  return { ok: false, reason: "unsupported-color-space" };
}

// ---------------------------------------------------------------------------
// Section 5 — Font-weight normalization
// ---------------------------------------------------------------------------

const FONT_WEIGHT_NAME_MAP: Record<string, number> = {
  thin: 100,
  extralight: 200,
  "extra-light": 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  medium: 500,
  semibold: 600,
  "semi-bold": 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  "extra-bold": 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

const VALID_NUMERIC_WEIGHTS = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900]);

export function normalizeFontWeight(raw: string | number): FontWeightNormalization {
  if (typeof raw === "number") {
    if (VALID_NUMERIC_WEIGHTS.has(raw)) return { ok: true, value: raw, raw, unknown: false };
    return { ok: false, raw, unknown: true };
  }
  const key = raw.trim().toLowerCase();
  if (/^\d+$/.test(key)) {
    const n = Number(key);
    if (VALID_NUMERIC_WEIGHTS.has(n)) return { ok: true, value: n, raw, unknown: false };
    return { ok: false, raw, unknown: true };
  }
  if (key in FONT_WEIGHT_NAME_MAP) return { ok: true, value: FONT_WEIGHT_NAME_MAP[key], raw, unknown: false };
  return { ok: false, raw, unknown: true };
}

// ---------------------------------------------------------------------------
// Section 6 — Classification
//
// Priority order (highest first): Figma variable type -> collection/path
// context -> explicit semantic prefix anywhere in the path -> bare variable
// name -> heuristics -> unclassified. Generic words (size, value, scale,
// default, small, large, medium, base, min, max, xs, sm, md, lg, xl) never
// independently decide a category — they only count inside a collection that
// already establishes context (see TYPOGRAPHY_COLLECTIONS handling of
// "size").
// ---------------------------------------------------------------------------

const SPACING_COLLECTIONS = new Set(["spacing", "space"]);
const RADIUS_COLLECTIONS = new Set(["radius", "corner radius", "corner-radius", "radii"]);
const OPACITY_COLLECTIONS = new Set(["opacity"]);
const TYPOGRAPHY_COLLECTIONS = new Set(["typography", "type", "font"]);

/** Strong, unambiguous keywords — safe to match anywhere in the path, outside any recognized collection. */
const STRONG_KEYWORD_CATEGORIES: Array<[TokenCategory, RegExp]> = [
  ["spacing", /^(spacing|space|gap|padding|margin)$/],
  ["radius", /^(radius|corner)$/],
  ["opacity", /^opacity$/],
  ["fontFamily", /^(font-?family|family|typeface)$/],
  ["lineHeight", /^(line-?height|leading)$/],
  ["letterSpacing", /^(letter-?spacing|tracking)$/],
  ["fontWeight", /^(font-?weight|weight)$/],
];

/** Signals only meaningful once already inside a typography-bucket collection ("size" alone is too overloaded elsewhere). */
const TYPOGRAPHY_SUBSIGNALS: Array<[TokenCategory, RegExp]> = [
  ["fontSize", /^(font-?size|size|text)$/],
  ["lineHeight", /^(line-?height|leading)$/],
  ["letterSpacing", /^(letter-?spacing|tracking)$/],
  ["fontWeight", /^(font-?weight|weight)$/],
  ["fontFamily", /^(font-?family|family|typeface)$/],
];

export interface ClassifyInput {
  type: FigmaVariableType;
  collection: string;
  /** Path segments excluding the collection itself, e.g. ["Font", "Size"] for "Typography/Font/Size". */
  path: string[];
}

function normalizeSegment(s: string): string {
  return s.trim().toLowerCase();
}

export function classifyVariable(input: ClassifyInput): ClassificationResult {
  if (input.type === "COLOR") {
    return { category: "color", confidence: "high", reason: "Figma variable type is COLOR" };
  }
  if (input.type === "BOOLEAN") {
    return { category: "unclassified", confidence: "none", reason: "Figma variable type is BOOLEAN; no theme category applies" };
  }

  const collection = normalizeSegment(input.collection);
  const segments = input.path.map(normalizeSegment);

  if (SPACING_COLLECTIONS.has(collection)) {
    return { category: "spacing", confidence: "high", reason: `collection "${input.collection}" is a recognized spacing collection` };
  }
  if (RADIUS_COLLECTIONS.has(collection)) {
    return { category: "radius", confidence: "high", reason: `collection "${input.collection}" is a recognized radius collection` };
  }
  if (OPACITY_COLLECTIONS.has(collection)) {
    return { category: "opacity", confidence: "high", reason: `collection "${input.collection}" is a recognized opacity collection` };
  }
  if (TYPOGRAPHY_COLLECTIONS.has(collection)) {
    for (let i = 0; i < segments.length; i++) {
      for (const [category, re] of TYPOGRAPHY_SUBSIGNALS) {
        if (re.test(segments[i])) {
          return {
            category,
            confidence: "high",
            reason: `collection "${input.collection}" is typography, and path segment "${segments[i]}" signals ${category}`,
            signalIndex: i,
          };
        }
      }
    }
    return {
      category: "unclassified",
      confidence: "none",
      reason: `collection "${input.collection}" is typography, but no path segment (${segments.join("/")}) identifies which typography property this is`,
    };
  }

  // No recognized collection — only an explicit, unambiguous keyword anywhere
  // in the path may still classify it. Bare generic words never do.
  for (let i = 0; i < segments.length; i++) {
    for (const [category, re] of STRONG_KEYWORD_CATEGORIES) {
      if (re.test(segments[i])) {
        return {
          category,
          confidence: "medium",
          reason: `no recognized collection, but path segment "${segments[i]}" is an unambiguous ${category} keyword`,
          signalIndex: i,
        };
      }
    }
  }

  return {
    category: "unclassified",
    confidence: "none",
    reason: `collection "${input.collection}" is not recognized and no path segment (${segments.join("/")}) is an unambiguous category keyword — generic words alone (e.g. size/value/scale/default/small/large) never decide a category`,
  };
}

// ---------------------------------------------------------------------------
// Section 7 — Name normalization
// ---------------------------------------------------------------------------

/** Normalizes a single path segment: numeric scale steps (e.g. "500") are kept as-is; everything else is lowercased and kebab-cased. */
function normalizeKeySegment(seg: string): string {
  const trimmed = seg.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return trimmed; // numeric scale step, kept as-is
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Converts already-relevant path segments into a deterministic dot-joined key path, e.g. ["Primary","500"] -> "primary.500". */
export function normalizeTokenPath(pathSegments: string[]): string {
  return pathSegments.map(normalizeKeySegment).join(".");
}

/**
 * The NativeWind/Tailwind `theme.extend` namespace each category writes
 * into. Not a 1:1 lowercase of the category name — Tailwind's own key for
 * color is the plural `colors`, everything else matches the category name.
 */
export const CATEGORY_TAILWIND_KEY: Record<Exclude<TokenCategory, "unclassified">, string> = {
  color: "colors",
  spacing: "spacing",
  radius: "borderRadius",
  opacity: "opacity",
  fontSize: "fontSize",
  lineHeight: "lineHeight",
  letterSpacing: "letterSpacing",
  fontWeight: "fontWeight",
  fontFamily: "fontFamily",
};

/**
 * Builds the final theme token path for a classified variable: the
 * category's Tailwind namespace, followed by whatever's left of the path
 * once the collection-duplicate leading segment and the segment that
 * triggered classification (if any) are removed.
 *
 * Examples: category "color", strippedPath ["Primary","500"], no signal
 * -> "colors.primary.500". Category "fontWeight", strippedPath
 * ["Heading","Weight"], signalIndex 1 (the "Weight" segment)
 * -> "fontWeight.heading".
 */
export function buildTokenPath(category: TokenCategory, strippedPath: string[], signalIndex?: number): string | null {
  if (category === "unclassified") return null;
  const remainder = signalIndex === undefined ? strippedPath : strippedPath.filter((_, i) => i !== signalIndex);
  const key = CATEGORY_TAILWIND_KEY[category];
  return remainder.length > 0 ? `${key}.${normalizeTokenPath(remainder)}` : key;
}

/** Strips a leading path segment that merely restates the variable's own collection name (case-insensitive), e.g. ["Color","Primary","500"] with collection "Color" -> ["Primary","500"]. */
export function stripLeadingCollectionSegment(pathSegments: string[], collection: string): string[] {
  if (pathSegments.length > 1 && normalizeSegment(pathSegments[0]) === normalizeSegment(collection)) {
    return pathSegments.slice(1);
  }
  return pathSegments;
}

// ---------------------------------------------------------------------------
// Section 8 — Alias resolution
// ---------------------------------------------------------------------------

function isAlias(v: RawVariableValue): v is { aliasId: string } {
  return typeof v === "object" && v !== null && "aliasId" in (v as any);
}

export interface AliasResolveOptions {
  maxDepth?: number;
}

/**
 * Resolves `value` (the raw value of `startName` in `mode`) to a primitive,
 * walking alias references. Detects cycles, missing targets, and excessive
 * recursion — never invents a value on failure.
 */
export function resolveAlias(
  startName: string,
  value: RawVariableValue,
  mode: string,
  byId: Map<string, RawFigmaVariable>,
  opts: AliasResolveOptions = {}
): AliasResolution {
  const maxDepth = opts.maxDepth ?? 10;
  const chain: string[] = [startName];
  const visited = new Set<string>();
  let current = value;
  let depth = 0;

  while (isAlias(current)) {
    if (depth >= maxDepth) return { ok: false, chain, value: null, error: "max-depth-exceeded" };
    const targetId = current.aliasId;
    if (visited.has(targetId)) return { ok: false, chain, value: null, error: "cycle" };
    visited.add(targetId);

    const target = byId.get(targetId);
    if (!target) return { ok: false, chain, value: null, error: "missing-target" };

    chain.push(target.name);
    const nextValue = mode in target.modes ? target.modes[mode] : Object.values(target.modes)[0];
    current = nextValue;
    depth++;
  }

  return { ok: true, chain: chain.length > 1 ? chain : [], value: current };
}

// ---------------------------------------------------------------------------
// Section 9 — Token IR builder
// ---------------------------------------------------------------------------

function serializeValue(category: TokenCategory, value: RawVariableValue): { ok: boolean; serialized: string | number | null; error?: string } {
  if (category === "color") {
    const c = normalizeColor(value);
    if (!c.ok) return { ok: false, serialized: null, error: c.reason };
    return { ok: true, serialized: c.rgbTriplet! };
  }
  if (category === "fontWeight") {
    if (typeof value !== "string" && typeof value !== "number") return { ok: false, serialized: null, error: "unsupported-font-weight-input" };
    const w = normalizeFontWeight(value);
    if (!w.ok) return { ok: false, serialized: null, error: "unknown-font-weight" };
    return { ok: true, serialized: w.value! };
  }
  if (typeof value === "number") return { ok: true, serialized: value };
  if (typeof value === "string") return { ok: true, serialized: value };
  return { ok: false, serialized: null, error: "unsupported-value-shape" };
}

/** Builds one Token IR entry per (variable, mode) pair. Does not write anything. */
export function buildTokenIR(variables: RawFigmaVariable[], opts: AliasResolveOptions = {}): TokenIREntry[] {
  const byId = new Map(variables.map((v) => [v.id, v]));
  const entries: TokenIREntry[] = [];

  for (const variable of variables) {
    const path = variable.name.split("/");
    const collection = variable.collection;
    const strippedPath = stripLeadingCollectionSegment(path, collection);
    const classification = classifyVariable({ type: variable.type, collection, path: strippedPath });
    const tokenPath = buildTokenPath(classification.category, strippedPath, classification.signalIndex) ?? normalizeTokenPath(strippedPath);

    for (const [mode, rawValue] of Object.entries(variable.modes)) {
      const resolution = resolveAlias(variable.name, rawValue, mode, byId, opts);
      const base: Omit<TokenIREntry, "value" | "ok" | "error"> = {
        id: variable.id,
        name: variable.name,
        collection,
        path,
        type: variable.type,
        mode,
        aliasChain: resolution.chain,
        category: classification.category,
        confidence: classification.confidence,
        reason: classification.reason,
        tokenPath,
        raw: rawValue,
      };

      if (!resolution.ok) {
        entries.push({ ...base, value: null, ok: false, error: `alias-${resolution.error}` });
        continue;
      }
      if (classification.category === "unclassified") {
        entries.push({ ...base, value: null, ok: true, error: undefined });
        continue;
      }

      const serialized = serializeValue(classification.category, resolution.value as RawVariableValue);
      if (!serialized.ok) {
        entries.push({ ...base, value: null, ok: false, error: serialized.error });
        continue;
      }
      entries.push({ ...base, value: serialized.serialized, ok: true, error: undefined });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Section 10 — Diff
// ---------------------------------------------------------------------------

export interface ExistingTokenValue {
  value: string | number;
}

/**
 * Diffs resolved, classified Token IR entries against whatever the write
 * target already holds. `existing` is keyed by "tokenPath" (single-mode) or
 * "tokenPath@mode" (multi-mode) — callers decide the key shape that matches
 * how they read the existing file.
 */
export function computeDiff(ir: TokenIREntry[], existing: Record<string, ExistingTokenValue>): DiffResult {
  const result: DiffResult = { added: [], unchanged: [], overridden: [], collisions: [], unresolved: [] };

  const byKey = new Map<string, TokenIREntry[]>();
  for (const entry of ir) {
    const key = entry.mode ? `${entry.tokenPath}@${entry.mode}` : entry.tokenPath;
    const list = byKey.get(key) ?? [];
    list.push(entry);
    byKey.set(key, list);
  }

  for (const [key, entriesForKey] of byKey) {
    const tokenPath = entriesForKey[0].tokenPath;
    const mode = entriesForKey[0].mode ?? null;

    const unresolvedInGroup = entriesForKey.filter((e) => !e.ok || e.category === "unclassified");
    if (unresolvedInGroup.length > 0) {
      for (const e of unresolvedInGroup) {
        result.unresolved.push({ tokenPath, mode, case: "unresolved", incomingValue: e.value, existingValue: null });
      }
      continue;
    }

    const distinctValues = new Set(entriesForKey.map((e) => String(e.value)));
    if (distinctValues.size > 1) {
      result.collisions.push({
        tokenPath,
        mode,
        case: "collision",
        incomingValue: null,
        existingValue: null,
        collisionCandidates: entriesForKey.map((e) => ({ source: e.name, value: e.value })),
      });
      continue;
    }

    const incomingValue = entriesForKey[0].value;
    const existingEntry = existing[key] ?? existing[tokenPath];

    if (!existingEntry) {
      result.added.push({ tokenPath, mode, case: "added", incomingValue, existingValue: null });
    } else if (String(existingEntry.value) === String(incomingValue)) {
      result.unchanged.push({ tokenPath, mode, case: "unchanged", incomingValue, existingValue: existingEntry.value });
    } else {
      result.overridden.push({ tokenPath, mode, case: "overridden", incomingValue, existingValue: existingEntry.value });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Section 11 — Approvals
// ---------------------------------------------------------------------------

function decisionKey(entry: DiffEntry): string {
  return entry.mode ? `${entry.tokenPath}@${entry.mode}` : entry.tokenPath;
}

/**
 * Applies human decisions to a diff. Additions never need a decision.
 * Overrides need "approve"/"skip" (or `approveAll`). Collisions need "skip"
 * or a winning candidate's source name — `approveAll` never resolves a
 * collision, since there is no default side to rubber-stamp.
 */
export function applyApprovals(diff: DiffResult, decisions: ApprovalDecisions): ApplyApprovalsResult {
  const toWrite: DiffEntry[] = [...diff.added];
  const skipped: DiffEntry[] = [];
  const blockedEntries: DiffEntry[] = [];

  for (const entry of diff.overridden) {
    if (decisions.approveAll) {
      toWrite.push(entry);
      continue;
    }
    const decision = decisions.decisions?.[decisionKey(entry)];
    if (decision === "approve") toWrite.push(entry);
    else if (decision === "skip") skipped.push(entry);
    else blockedEntries.push(entry);
  }

  for (const entry of diff.collisions) {
    const decision = decisions.decisions?.[decisionKey(entry)];
    if (decision === "skip") {
      skipped.push(entry);
      continue;
    }
    const winner = entry.collisionCandidates?.find((c) => c.source === decision);
    if (winner) toWrite.push({ ...entry, incomingValue: winner.value });
    else blockedEntries.push(entry);
  }

  return { toWrite, skipped, blocked: blockedEntries.length > 0, blockedEntries };
}

// ---------------------------------------------------------------------------
// Section 12 — Rendering (fallback path: no existing tokens module found)
// ---------------------------------------------------------------------------

export const MANAGED_BLOCK_BEGIN = "figma-theme-sync (do not edit by hand — regenerated by /rn-sync-figma-theme)";
export const MANAGED_BLOCK_END = "figma-theme-sync";

function orderedEntries(entries: DiffEntry[]): DiffEntry[] {
  return [...entries].sort((a, b) => (a.mode ?? "").localeCompare(b.mode ?? "") || a.tokenPath.localeCompare(b.tokenPath));
}

/** Deterministically renders a flat JS object literal body for the JS/CSS-variable fallback path. Sorted so re-runs are byte-identical. */
export function renderManagedBlockJS(entries: DiffEntry[]): string {
  const lines = orderedEntries(entries).map((e) => {
    const key = e.mode ? `${e.tokenPath}@${e.mode}` : e.tokenPath;
    const value = typeof e.incomingValue === "number" ? e.incomingValue : JSON.stringify(e.incomingValue);
    return `  "${key}": ${value},`;
  });
  return [`// --- BEGIN ${MANAGED_BLOCK_BEGIN} ---`, ...lines, `// --- END ${MANAGED_BLOCK_END} ---`].join("\n");
}

/** Byte-identical re-render given the same entries is the idempotency guarantee: same input -> same block, always. */
export function verifyManagedBlock(fileContent: string, entries: DiffEntry[]): { ok: boolean; reason?: string } {
  const expected = renderManagedBlockJS(entries);
  if (!fileContent.includes(expected)) {
    return { ok: false, reason: "managed block not found or does not match the approved Token IR exactly" };
  }
  const beginCount = fileContent.split(`BEGIN ${MANAGED_BLOCK_BEGIN}`).length - 1;
  if (beginCount !== 1) return { ok: false, reason: `expected exactly one managed block, found ${beginCount}` };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Section 13 — JSON tokens-module rendering (preferred path: an existing
// JSON single-source-of-truth module, e.g. theme-tokens.json)
// ---------------------------------------------------------------------------

function deepSet(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let cursor = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (typeof cursor[key] !== "object" || cursor[key] === null) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
}

export function deepGet(obj: Record<string, unknown>, path: string[]): unknown {
  let cursor: unknown = obj;
  for (const key of path) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

/** Detects the indent width of an existing JSON file so re-serialization matches it (no formatting churn). */
export function detectJSONIndent(text: string): number {
  const m = /\n( +)\S/.exec(text);
  return m ? m[1].length : 2;
}

/**
 * Applies approved token updates onto an existing JSON tokens object,
 * preserving every untouched key (including its position) and only touching
 * the paths actually being written. Re-serializes deterministically at the
 * detected indent width, so a no-op update produces byte-identical JSON.
 */
export function renderJSONTokensModule(
  existing: Record<string, unknown>,
  updates: Array<{ tokenPath: string; mode: string | null; value: string | number }>,
  indent = 2
): { json: Record<string, unknown>; text: string } {
  const next = JSON.parse(JSON.stringify(existing)) as Record<string, unknown>;
  for (const u of updates) {
    const segments = u.tokenPath.split(".");
    const path = u.mode ? [...segments.slice(0, 1), u.mode.toLowerCase(), ...segments.slice(1)] : segments;
    // Fall back to the un-mode-prefixed path if the existing module has no
    // top-level mode split at this key (e.g. a single-mode scale like spacing).
    const target = u.mode && deepGet(next, [segments[0]]) && typeof deepGet(next, [segments[0]]) === "object" && u.mode.toLowerCase() in (deepGet(next, [segments[0]]) as object)
      ? path
      : segments;
    deepSet(next, target, u.value);
  }
  return { json: next, text: JSON.stringify(next, null, indent) + "\n" };
}

// ---------------------------------------------------------------------------
// Section 14 — Machine-readable execution result
// ---------------------------------------------------------------------------

export function buildResult(input: {
  platform: string | null;
  figmaScope: { file: string | null; page: string | null; node: string | null };
  totalRead: number;
  diff: DiffResult;
  applied: ApplyApprovalsResult | null;
  filesChanged: string[];
  warnings: string[];
  cancelled?: boolean;
  failedReason?: string;
}): ExecutionResult {
  const { diff, applied } = input;

  // `unresolved` (a failed alias walk, an unclassified variable) has no
  // human decision that fixes it here — the fix lives outside this run (the
  // Figma file itself). But a routine unclassified variable (Icon/Size/Small,
  // say) is an EXPECTED, non-fatal outcome, not a reason to withhold a write
  // that otherwise succeeded — it's excluded from the write and reported via
  // counts/warnings, never treated as a full-run stop. `blocked` is reserved
  // for the run producing nothing usable at all. `overridden` and `collisions`
  // are both human-resolvable: pending until decided, then written or skipped.
  const hasUsableOutput = diff.added.length > 0 || diff.unchanged.length > 0 || diff.overridden.length > 0 || diff.collisions.length > 0;

  let status: ExecutionStatus;
  if (input.failedReason) status = "failed";
  else if (input.cancelled) status = "cancelled";
  else if (diff.unresolved.length > 0 && !hasUsableOutput) status = "blocked";
  else if ((diff.overridden.length > 0 || diff.collisions.length > 0) && (!applied || applied.blocked)) status = "needs_confirmation";
  else status = "success";

  return {
    status,
    platform: input.platform,
    figmaScope: input.figmaScope,
    counts: {
      read: input.totalRead,
      added: applied ? applied.toWrite.filter((e) => e.case === "added").length : diff.added.length,
      unchanged: diff.unchanged.length,
      overridden: applied ? applied.toWrite.filter((e) => e.case === "overridden").length : 0,
      skipped: applied ? applied.skipped.length : 0,
      unclassified: diff.unresolved.length,
      collisions: applied ? applied.blockedEntries.filter((e) => e.case === "collision").length : diff.collisions.length,
      unresolved: diff.unresolved.length,
    },
    filesChanged: status === "success" || status === "needs_confirmation" ? input.filesChanged : [],
    warnings: input.warnings,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function getFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 ? argv[i + 1] : undefined;
}

function getJsonFlag<T>(argv: string[], name: string, fallback: T): T {
  const raw = getFlag(argv, name);
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function printJSON(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function main(): void {
  const [, , command, ...rest] = process.argv;

  switch (command) {
    case "detect-platform": {
      const files = getJsonFlag<string[]>(rest, "files", []);
      const deps = getJsonFlag<string[]>(rest, "deps", []);
      printJSON({ ok: true, platform: detectPlatformSignal({ files, deps }) });
      break;
    }
    case "find-theme-modules": {
      const files = getJsonFlag<string[]>(rest, "files", []);
      const tailwindConfig = getFlag(rest, "tailwind-config") ?? "";
      printJSON({
        ok: true,
        candidates: findCandidateThemeModules(files),
        referencedByTailwindConfig: extractLocalModuleReferences(tailwindConfig),
      });
      break;
    }
    case "build-ir": {
      const variables = getJsonFlag<RawFigmaVariable[]>(rest, "variables", []);
      printJSON({ ok: true, ir: buildTokenIR(variables) });
      break;
    }
    case "diff": {
      const ir = getJsonFlag<TokenIREntry[]>(rest, "ir", []);
      const existing = getJsonFlag<Record<string, ExistingTokenValue>>(rest, "existing", {});
      printJSON({ ok: true, diff: computeDiff(ir, existing) });
      break;
    }
    case "apply-approvals": {
      const diff = getJsonFlag<DiffResult>(rest, "diff", { added: [], unchanged: [], overridden: [], collisions: [], unresolved: [] });
      const decisions = getJsonFlag<ApprovalDecisions>(rest, "decisions", {});
      printJSON({ ok: true, result: applyApprovals(diff, decisions) });
      break;
    }
    case "render-json": {
      const existing = getJsonFlag<Record<string, unknown>>(rest, "existing", {});
      const updates = getJsonFlag<Array<{ tokenPath: string; mode: string | null; value: string | number }>>(rest, "updates", []);
      const indentSource = getFlag(rest, "source-text");
      const indent = indentSource ? detectJSONIndent(indentSource) : 2;
      printJSON({ ok: true, ...renderJSONTokensModule(existing, updates, indent) });
      break;
    }
    case "render-block": {
      const entries = getJsonFlag<DiffEntry[]>(rest, "entries", []);
      printJSON({ ok: true, block: renderManagedBlockJS(entries) });
      break;
    }
    case "verify": {
      const fileContent = getFlag(rest, "file-content") ?? "";
      const entries = getJsonFlag<DiffEntry[]>(rest, "entries", []);
      printJSON({ ok: true, verification: verifyManagedBlock(fileContent, entries) });
      break;
    }
    case "report": {
      const state = getJsonFlag<Parameters<typeof buildResult>[0] | null>(rest, "state", null);
      if (!state) {
        printJSON({ ok: false, error: "missing --state" });
        break;
      }
      printJSON({ ok: true, result: buildResult(state) });
      break;
    }
    default:
      printJSON({ ok: false, error: `unknown command: ${command}` });
  }
}

const invokedDirectly =
  typeof process !== "undefined" && process.argv[1] !== undefined && /figma-theme-tokens\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
