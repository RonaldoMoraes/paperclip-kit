import type Stripe from "stripe";
import {
  NO_SUBSCRIPTION,
  type SubscriptionAccess,
  endsAtFrom,
  hasEverTrialed,
  isActiveStatus,
  isEnding,
} from "@contracts/subscription/access";
import type { ConfirmCheckoutResponse } from "@contracts/subscription/confirm-checkout";

/**
 * The access predicate, and the only place it is decided.
 *
 * `status in ("active", "trialing")` — a trial is access, a cancellation that has not
 * reached its period end is still access, and everything else is not. No client applies it:
 * the answer is computed here, put on the session by the `auth-extensions` port, and read
 * back off the probe every app already makes, so two clients cannot drift into two ideas of
 * who has paid.
 *
 * Rows are read by `reference_id`, which is the Better Auth user id as a string.
 */

/** The columns the predicate reads. Snake case: these are the table's own names. */
export type SubscriptionRow = {
  /** who sold it; the predicate never reads this, the clients do */
  provider: string;
  status: string | null;
  plan: string | null;
  cancel_at_period_end: boolean | null;
  /** the scheduled stop the billing portal writes, where `cancel_at_period_end` stays false */
  cancel_at: Date | null;
  period_end: Date | null;
  /** the record of the one free trial; see `hasEverTrialed` */
  trial_start: Date | null;
  trial_end: Date | null;
};

/**
 * The slice of Prisma this reads through, structural so a unit test can hand it a stub.
 *
 * `orderBy` is part of the contract rather than a detail of the call: `accessFrom` describes
 * the most recent row when none is active, and "most recent" is only true if the query said
 * so.
 */
export type SubscriptionReader = {
  subscription: {
    findMany(args: { where: { reference_id: string }; orderBy: { created_at: "desc" } }): Promise<SubscriptionRow[]>;
  };
};

/**
 * The access those rows add up to.
 *
 * One person has one subscription in the ordinary case, and the loop is belt and braces:
 * an active row wins wherever it sits, and with none the first row — newest, because the
 * query says so — is what the screens describe ("your plan is past due") with `active`
 * false. Whoever sold that row is what `provider` reports, so a plan bought in a phone store
 * is never described to the web as one Stripe can manage.
 */
export function accessFrom(rows: readonly SubscriptionRow[], now: Date = new Date()): SubscriptionAccess {
  const trialEligible = !hasEverTrialed(
    rows.map((row) => ({ trialStart: row.trial_start, trialEnd: row.trial_end, status: row.status }))
  );
  const active = rows.find((row) => isActiveStatus(row.status));
  const row = active ?? rows[0];
  if (!row) return { ...NO_SUBSCRIPTION, trialEligible };
  const ending = {
    cancelAtPeriodEnd: row.cancel_at_period_end,
    cancelAt: row.cancel_at,
    periodEnd: row.period_end,
  };
  return {
    active: Boolean(active),
    // The row's own word, not this module's: a second seller writes the same column, and
    // `provider` is what decides where the plan can be managed.
    provider: row.provider,
    status: row.status,
    plan: row.plan,
    ending: isEnding(ending, now),
    endsAt: endsAtFrom(ending, now),
    trialEligible,
  };
}

/** What one person is allowed, read once per session probe. */
export async function subscriptionAccess(db: SubscriptionReader, userId: string): Promise<SubscriptionAccess> {
  return accessFrom(
    await db.subscription.findMany({ where: { reference_id: userId }, orderBy: { created_at: "desc" } })
  );
}

/* ── the customer a row belongs to ───────────────────────────────────────────── */

export type CustomerCorrection = { stripeSubscriptionId: string; stripeCustomerId: string };

export type CustomerWriter = {
  subscription: {
    updateMany(args: {
      where: { stripe_subscription_id: string };
      data: { stripe_customer_id: string };
    }): Promise<{ count: number }>;
  };
};

/**
 * The row corrected to name the customer Stripe is actually billing.
 *
 * Someone who opens checkout and abandons it leaves the row holding the customer Stripe made
 * for that attempt. Every `customer.subscription.*` event names the customer that ended up
 * billing them, so the row catches up as those arrive rather than drifting until the billing
 * portal opens the wrong account.
 */
export async function reconcileCustomer(db: CustomerWriter, correction: CustomerCorrection): Promise<void> {
  await db.subscription.updateMany({
    where: { stripe_subscription_id: correction.stripeSubscriptionId },
    data: { stripe_customer_id: correction.stripeCustomerId },
  });
}

/* ── the checkout return ─────────────────────────────────────────────────────── */

/**
 * The columns a settled checkout writes back onto the row.
 *
 * `plan` is not among them: the row already carries the plan that was chosen, written when
 * the checkout was opened, and the Stripe subscription does not name it. Rewriting it from
 * here could only make it worse.
 */
