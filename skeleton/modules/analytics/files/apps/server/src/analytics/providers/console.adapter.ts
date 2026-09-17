import type { AnalyticsEvent } from "@contracts/analytics/events";
import type { AnalyticsIdentity } from "../../common/ports/analytics";
import type { AnalyticsStoreAdapter, StampedAnalyticsEvent } from "./provider.types";

/**
 * The store in fake mode: no MongoDB, no network, nothing to configure. Prints enough to
 * watch a funnel move in development — types and counts, never a payload — and answers
 * deterministic identifier ids, so the service walks the same path it walks in real mode.
 * Never throws.
 */
export class ConsoleAnalyticsStore implements AnalyticsStoreAdapter {
  readonly provider = "console";

  async getOrCreateIdentifier(identity: AnalyticsIdentity): Promise<string> {
    const id = `console:${identity.anonymousId ?? identity.userId}`;
    console.log("[analytics:store:console] identifier", { ...identity, id });
    return id;
  }

  async appendEvents(identifierId: string, events: StampedAnalyticsEvent[]): Promise<void> {
    console.log("[analytics:store:console] events", {
      identifierId,
      count: events.length,
      types: events.map(({ event }) => event.type),
    });
  }

  async incrementMetrics(identifierId: string, events: AnalyticsEvent[]): Promise<void> {
    console.log("[analytics:store:console] metrics", {
      identifierId,
      count: events.length,
      types: events.map((event) => event.type),
    });
  }
}
