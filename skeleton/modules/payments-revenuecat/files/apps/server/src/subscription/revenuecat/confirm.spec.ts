import { describe, expect, it, vi } from "vitest";
import { noopTelemetry } from "../../common/ports/telemetry";
import type { RevenueCatSubscription } from "./client";
import { confirmStorePurchase } from "./confirm";

const planOf = (productId: string): string | null => (productId === "annual" ? "annual" : null);

const STARTS = 1_700_000_000_000;
const ENDS = STARTS + 365 * 86_400_000;

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

// The rows `accessFrom` reads back after the write; the store's row is a `subscription` row
// like any other, which is the whole point.
const rows = (over: Partial<{ status: string; plan: string; provider: string }> = {}) => [
  {
    provider: over.provider ?? "revenuecat",
    status: over.status ?? "active",
    plan: over.plan ?? "annual",
    cancel_at_period_end: false,
    cancel_at: null,
    period_end: new Date(ENDS),
    trial_start: null,
    trial_end: null,
  },
];

const setup = (over: { subscriptions?: RevenueCatSubscription[]; found?: unknown } = {}) => {
  const db = { subscription: { findMany: vi.fn().mockResolvedValue(rows()) } };
  const io = {
    subscription: {
      findFirst: vi.fn().mockResolvedValue(over.found ?? null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ id: 12, reference_id: "7", stripe_subscription_id: null }),
    },
  };
  const reader = {
    subscriptions: vi.fn().mockResolvedValue(over.subscriptions ?? [subscription()]),
    storeProductOf: vi.fn().mockResolvedValue("annual"),
  };
  return { db, io, reader, deps: { db, io, reader, planOf, telemetry: noopTelemetry } };
};

describe("confirming a store purchase", () => {
  // The server reads RevenueCat; the device's claim is never the proof.
  it("reads RevenueCat for the signed-in caller and writes what it says onto their row", async () => {
    const { deps, io, reader } = setup();

    await expect(confirmStorePurchase(deps as never, "7", "annual")).resolves.toEqual({
      confirmed: true,
      access: expect.objectContaining({ active: true, plan: "annual" }),
    });
    expect(reader.subscriptions).toHaveBeenCalledWith("7");
    expect(io.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reference_id: "7", plan: "annual", status: "active" }),
    });
  });

  // A purchase confirmed before its webhook lands opens the row through this path. Without
  // the stamp the column falls back to its `stripe` default and the web offers Stripe's
  // billing portal for a subscription Apple is billing.
  it("names the store as the seller on a row it opens, and answers with it", async () => {
    const { deps, io } = setup();

    const settled = await confirmStorePurchase(deps as never, "7", "annual");

    expect(io.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ provider: "revenuecat" }),
    });
    expect(settled.access.provider).toBe("revenuecat");
  });

  // The REST read describes a subscription that already has a seller; only a purchase says
  // who that is.
  it("leaves the seller alone on a row it only brings up to date", async () => {
    const { deps, io } = setup({ found: { id: 12, reference_id: "7", stripe_subscription_id: "t1" } });

    await confirmStorePurchase(deps as never, "7", "annual");

    expect(io.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: 12, reference_id: "7" },
      data: expect.not.objectContaining({ provider: expect.anything() }),
    });
  });

  it("brings an existing row up to date instead of opening a second one", async () => {
    const { deps, io } = setup({ found: { id: 12, reference_id: "7", stripe_subscription_id: "t1" } });

    await confirmStorePurchase(deps as never, "7", "annual");

    expect(io.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: 12, reference_id: "7" },
      data: expect.objectContaining({ status: "active" }),
    });
    expect(io.subscription.create).not.toHaveBeenCalled();
  });

  // Not a failure: it is the honest answer to "did I buy something", and their own access
  // still comes back with it.
  it("answers unconfirmed, with their access, when RevenueCat holds nothing", async () => {
    const { deps, io } = setup({ subscriptions: [] });

    await expect(confirmStorePurchase(deps as never, "7", null)).resolves.toMatchObject({ confirmed: false });
    expect(io.subscription.create).not.toHaveBeenCalled();
  });

  // What is held is RevenueCat's to say; the app's claim is counted, not obeyed.
  it("counts a disagreement with the device and writes RevenueCat's product anyway", async () => {
    const { deps, io } = setup();
    const telemetry = { captureError: vi.fn(), log: vi.fn(), event: vi.fn() };

    await confirmStorePurchase({ ...deps, telemetry } as never, "7", "monthly");

    expect(telemetry.event).toHaveBeenCalledWith(
      "subscription.store.claim-mismatch",
      expect.objectContaining({ claimedProductId: "monthly", storeProductId: "annual" })
    );
    expect(io.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ plan: "annual" }),
    });
  });

  // The same customer reconciles to the same row — which is what makes it the right call
  // after "Restore purchases" too.
  it("answers with the access the session carries, from the same function", async () => {
    const { deps, db } = setup();

    const first = await confirmStorePurchase(deps as never, "7", "annual");
    const second = await confirmStorePurchase(deps as never, "7", "annual");

    expect(second.access).toEqual(first.access);
    expect(db.subscription.findMany).toHaveBeenCalledWith({
      where: { reference_id: "7" },
      orderBy: { created_at: "desc" },
    });
  });
});
