/**
 * migrate-planning-doc.ts
 *
 * The SHARED-011 legacy planning-document migration framework. Detects which
 * frontmatter contract version a planning document was written against, applies
 * the sequential chain of migrations up to the current version, and rewrites
 * ONLY the frontmatter block. See docs/planning-doc-contract.md for the contract
 * and the authoring rules, and
 * docs/planning/SHARED-011-legacy-document-migration-design.md for the approved
 * design this implements.
 *
 * This is the ONLY component in this plugin that understands historical document
 * shapes. Commands and skills receive its normalized output via the
 * `planning-doc-migration` skill and never parse a legacy shape themselves — so
 * a contract change is one appended migration, not an edit to every consumer.
 *
 * GUARANTEES (each enforced below, each covered by a test):
 *   - Body bytes are never parsed for rewriting and never change. The body is
 *     held as an opaque Buffer slice and asserted byte-identical before writing.
 *   - `feature`, `status`, `author`, `date` can never be written. A step that
 *     tries rejects the WHOLE migration; nothing is written.
 *   - Fully deterministic and CLOCK-FREE. No Date, no clock, no randomness, so
 *     the same input always produces the same output. (SHARED-011 removed the
 *     `migrated_at` field and the `--now` flag for exactly this reason — see
 *     docs/planning-doc-contract.md, "Clock-free by construction".)
 *   - Idempotent. A document stamped at the current version short-circuits
 *     before any chain logic and is never rewritten.
 *   - Ambiguous values are NEVER guessed. They return `needs-input` with the
 *     file left byte-untouched.
 *
 * CRITICAL: this helper ALWAYS exits 0 and ALWAYS prints a valid JSON object,
 * including for every failure mode. Callers branch on `status`, never on the
 * exit code — the same posture as read-repo-knowledge.ts, and deliberately
 * unlike resolve-target-repo-root.ts, because a caller here must distinguish
 * nine outcomes.
 *
 * Runtime: Node >= 23.6 (`node scripts/migrate-planning-doc.ts`) or Bun. No
 * external deps, and it does NOT rely on CLAUDE_PLUGIN_ROOT or
 * CLAUDE_PROJECT_DIR.
 *
 * Node emits an ExperimentalWarning on stderr for direct .ts execution, so
 * `--no-warnings` is part of the canonical invocation below — without it, a
 * caller that merges stderr into stdout would be handed non-JSON.
 *
 * Usage:
 *   node --no-warnings scripts/migrate-planning-doc.ts <path> --kind <kind> [--check] [--answers '<json>']
 */

import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, statSync, openSync, fsyncSync, closeSync } from "fs";
import { createHash } from "crypto";
import { dirname, join } from "path";

/**
 * This plugin's version, stamped into `migrated_by`. Held as a constant rather
 * than read from plugin.json so the helper performs no I/O beyond the document
 * itself; `scripts/migrate-planning-doc.test.ts` asserts it matches
 * .claude-plugin/plugin.json so the two cannot drift.
 */
export const PLUGIN_VERSION = "0.5.0";

export type DocKind = "feature-analysis" | "dd" | "dev-plan" | "task-breakdown";

/**
 * The current frontmatter contract version per document kind. Must match the
 * version table in docs/planning-doc-contract.md — the test asserts it.
 *
 * feature-analysis is at 3 because its contract moved four times, and dd is at 2
 * since the DD Package contract added `dd_generation` and `dd_complexity_band`
 * (see the contract doc). dev-plan and task-breakdown are declared 1 = "the
 * shape as of plugin 0.5.0"; no migration chain is authored for them yet, so an
 * unstamped document of those kinds is ASSUMED current.
 */
export const CURRENT_SCHEMA_VERSION: Record<DocKind, number> = {
  "feature-analysis": 3,
  dd: 2,
  "dev-plan": 1,
  "task-breakdown": 1,
};

/** Never writable by any migration step. Approval and identity live here. */
export const PROTECTED_KEYS = ["feature", "status", "author", "date"] as const;

/** Written by the runner only; a step that touches one rejects the migration. */
export const FRAMEWORK_METADATA_KEYS = [
  "doc_schema_version",
  "migrated_from_version",
  "migrated_by",
  "migration_inputs",
] as const;

/**
 * Values that look like a filled field but carry no information. Used for
 * SEMANTIC reads only (e.g. "does figma_link actually point at a design?"),
 * never for marker detection — see `isBlank` for that. Treating an ambiguous
 * placeholder as absent routes to `needs-input`, which is the safe direction.
 */
const PLACEHOLDER_VALUES = new Set(["null", "~", "none", "n/a", "na", "tbd", "-", "todo"]);

export type Status =
  | "current"
  | "migrated"
  | "would-migrate"
  | "needs-input"
  | "unsupported"
  | "schema-too-new"
  | "kind-mismatch"
  | "unreadable"
  | "rejected";

export interface Question {
  field: string;
  step: string;
  reason: string;
  options: string[] | null;
}

export interface AppliedOp {
  op: "add" | "fill" | "rename" | "resolve" | "stamp";
  field: string;
  value?: string;
  from?: string;
  provenance: string;
}

export interface MigrateResult {
  path: string;
  kind: DocKind | null;
  encoding: "fenced-yaml" | "delimited" | null;
  detectedVersion: number | null;
  currentVersion: number | null;
  stamped: boolean;
  status: Status;
  changed: boolean;
  steps: Array<{ from: number; to: number; ops: AppliedOp[] }>;
  questions: Question[];
  frontmatterDiff: string | null;
  bodySha256: { before: string | null; after: string | null };
  error: string | null;
  summary: string;
}

// ---------------------------------------------------------------------------
// Frontmatter entries
// ---------------------------------------------------------------------------

