---
name: lib
description: Procedures for shared code — `shared/contracts`, `shared/domain`, `shared/ui`, and any new workspace package that earns its place — creating one, wiring its surfaces to a host app through adapters, writing services and Zod contracts, Storybook stories, and lib tests. Use when creating, changing, or testing anything under shared/ or a new package.
---

# Lib

Procedures for shared code. Read `AGENTS.md` first, then load the one procedure you are
about to do.

## Creating shared code

| Doing this | Procedure |
| --- | --- |
| Adding to `shared/*`, or scaffolding a new workspace package | [references/creating-a-lib.md](references/creating-a-lib.md) |

## Client work

| Doing this | Procedure |
| --- | --- |
| Wiring a shared screen or component to a host app's data | [references/host-adapters.md](references/host-adapters.md) |
| Storybook stories — authoring, what a story is for | [references/stories.md](references/stories.md) |

## Server work

| Doing this | Procedure |
| --- | --- |
| Domain services, Zod schemas/contracts, wiring into the server's controllers, jobs/cache, server tests | [references/server.md](references/server.md) |

## The shape rule

**A lib is flat until it has a reason not to be.** One root export, everything under
`src/`. `shared/contracts`, `shared/domain` and `shared/ui` are three flat trees imported
by path alias (`@contracts/*`, `@domain/*`, `@ui/*`) — no package boundary, no build
step, no barrel to maintain.

`client` / `shared` / `server` subpaths solve exactly one problem: keeping server code out
of a client bundle. This product solves it by layout instead — `shared/contracts` has no
React, no NestJS, no `fetch`; `shared/ui` takes at most type-only imports from
`apps/web`; server code lives in `apps/server`. Biome fails the crossings.

Do not split a lib to make it look like something else. Do not split because a schema
"feels shared". A new workspace package (under `packages/`, when the second product or a
genuinely reusable library arrives) starts flat and splits only when a bundle boundary
demands it. Splitting later is a smaller change than un-splitting.

## Where rules live

- **Repo-wide** — TypeScript, comments, commits, formatting: [`AGENTS.md`](../../../AGENTS.md).
- **This tree's own** — `docs/ui.md` for `shared/ui`, `docs/architecture.md` for the
  contract/mock/fixture rule and `shared/domain`'s "computed once" rule.
- **How to do a kind of work** — the references above.
- **Host specifics** — `docs/web.md`, `docs/mobile.md`, `docs/server.md`.

Standing conventions that are always true (shared never imports an app, an endpoint
exists once, copy centralised, accessibility in the primitive, stories for every
primitive) live in `AGENTS.md` and `docs/`, not here.
