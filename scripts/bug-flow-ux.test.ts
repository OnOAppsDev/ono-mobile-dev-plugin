/**
 * bug-flow-ux.test.ts
 *
 * Pins the Bug Flow UX fixes P0.1 and P0.2 from the real-world review:
 *
 *   P0.1  One deterministic representation of "the next command" — { skill, args, display },
 *         the skill always namespaced with the plugin's own name (.claude-plugin/plugin.json).
 *         The bug helpers return it as data; the commands chain to it only on an explicit yes,
 *         through the Skill tool with the exact skill and args, and fall back to the display
 *         form. Nothing instructs an unqualified invocation.
 *   P0.2  Bug implementation and bug analysis run in the existing subagents
 *         (feature-implementer, feature-architect); the main conversation orchestrates only,
 *         under an explicit output policy. Permission prompts from the require-approval hook
 *         are a separate matter (P0.3) and are left byte-identical.
 *
 *   node --no-warnings scripts/bug-flow-ux.test.ts
 */

import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as NC from "./next-command.ts";
import { startBug } from "./analyze-bug.ts";
import { bugGate, bugWorkStatus } from "./bug-implementation.ts";
import { reviewContext, writeReviewRecord } from "./bug-review.ts";
import { handoffCheck } from "./qa-handoff-gate.ts";
import { approveWorkPackage } from "./work-approval.ts";
import { writeTaskState } from "./task-state.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const QA = join(HERE, "fixtures/qa-bugs/acme-qa");
const PLUGIN = JSON.parse(readFileSync(join(REPO_ROOT, ".claude-plugin/plugin.json"), "utf-8")).name as string;
const api = NC as any;

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf-8");
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const git = (root: string, ...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf-8" }).trim();
const NCMD = (skill: string, args: string, display: string) => JSON.stringify({ skill, args, display });
const W = "bug:BUG-43";
const REPRO = "The reported reproduction path no longer fails: with SAVE10 applied, checkout shows the discounted total";
const PLAN = readFileSync(join(HERE, "fixtures/bug-work-plans/bwp-cycle1.md"), "utf-8").replace("| T1 | S | T1's test passes; existing totals tests pass |", `| T1 | S | ${REPRO}; T1's test passes |`);
const MAIN = "app/src/main/java/com/acme/checkout/CheckoutTotals.kt";
const TEST = "app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt";
const CMD = "./gradlew test --tests CheckoutTotalsTest";

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "bug-ux-")));
let n = 0;
function repo(tasks: "none" | "t1" | "both" = "none"): { root: string; plan: string } {
  const root = join(TMP, `repo-${++n}`);
  const plan = join(root, "docs/bugs/BUG-43/bug-work-plan.md");
  mkdirSync(dirname(plan), { recursive: true });
  for (const f of [MAIN, TEST]) {
    mkdirSync(join(root, dirname(f)), { recursive: true });
    writeFileSync(join(root, f), "// v0\n");
  }
  writeFileSync(plan, PLAN);
  approveWorkPackage(plan, { by: "dana" });
  git(root, "init", "-q", "-b", "fix/bug-43");
  git(root, "config", "user.email", "t@t");
  git(root, "config", "user.name", "t");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "plan");
  const dt = { framework: "junit", required: true, testsChanged: [TEST], justification: null, runs: [{ command: CMD, result: "pass" }], notRunReason: null };
  if (tasks !== "none") {
    writeTaskState(root, W, "T1", "in-progress", { platform: "android" } as any, plan, { mode: "start" });
    writeTaskState(root, W, "T1", "complete", { platform: "android", filesChanged: [TEST], standardIds: [], validation: [{ command: CMD, result: "pass" }], acceptanceCriteria: [{ criterion: "The test fails on the current code for the documented reproduction", met: true }], developerTesting: dt, deviations: [], blockers: [] } as any, plan);
  }
  if (tasks === "both") {
    writeFileSync(join(root, MAIN), "// fixed\n");
    writeTaskState(root, W, "T2", "in-progress", { platform: "android" } as any, plan, { mode: "start" });
    writeTaskState(root, W, "T2", "complete", { platform: "android", filesChanged: [MAIN], standardIds: [], validation: [{ command: CMD, result: "pass" }], acceptanceCriteria: [{ criterion: REPRO, met: true }, { criterion: "T1's test passes", met: true }], developerTesting: { ...dt, regression: { command: CMD, failedBefore: true, passesAfter: true } }, deviations: [], blockers: [] } as any, plan);
  }
  return { root, plan };
}