interface Entry {
  /** The original line, byte-verbatim, without its EOL. Emitted as-is unless dirty. */
  raw: string;
  /** Top-level key, or null for blank lines, comment lines, indented lines, and anything unparsed. */
  key: string | null;
  value: string;
  /** Trailing `# ...` comment including the hash, or "". */
  comment: string;
  dirty: boolean;
}

/**
 * Split `key: value # comment` conservatively. A `#` only starts a comment when
 * it is at the start of the value region or preceded by whitespace, so
 * `docs/x.md#anchor` and a Figma URL carrying a `#fragment` survive intact.
 */
function splitValueAndComment(rest: string): { value: string; comment: string } {
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "#" && (i === 0 || /\s/.test(rest[i - 1]))) {
      return { value: rest.slice(0, i).trim(), comment: rest.slice(i).trim() };
    }
  }
  return { value: rest.trim(), comment: "" };
}

function parseEntries(inner: string[]): Entry[] {
  return inner.map((raw) => {
    // Only unindented lines are treated as keys, so nested structures anywhere
    // in the block stay opaque and are re-emitted byte-verbatim.
    const m = /^([A-Za-z_][A-Za-z0-9_]*):(.*)$/.exec(raw);
    if (!m) return { raw, key: null, value: "", comment: "", dirty: false };
    const { value, comment } = splitValueAndComment(m[2]);
    return { raw, key: m[1], value, comment, dirty: false };
  });
}

/** Blank = no value at all (the templates ship keys as `field: # explanation`). */
function isBlank(value: string): boolean {
  return value.trim() === "";
}

/** Meaningful = present, non-blank, and not a placeholder. */
function isMeaningful(value: string): boolean {
  const v = value.trim();
  return v !== "" && !PLACEHOLDER_VALUES.has(v.toLowerCase());
}

// ---------------------------------------------------------------------------
// Document splitting — the body is never parsed
// ---------------------------------------------------------------------------

interface Split {
  encoding: "fenced-yaml" | "delimited";
  /** Raw bytes before the frontmatter block. Never re-encoded. */
  leading: Buffer;
  /** The frontmatter block's opening line (`---` or ```` ```yaml ````). */
  open: string;
  inner: string[];
  /** The block's closing line. */
  close: string;
  /** Raw bytes after the frontmatter block. Never parsed, never re-encoded. */
  body: Buffer;
  eol: "\n" | "\r\n";
}

function detectEol(text: string): "\n" | "\r\n" {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;
  return crlf > lf ? "\r\n" : "\n";
}

/**
 * Locate the frontmatter block.
 *
 * Delimited wins when the file starts with `---`, so a `---` document whose BODY
 * contains a ```yaml fence is never mis-split. For the fenced form the scan
 * stops at the first level-2 heading OUTSIDE an HTML comment — the templates are
 * comment-heavy and dev-plan-template.md puts its fence at line 11, behind one.
 */
export function splitDocument(buf: Buffer): Split | { error: string } {
  const text = buf.toString("utf-8");
  const eol = detectEol(text);
  // Offsets are computed in bytes so the body slice is exact for non-ASCII text.
  const lines = text.split(/\r?\n/);

  // Cumulative byte offset of each line's first byte, so the body slice is
  // exact for non-ASCII documents and for either line ending.
  const lineByteStarts: number[] = [];
  {
    let offset = 0;
    let cursor = 0;
    for (const line of lines) {
      lineByteStarts.push(offset);
      cursor += line.length;
      const sep = text.startsWith("\r\n", cursor) ? "\r\n" : text.startsWith("\n", cursor) ? "\n" : "";
      offset += Buffer.byteLength(line, "utf-8") + Buffer.byteLength(sep, "utf-8");
      cursor += sep.length;
    }
  }

  const endOfLineByte = (index: number): number =>
    index + 1 < lineByteStarts.length ? lineByteStarts[index + 1] : buf.length;

  // --- delimited: `---` at the very top (a UTF-8 BOM before it is preserved) ---
  const bomLen = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? 3 : 0;
  const firstLine = lines[0] ?? "";
  const firstLineNoBom = bomLen ? firstLine.replace(/^﻿/, "") : firstLine;
  if (firstLineNoBom.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        return {
          encoding: "delimited",
          leading: buf.subarray(0, lineByteStarts[0]),
          open: firstLine,
          inner: lines.slice(1, i),
          close: lines[i],
          body: buf.subarray(endOfLineByte(i)),
          eol,
        };
      }
    }
    return { error: "document starts with `---` but no closing `---` was found" };
  }

  // --- fenced yaml, before the first level-2 heading outside an HTML comment ---
  let inComment = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Track HTML comment nesting before the heading check, so a `## ` inside a
    // template's explanatory comment does not end the scan.
    let scan = line;
    while (scan.length) {
      if (!inComment) {
        const open = scan.indexOf("<!--");
        if (open === -1) break;
        inComment = true;
        scan = scan.slice(open + 4);
      } else {
        const close = scan.indexOf("-->");
        if (close === -1) {
          scan = "";
          break;
        }
        inComment = false;
        scan = scan.slice(close + 3);
      }
    }
    if (inComment) continue;
    if (/^##\s/.test(line)) {
      return { error: "no frontmatter block found before the first `## ` heading" };
    }
    if (/^```ya?ml\s*$/i.test(line)) {
      for (let j = i + 1; j < lines.length; j++) {
        if (/^```\s*$/.test(lines[j])) {
          return {
            encoding: "fenced-yaml",
            leading: buf.subarray(0, lineByteStarts[i]),
            open: line,
            inner: lines.slice(i + 1, j),
            close: lines[j],
            body: buf.subarray(endOfLineByte(j)),
            eol,
          };
        }
      }
      return { error: "opening ```yaml fence has no closing fence" };
    }
  }
  return { error: "no recognizable frontmatter block (neither a leading `---` block nor a ```yaml block)" };
}

