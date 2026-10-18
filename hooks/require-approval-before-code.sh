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
set -euo pipefail

payload="$(cat)"

tool_name="$(jq -r '.tool_name // empty' <<<"$payload")"
file_path="$(jq -r '.tool_input.file_path // empty' <<<"$payload")"

case "$tool_name" in
  Write|Edit|MultiEdit) ;;
  *) exit 0 ;;
esac

[ -z "$file_path" ] && exit 0

ask() {
  jq -n --arg reason "$1" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $reason}}'
  exit 0
}

case "$file_path" in
  *.cycle-approval.json)
    ask "${file_path} is a Bug Fix Cycle approval record; it is written only by scripts/edit-approval.ts after a developer approves (org policy: require-approval-before-code)."
    ;;
  *.ts|*.tsx|*.js|*.jsx|*.swift|*.kt|*.kts|*.java|*.m|*.mm|*.cpp|*.h)
    reason="Code file change to ${file_path} requires explicit approval before writing (org policy: require-approval-before-code)."
    plugin_root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
    cwd="$(jq -r '.cwd // empty' <<<"$payload")"
    verdict="$(node --no-warnings "${plugin_root}/scripts/edit-approval.ts" check --file "$file_path" --cwd "${cwd:-$PWD}" 2>/dev/null || true)"
    decision="$(jq -r '.decision // empty' <<<"$verdict" 2>/dev/null || true)"
    note="$(jq -r '.hook_note // empty' <<<"$verdict" 2>/dev/null || true)"
    if [ "$decision" = "allow" ]; then
      jq -n --arg reason "Approved Bug Fix Cycle scope: ${note}" \
        '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: $reason}}'
      exit 0
    fi
    [ -n "$note" ] && reason="${reason} ${note}"
    ask "$reason"
    ;;
  *)
    exit 0
    ;;
esac
