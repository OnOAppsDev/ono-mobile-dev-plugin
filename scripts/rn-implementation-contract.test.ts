/**
 * rn-implementation-contract.test.ts
 *
 * Structural tests for the React Native implementation lane:
 *   agents/rn-feature-developer.md      — the thin executor
 *   skills/rn-feature-implementation/   — the single RN implementation methodology
 *
 * No runtime code under test. Four properties matter here, and all four are
 * boundary conditions rather than features:
 *
 *   1. The agent must DELEGATE the methodology, not restate it. A second copy of
 *      the standards map or the task-resolution procedure is the drift risk, not
 *      a safety net — and the copy that existed previously had already drifted
 *      (it resolved the task against templates/task-breakdown-template.md, which
 *      commands/implement-task.md §3 forbids).
 *
 *   2. The skill must satisfy the command's contract. Its declared inputs and its
 *      completion report are checked against commands/implement-task.md §8 and
 *      §10 by PARSING that file rather than by hard-coding its lists, so a change
 *      there fails this suite instead of silently desynchronising it — the same
 *      discipline migrate-planning-doc.test.ts applies to the planning contract.
 *
 *   3. The skill must not absorb command logic. Repo-root resolution, document
 *      discovery, routing and task-status handling belong to /implement-task.
 *
 *   4. React Native is mobile-only. NEITHER file may carry TV handling, a TV
 *      branch, or device_type text. device_type is deliberately excluded from the
 *      skill's declared inputs: the generic command may pass broader context than
 *      a platform skill consumes.
 *
 * The Fix stage stays in the AGENT, matching the authored Android lane — the
 * skill must not grow a fix methodology (assertions 8/9).
 *
 * No external test framework. Run with:
 *   node scripts/rn-implementation-contract.test.ts
 *   bun  scripts/rn-implementation-contract.test.ts
 */

import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const AGENT = join(REPO_ROOT, "agents", "rn-feature-developer.md");
const SKILL = join(REPO_ROOT, "skills", "rn-feature-implementation", "SKILL.md");
const IMPLEMENT_CMD = join(REPO_ROOT, "commands", "implement-task.md");

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