// ---------------------------------------------------------------------------
// Version detection
// ---------------------------------------------------------------------------

interface Marker {
  version: number;
  all?: string[];
  any?: string[];
}

/**
 * Ordered newest-first. Detected version = the highest version whose marker set
 * is satisfied. A marker counts only when the key is present AND non-blank, so
 * a document generated from a newer template but left unfilled is detected at
 * the older version and its blank fields are then filled by the chain.
 *
 * RULE WHEN ADDING A VERSION: choose a marker set that approximates the
 * condition that version's migration step treats as "already done" — ideally a
 * field the step always writes. That is what lets an UNSTAMPED document written
 * against an older contract be detected one version lower and completed.
 *
 * The self-heal it provides is BOUNDED, and neither bound is repaired here:
 *   1. A stamped document short-circuits before detection, so a document
 *      stamped at version N with some of N's fields missing is never repaired.
 *   2. A document that satisfies version N's marker but lacks other fields
 *      N's step writes is detected at N and skipped.
 * Both are reachable only by hand-editing — every generator writes a version's
 * fields together — so widening a marker to chase them buys nothing and would
 * desynchronise the chains (feature-analysis v3 has the same shape: one marker
 * field, six written). See docs/planning-doc-contract.md.
 *
 * Framework metadata keys never participate — adding the stamp is not a version.
 */
const MARKERS: Record<DocKind, Marker[]> = {
  "feature-analysis": [
    { version: 3, all: ["repo_knowledge_status"] },
    { version: 2, all: ["design_reference_status", "design_reference_type", "design_reference"] },
    { version: 1, all: ["platform", "device_type"] },
    { version: 0, all: ["feature", "status"] },
  ],
  dd: [
    { version: 2, all: ["dd_generation"] },
    { version: 1, all: [] },
  ],
  "dev-plan": [{ version: 1, all: [] }],
  "task-breakdown": [{ version: 1, all: [] }],
};

/**
 * Marker fields that belong exclusively to ONE kind — used for kind-mismatch.
 *
 * Only genuinely exclusive fields belong here. `feature_analysis_link` looks
 * like a DD marker but the task breakdown carries it too, so it is not one.
 * See docs/planning-doc-contract.md, "Known limitations": feature-analysis and
 * dev-plan are not distinguishable from each other at all, so this is a
 * negative check only.
 */
const EXCLUSIVE_MARKERS: Array<{ kind: DocKind; fields: string[] }> = [
  { kind: "dd", fields: ["detail_level"] },
  { kind: "task-breakdown", fields: ["dev_plan_link"] },
];

