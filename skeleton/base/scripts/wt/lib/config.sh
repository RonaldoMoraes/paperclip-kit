#!/usr/bin/env bash
# Loads wt.config.sh — the one file that names the product — and turns its
# process table into the arrays every other lib reads.
#
# Bash 3.2 (what macOS ships) has no associative arrays, so the table is a set
# of parallel indexed arrays: WT_PROC_NAMES[i], WT_PROC_CWDS[i] and so on.
# WT_PROC_PORTS[i] is filled by wt_ports once the slot is known.

WT_PROC_NAMES=()
WT_PROC_CWDS=()
WT_PROC_CMDS=()
WT_PROC_BASES=()
WT_PROC_HEALTHS=()
WT_PROC_ENVS=()
WT_PROC_KEYS=()
WT_PROC_PORTS=()
WT_DEFAULT_PROC_LIST=()
WT_SLOT_CURRENT=""

# wt_config_load — sources $WT_CONFIG (default: wt.config.sh beside the wt
# script), fills in defaults for optional knobs, parses and validates WT_PROCS.
wt_config_load() {
  local file="${WT_CONFIG:-$WT_SCRIPT_DIR/wt.config.sh}"
  [[ -f "$file" ]] || wt_die "wt.config.sh not found at $file"
  # shellcheck source=../wt.config.sh
  source "$file"

  : "${WT_REPO_PREFIX:?wt.config.sh must set WT_REPO_PREFIX}"
  : "${WT_TRUNK:?wt.config.sh must set WT_TRUNK}"
  : "${WT_PROTECTED:=main $WT_TRUNK releases/*}"
  : "${WT_BRANCH_TYPES:=feat fix refactor test docs chore}"
  : "${WT_TICKET_RE:=^([A-Z][A-Z0-9]+-[0-9]+)-(.+)\$}"
  : "${WT_WORKTREE_BASE_DEFAULT:=$HOME/worktrees}"
  : "${WT_COMPOSE_DB:=}"
  : "${WT_DB_CONTAINER:=postgres}"
  : "${WT_DB_USER:=postgres}"
  : "${WT_SHARED_DB:=app}"
  : "${WT_DB_URL_KEY:=DATABASE_URL}"
  : "${WT_DB_ENV_FILE:=.env}"
  : "${WT_DB_DIR:=db}"
  : "${WT_DB_SCHEMA_DIR:=$WT_DB_DIR/prisma}"
  : "${WT_DB_SENTINEL_TABLE:=_prisma_migrations}"
  : "${WT_DB_MIGRATE_CMD:=yarn db:migrate:deploy}"
  : "${WT_DB_SEED_CMD:=yarn db:seed}"
  : "${WT_DB_GENERATE_CMD:=}"
  : "${WT_DB_GENERATED_DIR:=}"
  : "${WT_DEPS_RELEVANT:=^yarn\\.lock\$|(^|/)package\\.json\$}"
  : "${WT_DEPS_SYNC_CMD:=yarn install}"
  : "${WT_PORT_STRIDE:=10}"
  : "${WT_DEFAULT_PROCS:=}"

  [[ -n "${WT_PROCS+x}" && ${#WT_PROCS[@]} -gt 0 ]] ||
    wt_die "wt.config.sh declares no processes (WT_PROCS is empty)"
  [[ "$WT_PORT_STRIDE" =~ ^[0-9]+$ && "$WT_PORT_STRIDE" -gt 0 ]] ||
    wt_die "WT_PORT_STRIDE must be a positive integer (got '$WT_PORT_STRIDE')"

  local entry name cwd cmd base health env keys
  for entry in "${WT_PROCS[@]}"; do
    # Seven |-separated fields; `read` keeps empty fields because the IFS
    # character is not whitespace. The last variable takes the remainder.
    IFS='|' read -r name cwd cmd base health env keys <<<"$entry"
    [[ "$name" =~ ^[a-z][a-z0-9-]*$ ]] ||
      wt_die "WT_PROCS: '$name' is not a process name (lowercase letters, digits, dashes) in: $entry"
    [[ -n "$cmd" ]] || wt_die "WT_PROCS: '$name' has no command"
    [[ "$base" =~ ^[0-9]+$ ]] || wt_die "WT_PROCS: '$name' has no numeric base port (got '$base')"
    wt_proc_index "$name" >/dev/null && wt_die "WT_PROCS: process '$name' is declared twice"
    WT_PROC_NAMES+=("$name")
    WT_PROC_CWDS+=("${cwd:-.}")
    WT_PROC_CMDS+=("$cmd")
    WT_PROC_BASES+=("$base")
    WT_PROC_HEALTHS+=("$health")
    WT_PROC_ENVS+=("$env")
    WT_PROC_KEYS+=("$keys")
    WT_PROC_PORTS+=("")
  done

  # Every port is base + stride × slot. A base that another base's slot
  # arithmetic lands on would make two processes collide on some slot — and
  # would make the overlay's port swaps cascade — so it is refused up front.
  local i j s
  for ((i = 0; i < ${#WT_PROC_NAMES[@]}; i++)); do
    for ((j = 0; j < ${#WT_PROC_NAMES[@]}; j++)); do
      [[ "$i" -eq "$j" ]] && continue
      for ((s = 0; s <= WT_SLOT_MAX; s++)); do
        if ((WT_PROC_BASES[i] + WT_PORT_STRIDE * s == WT_PROC_BASES[j])); then
          wt_die "WT_PROCS: ${WT_PROC_NAMES[$i]} (base ${WT_PROC_BASES[$i]}) reaches ${WT_PROC_NAMES[$j]}'s base ${WT_PROC_BASES[$j]} on slot $s.
  Keep bases more than $((WT_PORT_STRIDE * WT_SLOT_MAX)) apart, or change WT_PORT_STRIDE."
        fi
      done
    done
  done

  WT_DEFAULT_PROC_LIST=()
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    wt_proc_index "$name" >/dev/null ||
      wt_die "WT_DEFAULT_PROCS names '$name', which WT_PROCS does not declare (known: ${WT_PROC_NAMES[*]})"
    WT_DEFAULT_PROC_LIST+=("$name")
  done < <(wt_split_list "$WT_DEFAULT_PROCS")
  [[ ${#WT_DEFAULT_PROC_LIST[@]} -gt 0 ]] ||
    wt_die "WT_DEFAULT_PROCS is empty — name at least one process to start by default"
}

# wt_split_list <string> — items separated by commas or whitespace, one per
# line, each newline-terminated so a `while read` loop sees the last one.
wt_split_list() {
  local item
  # shellcheck disable=SC2086  # word-splitting the list is the point
  for item in ${1//,/ }; do
    printf '%s\n' "$item"
  done
}

# wt_proc_index <name> — prints the process's index, or fails when unknown.
wt_proc_index() {
  local i
  for ((i = 0; i < ${#WT_PROC_NAMES[@]}; i++)); do
    if [[ "${WT_PROC_NAMES[$i]}" == "$1" ]]; then
      printf '%s' "$i"
      return 0
    fi
  done
  return 1
}

wt_proc_known() {
  wt_proc_index "$1" >/dev/null
}

# wt_proc_port <name> — the process's port on the current slot (after wt_ports).
wt_proc_port() {
  local i
  i="$(wt_proc_index "$1")" || return 1
  printf '%s' "${WT_PROC_PORTS[$i]}"
}

# wt_proc_selected <name> <selected>... — true when <name> is in the list.
wt_proc_selected() {
  local needle="$1" candidate
  shift
  for candidate in "$@"; do
    [[ "$candidate" == "$needle" ]] && return 0
  done
  return 1
}

# wt_expand_template <template> [proc-index] — fills {port}, {base}, {slot},
# {root} and {<name>} for every declared process. {port} and {base} need the
# index of the process the template belongs to.
wt_expand_template() {
  local text="$1" i="${2:-}" j
  if [[ -n "$i" ]]; then
    text="${text//\{port\}/${WT_PROC_PORTS[$i]}}"
    text="${text//\{base\}/${WT_PROC_BASES[$i]}}"
  fi
  text="${text//\{slot\}/$WT_SLOT_CURRENT}"
  text="${text//\{root\}/${WT_ROOT:-}}"
  for ((j = 0; j < ${#WT_PROC_NAMES[@]}; j++)); do
    text="${text//\{${WT_PROC_NAMES[$j]}\}/${WT_PROC_PORTS[$j]}}"
  done
  printf '%s' "$text"
}

# wt_is_protected_branch <branch> — true when it matches a WT_PROTECTED glob.
wt_is_protected_branch() {
  local pattern
  for pattern in $WT_PROTECTED; do
    # shellcheck disable=SC2053  # unquoted on purpose: the pattern is a glob
    [[ "$1" == $pattern ]] && return 0
  done
  return 1
}

# wt_db_enabled — true when the product has a database module: the compose
# file the config names exists in the primary checkout. Needs a resolved
# context.
wt_db_enabled() {
  [[ -n "$WT_COMPOSE_DB" && -f "$WT_PRIMARY_ROOT/$WT_COMPOSE_DB" ]]
}
