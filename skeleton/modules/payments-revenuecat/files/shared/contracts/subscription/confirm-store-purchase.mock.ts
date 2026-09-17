import { http } from "msw";
import { json, unauthorized } from "../mock-response";
import { readMockSession } from "../mock-session";
import { CONFIRM_STORE_PURCHASE_PATH, ConfirmStorePurchaseResponse } from "./confirm-store-purchase";
import { mockAccessFor, readMockSubscriptionState, subscriptionCookies } from "./mock-subscription";

/**
 * There is no RevenueCat to read in mock mode, so this mock does what a settled store
 * purchase leaves behind: it writes the same two cookies the web's mocked checkout writes —
 * `payments-stripe`'s ledger and the session's `access` field — and answers with the access
 * they now mean.
 *
 * The ledger is deliberately the same one. A store purchase and a Stripe checkout land on
 * the same row in the real thing, and a second mocked ledger would let a mocked phone and a
 * mocked browser disagree about who has paid, which is the one thing this feature exists
 * not to do.
 *
 * Someone who already holds a plan keeps the one they have — the endpoint is idempotent and
 * a restore must not turn a trial into a plain purchase. Anyone else settles into `active`,
 * which is what the mock store just sold them.
 */
const SETTLED = "active" as const;

export const fixture = ConfirmStorePurchaseResponse.parse({ confirmed: true, access: mockAccessFor(SETTLED) });

export const handlers = [
  http.post(`*${CONFIRM_STORE_PURCHASE_PATH}`, ({ cookies }) => {
    if (!readMockSession(cookies)) return unauthorized();
    const held = readMockSubscriptionState(cookies);
    const state = held === "none" ? SETTLED : held;
    return json(ConfirmStorePurchaseResponse.parse({ confirmed: true, access: mockAccessFor(state) }), {
      setCookies: subscriptionCookies(state),
    });
  }),
];
