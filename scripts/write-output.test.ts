/**
 * write-output.test.ts
 *
 * The runtime scripts print one JSON result and then call process.exit(). On a pipe, Node
 * writes process.stdout asynchronously and process.exit() dropped what was still queued: a
 * large result arrived cut off at 64 KiB and was no longer JSON. scripts/write-output.ts
 * writes the whole result before the exit. This suite holds, through the real CLIs and real
 * pipes — not only the helper:
 *
 *   1. a large repository-knowledge result (read-repo-knowledge.ts, the Inspector consumer)
 *      arrives complete, as valid JSON, byte for byte, with exit 0;
 *   2. the helper itself, in a child process, over a pipe: multi-megabyte output complete,
 *      the caller's exit code kept, a reader that goes away is not a crash;
 *   3. exit codes, stdout/stderr separation and the JSON format of every converted CLI;
 *   4. statically: no runtime script that calls process.exit() writes through
 *      console/process.stdout, and the developer tools set process.exitCode instead.
 *
 * No external test framework. Run with:
 *   node --no-warnings scripts/write-output.test.ts
 * or through the aggregator:
 *   node scripts/check.ts --only write-output
 */

import { execFileSync, spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join, dirname } from "path";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const NODE = process.execPath;
const script = (name: string) => join(HERE, `${name}.ts`);
const run = (name: string, args: string[], opts: { cwd?: string } = {}) =>
  spawnSync(NODE, ["--no-warnings", script(name), ...args], { encoding: "utf-8", maxBuffer: 1 << 28, cwd: opts.cwd });

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
const parse = (s: string): any => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};
const sha = (s: string) => createHash("sha256").update(s, "utf-8").digest("hex");
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const write = (root: string, rel: string, body: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), body);
};

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "write-output-")));
try {
  /* ── 1. a large Inspector knowledge result, through the real CLI ─────────── */
  {
    const repo = join(TMP, "big-knowledge");
    mkdirSync(repo);
    git(repo, "init", "-q");
    git(repo, "config", "user.email", "t@example.com");
    git(repo, "config", "user.name", "T");
    const CLAUDE = "# CLAUDE.md — Demo\n";
    const PATTERNS = "# Patterns\n\n## State Management\nRedux Toolkit.\n";
    write(repo, "CLAUDE.md", CLAUDE);
    write(repo, "docs/project/patterns.md", PATTERNS);
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", "artifacts");
    const head = git(repo, "rev-parse", "HEAD");
    const N = 3000;
    const topics = Array.from({ length: N }, (_, i) => ({ topic: `Audit topic ${i} — a reasonably long, descriptive title`, slug: `topic-${i}`, status: "Approved", file: `audits/topic-${i}/audit.md` }));
    const manifest = {
      repoKnowledgeSchemaVersion: 1,
      producedBy: { plugin: "ono-project-inspector", version: "0.11.2" },
      generatedAt: "2026-11-16T00:00:00.000Z",
      fingerprint: {
        gitHead: head,
        artifacts: { "CLAUDE.md": sha(CLAUDE), "AUDIT.md": null, "docs/project/overview.md": null, "docs/project/components.md": null, "docs/project/patterns.md": sha(PATTERNS), "docs/project/integrations.md": null },
      },
      coverage: { stack: "populated", commands: "partial", structure: "populated", inventory: "unknown", conventions: "populated", integrations: "unknown", auditTopics: "populated" },
      stack: { languages: ["TypeScript"], frameworks: ["React Native"], platformHints: ["Android", "iOS"], runtimeTooling: ["Metro"], packageManagers: ["yarn"] },
      commands: { install: "yarn", run: "yarn ios", test: null, build: null },
      structure: { repositoryTree: "CLAUDE.md#repository-structure", keyModules: "CLAUDE.md#key-modules", entryPoints: "CLAUDE.md#entry-points" },
      documents: {
        claudeMd: { path: "CLAUDE.md", exists: true, anchors: [] },
        auditMd: { path: "AUDIT.md", exists: false, anchors: [] },
        overview: { path: "docs/project/overview.md", exists: false, anchors: [] },
        inventory: { path: "docs/project/components.md", exists: false, anchors: [] },
        conventions: { path: "docs/project/patterns.md", exists: true, anchors: ["#state-management"] },
        integrations: { path: "docs/project/integrations.md", exists: false, anchors: [] },
      },
      auditTopics: topics,
    };
    write(repo, ".ono/repo-knowledge.json", JSON.stringify(manifest, null, 2));
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", "knowledge");

    for (let attempt = 1; attempt <= 3; attempt++) {
      const p = run("read-repo-knowledge", [repo]);
      const json = parse(p.stdout);
      check(`1 large knowledge (run ${attempt}): far past one pipe buffer`, p.stdout.length > 8 * 65536, String(p.stdout.length));
      check(`1 large knowledge (run ${attempt}): valid JSON`, json !== undefined, `${p.stdout.length} bytes, ends ${JSON.stringify(p.stdout.slice(-40))}`);
      check(`1 large knowledge (run ${attempt}): exit 0, nothing on stderr`, p.status === 0 && p.stderr === "", `${p.status} ${p.stderr}`);
      check(`1 large knowledge (run ${attempt}): the knowledge is available and fresh`, json?.available === true, json?.reason);
      const got = json?.knowledge?.auditTopics ?? [];
      check(`1 large knowledge (run ${attempt}): every audit topic arrived, the last one intact`, got.length === N && JSON.stringify(got[N - 1]) === JSON.stringify(topics[N - 1]), String(got.length));
      check(`1 large knowledge (run ${attempt}): byte for byte the documented format (2-space JSON + newline)`, json !== undefined && p.stdout === JSON.stringify(json, null, 2) + "\n");
    }
    const q = run("read-repo-knowledge", [repo, "--path", "src/app.ts"]);
    check("1 large knowledge with a query: complete JSON with the query answered", parse(q.stdout)?.query?.paths !== undefined && q.status === 0, q.stdout.slice(-200));
  }

  /* ── 2. the helper over a real pipe ──────────────────────────────────────── */
  {
    const helper = JSON.stringify(join(HERE, "write-output.ts"));
    const child = (body: string) => spawnSync(NODE, ["--no-warnings", "--input-type=module", "-e", `import { writeStdout, writeStderr } from ${helper};\n${body}`], { encoding: "utf-8", maxBuffer: 1 << 28 });
    const BIG = 5 * 1024 * 1024;
    const p = child(`writeStdout("x".repeat(${BIG}) + "\\n"); process.exit(3);`);
    check("2 5 MiB then process.exit(3): every byte arrives", p.stdout.length === BIG + 1, String(p.stdout.length));
    check("2 …and the exit code is the caller's", p.status === 3, String(p.status));
    const e = child(`writeStderr("y".repeat(${BIG})); writeStdout("{}\\n"); process.exit(1);`);
    check("2 stderr is written completely and kept apart from stdout", e.stderr.length === BIG && e.stdout === "{}\n" && e.status === 1, `${e.stderr.length} ${JSON.stringify(e.stdout)} ${e.status}`);
    const multi = child(`const s = "é€😀".repeat(200000); writeStdout(s); process.exit(0);`);
    check("2 multi-byte text arrives intact", multi.stdout === "é€😀".repeat(200000) && multi.status === 0);
    const gone = spawnSync("bash", ["-c", `"${NODE}" --no-warnings --input-type=module -e 'import { writeStdout } from ${helper}; writeStdout("z".repeat(${BIG})); process.exit(0);' | head -c 10 > /dev/null; echo "\${PIPESTATUS[0]}"`], { encoding: "utf-8" });
    check("2 a reader that goes away early is not a crash — the exit code stands", gone.stdout.trim() === "0", `${gone.stdout} ${gone.stderr}`);
    // Once anything touches process.stdout, libuv makes the pipe non-blocking: a full pipe then
    // throws EAGAIN from writeSync. A slow reader forces exactly that; every byte must still arrive.
    const slow = spawnSync("bash", ["-c", `"${NODE}" --no-warnings --input-type=module -e 'import { writeStdout } from ${helper}; void process.stdout; writeStdout("w".repeat(${BIG})); process.exit(4);' | (sleep 1; wc -c | tr -d " "); echo "exit=\${PIPESTATUS[0]}"`], { encoding: "utf-8" });
    check("2 a non-blocking pipe and a slow reader: every byte arrives, the exit code stands", slow.stdout.trim() === `${BIG}\nexit=4`, JSON.stringify(slow.stdout) + slow.stderr);
  }

  /* ── 3. every converted CLI: exit codes, streams, format ─────────────────── */
  {
    const jsonExit0 = (label: string, p: ReturnType<typeof run>, pred: (j: any) => boolean) => {
      const j = parse(p.stdout);
      check(`3 ${label}: one JSON object, exit 0, nothing on stderr`, j !== undefined && p.status === 0 && p.stderr === "", `${p.status} ${p.stderr} ${p.stdout.slice(0, 120)}`);
      check(`3 ${label}: the documented format (2-space JSON + newline)`, j !== undefined && p.stdout === JSON.stringify(j, null, 2) + "\n");
      check(`3 ${label}: the expected result`, j !== undefined && pred(j), p.stdout.slice(0, 200));
    };
    jsonExit0("analyze-bug (unknown command)", run("analyze-bug", ["nope"]), (j) => j.ok === false);
    jsonExit0("bug-implementation (unknown command)", run("bug-implementation", []), (j) => j.outcome === "UNKNOWN_COMMAND");
    jsonExit0("bug-intake (missing argument)", run("bug-intake", ["lookup"]), (j) => typeof j === "object");
    jsonExit0("bug-review (unknown command)", run("bug-review", []), (j) => j.outcome === "UNKNOWN_COMMAND");
    jsonExit0("bug-work-plan (unknown command)", run("bug-work-plan", []), (j) => j.ok === false && j.errors?.[0]?.code === "UNKNOWN_COMMAND");
    jsonExit0("migrate-planning-doc (no path)", run("migrate-planning-doc", []), (j) => typeof j.status === "string");
    jsonExit0("qa-handoff-gate (unknown command)", run("qa-handoff-gate", []), (j) => j.outcome === "UNKNOWN_COMMAND");
    jsonExit0("qa-release-gate (no artifacts)", run("qa-release-gate", []), (j) => typeof j.qa_section_markdown === "string");
    jsonExit0("work-approval (unknown command)", run("work-approval", []), (j) => j.outcome === "REFUSED" || j.ok === false || typeof j === "object");
    jsonExit0("task-state (unknown mode)", run("task-state", ["bogus"]), (j) => j.status === "refused" && j.reason === "invalid-state");
    jsonExit0("task-state (fingerprint without --file)", run("task-state", ["fingerprint"]), (j) => j.status === "invalid");
    jsonExit0("task-state (invalid bug work id)", run("task-state", ["read", "--feature", "bug:../x"]), (j) => j.status === "invalid");
    const bv = run("bug-verification", ["record", "bug:BUG-1", "--root", TMP, `--results=${join(TMP, "missing.json")}`]);
    check("3 bug-verification (unreadable results): one compact JSON line, exit 0", parse(bv.stdout)?.code === "RESULTS_UNREADABLE" && bv.status === 0 && bv.stdout.trim().split("\n").length === 1 && bv.stderr === "", bv.stdout + bv.stderr);
    jsonExit0("read-repo-knowledge (no manifest)", run("read-repo-knowledge", [TMP]), (j) => j.available === false);

    // resolve-target-repo-root keeps its three exit codes and its stream split.
    const repo = join(TMP, "plain");
    mkdirSync(repo);
    git(repo, "init", "-q");
    jsonExit0("resolve-target-repo-root (a repository)", run("resolve-target-repo-root", [repo]), (j) => j.ok === true);
    const none = run("resolve-target-repo-root", ["--project"]);
    check("3 resolve-target-repo-root --project without a path: exit 1, message on stderr only", none.status === 1 && none.stdout === "" && none.stderr === "--project needs a path\n", JSON.stringify(none));
    const missing = run("resolve-target-repo-root", [join(TMP, "nowhere")]);
    check("3 resolve-target-repo-root on a missing path: exit 1, message on stderr only", missing.status === 1 && missing.stdout === "" && /Candidate path not found/.test(missing.stderr) && missing.stderr.endsWith("\n"), JSON.stringify(missing));
    const r3 = run("resolve-target-repo-root", [repo, "--project", join(TMP, "nowhere")]);
    const j3 = parse(r3.stdout);
    check("3 resolve-target-repo-root with a --project that does not exist: exit 3 with its JSON", r3.status === 3 && j3?.ok === false && r3.stdout === JSON.stringify(j3, null, 2) + "\n", `${r3.status} ${r3.stdout.slice(0, 120)}`);
  }

  /* ── 4. no runtime script can lose output to process.exit() ─────────────── */
  {
    const code = (f: string) => readFileSync(join(HERE, f), "utf-8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const runtime = readdirSync(HERE).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !["check.ts", "reference-integrity.ts", "write-output.ts"].includes(f));
    const exiting = runtime.filter((f) => /process\.exit\(/.test(code(f)));
    check("4 the scripts that exit early are found", exiting.length >= 13, exiting.join(","));
    for (const f of exiting) {
      const src = code(f);
      check(`4 ${f}: calls process.exit(), so writes only through write-output.ts`, !/console\.(log|error|warn|info)\(|process\.std(out|err)\.write\(/.test(src) && /from "\.\/write-output\.ts"/.test(src));
    }
    for (const f of ["check.ts", "reference-integrity.ts"]) {
      check(`4 ${f}: sets process.exitCode instead of calling process.exit()`, !/process\.exit\(/.test(code(f)) && /process\.exitCode = /.test(code(f)));
    }
    const ci = spawnSync(NODE, ["--no-warnings", join(HERE, "reference-integrity.ts")], { encoding: "utf-8" });
    check("4 reference-integrity still exits 0 with its full report", ci.status === 0 && /No defects\.\n$/.test(ci.stdout), `${ci.status} ${ci.stdout.slice(-80)}`);
    check("the suite is registered", readFileSync(join(HERE, "check.ts"), "utf-8").includes('"write-output"'));
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nall write-output checks passed" : `\n${failures} write-output check(s) FAILED`);
process.exit(failures > 0 ? 1 : 0);
