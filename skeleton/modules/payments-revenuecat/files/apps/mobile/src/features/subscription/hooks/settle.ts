import type { SubscriptionAccess } from "@contracts/subscription/access";
import { confirmStorePurchase } from "@contracts/subscription/confirm-store-purchase";
import { StoreFlowError } from "@contracts/subscription/store-errors";
import { STORE_COPY } from "@domain/subscription/store-copy";
import { http } from "~/lib/http";
import { store } from "~/lib/store";

/**
 * The one step after a purchase, and the whole of a restore.
 *
 * The store said what was bought; only this makes it access. The server reads RevenueCat
 * itself and writes the row, the session is read again, and the gate flips on that read —
 * so nothing here navigates and nothing here decides.
 */
export async function settleWithServer(
  storeProductId: string | null,
  refetchSession: () => Promise<unknown>
): Promise<SubscriptionAccess> {
  const settled = await confirmStorePurchase(http, { storeProductId }).catch(() => {
    throw new StoreFlowError(STORE_COPY.errors.confirmFailed);
  });
  await refetchSession();
  return settled.access;
}

/**
 * "Restore purchases", from the paywall or from Settings: the store re-attaches this store
 * account's receipt, the server reads RevenueCat, the session is read again.
 *
 * Finding nothing is a line to read, not a silent success — a restore that quietly did
 * nothing is indistinguishable from one that failed, and the person who paid is the one
 * left guessing.
 */
export async function restorePurchases(refetchSession: () => Promise<unknown>): Promise<void> {
  await store.restore().catch(() => {
    throw new StoreFlowError(STORE_COPY.errors.storeUnavailable);
  });
  const access = await settleWithServer(null, refetchSession);
  if (!access.active) throw new StoreFlowError(STORE_COPY.errors.restoreNothing);
}
