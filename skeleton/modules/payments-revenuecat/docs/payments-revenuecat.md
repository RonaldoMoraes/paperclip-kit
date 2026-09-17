# Payments (RevenueCat)

Subscriptions sold on the phone, by Apple and Google, through RevenueCat — settled by this
server onto the same entitlement `payments-stripe` already computes. With no
`REVENUECAT_SECRET_KEY` the whole server half is inert rather than broken, and the phone's
paywall runs against a canned store.

Requires `payments-stripe` (and through it `auth-better-auth` and `db-prisma`) and the
`mobile` surface. It adds no table, no second predicate and no web files: selling on the web
is Stripe's, and this module is what sells on a phone.

## What it adds

| where | what |
|---|---|
| `apps/server/src/subscription/revenuecat/` | the config switch, the REST reader, the lifecycle mapping, the header-authed webhook and `POST /api/subscription/revenuecat/confirm` |
| `shared/contracts/subscription/` | the confirm endpoint and its mock, the store product map, the store's own errors, and a second mock barrel (`store.ts`) |
| `shared/domain/subscription/store-copy.ts` | every word the phone's paywall and its Settings rows print |
| `apps/mobile/src/lib/store/` | the `Store` seam: the RevenueCat adapter, the mock store, and the one place the SDK may be imported |
| `apps/mobile/src/features/subscription/` | the paywall screen and its hooks, the access gate, the store-identity provider and the two Settings rows |
| `apps/mobile/app/paywall.tsx` | the route the gate sends people to |
| `apps/mobile/plugins/withReactNativeAndroidRoot.cjs` | the Expo config plugin the Android build needs in a workspace |
| `biome/revenuecat-sdk-imports.grit` | the vendor quarantine, with its canary |

## The one idea

**The store sells; the server decides.** Nothing on the device grants access. The SDK
reports what happened at the store, the app asks this server to confirm it, the server reads
RevenueCat itself and writes the row, and the answer reaches every client on the session it
already probes. There is one predicate for "who has paid", it lives in
`apps/server/src/subscription/subscription.service.ts`, and it does not know a second seller
exists.

## Where a purchase can be made

| surface | seller | why |
|---|---|---|
| phone | Apple / Google, through RevenueCat | both stores require their own purchase flow for digital goods bought in the app |
| web | Stripe (`payments-stripe`) | nobody takes a cut, the card is ours, and the billing portal is a real one |

That split is a decision, not an accident. A subscription is **managed where it was sold**:
the phone's Settings row opens the store's own subscriptions page and this app ships no
cancel button of its own, because the store took the money and only the store can let it go.

## One column vocabulary

A store purchase writes a `subscription` row — the table `payments-stripe` owns — in that
table's own columns:

| column | what a store row holds |
|---|---|
| `status` | Stripe's words: `active`, `trialing`, `canceled`, `paused` |
| `plan` | `monthly` or `annual`, from `planOfStoreProduct` |
| `period_start` / `period_end` | the store's current period; `period_end` follows a grace period |
| `trial_start` / `trial_end` | written only by the purchase that starts the trial |
| `cancel_at_period_end` | the store says it will not renew |
| `canceled_at` / `ended_at` | when it was cancelled, and when access actually stopped |
| `stripe_customer_id` | **always null** — a store row has no Stripe customer |
| `stripe_subscription_id` | the purchase's **original transaction id** — the seller's own id for the subscription |

So `accessFrom`, `isActiveStatus`, `isEnding` and `hasEverTrialed` serve both sellers
unchanged, and the `access` field the session carries is the same shape whichever one sold.
There is no store table, no second predicate, and no second idea of what "active" means.

**One known gap.** `accessFrom` reports `provider: "stripe"` for every row, because the
`subscription` model has no `provider` column and that function names the constant directly.
A store row therefore reads back as Stripe-sold. Nothing in this module depends on that
field — the phone knows it is a phone — but the web's "manage billing" would send a
store buyer to Stripe's portal, where their subscription is not. The fix belongs to
`payments-stripe`: a `provider String @db.VarChar(32) @default("stripe")` column and one line
in `accessFrom`. Until then, a product selling on both surfaces should not offer web billing
controls to somebody who bought on the phone.

## The two endpoints

`POST /api/subscription/revenuecat/webhook` — RevenueCat's, authenticated by the exact
`Authorization` header the dashboard's integration was configured with, compared in constant
time. There is no signature over the bytes, so the body is parsed like any other and this
path is deliberately **not** in `KIT_RAW_BODY_PATHS`.

Once the header matches it answers **200 for anything it read**. A delivery RevenueCat gets a
200 for is one it will not retry, and a body this server could not parse will not parse on
the fourth attempt either — replaying it forever would bury the deliveries that do parse.
Before the header is checked: 503 when store billing is off, 401 when the header is not ours.

The trail row is written **first**, into the `webhook_event` table `payments-stripe` ships,
and its `(provider, provider_event_id)` unique index is the whole of the deduplication:
RevenueCat retries with the same event id, and a purchase replayed after a cancellation would
reopen it. Claiming the delivery before applying it is the deliberate half of that trade — a
write that then fails leaves a recorded event nobody will retry, and the app's own `confirm`
(which reads RevenueCat, not a stored event) is what brings it back.