/** Text between a heading and the next heading of the same or higher level. */
function section(doc: string, heading: string): string {
  const i = doc.indexOf(heading);
  if (i === -1) return "";
  const rest = doc.slice(i + heading.length);
  const next = rest.search(/^#{1,3} /m);
  return next === -1 ? rest : rest.slice(0, next);
}

check("0 agent file exists", existsSync(AGENT));
check("0 skill file exists", existsSync(SKILL));
check("0 implement-task command exists", existsSync(IMPLEMENT_CMD));

if (failures === 0) {
  const agent = readFileSync(AGENT, "utf-8");
  const skill = readFileSync(SKILL, "utf-8");
  const cmd = readFileSync(IMPLEMENT_CMD, "utf-8");
  const agentFlat = agent.replace(/\s+/g, " ");
  const skillFlat = skill.replace(/\s+/g, " ");

  // --- 1. Agent delegates the methodology ------------------------------------
  check("1 agent has frontmatter with the routing name", /^---\nname: rn-feature-developer\ndescription: /.test(agent));
  check("1 agent names the implementation skill", /skills\/rn-feature-implementation\/SKILL\.md/.test(agent));
  check("1 agent states it does not restate the methodology", /does not restate that methodology; it applies it/.test(agentFlat));
  check("1 agent Process defers to the skill", /Follow `skills\/rn-feature-implementation\/SKILL\.md` end to end/.test(agentFlat));

  // --- 2. Agent carries no duplicated methodology ----------------------------
  const stdPaths = (agent.match(/standards\/react-native\//g) ?? []).length;
  check(`2 agent carries no standards map (${stdPaths} standards/react-native/ paths)`, stdPaths <= 1, String(stdPaths));
  check("2 agent has no numbered standards-selection list", !/^\s+- `standards\/react-native\//m.test(agent));

  // --- 3. Agent staleness ----------------------------------------------------
  check("3 agent does not point at the plugin template", !/templates\/task-breakdown-template\.md/.test(agent));
  check("3 agent does not claim to be the only code-producing agent", !/only agent/i.test(agent));
  for (const c of ["/implement-task", "/fix-review-comments", "/create-dev-qa-notes"]) {
    check(`3 agent description names ${c}`, new RegExp(c.replace(/\//g, "\\/")).test(agent.split("---")[1] ?? ""));
  }

  // --- 4. The three agent-level uniques survive the rewrite ------------------
  check("4 C33 conflicting-standards rule retained", /two applicable standards conflict for a given change, flag the conflict/.test(agentFlat));
  check("4 C34 no-standards-prose-in-comments rule retained", /Don't restate a standard's text in code comments/.test(agentFlat));
  check("4 C35 design-reference gate retained", /Don't implement a UI task from a description alone when no design reference is on file/.test(agentFlat));
  check("4 C36 detected-conventions rule added", /Follow the repository's detected conventions/.test(agentFlat));

  // --- 5. Fix stage stays in the agent (Option A) ----------------------------
  check("5 agent covers /fix-review-comments", /## Usage in other stages[\s\S]*fix-review-comments/.test(agent));
  check("5 agent covers /create-dev-qa-notes", /## Usage in other stages[\s\S]*create-dev-qa-notes/.test(agent));
  check("5 agent names mobile-debugging as the root-cause owner", /`mobile-debugging` skill owns root-causing/.test(agentFlat));

  // --- 6. Skill declares the inputs the command passes -----------------------
  // Probe terms are asserted to still exist in §8 first, so a change to the
  // command's handoff list breaks this suite rather than passing vacuously.
  const handoff = section(cmd, "## 8. Pass explicit resolved context");
  check("6 §8 handoff section found in implement-task.md", handoff.length > 200, `${handoff.length} chars`);
  const inputs = section(skill, "## Inputs this skill requires");
  check("6 skill has an Inputs section", inputs.length > 200, `${inputs.length} chars`);

  const probes: Array<[string, RegExp]> = [
    ["TARGET_ROOT", /TARGET_ROOT/],
    ["Feature Analysis", /Feature Analysis/],
    ["DD", /\bDD\b/],
    ["Dev Plan", /Dev Plan/],
    ["Task Breakdown", /Task Breakdown/],
    ["task id", /task id/i],
    ["task-row content", /task[- ]row content/i],
    ["platform", /\bplatform\b/],
    ["design reference", /design reference/i],
    ["dependency status", /dependency status/i],
    ["approval status", /approval status/i],
    ["unresolved-blocker status", /unresolved[- ]blocker status/i],
  ];
  for (const [label, re] of probes) {
    check(`6 §8 still passes "${label}"`, re.test(handoff));
    check(`6 skill Inputs declares "${label}"`, re.test(inputs));
  }
  check("6 §8 still passes device_type", /device_type/.test(handoff));
  check("6 skill Inputs deliberately omits device_type", !/device_type/.test(inputs));
  check("6 skill Inputs stops on a missing input", /stop and report exactly which input is missing/.test(skillFlat));

  // --- 7. Skill's completion report satisfies §10 ----------------------------
  const verify = section(cmd, "## 10. Completion handling");
  check("7 §10 completion section found in implement-task.md", verify.length > 200, `${verify.length} chars`);
  const report = section(skill, "## 11. Completion & reporting");
  check("7 skill has a Completion & reporting section", report.length > 200, `${report.length} chars`);

  const reportProbes: Array<[string, RegExp, RegExp]> = [
    ["each acceptance criterion individually", /each acceptance criterion checked individually/i, /[Aa]cceptance-criteria checklist, one by one/],
    ["validation commands + exact results", /validation commands run and their exact results/i, /[Vv]alidation commands run and their exact results/],
    ["files changed", /files changed/i, /[Ff]iles changed/],
    ["applied standard IDs", /applied standard IDs/i, /[Aa]pplied standard IDs/],
    ["deviations and blockers", /deviations and blockers/i, /[Dd]eviations/],
    ["no unrelated scope added", /no unrelated scope was added/i, /no unrelated scope was added/],
    ["writes inside TARGET_ROOT", /writes landed inside `TARGET_ROOT`/, /writes landed inside `TARGET_ROOT`/],
  ];
  for (const [label, cmdRe, skillRe] of reportProbes) {
    check(`7 §10 still requires "${label}"`, cmdRe.test(verify));
    check(`7 skill report covers "${label}"`, skillRe.test(report));
  }
  check("7 skill blocks completion on a failed criterion", /Do not mark the task complete if/.test(skill));
  check("7 skill has a validation methodology", /## 9\. Validation methodology/.test(skill));
  check("7 skill forbids claiming an unrun command passed", /Do not claim a command passed unless it was actually run successfully/.test(skillFlat));

  // --- 8. Skill does not absorb command logic -------------------------------
  check("8 skill does not resolve the repo root", !/resolve-target-repo-root/.test(skill));
  check("8 skill does not parse the command arguments", !/\[feature\] \[task-id\]/.test(skill));
  check("8 skill contains no platform routing table", !/\| `react-native` \|/.test(skill));
  check("8 skill declares the command/agent/skill/hooks boundary", /## Relationship with command, agent, hooks/.test(skill));
  check("8 skill disclaims orchestration", /It is not orchestration/.test(skillFlat));
  check("8 skill states it does not move command logic into itself", /does not move command logic into itself/.test(skillFlat));

  // --- 9. Fix methodology must NOT migrate into the skill (Option A) ---------
  check("9 skill carries no fix-stage methodology", !/fix-review-comments/.test(skill));
  check("9 skill scoped to /implement-task in its description", /Used by \/implement-task via the rn-feature-developer agent/.test(skill));

  // --- 10. React Native is mobile-only --------------------------------------
  for (const [label, doc] of [["agent", agent], ["skill", skill]] as const) {
    check(`10 ${label} carries no device_type text`, !/device_type/.test(doc));
    check(`10 ${label} carries no TV handling`, !/\btv\b/i.test(doc));
    check(`10 ${label} carries no tvOS reference`, !/tvos/i.test(doc));
    check(`10 ${label} carries no react-native-tvos reference`, !/react-native-tvos/.test(doc));
    check(`10 ${label} carries no Platform.isTV reference`, !/Platform\.isTV/.test(doc));
  }

  // --- 11. Every cited standard resolves ------------------------------------
  const table = section(skill, "## 12. Standards citation");
  check("11 skill has a standards citation table", /\| Area \| Standard file \| IDs \|/.test(table));
  const rows = [...table.matchAll(/^\|[^|]+\|\s*`(standards\/[^`]+)`\s*\|([^|]+)\|/gm)];
  check(`11 citation table has rows (${rows.length})`, rows.length >= 8, String(rows.length));
  for (const [, relPath, idCell] of rows) {
    const abs = join(REPO_ROOT, relPath);
    check(`11 cited standard exists: ${relPath}`, existsSync(abs));
    if (!existsSync(abs)) continue;
    const std = readFileSync(abs, "utf-8");
    for (const m of idCell.matchAll(/`([A-Z0-9]+(?:-[A-Z0-9]+)+)-\*`/g)) {
      check(`11 ${m[1]}-* exists in ${relPath}`, new RegExp(`\`${m[1]}-\\d`).test(std));
    }
  }
  const skillPaths = [...skill.matchAll(/`(standards\/[A-Za-z0-9._/-]+\.md)`/g)].map((m) => m[1]);
  for (const rel of [...new Set(skillPaths)]) {
    check(`11 skill path resolves: ${rel}`, existsSync(join(REPO_ROOT, rel)));
  }

  // --- 12. Structural completeness of the methodology ------------------------
  for (const h of [
    "## 0. Standards readiness gate",
    "## 1. Source-of-truth hierarchy",
    "## 2. Task resolution & readiness checks",
    "## 3. Repository grounding",
    "## 4. Context loading before edits",
    "## 5. Pre-implementation plan",
    "## 6. React Native implementation methodology",
    "## 7. Scope control & deviation rules",
    "## 8. Incremental implementation",
    "## 9. Validation methodology",
    "## 10. Self-review",
    "## 11. Completion & reporting",
    "## 12. Standards citation",
    "## Red flags — STOP and report instead of proceeding",
  ]) {
    check(`12 skill has "${h}"`, skill.includes(h));
  }
  check("12 skill uses the dependency status the command passed", /never re-derived here/.test(skillFlat));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
