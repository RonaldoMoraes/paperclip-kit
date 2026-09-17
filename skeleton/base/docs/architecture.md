# Architecture

A NestJS server ([`apps/server`](../apps/server)), a React/Vite web app
([`apps/web`](../apps/web)) and an Expo app ([`apps/mobile`](../apps/mobile)) over
[`shared/ui`](../shared/ui), [`shared/contracts`](../shared/contracts) and
[`shared/domain`](../shared/domain). Web and mobile are built separately for the best
experience on each; what they share is decided, not defaulted. Whichever surfaces exist,
the shape is the same: shared code never imports from an app, and an app never imports
from another app.

## One product, one repo

The repo is the product: root `package.json` holds the server and web dependencies,
`apps/mobile`, `tests` and (with the database module) `db` are workspaces. Aliases are the
same everywhere — `~/*` is the app's own `src`, `@contracts/*`, `@domain/*` and `@ui/*`
are the shared directories — declared once in the root `tsconfig.json` preset, repeated in
each bundler's config, and `vitest.config.ts` resolves them for both test projects.

## An endpoint exists once

One module per endpoint in `shared/contracts/<feature>/`: zod schema, types, the call over
the `Http` interface ([`http.ts`](../shared/contracts/http.ts)) and the query options; its
mock is the `.mock.ts` beside it and the mock's default response is the fixture. Web,
mobile, the server controller (which parses with the contract's own schema through the
zod pipe) and the Playwright suite (seeded from the fixture) all read that one module, so
a drift between client and server is a drift inside one directory. `shared/contracts` has
no React, no NestJS, no `fetch`.

A screen is built against the mock with no server running; the server implements the
contract afterwards. Feature-first layout, the same name in `shared/contracts/<f>/`,
`apps/server/src/<f>/` and `apps/{web,mobile}/src/features/<f>/`. The `example` feature
is that layout end to end and is what `/feature` clones.

## Mock mode

`VITE_API_MODE=mock` (web) and `EXPO_PUBLIC_API_MODE=mock` (mobile) answer every `/api`
call from [`shared/contracts/mocks.ts`](../shared/contracts/mocks.ts) — base's handlers
plus `KIT_HANDLERS` from the generated `mocks.gen.ts`. State a mock must remember is a
cookie ([`mock-state.ts`](../shared/contracts/mock-state.ts)), so a mocked journey
survives a reload and exercises the same client paths as a real one. The e2e suite runs
the same list through `getResponse` and fails closed on anything unmocked.

## Modules and the generated files

A module (auth, payments, LLM, notifications, analytics, observability, database…) is an
overlay the scaffold copies in. It never edits a base file: everything it contributes goes
through a generated file — [`apps/server/src/app.modules.gen.ts`](../apps/server/src/app.modules.gen.ts)
(`KIT_MODULES`, `KIT_PORTS`, `KIT_RAW_BODY_PATHS`), `shared/contracts/mocks.gen.ts`
(`KIT_HANDLERS`), each app's `kit.gen.tsx` (providers, gates, boot, settings actions) —
or a merged one (`package.json`, `.env.example`, `biome.json`, `AGENTS.md`). A generated
file is rewritten from the manifest on every scaffold; an edit to one is lost by design.

## Ports

Three things every product does and no base module implements: send a notification, record
an analytics event, report an error. Each is a port in
[`apps/server/src/common/ports/`](../apps/server/src/common/ports) — an interface, a
`Symbol` token and a console default. A feature injects the token; a module that provides
the real thing claims the port in its `module.json`, and the scaffold writes that provider
into `KIT_PORTS` in place of the default. The `@Global()` `PortsModule` binds them once.

## Two renderers, one flow

A multi-step flow is defined once in [`shared/domain/flow/`](../shared/domain/flow) — the
steps, the branches, the deep-link ids, the bar, what the walk produces — and rendered by
each app's hook over the shared reducer. What is contract and what is renderer is the
boundary that README draws; the lint guards hold a renderer to it.

## Data plane

`/api` answers with `Cache-Control: no-store`; the only client-side cache is the query
client's, with each contract's `staleTime` stating its reason. Base keeps its one feature
in process memory ([`example.store.memory.ts`](../apps/server/src/example/example.store.memory.ts));
the database module replaces that one provider with a Prisma store behind the same
structural `ExampleStore` type, and the controller and service never learn of it.
