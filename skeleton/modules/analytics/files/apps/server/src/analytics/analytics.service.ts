import { randomUUID } from "node:crypto";
import { AnalyticsEvent } from "@contracts/analytics/events";
import type { AnalyticsClient, IdentifyRequest, TrackRequest } from "../common/ports/analytics";
import type { Telemetry } from "../common/ports/telemetry";
import type { AnalyticsMode } from "./analytics.config";
import type { AnalyticsStoreAdapter, StampedAnalyticsEvent } from "./providers/provider.types";

export type AnalyticsServiceDeps = {
  mode: AnalyticsMode;
  store: AnalyticsStoreAdapter;
  telemetry: Telemetry;
  /** the clock, injected so a spec can pin `receivedAt` and `durationMs` */
  now?: () => Date;
  /** the id minted per write, injected so a spec can find its own event */
  requestId?: () => string;
};

/** The one event every write emits, whatever happened; `telemetry.event` counts it. */
export const ANALYTICS_WRITE_EVENT = "analytics.write";

/**
 * What telemetry hears about one write: which store, how many events, how it went —
 * never an identity, never a payload. `refused` is a batch the port's own rules rejected
 * before the store ran (no identity, an event outside the union); `failure` is a store
 * that threw.
 */
export type AnalyticsWriteEvent = {
  requestId: string;
  operation: "track" | "identify";
  provider: string;
  mode: AnalyticsMode;
  /** how many events the batch carried; null for identify */
  eventCount: number | null;
  status: "success" | "failure" | "refused";
  durationMs: number;
};

/** A write the port refuses on its own terms — the caller's error, not the store's. */
class AnalyticsRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsRefusal";
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The port's implementation and the one home of its never-throw contract. `track` and
 * `identify` return synchronously and run persistence in the background: a caller is
 * never slowed, blocked or failed by analytics. Every outcome — success, refusal or
 * failure — is reported through the telemetry port, so a dead store is never silent.
 *
 * The union is parsed here, not only at the controller: the port accepts any
 * `{ type: string }` payload, so a server-side call site meets the same PHI contract a
 * client does, and nothing reaches a store that `events.ts` did not name.
 */
export class AnalyticsService implements AnalyticsClient {
  readonly mode: AnalyticsMode;
  /** the store behind the port, by name — what the boot log and a spec read */
  readonly provider: string;

  /** every in-flight background write, so `flush()` can drain them */
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly deps: AnalyticsServiceDeps) {
    this.mode = deps.mode;
    this.provider = deps.store.provider;
  }

  track(request: TrackRequest): void {
    const receivedAt = this.now(); // one server clock per batch
    this.runInBackground({ operation: "track", eventCount: request.events.length }, async () => {
      if (request.anonymousId === null && request.userId === null) {
        throw new AnalyticsRefusal("a track batch needs an anonymousId or a userId");
      }
      const stamped = request.events.map(({ event, occurredAt }, index): StampedAnalyticsEvent => {
        const parsed = AnalyticsEvent.safeParse(event);
        if (!parsed.success) throw new AnalyticsRefusal(`event ${index} (${event.type}) is outside the vocabulary`);
        return { event: parsed.data, occurredAt, receivedAt };
      });
      const identifierId = await this.deps.store.getOrCreateIdentifier({
        anonymousId: request.anonymousId,
        userId: request.userId,
      });
      await this.deps.store.appendEvents(identifierId, stamped);
      await this.deps.store.incrementMetrics(
        identifierId,
        stamped.map(({ event }) => event)
      );
    });
  }

  identify(request: IdentifyRequest): void {
    // The stitch is the store's getOrCreate with both halves present — the ingestion
    // path performs it implicitly; this is the explicit surface for a server-side call
    // site (a registration hook, say).
    this.runInBackground({ operation: "identify", eventCount: null }, async () => {
      await this.deps.store.getOrCreateIdentifier({ anonymousId: request.anonymousId, userId: request.userId });
    });
  }

  async flush(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }

  private now(): Date {
    return (this.deps.now ?? (() => new Date()))();
  }

  private runInBackground(
    call: { operation: "track" | "identify"; eventCount: number | null },
    work: () => Promise<void>
  ): void {
    const context = {
      requestId: (this.deps.requestId ?? randomUUID)(),
      operation: call.operation,
      provider: this.provider,
      mode: this.mode,
      eventCount: call.eventCount,
    };
    const settled = this.reportOutcome(context, work); // never rejects
    this.pending.add(settled);
    settled.finally(() => this.pending.delete(settled));
  }

  private async reportOutcome(
    context: Omit<AnalyticsWriteEvent, "status" | "durationMs">,
    work: () => Promise<void>
  ): Promise<void> {
    const { telemetry } = this.deps;
    const startedAt = this.now().getTime();
    const durationMs = () => this.now().getTime() - startedAt;
    try {
      await work();
      this.report({ ...context, status: "success", durationMs: durationMs() });
    } catch (error) {
      if (error instanceof AnalyticsRefusal) {
        this.report({ ...context, status: "refused", durationMs: durationMs() });
        telemetry.log("warn", `[analytics] ${context.operation} refused`, { ...context, reason: error.message });
        return;
      }
      this.report({ ...context, status: "failure", durationMs: durationMs() });
      telemetry.log("error", `[analytics] ${context.operation} failed`, { ...context, errorMessage: messageOf(error) });
    }
  }

  private report(event: AnalyticsWriteEvent): void {
    this.deps.telemetry.event(ANALYTICS_WRITE_EVENT, event);
  }
}
