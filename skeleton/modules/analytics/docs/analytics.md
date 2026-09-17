# Analytics

The `analytics` port for real. Base binds a console client to `ANALYTICS_CLIENT`; this
module replaces it through `KIT_PORTS` with a service that parses every batch against one
PHI-safe event contract and writes it to MongoDB — or, by default, prints it and stores
nothing. The apps hold no analytics SDK: they queue typed events and post them to one
door, `POST /api/analytics/events`. The server side lives under
[`apps/server/src/analytics/`](../apps/server/src/analytics), the contract under
[`shared/contracts/analytics/`](../shared/contracts/analytics).

## Modes

`ANALYTICS_MODE` ([`analytics.config.ts`](../apps/server/src/analytics/analytics.config.ts))
is `fake` unless set to `real`, in every environment: events landing on the wrong cluster
are worse than a missed metric, and mock-first development needs no database up.

| mode | store | needs |
| --- | --- | --- |
| `fake` (default) | console — types and counts printed, nothing stored | nothing |
| `real` | MongoDB, this product's own database | `ANALYTICS_MONGODB_URL`; `ANALYTICS_MONGODB_DB` (default `__PRODUCT_SLUG__-analytics`) |

`real` refuses to boot without the URL. The boot log states the mode and the store
(`[analytics] ready`), so a log always says whether the process stores anything.

## The event contract

[`events.ts`](../shared/contracts/analytics/events.ts) is one discriminated union, and it
is PHI-safe by construction: every field is a closed enum, a number, or a `slug` id
(`^[a-z0-9]+(?:-[a-z0-9]+)*$`, at most 64). Never `z.string()` free text — never what the
user typed, answered, scored or read. The server parses every batch with this schema, and
the mock does too, so a payload outside it is a 400 at the door in both modes.

The seed vocabulary is the taxonomy `AGENTS.md` asks of every screen:

| event | when | fields |
| --- | --- | --- |
| `screen-viewed` | automatic — a route resolved (web), the navigator landed (mobile) | `screen` |
| `action` | **success**: the user did the thing the screen exists for | `screen`, `action` |
| `funnel` | **funnel**: a step of a named flow — `enter`, `complete`, `abandon` | `flow`, `step`, `outcome` |
| `choice` | **choice**: what the user decided, as the option's id | `screen`, `choice` |
| `friction` | **friction**: the screen pushed back — `retry`, `validation`, `backout` | `screen`, `kind` |
| `source` | acquisition channel, once per landing | `source` |
| `session` | a session's length | `durationInS` |
| `data-exported`, `account-deleted` | the data-rights moments, bare on purpose | — |

A product adds an event as one branch in the union and one line in the catalog in
[`events.spec.ts`](../shared/contracts/analytics/events.spec.ts), which fails when a
branch has no instance. `screen` is the same slug on both apps: the route's *pattern*
reduced by [`screen-slug.ts`](../shared/contracts/analytics/screen-slug.ts) —
`/example/$id` on web and `(app)/example/[id]` on mobile are both `example-id`, and a
parameter's value never appears.

## How a feature tracks

`useAnalytics()` returns a stable `{ track }` on both apps; call it in a feature hook at
the transport edge or in the route, and in a screen only for a tap it owns:

```ts
import { useAnalytics } from "~/lib/analytics";

export function useExampleActions() {
  const { track } = useAnalytics();
  const { mutate } = useMutation({
    mutationFn: ({ id, done }) => setItemDone(http, id, done),
    onSuccess: () => track({ type: "action", screen: "example-detail", action: "mark-done" }),
    onError: () => track({ type: "friction", screen: "example-detail", kind: "retry" }),
  });
  …
}
```

`track` is synchronous, never throws and never blocks. Behind it is the contract's queue
([`queue.ts`](../shared/contracts/analytics/queue.ts)): events are stamped with the
client's clock and batched — 20 per batch, every 10 s while anything is queued, at most
50 per request — a failed batch is retried on the next flush and dropped after three
attempts. The queue also flushes when the app goes away: on web on `pagehide` and on the
tab going hidden, over `keepaliveHttp` so the browser finishes the request after the page
is gone ([`apps/web/src/lib/analytics.ts`](../apps/web/src/lib/analytics.ts)); on mobile
whenever `AppState` leaves `active` ([`apps/mobile/src/lib/analytics.ts`](../apps/mobile/src/lib/analytics.ts)).

`screen-viewed` is automatic and never tracked by hand. On web `bootAnalytics`
(`KIT_BOOT`) subscribes to the router's resolved navigations; on mobile the
`AnalyticsScreenViews` provider (`KIT_PROVIDERS`,
[`ScreenViews.tsx`](../apps/mobile/src/features/analytics/components/ScreenViews.tsx))
reads `useSegments()` and reports each change.

## Identity

