import type { AnalyticsEvent } from "./events";
import { MAX_EVENTS_PER_BATCH, type TrackEventsRequest, type TrackedEvent } from "./track-events";

/**
 * The batching behind `POST /api/analytics/events`, shared by both apps: a caller tracks
 * an event and is done — everything after that is this file's problem, and never the
 * caller's. `track` stamps `occurredAt`, queues, and returns; batches flush at
 * `BATCH_SIZE`, every `FLUSH_INTERVAL_MS` while anything is queued, and whenever the app
 * goes away — the tab hiding on web, `AppState` leaving `active` on mobile. A failed batch
 * retries on the next flush and is dropped after `MAX_SEND_ATTEMPTS` — analytics never
 * builds pressure and never surfaces an error.
 *
 * Platform-free: `send` and `anonymousId` are injected, so this holds no `fetch`, no
 * storage and no React. Each app's `lib/analytics.ts` is the adapter that supplies them.
 */

export const BATCH_SIZE = 20;
export const FLUSH_INTERVAL_MS = 10_000;
export const MAX_SEND_ATTEMPTS = 3;

export type AnalyticsQueue = {
  /** Enqueue one event. Synchronous, never throws, never blocks. */
  track: (event: AnalyticsEvent) => void;
  /** Send what is queued now. Resolves when the attempt settles; never rejects. */
  flush: () => Promise<void>;
};

export type AnalyticsQueueDeps = {
  send: (request: TrackEventsRequest) => Promise<unknown>;
  /** May be async: a device reads its id from a store that answers a promise. */
  anonymousId: () => string | Promise<string>;
  batchSize?: number;
  flushIntervalMs?: number;
  maxAttempts?: number;
};

/** The queue behind an app's singleton, injectable so its spec needs no network and no DOM. */
export function createAnalyticsQueue(deps: AnalyticsQueueDeps): AnalyticsQueue {
  const batchSize = deps.batchSize ?? BATCH_SIZE;
  const flushIntervalMs = deps.flushIntervalMs ?? FLUSH_INTERVAL_MS;
  const maxAttempts = deps.maxAttempts ?? MAX_SEND_ATTEMPTS;

  let queue: TrackedEvent[] = [];
  /** failed sends of the current head batch — reset on success or drop */
  let attempts = 0;
  let inFlight: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  // The interval exists only while something is queued: armed on the first event,
  // disarmed when the queue drains, so an idle app schedules nothing.
  function armTimer(): void {
    if (timer !== null) return;
    timer = setInterval(() => {
      flush();
    }, flushIntervalMs);
  }

  function disarmTimer(): void {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  }

  async function drain(): Promise<void> {
    while (queue.length > 0) {
      const batch = queue.slice(0, MAX_EVENTS_PER_BATCH);
      try {
        // The id is awaited here, inside the try: a device reads it from storage, and a
        // batch must not go out carrying a promise or take a rejection past this catch.
        await deps.send({ anonymousId: await deps.anonymousId(), events: batch });
        queue = queue.slice(batch.length);
        attempts = 0;
      } catch {
        attempts += 1;
        if (attempts >= maxAttempts) {
          // Drop it. A batch that cannot land must not queue behind itself forever —
          // a missed metric is the accepted cost of never bothering the product.
          queue = queue.slice(batch.length);
          attempts = 0;
        }
        return; // stop draining; the interval retries whatever remains
      }
    }
  }

  async function runFlush(): Promise<void> {
    try {
      await drain();
    } finally {
      inFlight = null;
      if (queue.length === 0) disarmTimer();
    }
  }

  function flush(): Promise<void> {
    if (inFlight) return inFlight;
    if (queue.length === 0) {
      disarmTimer();
      return Promise.resolve();
    }
    inFlight = runFlush();
    return inFlight;
  }

  function track(event: AnalyticsEvent): void {
    try {
      queue.push({ event, occurredAt: new Date().toISOString() });
      armTimer();
      if (queue.length >= batchSize) flush();
    } catch {
      /* a dropped event, never a crash */
    }
  }

  return { track, flush };
}
