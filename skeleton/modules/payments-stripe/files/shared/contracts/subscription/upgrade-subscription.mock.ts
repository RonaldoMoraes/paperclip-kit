import { http } from "msw";
import { json, unauthorized } from "../mock-response";
import { readMockSession } from "../mock-session";
import { CHECKOUT_RETURN_PATH, CheckoutRedirect, PLANS } from "./checkout";

/**
 * `POST /api/auth/subscription/upgrade` — the paywall's one action, mocked.
 *
 * There is no Stripe to visit, so the round-trip is collapsed into its arrival: the answer
 * sends the browser straight to the checkout return with a session id on it, exactly as
 * Stripe's own `success_url` would. Nothing is bought here — the return is what settles the
 * ledger (`confirm-checkout.mock.ts`), which is also the order the real thing happens in.
 */
export const MOCK_CHECKOUT_SESSION_ID = "cs_test_mock_1";

export const fixture = CheckoutRedirect.parse({
  url: `${CHECKOUT_RETURN_PATH}?sessionId=${MOCK_CHECKOUT_SESSION_ID}`,
  redirect: true,
});

const SOLD = new Set<string>(PLANS);

export const handlers = [
  http.post("*/api/auth/subscription/upgrade", async ({ request, cookies }) => {
    if (!readMockSession(cookies)) return unauthorized();
    const body = (await request.json().catch(() => null)) as { plan?: string } | null;
    // The plugin answers a plan it does not sell with its own 400; a paywall that sent one
    // is a bug the mock should surface rather than paper over.
    if (!body?.plan || !SOLD.has(body.plan)) {
      return json({ code: "SUBSCRIPTION_PLAN_NOT_FOUND", message: "Subscription plan not found." }, { status: 400 });
    }
    return json(fixture);
  }),
];
