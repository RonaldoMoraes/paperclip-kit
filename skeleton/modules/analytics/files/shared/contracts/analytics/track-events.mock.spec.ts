import { getResponse } from "msw";
import { describe, expect, it } from "vitest";
import { handlers } from "./index";
import { MAX_EVENTS_PER_BATCH, type TrackEventsRequest } from "./track-events";

const ORIGIN = "http://localhost";
const ANON = "3f2b6f0a-8f1e-4b6e-9a2d-1c5e7a9b0d42";

/** One batch through the handler list, the way the Playwright fixture and the apps drive it. */
async function post(body: unknown): Promise<Response> {
  const response = await getResponse(
    handlers,
    new Request(`${ORIGIN}/api/analytics/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  if (!response) throw new Error("no handler answered /api/analytics/events");
  return response;
}

const tracked = (screen: string) => ({
  event: { type: "screen-viewed", screen } as const,
  occurredAt: "2026-09-09T09:00:00.000Z",
});

const batch = (overrides: Partial<TrackEventsRequest> = {}): TrackEventsRequest => ({
  anonymousId: ANON,
  events: [tracked("example-list")],
  ...overrides,
});

describe("POST /api/analytics/events (mock)", () => {
  // Two events, so the count answered back is the batch's own size and not a constant.
  it("accepts an anonymous batch with 202 and the batch size", async () => {
    const response = await post(batch({ events: [tracked("example-list"), tracked("example-detail")] }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: 2 });
  });

  it("refuses a batch with no identity, in the envelope", async () => {
    const response = await post(batch({ anonymousId: undefined }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION" });
  });

  // The door is where a PHI-shaped payload is stopped: prose in a slug field, an event the
  // union does not name, an empty or oversized batch, a body that is not JSON.
  it("refuses what the contract refuses", async () => {
    const prose = { event: { type: "screen-viewed", screen: "What I typed" }, occurredAt: tracked("x").occurredAt };
    expect((await post({ anonymousId: ANON, events: [prose] })).status).toBe(400);
    expect((await post({ anonymousId: ANON, events: [{ event: { type: "nope" } }] })).status).toBe(400);
    expect((await post(batch({ events: [] }))).status).toBe(400);
    expect(
      (await post(batch({ events: Array.from({ length: MAX_EVENTS_PER_BATCH + 1 }, () => tracked("x")) }))).status
    ).toBe(400);
    expect((await post("not json")).status).toBe(400);
  });
});
