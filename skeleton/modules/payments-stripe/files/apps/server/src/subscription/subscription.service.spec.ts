import { describe, expect, it, vi } from "vitest";
import {
  type SubscriptionRow,
  accessFrom,
  confirmCheckout,
  readSessionMetadata,
  reconcileCustomer,
  subscriptionAccess,
  updateFromStripe,
} from "./subscription.service";

const NOW = new Date("2030-06-01T00:00:00.000Z");
const LATER = new Date("2030-07-01T00:00:00.000Z");

const row = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  provider: "stripe",
  status: "active",
  plan: "annual",
  cancel_at_period_end: false,
  cancel_at: null,
  period_end: LATER,
  trial_start: null,
  trial_end: null,
  ...over,
});

describe("the access rows add up to", () => {
  it("is no subscription, and a trial still on offer, when there are no rows", () => {
    expect(accessFrom([], NOW)).toEqual({
      active: false,
      provider: null,
      status: null,
      plan: null,
      ending: false,
      endsAt: null,
      trialEligible: true,
    });
  });

  it("is the active row, whatever else is on file", () => {
    const access = accessFrom([row({ status: "canceled", plan: "monthly" }), row()], NOW);
    expect(access.active).toBe(true);
    expect(access.plan).toBe("annual");
    expect(access.provider).toBe("stripe");
  });

  // One table, every seller. The column is the only thing that says which one wrote a row,
  // and reporting it as this module's own would send a store buyer to Stripe's portal.
  it("reports whoever sold the row, not whoever is reading it", () => {
    expect(accessFrom([row({ provider: "revenuecat" })], NOW)).toMatchObject({
      active: true,
      provider: "revenuecat",
    });
  });

  it("reports the seller of the row it describes when none is active", () => {
    const access = accessFrom([row({ provider: "revenuecat", status: "canceled" })], NOW);
    expect(access.active).toBe(false);
    expect(access.provider).toBe("revenuecat");
  });

  // "Your plan is past due" is a sentence only the row can supply; `active` false is what
  // decides what they may use.
  it("describes the newest row when none is active, without granting access", () => {
    const access = accessFrom([row({ status: "past_due" })], NOW);
    expect(access.active).toBe(false);
    expect(access.status).toBe("past_due");
  });

  it("reads a cancellation in either of Stripe's shapes as ending, and dates it", () => {
    expect(accessFrom([row({ cancel_at_period_end: true })], NOW).ending).toBe(true);
    const scheduled = accessFrom([row({ cancel_at: LATER })], NOW);
    expect(scheduled.ending).toBe(true);
    expect(scheduled.endsAt).toEqual(LATER);
  });

  it("spends the trial for good — across plans and across subscriptions since ended", () => {
    expect(accessFrom([row({ status: "canceled", trial_end: NOW })], NOW).trialEligible).toBe(false);
    expect(accessFrom([row()], NOW).trialEligible).toBe(true);
  });

  it("reads one person's rows, newest first — `accessFrom` depends on the order", async () => {
    const findMany = vi.fn().mockResolvedValue([row()]);
    const access = await subscriptionAccess({ subscription: { findMany } }, "7");

    expect(findMany).toHaveBeenCalledWith({ where: { reference_id: "7" }, orderBy: { created_at: "desc" } });
    expect(access.active).toBe(true);
  });
});

describe("what Stripe says a settled checkout bought", () => {
  const subscription = {
    id: "sub_1",
    status: "trialing",
    customer: "cus_1",
    cancel_at_period_end: false,
    trial_start: 1_700_000_000,
    trial_end: 1_700_600_000,
    items: { data: [{ current_period_start: 1_700_000_000, current_period_end: 1_702_000_000 }] },
  };

  it("turns Stripe's seconds into dates and keeps its own status", () => {
    expect(updateFromStripe(subscription)).toMatchObject({
      status: "trialing",
      stripe_subscription_id: "sub_1",
      stripe_customer_id: "cus_1",
      period_start: new Date(1_700_000_000_000),
      period_end: new Date(1_702_000_000_000),
      trial_start: new Date(1_700_000_000_000),
      cancel_at_period_end: false,
      cancel_at: null,
    });
  });

  it("reads the customer whether Stripe sent an id or the expanded object", () => {
    expect(updateFromStripe({ ...subscription, customer: { id: "cus_2" } }).stripe_customer_id).toBe("cus_2");
    expect(updateFromStripe({ ...subscription, customer: null }).stripe_customer_id).toBeNull();
  });

  it("takes the local row and its owner off the plugin's own metadata, and nothing else", () => {
    expect(readSessionMetadata({ subscriptionId: "12", referenceId: "7" })).toEqual({
      subscriptionId: 12,
      referenceId: "7",
    });
    expect(readSessionMetadata({ subscriptionId: "nope" })).toEqual({ subscriptionId: null, referenceId: null });
    expect(readSessionMetadata(null)).toEqual({ subscriptionId: null, referenceId: null });
  });
});

describe("the checkout return", () => {
  const session = (over: Record<string, unknown> = {}) => ({
    metadata: { subscriptionId: "12", referenceId: "7" },
    subscription: {
      id: "sub_1",
      status: "active",
      customer: "cus_1",
      items: { data: [{ current_period_start: 1, current_period_end: 2 }] },
    },
    ...over,
  });

  const deps = (over: { session?: unknown; count?: number; rows?: SubscriptionRow[] } = {}) => {
    const updateMany = vi.fn().mockResolvedValue({ count: over.count ?? 1 });
    const findMany = vi.fn().mockResolvedValue(over.rows ?? [row()]);
    const retrieve = vi.fn().mockResolvedValue(over.session ?? session());
    return {
      updateMany,
      retrieve,
      deps: {
        db: { subscription: { findMany, updateMany } },
        stripe: { checkout: { sessions: { retrieve } } },
      } as never,
    };
  };

  it("settles the row from Stripe's own session, scoped to the caller", async () => {
    const { deps: d, updateMany, retrieve } = deps();

    await expect(confirmCheckout(d, "cs_1", "7")).resolves.toMatchObject({ confirmed: true });

    expect(retrieve).toHaveBeenCalledWith("cs_1", { expand: ["subscription"] });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 12, reference_id: "7" },
      data: expect.objectContaining({ stripe_subscription_id: "sub_1" }),
    });
  });

  // A session id somebody else's checkout produced must not write to their row.
  it("writes nothing for a session that belongs to someone else, and still answers honestly", async () => {
    const { deps: d, updateMany } = deps({
      session: session({ metadata: { subscriptionId: "12", referenceId: "9" } }),
    });

    await expect(confirmCheckout(d, "cs_1", "7")).resolves.toMatchObject({
      confirmed: false,
      access: { active: true },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("is not confirmed when Stripe knows of no subscription for the checkout", async () => {
    const { deps: d, updateMany } = deps({ session: session({ subscription: null }) });

    await expect(confirmCheckout(d, "cs_1", "7")).resolves.toMatchObject({ confirmed: false });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("is not confirmed when the row it names is not the caller's after all", async () => {
    const { deps: d } = deps({ count: 0 });
    await expect(confirmCheckout(d, "cs_1", "7")).resolves.toMatchObject({ confirmed: false });
  });
});

describe("the customer a row belongs to", () => {
  it("is corrected from the event that names it", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await reconcileCustomer(
      { subscription: { updateMany } },
      {
        stripeSubscriptionId: "sub_1",
        stripeCustomerId: "cus_2",
      }
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { stripe_subscription_id: "sub_1" },
      data: { stripe_customer_id: "cus_2" },
    });
  });
});
