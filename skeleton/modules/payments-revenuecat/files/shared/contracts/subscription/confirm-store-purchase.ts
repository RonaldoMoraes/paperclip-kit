import { z } from "zod";
import type { Http } from "../http";
import { SubscriptionAccess } from "./access";

/**
 * `POST /api/subscription/revenuecat/confirm` — the store purchase, settled in one call.
 *
 * The phone's counterpart of `/api/subscription/confirm`. The store sheet closes before
 * RevenueCat's webhook has necessarily reached this server, and the SDK's own answer is the
 * device's word: the app never grants itself access from it. So, like the web's checkout
 * return, the server reads the customer straight from RevenueCat and writes what it says
 * onto the row; the access comes back in the shape the session carries, and the session is
 * refreshed so the gate reads it.
 *
 * Idempotent, and also what "Restore purchases" calls once the store has re-attached the
 * receipt — and what somebody whose webhook was missed can be told to do.
 */
export const ConfirmStorePurchaseRequest = z.object({
  /**
   * The store product the SDK says was bought — reported and never obeyed. The server reads
   * RevenueCat; this is what lets a disagreement be counted, and what the mock settles on,
   * since there is no RevenueCat to read in mock mode. Null after a restore, which found
   * whatever it found.
   */
  storeProductId: z.string().min(1).nullable(),
});
export type ConfirmStorePurchaseRequest = z.infer<typeof ConfirmStorePurchaseRequest>;

export const ConfirmStorePurchaseResponse = z.object({
  /** RevenueCat knows about a subscription for this person, and the row now matches it */
  confirmed: z.boolean(),
  /** their access as it now stands — the same shape, from the same function, the session carries */
  access: SubscriptionAccess,
});
export type ConfirmStorePurchaseResponse = z.infer<typeof ConfirmStorePurchaseResponse>;

export const CONFIRM_STORE_PURCHASE_PATH = "/api/subscription/revenuecat/confirm";

export function confirmStorePurchase(
  http: Http,
  body: ConfirmStorePurchaseRequest
): Promise<ConfirmStorePurchaseResponse> {
  return http.post(CONFIRM_STORE_PURCHASE_PATH, ConfirmStorePurchaseResponse, body);
}
