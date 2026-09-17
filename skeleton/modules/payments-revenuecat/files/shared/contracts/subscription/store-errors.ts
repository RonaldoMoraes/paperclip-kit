/**
 * The failures the store half of selling names, on both sides of the wire.
 *
 * Its own file rather than a line in `errors.ts`: that one is `payments-stripe`'s, and a
 * module never edits another's file. The two read as one vocabulary because they are about
 * the same thing from two sides — a refusal the web meets at Stripe, and one the phone
 * meets at the store.
 */

/**
 * What both store routes answer when there is no RevenueCat at all — no
 * `REVENUECAT_SECRET_KEY`, so no reader and no integration. It goes out as the envelope's
 * `INTERNAL` at 503 rather than as a code of its own: it is this deployment's own
 * configuration, and no client has anything different to do about it.
 */
export const STORE_BILLING_OFF_MESSAGE = "Store billing is not configured.";

/**
 * The error a store flow throws once the store or the server has refused.
 *
 * The SDK rejects with an object rather than an `Error` and the server answers in the
 * envelope, so the hook is where either becomes a throw and the screen has one thing to
 * catch — the store's counterpart of `SubscriptionFlowError`.
 */
export class StoreFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreFlowError";
  }
}
