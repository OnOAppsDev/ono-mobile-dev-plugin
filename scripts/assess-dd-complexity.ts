/**
 * assess-dd-complexity.ts
 *
 * Deterministic complexity scorer for the Adaptive Multi-Stage DD design
 * (docs/planning/ADAPTIVE_MULTI_STAGE_DD_GENERATION_DESIGN.md, Slice B).
 *
 * The architect OBSERVES; this script DECIDES. Classification must not be
 * model intuition, so every threshold, cap and band rule lives here as
 * arithmetic over signals the architect supplies while doing the repository
 * sweep it already performs. Same split the plugin uses everywhere else:
 * structured decisions in Node, observation in the skill.
 *
 * ADVISORY ONLY — THIS SCRIPT ROUTES NOTHING.
 *
 * `routing` is hard-coded to "single-dd" and there is no code path that can
 * return anything else. Partitioned generation is not implemented, and the
 * scoring model below is an initial hypothesis being calibrated against real
 * features. Until that calibration is done the band is recorded and reported,
 * never acted on. A caller that branches on `band` is a defect.
 *
 * CRITICAL: this helper ALWAYS exits 0 and ALWAYS prints a valid JSON object,
 * including when signals are missing or malformed (band: "unclassified").
 * Callers branch on `band` for reporting, never on the exit code — the same
 * posture as read-repo-knowledge.ts and migrate-planning-doc.ts.
 *
 * Runtime: Node >= 23.6 or Bun. No external deps, no filesystem access, no
 * clock, no randomness — the same signals always produce the same result.
 *
 * Usage:
 *   node --no-warnings scripts/assess-dd-complexity.ts --signals '<json>'
 */

/** Per-dimension ceilings. A single dimension can never dominate the total. */
export const CAPS = { repository: 5, architecture: 6, surface: 4, coupling: 3 } as const;

export const MAX_TOTAL = CAPS.repository + CAPS.architecture + CAPS.surface + CAPS.coupling; // 18

/** A dimension counts as "high" for the two-dimension rule at 60% of its cap. */
const HIGH_DIMENSION_RATIO_NUMERATOR = 6;
const HIGH_DIMENSION_RATIO_DENOMINATOR = 10;

/**
 * Band thresholds. This file owns them — docs/planning-doc-contract.md
 * describes the frontmatter contract, not the scoring model.
 */
const LOW_MAX_TOTAL = 5;
const LOW_MAX_ARCHITECTURE = 2;
const HIGH_MIN_TOTAL = 12;
const HIGH_MIN_HIGH_DIMENSIONS = 2;

export type Band = "low" | "medium" | "high" | "unclassified";

const COUNT_SIGNALS = [
  "modules_touched",
  "change_classes",
  "change_sites",
  "cross_module_change_classes",
  "surfaces_changed",
] as const;

const FLAG_SIGNALS = [
  "new_contract",
  "new_pattern",
  "new_dependency",
  "data_migration",
  "concurrency_change",
] as const;

const DESIGN_REFERENCE_VALUES = new Set(["provided", "not_required"]);

export interface Signals {
  modules_touched: number;
  change_classes: number;
  /** Recorded, never scored — see `whyChangeSitesIsNotScored`. */
  change_sites: number;
  cross_module_change_classes: number;
  surfaces_changed: number;
  new_contract: boolean;
  new_pattern: boolean;
  new_dependency: boolean;
  data_migration: boolean;
  concurrency_change: boolean;
  design_reference_status: "provided" | "not_required";
}

export interface Assessment {
  signals: Partial<Signals>;
  dimensions: { repository: number; architecture: number; surface: number; coupling: number } | null;
  caps: typeof CAPS;
  total: number | null;
  maxTotal: number;
  band: Band;
  /** Dimensions at or above 60% of their cap — the two-dimension rule's input. */
  highDimensions: string[];
  /** Derived sanity check, never an input. */
  predictedLines: number | null;
  /** Always "single-dd". There is no other value. */
  routing: "single-dd";
  /** Always true — the band records a measurement and never routes generation. */
  advisory: true;
  /** Signal names that were missing or malformed. */
  missing: string[];
  summary: string;
}

/**
 * `change_sites` is deliberately excluded from every dimension.
 *
 * A mechanical change repeated across many call sites is REPETITION, not
 * complexity: many identical edits in one module involve one decision, not
 * many. Scoring raw site counts is the single most likely cause
 * of false partitioning, so the count is recorded for the reader and given zero
 * weight. The same reasoning excludes requirement counts and Feature Analysis
 * length, which are not signals at all.
 */

