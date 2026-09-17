#!/usr/bin/env bash
# Claude Code WorktreeRemove hook — stops the stack and releases the slot
# before Claude removes the directory. Never forces: the branch survives and
# unpushed work is Claude's keep/remove prompt to decide, not ours.
set -euo pipefail

payload="$(cat)"
worktree_path="$(printf '%s' "$payload" | jq -r '.worktree_path // empty')"
[[ -n "$worktree_path" && -d "$worktree_path" ]] || exit 0

WT="${CLAUDE_PROJECT_DIR:-$PWD}/scripts/wt/wt"
[[ -x "$WT" ]] || exit 0

(cd "$worktree_path" && bash "$WT" stop >&2) || true
