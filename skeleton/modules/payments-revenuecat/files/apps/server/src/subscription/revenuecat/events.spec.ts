import { describe, expect, it } from "vitest";
import { accessFrom } from "../subscription.service";
import { type RevenueCatEvent, planColumn, transferOut, updateFromRevenueCat } from "./events";

const planOf = (productId: string): string | null => (productId === "annual" ? "annual" : null);

const PURCHASED = 1_700_000_000_000;
const EXPIRES = 1_702_000_000_000;

const event = (over: Partial<RevenueCatEvent> = {}): RevenueCatEvent => ({
  type: "INITIAL_PURCHASE",
  product_id: "annual",
  store: "APP_STORE",
  original_transaction_id: "t1",
  purchased_at_ms: PURCHASED,
  expiration_at_ms: EXPIRES,
  event_timestamp_ms: PURCHASED,
  ...over,
});

describe("a purchase", () => {
  it("writes the plan, the period and the store's transaction id, and clears Stripe's customer", () => {
    expect(updateFromRevenueCat(event(), planOf)).toEqual({
      provider: "revenuecat",
      status: "active",
      plan: "annual",
      stripe_customer_id: null,
      stripe_subscription_id: "t1",
      period_start: new Date(PURCHASED),
      period_end: new Date(EXPIRES),
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
    });
  });

  // The row is `NOT NULL` on `plan`, and the plugin's list endpoint lower-cases every row's
  // before filtering — so a product this app cannot name leaves the column alone.
  it("leaves the plan column out for a product this app does not sell", () => {
    expect(updateFromRevenueCat(event({ product_id: "quarterly" }), planOf)).not.toHaveProperty("plan");
    expect(planColumn(null)).toEqual({});
  });

  // The column the web reads to decide where a plan can be managed. A purchase is the moment
  // a row becomes the store's, so this is where it is stamped.
  it("names the store as the seller", () => {
    expect(updateFromRevenueCat(event(), planOf)).toMatchObject({ provider: "revenuecat" });
    expect(updateFromRevenueCat(event({ type: "RENEWAL" }), planOf)).toMatchObject({ provider: "revenuecat" });
  });

  it("records a free trial as trialing, and dates the trial by the period it bought", () => {
    const update = updateFromRevenueCat(event({ period_type: "TRIAL" }), planOf);

    expect(update).toMatchObject({
      status: "trialing",
      trial_start: new Date(PURCHASED),
      trial_end: new Date(EXPIRES),
    });
  });

  // The trial dates are what `hasEverTrialed` reads; a renewal that cleared them would hand
  // out a second free week.
  it("does not touch the trial dates on a renewal", () => {
    const update = updateFromRevenueCat(event({ type: "RENEWAL" }), planOf);

    expect(update).toMatchObject({ status: "active" });
    expect(update).not.toHaveProperty("trial_start");
    expect(update).not.toHaveProperty("trial_end");
  });
});

describe("an ending", () => {
  it("reads an ordinary cancellation as still-paid-for, ending at the period end", () => {
    expect(updateFromRevenueCat(event({ type: "CANCELLATION" }), planOf)).toEqual({
      cancel_at_period_end: true,
      canceled_at: new Date(PURCHASED),
      period_end: new Date(EXPIRES),
    });
  });

  // A refund is the one cancellation that takes access away now.
  it("ends a refund immediately", () => {
    const update = updateFromRevenueCat(event({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" }), planOf);

    expect(update).toMatchObject({ status: "canceled", ended_at: new Date(PURCHASED) });
  });

  it("takes an ending back on an uncancellation", () => {
    expect(updateFromRevenueCat(event({ type: "UNCANCELLATION" }), planOf)).toMatchObject({
      cancel_at_period_end: false,
      canceled_at: null,
    });
  });

  it("keeps a paused subscription apart from a cancelled one", () => {
    expect(
      updateFromRevenueCat(event({ type: "EXPIRATION", expiration_reason: "SUBSCRIPTION_PAUSED" }), planOf)
    ).toMatchObject({ status: "paused" });
    expect(updateFromRevenueCat(event({ type: "EXPIRATION" }), planOf)).toMatchObject({ status: "canceled" });
  });

  // The store keeps them entitled through a billing retry; only its EXPIRATION ends access.
  it("extends the period to the grace period on a billing issue and changes nothing else", () => {
    const grace = EXPIRES + 3 * 86_400_000;

    expect(
      updateFromRevenueCat(event({ type: "BILLING_ISSUE", grace_period_expiration_at_ms: grace }), planOf)
    ).toEqual({ period_end: new Date(grace) });
    expect(updateFromRevenueCat(event({ type: "BILLING_ISSUE" }), planOf)).toBeNull();
  });
});

describe("who sold the row", () => {
  // Restamping on a cancellation would be this module claiming a row on the strength of an
  // event about a subscription that already has a seller — and a web-sold row that a store
  // event happens to patch correctly goes on saying `stripe`, because Stripe is still
  // billing it.
  it("leaves the seller alone on every event that is not a purchase", () => {
    for (const type of ["CANCELLATION", "UNCANCELLATION", "SUBSCRIPTION_PAUSED", "EXPIRATION"]) {
      expect(updateFromRevenueCat(event({ type }), planOf)).not.toHaveProperty("provider");
    }
    expect(
      updateFromRevenueCat(event({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" }), planOf)
    ).not.toHaveProperty("provider");
    expect(transferOut(new Date(PURCHASED))).not.toHaveProperty("provider");
  });
});

describe("which subscription an event is about", () => {
  // A Play product change is a new purchase token, and the old token's CANCELLATION and
  // EXPIRATION can arrive after the new INITIAL_PURCHASE.
  it("ignores a non-purchase event for a transaction the row has moved on from", () => {
    expect(updateFromRevenueCat(event({ type: "EXPIRATION" }), planOf, { stripe_subscription_id: "t2" })).toBeNull();
  });

  it("still lets a purchase land, whatever the row held", () => {
    expect(updateFromRevenueCat(event(), planOf, { stripe_subscription_id: "t2" })).toMatchObject({
      stripe_subscription_id: "t1",
    });
  });

  it("says nothing about an event type it does not map", () => {
    expect(updateFromRevenueCat(event({ type: "PRODUCT_CHANGE" }), planOf)).toBeNull();
  });
});

describe("one vocabulary, two sellers", () => {
  // The whole point of this file: what a store event writes is read by the predicate
  // payments-stripe already ships, with nothing added to it.
  it("writes columns the Stripe access predicate reads without being taught a second seller", () => {
    const update = updateFromRevenueCat(event({ period_type: "TRIAL" }), planOf);
    const row = {
      provider: update?.provider ?? "stripe",
      status: update?.status ?? null,
      plan: update?.plan ?? null,
      cancel_at_period_end: update?.cancel_at_period_end ?? false,
      cancel_at: null,
      period_end: update?.period_end ?? null,
      trial_start: update?.trial_start ?? null,
      trial_end: update?.trial_end ?? null,
    };

    expect(accessFrom([row])).toMatchObject({
      active: true,
      // What the web reads to say "manage it where you bought it".
      provider: "revenuecat",
      status: "trialing",
      plan: "annual",
      trialEligible: false,
    });
  });
});

describe("a transfer", () => {
  it("ends the losing row now and releases its transaction id for the receiving account", () => {
    const at = new Date(PURCHASED);

    expect(transferOut(at)).toEqual({
      status: "canceled",
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: at,
      ended_at: at,
      stripe_subscription_id: null,
    });
  });
});
