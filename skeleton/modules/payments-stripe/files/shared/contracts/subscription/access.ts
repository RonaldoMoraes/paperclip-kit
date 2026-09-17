import { z } from "zod";

/**
 * What the person is allowed to use, as the server decided it.
 *
 * The predicate is the server's alone — `status in ("active", "trialing")` — and it rides
 * on the session (`auth-extensions.provider.ts` puts it there through the `auth-extensions`
 * port, and `customSession` answers `/api/auth/get-session` with it). Every client reads
 * the same answer off the probe it already makes: no screen, no gate and no hook derives
 * entitlement from a subscription row, because two derivations are two answers waiting to
 * disagree and the person on the wrong side of the disagreement is a paying one.
 *
 * `status` and `plan` are Stripe's own vocabulary, carried through untouched so a screen
 * can say "your trial" or "your plan is past due" without a second call.
 */

/**
 * Who sold the plan. A plain string rather than an enum: a second seller (a phone store, an
 * invoice) is a name it writes into the same column rather than a union every reader of this
 * contract has to be taught. The value lives on the row — `subscription.provider` — and is
 * carried through untouched, because it decides where the plan can be managed.
 */
export const STRIPE_PROVIDER = "stripe";

export const SubscriptionAccess = z.object({
  /** the access predicate, already applied */
  active: z.boolean(),
  /** who sold it, or null when there is no subscription */
  provider: z.string().nullable(),
  /** Stripe's subscription status, or null when there has never been one */
  status: z.string().nullable(),
  /** the plan name the server stored, lower-cased by the plugin (`monthly`, `annual`) */
  plan: z.string().nullable(),
  /**
   * The subscription is scheduled to stop and will not renew.
   *
   * Not the same as Stripe's `cancel_at_period_end`: cancelling through the billing portal
   * schedules the stop as a `cancel_at` and leaves that flag false, so a screen reading the
   * flag alone shows someone who has just cancelled the cancel button again. `isEnding` is
   * the rule; this is its answer.
   */
  ending: z.boolean(),
  /**
   * When it stops, or when it renews when it is not ending — null when there is nothing to
   * date.
   *
   * Coerced rather than typed as a string, because it is read on both sides of the wire in
   * two shapes: the server puts a `Date` on the session, and it reaches the browser as the
   * ISO string JSON made of it. A `z.string()` here would parse on the server and fail in
   * the browser — as no access, which is the one failure that looks like someone who never
   * subscribed.
   */
  endsAt: z.coerce.date().nullable(),
  /**
   * There has never been a free trial, so a paywall may still offer one. One per person,
   * ever, across plans and across subscriptions since ended — the server decides it here
   * and again at checkout, so the copy and the charge cannot disagree.
   */
  trialEligible: z.boolean(),
});
export type SubscriptionAccess = z.infer<typeof SubscriptionAccess>;

/** Nobody has subscribed. */
export const NO_SUBSCRIPTION: SubscriptionAccess = {
  active: false,
  provider: null,
  status: null,
  plan: null,
  ending: false,
  endsAt: null,
  trialEligible: true,
};

/**
 * What a reader falls back to when it cannot tell what the person has.
 *
 * No access, like `NO_SUBSCRIPTION` — but not eligible for a trial, which is the difference
 * that matters. `trialEligible` is a promise a paywall makes in copy and the server decides
 * again at checkout; a session nobody could read that answered "yes" would promise a free
 * week the checkout then refuses. Silence is not someone who never subscribed.
 */
export const UNREADABLE_ACCESS: SubscriptionAccess = { ...NO_SUBSCRIPTION, trialEligible: false };

/**
 * Whether this plan can be managed from the web.
 *
 * Cancel, restore and the billing portal exist only where the plan was sold: Stripe cannot
 * cancel an Apple subscription and Apple cannot cancel a Stripe one. A plan sold elsewhere
 * is shown, never changed — the server refuses it too (`sold-here.ts`), so a client that
 * forgot to ask gets an honest error rather than a portal that opens the wrong account.
 *
 * No subscription at all is `false`: there is nothing to manage.
 */
export function managedOnWeb(access: Pick<SubscriptionAccess, "provider">): boolean {
  return access.provider === STRIPE_PROVIDER;
}

/** The statuses that mean "they may use the product". */
export const ACTIVE_STATUSES = ["active", "trialing"] as const;

export function isActiveStatus(status: string | null | undefined): boolean {
  return status != null && (ACTIVE_STATUSES as readonly string[]).includes(status);
}

/**
 * The access a session payload carries.
 *
 * Better Auth owns the session object and types it from its own plugins, so every client
 * reads this one field through one narrow parse instead of teaching each call site about
 * it. Anything unreadable — no session, an older server, a field that drifted — is no
 * access and no trial offer, which is the safe answer on both counts.
 */
export function readSubscriptionAccess(session: unknown): SubscriptionAccess {
  const parsed = SubscriptionAccess.safeParse((session as { access?: unknown } | null)?.access);
  return parsed.success ? parsed.data : UNREADABLE_ACCESS;
}

/* ── the ending, and when it lands ───────────────────────────────────────────── */

/** What a subscription row says about being scheduled to stop, whatever its column names. */
export type EndingSignals = {
  cancelAtPeriodEnd?: unknown;
  cancelAt?: Date | string | null;
  periodEnd?: Date | string | null;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Whether the subscription is on its way out — both shapes, because Stripe has two.
 *
 * Cancelling through our own call sets `cancel_at_period_end`; cancelling through the
 * billing portal schedules a `cancel_at` and leaves that flag false. A `cancel_at` in the
 * past is a subscription that has already ended, not one that is ending.
 */
export function isEnding(row: EndingSignals, now: Date = new Date()): boolean {
  if (row.cancelAtPeriodEnd) return true;
  const cancelAt = asDate(row.cancelAt);
  return cancelAt !== null && cancelAt.getTime() > now.getTime();
}

/**
 * The date the subscription runs to: the scheduled stop when there is one, else the
 * renewal. The same future test `isEnding` applies, and for the same reason — a `cancel_at`
 * that has passed is the record of an ending that already happened, and dating a live
 * subscription by it would put a day behind us under "renews on".
 */
export function endsAtFrom(row: EndingSignals, now: Date = new Date()): Date | null {
  const cancelAt = asDate(row.cancelAt);
  if (cancelAt && cancelAt.getTime() > now.getTime()) return cancelAt;
  return asDate(row.periodEnd);
}

/* ── the trial, once per person ──────────────────────────────────────────────── */

/** What a subscription row says about having had a trial, whatever its column names. */
export type TrialSignals = { trialStart?: unknown; trialEnd?: unknown; status?: string | null };

/**
 * One trial per person, ever — across plans, and across subscriptions since ended.
 *
 * The rule lives here because two places apply it and they must not drift: the server
 * decides what a paywall may *show* (`trialEligible` on the session) and, at checkout, what
 * is actually *charged*. A paywall promising seven free days over a checkout that bills
 * today is worse than never offering the trial.
 */
export function hasEverTrialed(rows: readonly TrialSignals[]): boolean {
  return rows.some((row) => Boolean(row.trialStart) || Boolean(row.trialEnd) || row.status === "trialing");
}
