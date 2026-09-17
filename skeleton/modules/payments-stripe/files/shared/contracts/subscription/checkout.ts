import { z } from "zod";

/**
 * The paywall's vocabulary: what is sold, where Stripe sends the browser back, and the one
 * shape Better Auth's Stripe routes answer with.
 *
 * Those routes belong to `@better-auth/stripe` and the auth client calls them, so — as with
 * `auth/` — the schema here exists to hold the mocks beside it to the shape the plugin
 * really answers in, and never to parse a live response.
 */

/** The two plans this module sells, and the only names the paywall may send. */
export const PLANS = ["monthly", "annual"] as const;
export type PlanName = (typeof PLANS)[number];

/** What `subscription.upgrade` and `.billingPortal` answer: where to send the browser next. */
export const CheckoutRedirect = z.object({
  url: z.string().min(1),
  redirect: z.boolean(),
});
export type CheckoutRedirect = z.infer<typeof CheckoutRedirect>;

/**
 * Where Checkout sends the browser back to, and where a cancelled checkout drops it.
 *
 * The return path carries Stripe's `{CHECKOUT_SESSION_ID}` because the server builds the
 * success URL itself (`stripe-plugin.ts`): the plugin's own success route reconciles by
 * listing *active* subscriptions, which a trialing one is not, and it hands back no session
 * id for `POST /api/subscription/confirm` to settle from.
 */
export const CHECKOUT_RETURN_PATH = "/checkout/return";
export const CHECKOUT_CANCEL_PATH = "/paywall";

/** Where the billing portal returns to when the person is done in it. */
export const BILLING_RETURN_PATH = "/settings";
