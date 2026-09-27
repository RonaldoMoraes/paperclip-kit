#!/usr/bin/env bash
# Builds one clean workspace for an approach, untimed: a clone of the fixture at the base commit,
# its dependencies installed, and (paperclip only) the kit installed on top.
#
#   bench/prepare.sh <paperclip|superpowers|raw>
set -euo pipefail

BENCH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT="$(cd "$BENCH/.." && pwd)"
APPROACH="${1:?usage: prepare.sh <paperclip|superpowers|raw>}"
cfg() { node -e "const c=require('$BENCH/config.json'); console.log(String($1).replace(/^~/, process.env.HOME))"; }

FIXTURE="$(cfg c.fixtureRepo)"
BASE="$(cfg c.baseCommit)"
RUN="$(cfg c.runsDir)/$APPROACH"
WS="$RUN/ws"

[ -e "$WS" ] && { echo "✗ $WS exists — remove it first to start clean" >&2; exit 1; }
mkdir -p "$RUN"

echo "→ clone $FIXTURE @ ${BASE:0:7} → $WS"
git clone -q --no-hardlinks "$FIXTURE" "$WS"
git -C "$WS" checkout -q -B bench "$BASE"
git -C "$WS" remote remove origin   # nothing can be pushed back to the real repo

# Files the fixture needs that git does not carry.
[ -f "$FIXTURE/.env" ] && cp "$FIXTURE/.env" "$WS/.env"

echo "→ dependencies (copy-on-write clone of the fixture's node_modules, then yarn install)"
if [ -d "$FIXTURE/node_modules" ]; then cp -Rc "$FIXTURE/node_modules" "$WS/node_modules"; fi
( cd "$WS" && HUSKY=0 yarn install >"$RUN/prepare.yarn.log" 2>&1 )
( cd "$WS" && bash "$BENCH/setup-fixture.sh" >"$RUN/prepare.setup.log" 2>&1 )

if [ "$(cfg "c.approaches['$APPROACH']?.installKit ?? false")" = true ]; then
  echo "→ install the kit $(cat "$KIT/VERSION") from $KIT"
  "$KIT/install.sh" "$WS" >"$RUN/prepare.install.log" 2>&1
fi

SETUP="$(cfg "c.approaches['$APPROACH']?.setup ?? ''")"
SETUP_ARGS="$(cfg "(c.approaches['$APPROACH']?.setupArgs ?? []).join(' ')")"
if [ -n "$SETUP" ]; then
  echo "→ approach setup: $SETUP $SETUP_ARGS"
  # shellcheck disable=SC2086
  bash "$BENCH/$SETUP" "$WS" $SETUP_ARGS >"$RUN/prepare.approach-setup.log" 2>&1
fi

# The workspace must start clean: anything left here would count as the approach's change.
DIRTY="$(git -C "$WS" status --porcelain)"
[ -z "$DIRTY" ] || { echo "✗ workspace is not clean after prepare:"; echo "$DIRTY"; exit 1; }
echo "✓ $APPROACH ready at $WS"
