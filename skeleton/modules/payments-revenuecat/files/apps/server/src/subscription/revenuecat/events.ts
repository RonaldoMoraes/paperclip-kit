import { STORE_PROVIDER } from "@contracts/subscription/store-products";

/**
 * RevenueCat's lifecycle, written onto the columns the access predicate already reads.
 * Event types and fields: revenuecat.com/docs/integrations/webhooks/event-types-and-fields.
 *
 * The whole point of this file is that there is no second vocabulary. `status` keeps
 * Stripe's words — `active`, `trialing`, `canceled`, `paused` — and every date lands in the
 * column `../subscription.service.ts` already reads, so `accessFrom`, `isEnding` and
 * `hasEverTrialed` serve both sellers without learning that a second one exists.
 *
 * `provider` is the one column that says which of them sold the row, and it is written by a
 * purchase and by nothing else. A `CANCELLATION` or an `EXPIRATION` describes a subscription
 * that already has a seller, so restamping it would be this module claiming a row on the
 * strength of an event about somebody else's — and a web-sold row that a store event happens
 * to patch correctly keeps saying `stripe`, because Stripe is still the one billing it.
 * The other two columns that mark a store row are `stripe_customer_id` (always null here)
 * and `stripe_subscription_id`, which for a store row holds the purchase's original
 * transaction id — the seller's own id for the subscription, which is what that column has
 * always meant.
 */

/** The webhook body's `event`, as the fields this mapping reads. */
export type RevenueCatEvent = {
  type: string;
  product_id?: string | null;
  new_product_id?: string | null;
  period_type?: string | null;
  store?: string | null;
  original_transaction_id?: string | null;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  cancel_reason?: string | null;
  expiration_reason?: string | null;
};

/**
 * The columns an event may write, in the `subscription` table's own names. Absent means
 * "leave the column as it is" — an update is a patch, not a picture, because two events for
 * one person can arrive in either order.
 */
export type StoreSubscriptionUpdate = Partial<{
  /** who sold it — written by a purchase, and by nothing else (see the file's note) */
  provider: string;
  /** the store's original transaction id; null releases it after a transfer */
  stripe_subscription_id: string | null;
  /** never a store row's: a Stripe customer id left here would send the web's portal to the wrong account */
  stripe_customer_id: null;
  plan: string;
  status: string;
  period_start: Date;
  period_end: Date;
  trial_start: Date;
  trial_end: Date;
  cancel_at_period_end: boolean;
  cancel_at: null;
  canceled_at: Date | null;
  ended_at: Date | null;
}>;

/** The store's product id → the plan this app sells it as, or null for one it does not. */
export type PlanOf = (productId: string) => string | null;

/** The row an event lands on: the transaction it is already about, or null when there is none yet. */
export type CurrentRow = { stripe_subscription_id: string | null };

/** The two event types that open or renew a subscription; everything else describes one that exists. */
const PURCHASES = new Set(["INITIAL_PURCHASE", "RENEWAL"]);

const millis = (value: number | null | undefined): Date | undefined =>
  typeof value === "number" ? new Date(value) : undefined;

const periodEndOf = (event: RevenueCatEvent): Pick<StoreSubscriptionUpdate, "period_end"> => {
  const end = millis(event.expiration_at_ms);
  return end ? { period_end: end } : {};
};

/**
 * The plan column, only when the product maps to one.
 *
 * Never written null: `plan` is `NOT NULL` on the table, and Better Auth's Stripe plugin
 * lower-cases every row's plan before filtering, so one null there is a 500 on the web for
 * as long as the row exists. A product this app cannot name keeps whatever the row had.
 */
export const planColumn = (plan: string | null): Pick<StoreSubscriptionUpdate, "plan"> => (plan ? { plan } : {});

/**
 * A purchase's identity: who sold it, and what it is.
 *
 * `provider` is written here and only here. A purchase is the moment a row becomes the
 * store's — the web reads that column to decide where a plan can be managed, and a row this
 * event just took over must not go on offering Stripe's billing portal for a subscription
 * Apple is billing.
 *
 * The Stripe customer id is cleared alongside it, for the same reason from the other side:
 * left on a row the phone now sells, the plugin's cancel would find no Stripe subscription
 * behind it.
 */
