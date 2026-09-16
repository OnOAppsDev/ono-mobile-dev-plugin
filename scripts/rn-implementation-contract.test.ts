/**
 * rn-implementation-contract.test.ts
 *
 * Structural tests for the React Native implementation lane:
 *   agents/rn-feature-developer.md      — the thin executor
 *   skills/rn-feature-implementation/   — the RN half of the implementation methodology
 *   skills/platform-implementation/     — the platform-independent half
 *
 * GENERALISED FOR THE SPLIT LANE. The methodology is being separated into a shared
 * lifecycle skill and a per-platform pack, so three of the four properties below now name
 * a different owner than they used to. Nothing was deleted or weakened: the declared-input
 * contract (group 6) and the completion report (group 7) are platform-independent and are
 * checked against the shared skill; structural completeness (group 12) is now a property
 * of the PAIR, with nine sections asserted on the shared skill and the platform sections
 * on the pack. Groups 8 and 9 are asserted on BOTH halves, because "absorbs no command
 * logic" and "carries no fix-stage methodology" must hold for each. Group 10 deliberately
 * did NOT move: React Native is mobile-only, and that stays on the RN pack and agent.
 *
 * Landed green against the PRE-SLIM tree, so it constrains the slimming rather than being
 * shaped by it.
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
// OWNERSHIP MOVED (Stage 3d + cleanup): `feature-implementer` executes every lane.
const AGENT = join(REPO_ROOT, "agents", "feature-implementer.md");
const SKILL = join(REPO_ROOT, "skills", "rn-feature-implementation", "SKILL.md");
const IMPLEMENT_CMD = join(REPO_ROOT, "commands", "implement-task.md");
/** The shared lifecycle half. Owns the workflow properties groups 6, 7 and 12 check. */
const SHARED = join(REPO_ROOT, "skills", "platform-implementation", "SKILL.md");

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
check("0 shared lifecycle skill exists", existsSync(SHARED));