export function detectVersion(kind: DocKind, entries: Entry[]): number | null {
  const filled = new Set(entries.filter((e) => e.key && !isBlank(e.value)).map((e) => e.key as string));
  for (const marker of MARKERS[kind]) {
    const allOk = (marker.all ?? []).every((f) => filled.has(f));
    const anyOk = marker.any ? marker.any.some((f) => filled.has(f)) : true;
    if (allOk && anyOk) return marker.version;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Migration steps
// ---------------------------------------------------------------------------

type StepOp =
  | { op: "set"; field: string; value: string; provenance: string }
  | { op: "rename"; from: string; to: string }
  | { op: "resolve"; field: string; value: string; provenance: string };

interface FrontmatterView {
  has(field: string): boolean;
  value(field: string): string;
  /** Present with a real, non-placeholder value. */
  meaningful(field: string): boolean;
}

interface StepContext {
  fm: FrontmatterView;
  /** The document body, decoded read-only for evidence. NEVER written. */
  bodyText: string;
  answers: Record<string, string>;
}

interface Migration {
  from: number;
  to: number;
  /** Fields this step may `resolve`, and the only current values that permit it. */
  resolvable: Record<string, string[]>;
  apply(ctx: StepContext): { ops: StepOp[]; questions: Question[] };
}

const PLATFORMS = ["react-native", "react", "ios", "android"];
const DEVICE_TYPES = ["mobile", "tv"];
const NON_FIGMA_REFERENCE_TYPES = ["document", "screenshots", "existing_ui", "other"];

/**
 * The only body-derived inference in the framework, and deliberately the
 * narrowest one that can be called deterministic: an explicitly LABELLED device
 * line, resolving to exactly one distinct value across the whole document.
 *
 * Prose mentions of "TV" are NOT evidence. This organisation's Android TV
 * surface uses a custom in-house framework, so the conventional signals are
 * absent or misleading and a keyword heuristic would be confidently wrong —
 * see SHARED-011 §8.4.
 */
export function labelledDeviceType(bodyText: string): string | null {
  const re = /^[\s\-*#>|]*(?:\*\*)?\s*device[ _-]?type(?:\*\*)?\s*[:：—-]\s*(?:\*\*)?\s*(mobile|tv)\b/gim;
  const found = new Set<string>();
  for (const m of bodyText.matchAll(re)) found.add(m[1].toLowerCase());
  return found.size === 1 ? [...found][0] : null;
}

/**
 * Complete the v2 design-reference triple from whatever the document already
 * carries, or return the single question that must be answered.
 *
 * Deterministic paths, in order: an existing status that implies the rest; a
 * recorded Figma link; a supplied answer. Everything else asks — v0/v1 had no
 * way to distinguish "this feature needs no design reference" from "this is a
 * UI feature whose reference was never recorded", and the two drive different
 * /dev-design-start branches.
 */
function resolveDesignReference(
  fm: FrontmatterView,
  answers: Record<string, string>,
  statusVal: string,
  typeVal: string,
  refVal: string
): { status: string; type: string; reference: string; provenance: string } | { question: Question } {
  const ask: { question: Question } = {
    question: {
      field: "design_reference_status",
      step: "v1->v2",
      reason:
        "This analysis predates the design-reference block and records no Figma link, so it cannot distinguish " +
        "`not_required` (the feature changes no user-facing UI) from a UI feature whose reference was never " +
        "recorded. Answer `not_required`, or answer `provided` and also supply `design_reference_type` (" +
        NON_FIGMA_REFERENCE_TYPES.join(" | ") +
        ") and `design_reference`.",
      options: ["not_required", "provided"],
    },
  };

  const figma = fm.meaningful("figma_link");

  // An already-recorded status implies the rest wherever that is unambiguous.
  if (statusVal === "not_required") {
    return { status: "not_required", type: typeVal || "none", reference: refVal || "null", provenance: "derived" };
  }
  if (statusVal === "provided") {
    if (typeVal === "figma" || (typeVal === "" && figma)) {
      return { status: "provided", type: "figma", reference: refVal || "null", provenance: "derived" };
    }
    if (typeVal !== "" && refVal !== "") {
      return { status: "provided", type: typeVal, reference: refVal, provenance: "derived" };
    }
    return ask;
  }

  // No status recorded.
  if (figma) {
    return { status: "provided", type: typeVal || "figma", reference: refVal || "null", provenance: "derived" };
  }
  if (answers.design_reference_status === "not_required") {
    return { status: "not_required", type: "none", reference: "null", provenance: "human@migration" };
  }
  if (
    answers.design_reference_status === "provided" &&
    NON_FIGMA_REFERENCE_TYPES.includes(answers.design_reference_type ?? "") &&
    isMeaningful(answers.design_reference ?? "")
  ) {
    return {
      status: "provided",
      type: answers.design_reference_type,
      reference: answers.design_reference,
      provenance: "human@migration",
    };
  }
  return ask;
}

/**
 * FEATURE ANALYSIS CHAIN — FROZEN ONCE RELEASED.
 *
 * Never edit a released step to accommodate a later contract change; that is the
 * next step's job. Editing one silently changes every document that already
 * passed through it. See docs/planning-doc-contract.md.
 */
const FEATURE_ANALYSIS_MIGRATIONS: Migration[] = [
  {
    // v0 -> v1: the platform/device context fields (commit 6c56ec5).
    from: 0,
    to: 1,
    resolvable: {},
    apply({ fm, bodyText, answers }) {
      const ops: StepOp[] = [];
      const questions: Question[] = [];

      if (!fm.meaningful("platform")) {
        const answer = answers.platform;
        if (answer && PLATFORMS.includes(answer)) {
          ops.push({ op: "set", field: "platform", value: answer, provenance: "human@migration" });
        } else {
          questions.push({
            field: "platform",
            step: "v0->v1",
            reason:
              "This analysis predates the `platform` field and the document carries no platform evidence. " +
              "Exactly one platform must be confirmed by a human.",
            // v1 also permitted `mixed`, but v2 forbids it — offering it here
            // would only force a second question, so the four single platforms
            // are the options. The result is a narrower but entirely legal v1.
            options: PLATFORMS,
          });
        }
      }

      if (!fm.meaningful("device_type")) {
        const answer = answers.device_type;
        const derived = labelledDeviceType(bodyText);
        if (answer && DEVICE_TYPES.includes(answer)) {
          ops.push({ op: "set", field: "device_type", value: answer, provenance: "human@migration" });
        } else if (derived) {
          ops.push({ op: "set", field: "device_type", value: derived, provenance: "document-evidence" });
        } else {
          questions.push({
            field: "device_type",
            step: "v0->v1",
            reason:
              "This analysis predates the `device_type` field and carries no explicitly labelled device line. " +
              "SHARED-011 is a document compatibility layer, not repository re-analysis — the device target is " +
              "never inferred from repository signals or from prose.",
            options: DEVICE_TYPES,
          });
        }
      }

      return { ops, questions };
    },
  },
  {
    // v1 -> v2: the design-reference block replaces figma-only input, and
    // `platform: mixed` becomes illegal (commit c90c78c).
    from: 1,
    to: 2,
    resolvable: { platform: ["mixed"] },
    apply({ fm, answers }) {
      const ops: StepOp[] = [];
      const questions: Question[] = [];

      const statusVal = fm.value("design_reference_status").trim();
      const typeVal = fm.value("design_reference_type").trim();
      const refVal = fm.value("design_reference").trim();
      const complete = statusVal !== "" && typeVal !== "" && refVal !== "";

      if (!complete) {
        const resolved = resolveDesignReference(fm, answers, statusVal, typeVal, refVal);
        if ("question" in resolved) {
          questions.push(resolved.question);
        } else {
          // Emit only the fields that are actually blank, so a partially
          // hand-edited document is completed rather than overwritten.
          if (statusVal === "")
            ops.push({ op: "set", field: "design_reference_status", value: resolved.status, provenance: resolved.provenance });
          if (typeVal === "")
            ops.push({ op: "set", field: "design_reference_type", value: resolved.type, provenance: resolved.provenance });
          if (refVal === "")
            ops.push({ op: "set", field: "design_reference", value: resolved.reference, provenance: resolved.provenance });
          // v2 requires the key to exist even when there is no link. A
          // meaningful link is never touched; a blank one is filled with `null`.
          if (!fm.meaningful("figma_link")) {
            ops.push({ op: "set", field: "figma_link", value: "null", provenance: "derived" });
          }
        }
      }

      if (fm.value("platform").trim() === "mixed") {
        const answer = answers.platform;
        if (answer && PLATFORMS.includes(answer)) {
          ops.push({ op: "resolve", field: "platform", value: answer, provenance: "human@migration" });
        } else {
          questions.push({
            field: "platform",
            step: "v1->v2",
            reason:
              "`platform: mixed` was legal in v1 and is forbidden from v2 onward. A feature carries exactly " +
              "one confirmed platform, and only a human can decide which.",
            options: PLATFORMS,
          });
        }
      }

      return { ops, questions };
    },
  },
  {
    // v2 -> v3: the repository-knowledge citation fields (commit 2cadba7).
    //
    // Fully deterministic and deliberately NOT resolved from the repository. A
    // pre-v3 analysis embedded repo-analyst's findings verbatim at authoring
    // time, which is exactly what `repo_knowledge_status: unavailable` means in
    // skills/repo-knowledge-consumer/SKILL.md — so these values record a fact
    // rather than a convenient default. Resolving live knowledge here would
    // assert that canonical knowledge informed a document written before the
    // manifest existed.
    //
    // Only the FRONTMATTER half of the consumer skill's Step 6 block is written.
    // The `## Repo Knowledge Reference` body section is a body change and is
    // therefore never written; the loader reports this so /dev-design-start can
    // record it in the DD's §23 Assumptions.
    from: 2,
    to: 3,
    resolvable: {},
    apply({ fm }) {
      // If the document already asserts a knowledge state, the framework does
      // not second-guess it — compatibility is not repair. Any blank siblings
      // stay blank and are inert: /dev-design-start re-resolves knowledge from
      // its own run and never copies these values forward.
      if (fm.meaningful("repo_knowledge_status")) return { ops: [], questions: [] };
      const p = "derived";
      return {
        questions: [],
        ops: [
          { op: "set", field: "repo_knowledge_status", value: "unavailable", provenance: p },
          { op: "set", field: "repo_knowledge_schema", value: "null", provenance: p },
          { op: "set", field: "repo_knowledge_fingerprint", value: "null", provenance: p },
          { op: "set", field: "repo_knowledge_freshness", value: "null", provenance: p },
          { op: "set", field: "repo_knowledge_reused", value: "none", provenance: p },
          {
            op: "set",
            field: "repo_knowledge_derived",
            // Mirrors read-repo-knowledge.ts ALL_CATEGORIES verbatim — the
            // consumer skill forbids summarizing, reordering, or abbreviating.
            value: "stack, commands, structure, inventory, conventions, integrations, auditTopics",
            provenance: p,
          },
        ],
      };
    },
  },
];

/**
 * DETAILED DESIGN CHAIN — FROZEN ONCE RELEASED, same rule as the FA chain.
 */
const DD_MIGRATIONS: Migration[] = [
  {
    // v1 -> v2: the DD Package contract's frontmatter half (plugin 0.6.0).
    //
    // Fully deterministic, never asks. Every DD that exists today was produced
    // by single-document generation, so `single` records a fact rather than a
    // default. The complexity band is `unassessed` because the assessment did
    // not exist when the document was written — inventing a band here would
    // require re-deriving repository state the author never saw, which is
    // exactly what this framework refuses to do.
    from: 1,
    to: 2,
    resolvable: {},
    apply({ fm }) {
      const ops: StepOp[] = [];
      if (!fm.meaningful("dd_generation")) {
        ops.push({ op: "set", field: "dd_generation", value: "single", provenance: "derived" });
      }
      if (!fm.meaningful("dd_complexity_band")) {
        ops.push({ op: "set", field: "dd_complexity_band", value: "unassessed", provenance: "derived" });
      }
      return { ops, questions: [] };
    },
  },
];

const MIGRATIONS: Record<DocKind, Migration[]> = {
  "feature-analysis": FEATURE_ANALYSIS_MIGRATIONS,
  dd: DD_MIGRATIONS,
  "dev-plan": [],
  "task-breakdown": [],
};

/**
 * Canonical key order per kind, used to place newly added keys so a migrated
 * document reads like a freshly generated one. Keys not listed keep their
 * position; new keys with no anchor are appended.
 */
const CANONICAL_ORDER: Record<DocKind, string[]> = {
  "feature-analysis": [
    "doc_schema_version",
    "feature",
    "dd_link",
    "design_reference_status",
    "design_reference_type",
    "design_reference",
    "figma_link",
    "platform",
    "device_type",
    "repo_knowledge_status",
    "repo_knowledge_schema",
    "repo_knowledge_fingerprint",
    "repo_knowledge_freshness",
    "repo_knowledge_reused",
    "repo_knowledge_derived",
    "author",
    "status",
    "date",
    "migrated_from_version",
    "migrated_by",
    "migration_inputs",
  ],
  dd: [
    "doc_schema_version",
    "feature",
    "feature_analysis_link",
    "design_reference_status",
    "design_reference_type",
    "design_reference",
    "figma_link",
    "platform",
    "device_type",
    "repo_knowledge_status",
    "repo_knowledge_schema",
    "repo_knowledge_fingerprint",
    "repo_knowledge_freshness",
    "repo_knowledge_reused",
    "repo_knowledge_derived",
    "author",
    "status",
    "detail_level",
    "dd_generation",
    "dd_complexity_band",
    "date",
    "migrated_from_version",
    "migrated_by",
    "migration_inputs",
  ],
  "dev-plan": ["doc_schema_version", "migrated_from_version", "migrated_by", "migration_inputs"],
  "task-breakdown": ["doc_schema_version", "migrated_from_version", "migrated_by", "migration_inputs"],
};

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

class Rejected extends Error {}

function viewOf(entries: Entry[]): FrontmatterView {
  const find = (field: string) => entries.find((e) => e.key === field);
  return {
    has: (field) => find(field) !== undefined,
    value: (field) => find(field)?.value ?? "",
    meaningful: (field) => {
      const e = find(field);
      return e !== undefined && isMeaningful(e.value);
    },
  };
}

function insertEntry(entries: Entry[], kind: DocKind, key: string, line: string): void {
  const order = CANONICAL_ORDER[kind];
  const target = order.indexOf(key);
  const fresh: Entry = { raw: line, key, value: "", comment: "", dirty: false };
  if (target !== -1) {
    // After the last existing key that precedes it canonically.
    for (let i = entries.length - 1; i >= 0; i--) {
      const k = entries[i].key;
      if (k && order.indexOf(k) !== -1 && order.indexOf(k) < target) {
        entries.splice(i + 1, 0, fresh);
        return;
      }
    }
    // Otherwise before the first existing key that follows it canonically.
    for (let i = 0; i < entries.length; i++) {
      const k = entries[i].key;
      if (k && order.indexOf(k) > target) {
        entries.splice(i, 0, fresh);
        return;
      }
    }
  }
  entries.push(fresh);
}

function renderLine(key: string, value: string, comment: string): string {
  return comment ? `${key}: ${value} ${comment}` : `${key}: ${value}`;
}

/**
 * Apply one operation. Every rejection path throws, and the caller writes
 * nothing — a partially applied chain never reaches disk.
 */
function applyOp(
  entries: Entry[],
  kind: DocKind,
  op: StepOp,
  resolvable: Record<string, string[]>,
  fromStep: boolean,
  applied: AppliedOp[]
): void {
  const field = op.op === "rename" ? op.to : op.field;
  const touched = op.op === "rename" ? [op.from, op.to] : [field];

  for (const key of touched) {
    if ((PROTECTED_KEYS as readonly string[]).includes(key)) {
      throw new Rejected(`migration step attempted to write the protected key \`${key}\``);
    }
    if (fromStep && (FRAMEWORK_METADATA_KEYS as readonly string[]).includes(key)) {
      throw new Rejected(`migration step attempted to write framework metadata key \`${key}\``);
    }
  }

  const find = (k: string) => entries.find((e) => e.key === k);

  if (op.op === "rename") {
    const src = find(op.from);
    if (!src) throw new Rejected(`rename source \`${op.from}\` does not exist`);
    const dst = find(op.to);
    if (dst && !isBlank(dst.value)) throw new Rejected(`rename target \`${op.to}\` already has a value`);
    if (dst) {
      dst.value = src.value;
      dst.comment = dst.comment || src.comment;
      dst.dirty = true;
      dst.raw = renderLine(op.to, dst.value, dst.comment);
    } else {
      insertEntry(entries, kind, op.to, renderLine(op.to, src.value, src.comment));
    }
    entries.splice(entries.indexOf(src), 1);
    applied.push({ op: "rename", field: op.to, from: op.from, value: src.value, provenance: "carried" });
    return;
  }

  if (op.op === "resolve") {
    const allowed = resolvable[op.field];
    if (!allowed) throw new Rejected(`\`${op.field}\` is not declared resolvable by this step`);
    const existing = find(op.field);
    if (!existing) throw new Rejected(`resolve target \`${op.field}\` does not exist`);
    if (!allowed.includes(existing.value.trim())) {
      throw new Rejected(
        `\`${op.field}\` currently holds \`${existing.value.trim()}\`, which is not one of this step's declared invalid values (${allowed.join(", ")})`
      );
    }
    existing.value = op.value;
    existing.dirty = true;
    existing.raw = renderLine(op.field, op.value, existing.comment);
    applied.push({ op: "resolve", field: op.field, value: op.value, provenance: op.provenance });
    return;
  }

  // op.op === "set" -> add (absent) | stamp (runner metadata) | fill (blank) | reject
  const existing = find(op.field);
  if (!existing) {
    insertEntry(entries, kind, op.field, renderLine(op.field, op.value, ""));
    applied.push({ op: "add", field: op.field, value: op.value, provenance: op.provenance });
    return;
  }
  if (existing.value.trim() === op.value.trim()) return; // already correct — no-op
  if (!isBlank(existing.value)) {
    // The runner owns the framework metadata keys and must be able to ADVANCE
    // them — migrating an already-stamped document from v1 to v2 necessarily
    // overwrites `doc_schema_version`, and a document migrated twice
    // necessarily overwrites `migrated_from_version` / `migrated_by`.
    //
    // This is the ONLY overwrite the framework permits, and it is unreachable
    // from a step: FRAMEWORK_METADATA_KEYS is rejected for `fromStep` above,
    // and PROTECTED_KEYS is rejected unconditionally, so approval and identity
    // stay unwritable by either party.
    const runnerOwnsIt = !fromStep && (FRAMEWORK_METADATA_KEYS as readonly string[]).includes(op.field);
    if (!runnerOwnsIt) {
      throw new Rejected(
        `\`${op.field}\` already holds a value (\`${existing.value.trim()}\`); a migration may not overwrite an existing value`
      );
    }
    const previous = existing.value.trim();
    existing.value = op.value;
    existing.dirty = true;
    existing.raw = renderLine(op.field, op.value, existing.comment);
    applied.push({ op: "stamp", field: op.field, from: previous, value: op.value, provenance: op.provenance });
    return;
  }
  // `fill`: the key exists but carries no value (the templates ship keys as
  // `field: # explanation`). No human decision is being overwritten, so this is
  // add-only semantics applied to an empty slot. Position and comment survive.
  existing.value = op.value;
  existing.dirty = true;
  existing.raw = renderLine(op.field, op.value, existing.comment);
  applied.push({ op: "fill", field: op.field, value: op.value, provenance: op.provenance });
}

function unifiedDiff(before: string[], after: string[]): string {
  const out: string[] = [];
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  for (const line of before) if (!afterSet.has(line)) out.push(`- ${line}`);
  for (const line of after) if (!beforeSet.has(line)) out.push(`+ ${line}`);
  return out.join("\n");
}

function fail(path: string, status: Status, error: string, extra: Partial<MigrateResult> = {}): MigrateResult {
  return {
    path,
    kind: null,
    encoding: null,
    detectedVersion: null,
    currentVersion: null,
    stamped: false,
    status,
    changed: false,
    steps: [],
    questions: [],
    frontmatterDiff: null,
    bodySha256: { before: null, after: null },
    error,
    summary: error,
    ...extra,
  };
}

export interface MigrateOptions {
  kind: DocKind;
  check?: boolean;
  answers?: Record<string, string>;
}

export function migratePlanningDoc(path: string, options: MigrateOptions): MigrateResult {
  const { kind, check = false, answers = {} } = options;

  if (!existsSync(path) || !statSync(path).isFile()) {
    return fail(path, "unreadable", `File not found: ${path}`);
  }

  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch (err) {
    return fail(path, "unreadable", `Could not read ${path}: ${(err as Error).message}`);
  }

  const split = splitDocument(buf);
  if ("error" in split) {
    return fail(path, "unsupported", `${path}: ${split.error}`);
  }

  const entries = parseEntries(split.inner);
  const view = viewOf(entries);

  // Kind check first, so a mis-addressed document is refused before any
  // version logic runs against the wrong chain.
  for (const { kind: otherKind, fields } of EXCLUSIVE_MARKERS) {
    if (otherKind === kind) continue;
    const hit = fields.find((f) => view.has(f));
    if (hit) {
      return fail(
        path,
        "kind-mismatch",
        `${path} carries \`${hit}\`, which belongs to a ${otherKind} document, but --kind ${kind} was requested.`,
        { encoding: split.encoding }
      );
    }
  }

  const current = CURRENT_SCHEMA_VERSION[kind];
  const stampRaw = view.value("doc_schema_version").trim();
  const stamped = stampRaw !== "" && /^\d+$/.test(stampRaw);
  const stampedVersion = stamped ? Number(stampRaw) : null;

  if (stampedVersion !== null && stampedVersion > current) {
    return fail(
      path,
      "schema-too-new",
      `${path} is stamped doc_schema_version ${stampedVersion}; this plugin supports up to ${current} for ${kind}. Upgrade ono-mobile-dev-plugin.`,
      { kind, encoding: split.encoding, detectedVersion: stampedVersion, currentVersion: current, stamped: true }
    );
  }

  // --- the true no-op: stamped at current. No chain, no serialization, no write. ---
  if (stampedVersion === current) {
    return {
      path,
      kind,
      encoding: split.encoding,
      detectedVersion: current,
      currentVersion: current,
      stamped: true,
      status: "current",
      changed: false,
      steps: [],
      questions: [],
      frontmatterDiff: null,
      bodySha256: { before: null, after: null },
      error: null,
      summary: `${path} is already at ${kind} schema v${current}. No action taken.`,
    };
  }

  const detected = stampedVersion ?? detectVersion(kind, entries);
  if (detected === null) {
    return fail(path, "unsupported", `${path}: no ${kind} schema version could be detected from its frontmatter.`, {
      kind,
      encoding: split.encoding,
      currentVersion: current,
    });
  }

  const bodyShaBefore = createHash("sha256").update(split.body).digest("hex");
  const beforeLines = entries.map((e) => e.raw);
  const bodyText = split.body.toString("utf-8");

  // --- collect pass: run the whole chain to gather EVERY question at once ---
  const chain = MIGRATIONS[kind].filter((m) => m.from >= detected && m.to <= current);
  const allQuestions: Question[] = [];
  {
    const probeEntries = entries.map((e) => ({ ...e }));
    for (const step of chain) {
      const { questions } = step.apply({ fm: viewOf(probeEntries), bodyText, answers });
      for (const q of questions) if (!allQuestions.some((x) => x.field === q.field)) allQuestions.push(q);
      // The probe deliberately does not apply ops; no FA step's questions depend
      // on another step's answer, so one pass collects them all. A future chain
      // that breaks that property simply asks again after the first answers.
    }
  }
  if (allQuestions.length > 0) {
    return {
      path,
      kind,
      encoding: split.encoding,
      detectedVersion: detected,
      currentVersion: current,
      stamped,
      status: "needs-input",
      changed: false,
      steps: [],
      questions: allQuestions,
      frontmatterDiff: null,
      bodySha256: { before: bodyShaBefore, after: bodyShaBefore },
      error: null,
      summary:
        `${path} is at ${kind} schema v${detected} and needs ${allQuestions.length} answer(s) before it can be ` +
        `migrated to v${current}: ${allQuestions.map((q) => q.field).join(", ")}. The file was not modified.`,
    };
  }

  // --- apply pass ---
  const steps: MigrateResult["steps"] = [];
  const humanAnswered: string[] = [];
  try {
    for (const step of chain) {
      const applied: AppliedOp[] = [];
      const { ops } = step.apply({ fm: viewOf(entries), bodyText, answers });
      for (const op of ops) applyOp(entries, kind, op, step.resolvable, true, applied);
      for (const a of applied) if (a.provenance === "human@migration" && !humanAnswered.includes(a.field)) humanAnswered.push(a.field);
      steps.push({ from: step.from, to: step.to, ops: applied });
    }

    // Runner-owned metadata. `migrated_at` is deliberately absent — the
    // framework is clock-free, and git already records when. See
    // docs/planning-doc-contract.md.
    const runnerOps: AppliedOp[] = [];
    applyOp(entries, kind, { op: "set", field: "doc_schema_version", value: String(current), provenance: "framework" }, {}, false, runnerOps);
    if (detected < current) {
      applyOp(entries, kind, { op: "set", field: "migrated_from_version", value: String(detected), provenance: "framework" }, {}, false, runnerOps);
      applyOp(
        entries,
        kind,
        { op: "set", field: "migrated_by", value: `ono-mobile-dev-plugin ${PLUGIN_VERSION}`, provenance: "framework" },
        {},
        false,
        runnerOps
      );
    }
    if (humanAnswered.length > 0) {
      applyOp(
        entries,
        kind,
        {
          op: "set",
          field: "migration_inputs",
          value: humanAnswered.map((f) => `${f}=human@migration`).join(", "),
          provenance: "framework",
        },
        {},
        false,
        runnerOps
      );
    }
    if (runnerOps.length) steps.push({ from: detected, to: current, ops: runnerOps });
  } catch (err) {
    if (err instanceof Rejected) {
      return fail(path, "rejected", `${path}: migration rejected — ${err.message}. Nothing was written.`, {
        kind,
        encoding: split.encoding,
        detectedVersion: detected,
        currentVersion: current,
        stamped,
      });
    }
    throw err;
  }

  const afterLines = entries.map((e) => e.raw);
  const diff = unifiedDiff(beforeLines, afterLines);
  const changed = diff !== "";

  // --- compose and verify; nothing is written until every check passes ---
  const blockText = [split.open, ...afterLines, split.close].join(split.eol) + split.eol;
  const out = Buffer.concat([split.leading, Buffer.from(blockText, "utf-8"), split.body]);
  const bodyShaAfter = createHash("sha256").update(out.subarray(out.length - split.body.length)).digest("hex");
  if (bodyShaAfter !== bodyShaBefore) {
    return fail(path, "rejected", `${path}: body-preservation assertion failed. Nothing was written.`, {
      kind,
      encoding: split.encoding,
      detectedVersion: detected,
      currentVersion: current,
      stamped,
    });
  }

  const base: MigrateResult = {
    path,
    kind,
    encoding: split.encoding,
    detectedVersion: detected,
    currentVersion: current,
    stamped,
    status: check ? "would-migrate" : "migrated",
    changed,
    steps,
    questions: [],
    frontmatterDiff: diff || null,
    bodySha256: { before: bodyShaBefore, after: bodyShaAfter },
    error: null,
    summary: check
      ? `${path} would migrate from ${kind} schema v${detected} to v${current}. No file was written (--check).`
      : `${path} migrated from ${kind} schema v${detected} to v${current}. Frontmatter only; body unchanged.`,
  };

  if (check) return base;

  // Atomic and durable: write a sibling temp file, flush it to disk, then
  // rename over the original.
  //
  // rename(2) alone already guarantees the visible document is never truncated
  // — a reader sees either the old inode or the new one. The fsync closes the
  // remaining window: without it, a filesystem with delayed allocation can
  // expose the renamed entry before its data blocks land, so a power loss or
  // kernel panic in that window could leave a zero-length document. Flushing
  // first makes "either the old file or the new one" true for that case too.
  const tmp = join(dirname(path), `.${process.pid}.migrate-planning-doc.tmp`);
  try {
    writeFileSync(tmp, out);
    const fd = openSync(tmp, "r+");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* best effort */
    }
    return fail(path, "unreadable", `${path}: could not write migrated document — ${(err as Error).message}. Nothing was written.`, {
      kind,
      encoding: split.encoding,
      detectedVersion: detected,
      currentVersion: current,
      stamped,
    });
  }

  return base;
}

/**
 * Internals exposed so the test suite can exercise the operation validator
 * directly — the "a buggy step must reject the whole migration" guarantee is
 * only meaningful if a deliberately buggy step can be run against it.
 */
export const __testing = {
  applyOp,
  parseEntries,
  viewOf,
  Rejected,
  MARKERS,
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const VALID_KINDS: DocKind[] = ["feature-analysis", "dd", "dev-plan", "task-breakdown"];

function main(): void {
  const argv = process.argv.slice(2);
  const path = argv.find((a) => !a.startsWith("--")) ?? "";
  const kindIndex = argv.indexOf("--kind");
  const kindArg = kindIndex !== -1 ? argv[kindIndex + 1] : undefined;
  const answersIndex = argv.indexOf("--answers");
  const answersArg = answersIndex !== -1 ? argv[answersIndex + 1] : undefined;
  const check = argv.includes("--check");

  const emit = (r: MigrateResult): never => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  };

  if (!path) emit(fail("", "unreadable", "Usage: migrate-planning-doc.ts <path> --kind <kind> [--check] [--answers '<json>']"));
  if (!kindArg || !VALID_KINDS.includes(kindArg as DocKind)) {
    emit(fail(path, "kind-mismatch", `--kind is required and must be one of: ${VALID_KINDS.join(", ")}`));
  }

  let answers: Record<string, string> = {};
  if (answersArg) {
    try {
      const parsed = JSON.parse(answersArg);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not a JSON object");
      answers = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
    } catch (err) {
      emit(fail(path, "unreadable", `--answers is not a valid JSON object: ${(err as Error).message}`));
    }
  }

  emit(migratePlanningDoc(path, { kind: kindArg as DocKind, check, answers }));
}

// Only run the CLI when executed directly, so the test file can import the pure
// functions without triggering process.exit.
const invokedDirectly =
  typeof process !== "undefined" && process.argv[1] !== undefined && /migrate-planning-doc\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main();
}
