# hook-json.sh — the one way the plugin's hooks read JSON and write their decision. Sourced by
# scan-for-secrets.sh, block-main-branch-changes.sh, require-approval-before-code.sh and
# review-pr-guard.sh; it defines functions only and changes no option of the hook sourcing it.
#
#   json_get <json> <spec>        print the value <spec> selects from <json>
#                                 returns 0 — read (the value may be empty: a missing field or null)
#                                         1 — the JSON cannot be read: malformed, empty, several
#                                             documents, or a path into a non-object
#                                         3 — neither jq nor Node.js is available to read it
#   json_runtime                  print "jq", "node" or nothing — what json_get will use
#   hook_decision <decision> <reason>
#                                 print a PreToolUse permission decision ("ask", "deny", "allow")
#                                 as JSON — built in bash, so no runtime is needed to say no
#
# Runtimes, in order: jq when it is installed (fast; macOS 15+ and most Linux images have it);
# otherwise Node.js — which the plugin already requires — through hook-json.mjs next to this
# file. A Node.js that is installed but cannot start (a broken install) is a read failure, never
# a pass. With neither, json_get returns 3 and each hook keeps its fail-closed decision.
#
# The spec language (both runtimes, compared by scripts/hook-json.test.ts):
#   .a.b               the value at that path
#   .a.b // .c.d       the first alternative whose value is not null
#   @edits             the MultiEdit edits' new_string values, joined with "\n"
# Output: a string as is; true/false/numbers as JSON text; objects and arrays as compact JSON;
# null or missing as nothing.

HOOK_JSON_DIR="${BASH_SOURCE[0]%/*}"

# Windows: Git Bash. macOS/Linux: their package managers.
HOOK_JSON_INSTALL_HINT="Install jq — Windows: open PowerShell and run  winget install jqlang.jq  · macOS: brew install jq · Linux: sudo apt-get install -y jq — then restart Claude Code from a new window. Node.js 22.18+ / 24+ (already required by the plugin) is used when jq is missing"

json_runtime() {
  if command -v jq >/dev/null 2>&1; then
    printf 'jq'
  elif command -v node >/dev/null 2>&1; then
    printf 'node'
  fi
}

# The jq program for a spec: one document exactly, the same output rules as hook-json.mjs.
_hook_json_jq_program() {
  local spec="$1" render body alt first=1
  render='if . == null then empty elif type == "string" then . else tojson end'
  if [ "$spec" = "@edits" ]; then
    body='(.tool_input // null) as $ti | (if $ti == null then null elif ($ti | type) == "object" then $ti.edits else error("unreadable") end) as $e
      | if $e == null then ""
        elif ($e | type) != "array" then error("unreadable")
        else [ $e[] | if . == null then "" elif type == "object" then (.new_string | if . == null then "" elif type == "string" then . else tojson end) else error("unreadable") end ] | join("\n")
        end'
  else
    # Every alternative must be a plain path (.a.b), exactly what hook-json.mjs accepts.
    body='['
    local rest="$spec"
    while :; do
      alt="${rest%% // *}"
      alt="${alt#"${alt%%[![:space:]]*}"}"; alt="${alt%"${alt##*[![:space:]]}"}"
      [[ "$alt" =~ ^(\.[A-Za-z_][A-Za-z0-9_]*)+$ ]] || return 1
      # .a.b with each step refusing to index a non-object (jq would iterate or index arrays).
      local steps="${alt#.}" step expr='.'
      local IFS_saved="$IFS"; IFS='.'
      for step in $steps; do
        expr="${expr} | if . == null then null elif type == \"object\" then .${step} else error(\"unreadable\") end"
      done
      IFS="$IFS_saved"
      [ "$first" = 1 ] || body="${body}, "
      body="${body}(${expr})"
      first=0
      [ "$rest" = "${rest#* // }" ] && break
      rest="${rest#* // }"
    done
    # Not jq's `//`: that also skips false, and a false value must read as "false".
    body="${body}] | map(select(. != null)) | (if length == 0 then null else .[0] end)"
    body="(${body}) | ${render}"
  fi
  printf 'if length != 1 then error("unreadable") else .[0] | %s end' "$body"
}

json_get() {
  local json="$1" spec="$2" runtime program
  # Nothing to read is not "no fields": it is an unreadable call.
  [[ "$json" =~ [^[:space:]] ]] || return 1
  runtime="$(json_runtime)"
  case "$runtime" in
    jq)
      program="$(_hook_json_jq_program "$spec")" || return 1
      jq -rj --slurp "$program" <<<"$json" 2>/dev/null || return 1
      ;;
    node)
      [ -f "${HOOK_JSON_DIR}/hook-json.mjs" ] || return 1
      node "${HOOK_JSON_DIR}/hook-json.mjs" "$spec" <<<"$json" 2>/dev/null || return 1
      ;;
    *)
      return 3
      ;;
  esac
}

# A JSON string literal for any text: backslash, quote and every control character escaped;
# everything else (Unicode, Hebrew, Windows paths) is kept as is.
json_quote() {
  local s="$1" out="" c i
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  if [[ "$s" =~ [[:cntrl:]] ]]; then
    # Remaining control characters (rare): \u00XX each. LC_ALL=C makes the loop byte-wise, so a
    # multi-byte UTF-8 character passes through unchanged.
    local LC_ALL=C
    for ((i = 0; i < ${#s}; i++)); do
      c="${s:i:1}"
      if [[ "$c" =~ [[:cntrl:]] ]]; then
        printf -v c '\\u%04x' "'$c"
      fi
      out+="$c"
    done
    s="$out"
  fi
  printf '"%s"' "$s"
}

hook_decision() {
  printf '{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": %s, "permissionDecisionReason": %s}}\n' "$(json_quote "$1")" "$(json_quote "$2")"
}
