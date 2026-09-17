import { createFileRoute, redirect } from "@tanstack/react-router";
import { managedOnWeb, readSubscriptionAccess } from "@contracts/subscription/access";
import { useSubscriptionActions } from "~/features/subscription/hooks/useSubscriptionActions";
import { useUpgrade } from "~/features/subscription/hooks/useUpgrade";
import { Paywall } from "~/features/subscription/screens/Paywall";
import { readSession } from "~/lib/session";

/**
 * The paywall sits beside `_app`, not under it: it carries no tab shell, and it is where
 * the entitlement layout sends people, so it cannot itself be behind that layout.
 *
 * There is nothing to load. Whether a trial may still be offered, and whether there is a
 * plan on record that stopped paying, are both on the session — decided by the server, which
 * is also what decides the charge. The session gate does not run out here, so this asks for
 * one itself; somebody who already has a plan is sent on, or the wall would sell a second
 * one the server refuses.
 */
export const Route = createFileRoute("/paywall")({
  beforeLoad: async ({ context }) => {
    const session = await readSession(context.queryClient);
    if (!session) throw redirect({ to: "/account", search: { redirect: "/paywall" }, replace: true });
    const access = readSubscriptionAccess(session);
    if (access.active) throw redirect({ to: "/", replace: true });
    return { access };
  },
  component: PaywallRoute,
});

function PaywallRoute() {
  const { access } = Route.useRouteContext();
  const upgrade = useUpgrade();
  const billing = useSubscriptionActions();

  return (
    <Paywall
      plans={upgrade.plans}
      plan={upgrade.plan}
      trialEligible={access.trialEligible}
      status={access.status}
      managedHere={managedOnWeb(access)}
      pending={upgrade.pending || billing.pending}
      error={upgrade.error ?? billing.error}
      onChoose={upgrade.choose}
      onSubmit={upgrade.start}
      onManageBilling={billing.manageBilling}
    />
  );
}