if (failures === 0) {
  const agent = readFileSync(AGENT, "utf-8");
  const skill = readFileSync(SKILL, "utf-8");
  const cmd = readFileSync(IMPLEMENT_CMD, "utf-8");
  const shared = readFileSync(SHARED, "utf-8");
  const agentFlat = agent.replace(/\s+/g, " ");
  const skillFlat = skill.replace(/\s+/g, " ");
  const sharedFlat = shared.replace(/\s+/g, " ");

  // --- 1. Agent delegates the methodology ------------------------------------
  check("1 agent has frontmatter with the routing name", /^---\nname: feature-implementer\ndescription: /.test(agent));
  check("1 agent names the implementation skill", /skills\/platform-implementation\/SKILL\.md/.test(agent));
  check("1 agent states it does not restate the methodology", /Do not summarise it here — a second copy is the drift risk/.test(agentFlat));
  check("1 agent Process defers to the skill", /Follow `skills\/platform-implementation\/SKILL\.md` end to end/.test(agentFlat));

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
  check("4 C33 conflicting-standards rule retained", /two applicable standards conflict, flag the conflict/.test(agentFlat));
  check("4 C34 no-standards-prose-in-comments rule retained", /Don't restate a standard's text in code comments/.test(agentFlat));
  check("4 C35 design-reference gate retained", /Don't implement a UI task from a description alone when no design reference is on file/.test(agentFlat));
  check("4 C36 detected-conventions rule added", /Follow the repository's detected conventions/.test(agentFlat));

  // --- 5. Fix stage stays in the agent (Option A) ----------------------------
  check("5 agent covers /fix-review-comments", /## Delegation[\s\S]*fix-review-comments/.test(agent));
  check("5 agent covers /create-dev-qa-notes", /## Delegation[\s\S]*create-dev-qa-notes/.test(agent));
  check("5 agent names mobile-debugging as the root-cause owner", /`mobile-debugging` owns root-causing/.test(agentFlat));

  // --- 6. Skill declares the inputs the command passes -----------------------
  // Probe terms are asserted to still exist in §8 first, so a change to the
  // command's handoff list breaks this suite rather than passing vacuously.
  const handoff = section(cmd, "## 8. Pass explicit resolved context");
  check("6 §8 handoff section found in implement-task.md", handoff.length > 200, `${handoff.length} chars`);
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

  // OWNERSHIP MOVED TWICE. The inputs are declared once, by the command's §8. The shared
  // skill CITES that section instead of restating it, so this group now asserts both
  // halves of the contract: §8 still declares every input, and the skill does not carry a
  // second copy that could drift from it.
  for (const [label, re] of probes) {
    check(`6 §8 still passes "${label}"`, re.test(handoff));
  }
  check("6 §8 still passes device_type", /device_type/.test(handoff));
  check("6 shared cites §8 as the authoritative handoff",
    /`commands\/implement-task\.md`[^.]{0,40}§8|§8[^.]{0,40}handoff/.test(sharedFlat));
  check("6 shared takes those inputs as authoritative",
    /Take the inputs .{0,40}§8 passes as authoritative/.test(sharedFlat));
  check("6 shared does NOT restate the input list",
    !/## Inputs this skill requires/.test(shared));
  check("6 shared still stops on a missing input",
    /stop and report exactly which input is missing/.test(sharedFlat));
  check("6 shared never re-resolves an input itself",
    /never re-resolve by searching, never guess a path/.test(sharedFlat));

  // --- 7. Skill's completion report satisfies §10 ----------------------------
  const verify = section(cmd, "## 10. Completion handling");
  check("7 §10 completion section found in implement-task.md", verify.length > 200, `${verify.length} chars`);
  const reportProbes: Array<[string, RegExp]> = [
    ["each acceptance criterion individually", /each acceptance criterion checked individually/i],
    ["validation commands + exact results", /validation commands run and their exact results/i],
    ["files changed", /files changed/i],
    ["applied standard IDs", /applied standard IDs/i],
    ["deviations and blockers", /deviations and blockers/i],
    ["no unrelated scope added", /no unrelated scope was added/i],
    ["writes inside TARGET_ROOT", /writes landed inside `TARGET_ROOT`/],
  ];

  // Same move: §10 owns the report shape, the shared skill cites it.
  for (const [label, cmdRe] of reportProbes) {
    check(`7 §10 still requires "${label}"`, cmdRe.test(verify));
  }
  check("7 shared returns the report §10 requires",
    /structured completion report .{0,40}§10 requires/.test(sharedFlat));
  check("7 shared does NOT restate the report shape",
    !/## 11\. Completion & reporting/.test(shared));
  check("7 shared keeps the completion gate", /Do not mark the task complete if/.test(shared));
  check("7 shared keeps a validation methodology", /## 7\. Validation methodology/.test(shared));
  check("7 shared forbids claiming an unrun command passed",
    /Do not claim a command passed unless it was actually run successfully/.test(sharedFlat));
  check("7 shared still requires applied standard IDs", /standard IDs were \*\*applied\*\*/.test(sharedFlat));

  // Property 3 holds for BOTH halves of the methodology, so it is asserted on both.
  for (const [label, doc, docFlat] of [["pack", skill, skillFlat], ["shared", shared, sharedFlat]] as const) {
    check(`8 ${label} does not resolve the repo root`, !/resolve-target-repo-root/.test(doc));
    check(`8 ${label} does not parse the command arguments`, !/\[feature\] \[task-id\]/.test(doc));
    check(`8 ${label} contains no platform routing table`, !/\| `react-native` \|/.test(doc));
    check(`8 ${label} disclaims orchestration`, /(It is not orchestration|not orchestration)/.test(docFlat));
    check(`8 ${label} states it does not move command logic into itself`, /does not move command logic into itself/.test(docFlat));
  }
  check("8 pack declares the command/agent/skill/hooks boundary", /## Relationship with command, agent, hooks/.test(skill));
  check("8 shared declares the command/agent/lane/hooks boundary", /## Relationship with command, agent, lane, hooks/.test(shared));

  // --- 9. Fix methodology must NOT migrate into the skill (Option A) ---------
  check("9 pack carries no fix-stage methodology", !/fix-review-comments/.test(skill));
  check("9 shared carries no fix-stage methodology", !/fix-review-comments/.test(shared));
  check("9 skill scoped to /implement-task in its description", /Used by \/implement-task via the feature-implementer agent/.test(skill));

  // --- 10. React Native is mobile-only --------------------------------------
  // Ownership did NOT move: React Native is mobile-only, and that protection stays on the
  // RN pack and the RN agent. The shared skill is platform-independent and may discuss
  // device_type, so it is deliberately NOT in this loop.
  for (const [label, doc] of [["agent", agent], ["skill", skill]] as const) {
    check(`10 ${label} carries no device_type text`, !/device_type/.test(doc));
    check(`10 ${label} carries no TV handling`, !/\btv\b/i.test(doc));
    check(`10 ${label} carries no tvOS reference`, !/tvos/i.test(doc));
    check(`10 ${label} carries no react-native-tvos reference`, !/react-native-tvos/.test(doc));
    check(`10 ${label} carries no Platform.isTV reference`, !/Platform\.isTV/.test(doc));
  }

  // --- 11. Every cited standard resolves ------------------------------------
  // Located by title, not by number: slimming renumbers the pack, and the number was
  // never the property. Same tolerance group 12 applies to the pack's headings.
  const tableHeading = (skill.match(/^#{2,3} (?:\d+\. )?Standards citation\s*$/m) ?? [""])[0];
  const table = tableHeading ? section(skill, tableHeading) : "";
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
  // SPLIT BY OWNER. The same fourteen sections must still exist; nine of them are
  // platform-independent and live in the shared skill, and the rest are platform content
  // that stays in the pack. Completeness is now a property of the PAIR, which is what the
  // split architecture means — no section is dropped, only re-homed.
  for (const h of [
    "## Authoritative owners — cite these, never restate them",
    "## 1. Standards readiness gate",
    "## 2. Design reference",
    "## 3. Repository grounding",
    "## 4. Pre-implementation plan",
    "## 5. Scope control & deviation rules",
    "## 6. Incremental implementation",
    "## 7. Validation methodology",
    "## 8. Self-review and completion",
    "## Red flags — STOP and report instead of proceeding",
  ]) {
    check(`12 shared has "${h}"`, shared.includes(h));
  }
  // The owners table is the deduplication contract: each authoritative owner named once.
  for (const owner of ["§8", "§10", "docs/task-state-contract.md",
                       "standards/shared/verification.md", "standards/shared/accessibility.md",
                       "skills/repo-knowledge-consumer/SKILL.md"]) {
    check(`12 shared cites owner ${owner}`, shared.includes(owner));
  }

  // Platform content stays in the pack. Matched without the section number so slimming
  // may renumber the pack; the number was never the property, the section is.
  for (const [label, re] of [
    ["React Native implementation methodology", /^#{2,3} (?:\d+\. )?React Native implementation methodology\s*$/m],
    ["Standards citation", /^#{2,3} (?:\d+\. )?Standards citation\s*$/m],
    ["Red flags", /^## Red flags — STOP and report instead of proceeding\s*$/m],
  ] as const) {
    check(`12 pack has "${label}"`, re.test(skill));
  }

  // The pack must still carry a standards readiness gate: it is the half that knows WHICH
  // files are cited, so the obligation cannot live only in the shared skill.
  check("12 pack has a standards readiness gate", /^#{2,3} (?:\d+\. )?Standards readiness( gate)?\s*$/m.test(skill));

  check("12 shared defers the gates to the command", /never re-derive them here/.test(sharedFlat));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