function purchase(event: RevenueCatEvent, planOf: PlanOf): StoreSubscriptionUpdate {
  const start = millis(event.purchased_at_ms);
  return {
    provider: STORE_PROVIDER,
    stripe_customer_id: null,
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    ...(event.product_id ? planColumn(planOf(event.product_id)) : {}),
    ...(event.original_transaction_id ? { stripe_subscription_id: event.original_transaction_id } : {}),
    ...(start ? { period_start: start } : {}),
    ...periodEndOf(event),
  };
}

/**
 * What one event writes, or null when it changes nothing on the row.
 *
 * A purchase always lands. Every other event is scoped to the row's own transaction: a Play
 * product change is a new purchase token, and the old token's `CANCELLATION` and
 * `EXPIRATION` can arrive after the new `INITIAL_PURCHASE` — applied unscoped, they would
 * end a subscription that had just started.
 *
 * Trial dates are written only by the purchase that starts the trial: they are the record
 * `hasEverTrialed` reads, and clearing them hands out a second free week.
 */
export function updateFromRevenueCat(
  event: RevenueCatEvent,
  planOf: PlanOf,
  current: CurrentRow = { stripe_subscription_id: null }
): StoreSubscriptionUpdate | null {
  const transaction = event.original_transaction_id ?? null;
  if (
    !PURCHASES.has(event.type) &&
    transaction &&
    current.stripe_subscription_id &&
    transaction !== current.stripe_subscription_id
  ) {
    return null;
  }
  const at = millis(event.event_timestamp_ms) ?? null;

  switch (event.type) {
    case "INITIAL_PURCHASE": {
      const update = purchase(event, planOf);
      if (event.period_type !== "TRIAL") return { ...update, status: "active" };
      return {
        ...update,
        status: "trialing",
        ...(update.period_start ? { trial_start: update.period_start } : {}),
        ...(update.period_end ? { trial_end: update.period_end } : {}),
      };
    }
    case "RENEWAL":
      return { ...purchase(event, planOf), status: "active" };
    // A refund is the one cancellation that takes access away now; every other one is a
    // subscription that stops renewing and keeps running to its period end.
    case "CANCELLATION":
      if (event.cancel_reason === "CUSTOMER_SUPPORT") {
        return { status: "canceled", canceled_at: at, ended_at: at, cancel_at_period_end: false, cancel_at: null };
      }
      return { cancel_at_period_end: true, canceled_at: at, ...periodEndOf(event) };
    case "UNCANCELLATION":
      return { cancel_at_period_end: false, cancel_at: null, canceled_at: null, ...periodEndOf(event) };
    case "SUBSCRIPTION_PAUSED":
      return { cancel_at_period_end: true, canceled_at: at, ...periodEndOf(event) };
    case "EXPIRATION":
      return {
        status: event.expiration_reason === "SUBSCRIPTION_PAUSED" ? "paused" : "canceled",
        ended_at: millis(event.expiration_at_ms) ?? at,
        cancel_at_period_end: false,
        cancel_at: null,
        ...periodEndOf(event),
      };
    // The store keeps him entitled through a billing issue, to the end of the grace period;
    // its own `EXPIRATION` is what ends access.
    case "BILLING_ISSUE": {
      const grace = millis(event.grace_period_expiration_at_ms);
      return grace ? { period_end: grace } : null;
    }
    case "SUBSCRIPTION_EXTENDED": {
      const extended = periodEndOf(event);
      return extended.period_end ? extended : null;
    }
    default:
      return null;
  }
}

/**
 * The store moved the subscription to another customer — RevenueCat's default when someone
 * restores on a second account. The row that lost it ends now: nothing else will ever be
 * sent for it, and its transaction id is released so the receiving account's purchase can
 * carry it. The receiving account is not written here; its own `confirm` reads what it now
 * holds.
 */
export function transferOut(at: Date): StoreSubscriptionUpdate {
  return {
    status: "canceled",
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: at,
    ended_at: at,
    stripe_subscription_id: null,
  };
}
