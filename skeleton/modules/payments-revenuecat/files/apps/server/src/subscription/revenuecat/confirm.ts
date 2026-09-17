import type { ConfirmStorePurchaseResponse } from "@contracts/subscription/confirm-store-purchase";
import type { Telemetry } from "../../common/ports/telemetry";
import { type SubscriptionReader, subscriptionAccess } from "../subscription.service";
import type { CustomerReader } from "./client";
import { currentSubscription, updateFromCustomer } from "./customer";
import type { PlanOf } from "./events";
import { type StoreSubscriptionIo, applyStoreUpdate } from "./webhook";

/**
 * The store purchase, settled in one read — the phone's `confirmCheckout`.
 *
 * The store sheet closes before RevenueCat's webhook has necessarily landed, and the SDK's
 * answer is the device's word. So the server asks RevenueCat what this person holds and
 * writes that onto their row; the app then refreshes the session and the gate reads the
 * access the server decided. Idempotent — the same customer reconciles to the same row,
 * which is also what makes it the right call after "Restore purchases" and the way back
 * from a delivery that was missed.
 *
 * The product the app says was bought is compared and reported, never obeyed: what someone
 * holds is RevenueCat's to say.
 *
 * The access that comes back is `subscriptionAccess`, unchanged — the same function the
 * session carries the answer from. Two readings of "who has paid" are two answers waiting
 * to disagree, and the person on the wrong side of the disagreement is a paying one.
 */
export async function confirmStorePurchase(
  deps: {
    db: SubscriptionReader;
    io: StoreSubscriptionIo;
    reader: CustomerReader;
    planOf: PlanOf;
    telemetry: Telemetry;
  },
  userId: string,
  claimedProductId: string | null
): Promise<ConfirmStorePurchaseResponse> {
  const { db, io, reader, planOf, telemetry } = deps;

  const current = currentSubscription(await reader.subscriptions(userId));
  // RevenueCat has never heard of this customer, or holds nothing for them. Not a failure:
  // it is the honest answer to "did I buy something", and their own access comes back with it.
  if (!current) return { confirmed: false, access: await subscriptionAccess(db, userId) };

  const storeProductId = current.product_id ? await reader.storeProductOf(current.product_id) : null;
  if (claimedProductId && storeProductId && claimedProductId !== storeProductId) {
    telemetry.event("subscription.store.claim-mismatch", { userId, claimedProductId, storeProductId });
  }

  const row = await io.subscription.findFirst({ where: { reference_id: userId }, orderBy: { created_at: "desc" } });
  await applyStoreUpdate(io, userId, updateFromCustomer(current, storeProductId, planOf), row);

  return { confirmed: true, access: await subscriptionAccess(db, userId) };
}
