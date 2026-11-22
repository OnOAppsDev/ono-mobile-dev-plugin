/**
 * feature-fixture.ts — a realistic Feature Flow repository for the 0.8.0 suites
 * (feature-flow, feature-review, pre-pr, pr-readiness). Test support only: no command,
 * skill or agent uses it.
 *
 * The repository: `main` holds the app; the work branch `feature/login` carries the
 * feature's planning documents (FA → DD → Task Breakdown + Dev Plan, linked by their
 * frontmatter, Figma design reference) and, once implemented, the code and task state.
 */

import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fingerprintBody } from "./migrate-planning-doc.ts";
import { readFrontmatter } from "./task-resume.ts";
import { writeTaskState } from "./task-state.ts";

export const FEATURE = "login";
export const FIGMA = "https://www.figma.com/design/AbC123/Login?node-id=42-7";
export const FA = "docs/login/login-feature-analysis.md";
export const DD = "docs/login/login-DD.md";
export const TB = "docs/login/login-task-breakdown.md";
export const PLAN = "docs/login/login-dev-plan.md";
export const CODE1 = "src/login/LoginScreen.tsx";
export const CODE2 = "src/login/useLogin.ts";
export const TEST1 = "src/login/useLogin.test.ts";
export const TEST_CMD = "npx jest src/login";

export const git = (root: string, ...a: string[]): string => execFileSync("git", ["-C", root, ...a], { encoding: "utf-8" }).trim();
export function put(root: string, rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}

const design = `design_reference_status: provided
design_reference_type: figma
design_reference: null
figma_link: ${FIGMA}
platform: react
device_type: mobile`;

export function faText(status = "approved", body = "## Feature Request\n\nSign in with email and a one-time code.\n"): string {
  return `---\ndoc_schema_version: 3\nfeature: ${FEATURE}\nsource_link: https://acme.atlassian.net/wiki/spaces/APP/pages/1001/Login\nsource_fingerprint: null\ndd_link: ${DD}\n${design}\ndesign_reference_fingerprint: null\nsurface: null\ncapability: null\nauthor: architect\nstatus: ${status}\ndate: 2026-11-01\n---\n\n${body}`;
}
/** The design block a downstream document carries over from an analysis — verbatim, as /dev-design-start does. */
function carried(fa: string): string {
  const fm = readFrontmatter(Buffer.from(fa)) ?? {};
  return ["design_reference_status", "design_reference_type", "design_reference", "figma_link", "platform", "device_type"].map((k) => `${k}: ${fm[k] ?? (k === "platform" ? "react" : k === "device_type" ? "mobile" : "null")}`).join("\n");
}

export function ddText(fa: string, status = "approved", body = "## 25. Acceptance Criteria Mapping\n\n- AC1: the code screen accepts six digits.\n"): string {
  return `---\ndoc_schema_version: 2\nfeature: ${FEATURE}\nsource_fingerprint: ${fingerprintBody(Buffer.from(fa))}\nfeature_analysis_link: ${FA}\n${carried(fa)}\nauthor: architect\nstatus: ${status}\ndetail_level: standard\ndd_generation: single\ndd_complexity_band: unassessed\ndate: 2026-11-02\n---\n\n${body}`;
}
export function tbText(dd: string, status = "approved"): string {
  return `---\ndoc_schema_version: 1\nfeature: ${FEATURE}\nfeature_analysis_link: ${FA}\nsource_fingerprint: ${fingerprintBody(Buffer.from(dd))}\ndd_link: ${DD}\ndev_plan_link: ${PLAN}\nqa_handoff_link:\n${carried(dd)}\nstatus: ${status}\ndate: 2026-11-03\n---\n\n| id | description | platform | files touched | depends-on | size | acceptance criteria |\n|---|---|---|---|---|---|---|\n| T1 | Login hook | react | \`${CODE2}\` | — | S | useLogin submits the code and stores the session |\n| T2 | Login screen | react | \`${CODE1}\` | T1 | M | The code screen matches the Figma frame and accepts six digits |\n`;
}
export function planText(status = "approved", dd = ""): string {
  return `---\ndoc_schema_version: 1\nfeature: ${FEATURE}\ndd_link: ${DD}\n${dd ? carried(dd) : design}\nauthor: architect\nstatus: ${status}\ndate: 2026-11-03\n---\n\n## Overview\n\nLogin.\n`;
}

export interface FeatureRepo {
  root: string;
  tb: string;
}

