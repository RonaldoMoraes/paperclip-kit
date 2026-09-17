import { AppState, type AppStateStatus } from "react-native";
import type { AnalyticsEvent } from "@contracts/analytics/events";
import { type AnalyticsQueue, createAnalyticsQueue } from "@contracts/analytics/queue";
import { trackEvents } from "@contracts/analytics/track-events";
import { anonymousId } from "~/data/analytics";
import { http } from "~/lib/http";

/**
 * The device side of `POST /api/analytics/events`: a feature hook or a route calls
 * `useAnalytics().track(event)` and is done. The batching is the contract's shared queue
 * (`@contracts/analytics/queue`); this file is the native adapter around it — the
 * singleton, the transport, the device's id and the background flush. Screen views are
 * the navigator's business (`features/analytics/components/ScreenViews.tsx`).
 *
 * Every batch travels through `~/lib/http`, so a session rides as whatever header a
 * module registered there once there is one. What may go in an event is the closed union
 * in `shared/contracts/analytics/events.ts` — read its PHI contract before adding a branch.
 */

/** The slice of `AppState` this file reads, so a spec hands it a fake. */
export type AppStateSource = {
  addEventListener: (type: "change", listener: (state: AppStateStatus) => void) => { remove: () => void };
};

/**
 * Flush when the app leaves the foreground — the counterpart of the web's page-hide.
 * `inactive` counts too: it is the app switcher and the incoming call, and either can end
 * with the process gone before it is `active` again. Returns the unbind, for specs.
 */
export function bindAppStateFlush(flushFn: () => void, appState: AppStateSource = AppState): () => void {
  const subscription = appState.addEventListener("change", (state) => {
    if (state !== "active") flushFn();
  });
  return () => subscription.remove();
}

let singleton: AnalyticsQueue | null = null;

function queueInstance(): AnalyticsQueue {
  if (singleton) return singleton;
  singleton = createAnalyticsQueue({
    send: (request) => trackEvents(http, request),
    anonymousId,
  });
  return singleton;
}

function track(event: AnalyticsEvent): void {
  queueInstance().track(event);
}

const api = { track } as const;

/** What a hook or a route holds: `track`, and nothing else. One stable object, no re-renders. */
export function useAnalytics(): { track: (event: AnalyticsEvent) => void } {
  return api;
}

/**
 * `KIT_BOOT`: once, before anything mounts. What is queued goes out whenever the app
 * leaves the foreground, and the id is read now so the first batch never waits on it.
 */
export async function bootAnalytics(): Promise<void> {
  const queue = queueInstance();
  bindAppStateFlush(() => {
    queue.flush();
  });
  await anonymousId();
}
