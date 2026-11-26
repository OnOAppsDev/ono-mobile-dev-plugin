#!/usr/bin/env bash
# PreToolUse hook: blocks Write/Edit/MultiEdit calls that introduce hardcoded
# secrets. Reads the tool-call JSON payload from stdin. Exit 2 + stderr blocks
# the call; exit 0 allows it. Never echo the matched secret value itself.
set -euo pipefail

payload="$(cat)"

# When the call cannot be read — no jq and no Node.js to read it, or a payload that cannot be
# parsed — the content cannot be scanned, so block (fail closed). Exiting with any other non-zero
# code would be a non-blocking hook error and let an unscanned write through.
unscannable() {
  echo "Blocked: $1, so this write cannot be scanned for hardcoded secrets (org policy: protect-secrets)." >&2
  exit 2
}
case "${BASH_SOURCE[0]}" in */*) hook_dir="${BASH_SOURCE[0]%/*}" ;; *) hook_dir="." ;; esac
# shellcheck source=lib/hook-json.sh
. "${hook_dir}/lib/hook-json.sh" 2>/dev/null || unscannable "the plugin's hook library (hooks/lib/hook-json.sh) is missing"

# field <spec>: the value in REPLY, or block — 3 is "no runtime", anything else "unreadable".
field() {
  local rc=0
  REPLY="$(json_get "$payload" "$1")" || rc=$?
  [ "$rc" = 3 ] && unscannable "jq is not installed and Node.js is not available to read the tool call. ${HOOK_JSON_INSTALL_HINT}"
  [ "$rc" = 0 ] || unscannable "the tool call could not be read"
  return 0
}

field '.tool_name'; tool_name="$REPLY"
field '.tool_input.file_path // .tool_input.notebook_path'; file_path="$REPLY"

case "$tool_name" in
  Write)
    field '.tool_input.content'; content="$REPLY"
    ;;
  Edit)
    field '.tool_input.new_string'; content="$REPLY"
    ;;
  MultiEdit)
    field '@edits'; content="$REPLY"
    ;;
  NotebookEdit)
    field '.tool_input.new_source'; content="$REPLY"
    ;;
  *)
    exit 0
    ;;
esac

[ -z "$content" ] && exit 0

# Pattern name -> regex (case-insensitive where relevant)
patterns=(
  "AWS access key ID:AKIA[0-9A-Z]{16}"
  "Private key block:-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"
  "GitHub token:gh[ps]_[A-Za-z0-9]{20,}"
  "GitHub fine-grained PAT:github_pat_[A-Za-z0-9_]{20,}"
  "Stripe live key:sk_live_[A-Za-z0-9]{16,}"
  "Slack token:xox[baprs]-[A-Za-z0-9-]{10,}"
  "Generic secret assignment:(api[_-]?key|secret|token|password)[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9_-]{16,}['\"]"
)

for entry in "${patterns[@]}"; do
  name="${entry%%:*}"
  regex="${entry#*:}"
  # grep: 0 = a match, 1 = no match, anything else (missing, broken) = the content was not
  # scanned — block, never treat it as "no match".
  rc=0
  grep -qEi -- "$regex" <<<"$content" || rc=$?
  if [ "$rc" = 0 ]; then
    echo "Blocked: possible hardcoded secret (${name}) in ${file_path:-<unknown file>}. Remove the credential and use secure storage/env injection instead (see standards/shared/mobile-security.md, SEC-SECRETS-*)." >&2
    exit 2
  fi
  [ "$rc" = 1 ] || unscannable "grep could not run (status ${rc})"
done

# .env* files: flag any KEY=value line with a non-placeholder-looking value.
# 0.9.3: the file name and the key name are compared without regard to case (.ENV is .env on
# macOS and Windows, and dotenv reads db_password as well as DB_PASSWORD), and a line may start
# with `export ` or put spaces around `=`. Only those two comparisons ignore case — the
# placeholder exemptions below are unchanged.
env_file=no
shopt -s nocasematch
[[ "$file_path" == *".env"* ]] && env_file=yes
shopt -u nocasematch
if [ "$env_file" = yes ]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.+)$ ]] || continue
    key="${BASH_REMATCH[2]}"
    value="${BASH_REMATCH[3]}"
    value="${value%\"}"; value="${value#\"}"

    # Only scrutinize keys whose name suggests they hold a credential — an
    # env file has plenty of legitimate non-secret config (URLs, flags,
    # ports) that shouldn't trip this check.
    credential_key=no
    shopt -s nocasematch
    [[ "$key" =~ (SECRET|TOKEN|PASSWORD|PRIVATE_KEY|CREDENTIAL|API_KEY|ACCESS_KEY) ]] && credential_key=yes
    shopt -u nocasematch
    [ "$credential_key" = yes ] || continue

    case "$value" in
      ""|changeme|CHANGEME|example|EXAMPLE|your-*|YOUR-*|xxx*|XXX*|placeholder*|PLACEHOLDER*)
        continue
        ;;
      *)
        # Short values (flags, single words < 12 chars) are unlikely to be
        # real credentials — avoid flagging things like FOO_TOKEN=none.
        [ "${#value}" -lt 12 ] && continue
        echo "Blocked: ${file_path} sets ${key} to what looks like a real credential. Commit only .env.example with placeholder values (SEC-SECRETS-3)." >&2
        exit 2
        ;;
    esac
  done <<<"$content"
fi

exit 0
