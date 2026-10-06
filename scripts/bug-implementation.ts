/**
 * bug-implementation.ts
 *
 * The bug half of `/implement-task` (Bug Development Flow, Step 5). Bug work runs on the
 * existing implementation engine — the same command, task-row parser, task-state store,
 * checkpoints, resume, developer-testing lifecycle and platform lanes. This helper only
 * answers what is different about bug work, deterministically:
 *
 *   gate    read-only. May `bug:<bug_key> <task-id>` be implemented now? The Bug Work Plan
 *           at docs/bugs/<bug_key>/bug-work-plan.md is the sole planning document. It must be
 *           structurally valid, validly approved for its current fix cycle
 *           (scripts/work-approval.ts), and still match the bug evidence intake reads now
 *           (scripts/bug-intake.ts, through analyze-bug's shared intake call and drift rule).
 *           QA must not have denied or reopened the bug since. On `BUG_READY` it returns the
 *           task row (read by task-state's parseBreakdown) and the implementation context
 *           the lane receives.
 *   status  read-only. Which cycle-1 tasks are proven complete, and — once all are — the
 *           next action, `/review-code --bug <bug_key>`.
 *
 * It never writes: task state is written only by scripts/task-state.ts, as for a feature,
 * and approval only by scripts/work-approval.ts. It runs no process, reads no clock, and
 * never touches a QA repository beyond reading it, Inspector artifacts or Project Knowledge.
 *
 * Always exits 0 and prints one JSON object; callers branch on `outcome` / `ok`.
 *
 *   node --no-warnings scripts/bug-implementation.ts gate   bug:<bug_key> <task-id> --root <TARGET_ROOT> [--qa-repo <path> | --report <file.json>]
 *   node --no-warnings scripts/bug-implementation.ts status bug:<bug_key> --root <TARGET_ROOT>
 */

import { existsSync, readFileSync, realpathSync, statSync } from "fs";
import { join, relative, sep } from "path";
import { validateBugWorkPlan, bugWorkPlanPath } from "./bug-work-plan.ts";
import { verifyApproval } from "./work-approval.ts";
import { runIntake, evidenceDrift, type BugRequest } from "./analyze-bug.ts";
import { bugKeyOf, parseBreakdown, readTaskState, stateFilePath } from "./task-state.ts";
import { rowCells, taskRowsText } from "./task-resume.ts";
import { splitDocument } from "./migrate-planning-doc.ts";

/** What bug work adds to the existing developer-testing lifecycle, stated to the lane. */
export const BUG_EXPECTATIONS = [
  "Verify the reported reproduction path: the fix task's first acceptance criterion — it no longer fails — is checked against the reproduction in the plan.",
  "Write a regression test that fails before the fix and passes after it, where feasible, and record it as developerTesting.regression.",
  "If a regression test cannot be authored, record why (developerTesting.regression.notFeasibleReason) and a VERIFY-4 developer-testing verificationDebt entry owned by the developer.",
  "Consider every affected surface the plan names; verify on each one the repository can exercise, and record the rest as verification debt.",
  "Fix the root cause in the plan's Fix Design, not the symptom. Its non-goals are hard scope limits: no unrelated refactoring.",
] as const;

const stripComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, "").trim();
function section(body: string, name: string): string {
  const start = body.indexOf(`\n## ${name}\n`);
  if (start === -1) return "";
  const from = start + `\n## ${name}\n`.length;
  const next = body.indexOf("\n## ", from);
  return stripComments(body.slice(from, next === -1 ? body.length : next));
}
const labelled = (text: string, label: string): string | null => {
  const esc = label.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`^\\s*(?:[-*]\\s+)?\\*\\*${esc}:\\*\\*(.*)$`, "m").exec(text)?.[1]?.trim() ?? null;
};

/** The `/analyze-bug` invocation that re-enters planning for this plan's bug, with its evidence source. */
function analyzeRoute(fm: Record<string, any>, source: { qaRepo?: string; report?: string }): string {
  if (fm.qa_bug_id) return `/analyze-bug qa=${fm.qa_bug_id}${fm.external_ref ? `,external=${fm.external_ref}` : ""} --qa-repo=${source.qaRepo ?? "<path>"}`;
  if (fm.origin === "external") return `/analyze-bug --external=${fm.external_ref} --report=${source.report ?? "<path>"}`;
  return `/analyze-bug --origin=${fm.origin} --report=${source.report ?? "<path>"}`;
}

export interface GateRequest {
  root: string;
  work: string;
  task?: string;
  qaRepo?: string;
  report?: string;
}

