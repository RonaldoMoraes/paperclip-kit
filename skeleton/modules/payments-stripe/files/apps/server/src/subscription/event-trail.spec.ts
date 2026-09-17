import { describe, expect, it, vi } from "vitest";
import { UNIQUE_VIOLATION, eventRecord, recordEvent, subscriptionIdOf } from "./event-trail";

const event = (over: Partial<{ id: string; type: string; created: number; object: unknown }> = {}) => ({
  id: over.id ?? "evt_1",
  type: over.type ?? "customer.subscription.updated",
  created: over.created ?? 1_700_000_000,
  data: { object: over.object ?? { id: "sub_1", customer: "cus_1" } },
});

const writer = (create: () => Promise<unknown>) => ({ webhook_event: { create } });

describe("what an event is about", () => {
  it("takes the subscription's own id from a subscription event", () => {
    expect(subscriptionIdOf(event())).toBe("sub_1");
  });

  it("takes the invoice's subscription from anything else that names one", () => {
    expect(subscriptionIdOf(event({ type: "invoice.paid", object: { id: "in_1", subscription: "sub_2" } }))).toBe(
      "sub_2"
    );
  });

  it("says nothing rather than guessing when the event names no subscription", () => {
    expect(subscriptionIdOf(event({ type: "customer.created", object: { id: "cus_1" } }))).toBeNull();
  });
});

describe("the row an event leaves", () => {
  it("carries the provider, the event's own identity and Stripe's seconds as a date", () => {
    expect(eventRecord(event())).toMatchObject({
      provider: "stripe",
      provider_event_id: "evt_1",
      provider_event_type: "customer.subscription.updated",
      subscription_id: "sub_1",
      event_occurred_at: new Date(1_700_000_000_000),
    });
  });

  it("keeps the whole event as the payload — the first question of a billing incident", () => {
    expect(eventRecord(event()).payload).toEqual(event());
  });
});

describe("recording a delivery", () => {
  it("writes it once", async () => {
    const create = vi.fn().mockResolvedValue({});
    await expect(recordEvent(writer(create), eventRecord(event()))).resolves.toBe("recorded");
    expect(create).toHaveBeenCalledTimes(1);
  });

  // Stripe redelivers on its own schedule, and again whenever `stripe listen` restarts.
  it("lets the unique index turn a redelivery into a no-op", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("unique"), { code: UNIQUE_VIOLATION }));
    await expect(recordEvent(writer(create), eventRecord(event()))).resolves.toBe("duplicate");
  });

  it("still raises a failure that is not a duplicate", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("down"), { code: "P1001" }));
    await expect(recordEvent(writer(create), eventRecord(event()))).rejects.toThrow("down");
  });
});
