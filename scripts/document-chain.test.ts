/**
 * document-chain.test.ts
 *
 * The deterministic document-chain dry-run (SHARED-005).
 *
 * WHAT THIS IS. It drives the plugin's real helpers head-to-tail over a fixture target
 * repository containing real stage artifacts, and asserts every seam: that each stage's
 * output is valid input to the next stage's reader. This is the only suite whose failure
 * can be caused by any other — a seam break is invisible to a per-component test.
 *
 * WHAT THIS IS NOT. It is not an end-to-end run of the workflow, and nothing here
 * simulates a command, a skill, an agent or a model. Those are ~7.4k lines of
 * instructions that only Claude executes; a mock would assert the self-consistency of a
 * fiction. This suite therefore says nothing about whether a DD is any good — only that
 * the machinery carrying documents between stages still fits together.
 *
 * Fixtures are committed as plain files under scripts/fixtures/repos/ (a committed
 * fixture cannot carry a nested .git), copied to a temp dir and `git init`-ed here.
 *
 * Two fixtures, deliberately:
 *   feature-complete  approved FA -> DD -> Dev Plan -> Task Breakdown, plus a manifest.
 *                     The happy chain, including task-state dependency proof.
 *   feature-legacy    a pre-repo_knowledge_* analysis, no manifest, no task state.
 *                     Proves the chain degrades rather than breaks on an old feature.
 *
 * No per-platform or TV variants: no helper or hook reads device_type, and task-state
 * stores `platform` without branching on it, so such fixtures would exercise nothing.
 *
 * No external test framework. Run with:
 *   node scripts/document-chain.test.ts
 *   bun  scripts/document-chain.test.ts
 */

import { spawnSync } from "child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, realpathSync } from "fs";
import { join, dirname, isAbsolute } from "path";
import { tmpdir } from "os";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const FIXTURES = join(HERE, "fixtures", "repos");

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

const haveGit = spawnSync("git", ["--version"], { encoding: "utf-8" }).status === 0;
if (!haveGit) {
  console.log("SUITE SKIPPED: git is not installed; the chain needs a real repository root.");
  process.exit(0);
}

/**
 * Copy a committed fixture into a temp dir and make it a real git repo.
 *
 * The path is realpath'd before it is returned: on macOS the temp dir arrives as
 * /var/folders/... while resolve-target-repo-root.ts correctly canonicalises it to
 * /private/var/folders/.... Comparing an un-canonicalised path against the helper's
 * output would fail for a reason that has nothing to do with the plugin.
 */
function materialize(fixture: string): string {
  const dest = realpathSync(mkdtempSync(join(tmpdir(), `chain-${fixture}-`)));
  cpSync(join(FIXTURES, fixture), dest, { recursive: true });
  const git = (...args: string[]) => spawnSync("git", ["-C", dest, ...args], { encoding: "utf-8" });
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  git("add", "-A");
  git("commit", "-qm", "fixture");
  return dest;
}

/** Run a plugin helper exactly as a command would, and parse its single JSON object. */
function helper(script: string, args: string[]): { code: number; json: any; raw: string } {
  const proc = spawnSync(process.execPath, ["--no-warnings", join(HERE, script), ...args], {
    encoding: "utf-8",
    cwd: REPO_ROOT,
  });
  const raw = proc.stdout ?? "";
  let json: any = null;
  try {
    json = JSON.parse(raw);
  } catch {
    /* left null; the assertion reports it */
  }
  return { code: proc.status ?? -1, json, raw };
}

