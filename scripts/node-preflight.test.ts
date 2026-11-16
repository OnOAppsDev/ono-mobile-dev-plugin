/**
 * node-preflight.test.ts
 *
 * The plugin's runtime scripts are TypeScript run directly by `node`, so they need Node.js
 * 22.18+ on the 22 line, or 24+. scripts/node-preflight.mjs is the plain-JavaScript check
 * that runs — and explains — on the Node versions that cannot run them. This suite holds:
 *
 *   1. the version rule, at every boundary;
 *   2. the verdict and its message: the version found, where it is, what is required;
 *   3. the CLI on the Node.js running this suite, and that importing it runs nothing;
 *   4. that the file stays runnable on old Node (plain .mjs, no new syntax, no dependency);
 *   5. that every command which runs a plugin script — directly, or through a skill or agent
 *      it names — opens with the canonical preflight step.
 *
 * A real Node 20 / 22.17 cannot run this .ts suite, so they are exercised the other way: the
 * code-approval hook's unsupported-Node.js behaviour is covered by edit-approval.test.ts with
 * a stand-in `node`, and the real binaries are a manual release check (README § Requirements).
 *
 * No external test framework. Run with:
 *   node --no-warnings scripts/node-preflight.test.ts
 * or through the aggregator:
 *   node scripts/check.ts --only node-preflight
 */

import { spawnSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { COMMAND_STEP, REQUIRED, isSupported, preflight } from "./node-preflight.mjs";

const HERE = import.meta.dirname ?? __dirname;
const REPO_ROOT = dirname(HERE);
const SCRIPT = join(HERE, "node-preflight.mjs");
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf-8");

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

/* ── 1. the version rule ──────────────────────────────────────────────────── */
{
  const UNSUPPORTED = ["18.20.8", "20.0.0", "20.19.5", "21.7.3", "22.0.0", "22.6.0", "22.12.0", "22.17.1", "23.0.0", "23.6.0", "23.11.1"];
  const SUPPORTED = ["22.18.0", "22.18.1", "22.21.1", "22.99.0", "24.0.0", "24.2.0", "25.1.0", "26.0.0", "30.0.0"];
  for (const v of UNSUPPORTED) check(`1 Node.js ${v} is unsupported`, isSupported(v) === false);
  for (const v of SUPPORTED) check(`1 Node.js ${v} is supported`, isSupported(v) === true);
  check("1 boundary: 22.17.x is the last unsupported Node 22", !isSupported("22.17.99") && isSupported("22.18.0"));
  check("1 boundary: no Node 23 release is supported, however late", !isSupported("23.99.99"));
  check("1 boundary: 24.0.0 is supported", isSupported("24.0.0"));
  check("1 a leading v is accepted, as in `node -v`", isSupported("v22.18.0") && !isSupported("v20.19.5"));
  check("1 a pre-release of a supported line is supported", isSupported("24.0.0-rc.1") && isSupported("22.18.0-nightly2025"));
  for (const v of ["", "garbage", "22", "22.18", "x22.18.0"]) check(`1 an unreadable version (${JSON.stringify(v)}) is unsupported`, isSupported(v) === false);
}

/* ── 2. the verdict and its message ───────────────────────────────────────── */
{
  const bad = preflight("v20.19.5", "/opt/node-20/bin/node");
  check("2 unsupported: supported is false", bad.supported === false);
  check("2 unsupported: the version is reported without the v", bad.version === "20.19.5");
  check("2 unsupported: the resolved executable is reported", bad.execPath === "/opt/node-20/bin/node" && bad.message.includes("/opt/node-20/bin/node"));
  check("2 unsupported: the message names the version found", bad.message.includes("v20.19.5"));
  check("2 unsupported: the message names the minimum supported versions", bad.required === REQUIRED && bad.message.includes(REQUIRED) && /22\.18\.0/.test(REQUIRED) && /24/.test(REQUIRED));
  check("2 unsupported: the message says what is not supported", /Node 20/.test(bad.message) && /Node 23/.test(bad.message));
  check("2 unsupported: the message is actionable — upgrade, restart, check inside Claude Code", /Upgrade/.test(bad.message) && /restart Claude Code/.test(bad.message) && bad.message.includes("`! node -v`") && bad.message.includes("`! which node`"));
  check("2 unsupported: the message warns the terminal's Node.js can differ", /differ from the one\s+in your terminal/.test(bad.message));
  const odd = preflight("22.17.1", "/usr/local/bin/node");
  check("2 unsupported: 22.17.1 is refused with the same guidance", odd.supported === false && odd.message.includes("v22.17.1") && odd.message.includes(REQUIRED));
  const good = preflight("22.18.0", "/usr/local/bin/node");
  check("2 supported: supported is true, with a plain confirmation", good.supported === true && good.message === "Node.js v22.18.0 (/usr/local/bin/node) is supported.");
  check("2 the verdict has exactly the documented fields", JSON.stringify(Object.keys(bad).sort()) === JSON.stringify(["execPath", "message", "required", "supported", "version"]));
}

/* ── 3. the CLI ───────────────────────────────────────────────────────────── */
{
  const run = spawnSync(process.execPath, [SCRIPT], { encoding: "utf-8" });
  let out: any = null;
  try {
    out = JSON.parse(run.stdout);
  } catch {
    /* not JSON */
  }
  check("3 the CLI prints one JSON verdict", out !== null && run.stdout.trim().split("\n").length === 1, run.stdout + run.stderr);
  check("3 the CLI reports the Node.js actually running it", out?.version === process.versions.node && out?.execPath === process.execPath, run.stdout);
  check("3 on this (supported) Node.js it exits 0 and says supported", run.status === 0 && out?.supported === true, `${run.status} ${run.stdout}`);
  check("3 it prints nothing on stderr", run.stderr === "", run.stderr);
  const viaPath = spawnSync("bash", ["-c", `node "${SCRIPT}"`], { encoding: "utf-8", env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}` } });
  check("3 run as `node <path>`, as the commands run it", viaPath.status === 0 && JSON.parse(viaPath.stdout).supported === true, viaPath.stdout + viaPath.stderr);
  const imported = spawnSync(process.execPath, ["--input-type=module", "-e", `import(${JSON.stringify(SCRIPT)}).then((m) => { if (typeof m.preflight !== "function") process.exit(9); })`], { encoding: "utf-8" });
  check("3 importing it runs no check and prints nothing", imported.status === 0 && imported.stdout === "", `${imported.status} ${imported.stdout}`);
}

/* ── 4. runnable where the TypeScript scripts are not ─────────────────────── */
{
  const src = readFileSync(SCRIPT, "utf-8");
  const code = src.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check("4 it is plain JavaScript (.mjs), not TypeScript", SCRIPT.endsWith(".mjs") && !/:\s*(string|boolean|number|any)\b|\binterface\s|\btype\s+\w+\s*=/.test(code));
  check("4 it imports only Node built-ins", [...code.matchAll(/^import .* from "([^"]+)";$/gm)].every((m) => ["fs", "url"].includes(m[1])));
  check("4 no syntax newer Node needs: no ?. no ?? no top-level await", !/\?\.|\?\?|^await\s/m.test(code));
  check("4 it sets process.exitCode instead of calling process.exit", /process\.exitCode =/.test(code) && !/process\.exit\(/.test(code));
}

/* ── 5. every command that runs a plugin script runs the preflight first ──── */
{
  const RUNTIME = readdirSync(HERE)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !["check.ts", "reference-integrity.ts"].includes(f))
    .map((f) => f.replace(/\.ts$/, ""));
  const runsDirectly = (t: string) => RUNTIME.some((s) => t.includes(`scripts/${s}.ts`));
  // Skills and agents a command can reach, by their backticked name.
  const components = new Map<string, string>();
  for (const d of readdirSync(join(REPO_ROOT, "skills"))) if (existsSync(join(REPO_ROOT, "skills", d, "SKILL.md"))) components.set(d, read(`skills/${d}/SKILL.md`));
  for (const f of readdirSync(join(REPO_ROOT, "agents"))) if (f.endsWith(".md")) components.set(f.replace(/\.md$/, ""), read(`agents/${f}`));
  const reaches = (t: string) => [...components.keys()].filter((n) => t.includes(`\`${n}\``) || t.includes(`skills/${n}/SKILL.md`) || t.includes(`agents/${n}.md`));
  const runsScripts = (t: string): boolean => {
    const seen = new Set<string>();
    const queue = [t];
    while (queue.length) {
      const cur = queue.pop() as string;
      if (runsDirectly(cur)) return true;
      for (const n of reaches(cur)) if (!seen.has(n)) (seen.add(n), queue.push(components.get(n) as string));
    }
    return false;
  };

  const commands = readdirSync(join(REPO_ROOT, "commands")).filter((f) => f.endsWith(".md")).sort();
  const running = commands.filter((f) => runsScripts(read(`commands/${f}`)));
  check("5 the runtime scripts are found", RUNTIME.includes("edit-approval") && RUNTIME.includes("task-state") && RUNTIME.length >= 15, RUNTIME.join(","));
  check("5 a command reaching scripts only through an agent is found (/review-security via repo-analyst)", running.includes("review-security.md"));
  for (const f of running) {
    const t = read(`commands/${f}`);
    const body = t.slice(t.indexOf("\n---\n", 4) + 5);
    check(`5 commands/${f} opens with the Node.js preflight step`, body.startsWith(`\n${COMMAND_STEP}\n\n`), body.slice(0, 120));
    const first = RUNTIME.map((s) => t.indexOf(`scripts/${s}.ts`)).filter((i) => i >= 0);
    check(`5 commands/${f}: the preflight comes before any plugin script`, first.length === 0 || t.indexOf(COMMAND_STEP) < Math.min(...first));
  }
  // Pinned, so a change in what the detection finds is seen, not silently absorbed.
  const EXPECTED = ["analyze-bug.md", "analyze-feature.md", "create-dev-qa-notes.md", "dev-design-start.md", "dev-feature-start.md", "fix-review-comments.md", "implement-task.md", "prepare-mobile-release.md", "review-code.md", "review-security.md", "rn-sync-figma-theme.md", "verify-fix-cycle.md"];
  check("5 the commands that run plugin scripts are exactly the expected set", JSON.stringify(running) === JSON.stringify(EXPECTED), running.join(","));
  for (const f of commands.filter((c) => !running.includes(c))) check(`5 commands/${f} runs no plugin script and carries no preflight`, !read(`commands/${f}`).includes(COMMAND_STEP));
  check("5 the step names the script it runs, at its real path", COMMAND_STEP.includes('`node "${CLAUDE_PLUGIN_ROOT}/scripts/node-preflight.mjs"`') && existsSync(SCRIPT));
  check("5 the step says to stop and show the message", /stop: show the developer its `message` verbatim and run nothing else/.test(COMMAND_STEP));
}

