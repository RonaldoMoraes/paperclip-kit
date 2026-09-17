import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Linking } from "react-native";
import type { PlanName } from "@contracts/subscription/checkout";
import { StoreFlowError } from "@contracts/subscription/store-errors";
import { STORE_COPY, STORE_LEGAL_URLS } from "@domain/subscription/store-copy";
import { restorePurchases, settleWithServer } from "~/features/subscription/hooks/settle";
import { useStoreAccess } from "~/features/subscription/hooks/useStoreAccess";
import { authClient } from "~/lib/auth";
import { type StoreOffering, store } from "~/lib/store";

export type PaywallRead = {
  /** the offering the store serves, null until it has answered */
  offering: StoreOffering | null;
  /** a trial may still be offered — the server's answer, and the same rule the store's offer follows */
  trialEligible: boolean;
  /** the store answered nothing, or failed — the screen offers a retry */
  unavailable: boolean;
  retry: () => void;
  buy: (plan: PlanName) => void;
  restore: () => void;
  /** a purchase, a restore or the confirmation is in flight — one at a time, or the store queues a second charge */
  pending: boolean;
  error: string | null;
  openTerms: () => void;
  openPrivacy: () => void;
};

/**
 * The paywall's one seam onto the store and the server.
 *
 * The store sells; the server decides. A purchase the store reports is not access until
 * `POST /api/subscription/revenuecat/confirm` has read RevenueCat and written the row, and
 * the session has been read again — the gate flips on that read, so nothing here navigates.
 * A closed sheet is not an error and says nothing; a purchase the server could not confirm,
 * or confirmed as no access, says so, and "Restore purchases" is the way to ask again.
 *
 * The store's customer is made this person right before the sheet opens, whatever the
 * provider managed earlier: a purchase under an anonymous id is one the server's webhook
 * could never attach to anybody.
 */
export function usePaywall(): PaywallRead {
  const { access, user } = useStoreAccess();
  const { refetch: refetchSession } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id ?? null;

  // Keyed by the person: a store may serve different offerings to different customers, and
  // the next person on this phone must not be shown the previous one's out of the cache.
  const { data, isError, refetch } = useQuery({
    queryKey: ["store", "offering", userId],
    queryFn: () => store.offering(),
    staleTime: 5 * 60_000,
  });
  const offering = data ?? null;

  const { mutate: buy, isPending: buying } = useMutation({
    mutationFn: async (plan: PlanName) => {
      const pkg = offering?.packages.find((candidate) => candidate.plan === plan);
      if (!pkg || !user) throw new StoreFlowError(STORE_COPY.errors.storeUnavailable);
      await store.identify({ id: user.id, email: user.email, name: user.name }).catch(() => {
        throw new StoreFlowError(STORE_COPY.errors.storeUnavailable);
      });
      const outcome = await store.purchase(pkg);
      if (outcome.kind === "cancelled") return;
      if (outcome.kind === "failed") throw new StoreFlowError(STORE_COPY.errors.purchaseFailed);
      const settled = await settleWithServer(outcome.storeProductId, refetchSession);
      // They paid and the server does not see it yet: said out loud, never left on the wall.
      if (!settled.active) throw new StoreFlowError(STORE_COPY.errors.confirmFailed);
    },
    onMutate: () => setError(null),
    onError: (failure) => setError(failure.message),
  });

  const { mutate: restore, isPending: restoring } = useMutation({
    mutationFn: () => restorePurchases(refetchSession),
    onMutate: () => setError(null),
    onError: (failure) => setError(failure.message),
  });

  return {
    offering,
    trialEligible: access.trialEligible,
    // `data === null` is the store answering "no offering", which is as unusable as a throw.
    unavailable: isError || (data !== undefined && data === null),
    retry: () => {
      refetch();
    },
    buy: (plan) => buy(plan),
    restore: () => restore(),
    pending: buying || restoring,
    error,
    openTerms: () => {
      Linking.openURL(STORE_LEGAL_URLS.terms).catch(() => setError(STORE_COPY.errors.manageFailed));
    },
    openPrivacy: () => {
      Linking.openURL(STORE_LEGAL_URLS.privacy).catch(() => setError(STORE_COPY.errors.manageFailed));
    },
  };
}
