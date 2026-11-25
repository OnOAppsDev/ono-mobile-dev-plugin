/**
 * bug-routing.test.ts
 *
 * Pins the 0.9.0 single-target routing exception for /analyze-bug (`repo-single-target`):
 *
 *   precedence    1 existing plan · 2 the related feature's one approved Task Breakdown ·
 *                 3 a single repository target proven by Project Knowledge · 4 the developer
 *   eligibility   knowledge available and valid, at the repository root (not a nested
 *                 project), surfaces trusted with coverage populated, source drift COMPLETE,
 *                 no invalid relationships, every surface mapped by the exact alias table, one
 *                 pair after collapsing (production + staging are one), React Native shells
 *                 proven to be one application
 *   tickets       a declared surface id or an exact canonical name may agree; a contradiction,
 *                 or anything unrecognised, keeps the developer's confirmation
 *   persistence   the existing frontmatter pair; the source, surfaces and knowledge commit in
 *                 the plan's routing line; interrupted runs, regeneration, approval and later
 *                 cycles carry it
 *   correction    `reroute` — the developer's explicit, canonical choice, only on an
 *                 unapproved cycle-1 draft whose routing the helper selected
 *   boundaries    Project Knowledge never sets the capability; the Feature Flow is unchanged
 *
 * Every repository here is synthetic (temporary git repositories). Whether Claude follows the
 * command's instructions is verified in a live session, never here.
 *
 *   node --no-warnings scripts/bug-routing.test.ts
 */

import { execFileSync } from "child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as Bug from "./analyze-bug.ts";
import * as Reader from "./read-repo-knowledge.ts";
import { BUG_WORK_PLAN_FIELDS } from "./bug-work-plan.ts";
import { approveWorkPackage, verifyApproval } from "./work-approval.ts";
import { stateFilePath } from "./task-state.ts";
import { bugGate } from "./bug-implementation.ts";
import { readFrontmatter } from "./migrate-planning-doc.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf-8");
const sha = (s: string) => createHash("sha256").update(s, "utf-8").digest("hex");
const show = (r: any) => JSON.stringify(r?.routing ?? [r?.outcome, r?.code, r?.reason]).slice(0, 400);
const TMP = realpathSync(mkdtempSync(join(tmpdir(), "bug-routing-")));
/**
 * Git isolation for this process (0.9.2): no global or system configuration, no global excludes
 * file and no XDG ignore file — so a host's own ignore rules (`.claude/`, `.DS_Store`, …) can never
 * hide a path from `git status` and change a routing result. Set on process.env before anything runs,
 * so the test's own git, the reader's git and every child process see the same isolated Git.
 * Nothing on the machine is changed: these are this process's variables only.
 */
