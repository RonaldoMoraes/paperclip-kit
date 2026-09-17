import { act, renderHook, waitFor } from "@testing-library/react";
import { AccessibilityInfo } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { READ_DEADLINE_MS, useReduceMotion } from "./reduceMotion";

/** Bare `renderHook`: the hook reads a device setting and touches no provider. */
describe("useReduceMotion", () => {
  afterEach(() => vi.useRealTimers());

  it("follows the setting the read answers with", async () => {
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);

    const { result } = renderHook(() => useReduceMotion());

    await waitFor(() => expect(result.current).toBe(true));
  });

  it("settles to motion allowed when the read refuses", async () => {
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockRejectedValue(new Error("unavailable"));

    const { result } = renderHook(() => useReduceMotion());

    await waitFor(() => expect(result.current).toBe(false));
  });

  // Callers hold their content back while this is null, so a read that never answers would
  // leave the screen empty for good.
  it("settles to motion allowed when the read never answers", () => {
    vi.useFakeTimers();
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(new Promise<boolean>(() => undefined));

    const { result } = renderHook(() => useReduceMotion());
    expect(result.current).toBeNull();

    // biome-ignore lint/plugin: reaching the deadline is an update no interaction drives, and there is nothing to waitFor while the read hangs.
    act(() => {
      vi.advanceTimersByTime(READ_DEADLINE_MS);
    });

    expect(result.current).toBe(false);
  });
});
