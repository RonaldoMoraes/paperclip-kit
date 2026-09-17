#!/usr/bin/env bash
# wt create — cut a branch from an up-to-date base and provision a worktree.
#
# The branch name is the contract: it outlives the worktree and goes on the PR,
# so it is validated up front.

wt_create_usage() {
  cat >&2 <<USAGE
ERROR: A branch name is required.

  yarn wt create <branch-name> [--from <base-branch>] [--local]

Semantic branch names (see docs/branching.md):

  feat/ABC-1234-short-feature-name    features
  fix/ABC-1234-short-bug-name         bugfixes and hotfixes
  refactor/ABC-1234-short-name        technical refactors
  test/ABC-1234-short-test-name       tests
  docs/short-docs-name                documentation only (no ticket needed)
  chore/short-chore-name              maintenance, infra, tooling (no ticket needed)

Types accepted here: ${WT_BRANCH_TYPES// /, }
USAGE
}

# wt_branch_name_is_semantic <branch> — <type>/<short-name> with a known type.
wt_branch_name_is_semantic() {
  local types="${WT_BRANCH_TYPES// /|}"
  [[ "$1" =~ ^($types)/[A-Za-z0-9._-]+$ ]]
}

wt_cmd_create() {
  local branch="" base="$WT_TRUNK" use_local=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --from)
        base="${2:?--from needs a branch}"
        shift 2
        ;;
      --local)
        use_local=true
        shift
        ;;
      -*) wt_die "Unknown option for create: $1" ;;
      *)
        if [[ -z "$branch" ]]; then
          branch="$1"
        else
          # Positional base, for launchers that pass it that way.
          base="$1"
        fi
        shift
        ;;
    esac
  done

  if [[ -z "$branch" ]]; then
    wt_create_usage
    exit 1
  fi

  if ! wt_branch_name_is_semantic "$branch"; then
    wt_die "'$branch' is not a semantic branch name.
  Expected <type>/<short-name>, e.g. feat/ABC-1234-appointment-reminders
  Types: ${WT_BRANCH_TYPES// /, }
  See docs/branching.md"
  fi

  wt_resolve_context "$PWD"
  wt_require_primary

  local worktree_dir
  worktree_dir="$(wt_worktree_dir_for_branch "$branch")"

  wt_header "create"

  # Branch from the remote tip by default, not a possibly-stale local ref: a
  # branch cut from a stale base conflicts at PR time. --local overrides that
  # for the case where the local branch holds something origin does not yet.
  local remote_ref="origin/$base"
  wt_info "Fetching $remote_ref..."
  local fetched=true
  if ! git -C "$WT_PRIMARY_ROOT" fetch --quiet origin "$base"; then
    fetched=false
    wt_warn "Could not fetch '$base' from origin — using the local ref as-is."
  fi

  local base_ref
  if [[ "$use_local" == true ]]; then
    git -C "$WT_PRIMARY_ROOT" show-ref --verify --quiet "refs/heads/$base" ||
      wt_die "--local needs a local '$base' branch, and there is none.
  Drop --local to cut from $remote_ref."
    base_ref="$base"

    if git -C "$WT_PRIMARY_ROOT" rev-parse --verify "$remote_ref" >/dev/null 2>&1; then
      local behind
      behind="$(git -C "$WT_PRIMARY_ROOT" rev-list --count "$base..$remote_ref" 2>/dev/null || echo 0)"
      if [[ "$behind" -gt 0 ]]; then
        wt_warn "local $base is $behind commit(s) behind $remote_ref — pull it first"
      fi
    fi
  else
    base_ref="$remote_ref"
    git -C "$WT_PRIMARY_ROOT" rev-parse --verify "$base_ref" >/dev/null 2>&1 ||
      wt_die "Base branch '$base_ref' does not exist$([[ "$fetched" == false ]] && printf ' (the fetch failed)')."
  fi

  if [[ "$base" == "main" ]]; then
    wt_warn "Branching from 'main'."
    wt_info "main is production and behind $WT_TRUNK. Branch from $WT_TRUNK,"
    wt_info "from your epic branch, or from the latest releases/vX for a hotfix."
    wt_info "See docs/branching.md."
  fi

  [[ -d "$worktree_dir" ]] &&
    wt_die "Directory already exists: $worktree_dir
  Choose a different name or remove it first."

  git -C "$WT_PRIMARY_ROOT" show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null &&
    wt_die "Branch '$branch' already exists.
  Remove it with: git branch -D $branch"

  wt_info "Location: $worktree_dir"
  wt_info "Base:     $base_ref"
  wt_info "Branch:   $branch"

  mkdir -p "$(wt_worktree_base)"
  git -C "$WT_PRIMARY_ROOT" worktree add -b "$branch" "$worktree_dir" "$base_ref"

  # Provision runs in a subshell: it reports failure by calling wt_die, which
  # would otherwise take this process down before the recovery hint is printed.
  if ! (wt_cmd_provision --path "$worktree_dir" --base "$base_ref"); then
    printf '\n' >&2
    printf 'ERROR: Provisioning failed. The worktree exists but is not usable.\n' >&2
    printf '  Retry:  yarn wt provision --path %s\n' "$worktree_dir" >&2
    printf '  Remove: git worktree remove %s && git branch -D %s\n' "$worktree_dir" "$branch" >&2
    exit 1
  fi

  local slot
  slot="$(wt_slot_read "$worktree_dir")"
  if [[ -z "$slot" ]]; then
    printf '\n' >&2
    printf 'ERROR: The worktree was created but has no slot.\n' >&2
    printf '  Retry:  yarn wt provision --path %s\n' "$worktree_dir" >&2
    exit 1
  fi
  wt_ports "$slot"

  cat <<EOF

============================================
  Worktree ready
============================================

  Location:  $worktree_dir
  Branch:    $branch  (from $base_ref)
  Slot:      $slot    ($(wt_ports_summary))

  Start it:  cd $worktree_dir && yarn wt run
  Ship it:   cd $worktree_dir && yarn wt publish
  Clean up:  cd $worktree_dir && yarn wt dispose

EOF
}
