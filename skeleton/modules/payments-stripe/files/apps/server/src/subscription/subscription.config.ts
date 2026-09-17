/**
 * What billing runs on: the client's key, its webhook secret, the two prices, and the
 * billing-portal configuration this product opens instead of the account default.
 */
export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  priceMonthly: string;
  priceAnnual: string;
  /** null opens the Stripe account's default portal configuration */
  portalConfiguration: string | null;
};

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(
      `[subscription] ${name} is missing. Stripe is on because STRIPE_SECRET_KEY is set; ` +
        "unset it to run without billing, or set this — see .env.example."
    );
  }
  return value;
}

/**
 * The only reader of `process.env` for billing, and the boot it fails.
 *
 * `STRIPE_SECRET_KEY` is the switch. Unset, there is no client, no plugin and no billing at
 * all — which is what mock mode, the gates and a plain local stack run as, and `null` is
 * what this answers. Set, the other three keys are required here, at boot, rather than
 * discovered by the first person trying to pay.
 *
 * The portal configuration is the one that stays optional: without it Stripe opens the
 * account's default portal, which is a working billing page rather than a missing one.
 */
export function loadStripeConfig(env: Env): StripeConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  return {
    secretKey,
    webhookSecret: required(env, "STRIPE_WEBHOOK_SECRET"),
    priceMonthly: required(env, "STRIPE_PRICE_MONTHLY"),
    priceAnnual: required(env, "STRIPE_PRICE_ANNUAL"),
    portalConfiguration: env.STRIPE_PORTAL_CONFIGURATION?.trim() || null,
  };
}
