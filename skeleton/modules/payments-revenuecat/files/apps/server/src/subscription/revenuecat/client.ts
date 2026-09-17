import type { RevenueCatConfig } from "./revenuecat.config";

/**
 * The part of RevenueCat's REST API v2 this server reads: a customer's subscriptions, and
 * the store identifier behind a product id. Docs: revenuecat.com/docs/api-v2.
 *
 * A reader, never a writer: nothing here grants an entitlement or changes a customer.
 * Access is decided from what RevenueCat says happened, the same way the web's checkout
 * return reads Stripe's own Checkout Session rather than trusting the browser.
 *
 * Plain `fetch`, no SDK: two GETs is not a dependency, and a structural `CustomerReader`
 * is what every spec in this directory hands a stub of.
 */

/** A customer's subscription, as the fields `updateFromCustomer` reads. Times are epoch ms. */
export type RevenueCatSubscription = {
  id: string;
  /** RevenueCat's own product id (`prod…`), null for a promotional grant */
  product_id: string | null;
  /** `app_store`, `play_store`, `rc_billing`, … */
  store: string;
  status: string;
  auto_renewal_status: string;
  /** the store's own verdict on whether he may use what he bought */
  gives_access: boolean;
  starts_at: number;
  current_period_starts_at: number;
  current_period_ends_at: number | null;
  /**
   * The store's id of the *latest* transaction — Apple's newest transaction id, Google's
   * last order id. Not stable across renewals, which is why the row's identity comes from
   * the webhook's `original_transaction_id` and never from here.
   */
  store_subscription_identifier: string;
};

/** The two reads. Structural, so a spec hands in a stub and the ingestion never sees `fetch`. */
export type CustomerReader = {
  subscriptions(appUserId: string): Promise<RevenueCatSubscription[]>;
  /** the store identifier of a RevenueCat product, or null for one the project no longer has */
  storeProductOf(productId: string): Promise<string | null>;
};

const API = "https://api.revenuecat.com/v2";

export class RevenueCatApiError extends Error {
  constructor(
    readonly status: number,
    path: string
  ) {
    super(`RevenueCat answered ${status} to ${path}`);
    this.name = "RevenueCatApiError";
  }
}

type Fetch = typeof fetch;

/**
 * The reader, over `fetch`.
 *
 * A 404 is an answer — a person RevenueCat has never seen has no subscriptions, a product
 * that was deleted has no store id — and everything else that is not a 2xx is thrown, so
 * the caller answers "unconfirmed" rather than "no plan". The difference matters: the first
 * is a fact about a person, the second is a fact about the network, and only one of them is
 * safe to write onto a row.
 */
export function createRevenueCatClient(config: RevenueCatConfig, fetchFn: Fetch = fetch): CustomerReader {
  const headers = { Authorization: `Bearer ${config.secretKey}`, Accept: "application/json" };
  const base = `${API}/projects/${encodeURIComponent(config.projectId)}`;

  async function read<T>(path: string): Promise<T | null> {
    const response = await fetchFn(`${base}${path}`, { headers });
    if (response.status === 404) return null;
    if (!response.ok) throw new RevenueCatApiError(response.status, path);
    return (await response.json()) as T;
  }

  return {
    async subscriptions(appUserId) {
      const page = await read<{ items: RevenueCatSubscription[] }>(
        `/customers/${encodeURIComponent(appUserId)}/subscriptions?limit=100`
      );
      return page?.items ?? [];
    },
    async storeProductOf(productId) {
      const product = await read<{ store_identifier: string }>(`/products/${encodeURIComponent(productId)}`);
      return product?.store_identifier ?? null;
    },
  };
}
