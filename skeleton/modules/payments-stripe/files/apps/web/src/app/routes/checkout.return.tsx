import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { readSubscriptionAccess } from "@contracts/subscription/access";
import { confirmCheckoutQuery } from "@contracts/subscription/confirm-checkout";
import { CheckoutReturn } from "~/features/subscription/screens/CheckoutReturn";
import { http } from "~/lib/http";
import { readSession } from "~/lib/session";
import { refreshSubscription } from "~/lib/subscription";

/**
 * Where Stripe hands the browser back.
 *
 * One question, asked once. Stripe returns the moment the payment — or, on a free trial, the
 * setup — is done, which can be before its webhook lands, so the loader neither waits for the
 * webhook nor polls: it hands Stripe's own Checkout Session id to the server, which reads
 * that session and writes what it says. A trial counts as confirmed, which is the whole
 * reason the plugin's own success route is not used.
 *
 * Arriving without a session id — a bookmark, a back button — has no checkout to settle and
 * falls back to what the session already says.
 *
 * A failure is not an error screen: "we couldn't confirm it" is the truth from the buyer's
 * side whether the call 500ed or Stripe knew nothing, and the screen already says it.
 */
const CheckoutSearch = z.object({ sessionId: z.string().optional().catch(undefined) });

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>) => CheckoutSearch.parse(search),
  loaderDeps: ({ search }) => ({ sessionId: search.sessionId }),
  beforeLoad: async ({ context, location }) => {
    const session = await readSession(context.queryClient);
    if (!session) throw redirect({ to: "/account", search: { redirect: location.href }, replace: true });
  },
  loader: async ({ context, deps }) => {
    const settled = deps.sessionId
      ? await context.queryClient.ensureQueryData(confirmCheckoutQuery(http, deps.sessionId)).catch(() => null)
      : null;

    // The access field on the session is what every guarded screen reads, and a settled
    // checkout has just changed it underneath them.
    await refreshSubscription(context.queryClient);

    if (settled?.confirmed) return { active: settled.access.active, status: settled.access.status };

    const fromSession = readSubscriptionAccess(await readSession(context.queryClient));
    return { active: fromSession.active, status: fromSession.status };
  },
  component: CheckoutReturnRoute,
});

function CheckoutReturnRoute() {
  const { active, status } = Route.useLoaderData();
  return <CheckoutReturn active={active} status={status} />;
}
