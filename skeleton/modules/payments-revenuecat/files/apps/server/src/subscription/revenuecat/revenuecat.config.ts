/**
 * What the store side of billing runs on: RevenueCat's REST API v2, scoped to one project,
 * and the secret its webhook integration sends back in the `Authorization` header.
 *
 * The shape mirrors `../subscription.config.ts` on purpose — one switch, the rest required
 * beside it — so "how do I turn a seller on" has one answer whichever seller it is.
 */
export type RevenueCatConfig = {
  /** a v2 secret API key (`sk_…`), server-side only — never the app's public `appl_`/`goog_`/`test_` key */
  secretKey: string;
  /** `proj…`, the project every REST path is under */
  projectId: string;
  /** the exact `Authorization` header value the dashboard's webhook integration is configured with */
  webhookSecret: string;
};

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(
      `[subscription] ${name} is missing. RevenueCat is on because REVENUECAT_SECRET_KEY is set; ` +
        "unset it to run without store billing, or set this — see .env.example."
    );
  }
  return value;
}

/**
 * RevenueCat's Test Store keys. The sheet opens, the flow is real end to end and no money
 * ever moves — which is exactly what a simulator run wants, and exactly what production
 * must never be pointed at.
 */
export const TEST_STORE_PREFIX = "test_";

/**
 * The only reader of `process.env` for store billing, and the boot it fails.
 *
 * `REVENUECAT_SECRET_KEY` is the switch, as `STRIPE_SECRET_KEY` is for the web: unset,
 * there is no reader and no webhook, the two routes answer 503, and that is what mock mode,
 * the gates and a plain local stack run as. Set, the other two are required here, at boot,
 * rather than discovered by the first person trying to pay.
 *
 * A Test Store key in production is refused rather than warned about: it is the one
 * misconfiguration that looks like it works — every purchase succeeds, every entitlement is
 * granted, and nothing is ever charged.
 */
export function loadRevenueCatConfig(env: Env): RevenueCatConfig | null {
  const secretKey = env.REVENUECAT_SECRET_KEY?.trim();
  if (!secretKey) return null;
  if (secretKey.startsWith(TEST_STORE_PREFIX) && env.NODE_ENV === "production") {
    throw new Error(
      "[subscription] REVENUECAT_SECRET_KEY is a Test Store key (`test_…`) and NODE_ENV is production. " +
        "The Test Store grants every entitlement and charges nobody — use the project's real `sk_…` secret key."
    );
  }
  return {
    secretKey,
    projectId: required(env, "REVENUECAT_PROJECT_ID"),
    webhookSecret: required(env, "REVENUECAT_WEBHOOK_SECRET"),
  };
}

/**
 * Consumers depend on these tokens, never on a client this module built:
 * `constructor(@Inject(REVENUECAT) private readonly reader: CustomerReader | null) {}`.
 */

/** The config, or `null` when store billing is off. */
export const REVENUECAT_CONFIG = Symbol("REVENUECAT_CONFIG");

/** The customer reader over RevenueCat's REST API — `null` beside a `null` config. */
export const REVENUECAT = Symbol("REVENUECAT");