/** The Bug Flow's own text: /analyze-bug whole, and the bug sections of the shared commands. */
function bugSections(): Record<string, string> {
  const from = (rel: string, heading: string) => read(rel).slice(read(rel).indexOf(heading));
  return {
    "commands/analyze-bug.md": read("commands/analyze-bug.md"),
    "commands/implement-task.md": from("commands/implement-task.md", "## 1a. Bug work").split("\n## 2. ")[0],
    "commands/review-code.md": from("commands/review-code.md", "## Bug review"),
    "commands/create-dev-qa-notes.md": from("commands/create-dev-qa-notes.md", "## Bug handoff"),
  };
}

try {
  /* ── the one representation of a next command ─────────────────────────── */
  {
    check("the plugin name is read from .claude-plugin/plugin.json", api.PLUGIN_NAME === PLUGIN && PLUGIN === "ono-mobile-dev-plugin");
    const c = api.nextCommand?.("implement-task", "bug:YET-1052 T1");
    check("2 the implementation command is the namespaced plugin skill", c?.skill === `${PLUGIN}:implement-task`, JSON.stringify(c));
    check("3 arguments are preserved exactly", c?.args === "bug:YET-1052 T1");
    check("6 the copyable fallback is the slash command with the same arguments", c?.display === "/implement-task bug:YET-1052 T1");
    check("3 an argument with spaces and flags is kept verbatim", api.nextCommand?.("analyze-bug", "qa=BUG-44 --qa-repo=/a b/qa").args === "qa=BUG-44 --qa-repo=/a b/qa");
    let threw = false;
    try {
      api.nextCommand?.("implement-tasks", "x");
    } catch {
      threw = true;
    }
    check("a command the plugin does not ship is refused, never emitted", threw);
    check("7 the implementation agent is the namespaced existing feature-implementer", api.subagentType?.("feature-implementer") === `${PLUGIN}:feature-implementer`);
    check("11 the planning agent is the namespaced existing feature-architect", api.subagentType?.("feature-architect") === `${PLUGIN}:feature-architect`);
    let threwAgent = false;
    try {
      api.subagentType?.("bug-implementer");
    } catch {
      threwAgent = true;
    }
    check("8 an agent the plugin does not ship is refused", threwAgent);
  }

  /* ── 1–3. the helpers return next_command as data ─────────────────────── */
  {
    const fresh = repo("none");
    const s = startBug({ root: fresh.root, ref: "BUG-43", qaRepo: QA });
    check("1 /analyze-bug on an approved plan returns a qualified next command", JSON.stringify(s.next_command) === NCMD(`${PLUGIN}:implement-task`, "bug:BUG-43 T1", "/implement-task bug:BUG-43 T1"), JSON.stringify(s.next_command));
    check("1 the legacy display string still agrees", s.next_action === "/implement-task bug:BUG-43 T1");
    const half = repo("t1");
    const s2 = startBug({ root: half.root, ref: "BUG-43", qaRepo: QA });
    check("1 the next command names the first unfinished task", s2.next_command?.args === "bug:BUG-43 T2");
    const done = repo("both");
    const s3 = startBug({ root: done.root, ref: "BUG-43", qaRepo: QA });
    check("1 with every task done, the next command is the bug review", JSON.stringify(s3.next_command) === NCMD(`${PLUGIN}:review-code`, "--bug BUG-43", "/review-code --bug BUG-43"), JSON.stringify(s3.next_command));
    const draft = (() => {
      const r = repo("none");
      writeFileSync(r.plan, readFileSync(r.plan, "utf-8").replace("status: approved", "status: draft"));
      return startBug({ root: r.root, ref: "BUG-43", qaRepo: QA });
    })();
    check("5 a plan awaiting approval offers no next command — approval comes first", draft.outcome === "BUG_PLAN_AWAITING_APPROVAL" && draft.next_command === undefined);
    const emptyRoot = join(TMP, `empty-${++n}`);
    mkdirSync(emptyRoot, { recursive: true });
    const created = startBug({ root: emptyRoot, ref: "BUG-43", qaRepo: QA });
    check("11 BUG_PLAN_NEW names the existing feature-architect as the planning subagent", created.outcome === "BUG_PLAN_NEW" && created.planner?.subagent_type === `${PLUGIN}:feature-architect`, JSON.stringify(created.planner));

    const st = bugWorkStatus({ root: half.root, work: W });
    check("2 status names the next task as a qualified command", JSON.stringify(st.next_command) === NCMD(`${PLUGIN}:implement-task`, "bug:BUG-43 T2", "/implement-task bug:BUG-43 T2"), JSON.stringify(st.next_command));
    const stDone = bugWorkStatus({ root: done.root, work: W });
    check("2 a complete cycle hands on to the review", JSON.stringify(stDone.next_command) === NCMD(`${PLUGIN}:review-code`, "--bug BUG-43", "/review-code --bug BUG-43") && stDone.next_action === "/review-code --bug BUG-43");

    const g = bugGate({ root: fresh.root, work: W, task: "T1", qaRepo: QA });
    check("7 the gate delegates implementation to the existing feature-implementer subagent", g.ok === true && g.delegate?.subagent_type === `${PLUGIN}:feature-implementer`, JSON.stringify(g.delegate));

    const ctx = reviewContext({ root: done.root, work: W });
    const f = join(TMP, "review.json");
    writeFileSync(f, JSON.stringify({ binding: ctx.binding, reviewed_by: "code-reviewer (android)", generated_at: "2026-10-12T09:00:00Z", findings: [], checks: [
      { id: "root-cause", status: "pass", note: "ok" }, { id: "reproduction-path", status: "pass", note: "ok" }, { id: "plan-conformance", status: "pass", note: "ok" }, { id: "regression-risk", status: "pass", note: "ok" },
    ] }));
    const w = writeReviewRecord({ root: done.root, work: W, review: f });
    check("2 a recorded review hands on to the QA handoff", w.ok === true && JSON.stringify(w.next_command) === NCMD(`${PLUGIN}:create-dev-qa-notes`, "bug:BUG-43", "/create-dev-qa-notes bug:BUG-43"), JSON.stringify(w.next_command));
    const noState = reviewContext({ root: fresh.root, work: W });
    check("2 a review with nothing implemented points at the cycle's first task", noState.outcome === "BUG_TASK_STATE_MISSING" && noState.next_command?.skill === `${PLUGIN}:implement-task` && noState.next_command.args === "bug:BUG-43 T1");

    const k = handoffCheck({ root: half.root, work: W, qaRepo: QA });
    check("2 a handoff blocked on an unfinished task points at that task", k.ok === false && JSON.stringify(k.next_command) === NCMD(`${PLUGIN}:implement-task`, "bug:BUG-43 T2", "/implement-task bug:BUG-43 T2"), JSON.stringify(k.next_command));
    const kr = handoffCheck({ root: done.root, work: W, qaRepo: QA });
    check("2 a handoff with a fresh review and no block offers no command (the same command continues)", kr.ok === true && kr.next_command === undefined);
    const noReview = repo("both");
    const kn = handoffCheck({ root: noReview.root, work: W, qaRepo: QA });
    check("2 a handoff blocked on a missing review points at the bug review", JSON.stringify(kn.next_command) === NCMD(`${PLUGIN}:review-code`, "--bug BUG-43", "/review-code --bug BUG-43"), JSON.stringify(kn.next_command));
  }

  /* ── 4. lint: nothing instructs an unqualified invocation ─────────────── */
  {
    const commands = readdirSync(join(REPO_ROOT, "commands")).map((f) => f.replace(/\.md$/, ""));
    const agents = readdirSync(join(REPO_ROOT, "agents")).map((f) => f.replace(/\.md$/, ""));
    const docs: Array<[string, string]> = [
      ...readdirSync(join(REPO_ROOT, "commands")).map((f) => [`commands/${f}`, read(`commands/${f}`)] as [string, string]),
      ...readdirSync(join(REPO_ROOT, "agents")).map((f) => [`agents/${f}`, read(`agents/${f}`)] as [string, string]),
      ...readdirSync(join(REPO_ROOT, "skills")).map((d) => [`skills/${d}/SKILL.md`, read(`skills/${d}/SKILL.md`)] as [string, string]),
    ];
    const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n/);
    const bare = (sentence: string, names: string[]) => [...sentence.matchAll(/`\/?([a-z][a-z-]*)[^`]*`/g)].filter((m) => names.includes(m[1]) && !m[0].includes(":")).map((m) => m[0]);
    // Anywhere in the plugin: a sentence that drives the Skill or Agent tool never names a bare command or agent.
    const bad: string[] = [];
    for (const [file, text] of docs) {
      for (const sentence of sentences(text)) {
        if (/\b(Skill|Agent) tool\b/.test(sentence)) for (const t of bare(sentence, [...commands, ...agents])) bad.push(`${file}: ${t}`);
      }
    }
    check("4 no command, agent or skill tells the Skill or Agent tool to use an unqualified name", bad.length === 0, bad.join(" | "));
    // In the Bug Flow's own sections, a sentence that invokes or chains to a command never names it bare —
    // a command is continued only through next_command.skill.
    const bugBad: string[] = [];
    for (const [file, text] of Object.entries(bugSections())) {
      for (const sentence of sentences(text)) {
        if (/\b(invok|chain)\w*/i.test(sentence)) for (const t of bare(sentence, commands)) bugBad.push(`${file}: ${t} in "${sentence.trim().slice(0, 90)}"`);
      }
    }
    check("4 the Bug Flow's sections never invoke a command or agent by an unqualified name", bugBad.length === 0, bugBad.join(" | "));
    const sources = readdirSync(HERE).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "next-command.ts");
    const literal = sources.filter((f) => /\bskill:\s*[`"']/.test(read(`scripts/${f}`)) || /subagent_type:\s*[`"']/.test(read(`scripts/${f}`)));
    check("4 every next command and subagent type is built by next-command.ts — no hand-written skill strings", literal.length === 0, literal.join(", "));
    check("4 the plugin name appears in no helper as a literal", sources.filter((f) => read(`scripts/${f}`).includes(`"${PLUGIN}:`) || read(`scripts/${f}`).includes(`\`${PLUGIN}:`)).length === 0);
  }

  /* ── 5–6. the continue protocol, in every bug hand-off ───────────────── */
  const sections = bugSections();
  {
    for (const [file, text] of Object.entries(sections)) {
      check(`5 ${file}: chaining needs an explicit yes`, /only on an explicit yes/i.test(text) && /Continue\?/.test(text), file);
      check(`2/3 ${file}: chaining invokes the Skill tool with next_command.skill and next_command.args, verbatim`, /Skill tool with `skill` set to `next_command\.skill` and `args` set to `next_command\.args`, verbatim/.test(text));
      check(`6 ${file}: the fallback is next_command.display, and nothing is guessed`, /show `next_command\.display`/.test(text) && /never (guess|improvise)/i.test(text));
      check(`5 ${file}: the next command re-runs its own preconditions; chaining never replaces an approval`, /re-runs every one of its own (gates|preconditions)/i.test(text) && /never (skips|replaces) (a|an) (human )?approval/i.test(text));
    }
    const ab = sections["commands/analyze-bug.md"];
    check("5 /analyze-bug offers to continue only after the plan approval succeeds", /after `work-approval\.ts approve` succeeds/i.test(ab) && ab.indexOf("Approve this Bug Work Plan for <bug_key>?") < ab.indexOf("Bug plan approved."));
    check("the offer is short: what finished, what is next, Continue?", /Bug plan approved\.\nNext: implement Cycle <n> \(`<first task>`\)\.\nContinue\?/.test(ab));
  }

  /* ── 7–10. subagent execution and the output policy ───────────────────── */
  {
    const bug = sections["commands/implement-task.md"];
    check("7 bug implementation runs as a subagent through the Agent tool, with delegate.subagent_type", /Agent tool/.test(bug) && /`delegate\.subagent_type`/.test(bug) && /never (implement|write code) in (this|the main) conversation/i.test(bug));
    check("8 no bug implementation agent exists", !readdirSync(join(REPO_ROOT, "agents")).some((f) => /(^|-)bug(-|\.|$)/.test(f)));
    check("7 the subagent returns the §10 structured completion report", /returns? (only )?the structured completion report/i.test(bug));
    check("9 the output policy names what may be shown during execution", /### Output policy \(bug work\)/.test(bug) && ["✓ Preconditions passed", "▸ Implementing", "▸ Running developer tests", "✓ Tests passed"].every((l) => bug.includes(l)));
    check("9 the output policy forbids narration, helper output and code", /Do not narrate/.test(bug) && /file reads/.test(bug) && /helper (JSON|output)/i.test(bug) && /never paste code unless the developer asks/i.test(bug) && /reasoning/i.test(bug));
    check("10 the concise final report remains", ["tasks completed", "files changed", "automated tests run", "passed or failed", "developer debt and blockers", "next action"].every((x) => bug.toLowerCase().includes(x)));
    check("permission prompts are distinguished from narration — the hook is not this command's output", /require-approval-before-code/.test(bug) && /permission (prompt|dialog)s?/i.test(bug) && /(not this command'?s output|not output of this command|Claude Code shows them)/i.test(bug));
    const ab = sections["commands/analyze-bug.md"];
    check("11 /analyze-bug runs the root-cause and planning work in the planning subagent", /Agent tool/.test(ab) && /`planner\.subagent_type`/.test(ab) && /never (analy[sz]e|plan) in (this|the main) conversation/i.test(ab));
    check("11 /analyze-bug's main conversation shows progress and the finished plan summary", /### Output policy/.test(ab) && /plan summary/i.test(ab));
  }

  /* ── 12–15. gates and feature behaviour unchanged ─────────────────────── */
  {
    const ab = read("commands/analyze-bug.md");
    check("12 the human plan approval remains", ab.includes("Approve this Bug Work Plan for <bug_key>?") && /scripts\/work-approval\.ts" approve "<absolute plan path>" --by "<approver>"/.test(ab) && /Never write `status` or any `approved_\*` field yourself/.test(ab));
    check("12 the QA handoff approval remains", read("commands/create-dev-qa-notes.md").includes("Hand this bug fix to QA?"));
    check("13 commits stay a human act", /never creates a git commit/i.test(read("commands/implement-task.md")) && /never creates a git commit/i.test(read("commands/create-dev-qa-notes.md")) && /never creates a git commit/i.test(read("commands/review-code.md")));
    const HOOKS: Record<string, string> = {
      "hooks/require-approval-before-code.json": "37f5f2e5dbe97ccac0f432a7b3eacc6f8595b0d2a60ade3674df0f6ec69db043",
      "hooks/require-approval-before-code.sh": "f4333da9c0a95003cf5dd08323e3f702b16d4468edc2bff65230e6468385dcfe",
      "hooks/block-main-branch-changes.json": "89599088f364c9d6dd1af0a0cc7438610bf9b417a9b8e320d2866bf1c6857b2c",
      "hooks/block-main-branch-changes.sh": "771aef6d81d25308edbc77e4cca8c663cf2f05946cfe254fd150e34342636d34",
      "hooks/protect-secrets.json": "e1eaeb813e75d5b80927dcf6630c292c0bc7acd32519349af088dc0994cc00fb",
      "hooks/scan-for-secrets.sh": "be60a1fc569de494c2aa215220cf162eccfe8f6b7fc04ffc5a14d7e6827c67d9",
    };
    for (const [f, h] of Object.entries(HOOKS)) check(`14 ${f} is byte-identical`, sha(readFileSync(join(REPO_ROOT, f))) === h);
    const FEATURE: Record<string, string> = {
      "agents/feature-implementer.md": "d53845b5e31d2487754747f89227b0a54fa9d1ed457ae02934b593cce7576023",
      "agents/feature-architect.md": "c715811b78c1804368766551cf42f46beec568d78a91397a4ea5f57d96bca582",
      "commands/analyze-feature.md": "42f3b7f1fbd91e9110e15877b3f746312926958ccf53f28dfc3ee76879e70051",
      "commands/dev-design-start.md": "f62963b1d156f4d9b22cd1d92678d4de25f0d66d7120801d62075d14ec8b9ca8",
      "commands/dev-feature-start.md": "0713797d25d66df5064424ffd0dcf4269fead926512c2c40dd2eb9350abce175",
    };
    for (const [f, h] of Object.entries(FEATURE)) check(`15 ${f} is unchanged`, sha(readFileSync(join(REPO_ROOT, f))) === h);
    const it = read("commands/implement-task.md");
    const featurePart = it.slice(it.indexOf("\n## 2. "));
    check("15 /implement-task's feature sections carry no bug output policy or chaining", !/next_command|Output policy/.test(featurePart));
    check("the suite is registered", read("scripts/check.ts").includes('"bug-flow-ux"'));
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall bug-flow-ux checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
