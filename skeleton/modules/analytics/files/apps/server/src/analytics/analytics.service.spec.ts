import { describe, expect, it, vi } from "vitest";
import type { TrackRequest } from "../common/ports/analytics";
import type { Telemetry } from "../common/ports/telemetry";
import { ANALYTICS_WRITE_EVENT, AnalyticsService, type AnalyticsServiceDeps } from "./analytics.service";
import type { AnalyticsStoreAdapter } from "./providers/provider.types";

function stubStore(overrides: Partial<AnalyticsStoreAdapter> = {}): AnalyticsStoreAdapter {
  return {
    provider: "stub",
    getOrCreateIdentifier: vi.fn().mockResolvedValue("id-1"),
    appendEvents: vi.fn().mockResolvedValue(undefined),
    incrementMetrics: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function spyTelemetry() {
  return { captureError: vi.fn(), log: vi.fn(), event: vi.fn() } satisfies Telemetry;
}

/** A service over stubs, with a clock that advances 7ms per read and a fixed request id. */
function makeService(overrides: Partial<AnalyticsServiceDeps> = {}) {
  const store = stubStore();
  const telemetry = spyTelemetry();
  let clock = Date.parse("2026-09-09T09:00:00.000Z");
  const service = new AnalyticsService({
    mode: "fake",
    store,
    telemetry,
    now: () => {
      clock += 7;
      return new Date(clock);
    },
    requestId: () => "req-1",
    ...overrides,
  });
  return { service, store, telemetry };
}

const OCCURRED_AT = new Date("2026-09-09T08:59:00.000Z");
const VIEWED = { type: "screen-viewed", screen: "example-list" } as const;
const DONE = { type: "action", screen: "example-detail", action: "mark-done" } as const;

const trackRequest = (overrides: Partial<TrackRequest> = {}): TrackRequest => ({
  anonymousId: "anon-1",
  userId: null,
  events: [
    { event: VIEWED, occurredAt: OCCURRED_AT },
    { event: DONE, occurredAt: OCCURRED_AT },
  ],
  ...overrides,
});

const writes = (telemetry: ReturnType<typeof spyTelemetry>) =>
  telemetry.event.mock.calls.filter(([name]) => name === ANALYTICS_WRITE_EVENT).map(([, fields]) => fields);

describe("AnalyticsService", () => {
  it("names its mode and the store behind it", () => {
    const { service } = makeService();
    expect(service.mode).toBe("fake");
    expect(service.provider).toBe("stub");
  });

  describe("track", () => {
    it("resolves the identifier, appends the batch stamped with one server clock, and counts the metrics", async () => {
      const { service, store } = makeService();
      service.track(trackRequest());
      await service.flush();

      expect(store.getOrCreateIdentifier).toHaveBeenCalledExactlyOnceWith({ anonymousId: "anon-1", userId: null });
      const [, stamped] = vi.mocked(store.appendEvents).mock.calls[0];
      expect(stamped.map((entry) => entry.event)).toEqual([VIEWED, DONE]);
      expect(stamped.map((entry) => entry.occurredAt)).toEqual([OCCURRED_AT, OCCURRED_AT]);
      expect(stamped[0].receivedAt).toBeInstanceOf(Date);
      expect(stamped[1].receivedAt).toBe(stamped[0].receivedAt);
      expect(store.incrementMetrics).toHaveBeenCalledExactlyOnceWith("id-1", [VIEWED, DONE]);
    });

    it("hands both identity halves to the store — the stitch is the store's write", async () => {
      const { service, store } = makeService();
      service.track(trackRequest({ userId: "usr_1" }));
      await service.flush();
      expect(store.getOrCreateIdentifier).toHaveBeenCalledWith({ anonymousId: "anon-1", userId: "usr_1" });
    });

    it("returns synchronously — the caller never waits on the store", () => {
      let settle: (() => void) | undefined;
      const { service } = makeService({
        store: stubStore({
          getOrCreateIdentifier: vi.fn().mockReturnValue(
            new Promise<string>((resolve) => {
              settle = () => resolve("id-1");
            })
          ),
        }),
      });
      service.track(trackRequest()); // would deadlock here if track awaited
      expect(settle).toBeDefined();
      settle?.();
    });

    it("counts one success with the store, the mode, the batch size and its timing", async () => {
      const { service, telemetry } = makeService();
      service.track(trackRequest());
      await service.flush();

      expect(writes(telemetry)).toEqual([
        {
          requestId: "req-1",
          operation: "track",
          provider: "stub",
          mode: "fake",
          eventCount: 2,
          status: "success",
          durationMs: 7,
        },
      ]);
      expect(telemetry.log).not.toHaveBeenCalled();
    });

    // The port accepts any `{ type }`; the union is enforced here so a server-side call
    // site meets the same PHI contract a client does. The whole batch is refused: a batch
    // is one write, and half of one is a record nobody asked for.
    it("refuses a batch carrying an event outside the vocabulary, stores nothing, and says why", async () => {
      const { service, store, telemetry } = makeService();
      service.track(
        trackRequest({
          events: [
            { event: VIEWED, occurredAt: OCCURRED_AT },
            { event: { type: "screen-viewed", screen: "What the user typed" }, occurredAt: OCCURRED_AT },
          ],
        })
      );
      await service.flush();

      expect(store.getOrCreateIdentifier).not.toHaveBeenCalled();
      expect(store.appendEvents).not.toHaveBeenCalled();
      expect(writes(telemetry)[0]).toMatchObject({ status: "refused", eventCount: 2 });
      expect(telemetry.log).toHaveBeenCalledWith(
        "warn",
        "[analytics] track refused",
        expect.objectContaining({ reason: expect.stringContaining("event 1 (screen-viewed)") })
      );
    });

    it("refuses an identity-less batch instead of writing", async () => {
      const { service, store, telemetry } = makeService();
      service.track(trackRequest({ anonymousId: null, userId: null }));
      await service.flush();

      expect(store.getOrCreateIdentifier).not.toHaveBeenCalled();
      expect(writes(telemetry)[0]).toMatchObject({ status: "refused" });
    });

    it("never throws when the store fails — the failure goes to telemetry as one failure and one error line", async () => {
      const { service, telemetry } = makeService({
        store: stubStore({ appendEvents: vi.fn().mockRejectedValue(new Error("mongo down")) }),
      });

      expect(() => service.track(trackRequest())).not.toThrow();
      await expect(service.flush()).resolves.toBeUndefined();

      expect(writes(telemetry)[0]).toMatchObject({ status: "failure", provider: "stub" });
      expect(telemetry.log).toHaveBeenCalledWith(
        "error",
        "[analytics] track failed",
        expect.objectContaining({ errorMessage: "mongo down" })
      );
    });

    it("never throws on a synchronously exploding store", async () => {
      const { service, telemetry } = makeService({
        store: stubStore({
          getOrCreateIdentifier: vi.fn(() => {
            throw new Error("sync explosion");
          }),
        }),
      });

      expect(() => service.track(trackRequest())).not.toThrow();
      await service.flush();
      expect(writes(telemetry)[0]).toMatchObject({ status: "failure" });
    });
  });

  describe("identify", () => {
    it("links the anonymous identity to the user through the store and reports a null event count", async () => {
      const { service, store, telemetry } = makeService();
      service.identify({ anonymousId: "anon-1", userId: "usr_1" });
      await service.flush();

      expect(store.getOrCreateIdentifier).toHaveBeenCalledExactlyOnceWith({ anonymousId: "anon-1", userId: "usr_1" });
      expect(writes(telemetry)[0]).toMatchObject({ operation: "identify", eventCount: null, status: "success" });
    });

    it("never throws when the link fails", async () => {
      const { service, telemetry } = makeService({
        store: stubStore({ getOrCreateIdentifier: vi.fn().mockRejectedValue(new Error("link failed")) }),
      });
      expect(() => service.identify({ anonymousId: "anon-1", userId: "usr_1" })).not.toThrow();
      await service.flush();
      expect(writes(telemetry)[0]).toMatchObject({ operation: "identify", status: "failure" });
    });
  });

  describe("flush", () => {
    it("drains every in-flight write, and resolves at once when nothing is in flight", async () => {
      const { service, store } = makeService();
      await expect(service.flush()).resolves.toBeUndefined();

      service.track(trackRequest());
      service.track(trackRequest());
      service.identify({ anonymousId: "anon-1", userId: "usr_1" });
      await service.flush();
      expect(store.getOrCreateIdentifier).toHaveBeenCalledTimes(3);
    });
  });
});
