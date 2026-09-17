#!/usr/bin/env bash
# wt publish — push this worktree's branch and open its pull request.

# wt_pr_title <branch> — the conventional-commit title a branch implies.
#
#   feat/ABC-1234-appointment-reminders -> feat(ABC-1234): appointment reminders
#   chore/tidy-workspace                -> chore: tidy workspace
#   feat/add-2-factor-auth              -> feat: add 2 factor auth
#
# WT_TICKET_RE (wt.config.sh) decides what counts as a ticket: by default an
# uppercase key (two or more characters, digits allowed so E2E-42 works)
# followed by a subject. Matching case-insensitively would turn `add-2` in
# `add-2-factor-auth` into a ticket, and a bare `fix/abc-99` has no subject
# to put after the colon.
wt_pr_title() {
  local branch="$1"
  local type="${branch%%/*}"
  local rest="${branch#*/}"
  local ticket="" words="$rest"

  if [[ "$rest" =~ $WT_TICKET_RE ]]; then
    ticket="${BASH_REMATCH[1]}"
    words="${BASH_REMATCH[2]}"
  fi

  words="${words//-/ }"
  if [[ -n "$ticket" ]]; then
    printf '%s(%s): %s' "$type" "$ticket" "$words"
  else
    printf '%s: %s' "$type" "$words"
  fi
}

# wt_pr_target — the branch this worktree's PR should go into.
#
# The base recorded at create time is the right default: an epic sub-worktree
# targets its epic, everything else targets the trunk. A protected branch
# other than the trunk (main, a release branch) is never a target — a hotfix
# goes into the trunk first and reaches its release branch through a second PR.
wt_pr_target() {
  local base
  base="$(wt_base_ref)"
  base="${base#origin/}"
  if [[ -z "$base" || "$base" == "$WT_TRUNK" ]] || wt_is_protected_branch "$base"; then
    printf '%s' "$WT_TRUNK"
  else
    printf '%s' "$base"
  fi
}

# wt_pr_hotfix_release — the release branch a hotfix worktree was cut from, if any.
wt_pr_hotfix_release() {
  local base
  base="$(wt_base_ref)"
  base="${base#origin/}"
  case "$base" in
    releases/*) printf '%s' "$base" ;;
    *) printf '' ;;
  esac
}

# wt_pr_template — path to the PR template body, or empty when there is none.
# The worktree's own copy wins; a worktree cut before the template landed falls
# back to the primary checkout's.
wt_pr_template() {
  local candidate
  for candidate in \
    "$WT_ROOT/.github/PULL_REQUEST_TEMPLATE.md" \
    "$WT_PRIMARY_ROOT/.github/PULL_REQUEST_TEMPLATE.md"; do
    if [[ -f "$candidate" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  printf ''
}

# wt_gh_supports_attach — gh 2.99.0 introduced --attach on pr create/edit/comment.
wt_gh_supports_attach() {
  local version
  version="$(gh --version 2>/dev/null | sed -nE '1s/^gh version ([0-9]+\.[0-9]+\.[0-9]+).*/\1/p')"
  [[ -n "$version" ]] || return 1
  [[ "$(printf '%s\n2.99.0\n' "$version" | sort -V | head -1)" == "2.99.0" ]]
}

# wt_check_attachments <file...> — every evidence file must exist before anything is
# pushed. `<file>#<alt text>` is one argument: gh reads the alt text after the hash.
wt_check_attachments() {
  local file
  for file in "$@"; do
    [[ -f "${file%%#*}" ]] || wt_die "--attach: no such file: ${file%%#*}"
  done
}

