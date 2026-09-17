#!/usr/bin/env bash
# Re-syncs dependencies only when the worktree's HEAD moved across something
# the running stack links against. The marker is per-worktree, in
# .wt/deps-state.
#
# What counts as relevant is WT_DEPS_RELEVANT in wt.config.sh (an ERE matched
# against changed paths); the sync itself is WT_DEPS_SYNC_CMD.
#
# Env flags:
#   WT_SKIP_DEPS_SYNC=1   skip the step entirely
#   WT_FORCE_DEPS_SYNC=1  sync regardless of the diff

# _wt_deps_list_is_relevant <newline-separated-paths>
_wt_deps_list_is_relevant() {
  local changed="$1"
  [[ -n "$changed" ]] || return 1
  grep -Eq "$WT_DEPS_RELEVANT" <<<"$changed"
}

# _wt_deps_dirty_is_relevant — uncommitted edits the commit diff cannot see.
_wt_deps_dirty_is_relevant() {
  local changed
  # cut, not awk $NF: porcelain paths may contain spaces, and a rename shows as
  # "old -> new".
  changed="$(git -C "$WT_ROOT" status --porcelain 2>/dev/null | cut -c4- || true)"
  _wt_deps_list_is_relevant "$changed"
}

_wt_deps_diff_is_relevant() {
  local from="$1" to="$2" changed
  changed="$(git -C "$WT_ROOT" diff --name-only "$from" "$to" 2>/dev/null || true)"
  _wt_deps_list_is_relevant "$changed"
}

# wt_deps_preflight — 0 when dependencies are in sync (or were just synced).
wt_deps_preflight() {
  local state_file="$WT_STATE_DIR/deps-state"

  wt_header "deps preflight"

  if [[ "${WT_SKIP_DEPS_SYNC:-0}" == "1" ]]; then
    wt_info "WT_SKIP_DEPS_SYNC=1 — skipping dependency sync"
    return 0
  fi

  local current
  current="$(git -C "$WT_ROOT" rev-parse HEAD 2>/dev/null || true)"
  if [[ -z "$current" ]]; then
    wt_warn "Could not resolve HEAD — skipping dependency sync"
    return 0
  fi

  local prev=""
  [[ -f "$state_file" ]] && prev="$(tr -d '[:space:]' <"$state_file" 2>/dev/null || true)"

  local needs_sync=0 reason=""
  if [[ "${WT_FORCE_DEPS_SYNC:-0}" == "1" ]]; then
    needs_sync=1
    reason="WT_FORCE_DEPS_SYNC=1"
  elif [[ ! -d "$WT_ROOT/node_modules" ]]; then
    needs_sync=1
    reason="node_modules is missing"
  elif [[ -z "$prev" ]]; then
    needs_sync=1
    reason="no previous successful run in this worktree"
  elif ! git -C "$WT_ROOT" cat-file -e "$prev" 2>/dev/null; then
    needs_sync=1
    reason="previous marker $prev is unknown (rebase or force-push?)"
  elif [[ "$prev" != "$current" ]] && _wt_deps_diff_is_relevant "$prev" "$current"; then
    needs_sync=1
    reason="dependency-relevant files changed since $prev"
  elif _wt_deps_dirty_is_relevant; then
    needs_sync=1
    reason="uncommitted dependency-relevant changes in the working tree"
  fi

  mkdir -p "$WT_STATE_DIR"

  if ((needs_sync == 0)); then
    wt_ok "Dependencies up to date"
    printf '%s' "$current" >"$state_file"
    return 0
  fi

  wt_info "Dependency sync needed: $reason"

  (
    cd "$WT_ROOT" || exit 1
    wt_run_quiet "$WT_DEPS_SYNC_CMD" deps-sync -- bash -c "$WT_DEPS_SYNC_CMD"
  ) || return 1

  printf '%s' "$current" >"$state_file"
  wt_ok "Dependencies synced (marker ${current:0:10})"
  return 0
}
