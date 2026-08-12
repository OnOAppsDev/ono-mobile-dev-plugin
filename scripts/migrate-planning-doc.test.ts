/**
 * migrate-planning-doc.test.ts
 *
 * Self-contained tests for scripts/migrate-planning-doc.ts. Fixtures live on
 * disk under scripts/fixtures/planning-docs/ (see that folder's README for why)
 * and are copied into a throwaway temp directory before every case, so the
 * fixtures themselves are never mutated.
 *
 * The SHARED-011 guarantees ARE the contract, so each one has a test here:
 * body-byte preservation, approval preservation, determinism, idempotency,
 * true no-op, needs-input-writes-nothing, and every refusal path.
 *
 * No external test framework. Run with:
 *   node scripts/migrate-planning-doc.test.ts
 *   bun  scripts/migrate-planning-doc.test.ts
 */

import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, statSync, readdirSync, rmSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { CURRENT_SCHEMA_VERSION, PLUGIN_VERSION, labelledDeviceType, __testing, type DocKind } from "./migrate-planning-doc.ts";

const HERE = import.meta.dirname ?? __dirname;
const HELPER = join(HERE, "migrate-planning-doc.ts");
const FIXTURES = join(HERE, "fixtures", "planning-docs");
const REPO_ROOT = dirname(HERE);
const RUNTIME = process.execPath;

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

interface Run {
  code: number;
  json: any;
  stderr: string;
}

function run(path: string, args: string[] = []): Run {
  try {
    const stdout = execFileSync(RUNTIME, ["--no-warnings", HELPER, path, ...args], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, json: JSON.parse(stdout), stderr: "" };
  } catch (err: any) {
    let json: any = null;
    try {
      json = JSON.parse(err.stdout?.toString() ?? "");
    } catch {
      /* leave null */
    }
    return { code: typeof err.status === "number" ? err.status : 1, json, stderr: err.stderr?.toString() ?? "" };
  }
}

const root = mkdtempSync(join(tmpdir(), "migrate-planning-doc-"));

/** Copy a fixture into a fresh scratch directory and return its path. */
function scratch(fixture: string, dir = fixture.replace(/\.md$/, "")): string {
  const d = join(root, dir + "-" + Math.abs(hashOf(dir)).toString(36));
  mkdirSync(d, { recursive: true });
  const dest = join(d, fixture);
  copyFileSync(join(FIXTURES, fixture), dest);
  return dest;
}

let counter = 0;
function hashOf(_s: string): number {
  return counter++;
}

function bytes(path: string): Buffer {
  return readFileSync(path);
}

