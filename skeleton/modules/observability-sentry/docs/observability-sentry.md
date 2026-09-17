# Observability (Sentry)

The `telemetry` port for real. Base binds a console sink to `TELEMETRY`; this module
replaces it through `KIT_PORTS` with a composite under
[`apps/server/src/observability/`](../apps/server/src/observability): one JSON line per
call on the console, always, and Sentry beside it once `SENTRY_DSN` is set. The web app
and the phone get the same switch — `VITE_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_DSN` — behind
`KIT_BOOT`. Errors only, and nothing that could carry a person's data leaves the process.

## Env

| key | reader | default |
| --- | --- | --- |
| `SENTRY_DSN` | [`observability.config.ts`](../apps/server/src/observability/observability.config.ts) | unset: Sentry is never initialised, no SDK behaviour exists |
| `SENTRY_ENVIRONMENT` | same | `NODE_ENV` |
| `SENTRY_RELEASE` | same | the SDK's own default; the deploy sets it from `COMMIT_SHA` |
| `SENTRY_TRACES_SAMPLE_RATE` | same | `0` — errors only; a share above 0 turns traces on (below) |
| `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT` | [`apps/web/src/lib/sentry.ts`](../apps/web/src/lib/sentry.ts) | unset: no init; the Vite mode |
| `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_ENVIRONMENT` | [`apps/mobile/src/lib/sentry.ts`](../apps/mobile/src/lib/sentry.ts) | unset: no init; `development` under `__DEV__`, else `production` |

The server keys live in `.env`; the web keys too, and in the deploy's build args, because
Vite inlines them (`deploy/config.yaml` → `buildArgs`, beside `VITE_API_URL`). The mobile
keys live in `apps/mobile/.env` — Expo reads the app's own file — and on each EAS
environment. The config loader throws at boot for one thing only: a sample rate that is
not a number in `[0, 1]`.

## The sinks

[`telemetry.provider.ts`](../apps/server/src/observability/telemetry.provider.ts) builds
the port inside its factory — env is read there, so a spec importing anything else reads
none — and says what it built on the first line it writes:

```json
{"ts":"2026-09-09T12:00:00.000Z","level":"info","msg":"[observability] ready","sinks":["console"],"environment":"development","tracesSampleRate":0}
```

- **Console** ([`console-telemetry.ts`](../apps/server/src/observability/console-telemetry.ts)):
  one JSON line on stdout per call — `ts`, `level`, `msg`, then the fields; a captured
  error described (`name`, `message`, `stack`); credential-shaped keys
  (`secret|token|password|authorization|cookie`) blanked. Everything else stays: this line
  never leaves the machine's logs, and the in-process record is where a body or a preview
  is allowed to be.
- **Sentry** ([`sentry-telemetry.ts`](../apps/server/src/observability/sentry-telemetry.ts)),
  only with a DSN: `captureError` becomes `captureException`, a `log` at the `error`
  level becomes a message; every other level and every `event` is ignored — Sentry is
  where a failure is triaged, not where a count is kept. The context's scalars become
  tags (searchable: `mechanism`, `method`, `path`, a request id), the rest extras, after
  [`scrub.ts`](../apps/server/src/observability/scrub.ts) drops any key matching
  `preview|body|content|payload|cookie|header|authorization|secret|token|password|query`
  at any depth.
- **Composite** ([`composite-telemetry.ts`](../apps/server/src/observability/composite-telemetry.ts)):
  fans each call out in order — console first, so the machine has the line before
  anything leaves. A throwing sink is one line on stderr and never reaches the request.
  Adding a sink is one entry in `createTelemetry`.

## What reaches Sentry, and what never does

[`sentry.ts`](../apps/server/src/observability/sentry.ts) is the one place the SDK is
configured. `sentryInitOptions` turns off every collection the SDK offers — user info,
cookies, request and response headers, query strings, bodies, stack-frame variables,
database values, AI inputs and outputs — and every event and breadcrumb passes
`scrubEvent` / `scrubBreadcrumb` on the way out: no `user`, of the request only its
route and method, console breadcrumbs dropped whole. What is left is the error, its
stack, the route and the process. `setUser` is never called; there is no session replay.

The unit specs are the contract: `sentry-telemetry.spec.ts` asserts that a preview, a
body and a credential reach neither the tags nor the extras, by key or by value;
`sentry.spec.ts` asserts the init options and the scrub.

## Web

