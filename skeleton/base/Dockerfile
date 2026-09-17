# __PRODUCT_NAME__ — one image: the NestJS server serving the web build as static files.
#
# Build context: the repo root, restricted by Dockerfile.dockerignore (the BuildKit
# per-Dockerfile ignore next to this file) to an allowlist — the yarn files, every
# workspace manifest, apps/, shared/, db/ and scripts/. Nothing else is sent.
#
# Works with or without workspaces: `yarn workspaces focus` installs the root workspace
# (and `db/`, when the db module is present) without pruning the lockfile entries of the
# workspaces the runner never needs (apps/mobile, tests).

FROM node:22.17.1-alpine AS base

RUN --mount=type=cache,target=/var/cache/apk \
  apk update && apk upgrade && apk add --update-cache ca-certificates openssl

RUN corepack enable

# workspace manifests ----------------------------------------------------------

# Reads the context through a temporary read-only bind and emits only the yarn
# config, lockfile and workspace manifests — the full source never becomes an
# intermediate image layer. Source-only changes may rerun this cheap stage, but
# the builder sees unchanged manifest output and reuses the install layer below.
FROM base AS workspace-manifests

WORKDIR /source

RUN --mount=type=bind,source=.,target=/source,ro \
  mkdir -p /workspace && \
  cp package.json yarn.lock .yarnrc.yml /workspace/ && \
  find apps tests db -name package.json -not -path "*/node_modules/*" 2>/dev/null \
    -exec sh -c 'for manifest do target="/workspace/$manifest"; mkdir -p "$(dirname "$target")"; cp "$manifest" "$target"; done' sh {} + || true

# builder ----------------------------------------------------------------------

FROM base AS builder

RUN --mount=type=cache,target=/var/cache/apk \
  apk add --update-cache python3 make g++

WORKDIR /app

# Yarn config + lockfile + every workspace manifest present in the context, so
# the install layer only invalidates when a manifest changes.
COPY --from=workspace-manifests /workspace/ ./

# Yarn's cache is project-local here so the BuildKit mount below is the cache it writes to
# (developers keep yarn's default global cache, shared across worktrees).
ENV YARN_ENABLE_GLOBAL_CACHE=false

# Focus on the root workspace plus db/ when it exists (its generated client is
# bundled into the server). Dev deps included — the build needs them.
RUN --mount=type=cache,id=yarn-cache-__PRODUCT_SLUG__,target=/app/.yarn/cache,sharing=locked \
  focus="$(node -p "const fs=require('fs');[require('./package.json').name].concat(fs.existsSync('db/package.json')?[require('./db/package.json').name]:[]).join(' ')")" && \
  yarn workspaces focus $focus

COPY . .

ARG COMMIT_SHA
ENV COMMIT_SHA=$COMMIT_SHA

# Vite inlines VITE_* into the web bundle at `yarn build`: the runtime env is too late, and
# no `.env*` reaches the context (Dockerfile.dockerignore). One build arg carries them all —
# VITE_ENV is a dotenv block, one KEY=value per line — and becomes `.env.production` at the
# repo root, the envDir apps/web/vite.config.ts reads for a production build. Its source is
# deploy/config.yaml → buildArgs.VITE_ENV; a module that adds a VITE_* variable adds a line
# there, never an ARG here. Empty by default: the bundle then carries only its code's own
# defaults (the same origin for /api). Not a place for secrets — the bundle is public.
ARG VITE_ENV=""
RUN printf '%s\n' "$VITE_ENV" > .env.production

# Generated client when the db module is present; server (+ web when present).
RUN node scripts/run-if-script.mjs db:generate
RUN yarn build
# The runner copies apps/web/dist unconditionally; an empty directory stands in when there is no web.
RUN mkdir -p apps/web/dist

# runner -----------------------------------------------------------------------

FROM base AS runner

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app
USER app

COPY --chown=app:app --from=builder /app/node_modules          ./node_modules
COPY --chown=app:app --from=builder /app/package.json          ./package.json
# Compiled NestJS backend (webpack bundle).
COPY --chown=app:app --from=builder /app/apps/server/dist      ./apps/server/dist
# Vite SPA build — served as static files by the server (resolved relative to the
# server bundle: apps/server/dist/../../web/dist). Empty when there is no web surface.
COPY --chown=app:app --from=builder /app/apps/web/dist         ./apps/web/dist

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "apps/server/dist/main.js"]
