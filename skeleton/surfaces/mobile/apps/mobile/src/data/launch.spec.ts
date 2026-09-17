import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { isLaunchDone, markLaunchDone, resetLaunchForTest, useLaunchDone } from "./launch";

// Bare `renderHook`: the store is a module of its own and touches no provider.
describe("launch", () => {
  beforeEach(() => resetLaunchForTest());

  // The flag outlives the remount a gate flip gives `index`, so every reader has to hear
  // about it rather than read it once at mount.
  it("tells every mounted reader a step is behind this launch", () => {
    const first = renderHook(() => useLaunchDone("splash-hidden"));
    const second = renderHook(() => useLaunchDone("splash-hidden"));
    expect(first.result.current).toBe(false);
    expect(second.result.current).toBe(false);

    // biome-ignore lint/plugin: the store notifies outside React, and there is nothing to waitFor — the subscribers are committed when it does.
    act(() => markLaunchDone("splash-hidden"));

    expect(first.result.current).toBe(true);
    expect(second.result.current).toBe(true);
    expect(isLaunchDone("splash-hidden")).toBe(true);
  });
});
