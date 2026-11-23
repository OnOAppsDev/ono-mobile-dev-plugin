/**
 * feature-docs.ts — resolve a feature's planning documents deterministically.
 *
 * A feature's Feature Analysis, Detailed Design, Task Breakdown and Dev Plan are generated
 * files wherever the repository keeps its docs (e.g. docs/biometric-login-DD.md); their names
 * are not fixed. They are resolved the way /implement-task already does it — from the
 * documents' own link fields (`dd_link`, `feature_analysis_link`, `dev_plan_link`), trusting
 * the role a link declares, exactly as scripts/task-resume.ts `resolveDocs` does — and, when a
 * stage has no document linking to it, by a bounded scan for documents whose frontmatter
 * `feature:` names the feature.
 *
 * Frontmatter shapes overlap: a Feature Analysis written before ENG-003 and the surface /
 * capability fields carries exactly the keys a Dev Plan carries (`feature`, `dd_link`, the
 * design fields, `platform`, `author`, `status`). Such a document is classified `fa-or-plan`,
 * and its role comes from context, never from a guess: a link names it; with no Task Breakdown
 * yet there is no Dev Plan (both are written by /dev-feature-start), so it is the analysis;
 * otherwise the breakdown's `dev_plan_link` says which one is the plan.
 *
 * Two candidates for the same stage are AMBIGUOUS — except that a Task Breakdown left behind
 * by /dev-feature-start's Preserve or Version option is resolved by the feature's internal
 * review record, when that record names one of the candidates and still matches its content.
 * Stale or dangling review evidence never selects a document. No state is written.
 *
 * Read-only. Never writes a document, never changes a `status`.
 */

import { existsSync, readFileSync, readdirSync, realpathSync, statSync, lstatSync } from "fs";
import { isAbsolute, join, relative, resolve, sep } from "path";
import { readFrontmatter, type Frontmatter } from "./task-resume.ts";
import { fingerprintBody, splitDocument } from "./migrate-planning-doc.ts";

export type FeatureDocKind = "feature-analysis" | "dd" | "task-breakdown" | "dev-plan";
/** What the frontmatter alone says: a kind, or `fa-or-plan` when the keys cannot tell an analysis from a plan. */
export type DocShape = FeatureDocKind | "fa-or-plan";
export const FEATURE_DOC_KINDS: FeatureDocKind[] = ["feature-analysis", "dd", "task-breakdown", "dev-plan"];
/** The command that (re)generates each stage's document. */
export const STAGE_COMMAND: Record<FeatureDocKind, string> = {
  "feature-analysis": "analyze-feature",
  dd: "dev-design-start",
  "task-breakdown": "dev-feature-start",
  "dev-plan": "dev-feature-start",
};
export const FEATURE_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/** The feature's internal review record (scripts/feature-review.ts writes it). */
export const reviewRecordPath = (feature: string) => `docs/reviews/${feature}/review.md`;

/** Directories never scanned for planning documents: dependencies, build output, VCS. */
const SKIP_DIRS = new Set([".git", "node_modules", "Pods", "build", "dist", ".gradle", "DerivedData", "vendor", ".next", ".expo", "coverage", ".idea", ".ono", "Carthage", ".build"]);
const SCAN_MAX_FILES = 20000;
const SCAN_MAX_DEPTH = 10;
const DOC_MAX_BYTES = 2 * 1024 * 1024;

export interface FeatureDoc {
  kind: FeatureDocKind;
  shape: DocShape;
  /** Repository-relative, `/`-separated. */
  rel: string;
  abs: string;
  fm: Frontmatter;
  buf: Buffer;
  status: string | null;
  /** 1-based line of the `status:` field — where a human flips the approval. */
  status_line: number | null;
  approved: boolean;
}

const has = (fm: Frontmatter, k: string) => Object.prototype.hasOwnProperty.call(fm, k);

/**
 * What a frontmatter's keys say about the document, from the keys each template defines.
 * QA handoffs, Bug Work Plans, review records and anything else are null.
 */
