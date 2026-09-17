import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleAnalyticsStore } from "./console.adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConsoleAnalyticsStore", () => {
  // The anonymous id is the one the client has been sending since before the user signed
  // in, so it wins while both are on the identity — keying on the userId there would file
  // a visitor's first session under one identifier and the rest under another.
  it("keys on the anonymous id where there is one, and on the userId otherwise", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const store = new ConsoleAnalyticsStore();
    expect(await store.getOrCreateIdentifier({ anonymousId: null, userId: "usr_1" })).toBe("console:usr_1");
    expect(await store.getOrCreateIdentifier({ anonymousId: "anon-1", userId: "usr_1" })).toBe("console:anon-1");
  });

  it("prints types and counts, never a payload", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const store = new ConsoleAnalyticsStore();
    const event = { type: "action", screen: "example-detail", action: "mark-done" } as const;

    await store.appendEvents("console:anon-1", [{ event, occurredAt: new Date(), receivedAt: new Date() }]);
    await store.incrementMetrics("console:anon-1", [event]);

    expect(store.provider).toBe("console");
    expect(log).toHaveBeenCalledTimes(2);
    for (const [, fields] of log.mock.calls) expect(JSON.stringify(fields)).not.toContain("mark-done");
    expect(log.mock.calls[0][1]).toMatchObject({ identifierId: "console:anon-1", count: 1, types: ["action"] });
  });
});
