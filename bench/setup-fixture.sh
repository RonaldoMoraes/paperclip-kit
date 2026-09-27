#!/usr/bin/env bash
# Runs inside a fresh workspace (cwd), untimed: points .env at this workspace's own database on the
# benchmark's Postgres, builds the generated files, and applies the base migration.
set -euo pipefail
BENCH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB="bench_$(basename "$(dirname "$PWD")")"
URL="postgresql://postgres:postgres@localhost:5439/$DB"

bash "$BENCH/db.sh" up
bash "$BENCH/db.sh" recreate "$DB"
# The workspace's .env is git-ignored, so changing it leaves the tree clean.
sed -i '' "s#^DATABASE_URL=[^ ]*#DATABASE_URL=$URL#" .env
grep -q "^DATABASE_URL=$URL" .env
yarn db:generate
yarn routes:generate
yarn db:migrate:deploy
