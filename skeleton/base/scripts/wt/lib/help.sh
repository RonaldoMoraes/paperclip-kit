#!/usr/bin/env bash
# Per-command help.
#
# The dispatcher answers -h/--help before a subcommand runs, so asking for help
# never has a side effect. The text reads the product's names (trunk,
# processes, database) from wt.config.sh so it cannot drift from it.

# shellcheck disable=SC2034  # listed by the dispatcher when `wt help <x>` misses
WT_HELP_COMMANDS=(create provision run health stop status logs publish dispose)

wt_help_overview() {
  cat <<EOF
wt — the worktree CLI.

  yarn wt create <branch> [--from <base>] [--local]
                                            cut a branch and provision a worktree
  yarn wt provision [--path <dir>]          make an existing worktree usable
  yarn wt run [--auto-db | --db] [--with <proc>] [--only ...]
                                            bring this worktree's stack up
  yarn wt health                            poll the stack until it answers
  yarn wt stop [--drop-db]                  stop the stack
  yarn wt status                            what is running here
  yarn wt logs <proc>                       attach to one process
  yarn wt publish [--to <branch>] [--body-file <md>] [--attach <file>]...
                                            push the branch and open the PR
  yarn wt dispose [--force]                 remove the directory, keep the branch

Processes: ${WT_PROC_NAMES[*]} (default: ${WT_DEFAULT_PROC_LIST[*]}). Trunk: $WT_TRUNK.

Every command acts on the checkout the current directory belongs to, not on
the checkout this script lives in — a worktree cut before this CLI landed
still runs against it.

  yarn wt help <command>    detail for one command
  WT_VERBOSE=1              stream install/compose/migration output
  WT_RUN_FLAGS="--with metro"
                            flags every \`wt run\` on this machine starts with

See docs/worktrees.md.
EOF
}

# wt_help_for <command> — 0 when the command is known, 1 otherwise.
wt_help_for() {
  case "$1" in
    create) _wt_help_create ;;
    provision) _wt_help_provision ;;
    run) _wt_help_run ;;
    health) _wt_help_health ;;
    stop) _wt_help_stop ;;
    status) _wt_help_status ;;
    logs) _wt_help_logs ;;
    publish) _wt_help_publish ;;
    dispose) _wt_help_dispose ;;
    *) return 1 ;;
  esac
}

_wt_help_create() {
  cat <<EOF
wt create — cut a feature branch and provision a worktree for it.

USAGE
  yarn wt create <branch> [--from <base>] [--local]

  Run from the primary checkout.

FLAGS
  --from <base>   Base branch. Default: $WT_TRUNK. Pass the epic branch for
                  epic sub-work.
  --local         Cut from your local <base> instead of origin/<base>, and warn
                  when that local branch is behind origin.

CHECKS
  - The branch name must be <type>/<short-name>, type one of
    ${WT_BRANCH_TYPES// /, }.
  - Refuses when the directory or the branch already exists.
  - Warns when the base is main (production, behind the trunk).
  - Fetches origin/<base> first; a failed fetch warns rather than aborts.

WHAT IT DOES
  Adds the worktree under \$WT_WORKTREE_BASE (default $WT_WORKTREE_BASE_DEFAULT)
  as $WT_REPO_PREFIX-<branch-with-dashes>, allocates a port slot, symlinks the
  .env files from the primary checkout and installs dependencies. It does not
  start anything — wt run does that.

EXAMPLES
  yarn wt create feat/ABC-1234-appointment-reminders
  yarn wt create feat/ABC-1235-sub-task --from feat/ABC-1200-epic
EOF
}

_wt_help_provision() {
  cat <<EOF
wt provision — make an existing worktree usable.

USAGE
  yarn wt provision [--path <dir>] [--base <ref>]

FLAGS
  --path <dir>   Provision that directory instead of the current one.
  --base <ref>   Record <ref> as the base in .wt/base. Defaults to whatever
                 create recorded, then to the base the creating tool left in
                 git config (branch.<name>.gh-merge-base, the key gh reads),
                 then to origin/$WT_TRUNK.

WHAT IT DOES
  Allocates a port slot, symlinks the .env files from the primary checkout and
  runs the dependency sync ($WT_DEPS_SYNC_CMD). No build step.

  In a plain checkout (not a worktree) it installs dependencies and stops —
  no slot, no symlinks, no .wt/ directory.

EXAMPLES
  yarn wt provision
  yarn wt provision --path $WT_WORKTREE_BASE_DEFAULT/$WT_REPO_PREFIX-feat-ABC-1234-thing
EOF
}

_wt_help_run() {
  cat <<EOF
wt run — bring this worktree's stack up.

USAGE
  yarn wt run [--with <proc>]... [--only <list>] [--auto-db | --db | --shared-db]

  The single way to start an app. Runs in the foreground; Overmind owns the
  terminal from then on.

  Default: ${WT_DEFAULT_PROC_LIST[*]}. Everything else starts on demand.

FLAGS
  --with <proc>   Also start this process (repeatable, comma lists accepted).
  --only <list>   Start exactly these processes instead of the default:
                  ${WT_PROC_NAMES[*]}.
  --db            Give this worktree its own database (${WT_SHARED_DB}_<branch>)
                  on the shared Postgres, migrate and seed it, and point the
                  stack at it.
  --auto-db       --db when the branch changes $WT_DB_SCHEMA_DIR/, the shared
                  database otherwise. For launchers that cannot know the
                  branch (editor worktree hooks, agents).
  --shared-db     Stay on the shared '$WT_SHARED_DB' database even though the
                  branch changes $WT_DB_SCHEMA_DIR/.

  The database flags are refused when the product has no database module
  (no $WT_COMPOSE_DB in the primary checkout); --auto-db is then ignored.

ENVIRONMENT
  WT_RUN_FLAGS    Flags prepended to every run on this machine, e.g.
                  WT_RUN_FLAGS="--with metro" in your shell profile makes a
                  shared launcher's \`wt run --auto-db\` start Metro too.

CHECKS
  Refuses in the primary checkout (slot 0 is its ports), refuses when overmind
  is not installed (and prints the Procfile it would have started), and
  refuses when the branch changes $WT_DB_SCHEMA_DIR/ without --db or --auto-db.

WHAT IT DOES
  1. Writes the .env overlays for this slot.
  2. Deps preflight — $WT_DEPS_SYNC_CMD, but only when something relevant
     changed since the last successful run here.
  3. Preflight — Docker, Postgres, the database, .env sanity, overmind.
  4. Migrates the worktree's own database (--db), or the shared one when it is
     still empty (a fresh machine).
  5. Reaps Overminds whose worktree was deleted from under them, frees the
     slot's ports, writes .wt/Procfile, starts Overmind.

EXAMPLES
  yarn wt run
  yarn wt run --with metro
  yarn wt run --auto-db
  yarn wt run --only web
  yarn wt run --db
EOF
}

_wt_help_health() {
  cat <<'EOF'
wt health — poll this worktree's stack until every process answers.

USAGE
  yarn wt health

  Probes the health URL of whatever .wt/Procfile lists (a process without a
  health URL in wt.config.sh is skipped). An https:// URL is probed without
  certificate verification, because a local HTTPS server is self-signed.

  WT_HEALTH_TIMEOUT_SECONDS (default 90) and WT_HEALTH_INTERVAL_SECONDS
  (default 3) tune the polling. Exits non-zero when a service never answers.

EXAMPLE
  yarn wt health
EOF
}

_wt_help_stop() {
  cat <<EOF
wt stop — stop this worktree's stack.

USAGE
  yarn wt stop [--drop-db]

FLAGS
  --drop-db   Also drop this worktree's own database. Refuses to drop the
              shared '$WT_SHARED_DB' database.

WHAT IT DOES
  Quits Overmind, frees the slot's ports and restores the .env symlinks to the
  primary checkout. Postgres stays up — it is shared with every other worktree.

EXAMPLES
  yarn wt stop
  yarn wt stop --drop-db
EOF
}

_wt_help_status() {
  cat <<'EOF'
wt status — show this worktree's slot, ports and running processes.

USAGE
  yarn wt status

  Prints the slot and its port assignments, then wraps overmind status. Says so
  plainly when nothing is running here.

EXAMPLE
  yarn wt status
EOF
}

_wt_help_logs() {
  cat <<EOF
wt logs — attach to one process in this worktree's stack.

USAGE
  yarn wt logs <${WT_PROC_NAMES[*]// /|}>

  Wraps overmind connect. The process name is required: attaching without one
  drops you into whichever process Overmind picks, in a tmux session you did
  not ask for. Detach with the tmux prefix then d.

  This is the live process output. The captured install and migration logs
  are files under .wt/logs/.

EXAMPLE
  yarn wt logs ${WT_DEFAULT_PROC_LIST[0]}
EOF
}

_wt_help_publish() {
  cat <<EOF
wt publish — push this worktree's branch and open its pull request.

USAGE
  yarn wt publish [--to <branch>] [--draft] [--yes] [--body-file <md>]
                  [--attach <file>[#alt text]]...

FLAGS
  --to <branch>   PR target. Default: the base recorded in .wt/base with any
                  origin/ prefix stripped, falling back to $WT_TRUNK when that
                  base is a protected branch (${WT_PROTECTED// /, }) or absent.
  --draft         Open the PR as a draft.
  --yes           Skip the confirmation prompt. Implied when stdin is not a
                  terminal.
  --body-file <md>
                  The PR body, written by you (or the agent that did the work)
                  along the template's sections. Default: the template itself.
  --attach <file>[#alt text]
                  Evidence to upload with the body — screenshots, recordings
                  (PNG, JPEG, GIF, WebP, SVG, MP4, MOV, WebM; 10 MB, video up to
                  100 MB on paid plans). Repeatable. A body that references the
                  file as ![alt](./path) shows it in place; the rest append at
                  the end. Needs gh 2.99.0+. Keep the files under .wt/evidence/
                  (gitignored) so they never enter the branch.

CHECKS
  - Refuses on a protected branch (${WT_PROTECTED// /, }).
  - Refuses on a dirty tree, on a detached HEAD, and when the branch has no
    commits ahead of the target.
  - Warns when origin/<target> is not an ancestor of HEAD, naming how many
    commits behind you are, and continues.

WHAT IT DOES
  Prints a summary, asks for confirmation, pushes, then opens the PR with a
  title derived from the branch name — feat/ABC-1234-short-name becomes
  feat(ABC-1234): short name, and a branch with no uppercase ticket becomes
  chore: tidy workspace.

  The body is .github/PULL_REQUEST_TEMPLATE.md, sent explicitly: GitHub applies
  that template to the web form, not to PRs opened through the API, so wt reads
  the file and passes it. Fill the sections in on GitHub afterwards.

  A worktree cut from a releases/* branch is a hotfix: the PR goes into
  $WT_TRUNK, and a second PR into that release branch follows once it merges.

  An already-open PR is just updated by the push; with --attach, the evidence
  (and --body-file, if given) goes out as a comment on that PR.

EXAMPLES
  yarn wt publish
  yarn wt publish --to feat/ABC-1200-epic --draft
  yarn wt publish --body-file .wt/pr.md \\
    --attach '.wt/evidence/sign-in.png#Sign-in with the cooldown armed' \\
    --attach .wt/evidence/checkout-return.mp4
EOF
}

_wt_help_dispose() {
  cat <<'EOF'
wt dispose — remove this worktree's directory. The branch survives.

USAGE
  yarn wt dispose [--force]

FLAGS
  --force   Remove the directory even with uncommitted changes or unpushed
            commits. The branch is still kept.

CHECKS
  Refuses when there are uncommitted or untracked changes, commits not on the
  branch's upstream, or a branch that was never pushed.

WHAT IT DOES
  Stops the stack, releases the slot, removes the directory and prints how to
  re-attach a worktree to the branch later. A worktree that ran with its own
  database keeps it — drop it first with wt stop --drop-db.

EXAMPLES
  yarn wt dispose
  yarn wt dispose --force
EOF
}
