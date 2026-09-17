import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackEventsRequest } from "@contracts/analytics/track-events";
import { type RouteViews, bindPageHideFlush, bindRouteViews, useAnalytics } from "./analytics";

const setVisibility = (value: "hidden" | "visible") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
};

/** The router as the adapter reads it: resolves a path with a leaf pattern, on demand. */
function fakeRouter() {
  const listeners = new Set<(event: { toLocation: { pathname: string } }) => void>();
  const router: RouteViews & { resolve: (pathname: string, fullPath: string) => void } = {
    state: { matches: [] },
    subscribe(_type, listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    resolve(pathname, fullPath) {
      router.state = { matches: [{ fullPath: "/_app" }, { fullPath }] };
      // `pathname` is the path alone, the way the real router reports it; the search is not part of it
      for (const listener of listeners) listener({ toLocation: { pathname: pathname.split("?")[0] } });
    },
  };
  return router;
}

/** The router `bootAnalytics` subscribes to; a file-scope const so the hoisted factory below can see it. */
const bootRouter = fakeRouter();

vi.mock("~/app/router", () => ({ router: bootRouter }));

afterEach(() => {
  setVisibility("visible");
});

describe("bindPageHideFlush", () => {
  it("flushes on pagehide, and when the document goes hidden but not when it comes back", () => {
    const flush = vi.fn();
    const unbind = bindPageHideFlush(flush);

    window.dispatchEvent(new Event("pagehide"));
    expect(flush).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(flush).toHaveBeenCalledTimes(2);

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(flush).toHaveBeenCalledTimes(2);
    unbind();
  });

  it("unbinding stops both listeners", () => {
    const flush = vi.fn();
    bindPageHideFlush(flush)();

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
    expect(flush).not.toHaveBeenCalled();
  });
});

describe("bindRouteViews", () => {
  // The pattern, never the URL: two items are one screen, and the id in the path is a
  // fact about one user that no event carries.
  it("reports the leaf route's pattern once per path, never the parameter's value", () => {
    const track = vi.fn();
    const router = fakeRouter();
    const unsubscribe = bindRouteViews(router, track);

    router.resolve("/example", "/example/");
    router.resolve("/example/first-thing", "/example/$id");
    router.resolve("/example/first-thing?tab=notes", "/example/$id");
    router.resolve("/example/second-thing", "/example/$id");

    expect(track.mock.calls.map(([event]) => event)).toEqual([
      { type: "screen-viewed", screen: "example" },
      { type: "screen-viewed", screen: "example-id" },
      { type: "screen-viewed", screen: "example-id" },
    ]);
    expect(JSON.stringify(track.mock.calls)).not.toContain("first-thing");

    unsubscribe();
    router.resolve("/settings", "/settings");
    expect(track).toHaveBeenCalledTimes(3);
  });
});

describe("useAnalytics", () => {
  it("hands every caller the same stable surface: track, and nothing else", () => {
    const { result, rerender } = renderHook(() => useAnalytics());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(Object.keys(first)).toEqual(["track"]);
    expect(typeof first.track).toBe("function");
  });
});

describe("bootAnalytics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 202, json: async () => ({ accepted: 1 }) }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The whole web adapter end to end: a navigation is queued, the tab going hidden sends
  // it, and what reaches the wire is one contract-valid batch with the device's id, on a
  // request the browser will finish after the page is gone.
  it("after boot, a navigation then a hidden tab is one keepalive batch the contract accepts", async () => {
    const { bootAnalytics } = await import("./analytics");
    const { anonymousId } = await import("~/data/analytics");
    await bootAnalytics();

    bootRouter.resolve("/example", "/example/");
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [path, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/analytics/events");
    expect(init.keepalive).toBe(true);
    const batch = TrackEventsRequest.parse(JSON.parse(String(init.body)));
    expect(batch.anonymousId).toBe(await anonymousId());
    expect(batch.events.map((entry) => entry.event)).toEqual([{ type: "screen-viewed", screen: "example" }]);
  });
});
