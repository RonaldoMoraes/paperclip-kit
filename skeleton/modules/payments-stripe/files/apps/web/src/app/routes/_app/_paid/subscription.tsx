import { createFileRoute } from "@tanstack/react-router";
import { managedOnWeb, readSubscriptionAccess } from "@contracts/subscription/access";
import { useSubscriptionActions } from "~/features/subscription/hooks/useSubscriptionActions";
import { Subscription } from "~/features/subscription/screens/Subscription";

/**
 * The plan screen — behind `_paid`, because a plan is what it is about: somebody without one
 * is at the paywall, not here.
 *
 * Nothing to load. The access the layout above already read is on the session, and this
 * reads the same field rather than asking Stripe what was bought.
 */
export const Route = createFileRoute("/_app/_paid/subscription")({
  component: SubscriptionRoute,
});

function SubscriptionRoute() {
  const { session } = Route.useRouteContext();
  const access = readSubscriptionAccess(session);
  const billing = useSubscriptionActions();

  return (
    <Subscription
      plan={access.plan}
      status={access.status}
      ending={access.ending}
      endsAt={access.endsAt}
      managedHere={managedOnWeb(access)}
      pending={billing.pending}
      error={billing.error}
      onManageBilling={billing.manageBilling}
    />
  );
}
