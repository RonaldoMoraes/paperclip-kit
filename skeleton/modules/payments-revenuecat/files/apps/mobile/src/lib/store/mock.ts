import { PLANS, type PlanName } from "@contracts/subscription/checkout";
import { STORE_PRODUCT_IDS } from "@contracts/subscription/store-products";
import type { PurchaseOutcome, Store, StoreOffering, StorePackage } from "./types";

/**
 * Mock mode's store: no SDK, no store account, no sheet. The offering is canned, priced the
 * way a store would quote it, and a purchase "succeeds" at once.
 *
 * What that purchase then earns is still the mocked server's to say, through
 * `confirmStorePurchase` — the mock endpoint writes the same ledger the web's mocked
 * checkout writes. So the mocked journey exercises the real one: paywall → store → server →
 * session → gate, with nothing but the store replaced.
 */

/** Placeholder figures, in the shape the store hands them over. Replace with the product's own. */
const PRICES: Record<PlanName, { price: number; priceString: string }> = {
  monthly: { price: 9.99, priceString: "$9.99" },
  annual: { price: 79.99, priceString: "$79.99" },
};

/** RevenueCat's own package identifiers, which is what a dashboard offering carries. */
const PACKAGE_IDENTIFIER: Record<PlanName, string> = { monthly: "$rc_monthly", annual: "$rc_annual" };

export function mockOffering(): StoreOffering {
  const pkg = (plan: PlanName): StorePackage => ({
    identifier: PACKAGE_IDENTIFIER[plan],
    plan,
    storeProductId: STORE_PRODUCT_IDS[plan],
    ...PRICES[plan],
    intro: null,
  });
  return { identifier: "default", packages: PLANS.map(pkg) };
}

let customer: string | null = null;

/** Who the mock store thinks the customer is. For a spec, and for nothing else. */
export function mockStoreCustomer(): string | null {
  return customer;
}

export const mockStore: Store = {
  async identify(who) {
    customer = who.id;
  },
  async forget() {
    customer = null;
  },
  async offering() {
    return mockOffering();
  },
  async purchase(pkg): Promise<PurchaseOutcome> {
    console.info(`[mock] store purchase ${pkg.storeProductId} for ${customer ?? "an anonymous customer"}`);
    return { kind: "purchased", storeProductId: pkg.storeProductId };
  },
  async restore() {
    console.info("[mock] store restore");
  },
};
