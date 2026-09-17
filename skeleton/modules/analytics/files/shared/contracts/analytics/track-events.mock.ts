import { http } from "msw";
import { apiError, json } from "../mock-response";
import { TrackEventsRequest, TrackEventsResponse } from "./track-events";

/**
 * The mocked door enforces what the server enforces: a batch the contract accepts, and an
 * identity. The mock knows no session — base has none, and every client sends the
 * `anonymousId` on every batch anyway (`queue.ts`) — so the identity it checks is that
 * one. Nothing is stored; the answer is the same 202 the server sends, so a screen built
 * against this mock meets no surprises in real mode.
 */
export const fixture = TrackEventsResponse.parse({ accepted: 1 });

export const handlers = [
  http.post("*/api/analytics/events", async ({ request }) => {
    const parsed = TrackEventsRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError(400, "VALIDATION", "The request body is not valid.");
    if (!parsed.data.anonymousId) {
      return apiError(400, "VALIDATION", "An analytics batch needs an anonymousId or a session.");
    }
    return json(TrackEventsResponse.parse({ accepted: parsed.data.events.length }), { status: 202 });
  }),
];
