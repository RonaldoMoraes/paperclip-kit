import { Controller, HttpCode, HttpStatus, Inject, Post, Req } from "@nestjs/common";
import { TrackEventsRequest, type TrackEventsResponse } from "@contracts/analytics/track-events";
import { ApiException } from "../common/api-error";
import { ANALYTICS_CLIENT, type AnalyticsClient } from "../common/ports/analytics";
import { ZodBody } from "../common/zod.pipe";

/**
 * What a resolved session leaves on the request, as this controller reads it. Base has no
 * session; the auth module's optional session guard resolves the cookie or header into
 * `request.session` with the user on it. Read defensively — shaped here, not imported —
 * so this module depends on no other, and a request that carries nothing reads as
 * nobody signed in.
 */
export type SessionCarrier = { session?: { user?: { id?: unknown } | null } | null };

/** The user id the session resolved, or null. Never read off a body — a caller cannot claim another's id. */
export function userIdOf(request: SessionCarrier): string | null {
  const id = request.session?.user?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * The one door analytics data enters through — web and mobile hold no analytics SDK and
 * no database handle.
 *
 * Public on purpose: a funnel starts before an account exists, so a batch may carry only
 * the client-minted `anonymousId`. When the auth module is on, its optional session guard
 * goes on this class (`@UseGuards(OptionalSessionGuard)` — its docs say so) and the
 * `userId` is read from what it resolved; a batch with neither identity is a 400 in the
 * envelope, like a malformed one. The answer is 202: the batch is validated and handed to
 * the fire-and-forget port — analytics never blocks or fails a product path, and a store
 * failure surfaces in telemetry, not here.
 */
@Controller("api/analytics")
export class AnalyticsController {
  constructor(@Inject(ANALYTICS_CLIENT) private readonly analytics: AnalyticsClient) {}

  @Post("events")
  @HttpCode(HttpStatus.ACCEPTED)
  track(@ZodBody(TrackEventsRequest) body: TrackEventsRequest, @Req() request: SessionCarrier): TrackEventsResponse {
    const anonymousId = body.anonymousId ?? null;
    const userId = userIdOf(request);
    if (anonymousId === null && userId === null) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "VALIDATION",
        "An analytics batch needs an anonymousId or a session."
      );
    }

    this.analytics.track({
      anonymousId,
      userId,
      events: body.events.map(({ event, occurredAt }) => ({ event, occurredAt: new Date(occurredAt) })),
    });
    return { accepted: body.events.length };
  }
}
