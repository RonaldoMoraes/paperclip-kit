#!/usr/bin/env bash
# Runs a long, noisy command behind a single status line.
#
# Installs, builds and migrations produce thousands of lines that matter only
# when they fail. Their output goes to <worktree>/.wt/logs/<name>.log (.wt is
# gitignored) and the terminal gets one line per step.
#
# Two cases stream instead of capturing: WT_VERBOSE=1, and a plain checkout,
# which has no .wt/ to write into and is where CI wants the full transcript.
#
# Overmind's own process output in `wt run` is never routed through this — that
# output is the reason the terminal is there.

# wt_run_quiet <label> <log-name> -- <command>...
wt_run_quiet() {
  local label="$1" name="$2"
  shift 2
  [[ "${1:-}" == "--" ]] ||
    wt_die "wt_run_quiet: expected -- between the log name and the command"
  shift

  if [[ "${WT_VERBOSE:-0}" == "1" || "${WT_IS_WORKTREE:-false}" != true ]]; then
    wt_info "$label"
    local rc=0
    "$@" || rc=$?
    if ((rc == 0)); then
      wt_ok "$label"
    else
      wt_fail "$label"
    fi
    return "$rc"
  fi

  local log_dir="$WT_STATE_DIR/logs"
  local logfile="$log_dir/$name.log"
  mkdir -p "$log_dir"

  _wt_quiet_line_start "$label"
  local rc=0
  "$@" >"$logfile" 2>&1 || rc=$?
  _wt_quiet_line_clear

  if ((rc == 0)); then
    wt_ok "$label"
    return 0
  fi

  wt_fail "$label — see $logfile"
  # Migration and install failures echo connection strings. The log file keeps
  # them; the terminal, which ends up in pasted bug reports, must not.
  local line
  while IFS= read -r line; do
    wt_info "    $line"
  done < <(tail -30 "$logfile" 2>/dev/null | wt_redact_secrets || true)
  return "$rc"
}

_wt_quiet_line_start() {
  if [[ -t 1 ]]; then
    printf '  … %s' "$1"
  else
    printf '  … %s\n' "$1"
  fi
}

_wt_quiet_line_clear() {
  # Only a terminal can take the line back; a log file keeps the "…" line.
  [[ -t 1 ]] && printf '\033[2K\r'
  return 0
}
