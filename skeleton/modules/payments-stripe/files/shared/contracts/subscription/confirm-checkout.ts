import { z } from "zod";
import type { Http } from "../http";
import { SubscriptionAccess } from "./access";

/**
 * `POST /api/subscription/confirm` — the checkout return, settled in one call.
 *
 * Stripe hands the browser back the moment the payment (or the trial setup) is done, which
 * is before its webhook has necessarily arrived. Rather than poll the local row until the
 * webhook wins, this endpoint reads the Checkout Session straight from Stripe — expanded to
 * carry the subscription it created — and writes what it says. A trial counts as settled: a
 * subscription on a free trial is `trialing` from the first second, and a confirmation that
 * only accepted `active` would tell the buyer their checkout failed.
 *
 * It is idempotent: the same session id reconciles to the same row, so a reload of
 * `/checkout/return` costs one Stripe read and changes nothing.
 */
export const ConfirmCheckoutRequest = z.object({
  /** Stripe's `{CHECKOUT_SESSION_ID}`, handed back on the return URL */
  sessionId: z.string().min(1),
});
export type ConfirmCheckoutRequest = z.infer<typeof ConfirmCheckoutRequest>;

export const ConfirmCheckoutResponse = z.object({
  /** Stripe knows about a subscription for this checkout, and the row now matches it */
  confirmed: z.boolean(),
  /** the access as it now stands — the same shape the session carries */
  access: SubscriptionAccess,
});
export type ConfirmCheckoutResponse = z.infer<typeof ConfirmCheckoutResponse>;

export function confirmCheckout(http: Http, sessionId: string): Promise<ConfirmCheckoutResponse> {
  return http.post("/api/subscription/confirm", ConfirmCheckoutResponse, { sessionId });
}

export function confirmCheckoutQuery(http: Http, sessionId: string) {
  return {
    queryKey: ["subscription", "confirm", sessionId] as const,
    // The answer is about one checkout at one moment; nothing is served from cache.
    staleTime: 0,
    queryFn: () => confirmCheckout(http, sessionId),
  };
}
