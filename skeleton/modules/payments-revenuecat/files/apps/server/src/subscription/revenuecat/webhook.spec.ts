import { describe, expect, it, vi } from "vitest";
import { STORE_PROVIDER } from "@contracts/subscription/store-products";
import { noopTelemetry } from "../../common/ports/telemetry";
import { UNIQUE_VIOLATION } from "../event-trail";
import {
  RevenueCatWebhookBody,
  type StoreSubscriptionRow,
  UNKNOWN_PLAN,
  applyStoreUpdate,
  ingestRevenueCatEvent,
  revenueCatUserId,
  webhookRecord,
} from "./webhook";

const planOf = (productId: string): string | null => (productId === "annual" ? "annual" : null);

const AT = 1_700_000_000_000;

const body = (over: Record<string, unknown> = {}) =>
  RevenueCatWebhookBody.parse({
    api_version: "1.0",
    event: {
      id: "evt_1",
      type: "INITIAL_PURCHASE",
      app_user_id: "7",
      product_id: "annual",
      store: "APP_STORE",
      original_transaction_id: "t1",
      purchased_at_ms: AT,
      expiration_at_ms: AT + 86_400_000,
      event_timestamp_ms: AT,
      ...over,
    },
  });

const io = (row: StoreSubscriptionRow | null = null, over: { duplicate?: boolean } = {}) => ({
  subscription: {
    findFirst: vi.fn().mockResolvedValue(row),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    create: vi.fn().mockResolvedValue({ id: 12, reference_id: "7", stripe_subscription_id: "t1" }),
  },
  webhook_event: {
    create: over.duplicate
      ? vi.fn().mockRejectedValue(Object.assign(new Error("unique"), { code: UNIQUE_VIOLATION }))
      : vi.fn().mockResolvedValue({}),
  },
});

const deps = (store: ReturnType<typeof io>) => ({ io: store, planOf, telemetry: noopTelemetry });

describe("who an event is about", () => {
  it("takes the app user id the app signed in with", () => {
    expect(revenueCatUserId({ app_user_id: "7" })).toBe("7");
  });

  it("falls back to an alias when RevenueCat has merged ids since", () => {
    expect(revenueCatUserId({ app_user_id: "$RCAnonymousID:abc", aliases: ["$RCAnonymousID:abc", "7"] })).toBe("7");
  });

  // The app identifies before the paywall, so a purchase under an anonymous id is a bug to
  // see in the trail, not a row to invent.
  it("is nobody when only RevenueCat's own ids are on the event", () => {
    expect(revenueCatUserId({ app_user_id: "$RCAnonymousID:abc" })).toBeNull();
    expect(revenueCatUserId({})).toBeNull();
  });
});

describe("the trail row a delivery leaves", () => {
  it("files it under the store provider, keyed by the event's own id", () => {
    expect(webhookRecord(body())).toMatchObject({
      provider: "revenuecat",
      provider_event_id: "evt_1",
      provider_event_type: "INITIAL_PURCHASE",
      subscription_id: "t1",
      event_occurred_at: new Date(AT),
    });
  });

  it("keeps the whole delivery as the payload — the first question of a billing incident", () => {
    expect(webhookRecord(body()).payload).toEqual(body());
  });
});

