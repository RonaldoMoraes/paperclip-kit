#!/usr/bin/env bash
# scripts/wt/wt.config.sh — everything the worktree CLI knows about this product.
#
# scripts/wt/wt sources this file; the libraries under scripts/wt/lib/ are
# product-agnostic and read only what is declared here. Change the product
# (a new process, a different trunk, another database name) by editing this
# file — never the libs.
#
# shellcheck disable=SC2034  # every value is consumed by scripts/wt/lib/*.sh

# --- identity ----------------------------------------------------------------
# Worktree directories are <base>/<WT_REPO_PREFIX>-<branch-with-dashes>, where
# <base> is $WT_WORKTREE_BASE when set, WT_WORKTREE_BASE_DEFAULT otherwise.
WT_REPO_PREFIX="__PRODUCT_SLUG__"
WT_WORKTREE_BASE_DEFAULT="$HOME/worktrees"

# --- branches ----------------------------------------------------------------
# The trunk every branch is cut from and every PR targets by default.
WT_TRUNK="__TRUNK__"
# Space-separated globs. Never worked on directly; `wt publish` refuses them,
# and a base matching one of them (other than the trunk) makes the PR target
# the trunk — a hotfix cut from releases/vX goes into the trunk first.
WT_PROTECTED="main __TRUNK__ releases/*"
# `wt create` accepts <type>/<short-name> with <type> in this list.
WT_BRANCH_TYPES="feat fix refactor test docs chore"
# `wt publish` derives the PR title from the branch: feat/ABC-12-short-name
# becomes feat(ABC-12): short name. Group 1 is the ticket, group 2 the subject.
WT_TICKET_RE='^([A-Z][A-Z0-9]+-[0-9]+)-(.+)$'

# --- database ----------------------------------------------------------------
# The whole database module is skipped when WT_COMPOSE_DB does not exist at
# the primary checkout's root: no Docker, no migrations, and --db is refused.
WT_COMPOSE_DB="docker-compose.db.yml"
WT_DB_CONTAINER="postgres"     # the container name the compose file gives Postgres
WT_DB_USER="postgres"
WT_SHARED_DB="__DB_NAME__"     # the database every worktree shares by default
# --db gives a worktree its own database, ${WT_SHARED_DB}_<branch-slug>, on
# the same container. Its URL is the primary's WT_DB_URL_KEY (read from
# WT_DB_ENV_FILE) with only the database name swapped.
WT_DB_URL_KEY="DATABASE_URL"
WT_DB_ENV_FILE=".env"
# The database workspace. WT_DB_SCHEMA_DIR is what `wt run` diffs the branch
# against to decide whether it must run with --db; the migrate and seed
# commands run inside WT_DB_DIR with WT_DB_URL_KEY exported.
WT_DB_DIR="db"
WT_DB_SCHEMA_DIR="db/prisma"
WT_DB_SENTINEL_TABLE="_prisma_migrations"   # exists once migrations have run
WT_DB_MIGRATE_CMD="yarn db:generate && yarn db:migrate:deploy"
WT_DB_SEED_CMD="yarn db:seed"               # fresh database: migrate + seed
# A fresh worktree has no generated client until something generates it.
# `wt run` runs WT_DB_GENERATE_CMD (inside WT_DB_DIR) when WT_DB_GENERATED_DIR
# is missing. Empty WT_DB_GENERATED_DIR disables the step.
WT_DB_GENERATE_CMD="yarn db:generate"
WT_DB_GENERATED_DIR="db/generated"

# --- dependencies ------------------------------------------------------------
# `wt run` re-syncs dependencies when a path matching this ERE changed since
# the last successful run in the worktree (committed or not).
WT_DEPS_RELEVANT='^yarn\.lock$|(^|/)package\.json$|^db/|(^|/)prisma/'
WT_DEPS_SYNC_CMD="yarn install"

# --- processes ---------------------------------------------------------------
# Every port is base + WT_PORT_STRIDE × slot (slots 1-9). Bases must be far
# enough apart that no base + stride × slot lands on another base; the CLI
# refuses a config where they collide.
WT_PORT_STRIDE=10

# One entry per process, seven |-separated fields:
#   name | cwd | command | base port | health URL | env file | overlay keys
#   - cwd and env file are relative to the checkout root; "." is the root and
#     an empty env file means the process has no .env overlay.
#   - command, health URL and overlay values are templates: {port} is this
#     process's slot port, {base} its base port, {slot} the slot, and {<name>}
#     the slot port of another process (so {server} in metro's overlay names
#     the server's port).
#   - overlay keys are comma-separated KEY=<template>; KEY=swap instead
#     rewrites every base port already inside the key's value to the slot's
#     (for a list of origins that may span several processes).
WT_PROCS=(
  "server|.|yarn dev:server|3000|http://localhost:{port}/api/health|.env|PORT={port}"
  "web|.|yarn dev:client --port {port} --strictPort|5173|http://localhost:{port}|.env|VITE_DEV_PORT={port}"
  "metro|apps/mobile|yarn start --port {port}|8300|http://localhost:{port}/status|apps/mobile/.env|EXPO_PUBLIC_API_URL=http://localhost:{server}"
)
# What a plain `wt run` starts; the rest is added with --with <name> or
# replaced with --only <list>.
WT_DEFAULT_PROCS="server web"
