import { API_MODE } from "~/lib/config";
import { mockStore } from "./mock";
import { revenueCatStore } from "./revenuecat";
import type { Store } from "./types";

export type { PurchaseOutcome, Store, StoreCustomer, StoreIntroOffer, StoreOffering, StorePackage } from "./types";
export { MANAGE_SUBSCRIPTION_URL } from "./types";

/**
 * The one store this app talks to, decided by the run mode exactly as the network layer is.
 *
 * Mock mode never loads the SDK — `./revenuecat` imports `react-native-purchases` lazily,
 * on the first call — so the paywall runs on Expo Go and on a dev client built before this
 * module existed. That is the whole reason this seam is a module boundary and not an `if`
 * inside the adapter.
 */
export const store: Store = API_MODE === "mock" ? mockStore : revenueCatStore;
