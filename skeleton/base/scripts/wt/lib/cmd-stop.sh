#!/usr/bin/env bash
# wt stop / status / logs — control a running stack.
#
# Postgres stays up: it is shared with every other worktree.

wt_cmd_stop() {
  local drop_db=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --drop-db)
        drop_db=true
        shift
        ;;
      *) wt_die "Unknown argument for stop: $1" ;;
    esac
  done

  wt_resolve_context "$PWD"
  wt_require_worktree

  if [[ "$drop_db" == true ]] && ! wt_db_enabled; then
    wt_die "This product has no database module ($WT_COMPOSE_DB is not in the primary
  checkout), so there is no database to drop."
  fi

  local slot
  slot="$(wt_slot_require)"
  wt_ports "$slot"

  wt_header "stop"
  wt_overmind_stop
  # A port held by something outside this stack must not stop the rest of the
  # teardown — the symlinks still have to go back.
  local ports=()
  local port
  while IFS= read -r port; do
    ports+=("$port")
  done < <(wt_slot_all_ports)
  if ! wt_kill_port_listeners "${ports[@]}"; then
    wt_warn "Some ports are still held — check them with: lsof -i :<port>"
  fi
  wt_ok "Stack stopped (slot $slot)"

  wt_env_restore_symlinks

  if [[ "$drop_db" == true ]]; then
    wt_header "database"
    wt_db_drop "$(wt_db_name)"
  fi

  if wt_db_enabled; then
    wt_info "Postgres is left running — it is shared."
  fi
}

wt_cmd_status() {
  [[ $# -eq 0 ]] || wt_die "Unknown argument for status: $1"

  wt_resolve_context "$PWD"
  wt_require_worktree

  local slot
  slot="$(wt_slot_require)"
  wt_ports "$slot"

  wt_header "status — slot $slot"
  wt_info "Worktree: $WT_ROOT"
  wt_info "Branch:   $WT_BRANCH"
  wt_info "Base:     $(wt_base_ref)"
  wt_info "Ports:    $(wt_ports_summary)"
  printf '\n'

  if wt_overmind_is_running; then
    overmind status -s "$(wt_overmind_socket)"
  elif ! command -v overmind >/dev/null 2>&1; then
    wt_info "overmind is not installed — $(wt_overmind_install_hint)"
  else
    wt_info "Overmind is not running here. Start it with: yarn wt run"
  fi
}

wt_cmd_logs() {
  local proc="${1:-}"

  wt_resolve_context "$PWD"
  wt_require_worktree

  # Attaching without a name drops the caller into whichever process Overmind
  # picks, in a tmux session they did not ask for. Always require the name.
  if [[ -z "$proc" ]]; then
    wt_die "wt logs needs a process name: ${WT_PROC_NAMES[*]}
  See what is running with: yarn wt status"
  fi

  wt_overmind_is_running || wt_die "Overmind is not running here. Start it with: yarn wt run"

  exec overmind connect -s "$(wt_overmind_socket)" "$proc"
}