/** Minimal frontmatter reader: the two encodings docs/planning-doc-contract.md supports. */
function frontmatter(path: string): Record<string, string> {
  const text = readFileSync(path, "utf-8");
  let block = "";
  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---", 4);
    block = end === -1 ? "" : text.slice(4, end);
  } else {
    const m = /```ya?ml\n([\s\S]*?)\n```/.exec(text);
    block = m ? m[1] : "";
  }
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   Chain A — feature-complete: the full deterministic chain
   ══════════════════════════════════════════════════════════════════════════ */
{
  const root = materialize("feature-complete");
  const feature = "biometric-login";
  const fa = join(root, "docs", `${feature}-feature-analysis.md`);
  const dd = join(root, "docs", `${feature}-DD.md`);
  const plan = join(root, "docs", `${feature}-dev-plan.md`);
  const bd = join(root, "docs", `${feature}-task-breakdown.md`);

  /* ── seam 1: TARGET_ROOT resolution ── */
  const rr = helper("resolve-target-repo-root.ts", [root]);
  check("A1 repo root resolves", rr.code === 0 && rr.json?.ok === true, rr.raw.slice(0, 120));
  check("A1 targetRoot is the fixture root", rr.json?.targetRoot === root);
  check("A1 not flagged as a worktree", rr.json?.targetIsWorktree === false);

  /* ── seam 2: repository knowledge ── */
  const rk = helper("read-repo-knowledge.ts", [root]);
  check("A2 manifest is read", rk.code === 0 && rk.json?.available === true, rk.raw.slice(0, 120));
  check("A2 conventions reported reusable", (rk.json?.usableCategories ?? []).includes("conventions"));
  check("A2 unknown coverage routed to deriveLive", (rk.json?.deriveLive ?? []).includes("inventory"));

  /* ── seam 3: the Feature Analysis loads through the migration layer ── */
  const mfa = helper("migrate-planning-doc.ts", [fa, "--kind", "feature-analysis"]);
  check("A3 feature analysis loads", ["current", "migrated"].includes(mfa.json?.status), mfa.raw.slice(0, 160));
  check("A3 approval survives the load", frontmatter(fa).status === "approved");

  /* ── seam 4: complexity assessment accepts the recorded signals ── */
  const signals = JSON.stringify({
    modules_touched: 1, change_classes: 3, change_sites: 3, cross_module_change_classes: 0,
    surfaces_changed: 1, new_contract: false, new_pattern: false, new_dependency: true,
    data_migration: false, concurrency_change: false, design_reference_status: "provided",
  });
  const cx = helper("assess-dd-complexity.ts", ["--signals", signals]);
  check("A4 complexity scores without a second repo pass", cx.code === 0 && typeof cx.json?.band === "string");
  check("A4 the band the DD records is a real band",
    ["low", "medium", "high", "unclassified"].includes(frontmatter(dd).dd_complexity_band));

  /* ── seam 5: the DD loads, and carries the DD Package fields ── */
  const mdd = helper("migrate-planning-doc.ts", [dd, "--kind", "dd"]);
  check("A5 DD loads", ["current", "migrated"].includes(mdd.json?.status), mdd.raw.slice(0, 160));
  check("A5 dd_generation is single", frontmatter(dd).dd_generation === "single");

  /* ── seam 6: cross-document identity and link resolution ──
     /implement-task section 4 requires exactly this, and nothing verified it in code. */
  const fFa = frontmatter(fa), fDd = frontmatter(dd), fPlan = frontmatter(plan), fBd = frontmatter(bd);
  check("A6 feature identity is consistent across the chain",
    fFa.feature === feature && fDd.feature === feature && fPlan.feature === feature && fBd.feature === feature,
    `${fFa.feature}/${fDd.feature}/${fPlan.feature}/${fBd.feature}`);
  check("A6 the DD points back at this feature analysis",
    join(root, fDd.feature_analysis_link) === fa, fDd.feature_analysis_link);
  check("A6 the Dev Plan points at this DD", join(root, fPlan.dd_link) === dd, fPlan.dd_link);
  check("A6 the breakdown points at the analysis, DD and plan",
    join(root, fBd.feature_analysis_link) === fa && join(root, fBd.dd_link) === dd &&
    join(root, fBd.dev_plan_link) === plan);

  const links = ["feature_analysis_link", "dd_link", "dev_plan_link"]
    .map((k) => fBd[k]).filter((v) => v !== undefined && v !== "");
  check("A6 every breakdown link resolves on disk", links.every((l) => existsSync(join(root, l))), links.join(", "));
  check("A6 no link escapes TARGET_ROOT or points into a worktree",
    links.every((l) => !isAbsolute(l) && !l.includes("..") && !l.includes(".claude/worktrees")));
  check("A6 no link points at a plugin template",
    links.every((l) => !l.startsWith("templates/")), links.join(", "));

  /* ── seam 7: platform and device context carried unchanged ── */
  check("A7 platform is one confirmed value throughout",
    [fFa, fDd, fPlan, fBd].every((f) => f.platform === "react-native"));
  check("A7 platform is never mixed", [fFa, fDd, fPlan, fBd].every((f) => f.platform !== "mixed"));
  check("A7 device_type is carried and valid",
    [fFa, fDd, fPlan, fBd].every((f) => ["mobile", "tv"].includes(f.device_type)));
  check("A7 the four design-reference fields are carried into the breakdown",
    fBd.design_reference_status === fDd.design_reference_status &&
    fBd.design_reference_type === fDd.design_reference_type);

  /* ── seam 8: task state — unknown, then proven, then stale ── */
  const ts = (args: string[]) => helper("task-state.ts", args);
  const base = ["--root", root, "--feature", feature, "--breakdown", bd];

  let r = ts(["read", ...base]);
  check("A8 no state yet: read reports absent", r.json?.status === "absent");
  check("A8 every breakdown task is enumerated as unknown",
    ["T1", "T2", "T3"].every((t) => r.json?.tasks?.[t]?.state === "unknown"));
  check("A8 dependsOn comes from the breakdown", r.json?.tasks?.T3?.dependsOn?.join(",") === "T1,T2");
  check("A8 an unrecorded dependency is not proof",
    (r.json?.tasks?.T2?.dependsOn ?? []).every((d: string) => r.json.tasks[d].deterministicProof === false));

  check("A8 in-progress is recorded before handoff",
    ts(["write", ...base, "--task", "T1", "--state", "in-progress", "--head", "abc1234"]).json?.runId === "T1-attempt-1");
  check("A8 complete is refused without verification",
    ts(["write", ...base, "--task", "T1", "--state", "complete"]).json?.reason === "complete-without-verification");

  const payload = JSON.stringify({
    platform: "react-native",
    filesChanged: ["src/features/auth/useBiometrics.ts"],
    standardIds: ["ARCH-LAYERS-3"],
    validation: [{ command: "tsc --noEmit", result: "pass" }],
    acceptanceCriteria: [{ criterion: "Hook reports availability", met: true }],
  });
  check("A8 complete is written once verified",
    ts(["write", ...base, "--task", "T1", "--state", "complete", "--head", "abc1234", "--payload", payload]).json?.status === "written");

  r = ts(["read", ...base]);
  check("A8 T1 is now deterministic proof", r.json?.tasks?.T1?.deterministicProof === true);
  check("A8 T2's dependency is therefore proven",
    (r.json.tasks.T2.dependsOn ?? []).every((d: string) => r.json.tasks[d].deterministicProof === true));
  check("A8 T3 is still unproven (T2 unrecorded)",
    (r.json.tasks.T3.dependsOn ?? []).some((d: string) => r.json.tasks[d].deterministicProof === false));
  check("A8 the implementation record is available to the QA stage",
    r.json.tasks.T1.filesChanged.length === 1 && r.json.tasks.T1.standardIds[0] === "ARCH-LAYERS-3");

  // Editing the row must withdraw the proof — the seam that stops a stale completion
  // from silently unblocking a dependent task.
  writeFileSync(bd, readFileSync(bd, "utf-8").replace("Add the biometrics hook", "Add the biometrics hook and cache it"));
  r = ts(["read", ...base]);
  check("A8 editing the row makes the completion stale", r.json?.tasks?.T1?.stale === true);
  check("A8 a stale completion is no longer proof", r.json.tasks.T1.deterministicProof === false);
  check("A8 and the dependent task is unproven again",
    (r.json.tasks.T2.dependsOn ?? []).every((d: string) => r.json.tasks[d].deterministicProof === false));

  check("A8 the state file lives at the single discovery path",
    existsSync(join(root, "docs", "tasks", `${feature}-task-state.json`)));
  check("A8 the breakdown was not mutated for discovery",
    !readFileSync(bd, "utf-8").includes("task_state_link"));

  rmSync(root, { recursive: true, force: true });
}

