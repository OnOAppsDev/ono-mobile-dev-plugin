#!/usr/bin/env bash
# PreToolUse hook: blocks Write/Edit/MultiEdit calls that introduce hardcoded
# secrets. Reads the tool-call JSON payload from stdin. Exit 2 + stderr blocks
# the call; exit 0 allows it. Never echo the matched secret value itself.
set -euo pipefail

payload="$(cat)"

# When the call cannot be read — no jq, or a payload jq cannot parse — the content cannot be
# scanned, so block (fail closed). Exiting with any other non-zero code would be a non-blocking
# hook error and let an unscanned write through.
unscannable() {
  echo "Blocked: $1, so this write cannot be scanned for hardcoded secrets (org policy: protect-secrets)." >&2
  exit 2
}
command -v jq >/dev/null 2>&1 || unscannable "jq is not installed (install jq)"

tool_name="$(jq -r '.tool_name // empty' <<<"$payload" 2>/dev/null)" || unscannable "the tool call could not be read"
file_path="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$payload" 2>/dev/null)" || unscannable "the tool call could not be read"

case "$tool_name" in
  Write)
    content="$(jq -r '.tool_input.content // empty' <<<"$payload")"
    ;;
  Edit)
    content="$(jq -r '.tool_input.new_string // empty' <<<"$payload")"
    ;;
  MultiEdit)
    content="$(jq -r '[.tool_input.edits[]?.new_string] | join("\n")' <<<"$payload")"
    ;;
  NotebookEdit)
    content="$(jq -r '.tool_input.new_source // empty' <<<"$payload")"
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
  if grep -qEi -- "$regex" <<<"$content"; then
    echo "Blocked: possible hardcoded secret (${name}) in ${file_path:-<unknown file>}. Remove the credential and use secure storage/env injection instead (see standards/shared/mobile-security.md, SEC-SECRETS-*)." >&2
    exit 2
  fi
done

# .env* files: flag any KEY=value line with a non-placeholder-looking value.
if [[ "$file_path" == *".env"* ]]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.+)$ ]] || continue
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    value="${value%\"}"; value="${value#\"}"

    # Only scrutinize keys whose name suggests they hold a credential — an
    # env file has plenty of legitimate non-secret config (URLs, flags,
    # ports) that shouldn't trip this check.
    [[ "$key" =~ (SECRET|TOKEN|PASSWORD|PRIVATE_KEY|CREDENTIAL|API_KEY|ACCESS_KEY) ]] || continue

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
