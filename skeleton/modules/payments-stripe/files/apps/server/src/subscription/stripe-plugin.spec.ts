import { describe, expect, it, vi } from "vitest";
import {
  STRIPE_WEBHOOK_PATH,
  checkoutSuccessUrl,
  customerFromEvent,
  onStripeEvent,
  stripePlugins,
} from "./stripe-plugin";

const config = {
  secretKey: "sk_test_1",
  webhookSecret: "whsec_1",
  priceMonthly: "price_m",
  priceAnnual: "price_a",
  portalConfiguration: null,
};

describe("the plugins Better Auth is built with", () => {
  it("is nothing at all when billing is off — inert, not broken", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(stripePlugins({ config: null, client: null, baseURL: "http://localhost:5173", db: {} as never })).toEqual(
      []
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("is this module's two rules and then Stripe, in that order", () => {
    const plugins = stripePlugins({
      config,
      client: {} as never,
      baseURL: "http://localhost:5173",
      db: {} as never,
    });
    expect(plugins.map((plugin) => plugin.id)).toEqual([
      "subscription-customer-link",
      "subscription-sold-here",
      "stripe",
    ]);
  });

  // The path in `module.json`'s rawBodyPaths has to be the one the plugin really serves,
  // under Better Auth's own `/api/auth` root — a guess here is every webhook rejected.
  it("names the webhook path the raw-body list must carry", () => {
    expect(STRIPE_WEBHOOK_PATH).toBe("/api/auth/stripe/webhook");
  });
});

describe("where Stripe sends the browser back", () => {
  it("carries the Checkout Session id, which is what the confirm settles from", () => {
    expect(checkoutSuccessUrl(new URL("http://localhost:5173/"))).toBe(
      "http://localhost:5173/checkout/return?sessionId={CHECKOUT_SESSION_ID}"
    );
  });

  it("never doubles the slash a base URL ends in", () => {
    expect(checkoutSuccessUrl("http://localhost:5173/")).not.toContain("//checkout");
  });
});

describe("what a delivery leaves behind", () => {
  const event = (type: string, object: unknown) => ({ id: "evt_1", type, created: 1_700_000_000, data: { object } });

  it("names the customer a subscription event is about", () => {
    expect(customerFromEvent(event("customer.subscription.updated", { id: "sub_1", customer: "cus_1" }))).toEqual({
      stripeSubscriptionId: "sub_1",
      stripeCustomerId: "cus_1",
    });
  });

  it("names nothing for an event that is not about a subscription", () => {
    expect(customerFromEvent(event("invoice.paid", { id: "in_1", customer: "cus_1" }))).toBeNull();
    expect(customerFromEvent(event("customer.subscription.updated", { id: "sub_1" }))).toBeNull();
  });

  it("records the event and corrects the row's customer", async () => {
    const create = vi.fn().mockResolvedValue({});
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });

    await onStripeEvent({ webhook_event: { create }, subscription: { updateMany } })(
      event("customer.subscription.updated", { id: "sub_1", customer: "cus_2" })
    );

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ provider_event_id: "evt_1" }) });
    expect(updateMany).toHaveBeenCalledWith({
      where: { stripe_subscription_id: "sub_1" },
      data: { stripe_customer_id: "cus_2" },
    });
  });

  // Stripe reads a non-2xx as "send it again"; a trail we could not write is not a reason
  // to have the same event replayed forever.
  it("never fails the webhook over its own bookkeeping", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const db = {
      webhook_event: { create: vi.fn().mockRejectedValue(new Error("down")) },
      subscription: { updateMany: vi.fn().mockRejectedValue(new Error("down")) },
    };

    await expect(
      onStripeEvent(db)(event("customer.subscription.updated", { id: "sub_1", customer: "cus_2" }))
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
