#!/usr/bin/env bash
# Infrastructure the whole stack needs before any process starts: Docker, the
# shared Postgres container, a migrated database, sane .env files, and
# Overmind.
#
# Postgres is shared across every worktree — one container, many databases.
# Only the database name varies per worktree, and only when the worktree runs
# with --db. A product without a database module (no WT_COMPOSE_DB file)
# skips every database step.

wt_preflight_failures=0

# _wt_preflight_record — the single place the failure counter moves.
_wt_preflight_record() {
  wt_preflight_failures=$((wt_preflight_failures + 1))
}

_wt_preflight_fail() {
  wt_fail "$1"
  _wt_preflight_record
}

_wt_wait_for_docker() {
  local attempts="${1:-30}" attempt=1
  while ((attempt <= attempts)); do
    docker info >/dev/null 2>&1 && return 0
    sleep 2
    attempt=$((attempt + 1))
  done
  return 1
}

_wt_wait_for_postgres() {
  local attempts="${1:-30}" attempt=1
  while ((attempt <= attempts)); do
    docker exec "$WT_DB_CONTAINER" pg_isready -U "$WT_DB_USER" >/dev/null 2>&1 && return 0
    sleep 2
    attempt=$((attempt + 1))
  done
  return 1
}

_wt_postgres_is_crash_looping() {
  local status restarting count
  status="$(docker inspect "$WT_DB_CONTAINER" --format '{{.State.Status}}' 2>/dev/null || true)"
  restarting="$(docker inspect "$WT_DB_CONTAINER" --format '{{.State.Restarting}}' 2>/dev/null || true)"
  count="$(docker inspect "$WT_DB_CONTAINER" --format '{{.RestartCount}}' 2>/dev/null || echo 0)"
  [[ "$status" == "restarting" || "$restarting" == "true" || "${count:-0}" -ge 2 ]]
}

_wt_postgres_log_has_version_mismatch() {
  # `docker logs | grep -q` early-exits into SIGPIPE under `set -o pipefail`,
  # which reads as "no match". Capture first, match after.
  local logs
  logs="$(docker logs "$WT_DB_CONTAINER" 2>&1 || true)"
  [[ "$logs" == *"PostgreSQL data in:"* ]]
}

# _wt_preflight_database <database> <allow-unmigrated>
_wt_preflight_database() {
  local database="$1" allow_unmigrated="$2"
  local compose_db="$WT_PRIMARY_ROOT/$WT_COMPOSE_DB"

  if docker info >/dev/null 2>&1; then
    wt_ok "Docker running"
  else
    wt_info "Docker not ready — attempting to start it..."
    [[ "$(uname -s)" == "Darwin" ]] && { open -a Docker 2>/dev/null || true; }
    if _wt_wait_for_docker 45; then
      wt_ok "Docker running (started)"
    else
      _wt_preflight_fail "Docker is not running — start it and retry"
      return 0
    fi
  fi

  # wt_run_quiet prints its own pass/fail line, so only the counter and the
  # remediation hint are left to add here.
  if ! wt_run_quiet "$WT_COMPOSE_DB up" docker-compose \
    -- docker compose -f "$compose_db" up -d; then
    wt_info "Check: docker compose -f $compose_db up -d"
    _wt_preflight_record
  fi

  if _wt_wait_for_postgres 30; then
    wt_ok "Postgres ready ($WT_DB_CONTAINER)"
  elif _wt_postgres_is_crash_looping && _wt_postgres_log_has_version_mismatch; then
    _wt_preflight_fail "Postgres crash loop — the image is newer than the data in its volume"
    wt_info "Fix: docker compose -f $compose_db down -v   (drops the local data; the next run recreates it)"
    wt_info "Logs: docker compose -f $compose_db logs $WT_DB_CONTAINER"
    return 0
  else
    _wt_preflight_fail "Postgres not ready — run: docker compose -f $compose_db logs $WT_DB_CONTAINER"
    return 0
  fi

  if wt_db_exists "$database"; then
    wt_ok "Database '$database' exists"
  else
    wt_info "Creating database '$database'..."
    if wt_db_create "$database" || wt_db_exists "$database"; then
      wt_ok "Database '$database' created"
    else
      _wt_preflight_fail "Could not create database '$database'"
    fi
  fi

  # The servers read tables that only exist after migrations.
  if wt_db_is_migrated "$database"; then
    wt_ok "Database schema present ($WT_DB_SENTINEL_TABLE)"
  elif [[ "$allow_unmigrated" == true ]]; then
    wt_warn "Database '$database' has no migrations yet — applying them next"
  else
    _wt_preflight_fail "Database '$database' has no migrations — run: yarn wt run"
  fi
}

# wt_preflight <database-name> <allow-unmigrated> <proc>...
# 0 when every check passes, 1 otherwise. Pass allow-unmigrated=true when the
# caller is about to run the migrations itself. The processes decide which
# .env files are checked.
wt_preflight() {
  local database="$1" allow_unmigrated="${2:-false}"
  shift 2
  wt_preflight_failures=0

  wt_header "preflight"

  if wt_db_enabled; then
    _wt_preflight_database "$database" "$allow_unmigrated"
  else
    wt_info "No $WT_COMPOSE_DB in the primary checkout — database preflight skipped"
  fi

  # shellcheck disable=SC2034  # env-check.sh appends to it
  WT_ENV_CHECK_WARNINGS=()
  local rel
  while IFS= read -r rel; do
    [[ -n "$rel" ]] || continue
    wt_assert_env_clean "$WT_ROOT/$rel" "$rel" || _wt_preflight_record
  done < <(wt_env_overlay_files "" "$@")
  wt_env_check_print_warnings

  if command -v overmind >/dev/null 2>&1; then
    # `overmind version` is not a subcommand — it prints a help miss and exits 3.
    # `--version` is the spelling that works; the string is still validated so a
    # future rename degrades to "version unknown" instead of a help message.
    local overmind_version
    overmind_version="$(overmind --version 2>/dev/null | head -1 || true)"
    [[ "$overmind_version" == *[Vv]ersion* ]] || overmind_version="version unknown"
    wt_ok "overmind installed ($overmind_version)"
  else
    _wt_preflight_fail "overmind not found — $(wt_overmind_install_hint)"
  fi

  wt_header "preflight summary"
  if ((wt_preflight_failures > 0)); then
    wt_fail "$wt_preflight_failures check(s) failed"
    return 1
  fi
  wt_ok "All preflight checks passed"
  return 0
}