function clampInt(value: number, cap: number): number {
  return Math.max(0, Math.min(cap, Math.floor(value)));
}

function normalize(raw: any): { signals: Partial<Signals>; missing: string[] } {
  const signals: Partial<Signals> = {};
  const missing: string[] = [];

  for (const key of COUNT_SIGNALS) {
    const v = raw?.[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) signals[key] = Math.floor(v);
    else missing.push(key);
  }
  for (const key of FLAG_SIGNALS) {
    const v = raw?.[key];
    if (typeof v === "boolean") signals[key] = v;
    else missing.push(key);
  }
  const dr = raw?.design_reference_status;
  if (typeof dr === "string" && DESIGN_REFERENCE_VALUES.has(dr)) signals.design_reference_status = dr as Signals["design_reference_status"];
  else missing.push("design_reference_status");

  return { signals, missing };
}

function isHigh(score: number, cap: number): boolean {
  // Integer comparison so the 60% threshold has no floating-point edge.
  return score * HIGH_DIMENSION_RATIO_DENOMINATOR >= cap * HIGH_DIMENSION_RATIO_NUMERATOR;
}

export function assess(raw: any): Assessment {
  const { signals, missing } = normalize(raw);

  if (missing.length > 0) {
    return {
      signals,
      dimensions: null,
      caps: CAPS,
      total: null,
      maxTotal: MAX_TOTAL,
      band: "unclassified",
      highDimensions: [],
      predictedLines: null,
      routing: "single-dd",
      advisory: true,
      missing,
      summary:
        `Complexity could not be classified — ${missing.length} signal(s) missing or malformed: ${missing.join(", ")}. ` +
        `Generation continues on the single-DD path, which is what it does for every band anyway.`,
    };
  }

  const s = signals as Signals;

  const repository = Math.min(
    CAPS.repository,
    clampInt(s.modules_touched / 2, 3) + clampInt(s.change_classes, 2)
  );
  const architecture = Math.min(
    CAPS.architecture,
    2 * (s.new_contract ? 1 : 0) +
      2 * (s.new_pattern ? 1 : 0) +
      (s.new_dependency ? 1 : 0) +
      (s.data_migration ? 1 : 0) +
      (s.concurrency_change ? 1 : 0)
  );
  const surface = Math.min(
    CAPS.surface,
    clampInt(s.surfaces_changed, 3) + (s.design_reference_status === "provided" ? 1 : 0)
  );
  const coupling = Math.min(CAPS.coupling, clampInt(s.cross_module_change_classes, 3));

  const dimensions = { repository, architecture, surface, coupling };
  const total = repository + architecture + surface + coupling;

  const highDimensions = (Object.keys(dimensions) as Array<keyof typeof dimensions>).filter((k) =>
    isHigh(dimensions[k], CAPS[k])
  );

  // Band rules, in order. High requires BREADTH — a single large dimension can
  // never reach it, which is the anti-false-partitioning guarantee.
  let band: Band;
  if (total >= HIGH_MIN_TOTAL && highDimensions.length >= HIGH_MIN_HIGH_DIMENSIONS) band = "high";
  else if (total <= LOW_MAX_TOTAL && architecture <= LOW_MAX_ARCHITECTURE) band = "low";
  else band = "medium";

  // Derived, never an input — a sanity check on the band, not a cause of it.
  const predictedLines = 120 + 28 * total;

  return {
    signals: s,
    dimensions,
    caps: CAPS,
    total,
    maxTotal: MAX_TOTAL,
    band,
    highDimensions,
    predictedLines,
    routing: "single-dd",
    advisory: true,
    missing: [],
    summary:
      `Complexity ${band} (${total}/${MAX_TOTAL} — repository ${repository}/${CAPS.repository}, ` +
      `architecture ${architecture}/${CAPS.architecture}, surface ${surface}/${CAPS.surface}, ` +
      `coupling ${coupling}/${CAPS.coupling}; ~${predictedLines} predicted lines). ` +
      `Advisory only — generation continues on the single-DD path.`,
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--signals");
  const arg = i !== -1 ? argv[i + 1] : undefined;

  let raw: any = {};
  if (arg) {
    try {
      raw = JSON.parse(arg);
    } catch {
      raw = {};
    }
  }
  // Always exit 0 with valid JSON — malformed input yields `unclassified`.
  console.log(JSON.stringify(assess(raw), null, 2));
  process.exit(0);
}

const invokedDirectly =
  typeof process !== "undefined" && process.argv[1] !== undefined && /assess-dd-complexity\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
