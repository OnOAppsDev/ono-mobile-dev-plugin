/**
 * feature-flow.ts — where a feature stands in the Feature Flow, and what comes next.
 *
 *   /analyze-feature → (human approves the FA) → /dev-design-start → (human approves the DD)
 *   → /dev-feature-start → (human approves the Task Breakdown and Dev Plan)
 *   → /implement-task <feature> T1 … Tn → /review-code --feature <feature> → /pre-pr feature:<feature>
 *   → ready for a pull request (commit, push and PR are the Platform Guardian's)
 *
 * The documents and the task-state store are the only state: nothing is recorded here, so an
 * interrupted session resumes by asking again. Each answer is either the next command to offer
 * (`next_command`, built by scripts/next-command.ts and chained only on the developer's explicit
 * yes — docs/command-handoff.md) or what the flow waits on: a human approval, named by file and
 * the line of its `status:` field. The helper never writes a document and never changes a
 * `status`; continuing is never an approval, and every command it names re-runs its own gates.
 *
 * Read-only. Always exits 0 and prints one JSON object; callers branch on `stage`.
 *
 *   node --no-warnings scripts/feature-flow.ts status --root <TARGET_ROOT> --feature <feature> [--doc <planning doc>]
 */

import { realpathSync } from "fs";
import { fingerprintBody } from "./migrate-planning-doc.ts";
import { chainStatus } from "./task-resume.ts";
import { readTaskState } from "./task-state.ts";
import { nextCommand, type NextCommand } from "./next-command.ts";
import { resolveFeatureDocs, type FeatureDoc, type ResolvedFeatureDocs } from "./feature-docs.ts";
import { verifyFeatureReview } from "./feature-review.ts";
import { verifyPrePr } from "./pre-pr.ts";
import { writeStdout } from "./write-output.ts";

export type Stage =
  | "analysis-missing"
  | "awaiting-approval"
  | "design-missing"
  | "breakdown-missing"
  | "upstream-stale"
  | "implementation"
  | "dependencies-blocked"
  | "review-required"
  | "review-blocking"
  | "pre-pr-required"
  | "ready-for-pr";

export interface WaitingOnApproval {
  kind: "human-approval";
  document: string;
  doc_kind: string;
  status: string | null;
  /** `<path>:<line>` of the `status:` field a human sets to `approved`. */
  where: string;
}

const docRef = (d: FeatureDoc | null) => (d === null ? null : { path: d.rel, status: d.status, approved: d.approved });
const approval = (d: FeatureDoc): WaitingOnApproval => ({ kind: "human-approval", document: d.rel, doc_kind: d.kind, status: d.status, where: `${d.rel}:${d.status_line ?? 1}` });

