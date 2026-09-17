- **Purchase is Stripe on the web, by decision.** Checkout, the billing portal and the
  webhook are Better Auth's Stripe routes under `/api/auth/*`; this module adds one endpoint
  of its own, `POST /api/subscription/confirm`. The webhook path
  (`/api/auth/stripe/webhook`) is in `KIT_RAW_BODY_PATHS` because Stripe signs the exact
  bytes it sent — any parser that assigns `req.body` makes every delivery read as forged.
- **The server computes access once and the session carries it.** `accessFrom(rows)` in
  `apps/server/src/subscription/subscription.service.ts` is the only place the predicate
  (`status in active|trialing`) lives; the `auth-extensions` port puts the answer on the
  session payload, and every client reads it off the probe it already makes with
  `readSubscriptionAccess(session)`. A guard reads it (`SubscriptionGuard`, always behind
  `SessionGuard`); a route layout reads it (`app/routes/_app/_paid.tsx`). **Clients never
  derive it** — no screen, hook or gate infers entitlement from a subscription row, a
  status string or a Stripe response.
- **`provider` says who sold a row, and only the seller may manage it.** The `subscription`
  table is one table for every seller — that is what lets `accessFrom` answer for all of them
  — and `provider` is the one column that tells them apart. Every seller writes it explicitly
  on the rows it opens (`sold-here.ts` stamps `stripe`); the database default is a floor, not
  a way to fill it. `managedOnWeb(access)` is what a screen branches on, and the server
  refuses cancel, restore and the billing portal for a plan sold elsewhere before the route
  runs — a client that forgot to ask still gets an honest answer.
- **Billing off is a state, not a fault.** `STRIPE_SECRET_KEY` unset means a `null` client,
  no plugin and a 503 in the envelope from the confirm endpoint. Every gate runs that way;
  nothing in this module may need Stripe to boot, typecheck or test.
- **A route goes behind the paywall by moving under `_app/_paid/`** — never by adding a
  gate to `KIT_GATES`, which would put the whole app behind it. The paywall and the checkout
  return stay outside on purpose: both are places somebody without a subscription must reach.
- **Mock mode's entitlement is two cookies** (`shared/contracts/subscription/mock-subscription.ts`):
  the ledger, and the session-extra cookie auth's `mock-session.ts` merges into
  `/api/auth/get-session`. They are written together — a ledger without the session field is
  a plan no gate can see. This module registers no `get-session` handler of its own.
