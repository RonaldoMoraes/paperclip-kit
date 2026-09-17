#!/usr/bin/env bash
# The per-worktree database.
#
# Every worktree shares one Postgres container and, by default, one database
# (WT_SHARED_DB). A worktree that changes the schema gets its own database on
# that same container, so its migrations never reach the shared one.
#
# The whole module is inert when the product has no database: wt_db_enabled
# (config.sh) is false when WT_COMPOSE_DB does not exist, and every caller
# checks it first.

# _wt_psql <args...> — psql inside the shared container.
_wt_psql() {
  docker exec "$WT_DB_CONTAINER" psql -U "$WT_DB_USER" "$@"
}

# wt_db_name — the database this worktree owns when it runs with --db.
# Postgres identifiers cap at 63 bytes.
wt_db_name() {
  local name="${WT_SHARED_DB}_$WT_SLUG"
  printf '%s' "${name:0:63}"
}

# wt_db_url <database> — the primary checkout's connection string with only the
# database name swapped, so credentials, host, port and query stay whatever the
# developer configured.
wt_db_url() {
  local database="$1" line="" value
  local fallback="postgresql://$WT_DB_USER:$WT_DB_USER@127.0.0.1:5432/$database"

  local env_file="$WT_PRIMARY_ROOT/$WT_DB_ENV_FILE"
  if [[ -f "$env_file" ]]; then
    line="$(grep -E "^${WT_DB_URL_KEY}=" "$env_file" | head -1 || true)"
  fi
  [[ -n "$line" ]] || {
    printf '%s' "$fallback"
    return 0
  }

  value="${line#*=}"
  value="${value%%[[:space:]]#*}"
  value="${value#[\"\']}"
  value="${value%[\"\']}"

  # Replace only the path segment between the last '/' and any '?'.
  if [[ "$value" =~ ^(.*/)([^/?]*)(\?.*)?$ ]]; then
    printf '%s%s%s' "${BASH_REMATCH[1]}" "$database" "${BASH_REMATCH[3]}"
  else
    printf '%s' "$fallback"
  fi
}

# wt_db_exists <database>
wt_db_exists() {
  _wt_psql -lqt 2>/dev/null | cut -d '|' -f 1 | grep -qw "$1"
}

# wt_db_is_migrated <database> — true once the sentinel table exists.
wt_db_is_migrated() {
  _wt_psql -d "$1" -tAc "SELECT to_regclass('public.$WT_DB_SENTINEL_TABLE')" 2>/dev/null |
    grep -q "$WT_DB_SENTINEL_TABLE"
}

wt_db_create() {
  _wt_psql -c "CREATE DATABASE \"$1\";" >/dev/null 2>&1
}

wt_db_drop() {
  local database="$1"
  if [[ "$database" == "$WT_SHARED_DB" ]]; then
    wt_die "Refusing to drop the shared database '$WT_SHARED_DB'."
  fi
  if ! wt_db_exists "$database"; then
    wt_ok "Database '$database' is already gone"
    return 0
  fi
  _wt_psql -c "DROP DATABASE \"$database\" WITH (FORCE);" >/dev/null 2>&1 ||
    wt_die "Could not drop database '$database'"
  wt_ok "Database '$database' dropped"
}

# _wt_db_run <label> <log-name> <command> — runs a config command inside
# WT_DB_DIR with the database URL exported under WT_DB_URL_KEY.
_wt_db_run() {
  local label="$1" name="$2" command="$3" url="$4"
  (
    cd "$WT_ROOT/$WT_DB_DIR" || exit 1
    export "$WT_DB_URL_KEY=$url"
    wt_run_quiet "$label" "$name" -- bash -c "$command"
  )
}

# wt_db_migrate <database> — brings the database up to the branch's schema.
#
# The migrate command runs every time: it is idempotent, and a migration added
# after the first --db run would otherwise never reach an already-migrated
# database. Seeding is the part that must happen once, so a fresh database gets
# WT_DB_SEED_CMD (migrate + seed) and an existing one WT_DB_MIGRATE_CMD only.
wt_db_migrate() {
  local database="$1"
  local url
  url="$(wt_db_url "$database")"

  if wt_db_is_migrated "$database"; then
    _wt_db_run "Migrations on '$database' (seed skipped — already populated)" \
      db-migrate "$WT_DB_MIGRATE_CMD" "$url" ||
      wt_die "Migrations failed on '$database'"
    return 0
  fi

  _wt_db_run "Migrating and seeding '$database'" db-seed "$WT_DB_SEED_CMD" "$url" ||
    wt_die "Migrate + seed failed on '$database'"
}

# wt_db_generate_if_missing — a fresh worktree has no generated client until
# something generates it. No-op when the config names no generated directory.
wt_db_generate_if_missing() {
  [[ -n "$WT_DB_GENERATED_DIR" && -n "$WT_DB_GENERATE_CMD" ]] || return 0
  [[ -d "$WT_ROOT/$WT_DB_GENERATED_DIR" ]] && return 0
  (
    cd "$WT_ROOT/$WT_DB_DIR" || exit 1
    wt_run_quiet "Database client (missing in this worktree)" db-generate -- bash -c "$WT_DB_GENERATE_CMD"
  )
}

# wt_base_ref — the ref this worktree was cut from, recorded by `wt create`.
wt_base_ref() {
  local file="$WT_STATE_DIR/base"
  if [[ -f "$file" ]]; then
    tr -d '[:space:]' <"$file"
    return 0
  fi
  printf 'origin/%s' "$WT_TRUNK"
}

# wt_diff_touches_schema — true when the branch changes WT_DB_SCHEMA_DIR
# relative to its base, committed or not.
wt_diff_touches_schema() {
  local base merge_base changed
  base="$(wt_base_ref)"
  merge_base="$(git -C "$WT_ROOT" merge-base "$base" HEAD 2>/dev/null || true)"
  if [[ -z "$merge_base" ]]; then
    wt_warn "Cannot resolve this worktree's base ('$base') — the schema check is skipped."
    wt_warn "If this branch changes $WT_DB_SCHEMA_DIR/, run: yarn wt run --db"
    return 1
  fi
  changed="$(git -C "$WT_ROOT" diff --name-only "$merge_base" 2>/dev/null || true)"
  changed+=$'\n'"$(git -C "$WT_ROOT" ls-files --others --exclude-standard 2>/dev/null || true)"
  grep -q "^${WT_DB_SCHEMA_DIR%/}/" <<<"$changed"
}