export function featureStatus(req: { root: string; feature: string; doc?: string | null; base?: string | null; data?: string | null }): Record<string, any> {
  const r = resolveFeatureDocs(req.root, req.feature, req.doc ?? null);
  if (!r.ok) return { ok: false, stage: null, outcome: r.outcome, reason: r.reason, ...(r.candidates ? { candidates: r.candidates, kind: r.kind } : {}), next_command: null };
  const f = r.feature;
  const docs = { feature_analysis: docRef(r.fa), dd: docRef(r.dd), task_breakdown: docRef(r.tb), dev_plan: docRef(r.devPlan) };
  const out = (stage: Stage, extra: { next_command?: NextCommand | null; waiting_on?: unknown; message: string; [k: string]: unknown }) => ({
    ok: true,
    stage,
    feature: f,
    documents: docs,
    resolved_by: r.resolved_by,
    warnings: r.warnings,
    waiting_on: null,
    next_command: null,
    ...extra,
  });

  // 1. Feature Analysis.
  if (r.fa === null) {
    return out("analysis-missing", { message: `No Feature Analysis names feature "${f}". Start with /analyze-feature and the feature request.`, route: "/analyze-feature <feature request>" });
  }
  if (!r.fa.approved) {
    return out("awaiting-approval", { waiting_on: [approval(r.fa)], message: `Feature Analysis ready for review. Your step: review it, then change \`status\` to \`approved\` at ${r.fa.rel}:${r.fa.status_line ?? 1}. Next: design (/dev-design-start ${f}).`, after_approval: nextCommand("dev-design-start", f) });
  }

  // 2. Detailed Design — regenerated when the approved analysis moved since it was built.
  if (r.dd === null) return out("design-missing", { next_command: nextCommand("dev-design-start", f), message: `Feature Analysis approved. Next: write the Detailed Design.` });
  const ddSrc = r.dd.fm.source_fingerprint ?? null;
  if (ddSrc !== null && ddSrc !== fingerprintBody(r.fa.buf)) {
    return out("upstream-stale", { stale: "dd", next_command: nextCommand("dev-design-start", f), message: `The Feature Analysis changed after the DD was generated. Next: regenerate the DD (/dev-design-start ${f}); its approval stays a human step.` });
  }
  if (!r.dd.approved) {
    return out("awaiting-approval", { waiting_on: [approval(r.dd)], message: `Detailed Design ready for review. Your step: review it, then change \`status\` to \`approved\` at ${r.dd.rel}:${r.dd.status_line ?? 1}. Next: task breakdown (/dev-feature-start ${f}).`, after_approval: nextCommand("dev-feature-start", f) });
  }

  // 3. Task Breakdown and Dev Plan — both approved before any task is implemented.
  if (r.tb === null) return out("breakdown-missing", { next_command: nextCommand("dev-feature-start", f), message: `Detailed Design approved. Next: break it into tasks.` });
  const pending = [r.tb, r.devPlan].filter((d): d is FeatureDoc => d !== null && !d.approved);
  if (pending.length > 0) {
    const first = pending.map((d) => `${d.rel}:${d.status_line ?? 1}`).join(" and ");
    return out("awaiting-approval", { waiting_on: pending.map(approval), message: `Task breakdown ready for review. Your step: review it, then change \`status\` to \`approved\` at ${first}. Next: implement the first task.`, after_approval: firstTaskCommand(r) });
  }

  // 4. The upstream chain: the earliest stale stage is regenerated first.
  const chain = chainStatus(r.root, r.tb.abs);
  if (chain.earliestStale !== null) {
    const cmd = chain.earliestStale.command.replace(/^\//, "");
    return out("upstream-stale", { stale: chain.earliestStale.stage, chain: chain.summary, next_command: nextCommand(cmd, f), message: chain.summary });
  }

  // 5. Tasks, in breakdown order: the first unfinished task whose dependencies are complete.
  const state = readTaskState(r.root, f, r.tb.abs);
  const ids = Object.keys(state.tasks);
  const done = (id: string) => state.tasks[id]?.deterministicProof === true;
  const unfinished = ids.filter((id) => !done(id));
  const tasks = ids.map((id) => ({ id, state: state.tasks[id].state, complete: done(id) }));
  if (unfinished.length > 0) {
    const runnable = unfinished.find((id) => (state.tasks[id].dependsOn ?? []).every(done));
    if (runnable === undefined) {
      return out("dependencies-blocked", { tasks, message: `Tasks ${unfinished.join(", ")} wait on dependencies that are not complete.` });
    }
    const s = state.tasks[runnable].state;
    const verb = s === "in-progress" ? "resume" : s === "blocked" || s === "failed" ? "retry" : "implement";
    return out("implementation", { tasks, next_task: runnable, next_command: nextCommand("implement-task", `${f} ${runnable}`), message: `Next: ${verb} ${runnable} (${ids.length - unfinished.length}/${ids.length} tasks complete).` });
  }

  // 6. Internal review, bound to the intended pull request's scope.
  const review = verifyFeatureReview({ root: r.root, feature: f, doc: req.doc ?? null, base: req.base ?? null });
  if (review.status !== "fresh") {
    return out("review-required", { tasks, review: { status: review.status, reasons: review.reasons ?? [] }, next_command: nextCommand("review-code", `--feature ${f}`), message: review.status === "missing" ? `All ${ids.length} tasks complete. Next: internal code review.` : `The internal review is ${review.status} (${(review.reasons ?? []).map((x: any) => x.code).join(", ")}). Next: review again.` });
  }
  if (review.counts.blocking > 0) {
    return out("review-blocking", { tasks, review: { status: review.status, counts: review.counts, record_path: review.record_path }, route: `/fix-review-comments ${review.record_path}`, next_command: nextCommand("fix-review-comments", review.record_path), message: `The internal review has ${review.counts.blocking} blocking finding(s). Next: fix them, then review again.` });
  }

  // 7. Pre-PR regression checklist, owned by this plugin.
  const prePr = verifyPrePr({ root: r.root, work: `feature:${f}`, data: req.data ?? null, base: req.base ?? null, doc: req.doc ?? null });
  if (prePr.status !== "fresh") {
    return out("pre-pr-required", { tasks, review: { status: "fresh", counts: review.counts }, pre_pr: { status: prePr.status, reasons: prePr.reasons ?? [] }, next_command: nextCommand("pre-pr", `feature:${f}`), message: `Internal review fresh (${review.counts.major} major). Next: the Pre-PR regression checklist.` });
  }
  return out("ready-for-pr", {
    tasks,
    review: { status: "fresh", counts: review.counts },
    pre_pr: { status: "fresh", pdf: prePr.pdf_path, pdf_available: prePr.pdf_available },
    message: "Ready for PR. Commit, push and the pull request are done by the Platform Guardian's session closer — say \"close the session\".",
  });
}

function firstTaskCommand(r: ResolvedFeatureDocs): NextCommand | null {
  if (r.tb === null) return null;
  const state = readTaskState(r.root, r.feature, r.tb.abs);
  const first = Object.keys(state.tasks)[0];
  return first ? nextCommand("implement-task", `${r.feature} ${first}`) : null;
}

/* --------------------------------------------------------------------- CLI */

function main(): void {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(args[i]);
    if (!m) positional.push(args[i]);
    else flags[m[1]] = m[2] !== undefined ? m[2] : args[++i] ?? "";
  }
  const print = (o: unknown): never => {
    writeStdout(JSON.stringify(o, null, 2) + "\n");
    process.exit(0);
  };
  if (positional[0] === "status") print(featureStatus({ root: flags.root ?? "", feature: flags.feature ?? "", doc: flags.doc || null, base: flags.base || null, data: flags.data || null }));
  print({ ok: false, outcome: "UNKNOWN_COMMAND", reason: "usage: feature-flow.ts status --root <dir> --feature <feature> [--doc <path>] [--base <branch>] [--data <plugin data dir>]" });
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /feature-flow\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) main();
