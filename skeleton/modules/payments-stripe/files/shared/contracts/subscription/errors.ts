/**
 * The failures this feature names, on both sides of the wire.
 *
 * `SUBSCRIPTION_REQUIRED` widens the vocabulary base's `errors.ts` ships (`ApiErrorCode`
 * is a closed union a module never edits): the server's guard answers with it, and a
 * client that wants to say something specific about "signed in, but not subscribed"
 * branches on it rather than on the 403.
 */
export const SUBSCRIPTION_REQUIRED = "SUBSCRIPTION_REQUIRED";

/**
 * What the web answers for a management call on a plan it did not sell. Named explicitly
 * because Better Auth derives a code from the message otherwise, and a code built out of a
 * sentence is one no client can branch on and every copy edit renames.
 */
export const SUBSCRIPTION_SOLD_ELSEWHERE = "SUBSCRIPTION_SOLD_ELSEWHERE";

export const SUBSCRIPTION_ERROR_CODES = [SUBSCRIPTION_REQUIRED, SUBSCRIPTION_SOLD_ELSEWHERE] as const;
export type SubscriptionErrorCode = (typeof SUBSCRIPTION_ERROR_CODES)[number];

/** The line an unsubscribed caller reads for a route only a subscriber may have. */
export const SUBSCRIPTION_REQUIRED_MESSAGE = "This needs an active subscription.";

/**
 * What the confirm endpoint answers when there is no Stripe client at all — no
 * `STRIPE_SECRET_KEY`, so no checkout to have returned from. It goes out as the envelope's
 * `INTERNAL` at 503 rather than as a code of its own: it is this deployment's own
 * configuration, and no client has anything different to do about it.
 */
export const BILLING_OFF_MESSAGE = "Billing is not configured.";

/**
 * What the web answers when asked to cancel, restore or open a billing portal for a plan it
 * did not sell. Stripe cannot cancel an Apple subscription and Apple cannot cancel a Stripe
 * one, so the honest answer names where it can be done instead of opening a portal that
 * would refuse — or, worse, one that would act on the wrong account.
 */
export const SOLD_ELSEWHERE_MESSAGE =
  "This plan was bought somewhere else. Manage it where you bought it — the store on the device you subscribed with.";

/**
 * The error a subscription flow throws once Better Auth's Stripe plugin has refused: the
 * plugin answers `{ error }` rather than rejecting, so the hook is where a refusal becomes
 * a throw and the screen has one thing to catch.
 */
export class SubscriptionFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionFlowError";
  }
}
