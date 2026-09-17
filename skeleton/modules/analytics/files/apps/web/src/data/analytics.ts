import { createAnonymousId } from "@contracts/analytics/anonymous-id";

/**
 * This device's analytics identity, kept in `localStorage`.
 *
 * The id itself and the rules around it are the contract's
 * (`@contracts/analytics/anonymous-id`); what lives here is the browser's store and the
 * key it lives under. That key is deliberately outside the app's own versioned state:
 * `resetAll()` in `store.ts` wipes the state back to a first visit, and the funnel id must
 * survive a "start over" — a reset is the same visitor, not a new one.
 */
const KEY = "__PRODUCT_SLUG__-anonymous-id";

export const anonymousId = createAnonymousId({
  get: () => localStorage.getItem(KEY),
  set: (id) => localStorage.setItem(KEY, id),
});
