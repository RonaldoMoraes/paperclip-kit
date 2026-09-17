#!/usr/bin/env bash
# Terminal output helpers shared by every wt subcommand.

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1; then
  COLOR_RESET="$(tput sgr0 2>/dev/null || true)"
  COLOR_GREEN="$(tput setaf 2 2>/dev/null || true)"
  COLOR_RED="$(tput setaf 1 2>/dev/null || true)"
  COLOR_YELLOW="$(tput setaf 3 2>/dev/null || true)"
  COLOR_BLUE="$(tput setaf 4 2>/dev/null || true)"
  COLOR_DIM="$(tput dim 2>/dev/null || true)"
else
  COLOR_RESET=""
  COLOR_GREEN=""
  COLOR_RED=""
  COLOR_YELLOW=""
  COLOR_BLUE=""
  COLOR_DIM=""
fi

wt_ok() {
  printf "  %s✓%s %s\n" "$COLOR_GREEN" "$COLOR_RESET" "$1"
}

wt_fail() {
  printf "  %s✗%s %s\n" "$COLOR_RED" "$COLOR_RESET" "$1"
}

wt_warn() {
  printf "  %s!%s %s\n" "$COLOR_YELLOW" "$COLOR_RESET" "$1"
}

wt_info() {
  printf "  %s%s%s\n" "$COLOR_DIM" "$1" "$COLOR_RESET"
}

wt_header() {
  printf "\n%s[%s]%s\n" "$COLOR_BLUE" "$1" "$COLOR_RESET"
}

wt_die() {
  printf "ERROR: %s\n" "$1" >&2
  exit "${2:-1}"
}

# wt_redact_secrets — filter that masks passwords in URLs on the way to the
# terminal. Connection strings appear verbatim in install and migration output.
wt_redact_secrets() {
  sed -E 's#(://[^:/@[:space:]]+:)[^@[:space:]]+@#\1***@#g'
}
