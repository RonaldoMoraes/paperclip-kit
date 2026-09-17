# Payments (Stripe)

Subscriptions sold on the web through Stripe Checkout. The entitlement is computed once on
the server and rides on the session; a guard and a route layout read it; every webhook is
recorded and deduplicated; and with no `STRIPE_SECRET_KEY` the whole module is inert rather
than broken.

Requires `auth-better-auth` (and through it `db-prisma`). Web only — selling happens in a
browser by decision, so there are no mobile files. (The `payments-revenuecat` module is what
sells on a phone, and it settles onto the same subscription row and access field.)

## What it adds

| where | what |
|---|---|
| `apps/server/src/subscription/` | the config switch, the Stripe client, the Better Auth plugin, the `provider` column's rules, the event trail, the access predicate, the guard and `POST /api/subscription/confirm` |
| `db/prisma/schema/subscription.prisma` | `subscription` (the plugin's table, snake_case) and `webhook_event` (the deduplicated trail) |
| `shared/contracts/subscription/` | `SubscriptionAccess` and its predicates, the confirm endpoint, the plans, the mocks and the mock ledger |
| `shared/domain/subscription/copy.ts` | every word the paywall and the checkout return print |
| `apps/web/src/` | `/paywall`, `/checkout/return`, the `_app/_paid` layout and its `/subscription` screen, `requireAccess`, the billing client and the Settings row |
| `tests/` | the paywall and checkout-return journeys, one of them keyboard-only |

## The one idea

**The server decides who has paid, once.**

`accessFrom(rows)` (`subscription.service.ts`) applies the predicate — `status in ("active",
"trialing")`, which makes a trial access and a cancellation that has not reached its period
end still access. `SubscriptionAuthExtensionsProvider` claims the auth module's
`auth-extensions` port and hands back a `sessionExtension`, so every
`GET /api/auth/get-session` answer carries `access`. From there:

- the server reads it off the request with `SubscriptionGuard` (behind `SessionGuard`);
- the web reads it off the resolved session with `requireAccess` in `_app/_paid.tsx`;
- a screen takes what it needs as props.

No client derives entitlement from a subscription row, a status string or a Stripe
response. Two derivations are two answers waiting to disagree, and the person on the wrong
side of the disagreement is a paying one.

## Putting a route behind the paywall

Move the route file under `apps/web/src/app/routes/_app/_paid/`, beside the `/subscription`
screen that already lives there:

```
app/routes/_app/example.index.tsx        → open to any signed-in person
app/routes/_app/_paid/subscription.tsx   → ships with this module
app/routes/_app/_paid/reports.index.tsx  → your route, now behind the paywall
```

`_paid.tsx` is a pathless layout: it adds no URL segment, so `/reports` stays `/reports`.
Its `beforeLoad` calls `requireAccess(context.session)` — the session the auth gate already
resolved — and redirects to `/paywall` when there is no access. Then `yarn routes:generate`.

A pathless layout needs at least one child. With none, the router generator resolves it to
the same full path as the app's index route and refuses to generate
(`Conflicting configuration paths ... "/", "/"`), which is one reason `/subscription` ships
here rather than beside the paywall: it is the destination that proves the gate, and the
module's own e2e walks an unsubscribed visitor into it and out to `/paywall`.

Do **not** add a gate to `KIT_GATES` for this: a gate runs for every route under `_app` and
would put the whole app behind the paywall, including the settings screen somebody needs in
order to fix their card.

On the server, the matching move is one decorator:

```ts
@UseGuards(SessionGuard, SubscriptionGuard)   // in that order — the second reads what the first resolved
```

Import `SubscriptionModule` in the feature module that does it; the guard is exported there.

## The flow, end to end

1. `/paywall` — no loader. `trialEligible` and `status` come off the session. Choosing a
   plan calls `subscription.upgrade` on the billing client, which answers with a Stripe
   Checkout URL and takes the whole page there.
2. Stripe returns to `/checkout/return?sessionId=…`. The success URL is this module's own
   (`checkoutSuccessUrl`), not the plugin's: the plugin's success route reconciles by
   listing *active* subscriptions — which a trialing one is not — and hands back no session
   id.
3. The loader calls `POST /api/subscription/confirm` once. The server reads that Checkout
   Session from Stripe, expanded to carry the subscription, and writes what it says onto the
   row — scoped to the caller's own reference id. Idempotent, no polling, no webhook wait.
4. Meanwhile the webhook arrives on its own schedule. The plugin's handlers keep the row
   current; `onEvent` writes the trail and corrects the customer the row names.

## Environment

`STRIPE_SECRET_KEY` is the switch. Unset: no client, no plugin, no billing — which is how
mock mode, every gate and a plain local stack run, and the confirm endpoint answers 503 in
the envelope. Set: `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_ANNUAL`
are required and the boot fails naming whichever is missing.
`STRIPE_PORTAL_CONFIGURATION` is optional — without it Stripe opens the account's default
billing portal.

Webhooks in development:

```bash
stripe listen --forward-to localhost:3000/api/auth/stripe/webhook
```

That path is in `KIT_RAW_BODY_PATHS`, which is what keeps the bytes Stripe signed intact:
Better Auth rebuilds a web `Request` from the node one, and re-serialises anything already
assigned to `req.body` — different whitespace, different key order, every delivery rejected
as forged.

## Mock mode

Two cookies (`shared/contracts/subscription/mock-subscription.ts`): the ledger, and the
session-extra cookie the auth module's mocked `get-session` merges into its answer. They are
always written together. A mocked run boots with no subscription, so a guarded route sends
you to the paywall; the mocked checkout settles into an active plan through the same
`/checkout/return` the real one uses. A spec seeds a state with
`seedSubscription(page, "trialing")` or `seedNoSubscription(page)`.

## Two things worth knowing

**The customer id is on the subscription row, not on `user`.** The plugin declares a
`stripeCustomerId` field on the user table; that table belongs to the auth module, and a
module never adds a column to another layer's schema. `customer-link.ts` is a Better Auth
plugin that wraps the adapter so writes of that one field to `user` are dropped and reads by
it resolve through the subscription row instead. Nothing is lost: the plugin already stores
the customer on the row it creates and searches Stripe by email when it has none.

**Cancelling happens on Stripe's page.** `/subscription` and the paywall's fallback for a
lapsed plan both open the billing portal, where the card, the invoices, cancelling and
resuming already live. The Settings row leads to `/subscription` rather than straight to
Stripe, so what is held is shown before it is managed — and because that screen sits behind
`_paid`, somebody whose plan lapsed lands on the paywall, which is where their card can be
fixed. The plugin's `cancel` and `restore` routes exist and are one mutation each if a
product wants them in its own UI — `apps/web/src/lib/subscription.ts` is where they go.

## A second seller

`subscription` is one table for every seller. `accessFrom` reads the same columns whoever
wrote them, which is what lets a purchase made in a phone store grant access on the web with
nothing taught about stores — and `provider` is the single column that says which seller a
row came from.

`SubscriptionAccess.provider` is a plain string, not a union, so a second seller writes its
own name and every reader keeps working. What it must supply is rows the predicate can read,
a `sessionExtension` that merges into the same `access` field, and — this one is not
optional — `provider` written explicitly on every row it opens. The column defaults to
`stripe` so a row that predates a second seller is not left empty; a seller that lets itself
be defaulted is a seller whose plans this app will offer to cancel and cannot.

**Where a plan is managed follows from it.** Cancel, restore and the billing portal exist
only where the plan was sold: Stripe cannot cancel an Apple subscription, and its portal
would refuse or, worse, act on whatever Stripe customer the row still names. So
`sold-here.ts` refuses those three routes before they run when every row the caller holds was
sold elsewhere, and `managedOnWeb(access)` is what the paywall and `/subscription` branch on
so the refusal is never the first the person hears of it. Buying is deliberately not
guarded — `/subscription/upgrade` is how somebody subscribes here in the first place, and the
paywall route already turns away anyone whose session says they have access, whoever sold it.
