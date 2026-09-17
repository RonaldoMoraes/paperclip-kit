import { z } from "zod";
import type { Http } from "../http";
import { AnalyticsEvent } from "./events";

/**
 * `POST /api/analytics/events` — the one door analytics data enters through.
 *
 * Web and mobile hold no analytics SDK and no database handle: they batch typed events
 * (`events.ts`) through `queue.ts` and post them here. A funnel may start before an
 * account exists, so a batch carries a client-minted `anonymousId` (`anonymous-id.ts`)
 * from the first screen on, signed in or not; the server stitches it to the session's
 * user on the identifier document. The user id itself never travels in the body — it is
 * read from the session, so a caller cannot claim another user's id. A batch with neither
 * an `anonymousId` nor a session is a 400, in the envelope.
 *
 * The answer is 202: accepted for processing, not persisted-by-now. Persistence is
 * fire-and-forget on the server — analytics never blocks or fails a product path.
 */
export const TrackedEvent = z.object({
  event: AnalyticsEvent,
  /** the client's clock when the event happened; the server stamps arrival itself */
  occurredAt: z.iso.datetime(),
});
export type TrackedEvent = z.infer<typeof TrackedEvent>;

/** The most one request carries; the queue splits anything larger (`queue.ts`). */
export const MAX_EVENTS_PER_BATCH = 50;

export const TrackEventsRequest = z.object({
  /** client-minted UUID, carried from the first anonymous screen onward */
  anonymousId: z.uuid().optional(),
  events: z.array(TrackedEvent).min(1).max(MAX_EVENTS_PER_BATCH),
});
export type TrackEventsRequest = z.infer<typeof TrackEventsRequest>;

export const TrackEventsResponse = z.object({
  /** how many events the batch carried — accepted for processing, not persisted-by-now */
  accepted: z.number().int().nonnegative(),
});
export type TrackEventsResponse = z.infer<typeof TrackEventsResponse>;

export function trackEvents(http: Http, request: TrackEventsRequest): Promise<TrackEventsResponse> {
  return http.post("/api/analytics/events", TrackEventsResponse, request);
}
