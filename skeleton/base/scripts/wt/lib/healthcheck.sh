#!/usr/bin/env bash
# Polls the stack's HTTP surfaces until they answer. Each process's health URL
# comes from wt.config.sh; an https:// URL is probed with -k, because a local
# HTTPS server is self-signed.

WT_HEALTH_TIMEOUT_SECONDS="${WT_HEALTH_TIMEOUT_SECONDS:-90}"
WT_HEALTH_INTERVAL_SECONDS="${WT_HEALTH_INTERVAL_SECONDS:-3}"

wt_health_failures=0

# _wt_wait_for_service <label> <curl-args...>
_wt_wait_for_service() {
  local label="$1"
  shift
  local elapsed=0 last_error=""

  while ((elapsed < WT_HEALTH_TIMEOUT_SECONDS)); do
    if last_error="$(curl "$@" 2>&1)"; then
      wt_ok "$label"
      return 0
    fi
    sleep "$WT_HEALTH_INTERVAL_SECONDS"
    elapsed=$((elapsed + WT_HEALTH_INTERVAL_SECONDS))
  done

  wt_fail "$label — not ready after ${WT_HEALTH_TIMEOUT_SECONDS}s (${last_error:-no response})"
  wt_health_failures=$((wt_health_failures + 1))
  return 1
}

# wt_healthcheck <proc-name>...
wt_healthcheck() {
  wt_health_failures=0
  wt_header "healthcheck"

  local proc i url
  for proc in "$@"; do
    i="$(wt_proc_index "$proc")" || {
      wt_warn "$proc is not a declared process — skipped"
      continue
    }
    url="$(wt_expand_template "${WT_PROC_HEALTHS[$i]}" "$i")"
    if [[ -z "$url" ]]; then
      wt_info "$proc has no health URL — skipped"
      continue
    fi
    if [[ "$url" == https://* ]]; then
      _wt_wait_for_service "$proc ($url)" -kfsS --max-time 5 -o /dev/null "$url" || true
    else
      _wt_wait_for_service "$proc ($url)" -fsS --max-time 5 -o /dev/null "$url" || true
    fi
  done

  wt_header "healthcheck summary"
  if ((wt_health_failures > 0)); then
    wt_fail "$wt_health_failures service(s) not healthy — check: yarn wt logs <proc>"
    return 1
  fi
  wt_ok "All services healthy"
  return 0
}
