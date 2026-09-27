#!/usr/bin/env bash
# The benchmark's own Postgres (never the fixture's): container pcbench-postgres on port 5439.
#   db.sh up · db.sh recreate <name> · db.sh down
set -euo pipefail
C=pcbench-postgres
case "${1:-}" in
  up)
    if ! docker ps --format '{{.Names}}' | grep -qx "$C"; then
      docker rm -f "$C" >/dev/null 2>&1 || true
      docker run -d --name "$C" -e POSTGRES_PASSWORD=postgres -p 5439:5432 postgres:16 >/dev/null
    fi
    for _ in $(seq 1 60); do docker exec "$C" pg_isready -U postgres >/dev/null 2>&1 && exit 0; sleep 1; done
    echo "✗ $C not ready" >&2; exit 1 ;;
  recreate)
    docker exec "$C" psql -U postgres -qc "DROP DATABASE IF EXISTS \"$2\" WITH (FORCE)" -c "CREATE DATABASE \"$2\"" ;;
  down) docker rm -f "$C" ;;
  *) echo "usage: db.sh up|recreate <name>|down" >&2; exit 1 ;;
esac
