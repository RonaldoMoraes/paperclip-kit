import { createAnonymousId } from "@contracts/analytics/anonymous-id";
import { APP_SCHEME } from "~/lib/config";

/**
 * This device's analytics identity — the web's `apps/web/src/data/analytics.ts` over
 * process memory, the way `store.ts` beside it keeps its state: base ships no storage
 * dependency on the phone, so the id lives for the launch and the next launch mints
 * another. The id's own rules are the contract's (`@contracts/analytics/anonymous-id`);
 * what lives here is the store and the key.
 *
 * A persistent backing lands in `get` and `set` below and nowhere else — the auth
 * module's `expo-secure-store`, say, under `ANONYMOUS_ID_KEY`, which sits beside that
 * client's own keys under the same scheme prefix so one app owns one namespace. With it,
 * the funnel a visitor starts before signing in is the same funnel after — the stitch
 * the server does on the first signed-in batch.
 */
export const ANONYMOUS_ID_KEY = `${APP_SCHEME}_analytics_anonymous_id`;

let held: string | null = null;

export const anonymousId = createAnonymousId({
  get: () => held,
  set: (id) => {
    held = id;
  },
});
