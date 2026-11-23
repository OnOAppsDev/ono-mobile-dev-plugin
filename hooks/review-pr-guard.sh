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
#   Bash                                         ONLY this plugin's read-only PR helper
#                                                (scripts/pr-source.ts fetch|file|head|cleanup …) and
#                                                the Node.js preflight — one command, no shell
#                                                operators, no substitutions, no redirection
#   mcp__*                                       ONLY Figma design reads and Atlassian page reads
#
# and denies everything else — every writing tool, every other command (git, curl, …), every
# other MCP tool (comments, transitions, edits), and every general network tool
# (WebFetch, WebSearch). The payload is read with jq, or Node.js when jq is not installed
# (hooks/lib/hook-json.sh). When the call cannot be inspected (neither runtime, an unreadable
# payload, a missing hook library) and the raw payload names the reviewer, it denies: fail closed.
set -uo pipefail

# Read stdin with a builtin, so the guard still works (and fails closed) on a minimal PATH.
IFS= read -r -d '' payload || true

deny() {
  if declare -F hook_decision >/dev/null 2>&1; then
    hook_decision deny "$1 (org policy: /review-pr is read-only)."
  else
    printf '%s\n' '{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "The read-only guard cannot inspect this call (org policy: /review-pr is read-only)."}}'
  fi
  exit 0
}

# Fast path: a payload that does not mention the reviewer is not the reviewer's.
case "$payload" in *pr-reviewer*) ;; *) exit 0 ;; esac
raw_reviewer() { [[ $payload =~ \"agent_type\"[[:space:]]*:[[:space:]]*\"([A-Za-z0-9_.-]+:)?pr-reviewer\" ]]; }

case "${BASH_SOURCE[0]}" in */*) hook_dir="${BASH_SOURCE[0]%/*}" ;; *) hook_dir="." ;; esac
# shellcheck source=lib/hook-json.sh
if ! . "${hook_dir}/lib/hook-json.sh" 2>/dev/null; then
  raw_reviewer && deny "the hook library is missing, so the read-only guard cannot inspect this call"
  exit 0
fi

rc=0
agent="$(json_get "$payload" '.agent_type')" || rc=$?
if [ "$rc" != 0 ]; then
  if raw_reviewer; then
    [ "$rc" = 3 ] && deny "jq is not installed and Node.js is not available, so the read-only guard cannot inspect this call. ${HOOK_JSON_INSTALL_HINT}"
    deny "the tool call could not be read"
  fi
  exit 0
fi
case "$agent" in
  pr-reviewer|*:pr-reviewer) ;;
  *) exit 0 ;;
esac

tool="$(json_get "$payload" '.tool_name')" || deny "the tool call could not be read"
plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "${hook_dir}/.." && pwd)}"

case "$tool" in
  Read|Grep|Glob|LS|Skill)
    exit 0
    ;;
  WebFetch|WebSearch)
    deny "${tool} is not available to the reviewer — it has no general network tool; the pull request is read through scripts/pr-source.ts, Figma and Atlassian through their read tools"
    ;;
  Bash)
    cmd="$(json_get "$payload" '.tool_input.command')" || deny "the command could not be read"
    case "$cmd" in
      *$'\n'*|*';'*|*'&'*|*'|'*|*'`'*|*'$'*|*'<'*|*'>'*|*'('*|*')'*|*'\'*)
        deny "only the read-only review helper may run, as one plain command"
        ;;
    esac
    helper="node --no-warnings \"${plugin_root}/scripts/pr-source.ts\""
    preflight="node \"${plugin_root}/scripts/node-preflight.mjs\""
    case "$cmd" in
      "$helper fetch "*|"$helper file "*|"$helper head "*|"$helper cleanup "*|"$preflight")
        exit 0
        ;;
    esac
    deny "only scripts/pr-source.ts (fetch, file, head, cleanup) and the Node.js preflight may run in /review-pr"
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