`bootSentry` runs from `KIT_BOOT` before the first render, when the build carries a DSN;
`SentryBoundary` (`KIT_PROVIDERS`) wraps the router in Sentry's `ErrorBoundary`, so a
render crash above the routes — the one the route error component cannot catch — is
reported with its component stack and the user gets a crash screen with *Try again*
(the boundary resets; the query cache outside it survives). Without a DSN the boundary
is the children as they are — and because Vite inlines `VITE_SENTRY_DSN` as a constant,
a bundle built without one carries no SDK at all: the boot and the boundary fold to
their empty branch and `@sentry/react` is tree-shaken away. The browser SDK's
`dataCollection` is off the same way as the server's; there is no `tracesSampleRate`
and no replay integration.

## Mobile

`bootSentry` runs from `KIT_BOOT` when the binary carries a DSN: `sendDefaultPii: false`,
no performance tracing, no failed-request capture (a body would ride along), no
screenshot and no view hierarchy on an error. Release and dist come from the native side.

Two things are product edits, because a module cannot touch a surface's files:

- **Native crashes and source maps** need the config plugin —
  `["@sentry/react-native/expo", { organization, project, url }]` in
  `apps/mobile/app.config.js` `plugins` (with `SENTRY_AUTH_TOKEN` on the EAS
  environment for the upload) — and, for debug ids, `withSentryConfig` around
  `apps/mobile/metro.config.cjs`. Both are native changes: a new binary, not an update.
  JavaScript errors are reported without either.
- **The `EXPO_PUBLIC_*` reads** live in `apps/mobile/src/lib/sentry.ts` rather than
  `src/lib/config.ts`. A second `biome.json` override cannot take the file out of the
  surface's `expo-public-env.grit` scope — Biome adds plugins across matching overrides
  and never subtracts — so each of the two reads carries a `biome-ignore lint/plugin`
  line naming the reason. Nothing else reads them.

## Traces

`SENTRY_TRACES_SAMPLE_RATE=0` is the default and means errors only: `tracesSampleRate` is
left unset (a `0` still counts as tracing to the SDK and registers every performance
integration) and the SDK's OpenTelemetry setup is skipped, so Sentry registers no global
tracer provider, context manager or propagator. A share above zero hands Sentry all
three, and the `http` and Express instrumentation it then needs patches those modules
when they are first required — so the SDK has to be up before `main.js` loads. That is
what [`preload.ts`](../apps/server/src/observability/preload.ts) is for, built apart from
the bundle and loaded with `-r`:

```sh
yarn build:server && yarn build:sentry-preload
node -r ./apps/server/dist/observability/preload.js apps/server/dist/main.js
```

`startSentry` asks the SDK whether a client exists before starting one, so the factory
finds the SDK the preload started and does not start a second.

## Pairing with the `telemetry` module

The two are independent and combine:

- **Request id.** `telemetry` carries a request id in `AsyncLocalStorage` and offers
  `withRequestId(telemetry)` to stamp it on every port call. This module does not import
  it (it may be absent). With both present, the pairing is one line in
  `telemetry.provider.ts`, product-owned:
  `useFactory: () => withRequestId(createTelemetry(loadObservabilityConfig(process.env)))`
  — then every Sentry event carries `requestId` as a tag and every console line as a field.
- **OpenTelemetry.** With traces at `0` Sentry touches no OpenTelemetry global, so the
  `telemetry` module's span exporter keeps them. With traces above zero both want the
  global tracer provider and the first registration wins — pick one tracer: Sentry's
  traces, or the OTLP exporter.
- **Console.** The `telemetry` module's `no-console-in-domain` guard warns on `console.*`
  under `apps/server/src`; this module writes through `process.stdout` / `process.stderr`
  and never trips it.

## Swapping the vendor

The port is the seam. Another error tracker is a new sink class implementing `Telemetry`
(`captureError`, `log`, `event`, synchronous, never throws), one branch in `createTelemetry`,
its keys in `observability.config.ts` and its package in the root `package.json`; on the
apps, a new `lib/<vendor>.ts` behind the same `KIT_BOOT` slot. Nothing that calls the port
changes.

## Wiring

`module.json` claims `server.ports.telemetry` with `TelemetryProvider`, a Nest provider
for the base token built through `useFactory`, so the global `PortsModule` exports it to
every module and to the filter. `ObservabilityModule` sits in `KIT_MODULES` as the domain's
home and flushes the SDK on `beforeApplicationShutdown` (with Nest's shutdown hooks
enabled; the SDK's own uncaught-exception handler flushes on a crash regardless). On the
web, `web.boot` → `bootSentry`, `web.providers` → `SentryBoundary`; on mobile,
`mobile.boot` → `bootSentry`. Dependencies: `@sentry/nestjs` and `@sentry/react` at the
root, `@sentry/react-native` in `apps/mobile`.
