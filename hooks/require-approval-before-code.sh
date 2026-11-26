#!/usr/bin/env bash
# PreToolUse hook: forces a human-approval prompt before any code file is
# written/edited, even in auto-approve/bypass-permissions modes. Non-code
# files (docs/config) pass through untouched. Reads the tool-call JSON
# payload from stdin.
#
# One exception, for bug work only (Bug Flow UX P0.3): when a developer has
# approved the current Bug Fix Cycle, an in-scope code edit is allowed without
# asking again. Whether it is, is decided only by scripts/edit-approval.ts —
# this script never reads a plan, task state or an approval itself. Anything
# but the helper's exact "allow" (no helper, no node, an error, any other
# outcome) asks, exactly as before. Feature work never has a cycle approval.
# When no cycle approval applies, the helper's note names the Ono command that
# starts or continues the work (shown with the ask; the decision is unchanged).
# The extension list below is kept equal to CODE_EXTENSIONS in
# scripts/edit-approval.ts by scripts/edit-approval.test.ts.
# When the helper cannot run because Node.js is too old for the plugin, the
# ask names the version found and the version required (scripts/node-preflight.mjs).
set -euo pipefail

payload="$(cat)"

# When the call cannot be read — neither jq nor Node.js to read it, or a payload that cannot be
# parsed — which file is being written is unknown, so ask, exactly as for a code file. Exiting
# non-zero here would be a non-blocking hook error and let the write through unasked. The
# decision JSON is built in bash (hook_decision), so no runtime is needed to ask.
unreadable() {
  # Static fallback for a missing hook library: the reason text is fixed and needs no escaping.
  if declare -F hook_decision >/dev/null 2>&1; then
    hook_decision ask "$1 (org policy: require-approval-before-code)."
  else
    printf '%s\n' "{\"hookSpecificOutput\": {\"hookEventName\": \"PreToolUse\", \"permissionDecision\": \"ask\", \"permissionDecisionReason\": \"The plugin's hook library is missing, so this hook cannot tell which file is being changed; explicit approval is required (org policy: require-approval-before-code).\"}}"
  fi
  exit 0
}
case "${BASH_SOURCE[0]}" in */*) hook_dir="${BASH_SOURCE[0]%/*}" ;; *) hook_dir="." ;; esac
# shellcheck source=lib/hook-json.sh
. "${hook_dir}/lib/hook-json.sh" 2>/dev/null || unreadable "missing hook library"

# field <json> <spec>: the value in REPLY, or ask — 3 is "no runtime", anything else
# "unreadable". Runs in this shell (never inside $(…)), so the ask reaches Claude Code.
field() {
  local rc=0
  REPLY="$(json_get "$1" "$2")" || rc=$?
  [ "$rc" = 3 ] && unreadable "jq is not installed and Node.js is not available, so this hook cannot tell which file is being changed; explicit approval is required. ${HOOK_JSON_INSTALL_HINT}"
  [ "$rc" = 0 ] || unreadable "The tool call could not be read, so explicit approval is required"
  return 0
}

field "$payload" '.tool_name'; tool_name="$REPLY"
field "$payload" '.tool_input.file_path'; file_path="$REPLY"

case "$tool_name" in
  Write|Edit|MultiEdit) ;;
  *) exit 0 ;;
esac

[ -z "$file_path" ] && exit 0

ask() {
  hook_decision ask "$1"
  exit 0
}

# Which file a name reaches (0.9.3). A file is classified by every spelling the filesystem may
# resolve to the same file, and matches when ANY of them does: the name as written; without
# trailing dots and spaces (Windows drops them — x.ts. is x.ts); and before its first colon
# (NTFS stream syntax — x.ts::$DATA is x.ts). Names compare without regard to case (X.TS is
# x.ts on macOS and Windows). More spellings can only add asks, never remove one. The same
# rule is nameForms/isCode in scripts/edit-approval.ts (pinned equal by edit-approval.test.ts).
name_forms() {
  local name="${1##*/}" cut t
  name="${name##*\\}"
  cut="${name%%:*}"
  FORMS=("$name" "$cut")
  for t in "$name" "$cut"; do
    while :; do case "$t" in *.|*" ") t="${t%?}" ;; *) break ;; esac; done
    FORMS+=("$t")
  done
}
code_name() {
  case "$1" in
  *.ts|*.tsx|*.js|*.jsx|*.swift|*.kt|*.kts|*.java|*.m|*.mm|*.cpp|*.h|*.c|*.cc|*.cxx|*.hpp|*.hh|*.mjs|*.cjs|*.mts|*.cts|*.gradle|*.groovy|*.css|*.scss|*.sass|*.less)
    return 0 ;;
  esac
  return 1
}
approval_record_name() {
  case "$1" in *.cycle-approval.json) return 0 ;; esac
  return 1
}
# any_form <test>: does any spelling of the file pass <test>, compared without regard to case?
any_form() {
  local f rc=1
  shopt -s nocasematch
  for f in "${FORMS[@]}"; do "$1" "$f" && { rc=0; break; }; done
  shopt -u nocasematch
  return "$rc"
}
name_forms "$file_path"
kind=other
if any_form approval_record_name; then kind=record; elif any_form code_name; then kind=code; fi

case "$kind" in
  record)
    ask "${file_path} is a Bug Fix Cycle approval record; it is written only by scripts/edit-approval.ts after a developer approves (org policy: require-approval-before-code)."
    ;;
  code)
    reason="Code file change to ${file_path} requires explicit approval before writing (org policy: require-approval-before-code)."
    plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
    field "$payload" '.cwd'; cwd="$REPLY"
    verdict="$(node --no-warnings "${plugin_root}/scripts/edit-approval.ts" check --file "$file_path" --cwd "${cwd:-$PWD}" 2>/dev/null || true)"
    # The helper's verdict is read with the same reader; anything unreadable is "no verdict" — ask.
    decision="$(json_get "$verdict" '.decision' 2>/dev/null || true)"
    note="$(json_get "$verdict" '.hook_note' 2>/dev/null || true)"
    if [ "$decision" = "allow" ]; then
      hook_decision allow "Approved Bug Fix Cycle scope: ${note}"
      exit 0
    fi
    [ -n "$note" ] && reason="${reason} ${note}"
    # No verdict at all usually means the helper could not run. When the cause is a Node.js
    # the plugin does not support, say so — otherwise every code edit, even inside an
    # approved Bug Fix Cycle, asks again with no explanation. The decision stays "ask"; a
    # preflight that cannot run or says anything else leaves the reason as it is.
    if [ -z "$verdict" ]; then
      preflight="$(node "${plugin_root}/scripts/node-preflight.mjs" 2>/dev/null || true)"
      if [ "$(json_get "$preflight" '.supported' 2>/dev/null || true)" = "false" ]; then
        node_message="$(json_get "$preflight" '.message' 2>/dev/null || true)"
        [ -n "$node_message" ] && reason="${reason} Bug Fix Cycle approvals cannot be checked, so this will be asked on every code edit until Node.js is upgraded: ${node_message}"
      fi
    fi
    ask "$reason"
    ;;
  *)
    exit 0
    ;;
esac
