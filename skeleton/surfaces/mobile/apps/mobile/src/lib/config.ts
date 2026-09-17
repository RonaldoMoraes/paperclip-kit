import { Platform } from "react-native";

/**
 * The one server this app talks to: `apps/server`. There is no other backend.
 *
 * The defaults are the two ways a simulator reaches a process on the host machine: the
 * Android emulator NATs the host to 10.0.2.2, the iOS simulator shares the host's
 * loopback. A physical device needs EXPO_PUBLIC_API_URL set to the LAN address.
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || (Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000");

/**
 * `mock` answers every `/api` call inside the app; anything else is real. `index.ts`
 * installs the network mocks on this value, and a module's seam (a store, an SDK) picks
 * its implementation on it.
 */
export const API_MODE = process.env.EXPO_PUBLIC_API_MODE === "mock" ? "mock" : "real";

/** Deep-link scheme; the server trusts it as an origin, and a module's storage keys are prefixed with it. */
export const APP_SCHEME = process.env.EXPO_PUBLIC_SCHEME || "__SCHEME__";
