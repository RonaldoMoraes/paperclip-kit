import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalyticsQueue } from "./queue";
import { MAX_EVENTS_PER_BATCH, TrackEventsRequest } from "./track-events";

const EVENT = { type: "screen-viewed", screen: "example-list" } as const;

function sendSpy() {
  return vi.fn().mockResolvedValue({ accepted: 1 });
}

describe("createAnalyticsQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flushes when the batch size is reached, with a contract-valid payload", async () => {
    const send = sendSpy();
    const queue = createAnalyticsQueue({ send, anonymousId: () => crypto.randomUUID(), batchSize: 3 });

    queue.track(EVENT);
    queue.track(EVENT);
    expect(send).not.toHaveBeenCalled();

    queue.track(EVENT);
    await vi.advanceTimersByTimeAsync(0);

    expect(send).toHaveBeenCalledTimes(1);
    const request = TrackEventsRequest.parse(send.mock.calls[0][0]);
    expect(request.events).toHaveLength(3);
    expect(request.anonymousId).toBeDefined();

    // drained: the interval finds nothing else to send
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("flushes a below-size queue on the interval", async () => {
    const send = sendSpy();
    const queue = createAnalyticsQueue({
      send,
      anonymousId: () => crypto.randomUUID(),
      batchSize: 10,
      flushIntervalMs: 1_000,
    });

    queue.track(EVENT);
    await vi.advanceTimersByTimeAsync(999);
    expect(send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(TrackEventsRequest.parse(send.mock.calls[0][0]).events).toHaveLength(1);
  });

  it("splits an oversized queue into contract-sized batches", async () => {
    const send = sendSpy();
    const overflow = MAX_EVENTS_PER_BATCH + 5;
    const queue = createAnalyticsQueue({ send, anonymousId: () => crypto.randomUUID(), batchSize: overflow });

    for (let i = 0; i < overflow; i += 1) queue.track(EVENT);
    await vi.advanceTimersByTimeAsync(0);

    expect(send).toHaveBeenCalledTimes(2);
    expect(TrackEventsRequest.parse(send.mock.calls[0][0]).events).toHaveLength(MAX_EVENTS_PER_BATCH);
    expect(TrackEventsRequest.parse(send.mock.calls[1][0]).events).toHaveLength(5);
  });

  // A device reads its id from a store that answers a promise. A batch sent before it
  // resolves would carry `[object Promise]` and be a 400 at the endpoint.
  it("waits for an asynchronous id and puts it on the batch", async () => {
    const send = sendSpy();
    const id = crypto.randomUUID();
    const queue = createAnalyticsQueue({ send, anonymousId: () => Promise.resolve(id), batchSize: 1 });

    queue.track(EVENT);
    await vi.advanceTimersByTimeAsync(0);

    expect(TrackEventsRequest.parse(send.mock.calls[0][0]).anonymousId).toBe(id);
  });

  it("retries a failed batch on the next flush and drops it after maxAttempts", async () => {
    const send = vi.fn().mockRejectedValue(new Error("offline"));
    const queue = createAnalyticsQueue({
      send,
      anonymousId: () => crypto.randomUUID(),
      batchSize: 1,
      flushIntervalMs: 1_000,
      maxAttempts: 2,
    });

    queue.track(EVENT); // attempt 1, immediately (batch size reached)
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000); // attempt 2 → dropped
    expect(send).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60_000); // nothing left to retry
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("never throws to the caller — not on enqueue, not on flush, not on a sync-throwing send", async () => {
    const send = vi.fn().mockImplementation(() => {
      throw new Error("exploded synchronously");
    });
    const queue = createAnalyticsQueue({ send, anonymousId: () => crypto.randomUUID(), batchSize: 1 });

    expect(() => queue.track(EVENT)).not.toThrow();
    await expect(queue.flush()).resolves.toBeUndefined();
  });
});
