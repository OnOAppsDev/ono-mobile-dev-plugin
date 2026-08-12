/**
 * assess-dd-complexity.test.ts
 *
 * Self-contained tests for scripts/assess-dd-complexity.ts.
 *
 * The anti-false-partitioning guards ARE the contract, so each has a test:
 * change_sites carries zero weight, unknown inputs are ignored, every dimension
 * is capped, and High requires breadth. The advisory guarantee is tested too —
 * `routing` must be "single-dd" for every possible input.
 *
 * No external test framework. Run with:
 *   node scripts/assess-dd-complexity.test.ts
 *   bun  scripts/assess-dd-complexity.test.ts
 */

import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { assess, CAPS, MAX_TOTAL, type Signals } from "./assess-dd-complexity.ts";

const HERE = import.meta.dirname ?? __dirname;
const HELPER = join(HERE, "assess-dd-complexity.ts");
const RUNTIME = process.execPath;

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

/** A deliberately inert baseline: every signal at its zero value. */
const ZERO: Signals = {
  modules_touched: 0,
  change_classes: 0,
  change_sites: 0,
  cross_module_change_classes: 0,
  surfaces_changed: 0,
  new_contract: false,
  new_pattern: false,
  new_dependency: false,
  data_migration: false,
  concurrency_change: false,
  design_reference_status: "not_required",
};

const withSignals = (o: Partial<Signals>) => assess({ ...ZERO, ...o });

// --- 1. Band boundaries -----------------------------------------------------
{
  // total 5, architecture 0 -> low.  Repository 5 = floor(6/2)=3 + min(2,2)=2
  const low = withSignals({ modules_touched: 6, change_classes: 2 });
  check("1 total 5 with low architecture is low", low.band === "low" && low.total === 5, `${low.band}/${low.total}`);

  // total 6 -> medium
  const med = withSignals({ modules_touched: 6, change_classes: 2, cross_module_change_classes: 1 });
  check("1 total 6 is medium", med.band === "medium" && med.total === 6, `${med.band}/${med.total}`);

  // total 11 -> medium (just below the High threshold)
  const med11 = withSignals({
    modules_touched: 6,
    change_classes: 2,
    cross_module_change_classes: 2,
    surfaces_changed: 1,
    design_reference_status: "provided",
    new_contract: true,
  });
  check("1 total 11 is medium", med11.band === "medium" && med11.total === 11, `${med11.band}/${med11.total}`);

  // total 12 with breadth -> high
  const high = withSignals({
    modules_touched: 6,
    change_classes: 2,
    cross_module_change_classes: 2,
    surfaces_changed: 2,
    design_reference_status: "provided",
    new_contract: true,
  });
  check("1 total 12 with breadth is high", high.band === "high" && high.total === 12, `${high.band}/${high.total}`);
}

// --- 2. Low additionally requires low architecture --------------------------
{
  // total 3 but architecture 3 (new_pattern + new_dependency) -> not low
  const a = withSignals({ new_pattern: true, new_dependency: true });
  check("2 low total with architecture 3 is medium, not low", a.band === "medium" && a.total === 3, `${a.band}/${a.total}/arch ${a.dimensions?.architecture}`);
  const b = withSignals({ new_dependency: true, data_migration: true });
  check("2 architecture exactly 2 still permits low", b.band === "low" && b.dimensions?.architecture === 2, `${b.band}`);
}

// --- 3. Every dimension is capped -------------------------------------------
{
  const r = withSignals({ modules_touched: 1000, change_classes: 1000 });
  check("3 repository capped", r.dimensions?.repository === CAPS.repository, String(r.dimensions?.repository));
  const arch = withSignals({
    new_contract: true,
    new_pattern: true,
    new_dependency: true,
    data_migration: true,
    concurrency_change: true,
  });
  check("3 architecture capped (raw 7 -> 6)", arch.dimensions?.architecture === CAPS.architecture, String(arch.dimensions?.architecture));
  const s = withSignals({ surfaces_changed: 999, design_reference_status: "provided" });
  check("3 surface capped", s.dimensions?.surface === CAPS.surface, String(s.dimensions?.surface));
  const c = withSignals({ cross_module_change_classes: 999 });
  check("3 coupling capped", c.dimensions?.coupling === CAPS.coupling, String(c.dimensions?.coupling));
  const all = withSignals({
    modules_touched: 999,
    change_classes: 999,
    cross_module_change_classes: 999,
    surfaces_changed: 999,
    design_reference_status: "provided",
    new_contract: true,
    new_pattern: true,
    new_dependency: true,
    data_migration: true,
    concurrency_change: true,
  });
  check("3 total cannot exceed maxTotal", all.total === MAX_TOTAL, `${all.total}/${MAX_TOTAL}`);
}

