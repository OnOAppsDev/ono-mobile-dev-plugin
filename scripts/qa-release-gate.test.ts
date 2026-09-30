/**
 * qa-release-gate.test.ts
 *
 * The QA gate of /prepare-mobile-release (Stage 7): release consumes QA-owned readiness
 * evidence (ono-plugin-qa's `readiness/<kind>/<id>.md`, docs/qa-readiness-contract.md)
 * instead of treating the Dev QA handoff as QA sign-off.
 *
 * Fixtures are REAL artifacts rendered by the committed QA plugin (aab471e):
 *   scripts/fixtures/qa-readiness/feature-checkout.md  READY_WITH_EXCEPTIONS, signed
 *   scripts/fixtures/qa-readiness/bug-BUG-27.md        READY, signed
 * Variants are derived by exact text edits, so every "malformed" case is one precise defect.
 *
 * No external test framework. Run with:
 *   node --no-warnings scripts/qa-release-gate.test.ts
 * or through the aggregator:
 *   node scripts/check.ts --only qa-release-gate
 */

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { pathToFileURL } from "url";
import { spawnSync } from "child_process";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const GATE = join(HERE, "qa-release-gate.ts");
const FIX = join(HERE, "fixtures", "qa-readiness");
const FEATURE = readFileSync(join(FIX, "feature-checkout.md"), "utf-8");
const BUG = readFileSync(join(FIX, "bug-BUG-27.md"), "utf-8");
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf-8");
const flat = (s: string): string => s.replace(/\s+/g, " ");

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

const gate: any = await import(pathToFileURL(GATE).href);

// An artifact is always supplied as text + a source label; the CLI reads files.
const art = (text: string, source = "readiness/x.md") => gate.parseQaReadiness(text, source);
const run = (g: any, texts: Array<[string, string]>, features: string[] = [], bugs: string[] = [], releaseBuilds: Record<string, string> = {}) =>
  g.evaluateQaGate({ artifacts: texts.map(([src, t]) => g.parseQaReadiness(t, src)), features, bugs, releaseBuilds });
const codes = (r: any): string[] => r.blockers.map((b: any) => b.code);

