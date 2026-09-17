#!/usr/bin/env bash
# wt run — bring this worktree's stack up.
#
# The single way to start anything. An app started outside `wt run` reads the
# primary checkout's ports and collides with whatever else is running.

# _wt_run_resolve_procs <only-list> <with-list> — prints the processes to
# start, one per line, validated against the config.
_wt_run_resolve_procs() {
  local only_list="$1" with_list="$2" name
  if [[ -n "$only_list" ]]; then
    while IFS= read -r name; do
      [[ -n "$name" ]] || continue
      wt_proc_known "$name" || wt_die "Unknown process '$name' (known: ${WT_PROC_NAMES[*]})"
      printf '%s\n' "$name"
    done < <(wt_split_list "$only_list")
    return 0
  fi
  printf '%s\n' "${WT_DEFAULT_PROC_LIST[@]}"
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    wt_proc_known "$name" || wt_die "Unknown process '$name' for --with (known: ${WT_PROC_NAMES[*]})"
    printf '%s\n' "$name"
  done < <(wt_split_list "$with_list")
}

wt_cmd_run() {
  local use_db=false shared_db=false auto_db=false only_list="" with_list=""

  # WT_RUN_FLAGS holds a developer's standing flags (for example --with metro),
  # so a shared launcher (an editor worktree hook) can say `wt run --auto-db`
  # and each machine adds what it always wants. Prepended, so the command line
  # wins where flags are exclusive.
  if [[ -n "${WT_RUN_FLAGS:-}" ]]; then
    # shellcheck disable=SC2086  # word-splitting the flag string is the point
    set -- ${WT_RUN_FLAGS} "$@"
  fi

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --db)
        use_db=true
        shift
        ;;
      --shared-db)
        shared_db=true
        shift
        ;;
      --auto-db)
        auto_db=true
        shift
        ;;
      --only)
        only_list="${2:?--only needs a comma-separated list of processes}"
        shift 2
        ;;
      --with)
        with_list="${with_list:+$with_list,}${2:?--with needs a process name}"
        shift 2
        ;;
      *) wt_die "Unknown argument for run: $1" ;;
    esac
  done

  if [[ "$use_db" == true && "$shared_db" == true ]]; then
    wt_die "--db and --shared-db are contradictory: --db gives this worktree its own
  database, --shared-db keeps it on '$WT_SHARED_DB'. Pass one."
  fi
  if [[ "$auto_db" == true && ("$use_db" == true || "$shared_db" == true) ]]; then
    wt_die "--auto-db decides between --db and --shared-db from the branch's diff;
  do not combine it with either."
  fi
  if [[ -n "$with_list" && -n "$only_list" ]]; then
    wt_die "--with adds to the default set; with --only, name everything in the list
  instead: --only ${only_list},${with_list}"
  fi

  wt_resolve_context "$PWD"
  if [[ "$WT_IS_WORKTREE" != true ]]; then
    wt_die "wt run does not run in the primary checkout — slot 0 is its ports and it is
  never worked in. Create a worktree: yarn wt create <branch>"
  fi

  local slot
  slot="$(wt_slot_require)"
  wt_ports "$slot"

  local procs=() name
  while IFS= read -r name; do
    [[ -n "$name" ]] && procs+=("$name")
  done < <(_wt_run_resolve_procs "$only_list" "$with_list")
  [[ ${#procs[@]} -gt 0 ]] || wt_die "No processes selected"

  wt_header "wt run — slot $slot"
  wt_info "Worktree: $WT_ROOT"
  wt_info "Branch:   $WT_BRANCH"

  # Without the process manager nothing below can start. Say so before any
  # overlay is written, and leave the Procfile behind as the description of
  # what would have run.
  if ! command -v overmind >/dev/null 2>&1; then
    wt_write_procfile "$slot" "${procs[@]}"
    printf '\n' >&2
    cat "$WT_STATE_DIR/Procfile" >&2
    printf '\n' >&2
    wt_die "overmind is not installed — wt run needs it to start the stack.
  $(wt_overmind_install_hint)
  The stack this worktree would start is printed above (also in .wt/Procfile).
  Nothing was started and no .env overlay was written."
  fi

  # A branch that changes the schema must not migrate the shared database.
  # --auto-db is how a launcher that cannot know the branch (an editor hook, an
  # agent) gets the right answer: own database when the schema dir is touched,
  # shared otherwise.
  local database="" database_url=""
  if wt_db_enabled; then
    if [[ "$auto_db" == true ]]; then
      if wt_diff_touches_schema; then
        use_db=true
        wt_info "--auto-db: this branch changes $WT_DB_SCHEMA_DIR/ — using its own database"
      else
        wt_info "--auto-db: no $WT_DB_SCHEMA_DIR/ changes — using the shared '$WT_SHARED_DB' database"
      fi
    fi

    database="$WT_SHARED_DB"
    if [[ "$use_db" == true ]]; then
      database="$(wt_db_name)"
      database_url="$(wt_db_url "$database")"
    elif [[ "$shared_db" != true ]] && wt_diff_touches_schema; then
      wt_die "This branch changes $WT_DB_SCHEMA_DIR/ and would migrate the
  shared '$WT_SHARED_DB' database. Run it on its own database instead:
    yarn wt run --db
  Or accept the risk explicitly with --shared-db."
    fi
  else
    if [[ "$use_db" == true || "$shared_db" == true ]]; then
      wt_die "This product has no database module ($WT_COMPOSE_DB is not in the primary
  checkout), so --db and --shared-db mean nothing here."
    fi
    [[ "$auto_db" == true ]] && wt_info "--auto-db: no database module — ignored"
  fi

  wt_header "env overlays"
  wt_env_overlay "$database_url" "${procs[@]}"

  # A failure from here on would otherwise strand generated overlays in place
  # of the symlinks, leaving the worktree pointing at this slot's ports with
  # nothing running on them.
  if ! wt_deps_preflight; then
    wt_env_restore_symlinks
    exit 1
  fi

  if wt_db_enabled && ! wt_db_generate_if_missing; then
    wt_env_restore_symlinks
    exit 1
  fi

  # Preflight brings Postgres up and creates the target database, so the
  # migrations below have something to run against.
  if ! wt_preflight "$database" true "${procs[@]}"; then
    wt_env_restore_symlinks
    exit 1
  fi

  # The worktree's own database is migrated on every run (a migration added
  # after the first --db run has to land). The shared one is migrated only
  # when it is empty — a fresh machine — and this branch is on it precisely
  # because it does not change the schema, so the migrations it applies are
  # the trunk's.
  if wt_db_enabled; then
    if [[ "$use_db" == true ]]; then
      wt_header "database"
      wt_db_migrate "$database"
      wt_info "Stack will use database '$database'"
    elif ! wt_db_is_migrated "$database"; then
      wt_header "database"
      wt_info "Shared database '$database' is empty — migrating and seeding it from this branch"
      wt_db_migrate "$database"
    fi
  fi

  wt_header "ports"
  wt_overmind_stop
  # A worktree removed from under a running stack (editor worktree hooks and
  # other tools delete the directory without stopping anything) leaves an
  # Overmind whose Procfile no longer exists, still holding its slot's ports.
  wt_overmind_reap_orphans
  # Only the selected processes' ports: another port on this machine may belong
  # to a stack this run is not replacing.
  local ports=() proc
  for proc in "${procs[@]}"; do
    ports+=("$(wt_proc_port "$proc")")
  done
  if ! wt_kill_port_listeners "${ports[@]}"; then
    wt_env_restore_symlinks
    exit 1
  fi
  local summary="${ports[*]}"
  wt_ok "Ports free — ${summary// /, }"

  wt_write_procfile "$slot" "${procs[@]}"

  wt_header "starting"
  local i url
  for proc in "${procs[@]}"; do
    i="$(wt_proc_index "$proc")"
    url="$(wt_expand_template "${WT_PROC_HEALTHS[$i]}" "$i")"
    wt_info "$(printf '%-12s port %s%s' "$proc" "${WT_PROC_PORTS[$i]}" "${url:+  $url}")"
  done
  wt_info "Status       yarn wt status     Logs  yarn wt logs <proc>     Stop  yarn wt stop"

  wt_overmind_start "$slot"
}

# wt health — poll this worktree's stack until it answers.
wt_cmd_health() {
  [[ $# -eq 0 ]] || wt_die "Unknown argument for health: $1"

  wt_resolve_context "$PWD"
  wt_require_worktree

  local slot
  slot="$(wt_slot_require)"
  wt_ports "$slot"

  local procs=("${WT_DEFAULT_PROC_LIST[@]}")
  local procfile="$WT_STATE_DIR/Procfile"
  if [[ -f "$procfile" ]]; then
    # mapfile is bash 4+; macOS ships bash 3.2.
    procs=()
    local line
    while IFS= read -r line; do
      procs+=("$line")
    done < <(awk -F: '/^[a-z][a-z0-9-]*:/ {print $1}' "$procfile")
  fi

  wt_healthcheck ${procs[@]+"${procs[@]}"}
}
