import { Linking, Platform } from "react-native";
import { StoreFlowError } from "@contracts/subscription/store-errors";
import { STORE_COPY } from "@domain/subscription/store-copy";
import { restorePurchases } from "~/features/subscription/hooks/settle";
import type { SettingsAction } from "~/kit.types";
import { authClient } from "~/lib/auth";
import { MANAGE_SUBSCRIPTION_URL } from "~/lib/store";

/** The store's own subscriptions page for the platform this binary is running on. */
export function manageSubscriptionUrl(): string {
  return Platform.OS === "android" ? MANAGE_SUBSCRIPTION_URL.android : MANAGE_SUBSCRIPTION_URL.ios;
}

/**
 * Tell the session store to read again. Settings has no `useSession()` of its own — a row is
 * a plain function, not a hook — and the signal is what the auth client's own sign-out uses
 * to make every `useSession()` in the tree fetch a fresh payload. The gate moves on that.
 */
async function refreshSession(): Promise<void> {
  authClient.$store.notify("$sessionSignal");
}

/**
 * The two rows this module puts on Settings.
 *
 * **Manage** opens the store's own subscriptions page and this app ships no cancel button of
 * its own: the store took the money, so cancelling, changing plan and fixing a card all
 * happen there, and a button here could only lie about having done it.
 *
 * **Restore** is the one that finishes here — the store re-attaches this store account's
 * receipt, the server reads RevenueCat, and the session is read again so the gate sees what
 * is held. It is also the answer to every "I paid and it didn't arrive": the purchase is on
 * the store account, and asking the server to look again costs nothing.
 *
 * Both throw rather than swallow: `useSettingsActions` runs a row as a mutation and prints
 * what it threw under the list, so a store that would not open is a line and not a shrug.
 */
export const settingsActions: SettingsAction[] = [
  {
    id: "manage-subscription",
    label: STORE_COPY.settings.manage,
    run: async () => {
      await Linking.openURL(manageSubscriptionUrl()).catch(() => {
        throw new StoreFlowError(STORE_COPY.errors.manageFailed);
      });
    },
  },
  {
    id: "restore-purchases",
    label: STORE_COPY.settings.restore,
    // The session read is what moves the gate; nothing here navigates.
    run: () => restorePurchases(refreshSession),
  },
];
