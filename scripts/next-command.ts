/**
 * next-command.ts
 *
 * The one representation of "the command to run next" that a helper hands back to a command:
 *
 *   { skill: "<plugin>:<command>", args: "<exact arguments>", display: "/<command> <arguments>" }
 *
 * `skill` and `args` are what Claude passes to the Skill tool when the developer says yes to
 * continuing; `display` is the copyable slash command shown when that invocation is not
 * possible. The plugin name is read from .claude-plugin/plugin.json, never repeated as a
 * literal, and only commands this plugin ships (commands/<command>.md) are emitted.
 * Subagent types are built the same way, from agents/<name>.md.
 *
 * A next command is an offer, never a decision: the command it names re-runs every one of its
 * own gates, and no approval is implied by chaining to it.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

const PLUGIN_ROOT = join(import.meta.dirname, "..");

export const PLUGIN_NAME: string = JSON.parse(readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf-8")).name;

export interface NextCommand {
  skill: string;
  args: string;
  display: string;
}

/** The fully qualified next command for one of this plugin's commands, with its arguments verbatim. */
export function nextCommand(command: string, args: string): NextCommand {
  if (!/^[a-z][a-z0-9-]*$/.test(command) || !existsSync(join(PLUGIN_ROOT, "commands", `${command}.md`))) {
    throw new Error(`next-command: ${PLUGIN_NAME} ships no command "${command}"`);
  }
  return { skill: `${PLUGIN_NAME}:${command}`, args, display: args ? `/${command} ${args}` : `/${command}` };
}

/**
 * A route string ("/implement-task bug:BUG-43 T2") as a next command — undefined when the route
 * still has a placeholder for the developer to fill (e.g. "/analyze-bug <bug-ref>"), which is
 * never invoked on their behalf.
 */
export function routeCommand(route: string | null | undefined): NextCommand | undefined {
  const m = /^\/([a-z][a-z0-9-]*)(?: (.*))?$/.exec(route ?? "");
  if (!m || /[<>]/.test(route as string)) return undefined;
  return nextCommand(m[1], m[2] ?? "");
}

/** The fully qualified subagent type for one of this plugin's agents. */
export function subagentType(agent: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(agent) || !existsSync(join(PLUGIN_ROOT, "agents", `${agent}.md`))) {
    throw new Error(`next-command: ${PLUGIN_NAME} ships no agent "${agent}"`);
  }
  return `${PLUGIN_NAME}:${agent}`;
}