// --- 4. change_sites carries ZERO weight ------------------------------------
{
  const a = withSignals({ change_sites: 0, modules_touched: 2, change_classes: 1 });
  const b = withSignals({ change_sites: 5000, modules_touched: 2, change_classes: 1 });
  check("4 change_sites does not affect the total", a.total === b.total, `${a.total} vs ${b.total}`);
  check("4 change_sites does not affect the band", a.band === b.band, `${a.band} vs ${b.band}`);
  check("4 change_sites is still recorded", b.signals.change_sites === 5000);
}

// --- 5. The false-partitioning regression case ------------------------------
{
  // A large mechanical migration, described only by its shape:
  //   - many repeated call-site edits
  //   - a small number of modules
  //   - one change class
  //   - no user-facing surface
  //   - no new architectural pattern or cross-module contract
  // Repetition is not complexity — a shape like this must never reach the
  // partitioned path no matter how many sites it touches.
  const mechanicalMigration = withSignals({
    modules_touched: 2,
    change_classes: 1,
    change_sites: 40,
    cross_module_change_classes: 1,
    new_dependency: true,
  });
  check(
    "5 a high-volume mechanical migration is NOT high",
    mechanicalMigration.band !== "high",
    `${mechanicalMigration.band}/${mechanicalMigration.total}`
  );
  check(
    "5 …and lands low with the current model",
    mechanicalMigration.band === "low",
    `${mechanicalMigration.band}/${mechanicalMigration.total}`
  );
}

// --- 6. Volume signals that are NOT inputs ----------------------------------
{
  const plain = withSignals({ modules_touched: 2 });
  const noisy = assess({
    ...ZERO,
    modules_touched: 2,
    requirement_count: 400,
    feature_analysis_lines: 5000,
    acceptance_criteria: 250,
  });
  check("6 requirement count / FA length are ignored", plain.total === noisy.total && plain.band === noisy.band, `${plain.total} vs ${noisy.total}`);
  check("6 unknown keys are not echoed into signals", !("requirement_count" in (noisy.signals as any)));
}

// --- 7. unclassified on missing or malformed input --------------------------
{
  const empty = assess({});
  check("7 empty input is unclassified", empty.band === "unclassified", empty.band);
  check("7 unclassified lists every missing signal", empty.missing.length === 11, String(empty.missing.length));
  check("7 unclassified has no dimensions or total", empty.dimensions === null && empty.total === null);

  const partial = assess({ ...ZERO, modules_touched: undefined });
  check("7 one missing count -> unclassified", partial.band === "unclassified" && partial.missing.includes("modules_touched"));

  const badFlag = assess({ ...ZERO, new_contract: "yes" });
  check("7 non-boolean flag -> unclassified", badFlag.band === "unclassified" && badFlag.missing.includes("new_contract"));

  const badEnum = assess({ ...ZERO, design_reference_status: "pending" });
  check("7 invalid design_reference_status -> unclassified", badEnum.band === "unclassified" && badEnum.missing.includes("design_reference_status"));

  const negative = assess({ ...ZERO, modules_touched: -3 });
  check("7 negative count -> unclassified", negative.band === "unclassified" && negative.missing.includes("modules_touched"));

  check("7 unclassified still routes to single-dd", empty.routing === "single-dd" && empty.advisory === true);
}

