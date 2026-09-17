#!/usr/bin/env bash
# wt provision — make an existing worktree usable.
#
# Runs against whatever created the worktree: `wt create`, a coding agent's own
# worktree support, or a plain `git worktree add`.
#
# There is no build step: `wt run` syncs dependencies when it has to.
#
# WORKTREE_ENV_EXCLUDE: colon-separated directory names the env step skips.

wt_provision_env() {
  wt_info "Symlinking .env files from the primary checkout..."

  local prune=(-path "*/node_modules/*" -o -path "*/.git/*" -o -path "*/dist/*")
  local excluded dir
  IFS=':' read -ra excluded <<<"${WORKTREE_ENV_EXCLUDE:-}"
  for dir in ${excluded[@]+"${excluded[@]}"}; do
    [[ -n "$dir" ]] && prune+=(-o -path "*/$dir")
  done

  local root_file rel_path target_file
  while IFS= read -r root_file; do
    rel_path="${root_file#"$WT_PRIMARY_ROOT"/}"
    target_file="$WT_ROOT/$rel_path"
    mkdir -p "$(dirname "$target_file")"
    rm -f "$target_file"
    ln -sf "$root_file" "$target_file"
  done < <(
    find "$WT_PRIMARY_ROOT" \
      \( ${prune[@]+"${prune[@]}"} \) -prune -o \
      -type f \( -name ".env" -o -name ".env.*" \) \
      ! -name ".env.example" \
      -print
  )

  # A developer's own instructions ride with their .env: CLAUDE.local.md at the
  # root is untracked (.git/info/exclude) and read by the agent in every
  # checkout it is linked into.
  if [[ -f "$WT_PRIMARY_ROOT/CLAUDE.local.md" ]]; then
    ln -sf "$WT_PRIMARY_ROOT/CLAUDE.local.md" "$WT_ROOT/CLAUDE.local.md"
  fi

  wt_ok ".env files linked"
}

wt_provision_install() {
  (
    cd "$WT_ROOT" || exit 1
    wt_run_quiet "Installing dependencies ($WT_DEPS_SYNC_CMD)" install -- bash -c "$WT_DEPS_SYNC_CMD"
  ) ||
    wt_die "$WT_DEPS_SYNC_CMD failed — the worktree is not usable yet. Retry: cd $WT_ROOT && $WT_DEPS_SYNC_CMD"
}

wt_cmd_provision() {
  local path="$PWD" base=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --path)
        path="${2:?--path needs a directory}"
        shift 2
        ;;
      --base)
        base="${2:?--base needs a ref}"
        shift 2
        ;;
      *) wt_die "Unknown argument for provision: $1" ;;
    esac
  done

  wt_resolve_context "$path"

  wt_header "provision"

  # A plain clone — CI images and agent environments use this script as their
  # setup step — has no primary checkout to link to and no slot to own. Install
  # dependencies and stop there.
  if [[ "$WT_IS_WORKTREE" != true ]]; then
    wt_info "Skipping .env symlinks and slot: primary checkout"
    wt_info "Root: $WT_ROOT"
    wt_provision_install
    wt_ok "Provisioned: $WT_ROOT"
    return 0
  fi

  wt_info "Primary:  $WT_PRIMARY_ROOT"
  wt_info "Worktree: $WT_ROOT"

  mkdir -p "$WT_STATE_DIR" "$WT_STATE_DIR/evidence"
  local slot
  # wt_die inside the command substitution kills only the subshell, so an empty
  # result is how allocation failure arrives here. Without this check the rest
  # of provisioning would run on slot 0 — the primary's ports.
  slot="$(wt_slot_allocate "$WT_ROOT")"
  [[ -n "$slot" ]] || return 1
  wt_ports "$slot"
  wt_ok "Slot $slot — $(wt_ports_summary)"

  # `wt run` diffs against this ref to decide whether the branch touches the
  # schema, and `wt publish` targets it. An explicit --base wins; otherwise
  # keep whatever create recorded; otherwise take the base the creating tool
  # left in git config (branch.<name>.gh-merge-base, the key `gh` reads and
  # editor worktree hooks write); and only then fall back to origin/<trunk>.
  if [[ -z "$base" && ! -f "$WT_STATE_DIR/base" && -n "$WT_BRANCH" ]]; then
    local recorded
    recorded="$(git -C "$WT_ROOT" config --get "branch.$WT_BRANCH.gh-merge-base" 2>/dev/null || true)"
    if [[ -n "$recorded" ]]; then
      [[ "$recorded" == origin/* ]] || recorded="origin/$recorded"
      base="$recorded"
      wt_info "Base:     $base (from git config branch.$WT_BRANCH.gh-merge-base)"
    fi
  fi
  if [[ -n "$base" || ! -f "$WT_STATE_DIR/base" ]]; then
    printf '%s' "${base:-origin/$WT_TRUNK}" >"$WT_STATE_DIR/base"
  fi

  wt_provision_env
  wt_provision_install

  wt_ok "Provisioned: $WT_ROOT"
}
