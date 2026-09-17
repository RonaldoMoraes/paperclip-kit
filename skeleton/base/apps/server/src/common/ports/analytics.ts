import type { Provider } from "@nestjs/common";

/**
 * The analytics port: how the server records a product event without naming a store.
 * Base binds the console client; the `analytics` module replaces it and narrows the event
 * payload to its closed, PHI-safe union. Consumers inject `ANALYTICS_CLIENT`, never a class.
 */

/**
 * Who a batch of events belongs to. A funnel may start before an account exists, so
 * either half may be missing, never both.
 */
export interface AnalyticsIdentity {
  /** minted by the client on its first screen and carried from then on */
  anonymousId: string | null;
  /** resolved from the session by the server, never taken from a body */
  userId: string | null;
}

/**
 * One event's payload. `type` is the only field base promises; a module that owns the
 * vocabulary declares the rest as a discriminated union and parses before it tracks.
 */
export type AnalyticsEventPayload = { type: string } & Record<string, unknown>;

/** One event as it entered the server: the payload plus the client's clock. */
export interface IncomingAnalyticsEvent {
  event: AnalyticsEventPayload;
  occurredAt: Date;
}

export interface TrackRequest extends AnalyticsIdentity {
  events: IncomingAnalyticsEvent[];
}

export interface IdentifyRequest {
  anonymousId: string;
  userId: string;
}

/**
 * `track` and `identify` are fire-and-forget: they return synchronously, never throw, and
 * never block the request path — an implementation that needs I/O queues internally and
 * reports failures through telemetry, not to the caller. `flush` awaits every in-flight
 * write; tests and graceful shutdown use it, request paths never do.
 */
export interface AnalyticsClient {
  track(request: TrackRequest): void;
  identify(request: IdentifyRequest): void;
  flush(): Promise<void>;
}

export const ANALYTICS_CLIENT = Symbol("ANALYTICS_CLIENT");

/** The default: one console line per call, nothing stored, nothing in flight to flush. */
export class ConsoleAnalyticsClient implements AnalyticsClient {
  track(request: TrackRequest): void {
    console.log("[analytics] track", {
      anonymousId: request.anonymousId,
      userId: request.userId,
      events: request.events.map((entry) => entry.event.type),
    });
  }

  identify(request: IdentifyRequest): void {
    console.log("[analytics] identify", { anonymousId: request.anonymousId, userId: request.userId });
  }

  async flush(): Promise<void> {}
}

export const AnalyticsConsoleProvider: Provider = {
  provide: ANALYTICS_CLIENT,
  useFactory: (): AnalyticsClient => new ConsoleAnalyticsClient(),
};
