import { stripeClient } from "@better-auth/stripe/client";
import { createAuthClient } from "better-auth/react";

/**
 * The billing half of the auth client — the one thing on this app that calls Better Auth's
 * Stripe routes (`/api/auth/subscription/*`).
 *
 * A second client instance rather than a plugin added to `~/lib/auth`: that file belongs to
 * the auth module, and a module never edits another layer's files. Two instances are cheap —
 * a Better Auth client is a typed fetch wrapper over the same origin and the same cookie jar,
 * holds no session state of its own, and reads whatever the browser is already carrying. The
 * session itself still has exactly one owner (`~/lib/session`); nothing here reads it.
 *
 * Same origin, so no `baseURL`: Vite proxies `/api` in dev and the server serves the bundle
 * in production.
 */
export const billingClient = createAuthClient({
  plugins: [stripeClient({ subscription: true })],
});
