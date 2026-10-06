/**
 * work-approval.test.ts
 *
 * Pins Bug Development Flow Step 3: content-bound approval of a Bug Work Plan. The approval
 * fingerprint binds the plan's body, the text above its frontmatter, and the bug identity and
 * evidence fields implementation trusts; any edit to them — or a new fix cycle — leaves the
 * approval stale until a human approves again. Verification is read-only; approval writes four
 * frontmatter values and nothing else.
 *
 *   node --no-warnings scripts/work-approval.test.ts
 */

import { spawnSync } from "child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import * as Approval from "./work-approval.ts";
import { fingerprintBody, migratePlanningDoc, splitDocument } from "./migrate-planning-doc.ts";
import { canonical } from "./qa-release-gate.ts";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const FIXTURES = join(HERE, "fixtures/bug-work-plans");

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf-8");
const sha = (s: string | Buffer) => `sha256:${createHash("sha256").update(s).digest("hex")}`;
const api = Approval as any;
const CYCLE1 = readFileSync(join(FIXTURES, "bwp-cycle1.md"), "utf-8");
const CYCLE2 = readFileSync(join(FIXTURES, "bwp-cycle2.md"), "utf-8");
function edit(doc: string, from: string | RegExp, to: string): string {
  const hits = typeof from === "string" ? doc.split(from).length - 1 : (doc.match(new RegExp(from.source, from.flags.includes("g") ? from.flags : from.flags + "g")) ?? []).length;
  if (hits !== 1) throw new Error(`fixture edit expected exactly one match for ${String(from)}, found ${hits}`);
  return doc.replace(from, to);
}
const tmp = mkdtempSync(join(tmpdir(), "work-approval-"));
let n = 0;
const put = (content: string | Buffer): string => {
  const p = join(tmp, `plan-${++n}.md`);
  writeFileSync(p, content);
  return p;
};
const V = (doc: string | Buffer) => api.verifyApproval?.(Buffer.isBuffer(doc) ? doc : Buffer.from(doc, "utf-8"));
const A = (p: string, by?: string) => api.approveWorkPackage?.(p, by === undefined ? {} : { by });
const codes = (r: any): string[] => (r?.reasons ?? []).map((x: any) => x.code);
const show = (r: any) => JSON.stringify([r?.status, codes(r), r?.error ?? r?.errors]);
const bodyOf = (b: Buffer) => (splitDocument(b) as any).body as Buffer;
const leadingOf = (b: Buffer) => (splitDocument(b) as any).leading as Buffer;
const fmLines = (b: Buffer): string[] => (splitDocument(b) as any).inner;

/** An approved copy of the cycle-1 fixture, approved by "dana" through the helper itself. */
function approvedCycle1(): { path: string; text: string } {
  const p = put(CYCLE1);
  A(p, "dana");
  return { path: p, text: readFileSync(p, "utf-8") };
}
const stale = (r: any) => r?.status === "approval_stale" && r.ok === false && codes(r).includes("APPROVAL_FINGERPRINT_MISMATCH");
const notApproved = (r: any) => r !== undefined && r.ok === false && r.status !== "approved";