export type SubscriptionUpdate = {
  status: string;
  stripe_subscription_id: string;
  stripe_customer_id: string | null;
  period_start: Date | null;
  period_end: Date | null;
  trial_start: Date | null;
  trial_end: Date | null;
  /** all three shapes of an ending, so this write and the plugin's webhook agree */
  cancel_at_period_end: boolean;
  cancel_at: Date | null;
  canceled_at: Date | null;
};

export type SubscriptionWriter = SubscriptionReader & {
  subscription: SubscriptionReader["subscription"] & {
    /**
     * `updateMany`, not `update`: the reference id goes in the `where`, so a row can only
     * ever be written by the person it belongs to, and the count says whether it matched.
     */
    updateMany(args: {
      where: { id: number; reference_id: string };
      data: SubscriptionUpdate;
    }): Promise<{ count: number }>;
  };
};

const seconds = (value: number | null | undefined): Date | null =>
  typeof value === "number" ? new Date(value * 1000) : null;

/** Stripe sends the customer as an id, or as the whole object when something expanded it. */
const customerId = (customer: string | { id: string } | null | undefined): string | null =>
  typeof customer === "string" ? customer : (customer?.id ?? null);

/**
 * The part of a Stripe subscription this reads.
 *
 * Structural rather than `Stripe.Subscription`, so a test can state a subscription as the
 * handful of facts it is about instead of casting a whole SDK object into being. A real
 * `Stripe.Subscription` satisfies it.
 */
export type StripeSubscriptionFacts = {
  id: string;
  status: string;
  customer: string | { id: string } | null;
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
  canceled_at?: number | null;
  trial_start?: number | null;
  trial_end?: number | null;
  items: { data: Array<{ current_period_start?: number | null; current_period_end?: number | null }> };
};

/**
 * What Stripe says a finished Checkout Session bought.
 *
 * `trialing` is a settled outcome, not a pending one: a subscription on a free trial is
 * `trialing` from the first second, and a reader that only accepted `active` would call a
 * successful checkout a failure.
 */
export function updateFromStripe(subscription: StripeSubscriptionFacts): SubscriptionUpdate {
  const item = subscription.items.data[0];
  return {
    status: subscription.status,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: customerId(subscription.customer),
    period_start: seconds(item?.current_period_start),
    period_end: seconds(item?.current_period_end),
    trial_start: seconds(subscription.trial_start),
    trial_end: seconds(subscription.trial_end),
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    cancel_at: seconds(subscription.cancel_at),
    canceled_at: seconds(subscription.canceled_at),
  };
}

/**
 * The plugin's own metadata on the Checkout Session — the local row, and who it belongs to.
 * The plugin writes these three after everything the params callback returned, so no
 * caller's metadata can displace them.
 */
export function readSessionMetadata(metadata: Stripe.Metadata | null | undefined): {
  subscriptionId: number | null;
  referenceId: string | null;
} {
  const id = Number(metadata?.subscriptionId);
  return {
    subscriptionId: Number.isInteger(id) && id > 0 ? id : null,
    referenceId: typeof metadata?.referenceId === "string" ? metadata.referenceId : null,
  };
}

export type CheckoutReader = {
  checkout: {
    sessions: {
      retrieve(id: string, params: { expand: string[] }): Promise<Stripe.Checkout.Session>;
    };
  };
};

/**
 * The checkout return, settled in one read.
 *
 * Stripe hands the browser back before its webhook has necessarily arrived, so rather than
 * poll the row until the webhook wins, this reads the Checkout Session — expanded to carry
 * the subscription it created — and writes what it says. Idempotent: the same session id
 * reconciles to the same row.
 *
 * A session belonging to somebody else confirms nothing and writes nothing; the caller still
 * gets their own access back, because that is the honest answer to "what do I have".
 */
export async function confirmCheckout(
  deps: { db: SubscriptionWriter; stripe: CheckoutReader },
  sessionId: string,
  userId: string
): Promise<ConfirmCheckoutResponse> {
  const unconfirmed = async (): Promise<ConfirmCheckoutResponse> => ({
    confirmed: false,
    access: await subscriptionAccess(deps.db, userId),
  });

  const session = await deps.stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  const { subscriptionId, referenceId } = readSessionMetadata(session.metadata);
  if (referenceId !== userId || subscriptionId === null) return unconfirmed();

  const subscription = session.subscription;
  if (!subscription || typeof subscription === "string") return unconfirmed();

  // Scoped to their own reference id, so a session id naming somebody else's row cannot
  // write to it — and a row that does not match is not a confirmation.
  const { count } = await deps.db.subscription.updateMany({
    where: { id: subscriptionId, reference_id: userId },
    data: updateFromStripe(subscription),
  });
  if (count === 0) return unconfirmed();

  return { confirmed: true, access: await subscriptionAccess(deps.db, userId) };
}