describe("writing the update onto a row", () => {
  it("updates the row they already own, scoped to their own reference id", async () => {
    const store = io({ id: 12, reference_id: "7", stripe_subscription_id: "t1" });

    await expect(
      applyStoreUpdate(store, "7", { status: "active" }, { id: 12, reference_id: "7", stripe_subscription_id: "t1" })
    ).resolves.toBe("updated");
    expect(store.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: 12, reference_id: "7" },
      data: { status: "active" },
    });
  });

  it("opens a row only for something that says what the subscription now is", async () => {
    const store = io();

    await expect(applyStoreUpdate(store, "7", { period_end: new Date(AT) }, null)).resolves.toBe("nothing");
    expect(store.subscription.create).not.toHaveBeenCalled();

    await expect(applyStoreUpdate(store, "7", { status: "active", plan: "annual" }, null)).resolves.toBe("created");
    expect(store.subscription.create).toHaveBeenCalledWith({
      data: { reference_id: "7", plan: "annual", status: "active", provider: STORE_PROVIDER },
    });
  });

  // A row this module opens is a store row by construction. Without the stamp the column
  // falls back to its `stripe` default and the web offers Stripe's billing portal for a
  // subscription Apple is billing.
  it("names the store as the seller on any row it opens, patch or no patch", async () => {
    const store = io();

    // the webhook's purchase, which carries the provider itself
    await applyStoreUpdate(store, "7", { status: "active", provider: STORE_PROVIDER }, null);
    // the confirm path's REST read, which does not
    await applyStoreUpdate(store, "7", { status: "active" }, null);

    for (const call of store.subscription.create.mock.calls) {
      expect(call[0].data.provider).toBe(STORE_PROVIDER);
    }
  });

  // Restamping would let a cancellation claim a row whose seller is already settled.
  it("never writes the seller on a row it only updates", async () => {
    const store = io({ id: 12, reference_id: "7", stripe_subscription_id: "t1" });

    await applyStoreUpdate(
      store,
      "7",
      { status: "canceled", ended_at: new Date(AT) },
      {
        id: 12,
        reference_id: "7",
        stripe_subscription_id: "t1",
      }
    );

    expect(store.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: 12, reference_id: "7" },
      data: expect.not.objectContaining({ provider: expect.anything() }),
    });
  });

  // `plan` is NOT NULL and the plugin's list endpoint lower-cases every row's before
  // filtering, so a product this app cannot name still gets a plan it can print.
  it("names a plan for a product the map does not know", async () => {
    const store = io();

    await applyStoreUpdate(store, "7", { status: "active" }, null);

    expect(store.subscription.create).toHaveBeenCalledWith({
      data: { reference_id: "7", plan: UNKNOWN_PLAN, status: "active", provider: STORE_PROVIDER },
    });
  });

  it("writes nothing for an event that mapped to nothing", async () => {
    const store = io();

    await expect(applyStoreUpdate(store, "7", null, null)).resolves.toBe("nothing");
    expect(store.subscription.updateMany).not.toHaveBeenCalled();
  });
});

describe("one delivery", () => {
  it("opens the first row for a purchase, in the store's name", async () => {
    const store = io();

    await expect(ingestRevenueCatEvent(deps(store), body())).resolves.toEqual({ outcome: "created" });
    expect(store.subscription.create).toHaveBeenCalledOnce();
    expect(store.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ provider: STORE_PROVIDER }),
    });
  });

  // RevenueCat retries with the same event id; a purchase replayed after a cancellation
  // would reopen it. The unique index decides it, before anything is written.
  it("does nothing at all for a redelivery", async () => {
    const store = io(null, { duplicate: true });

    await expect(ingestRevenueCatEvent(deps(store), body())).resolves.toEqual({ outcome: "duplicate" });
    expect(store.subscription.create).not.toHaveBeenCalled();
    expect(store.subscription.updateMany).not.toHaveBeenCalled();
  });

  it("records the dashboard's TEST event and writes no subscription", async () => {
    const store = io();

    await expect(ingestRevenueCatEvent(deps(store), body({ type: "TEST" }))).resolves.toEqual({ outcome: "test" });
    expect(store.webhook_event.create).toHaveBeenCalledOnce();
    expect(store.subscription.create).not.toHaveBeenCalled();
  });

  it("ends the losing side of a transfer and leaves the receiving account to its own confirm", async () => {
    const store = io({ id: 12, reference_id: "3", stripe_subscription_id: "t1" });

    await expect(
      ingestRevenueCatEvent(
        deps(store),
        body({ type: "TRANSFER", app_user_id: null, transferred_from: ["3"], transferred_to: ["7"] })
      )
    ).resolves.toEqual({ outcome: "transferred" });
    expect(store.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: 12, reference_id: "3" },
      data: expect.objectContaining({ status: "canceled", stripe_subscription_id: null }),
    });
  });

  it("writes nothing for a delivery that names nobody this server knows", async () => {
    const store = io();

    await expect(ingestRevenueCatEvent(deps(store), body({ app_user_id: "$RCAnonymousID:abc" }))).resolves.toEqual({
      outcome: "no-user",
    });
    expect(store.subscription.create).not.toHaveBeenCalled();
  });

  it("scopes a later ending to the transaction the row is actually on", async () => {
    const store = io({ id: 12, reference_id: "7", stripe_subscription_id: "t2" });

    await expect(ingestRevenueCatEvent(deps(store), body({ type: "EXPIRATION" }))).resolves.toEqual({
      outcome: "nothing",
    });
    expect(store.subscription.updateMany).not.toHaveBeenCalled();
  });
});
