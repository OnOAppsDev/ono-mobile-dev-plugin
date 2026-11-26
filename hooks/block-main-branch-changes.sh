#!/usr/bin/env bash
# PreToolUse hook: blocks Write/Edit/MultiEdit/NotebookEdit while the project is checked out
# on main or master, to force feature-branch workflow. Fails open (allows) if the project
# isn't a git repo or the branch can't be determined.
#
# Scope: the project repository — every path under its top level, symlinks resolved. A file
# outside it (the session scratch directory, a temp file) is not a change to the project and
# is let through. A target that cannot be placed — no path in the payload, a symlink, a
# payload that cannot be read, or neither jq nor Node.js to read it — is treated as a project file, so on
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

case "${BASH_SOURCE[0]}" in */*) hook_dir="${BASH_SOURCE[0]%/*}" ;; *) hook_dir="." ;; esac
# shellcheck source=lib/hook-json.sh
. "${hook_dir}/lib/hook-json.sh" 2>/dev/null || block " (the plugin's hook library hooks/lib/hook-json.sh is missing, so this hook cannot tell which file is being changed.)"

# Without jq or Node.js the payload cannot be read — neither the tool nor the file. The matcher
# only sends file-editing tools here, so this is a write to an unknown file: fail closed.
# field <spec>: the value in REPLY, or block.
field() {
  local rc=0
  REPLY="$(json_get "$payload" "$1")" || rc=$?
  [ "$rc" = 3 ] && block " (jq is not installed and Node.js is not available, so this hook cannot tell which file is being changed. ${HOOK_JSON_INSTALL_HINT}.)"
  [ "$rc" = 0 ] || block " (the tool call could not be read.)"
  return 0
}

field '.tool_name'; tool_name="$REPLY"
case "$tool_name" in
  Write|Edit|MultiEdit|NotebookEdit) ;;
  "") block " (the tool call could not be read.)" ;;
  *) exit 0 ;;
esac

field '.tool_input.file_path // .tool_input.notebook_path'; target="$REPLY"
[ -n "$target" ] || block
# >>> Windows paths (0.9.2) — Git Bash only; on macOS and Linux this block is skipped entirely.
# Claude Code on Windows sends native paths (C:\repo\a.ts, C:/repo/a.ts, \\server\share\a.ts):
# they are absolute, but the checks below understand POSIX paths only and would join them onto
# the session directory — deciding by where the session is, not by where the file is. Convert a
# native absolute path (and a native session directory) with cygpath first. A drive-relative
# path (C:a.ts), a UNC path (\\server\share — the same folder can have another name, so it
# cannot be compared with the repository reliably) or one that cannot be converted is ambiguous:
# here, on main/master, it is blocked.
case "${OSTYPE:-}" in
  msys*|cygwin*)
    win_abs() { case "$1" in [A-Za-z]:[\\/]*) return 0 ;; *) return 1 ;; esac; }
    win_unc() { case "$1" in [\\/][\\/]*) return 0 ;; *) return 1 ;; esac; }
    win_drive_rel() { case "$1" in [A-Za-z]:*) return 0 ;; *) return 1 ;; esac; }
    to_posix() { command -v cygpath >/dev/null 2>&1 && cygpath -u -- "$1" 2>/dev/null; }
    if win_unc "$target"; then
      block " (a UNC path cannot be compared with the repository reliably.)"
    elif win_abs "$target"; then
      target="$(to_posix "$target")" && [ -n "$target" ] || block " (the Windows path could not be resolved.)"
    elif win_drive_rel "$target"; then
      block " (a drive-relative Windows path is ambiguous.)"
    else
      target="${target//\\//}"
      case "$target" in
        /*) ;;
        *)
          field '.cwd'; base="${REPLY:-$project_dir}"
          if win_unc "$base"; then
            block " (the session directory is a UNC path.)"
          elif win_abs "$base"; then
            base="$(to_posix "$base")" && [ -n "$base" ] || block " (the session directory could not be resolved.)"
          elif win_drive_rel "$base"; then
            block " (the session directory is a drive-relative Windows path.)"
          fi
          target="${base%/}/$target"
          ;;
      esac
    fi
    ;;
esac
# <<< Windows paths (0.9.2)
[ -L "$target" ] && block

project_top="$(cd "$project_dir" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null)"
[ -n "$project_top" ] || exit 0
project_top="$(cd "$project_top" && pwd -P)"

case "$target" in
  /*) ;;
  *)
    field '.cwd'; base="$REPLY"
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

# >>> Filesystem identity (0.9.3)
# The spelling of a path is not the folder it reaches. On a case-insensitive filesystem (macOS
# by default, Windows) …/REPO is …/repo; on Windows an 8.3 short name (PROGRA~1) is the long
# one. bash's `pwd -P` keeps the spelling it is given, so the string comparison below cannot
# see such an alias; and `cd` without -P applies `..` before symlinks, while the filesystem
# applies it after. So compare folders by identity: from the nearest existing directory —
# resolved as written and physically (cd -P) — walk up, and block when any folder on the way
# IS the repository's top level (`-ef`: the same device and inode, never the same spelling).
# Nothing is lowercased: on a case-sensitive filesystem …/REPO and …/repo are two folders, and
# stay two here. Shell builtins only. The string comparison after this block is kept unchanged.
inside_project() {
  local d="$1"
  while [ -n "$d" ]; do
    [ "$d" -ef "$project_top" ] && return 0
    case "$d" in */*) d="${d%/*}" ;; *) return 1 ;; esac
  done
  [ / -ef "$project_top" ]
}
inside_project "$real_dir" && block
physical_dir="$(cd -P "$dir" 2>/dev/null && pwd -P)" || block
inside_project "$physical_dir" && block
# <<< Filesystem identity (0.9.3)
case "$real_dir/" in
  "$project_top"/*) block ;;
  *) exit 0 ;;
esac
