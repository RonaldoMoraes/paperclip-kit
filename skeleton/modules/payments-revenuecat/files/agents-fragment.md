### Payments (RevenueCat) — the store sells, the server decides

- **Access is never granted on the device.** The SDK's `customerInfo`, a `PurchaseOutcome`
  and a closed sheet are all the phone's word about what happened at the store. What
  somebody may *use* is `SubscriptionAccess`, computed once on the server from the
  `subscription` rows and carried on the session. A screen, a hook or a gate that reads an
  entitlement off the SDK is a second answer, and the person on the wrong side of the
  disagreement is a paying one.
- **A purchase is not finished until the server has confirmed it.** After the store reports
  a sale, call `POST /api/subscription/revenuecat/confirm` and refetch the session; the
  server reads RevenueCat itself and writes the row. Never send the device's receipt as
  proof, and never navigate on the store's answer — the gate moves on the session.
- **`react-native-purchases` is imported only under `apps/mobile/src/lib/store/`**, lazily.
  Everything else goes through `~/lib/store`. Guarded by
  `biome/revenuecat-sdk-imports.grit`; adding it to `app.config.js` `plugins` or a new
  screen does not change that.
- **One column vocabulary, two sellers.** A store purchase writes the same `subscription`
  columns Stripe's plugin writes (`status`, `plan`, `period_*`, `trial_*`, `cancel_*`), so
  `accessFrom` serves both. `stripe_customer_id` is always null on a store row and
  `stripe_subscription_id` holds the store's original transaction id. Do not add a second
  table, a second predicate, or a second idea of what "active" means.
- **Purchase is the store on the phone and Stripe on the web — by decision, not by
  accident.** Apple and Google require their own purchase flow for digital goods in the app;
  the web sells through Stripe because it can. A subscription is managed where it was sold:
  the phone's Settings row opens the store's own subscriptions page and this app ships no
  cancel button.
