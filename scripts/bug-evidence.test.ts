/**
 * bug-evidence.test.ts
 *
 * Pins Bug Flow P1.5: one canonical Bug Evidence Snapshot per bug,
 * docs/bugs/<bug_key>/bug-report.json. /analyze-bug normalizes the source once (QA ledger,
 * JSON report, a document's extraction) through bug-intake's own normalization and persists
 * the stable evidence with its provenance. Every later Bug Flow helper resolves it by default,
 * so --report / --qa-repo are not repeated; QA's live state is still read live when the QA
 * repository can be found, and degrades to partial context when it cannot. A new source is
 * compared semantically and never overwrites the snapshot unless the plan already reconciled
 * to it. Feature work is untouched.
 *
 *   node --no-warnings scripts/bug-evidence.test.ts
 */

import { execFileSync } from "child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname, basename } from "path";
import * as BE from "./bug-evidence.ts";
import * as AB from "./analyze-bug.ts";
import { lookupQaBug, evidenceFingerprint } from "./bug-intake.ts";
import { approveWorkPackage } from "./work-approval.ts";
import { bugGate } from "./bug-implementation.ts";
import { reviewContext } from "./bug-review.ts";
import { handoffCheck } from "./qa-handoff-gate.ts";
import { generateVerification } from "./bug-verification.ts";
import { writeTaskState } from "./task-state.ts";
import { PLUGIN_NAME } from "./next-command.ts";
import { canonical } from "./qa-release-gate.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const QA_FIXTURE = join(HERE, "fixtures/qa-bugs/acme-qa");
const api = BE as any;
const ab = AB as any;

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

const EVIDENCE = { title: "Checkout total ignores coupon", steps: ["Add an item to the cart", "Apply coupon SAVE10", "Open checkout"], expected: "Total shows the 10% discount", actual: "Total shows the full price", surfaces: ["android"], found_in_build: "and-201" };
const REPRO = "The reported reproduction path no longer fails: with SAVE10 applied, checkout shows the discounted total";
const PLAN_QA = readFileSync(join(HERE, "fixtures/bug-work-plans/bwp-cycle1.md"), "utf-8").replace("| T1 | S | T1's test passes; existing totals tests pass |", `| T1 | S | ${REPRO}; T1's test passes |`);
const PLAN_EXT = PLAN_QA.replace("# Bug Work Plan — BUG-43:", "# Bug Work Plan — PAY-1182:").replace("bug_key: BUG-43", "bug_key: PAY-1182").replace("qa_bug_id: BUG-43", "qa_bug_id: null").replace("origin: qa-standalone", "origin: external").replace("related_feature: checkout-coupons", "related_feature: null");
const MAIN = "app/src/main/java/com/acme/checkout/CheckoutTotals.kt";
const TEST = "app/src/test/java/com/acme/checkout/CheckoutTotalsTest.kt";
const CMD = "./gradlew test --tests CheckoutTotalsTest";

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "bug-evidence-")));
let n = 0;
/** A repository with a sibling QA repository, so the snapshot's QA hint is a portable relative path. */
function workspace(): { root: string; qa: string } {
  const ws = join(TMP, `ws-${++n}`);
  const root = join(ws, "app-repo");
  const qa = join(ws, "acme-qa");
  mkdirSync(root, { recursive: true });
  cpSync(QA_FIXTURE, qa, { recursive: true });
  git(root, "init", "-q", "-b", "fix/bug");
  return { root, qa };
}
function report(content: Record<string, unknown>, raw?: string): string {
  const p = join(TMP, `report-${++n}.json`);
  writeFileSync(p, raw ?? JSON.stringify(content));
  return p;
}
/** A repository with an approved plan, as /analyze-bug leaves it, and a canonical snapshot persisted. */
function planned(kind: "qa" | "ext"): { root: string; qa: string; work: string; plan: string; key: string } {
  const w = workspace();
  const key = kind === "qa" ? "BUG-43" : "PAY-1182";
  const plan = join(w.root, `docs/bugs/${key}/bug-work-plan.md`);
  mkdirSync(dirname(plan), { recursive: true });
  for (const f of [MAIN, TEST]) {
    mkdirSync(join(w.root, dirname(f)), { recursive: true });
    writeFileSync(join(w.root, f), "// v0\n");
  }
  writeFileSync(plan, kind === "qa" ? PLAN_QA : PLAN_EXT);
  approveWorkPackage(plan, { by: "dana" });
  git(w.root, "config", "user.email", "t@t");
  git(w.root, "config", "user.name", "t");
  git(w.root, "add", "-A");
  git(w.root, "commit", "-qm", "plan");
  const p = kind === "qa" ? ab.persistEvidence?.({ root: w.root, ref: "BUG-43", qaRepo: w.qa }) : ab.persistEvidence?.({ root: w.root, external: "PAY-1182", report: report(EVIDENCE) });
  if (!p?.ok) throw new Error(`persist fixture: ${JSON.stringify(p)}`);
  return { ...w, work: `bug:${key}`, plan, key };
}
const snapPath = (root: string, key: string) => join(root, `docs/bugs/${key}/bug-report.json`);
const snap = (root: string, key: string) => JSON.parse(readFileSync(snapPath(root, key), "utf-8"));