wt_cmd_publish() {
  local target="" draft=false assume_yes=false body_file=""
  local -a attachments=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --to)
        target="${2:?--to needs a branch}"
        shift 2
        ;;
      --draft)
        draft=true
        shift
        ;;
      --body-file)
        body_file="${2:?--body-file needs a markdown file}"
        [[ -f "$body_file" ]] || wt_die "--body-file: no such file: $body_file"
        shift 2
        ;;
      --attach)
        attachments+=("${2:?--attach needs a file}")
        shift 2
        ;;
      --yes | -y)
        assume_yes=true
        shift
        ;;
      -*) wt_die "Unknown option for publish: $1" ;;
      *)
        # Positional target, for launchers that pass it that way.
        target="$1"
        shift
        ;;
    esac
  done

  [[ ${#attachments[@]} -eq 0 ]] || wt_check_attachments "${attachments[@]}"

  wt_resolve_context "$PWD"

  [[ -n "$WT_BRANCH" ]] || wt_die "Detached HEAD. Switch to your feature branch first."

  if wt_is_protected_branch "$WT_BRANCH"; then
    wt_die "'$WT_BRANCH' is a protected branch (${WT_PROTECTED// /, }), not a feature branch."
  fi

  [[ -n "$target" ]] || target="$(wt_pr_target)"

  [[ "$WT_BRANCH" == "$target" ]] &&
    wt_die "Cannot open a PR from '$WT_BRANCH' into itself."

  if [[ -n "$(git -C "$WT_ROOT" status --porcelain)" ]]; then
    printf 'ERROR: The worktree has uncommitted or untracked changes:\n' >&2
    git -C "$WT_ROOT" status --short >&2
    printf '\n  Commit them before publishing.\n' >&2
    exit 1
  fi

  wt_info "Fetching origin/$target..."
  git -C "$WT_ROOT" fetch --quiet origin "$target" ||
    wt_die "Could not fetch '$target' from origin."

  git -C "$WT_ROOT" rev-parse --verify "origin/$target" >/dev/null 2>&1 ||
    wt_die "Target branch 'origin/$target' does not exist."

  # A branch with nothing ahead produces an empty PR.
  local commit_count
  commit_count="$(git -C "$WT_ROOT" rev-list --count "origin/$target..$WT_BRANCH")"
  if [[ "$commit_count" -eq 0 ]]; then
    wt_die "Nothing to publish: '$WT_BRANCH' has no commits ahead of origin/$target."
  fi

  local title
  title="$(wt_pr_title "$WT_BRANCH")"

  local release
  release="$(wt_pr_hotfix_release)"

  # --- Summary --------------------------------------------------------------
  wt_header "publish"
  printf '  %s -> %s\n' "$WT_BRANCH" "$target"
  printf '  Title:  %s\n' "$title"
  [[ "$draft" == true ]] && printf '  Draft:  yes\n'
  printf '  Commits (%s):\n' "$commit_count"
  local line
  while IFS= read -r line; do
    printf '    %s\n' "$line"
  done < <(git -C "$WT_ROOT" log --oneline "origin/$target..$WT_BRANCH")
  printf '\n'

  if [[ -n "$release" ]]; then
    wt_info "hotfix: open the second PR into $release after this one merges"
  fi

  if git -C "$WT_ROOT" merge-base --is-ancestor "origin/$target" HEAD; then
    wt_ok "origin/$target is an ancestor of HEAD — up to date with the target"
  else
    local behind
    behind="$(git -C "$WT_ROOT" rev-list --count "$WT_BRANCH..origin/$target" 2>/dev/null || echo 0)"
    wt_warn "$behind commit(s) behind $target — merge it in first (git merge origin/$target)"
  fi

  # --- Confirm --------------------------------------------------------------
  if [[ "$assume_yes" != true && -t 0 ]]; then
    printf '\n  Press Enter to publish, Ctrl-C to abort: '
    read -r _
  fi

  # --- Push -----------------------------------------------------------------
  wt_info "Pushing to origin..."
  git -C "$WT_ROOT" push -u origin "$WT_BRANCH"

  # --- Open the PR ----------------------------------------------------------
  if ! command -v gh >/dev/null 2>&1; then
    local remote_url slug
    remote_url="$(git -C "$WT_ROOT" remote get-url origin)"
    slug="$(sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##' <<<"$remote_url")"
    wt_info "gh CLI not found. Open the PR here:"
    wt_info "  https://github.com/$slug/compare/$target...$WT_BRANCH?expand=1"
    return 0
  fi

  if [[ ${#attachments[@]} -gt 0 ]] && ! wt_gh_supports_attach; then
    wt_die "--attach needs gh 2.99.0 or later (installed: $(gh --version | head -1)). Update gh, or publish without evidence."
  fi

  local -a attach_args=()
  local attachment
  for attachment in ${attachments[@]+"${attachments[@]}"}; do
    attach_args+=(--attach "$attachment")
  done

  local existing
  if existing="$(gh pr view "$WT_BRANCH" --json url --jq .url 2>/dev/null)" && [[ -n "$existing" ]]; then
    wt_ok "PR already open: $existing — the push updated it and CI will re-run."
    # A second round of evidence lands as a comment, so the PR's own body stays
    # the description the first publish wrote.
    if [[ ${#attachments[@]} -gt 0 ]]; then
      local -a comment_args=(pr comment "$WT_BRANCH")
      if [[ -n "$body_file" ]]; then
        comment_args+=(--body-file "$body_file")
      else
        comment_args+=(--body "Evidence from the latest push.")
      fi
      (cd "$WT_ROOT" && gh "${comment_args[@]}" "${attach_args[@]}") || wt_die "gh pr comment failed."
      wt_ok "Evidence posted as a comment on the open PR."
    fi
    return 0
  fi

  wt_info "Opening a PR into '$target'..."
  local create_args=(pr create --base "$target" --head "$WT_BRANCH" --title "$title")
  [[ "$draft" == true ]] && create_args+=(--draft)

  # gh refuses non-interactively without a body, and the API does not apply
  # .github/PULL_REQUEST_TEMPLATE.md the way the web form does — so send a body
  # ourselves: the caller's --body-file when given, else the template to fill in
  # on GitHub. A body that references an attachment as ![alt](./path) has that
  # path rewritten by gh to the uploaded asset; unreferenced attachments append.
  local template
  template="$(wt_pr_template)"
  if [[ -n "$body_file" ]]; then
    create_args+=(--body-file "$body_file")
  elif [[ -n "$template" ]]; then
    create_args+=(--body-file "$template")
  else
    create_args+=(--body "")
  fi
  create_args+=(${attach_args[@]+"${attach_args[@]}"})

  local url
  url="$(cd "$WT_ROOT" && gh "${create_args[@]}")" || wt_die "gh pr create failed."
  printf '%s\n' "$url"
  local attached=""
  [[ ${#attachments[@]} -gt 0 ]] && attached=" and ${#attachments[@]} attachment(s)"
  if [[ -n "$body_file" ]]; then
    wt_ok "PR opened with $body_file as its body$attached."
  elif [[ -n "$template" ]]; then
    wt_ok "PR opened with the template as its body — fill it in on GitHub."
  else
    wt_ok "PR opened with an empty body — no PR template found; describe it on GitHub."
  fi
}