export function bugGate(req: GateRequest): Record<string, any> {
  const stop = (outcome: string, reason: string, extra: Record<string, unknown> = {}) => ({ ok: false, outcome, reason, ...extra });
  const key = bugKeyOf(req.work ?? "");
  if (key === null) return stop("BUG_WORK_ID_INVALID", `"${req.work}" is not bug work — bug work is named only by the explicit bug:<bug_key> prefix, never inferred`);
  if (!req.root || !existsSync(req.root) || !statSync(req.root).isDirectory()) return stop("BUG_ROOT_INVALID", `repository root ${req.root ?? ""} does not exist`);
  const root = realpathSync(req.root);
  const rel = bugWorkPlanPath(key) as string;
  const abs = join(root, rel);
  const generic = { work_id: `bug:${key}`, plan_path: rel };
  if (!existsSync(abs)) {
    return stop("BUG_PLAN_MISSING", `no Bug Work Plan at ${rel} — prepare the bug first`, { ...generic, route: "/analyze-bug <bug-ref>" });
  }

  const buf = readFileSync(abs);
  const v = validateBugWorkPlan(buf);
  if (!v.ok) return stop("BUG_PLAN_INVALID", `${rel} is not a valid Bug Work Plan`, { ...generic, errors: v.errors, route: "/analyze-bug <bug-ref>" });
  const fm = v.frontmatter;
  const route = analyzeRoute(fm, req);
  if (fm.bug_key !== key) return stop("BUG_PLAN_INVALID", `${rel} records bug_key ${fm.bug_key}, not ${key}`, { ...generic, route });
  if (fm.fix_cycle !== 1) {
    return stop("BUG_CYCLE_UNSUPPORTED", `the plan is at fix cycle ${fm.fix_cycle}; implementing a reopened cycle is not available yet`, { ...generic, route });
  }

  // Approval: content-bound, current cycle. Never re-approved here.
  const approval = verifyApproval(buf);
  if (approval.status === "draft") return stop("BUG_PLAN_NOT_APPROVED", "the Bug Work Plan is a draft — a human approves it through /analyze-bug, never here", { ...generic, route, reasons: approval.reasons });
  if (approval.status === "approval_stale") return stop("BUG_APPROVAL_STALE", "the plan changed, or its cycle moved, after it was approved — re-approve it through /analyze-bug", { ...generic, route, reasons: approval.reasons });
  if (approval.status !== "approved") return stop("BUG_APPROVAL_INVALID", "the plan's approval fields are incomplete or inconsistent", { ...generic, route, reasons: approval.reasons });

  // Evidence freshness: intake, exactly as /analyze-bug reads it.
  const isQa = fm.qa_bug_id !== null;
  if (isQa ? !req.qaRepo : !req.report) {
    return stop("BUG_EVIDENCE_SOURCE_REQUIRED", isQa ? "the bug evidence is re-read from its QA repository — pass --qa-repo <path>; it is never guessed" : "the bug evidence is re-read from its report — pass --report <file.json>", { ...generic, route });
  }
  const intakeReq: BugRequest = isQa
    ? { root, ref: `qa=${fm.qa_bug_id}`, qaRepo: req.qaRepo } // by QA id: a changed external ref is drift, not a lookup failure
    : fm.origin === "external"
      ? { root, external: fm.external_ref, report: req.report }
      : { root, origin: fm.origin, report: req.report };
  const got = runIntake(intakeReq);
  if (got.refusal) return stop("BUG_INSUFFICIENT_EVIDENCE", got.refusal.reason, { ...generic, route });
  const it = got.result as Record<string, any>;
  const withIntake = { ...generic, route, context_level: it.context_level, intake_status: it.status };
  if (it.context_level === "insufficient" || it.status === "invalid" || it.status === "ambiguous") {
    return stop("BUG_INSUFFICIENT_EVIDENCE", it.reason, { ...withIntake, missing: it.missing ?? [] });
  }
  if (it.status === "reopened") {
    return stop("BUG_REOPENED", "QA re-tested the fix and it failed — the next fix cycle is planned through /analyze-bug; no cycle is created here", { ...withIntake, reopened: it.reopened });
  }
  if (it.dev_may_start !== true) return stop("BUG_QA_DENIED", it.reason, withIntake);
  const { drift, transition } = evidenceDrift(fm, it);
  if (drift.length > 0) {
    return stop("BUG_EVIDENCE_STALE", `the bug evidence changed since the plan was approved (${drift.join(", ")}) — re-plan it through /analyze-bug`, { ...withIntake, drift });
  }

  // The task: cycle-1 rows only, read by task-state's own parser.
  const text = buf.toString("utf-8");
  const rows = parseBreakdown(taskRowsText(text));
  let task: Record<string, unknown> | null = null;
  if (req.task !== undefined) {
    if (!/^T[1-9][0-9]*$/.test(req.task)) return stop("BUG_TASK_UNSUPPORTED", `task ${req.task} is not a cycle-1 task (T<n>); later fix cycles are not available yet`, withIntake);
    const row = rows[req.task];
    if (!row) return stop("BUG_TASK_UNKNOWN", `the Bug Work Plan has no task ${req.task}`, { ...withIntake, tasks: Object.keys(rows) });
    const cells = rowCells(text, req.task) ?? {};
    task = {
      id: row.id,
      fingerprint: row.fingerprint,
      depends_on: row.dependsOn,
      platform: row.platform,
      cells,
      acceptance_criteria: (cells["acceptance criteria"] ?? "").split(/;|<br\s*\/?>/i).map((c) => c.trim()).filter(Boolean),
    };
  }

  const body = (splitDocument(buf) as any).body.toString("utf-8");
  const fixDesign = section(body, "Fix Design");
  const verification = section(body, "Verification Strategy");
  const warnings = [
    ...(it.warnings ?? []),
    ...(transition ? [{ code: "FOUND_IN_BUILD_UNVERIFIED", message: "the QA context changed but the evidence is the same; found_in_build is known on one side only and was not contradicted" }] : []),
  ];
  return {
    ok: true,
    outcome: "BUG_READY",
    reason: "the Bug Work Plan is approved for this cycle and still matches the bug evidence",
    ...withIntake,
    plan_abs: abs,
    breakdown_path: abs,
    state_path: relative(root, stateFilePath(root, `bug:${key}`)).split(sep).join("/"),
    platform: fm.platform,
    device_type: fm.device_type,
    task,
    warnings,
    context: {
      bug: {
        bug_key: fm.bug_key,
        qa_bug_id: fm.qa_bug_id,
        external_ref: fm.external_ref,
        origin: fm.origin,
        found_in_build: fm.found_in_build,
        surfaces: fm.surfaces,
        capability: fm.capability,
        related_feature: fm.related_feature,
      },
      reproduction: section(body, "Reproduction Evidence"),
      observed_vs_expected: section(body, "Observed vs Expected"),
      affected: section(body, "Affected Capability & Surfaces"),
      root_cause: section(body, "Root Cause"),
      blast_radius: section(body, "Blast Radius"),
      fix_design: fixDesign,
      non_goals: labelled(fixDesign, "Non-goals"),
      verification_strategy: verification,
      reproduction_path: labelled(verification, "Reproduction path"),
      regression_test: labelled(verification, "Regression test"),
      repo_knowledge_reference: section(body, "Repo Knowledge Reference"),
    },
    expectations: [...BUG_EXPECTATIONS],
  };
}

