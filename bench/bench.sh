#!/usr/bin/env bash
# The whole benchmark, one approach at a time: prepare → plan/implement/verify → gates +
# acceptance, then the blind judge and the report. Re-running resumes: a prepared workspace is
# kept, a finished phase is skipped, an evaluated approach is not evaluated again.
#
#   bench/bench.sh [approach…]      default: raw superpowers paperclip
set -euo pipefail
# Keep the Mac awake for the whole run: with the display off it otherwise sleeps ~15 min at a time,
# and every sleep shows up as a stalled API stream (see RESULTS.md, "Sleep").
if [ -z "${BENCH_CAFFEINATED:-}" ] && command -v caffeinate >/dev/null; then
  exec env BENCH_CAFFEINATED=1 caffeinate -i bash "$0" "$@"
fi
BENCH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNS="$(node -e "console.log(require('$BENCH/config.json').runsDir.replace(/^~/, process.env.HOME))")"
APPROACHES=("${@:-raw superpowers paperclip}")
# shellcheck disable=SC2206
APPROACHES=(${APPROACHES[*]})

bash "$BENCH/db.sh" up
for a in "${APPROACHES[@]}"; do
  echo "════ $a ════ $(date '+%F %T')"
  [ -d "$RUNS/$a/ws" ] || bash "$BENCH/prepare.sh" "$a"
  node "$BENCH/run.mjs" "$a" "$RUNS/$a/ws" "$RUNS/$a/out"
  [ -f "$RUNS/$a/out/acceptance.json" ] || bash "$BENCH/evaluate.sh" "$a"
done

if [ "${#APPROACHES[@]}" -eq 3 ]; then
  node "$BENCH/judge.mjs"
  node "$BENCH/report.mjs"
fi
echo "════ finished $(date '+%F %T')"
