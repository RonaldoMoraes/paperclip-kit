import { createFileRoute } from "@tanstack/react-router";
import { requireAccess } from "~/lib/access";

/**
 * Everything a subscription pays for.
 *
 * Pathless — it adds no URL segment — and nested inside `_app`, so the session gate has
 * already run and its answer is in the context this reads. A product puts a destination
 * behind the paywall by moving its route file under `app/routes/_app/_paid/`; nothing else
 * changes, and no gate is added to the whole app.
 *
 * The paywall and the checkout return deliberately stay outside: both are places somebody
 * without a subscription has to be able to reach, and a checkout confirmed from Stripe can
 * arrive a moment before the session says so.
 */
export const Route = createFileRoute("/_app/_paid")({
  beforeLoad: ({ context }) => requireAccess(context.session),
});
