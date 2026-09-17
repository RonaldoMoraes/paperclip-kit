import { describe, expect, it } from "vitest";
import { loadStripeConfig } from "./subscription.config";

const ON = {
  STRIPE_SECRET_KEY: "sk_test_1",
  STRIPE_WEBHOOK_SECRET: "whsec_1",
  STRIPE_PRICE_MONTHLY: "price_m",
  STRIPE_PRICE_ANNUAL: "price_a",
};

describe("the billing switch", () => {
  it("is off with no secret key, and off is not an error", () => {
    expect(loadStripeConfig({})).toBeNull();
    expect(loadStripeConfig({ STRIPE_SECRET_KEY: "   " })).toBeNull();
  });

  it("reads the whole configuration once the key is set", () => {
    expect(loadStripeConfig({ ...ON, STRIPE_PORTAL_CONFIGURATION: "bpc_1" })).toEqual({
      secretKey: "sk_test_1",
      webhookSecret: "whsec_1",
      priceMonthly: "price_m",
      priceAnnual: "price_a",
      portalConfiguration: "bpc_1",
    });
  });

  // Stripe opens the account's default portal without one, which is a working page.
  it("leaves the portal configuration optional", () => {
    expect(loadStripeConfig(ON)?.portalConfiguration).toBeNull();
  });

  it("fails the boot naming whichever key is missing, not the first person to pay", () => {
    for (const missing of ["STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_MONTHLY", "STRIPE_PRICE_ANNUAL"]) {
      expect(() => loadStripeConfig({ ...ON, [missing]: "" })).toThrow(missing);
    }
  });
});