Every batch carries the device's `anonymousId` — one UUID, minted on the first read and
kept ([`anonymous-id.ts`](../shared/contracts/analytics/anonymous-id.ts)). It is the
thread that lets the server stitch what a visitor did before signing in to the account
they sign into: the first signed-in batch still carrying it writes the user onto the
anonymous identifier, once, first link wins.

- **Web** keeps it in `localStorage["__PRODUCT_SLUG__-anonymous-id"]`
  ([`apps/web/src/data/analytics.ts`](../apps/web/src/data/analytics.ts)) — outside the
  versioned store, so `resetAll()` keeps the visitor.
- **Mobile** keeps it in process memory ([`apps/mobile/src/data/analytics.ts`](../apps/mobile/src/data/analytics.ts)),
  the way `store.ts` beside it keeps its state: base ships no storage dependency on the
  phone, so the id lives for the launch. A persistent backing — the auth module's
  `expo-secure-store` under `ANONYMOUS_ID_KEY`, say — lands in that file's `get` and
  `set` and nowhere else; until then, a signed-in user's batches still group by `userId`.

The `userId` never travels in a body. The controller reads it off `request.session.user.id`
— what the auth module's optional session guard resolves when it is applied to the
controller (`@UseGuards(OptionalSessionGuard)`; the auth module's docs say so) — and a
batch with neither identity is a 400 in the envelope. Without the auth module, every
batch is anonymous, and that is correct.

## The server

[`analytics.controller.ts`](../apps/server/src/analytics/analytics.controller.ts) is the
one door: `POST /api/analytics/events`, body parsed by `@ZodBody(TrackEventsRequest)`,
answered 202 with `{ accepted }` — validated and handed to the port, not persisted-by-now.
[`analytics.service.ts`](../apps/server/src/analytics/analytics.service.ts) implements
the port: `track` and `identify` return synchronously and run the write in the background;
`flush()` drains what is in flight (specs and shutdown use it, request paths never do).
The service parses the union again before it stores — the port accepts any `{ type }`,
so a server-side call site (`identify` from a registration hook, a `track` from a job)
meets the same PHI contract a client does.

Every write emits one `analytics.write` event through the base `TELEMETRY` port — request
id, operation, store, mode, batch size, `success | failure | refused`, duration — and a
refusal adds a `warn` line, a store failure an `error` line. Never an identity, never a
payload: a sink can be shipped anywhere without leaking an event.

### Stores

[`providers/`](../apps/server/src/analytics/providers) holds the two stores behind the
structural `AnalyticsStoreAdapter` in `provider.types.ts`: `getOrCreateIdentifier`,
`appendEvents`, `incrementMetrics`. **Mongo** (`mongo.adapter.ts`) keeps three
collections in the configured database — `identifiers` (one per identity, atomic
getOrCreate, unique on `anonymousId`), `events` (append-only, ordered, both clocks) and
`metrics` (counted upserts keyed by identifier and the event's canonical shape,
[`metric-key.ts`](../apps/server/src/analytics/metric-key.ts)) — with its indexes created
once per process before the first write. **Console** (`console.adapter.ts`) prints types
and counts. The driver is imported only there: `biome/analytics-provider-imports.grit`
errors on a `mongodb` import anywhere else, and `yarn lint:guards` proves the guard fires.

**Swapping the store** is a new adapter under `providers/` and one branch in `storeFor`
in [`analytics.provider.ts`](../apps/server/src/analytics/analytics.provider.ts); if the
driver is new, its scope goes in the guard's regex and the canary fixture. Nothing
outside `analytics/` changes.

## Coverage and the reminder

`yarn analytics:coverage` ([`scripts/analytics-coverage.mjs`](../scripts/analytics-coverage.mjs))
prints, for every screen on every app present, where its events are tracked — the route
that mounts it, a hook in its feature, or the screen itself — or `none`. A report, never
a gate: whether a screen owes an event is a product question.

[`.claude/hooks/analytics-reminder.sh`](../.claude/hooks/analytics-reminder.sh) runs
after every edit under `apps/`: when the file is a *new* screen and its feature has no
`useAnalytics` or `track(` anywhere, it hands the agent a reminder proposing the four
events for that screen through `hookSpecificOutput.additionalContext`. Advisory — it
always exits 0 and blocks nothing.

## Wiring

`module.json` claims `server.ports.analytics` with `AnalyticsProvider`, a Nest provider
for the base token built through `useFactory` from the config and the `TELEMETRY` port,
so the global `PortsModule` exports it to every module. `AnalyticsModule` sits in
`KIT_MODULES` with the controller. The contract's handlers join `KIT_HANDLERS`, so the
door is mocked wherever the mocks run. `bootAnalytics` joins `KIT_BOOT` on both apps;
`AnalyticsScreenViews` joins `KIT_PROVIDERS` on mobile. The smoke spec
[`tests/specs/web/smoke/analytics.spec.ts`](../tests/specs/web/smoke/analytics.spec.ts)
proves a navigation reaches the door as one contract-valid batch.