function sha(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Everything from the first level-2 heading onward — an invariant computed
 * WITHOUT reusing the framework's own splitter, so this check stays independent
 * of the code under test. Only the frontmatter block may change, and every
 * fixture's frontmatter sits above its first `## ` heading, so these bytes must
 * be identical before and after. (Deliberately not a re-implementation of the
 * splitter: `fa-hazards.md` contains the literal text ```` ```yaml ```` inside
 * an HTML comment AND a real ```yaml block in its body, which is exactly what a
 * naive scan gets wrong.)
 */
function bodyOf(buf: Buffer): Buffer {
  const idx = buf.indexOf(Buffer.from("\n## ", "utf-8"));
  if (idx === -1) throw new Error("fixture has no `## ` heading to anchor the body check");
  return buf.subarray(idx + 1);
}

const ANSWERS: Record<string, string> = {
  "fa-v0.md": JSON.stringify({
    platform: "react-native",
    device_type: "mobile",
    design_reference_status: "provided",
    design_reference_type: "document",
    design_reference: "docs/specs/saved-items.md",
  }),
  "fa-v1-mixed.md": JSON.stringify({ platform: "react-native" }),
  "fa-v1-nofigma.md": JSON.stringify({ design_reference_status: "not_required" }),
};

/** Fixtures that migrate to a golden output. */
const GOLDEN = [
  "fa-v0.md",
  "fa-v1.md",
  "fa-v1-mixed.md",
  "fa-v1-nofigma.md",
  "fa-v2.md",
  "fa-v3-unstamped.md",
  "fa-hazards.md",
  "fa-device-labeled.md",
];

/** Fixtures the framework must refuse or defer, writing nothing. */
const WRITES_NOTHING = [
  "fa-v1-mixed.md",
  "fa-v1-nofigma.md",
  "fa-v0.md",
  "fa-v3-stamped.md",
  "fa-schema-too-new.md",
  "dd-v1-stamped.md",
  "malformed-no-frontmatter.md",
  "malformed-unclosed-fence.md",
];

try {
  // --- 1. Chain correctness: byte-exact golden comparison -------------------
  for (const fixture of GOLDEN) {
    const path = scratch(fixture);
    const args = ["--kind", "feature-analysis", ...(ANSWERS[fixture] ? ["--answers", ANSWERS[fixture]] : [])];
    const r = run(path, args);
    const expected = bytes(join(FIXTURES, fixture.replace(/\.md$/, ".expected.md")));
    const actual = bytes(path);
    check(`1 ${fixture}: status migrated`, r.json?.status === "migrated", String(r.json?.status ?? r.stderr));
    check(`1 ${fixture}: byte-exact golden output`, actual.equals(expected), `sha ${sha(actual).slice(0, 12)} vs ${sha(expected).slice(0, 12)}`);
  }

  // --- 2. Body preservation for every migrating fixture ---------------------
  for (const fixture of GOLDEN) {
    const path = scratch(fixture);
    const before = bodyOf(bytes(join(FIXTURES, fixture)));
    const args = ["--kind", "feature-analysis", ...(ANSWERS[fixture] ? ["--answers", ANSWERS[fixture]] : [])];
    const r = run(path, args);
    const after = bodyOf(bytes(path));
    check(`2 ${fixture}: body bytes identical`, before.equals(after), `${before.length} vs ${after.length} bytes`);
    check(
      `2 ${fixture}: reported body sha matches`,
      r.json?.bodySha256?.before === r.json?.bodySha256?.after && typeof r.json?.bodySha256?.before === "string"
    );
  }

  // --- 3. Idempotency: migrate, migrate again -------------------------------
  for (const fixture of GOLDEN) {
    const path = scratch(fixture);
    const args = ["--kind", "feature-analysis", ...(ANSWERS[fixture] ? ["--answers", ANSWERS[fixture]] : [])];
    run(path, args);
    const first = bytes(path);
    const second = run(path, args);
    check(`3 ${fixture}: second run reports current`, second.json?.status === "current", String(second.json?.status));
    check(`3 ${fixture}: second run changed=false`, second.json?.changed === false);
    check(`3 ${fixture}: file byte-identical after second run`, bytes(path).equals(first));
  }

  // --- 3b. Determinism across processes -------------------------------------
  {
    const a = scratch("fa-v0.md", "determinism-a");
    const b = scratch("fa-v0.md", "determinism-b");
    const args = ["--kind", "feature-analysis", "--answers", ANSWERS["fa-v0.md"]];
    run(a, args);
    run(b, args);
    check("3b two independent runs produce identical bytes", bytes(a).equals(bytes(b)));
  }

  // --- 4. True no-op: stamped at current ------------------------------------
  {
    const path = scratch("fa-v3-stamped.md");
    const before = bytes(path);
    const beforeStat = statSync(path);
    const r = run(path, ["--kind", "feature-analysis"]);
    check("4 stamped current: status current", r.json?.status === "current", String(r.json?.status));
    check("4 stamped current: changed false", r.json?.changed === false);
    check("4 stamped current: no steps reported", Array.isArray(r.json?.steps) && r.json.steps.length === 0);
    check("4 stamped current: bytes unchanged", bytes(path).equals(before));
    check("4 stamped current: mtime unchanged", statSync(path).mtimeMs === beforeStat.mtimeMs);
  }

  // --- 5. Approval preservation ---------------------------------------------
  for (const fixture of GOLDEN) {
    const expected = readFileSync(join(FIXTURES, fixture.replace(/\.md$/, ".expected.md")), "utf-8");
    const source = readFileSync(join(FIXTURES, fixture), "utf-8");
    const statusOf = (t: string) => /^status:\s*(\S+)/m.exec(t)?.[1];
    const fieldsOf = (t: string) =>
      ["feature", "author", "date"].map((f) => new RegExp(`^${f}:(.*)$`, "m").exec(t)?.[1]).join("|");
    check(`5 ${fixture}: status preserved`, statusOf(source) === statusOf(expected), `${statusOf(source)} -> ${statusOf(expected)}`);
    check(`5 ${fixture}: feature/author/date preserved`, fieldsOf(source) === fieldsOf(expected));
  }

  // --- 6. Operation validation: a buggy step rejects the whole migration ----
  {
    const { applyOp, parseEntries, Rejected } = __testing;
    const kind: DocKind = "feature-analysis";
    const mk = () => parseEntries(["feature: x", "platform: android", "status: approved", "figma_link:"]);
    const rejects = (name: string, fn: () => void) => {
      let threw: unknown = null;
      try {
        fn();
      } catch (e) {
        threw = e;
      }
      check(`6 ${name}`, threw instanceof Rejected, threw ? String(threw) : "no error thrown");
    };

    rejects("step writing `status` is rejected", () =>
      applyOp(mk(), kind, { op: "set", field: "status", value: "draft", provenance: "x" }, {}, true, [])
    );
    rejects("step writing `feature` is rejected", () =>
      applyOp(mk(), kind, { op: "set", field: "feature", value: "y", provenance: "x" }, {}, true, [])
    );
    rejects("step writing framework metadata is rejected", () =>
      applyOp(mk(), kind, { op: "set", field: "doc_schema_version", value: "9", provenance: "x" }, {}, true, [])
    );
    rejects("`set` on a populated field is rejected", () =>
      applyOp(mk(), kind, { op: "set", field: "platform", value: "ios", provenance: "x" }, {}, true, [])
    );
    rejects("`resolve` on an undeclared field is rejected", () =>
      applyOp(mk(), kind, { op: "resolve", field: "platform", value: "ios", provenance: "x" }, {}, true, [])
    );
    rejects("`resolve` on a value not declared invalid is rejected", () =>
      applyOp(mk(), kind, { op: "resolve", field: "platform", value: "ios", provenance: "x" }, { platform: ["mixed"] }, true, [])
    );

    // The permitted paths still work.
    {
      const entries = mk();
      const applied: any[] = [];
      applyOp(entries, kind, { op: "set", field: "figma_link", value: "null", provenance: "derived" }, {}, true, applied);
      check("6 `set` on a blank field fills it", applied[0]?.op === "fill" && applied[0]?.value === "null", JSON.stringify(applied));
    }
    {
      const entries = mk();
      const applied: any[] = [];
      applyOp(entries, kind, { op: "set", field: "device_type", value: "tv", provenance: "derived" }, {}, true, applied);
      check("6 `set` on an absent field adds it", applied[0]?.op === "add" && applied[0]?.value === "tv", JSON.stringify(applied));
    }
    {
      const entries = parseEntries(["platform: mixed"]);
      const applied: any[] = [];
      applyOp(entries, kind, { op: "resolve", field: "platform", value: "android", provenance: "h" }, { platform: ["mixed"] }, true, applied);
      check("6 `resolve` on a declared invalid value succeeds", applied[0]?.op === "resolve" && applied[0]?.value === "android");
    }
    {
      const entries = mk();
      const applied: any[] = [];
      applyOp(entries, kind, { op: "set", field: "platform", value: "android", provenance: "x" }, {}, true, applied);
      check("6 `set` matching the existing value is a no-op", applied.length === 0);
    }
  }

  // --- 7. Both encodings -----------------------------------------------------
  {
    const fenced = run(scratch("fa-v1.md", "enc-fenced"), ["--kind", "feature-analysis"]);
    const delimited = run(scratch("fa-v2.md", "enc-delimited"), ["--kind", "feature-analysis"]);
    check("7 fenced encoding reported", fenced.json?.encoding === "fenced-yaml", String(fenced.json?.encoding));
    check("7 delimited encoding reported", delimited.json?.encoding === "delimited", String(delimited.json?.encoding));
    const delimitedOut = readFileSync(join(FIXTURES, "fa-v2.expected.md"), "utf-8");
    check("7 delimited output keeps `---` form", delimitedOut.startsWith("---\n") && !delimitedOut.startsWith("```"));
    const fencedOut = readFileSync(join(FIXTURES, "fa-v1.expected.md"), "utf-8");
    check("7 fenced output keeps ```yaml form", fencedOut.includes("```yaml\n") && !fencedOut.startsWith("---"));
  }

  // --- 7b. CRLF preserved ----------------------------------------------------
  {
    const out = readFileSync(join(FIXTURES, "fa-hazards.expected.md"));
    const crlf = (out.toString("utf-8").match(/\r\n/g) ?? []).length;
    const lf = (out.toString("utf-8").match(/\n/g) ?? []).length;
    check("7b CRLF document stays entirely CRLF", crlf === lf, `${crlf} CRLF of ${lf} LF`);
  }

  // --- 8. needs-input writes nothing ----------------------------------------
  for (const fixture of ["fa-v0.md", "fa-v1-mixed.md", "fa-v1-nofigma.md"]) {
    const path = scratch(fixture, "needsinput-" + fixture);
    const before = bytes(path);
    const r = run(path, ["--kind", "feature-analysis"]);
    check(`8 ${fixture}: status needs-input`, r.json?.status === "needs-input", String(r.json?.status));
    check(`8 ${fixture}: questions populated`, Array.isArray(r.json?.questions) && r.json.questions.length > 0);
    check(`8 ${fixture}: every question has options`, (r.json?.questions ?? []).every((q: any) => Array.isArray(q.options) && q.options.length > 0));
    check(`8 ${fixture}: file untouched`, bytes(path).equals(before));
  }

  // --- 9. Question batching --------------------------------------------------
  {
    const r = run(scratch("fa-v0.md", "batching"), ["--kind", "feature-analysis"]);
    const fields = (r.json?.questions ?? []).map((q: any) => q.field).sort();
    check(
      "9 v0 batches all three questions in one result",
      JSON.stringify(fields) === JSON.stringify(["design_reference_status", "device_type", "platform"]),
      JSON.stringify(fields)
    );
  }

  // --- 10. --answers completes and records provenance ------------------------
  {
    const path = scratch("fa-v1-mixed.md", "answers");
    const r = run(path, ["--kind", "feature-analysis", "--answers", ANSWERS["fa-v1-mixed.md"]]);
    const text = readFileSync(path, "utf-8");
    check("10 answered migration succeeds", r.json?.status === "migrated", String(r.json?.status));
    check("10 stamped at current", /^doc_schema_version:\s*3$/m.test(text));
    check("10 migrated_from_version recorded", /^migrated_from_version:\s*1$/m.test(text));
    check("10 migrated_by recorded", new RegExp(`^migrated_by:\\s*ono-mobile-dev-plugin ${PLUGIN_VERSION}$`, "m").test(text));
    check("10 migration_inputs records human provenance", /^migration_inputs:\s*platform=human@migration$/m.test(text));
    check("10 no clock field is written", !/^migrated_at:/m.test(text));
  }

  // --- 10b. A deterministic migration records no migration_inputs ------------
  {
    const text = readFileSync(join(FIXTURES, "fa-v1.expected.md"), "utf-8");
    check("10b deterministic migration omits migration_inputs", !/^migration_inputs:/m.test(text));
    const labeled = readFileSync(join(FIXTURES, "fa-device-labeled.expected.md"), "utf-8");
    check("10b document-derived device_type is not human provenance", !/^migration_inputs:/m.test(labeled));
    check("10b document-derived device_type written", /^device_type:\s*tv$/m.test(labeled));
  }

  // --- 10c. Independent field assertions for the v0->v3 chain ----------------
  //
  // The longest chain, asserted field by field against values written out by
  // hand — NOT against a golden the tool produced, and NOT using any parsing or
  // constant from the implementation. A golden comparison only proves the tool
  // is deterministic; this proves it is right. The only value read from
  // elsewhere is the plugin version, taken from plugin.json (the source of
  // truth for it), never from the migrator's own constant.
  {
    const pluginVersion = JSON.parse(readFileSync(join(REPO_ROOT, ".claude-plugin", "plugin.json"), "utf-8")).version;

    /** Deliberately a separate, minimal reader — not the framework's parser. */
    const field = (text: string, name: string): string | null => {
      const m = new RegExp(`^${name}:[ \\t]*(.*)$`, "m").exec(text);
      return m ? m[1].replace(/\s+#.*$/, "").trim() : null;
    };
    const occurrences = (text: string, name: string): number =>
      (text.match(new RegExp(`^${name}:`, "gm")) ?? []).length;

    const REPO_KNOWLEDGE_WHEN_LEGACY: Record<string, string> = {
      repo_knowledge_status: "unavailable",
      repo_knowledge_schema: "null",
      repo_knowledge_fingerprint: "null",
      repo_knowledge_freshness: "null",
      repo_knowledge_reused: "none",
      repo_knowledge_derived: "stack, commands, structure, inventory, conventions, integrations, auditTopics",
    };

    // (a) v0 -> v3 where every ambiguous value was answered by a human.
    {
      const path = scratch("fa-v0.md", "v0-independent");
      const source = readFileSync(join(FIXTURES, "fa-v0.md"), "utf-8");
      const r = run(path, ["--kind", "feature-analysis", "--answers", ANSWERS["fa-v0.md"]]);
      const out = readFileSync(path, "utf-8");
      check("10c(a) v0 answered: migrated", r.json?.status === "migrated", String(r.json?.status));

      const expected: Record<string, string> = {
        doc_schema_version: "3",
        platform: "react-native",
        device_type: "mobile",
        design_reference_status: "provided",
        design_reference_type: "document",
        design_reference: "docs/specs/saved-items.md",
        figma_link: "null",
        ...REPO_KNOWLEDGE_WHEN_LEGACY,
        migrated_from_version: "0",
        migrated_by: `ono-mobile-dev-plugin ${pluginVersion}`,
        migration_inputs:
          "platform=human@migration, device_type=human@migration, design_reference_status=human@migration, " +
          "design_reference_type=human@migration, design_reference=human@migration",
      };
      for (const [name, value] of Object.entries(expected)) {
        check(`10c(a) ${name} = ${value.length > 48 ? value.slice(0, 45) + "…" : value}`, field(out, name) === value, `got \`${field(out, name)}\``);
        check(`10c(a) ${name} appears exactly once`, occurrences(out, name) === 1, `${occurrences(out, name)} occurrences`);
      }
      for (const name of ["feature", "author", "status", "date"]) {
        check(`10c(a) protected ${name} unchanged`, field(out, name) === field(source, name), `${field(source, name)} -> ${field(out, name)}`);
      }
      check("10c(a) status is still approved", field(out, "status") === "approved", String(field(out, "status")));
    }

    // (b) v0 -> v3 where device_type came from a labelled body line and the
    //     design reference was derived from figma_link — no human input at all.
    {
      const path = scratch("fa-device-labeled.md", "v0-derived-independent");
      const source = readFileSync(join(FIXTURES, "fa-device-labeled.md"), "utf-8");
      const r = run(path, ["--kind", "feature-analysis"]);
      const out = readFileSync(path, "utf-8");
      check("10c(b) v0 derived: migrated with no answers", r.json?.status === "migrated", String(r.json?.status));

      const expected: Record<string, string> = {
        doc_schema_version: "3",
        platform: "android", // carried, not resolved — it was already present
        device_type: "tv", // derived from the labelled body line
        design_reference_status: "provided",
        design_reference_type: "figma",
        design_reference: "null",
        ...REPO_KNOWLEDGE_WHEN_LEGACY,
        migrated_from_version: "0",
        migrated_by: `ono-mobile-dev-plugin ${pluginVersion}`,
      };
      for (const [name, value] of Object.entries(expected)) {
        check(`10c(b) ${name} = ${value.length > 48 ? value.slice(0, 45) + "…" : value}`, field(out, name) === value, `got \`${field(out, name)}\``);
        check(`10c(b) ${name} appears exactly once`, occurrences(out, name) === 1, `${occurrences(out, name)} occurrences`);
      }
      check(
        "10c(b) figma_link carried byte-verbatim",
        field(out, "figma_link") === field(source, "figma_link") &&
          field(out, "figma_link") === "https://www.figma.com/design/Tt6Uu7/Search?node-id=140-22"
      );
      check("10c(b) no migration_inputs — nothing was human-supplied", occurrences(out, "migration_inputs") === 0);
      check("10c(b) platform carried, not re-asked", field(out, "platform") === field(source, "platform"));
      for (const name of ["feature", "author", "status", "date"]) {
        check(`10c(b) protected ${name} unchanged`, field(out, name) === field(source, name), `${field(source, name)} -> ${field(out, name)}`);
      }
    }
  }

  // --- 11. Refusal paths write nothing ---------------------------------------
  {
    const cases: Array<[string, string]> = [
      ["fa-schema-too-new.md", "schema-too-new"],
      ["dd-v1-stamped.md", "kind-mismatch"],
      ["malformed-no-frontmatter.md", "unsupported"],
      ["malformed-unclosed-fence.md", "unsupported"],
    ];
    for (const [fixture, expected] of cases) {
      const path = scratch(fixture, "refuse-" + fixture);
      const before = bytes(path);
      const r = run(path, ["--kind", "feature-analysis"]);
      check(`11 ${fixture}: status ${expected}`, r.json?.status === expected, String(r.json?.status));
      check(`11 ${fixture}: error explains why`, typeof r.json?.error === "string" && r.json.error.length > 0);
      check(`11 ${fixture}: file untouched`, bytes(path).equals(before));
    }
    const missing = run(join(root, "does-not-exist.md"), ["--kind", "feature-analysis"]);
    check("11 missing file: status unreadable", missing.json?.status === "unreadable", String(missing.json?.status));
    const badKind = run(scratch("fa-v1.md", "badkind"), ["--kind", "not-a-kind"]);
    check("11 invalid --kind refused", badKind.json?.status === "kind-mismatch", String(badKind.json?.status));
    const badAnswers = run(scratch("fa-v0.md", "badanswers"), ["--kind", "feature-analysis", "--answers", "{not json"]);
    check("11 malformed --answers refused", badAnswers.json?.status === "unreadable", String(badAnswers.json?.status));
  }

  // --- 12. CLI contract: always exit 0, always JSON --------------------------
  {
    let allZero = true;
    let allJson = true;
    for (const fixture of readdirSync(FIXTURES).filter((f) => f.endsWith(".md") && f !== "README.md")) {
      const r = run(scratch(fixture, "cli-" + fixture), ["--kind", "feature-analysis", "--check"]);
      if (r.code !== 0) allZero = false;
      if (r.json === null || typeof r.json.status !== "string") allJson = false;
    }
    check("12 every fixture exits 0", allZero);
    check("12 every fixture prints a JSON object with a status", allJson);
  }

  // --- 13. --check never writes ---------------------------------------------
  for (const fixture of GOLDEN) {
    const path = scratch(fixture, "check-" + fixture);
    const before = bytes(path);
    const args = ["--kind", "feature-analysis", "--check", ...(ANSWERS[fixture] ? ["--answers", ANSWERS[fixture]] : [])];
    const r = run(path, args);
    check(`13 ${fixture}: --check reports would-migrate`, r.json?.status === "would-migrate", String(r.json?.status));
    check(`13 ${fixture}: --check wrote nothing`, bytes(path).equals(before));
  }

  // --- 14. Contract-document drift ------------------------------------------
  {
    const contract = readFileSync(join(REPO_ROOT, "docs", "planning-doc-contract.md"), "utf-8");
    const table: Record<string, number> = {};
    for (const m of contract.matchAll(/^\|\s*`([a-z-]+)`\s*\|\s*(\d+)\s*\|/gm)) table[m[1]] = Number(m[2]);
    for (const [kind, version] of Object.entries(CURRENT_SCHEMA_VERSION)) {
      check(`14 contract records ${kind} = v${version}`, table[kind] === version, `contract says ${table[kind]}`);
    }
  }

  // --- 15. repo_knowledge_* values match the consumer skill verbatim ---------
  {
    const skill = readFileSync(join(REPO_ROOT, "skills", "repo-knowledge-consumer", "SKILL.md"), "utf-8");
    const block = /When knowledge is unavailable, the frontmatter reads:\s*```yaml\n([\s\S]*?)```/.exec(skill)?.[1] ?? "";
    const expected: Record<string, string> = {};
    for (const line of block.split("\n")) {
      const m = /^(repo_knowledge_\w+):\s*(.*)$/.exec(line.trim());
      if (m) expected[m[1]] = m[2].trim();
    }
    check("15 consumer skill block parsed", Object.keys(expected).length === 6, JSON.stringify(expected));
    const migrated = readFileSync(join(FIXTURES, "fa-v2.expected.md"), "utf-8");
    for (const [field, value] of Object.entries(expected)) {
      const actual = new RegExp(`^${field}:\\s*(.*)$`, "m").exec(migrated)?.[1]?.trim();
      check(`15 ${field} matches the consumer skill exactly`, actual === value, `got \`${actual}\`, skill says \`${value}\``);
    }
  }

  // --- 16. PLUGIN_VERSION matches plugin.json --------------------------------
  {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, ".claude-plugin", "plugin.json"), "utf-8"));
    check("16 PLUGIN_VERSION matches plugin.json", pkg.version === PLUGIN_VERSION, `${pkg.version} vs ${PLUGIN_VERSION}`);
  }

  // --- 17. labelledDeviceType is narrow and conservative ---------------------
  {
    check("17 labelled line derives", labelledDeviceType("### Device Type: tv\nsome prose") === "tv");
    check("17 bolded labelled line derives", labelledDeviceType("- **Device type:** mobile") === "mobile");
    check("17 prose mentioning TV does not derive", labelledDeviceType("This ships on the TV app and a TV remote.") === null);
    check("17 conflicting labels do not derive", labelledDeviceType("Device Type: tv\nDevice Type: mobile") === null);
    check("17 unrelated text does not derive", labelledDeviceType("Nothing here.") === null);
    check(
      "17 a custom-framework TV repo without a labelled line does not derive",
      labelledDeviceType("Uses the in-house tv-surface module, not Leanback.") === null
    );
  }

  // --- 18. Fixtures that must never be written -------------------------------
  {
    let untouched = true;
    for (const fixture of WRITES_NOTHING) {
      const path = scratch(fixture, "untouched-" + fixture);
      const before = bytes(path);
      run(path, ["--kind", "feature-analysis"]);
      if (!bytes(path).equals(before)) untouched = false;
    }
    check("18 no unanswered/refused fixture is ever written", untouched);
  }

  // --- 19. Kinds with no authored chain are assumed current ------------------
  {
    const path = scratch("dd-v1-stamped.md", "dd-kind");
    const before = bytes(path);
    const r = run(path, ["--kind", "dd"]);
    check("19 a stamped DD read as --kind dd is current", r.json?.status === "current", String(r.json?.status));
    check("19 DD untouched", bytes(path).equals(before));

    // An unstamped DD-shaped document is stamp-only: no chain exists for it.
    const unstamped = join(root, "dd-unstamped.md");
    mkdirSync(dirname(unstamped), { recursive: true });
    writeFileSync(unstamped, readFileSync(join(FIXTURES, "dd-v1-stamped.md"), "utf-8").replace(/^doc_schema_version: 1\n/m, ""));
    const r2 = run(unstamped, ["--kind", "dd"]);
    check("19 an unstamped DD migrates (stamp only)", r2.json?.status === "migrated", String(r2.json?.status));
    check("19 stamp-only DD records no migrated_from", !/^migrated_from_version:/m.test(readFileSync(unstamped, "utf-8")));
  }

  // --- 19b. Every shipped template parses as current for its own kind --------
  // Regression guard: the task-breakdown template carries `feature_analysis_link`,
  // so treating that field as a DD-exclusive marker misfired here.
  {
    const templates: Array<[string, DocKind]> = [
      ["feature-analysis-template.md", "feature-analysis"],
      ["dd-template.md", "dd"],
      ["dev-plan-template.md", "dev-plan"],
      ["task-breakdown-template.md", "task-breakdown"],
    ];
    for (const [file, kind] of templates) {
      const src = join(REPO_ROOT, "templates", file);
      const dest = join(root, "tpl-" + file);
      copyFileSync(src, dest);
      const before = bytes(dest);
      const r = run(dest, ["--kind", kind]);
      check(`19b ${file} parses as current for --kind ${kind}`, r.json?.status === "current", `${r.json?.status} / ${r.json?.error ?? ""}`);
      check(`19b ${file} untouched`, bytes(dest).equals(before));
    }
  }

  // --- 20. Framework is clock-free -------------------------------------------
  {
    const src = readFileSync(HELPER, "utf-8");
    const code = src.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    check("20 no Date usage in code", !/\bnew Date\b|\bDate\.now\b/.test(code));
    check("20 no Math.random usage in code", !/\bMath\.random\b/.test(code));
    check("20 no --now flag", !/--now/.test(code));
    check("20 no migrated_at field", !/migrated_at/.test(code));
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