/* ── documentation ───────────────────────────────────────────────────────── */
{
  const readme = read("README.md");
  const req = readme.slice(readme.indexOf("## Requirements"), readme.indexOf("\n## ", readme.indexOf("## Requirements") + 3));
  check("docs: README has a Requirements section", req.startsWith("## Requirements"));
  check("docs: README states the supported Node.js versions", req.includes("Node.js 22.18.0 or later on Node 22, or Node.js 24 or later"));
  check("docs: README names what is not supported", /Node 20/.test(req) && /Node 22 before 22\.18/.test(req) && /every Node 23 release/.test(req));
  check("docs: README warns Claude Code's Node.js can differ from the terminal's", /can differ from the one in your terminal/.test(req) && req.includes("`! node -v`"));
  check("docs: README describes the preflight and the hook's explanation", req.includes("scripts/node-preflight.mjs") && /require-approval-before-code/.test(req));
  const stale = readdirSync(HERE).filter((f) => f.endsWith(".ts") && /Node >= 23\.6/.test(readFileSync(join(HERE, f), "utf-8")) && f !== "node-preflight.test.ts");
  check("docs: no script header still claims Node >= 23.6", stale.length === 0, stale.join(","));
  check("the suite is registered", read("scripts/check.ts").includes('"node-preflight"'));
}

console.log(failures === 0 ? "\nall node-preflight checks passed" : `\n${failures} node-preflight check(s) FAILED`);
process.exit(failures > 0 ? 1 : 0);
