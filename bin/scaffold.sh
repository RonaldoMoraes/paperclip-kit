#!/usr/bin/env bash
# paperclip-kit scaffold — thin wrapper around bin/lib/scaffold.mjs (Node 22, zero dependencies).
#   bin/scaffold.sh --manifest .paperclip/project.manifest.json --out . [--update] [--dry-run] [--force-gen]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v node >/dev/null 2>&1 || { echo "✗ node is required (22.x); install it or put it on PATH" >&2; exit 1; }
major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" -lt 20 ]; then
  echo "✗ node ${major}.x is too old; the scaffold needs node 22 (20 works)" >&2
  exit 1
elif [ "$major" -lt 22 ]; then
  echo "! node ${major}.x found; the kit targets node 22" >&2
fi

exec node "$HERE/lib/scaffold.mjs" "$@"
