import { handlers as billingPortal } from "./billing-portal.mock";
import { handlers as confirmCheckout } from "./confirm-checkout.mock";
import { handlers as upgradeSubscription } from "./upgrade-subscription.mock";

/**
 * Every mock this feature owns — the one endpoint this server serves and the two Better
 * Auth Stripe routes the paywall and Settings call. The registry in `../mocks.ts` spreads
 * this list through `mocks.gen.ts` and never names an endpoint; a new one here is a new
 * `<endpoint>.mock.ts` and one line below.
 *
 * `get-session` is deliberately absent: auth owns that path, and a second handler for it
 * would race the first. The `access` field rides on the session-extra cookie instead
 * (`mock-subscription.ts`).
 */
export const handlers = [...upgradeSubscription, ...confirmCheckout, ...billingPortal];