try {
  /* ── 1–6. the first /analyze-bug creates the snapshot ─────────────────── */
  {
    const w = workspace();
    const s = ab.startBug({ root: w.root, ref: "BUG-43", qaRepo: w.qa });
    check("start stays read-only: no snapshot before it is persisted", s.outcome === "BUG_PLAN_NEW" && !existsSync(snapPath(w.root, "BUG-43")) && s.evidence_snapshot?.status === "missing", JSON.stringify(s.evidence_snapshot));
    const p = ab.persistEvidence?.({ root: w.root, ref: "BUG-43", qaRepo: w.qa });
    check("1 the first analyze of a QA bug creates the snapshot", p?.ok === true && p.outcome === "CREATED" && p.changed === true && existsSync(snapPath(w.root, "BUG-43")), JSON.stringify(p));
    const j = snap(w.root, "BUG-43");
    const live = lookupQaBug(w.qa, "BUG-43");
    check("4 it holds the canonical evidence", j.evidence.title === live.evidence.title && JSON.stringify(j.evidence.steps) === JSON.stringify(live.evidence.steps) && j.evidence.expected === live.evidence.expected && j.evidence.actual === live.evidence.actual);
    check("4 …and the identity", j.bug_key === "BUG-43" && j.identity.qa_bug_id === "BUG-43" && j.identity.external_ref === "PAY-1182" && j.identity.origin === "qa-standalone" && j.identity.found_in_build === "and-201" && JSON.stringify(j.identity.surfaces) === '["android"]' && j.identity.related_feature === "checkout-coupons");
    check("5 it records the authoritative bug_evidence_fingerprint", j.bug_evidence_fingerprint === live.bug_evidence_fingerprint);
    check("6 provenance: a QA ledger, by repository-relative reference, with the source bytes' hash", j.provenance.source_type === "qa-ledger" && j.provenance.source_ref === "qa-ledger/scopes/bug/BUG-43.jsonl" && j.provenance.source_fingerprint === `sha256:${sha(readFileSync(join(w.qa, "qa-ledger/scopes/bug/BUG-43.jsonl")))}` && j.provenance.qa_repo_hint === "../acme-qa", JSON.stringify(j.provenance));
    check("14 QA's live state is never frozen into the snapshot", !/assigned|qa_state|dev_may_start|reopened|fix_delivered|context_level/.test(JSON.stringify(j)));
    check("the snapshot is sealed over everything else in it", j.snapshot_fingerprint === `sha256:${sha(JSON.stringify(Object.fromEntries(Object.entries(j).filter(([k]) => k !== "snapshot_fingerprint")), Object.keys(j).sort()))}` || /^sha256:[0-9a-f]{64}$/.test(j.snapshot_fingerprint));
    check("no absolute local path is written into the snapshot", !JSON.stringify(j).includes(TMP));

    const ino = statSync(snapPath(w.root, "BUG-43")).ino;
    const again = ab.persistEvidence?.({ root: w.root, ref: "BUG-43", qaRepo: w.qa });
    check("7/28 the same evidence again is idempotent — not rewritten", again?.ok === true && again.outcome === "UNCHANGED" && again.changed === false && statSync(snapPath(w.root, "BUG-43")).ino === ino);
    const re = ab.startBug({ root: w.root, ref: "BUG-43" });
    check("12/13 /analyze-bug re-entry needs no --qa-repo once the snapshot exists", re.outcome === "BUG_PLAN_NEW" && re.evidence_snapshot?.status === "current", JSON.stringify([re.outcome, re.reason, re.evidence_snapshot]));
    check("14 …and still reads QA's state live through the recorded QA repository", re.intake?.context_level === "full" && re.intake?.qa_state === "assigned");
  }
  {
    const w = workspace();
    const rp = report(EVIDENCE);
    const p = ab.persistEvidence?.({ root: w.root, external: "PAY-1182", report: rp });
    const j = existsSync(snapPath(w.root, "PAY-1182")) ? snap(w.root, "PAY-1182") : {};
    check("2 the first analyze from a JSON report creates the snapshot", p?.outcome === "CREATED" && j.bug_key === "PAY-1182" && j.identity?.origin === "external");
    check("6 provenance: a JSON report, named but never by absolute path, with its bytes' hash", j.provenance?.source_type === "json-report" && j.provenance.source_ref === basename(rp) && j.provenance.source_fingerprint === `sha256:${sha(readFileSync(rp))}` && !("qa_repo_hint" in j.provenance), JSON.stringify(j.provenance));
    check("5 the fingerprint is bug-intake's own", j.bug_evidence_fingerprint === evidenceFingerprint(EVIDENCE));
    const start = ab.startBug({ root: w.root, external: "PAY-1182" });
    check("12 re-entry with --external needs no --report", start.outcome === "BUG_PLAN_NEW" && start.intake?.bug_evidence_fingerprint === j.bug_evidence_fingerprint, JSON.stringify([start.outcome, start.reason]));
    const dev = workspace();
    const dp = ab.persistEvidence?.({ root: dev.root, origin: "dev-review", report: report(EVIDENCE) });
    check("12 a Dev-discovered bug is re-entered by its key", dp?.ok === true && ab.startBug({ root: dev.root, ref: `bug:${dp.bug_key}` }).outcome === "BUG_PLAN_NEW", JSON.stringify(dp));
  }
  {
    const w = workspace();
    const doc = join(TMP, "YET-1052.docx");
    writeFileSync(doc, Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]));
    const p = ab.persistEvidence?.({ root: w.root, external: "YET-1052", report: report(EVIDENCE), sourceDocument: doc });
    const j = existsSync(snapPath(w.root, "YET-1052")) ? snap(w.root, "YET-1052") : {};
    check("3 a document's one-time extraction creates the snapshot", p?.outcome === "CREATED" && j.bug_key === "YET-1052");
    check("3/10 provenance names the document and hashes its original bytes — provenance only", j.provenance?.source_type === "document" && j.provenance.source_ref === "YET-1052.docx" && j.provenance.source_fingerprint === `sha256:${sha(readFileSync(doc))}` && j.bug_evidence_fingerprint === evidenceFingerprint(EVIDENCE));
    const missing = ab.persistEvidence?.({ root: workspace().root, external: "YET-9", report: report({ title: "x", steps: [] }), sourceDocument: doc });
    check("11 an extraction missing required evidence is never persisted", missing?.ok === false && missing.outcome === "BUG_INSUFFICIENT_EVIDENCE");
    check("manual structured evidence is a recognised source type", ab.persistEvidence?.({ root: workspace().root, external: "YET-7", report: report(EVIDENCE), sourceType: "manual" })?.ok === true);
  }

  /* ── 9, 16–23. semantic comparison ─────────────────────────────────────── */
  {
    const w = workspace();
    ab.persistEvidence?.({ root: w.root, external: "PAY-1182", report: report(EVIDENCE) });
    const reformatted = report({}, `{\r\n  "found_in_build": "and-201",\r\n  "actual": "  Total shows the full price  ",\r\n  "surfaces": ["android", "android"],\r\n  "expected": "Total shows the 10% discount\\r\\n",\r\n  "steps": ["Add an item to the cart", "", "Apply coupon SAVE10", "Open checkout  "],\r\n  "title": "Checkout total ignores coupon",\r\n  "exported_at": "2026-10-12T09:00:00Z"\r\n}\r\n`);
    const cmp = (rp: string, extra: Record<string, unknown> = {}) => ab.compareEvidence?.({ root: w.root, external: "PAY-1182", report: rp, ...extra });
    const same = cmp(reformatted);
    check("16 differently formatted input with the same semantics has the same fingerprint", same?.outcome === "SAME_EVIDENCE", JSON.stringify(same));
    check("17 different source bytes, same evidence: not drift, and the snapshot stays as it was", ab.persistEvidence?.({ root: w.root, external: "PAY-1182", report: reformatted })?.outcome === "UNCHANGED" && snap(w.root, "PAY-1182").provenance.source_fingerprint !== `sha256:${sha(readFileSync(reformatted))}`);
    for (const [num, field, change] of [
      ["18", "steps", { steps: ["Add an item to the cart", "Apply coupon SAVE20", "Open checkout"] }],
      ["19", "expected", { expected: "Total shows the 20% discount" }],
      ["20", "actual", { actual: "Checkout crashes" }],
      ["21", "surfaces", { surfaces: ["android", "android-tv"] }],
      ["22", "found_in_build", { found_in_build: "and-205" }],
    ] as const) {
      const c = cmp(report({ ...EVIDENCE, ...change }));
      check(`${num} a materially changed ${field} is NEW_EVIDENCE, naming it`, c?.outcome === "NEW_EVIDENCE" && JSON.stringify(c.changed) === JSON.stringify([field]), JSON.stringify(c));
    }
    const before = readFileSync(snapPath(w.root, "PAY-1182"));
    const plan = join(w.root, "docs/bugs/PAY-1182/bug-work-plan.md");
    writeFileSync(plan, PLAN_EXT);
    const refused = ab.persistEvidence?.({ root: w.root, external: "PAY-1182", report: report({ ...EVIDENCE, actual: "Checkout crashes" }) });
    check("7 new evidence under a plan that did not reconcile to it never overwrites the snapshot", refused?.ok === false && refused.outcome === "NEW_EVIDENCE" && readFileSync(snapPath(w.root, "PAY-1182")).equals(before), JSON.stringify(refused));
    const conflict = ab.compareEvidence?.({ root: w.root, external: "PAY-9999", report: report(EVIDENCE), key: "PAY-1182" });
    check("23 an identity conflict is rejected", conflict?.outcome === "IDENTITY_CONFLICT", JSON.stringify(conflict));
    check("an unreadable source is INVALID_SOURCE", cmp(join(TMP, "nope.json"))?.outcome === "INVALID_SOURCE");
  }

  /* ── 24–27. integrity and atomicity ───────────────────────────────────── */
  {
    const w = workspace();
    ab.persistEvidence?.({ root: w.root, external: "PAY-1182", report: report(EVIDENCE) });
    const p = snapPath(w.root, "PAY-1182");
    const good = readFileSync(p, "utf-8");
    check("a valid snapshot reads back valid", api.readSnapshot?.(w.root, "PAY-1182")?.status === "valid");
    const j = JSON.parse(good);
    const cases: Array<[string, string, string]> = [
      ["24 malformed JSON is rejected", "{ not json", "MALFORMED"],
      ["24 a missing required field is rejected", JSON.stringify({ ...j, evidence: { ...j.evidence, expected: "" } }), ""],
      ["24 another schema is rejected", JSON.stringify({ ...j, schema: "bug-evidence-snapshot/v9" }), ""],
      ["25 a tampered evidence fingerprint is rejected", JSON.stringify({ ...j, bug_evidence_fingerprint: `sha256:${"0".repeat(64)}` }), ""],
      ["25 tampered evidence under its old fingerprint is rejected", JSON.stringify({ ...j, evidence: { ...j.evidence, actual: "Checkout crashes" } }), ""],
      ["25 a tampered seal is rejected", JSON.stringify({ ...j, provenance: { ...j.provenance, source_ref: "other.json" } }), ""],
      ["23 a snapshot naming another bug is rejected", JSON.stringify({ ...j, bug_key: "PAY-9999" }), ""],
    ];
    for (const [name, content, code] of cases) {
      writeFileSync(p, content);
      const r = api.readSnapshot?.(w.root, "PAY-1182");
      check(name, r?.status === "invalid" && (code === "" || r.code === code), JSON.stringify(r));
    }
    // A forger who also recomputes the seal: each content check must still catch it on its own.
    const resealed = (o: Record<string, any>) => { const { snapshot_fingerprint: _, ...body } = o; return JSON.stringify({ ...body, snapshot_fingerprint: `sha256:${sha(canonical(body))}` }); };
    const forged: Array<[string, Record<string, any>, string]> = [
      ["23 a resealed snapshot of another bug, at this bug's path, is rejected", { ...j, bug_key: "PAY-9999", identity: { ...j.identity, external_ref: "PAY-9999" } }, "IDENTITY_MISMATCH"],
      ["23 a resealed snapshot whose identity derives another key is rejected", { ...j, identity: { ...j.identity, external_ref: "PAY-9999" } }, "IDENTITY_MISMATCH"],
      ["25 resealed evidence under its old fingerprint is rejected", { ...j, evidence: { ...j.evidence, actual: "Checkout crashes" } }, "FINGERPRINT_MISMATCH"],
    ];
    for (const [name, o, code] of forged) {
      writeFileSync(p, resealed(o));
      const r = api.readSnapshot?.(w.root, "PAY-1182");
      check(name, r?.status === "invalid" && r.code === code, JSON.stringify(r));
    }
    writeFileSync(p, good);
    check("26 an unsafe bug key is refused", api.snapshotPath?.("../x") === null && api.readSnapshot?.(w.root, "../x")?.status === "invalid");
    rmSync(p);
    mkdirSync(p);
    const wf = ab.persistEvidence?.({ root: w.root, external: "PAY-1182", report: report(EVIDENCE) });
    const left = readdirSync(dirname(p)).filter((f) => f.endsWith(".tmp"));
    check("27 a failed write leaves no partial file behind", wf?.ok === false && /WRITE_FAILED/.test(JSON.stringify(wf)) && left.length === 0, JSON.stringify([wf, left]));
  }

  /* ── 8–15. downstream commands resolve it ─────────────────────────────── */
  {
    const r = planned("ext");
    const g = bugGate({ root: r.root, work: r.work, task: "T1" });
    check("8 /implement-task resolves the snapshot: no --report", g.ok === true && g.outcome === "BUG_READY" && g.evidence_source === "snapshot", JSON.stringify([g.outcome, g.reason, g.evidence_source]));
    check("17 an explicit source with different bytes and the same evidence is not drift", bugGate({ root: r.root, work: r.work, task: "T1", report: report({}, JSON.stringify({ ...EVIDENCE, title: " Checkout total ignores coupon " })) }).outcome === "BUG_READY");
    const changed = bugGate({ root: r.root, work: r.work, task: "T1", report: report({ ...EVIDENCE, actual: "Checkout crashes" }) });
    check("7/30 an explicit new source flows into the existing stale/replan rule", changed.outcome === "BUG_EVIDENCE_STALE" && changed.drift.includes("bug_evidence_fingerprint"), JSON.stringify([changed.outcome, changed.drift]));
    const sp = snapPath(r.root, r.key);
    const good = readFileSync(sp);
    writeFileSync(sp, "{ broken");
    const inv = bugGate({ root: r.root, work: r.work, task: "T1" });
    check("24 an invalid snapshot is refused, never trusted", inv.ok === false && inv.outcome === "BUG_EVIDENCE_SNAPSHOT_INVALID" && /analyze-bug/.test(inv.route ?? ""), JSON.stringify([inv.outcome, inv.reason]));
    writeFileSync(sp, good);
    rmSync(sp);
    check("no snapshot: the source is asked for, as before", bugGate({ root: r.root, work: r.work, task: "T1" }).outcome === "BUG_EVIDENCE_SOURCE_REQUIRED");
    writeFileSync(sp, good);
  }
  {
    const r = planned("qa");
    const g = bugGate({ root: r.root, work: r.work, task: "T1" });
    check("13 /implement-task needs no --qa-repo: QA state is read live through the recorded QA repository", g.ok === true && g.evidence_source === "qa-live" && g.context_level === "full", JSON.stringify([g.outcome, g.reason, g.evidence_source, g.context_level]));
    renameSync(r.qa, `${r.qa}-moved`);
    const p = bugGate({ root: r.root, work: r.work, task: "T1" });
    check("15 QA repository unavailable: the snapshot's evidence, partial context, no QA state invented", p.ok === true && p.evidence_source === "snapshot" && p.context_level === "partial" && (p.warnings ?? []).some((x: any) => x.code === "QA_STATE_UNAVAILABLE"), JSON.stringify([p.outcome, p.reason, p.evidence_source, p.context_level]));
    renameSync(`${r.qa}-moved`, r.qa);
    const hk = handoffCheck({ root: r.root, work: r.work });
    check("11 the QA handoff gate resolves the evidence itself (R2)", hk.checks.find((c: any) => c.id === "R2")?.status === "pass", JSON.stringify(hk.checks.find((c: any) => c.id === "R2")));
    writeTaskState(r.root, r.work, "T1", "in-progress", { platform: "android" } as any, r.plan, { mode: "start" });
    writeTaskState(r.root, r.work, "T1", "complete", { platform: "android", filesChanged: [TEST], validation: [{ command: CMD, result: "pass" }], acceptanceCriteria: [{ criterion: "The test fails on the current code for the documented reproduction", met: true }], developerTesting: { framework: "junit", required: true, testsChanged: [TEST], justification: null, runs: [{ command: CMD, result: "pass" }], notRunReason: null } } as any, r.plan);
    writeTaskState(r.root, r.work, "T2", "in-progress", { platform: "android" } as any, r.plan, { mode: "start" });
    writeTaskState(r.root, r.work, "T2", "complete", { platform: "android", filesChanged: [MAIN], validation: [{ command: CMD, result: "pass" }], acceptanceCriteria: [{ criterion: REPRO, met: true }, { criterion: "T1's test passes", met: true }], developerTesting: { framework: "junit", required: true, testsChanged: [TEST], justification: null, runs: [{ command: CMD, result: "pass" }], notRunReason: null, regression: { command: CMD, failedBefore: true, passesAfter: true } } } as any, r.plan);
    const gv = generateVerification({ root: r.root, work: r.work });
    check("9 /verify-fix-cycle needs no evidence source", gv.ok === true, JSON.stringify(gv));
    const rv = reviewContext({ root: r.root, work: r.work });
    check("10 /review-code --bug resolves the snapshot as its evidence (shown, not re-read from the source)", rv.evidence_snapshot?.status === "current" && rv.evidence_snapshot.title === "Checkout total ignores coupon" || rv.outcome === "BUG_VERIFICATION_REQUIRED" && rv.evidence_snapshot?.status === "current", JSON.stringify([rv.outcome, rv.evidence_snapshot]));
    check("31 persisting evidence never touches the plan or its cycles", readFileSync(r.plan, "utf-8").includes("fix_cycle: 1") && !readFileSync(r.plan, "utf-8").replace(/<!--[\s\S]*?-->/g, "").includes("### Cycle 2"));
  }

  /* ── 29–31. reopened bugs ──────────────────────────────────────────────── */
  {
    const w = workspace();
    const delivered = lookupQaBug(join(HERE, "fixtures/qa-bugs/acme-qa-c2-delivered"), "BUG-44");
    const reopened = lookupQaBug(join(HERE, "fixtures/qa-bugs/acme-qa-c2-reopened"), "BUG-44");
    const changed = lookupQaBug(join(HERE, "fixtures/qa-bugs/acme-qa-reopened-changed"), "BUG-44");
    const src = { source_type: "qa-ledger", source_ref: "qa-ledger/scopes/bug/BUG-44.jsonl", source_fingerprint: null };
    const a = api.saveSnapshot?.(w.root, delivered, src, { plan: "none" });
    const ino = existsSync(snapPath(w.root, "BUG-44")) ? statSync(snapPath(w.root, "BUG-44")).ino : -1;
    const b = api.saveSnapshot?.(w.root, reopened, src, { plan: "unreconciled" });
    check("29 a QA reopen with unchanged evidence does not rewrite the snapshot", a?.outcome === "CREATED" && b?.outcome === "UNCHANGED" && statSync(snapPath(w.root, "BUG-44")).ino === ino, JSON.stringify([a, b]));
    const c = api.saveSnapshot?.(w.root, changed, src, { plan: "unreconciled" });
    check("30 changed QA evidence is NEW_EVIDENCE and waits for the plan's reconciliation", c?.ok === false && c.outcome === "NEW_EVIDENCE" && c.changed.includes("title"), JSON.stringify(c));
    const d = api.saveSnapshot?.(w.root, changed, src, { plan: "reconciled" });
    check("30 once the plan reconciled to it (a regenerated draft or an appended cycle), the snapshot follows", d?.ok === true && d.outcome === "REPLACED" && snap(w.root, "BUG-44").bug_evidence_fingerprint === changed.bug_evidence_fingerprint && snap(w.root, "BUG-44").bug_key === "BUG-44");
  }

  /* ── 32–41. boundaries ────────────────────────────────────────────────── */
  {
    const feature = ["commands/analyze-feature.md", "commands/dev-design-start.md", "commands/dev-feature-start.md", "scripts/task-state.ts", "scripts/task-resume.ts", "scripts/read-repo-knowledge.ts"];
    check("32 no Feature command or shared store depends on the bug snapshot", feature.every((f) => !/bug-report\.json|bug-evidence\.ts/.test(read(f))));
    const it = read("commands/implement-task.md");
    check("32 /implement-task's feature sections are unchanged by it", !/bug-report\.json|bug-evidence\.ts/.test(it.slice(it.indexOf("\n## 2. "))));
    const src = read("scripts/bug-evidence.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("39 no Jira integration: no network and no tracker client", !/jira|https?:\/\/|fetch\(|require\(["']https?/i.test(src));
    check("40 no commit", !/["'](commit|push)["']/.test(src));
    check("the helper reads no clock", !/\bnew Date\b|\bDate\.now\b|\bMath\.random\b/.test(src));
    const PINS: Record<string, string> = {
      "hooks/require-approval-before-code.sh": "f518c0e554ef7c660b16504cd44eb4e5065b1520b4f519c4e34169a743b77bd2",
      "scripts/edit-approval.ts": "f43451852dc4f4639a659fff6250765c23c1474e089d5cec049859d50ff7382b",
      "agents/feature-implementer.md": "d53845b5e31d2487754747f89227b0a54fa9d1ed457ae02934b593cce7576023",
    };
    for (const [f, h] of Object.entries(PINS)) check(`37 ${f} is unchanged`, sha(readFileSync(join(REPO_ROOT, f))) === h);
    const r = planned("ext");
    const st = ab.startBug({ root: r.root, external: "PAY-1182" });
    check("35/18 the chained next command carries no evidence-source argument", JSON.stringify(st.next_command) === JSON.stringify({ skill: `${PLUGIN_NAME}:implement-task`, args: "bug:PAY-1182 T1", display: "/implement-task bug:PAY-1182 T1" }), JSON.stringify(st.next_command));
    check("35 …and no note asks for one", !/--report|--qa-repo/.test(st.next_action_note ?? ""));
    const bug = it.slice(it.indexOf("## 1a. Bug work")).split("\n## 2. ")[0];
    check("17 /implement-task: the evidence comes from the snapshot; a source flag is only an override", /docs\/bugs\/<bug_key>\/bug-report\.json/.test(bug) && /override/i.test(bug) && !/When it is missing, ask once; never search for or guess it\./.test(bug));
    check("17 /implement-task shows one line, not a request", bug.includes("✓ Bug evidence current"));
    const abm = read("commands/analyze-bug.md");
    check("17 /analyze-bug shows the evidence lines and persists once", ["✓ Bug evidence loaded", "✓ Canonical evidence saved", "✓ Evidence fingerprint: current"].every((l) => abm.includes(l)) && /scripts\/analyze-bug\.ts" persist-evidence/.test(abm));
    check("11 a document is extracted once, asked about once, never reopened later", /extract[^.]*once/i.test(abm) && /--source-document/.test(abm) && /never (reopen|re-read|re-extract)/i.test(abm));
    check("the downstream commands no longer ask for the source by default", ["commands/create-dev-qa-notes.md", "commands/verify-fix-cycle.md"].every((f) => !/When it is missing, ask once; never guess it\./.test(read(f))) && read("commands/create-dev-qa-notes.md").includes("bug-report.json"));
    check("22 the contract documents the source model and the privacy decision", /## Bug evidence snapshot/.test(read("docs/bug-work-plan-contract.md")) && /committed/i.test(read("docs/bug-work-plan-contract.md")) && /adapter/i.test(read("docs/bug-work-plan-contract.md")));
    check("the suite is registered", read("scripts/check.ts").includes('"bug-evidence"'));
    for (const sib of ["ono-plugin-qa", "ono-plugin-project-inspector"]) {
      const d = join(dirname(REPO_ROOT), sib);
      check(`33/34 ${sib} has no changes`, !existsSync(d) || git(d, "status", "--porcelain") === "");
    }
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall bug-evidence checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
