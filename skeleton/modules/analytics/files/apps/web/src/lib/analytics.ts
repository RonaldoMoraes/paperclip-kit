import type { AnalyticsEvent } from "@contracts/analytics/events";
import { type AnalyticsQueue, createAnalyticsQueue } from "@contracts/analytics/queue";
import { screenSlug } from "@contracts/analytics/screen-slug";
import { trackEvents } from "@contracts/analytics/track-events";
import { anonymousId } from "~/data/analytics";
import { keepaliveHttp } from "~/lib/http";

/**
 * The web side of `POST /api/analytics/events`: a feature hook or a route calls
 * `useAnalytics().track(event)` and is done. The batching is the contract's shared queue
 * (`@contracts/analytics/queue`); this file is the browser adapter around it — the
 * singleton, the transport, the device's id, the page-hide flush and the route views.
 *
 * Every batch carries the device's `anonymousId` (`~/data/analytics`), signed in or not:
 * the session cookie rides along like any other call, and the server stitches the two
 * identities on the identifier document. What may go in an event is the closed union in
 * `shared/contracts/analytics/events.ts` — read its PHI contract before adding a branch.
 */

/**
 * Flush when the page is going away or to the background — `pagehide` plus
 * `visibilitychange` → hidden, which together cover navigation, tab close and the phone's
 * app switcher. The send rides `keepaliveHttp`, which is what outlives the navigation
 * that triggered it; the id the batch waits for is cached by then, so nothing but the
 * request itself is still in flight. Returns the unbind, for specs.
 */
export function bindPageHideFlush(flushFn: () => void, doc: Document = document, win: Window = window): () => void {
  const onVisibilityChange = (): void => {
    if (doc.visibilityState === "hidden") flushFn();
  };
  doc.addEventListener("visibilitychange", onVisibilityChange);
  win.addEventListener("pagehide", flushFn);
  return () => {
    doc.removeEventListener("visibilitychange", onVisibilityChange);
    win.removeEventListener("pagehide", flushFn);
  };
}

/**
 * The router as this file reads it: a resolved navigation and the matches that answered
 * it. Structural, so the spec hands it a fake and the real router satisfies it unchanged.
 */
export type RouteViews = {
  subscribe(type: "onResolved", listener: (event: { toLocation: { pathname: string } }) => void): () => void;
  state: { matches: ReadonlyArray<{ fullPath: string }> };
};

/**
 * Every resolved navigation to a new path is one `screen-viewed`, named by the leaf
 * route's pattern (`/example/$id` → `example-id`, `screen-slug.ts`) and never by the URL
 * — a parameter's value is a fact about one user and has no business in an event. A
 * search change on the same path is not a view. Returns the unsubscribe, for specs.
 */
export function bindRouteViews(router: RouteViews, trackFn: (event: AnalyticsEvent) => void): () => void {
  let lastPathname: string | null = null;
  return router.subscribe("onResolved", ({ toLocation }) => {
    if (toLocation.pathname === lastPathname) return;
    lastPathname = toLocation.pathname;
    const leaf = router.state.matches[router.state.matches.length - 1];
    if (!leaf) return;
    trackFn({ type: "screen-viewed", screen: screenSlug([leaf.fullPath]) });
  });
}

let singleton: AnalyticsQueue | null = null;

function queueInstance(): AnalyticsQueue {
  if (singleton) return singleton;
  singleton = createAnalyticsQueue({
    send: (request) => trackEvents(keepaliveHttp, request),
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
 * `KIT_BOOT`: once, before the first render. The id is read from storage now, so the first
 * batch never waits on it; what is queued goes out when the tab hides or the page unloads;
 * and every resolved navigation is a `screen-viewed`. The router is imported here rather
 * than at the top of the file: the route tree pulls in the feature hooks, the feature
 * hooks import this file, and a static import would close that loop at module scope.
 */
export async function bootAnalytics(): Promise<void> {
  const queue = queueInstance();
  bindPageHideFlush(() => {
    queue.flush();
  });
  await anonymousId();
  const { router } = await import("~/app/router");
  bindRouteViews(router, track);
}
