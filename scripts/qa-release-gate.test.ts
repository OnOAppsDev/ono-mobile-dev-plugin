/**
 * qa-release-gate.test.ts
 *
 * The QA gate of /prepare-mobile-release (Stage 7): release consumes QA-owned readiness
 * evidence (ono-plugin-qa's `readiness/<kind>/<id>.md`, docs/qa-readiness-contract.md)
 * instead of treating the Dev QA handoff as QA sign-off.
 *
 * The fixture is a REAL QA repository produced by the QA plugin's helper (ledger, plans and
 * schema-2 readiness artifacts), at scripts/fixtures/qa-repo/acme-qa/:
 *   readiness/feature/checkout.md  READY_WITH_EXCEPTIONS, signed (Dev feature checkout)
 *   readiness/bug/BUG-27.md        READY, signed (external_ref JIRA-4411)
 *   readiness/bug/BUG-28.md        NOT_READY, unsigned (a duplicate report, also JIRA-4411)
 *   readiness/release/2.4.0.md     READY_WITH_EXCEPTIONS, signed (members checkout + BUG-27)
 * Variants are derived by exact text edits, so every "malformed" case is one precise defect;
 * text variants are checked for freshness against the fixture's own ledger. `run` re-seals a
 * variant's artifact_integrity (the state QA would render), so gate rules are tested on
 * their own; `runRaw` does not, so the edit is a tampering. Ledger changes
 * are made on a temporary copy, never in the repository.
 *
 * No external test framework. Run with:
 *   node --no-warnings scripts/qa-release-gate.test.ts
 * or through the aggregator:
 *   node scripts/check.ts --only qa-release-gate
 */