// A READY feature artifact: the bug fixture's sign-off shape on the feature scope's identity.
function readyFeature(): string {
  return FEATURE.replace("verdict: READY_WITH_EXCEPTIONS", "verdict: READY")
    .replace("exception_count: 3", "exception_count: 0")
    .replace(/\n## Exceptions\n\n[\s\S]*?\n\n## Known Issues/, "\n## Exceptions\n\nNone.\n\n## Known Issues")
    .replace(/- Exceptions: .*\n/, "- Exceptions: none\n")
    .replace("- QA verdict: READY_WITH_EXCEPTIONS", "- QA verdict: READY");
}

/* ── the gate ─────────────────────────────────────────────────────────── */
function gateSuite(g: any, tag = ""): void {
  const t = (n: string) => `${tag}${n}`;
  // 1 READY + valid sign-off passes.
  {
    const r = run(g, [["f.md", readyFeature()]], ["checkout"], [], { android: "104" });
    check(t("1 READY + valid sign-off passes the QA gate"), r.status === "pass" && r.blockers.length === 0, JSON.stringify(r.blockers));
  }
  // 2 READY_WITH_EXCEPTIONS passes, surfacing its exceptions.
  {
    const r = run(g, [["f.md", FEATURE]], ["checkout"], [], { android: "104" });
    check(t("2 READY_WITH_EXCEPTIONS passes the QA gate"), r.status === "pass_with_exceptions" && r.blockers.length === 0, JSON.stringify(r.blockers));
    check(t("2 …and is never reported as plain READY"), r.status !== "pass" && r.warnings.some((w: any) => w.code === "QA_EXCEPTIONS_PRESENT"));
    check(t("2 …with every exception surfaced"), r.exceptions.length === 3 && r.exceptions.every((x: any) => x.reason && x.approved_by));
  }
  // 3 NOT_READY is No-Go.
  {
    const notReady = readyFeature().replace("verdict: READY", "verdict: NOT_READY").replace("blocker_count: 0", "blocker_count: 1").replace("- QA verdict: READY", "- QA verdict: NOT_READY");
    const r = run(g, [["f.md", notReady]], ["checkout"]);
    check(t("3 NOT_READY is No-Go"), r.status === "no_go" && codes(r).includes("QA_NOT_READY"), JSON.stringify(r.blockers));
  }
  // 4 unsigned readiness is No-Go.
  {
    const unsigned = readyFeature().replace(/signed_off_by: .*/, "signed_off_by: null").replace(/signed_off_date: .*/, "signed_off_date: null").replace(/signoff_fingerprint: .*/, "signoff_fingerprint: null").replace("signoff_status: valid", "signoff_status: none");
    const r = run(g, [["f.md", unsigned]], ["checkout"]);
    check(t("4 unsigned readiness is No-Go"), r.status === "no_go" && codes(r).includes("QA_UNSIGNED"), JSON.stringify(r.blockers));
  }
  // 5 stale sign-off is No-Go — by status, and by a fingerprint that no longer matches.
  {
    const staleStatus = readyFeature().replace("signoff_status: valid", "signoff_status: stale");
    const r1 = run(g, [["f.md", staleStatus]], ["checkout"]);
    check(t("5 a stale sign-off is No-Go"), r1.status === "no_go" && codes(r1).includes("QA_SIGNOFF_STALE"));
    const fp = /signoff_fingerprint: (sha256:[0-9a-f]{64})/.exec(readyFeature())![1];
    const moved = readyFeature().replace(`signoff_fingerprint: ${fp}`, `signoff_fingerprint: sha256:${"0".repeat(64)}`);
    const r2 = run(g, [["f.md", moved]], ["checkout"]);
    check(t("5 a sign-off for another fingerprint is No-Go"), r2.status === "no_go" && codes(r2).includes("QA_SIGNOFF_STALE"));
  }
  // 6 malformed readiness is No-Go.
  {
    const cases: Array<[string, string]> = [
      ["no frontmatter", readyFeature().replace(/^---\n/, "")],
      ["unknown verdict", readyFeature().replace("verdict: READY", "verdict: MOSTLY_READY")],
      ["schema too new", readyFeature().replace("qa_readiness_schema: 1", "qa_readiness_schema: 2")],
      ["counts contradict the verdict", readyFeature().replace("blocker_count: 0", "blocker_count: 2")],
      ["missing Release Notes Input", readyFeature().replace("## Release Notes Input", "## Notes")],
      ["verdict disagrees with its own body", readyFeature().replace("- QA verdict: READY", "- QA verdict: NOT_READY")],
      ["scope and kind disagree", readyFeature().replace("scope_kind: feature", "scope_kind: bug")],
      ["missing fingerprint", readyFeature().replace(/fingerprint: sha256:[0-9a-f]{64}\ngenerated_at/, "generated_at")],
    ];
    for (const [name, text] of cases) {
      const r = run(g, [["f.md", text]], ["checkout"]);
      check(t(`6 malformed (${name}) is No-Go`), r.status === "no_go" && codes(r).includes("QA_READINESS_MALFORMED"), JSON.stringify(r.blockers));
    }
  }
  // 7 missing readiness is No-Go.
  {
    const r = run(g, [], ["checkout"]);
    check(t("7 no readiness supplied is No-Go"), r.status === "no_go" && codes(r).includes("QA_READINESS_MISSING"));
    const r2 = g.evaluateQaGate({ artifacts: [g.readQaReadiness(join(FIX, "does-not-exist.md"))], features: ["checkout"], bugs: [], releaseBuilds: {} });
    check(t("7 a readiness path that does not exist is No-Go"), r2.status === "no_go" && codes(r2).includes("QA_READINESS_MISSING"));
  }
  // 8 / 9 feature coverage.
  {
    const r = run(g, [["f.md", readyFeature()]], ["checkout"]);
    check(t("8 a feature release covered by its feature readiness passes"), r.status === "pass" && r.coverage.features[0].covered_by === "f.md" && r.coverage.features[0].matched_by === "dev_feature");
    const r2 = run(g, [["f.md", readyFeature()]], ["checkout", "wallet"]);
    check(t("9 an uncovered feature is No-Go"), r2.status === "no_go" && r2.blockers.some((b: any) => b.code === "QA_NOT_COVERED" && b.item === "feature:wallet"));
  }
  // 10 member artifacts together cover a release; a release-scope artifact has no contract.
  {
    const r = run(g, [["f.md", readyFeature()], ["b.md", BUG]], ["checkout"], ["BUG-27"]);
    check(t("10 member readiness artifacts that exactly cover the release pass"), r.status === "pass" && r.coverage.features.length === 1 && r.coverage.bugs.length === 1);
    const rel = readyFeature().replace("scope: feature:checkout", "scope: release:2.4.0").replace("scope_kind: feature", "scope_kind: release");
    const r2 = run(g, [["r.md", rel]], ["checkout"]);
    check(t("10 a release-scope artifact is refused — the QA contract defines none"), r2.status === "no_go" && codes(r2).includes("QA_READINESS_MALFORMED"), JSON.stringify(r2.blockers));
  }
  // 11 / 12 bug-fix-only releases.
  {
    const r = run(g, [["b.md", BUG]], [], ["BUG-27"], { "android-tv": "atv-104" });
    check(t("11 a bug-fix-only release passes with the bug's readiness"), r.status === "pass", JSON.stringify(r.blockers));
    check(t("12 …with no feature, handoff or plan involved"), r.coverage.features.length === 0 && !JSON.stringify(r).includes("qa-handoff"));
  }
  // 13 mixed releases need both kinds covered.
  {
    const r = run(g, [["b.md", BUG]], ["checkout"], ["BUG-27"]);
    check(t("13 a mixed release with only the bug covered is No-Go"), r.status === "no_go" && r.blockers.some((b: any) => b.item === "feature:checkout"));
    const r2 = run(g, [["f.md", readyFeature()]], ["checkout"], ["BUG-27"]);
    check(t("13 a mixed release with only the feature covered is No-Go"), r2.status === "no_go" && r2.blockers.some((b: any) => b.item === "bug:BUG-27"));
  }
  // 14 / 15 identity is exact.
  {
    const r = run(g, [["b.md", BUG]], [], ["bug-27"]);
    check(t("14 bug ids match exactly — case is never folded"), r.status === "no_go" && codes(r).includes("QA_NOT_COVERED"));
    const r1 = run(g, [["b.md", BUG]], [], ["JIRA-4411"]);
    check(t("14 an external tracker key does not match — the contract carries no external_ref"), r1.status === "no_go" && r1.limitations.some((l: string) => /external_ref/.test(l)));
    const r2 = run(g, [["f.md", readyFeature()]], ["Checkout"]);
    const r3 = run(g, [["f.md", readyFeature()]], ["checkout-v2"]);
    check(t("15 no fuzzy feature matching"), r2.status === "no_go" && r3.status === "no_go");
    const noDev = readyFeature().replace("- Scope: feature:checkout (Dev feature checkout)", "- Scope: feature:checkout");
    const r4 = run(g, [["f.md", noDev]], ["checkout"]);
    check(t("15 without a Dev identity, only the exact QA scope id matches"), r4.status === "pass" && r4.coverage.features[0].matched_by === "qa_scope_id");
    const otherDev = readyFeature().replace("(Dev feature checkout)", "(Dev feature checkout-legacy)");
    const r5 = run(g, [["f.md", otherDev]], ["checkout"]);
    check(t("15 a canonical Dev identity is never overridden by the QA slug"), r5.status === "no_go");
    const r6 = run(g, [["f1.md", readyFeature()], ["f2.md", readyFeature()]], ["checkout"]);
    check(t("15 two artifacts claiming one item are never resolved silently"), r6.status === "no_go" && codes(r6).includes("QA_DUPLICATE_COVERAGE"));
  }
  // 16 build consistency.
  {
    const r = run(g, [["f.md", readyFeature()]], ["checkout"], [], { android: "105" });
    check(t("16 QA evidence for 104 never proves release build 105"), r.status === "no_go" && codes(r).includes("QA_BUILD_MISMATCH") && r.build_consistency.status === "mismatch");
    const r2 = run(g, [["f.md", readyFeature()]], ["checkout"]);
    check(t("16 an unknown release build is surfaced, never assumed"), r2.build_consistency.status === "unverified" && r2.warnings.some((w: any) => w.code === "QA_BUILD_UNVERIFIED"));
    const r3 = run(g, [["f.md", readyFeature()]], ["checkout"], [], { android: "104" });
    check(t("16 a matching build is recorded as match"), r3.build_consistency.status === "match");
  }
  // 17 checklist carries exceptions and known issues.
  {
    const withKnown = FEATURE.replace("## Known Issues\n\nNone.", "## Known Issues\n\n| Item | Reason | Approved by |\n|---|---|---|\n| R4:bug:BUG-3 | Cosmetic typo | lead |");
    const r = run(g, [["f.md", withKnown]], ["checkout"], [], { android: "104" });
    const md = g.renderQaSection(r);
    check(t("17 the checklist QA section lists every exception"), ["EX-1", "EX-2", "EX-3"].every((x) => md.includes(x)));
    check(t("17 …and every known issue"), md.includes("R4:bug:BUG-3") && md.includes("Cosmetic typo"));
    check(t("17 …and the verdict, sign-off and builds"), md.includes("READY_WITH_EXCEPTIONS") && md.includes("lead") && md.includes("104"));
  }
  // 18 release notes input is input only.
  {
    const extra = BUG.replace(/- Bug fixes verified: .*/, "- Bug fixes verified: bug:BUG-27 (fixed in atv-104), bug:BUG-99 (fixed in atv-104)");
    const r = run(g, [["b.md", extra]], [], ["BUG-27"]);
    const rni = r.release_notes_input;
    check(t("18 QA release-notes input is consumed"), rni.bug_fixes_verified.some((b: any) => b.bug === "bug:BUG-27"));
    check(t("18 …but never adds an item the release does not contain"), !rni.bug_fixes_verified.some((b: any) => b.bug === "bug:BUG-99") && rni.ignored.some((i: any) => /BUG-99/.test(i.text)));
    check(t("18 …and never sets the version"), !("version" in rni));
  }
}
gateSuite(gate);

/* ── the CLI ──────────────────────────────────────────────────────────── */
{
  const r = spawnSync(process.execPath, ["--no-warnings", GATE, "--readiness", join(FIX, "bug-BUG-27.md"), "--bug", "BUG-27", "--release-build", "android-tv=atv-104"], { encoding: "utf-8" });
  let out: any = null;
  try {
    out = JSON.parse(r.stdout);
  } catch {
    /* reported below */
  }
  check("CLI always prints one JSON object and exits 0", r.status === 0 && out !== null, r.stderr);
  check("CLI evaluates the same gate", out?.status === "pass" && out?.coverage?.bugs?.[0]?.covered_by?.endsWith("bug-BUG-27.md"));
  const r2 = spawnSync(process.execPath, ["--no-warnings", GATE, "--bug", "BUG-27"], { encoding: "utf-8" });
  check("CLI with no readiness is a deterministic No-Go, not a crash", r2.status === 0 && JSON.parse(r2.stdout).status === "no_go");
  const r3 = spawnSync(process.execPath, ["--no-warnings", GATE, "--readiness", join(FIX, "bug-BUG-27.md")], { encoding: "utf-8" });
  check("CLI with no release contents is a No-Go that asks for them", JSON.parse(r3.stdout).blockers.some((b: any) => b.code === "RELEASE_CONTENTS_REQUIRED"));
  const src = readFileSync(GATE, "utf-8");
  check("22/23 the gate reads only the files it is given — no search of sibling repos", !/readdirSync|ono-plugin-qa\/|ono-plugin-project-inspector|\.\.\/\.\./.test(src));
}

/* ── 19 / 20 the release documents ───────────────────────────────────── */
{
  const std = read("standards/shared/release-readiness.md");
  const tmpl = read("templates/release-checklist-template.md");
  const skill = read("skills/mobile-release-readiness/SKILL.md");
  const agent = read("agents/mobile-release-engineer.md");
  const cmd = read("commands/prepare-mobile-release.md");
  check("19 REL-QA-1 requires QA-owned readiness, not the Dev handoff", /`REL-QA-1`[^\n]*QA readiness/.test(std) && !/`REL-QA-1` A completed `qa-handoff-template\.md`/.test(std));
  check("19 the handoff is named Dev → QA input, never QA sign-off", /Dev → QA input/.test(std) && /never (the |a )?QA sign-off/i.test(flat(std)));
  check("19 the checklist no longer labels anything \"QA Sign-off\"", !/^## QA Sign-off$/m.test(tmpl) && /^## QA Readiness \(QA-owned\)$/m.test(tmpl));
  check("19 the skill and agent no longer pull QA sign-off from handoff notes", !/Pull QA sign-off from the relevant `qa-handoff-template\.md`/.test(agent) && !/Pull the completed `qa-handoff-template\.md` for every feature/.test(skill));
  check("19 the command takes explicit readiness paths and asks when they are missing", /--qa-readiness=/.test(cmd) && /ask the human/i.test(cmd) && /qa-release-gate\.ts/.test(cmd));
  check("19 READY_WITH_EXCEPTIONS stays a human decision", /READY_WITH_EXCEPTIONS/.test(std) && /human/i.test(flat(std)));
  for (const [id, text] of [
    ["REL-VERSION-1", "The app/package version and native build numbers are bumped for this release."],
    ["REL-NATIVECONFIG-2", "An unexplained native/platform config diff is treated as a blocker, not a note."],
    ["REL-ENV-2", "No real secrets are committed to the repo among env vars"],
    ["REL-PERF-1", "A performance sign-off (bundle size delta"],
    ["REL-ROLLBACK-1", "A rollback plan with concrete steps"],
    ["REL-VERDICT-1", "An incomplete or unverifiable checklist item defaults to No-Go"],
  ]) check(`20 ${id} is unchanged`, std.includes(`\`${id}\` ${text}`));
  check("20 the perf, rollback and verdict checklist sections are unchanged", /^## Perf Sign-off$/m.test(tmpl) && /^## Rollback Plan$/m.test(tmpl) && /^## Sign-off$/m.test(tmpl));
  check("24 no automation applicability rule was added", !/automation applicab/i.test(std + tmpl + skill + agent + cmd));
}

/* ── 21 the contract copy ─────────────────────────────────────────────── */
{
  // sha256 of ono-plugin-qa aab471e:docs/qa-readiness-contract.md (QA lifecycle Stage 6).
  // When QA changes the contract, update the copy, this pin and the reader in the same release.
  const QA_STAGE6_CONTRACT_SHA256 = "7484d6133611a24c7788c5049b81996d2bd664a8bbceb616eab3b5fe721e101e";
  const contract = read("docs/qa-readiness-contract.md");
  check("21 the QA readiness contract copy is byte-identical to the QA plugin's", createHash("sha256").update(contract).digest("hex") === QA_STAGE6_CONTRACT_SHA256);
  const tmpl = read("templates/release-checklist-template.md");
  check("21 the checklist cites the contract instead of restating it", /docs\/qa-readiness-contract\.md/.test(tmpl) && !/R1 Smoke|R9 Surface coverage/.test(tmpl));
}

/* ── mutation tests: each critical gate rule, disabled, must be caught ── */
{
  const src = readFileSync(GATE, "utf-8");
  const MUTANTS: Array<[string, string, string]> = [
    ["NOT_READY blocks", 'if (a.verdict === "NOT_READY") block(', "if (false) block("],
    ["unsigned blocks", 'if (a.signoff_status === "none") block(', "if (false) block("],
    ["a stale or foreign sign-off blocks", 'else if (a.signoff_status !== "valid" || a.signoff_fingerprint !== a.fingerprint) block(', "else if (false) block("],
    ["a malformed artifact blocks", 'for (const f of failed.filter((x) => x.code !== "QA_READINESS_MISSING")) block("QA_READINESS_MALFORMED"', 'for (const f of []) block("QA_READINESS_MALFORMED"'],
    ["an uncovered item blocks", 'if (!hits.length) block("QA_NOT_COVERED"', 'if (false) block("QA_NOT_COVERED"'],
    ["identity is matched exactly", "const same = (x: string | null, y: string) => x === y;", "const same = (x: string | null, y: string) => (x ?? \"\").toLowerCase() === y.toLowerCase();"],
    ["a build mismatch blocks", 'block("QA_BUILD_MISMATCH"', 'void ("QA_BUILD_MISMATCH"'],
    ["READY_WITH_EXCEPTIONS is not READY", 'const status = blockers.length ? "no_go" : usedList.some((a) => a.verdict === "READY_WITH_EXCEPTIONS") ? "pass_with_exceptions" : "pass";', 'const status = blockers.length ? "no_go" : "pass";'],
    ["missing readiness blocks", 'if (!artifacts.length) block("QA_READINESS_MISSING"', 'if (false) block("QA_READINESS_MISSING"'],
  ];
  const dir = mkdtempSync(join(tmpdir(), "qa-release-gate-mutant-"));
  for (const [name, target, replacement] of MUTANTS) {
    const hits = src.split(target).length - 1;
    if (hits !== 1) {
      check(`mutant target is unique: ${name}`, false, `found ${hits} times`);
      continue;
    }
    const file = join(dir, `${name.replace(/\W+/g, "-")}.ts`);
    writeFileSync(file, src.replace(target, replacement));
    const mutant: any = await import(pathToFileURL(file).href);
    const before = failures;
    const quiet = console.log;
    console.log = () => {};
    gateSuite(mutant, "mutant: ");
    console.log = quiet;
    const caught = failures > before;
    failures = before;
    check(`mutant killed: ${name}`, caught);
  }
  check("mutation harness wrote no file into the repository", !existsSync(join(HERE, "qa-release-gate.mutant.ts")));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
