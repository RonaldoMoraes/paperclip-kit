#!/usr/bin/env bash
# Advisory reminder: a brand-new screen whose feature has no analytics call site.
#
# The rule it points at is AGENTS.md (Hit every surface ▸ Analytics): every new or
# refactored screen ships with an analytics proposal — success, funnel, choice, friction —
# for the developer to confirm before wiring. A hook cannot know whether the proposal
# happened; it only notices the one state that usually means it didn't (a new screen
# file, feature-wide silence on analytics) and says so. False negatives are fine — any
# useAnalytics / track( reference in the feature keeps it quiet.
#
# Contract: ADVISORY, never blocking. Always exit 0; when the heuristic fires, the
# reminder travels as hookSpecificOutput.additionalContext on stdout, so the agent sees
# it without the write being refused. guard.sh stays the blocking gate; this file never
# becomes one.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=lib/added.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/added.sh"

payload="$(cat)"
file="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')"
[ -n "$file" ] || exit 0

cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty')"
case "$file" in
  /*) abs="$file" ;;
  *) abs="${cwd:-$PWD}/$file" ;;
esac

# Cheap scope gate: string comparison only, for every edit outside this tree.
case "$abs" in
  "$ROOT"/*) ;;
  *) exit 0 ;;
esac

# Only a screen file in a web or mobile feature. Specs are not screens.
case "$abs" in
  *.spec.tsx | *.spec.ts) exit 0 ;;
  "$ROOT"/apps/web/src/features/*/screens/*.tsx | "$ROOT"/apps/mobile/src/features/*/screens/*.tsx) ;;
  *) exit 0 ;;
esac

# Only a NEW screen: a file the committed tree already carries had its proposal moment
# (or its recorded decline) when it landed.
is_new_file "$abs" || exit 0

# Any analytics reference anywhere in the feature counts — wiring often lives in a hook or
# the route, not the screen file itself.
feature_dir="${abs%/screens/*}"
grep -rqE 'useAnalytics|track\(' "$feature_dir" 2>/dev/null && exit 0

rel="${abs#"$ROOT"/}"
name="$(basename "$abs" .tsx)"
screen="$(printf '%s' "$name" | sed -E 's/([a-z0-9])([A-Z])/\1-\2/g' | tr '[:upper:]' '[:lower:]')"
feature="$(basename "$feature_dir")"

msg="REMINDER (advisory, nothing is blocked): $rel is a new screen and its feature has no analytics call site.
Before this screen is done, propose its events to the developer in one line each and wire the ones they keep through useAnalytics().track(event) — in a feature hook or the route, in the screen only for a tap it owns:
  success  { type: \"action\",   screen: \"$screen\", action: \"<what-they-did>\" }        — the behavior that means the screen did its job
  funnel   { type: \"funnel\",   flow: \"$feature\", step: \"$screen\", outcome: \"enter\" | \"complete\" | \"abandon\" }
  choice   { type: \"choice\",   screen: \"$screen\", choice: \"<option-id>\" }             — what they decided, as a closed id
  friction { type: \"friction\", screen: \"$screen\", kind: \"retry\" | \"validation\" | \"backout\" }
Every value is a closed enum, a number or a slug from shared/contracts/analytics/events.ts — never free text, an answer or message content; a new branch there needs a line in events.spec.ts. screen-viewed is automatic. If the developer declines, note it and move on.
See AGENTS.md (Hit every surface ▸ Analytics) and docs/analytics.md."

jq -n --arg ctx "$msg" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
exit 0
