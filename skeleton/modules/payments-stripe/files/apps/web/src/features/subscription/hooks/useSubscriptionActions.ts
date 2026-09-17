import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { SUBSCRIPTION_COPY } from "@domain/subscription/copy";
import { openBillingPortal } from "~/lib/subscription";

/**
 * What can be done with a subscription that already exists: open Stripe's own account page.
 *
 * The plugin offers two more — cancel and restore — and neither is here, because the portal
 * already does both on the page that took the money. A product that wants them in its own UI
 * adds one mutation each beside this one.
 *
 * The page leaves for Stripe on success, so there is no settled state to report; what this
 * owns is the wait and the line that stands when the hand-off is refused.
 */
type SubscriptionActions = {
  manageBilling: () => void;
  pending: boolean;
  error: string | null;
};

export function useSubscriptionActions(): SubscriptionActions {
  const [error, setError] = useState<string | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: () => openBillingPortal(),
    onMutate: () => setError(null),
    onError: () => setError(SUBSCRIPTION_COPY.paywall.failed),
  });

  return { manageBilling: () => mutate(), pending: isPending, error };
}
