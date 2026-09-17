import { redirect } from "@tanstack/react-router";
import { readSubscriptionAccess } from "@contracts/subscription/access";

/**
 * The entitlement, as a route reads it: off the session, never derived.
 *
 * The server computed it once (`subscription.service.ts`), the `auth-extensions` port put it
 * on the session payload, and the session gate already resolved that payload — so this is a
 * field read, not a question asked. A product puts a destination behind it by nesting the
 * route under `app/routes/_app/_paid.tsx`.
 */
export function requireAccess(session: unknown): void {
  if (!readSubscriptionAccess(session).active) throw redirect({ to: "/paywall", replace: true });
}