// --- 8. The advisory guarantee ----------------------------------------------
{
  const cases = [
    assess({}),
    withSignals({}),
    withSignals({ modules_touched: 3 }),
    withSignals({
      modules_touched: 9,
      change_classes: 9,
      cross_module_change_classes: 9,
      surfaces_changed: 9,
      design_reference_status: "provided",
      new_contract: true,
      new_pattern: true,
      new_dependency: true,
      data_migration: true,
      concurrency_change: true,
    }),
  ];
  check("8 routing is always single-dd", cases.every((c) => c.routing === "single-dd"));
  check("8 advisory is always true", cases.every((c) => c.advisory === true));
  const src = readFileSync(HELPER, "utf-8");
  check("8 the source contains no other routing value", (src.match(/"single-dd"/g) ?? []).length >= 3 && !/"partitioned"/.test(src));
}

// --- 9. Breadth is required for high ----------------------------------------
{
  // Exhaustive over the whole reachable score space: prove that no combination
  // reaches the High total without at least two high dimensions. With the
  // current caps this makes the two-dimension rule redundant — it is retained
  // as a guard against future recalibration, not as an active filter.
  let maxTotalWithOneHighDimension = 0;
  let anyHighWithFewerThanTwo = false;
  for (let r = 0; r <= CAPS.repository; r++)
    for (let a = 0; a <= CAPS.architecture; a++)
      for (let s = 0; s <= CAPS.surface; s++)
        for (let c = 0; c <= CAPS.coupling; c++) {
          const dims = { repository: r, architecture: a, surface: s, coupling: c };
          const highs = (Object.keys(dims) as Array<keyof typeof dims>).filter((k) => dims[k] * 10 >= CAPS[k] * 6);
          const total = r + a + s + c;
          if (highs.length <= 1) maxTotalWithOneHighDimension = Math.max(maxTotalWithOneHighDimension, total);
          if (total >= 12 && highs.length < 2) anyHighWithFewerThanTwo = true;
        }
  check("9 no score reaches total 12 with fewer than two high dimensions", !anyHighWithFewerThanTwo);
  check(
    `9 max total achievable with one high dimension is ${maxTotalWithOneHighDimension} (< 12)`,
    maxTotalWithOneHighDimension < 12,
    String(maxTotalWithOneHighDimension)
  );
}

// --- 10. predictedLines is derived, never an input --------------------------
{
  const a = withSignals({ modules_touched: 4 });
  check("10 predictedLines derives from total", a.predictedLines === 120 + 28 * (a.total as number), String(a.predictedLines));
  const b = assess({ ...ZERO, modules_touched: 4, expected_design_size: 9999, predictedLines: 1 });
  check("10 a supplied size hint is ignored", b.predictedLines === a.predictedLines, `${b.predictedLines} vs ${a.predictedLines}`);
}

// --- 11. Determinism and no ambient state -----------------------------------
{
  const input = { ...ZERO, modules_touched: 5, change_classes: 3, new_pattern: true };
  check("11 same input twice is identical", JSON.stringify(assess(input)) === JSON.stringify(assess(input)));
  const src = readFileSync(HELPER, "utf-8").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check("11 no Date usage", !/\bnew Date\b|\bDate\.now\b/.test(src));
  check("11 no Math.random usage", !/\bMath\.random\b/.test(src));
  check("11 no filesystem access", !/require\(["']fs|from "fs"/.test(src));
}

// --- 12. CLI contract -------------------------------------------------------
{
  const run = (args: string[]) => {
    try {
      const stdout = execFileSync(RUNTIME, ["--no-warnings", HELPER, ...args], { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
      return { code: 0, json: JSON.parse(stdout) };
    } catch (err: any) {
      let json: any = null;
      try {
        json = JSON.parse(err.stdout?.toString() ?? "");
      } catch {
        /* leave null */
      }
      return { code: typeof err.status === "number" ? err.status : 1, json };
    }
  };
  const good = run(["--signals", JSON.stringify({ ...ZERO, modules_touched: 6, change_classes: 2 })]);
  check("12 valid signals: exit 0 + JSON", good.code === 0 && good.json?.band === "low", JSON.stringify(good.json?.band));
  const malformed = run(["--signals", "{not json"]);
  check("12 malformed JSON: exit 0, unclassified", malformed.code === 0 && malformed.json?.band === "unclassified");
  const none = run([]);
  check("12 no args: exit 0, unclassified", none.code === 0 && none.json?.band === "unclassified");
  check("12 summary is a non-empty single line", typeof good.json?.summary === "string" && good.json.summary.length > 0 && !good.json.summary.includes("\n"));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures > 0 ? 1 : 0);
