/**
 * Consumers depend on these tokens, never on a client this module built:
 * `constructor(@Inject(STRIPE) private readonly stripe: CheckoutReader | null) {}`.
 */

/** The one Stripe client this module's endpoint holds, or `null` when billing is off. */
export const STRIPE = Symbol("STRIPE");

/** The prices, the webhook secret and the portal configuration — `null` beside a `null` client. */
export const STRIPE_CONFIG = Symbol("STRIPE_CONFIG");
