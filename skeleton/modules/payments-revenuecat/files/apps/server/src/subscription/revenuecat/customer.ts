import type { RevenueCatSubscription } from "./client";
import { type PlanOf, type StoreSubscriptionUpdate, planColumn } from "./events";

/**
 * A customer as RevenueCat holds him now, written onto the same columns the webhook writes.
 *
 * The webhook is the record of what happened; this is the state, read on demand — at the
 * purchase, at a restore, and whenever a delivery was missed. Both land on the row through
 * `StoreSubscriptionUpdate`, so the access predicate reads one vocabulary whichever path
 * wrote last.
 */

/**
 * `status` in Stripe's words, from RevenueCat's own.
 *
 * `gives_access` is the store's verdict and it wins: a billing retry the store still
 * honours is `active`, one it has stopped honouring is not, and neither needs a third word.
 */
function statusOf(subscription: RevenueCatSubscription): string {
  if (subscription.gives_access) return subscription.status === "trialing" ? "trialing" : "active";
  return subscription.status === "paused" ? "paused" : "canceled";
}

const millis = (value: number | null | undefined): Date | undefined =>
  typeof value === "number" ? new Date(value) : undefined;

/**
 * The subscription that describes him: the one giving access, else the one whose period
 * started last. Someone with none has nothing to write, and the row is left as the webhook
 * left it.
 */
export function currentSubscription(subscriptions: readonly RevenueCatSubscription[]): RevenueCatSubscription | null {
  const live = subscriptions.find((subscription) => subscription.gives_access);
  if (live) return live;
  return [...subscriptions].sort((a, b) => b.current_period_starts_at - a.current_period_starts_at)[0] ?? null;
}

/**
 * What one subscription writes.
 *
 * `storeProductId` is the store's id for RevenueCat's `product_id`, resolved by the caller:
 * REST names products by RevenueCat's own `prod…` id, and both the row and the plan map
 * speak the store's.
 *
 * `stripe_subscription_id` is deliberately not among the columns. The webhook writes it from
 * the event's `original_transaction_id` and scopes every later cancellation and expiration
 * to it; REST's `store_subscription_identifier` is the *latest* transaction's id, which
 * changes on every renewal, and a row rewritten from here would drop every ending that
 * followed. One writer for that column.
 *
 * Trial dates are written only while he is trialing — they are the record `hasEverTrialed`
 * reads, and a later read must not clear them.
 */
export function updateFromCustomer(
  subscription: RevenueCatSubscription,
  storeProductId: string | null,
  planOf: PlanOf
): StoreSubscriptionUpdate {
  const status = statusOf(subscription);
  const start = millis(subscription.current_period_starts_at);
  const end = millis(subscription.current_period_ends_at);
  const ending = ["will_not_renew", "will_pause"].includes(subscription.auto_renewal_status);
  return {
    stripe_customer_id: null,
    ...(storeProductId ? planColumn(planOf(storeProductId)) : {}),
    status,
    ...(start ? { period_start: start } : {}),
    ...(end ? { period_end: end } : {}),
    ...(status === "trialing" ? { ...(start ? { trial_start: start } : {}), ...(end ? { trial_end: end } : {}) } : {}),
    cancel_at_period_end: subscription.gives_access && ending,
    cancel_at: null,
    ...(subscription.gives_access ? { ended_at: null } : { ended_at: end ?? null }),
  };
}
