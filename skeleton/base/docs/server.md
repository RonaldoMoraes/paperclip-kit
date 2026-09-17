# apps/server

NestJS 11 on Express 5, serving `/api` and — when `apps/web/dist` exists — the built web
app. [`main.ts`](../apps/server/src/main.ts) is the bootstrap and says why static assets
and the SPA fallback are middleware, not routes, and why the body parser is Nest's off and
Express's on with a skip list. Port `PORT`, default 3000.

## Feature module

One directory under `src/` per feature; `example/` is the reference and `/feature` clones
it. `<f>.module.ts` is wiring only and the one place a client or store is constructed,
through `useFactory`, so a spec importing anything else builds nothing and reads no env.
`<f>.controller.ts` is the route: `@ZodBody(Contract)`, `@ZodParam(Contract)`,
`@ZodQuery(Contract)`, guards, then delegation — no branching a service could hold.
`<f>.service.ts` is the work, testable with no Nest and no database; storage is a
structural type it declares (`ExampleStore`) and a store file satisfies. `<f>.config.ts`
exists only when the feature reads env and is the only reader for what it covers
(`load<Feature>Config(env)`, called inside the factory); it throws at boot for anything
missing without a safe default. `<f>.types.ts` holds the injection tokens as `Symbol`s;
consumers depend on the token, never the class. Specs sit beside the files they test.

## The request pipeline

Every request passes, in order, the body parser
([`common/raw-body.ts`](../apps/server/src/common/raw-body.ts) skips the paths in
`KIT_RAW_BODY_PATHS`), the zod pipe ([`common/zod.pipe.ts`](../apps/server/src/common/zod.pipe.ts)),
the guards a module adds, the handler, and the one global filter
([`common/api-error.filter.ts`](../apps/server/src/common/api-error.filter.ts)), which
turns every failure into the envelope in [`shared/contracts/errors.ts`](../shared/contracts/errors.ts):
`code` is what a client branches on, `issues` is diagnostic and never copy. A failure the
app names is an `ApiException` ([`common/api-error.ts`](../apps/server/src/common/api-error.ts))
at whatever status fits; anything else at 500 or above is reported through the telemetry
port with a generic message to the caller. `isUnexpected` is the line between the two.

## Ports

[`common/ports/`](../apps/server/src/common/ports) — `NOTIFICATION_CLIENT`,
`ANALYTICS_CLIENT`, `TELEMETRY`: an interface, a token and a console default each, bound
by the `@Global()` `PortsModule` from `KIT_PORTS`. A feature injects the token. Analytics
and telemetry calls are synchronous and never throw; a notification send rejects with
`NotificationError` and nothing else.

## Generated

[`app.modules.gen.ts`](../apps/server/src/app.modules.gen.ts) is written by the scaffold:
`KIT_MODULES` (the opted-in feature modules `AppModule` imports after `PortsModule`),
`KIT_PORTS` (one provider per port; the console default when no module claims it) and
`KIT_RAW_BODY_PATHS` (signed-webhook paths the body parser must skip). Base is the empty
manifest. An edit to the file is lost on the next scaffold; the manifest is the source.

## Health

`GET /api/health` → `{ ok: true, version }`. The version is the package's, bundled at
build time, unless the deploy sets `APP_VERSION` ([`health/health.config.ts`](../apps/server/src/health/health.config.ts)).

## Build

`nest build` runs webpack ([`nest-cli.json`](../nest-cli.json), [`webpack.config.js`](../webpack.config.js)):
`apps/server/src` and whatever it imports from `shared/` become `apps/server/dist/main.js`;
`node_modules` stay external. `apps/server/tsconfig.json` extends the root preset with
CommonJS and decorator metadata; `tsconfig.build.json` excludes specs and is what
`typecheck` and the build read.
