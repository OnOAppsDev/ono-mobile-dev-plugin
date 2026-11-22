#!/usr/bin/env bash
# PreToolUse hook: structural read-only enforcement for /review-pr (the pr-reviewer agent).
#
# Acts only on a tool call made inside the pr-reviewer agent (the payload's agent_type is
# `pr-reviewer` or `<plugin>:pr-reviewer`); every other call — the main session, every other
# agent — passes through with no output, exactly as before this hook existed. Inside the
# reviewer it allows only reading:
#
#   Read, Grep, Glob, LS, Skill                  reading local files and methodology (a developer may
#                                                read what they already can — no directory limits)
#   Bash                                         ONLY this plugin's GET-only helper
#                                                (scripts/bitbucket-pr.ts fetch|file|cleanup …) and the
#                                                Node.js preflight — one command, no shell
#                                                operators, no substitutions, no redirection
#   mcp__*                                       ONLY Figma design reads and Atlassian page reads
#
# and denies everything else — every writing tool, every other command (git, curl, …), every
# other MCP tool (comments, transitions, edits), and every general network tool
# (WebFetch, WebSearch). When the call cannot be inspected (no jq, an
# unreadable payload) and the raw payload names the reviewer, it denies: fail closed.
set -uo pipefail

# Read stdin with a builtin, so the guard still works (and fails closed) on a minimal PATH.
IFS= read -r -d '' payload || true

deny() {
  local reason="$1"
  reason="${reason//\\/\\\\}"; reason="${reason//\"/\\\"}"
  printf '%s\n' "{\"hookSpecificOutput\": {\"hookEventName\": \"PreToolUse\", \"permissionDecision\": \"deny\", \"permissionDecisionReason\": \"${reason} (org policy: /review-pr is read-only).\"}}"
  exit 0
}

# Fast path: a payload that does not mention the reviewer is not the reviewer's.
case "$payload" in *pr-reviewer*) ;; *) exit 0 ;; esac
raw_reviewer() { [[ $payload =~ \"agent_type\"[[:space:]]*:[[:space:]]*\"([A-Za-z0-9_.-]+:)?pr-reviewer\" ]]; }

if ! command -v jq >/dev/null 2>&1; then
  raw_reviewer && deny "jq is not installed, so the read-only guard cannot inspect this call"
  exit 0
fi
agent="$(jq -r '.agent_type // empty' <<<"$payload" 2>/dev/null)" || { raw_reviewer && deny "the tool call could not be read"; exit 0; }
case "$agent" in
  pr-reviewer|*:pr-reviewer) ;;
  *) exit 0 ;;
esac

tool="$(jq -r '.tool_name // empty' <<<"$payload" 2>/dev/null)" || deny "the tool call could not be read"
plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "${0%/*}/.." && pwd)}"

case "$tool" in
  Read|Grep|Glob|LS|Skill)
    exit 0
    ;;
  WebFetch|WebSearch)
    deny "${tool} is not available to the reviewer — it has no general network tool; Bitbucket is read through scripts/bitbucket-pr.ts, Figma and Atlassian through their read tools"
    ;;
  Bash)
    cmd="$(jq -r '.tool_input.command // empty' <<<"$payload" 2>/dev/null)" || deny "the command could not be read"
    case "$cmd" in
      *$'\n'*|*';'*|*'&'*|*'|'*|*'`'*|*'$'*|*'<'*|*'>'*|*'('*|*')'*|*'\'*)
        deny "only the GET-only review helper may run, as one plain command"
        ;;
    esac
    helper="node --no-warnings \"${plugin_root}/scripts/bitbucket-pr.ts\""
    preflight="node \"${plugin_root}/scripts/node-preflight.mjs\""
    case "$cmd" in
      "$helper fetch "*|"$helper file "*|"$helper cleanup "*|"$preflight")
        exit 0
        ;;
    esac
    deny "only scripts/bitbucket-pr.ts (fetch, file, cleanup) and the Node.js preflight may run in /review-pr"
    ;;
  mcp__*)
    case "$tool" in
      *__get_design_context|*__get_metadata|*__get_screenshot|*__get_variable_defs|*__getConfluenceContent|*__getConfluencePage|*__searchConfluence|*__getJiraIssue|*__getAccessibleAtlassianResources)
        exit 0
        ;;
    esac
    deny "MCP tool ${tool} is not a read the review may use"
    ;;
  *)
    deny "${tool:-this tool} is not available to the read-only reviewer"
    ;;
esac
