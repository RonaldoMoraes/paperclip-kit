#!/usr/bin/env bash
# Resolves which checkout a wt command is acting on.
#
# Everything is derived from the current working directory, never from the
# location of the wt script itself: a worktree cut from an older commit may not
# contain scripts/wt, so the CLI is routinely invoked from a checkout other than
# the one it lives in.

# wt_resolve_context [dir]
# Sets: WT_ROOT, WT_PRIMARY_ROOT, WT_IS_WORKTREE, WT_BRANCH, WT_SLUG, WT_STATE_DIR
wt_resolve_context() {
  local dir="${1:-$PWD}"

  WT_ROOT="$(cd "$dir" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null)" ||
    wt_die "Not inside a git repository: $dir"

  # git-common-dir is relative (".git") in the primary checkout and absolute in
  # a linked worktree. This is the reliable test — comparing paths breaks on
  # case-insensitive filesystems.
  local common_git_dir
  common_git_dir="$(git -C "$WT_ROOT" rev-parse --git-common-dir)"
  if [[ "$common_git_dir" == /* ]]; then
    WT_IS_WORKTREE=true
    WT_PRIMARY_ROOT="$(cd "$(dirname "$common_git_dir")" && pwd -P)"
  else
    WT_IS_WORKTREE=false
    WT_PRIMARY_ROOT="$WT_ROOT"
  fi

  WT_BRANCH="$(git -C "$WT_ROOT" branch --show-current)"
  # shellcheck disable=SC2034  # consumed by the other libs the CLI sources
  WT_SLUG="$(wt_slugify "${WT_BRANCH:-detached}")"
  # shellcheck disable=SC2034  # consumed by the other libs the CLI sources
  WT_STATE_DIR="$WT_ROOT/.wt"
}

# wt_slugify <string> — lowercase, non-alphanumerics collapsed to underscores.
# Used for database names and tmux session titles, so it must be safe unquoted.
wt_slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/_/g; s/^_+|_+$//g'
}

wt_require_worktree() {
  if [[ "$WT_IS_WORKTREE" != true ]]; then
    wt_die "Run this from inside a worktree, not the primary checkout at $WT_PRIMARY_ROOT."
  fi
}

wt_require_primary() {
  if [[ "$WT_IS_WORKTREE" == true ]]; then
    wt_die "Run this from the primary checkout at $WT_PRIMARY_ROOT, not from a worktree."
  fi
}

# wt_worktree_base — where worktrees are created: $WT_WORKTREE_BASE when set,
# the config's default otherwise.
wt_worktree_base() {
  printf '%s' "${WT_WORKTREE_BASE:-${WT_WORKTREE_BASE_DEFAULT:-$HOME/worktrees}}"
}

wt_worktree_dir_for_branch() {
  printf '%s/%s-%s' "$(wt_worktree_base)" "$WT_REPO_PREFIX" "${1//\//-}"
}
