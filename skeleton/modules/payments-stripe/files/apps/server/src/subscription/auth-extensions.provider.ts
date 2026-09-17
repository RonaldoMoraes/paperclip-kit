import type { Provider } from "@nestjs/common";
import { loadAuthConfig } from "../auth/auth.config";
import { AUTH_EXTENSIONS, type AuthExtensions } from "../auth/auth.extensions";
import { PRISMA } from "../database/database.types";
import type { Db } from "../database/scope-extension";
import { createStripeClient, stripePlugins } from "./stripe-plugin";
import { loadStripeConfig } from "./subscription.config";
import { subscriptionAccess } from "./subscription.service";

/**
 * How selling reaches auth: this module claims the `auth-extensions` port
 * (`module.json` → `server.ports`), and the generated `KIT_PORTS` binds this provider in
 * place of auth's empty default. Nothing in the auth module changes to add billing to it.
 *
 * Two things ride through: the Stripe plugin, so Better Auth serves the checkout, the
 * billing portal and the webhook on its own router; and the session extension, so every
 * `/api/auth/get-session` answer carries the access this server computed. That is the whole
 * of the entitlement contract — the server decides once, the session carries it, a guard
 * and a route layout read it, and no client derives it.
 *
 * The port is bound in the global `PortsModule`, which cannot see `SubscriptionModule`'s
 * providers (and must not, or the two would import each other in a circle). So the
 * configuration is read here through the same `loadStripeConfig` the module uses: one
 * function, one meaning, and the same boot failure either way. With no `STRIPE_SECRET_KEY`
 * there is no client, `stripePlugins` returns nothing, and the session still carries an
 * honest "no subscription" read from the rows.
 */
export const SubscriptionAuthExtensionsProvider: Provider = {
  provide: AUTH_EXTENSIONS,
  inject: [PRISMA],
  useFactory: (db: Db): AuthExtensions => {
    const config = loadStripeConfig(process.env);
    const client = createStripeClient(config);
    // Only asked for when billing is on: a tree running without Stripe must not be made to
    // hold an auth configuration it would otherwise be free of.
    const baseURL = config ? loadAuthConfig(process.env).baseURL : "";

    return {
      plugins: stripePlugins({ config, client, baseURL, db }),
      // Computed on every session probe, which is exactly the point: a webhook that lands
      // between two probes changes what the next one says, with nothing to invalidate.
      sessionExtension: async ({ user }) => ({ access: await subscriptionAccess(db, user.id) }),
    };
  },
};
