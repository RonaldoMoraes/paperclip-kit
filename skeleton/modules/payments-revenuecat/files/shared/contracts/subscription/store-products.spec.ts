import { describe, expect, it } from "vitest";
import { PLANS } from "./checkout";
import {
  ENTITLEMENT_ID,
  RETIRED_STORE_PRODUCT_IDS,
  STORE_PRODUCT_IDS,
  STORE_PROVIDER,
  planOfPackage,
  planOfStoreProduct,
} from "./store-products";

describe("what the stores sell", () => {
  it("sells exactly the plans the web sells — one vocabulary, two sellers", () => {
    expect(Object.keys(STORE_PRODUCT_IDS).sort()).toEqual([...PLANS].sort());
  });

  it("maps a current product id back to its plan", () => {
    for (const plan of PLANS) expect(planOfStoreProduct(STORE_PRODUCT_IDS[plan])).toBe(plan);
  });

  // A row keeps the product it was bought under: an id pulled from every offering still
  // renews for everyone already on it, and still has to name a plan.
  it("keeps mapping an id that was retired", () => {
    for (const plan of PLANS) {
      for (const id of RETIRED_STORE_PRODUCT_IDS[plan]) expect(planOfStoreProduct(id)).toBe(plan);
    }
  });

  it("says nothing rather than guessing for a product this app does not sell", () => {
    expect(planOfStoreProduct("something_else")).toBeNull();
  });

  it("reads the plan off RevenueCat's own package identifiers", () => {
    expect(planOfPackage("$rc_monthly")).toBe("monthly");
    expect(planOfPackage("$rc_annual")).toBe("annual");
    expect(planOfPackage("$rc_weekly")).toBeNull();
  });

  it("names one entitlement and one store provider", () => {
    expect(ENTITLEMENT_ID).toBeTruthy();
    expect(STORE_PROVIDER).toBe("revenuecat");
  });
});
