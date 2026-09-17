#!/usr/bin/env bash
# Diff-aware counting for write-time guards — source this file, do not run it.
#
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/added.sh"
#   if [ "$(added 'vi\.hoisted[[:space:]]*\(' "$abs")" -gt 0 ]; then findings+=("…"); fi
#
# `added PATTERN FILE` prints how many lines matching the extended regex PATTERN the
# working copy of FILE has beyond its committed version (`git show HEAD:<path>`). A legacy
# file keeps its legacy count; only growth is a finding, so a rule can be introduced on a
# tree with a backlog and still bite on every new violation. Outside a git repo, or for a
# file with no committed version, the whole file counts.
#
# This is the tier for rules Biome cannot express: GritQL has no way to say "more than one
# of these in a file", and no way to compare against the committed version. A rule that
# fits a .grit belongs there instead — see the guardrails skill.
#
# `is_new_file FILE` is true when FILE has no committed version — for rules that apply
# only to files this edit creates (a screen without its events, a hook in the wrong dir).

added() {
  local pattern="$1" abs="$2" root rel now was
  now="$(grep -cE "$pattern" "$abs" 2>/dev/null || true)"
  root="$(git -C "$(dirname "$abs")" rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -z "$root" ]; then
    echo "${now:-0}"
    return 0
  fi
  rel="${abs#"$root"/}"
  was="$(git -C "$root" show "HEAD:$rel" 2>/dev/null | grep -cE "$pattern" 2>/dev/null || true)"
  echo $(( ${now:-0} - ${was:-0} ))
}

is_new_file() {
  local abs="$1" root rel
  root="$(git -C "$(dirname "$abs")" rev-parse --show-toplevel 2>/dev/null || true)"
  [ -n "$root" ] || return 0
  rel="${abs#"$root"/}"
  ! git -C "$root" cat-file -e "HEAD:$rel" 2>/dev/null
}