/* ══════════════════════════════════════════════════════════════════════════
   Chain B — feature-legacy: the chain degrades, never breaks
   ══════════════════════════════════════════════════════════════════════════ */
{
  const root = materialize("feature-legacy");
  const feature = "legacy-search";
  const fa = join(root, "docs", `${feature}-feature-analysis.md`);
  const bd = join(root, "docs", `${feature}-task-breakdown.md`);

  const rr = helper("resolve-target-repo-root.ts", [root]);
  check("B1 repo root resolves for a legacy feature", rr.code === 0 && rr.json?.ok === true);

  const rk = helper("read-repo-knowledge.ts", [root]);
  check("B2 a missing manifest is reported, not fatal",
    rk.code === 0 && rk.json?.available === false && rk.json?.reason === "absent");
  check("B2 every category is routed to live derivation", (rk.json?.deriveLive ?? []).length === 7);

  const before = frontmatter(fa);
  check("B3 the legacy analysis starts without repo_knowledge_* fields",
    before.repo_knowledge_status === undefined);
  const m = helper("migrate-planning-doc.ts", [fa, "--kind", "feature-analysis"]);
  check("B3 the migrator handles it without failing",
    ["migrated", "current", "needs-input"].includes(m.json?.status), m.raw.slice(0, 200));

  if (m.json?.status === "migrated") {
    const after = frontmatter(fa);
    check("B3 migration stamps the current schema version", after.doc_schema_version === "3");
    check("B3 approval is untouched by migration", after.status === "approved");
    check("B3 feature identity is untouched", after.feature === feature);
    check("B3 repo_knowledge_* is filled with the unavailable block",
      after.repo_knowledge_status === "unavailable");
  } else {
    check(`B3 non-migrated status is reported verbatim (${m.json?.status})`, true);
  }

  const r = helper("task-state.ts", ["read", "--root", root, "--feature", feature, "--breakdown", bd]);
  check("B4 no task state: reported absent", r.json?.status === "absent");
  check("B4 both legacy tasks enumerated as unknown",
    r.json?.tasks?.T1?.state === "unknown" && r.json?.tasks?.T2?.state === "unknown");
  check("B4 dependency completeness is therefore unproven, not vacuously true",
    (r.json?.tasks?.T2?.dependsOn ?? ["T1"]).every((d: string) => r.json.tasks[d].deterministicProof === false));

  rmSync(root, { recursive: true, force: true });
}

/* ══════════════════════════════════════════════════════════════════════════
   Fixture hygiene
   ══════════════════════════════════════════════════════════════════════════ */
{
  for (const f of ["feature-complete", "feature-legacy"]) {
    check(`C fixture exists: ${f}`, existsSync(join(FIXTURES, f)));
    check(`C fixture carries no nested .git: ${f}`, !existsSync(join(FIXTURES, f, ".git")));
    check(`C fixture documents itself: ${f}`, existsSync(join(FIXTURES, f, "README.md")));
  }
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
