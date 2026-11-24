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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as Bug from "./analyze-bug.ts";
import * as Reader from "./read-repo-knowledge.ts";
import { BUG_WORK_PLAN_FIELDS } from "./bug-work-plan.ts";
import { approveWorkPackage, verifyApproval } from "./work-approval.ts";
import { stateFilePath } from "./task-state.ts";
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
      ["source drift since the knowledge was written", { drift: true }],
      ["CLAUDE.md edited after the manifest", { editClaude: true }],
      ["an invalid capability relationship", { invalidRelationship: true }],
    ];
    for (const [name, o] of cases) {
      const r = S(ext(repoWith(o)));
      check(`5 ${name} → confirm`, asks(r), show(r));
    }
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
    for (const status of ["verifyOnUse", "deriveLive"] as const) {
      const forged = { ...ok, extendedCategories: { ...ok.extendedCategories, surfaces: { status, reason: "forged for the test" } } } as typeof ok;
      const t = Reader.singleRoutingTarget(forged);
      check(`5 surfaces that are not trusted (${status}) never route, even when every other gate passes`, t.status === "none" && /not trusted/.test((t as any).reason), JSON.stringify(t));
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
      ["an unrecognised environment is never agreement", { surfaces: ["android-tv"], environment: "Production 4.2" }, false],
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
    check("9 no plan → nothing to correct", RR({ ...ext(repoWith()), platform: "android", deviceType: "mobile" }).code === "REROUTE_NOT_ALLOWED");

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
    const rs = repoWith({ drift: true });
    const forged = SC({ ...ext(rs), platform: "android", deviceType: "tv", source: "repo-single-target", how: Bug.SINGLE_TARGET_MARK });
    const ts = readFileSync(planPath(rs), "utf-8");
    check("10 the automatic routing source cannot be supplied by the caller", forged.ok === true && ts.includes("- **Platform / device type:** android / tv — confirmed by the developer\n") && !ts.includes(Bug.SINGLE_TARGET_MARK), JSON.stringify(forged.routing));
    check("10 the CLI has no argument that names a routing source", !/flags\.(source|how)\b|flags\["(source|how)"\]/.test(read("scripts/analyze-bug.ts")));
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
