# Telemetry

Cross-cutting plumbing under [`apps/server/src/telemetry/`](../apps/server/src/telemetry):
a request id on every request, one span per request, one access line per request, and
the logger every module injects. It does not bind the `telemetry` port — `KIT_PORTS`
keeps whatever claims it (base's console sink, or `observability-sentry`); this module
puts the id and the lines around it.

## The request id

[`request-id.middleware.ts`](../apps/server/src/telemetry/request-id.middleware.ts) runs
first on every route. It echoes the caller's `x-request-id` when it sent exactly one
well-formed token (a gateway's id survives the hop) and mints a uuid v4 otherwise (a
malformed one is replaced, never logged), sets it on the response, and runs the rest of
the chain inside the request context. [`request-context.ts`](../apps/server/src/telemetry/request-context.ts)
is an `AsyncLocalStorage` of `{ requestId, startedAt }`: a service three calls deep reads
`currentRequestId()` and nothing in between passed it along. Outside a request the readers
answer `undefined`; nothing mints a second id.

`withRequestId(telemetry)` wraps a `Telemetry` port implementation so every
`captureError` / `log` / `event` carries the id — a module that claims the port wraps its
sink once, in its factory.

## The logger

[`logger.ts`](../apps/server/src/telemetry/logger.ts). Inject the token, never the class:

```ts
import { Inject, Injectable } from "@nestjs/common";
import { LOGGER, type Logger } from "../telemetry/logger";

@Injectable()
export class ExampleService {
  private readonly log: Logger;

  constructor(@Inject(LOGGER) logger: Logger) {
    this.log = logger.child({ service: "example" });
  }

  async setDone(id: string, done: boolean): Promise<void> {
    this.log.info("item done flag set", { id, done });
  }
}
```

Every call is one JSON line on stdout — `ts`, `level`, `msg`, `requestId` inside a
request, `traceId` / `spanId` while a span is recording, then the fields:

```json
{"ts":"2026-09-09T12:00:00.000Z","level":"info","msg":"request","requestId":"0d1c…","traceId":"4bf9…","spanId":"00f0…","method":"GET","path":"/api/health","status":200,"ms":1.3}
```

`LOG_LEVEL` (`debug | info | warn | error`, default `info`) drops every line below it.
Fields are redacted by key at any depth: a key matching
`/secret|token|password|authorization|cookie/i` keeps its name and loses its value. An
`Error` field is described (`name`, `message`, `stack`); a cycle is cut. The write never
throws. What redaction cannot do is know a body from a field — a request body, a header
bag or a person's free text never goes in a field.

`biome/no-console-in-domain.grit` warns on `console.*` under `apps/server/src` outside
`telemetry/`, `common/ports/`, any `console.adapter.ts` or `*.repl.ts`, `main.ts` and specs;
the warning names the fix.

## The access line

[`access-log.middleware.ts`](../apps/server/src/telemetry/access-log.middleware.ts)
writes one `request` line when the answer is out: `method`, `path` (never the query
string), `status`, `ms`, `requestId` — and `aborted: true` when the socket closed first.
`LOG_HEALTH=false` keeps `GET /api/health` out; a load balancer's probe every few seconds
is noise.

## Traces

[`request-span.middleware.ts`](../apps/server/src/telemetry/request-span.middleware.ts)
opens one `SERVER` span per request, parented to the caller's `traceparent` when it sent
one, with `http.request.method`, `url.path`, `request.id`, and at the end
`http.response.status_code` (5xx sets the error status). It is named by the route once
Express matched one — `GET /api/example/items/:id`, never the raw path — and by the
method alone otherwise.

[`otel.ts`](../apps/server/src/telemetry/otel.ts) starts the SDK. `startOtel(env)` runs
once per process (`TelemetryModule.onModuleInit`, or the preload below) and the boot line
`telemetry ready` says what it exports:

| env | spans go to |
| --- | --- |
| nothing set (default) | nowhere: the SDK is not started, every span is a no-op |
| `OTEL_CONSOLE=true` | the console, one print per span as it ends — dev only |
| `OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318` | `<endpoint>/v1/traces` over OTLP/HTTP, batched |

`OTEL_SERVICE_NAME` is `service.name` on every span (default: the product slug). Both
exporters at once is allowed. On `SIGTERM` the spans in flight are flushed before the
process re-raises the signal and stops; with Nest's shutdown hooks enabled
(`app.enableShutdownHooks()`) Nest owns the exit and the module's
`beforeApplicationShutdown` flushes instead.

A feature that wants its own span uses the API — `trace.getTracer("example").startActiveSpan(...)`
— and needs nothing from this module; with no SDK started the call is a no-op.

### Preload

The module starts the SDK when Nest initializes, which is early enough for the spans this
module makes. A library instrumentation (`@opentelemetry/instrumentation-http`, `-pg`, …)
patches a module when it is first required, so it must be registered before `main.js`
requires anything. That is what [`preload.ts`](../apps/server/src/telemetry/preload.ts)
is for — built apart from the bundle and loaded with `-r`:

```sh
yarn build:server && yarn build:otel-preload
node -r ./apps/server/dist/telemetry/preload.js apps/server/dist/main.js
```

`startOtel` keeps its handle in the global symbol registry, so the module finds the SDK
the preload started and does not start a second one. The instrumentation itself is added
to `createOtel` (`instrumentations: [...]` on the `NodeSDK`) with its package in the root
`package.json`.

## Wiring

`module.json` puts `TelemetryModule` in `KIT_MODULES`. The module is `@Global()` and
exports `LOGGER` and `TELEMETRY_CONFIG`, so a feature injects either without importing it;
env is read in [`telemetry.config.ts`](../apps/server/src/telemetry/telemetry.config.ts)
inside the factories, so a spec importing anything else reads none. `configure()` applies
the three middlewares to every route in the order that matters: the id first, so the span
and the line can carry it.