export function detectKind(fm: Frontmatter | null): DocShape | null {
  if (fm === null || !has(fm, "feature")) return null;
  if (has(fm, "bug_key") || has(fm, "task_breakdown_link") || has(fm, "generated_by") || has(fm, "review_schema")) return null;
  if (has(fm, "feature_analysis_link") && has(fm, "dd_link") && (has(fm, "dev_plan_link") || has(fm, "qa_handoff_link"))) return "task-breakdown";
  if (has(fm, "feature_analysis_link")) return "dd";
  // Keys only the Feature Analysis template has ever defined; `proposed` is only an analysis's status.
  if (["source_link", "source_fingerprint", "design_reference_fingerprint", "capability", "surface", "repo_knowledge_status"].some((k) => has(fm, k)) || fm.status === "proposed") return "feature-analysis";
  if (has(fm, "dd_link") || has(fm, "figma_link") || has(fm, "design_reference_status")) return "fa-or-plan";
  return null;
}

/** Whether a document of this shape can play the role a link (or the context) assigns it. */
const fits = (shape: DocShape, role: FeatureDocKind): boolean =>
  shape === role || (shape === "fa-or-plan" && (role === "feature-analysis" || role === "dev-plan"));

/** The 1-based line of a top-of-file frontmatter key, or null. */
export function fieldLine(buf: Buffer, key: string): number | null {
  const lines = buf.toString("utf-8").split(/\r?\n/);
  const re = new RegExp(`^${key}:`);
  for (let i = 0; i < Math.min(lines.length, 200); i++) if (re.test(lines[i])) return i + 1;
  return null;
}

const toRel = (root: string, abs: string): string | null => {
  const r = relative(root, abs);
  return r === "" || r.startsWith("..") || isAbsolute(r) ? null : r.split(sep).join("/");
};

/** A planning document, in the role given (or the role its shape implies). Null when it is not one. */
export function loadFeatureDoc(root: string, p: string, role?: FeatureDocKind): FeatureDoc | null {
  const abs = isAbsolute(p) ? p : resolve(root, p);
  try {
    const st = statSync(abs);
    if (!st.isFile() || st.size > DOC_MAX_BYTES) return null;
  } catch {
    return null;
  }
  const rel = toRel(root, abs);
  if (rel === null) return null;
  const buf = readFileSync(abs);
  const fm = readFrontmatter(buf);
  const shape = detectKind(fm);
  if (fm === null || shape === null) return null;
  if (role !== undefined && !fits(shape, role)) return null;
  const kind: FeatureDocKind = role ?? (shape === "fa-or-plan" ? "feature-analysis" : shape);
  const status = fm.status ?? null;
  return { kind, shape, rel, abs, fm, buf, status, status_line: fieldLine(buf, "status"), approved: status === "approved" };
}

/** Every planning document under `root` whose frontmatter names `feature`. Bounded. */
export function scanFeatureDocs(root: string, feature: string): { docs: FeatureDoc[]; truncated: boolean } {
  const docs: FeatureDoc[] = [];
  let seen = 0;
  let truncated = false;
  const walk = (dir: string, depth: number) => {
    if (truncated || depth > SCAN_MAX_DEPTH) return;
    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      if (truncated) return;
      const abs = join(dir, name);
      let st;
      try {
        st = lstatSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(abs, depth + 1);
        continue;
      }
      if (!st.isFile() || !name.endsWith(".md")) continue;
      if (++seen > SCAN_MAX_FILES) {
        truncated = true;
        return;
      }
      if (st.size > DOC_MAX_BYTES) continue;
      // Cheap pre-filter: the feature's name must appear in the head of the file.
      const head = readFileSync(abs).subarray(0, 16384).toString("utf-8");
      if (!head.includes(feature)) continue;
      const d = loadFeatureDoc(root, abs);
      if (d !== null && d.fm.feature === feature) docs.push(d);
    }
  };
  walk(root, 0);
  return { docs, truncated };
}

/**
 * The Task Breakdown the feature's internal review record was taken against — only when the
 * record names it, it still exists, and its body is still the one reviewed. Otherwise the reason.
 */
