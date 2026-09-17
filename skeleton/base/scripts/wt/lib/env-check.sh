#!/usr/bin/env bash
# Validates .env files for the local-dev pitfalls that produce confusing
# runtime failures rather than parse errors: CRLF endings, inline comments on
# keys a naive env parser reads, and a database URL pointing away from the
# shared local Postgres.
#
# WT_ENV_CHECK_KEYS (optional, in wt.config.sh) adds keys to inspect beyond
# WT_DB_URL_KEY.

WT_ENV_CHECK_WARNINGS=()

# _wt_env_url_host <url> — the host part of a connection string, or nothing.
_wt_env_url_host() {
  if [[ "$1" =~ ://([^@/]*@)?([^:/?]+) ]]; then
    printf '%s' "${BASH_REMATCH[2]}"
  fi
}

# wt_assert_env_clean <env-file> [label] — 0 when clean, 1 when issues found.
wt_assert_env_clean() {
  local env_file="$1"
  local label="${2:-$env_file}"

  if [[ ! -f "$env_file" ]]; then
    wt_fail "$label — file not found: $env_file"
    return 1
  fi

  local issues=()

  if grep -q $'\r' "$env_file" 2>/dev/null; then
    issues+=("CRLF line endings detected — fix: perl -pi -e 's/\\r\$//' \"$env_file\"")
  fi

  local keys=("$WT_DB_URL_KEY")
  local extra
  for extra in ${WT_ENV_CHECK_KEYS:-}; do
    keys+=("$extra")
  done

  local var line value
  for var in "${keys[@]}"; do
    line="$(grep -E "^${var}=" "$env_file" 2>/dev/null | head -1 || true)"
    [[ -n "$line" ]] || continue

    # Only whitespace-preceded '#' is a comment; a '#' inside a URL fragment or
    # a password is part of the value.
    if [[ "$line" =~ [[:space:]]# ]]; then
      issues+=("${var}: inline comment on the same line — move it to its own line above")
    fi

    value="${line#*=}"
    if [[ "$value" =~ ^\".*\".*\" ]] || [[ "$value" =~ ^\'.*\'.*\' ]]; then
      issues+=("${var}: suspicious quoting — use unquoted values for local dev")
    fi
  done

  # --db derives the worktree's database URL from this value by swapping the
  # database name, so a remote host here would put the worktree's database on
  # that remote.
  line="$(grep -E "^${WT_DB_URL_KEY}=" "$env_file" 2>/dev/null | head -1 || true)"
  if [[ -n "$line" ]]; then
    local host
    host="$(_wt_env_url_host "${line#*=}")"
    case "$host" in
      "" | localhost | 127.0.0.1 | "[::1]" | host.docker.internal) ;;
      *) WT_ENV_CHECK_WARNINGS+=("$label: $WT_DB_URL_KEY points at '$host', not the shared local Postgres") ;;
    esac
  fi

  if [[ ${#issues[@]} -gt 0 ]]; then
    wt_fail "$label — .env issues:"
    local issue
    for issue in ${issues[@]+"${issues[@]}"}; do
      wt_info "    -> $issue"
    done
    return 1
  fi

  wt_ok "$label — .env clean"
  return 0
}

wt_env_check_print_warnings() {
  [[ ${#WT_ENV_CHECK_WARNINGS[@]} -eq 0 ]] && return 0
  local warning
  for warning in "${WT_ENV_CHECK_WARNINGS[@]}"; do
    wt_warn "$warning"
  done
}