import { readFileSync, writeFileSync, mkdtempSync, existsSync, cpSync, appendFileSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { pathToFileURL } from "url";
import { spawnSync } from "child_process";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const GATE = join(HERE, "qa-release-gate.ts");
const QA_ROOT = join(HERE, "fixtures", "qa-repo", "acme-qa");
const FIX = join(QA_ROOT, "readiness");
const FEATURE = readFileSync(join(FIX, "feature", "checkout.md"), "utf-8");
const BUG = readFileSync(join(FIX, "bug", "BUG-27.md"), "utf-8");
const BUG28 = readFileSync(join(FIX, "bug", "BUG-28.md"), "utf-8");
const RELEASE = readFileSync(join(FIX, "release", "2.4.0.md"), "utf-8");
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
// The contract's artifact_integrity, implemented independently of the gate.
const sealOf = (text: string): string => {
  const end = text.indexOf("\n---\n", 4);
  if (!text.startsWith("---\n") || end < 0) return text;
  const lines = text.slice(4, end).split("\n").filter((l) => !l.startsWith("artifact_integrity:"));
  const unsealed = `---\n${lines.join("\n")}${text.slice(end)}`;
  const at = unsealed.indexOf("\n---\n", 4);
  return `${unsealed.slice(0, at)}\nartifact_integrity: sha256:${createHash("sha256").update(unsealed).digest("hex")}${unsealed.slice(at)}`;
};
const runRaw = (g: any, texts: Array<[string, string]>, features: string[] = [], bugs: any[] = [], releaseBuilds: Record<string, string> = {}) =>
  g.evaluateQaGate({ artifacts: texts.map(([src, t]) => g.parseQaReadiness(t, src, { qaRoot: QA_ROOT })), features, bugs, releaseBuilds });
const run = (g: any, texts: Array<[string, string]>, features: string[] = [], bugs: any[] = [], releaseBuilds: Record<string, string> = {}) =>
  runRaw(g, texts.map(([src, t]) => [src, sealOf(t)]), features, bugs, releaseBuilds);
const runFiles = (g: any, paths: string[], features: string[] = [], bugs: any[] = [], releaseBuilds: Record<string, string> = {}) => g.evaluateQaGate({ artifacts: paths.map(g.readQaReadiness), features, bugs, releaseBuilds });
const codes = (r: any): string[] => r.blockers.map((b: any) => b.code);
const BUILDS = { android: "104", "android-tv": "atv-104" };

// A temporary copy of the fixture QA repository, and ledger writes shaped like the QA helper's.
const sha = (s: string) => `sha256:${createHash("sha256").update(s).digest("hex")}`;
const canon = (v: any): string => (Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}` : JSON.stringify(v));
const hashed = (rec: any) => ({ ...rec, hash: sha(canon(rec)) });
function qaCopy(): string {
  const dir = join(mkdtempSync(join(tmpdir(), "qa-release-gate-qa-")), "acme-qa");
  cpSync(QA_ROOT, dir, { recursive: true });
  return dir;
}
function appendEvent(root: string, rel: string, body: Record<string, unknown>): void {
  const f = join(root, "qa-ledger", rel);
  const prior = existsSync(f) ? readFileSync(f, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const last = prior.at(-1);
  appendFileSync(f, `${JSON.stringify(hashed({ v: 1, seq: prior.length, prev: last?.hash ?? null, at: "2026-10-03T09:00:00.000Z", by: "dana", ...body }))}\n`);
}
const artifactIn = (root: string, rel: string) => join(root, "readiness", rel);

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
      ["schema too new", readyFeature().replace("qa_readiness_schema: 2", "qa_readiness_schema: 3")],
      ["schema 1 (no freshness token)", readyFeature().replace("qa_readiness_schema: 2", "qa_readiness_schema: 1").replace(/freshness_token: .*\n/, "")],
      ["missing freshness token", readyFeature().replace(/freshness_token: .*\n/, "")],
      ["bug id disagrees with its scope", BUG.replace("qa_bug_id: BUG-27", "qa_bug_id: BUG-72")],
      ["Dev feature disagrees with its body", readyFeature().replace("dev_feature: checkout", "dev_feature: wallet")],
      ["counts contradict the verdict", readyFeature().replace("blocker_count: 0", "blocker_count: 2")],
      ["missing Release Notes Input", readyFeature().replace("## Release Notes Input", "## Notes")],
      ["verdict disagrees with its own body", readyFeature().replace("- QA verdict: READY", "- QA verdict: NOT_READY")],
      ["scope and kind disagree", readyFeature().replace("scope_kind: feature", "scope_kind: bug")],
      ["missing fingerprint", readyFeature().replace(/\nfingerprint: sha256:[0-9a-f]{64}\n/, "\n")],
      ["release member count disagrees", RELEASE.replace("member_count: 2", "member_count: 3")],
      ["release without Members", RELEASE.replace("## Members", "## People")],
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
    const r2 = g.evaluateQaGate({ artifacts: [g.readQaReadiness(join(FIX, "feature", "does-not-exist.md"))], features: ["checkout"], bugs: [], releaseBuilds: {} });
    check(t("7 a readiness path that does not exist is No-Go"), r2.status === "no_go" && codes(r2).includes("QA_READINESS_MISSING"));
  }
  // 8 / 9 feature coverage.
  {
    const r = run(g, [["f.md", readyFeature()]], ["checkout"]);
    check(t("8 a feature release covered by its feature readiness passes"), r.status === "pass" && r.coverage.features[0].covered_by === "f.md" && r.coverage.features[0].matched_by === "dev_feature");
    const r2 = run(g, [["f.md", readyFeature()]], ["checkout", "wallet"]);
    check(t("9 an uncovered feature is No-Go"), r2.status === "no_go" && r2.blockers.some((b: any) => b.code === "QA_NOT_COVERED" && b.item === "feature:wallet"));
  }
  // 10 member artifacts together cover a release (the release artifact is covered in R*).
  {
    const r = run(g, [["f.md", readyFeature()], ["b.md", BUG]], ["checkout"], ["BUG-27"]);
    check(t("10 member readiness artifacts that exactly cover the release pass"), r.status === "pass" && r.coverage.features.length === 1 && r.coverage.bugs.length === 1);
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
    check(t("14 a bare --bug value is a QA id — a tracker key there is never matched as one"), r1.status === "no_go" && codes(r1).includes("QA_NOT_COVERED"));
    const r2 = run(g, [["f.md", readyFeature()]], ["Checkout"]);
    const r3 = run(g, [["f.md", readyFeature()]], ["checkout-v2"]);
    check(t("15 no fuzzy feature matching"), r2.status === "no_go" && r3.status === "no_go");
    const noDev = readyFeature().replace("- Scope: feature:checkout (Dev feature checkout)", "- Scope: feature:checkout").replace("dev_feature: checkout", "dev_feature: null");
    const r4 = run(g, [["f.md", noDev]], ["checkout"]);
    check(t("15 without a Dev identity, only the exact QA scope id matches"), r4.status === "pass" && r4.coverage.features[0].matched_by === "qa_scope_id");
    const otherDev = readyFeature().replace("(Dev feature checkout)", "(Dev feature checkout-legacy)").replace("dev_feature: checkout", "dev_feature: checkout-legacy");
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

  /* ── R: the release readiness artifact ── */
  {
    const r = run(g, [["r.md", RELEASE]], ["checkout"], ["BUG-27"], BUILDS);
    check(t("R1 a signed release artifact covers a mixed release on its own"), r.status === "pass_with_exceptions" && r.blockers.length === 0 && [...r.coverage.features, ...r.coverage.bugs].every((c: any) => c.covered_by === "r.md" && c.via_release), JSON.stringify(r.blockers));
    check(t("R2 …aggregating members, exceptions, builds and release notes"), r.coverage.bugs[0].scope === "bug:BUG-27" && r.exceptions.length === 3 && r.exceptions.every((x: any) => x.id.startsWith("feature:checkout#")) && r.build_consistency.status === "match" && r.release_notes_input.bug_fixes_verified.some((b: any) => b.bug === "bug:BUG-27"));
    const unsigned = RELEASE.replace(/signed_off_by: .*/, "signed_off_by: null").replace(/signed_off_date: .*/, "signed_off_date: null").replace(/signoff_fingerprint: .*/, "signoff_fingerprint: null").replace("signoff_status: valid", "signoff_status: none");
    check(t("R3 an unsigned release artifact is No-Go"), codes(run(g, [["r.md", unsigned]], ["checkout"], ["BUG-27"])).includes("QA_UNSIGNED"));
    check(t("R3 a stale release sign-off is No-Go"), codes(run(g, [["r.md", RELEASE.replace("signoff_status: valid", "signoff_status: stale")]], ["checkout"], ["BUG-27"])).includes("QA_SIGNOFF_STALE"));
    const extra = run(g, [["r.md", RELEASE]], ["checkout"], [], BUILDS);
    check(t("R4 a release artifact with a member outside the release is No-Go"), extra.status === "no_go" && codes(extra).includes("QA_RELEASE_MEMBERS_MISMATCH"));
    const missing = run(g, [["r.md", RELEASE], ["b.md", BUG]], ["checkout"], ["qa=BUG-27"]);
    check(t("R4 the same item covered by the release and a member artifact is duplicate coverage"), codes(missing).includes("QA_DUPLICATE_COVERAGE"));
    const outside = run(g, [["r.md", RELEASE], ["f.md", readyFeature().replace(/checkout/g, "wallet")]], ["checkout", "wallet"], ["BUG-27"]);
    check(t("R4 an item the release artifact does not list is No-Go"), codes(outside).includes("QA_RELEASE_MEMBERS_MISMATCH"));
    const notReady = RELEASE.replace("verdict: READY_WITH_EXCEPTIONS", "verdict: NOT_READY").replace("blocker_count: 0", "blocker_count: 1").replace("- QA verdict: READY_WITH_EXCEPTIONS", "- QA verdict: NOT_READY");
    check(t("R5 a NOT_READY release artifact is No-Go"), codes(run(g, [["r.md", notReady]], ["checkout"], ["BUG-27"])).includes("QA_NOT_READY"));
  }

  /* ── I: bug identity ── */
  {
    const noExt = BUG.replace("external_ref: JIRA-4411", "external_ref: null");
    const ok = (r: any) => r.status === "pass" && r.coverage.bugs.length === 1 && r.coverage.bugs[0].covered_by;
    check(t("I1 QA id only (bare and qa=) matches"), ok(run(g, [["b.md", BUG]], [], ["BUG-27"])) && run(g, [["b.md", BUG]], [], ["qa=BUG-27"]).coverage.bugs[0].matched_by === "qa_bug_id");
    check(t("I1 …also for a bug with no external_ref"), ok(run(g, [["b.md", noExt]], [], ["qa=BUG-27"])));
    const e = run(g, [["b.md", BUG]], [], ["external=JIRA-4411"]);
    check(t("I2 external_ref only matches — no QA id required"), ok(e) && e.coverage.bugs[0].matched_by === "external_ref" && e.coverage.bugs[0].scope === "bug:BUG-27");
    check(t("I2 …exactly (case is never folded)"), run(g, [["b.md", BUG]], [], ["external=jira-4411"]).status === "no_go");
    const both = run(g, [["b.md", BUG]], [], ["qa=BUG-27,external=JIRA-4411"]);
    check(t("I3 both ids naming the same bug match"), ok(both) && both.coverage.bugs[0].matched_by === "qa_bug_id+external_ref");
    check(t("I3 both ids naming different bugs are No-Go"), codes(run(g, [["b.md", BUG], ["b28.md", BUG28]], [], ["qa=BUG-28,external=JIRA-9999"])).includes("QA_BUG_IDENTITY_MISMATCH"));
    check(t("I3 an external_ref the artifact lacks is unconfirmed, never assumed"), codes(run(g, [["b.md", noExt]], [], ["qa=BUG-27,external=JIRA-4411"])).includes("QA_BUG_IDENTITY_MISMATCH"));
    check(t("I3 an item object with both ids is accepted too"), ok(run(g, [["b.md", BUG]], [], [{ qa_bug_id: "BUG-27", external_ref: "JIRA-4411" }])));
    for (const bad of ["", "qa=", "external=", "jira=JIRA-4411", "qa=BUG-27,qa=BUG-28", "BUG-27,JIRA-4411"]) check(t(`I4 an item with neither usable id is invalid (${JSON.stringify(bad)})`), g.parseBugItem(bad) === null && codes(run(g, [["b.md", BUG]], [], [bad])).includes("RELEASE_ITEM_INVALID"));
    check(t("I4 …as is an item object with neither id"), codes(run(g, [["b.md", BUG]], [], [{ qa_bug_id: null, external_ref: null }])).includes("RELEASE_ITEM_INVALID"));
    const amb = run(g, [["b.md", BUG], ["b28.md", BUG28]], [], ["external=JIRA-4411"]);
    check(t("I5 an external_ref shared by two QA bugs is ambiguous and fails — never resolved by choice"), amb.status === "no_go" && codes(amb).includes("QA_AMBIGUOUS_MATCH") && amb.coverage.bugs[0].covered_by === null);
    const dis = run(g, [["b.md", BUG], ["b28.md", BUG28]], [], ["qa=BUG-27,external=JIRA-4411"]);
    check(t("I5 …and giving both ids disambiguates deterministically"), dis.status === "pass" && dis.coverage.bugs[0].scope === "bug:BUG-27", JSON.stringify(dis.blockers));
    check(t("I6 release matching by QA id"), run(g, [["r.md", RELEASE]], ["checkout"], ["qa=BUG-27"], BUILDS).status === "pass_with_exceptions");
    const rx = run(g, [["r.md", RELEASE]], ["checkout"], ["external=JIRA-4411"], BUILDS);
    check(t("I7 release matching by external_ref"), rx.status === "pass_with_exceptions" && rx.coverage.bugs[0].scope === "bug:BUG-27" && rx.coverage.bugs[0].via_release);
    check(t("I8 release matching with mixed identifiers"), run(g, [["r.md", RELEASE]], ["checkout"], ["qa=BUG-27,external=JIRA-4411"], BUILDS).status === "pass_with_exceptions" && codes(run(g, [["r.md", RELEASE]], ["checkout"], ["qa=BUG-27,external=JIRA-1"])).includes("QA_BUG_IDENTITY_MISMATCH"));
    check(t("I8 release matching is ambiguous when a member and another artifact share the external_ref"), codes(run(g, [["r.md", RELEASE], ["b28.md", BUG28]], ["checkout"], ["external=JIRA-4411"])).includes("QA_AMBIGUOUS_MATCH"));
  }

  /* ── F: freshness against the QA ledger ── */
  {
    const all = ["feature/checkout.md", "bug/BUG-27.md", "bug/BUG-28.md", "release/2.4.0.md"];
    const fresh = all.map((rel) => g.readQaReadiness(join(FIX, rel)));
    check(t("F1 every fixture artifact is fresh — the gate recomputes the token QA wrote"), fresh.every((a: any) => a.ok && a.freshness.status === "fresh" && a.freshness.computed === a.freshness_token), JSON.stringify(fresh.map((a: any) => a.freshness ?? a.problems)));
    check(t("F1 a fresh artifact is accepted"), runFiles(g, [join(FIX, "release", "2.4.0.md")], ["checkout"], ["BUG-27"], BUILDS).status === "pass_with_exceptions");

    const bumped = qaCopy();
    appendEvent(bumped, "scopes/bug/BUG-27.jsonl", { kind: "context.set", field: "assignee", value: "omer" });
    const out = runFiles(g, [artifactIn(bumped, "release/2.4.0.md")], ["checkout"], ["BUG-27"], BUILDS);
    check(t("F2 a member change after rendering makes the release artifact outdated — No-Go"), out.status === "no_go" && codes(out).includes("QA_READINESS_OUTDATED"), JSON.stringify(out.blockers));
    check(t("F2 …and the member's own artifact"), codes(runFiles(g, [artifactIn(bumped, "bug/BUG-27.md")], [], ["BUG-27"])).includes("QA_READINESS_OUTDATED"));
    check(t("F2 …but not an unrelated member's artifact"), g.readQaReadiness(artifactIn(bumped, "feature/checkout.md")).freshness.status === "fresh");

    const planned = qaCopy();
    const plan = join(planned, "checkout", "test-plan.md");
    writeFileSync(plan, `${readFileSync(plan, "utf-8")}\n`);
    check(t("F2 a test-plan edit makes the feature artifact outdated"), g.readQaReadiness(artifactIn(planned, "feature/checkout.md")).freshness.status === "outdated");

    const delivered = qaCopy();
    writeFileSync(join(delivered, "qa-ledger", "builds", "105.json"), JSON.stringify(hashed({ v: 1, build_id: "105", surfaces: ["android"], related_scopes: ["feature:checkout"], fixes_claimed: [], registered_at: "2026-10-03T09:00:00.000Z", registered_by: "dana", version: null, source: null })));
    check(t("F2 a new build delivered for the scope makes it outdated"), g.readQaReadiness(artifactIn(delivered, "feature/checkout.md")).freshness.status === "outdated");

    const related = qaCopy();
    appendEvent(related, "scopes/bug/BUG-40.jsonl", { kind: "bug.reported", related_scopes: ["feature:checkout"], title: "Coupon lost" });
    check(t("F2 a new bug filed against the scope makes it outdated"), g.readQaReadiness(artifactIn(related, "feature/checkout.md")).freshness.status === "outdated");

    const unrelated = qaCopy();
    appendEvent(unrelated, "scopes/feature/wallet.jsonl", { kind: "scope.created", scope: "feature:wallet", title: null });
    appendEvent(unrelated, "scopes/bug/BUG-28.jsonl", { kind: "context.set", field: "assignee", value: "omer" });
    writeFileSync(join(unrelated, "qa-ledger", "builds", "ios-1.json"), JSON.stringify(hashed({ v: 1, build_id: "ios-1", surfaces: ["ios"], related_scopes: [], fixes_claimed: [], registered_at: "2026-10-03T09:00:00.000Z", registered_by: "dana", version: null, source: null })));
    appendEvent(unrelated, "scopes/bug/BUG-27.jsonl", { kind: "context.add", field: "signoffs", value: { id: "SO-2", verdict: "READY", fingerprint: "sha256:x", notes: null, signed_by: "lead" } });
    writeFileSync(join(unrelated, "readiness", "bug", "BUG-27.md"), BUG);
    const survived = ["feature/checkout.md", "bug/BUG-27.md", "release/2.4.0.md"].map((rel) => g.readQaReadiness(artifactIn(unrelated, rel)).freshness.status);
    check(t("F3 freshness survives unrelated QA changes (other scopes, bugs, builds, sign-offs, re-renders)"), survived.every((x: string) => x === "fresh"), survived.join(","));

    const tampered = qaCopy();
    const f = join(tampered, "qa-ledger", "scopes", "bug", "BUG-27.jsonl");
    writeFileSync(f, readFileSync(f, "utf-8").replace('"severity":"major"', '"severity":"minor"'));
    check(t("F4 a ledger edited outside the QA helper is unverifiable — No-Go"), codes(runFiles(g, [artifactIn(tampered, "bug/BUG-27.md")], [], ["BUG-27"])).includes("QA_FRESHNESS_UNVERIFIABLE"));
    const lost = qaCopy();
    cpSync(join(lost, "readiness"), join(lost, "..", "elsewhere", "readiness"), { recursive: true });
    check(t("F4 an artifact with no QA ledger beside it is unverifiable — No-Go"), codes(runFiles(g, [join(lost, "..", "elsewhere", "readiness", "bug", "BUG-27.md")], [], ["BUG-27"])).includes("QA_FRESHNESS_UNVERIFIABLE"));
    const moved = join(lost, "..", "BUG-27.md");
    writeFileSync(moved, BUG);
    check(t("F4 an artifact outside <qa-repo>/readiness/<kind>/ is unverifiable — the gate never searches for a ledger"), g.readQaReadiness(moved).freshness.status === "unverifiable");
    check(t("F4 an in-memory artifact with no QA repository is unverifiable"), g.parseQaReadiness(BUG, "b.md").freshness.status === "unverifiable");
    const forged = BUG.replace(/freshness_token: sha256:[0-9a-f]{64}/, `freshness_token: sha256:${"1".repeat(64)}`);
    check(t("F5 an artifact whose token was edited (and re-sealed) is outdated"), codes(run(g, [["b.md", forged]], [], ["BUG-27"])).includes("QA_READINESS_OUTDATED"));
    check(t("F5 …and, left unsealed, is tampered"), codes(runRaw(g, [["b.md", forged]], [], ["BUG-27"])).includes("QA_ARTIFACT_TAMPERED"));
  }

  /* ── A: artifact integrity (tamper evidence of the rendered Markdown) ── */
  {
    const tampered = (r: any) => r.status === "no_go" && codes(r).includes("QA_ARTIFACT_TAMPERED");
    const all = ["feature/checkout.md", "bug/BUG-27.md", "bug/BUG-28.md", "release/2.4.0.md"];
    const texts = all.map((rel) => readFileSync(join(FIX, rel), "utf-8"));
    check(t("A14 feature, bug and release artifacts each carry exactly one artifact_integrity"), texts.every((x) => (x.slice(0, x.indexOf("\n---\n", 4)).match(/^artifact_integrity: sha256:[0-9a-f]{64}$/gm) ?? []).length === 1));
    check(t("A1/A14 every untouched QA-rendered artifact verifies"), all.every((rel) => g.readQaReadiness(join(FIX, rel)).ok));
    const ok = runFiles(g, [join(FIX, "release", "2.4.0.md")], ["checkout"], ["BUG-27"], BUILDS);
    check(t("A1 a fresh, untouched artifact passes both integrity and freshness"), ok.status === "pass_with_exceptions" && ok.artifacts[0].freshness === "fresh", JSON.stringify(ok.blockers));
    check(t("A2 READY → NOT_READY without re-hashing is tampered"), tampered(runRaw(g, [["b.md", BUG.replace("verdict: READY", "verdict: NOT_READY").replace("blocker_count: 0", "blocker_count: 1")]], [], ["BUG-27"])));
    const promoted = BUG28.replace("verdict: NOT_READY", "verdict: READY").replace(/blocker_count: \d+/, "blocker_count: 0").replace("- QA verdict: NOT_READY", "- QA verdict: READY");
    check(t("A3 NOT_READY → READY is tampered"), tampered(runRaw(g, [["b.md", promoted]], [], ["BUG-28"])));
    check(t("A4 editing an exception is tampered"), tampered(runRaw(g, [["f.md", FEATURE.replace("| waived_debt | Scheduled after launch: HV-", "| known_issue | Scheduled after launch: HV-")]], ["checkout"])));
    check(t("A5 editing known issues is tampered"), tampered(runRaw(g, [["f.md", FEATURE.replace("## Known Issues\n\nNone.", "## Known Issues\n\n| Item | Reason | Approved by |\n|---|---|---|\n| R4:bug:BUG-3 | Cosmetic | lead |")]], ["checkout"])));
    check(t("A6 editing Release Notes Input is tampered"), tampered(runRaw(g, [["b.md", BUG.replace(/- Bug fixes verified: .*/, "- Bug fixes verified: bug:BUG-27 (fixed in atv-105)")]], [], ["BUG-27"])));
    check(t("A7 editing tested builds is tampered"), tampered(runRaw(g, [["b.md", BUG.replace("## Tested Builds\n\n", "## Tested Builds\n\n- atv-105\n")]], [], ["BUG-27"])));
    check(t("A8 editing QA notes is tampered"), tampered(runRaw(g, [["f.md", FEATURE.replace("Checked on Pixel 8", "Checked on every device")]], ["checkout"])));
    check(t("A8 editing release members is tampered"), tampered(runRaw(g, [["r.md", RELEASE.replace("| bug:BUG-27 | bug | — | BUG-27 | JIRA-4411 |", "| bug:BUG-27 | bug | — | BUG-27 | JIRA-9999 |")]], ["checkout"], ["external=JIRA-9999"])));
    check(t("A8 editing a candidate build is tampered"), tampered(runRaw(g, [["b.md", BUG.replace("  - android-tv: atv-104", "  - android-tv: atv-105")]], [], ["BUG-27"], { "android-tv": "atv-105" })));
    check(t("A8 replacing the stored hash is tampered"), tampered(runRaw(g, [["b.md", BUG.replace(/artifact_integrity: sha256:[0-9a-f]{64}/, `artifact_integrity: sha256:${"0".repeat(64)}`)]], [], ["BUG-27"])));
    const resealed = sealOf(BUG.replace(/- Bug fixes verified: .*/, "- Bug fixes verified: bug:BUG-27 (fixed in atv-104)"));
    check(t("A9 an artifact carrying the contract hash of its exact content verifies — the gate's hash is the contract's"), g.parseQaReadiness(resealed, "b.md", { qaRoot: QA_ROOT }).ok && sealOf(BUG) === BUG);
    check(t("A10 integrity is a pure function of the bytes"), JSON.stringify(g.artifactIntegrity(BUG)) === JSON.stringify(g.artifactIntegrity(BUG)) && g.artifactIntegrity(BUG).computed === g.artifactIntegrity(BUG).stored);
    check(t("A10 …and line-ending conversion is not tampering"), g.parseQaReadiness(BUG.replace(/\n/g, "\r\n"), "b.md", { qaRoot: QA_ROOT }).ok);
    const noField = BUG.replace(/\nartifact_integrity: .*/, "");
    const twice = BUG.replace(/\n(artifact_integrity: .*)/, "\n$1\n$1");
    check(t("A10 an artifact without artifact_integrity, or with two, is refused"), codes(runRaw(g, [["b.md", noField]], [], ["BUG-27"])).includes("QA_READINESS_MALFORMED") && codes(runRaw(g, [["b.md", twice]], [], ["BUG-27"])).includes("QA_READINESS_MALFORMED"));
    check(t("A13 integrity is checked before any content is trusted"), tampered(runRaw(g, [["b.md", BUG.replace("verdict: READY", "verdict: MOSTLY_READY")]], [], ["BUG-27"])) && !codes(runRaw(g, [["b.md", BUG.replace("verdict: READY", "verdict: MOSTLY_READY")]], [], ["BUG-27"])).includes("QA_READINESS_MALFORMED"));

    const stale = qaCopy();
    appendEvent(stale, "scopes/bug/BUG-27.jsonl", { kind: "context.set", field: "assignee", value: "omer" });
    const s12 = runFiles(g, [artifactIn(stale, "bug/BUG-27.md")], [], ["BUG-27"]);
    check(t("A11/A12 a valid artifact over a changed ledger fails freshness, not integrity"), codes(s12).includes("QA_READINESS_OUTDATED") && !codes(s12).includes("QA_ARTIFACT_TAMPERED"));
    const edited = qaCopy();
    const f = artifactIn(edited, "bug/BUG-27.md");
    writeFileSync(f, readFileSync(f, "utf-8").replace("- atv-103\n", "- atv-102\n"));
    const s13 = runFiles(g, [f], [], ["BUG-27"]);
    check(t("A13 a tampered artifact over a fresh ledger fails integrity, not freshness"), tampered(s13) && !codes(s13).includes("QA_READINESS_OUTDATED") && s13.coverage.bugs[0].covered_by === null, JSON.stringify(s13.blockers));
    const both = qaCopy();
    appendEvent(both, "scopes/bug/BUG-27.jsonl", { kind: "context.set", field: "assignee", value: "omer" });
    const g2 = artifactIn(both, "bug/BUG-27.md");
    writeFileSync(g2, readFileSync(g2, "utf-8").replace("verdict: READY", "verdict: NOT_READY"));
    check(t("A11 both checks are independent: a tampered artifact is never trusted enough to judge its freshness"), codes(runFiles(g, [g2], [], ["BUG-27"])).includes("QA_ARTIFACT_TAMPERED"));
  }
}
gateSuite(gate);

/* ── the CLI ──────────────────────────────────────────────────────────── */
{
  const r = spawnSync(process.execPath, ["--no-warnings", GATE, "--readiness", join(FIX, "bug", "BUG-27.md"), "--bug", "external=JIRA-4411", "--release-build", "android-tv=atv-104"], { encoding: "utf-8" });
  let out: any = null;
  try {
    out = JSON.parse(r.stdout);
  } catch {
    /* reported below */
  }
  check("CLI always prints one JSON object and exits 0", r.status === 0 && out !== null, r.stderr);
  check("CLI evaluates the same gate, with freshness from the artifact's own QA repository", out?.status === "pass" && out?.coverage?.bugs?.[0]?.covered_by?.endsWith("BUG-27.md") && out?.artifacts?.[0]?.freshness === "fresh", r.stdout.slice(0, 600));
  const r2 = spawnSync(process.execPath, ["--no-warnings", GATE, "--bug", "BUG-27"], { encoding: "utf-8" });
  check("CLI with no readiness is a deterministic No-Go, not a crash", r2.status === 0 && JSON.parse(r2.stdout).status === "no_go");
  const r3 = spawnSync(process.execPath, ["--no-warnings", GATE, "--readiness", join(FIX, "bug", "BUG-27.md")], { encoding: "utf-8" });
  check("CLI with no release contents is a No-Go that asks for them", JSON.parse(r3.stdout).blockers.some((b: any) => b.code === "RELEASE_CONTENTS_REQUIRED"));
  const src = readFileSync(GATE, "utf-8");
  check("22/23 the gate reads only the files it is given — no search of sibling repos", !/ono-plugin-qa\/|ono-plugin-project-inspector|\.\.\/\.\.|homedir|process\.cwd/.test(src));
  // The one directory listing is the freshness verifier's, inside <qa-repo>/qa-ledger/ only.
  check("22/23 …the only directory listing is inside the artifact's own qa-ledger/", src.split("readdirSync(").length - 1 === 1 && /const dir = join\(ledger, \.\.\.d\);\n\s+return existsSync\(dir\) \? readdirSync\(dir\)/.test(src) && /const ledger = join\(qaRoot, "qa-ledger"\);/.test(src));
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
  // sha256 of ono-plugin-qa docs/qa-readiness-contract.md, qa_readiness_schema 2 (release
  // artifact, bug identity, freshness token, artifact integrity). When QA changes the contract, update the copy,
  // this pin and the reader in the same release.
  const QA_SCHEMA2_CONTRACT_SHA256 = "4efe2c775d0c29bbb6d3148b0432dd55c17cf3251f8c38d86556558aab694d6c";
  const contract = read("docs/qa-readiness-contract.md");
  check("21 the QA readiness contract copy is byte-identical to the QA plugin's", createHash("sha256").update(contract).digest("hex") === QA_SCHEMA2_CONTRACT_SHA256);
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
    ["a malformed artifact blocks", 'for (const f of failed.filter((x) => x.code !== "QA_READINESS_MISSING" && x.code !== "QA_ARTIFACT_TAMPERED")) block("QA_READINESS_MALFORMED"', 'for (const f of []) block("QA_READINESS_MALFORMED"'],
    ["an uncovered item blocks", 'if (!hits.length) block("QA_NOT_COVERED", `${item} is in the release but no supplied QA readiness covers it`, { item }); // invariant:coverage', "// invariant:coverage"],
    ["identity is matched exactly", "const same = (x: string | null, y: string) => x === y;", "const same = (x: string | null, y: string) => (x ?? \"\").toLowerCase() === y.toLowerCase();"],
    ["a build mismatch blocks", 'block("QA_BUILD_MISMATCH"', 'void ("QA_BUILD_MISMATCH"'],
    ["READY_WITH_EXCEPTIONS is not READY", 'const status = blockers.length ? "no_go" : usedList.some((a) => a.verdict === "READY_WITH_EXCEPTIONS") ? "pass_with_exceptions" : "pass";', 'const status = blockers.length ? "no_go" : "pass";'],
    ["missing readiness blocks", 'if (!artifacts.length) block("QA_READINESS_MISSING"', 'if (false) block("QA_READINESS_MISSING"'],
    // Stage 7 follow-up: release artifact, bug identity, freshness.
    ["a release artifact covers through its members", 'a.kind === "release" ? a.members.map(', "false ? a.members.map("],
    ["a release artifact's members must be exactly the release", "if (![...hitUnits].some((h) => h.a === r && h.scope === u.scope)) block(", "if (false) block("],
    ["an item with neither id is invalid", "if (!b || (b.qa_bug_id === null && b.external_ref === null)) {", "if (false) {"],
    ["both ids must name the same bug", "const hits = byQa && byExt ? byQa.filter((u) => byExt.includes(u)) : (byQa ?? byExt)!;", "const hits = (byQa ?? byExt)!;"],
    ["an ambiguous match fails", 'if (scopes.size > 1) block("QA_AMBIGUOUS_MATCH"', 'if (false) block("QA_AMBIGUOUS_MATCH"'],
    ["an outdated artifact blocks", 'if (a.freshness.status === "outdated") block(', "if (false) block("],
    ["an unverifiable artifact blocks", 'else if (a.freshness.status === "unverifiable") block(', "else if (false) block("],
    ["the recomputed token is compared", 'status: computed === recorded ? "fresh" : "outdated"', 'status: "fresh"'],
    ["every ledger record hash is re-verified", 'if (typeof hash !== "string" || hash !== sha(canonical(rest))) throw', "if (false) throw"],
    ["freshness ignores sign-off events", 'records.filter((r) => r.field !== "signoffs").map((r) => r.hash);', "records.map((r) => r.hash);"],
    ["freshness watches bugs filed against the scope", '.some((r) => (r.kind === "bug.reported"', '.some((r) => false && (r.kind === "bug.reported"'],
    ["freshness watches the scope's own runs", "db.runs.filter((run) => watched.has(header(run).scope) || bugs.has(header(run).bug_ref));", "db.runs.filter((run) => false);"],
    ["freshness watches builds delivered for the scope", "if ((b.related_scopes ?? []).includes(ref) || (b.fixes_claimed ?? []).some((x: string) => bugs.has(x))) builds.add(id);", "if (false) builds.add(id);"],
    ["freshness covers plan content", "plans: [...plans].sort().map((p) => [p, db.plan(p)]),", 'plans: [...plans].sort().map((p) => [p, "missing"]),'],
    ["a release token covers its members' tokens", "members: members.map((m) => [m, scopeToken(db, m)])", "members"],
    // Artifact integrity.
    ["a content edit is detected", "if (integrity.computed !== integrity.stored) return", "if (false) return"],
    ["a tampered artifact is reported as tampered", 'for (const f of failed.filter((x) => x.code === "QA_ARTIFACT_TAMPERED")) block(', "for (const f of []) block("],
    ["only CRLF is normalized", "const t = text.replace(", "const t = text; void ("],
    ["only the integrity line is excluded", "${rest.join(", "${lines.join("],
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
    try {
      gateSuite(mutant, "mutant: ");
    } catch {
      failures++; // a mutant that crashes the gate is caught too
    }
    console.log = quiet;
    const caught = failures > before;
    failures = before;
    check(`mutant killed: ${name}`, caught);
  }
  check("mutation harness wrote no file into the repository", !existsSync(join(HERE, "qa-release-gate.mutant.ts")));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
