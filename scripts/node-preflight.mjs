#!/usr/bin/env node
/**
 * node-preflight.mjs — is the Node.js running this a version the plugin's scripts can run on?
 *
 *   node scripts/node-preflight.mjs
 *
 * Prints one JSON object — { supported, version, execPath, required, message } — and exits 0
 * when supported, 1 when not. Every command that runs a plugin script runs this first, and
 * the code-approval hook runs it when its helper produced no verdict.
 *
 * The plugin's runtime scripts are TypeScript files run directly by `node`, which needs
 * built-in type stripping without a flag: Node 22.18+ on the 22 line, or Node 24+. Node 20,
 * earlier Node 22 releases and every Node 23 release are unsupported (Node 23 is end-of-life,
 * and 23.6.0 — the first with unflagged type stripping — fails the plugin's own checks).
 *
 * This file is plain JavaScript on purpose: it must run, and explain, on exactly the Node
 * versions that cannot run the TypeScript scripts. Keep it dependency-free and keep its
 * syntax old (no optional chaining, no `??`, no top-level await), so a very old Node still
 * reaches the message instead of a syntax error.
 */
import { realpathSync } from "fs";
import { fileURLToPath } from "url";

export const REQUIRED = "Node.js 22.18.0 or later on Node 22, or Node.js 24 or later";

/**
 * The step every command that runs a plugin script carries, verbatim, as its first paragraph
 * after the frontmatter. node-preflight.test.ts holds each command to it.
 */
export const COMMAND_STEP =
  "**Node.js preflight — first, before any plugin script.** Run `node \"${CLAUDE_PLUGIN_ROOT}/scripts/node-preflight.mjs\"`. " +
  "If it exits non-zero, stop: show the developer its `message` verbatim and run nothing else — this command's helper scripts " +
  "cannot run on that Node.js (README § Requirements).";

/** Whether `version` ("22.18.0" or "v22.18.0") can run the plugin's TypeScript scripts. */
export function isSupported(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version));
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major >= 24) return true;
  return major === 22 && minor >= 18;
}

/** The preflight verdict for a Node version and the executable that reported it. */
export function preflight(version, execPath) {
  const v = String(version).replace(/^v/, "");
  const supported = isSupported(v);
  const message = supported
    ? "Node.js v" + v + " (" + execPath + ") is supported."
    : "Unsupported Node.js v" + v + " (" + execPath + "). The Ono Mobile Dev Plugin's scripts need " +
      REQUIRED + "; Node 20, earlier Node 22 releases and all Node 23 releases cannot run them. " +
      "Upgrade the Node.js that Claude Code uses, then restart Claude Code. It can differ from the one " +
      "in your terminal: check it inside Claude Code with `! node -v` and `! which node`.";
  return { supported: supported, version: v, execPath: execPath, required: REQUIRED, message: message };
}

function invokedDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch (e) {
    return false;
  }
}

if (invokedDirectly()) {
  const verdict = preflight(process.versions.node, process.execPath);
  console.log(JSON.stringify(verdict));
  process.exitCode = verdict.supported ? 0 : 1;
}
