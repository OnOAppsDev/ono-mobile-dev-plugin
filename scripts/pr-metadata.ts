/**
 * pr-metadata.ts — the pull request's specification and design references, and its description.
 *
 * Built only from what the work's documents already record — never invented:
 *
 *   specification  the source specification (`source_link`), the Feature Analysis, Detailed
 *                  Design, Task Breakdown and Dev Plan — or, for a bug, the bug report snapshot,
 *                  its external reference and the Bug Work Plan — and the internal review record.
 *   design         the Figma URL with its file key and node id (Figma is the source of truth and
 *                  is never copied into the repository), or the recorded non-Figma reference.
 *   acceptance     the acceptance criteria of the tasks in the pull request.
 *
 * A document stored in the repository is linked at the commit that carries it
 * (`https://bitbucket.org/<ws>/<repo>/src/<sha>/<path>`, or GitHub's `blob/<sha>/` form) — only
 * when HEAD has committed exactly the content in the working tree, so the link shows the exact
 * document the work used. Otherwise it is reported as not committed, without a link. An external
 * URL is passed through as recorded and marked `access not verified` unless the review read it.
 * A bare identifier (a Jira key, say) is shown as text — no URL is ever built from it.
 *
 * Pure: no git, no network, no writes. scripts/pr-readiness.ts gathers the inputs.
 */

import { figmaTarget } from "./figma-ref.ts";
import { isExternalRef } from "./task-resume.ts";

export const PR_METADATA_SCHEMA = 1;
export const REFERENCES_HEADING = "### Ono references (v1)";

export interface Remote {
  host: string;
  owner: string;
  repo: string;
  /** "bitbucket" | "github" | "other" — decides the web link form. */
  kind: "bitbucket" | "github" | "other";
}

/** `git remote get-url origin` → host, owner and repository. Null when it is not a recognisable remote URL. */
export function parseRemote(url: string | null | undefined): Remote | null {
  if (!url) return null;
  const u = url.trim();
  const m = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)(?::\d+)?[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(u);
  if (m === null) return null;
  const host = m[1].toLowerCase();
  return { host, owner: m[2], repo: m[3], kind: host === "bitbucket.org" ? "bitbucket" : host === "github.com" ? "github" : "other" };
}

/** A web link to a repository file at a commit, or null for a host without a known link form. */
export function repoLink(remote: Remote | null, sha: string, path: string): string | null {
  if (remote === null || !/^[0-9a-f]{7,64}$/.test(sha)) return null;
  const p = path.split("/").map(encodeURIComponent).join("/");
  if (remote.kind === "bitbucket") return `https://bitbucket.org/${remote.owner}/${remote.repo}/src/${sha}/${p}`;
  if (remote.kind === "github") return `https://github.com/${remote.owner}/${remote.repo}/blob/${sha}/${p}`;
  return null;
}

export type DocStatus = "in-pr" | "in-base" | "uncommitted" | "missing" | "ignored";
export interface RequiredDoc {
  kind: string;
  label: string;
  path: string;
  status: DocStatus;
}

export type RefStatus = "linked" | "not-committed" | "missing" | "not-applicable" | "identifier-only";
export interface Reference {
  kind: "spec" | "ui" | "review";
  type: string;
  label: string;
  /** Where the reference was recorded: `<document>#<field>`. */
  from: string;
  status: RefStatus;
  url: string | null;
  /** Repository path, for a document stored in git. */
  path?: string;
  /** Figma: the file key and node id, kept verbatim. */
  figma?: { file_key: string; node_id: string | null };
  /** For an external reference: whether this work actually read it. */
  access?: "accessed" | "inaccessible" | "not-verified";
  note?: string;
}

export interface MetadataInput {
  work: { type: "feature" | "bug"; id: string };
  title: string;
  head: string;
  remote: Remote | null;
  docs: RequiredDoc[];
  /** Feature: the analysis's source_link. Bug: the snapshot's external_ref. */
  source: { value: string | null; from: string; label: string };
  design: { status: string | null; type: string | null; reference: string | null; figma_link: string | null; from: string } | null;
  /** The internal review's evidence-based design verification (feature-review.ts `verifyDesign`), or null when there is none. */
  designVerification: string | null;
  acceptance: Array<{ task: string; criterion: string }>;
  review: { status: string; counts: Record<string, number> | null; ui_conformance: string | null; majors: Array<{ path: string | null; line: number | null; rule: string; description: string }> };
  prePr: { status: string; must: number | null; should: number | null };
  /** The commit status of any repository path the references name. */
  statusOf: (path: string) => DocStatus;
}

