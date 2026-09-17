import type { PlanName } from "@contracts/subscription/checkout";

/**
 * The store, as this app sees it: the offering being served, a purchase, a restore, and who
 * the customer is. RevenueCat's SDK stands behind it in a real build and a canned store in
 * mock mode — a screen or a hook never imports either directly, so the paywall renders
 * against the mock with no native module and no store account.
 *
 * Nothing here grants access. The store says what was bought; the server, asked through
 * `confirmStorePurchase`, decides what that earns and puts it on the session.
 */

/** The product's introductory offer as the store states it — a free trial prices at 0 — or null. */
export type StoreIntroOffer = {
  price: number;
  /** "$0.00" for a trial, "$1.00" for a paid first week */
  priceString: string;
  /** ISO 8601 duration of the offer's period, e.g. "P1W" */
  period: string;
  periodUnit: string;
  periodNumberOfUnits: number;
};

/** One purchasable plan of the served offering, priced as the store formats it. */
export type StorePackage = {
  /** RevenueCat's package identifier, `$rc_monthly` or `$rc_annual` */
  identifier: string;
  plan: PlanName;
  /** the store product behind it — what the server records and maps back to the plan */
  storeProductId: string;
  /** the renewal price in the person's own currency and the store's own format, e.g. "$14.50" */
  priceString: string;
  price: number;
  intro: StoreIntroOffer | null;
};

/** The offering the SDK serves as current, and the plans in it. */
export type StoreOffering = {
  identifier: string;
  packages: StorePackage[];
};

export type PurchaseOutcome =
  | { kind: "purchased"; storeProductId: string }
  /** the sheet was closed — not an error, and nothing to say about it */
  | { kind: "cancelled" }
  | { kind: "failed"; message: string };

/** Who the store's customer is: the signed-in user, with what the dashboard shows beside the id. */
export type StoreCustomer = {
  /** the auth user id — RevenueCat's app user id, and how the server's webhook finds the person */
  id: string;
  email: string;
  name?: string | null;
};

export type Store = {
  /** the customer is this user; called when the session resolves, before anything is sold */
  identify(customer: StoreCustomer): Promise<void>;
  /** back to an anonymous customer, on sign-out */
  forget(): Promise<void>;
  /** the offering the dashboard serves, or null when the store has none */
  offering(): Promise<StoreOffering | null>;
  purchase(pkg: StorePackage): Promise<PurchaseOutcome>;
  /** asks the store for the receipt on this device's store account and attaches it to the customer */
  restore(): Promise<void>;
};

/**
 * Where the store lets somebody manage a subscription bought there.
 *
 * Cancelling, changing plan and fixing a card all live on those pages and nowhere else:
 * the store took the money, and neither this app nor the web's billing portal can let it go
 * on the store's behalf.
 */
export const MANAGE_SUBSCRIPTION_URL = {
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
} as const;
