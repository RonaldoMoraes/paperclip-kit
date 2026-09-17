import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import type { TrackEventsRequest } from "@contracts/analytics/track-events";
import { ApiException } from "../common/api-error";
import type { AnalyticsClient } from "../common/ports/analytics";
import { AnalyticsController, type SessionCarrier, userIdOf } from "./analytics.controller";

function makeClient(): AnalyticsClient {
  return { track: vi.fn(), identify: vi.fn(), flush: vi.fn().mockResolvedValue(undefined) };
}

const ANON = "3f2b6f0a-8f1e-4b6e-9a2d-1c5e7a9b0d42";
const OCCURRED_AT = "2026-09-09T09:00:00.000Z";
const VIEWED = { type: "screen-viewed", screen: "example-list" } as const;

const batch = (overrides: Partial<TrackEventsRequest> = {}): TrackEventsRequest => ({
  anonymousId: ANON,
  events: [{ event: VIEWED, occurredAt: OCCURRED_AT }],
  ...overrides,
});

/** What the auth module's guard leaves behind, and what a request carries without it. */
const signedIn: SessionCarrier = { session: { user: { id: "usr_1" } } };
const nobody: SessionCarrier = {};

describe("AnalyticsController", () => {
  it("accepts an anonymous batch, answers the batch size, and hands the port the events with their clocks", () => {
    const client = makeClient();
    const controller = new AnalyticsController(client);

    expect(controller.track(batch(), nobody)).toEqual({ accepted: 1 });
    expect(client.track).toHaveBeenCalledExactlyOnceWith({
      anonymousId: ANON,
      userId: null,
      events: [{ event: VIEWED, occurredAt: new Date(OCCURRED_AT) }],
    });
  });

  it("takes the userId from the session and never from the body", () => {
    const client = makeClient();
    const forged = { ...batch(), userId: "usr_forged" };

    new AnalyticsController(client).track(forged, signedIn);

    expect(client.track).toHaveBeenCalledWith(expect.objectContaining({ anonymousId: ANON, userId: "usr_1" }));
  });

  it("accepts a signed-in batch with no anonymousId", () => {
    const client = makeClient();
    const controller = new AnalyticsController(client);

    expect(controller.track(batch({ anonymousId: undefined }), signedIn)).toEqual({ accepted: 1 });
    expect(client.track).toHaveBeenCalledWith(expect.objectContaining({ anonymousId: null, userId: "usr_1" }));
  });

  it("refuses a batch with neither identity in the envelope, and hands the port nothing", () => {
    const client = makeClient();
    const controller = new AnalyticsController(client);

    let thrown: unknown;
    try {
      controller.track(batch({ anonymousId: undefined }), nobody);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiException);
    expect(thrown).toMatchObject({ status: 400, response: { code: "VALIDATION" } });
    expect(client.track).not.toHaveBeenCalled();
  });
});

describe("userIdOf", () => {
  it("reads only a non-empty string id, and nothing from a request no guard touched", () => {
    expect(userIdOf(signedIn)).toBe("usr_1");
    expect(userIdOf(nobody)).toBeNull();
    expect(userIdOf({ session: null })).toBeNull();
    expect(userIdOf({ session: { user: null } })).toBeNull();
    expect(userIdOf({ session: { user: { id: "" } } })).toBeNull();
    expect(userIdOf({ session: { user: { id: 7 } } })).toBeNull();
  });
});
