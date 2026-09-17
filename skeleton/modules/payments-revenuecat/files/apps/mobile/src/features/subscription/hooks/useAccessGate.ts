import { useStoreAccess } from "~/features/subscription/hooks/useStoreAccess";
import type { Gate } from "~/kit.types";

/** Where somebody without a subscription is sent. Outside `(app)`, so the gate can close that group. */
export const PAYWALL_ROUTE = "/paywall" as const;

/**
 * The module's gate (`KIT_GATES`): the app opens on an active subscription, and a launch
 * without one lands on the paywall.
 *
 * The access is the server's, read off the session — never derived here from anything the
 * store said. Three answers, and the order matters:
 *
 *   pending    — the splash stays up and nothing is decided (`ready: false`).
 *   signed out — allowed, with no redirect. The auth module's gate is ahead of this one in
 *                `KIT_GATES` and already refuses with `/sign-in`; answering "not paid" for
 *                somebody who has not signed in yet would race it for the redirect and send
 *                a new arrival to a paywall instead of to an account.
 *   signed in  — `access.active` decides, and the paywall is where a no goes.
 *
 * This puts the *whole* signed-in app behind the subscription, which is the shape a
 * store-sold app usually has. A product with a free tier takes this off `mobile.gates` and
 * calls it from the routes that are paid for — `docs/payments-revenuecat.md`, The gate.
 */
export const useAccessGate: Gate = () => {
  const { access, signedIn, pending } = useStoreAccess();

  if (pending) return { ready: false, allow: false };
  if (!signedIn) return { ready: true, allow: true };

  return { ready: true, allow: access.active, redirectTo: access.active ? undefined : PAYWALL_ROUTE };
};
