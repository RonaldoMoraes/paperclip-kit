import { Platform } from "react-native";
import type { PurchasesOffering, PurchasesPackage } from "react-native-purchases";
import { planOfPackage } from "@contracts/subscription/store-products";
import type { PurchaseOutcome, Store, StoreOffering, StorePackage } from "./types";

/**
 * The store over RevenueCat's SDK.
 *
 * Imported lazily, on the first call. `react-native-purchases` is a native module: Expo Go
 * and any dev client built before it was added have no `RNPurchases` to link, and a static
 * import would throw at module load and take mock mode — which never touches the store —
 * down with it. The SDK is configured once, on that first call, with the platform's public
 * key; a build with no key has no store and every call says so.
 */
type Sdk = typeof import("react-native-purchases");

/**
 * The public SDK key for the platform this binary is running on.
 *
 * The two reads live here rather than in `src/lib/config.ts` because a module cannot add a
 * line to the surface's file; both are catalogued in `apps/mobile/.env.example` like every
 * other `EXPO_PUBLIC_*`, and both are inlined by Metro at build time, so a key change needs
 * a restarted bundler.
 */
export function storeApiKey(): string | undefined {
  return Platform.OS === "ios"
    ? // biome-ignore lint/plugin: the one reader of EXPO_PUBLIC_REVENUECAT_IOS_KEY — a module cannot add it to the surface's config.ts
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.trim()
    : // biome-ignore lint/plugin: the one reader of EXPO_PUBLIC_REVENUECAT_ANDROID_KEY, beside the iOS key
      process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?.trim();
}

/** RevenueCat's Test Store: the sheet opens, the flow is real, and no money ever moves. */
const TEST_STORE_PREFIX = "test_";

let sdk: Promise<Sdk["default"]> | null = null;

async function purchases(): Promise<Sdk["default"]> {
  if (!sdk) {
    sdk = (async () => {
      const module = await import("react-native-purchases");
      const Purchases = module.default;
      const apiKey = storeApiKey();
      if (!apiKey) throw new Error("[store] no RevenueCat key for this platform — see apps/mobile/.env.example");
      if (__DEV__) {
        await Purchases.setLogLevel(module.LOG_LEVEL.DEBUG);
        if (apiKey.startsWith(TEST_STORE_PREFIX)) {
          console.info("[store] RevenueCat Test Store key — purchases succeed and nothing is charged.");
        }
      }
      Purchases.configure({ apiKey });
      return Purchases;
    })();
    // A failed configure is not remembered as the store: the next call tries again.
    sdk.catch(() => {
      sdk = null;
    });
  }
  return sdk;
}

/** Forgets the configured SDK, so the next call builds it again. For specs. */
export function resetStoreForTest(): void {
  sdk = null;
}

/** A package as the paywall reads it, or null for one whose plan this app does not sell. */
export function packageFrom(pkg: PurchasesPackage): StorePackage | null {
  const plan = planOfPackage(pkg.identifier);
  if (!plan) return null;
  return {
    identifier: pkg.identifier,
    plan,
    storeProductId: pkg.product.identifier,
    priceString: pkg.product.priceString,
    price: pkg.product.price,
    intro: pkg.product.introPrice
      ? {
          price: pkg.product.introPrice.price,
          priceString: pkg.product.introPrice.priceString,
          period: pkg.product.introPrice.period,
          periodUnit: pkg.product.introPrice.periodUnit,
          periodNumberOfUnits: pkg.product.introPrice.periodNumberOfUnits,
        }
      : null,
  };
}

export function offeringFrom(offering: PurchasesOffering): StoreOffering {
  return {
    identifier: offering.identifier,
    packages: offering.availablePackages.map(packageFrom).filter((pkg): pkg is StorePackage => pkg !== null),
  };
}

/** `purchasePackage` rejects on a closed sheet too; the SDK marks that one `userCancelled`. */
export function outcomeOf(error: unknown): PurchaseOutcome {
  const failure = error as { userCancelled?: boolean | null; message?: string } | null;
  if (failure?.userCancelled) return { kind: "cancelled" };
  return { kind: "failed", message: failure?.message ?? String(error) };
}

export const revenueCatStore: Store = {
  async identify(customer) {
    const Purchases = await purchases();
    // `logIn` with the id the SDK already holds is a no-op on their side; asking first saves
    // the round trip on every session read.
    if ((await Purchases.getAppUserID()) !== customer.id) await Purchases.logIn(customer.id);
    // The reserved attributes the dashboard and the customer search read, so a support
    // question is about a person and not a number. The SDK syncs only what changed.
    await Purchases.setAttributes({ $email: customer.email, $displayName: customer.name ?? null });
  },
  async forget() {
    const Purchases = await purchases();
    // `logOut` throws on an anonymous customer, and somebody who never signed in is one.
    if (!(await Purchases.isAnonymous())) await Purchases.logOut();
  },
  async offering() {
    const Purchases = await purchases();
    const { current } = await Purchases.getOfferings();
    return current ? offeringFrom(current) : null;
  },
  async purchase(pkg) {
    const Purchases = await purchases();
    // The package is re-read from the SDK rather than reconstructed: `purchasePackage` takes
    // the object the SDK handed out, and one built here would not be it.
    const { current } = await Purchases.getOfferings();
    const target = current?.availablePackages.find((candidate) => candidate.identifier === pkg.identifier);
    if (!target) return { kind: "failed", message: "That plan is no longer offered." };
    try {
      await Purchases.purchasePackage(target);
      return { kind: "purchased", storeProductId: target.product.identifier };
    } catch (error) {
      return outcomeOf(error);
    }
  },
  async restore() {
    const Purchases = await purchases();
    await Purchases.restorePurchases();
  },
};