/** Cycle-1 progress from the task-state store; the review hand-off once every task is proven complete. */
export function bugWorkStatus(req: { root: string; work: string }): Record<string, any> {
  const key = bugKeyOf(req.work ?? "");
  if (key === null || !req.root || !existsSync(req.root)) return { ok: false, outcome: "BUG_WORK_ID_INVALID", reason: "status needs bug:<bug_key> and an existing --root" };
  const root = realpathSync(req.root);
  const abs = join(root, bugWorkPlanPath(key) as string);
  if (!existsSync(abs)) return { ok: false, outcome: "BUG_PLAN_MISSING", reason: `no Bug Work Plan for ${key}` };
  const ids = Object.keys(parseBreakdown(taskRowsText(readFileSync(abs, "utf-8"))));
  const state = readTaskState(root, `bug:${key}`, abs);
  const remaining = ids.filter((id) => state.tasks[id]?.deterministicProof !== true);
  const all = ids.length > 0 && remaining.length === 0;
  return {
    ok: true,
    outcome: all ? "BUG_CYCLE_COMPLETE" : "BUG_CYCLE_IN_PROGRESS",
    work_id: `bug:${key}`,
    tasks: ids,
    remaining,
    all_complete: all,
    next_action: all ? `/review-code --bug ${key}` : null,
  };
}

/* --------------------------------------------------------------------- CLI */

function main(): void {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(args[i]);
    if (!m) positional.push(args[i]);
    else if (m[2] !== undefined) flags[m[1]] = m[2];
    else flags[m[1]] = args[++i] ?? "";
  }
  const print = (o: unknown): never => {
    console.log(JSON.stringify(o, null, 2));
    process.exit(0);
  };
  const [cmd, work, task] = positional;
  if (cmd === "gate") print(bugGate({ root: flags.root ?? "", work, task, qaRepo: flags["qa-repo"], report: flags.report }));
  if (cmd === "status") print(bugWorkStatus({ root: flags.root ?? "", work }));
  print({ ok: false, outcome: "UNKNOWN_COMMAND", reason: "usage: bug-implementation.ts gate bug:<bug_key> <task-id> --root <dir> [--qa-repo <path> | --report <file>] | status bug:<bug_key> --root <dir>" });
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /bug-implementation\.ts$/.test(realpathSync(process.argv[1]));
if (invokedDirectly) main();
