import { useEffect, useRef } from "react";
import type { SessionUser } from "@contracts/auth/session";
import { store } from "~/lib/store";

/**
 * The store's customer is the signed-in user, and nobody when they are signed out.
 *
 * Account before paywall. The app user id RevenueCat sees is the auth user id, set the
 * moment the session resolves and before anything is sold, so no purchase is ever anonymous
 * and no alias merge is ever needed — the server's webhook finds the person by that id.
 * Email and name ride along as customer attributes and are sent again when either changes.
 * Signing out returns the SDK to an anonymous customer, so the next person on this phone
 * does not inherit the last one's receipt.
 *
 * Fire and forget: the store failing to hear who this is must not hold the app. The paywall
 * identifies again, awaited, right before it sells (`usePaywall`), so a failure here is a
 * retry there rather than an anonymous purchase.
 */
export function useStoreIdentity(user: SessionUser | null): void {
  const previous = useRef<string | null>(null);
  const id = user?.id ?? null;
  const email = user?.email ?? null;
  const name = user?.name ?? null;

  useEffect(() => {
    const key = id ? JSON.stringify([id, email, name]) : null;
    if (key === previous.current) return;
    const wasSignedIn = previous.current !== null;
    previous.current = key;
    const sync = id && email ? store.identify({ id, email, name }) : wasSignedIn ? store.forget() : Promise.resolve();
    sync.catch((error) => console.warn("[store] could not sync the customer:", error));
  }, [id, email, name]);
}
