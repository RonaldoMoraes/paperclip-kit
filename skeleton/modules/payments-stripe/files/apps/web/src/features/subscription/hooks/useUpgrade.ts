import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { PLANS, type PlanName } from "@contracts/subscription/checkout";
import { SUBSCRIPTION_COPY } from "@domain/subscription/copy";
import { startCheckout } from "~/lib/subscription";

/**
 * The paywall's one action, and the choice in front of it.
 *
 * Nothing sent from here decides money: the server holds the price ids and reads the trial
 * history itself, so the plan name is a choice between two things it already sells and not a
 * number a browser gets to name. On success the page has already left for Stripe — there is
 * nothing to navigate to.
 */
type Upgrade = {
  plans: readonly PlanName[];
  plan: PlanName;
  choose: (plan: PlanName) => void;
  start: () => void;
  pending: boolean;
  error: string | null;
};

export function useUpgrade(): Upgrade {
  const [plan, choose] = useState<PlanName>(PLANS[1]);
  const [error, setError] = useState<string | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: (chosen: PlanName) => startCheckout(chosen),
    onMutate: () => setError(null),
    onError: () => setError(SUBSCRIPTION_COPY.paywall.failed),
  });

  return {
    plans: PLANS,
    plan,
    choose,
    start: () => mutate(plan),
    pending: isPending,
    error,
  };
}