export function reviewedBreakdown(root: string, feature: string): { rel: string } | { reason: string } | null {
  const abs = join(root, reviewRecordPath(feature));
  if (!existsSync(abs)) return null;
  const split = splitDocument(readFileSync(abs));
  if ("error" in split) return { reason: "the review record cannot be read" };
  const fp = split.inner.map((l) => /^tb_fingerprint: (.*)$/.exec(l)?.[1]).find((v) => v !== undefined);
  const rel = /^- Task Breakdown: `([^`]+)`$/m.exec(split.body.toString("utf-8"))?.[1];
  if (!rel || !fp) return { reason: "the review record names no Task Breakdown" };
  const tb = loadFeatureDoc(root, rel, "task-breakdown");
  if (tb === null) return { reason: `the reviewed Task Breakdown ${rel} no longer exists` };
  if (fingerprintBody(tb.buf) !== fp) return { reason: `the reviewed Task Breakdown ${rel} changed since the review` };
  return { rel: tb.rel };
}

export interface ResolvedFeatureDocs {
  ok: true;
  feature: string;
  root: string;
  fa: FeatureDoc | null;
  dd: FeatureDoc | null;
  tb: FeatureDoc | null;
  devPlan: FeatureDoc | null;
  /** How each document was found: named by the developer, through a link, by the scan, or by the review record. */
  resolved_by: Partial<Record<FeatureDocKind, "anchor" | "link" | "scan" | "review-record">>;
  /** Every planning document that names this feature — kept, preserved or versioned copies included. */
  related: string[];
  warnings: string[];
}
export interface FeatureDocsStop {
  ok: false;
  outcome: "FEATURE_ID_INVALID" | "FEATURE_ROOT_INVALID" | "AMBIGUOUS" | "LINK_BROKEN" | "SCAN_LIMIT" | "DOC_NOT_PLANNING";
  reason: string;
  kind?: FeatureDocKind;
  candidates?: string[];
}

/**
 * The feature's planning documents. `anchor` (a document path the developer named) wins for its
 * own stage; links win over the scan for every stage they reach.
 */
export function resolveFeatureDocs(rootIn: string, feature: string, anchor?: string | null): ResolvedFeatureDocs | FeatureDocsStop {
  if (!FEATURE_SLUG.test(feature ?? "") || feature.includes("..")) return { ok: false, outcome: "FEATURE_ID_INVALID", reason: `"${feature}" is not a feature name (letters, digits, '.', '_' and '-')` };
  if (!rootIn || !existsSync(rootIn) || !statSync(rootIn).isDirectory()) return { ok: false, outcome: "FEATURE_ROOT_INVALID", reason: `repository root ${rootIn ?? ""} does not exist` };
  const root = realpathSync(rootIn);
  const warnings: string[] = [];
  const resolved_by: ResolvedFeatureDocs["resolved_by"] = {};

  let anchorDoc: FeatureDoc | null = null;
  if (anchor) {
    anchorDoc = loadFeatureDoc(root, anchor);
    if (anchorDoc === null) return { ok: false, outcome: "DOC_NOT_PLANNING", reason: `${anchor} is not a feature planning document inside the repository` };
    if (anchorDoc.fm.feature !== feature) warnings.push(`${anchorDoc.rel} names feature "${anchorDoc.fm.feature}", not "${feature}"`);
  }
  const scan = scanFeatureDocs(root, feature);
  const isStop = (x: unknown): x is FeatureDocsStop => typeof x === "object" && x !== null && (x as FeatureDocsStop).ok === false;
  const linked = (role: FeatureDocKind, from: FeatureDoc | null, key: string): FeatureDoc | null | FeatureDocsStop => {
    const v = from?.fm[key];
    if (!v) return null;
    const d = loadFeatureDoc(root, v, role);
    if (d === null) return { ok: false, outcome: "LINK_BROKEN", reason: `${from!.rel} links ${key}: ${v}, which is not a ${role} document in the repository`, kind: role };
    if (d.fm.feature !== feature) warnings.push(`${d.rel} (linked from ${from!.rel}) names feature "${d.fm.feature}"`);
    resolved_by[role] = "link";
    return d;
  };
  const fromScan = (role: FeatureDocKind, exclude: Array<FeatureDoc | null>): FeatureDoc | null | FeatureDocsStop => {
    const skip = new Set(exclude.filter((d): d is FeatureDoc => d !== null).map((d) => d.rel));
    const c = scan.docs.filter((d) => fits(d.shape, role) && !skip.has(d.rel)).map((d) => ({ ...d, kind: role }));
    // An explicit shape outranks the overlapping one: one real Feature Analysis beside legacy-shaped files is that one.
    const exact = c.filter((d) => d.shape === role);
    const pool = exact.length === 1 && role === "feature-analysis" ? exact : c;
    if (pool.length > 1) return { ok: false, outcome: "AMBIGUOUS", reason: `${pool.length} documents could be the ${role} of feature "${feature}" — name the one meant with --doc`, kind: role, candidates: pool.map((d) => d.rel) };
    if (pool.length === 1) {
      resolved_by[role] = "scan";
      return pool[0];
    }
    if (scan.truncated) return { ok: false, outcome: "SCAN_LIMIT", reason: `the repository has more than ${SCAN_MAX_FILES} Markdown files — name a planning document with --doc`, kind: role };
    return null;
  };
  const pick = (role: FeatureDocKind, links: Array<[FeatureDoc | null, string]>, exclude: Array<FeatureDoc | null>): FeatureDoc | null | FeatureDocsStop => {
    const a = anchorDoc;
    if (a !== null && (a.shape === role || (role === "feature-analysis" && a.shape === "fa-or-plan" && !exclude.some((d) => d?.rel === a.rel)))) {
      resolved_by[role] = "anchor";
      return { ...a, kind: role };
    }
    for (const [from, key] of links) {
      const d = linked(role, from, key);
      if (d !== null) return d;
    }
    return fromScan(role, exclude);
  };

  // The breakdown: the anchor, else the scan; several → the reviewed one, when the review still matches it.
  let tb: FeatureDoc | null | FeatureDocsStop;
  if (anchorDoc?.shape === "task-breakdown") {
    resolved_by["task-breakdown"] = "anchor";
    tb = anchorDoc;
  } else {
    tb = fromScan("task-breakdown", []);
    if (isStop(tb) && tb.outcome === "AMBIGUOUS") {
      const r = reviewedBreakdown(root, feature);
      if (r !== null && "rel" in r && tb.candidates?.includes(r.rel)) {
        tb = loadFeatureDoc(root, r.rel, "task-breakdown") as FeatureDoc;
        resolved_by["task-breakdown"] = "review-record";
        warnings.push(`several Task Breakdowns name feature "${feature}"; using ${r.rel}, the one the internal review was taken against`);
      } else if (r !== null && "reason" in r) {
        tb = { ...tb, reason: `${tb.reason} (${r.reason})` };
      }
    }
  }
  if (isStop(tb)) return tb;
  const dd = pick("dd", [[tb, "dd_link"]], []);
  if (isStop(dd)) return dd;
  // A Dev Plan exists only beside a breakdown; its link says which overlapping-shape file it is.
  let devPlan: FeatureDoc | null | FeatureDocsStop = tb === null ? null : linked("dev-plan", tb, "dev_plan_link");
  if (isStop(devPlan)) return devPlan;
  const fa = pick("feature-analysis", [[tb, "feature_analysis_link"], [dd, "feature_analysis_link"]], [devPlan]);
  if (isStop(fa)) return fa;
  if (devPlan === null && tb !== null) {
    devPlan = fromScan("dev-plan", [fa]);
    if (isStop(devPlan)) return devPlan;
  }
  const related = [...new Set([...scan.docs.map((d) => d.rel), ...[fa, dd, tb, devPlan].filter((d): d is FeatureDoc => d !== null).map((d) => d.rel)])].sort();
  return { ok: true, feature, root, fa, dd, tb, devPlan, resolved_by, related, warnings };
}

/** The repository-relative paths of the feature's resolved planning documents (the ones a PR must carry). */
export function planningDocPaths(r: ResolvedFeatureDocs): string[] {
  return [r.fa, r.dd, r.tb, r.devPlan].filter((d): d is FeatureDoc => d !== null).map((d) => d.rel);
}

/**
 * Whether a path is one of the feature's planning documents — resolved or not. A preserved or
 * versioned copy is still a planning document: it is never mistaken for code in the PR scope.
 */
export function isFeatureDocPath(r: ResolvedFeatureDocs): (rel: string) => boolean {
  const all = new Set([...planningDocPaths(r), ...r.related]);
  return (rel) => all.has(rel);
}