try {
  /* ── 1–4. draft, approve, verify, idempotency ─────────────────────────── */
  {
    const d = V(CYCLE1);
    check("1 a draft plan is not approved", d?.status === "draft" && d.ok === false, show(d));
    check("1 verify still reports the fingerprint an approval would record", /^sha256:[0-9a-f]{64}$/.test(d?.approval_fingerprint ?? ""));

    const p = put(CYCLE1);
    const before = readFileSync(p);
    const r = A(p, "dana");
    const after = readFileSync(p);
    check("2 approving a valid draft succeeds", r?.ok === true && r.status === "approved" && r.changed === true, show(r));
    const lines = fmLines(after);
    check("2 approval writes status, approved_by, approved_fingerprint and approved_cycle",
      lines.includes("status: approved") && lines.includes("approved_by: dana") && lines.includes(`approved_fingerprint: ${r?.approval_fingerprint}`) && lines.includes("approved_cycle: 1"), JSON.stringify(lines.slice(-6)));
    check("2 the recorded fingerprint is the one verify recomputes", r?.approval_fingerprint === api.approvalFingerprint?.(after) && r.approval_fingerprint === d.approval_fingerprint);
    const v = V(after);
    check("3 the approved plan verifies as approved", v?.status === "approved" && v.ok === true && v.reasons.length === 0, show(v));
    check("3 verify reports the recorded approval", v?.recorded?.approved_by === "dana" && v.recorded.approved_cycle === 1 && v.recorded.approved_fingerprint === r?.approval_fingerprint);

    // 26 — the body, and everything outside the four approval values, is untouched.
    check("26 approval does not modify the body", bodyOf(before).equals(bodyOf(after)));
    check("26 …nor the text above the frontmatter", leadingOf(before).equals(leadingOf(after)));
    const b = fmLines(before), a = fmLines(after);
    const changed = a.map((l, i) => (l !== b[i] ? l.split(":")[0] : null)).filter(Boolean);
    check("26 only the four approval lines change", b.length === a.length && JSON.stringify(changed) === '["status","approved_by","approved_fingerprint","approved_cycle"]', JSON.stringify(changed));
    check("26 approval reports the body hash before and after, equal", r?.body_sha256?.before === r?.body_sha256?.after && typeof r?.body_sha256?.before === "string");

    const again = A(p, "dana");
    check("4 same content and same approver is idempotent — no write", again?.ok === true && again.status === "approved" && again.changed === false && readFileSync(p).equals(after), show(again));
    const other = A(p, "lior");
    check("4 a different approver on the same content is a new approval act, recorded", other?.ok === true && other.changed === true && fmLines(readFileSync(p)).includes("approved_by: lior") &&
      other.previous?.approved_by === "dana" && V(readFileSync(p))?.status === "approved", show(other));
    check("26 no stray file is left beside the plan", readdirSync(tmp).every((f) => f.startsWith("plan-")));
  }

  /* ── 5–9. body edits after approval ─────────────────────────────────────── */
  {
    const { text } = approvedCycle1();
    const cases: Array<[string, string, string]> = [
      ["5 Root Cause", "the discounted subtotal is computed but never read.", "the discounted subtotal is read too late."],
      ["6 Fix Design", "- **Non-goals:** coupon validation, cart badge, tax rounding.", "- **Non-goals:** coupon validation."],
      ["7 Verification Strategy", "- **Verification debt:** none.", "- **Verification debt:** none on android."],
      ["8 a task row", "| T2 | Compute the total from the discounted subtotal |", "| T2 | Compute the total from the coupon subtotal |"],
      ["9 Fix Cycles", "No additional fix cycles yet. Cycle 1 is the Tasks section above.", "No additional fix cycles yet."],
      ["Blast Radius", "- [inference] Only the checkout total; the cart badge reads a separate subtotal.", "- [inference] Only the checkout total."],
      ["Open Questions", "## Open Questions\n\n- None.", "## Open Questions\n\n- Is SAVE10 stackable?"],
      ["a body HTML comment (body bytes are hashed as they are)", "## Open Questions\n", "## Open Questions\n<!-- note -->\n"],
      ["the title above the frontmatter", "# Bug Work Plan — BUG-43: Checkout total ignores coupon", "# Bug Work Plan — BUG-43: Coupon ignored"],
    ];
    for (const [what, from, to] of cases) {
      const r = V(edit(text, from, to));
      check(`${what} edited after approval → approval_stale`, stale(r), show(r));
    }
  }

  /* ── 10–20. bound frontmatter edits after approval ─────────────────────── */
  {
    const { text } = approvedCycle1();
    // Edits that keep the plan structurally valid: only the approval fingerprint can catch them.
    const cases: Array<[string, string | RegExp, string]> = [
      ["11 qa_bug_id (with its bug_key, consistently)", "bug_key: BUG-43\nqa_bug_id: BUG-43\n", "bug_key: BUG-44\nqa_bug_id: BUG-44\n"],
      ["12 external_ref", "external_ref: PAY-1182\n", "external_ref: PAY-9\n"],
      ["13 found_in_build", "found_in_build: and-201\n", "found_in_build: and-202\n"],
      ["15 device_type", "device_type: mobile\n", "device_type: tv\n"],
      ["16 surfaces (a surface added)", "surfaces: [android]\n", "surfaces: [android, android-tv]\n"],
      ["16 surfaces (emptied)", "surfaces: [android]\n", "surfaces: []\n"],
      ["17 capability", "capability: null\n", "capability: checkout\n"],
      ["18 related_feature", "related_feature: checkout-coupons\n", "related_feature: null\n"],
      ["19 bug_evidence_fingerprint", /^bug_evidence_fingerprint: .*$/m, `bug_evidence_fingerprint: sha256:${"a".repeat(64)}`],
      ["origin", "origin: qa-standalone\n", "origin: qa-execution\n"],
    ];
    for (const [what, from, to] of cases) {
      const r = V(edit(text, from, to));
      check(`${what} edited after approval → approval_stale`, stale(r), show(r));
    }
    // Edits the plan's own structure already refuses — still never approved.
    const structural: Array<[string, string, string]> = [
      ["10 bug_key alone", "bug_key: BUG-43\n", "bug_key: BUG-44\n"],
      ["11 qa_bug_id alone", "qa_bug_id: BUG-43\n", "qa_bug_id: BUG-44\n"],
      ["14 platform", "platform: android\n", "platform: ios\n"],
      ["20 fix_cycle", "fix_cycle: 1\n", "fix_cycle: 2\n"],
    ];
    for (const [what, from, to] of structural) {
      const r = V(edit(text, from, to));
      check(`${what} edited after approval → not approved (invalid)`, notApproved(r) && r.status === "invalid" && codes(r).includes("PLAN_INVALID"), show(r));
    }
    // 10 — a bug_key change that is structurally valid (a DEV key) is caught by the fingerprint.
    const devKey = (s: string) => `DEV-${createHash("sha256").update(s).digest("hex").slice(0, 8)}`;
    const dev = edit(edit(edit(edit(CYCLE1, "bug_key: BUG-43\n", `bug_key: ${devKey("a")}\n`), "qa_bug_id: BUG-43\n", "qa_bug_id: null\n"), "external_ref: PAY-1182\n", "external_ref: null\n"), "origin: qa-standalone\n", "origin: production\n");
    const pd = put(dev);
    A(pd, "dana");
    const r = V(edit(readFileSync(pd, "utf-8"), `bug_key: ${devKey("a")}\n`, `bug_key: ${devKey("b")}\n`));
    check("10 bug_key edited after approval → approval_stale", stale(r), show(r));
    // Reordering surfaces does not change the set; the approval binds the set.
    const two = put(edit(CYCLE1, "surfaces: [android]\n", "surfaces: [android, android-tv]\n"));
    A(two, "dana");
    const reordered = V(edit(readFileSync(two, "utf-8"), "surfaces: [android, android-tv]\n", "surfaces: [android-tv, android]\n"));
    check("16 reordering surfaces keeps the approval (surfaces are a set, as in the evidence fingerprint)", reordered?.status === "approved", show(reordered));
  }

  /* ── fields outside the approval contract ──────────────────────────────── */
  {
    const { text } = approvedCycle1();
    const outside: Array<[string, string | RegExp, string]> = [
      ["a frontmatter comment", "fix_cycle: 1\n", "fix_cycle: 1 # cycle one\n"],
      ["author", "author: android architect\n", "author: dana\n"],
      ["date", "date: 2026-10-06\n", "date: 2026-10-07\n"],
      ["repo_knowledge_freshness", "repo_knowledge_freshness: null\n", "repo_knowledge_freshness: unknown\n"],
    ];
    for (const [what, from, to] of outside) {
      const r = V(edit(text, from, to));
      check(`outside the contract: ${what} does not invalidate the approval`, r?.status === "approved", show(r));
    }
    check("the bound fields are declared, and exclude author, date, repo_knowledge_* and doc_schema_version",
      JSON.stringify(api.APPROVAL_BOUND_FIELDS) === JSON.stringify(["bug_key", "qa_bug_id", "external_ref", "origin", "found_in_build", "platform", "device_type", "surfaces", "capability", "related_feature", "bug_evidence_fingerprint", "fix_cycle"]));
  }

  /* ── the algorithm, exactly as documented ──────────────────────────────── */
  {
    const buf = Buffer.from(CYCLE1, "utf-8");
    const split = splitDocument(buf) as any;
    const expected = sha(canonical({
      algorithm: "work-approval/bug-work-plan/v1",
      body: fingerprintBody(buf),
      leading: sha(split.leading),
      fields: {
        bug_key: "BUG-43", qa_bug_id: "BUG-43", external_ref: "PAY-1182", origin: "qa-standalone", found_in_build: "and-201", platform: "android", device_type: "mobile",
        surfaces: ["android"], capability: null, related_feature: "checkout-coupons", bug_evidence_fingerprint: "sha256:95d68ae65a0758e098e12de059aec106752c1c4e0e21502486395fefce9633b6", fix_cycle: 1,
      },
    }));
    check("the approval fingerprint is sha256(canonical({algorithm, body, leading, fields}))", api.approvalFingerprint?.(buf) === expected, `${api.approvalFingerprint?.(buf)} vs ${expected}`);
    // Each bound field moves the fingerprint on its own — independent of the plan's structural rules.
    const base = api.approvalPayload?.(buf);
    const fp = (p: any) => api.fingerprintPayload?.(p);
    check("the payload is exposed for the documented algorithm", typeof fp(base) === "string" && fp(base) === expected);
    for (const f of api.APPROVAL_BOUND_FIELDS ?? []) {
      const changed = { ...base, fields: { ...base.fields, [f]: f === "fix_cycle" ? 2 : f === "surfaces" ? ["ios"] : "changed" } };
      check(`binding: ${f} moves the approval fingerprint`, fp(changed) !== expected);
    }
    check("binding: the body fingerprint moves it", fp({ ...base, body: sha("x") }) !== expected);
    check("binding: the text above the frontmatter moves it", fp({ ...base, leading: sha("x") }) !== expected);
    check("the fingerprint is deterministic", api.approvalFingerprint?.(buf) === api.approvalFingerprint?.(Buffer.from(CYCLE1, "utf-8")));
    check("an invalid plan has no approval fingerprint", api.approvalFingerprint?.(Buffer.from(edit(CYCLE1, "## Root Cause\n", "## Cause\n"))) === null);
  }

  /* ── 21. cycle binding ─────────────────────────────────────────────────── */
  {
    const { text } = approvedCycle1();
    const cyc = V(edit(text, "approved_cycle: 1\n", "approved_cycle: 2\n"));
    check("21 approved_cycle != fix_cycle is not approved", cyc?.status === "approval_stale" && codes(cyc).includes("APPROVAL_CYCLE_MISMATCH"), show(cyc));
    // fix_cycle moves 1 → 2: a cycle is appended (simulated here; creating cycles is a later step).
    const cycle2Section = CYCLE2.slice(CYCLE2.indexOf("### Cycle 2"), CYCLE2.indexOf("## Repo Knowledge Reference"));
    const grown = edit(edit(text, "No additional fix cycles yet. Cycle 1 is the Tasks section above.\n", `Cycle 1 is the Tasks section above.\n\n${cycle2Section}`), "fix_cycle: 1\n", "fix_cycle: 2\n");
    const g = V(grown);
    check("21 a new fix cycle makes the cycle-1 approval stale", g?.status === "approval_stale" && codes(g).includes("APPROVAL_CYCLE_MISMATCH") && codes(g).includes("APPROVAL_FINGERPRINT_MISMATCH"), show(g));
    // Even a correctly recomputed fingerprint cannot carry approved_cycle 1 into cycle 2.
    const forged = (() => {
      const fpNow = api.approvalFingerprint?.(Buffer.from(grown, "utf-8"));
      return edit(grown, /^approved_fingerprint: .*$/m, `approved_fingerprint: ${fpNow}`);
    })();
    const f = V(forged);
    check("21 approved_cycle: 1 cannot approve cycle 2, even with a matching fingerprint", f?.status === "approval_stale" && JSON.stringify(codes(f)) === '["APPROVAL_CYCLE_MISMATCH"]', show(f));
    const pg = put(grown);
    const re = A(pg, "dana");
    check("21 cycle 2 needs, and gets, one new approval", re?.ok === true && re.changed === true && re.approved_cycle === 2 && V(readFileSync(pg))?.status === "approved" && fmLines(readFileSync(pg)).includes("approved_cycle: 2"), show(re));
  }

  /* ── 22–25. approver, hand-written and malformed approvals, reapproval ──── */
  {
    for (const by of [undefined, "", "   "]) {
      const p = put(CYCLE1);
      const before = readFileSync(p);
      const r = A(p, by);
      check(`22 approve without an approver (${JSON.stringify(by)}) is refused, file untouched`, r?.ok === false && r.status === "invalid" && r.code === "APPROVER_REQUIRED" && readFileSync(p).equals(before), show(r));
    }
    for (const by of ["null", "~", "dana # admin", "dana\nstatus: approved", "da: na", "-dana", "x".repeat(200)]) {
      const p = put(CYCLE1);
      const before = readFileSync(p);
      const r = A(p, by);
      check(`22 an approver that is not a plain identity (${JSON.stringify(by.slice(0, 20))}) is refused`, r?.ok === false && r.code === "APPROVER_INVALID" && readFileSync(p).equals(before), show(r));
    }
    check("22 an email-style identity is accepted", A(put(CYCLE1), "dana.levi+qa@onoapps.com")?.status === "approved");
    const fp = api.approvalFingerprint?.(Buffer.from(CYCLE1, "utf-8"));
    const handNoBy = V(edit(edit(edit(CYCLE1, "status: draft\n", "status: approved\n"), "approved_fingerprint: null\n", `approved_fingerprint: ${fp}\n`), "approved_cycle: null\n", "approved_cycle: 1\n"));
    check("22 status approved with no approver is invalid", handNoBy?.status === "invalid" && codes(handNoBy).includes("APPROVER_MISSING"), show(handNoBy));
    const handNoFp = V(edit(edit(edit(CYCLE1, "status: draft\n", "status: approved\n"), "approved_by: null\n", "approved_by: dana\n"), "approved_cycle: null\n", "approved_cycle: 1\n"));
    check("23 a hand-written status: approved without a fingerprint is invalid", handNoFp?.status === "invalid" && codes(handNoFp).includes("APPROVAL_FINGERPRINT_MISSING"), show(handNoFp));
    const handFake = V(edit(edit(edit(edit(CYCLE1, "status: draft\n", "status: approved\n"), "approved_by: null\n", "approved_by: dana\n"), "approved_fingerprint: null\n", `approved_fingerprint: sha256:${"1".repeat(64)}\n`), "approved_cycle: null\n", "approved_cycle: 1\n"));
    check("23 a hand-written status: approved with an invented fingerprint is not approved", handFake?.status === "approval_stale" && codes(handFake).includes("APPROVAL_FINGERPRINT_MISMATCH"), show(handFake));
    const handNoCycle = V(edit(edit(edit(CYCLE1, "status: draft\n", "status: approved\n"), "approved_by: null\n", "approved_by: dana\n"), "approved_fingerprint: null\n", `approved_fingerprint: ${fp}\n`));
    check("23 status approved with no approved_cycle is invalid", handNoCycle?.status === "invalid" && codes(handNoCycle).includes("APPROVAL_CYCLE_MISSING"), show(handNoCycle));
    for (const bad of ["sha256:xyz", "md5:abc", "yes", `sha256:${"A".repeat(64)}`]) {
      const { text } = approvedCycle1();
      const r = V(edit(text, /^approved_fingerprint: .*$/m, `approved_fingerprint: ${bad}`));
      check(`24 a malformed approval fingerprint (${bad.slice(0, 12)}) is invalid`, r?.status === "invalid" && r.ok === false, show(r));
    }

    // 25 — content changed after approval: verify reports it read-only; approving again succeeds.
    const { path } = approvedCycle1();
    const first = V(readFileSync(path))?.recorded?.approved_fingerprint;
    writeFileSync(path, edit(readFileSync(path, "utf-8"), "the discounted subtotal is computed but never read.", "the discounted subtotal is read too late."));
    const changedBytes = readFileSync(path);
    const st = V(changedBytes);
    check("8 verification is read-only: a stale plan still says status: approved on disk", st?.status === "approval_stale" && fmLines(readFileSync(path)).includes("status: approved") && readFileSync(path).equals(changedBytes));
    check("8 a stale verdict names the recorded and the current fingerprint", st?.recorded?.approved_fingerprint === first && st.approval_fingerprint !== first);
    const re = A(path, "dana");
    check("25 re-approval after a content change succeeds", re?.ok === true && re.changed === true && re.approval_fingerprint !== first && V(readFileSync(path))?.status === "approved", show(re));
    check("25 re-approval reports what it replaced", re?.previous?.approved_fingerprint === first);
    check("26 re-approval leaves the edited body as the human wrote it", bodyOf(readFileSync(path)).equals(bodyOf(changedBytes)));

    // An invalid plan is never approved.
    const broken = put(edit(CYCLE1, "## Root Cause\n", "## Cause\n"));
    const brokenBefore = readFileSync(broken);
    const b = A(broken, "dana");
    check("an invalid plan is refused, untouched", b?.ok === false && b.status === "invalid" && b.code === "PLAN_INVALID" && readFileSync(broken).equals(brokenBefore), show(b));
  }

  /* ── encodings: CRLF and --- frontmatter ──────────────────────────────── */
  {
    const crlf = put(CYCLE1.replace(/\n/g, "\r\n"));
    const before = readFileSync(crlf);
    const r = A(crlf, "dana");
    const after = readFileSync(crlf);
    check("a CRLF plan is approved with its line endings and body intact", r?.ok === true && bodyOf(before).equals(bodyOf(after)) && !/[^\r]\n/.test(after.toString("utf-8")) && V(after)?.status === "approved", show(r));
    const delimited = CYCLE1.replace("# Bug Work Plan — BUG-43: Checkout total ignores coupon\n\n```yaml\n", "---\n").replace("date: 2026-10-06\n```\n", "date: 2026-10-06\n---\n");
    const pd = put(delimited);
    const rd = A(pd, "dana");
    check("a --- frontmatter plan is approved too", rd?.ok === true && V(readFileSync(pd))?.status === "approved" && readFileSync(pd, "utf-8").startsWith("---\n"), show(rd));
  }

  /* ── 27–31. scope ──────────────────────────────────────────────────────── */
  {
    const src = read("scripts/work-approval.ts").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("27 the helper never touches a QA repository, Inspector or Project Knowledge", !/qa-ledger|ono-plugin-qa|project-inspector|repo-knowledge|\.ono\b/.test(src));
    check("27 the helper runs no process and reads no clock", !/child_process|new Date|Date\.now|Math\.random|randomUUID/.test(src));
    check("27 the helper writes only through its one atomic write", (src.match(/writeFileSync\(/g) ?? []).length === 1 && (src.match(/renameSync\(/g) ?? []).length === 1);

    const fa = join(HERE, "fixtures/planning-docs/fa-v3-stamped.md");
    const faCopy = put(readFileSync(fa));
    const faBefore = readFileSync(faCopy);
    const faR = A(faCopy, "dana");
    check("28 a feature planning document is never approved through this helper", faR?.ok === false && faR.status === "invalid" && readFileSync(faCopy).equals(faBefore), show(faR));
    const faM = migratePlanningDoc(fa, { kind: "feature-analysis", check: true });
    check("28 feature planning documents behave as before (stamped v3 is current)", faM.status === "current");
    const TEMPLATES: Record<string, string> = {
      "feature-analysis-template.md": "2bba7fc13a75acd08f423752f7b9fe41347f98f8b870261cbafa5650cb8f52d9",
      "dd-template.md": "2f8b8229b858c62087485366f6dddc7e1a0139f6a0d2123117b377a884227933",
      "dev-plan-template.md": "cbb9d0e4110708b54a7444aae189cac69b2b62783879bf7fa6ce86612aa910a2",
      "task-breakdown-template.md": "51de43491f82963e2c52b53df0829177304fddcd12ea212501cbde6ef4796a89",
    };
    for (const [f, h] of Object.entries(TEMPLATES)) check(`28 ${f} is unchanged`, createHash("sha256").update(readFileSync(join(REPO_ROOT, "templates", f))).digest("hex") === h);
    const dir = join(HERE, "fixtures/planning-docs");
    const digest = sha(readdirSync(dir).sort().map((f) => `${f}\0${createHash("sha256").update(readFileSync(join(dir, f))).digest("hex")}`).join("\n"));
    check("29 existing migration fixtures are byte-identical", digest === "sha256:d4a2bd658aaf5989355318bd29500bd00cfa0e46ef032ed37bc5a4eae0f139ca", digest);
    const bwpDir = join(HERE, "fixtures/bug-work-plans");
    check("29 the bug-work-plan fixtures are still drafts (approval tests work on copies)", ["bwp-cycle1.md", "bwp-cycle2.md"].every((f) => readFileSync(join(bwpDir, f), "utf-8").includes("status: draft\n")));
    // Step 4 added /analyze-bug, which approves through this helper; no other command calls it.
    // Step 5: /implement-task verifies (never writes) approval through its bug gate; only /analyze-bug approves.
    const others = readdirSync(join(REPO_ROOT, "commands")).filter((f) => f !== "analyze-bug.md" && f !== "implement-task.md").map((f) => read(`commands/${f}`)).join("\n");
    check("30 only /analyze-bug approves; /implement-task only verifies", !/work-approval/.test(others) && /scripts\/work-approval\.ts" approve/.test(read("commands/analyze-bug.md")) && !/work-approval\.ts" approve/.test(read("commands/implement-task.md")));
    for (const f of ["scripts/task-state.ts", "scripts/task-resume.ts"]) check(`31 ${f} does not reference work-approval`, !/work-approval/.test(read(f)));
    check("the suite is registered with the check harness", read("scripts/check.ts").includes('"work-approval"'));
    const contract = read("docs/bug-work-plan-contract.md");
    check("the contract documents the algorithm and the rules",
      /work-approval\/bug-work-plan\/v1/.test(contract) && /approval_stale/.test(contract) && /approved_cycle/.test(contract) && /idempotent/i.test(contract) && /scripts\/work-approval\.ts/.test(contract));
    check("the planning-document version is unchanged", /^\|\s*`bug-work-plan`\s*\|\s*1\s*\|/m.test(read("docs/planning-doc-contract.md")));
  }

  /* ── CLI ───────────────────────────────────────────────────────────────── */
  {
    const run = (args: string[]) => {
      const p = spawnSync(process.execPath, ["--no-warnings", join(HERE, "work-approval.ts"), ...args], { encoding: "utf-8" });
      try {
        return { code: p.status, json: JSON.parse(p.stdout) };
      } catch {
        return { code: p.status, json: null, raw: p.stdout + p.stderr };
      }
    };
    const p = put(CYCLE1);
    const v1 = run(["verify", p]);
    check("CLI verify prints one JSON object, exit 0", v1.code === 0 && v1.json?.status === "draft");
    const a = run(["approve", p, "--by", "dana"]);
    check("CLI approve --by writes the approval", a.code === 0 && a.json?.status === "approved" && a.json.changed === true);
    check("CLI verify after approve is approved", run(["verify", p, "--kind", "bug-work-plan"]).json?.status === "approved");
    const noBy = run(["approve", p]);
    check("CLI approve without --by is refused", noBy.code === 0 && noBy.json?.code === "APPROVER_REQUIRED");
    check("CLI an unknown kind is refused", run(["verify", p, "--kind", "dd"]).json?.status === "invalid");
    check("CLI a missing file is refused", run(["verify", join(tmp, "nope.md")]).json?.status === "invalid");
    check("CLI an unknown command is refused, exit 0", run(["frobnicate"]).code === 0 && run(["frobnicate"]).json?.status === "invalid");
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall work-approval checks passed" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
