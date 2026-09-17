import { PLANS, type PlanName } from "./checkout";

/**
 * What this app sells on the phone, as the stores and RevenueCat name it.
 *
 * On the web a plan is a Stripe price the server holds; on the phone it is a *product* the
 * store holds, created by hand in App Store Connect and Play Console and gathered into one
 * RevenueCat offering. So the plan names stay the two `payments-stripe` already sells
 * (`monthly`, `annual`) and this file is the map between them and the ids the stores use.
 *
 * The ids below are placeholders — every product replaces them with the ones it actually
 * created. Both stores restrict the alphabet to `[a-z0-9_.]`, so a hyphenated product slug
 * cannot be used verbatim; pick ids and never change them, because a row keeps the product
 * it was bought under and an id retired from every offering still has to map to its plan.
 */

/** Who sold it, in the `provider` column's vocabulary — the store's counterpart of `STRIPE_PROVIDER`. */
export const STORE_PROVIDER = "revenuecat";

/**
 * The entitlement every product unlocks: the key under `customerInfo.entitlements.active`
 * in the SDK, and the entitlement attached to both products in the RevenueCat dashboard.
 * One id, because this module sells one thing — rename it to whatever the dashboard says.
 */
export const ENTITLEMENT_ID = "premium";

/** The store product id currently sold for each plan. Replace with the ids the stores hold. */
export const STORE_PRODUCT_IDS: Record<PlanName, string> = {
  monthly: "monthly",
  annual: "annual",
};

/**
 * Every id ever sold under each plan, beyond the current one.
 *
 * A product replaced by a differently priced one is pulled from the offering and keeps
 * renewing for everybody who already bought it; its id lands here so their rows keep
 * naming the plan they are on.
 */
export const RETIRED_STORE_PRODUCT_IDS: Record<PlanName, readonly string[]> = {
  monthly: [],
  annual: [],
};

/** The plan a store product sells, or null for a product this app does not sell. */
export function planOfStoreProduct(productId: string): PlanName | null {
  return (
    PLANS.find(
      (plan) => STORE_PRODUCT_IDS[plan] === productId || RETIRED_STORE_PRODUCT_IDS[plan].includes(productId)
    ) ?? null
  );
}

/**
 * RevenueCat's own package identifiers → the plan each sells.
 *
 * `$rc_monthly` and `$rc_annual` are the convention's names, not this product's: an
 * offering built from the dashboard's standard durations carries them, and a paywall reads
 * the plan off the package rather than off the product id it happens to hold today.
 */
const PACKAGE_PLANS: Record<string, PlanName> = { $rc_monthly: "monthly", $rc_annual: "annual" };

export function planOfPackage(packageIdentifier: string): PlanName | null {
  return PACKAGE_PLANS[packageIdentifier] ?? null;
}