export function buildMetadata(i: MetadataInput): Record<string, any> {
  const references: Reference[] = [];
  const warnings: Array<{ code: string; message: string }> = [];

  // The source specification — an external URL, a repository document, an identifier, or none.
  const src = i.source.value;
  if (src === null) {
    references.push({ kind: "spec", type: "source-spec", label: i.source.label, from: i.source.from, status: "not-applicable", url: null, note: i.work.type === "feature" ? "the request was given inline" : "no external reference was recorded" });
  } else if (/^https?:\/\//i.test(src)) {
    references.push({ kind: "spec", type: "source-spec", label: i.source.label, from: i.source.from, status: "linked", url: src, access: "not-verified" });
  } else if (isExternalRef(src) || i.work.type === "bug") {
    references.push({ kind: "spec", type: "source-spec", label: i.source.label, from: i.source.from, status: "identifier-only", url: null, note: `"${src}" is recorded without a URL; none is built from it` });
  } else {
    references.push(docReference("spec", "source-spec", i.source.label, i.source.from, src, i.statusOf(src), i));
  }

  for (const d of i.docs) references.push(docReference(d.kind === "internal-review" ? "review" : "spec", d.kind, d.label, `${d.path}`, d.path, d.status, i));

  // Design: Figma is the source of truth — its URL and node id, as recorded.
  if (i.design !== null) {
    const fig = figmaTarget(i.design.figma_link);
    // Access is what the internal review proved with evidence of this exact reference — never a reported status.
    const v = i.designVerification;
    const accessFor = (_ref: string, _key?: string): Reference["access"] => (v === "verified" || v === "local-reference" ? "accessed" : v === "failed" ? "inaccessible" : "not-verified");
    if (v === "wrong-node" || v === "wrong-file") warnings.push({ code: "DESIGN_EVIDENCE_MISMATCH", message: `the design evidence in the internal review is of a different Figma ${v === "wrong-node" ? "node" : "file"} than the reference — UI conformance is not verified` });
    if (v === "stale") warnings.push({ code: "DESIGN_CHANGED", message: "the Figma design differs from the design the Feature Analysis recorded — UI conformance is not verified" });
    if (i.design.status === "not_required") {
      references.push({ kind: "ui", type: "design", label: "Design", from: `${i.design.from}#design_reference_status`, status: "not-applicable", url: null, note: "no user-facing UI change (design_reference_status: not_required)" });
    } else if (fig !== null) {
      const access = accessFor(fig.url, fig.file_key);
      references.push({ kind: "ui", type: "figma", label: "Figma", from: `${i.design.from}#figma_link`, status: "linked", url: fig.url, figma: { file_key: fig.file_key, node_id: fig.node_id }, access });
      if (fig.node_id === null) warnings.push({ code: "FIGMA_NODE_MISSING", message: `the Figma link ${fig.url} names no node-id — reviewers cannot open the exact frame` });
      if (access === "inaccessible") warnings.push({ code: "DESIGN_INACCESSIBLE", message: "the Figma design could not be read during the internal review — UI conformance is not verified" });
      else if (access === "not-verified" && v !== "wrong-node" && v !== "wrong-file" && v !== "stale") warnings.push({ code: "DESIGN_NOT_VERIFIED", message: "no evidence that the Figma design was read during the internal review — UI conformance is not verified" });
    } else if (i.design.figma_link) {
      references.push({ kind: "ui", type: "figma", label: "Figma", from: `${i.design.from}#figma_link`, status: "linked", url: i.design.figma_link, access: accessFor(i.design.figma_link) });
      warnings.push({ code: "FIGMA_LINK_UNRECOGNISED", message: `${i.design.figma_link} is not a Figma design URL with a file key` });
    } else if (i.design.reference) {
      const ref = i.design.reference;
      if (/^https?:\/\//i.test(ref)) references.push({ kind: "ui", type: i.design.type ?? "design", label: "Design reference", from: `${i.design.from}#design_reference`, status: "linked", url: ref, access: accessFor(ref) });
      else if (i.design.type === "existing_ui" || isExternalRef(ref)) references.push({ kind: "ui", type: i.design.type ?? "design", label: "Design reference", from: `${i.design.from}#design_reference`, status: "identifier-only", url: null, note: ref });
      else references.push(docReference("ui", i.design.type ?? "design", "Design reference", `${i.design.from}#design_reference`, ref, i.statusOf(ref), i));
    } else {
      references.push({ kind: "ui", type: "design", label: "Design", from: `${i.design.from}#design_reference`, status: "missing", url: null });
      warnings.push({ code: "DESIGN_REFERENCE_MISSING", message: "the feature records a UI change but no design reference" });
    }
  }
  for (const r of references) if (r.kind !== "ui" && (r.status === "missing" || r.status === "not-committed")) warnings.push({ code: r.status === "missing" ? "DOC_MISSING" : "DOC_NOT_COMMITTED", message: `${r.label} (${r.path ?? r.from}) is ${r.status === "missing" ? "missing" : "not committed — it will not be in the pull request"}` });

  return {
    schema: PR_METADATA_SCHEMA,
    work: i.work,
    title_suggestion: i.title,
    references,
    acceptance_criteria: i.acceptance,
    review_summary: { status: i.review.status, counts: i.review.counts, ui_conformance: i.review.ui_conformance, majors: i.review.majors },
    pre_pr_summary: i.prePr,
    warnings,
    description_markdown: renderDescription(i, references, warnings),
  };
}

function docReference(kind: Reference["kind"], type: string, label: string, from: string, path: string, status: DocStatus, i: MetadataInput): Reference {
  if (status === "missing" || status === "ignored") return { kind, type, label, from, status: "missing", url: null, path };
  if (status === "uncommitted") return { kind, type, label, from, status: "not-committed", url: null, path };
  const url = repoLink(i.remote, i.head, path);
  return { kind, type, label, from, status: "linked", url, path, ...(url === null ? { note: "no web link form for this remote — path shown" } : {}) };
}

const md = (s: string) => s.replace(/([\\`*_[\]])/g, "\\$1");

function renderDescription(i: MetadataInput, refs: Reference[], warnings: Array<{ code: string; message: string }>): string {
  const line = (r: Reference): string => {
    const target = r.url !== null ? `[${md(r.path ?? r.label)}](${r.url})` : r.path ? `\`${r.path}\`` : r.note ? md(r.note) : "";
    const suffix = r.status === "linked" ? (r.access === "not-verified" ? " (access not verified)" : r.access === "inaccessible" ? " (could not be read during review)" : "") : r.status === "not-committed" ? " — not committed, not in this PR" : r.status === "missing" ? " — ⚠️ missing" : r.status === "not-applicable" ? ` — not applicable${r.note ? `: ${md(r.note)}` : ""}` : "";
    const node = r.figma?.node_id ? ` — node \`${r.figma.node_id}\`` : "";
    return `- ${r.label}: ${target}${node}${suffix}`;
  };
  const c = i.review.counts;
  const out = [
    `## ${md(i.title)}`,
    "",
    `${i.work.type === "feature" ? "Feature" : "Bug"}: \`${i.work.id}\``,
    "",
    REFERENCES_HEADING,
    "",
    "**Specification**",
    ...refs.filter((r) => r.kind === "spec").map(line),
    "",
    "**Acceptance criteria (in this PR)**",
    ...(i.acceptance.length ? i.acceptance.map((a) => `- ${a.task} — ${md(a.criterion)}`) : ["- none recorded"]),
    "",
    "**UI / design**",
    ...(refs.some((r) => r.kind === "ui") ? refs.filter((r) => r.kind === "ui").map(line) : ["- not applicable"]),
    "",
    "### Internal review",
    "",
    ...refs.filter((r) => r.kind === "review").map(line),
    `- ${i.review.status === "fresh" ? "Fresh" : `⚠️ ${i.review.status}`}${c ? ` · ${c.blocking ?? 0} blocking · ${c.major ?? 0} major · ${c.minor ?? 0} minor · ${c.nit ?? 0} nit` : ""}${i.review.ui_conformance ? ` · UI conformance: ${i.review.ui_conformance}` : ""}`,
    ...i.review.majors.map((m) => `- Major: ${m.path ? `\`${m.path}${m.line ? `:${m.line}` : ""}\` ` : ""}[${m.rule}] ${md(m.description)}`),
    "",
    "### Pre-PR",
    "",
    i.prePr.status === "fresh" ? `- Regression checklist completed (${i.prePr.must ?? 0} 🔴 must / ${i.prePr.should ?? 0} 🟠 should); kept locally by the developer, not part of this PR` : `- ⚠️ Pre-PR ${i.prePr.status}`,
  ];
  if (warnings.length) out.push("", "### ⚠️ Warnings", "", ...warnings.map((w) => `- ${md(w.message)}`));
  return out.join("\n") + "\n";
}
