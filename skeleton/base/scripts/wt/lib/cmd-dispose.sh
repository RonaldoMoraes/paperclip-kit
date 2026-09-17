#!/usr/bin/env bash
# wt dispose — remove this worktree's directory. The branch survives.
#
# Work reaches the trunk only through a PR, and a feature branch lives until
# its change is in production. This only reclaims the directory and the slot.

wt_cmd_dispose() {
  local force=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --force)
        force=true
        shift
        ;;
      *) wt_die "Unknown argument for dispose: $1" ;;
    esac
  done

  wt_resolve_context "$PWD"
  wt_require_worktree

  [[ -n "$WT_BRANCH" ]] || wt_die "Worktree is on a detached HEAD."

  if [[ "$force" != true ]]; then
    local blocked=false

    if [[ -n "$(git -C "$WT_ROOT" status --porcelain)" ]]; then
      printf 'ERROR: The worktree has uncommitted or untracked changes:\n' >&2
      git -C "$WT_ROOT" status --short >&2
      printf '\n' >&2
      blocked=true
    fi

    # The branch's own remote ref is the test — not @{upstream}, which git
    # points at origin/<base> for a branch cut from a remote-tracking ref, so
    # a never-pushed branch would look pushed. A branch that was never pushed
    # is only a loss when it carries commits nobody else has.
    local remote_ref="origin/$WT_BRANCH" unpushed
    if git -C "$WT_ROOT" rev-parse --verify --quiet "refs/remotes/$remote_ref" >/dev/null; then
      unpushed="$(git -C "$WT_ROOT" rev-list --count "$remote_ref..$WT_BRANCH")"
      if [[ "$unpushed" -gt 0 ]]; then
        printf "ERROR: %s commit(s) on '%s' are not on %s.\n" "$unpushed" "$WT_BRANCH" "$remote_ref" >&2
        git -C "$WT_ROOT" log --oneline "$remote_ref..$WT_BRANCH" >&2
        printf '\n' >&2
        blocked=true
      fi
    else
      local base
      base="$(wt_base_ref)"
      unpushed="$(git -C "$WT_ROOT" rev-list --count "$base..$WT_BRANCH" 2>/dev/null || echo 1)"
      if [[ "$unpushed" -gt 0 ]]; then
        printf "ERROR: '%s' was never pushed and has %s commit(s) of its own. Removing the\n" "$WT_BRANCH" "$unpushed" >&2
        printf '  worktree now would leave that work only in this clone.\n\n' >&2
        blocked=true
      else
        wt_info "'$WT_BRANCH' was never pushed but has no commits of its own — nothing to lose"
      fi
    fi

    if [[ "$blocked" == true ]]; then
      printf '  Publish first:  yarn wt publish\n' >&2
      printf '  Or discard the directory anyway:  yarn wt dispose --force\n' >&2
      exit 1
    fi
  fi

  wt_header "dispose"

  # The stack holds this worktree's ports and an Overmind socket inside it.
  local slot
  slot="$(wt_slot_read)"
  if [[ -n "$slot" ]]; then
    wt_ports "$slot"
    wt_overmind_stop
    # A still-held port is worth saying out loud, but it must not stop dispose
    # from reaching its own safety checks.
    local ports=()
    local port
    while IFS= read -r port; do
      ports+=("$port")
    done < <(wt_slot_all_ports)
    if ! wt_kill_port_listeners "${ports[@]}"; then
      wt_warn "Some ports are still held — check them with: lsof -i :<port>"
    fi
    wt_ok "Stack stopped, slot $slot released"
  fi

  local primary_root="$WT_PRIMARY_ROOT" branch="$WT_BRANCH" root="$WT_ROOT"
  wt_info "Removing worktree directory: $root"
  git -C "$primary_root" worktree remove --force "$root"

  local dir_expr="\${WT_WORKTREE_BASE:-$WT_WORKTREE_BASE_DEFAULT}/$WT_REPO_PREFIX-${branch//\//-}"
  cat <<EOF

============================================
  Worktree removed
============================================

  Branch kept: $branch

  A feature branch lives until its change is in production. Do not delete it
  after the merge into $WT_TRUNK — it is what a rollback is cut from.

  Reopen it later with:
    git -C $primary_root worktree add \\
      $dir_expr \\
      $branch
    bash $primary_root/scripts/wt/wt provision \\
      --path $dir_expr

  (provision is invoked from the primary checkout because a branch cut before
  the wt CLI landed has no scripts/wt of its own.)

EOF
}
