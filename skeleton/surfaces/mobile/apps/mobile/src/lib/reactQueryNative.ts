import { focusManager, onlineManager } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState, Platform } from "react-native";

/**
 * React Query's two runtime signals, wired to the device.
 *
 * On the web they come from the browser for free — `navigator.onLine` and the window's
 * focus. React Native has neither, so without this the client believes it is permanently
 * online and permanently focused: a query that failed on a dead connection never retries
 * when the connection comes back, and returning from the background refetches nothing.
 * This app has a web target too, where React Query's own listeners are the better ones,
 * so on web the install is a no-op.
 *
 * Installed once from the root layout, not from a screen: these are process-wide managers
 * and a second installation would replace the first listener rather than add to it.
 * Returns the one teardown for both.
 */
export function installNativeRuntimeSignals(): () => void {
  if (Platform.OS === "web") return () => undefined;

  onlineManager.setEventListener((setOnline) => {
    let live = true;

    // The listener only fires on a change, so the first state has to be asked for. By the
    // time it answers the manager may already have been torn down, and setting online on
    // a dead listener is what would leave a stale signal behind.
    async function readInitialState(): Promise<void> {
      try {
        const state = await Network.getNetworkStateAsync();
        if (live) setOnline(Boolean(state.isConnected));
      } catch {
        // Unanswerable is not offline: assuming online keeps a mutation running rather
        // than pausing it on a guess.
        if (live) setOnline(true);
      }
    }
    readInitialState();

    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(Boolean(state.isConnected));
    });

    return () => {
      live = false;
      subscription.remove();
    };
  });

  const appState = AppState.addEventListener("change", (status) => {
    focusManager.setFocused(status === "active");
  });

  return () => {
    // `setEventListener` runs the previous listener's teardown before installing the new
    // one, so handing it a no-op is what actually drops the expo-network subscription.
    onlineManager.setEventListener(() => () => undefined);
    appState.remove();
  };
}
