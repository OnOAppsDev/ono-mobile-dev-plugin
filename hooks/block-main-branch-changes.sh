#!/usr/bin/env bash
# PreToolUse hook: blocks Write/Edit/MultiEdit/NotebookEdit while the project is checked out
# on main or master, to force feature-branch workflow. Fails open (allows) if the project
# isn't a git repo or the branch can't be determined.
#
# Scope: the project repository — every path under its top level, symlinks resolved. A file
# outside it (the session scratch directory, a temp file) is not a change to the project and
# is let through. A target that cannot be placed — no path in the payload, a symlink, a
# payload that cannot be read, or no jq to read it — is treated as a project file, so on
# main/master it is blocked (fail closed): this hook never allows more than it can prove.
#
# Not a complete barrier: a shell command can still write files. This hook covers the
# file-editing tools it is registered for.
set -uo pipefail

payload="$(cat)"

project_dir="${CLAUDE_PROJECT_DIR:-.}"
branch="$(cd "$project_dir" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null)"

case "$branch" in
  main|master) ;;
  *) exit 0 ;;
esac

block() {
  echo "Blocked: direct changes on '${branch}' are not allowed. Create a feature branch before making code changes.${1:-}" >&2
  exit 2
}

# Without jq the payload cannot be read — neither the tool nor the file. The matcher only
# sends file-editing tools here, so this is a write to an unknown file: fail closed.
command -v jq >/dev/null 2>&1 || block " (jq is not installed, so this hook cannot tell which file is being changed; install jq.)"

tool_name="$(jq -r '.tool_name // empty' <<<"$payload" 2>/dev/null)" || block " (the tool call could not be read.)"
case "$tool_name" in
  Write|Edit|MultiEdit|NotebookEdit) ;;
  "") block " (the tool call could not be read.)" ;;
  *) exit 0 ;;
esac

target="$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$payload" 2>/dev/null)" || block
[ -n "$target" ] || block
[ -L "$target" ] && block

project_top="$(cd "$project_dir" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null)"
[ -n "$project_top" ] || exit 0
project_top="$(cd "$project_top" && pwd -P)"

case "$target" in
  /*) ;;
  *)
    base="$(jq -r '.cwd // empty' <<<"$payload" 2>/dev/null)"
    target="${base:-$project_dir}/$target"
    ;;
esac

# The nearest existing directory holding the target, with every symlink resolved.
dir="$(dirname "$target")"
while [ ! -d "$dir" ]; do
  # A dangling symlink on the way up could point anywhere once it is created: fail closed.
  [ -L "$dir" ] && block
  parent="$(dirname "$dir")"
  [ "$parent" = "$dir" ] && block
  dir="$parent"
done
real_dir="$(cd "$dir" 2>/dev/null && pwd -P)" || block

case "$real_dir/" in
  "$project_top"/*) block ;;
  *) exit 0 ;;
esac
