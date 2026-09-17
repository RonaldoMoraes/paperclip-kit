import { http } from "msw";
import { json, unauthorized } from "../mock-response";
import { readMockSession } from "../mock-session";
import { ConfirmCheckoutResponse } from "./confirm-checkout";
import { mockAccessFor, readMockProvider, readMockSubscriptionState, subscriptionCookies } from "./mock-subscription";

/**
 * There is no Stripe to reconcile against in mock mode, so this mock does what a settled
 * checkout leaves behind: it writes the ledger and the session's `access` field, and
 * answers with the access those now mean.
 *
 * A person who already holds a plan keeps the one they have — the endpoint is idempotent
 * and a reload of the return must not turn a trial into a plain purchase. Anyone else
 * settles into `active`, which is what the mocked checkout sold them.
 */
const SETTLED = "active" as const;

export const fixture = ConfirmCheckoutResponse.parse({ confirmed: true, access: mockAccessFor(SETTLED) });

export const handlers = [
  http.post("*/api/subscription/confirm", ({ cookies }) => {
    if (!readMockSession(cookies)) return unauthorized();
    const held = readMockSubscriptionState(cookies);
    const state = held === "none" ? SETTLED : held;
    // A plan already held keeps its seller too: settling a checkout twice must not turn a
    // subscription bought elsewhere into one this app claims to have sold.
    const provider = held === "none" ? undefined : readMockProvider(cookies);
    return json(ConfirmCheckoutResponse.parse({ confirmed: true, access: mockAccessFor(state, provider) }), {
      setCookies: subscriptionCookies(state, provider),
    });
  }),
];
