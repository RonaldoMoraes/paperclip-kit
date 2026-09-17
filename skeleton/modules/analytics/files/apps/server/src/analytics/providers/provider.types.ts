import type { AnalyticsEvent } from "@contracts/analytics/events";
import type { AnalyticsIdentity } from "../../common/ports/analytics";

/** An event ready to persist: the parsed payload, the client's clock and the server's. */
export interface StampedAnalyticsEvent {
  event: AnalyticsEvent;
  occurredAt: Date;
  receivedAt: Date;
}

/**
 * Dumb storage transport: identifier upserts, ordered appends, counted upserts. No
 * validation, no retries, no telemetry, no defaulting — those are the service's, so every
 * store reports the same way. An adapter throws raw errors; the service catches and
 * reports. `provider` names the store in telemetry and the boot log ("mongo", "console").
 */
export interface AnalyticsStoreAdapter {
  readonly provider: string;

  /**
   * One identifier document per identity, created idempotently. Lookup is by anonymousId
   * when present, else by userId. When both halves are present the userId is written onto
   * the anonymous document — the registration stitch — so pre- and post-registration
   * events hang off the same identifier. Returns the identifier document's id.
   */
  getOrCreateIdentifier(identity: AnalyticsIdentity): Promise<string>;

  /** Append the batch in order — the funnel record. */
  appendEvents(identifierId: string, events: StampedAnalyticsEvent[]): Promise<void>;

  /** Counted upserts keyed by identifier + metric shape (`metric-key.ts`) — the totals. */
  incrementMetrics(identifierId: string, events: AnalyticsEvent[]): Promise<void>;
}