const GIT_HOME = join(TMP, "git-home");
mkdirSync(join(GIT_HOME, "xdg", "git"), { recursive: true });
writeFileSync(join(GIT_HOME, "global.gitconfig"), "");
process.env.GIT_CONFIG_GLOBAL = join(GIT_HOME, "global.gitconfig");
process.env.GIT_CONFIG_NOSYSTEM = "1";
process.env.XDG_CONFIG_HOME = join(GIT_HOME, "xdg");
for (const v of ["GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT", "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete process.env[v];
const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf-8", env: ENV, stdio: ["ignore", "pipe", "ignore"] }).trim();
const write = (root: string, rel: string, body: string) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
};

/* ------------------------------------------------------------------ fixtures */

const CLAUDE = "# CLAUDE.md — yes+ TV\n\n## Targets and Surfaces\n";
const PAT = "# Patterns\n\n## State Management\nx\n", COMP = "# Components\n\n## Screens\nx\n", INT = "# Integrations\n\n## Analytics\nx\n";
type S = { id: string; platform: string | null; formFactor: string | null; sharedWith?: string[] };
const surf = (s: S) => ({ id: s.id, platform: s.platform, formFactor: s.formFactor, buildSelector: null, sourceRoots: [`app/${s.id}/`], sharedWith: s.sharedWith ?? [], packaging: null, minimumRuntime: null, evidence: [] });
const TV = [{ id: "android-tv", platform: "android", formFactor: "tv" }, { id: "android-tv-stg", platform: "Android TV", formFactor: "tv" }];
const CAPS = [{ id: "player", name: "Player", anchor: "docs/project/capabilities.md#capability-player", surfaceScope: "all", surfaces: [], sourceRoots: [{ path: "app/player/", surface: null }], entryPoints: [], components: [], services: [], routes: [], dataDependencies: [], stateOwnership: [], tests: [], evidence: [], relationships: [] }];

interface Opts {
  surfaces?: S[];
  sharedCode?: Array<{ root: string; sharedBy: string[] }>;
  coverage?: string;
  manifest?: "none" | "unparseable" | "nested";
  drift?: boolean;
  editClaude?: boolean;
  invalidRelationship?: boolean;
  breakdowns?: Array<{ feature: string; platform: string; device: string; status?: string }>;
}
let n = 0;
/** A git repository with an inspected, committed knowledge base and a manifest at its HEAD. */
function repoWith(o: Opts = {}): string {
  const root = join(TMP, `r${++n}`);
  const kroot = o.manifest === "nested" ? join(root, "TVApp") : root;
  mkdirSync(join(root, "docs/planning"), { recursive: true });
  git(root, "init", "-q", "-b", "main");
  write(kroot, "app/src/Main.kt", "fun main() = Unit\n");
  write(kroot, "CLAUDE.md", CLAUDE);
  write(kroot, "docs/project/patterns.md", PAT);
  write(kroot, "docs/project/components.md", COMP);
  write(kroot, "docs/project/integrations.md", INT);
  for (const b of o.breakdowns ?? []) {
    write(root, `docs/planning/${b.feature}-task-breakdown.md`, [
      `# Task Breakdown — ${b.feature}`, "", "```yaml", "doc_schema_version: 1", `feature: ${b.feature}`, "feature_analysis_link: docs/x-analysis.md",
      "dd_link: docs/x-DD.md", "dev_plan_link: docs/x-plan.md", `platform: ${b.platform}`, `device_type: ${b.device}`, `status: ${b.status ?? "approved"}`, "```", "",
      "| id | description | platform | files touched | depends-on | size | acceptance criteria |", "|---|---|---|---|---|---|---|", "",
    ].join("\n"));
  }
  git(root, "add", "-A");
  git(root, "commit", "-qm", "inspected");
  const kh = git(root, "rev-parse", "HEAD");
  if (o.drift) {
    write(kroot, "app/src/New.kt", "fun x() = 1\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "source change");
  }
  if (o.editClaude) write(kroot, "CLAUDE.md", CLAUDE + "\nEdited after the manifest.\n");
  if (o.manifest === "none") return root;
  const surfaces = (o.surfaces ?? TV).map(surf);
  const m = {
    repoKnowledgeSchemaVersion: 1,
    producedBy: { plugin: "ono-project-inspector", version: "0.13.0" },
    generatedAt: "2026-11-20T00:00:00.000Z",
    fingerprint: { gitHead: git(root, "rev-parse", "HEAD"), knowledgeHead: kh, artifacts: { "CLAUDE.md": sha(CLAUDE), "AUDIT.md": null, "docs/project/overview.md": null, "docs/project/components.md": sha(COMP), "docs/project/patterns.md": sha(PAT), "docs/project/integrations.md": sha(INT) } },
    coverage: { stack: "populated", commands: "partial", structure: "populated", inventory: "populated", conventions: "populated", integrations: "populated", auditTopics: "populated", surfaces: o.coverage ?? "populated", capabilities: "populated" },
    stack: { languages: ["Kotlin"], frameworks: [], platformHints: ["Android"], runtimeTooling: [], packageManagers: [] },
    commands: { install: null, run: null, test: null, build: null },
    structure: { repositoryTree: "CLAUDE.md#repository-structure", keyModules: "CLAUDE.md#key-modules", entryPoints: "CLAUDE.md#entry-points" },
    documents: { claudeMd: { path: "CLAUDE.md", exists: true, anchors: [] }, auditMd: { path: "AUDIT.md", exists: false, anchors: [] }, overview: { path: "docs/project/overview.md", exists: false, anchors: [] }, inventory: { path: "docs/project/components.md", exists: true, anchors: ["#screens"] }, conventions: { path: "docs/project/patterns.md", exists: true, anchors: ["#state-management"] }, integrations: { path: "docs/project/integrations.md", exists: true, anchors: ["#analytics"] } },
    auditTopics: [],
    surfaces,
    sharedCode: (o.sharedCode ?? []).map((c) => ({ ...c, mechanism: "shared source", evidence: [] })),
    capabilities: CAPS,
    capabilityRelationships: o.invalidRelationship ? [{ id: "player:depends_on:ghost", from: "player", type: "depends_on", to: "ghost", evidenceKind: "import", evidence: ["app/player/P.kt"], anchor: "docs/project/capabilities.md#relationships" }] : [],
  };
  write(kroot, ".ono/repo-knowledge.json", o.manifest === "unparseable" ? "{ not json" : JSON.stringify(m, null, 2));
  return root;
}

const EVIDENCE = { title: "Channel list skips the last row", steps: ["Open the EPG", "Scroll to the last channel"], expected: "The last channel is focusable", actual: "Focus jumps back to the first row" };
let reports = 0;
const report = (extra: Record<string, unknown> = {}) => {
  const p = join(TMP, `report-${++reports}.json`);
  writeFileSync(p, JSON.stringify({ ...EVIDENCE, ...extra }));
  return p;
};
/** Guy's case: an external bug, the ticket naming the android-tv surface, no related feature. */
const ext = (root: string, extra: Record<string, unknown> = { surfaces: ["android-tv"] }, key = "YET-1978") => ({ root, external: key, report: report(extra) });
const S = (req: Record<string, unknown>) => Bug.startBug(req as any);
const SC = (req: Record<string, unknown>) => Bug.scaffoldPlan(req as any);
const RR = (req: Record<string, unknown>) => Bug.rerouteDraft(req as any);
const planPath = (root: string, key = "YET-1978") => join(root, "docs/bugs", key, "bug-work-plan.md");
const auto = (r: any) => r?.routing?.source === "repo-single-target" && r.routing.requires_confirmation === false;
const asks = (r: any) => r?.routing?.requires_confirmation === true && r.routing.platform === null && r.routing.source === null;

/** The analysis the planning subagent writes into a scaffold — enough for a valid draft. */
function fill(text: string, platform: string): string {
  let t = text;
  const add = (heading: string, content: string) => {
    const at = t.indexOf(`\n## ${heading}\n`) + `\n## ${heading}\n`.length;
    t = `${t.slice(0, at)}\n${content}\n${t.slice(at)}`;
  };
  add("Root Cause", "[evidence: app/src/Main.kt] The focus wrap ignores the last row.");
  add("Blast Radius", "- [inference] Only the EPG list.");
  add("Repo Knowledge Reference", "Repository knowledge was used for routing only.");
  add("Open Questions", "- None.");
  const labels: Record<string, string> = {
    "Root-cause fix": "bound the focus index", "Minimal change surface": "one function", "Affected files / areas": "`app/src/Main.kt`", "Non-goals": "EPG layout",
    "No unrelated refactoring": "none", "Risks": "none [inference]", "Reproduction path": "open the EPG, scroll to the end", "Developer Testing": "unit test",
    "Regression test": "T1 adds a failing test", "Affected surfaces": "android-tv", "QA re-test": "QA re-tests on android-tv", "Verification debt": "none",
  };
  for (const [label, value] of Object.entries(labels)) t = t.replace(new RegExp(`^- \\*\\*${label.replace(/[/]/g, "\\/")}:\\*\\*\\s*$`, "m"), `- **${label}:** ${value}`);
  const tasks = t.indexOf("\n## Tasks\n");
  const sep = t.indexOf("|---|---|---|---|---|---|---|\n", tasks) + "|---|---|---|---|---|---|---|\n".length;
  const rows = [
    `| T1 | Add a failing regression test for the last-row focus | ${platform} | \`app/src/test/FocusTest.kt\` | — | S | The test fails on the current code for the documented reproduction |`,
    `| T2 | Bound the focus index | ${platform} | \`app/src/Main.kt\` | T1 | S | The reported reproduction path no longer fails: the last channel is focusable; T1 passes |`,
  ];
  return `${t.slice(0, sep)}${rows.join("\n")}\n${t.slice(sep)}`;
}

/* --------------------------------------------------------------------- cases */

try {
  /* 1. Guy's case — Android TV, production and staging surfaces → one candidate, no question. */
  {
    const root = repoWith();
    const r = S(ext(root));
    check("1 Android TV with production and staging surfaces auto-routes (repo-single-target)", auto(r) && r.routing.platform === "android" && r.routing.device_type === "tv", show(r));
    check("1 the two surfaces are one candidate; ids are reported, never read for meaning", JSON.stringify(r.routing.evidence?.surfaces) === '["android-tv","android-tv-stg"]');
    check("1 the evidence names the manifest and the knowledge commit", r.routing.evidence?.manifest === ".ono/repo-knowledge.json" && r.routing.evidence.knowledge_head === Reader.readRepoKnowledge(root).sourceDrift?.knowledgeHead);
    const sc = SC(ext(root));
    check("1 scaffold needs no --platform / --device-type: the helper decided", sc.ok === true && sc.outcome === "SCAFFOLDED" && sc.routing.platform === "android" && sc.routing.device_type === "tv", JSON.stringify(sc).slice(0, 300));
    const text = readFileSync(planPath(root), "utf-8");
    const fm = readFrontmatter(Buffer.from(text))?.values ?? {};
    check("1 the canonical pair is persisted in the existing frontmatter fields", fm.platform === "android" && fm.device_type === "tv");
    const kh = r.routing.evidence.knowledge_head.slice(0, 12);
    check("1 the routing line records the source, the surfaces and the knowledge commit",
      text.includes(`- **Platform / device type:** android / tv — resolved from Project Knowledge (\`repo-single-target\`): the repository's single target — surfaces \`android-tv\`, \`android-tv-stg\` in \`.ono/repo-knowledge.json\`, knowledge at \`${kh}\``), text.split("\n").find((l) => l.includes("Platform / device type")));
    const keys = (readFrontmatter(Buffer.from(text))?.keys ?? []) as string[];
    check("1 no new frontmatter field — only the plan's own fields", keys.every((k) => (BUG_WORK_PLAN_FIELDS as readonly string[]).includes(k) || k === "author" || k === "date"), keys.join(","));
    const again = S(ext(root));
    check("1 an interrupted run resumes with the recorded routing, never re-deciding it", again.outcome === "BUG_PLAN_INCOMPLETE" && again.routing.source === "existing-plan" && again.routing.platform === "android" && again.routing.device_type === "tv");
    check("1 …and reports the recorded source for the approval summary", again.routing.recorded?.source === "repo-single-target" && again.routing.recorded.how.includes("android-tv-stg"));
    check("1 an explicit, matching routing argument is accepted", SC({ ...ext(repoWith()), platform: "android", deviceType: "tv" }).ok === true);
    const conflict = SC({ ...ext(repoWith()), platform: "android", deviceType: "mobile" });
    check("1 an explicit routing argument contradicting the proven target is ROUTING_CONFLICT", conflict.ok === false && conflict.code === "ROUTING_CONFLICT", JSON.stringify(conflict));
    check("1 an alias is still ROUTING_INVALID, with its canonical pair", SC({ ...ext(repoWith()), platform: "androidtv", deviceType: "tv" }).code === "ROUTING_INVALID");
  }

  /* 2. Every supported pair, when proven. */
  {
    const cases: Array<[string, S[], unknown, string, string]> = [
      ["native Android mobile", [{ id: "phone", platform: "Android", formFactor: "handheld" }], ["android"], "android", "mobile"],
      ["native iOS mobile", [{ id: "iphone", platform: "iOS", formFactor: "handheld" }], ["ios"], "ios", "mobile"],
      ["tvOS", [{ id: "appletv", platform: "tvOS", formFactor: "tv" }], ["tvos"], "ios", "tv"],
      ["Apple TV prod + staging", [{ id: "atv", platform: "Apple TV", formFactor: "tv" }, { id: "atv-stg", platform: "tvos", formFactor: "tv" }], [], "ios", "tv"],
      ["React Native, one surface", [{ id: "app", platform: "React Native", formFactor: "handheld" }], ["ios"], "react-native", "mobile"],
      ["surrounding whitespace and case are not meaning", [{ id: "a", platform: "  ANDROID ", formFactor: "tv" }], [], "android", "tv"],
    ];
    for (const [name, surfaces, ticket, p, d] of cases) {
      const r = S(ext(repoWith({ surfaces }), { surfaces: ticket }));
      check(`2 ${name} auto-routes to ${p} / ${d}`, auto(r) && r.routing.platform === p && r.routing.device_type === d, show(r));
    }
  }

  /* 3. React Native: only when its shells are proven to be one application. */
  {
    const shells = [{ id: "rn-ios", platform: "React Native", formFactor: "handheld", sharedWith: ["rn-android"] }, { id: "rn-android", platform: "react-native", formFactor: "handheld", sharedWith: ["rn-ios"] }];
    const linked = S(ext(repoWith({ surfaces: shells, sharedCode: [{ root: "src/", sharedBy: ["rn-android", "rn-ios"] }] }), { surfaces: ["android"] }));
    check("3 React Native with linked shells (sharedWith + one shared root) auto-routes react-native / mobile", auto(linked) && linked.routing.platform === "react-native" && linked.routing.device_type === "mobile", show(linked));
    check("3 an iOS or Android ticket surface corroborates React Native (the OS is a surface)", auto(S(ext(repoWith({ surfaces: shells, sharedCode: [{ root: "src/", sharedBy: ["rn-android", "rn-ios"] }] }), { surfaces: ["ios", "android"] }))));
    const noShared = S(ext(repoWith({ surfaces: shells }), { surfaces: [] }));
    check("3 React Native shells with no shared root are not proven one app → confirm", asks(noShared) && /one application/.test(noShared.routing.repo_single_target?.reason), JSON.stringify(noShared.routing));
    const oneWay = S(ext(repoWith({ surfaces: [shells[0], { ...shells[1], sharedWith: [] }], sharedCode: [{ root: "src/", sharedBy: ["rn-android", "rn-ios"] }] }), { surfaces: [] }));
    check("3 a one-way sharedWith is not a proven relationship → confirm", asks(oneWay));
    const unlinked = S(ext(repoWith({ surfaces: [...shells, { id: "native-ios", platform: "iOS", formFactor: "handheld" }], sharedCode: [{ root: "src/", sharedBy: ["rn-android", "rn-ios"] }] }), { surfaces: [] }));
    check("3 React Native plus an unlinked native project is never collapsed → confirm", asks(unlinked) && /2 routing pairs/.test(unlinked.routing.repo_single_target?.reason));
    check("3 React Native TV is not auto-routed (the alias is mobile-only) → confirm", asks(S(ext(repoWith({ surfaces: [{ id: "tv", platform: "React Native", formFactor: "tv" }] }), { surfaces: [] }))));
  }

  /* 4. Several targets, or targets that cannot be mapped → the developer confirms. */
  {
    const cases: Array<[string, S[]]> = [
      ["independent native iOS and Android", [{ id: "ios", platform: "iOS", formFactor: "handheld" }, { id: "android", platform: "Android", formFactor: "handheld" }]],
      ["mixed Android mobile and TV", [{ id: "phone", platform: "android", formFactor: "handheld" }, { id: "tv", platform: "android", formFactor: "tv" }]],
      ["iOS and tvOS targets", [{ id: "ios", platform: "iOS", formFactor: "handheld" }, { id: "tvos", platform: "tvOS", formFactor: "tv" }]],
      ["React web on desktop (desktop is never mobile)", [{ id: "web", platform: "React web", formFactor: "desktop" }]],
      ["react on desktop", [{ id: "web", platform: "react", formFactor: "desktop" }]],
      ["Android on desktop", [{ id: "a", platform: "android", formFactor: "desktop" }]],
      ["a free-form platform description", [{ id: "tv", platform: "Android (TV + phone)", formFactor: "tv" }]],
      ["a substring of an alias is not an alias", [{ id: "tv", platform: "Android TV Leanback", formFactor: "tv" }]],
      ["Tizen", [{ id: "tizen", platform: "Samsung Tizen (React)", formFactor: "tv" }]],
      ["a null platform", [{ id: "x", platform: null, formFactor: "tv" }]],
      ["a null formFactor", [{ id: "x", platform: "android", formFactor: null }]],
      ["a wearable", [{ id: "w", platform: "android", formFactor: "wearable" }]],
      ["iOS text with a TV form factor contradicts itself", [{ id: "x", platform: "iOS", formFactor: "tv" }]],
      ["Android TV text with a handheld form factor contradicts itself", [{ id: "x", platform: "Android TV", formFactor: "handheld" }]],
      ["one mappable and one unmappable surface", [{ id: "tv", platform: "android", formFactor: "tv" }, { id: "x", platform: "Fire OS", formFactor: "tv" }]],
      ["no surfaces declared", []],
    ];
    for (const [name, surfaces] of cases) {
      const r = S(ext(repoWith({ surfaces }), { surfaces: [] }));
      check(`4 ${name} → confirm`, asks(r) && typeof r.routing.repo_single_target?.reason === "string", show(r));
    }
    check("4 the reason for asking is kept unchanged (the developer flow is the existing one)", S(ext(repoWith({ surfaces: cases[0][1] }), { surfaces: [] })).routing.reason === "no related feature with human-confirmed routing — confirm the platform and device type once");
  }

  /* 5. Knowledge that is missing, stale, invalid or not this root's → confirm. */
  {
    const cases: Array<[string, Opts]> = [
      ["no manifest", { manifest: "none" }],
      ["an unparseable manifest", { manifest: "unparseable" }],
      ["the manifest of a nested project only", { manifest: "nested" }],
      ["surfaces coverage partial", { coverage: "partial" }],
      ["surfaces coverage unknown", { coverage: "unknown" }],
      // 0.9.2 (authorized expectation change): ordinary source drift no longer blocks — § 12.
      ["CLAUDE.md edited after the manifest", { editClaude: true }],
      ["an invalid capability relationship", { invalidRelationship: true }],
    ];
    for (const [name, o] of cases) {
      const r = S(ext(repoWith(o)));
      check(`5 ${name} → confirm`, asks(r), show(r));
    }
    // 0.9.2: was "source drift since the knowledge was written → confirm". Ordinary drift (a new .kt
    // file) now keeps single-target routing; general freshness still recommends a refresh.
    const driftRoot = repoWith({ drift: true });
    const drifted = S(ext(driftRoot));
    const driftK = Reader.readRepoKnowledge(driftRoot);
    check("5 ordinary source drift since the knowledge was written → still automatic (0.9.2), general freshness still stale",
      auto(drifted) && drifted.routing.device_type === "tv" && driftK.sourceDrift?.status === "REFRESH_RECOMMENDED" && driftK.refreshRecommendation !== null && driftK.routingFreshness?.status === "CLEAN", `${show(drifted)} ${driftK.sourceDrift?.status} ${driftK.routingFreshness?.status}`);
    // Failed git operations can never enable it.
    const root = repoWith();
    const realGit = execFileSync("bash", ["-c", "command -v git"], { encoding: "utf-8" }).trim();
    const bin = join(TMP, "fake-git");
    mkdirSync(bin);
    writeFileSync(join(bin, "git"), `#!/bin/bash\nfor a in "$@"; do [ "$a" = "ls-tree" ] || [ "$a" = "diff" ] && { echo "fatal: injected" >&2; exit 128; }; done\nexec "${realGit}" "$@"\n`);
    chmodSync(join(bin, "git"), 0o755);
    // Only an Inspector-owned document changed since the knowledge commit: drift is COMPLETE only
    // when `git diff` is read successfully — so the diff is really consulted here.
    write(root, "docs/project/overview.md", "# Overview\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "inspector doc");
    const cli = (path: string) => JSON.parse(execFileSync(process.execPath, ["--no-warnings", join(HERE, "analyze-bug.ts"), "start", "--external", "YET-1978", "--report", report({ surfaces: ["android-tv"] }), "--root", root], { encoding: "utf-8", env: { ...process.env, PATH: path } }));
    const control = cli(process.env.PATH ?? "");
    check("5 (control) with git working, the same repository auto-routes", control.routing?.source === "repo-single-target", JSON.stringify(control.routing).slice(0, 300));
    const j = cli(`${bin}:${process.env.PATH}`);
    check("5 a failing git diff / ls-tree cannot enable automatic routing", j.routing?.requires_confirmation === true && j.routing.source === null, JSON.stringify([j.outcome, j.reason, j.routing]).slice(0, 400));
  }
  {
    // The trusted-surfaces requirement is explicit, not left to the other gates: today an
    // untrusted category always also fails drift or carries no surfaces, but the rule itself is
    // pinned on an otherwise-eligible result so a future reader change cannot drop it silently.
    const ok = Reader.readRepoKnowledge(repoWith());
    check("5 (control) the eligible knowledge result routes", Reader.singleRoutingTarget(ok).status === "single");
    // 0.9.2: an unknown drift baseline is refused explicitly, even if routing freshness were (wrongly) clean.
    const unknownBaseline = { ...ok, sourceDrift: { ...ok.sourceDrift!, status: "BASELINE_UNKNOWN" as const, reason: "forged for the test" }, routingFreshness: { status: "CLEAN" as const, reason: "forged", routingChanges: [], routingChangeCount: 0, ordinaryChangeCount: 0 } } as typeof ok;
    const ub = Reader.singleRoutingTarget(unknownBaseline);
    check("5 an unknown source-drift baseline never routes, even with clean routing freshness", ub.status === "none" && /baseline is unknown/.test((ub as any).reason), JSON.stringify(ub));
    const rfMissing = Reader.singleRoutingTarget({ ...ok, routingFreshness: null } as typeof ok);
    check("5 routing freshness that was not computed never routes", rfMissing.status === "none" && /routing freshness cannot be established/.test((rfMissing as any).reason), JSON.stringify(rfMissing));
    for (const status of ["verifyOnUse", "deriveLive"] as const) {
      const forged = { ...ok, extendedCategories: { ...ok.extendedCategories, surfaces: { status, reason: "forged for the test" } } } as typeof ok;
      const t = Reader.singleRoutingTarget(forged);
      check(`5 surfaces that are not trusted (${status}) never route, even when every other gate passes`, t.status === "none" && (status === "deriveLive" ? /derived live/ : /not trusted/).test((t as any).reason), JSON.stringify(t));
    }
  }

  /* 6. Ticket evidence. */
  {
    const cases: Array<[string, Record<string, unknown>, boolean]> = [
      ["a declared surface id agrees", { surfaces: ["android-tv-stg"] }, true],
      ["no ticket evidence at all", { surfaces: [] }, true],
      ["the platform alone (android) agrees with android / tv", { surfaces: ["android"] }, true],
      ["an exact canonical TV name agrees", { surfaces: ["androidtv"] }, true],
      ["an environment naming the target agrees", { surfaces: ["android-tv"], environment: "google tv" }, true],
      ["another platform contradicts", { surfaces: ["ios"] }, false],
      ["another device type contradicts", { surfaces: ["mobile"] }, false],
      ["tvOS contradicts Android TV", { surfaces: ["tvos"] }, false],
      ["an unknown surface is never agreement", { surfaces: ["android-tv", "web-portal"] }, false],
      ["a near-miss name is unknown, not agreement", { surfaces: ["android-tv-box"] }, false],
      // 0.9.2 (authorized expectation change): "Production 4.2" is neutral now — § 13; an unknown word still is not.
      ["a neutral environment (Production 4.2) does not block", { surfaces: ["android-tv"], environment: "Production 4.2" }, true],
      ["an unrecognised environment is never agreement", { surfaces: ["android-tv"], environment: "Production EU" }, false],
      ["a contradicting environment", { surfaces: [], environment: "iphone" }, false],
    ];
    for (const [name, extra, ok] of cases) {
      const r = S(ext(repoWith(), extra));
      check(`6 ${name} → ${ok ? "auto-routes" : "confirm"}`, ok ? auto(r) : asks(r) && /ticket/.test(r.routing.repo_single_target?.reason ?? ""), show(r));
    }
    check("6 a ticket never manufactures a target the repository lacks", asks(S(ext(repoWith({ surfaces: [{ id: "a", platform: "Fire OS", formFactor: "tv" }] }), { surfaces: ["android-tv"] }))));
    check("6 ticketEvidence: exact names only", Bug.ticketEvidence("ANDROID-TV ", { platform: "android", device_type: "tv" }, []) === "agrees" && Bug.ticketEvidence("androidtvbox", { platform: "android", device_type: "tv" }, []) === "unrecognised");
  }

  /* 7. Precedence — the first two sources are untouched. */
  {
    const fRoot = repoWith({ breakdowns: [{ feature: "epg", platform: "android", device: "mobile" }] });
    const f = S(ext(fRoot, { surfaces: ["android-tv"], related_feature: "epg" }));
    check("7 the related feature's approved breakdown beats a single repository target", f.routing.requires_confirmation === false && f.routing.platform === "android" && f.routing.device_type === "mobile" && f.routing.source !== "repo-single-target", show(f));
    const none = S(ext(repoWith({ breakdowns: [{ feature: "epg", platform: "android", device: "tv", status: "draft" }] }), { surfaces: ["android-tv"], related_feature: "epg" }));
    check("7 a related feature without one approved breakdown still asks (source 2 unchanged; no fallback to the repository)", asks(none) && /approved Task Breakdowns/.test(none.routing.reason), show(none));
    const pRoot = repoWith();
    // The repository proves android / tv; a plan confirmed as android / mobile by the developer:
    const devRoot = repoWith({ surfaces: [{ id: "a", platform: "iOS", formFactor: "handheld" }, { id: "b", platform: "Android", formFactor: "handheld" }] });
    SC({ ...ext(devRoot, { surfaces: [] }), platform: "android", deviceType: "mobile" });
    write(devRoot, ".ono/repo-knowledge.json", readFileSync(join(pRoot, ".ono/repo-knowledge.json"), "utf-8").replace(/"gitHead": "[0-9a-f]+"/, `"gitHead": "${git(devRoot, "rev-parse", "HEAD")}"`).replace(/"knowledgeHead": "[0-9a-f]+"/, `"knowledgeHead": "${git(devRoot, "rev-parse", "HEAD")}"`));
    const kept = S(ext(devRoot, { surfaces: [] }));
    check("7 an existing developer-confirmed plan keeps its routing when the repository now proves another target", kept.routing.source === "existing-plan" && kept.routing.platform === "android" && kept.routing.device_type === "mobile" && kept.routing.recorded?.source === "developer", show(kept));
  }

  /* 8. Regeneration, approval and later cycles carry the routing. */
  {
    const root = repoWith();
    SC(ext(root));
    const regen = S(ext(root, { surfaces: ["android-tv"], actual: "Focus jumps to the first row and the list flickers" }));
    check("8 evidence drift on an auto-routed draft → regenerate, routing carried", regen.outcome === "BUG_PLAN_REGENERATE" && regen.routing.source === "existing-plan" && regen.routing.platform === "android" && regen.routing.device_type === "tv", show(regen));
    const re = SC(ext(root, { surfaces: ["android-tv"], actual: "Focus jumps to the first row and the list flickers" }));
    check("8 the regenerated draft keeps the repo-single-target record (and stays correctable)", re.ok === true && readFileSync(planPath(root), "utf-8").includes("resolved from Project Knowledge (`repo-single-target`)"));
    const filled = fill(readFileSync(planPath(root), "utf-8"), "android");
    writeFileSync(planPath(root), filled);
    const awaiting = S(ext(root, { surfaces: ["android-tv"], actual: "Focus jumps to the first row and the list flickers" }));
    check("8 a finished draft awaits approval with its routing and recorded source", awaiting.outcome === "BUG_PLAN_AWAITING_APPROVAL" && awaiting.routing.recorded?.source === "repo-single-target", `${awaiting.outcome} ${show(awaiting)}`);
    const ap = approveWorkPackage(planPath(root), { by: "dana" });
    check("8 the plan is approved once, through the existing approval", ap.ok === true && verifyApproval(readFileSync(planPath(root))).status === "approved", JSON.stringify(ap).slice(0, 200));
    const tampered = readFileSync(planPath(root), "utf-8").replace("resolved from Project Knowledge", "decided by someone");
    writeFileSync(join(TMP, "tampered.md"), tampered);
    check("8 the approval fingerprint covers the routing line (editing it makes the approval stale)", verifyApproval(Buffer.from(tampered)).status !== "approved");
    // The knowledge later proves another target: the approved plan's routing never moves.
    const m = JSON.parse(readFileSync(join(root, ".ono/repo-knowledge.json"), "utf-8"));
    m.surfaces = [surf({ id: "phone", platform: "android", formFactor: "handheld" })];
    writeFileSync(join(root, ".ono/repo-knowledge.json"), JSON.stringify(m));
    const later = S(ext(root, { surfaces: ["android-tv"], actual: "Focus jumps to the first row and the list flickers" }));
    check("8 an approved plan keeps its routing when the knowledge later proves another target", later.outcome === "BUG_PLAN_APPROVED" && later.plan?.frontmatter?.platform === "android" && later.plan.frontmatter.device_type === "tv", `${later.outcome} ${JSON.stringify(later.plan?.frontmatter)}`.slice(0, 300));
    const src = read("scripts/analyze-bug.ts");
    check("8 a new fix cycle and an unfinished cycle read the plan's routing (existing-plan) before anything else", /outcome: "BUG_CYCLE_NEW"[\s\S]{0,600}routing: routing\(root, it\.identity, fm,/.test(src) && /if \(plan\) \{\s*const recorded/.test(src));
  }

  /* 9. Human correction of an automatic routing. */
  {
    const root = repoWith();
    SC(ext(root));
    const before = readFileSync(planPath(root), "utf-8");
    check("9 a correction needs the developer's explicit pair", RR(ext(root)).code === "ROUTING_REQUIRED");
    check("9 a correction is canonical-validated", RR({ ...ext(root), platform: "androidtv", deviceType: "tv" }).code === "ROUTING_INVALID");
    check("9 the same pair is not a correction", RR({ ...ext(root), platform: "android", deviceType: "tv" }).code === "REROUTE_UNCHANGED");
    const fixed = RR({ ...ext(root), platform: "android", deviceType: "mobile" });
    check("9 an unapproved automatic draft can be corrected explicitly", fixed.ok === true && fixed.outcome === "REROUTED" && fixed.routing.source === "developer", JSON.stringify(fixed));
    const after = readFileSync(planPath(root), "utf-8");
    const fm = readFrontmatter(Buffer.from(after))?.values ?? {};
    check("9 the correction is persisted in the existing fields, recorded as the developer's decision", fm.platform === "android" && fm.device_type === "mobile" && after.includes("- **Platform / device type:** android / mobile — confirmed by the developer — correcting android / tv, which was resolved from Project Knowledge (`repo-single-target`)"));
    const fmBefore = readFrontmatter(Buffer.from(before))?.values ?? {};
    check("9 identity, evidence and capability are kept; status and approval fields unchanged (draft, empty)",
      ["bug_key", "external_ref", "origin", "bug_evidence_fingerprint", "capability", "surfaces", "status", "approved_by", "approved_fingerprint", "approved_cycle", "fix_cycle"].every((k) => fm[k] === fmBefore[k]) && fm.status === "draft",
      JSON.stringify(["bug_key", "status", "approved_by"].map((k) => [k, fm[k], fmBefore[k]])));
    const st = S(ext(root));
    check("9 after correction the routing is carried as the developer's (never re-decided)", st.routing.source === "existing-plan" && st.routing.recorded?.source === "developer" && st.routing.device_type === "mobile", show(st));
    check("9 a developer-confirmed routing can never be corrected through this path", RR({ ...ext(root), platform: "android", deviceType: "tv" }).code === "REROUTE_NOT_ALLOWED");
    // A finished, unapproved draft: corrected, its analysis cleared.
    const r2 = repoWith();
    SC(ext(r2));
    writeFileSync(planPath(r2), fill(readFileSync(planPath(r2), "utf-8"), "android"));
    const f2 = RR({ ...ext(r2), platform: "android", deviceType: "mobile" });
    const t2 = readFileSync(planPath(r2), "utf-8");
    check("9 a finished unapproved draft is corrected and its analysis cleared (written for the wrong lane)", f2.ok === true && !t2.includes("The focus wrap ignores the last row") && S(ext(r2)).outcome === "BUG_PLAN_INCOMPLETE");
    // Approved plan: never.
    const r3 = repoWith();
    SC(ext(r3));
    writeFileSync(planPath(r3), fill(readFileSync(planPath(r3), "utf-8"), "android"));
    approveWorkPackage(planPath(r3), { by: "dana" });
    const approved = readFileSync(planPath(r3), "utf-8");
    const no3 = RR({ ...ext(r3), platform: "android", deviceType: "mobile" });
    check("9 an approved plan is never modified through the correction path", no3.ok === false && no3.code === "REROUTE_NOT_ALLOWED" && readFileSync(planPath(r3), "utf-8") === approved && verifyApproval(Buffer.from(approved)).status === "approved", JSON.stringify(no3));
    // A once-approved plan edited afterwards (approval stale, awaiting re-approval): never.
    const r7 = repoWith();
    SC(ext(r7));
    writeFileSync(planPath(r7), fill(readFileSync(planPath(r7), "utf-8"), "android"));
    approveWorkPackage(planPath(r7), { by: "dana" });
    writeFileSync(planPath(r7), readFileSync(planPath(r7), "utf-8").replace("- None.", "- Is the wrap also wrong on the first row?"));
    const stale = readFileSync(planPath(r7), "utf-8");
    const st7 = S(ext(r7));
    const no7 = RR({ ...ext(r7), platform: "android", deviceType: "mobile" });
    check("9 a once-approved plan edited afterwards is never rerouted (approval stale)", st7.outcome === "BUG_PLAN_AWAITING_APPROVAL" && verifyApproval(Buffer.from(stale)).status === "approval_stale" && no7.ok === false && no7.code === "REROUTE_NOT_ALLOWED" && readFileSync(planPath(r7), "utf-8") === stale, `${st7.outcome} ${JSON.stringify(no7)}`);
    // Task state / cycle approval present: never.
    const r4 = repoWith();
    SC(ext(r4));
    write(r4, "docs/tasks/bugs/YET-1978.cycle-approval.json", "{}");
    check("9 a draft with a Bug Fix Cycle approval is not corrected", RR({ ...ext(r4), platform: "android", deviceType: "mobile" }).code === "REROUTE_NOT_ALLOWED");
    const r5 = repoWith();
    SC(ext(r5));
    write(r5, stateFilePath(r5, "bug:YET-1978").slice(r5.length + 1), "{}");
    check("9 a draft with task state is not corrected", RR({ ...ext(r5), platform: "android", deviceType: "mobile" }).ok === false);
    // Inherited feature routing: never.
    const r6 = repoWith({ breakdowns: [{ feature: "epg", platform: "android", device: "tv" }] });
    SC(ext(r6, { surfaces: [], related_feature: "epg" }));
    check("9 a routing inherited from a related feature is never corrected here", RR({ ...ext(r6, { surfaces: [], related_feature: "epg" }), platform: "android", deviceType: "mobile" }).code === "REROUTE_NOT_ALLOWED");
    // No plan.
    // 0.9.2: the refusal names the scaffold-first path (was REROUTE_NOT_ALLOWED) — still a refusal, nothing written.
    check("9 no plan → nothing to correct (REROUTE_NO_DRAFT: scaffold first)", RR({ ...ext(repoWith()), platform: "android", deviceType: "mobile" }).code === "REROUTE_NO_DRAFT");

    // The enforcement boundary (0.9.0 final review). The helper enforces canonical values and the
    // draft's state; which targets the repository supports is the command's repo-analyst
    // selection — exactly as for a developer-confirmed scaffold, whose helper boundary is the same.
    const sec = (t: string, h: string) => { const a = t.indexOf(`\n## ${h}\n`); return a < 0 ? null : t.slice(a, t.indexOf("\n## ", a + 4)); };
    const rb = repoWith();
    const reqB = ext(rb); // one evidence source, as the command passes the same ref args
    SC(reqB);
    const draftB = readFileSync(planPath(rb), "utf-8");
    const fmB = readFrontmatter(Buffer.from(draftB))?.values ?? {};
    const xb = RR({ ...reqB, platform: "ios", deviceType: "mobile" });
    const tb = readFileSync(planPath(rb), "utf-8");
    const fmX = readFrontmatter(Buffer.from(tb))?.values ?? {};
    check("9 boundary: a cross-platform correction of an Android-TV-only repository is accepted as the developer's canonical choice (repository support is the command's selection)",
      xb.ok === true && fmX.platform === "ios" && fmX.device_type === "mobile" && tb.includes("— confirmed by the developer — correcting android / tv, which was resolved from Project Knowledge (`repo-single-target`)"), JSON.stringify(xb));
    const pb = repoWith({ manifest: "none" });
    check("9 boundary parity: the existing developer-confirmed scaffold accepts the same canonical pair (no weaker helper boundary)", SC({ ...ext(pb), platform: "ios", deviceType: "mobile" }).ok === true);
    check("9 boundary: a corrected draft is still an unapproved draft — only work-approval.ts approves it, with the correction shown in the routing line",
      fmX.status === "draft" && [null, "null"].includes(fmX.approved_by) && [null, "null"].includes(fmX.approved_fingerprint) && verifyApproval(Buffer.from(tb)).status !== "approved" && S(reqB).outcome !== "BUG_PLAN_APPROVED", JSON.stringify([fmX.status, fmX.approved_by, fmX.approved_fingerprint, verifyApproval(Buffer.from(tb)).status, S(reqB).outcome]));
    check("9 identity and evidence survive the correction: Reproduction Evidence and Observed vs Expected byte-identical",
      sec(draftB, "Reproduction Evidence") !== null && sec(draftB, "Reproduction Evidence") === sec(tb, "Reproduction Evidence") && sec(draftB, "Observed vs Expected") === sec(tb, "Observed vs Expected"), JSON.stringify([sec(draftB, "Reproduction Evidence"), sec(tb, "Reproduction Evidence"), sec(draftB, "Observed vs Expected"), sec(tb, "Observed vs Expected")]).slice(0, 1500));
    check("9 identity and evidence survive the correction: every non-routing frontmatter field unchanged",
      Object.keys(fmB).filter((k) => k !== "platform" && k !== "device_type").every((k) => JSON.stringify(fmB[k]) === JSON.stringify(fmX[k])), JSON.stringify(Object.keys(fmB).filter((k) => JSON.stringify(fmB[k]) !== JSON.stringify(fmX[k]))));
    // Changed ticket evidence: the draft is regenerated through scaffold, never through a correction.
    const rc = repoWith();
    SC(ext(rc));
    const draftC = readFileSync(planPath(rc), "utf-8");
    const xc = RR({ ...ext(rc, { surfaces: ["android-tv"], actual: "Focus jumps to the first row and the list flickers" }), platform: "android", deviceType: "mobile" });
    check("9 a correction never rewrites a draft whose ticket evidence changed (it regenerates through scaffold)", xc.ok === false && xc.code === "REROUTE_NOT_ALLOWED" && readFileSync(planPath(rc), "utf-8") === draftC, JSON.stringify(xc));
    // A developer-confirmed draft whose routing line is edited to carry the automatic mark: the
    // helper reads only the line, so this is the same as editing the unapproved draft's
    // frontmatter by hand — which an unapproved draft already permits, and approval still covers.
    const rd = repoWith({ manifest: "none" });
    SC({ ...ext(rd), platform: "android", deviceType: "tv" });
    check("9 a developer-confirmed draft is not correctable through this path", RR({ ...ext(rd), platform: "android", deviceType: "mobile" }).code === "REROUTE_NOT_ALLOWED");
  }

  /* 10. Boundaries: Project Knowledge decides nothing else; the Feature Flow is unchanged. */
  {
    const r = S(ext(repoWith(), { surfaces: ["android-tv"] }));
    check("10 Project Knowledge never sets the bug's capability (it is QA-bound or located by the command)", r.knowledge?.capability === null && r.knowledge.capability_source === null);
    const empty = S(ext(repoWith({ manifest: "none" })));
    check("10 without Project Knowledge nothing is blocked — the existing confirmation", empty.ok === true && asks(empty));
    const af = read("commands/analyze-feature.md");
    check("10 Feature Flow unchanged: /analyze-feature still always confirms, with no single-target exception", /require confirmation before using it — always, even when detection confidence is high/.test(af) && !/repo-single-target/.test(af));
    check("10 Feature Flow unchanged: no feature helper uses the routing exception", ["scripts/feature-flow.ts", "scripts/feature-review.ts", "scripts/feature-docs.ts"].every((f) => !/singleRoutingTarget|repo-single-target/.test(read(f))));
    check("10 the exception's pairs are existing canonical values only", Reader.SINGLE_TARGET_PAIRS.every((p) => { const [a, b] = p.split("/"); return ["react-native", "react", "ios", "android"].includes(a) && ["mobile", "tv"].includes(b); }));
    check("10 desktop, wearable and other form factors map to no device type", !("desktop" in Reader.FORM_FACTOR_DEVICE) && !("wearable" in Reader.FORM_FACTOR_DEVICE) && !("other" in Reader.FORM_FACTOR_DEVICE));
    // The automatic source is the helper's verdict, never an argument: when the knowledge is not
    // eligible (here, drifted), the same pair passed by the caller — even with a forged source —
    // is recorded as the developer's confirmation, never as `repo-single-target`.
    const rs = repoWith({ coverage: "partial" }); // ineligible knowledge (0.9.2: ordinary drift no longer is)
    const forged = SC({ ...ext(rs), platform: "android", deviceType: "tv", source: "repo-single-target", how: Bug.SINGLE_TARGET_MARK });
    const ts = readFileSync(planPath(rs), "utf-8");
    check("10 the automatic routing source cannot be supplied by the caller", forged.ok === true && ts.includes("- **Platform / device type:** android / tv — confirmed by the developer\n") && !ts.includes(Bug.SINGLE_TARGET_MARK), JSON.stringify(forged.routing));
    check("10 the CLI has no argument that names a routing source", !/flags\.(source|how)\b|flags\["(source|how)"\]/.test(read("scripts/analyze-bug.ts")));
  }

  /* 12. Routing freshness (0.9.2, Phase A): ordinary drift keeps routing, routing-relevant drift never does. */
  {
    const commit = (root: string, msg = "change") => {
      git(root, "add", "-A", "--", ".", ":!.ono");
      git(root, "commit", "-qm", msg);
    };
    /** Re-point the manifest's knowledge at the current HEAD — as a refresh would — so later changes are measured from here. */
    const rebaseKnowledge = (root: string) => {
      const p = join(root, ".ono/repo-knowledge.json");
      const m = JSON.parse(readFileSync(p, "utf-8"));
      m.fingerprint.knowledgeHead = git(root, "rev-parse", "HEAD");
      m.fingerprint.gitHead = m.fingerprint.knowledgeHead;
      writeFileSync(p, JSON.stringify(m, null, 2));
    };
    const withEvidence = (root: string, evidence: string[]) => {
      const p = join(root, ".ono/repo-knowledge.json");
      const m = JSON.parse(readFileSync(p, "utf-8"));
      m.surfaces[0].evidence = evidence;
      writeFileSync(p, JSON.stringify(m, null, 2));
    };
    const K = (root: string) => Reader.readRepoKnowledge(root);
    const RF = (root: string) => K(root).routingFreshness;

    // Guy's case: Android TV, production and staging surfaces, 85+ ordinary source changes since the inspection.
    const g = repoWith();
    for (let i = 0; i < 40; i++) write(g, `app/src/main/java/tv/yes/feature${i}/Screen${i}.kt`, `class Screen${i}\n`);
    for (let i = 0; i < 15; i++) write(g, `app/src/main/res/layout/screen_${i}.xml`, `<FrameLayout/>\n`);
    for (let i = 0; i < 10; i++) write(g, `app/src/main/res/drawable/icon_${i}.png`, `png${i}`);
    for (let i = 0; i < 10; i++) write(g, `app/src/test/java/tv/yes/Screen${i}Test.kt`, `class Screen${i}Test\n`);
    for (let i = 0; i < 5; i++) write(g, `app/src/main/java/tv/yes/legacy/Util${i}.java`, `class Util${i} {}\n`);
    for (let i = 0; i < 5; i++) write(g, `docs/notes/note-${i}.md`, `# note ${i}\n`);
    commit(g, "85 ordinary changes");
    write(g, "app/src/Main.kt", "fun main() = println(1)\n"); // unstaged, tracked
    write(g, "app/src/main/java/tv/yes/Staged.kt", "class Staged\n");
    git(g, "add", "app/src/main/java/tv/yes/Staged.kt"); // staged
    write(g, "app/src/main/java/tv/yes/Untracked.kt", "class Untracked\n"); // untracked
    write(g, "docs/bugs/YET-1/bug-report.json", "{}\n"); // the plugin's own workflow output
    write(g, ".claude/settings.local.json", "{}\n"); // Claude Code's local settings
    const gk = K(g);
    check("12 Guy: 85+ ordinary changes — general freshness still recommends a refresh", gk.sourceDrift?.status === "REFRESH_RECOMMENDED" && (gk.sourceDrift?.changedSourceCount ?? 0) >= 85 && gk.refreshRecommendation !== null, `${gk.sourceDrift?.status} ${gk.sourceDrift?.changedSourceCount}`);
    check("12 Guy: routing freshness is CLEAN — committed, staged, unstaged and untracked ordinary changes all counted", gk.routingFreshness?.status === "CLEAN" && gk.routingFreshness?.ordinaryChangeCount === 90, JSON.stringify(gk.routingFreshness)); // 85 committed + unstaged + staged + untracked + docs/bugs JSON + .claude/settings.local.json — exact: Git is isolated, no host ignore applies
    const gs = S(ext(g));
    check("12 Guy: automatic routing selects Android / TV from the two surfaces", auto(gs) && gs.routing.platform === "android" && gs.routing.device_type === "tv" && JSON.stringify(gs.routing.evidence?.surfaces) === JSON.stringify(["android-tv", "android-tv-stg"]), show(gs));
    const gsc = SC(ext(g));
    const gPlan = readFileSync(planPath(g), "utf-8");
    check("12 Guy: the plan is still a draft and needs the normal human approval", gsc.ok === true && /^status: draft$/m.test(gPlan) && verifyApproval(Buffer.from(gPlan)).status !== "approved" && S(ext(g)).outcome !== "BUG_PLAN_APPROVED", JSON.stringify(gsc).slice(0, 200));

    // Surfaces verify-on-use because ordinary surface evidence changed: still automatic (non-routing drift only).
    const v = repoWith();
    withEvidence(v, ["app/src/Main.kt"]);
    write(v, "app/src/Main.kt", "fun main() = println(2)\n");
    commit(v);
    const vk = K(v);
    check("12 verifyOnUse surfaces caused only by non-routing drift (an edited Kotlin evidence file) still route", vk.extendedCategories.surfaces.status === "verifyOnUse" && auto(S(ext(v))), `${vk.extendedCategories.surfaces.status} ${show(S(ext(v)))}`);

    // Routing-relevant committed changes: a new platform, target, flavor, scheme, build configuration or dependency.
    const committed: Array<[string, Record<string, string>]> = [
      ["a module build script (app/build.gradle)", { "app/build.gradle": "android { productFlavors { mobile {} } }\n" }],
      ["a Kotlin DSL build script", { "tv/build.gradle.kts": "plugins { id(\"com.android.application\") }\n" }],
      ["settings.gradle (a new module)", { "settings.gradle": "include ':app', ':mobile'\n" }],
      ["a new flavor's AndroidManifest.xml", { "app/src/mobile/AndroidManifest.xml": "<manifest/>\n" }],
      ["a version catalog", { "gradle/libs.versions.toml": "[versions]\nagp = \"8.5.0\"\n" }],
      ["Gradle properties", { "gradle.properties": "flavor=mobile\n" }],
      ["a properties file a build may read", { "app/flavors.properties": "tv=true\n" }],
      ["build logic in buildSrc (Kotlin)", { "buildSrc/src/main/kotlin/Flavors.kt": "object Flavors\n" }],
      ["an Xcode project", { "TV/TV.xcodeproj/project.pbxproj": "// !$*UTF8*$!\n" }],
      ["an Xcode scheme", { "TV/TV.xcodeproj/xcshareddata/xcschemes/Mobile.xcscheme": "<Scheme/>\n" }],
      ["an Xcode build configuration", { "Config/Mobile.xcconfig": "SDKROOT = iphoneos\n" }],
      ["an Info.plist", { "app/src/main/Info.plist": "<plist/>\n" }],
      ["React Native / JS package manifest", { "package.json": "{\"dependencies\":{\"react-native\":\"0.76.0\"}}\n" }],
      ["Expo app config", { "app.config.ts": "export default {}\n" }],
      ["a new top-level platform folder (only .swift inside)", { "ios/App/App.swift": "struct App {}\n" }],
      ["an unrecognised file type (a YAML target list)", { "config/targets.yaml": "targets: [tv, mobile]\n" }],
    ];
    for (const [name, files] of committed) {
      const r = repoWith();
      for (const [p, body] of Object.entries(files)) write(r, p, body);
      commit(r);
      const rf = RF(r);
      check(`12 committed — ${name} → confirm`, asks(S(ext(r))) && rf?.status === "ROUTING_CHANGED" && Object.keys(files).every((p) => rf.routingChanges.some((c) => c.startsWith(`${p} — `) || c.startsWith(`${p.split("/")[0]} — `) || c.startsWith(p))), JSON.stringify(rf));
    }

    // Staged, unstaged and untracked routing-relevant changes (nothing committed).
    const st = repoWith();
    write(st, "app/src/mobile/AndroidManifest.xml", "<manifest/>\n");
    git(st, "add", "app/src/mobile/AndroidManifest.xml");
    check("12 staged — a new flavor manifest, not committed → confirm", asks(S(ext(st))) && RF(st)?.status === "ROUTING_CHANGED", JSON.stringify(RF(st)));
    const un = repoWith();
    write(un, "gradle.properties", "flavor=tv\n");
    commit(un);
    rebaseKnowledge(un);
    check("12 (control) after re-pointing the knowledge, the same repository routes", auto(S(ext(un))), show(S(ext(un))));
    write(un, "gradle.properties", "flavor=mobile\n");
    check("12 unstaged — an edited gradle.properties → confirm", asks(S(ext(un))) && RF(un)?.routingChanges.some((c) => c.startsWith("gradle.properties")), JSON.stringify(RF(un)));
    const ut = repoWith();
    write(ut, "app/src/tv2/AndroidManifest.xml", "<manifest/>\n");
    check("12 untracked — a new AndroidManifest.xml → confirm", asks(S(ext(ut))) && RF(ut)?.status === "ROUTING_CHANGED", JSON.stringify(RF(ut)));

    // Renames (both sides) and deletions, committed and not.
    const rn = repoWith();
    write(rn, "app/src/tv/AndroidManifest.xml", "<manifest/>\n");
    commit(rn);
    rebaseKnowledge(rn);
    git(rn, "mv", "app/src/tv/AndroidManifest.xml", "app/src/tv/Notes.md");
    check("12 staged rename — a manifest renamed to an ordinary name: the old side is routing-relevant", asks(S(ext(rn))) && RF(rn)?.routingChanges.some((c) => c.startsWith("app/src/tv/AndroidManifest.xml")), JSON.stringify(RF(rn)));
    commit(rn, "rename");
    check("12 committed rename — the same, after commit", asks(S(ext(rn))) && RF(rn)?.routingChanges.some((c) => c.startsWith("app/src/tv/AndroidManifest.xml")), JSON.stringify(RF(rn)));
    const rn2 = repoWith();
    git(rn2, "mv", "app/src/Main.kt", "app/build.gradle");
    check("12 staged rename — an ordinary file renamed to a build script: the new side is routing-relevant", asks(S(ext(rn2))) && RF(rn2)?.routingChanges.some((c) => c.startsWith("app/build.gradle")), JSON.stringify(RF(rn2)));
    const del = repoWith();
    write(del, "app/src/tv/AndroidManifest.xml", "<manifest/>\n");
    commit(del);
    rebaseKnowledge(del);
    rmSync(join(del, "app/src/tv/AndroidManifest.xml"));
    check("12 unstaged deletion of a manifest → confirm", asks(S(ext(del))) && RF(del)?.status === "ROUTING_CHANGED", JSON.stringify(RF(del)));
    git(del, "add", "-A", "--", ".", ":!.ono");
    git(del, "commit", "-qm", "delete");
    check("12 committed deletion of a manifest → confirm", asks(S(ext(del))) && RF(del)?.status === "ROUTING_CHANGED", JSON.stringify(RF(del)));

    // Indirect build configuration: included builds.
    const ib = repoWith();
    write(ib, "settings.gradle.kts", "pluginManagement { includeBuild(\"platform-logic\") }\ninclude(\":app\")\n");
    write(ib, "platform-logic/src/main/kotlin/Convention.kt", "class Convention\n");
    commit(ib);
    rebaseKnowledge(ib);
    check("12 (control) a literal included build, unchanged → still automatic", auto(S(ext(ib))), JSON.stringify(RF(ib)));
    write(ib, "platform-logic/src/main/kotlin/Convention.kt", "class Convention { val tv = false }\n");
    check("12 a Kotlin file inside an included build is build logic → confirm", asks(S(ext(ib))) && RF(ib)?.routingChanges.some((c) => /inside an included build/.test(c)), JSON.stringify(RF(ib)));
    const dyn = repoWith();
    write(dyn, "settings.gradle.kts", "val logic = System.getenv(\"LOGIC\") ?: \"logic\"\nincludeBuild(logic)\n");
    commit(dyn);
    rebaseKnowledge(dyn);
    check("12 an included build that is not a plain path (dynamic / external input) → confirm, never assumed", asks(S(ext(dyn))) && RF(dyn)?.status === "UNKNOWN", JSON.stringify(RF(dyn)));
    const out = repoWith();
    write(out, "settings.gradle", "includeBuild('../shared-build-logic')\n");
    commit(out);
    rebaseKnowledge(out);
    check("12 an included build outside the repository (changes invisible here) → confirm", asks(S(ext(out))) && RF(out)?.status === "UNKNOWN", JSON.stringify(RF(out)));

    // Explicit build-input references (0.9.2 final review): resolved → routing-relevant inputs;
    // dynamic, external, URL or unreadable → UNKNOWN (the developer confirms — never left to approval).
    const prep = (files: Record<string, string>) => {
      const r = repoWith();
      for (const [p, body] of Object.entries(files)) write(r, p, body);
      commit(r);
      rebaseKnowledge(r);
      return r;
    };
    const TV_BUILD = [
      "apply plugin: 'com.android.application'",
      'apply from: "$rootDir/gradle/flavors.gradle"',
      "def keystoreProperties = new Properties()",
      "def keystorePropertiesFile = rootProject.file('keystore.properties')",
      "def targets = new XmlSlurper().parse(file('src/main/res/xml/targets.xml'))",
      "android {",
      "  signingConfigs { release { storeFile file(System.getenv('KEYSTORE_PATH') ?: 'debug.keystore') ; storePassword System.getenv('KS_PASS') } }",
      "  sourceSets { main { java.srcDirs += file('src/tv/java') } }",
      "  react { root = file('../') }",
      "  buildTypes { release { proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro' } }",
      "}",
      "def generated = file(\"$buildDir/generated/targets.json\")",
      "",
    ].join("\n");
    const tv = prep({ "settings.gradle": "include ':app'\n", "app/build.gradle": TV_BUILD, "gradle/flavors.gradle": "ext.tv = true\n", "app/src/main/res/xml/targets.xml": "<targets><tv/></targets>\n", "app/src/tv/java/Tv.kt": "class Tv\n" });
    for (let i = 0; i < 85; i++) write(tv, `app/src/main/java/tv/yes/f${i}/S${i}.kt`, `class S${i}\n`);
    commit(tv, "85 ordinary changes");
    const tvk = K(tv);
    check("12 a realistic Android TV build (env-driven signing, an applied script, a read resource) + 85 ordinary changes → still automatic Android / TV",
      tvk.routingFreshness?.status === "CLEAN" && tvk.sourceDrift?.status === "REFRESH_RECOMMENDED" && auto(S(ext(tv))) && S(ext(tv)).routing.device_type === "tv", JSON.stringify(tvk.routingFreshness));
    write(tv, "app/src/main/res/xml/targets.xml", "<targets><tv/><mobile/></targets>\n");
    check("12 a file the build script reads is routing-relevant even with an ordinary type and location (res/xml)", asks(S(ext(tv))) && RF(tv)?.routingChanges.some((c) => c === "app/src/main/res/xml/targets.xml — read or applied by a build script"), JSON.stringify(RF(tv)));
    const unresolvable: Array<[string, Record<string, string>]> = [
      ["apply from a computed (environment) path", { "app/build.gradle": "apply from: \"${System.getenv('CFG')}/flavors.gradle\"\n" }],
      ["apply from a URL", { "app/build.gradle": "apply from: 'https://example.invalid/flavors.gradle'\n" }],
      ["apply from outside the repository", { "app/build.gradle": "apply from: '../../shared/flavors.gradle'\n" }],
      ["apply(from = …) in Kotlin DSL with a variable", { "app/build.gradle.kts": "val cfg = providers.gradleProperty(\"cfg\").get()\napply(from = cfg)\n" }],
      ["a file read from outside the repository", { "app/build.gradle": "def targets = file('../../platform-config/targets.json')\n" }],
      ["a file read from a computed path", { "app/build.gradle": "def targets = file(project.property('targetsFile'))\n" }],
      ["an absolute file path", { "app/build.gradle": "def targets = file('/opt/build/targets.json')\n" }],
      ["an .xcconfig including a file outside the repository", { "TV/Config/Base.xcconfig": "#include \"../../../Shared/Platform.xcconfig\"\n" }],
      ["an .xcconfig including a computed path", { "TV/Config/Base.xcconfig": "#include \"$(SRCROOT)/Platform.xcconfig\"\n" }],
    ];
    for (const [name, files] of unresolvable) {
      const r = prep(files);
      const rf = RF(r);
      check(`12 case B — ${name} → UNKNOWN, confirm (nothing changed since; the reference alone decides)`, asks(S(ext(r))) && rf?.status === "UNKNOWN" && /build input this assessment cannot resolve/.test(rf.reason), JSON.stringify(rf));
    }
    const fine = prep({ "app/build.gradle.kts": "apply(from = \"gradle/tv.gradle.kts\")\nval cfg = File(rootDir, \"config/targets.yml\")\nval out = layout.buildDirectory.file(\"gen/x.json\")\n", "gradle/tv.gradle.kts": "extra[\"tv\"] = true\n", "config/targets.yml": "tv: true\n", "TV/Config/Base.xcconfig": "#include \"Shared.xcconfig\"\n", "TV/Config/Shared.xcconfig": "SDKROOT = appletvos\n" });
    check("12 resolvable references (Kotlin apply, File(rootDir, …), build outputs, an in-repo #include) keep routing automatic", auto(S(ext(fine))) && RF(fine)?.status === "CLEAN", JSON.stringify(RF(fine)));
    const unreadable = prep({ "app/build.gradle": "apply plugin: 'com.android.application'\n" });
    chmodSync(join(unreadable, "app/build.gradle"), 0o000);
    let unreadableRf: any;
    try {
      unreadableRf = RF(unreadable);
    } finally {
      chmodSync(join(unreadable, "app/build.gradle"), 0o644);
    }
    const asRoot = typeof process.getuid === "function" && process.getuid() === 0;
    check("12 a build script that cannot be read → UNKNOWN, confirm", asRoot || (unreadableRf?.status === "UNKNOWN" && /cannot be read/.test(unreadableRf.reason)), JSON.stringify(unreadableRf));
    check("12 build references: the scan's forms and exemptions",
      JSON.stringify(Reader.buildReferencesOf("app/build.gradle", "apply from: file('../gradle/x.gradle')\ndef p = rootProject.file('local.properties')\nimplementation files('libs/a.jar', 'libs/b.jar')", "")) === JSON.stringify({ paths: ["gradle/x.gradle", "local.properties", "app/libs/a.jar", "app/libs/b.jar"] }) &&
      JSON.stringify(Reader.buildReferencesOf("android/app/build.gradle", 'apply from: "$rootDir/flavors.gradle"', "android")) === JSON.stringify({ paths: ["android/flavors.gradle"] }) &&
      "unresolved" in Reader.buildReferencesOf("app/build.gradle", "def f = File(System.getenv('HOME'), 'x')", "") &&
      JSON.stringify(Reader.buildReferencesOf("app/build.gradle", "storeFile file(System.getenv('KS'))\n// apply from: '../../x.gradle'\n/* file('/etc/x') */", "")) === JSON.stringify({ paths: [] }));

    // Links, submodules, evidence and failures.
    const ln = repoWith();
    symlinkSync("../app/src/Main.kt", join(ln, "app/linked.kt"));
    check("12 an untracked symbolic link → confirm (it can point at anything)", asks(S(ext(ln))) && RF(ln)?.routingChanges.some((c) => /symbolic link/.test(c)), JSON.stringify(RF(ln)));
    const tc = repoWith();
    rmSync(join(tc, "app/src/Main.kt"));
    symlinkSync("../../README.md", join(tc, "app/src/Main.kt"));
    check("12 a file-type change (a tracked source file replaced by a symbolic link) → confirm", asks(S(ext(tc))) && RF(tc)?.routingChanges.some((c) => c.startsWith("app/src/Main.kt — a symbolic link")), JSON.stringify(RF(tc)));
    const sm = repoWith();
    git(sm, "update-index", "--add", "--cacheinfo", `160000,${git(sm, "rev-parse", "HEAD")},vendor/lib`);
    check("12 a staged submodule → confirm (its content is not assessed)", asks(S(ext(sm))) && RF(sm)?.routingChanges.some((c) => /submodule/.test(c)), JSON.stringify(RF(sm)));
    const ev = repoWith();
    withEvidence(ev, ["app/src/Main.kt"]);
    rmSync(join(ev, "app/src/Main.kt"));
    check("12 a surface's evidence file no longer exists → confirm", asks(S(ext(ev))) && RF(ev)?.routingChanges.some((c) => /surface evidence no longer exists/.test(c)), JSON.stringify(RF(ev)));
    const gone = repoWith();
    const gm = JSON.parse(readFileSync(join(gone, ".ono/repo-knowledge.json"), "utf-8"));
    gm.fingerprint.knowledgeHead = "0".repeat(40);
    writeFileSync(join(gone, ".ono/repo-knowledge.json"), JSON.stringify(gm));
    check("12 an unreachable knowledgeHead (shallow or rewritten) → confirm", asks(S(ext(gone))) && RF(gone)?.status === "UNKNOWN", JSON.stringify(RF(gone)));
    const fs = repoWith();
    const bin = join(TMP, "status-fails-bin");
    mkdirSync(bin, { recursive: true });
    const realGit = execFileSync("bash", ["-c", "command -v git"], { encoding: "utf-8" }).trim();
    writeFileSync(join(bin, "git"), `#!/bin/sh\nfor a in "$@"; do [ "$a" = status ] && exit 128; done\nexec "${realGit}" "$@"\n`);
    chmodSync(join(bin, "git"), 0o755);
    const savedPath = process.env.PATH;
    process.env.PATH = `${bin}:${savedPath}`;
    let failedStatus: any;
    try {
      failedStatus = K(fs).routingFreshness;
    } finally {
      process.env.PATH = savedPath;
    }
    check("12 a failed git status → UNKNOWN, never CLEAN", failedStatus?.status === "UNKNOWN" && /git status failed/.test(failedStatus?.reason ?? ""), JSON.stringify(failedStatus));
    check("12 (control) the same repository with git working is CLEAN", RF(fs)?.status === "CLEAN", JSON.stringify(RF(fs)));
    check("12 a nested project still never routes (unchanged)", asks(S(ext(repoWith({ manifest: "nested" })))));

    // The classifier: ordinary only when positively recognised.
    const table: Array<[string, boolean]> = [
      ["app/src/main/java/A.kt", false], ["app/src/main/res/values/strings.xml", false], ["Sources/App/View.swift", false],
      ["src/screens/Home.tsx", false], ["docs/bugs/X/bug-report.json", false], ["App/Assets.xcassets/Icon.imageset/Contents.json", false],
      [".claude/settings.local.json", false], ["README.md", false],
      ["app/build.gradle", true], ["build.gradle.kts", true], ["app/src/main/AndroidManifest.xml", true], ["gradle/wrapper/gradle-wrapper.properties", true],
      ["buildSrc/src/main/kotlin/X.kt", true], ["App.xcodeproj/project.pbxproj", true], ["App/Info.plist", true], ["metro.config.js", true],
      ["package.json", true], ["config/flavors.json", true], ["config/targets.yaml", true], ["scripts/release.sh", true], ["Makefile", true], [".env", true],
    ];
    const misread = table.filter(([p, rel]) => (Reader.routingRelevance(p) !== null) !== rel).map(([p]) => p);
    check(`12 classifier: ${table.length} paths — config by name or location and every unrecognised type are routing-relevant`, misread.length === 0, misread.join(", "));
    check("12 included builds: literal paths resolved against the settings file; dynamic or outside → unresolvable",
      JSON.stringify(Reader.includedBuildsOf("settings.gradle.kts", 'includeBuild("build-logic")\n// includeBuild(x)\n')) === JSON.stringify(["build-logic/"]) &&
      JSON.stringify(Reader.includedBuildsOf("android/settings.gradle", "includeBuild '../tools/logic'")) === JSON.stringify(["tools/logic/"]) &&
      Reader.includedBuildsOf("settings.gradle", "includeBuild(file(\"x\"))") === null && Reader.includedBuildsOf("settings.gradle", 'includeBuild("$root/x")') === null &&
      Reader.includedBuildsOf("settings.gradle", "includeBuild('../../x')") === null);
  }

  /* 13. The Environment field (0.9.2): neutral words never block; evidence keeps its meaning. */
  {
    const E = (v: string, pair: string, ids: string[]) => { const [platform, device_type] = pair.split("/"); return Bug.environmentEvidence(v, { platform, device_type }, ids); };
    const TVIDS = ["android-tv", "android-tv-stg"];
    // [repository pair, its surface ids, environment, expected]
    const M: Array<[string, string[], string, string]> = [
      // Android TV (Guy)
      ["android/tv", TVIDS, "Production", "neutral"], ["android/tv", TVIDS, "Staging", "neutral"], ["android/tv", TVIDS, "Production 4.2", "neutral"],
      ["android/tv", TVIDS, "prod v4.2.1-rc2 (12345)", "neutral"], ["android/tv", TVIDS, "Release #881", "neutral"], ["android/tv", TVIDS, "", "neutral"],
      ["android/tv", TVIDS, "Android TV Production", "agrees"], ["android/tv", TVIDS, "android-tv-stg", "agrees"], ["android/tv", TVIDS, "Staging: android-tv-stg", "agrees"],
      ["android/tv", TVIDS, "Android", "agrees"], ["android/tv", TVIDS, "Google TV 5.0", "agrees"],
      ["android/tv", TVIDS, "iOS Staging", "contradicts"], ["android/tv", TVIDS, "tvOS", "contradicts"], ["android/tv", TVIDS, "Mobile production", "contradicts"],
      ["android/tv", TVIDS, "Android TV, iOS", "contradicts"], ["android/tv", TVIDS, "Production android-tv iphone", "contradicts"],
      ["android/tv", TVIDS, "Production EU", "unrecognised"], ["android/tv", TVIDS, "fire-tv-prod", "unrecognised"], ["android/tv", TVIDS, "4.2-androidtv", "unrecognised"],
      ["android/tv", TVIDS, "v5-tvos", "unrecognised"], ["android/tv", TVIDS, "androidtvbox", "unrecognised"], ["android/tv", TVIDS, "Android TV Production EU", "unrecognised"],
      // Android (mobile)
      ["android/mobile", ["android"], "Production", "neutral"], ["android/mobile", ["android"], "Android Staging", "agrees"], ["android/mobile", ["android"], "Phone", "agrees"],
      ["android/mobile", ["android"], "Android TV", "contradicts"], ["android/mobile", ["android"], "TV staging", "contradicts"],
      // iOS (mobile)
      ["ios/mobile", ["ios"], "Production 3.1", "neutral"], ["ios/mobile", ["ios"], "iPhone Staging", "agrees"], ["ios/mobile", ["ios"], "iPad", "agrees"],
      ["ios/mobile", ["ios"], "tvOS", "contradicts"], ["ios/mobile", ["ios"], "Android", "contradicts"], ["ios/mobile", ["ios"], "Apple TV", "contradicts"],
      // tvOS
      ["ios/tv", ["tvos", "tvos-stg"], "Apple TV Staging", "agrees"], ["ios/tv", ["tvos", "tvos-stg"], "Production", "neutral"], ["ios/tv", ["tvos", "tvos-stg"], "tvos-stg", "agrees"],
      ["ios/tv", ["tvos", "tvos-stg"], "iOS", "contradicts"], ["ios/tv", ["tvos", "tvos-stg"], "Android TV", "contradicts"],
      // React Native (the OS is a surface of the one platform)
      ["react-native/mobile", ["rn-ios", "rn-android"], "Production", "neutral"], ["react-native/mobile", ["rn-ios", "rn-android"], "iOS Production", "agrees"],
      ["react-native/mobile", ["rn-ios", "rn-android"], "Android staging", "agrees"], ["react-native/mobile", ["rn-ios", "rn-android"], "React Native", "agrees"],
      ["react-native/mobile", ["rn-ios", "rn-android"], "Android TV", "contradicts"], ["react-native/mobile", ["rn-ios", "rn-android"], "tvOS beta", "contradicts"],
    ];
    const wrong = M.filter(([pair, ids, v, want]) => E(v, pair, ids) !== want).map(([pair, , v, want]) => `${pair} ${JSON.stringify(v)} → ${E(v, pair, M.find((m) => m[0] === pair)![1])} (want ${want})`);
    check(`13 environment decision matrix: all ${M.length} cases (Android, Android TV, iOS, tvOS, React Native)`, wrong.length === 0, wrong.join(" | "));
    check("13 only the Environment field is read word by word — an affected surface still needs an exact id or name", asks(S(ext(repoWith(), { surfaces: ["Production"] }))));
    check("13 neutral environment end to end: Guy's TV repository with \"Production\" routes automatically", auto(S(ext(repoWith(), { surfaces: ["android-tv"], environment: "Production" }))));
    check("13 contradiction end to end: \"iOS Staging\" keeps the confirmation", asks(S(ext(repoWith(), { surfaces: [], environment: "iOS Staging" }))));
    const multi = repoWith({ surfaces: [{ id: "android-tv", platform: "android", formFactor: "tv" }, { id: "phone", platform: "android", formFactor: "handheld" }] });
    check("13 a multi-target repository still confirms, whatever the environment says", asks(S(ext(multi, { surfaces: [], environment: "Production" }))) && asks(S(ext(multi, { surfaces: [], environment: "Android TV" }))));
    check("13 the Feature Flow does not read the environment rule", ["scripts/feature-flow.ts", "scripts/feature-review.ts", "scripts/feature-docs.ts"].every((f) => !/environmentEvidence|NEUTRAL_ENVIRONMENT_WORDS/.test(read(f))));
  }

  /* 14. Step 5 correction, scaffold first (0.9.2) — the complete sequence, not isolated calls. */
  {
    const root = repoWith();
    const req = ext(root); // one evidence source for the whole session, as the command passes it
    const corrected = { ...req, platform: "android", deviceType: "mobile" };
    const s1 = S(req);
    check("14.1 the automatic proposal: Android / TV, no plan yet", auto(s1) && s1.outcome === "BUG_PLAN_NEW", show(s1));
    const early = RR(corrected);
    check("14.2 reroute before the scaffold: a clear REROUTE_NO_DRAFT, nothing written", early.ok === false && early.code === "REROUTE_NO_DRAFT" && /run `scaffold` first/.test(early.reason) && !existsSync(planPath(root)), JSON.stringify(early));
    const conflict = SC(corrected);
    check("14.3 scaffolding with the corrected value is still ROUTING_CONFLICT (no override), and names the scaffold-first path", conflict.ok === false && conflict.code === "ROUTING_CONFLICT" && /then correct it explicitly with `reroute`/.test(conflict.reason) && !existsSync(planPath(root)), JSON.stringify(conflict));
    const sc = SC(req);
    const s2 = S(req);
    check("14.4 scaffold records the automatic routing (an incomplete draft, source repo-single-target)", sc.ok === true && s2.outcome === "BUG_PLAN_INCOMPLETE" && s2.routing.recorded?.source === "repo-single-target", show(s2));
    const rr = RR(corrected);
    const text = readFileSync(planPath(root), "utf-8");
    const fm = readFrontmatter(Buffer.from(text))?.values ?? {};
    check("14.5 reroute persists the developer's routing in the existing frontmatter and routing line", rr.ok === true && rr.outcome === "REROUTED" && fm.platform === "android" && fm.device_type === "mobile" && text.includes("- **Platform / device type:** android / mobile — confirmed by the developer — correcting android / tv"), JSON.stringify(rr));
    check("14.6 reroute says the six repo_knowledge_* fields and the surface scope must be refilled before the analysis continues", /repo_knowledge_\*/.test(rr.next) && /scope the corrected context to one surface/.test(rr.next) && rr.cleared.includes("repo_knowledge_* frontmatter"), rr.next);
    check("14.7 … and the scaffold left them at the template's empty state (nothing stale from the automatic routing survives)", BUG_WORK_PLAN_FIELDS.filter((f) => f.startsWith("repo_knowledge_")).every((f) => !(fm[f] ?? "").toString().includes("android / tv")));
    writeFileSync(planPath(root), fill(text, "android"));
    const s3 = S(req);
    check("14.8 after analysis the draft awaits approval with the corrected, developer-confirmed routing", s3.outcome === "BUG_PLAN_AWAITING_APPROVAL" && s3.routing.source === "existing-plan" && s3.routing.recorded?.source === "developer" && s3.routing.device_type === "mobile", show(s3));
    const ap = approveWorkPackage(planPath(root), { by: "dana" });
    const approved = readFileSync(planPath(root), "utf-8");
    check("14.9 the plan is approved once, through the existing approval", ap.ok === true && verifyApproval(Buffer.from(approved)).status === "approved", JSON.stringify(ap).slice(0, 200));
    check("14.10 the approval binds the corrected routing: changing the platform, the device type or the routing line makes it stale",
      verifyApproval(Buffer.from(approved.replace(/^platform: android$/m, "platform: ios"))).status !== "approved" &&
      verifyApproval(Buffer.from(approved.replace(/^device_type: mobile$/m, "device_type: tv"))).status !== "approved" &&
      verifyApproval(Buffer.from(approved.replace("android / mobile — confirmed by the developer", "android / tv — confirmed by the developer"))).status !== "approved");
    const late = RR({ ...req, platform: "android", deviceType: "tv" });
    check("14.11 after approval the routing can never be changed through reroute", late.ok === false && late.code === "REROUTE_NOT_ALLOWED" && readFileSync(planPath(root), "utf-8") === approved, JSON.stringify(late));
    const s4 = S(req);
    check("14.12 a later start carries the corrected routing as approved — never re-decided from Project Knowledge", s4.outcome === "BUG_PLAN_APPROVED" && s4.plan?.frontmatter?.platform === "android" && s4.plan.frontmatter.device_type === "mobile" && (s4.routing === undefined || s4.routing.platform === "android"), JSON.stringify([s4.outcome, s4.plan?.frontmatter?.platform, s4.plan?.frontmatter?.device_type]));
    const gate = bugGate({ root, work: "bug:YET-1978", report: req.report });
    check("14.13 implementation (the bug gate) consumes the corrected routing", gate.ok === true && gate.outcome === "BUG_READY" && gate.platform === "android" && gate.device_type === "mobile", JSON.stringify([gate.outcome, gate.reason, gate.platform, gate.device_type]).slice(0, 300));
    check("14.14 task resume reads the same plan: its state path is the bug's, and its context carries the corrected platform lane", typeof gate.state_path === "string" && /YET-1978\.task-state\.json$/.test(gate.state_path) && gate.delegate?.subagent_type !== undefined, JSON.stringify([gate.state_path, gate.delegate]));
    const cmd = read("commands/analyze-bug.md");
    check("14.15 command: scaffold first — never reroute before the scaffold, never the corrected value to scaffold", /Correcting an automatic routing — scaffold first/.test(cmd) && /without\*\* `--platform` \/ `--device-type`/.test(cmd) && /REROUTE_NO_DRAFT/.test(cmd) && /ROUTING_CONFLICT/.test(cmd));
    const planContract = read("docs/bug-work-plan-contract.md");
    check("14.17 bug-work-plan contract: routing freshness, word-by-word environment and scaffold-first correction are stated",
      /\*\*routing freshness\*\*, not general freshness, that decides/.test(planContract) && /The\s+environment is read word by word \(0\.9\.2\)/.test(planContract) && /\*\*Correction \(`reroute`\) — scaffold first \(0\.9\.2\)\.\*\*/.test(planContract) && /REROUTE_NO_DRAFT/.test(planContract));
    check("14.16 command: after REROUTED refill the six repo_knowledge_* fields and re-scope the surface, then step 7", /its six `repo_knowledge_\*` fields\*\* were cleared/.test(cmd) && /Refill those fields and re-scope the corrected context to one surface — the end of step 6 — then continue at step 7/.test(cmd));
  }

  /* 15. Classification precedence (0.9.2 CI correction): tooling and documentation are exempt from the
         top-level rule only — never from stronger routing evidence. Git is isolated for this process. */
  {
    const commit = (root: string, msg = "change") => {
      git(root, "add", "-A", "--", ".", ":!.ono");
      git(root, "commit", "-qm", msg);
    };
    const rebaseKnowledge = (root: string) => {
      const p = join(root, ".ono/repo-knowledge.json");
      const m = JSON.parse(readFileSync(p, "utf-8"));
      m.fingerprint.knowledgeHead = git(root, "rev-parse", "HEAD");
      m.fingerprint.gitHead = m.fingerprint.knowledgeHead;
      writeFileSync(p, JSON.stringify(m, null, 2));
    };
    const RF = (root: string) => Reader.readRepoKnowledge(root).routingFreshness;
    const routes = (root: string) => auto(S(ext(root)));
    const confirms = (root: string) => asks(S(ext(root)));

    // Positive: ordinary tooling and documentation never block — untracked, staged, committed, added or removed.
    const p1 = repoWith();
    write(p1, ".claude/settings.local.json", "{\"permissions\":{}}\n");
    check("15 + an untracked .claude/settings.local.json (a new top-level folder) keeps automatic routing", routes(p1) && RF(p1)?.status === "CLEAN" && RF(p1)?.ordinaryChangeCount === 1, JSON.stringify(RF(p1)));
    const p2 = repoWith();
    git(p2, "rm", "-rq", "docs");
    commit(p2, "no docs at inspection");
    rebaseKnowledge(p2);
    write(p2, "docs/bugs/YET-2/bug-report.json", "{}\n");
    write(p2, "docs/notes/workshop.md", "# notes\n");
    check("15 + a newly created ordinary docs/ folder (the plugin's own output) keeps automatic routing", routes(p2) && RF(p2)?.status === "CLEAN", JSON.stringify(RF(p2)));
    const p3 = repoWith();
    write(p3, ".idea/workspace.xml", "<project/>\n");
    write(p3, ".vscode/settings.json", "{}\n");
    write(p3, ".DS_Store", "x");
    check("15 + ordinary .idea/, .vscode/ and .DS_Store additions keep automatic routing", routes(p3) && RF(p3)?.status === "CLEAN", JSON.stringify(RF(p3)));
    const p4 = repoWith();
    write(p4, ".vscode/extensions.json", "{}\n");
    git(p4, "add", ".vscode/extensions.json");
    write(p4, ".idea/misc.xml", "<project/>\n");
    write(p4, "docs/adr/0001.md", "# ADR\n");
    check("15 + a staged .vscode/ addition keeps automatic routing", routes(p4) && RF(p4)?.status === "CLEAN", JSON.stringify(RF(p4)));
    commit(p4, "tooling and docs");
    check("15 + committed .idea/, .vscode/ and docs/ additions keep automatic routing", routes(p4) && RF(p4)?.status === "CLEAN", JSON.stringify(RF(p4)));
    const p5 = repoWith();
    write(p5, ".vscode/settings.json", "{}\n");
    write(p5, ".idea/misc.xml", "<project/>\n");
    commit(p5);
    rebaseKnowledge(p5);
    rmSync(join(p5, ".vscode"), { recursive: true });
    check("15 + an ordinary tooling folder removed (not committed) keeps automatic routing", routes(p5) && RF(p5)?.status === "CLEAN", JSON.stringify(RF(p5)));
    git(p5, "rm", "-rq", ".idea");
    commit(p5, "remove tooling");
    check("15 + ordinary tooling folders removed and committed keep automatic routing", routes(p5) && RF(p5)?.status === "CLEAN", JSON.stringify(RF(p5)));

    // Negative: stronger evidence always wins over the location.
    const n1 = repoWith();
    write(n1, "ios/App/AppDelegate.swift", "class AppDelegate {}\n");
    check("15 − an untracked new ios/ folder with only Swift sources → confirm (a new platform folder)", confirms(n1) && RF(n1)?.routingChanges.some((c) => /^ios\/App\/AppDelegate\.swift — a top-level entry was added or removed$/.test(c)), JSON.stringify(RF(n1)));
    const n2 = repoWith();
    write(n2, "mobile/build.gradle.kts", "plugins { id(\"com.android.application\") }\n");
    write(n2, "TVApp/TVApp.xcodeproj/project.pbxproj", "// !$*UTF8*$!\n");
    check("15 − a newly introduced Android and Apple build configuration → confirm", confirms(n2) && RF(n2)?.routingChanges.some((c) => c.startsWith("mobile/build.gradle.kts — build or target configuration")) && RF(n2)?.routingChanges.some((c) => c.startsWith("TVApp/TVApp.xcodeproj/project.pbxproj — build or target configuration")), JSON.stringify(RF(n2)));
    for (const [where, path, body] of [["docs/", "docs/tv/build.gradle", "apply plugin: 'com.android.application'\n"], [".claude/", ".claude/package.json", "{}\n"], [".vscode/", ".vscode/AndroidManifest.xml", "<manifest/>\n"], [".idea/", ".idea/flavors.properties", "tv=true\n"]] as const) {
      const r = repoWith();
      write(r, path, body);
      check(`15 − routing configuration inside ${where} (${path}) → confirm, the location never exempts it`, confirms(r) && RF(r)?.routingChanges.some((c) => c.startsWith(`${path} — build or target configuration`)), JSON.stringify(RF(r)));
    }
    for (const [where, dep, script] of [["docs/", "docs/targets.json", "def targets = new groovy.json.JsonSlurper().parse(file('../docs/targets.json'))\n"], [".claude/", ".claude/build-targets.md", "def notes = file('../.claude/build-targets.md').text\n"]] as const) {
      const r = repoWith();
      write(r, "app/build.gradle", script);
      write(r, dep, "tv\n");
      commit(r);
      rebaseKnowledge(r);
      check(`15 (control) a build dependency inside ${where}, unchanged → still automatic`, routes(r), JSON.stringify(RF(r)));
      write(r, dep, "tv mobile\n");
      check(`15 − a change to an explicitly referenced build dependency inside ${where} → confirm`, confirms(r) && RF(r)?.routingChanges.some((c) => c === `${dep} — read or applied by a build script`), JSON.stringify(RF(r)));
      rmSync(join(r, dep));
      check(`15 − the referenced dependency inside ${where} deleted → confirm`, confirms(r) && RF(r)?.routingChanges.some((c) => c === `${dep} — read or applied by a build script`), JSON.stringify(RF(r)));
    }
    const n5 = repoWith();
    mkdirSync(join(n5, ".claude"), { recursive: true });
    symlinkSync("../app/src/Main.kt", join(n5, ".claude/linked.kt"));
    check("15 − a symbolic link inside .claude/ → confirm", confirms(n5) && RF(n5)?.routingChanges.some((c) => c === ".claude/linked.kt — a symbolic link"), JSON.stringify(RF(n5)));
    const n6 = repoWith();
    git(n6, "update-index", "--add", "--cacheinfo", `160000,${git(n6, "rev-parse", "HEAD")},docs/vendor/lib`);
    check("15 − a submodule inside docs/ → confirm", confirms(n6) && RF(n6)?.routingChanges.some((c) => c === "docs/vendor/lib — a submodule"), JSON.stringify(RF(n6)));
    const n7 = repoWith();
    write(n7, "docs/build.gradle", "ext.tv = true\n");
    commit(n7);
    rebaseKnowledge(n7);
    git(n7, "mv", "docs/build.gradle", "docs/build-notes.md");
    check("15 − a rename from routing configuration to an ordinary docs/ file → confirm (the old side counts)", confirms(n7) && RF(n7)?.routingChanges.some((c) => c === "docs/build.gradle — build or target configuration"), JSON.stringify(RF(n7)));
    const n8 = repoWith();
    write(n8, ".vscode/notes.md", "x\n");
    commit(n8);
    rebaseKnowledge(n8);
    git(n8, "mv", ".vscode/notes.md", "app/build.gradle");
    check("15 − a rename from an ordinary .vscode/ file to a build script → confirm (the new side counts)", confirms(n8) && RF(n8)?.routingChanges.some((c) => c === "app/build.gradle — build or target configuration"), JSON.stringify(RF(n8)));
    const n9 = repoWith();
    write(n9, "app/build.gradle", "def targets = file(System.getenv('TARGETS_FILE'))\n");
    commit(n9);
    rebaseKnowledge(n9);
    write(n9, ".claude/settings.local.json", "{}\n");
    check("15 − an unresolvable build dependency stays UNKNOWN even when only tooling changed → confirm", confirms(n9) && RF(n9)?.status === "UNKNOWN", JSON.stringify(RF(n9)));
    check("15 classification order: link/submodule › configuration and build inputs › tooling/docs › top-level rule › type",
      Reader.classifyChange(".claude/x.json", { special: "a symbolic link", topLevelChanged: true }) === "a symbolic link" &&
      Reader.classifyChange("docs/build.gradle", { special: null, topLevelChanged: true }) === "build or target configuration" &&
      Reader.classifyChange("docs/t.json", { special: null, topLevelChanged: true, buildInputs: ["docs/t.json"] }) === "read or applied by a build script" &&
      Reader.classifyChange("docs/t.json", { special: null, topLevelChanged: true }) === null &&
      Reader.classifyChange(".claude/settings.local.json", { special: null, topLevelChanged: true }) === null &&
      Reader.classifyChange("ios/App.swift", { special: null, topLevelChanged: true }) === "a top-level entry was added or removed" &&
      Reader.classifyChange("ios/App.swift", { special: null, topLevelChanged: false }) === null &&
      Reader.classifyChange("logic/src/X.kt", { special: null, topLevelChanged: false, includedBuilds: ["logic/"] }) === "inside an included build");

    // Isolation: a host's ignore rule would hide the regression — this process's Git never reads one.
    const hostRoot = repoWith();
    write(hostRoot, ".claude/package.json", "{}\n");
    const hostIgnore = join(TMP, "host-ignore");
    writeFileSync(hostIgnore, ".claude/\n");
    const hostConfig = join(TMP, "host.gitconfig");
    writeFileSync(hostConfig, `[core]\n\texcludesFile = ${hostIgnore}\n`);
    const statusWith = (env: Record<string, string>) => execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: hostRoot, encoding: "utf-8", env: { ...process.env, ...env } });
    check("15 isolation (control): a host-style global ignore rule WOULD hide .claude/ from git status", !/\.claude\//.test(statusWith({ GIT_CONFIG_GLOBAL: hostConfig })), statusWith({ GIT_CONFIG_GLOBAL: hostConfig }));
    check("15 isolation: this process's Git shows it — no global config, no system config, no XDG ignore", /\.claude\/package\.json/.test(statusWith({})) && process.env.GIT_CONFIG_NOSYSTEM === "1" && readFileSync(process.env.GIT_CONFIG_GLOBAL!, "utf-8") === "" && !existsSync(join(process.env.XDG_CONFIG_HOME!, "git", "ignore")));
    const saved = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = hostConfig;
    let hidden: any;
    try {
      hidden = RF(hostRoot);
    } finally {
      process.env.GIT_CONFIG_GLOBAL = saved;
    }
    check("15 isolation: under the host-style ignore the reader would miss the routing-relevant .claude/package.json (why isolation matters)", hidden?.status === "CLEAN", JSON.stringify(hidden));
    check("15 isolation: under this suite's isolated Git the same change is ROUTING_CHANGED → confirm", RF(hostRoot)?.status === "ROUTING_CHANGED" && confirms(hostRoot), JSON.stringify(RF(hostRoot)));
  }

  /* 11. The command, contracts and agent say the same thing. */
  {
    const cmd = read("commands/analyze-bug.md");
    check("11 command: the single-target line, no question", cmd.includes("Development context resolved from Project Knowledge:") && /repo-single-target/.test(cmd));
    check("11 command: the approval summary names platform, device type and routing source", /the routing — platform, device type and its source/i.test(cmd));
    check("11 command: the correction is the developer's explicit choice, through reroute", cmd.includes('scripts/analyze-bug.ts" reroute') && /only on an explicit/i.test(cmd));
    const contract = read("docs/repo-knowledge-contract.md");
    check("11 knowledge contract: the narrow exception, and formFactor stays apart from device_type elsewhere", /single-target routing exception/i.test(contract) && /formFactor/.test(contract) && !/Project Knowledge never decides Dev Plugin routing:/.test(contract));
    check("11 knowledge contract: the Inspector's own contract still says otherwise — documented", /Inspector-owned contract/i.test(contract));
    const plan = read("docs/bug-work-plan-contract.md");
    check("11 bug-work-plan contract: precedence with repo-single-target third", /repo-single-target/.test(plan) && /reroute/.test(plan));
    const analyst = read("agents/repo-analyst.md");
    check("11 repo-analyst: no unconditional 'Project Knowledge never supplies the device_type' left", !/Project Knowledge never supplies the `device_type`\./.test(analyst) && /repo-single-target/.test(analyst));
    check("11 the suite is registered", read("scripts/check.ts").includes('"bug-routing"'));
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall bug-routing checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