/** A repository on `feature/login` with the planning documents (approved unless stated) committed on the branch. */
export function featureRepo(tmp: string, name: string, o: { fa?: string; dd?: string; tb?: string; plan?: string; only?: Array<"fa" | "dd" | "tb" | "plan">; faRaw?: string } = {}): FeatureRepo {
  const root = join(tmp, name);
  mkdirSync(root, { recursive: true });
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "t@t");
  git(root, "config", "user.name", "t");
  put(root, "src/app.ts", "export const app = 1;\n");
  put(root, ".gitignore", "node_modules/\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  git(root, "checkout", "-qb", "feature/login");
  const fa = o.faRaw ?? faText(o.fa);
  const dd = ddText(fa, o.dd);
  const only = o.only ?? ["fa", "dd", "tb", "plan"];
  if (only.includes("fa")) put(root, FA, fa);
  if (only.includes("dd")) put(root, DD, dd);
  if (only.includes("tb")) put(root, TB, tbText(dd, o.tb));
  if (only.includes("plan")) put(root, PLAN, planText(o.plan, dd));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "planning");
  return { root: realpathSync(root), tb: join(realpathSync(root), TB) };
}

const DT = { framework: "jest", required: true, testsChanged: [TEST1], justification: null, runs: [{ command: TEST_CMD, result: "pass" }], notRunReason: null };

/** Implement a task the way /implement-task leaves it: code in the working tree, task state complete. */
export function implement(r: FeatureRepo, task: "T1" | "T2", state: "complete" | "in-progress" = "complete"): void {
  const files = task === "T1" ? [CODE2, TEST1] : [CODE1];
  if (task === "T1") {
    put(r.root, CODE2, "export function useLogin() { return 1; }\n");
    put(r.root, TEST1, "test('login', () => {});\n");
  } else put(r.root, CODE1, "export const LoginScreen = () => null;\n");
  writeTaskState(r.root, FEATURE, task, "in-progress", { platform: "react" } as any, r.tb, { mode: "start" } as any);
  if (state === "in-progress") return;
  const w = writeTaskState(r.root, FEATURE, task, "complete", {
    platform: "react", filesChanged: files, standardIds: [], validation: [{ command: TEST_CMD, result: "pass" }],
    acceptanceCriteria: [{ criterion: task === "T1" ? "useLogin submits the code and stores the session" : "The code screen matches the Figma frame and accepts six digits", met: true }],
    developerTesting: DT, deviations: [], blockers: [],
    accessibility: { applicable: false, reason: "fixture: accessibility is out of this suite's scope", standardIds: [], checks: [] },
  } as any, r.tb);
  if (w.status !== "written") throw new Error(`fixture: could not complete ${task}: ${w.summary}`);
}

/** A review input for feature-review.ts record — clean by default. */
export function reviewInput(binding: unknown, o: { findings?: unknown[]; checks?: Record<string, string>; access?: unknown[] } = {}): Record<string, unknown> {
  const status = { "acceptance-criteria": "pass", "design-conformance": "pass", "ui-reference": "pass", "developer-testing": "pass", ...(o.checks ?? {}) };
  return {
    binding,
    reviewed_by: "code-reviewer + performance-reviewer",
    generated_at: "2026-11-20T10:00:00Z",
    findings: o.findings ?? [],
    checks: Object.entries(status).map(([id, s]) => ({ id, status: s, note: `${id} checked` })),
    design_access: o.access ?? [{ reference: FIGMA, node_id: "42:7", status: "retrieved", note: "get_design_context and get_screenshot" }],
  };
}

/** One of the repository's own planning-doc fixtures, re-pointed at this feature: its `feature`, `dd_link` and `status` set, every other byte kept. */
export function legacyFa(fixture: string, status = "approved"): string {
  const text = readFileSync(join(import.meta.dirname, "fixtures", "planning-docs", `${fixture}.md`), "utf-8");
  return text.replace(/^feature: .*$/m, `feature: ${FEATURE}`).replace(/^dd_link:.*$/m, `dd_link: ${DD}`).replace(/^status: .*$/m, `status: ${status}`);
}

let evN = 0;
/** ENG-003 design evidence, as the design step saves it: the get_design_context and get_metadata reads of `url`. */
export function figmaEvidence(dir: string, url = FIGMA, parts: string[] = ["get_design_context", "get_metadata"]): string {
  const p = join(dir, `figma-evidence-${++evN}.json`);
  writeFileSync(p, JSON.stringify({ source: url, parts: parts.map((name) => ({ name, content: `${name} of ${url}: frame "Login", 6-digit code field, primary button` })) }));
  return p;
}

export const tmpRoot = (prefix: string): string => realpathSync(mkdtempSync(join(tmpdir(), prefix)));
export const readText = (root: string, rel: string): string => readFileSync(join(root, rel), "utf-8");
