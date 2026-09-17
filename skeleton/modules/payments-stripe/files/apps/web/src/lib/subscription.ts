import type { QueryClient } from "@tanstack/react-query";
import {
  BILLING_RETURN_PATH,
  CHECKOUT_CANCEL_PATH,
  CHECKOUT_RETURN_PATH,
  type PlanName,
} from "@contracts/subscription/checkout";
import { SubscriptionFlowError } from "@contracts/subscription/errors";
import { billingClient } from "~/lib/billing-client";
import { sessionKey } from "~/lib/session";

/**
 * The two things this app asks Better Auth's Stripe routes for, and the one thing it does
 * after either of them lands.
 *
 * Both hand the whole page to Stripe: the client follows the `url` the server answers with,
 * so there is nothing to navigate to on success. The plugin answers `{ error }` rather than
 * rejecting, which is why each of these turns a refusal into a throw — a hook has one thing
 * to catch and the screen has one line to print.
 */
const CHECKOUT_FAILED = "We couldn't open checkout. Try again in a moment.";
const PORTAL_FAILED = "We couldn't open billing. Try again in a moment.";

/** The paywall's one action: ask the server for a checkout and let it take the page. */
export async function startCheckout(plan: PlanName): Promise<void> {
  const { error } = await billingClient.subscription.upgrade({
    plan,
    successUrl: CHECKOUT_RETURN_PATH,
    cancelUrl: CHECKOUT_CANCEL_PATH,
  });
  if (error) throw new SubscriptionFlowError(error.message?.trim() || CHECKOUT_FAILED);
}

/**
 * Stripe's own account page — the card, the invoices, and cancelling.
 *
 * Cancelling is a confirmation on Stripe's page rather than a button here: the page that
 * takes the money is the page that should let it go, and a second confirmation of our own
 * would make leaving harder than joining was.
 */
export async function openBillingPortal(): Promise<void> {
  const { error } = await billingClient.subscription.billingPortal({ returnUrl: BILLING_RETURN_PATH });
  if (error) throw new SubscriptionFlowError(error.message?.trim() || PORTAL_FAILED);
}

/**
 * Something changed the access field on the session, and the session is what every guarded
 * route reads.
 *
 * `refetchQueries`, not `invalidateQueries`: the gate resolves the session through
 * `ensureQueryData`, which hands back a stale entry rather than going and getting a fresh
 * one — marking it stale would leave the next screen describing the subscription of a moment
 * ago.
 */
export async function refreshSubscription(queryClient: QueryClient): Promise<void> {
  await queryClient.refetchQueries({ queryKey: sessionKey });
}
