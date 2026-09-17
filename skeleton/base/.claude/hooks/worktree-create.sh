#!/usr/bin/env bash
# Claude Code WorktreeCreate hook — provisions the worktree with `wt` so an
# agent-made worktree gets node_modules, .env symlinks and a port slot like one
# made by `yarn wt create`.
#
# Two contracts are supported. The current one sends an already-created
# worktree (`worktree_path`): provision it, exit 0 and print nothing. The older
# one sends only `name` and expects the hook to create the worktree and print
# its path: delegate to `wt create` and echo the directory.
set -euo pipefail

payload="$(cat)"
field() { printf '%s' "$payload" | jq -r --arg k "$1" '.[$k] // empty'; }

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
WT="$PROJECT_DIR/scripts/wt/wt"
[[ -x "$WT" ]] || { echo "worktree-create: $WT not found; nothing provisioned." >&2; exit 0; }

# Base override: set to an epic branch to cut agent worktrees from it (locally,
# to carry unpushed commits) and point publish at it. Empty = origin/<trunk>.
BASE_OVERRIDE=""

worktree_path="$(field worktree_path)"
if [[ -n "$worktree_path" ]]; then
  bash "$WT" provision --path "$worktree_path" ${BASE_OVERRIDE:+--base "$BASE_OVERRIDE"} >&2
  exit 0
fi

name="$(field name)"
[[ -n "$name" ]] || { echo "worktree-create: neither worktree_path nor name in payload." >&2; exit 1; }

# The worktree directory is derived the way `wt create` derives it, from the
# same config file, so the path echoed back matches what was created.
# shellcheck source=../../scripts/wt/wt.config.sh
source "$PROJECT_DIR/scripts/wt/wt.config.sh"
types="${WT_BRANCH_TYPES:-feat fix refactor test docs chore}"

# `wt create` needs a semantic branch name; an agent-generated name gets a
# chore/ prefix and can be renamed before publishing.
if [[ "$name" =~ ^(${types// /|})/ ]]; then
  branch="$name"
else
  branch="chore/${name}"
fi

cd "$PROJECT_DIR"
bash "$WT" create "$branch" ${BASE_OVERRIDE:+--from "$BASE_OVERRIDE" --local} >&2
printf '%s/%s-%s\n' "${WT_WORKTREE_BASE:-${WT_WORKTREE_BASE_DEFAULT:-$HOME/worktrees}}" "$WT_REPO_PREFIX" "${branch//\//-}"
