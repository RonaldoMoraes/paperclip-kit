#!/usr/bin/env bash
# Untimed, after an approach's three phases: the repo's gates and the hidden acceptance check on
# its final tree, written to <run>/out/gates.json and gates.txt (the judge reads gates.txt).
#
#   bench/evaluate.sh <paperclip|superpowers|raw>
set -uo pipefail
BENCH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN="$(node -e "console.log(require('$BENCH/config.json').runsDir.replace(/^~/, process.env.HOME))")/${1:?approach}"
WS="$RUN/ws"; OUT="$RUN/out"; LOGS="$OUT/gates"
mkdir -p "$LOGS"

cd "$WS"
# Generated files first, as the repo's own docs require before typecheck/test.
yarn db:generate >"$LOGS/db-generate.log" 2>&1
yarn routes:generate >"$LOGS/routes-generate.log" 2>&1

GATES=(typecheck lint lint:guards test test:contract test:e2e:validate test:e2e)
echo "[" >"$OUT/gates.json"
: >"$OUT/gates.txt"
first=1
for g in "${GATES[@]}"; do
  log="$LOGS/${g//:/-}.log"
  start=$(date +%s)
  perl -e 'alarm shift; exec @ARGV' 1800 yarn "$g" >"$log" 2>&1; code=$?
  secs=$(( $(date +%s) - start ))
  status=$([ $code -eq 0 ] && echo pass || echo FAIL)
  printf '%-18s %-4s (%ss)\n' "$g" "$status" "$secs" | tee -a "$OUT/gates.txt"
  [ $code -eq 0 ] || { tail -25 "$log" | sed 's/^/    /' >>"$OUT/gates.txt"; }
  [ $first -eq 1 ] || echo "," >>"$OUT/gates.json"; first=0
  printf '{"gate":"%s","exit":%d,"seconds":%d}' "$g" "$code" "$secs" >>"$OUT/gates.json"
done
echo "]" >>"$OUT/gates.json"

echo | tee -a "$OUT/gates.txt"
node "$BENCH/acceptance.mjs" "$WS" "$OUT/acceptance.json" | tee -a "$OUT/gates.txt"
