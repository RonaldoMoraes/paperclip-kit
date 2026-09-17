import { http } from "msw";
import { json, unauthorized } from "../mock-response";
import { readMockSession } from "../mock-session";
import { STRIPE_PROVIDER } from "./access";
import { BILLING_RETURN_PATH, CheckoutRedirect } from "./checkout";
import { SOLD_ELSEWHERE_MESSAGE, SUBSCRIPTION_SOLD_ELSEWHERE } from "./errors";
import { readMockProvider, readMockSubscriptionState } from "./mock-subscription";

/**
 * `POST /api/auth/subscription/billing-portal` — Stripe's own account page, mocked.
 *
 * The portal is a page on Stripe, so mock mode has nothing to show: the answer returns the
 * browser to where the real portal would have returned it, which is enough for a screen to
 * prove it hands off and comes back.
 */
export const fixture = CheckoutRedirect.parse({ url: BILLING_RETURN_PATH, redirect: true });

export const handlers = [
  http.post("*/api/auth/subscription/billing-portal", ({ cookies }) => {
    if (!readMockSession(cookies)) return unauthorized();
    // The same refusal the server's `sold-here` hook makes, so a mocked run cannot walk a
    // path a real one would be stopped on.
    if (readMockSubscriptionState(cookies) !== "none" && readMockProvider(cookies) !== STRIPE_PROVIDER) {
      return json({ code: SUBSCRIPTION_SOLD_ELSEWHERE, message: SOLD_ELSEWHERE_MESSAGE }, { status: 400 });
    }
    return json(fixture);
  }),
];