`POST /api/subscription/revenuecat/confirm` — the app's, behind `SessionGuard`. The store
sheet closes before the webhook has necessarily landed, so the app asks for its own row to be
brought up to date; the server reads RevenueCat and writes what it says. Idempotent, which is
also what makes it the right call after "Restore purchases" and after a missed delivery. The
product the app claims was bought is counted through the telemetry port and never obeyed.

## The store seam on the phone

`apps/mobile/src/lib/store/` is the only place `react-native-purchases` may be imported, and
the import is lazy — `import("react-native-purchases")` on the first call.

- `types.ts` — `Store`, `StoreOffering`, `StorePackage`, `PurchaseOutcome`, and where the
  stores let a subscription be managed.
- `index.ts` — `store = API_MODE === "mock" ? mockStore : revenueCatStore`.
- `revenuecat.ts` — the adapter. Configures once with the platform's public key.
- `mock.ts` — a canned offering and an instant sale.

That is what lets the paywall run in mock mode on Expo Go and on a dev client built before
this module existed: mock mode never loads the native module. `yarn mobile:mock` is a
complete purchase journey — paywall → store → server → session → gate — with only the store
replaced.

The guard is `biome/revenuecat-sdk-imports.grit`, with a canary that proves it fires.

## The gate

`useAccessGate` is a `KIT_GATES` entry, so it guards the whole `(app)` group: signed in
without an active subscription lands on `/paywall`, which sits beside `index` and outside the
group it protects. Somebody not signed in is waved through — the auth module's gate runs
first and already redirects to `/sign-in`, and racing it would send a new arrival to a
paywall instead of an account.

That puts the **entire** signed-in app behind the subscription, which is the shape a
store-sold app usually has. For a free tier, take `mobile.gates` out of `module.json` and
call `useAccessGate` from the routes that are paid for instead — the hook is unchanged and
the redirect still lands on the same paywall.

`StoreIdentityProvider` (a `KIT_PROVIDERS` entry) is where the store learns who the customer
is: the app user id RevenueCat sees is the auth user id, set as soon as the session resolves
and again before the sheet opens, so the webhook can always find the person. A provider
rather than a `KIT_BOOT` step, because identity is not a fact the app knows before it starts.

## Turning it on

Server, in `.env`:

```
REVENUECAT_SECRET_KEY=sk_…      # the switch; unset means store billing is off
REVENUECAT_PROJECT_ID=proj…
REVENUECAT_WEBHOOK_SECRET=…     # the Authorization header the dashboard sends
```

Phone, in `apps/mobile/.env` and on each EAS environment:

```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_…
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_…
```

A key starting with `test_` is RevenueCat's **Test Store**: the sheet opens, the whole flow
runs end to end, and no money moves. It is what a simulator or an emulator wants, since
neither can reach a real store. `loadRevenueCatConfig` refuses a `test_` secret key when
`NODE_ENV=production` — it is the one misconfiguration that looks exactly like a working one.

## Two things a scaffold cannot do for you

**A native module means a new dev client build.** `react-native-purchases` links native code.
Expo Go, and any dev client built before this module was added, have no `RNPurchases` to
find. Rebuild before a real-mode paywall — `yarn --cwd apps/mobile ios` / `android`, or the
EAS `development` profile. Mock mode needs no new binary.

**Add the Android plugin to `app.config.js`.** A module cannot edit that file, so add this
line yourself:

```js
plugins: [ /* … */ "./plugins/withReactNativeAndroidRoot.cjs" ],
```

`react-native-purchases` looks for React Native's Android sources by walking five directories
up from `android/`. Yarn hoists `react-native` to the repo root, six levels up, so the walk
stops one short and the Gradle build fails evaluating `:react-native-purchases`. The plugin
hands it the path through `rootProject.ext`. It is needed in every workspace layout this kit
produces, and it changes only the generated `android/build.gradle`.

## Testing it without a store

- **Mock mode** (`yarn mobile:mock`) is the whole journey with a canned store. The mocked
  `confirm` writes the same cookies the web's mocked checkout writes — one mocked ledger, so
  a mocked phone and a mocked browser cannot disagree about who has paid.
- **The Test Store** is the whole journey with a real RevenueCat and no money.
- **Sandbox purchases** (a sandbox Apple ID, a Play licence tester) are the whole journey
  with a real store; renewals are compressed to minutes, which is how a `RENEWAL`,
  a `CANCELLATION` and an `EXPIRATION` can all be seen in an afternoon.
- **The webhook** can be exercised by hand: `curl -X POST -H "Authorization: <secret>"
  -H 'content-type: application/json' -d '{"event":{"id":"evt_1","type":"TEST"}}'
  localhost:3000/api/subscription/revenuecat/webhook` answers `{"outcome":"test"}` and leaves
  a row in `webhook_event`. The dashboard's own "Send test event" does the same.
