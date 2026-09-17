import { renderHook } from "@testing-library/react";
import { AppState, type AppStateStatus } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalyticsQueue } from "@contracts/analytics/queue";
import { TrackEventsRequest } from "@contracts/analytics/track-events";

/**
 * What the device adds to the shared queue: the moment it is emptied, and the transport
 * the batch rides. The queue and the id are the contract's, proven in their own specs;
 * the transport is the seam.
 */
const post = vi.fn<(path: string, body: unknown) => Promise<unknown>>();

vi.mock("~/lib/http", () => ({
  http: { post: (path: string, _schema: unknown, body: unknown) => post(path, body) },
}));

const EVENT = { type: "action", screen: "example-detail", action: "mark-done" } as const;

function fakeAppState() {
  let listener: ((state: AppStateStatus) => void) | null = null;
  return {
    addEventListener(_type: string, fn: (state: AppStateStatus) => void) {
      listener = fn;
      return {
        remove: () => {
          listener = null;
        },
      };
    },
    change(state: AppStateStatus) {
      listener?.(state);
    },
  };
}

// The module holds one queue at module scope, so each case imports it fresh, the way a
// launch gets it.
beforeEach(() => {
  vi.resetModules();
  post.mockResolvedValue({ accepted: 1 });
});

describe("bindAppStateFlush", () => {
  // The counterpart of the web's page-hide: what is queued when the user leaves has to go
  // out then, because the OS may never let the interval run again — and the app switcher
  // (`inactive`) is as final as the home button.
  it("flushes what is queued whenever the app leaves the foreground, and stops once unbound", async () => {
    const { bindAppStateFlush } = await import("./analytics");
    const { anonymousId } = await import("~/data/analytics");
    const send = vi.fn().mockResolvedValue({ accepted: 1 });
    const queue = createAnalyticsQueue({ send, anonymousId });
    const appState = fakeAppState();
    const unbind = bindAppStateFlush(() => {
      queue.flush();
    }, appState);

    queue.track(EVENT);
    appState.change("active");
    expect(send).not.toHaveBeenCalled();

    appState.change("inactive");
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(TrackEventsRequest.parse(send.mock.calls[0][0]).events.map((tracked) => tracked.event)).toEqual([EVENT]);

    queue.track(EVENT);
    appState.change("background");
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));

    unbind();
    queue.track(EVENT);
    appState.change("background");
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("useAnalytics", () => {
  it("hands every caller the same stable surface: track, and nothing else", async () => {
    const { useAnalytics } = await import("./analytics");
    const { result, rerender } = renderHook(() => useAnalytics());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(Object.keys(first)).toEqual(["track"]);
  });
});

describe("bootAnalytics", () => {
  // The whole device adapter end to end: an event tracked after boot, the app backgrounded,
  // and one contract-valid batch on the app's own transport with the device's id.
  it("after boot, a tracked event then a backgrounded app is one batch through ~/lib/http", async () => {
    const appState = fakeAppState();
    vi.spyOn(AppState, "addEventListener").mockImplementation(appState.addEventListener);
    const { bootAnalytics, useAnalytics } = await import("./analytics");
    const { anonymousId } = await import("~/data/analytics");
    await bootAnalytics();

    useAnalytics().track(EVENT);
    appState.change("background");

    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [path, body] = post.mock.calls[0];
    expect(path).toBe("/api/analytics/events");
    const batch = TrackEventsRequest.parse(body);
    expect(batch.anonymousId).toBe(await anonymousId());
    expect(batch.events.map((tracked) => tracked.event)).toEqual([EVENT]);
  });
});
