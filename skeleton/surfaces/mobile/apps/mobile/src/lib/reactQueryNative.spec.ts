import { onlineManager } from "@tanstack/react-query";
import { setTestPlatform } from "@test/platform";
import { AppState } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The seam is the device: `expo-network` and `AppState`. React Query's managers are the
 * real ones — what this file tells them is the whole of what it does, so a stub in their
 * place would test the stub.
 */
const getNetworkStateAsync = vi.fn<() => Promise<{ isConnected: boolean }>>();
const removeNetworkSubscription = vi.fn();
const removeAppStateSubscription = vi.fn();

vi.mock("expo-network", () => ({
  getNetworkStateAsync: () => getNetworkStateAsync(),
  addNetworkStateListener: (listener: (state: { isConnected: boolean }) => void) => {
    networkListener = listener;
    return { remove: removeNetworkSubscription };
  },
}));

let networkListener: ((state: { isConnected: boolean }) => void) | null = null;

// Imported after the mock's own closures exist: the factory runs on this import, and a
// static one would run it before the spies above are built.
const { installNativeRuntimeSignals } = await import("./reactQueryNative");

describe("installNativeRuntimeSignals", () => {
  /** set only where the test does not tear down itself, so the manager never leaks a listener */
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    networkListener = null;
    getNetworkStateAsync.mockResolvedValue({ isConnected: true });
    vi.spyOn(AppState, "addEventListener").mockReturnValue({ remove: removeAppStateSubscription });
    onlineManager.setOnline(true);
  });

  afterEach(() => {
    teardown?.();
    teardown = null;
    // The managers are process-wide: a listener left wired would answer the next spec.
    onlineManager.setEventListener(() => () => undefined);
    onlineManager.setOnline(true);
  });

  // The web target has the browser's own `online`/`offline` events and window focus, which
  // are the better listeners; installing over them would replace them with worse ones.
  it("installs nothing on the web", () => {
    setTestPlatform("web");

    teardown = installNativeRuntimeSignals();

    expect(networkListener).toBeNull();
    expect(AppState.addEventListener).not.toHaveBeenCalled();
  });

  // The device only reports a change, so a launch that begins offline would read as online
  // until the connection moved — and a query that failed on it would never be retried.
  it("asks the device what the connection is rather than waiting for it to change", async () => {
    getNetworkStateAsync.mockResolvedValue({ isConnected: false });

    teardown = installNativeRuntimeSignals();

    await vi.waitFor(() => expect(onlineManager.isOnline()).toBe(false));
  });

  // The read is a promise the teardown does not wait for. Setting online on a listener that
  // has already been dropped is what leaves a stale signal behind the one that replaced it.
  it("drops an answer that lands after it has been torn down", async () => {
    let answer: (state: { isConnected: boolean }) => void = () => undefined;
    const asked = new Promise<{ isConnected: boolean }>((resolve) => {
      answer = resolve;
    });
    getNetworkStateAsync.mockReturnValue(asked);

    installNativeRuntimeSignals()();
    answer({ isConnected: false });
    await asked;
    await Promise.resolve();

    expect(onlineManager.isOnline()).toBe(true);
  });

  // Unanswerable is not offline: assuming online keeps a mutation running, where pausing it
  // on a guess strands a user whose connection was fine all along.
  it("reads a connection it could not ask about as online", async () => {
    onlineManager.setOnline(false);
    getNetworkStateAsync.mockRejectedValue(new Error("no radio"));

    teardown = installNativeRuntimeSignals();

    await vi.waitFor(() => expect(onlineManager.isOnline()).toBe(true));
  });

  // One teardown for both, because the layout installs them as one: a half-dropped pair
  // leaves a subscription pointing at a manager the next install has already replaced.
  it("drops both device subscriptions", () => {
    installNativeRuntimeSignals()();

    expect(removeNetworkSubscription).toHaveBeenCalledTimes(1);
    expect(removeAppStateSubscription).toHaveBeenCalledTimes(1);
  });
});
