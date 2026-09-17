import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { getState, rememberVisitedItem, resetAll, useAppState } from "./store";

// Bare `renderHook`: the store is a module of its own and touches no provider.
describe("store", () => {
  beforeEach(() => resetAll());

  it("starts as a first visit", () => {
    expect(getState()).toEqual({ lastVisitedItemId: null });
  });

  // The list marks the row from this value, so a reader mounted before the visit has to
  // hear about it rather than read it once at mount.
  it("remembers the visited item and tells every mounted reader", () => {
    const { result } = renderHook(() => useAppState());
    expect(result.current.lastVisitedItemId).toBeNull();

    // biome-ignore lint/plugin: the store notifies outside React, and there is nothing to waitFor — the subscribers are committed when it does.
    act(() => rememberVisitedItem("first-thing"));

    expect(result.current.lastVisitedItemId).toBe("first-thing");
    expect(getState().lastVisitedItemId).toBe("first-thing");
  });

  it("resetAll wipes back to a first visit", () => {
    rememberVisitedItem("first-thing");
    resetAll();
    expect(getState()).toEqual({ lastVisitedItemId: null });
  });
});
