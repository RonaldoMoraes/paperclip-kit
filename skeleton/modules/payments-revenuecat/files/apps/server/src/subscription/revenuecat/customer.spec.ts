import { describe, expect, it } from "vitest";
import type { RevenueCatSubscription } from "./client";
import { currentSubscription, updateFromCustomer } from "./customer";

const planOf = (productId: string): string | null => (productId === "annual" ? "annual" : null);

const STARTS = 1_700_000_000_000;
const ENDS = 1_702_000_000_000;

const subscription = (over: Partial<RevenueCatSubscription> = {}): RevenueCatSubscription => ({
  id: "sub_1",
  product_id: "prod_1",
  store: "app_store",
  status: "active",
  auto_renewal_status: "will_renew",
  gives_access: true,
  starts_at: STARTS,
  current_period_starts_at: STARTS,
  current_period_ends_at: ENDS,
  store_subscription_identifier: "t9",
  ...over,
});

describe("which subscription describes the customer", () => {
  it("takes the one giving access wherever it sits", () => {
    const live = subscription({ id: "sub_live" });
    const dead = subscription({ id: "sub_dead", gives_access: false, current_period_starts_at: STARTS + 1 });

    expect(currentSubscription([dead, live])?.id).toBe("sub_live");
  });

  it("falls back to the one whose period started last", () => {
    const older = subscription({ id: "old", gives_access: false, current_period_starts_at: STARTS });
    const newer = subscription({ id: "new", gives_access: false, current_period_starts_at: STARTS + 1 });

    expect(currentSubscription([older, newer])?.id).toBe("new");
  });

  it("says nothing for a customer with none", () => {
    expect(currentSubscription([])).toBeNull();
  });
});

describe("what a read writes", () => {
  it("keeps Stripe's words for the status the store's verdict implies", () => {
    expect(updateFromCustomer(subscription(), "annual", planOf).status).toBe("active");
    expect(updateFromCustomer(subscription({ status: "trialing" }), "annual", planOf).status).toBe("trialing");
    // `gives_access` wins: a billing retry the store no longer honours is not access.
    expect(updateFromCustomer(subscription({ gives_access: false }), "annual", planOf).status).toBe("canceled");
    expect(updateFromCustomer(subscription({ gives_access: false, status: "paused" }), "annual", planOf).status).toBe(
      "paused"
    );
  });

  it("writes the plan behind the store's product, the period, and clears Stripe's customer", () => {
    expect(updateFromCustomer(subscription(), "annual", planOf)).toMatchObject({
      plan: "annual",
      stripe_customer_id: null,
      period_start: new Date(STARTS),
      period_end: new Date(ENDS),
      ended_at: null,
    });
  });

  // REST's `store_subscription_identifier` is the *latest* transaction's id and changes on
  // every renewal; the webhook owns that column, and every later ending is scoped to it.
  it("never writes the subscription id — that column has one writer, the webhook", () => {
    expect(updateFromCustomer(subscription(), "annual", planOf)).not.toHaveProperty("stripe_subscription_id");
  });

  it("dates the trial only while it is one", () => {
    expect(updateFromCustomer(subscription({ status: "trialing" }), "annual", planOf)).toMatchObject({
      trial_start: new Date(STARTS),
      trial_end: new Date(ENDS),
    });
    expect(updateFromCustomer(subscription(), "annual", planOf)).not.toHaveProperty("trial_start");
  });

  it("reads a subscription that will not renew as ending, and one that has as ended", () => {
    expect(updateFromCustomer(subscription({ auto_renewal_status: "will_not_renew" }), "annual", planOf)).toMatchObject(
      { cancel_at_period_end: true, ended_at: null }
    );
    expect(updateFromCustomer(subscription({ gives_access: false }), "annual", planOf)).toMatchObject({
      cancel_at_period_end: false,
      ended_at: new Date(ENDS),
    });
  });

  it("leaves the plan alone for a product the map does not know", () => {
    expect(updateFromCustomer(subscription(), "quarterly", planOf)).not.toHaveProperty("plan");
    expect(updateFromCustomer(subscription({ product_id: null }), null, planOf)).not.toHaveProperty("plan");
  });
});
