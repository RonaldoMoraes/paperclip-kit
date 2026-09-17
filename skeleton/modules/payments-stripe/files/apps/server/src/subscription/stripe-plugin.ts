import { stripe as stripePlugin } from "@better-auth/stripe";
import type { BetterAuthPlugin } from "better-auth";
import Stripe from "stripe";
import { CHECKOUT_RETURN_PATH, PLANS } from "@contracts/subscription/checkout";
import { customerLinkPlugin } from "./customer-link";
import { type EventTrailWriter, type StripeEventFacts, eventRecord, recordEvent } from "./event-trail";
import { soldHerePlugin } from "./sold-here";
import type { StripeConfig } from "./subscription.config";
import { type CustomerWriter, reconcileCustomer } from "./subscription.service";

/**
 * Better Auth's Stripe plugin, wired to this product.
 *
 * The plugin owns every billing route under `/api/auth/subscription/*` and the webhook at
 * `/api/auth/stripe/webhook` — which is why that one path is in `KIT_RAW_BODY_PATHS`: Stripe
 * signs the exact bytes it sent, and any parser that assigns `req.body` leaves the handler
 * re-serialising a value whose whitespace and key order no longer match.
 *
 * The plugin reaches Better Auth through the `auth-extensions` port
 * (`auth-extensions.provider.ts`), so nothing in the auth module is edited to sell anything.
 */

/** The path the plugin serves its webhook on, under Better Auth's own `/api/auth` root. */
export const STRIPE_WEBHOOK_PATH = "/api/auth/stripe/webhook";

/**
 * The one Stripe client, or none.
 *
 * A `null` config is billing off — mock mode, the gates and a plain development stack never
 * reach Stripe. Everything that talks to Stripe takes this client, so "billing is off" is
 * decided in one place and read everywhere.
 */
export function createStripeClient(config: StripeConfig | null): Stripe | null {
  if (!config) return null;
  const client = new Stripe(config.secretKey);
  return config.portalConfiguration ? useProductPortal(client, config.portalConfiguration) : client;
}

/** Stripe's billing-portal `create`, with both of its overloads. */
type PortalCreate = Stripe["billingPortal"]["sessions"]["create"];

/**
 * The billing portal this product configured, rather than the Stripe account's default.
 *
 * The plugin builds the portal session itself and passes no `configuration`, so the choice
 * has to be made on the client it is handed. The one method is replaced on the client this
 * module just constructed and hands out — nothing else holds it, and every other call on it
 * is untouched. A product with one portal for everything leaves
 * `STRIPE_PORTAL_CONFIGURATION` unset and gets the account default.
 */
export function useProductPortal(client: Stripe, configuration: string): Stripe {
  const sessions = client.billingPortal.sessions;
  const create = sessions.create.bind(sessions) as PortalCreate;
  sessions.create = ((params?: Stripe.BillingPortal.SessionCreateParams, options?: Stripe.RequestOptions) =>
    create({ configuration, ...params }, options)) as PortalCreate;
  return client;
}

/**
 * Where Stripe sends the browser back.
 *
 * The plugin's own success route is deliberately bypassed. It reconciles by listing the
 * customer's *active* subscriptions, which a trialing one is not, so anyone on a free trial
 * would arrive told their checkout had failed — and it hands back no Checkout Session id, so
 * there would be nothing for `POST /api/subscription/confirm` to settle the row from. The
 * session id comes back on the URL instead.
 *
 * The origin has no trailing slash: `URL.toString()` always ends in one, and the return path
 * starts with one, which would make `http://host//checkout/return`. Stripe accepts that and
 * the browser keeps it, which is why nothing fails loudly.
 */
export function checkoutSuccessUrl(baseURL: URL | string): string {
  const origin = typeof baseURL === "string" ? baseURL.replace(/\/$/, "") : baseURL.origin;
  return `${origin}${CHECKOUT_RETURN_PATH}?sessionId={CHECKOUT_SESSION_ID}`;
}

/**
 * The customer id a Stripe event is about, and the subscription it belongs to — or nothing,
 * for an event that names neither.
 */
export function customerFromEvent(
  event: Pick<StripeEventFacts, "type" | "data">
): { stripeSubscriptionId: string; stripeCustomerId: string } | null {
  if (!event.type.startsWith("customer.subscription.")) return null;
  const object = event.data.object as { id?: unknown; customer?: unknown };
  const customer = typeof object.customer === "string" ? object.customer : undefined;
  if (typeof object.id !== "string" || !customer) return null;
  return { stripeSubscriptionId: object.id, stripeCustomerId: customer };
}

export type StripePluginDeps = {
  config: StripeConfig | null;
  client: Stripe | null;
  /** the origin Better Auth is configured with — every URL the plugin builds starts here */
  baseURL: URL | string;
  db: EventTrailWriter & CustomerWriter;
};

/**
 * What every delivery leaves behind: a row in the trail, and a row corrected to name the
 * customer that is really billing.
 *
 * It runs after the plugin's own handlers, so it is a record of what happened rather than a
 * queue. Neither write may fail the webhook: Stripe reads a non-2xx as "try again", and a
 * trail that could not be written is not a reason to have the same event replayed forever.
 */
export function onStripeEvent(db: StripePluginDeps["db"]) {
  return async (event: StripeEventFacts): Promise<void> => {
    await recordEvent(db, eventRecord(event)).catch((error) => {
      console.error("[subscription] could not record the Stripe event:", error);
    });
    const correction = customerFromEvent(event);
    if (!correction) return;
    await reconcileCustomer(db, correction).catch((error) => {
      console.error("[subscription] could not reconcile the Stripe customer on the row:", error);
    });
  };
}

/**
 * The plugins Better Auth is built with — none at all when billing is off, which is what
 * makes this module inert rather than broken without a key.
 */
export function stripePlugins({ config, client, baseURL, db }: StripePluginDeps): BetterAuthPlugin[] {
  if (!client || !config) {
    console.warn("[subscription] STRIPE_SECRET_KEY is not set — subscriptions are off.");
    return [];
  }

  return [
    // Both before the Stripe plugin, so the adapter it is handed is already wrapped and the
    // `provider` column is already declared when its own schema is merged in.
    customerLinkPlugin(),
    soldHerePlugin(),
    stripePlugin({
      stripeClient: client,
      stripeWebhookSecret: config.webhookSecret,
      // The Stripe customer is created at checkout, not at sign-up: most people who make an
      // account never reach the paywall, and a customer for each of them is a Stripe account
      // full of records nobody ever bills.
      createCustomerOnSignUp: false,
      onEvent: onStripeEvent(db),
      subscription: {
        enabled: true,
        // No `freeTrial` here: this module sells two plans and nothing else. A product that
        // wants a trial adds it to a plan, and `trialEligible` on the session is already the
        // rule that keeps it to one per person.
        plans: [
          { name: PLANS[0], priceId: config.priceMonthly },
          { name: PLANS[1], priceId: config.priceAnnual },
        ],
        // One person, one subscription: the reference is always their own id, so there is
        // nothing to authorize beyond refusing anybody else's.
        authorizeReference: async ({ user, referenceId }) => referenceId === user.id,
        // Only what has to be ours. The plugin spreads these over its own params and then
        // rewrites `metadata` with the internal ids afterwards, so the row this checkout
        // belongs to still travels on the Checkout Session for `confirmCheckout` to find.
        getCheckoutSessionParams: async () => ({
          params: {
            payment_method_collection: "always",
            success_url: checkoutSuccessUrl(baseURL),
          },
        }),
      },
      // The plugin's field names on the left, this table's columns on the right
      // (`db/prisma/schema/subscription.prisma`).
      schema: {
        subscription: {
          fields: {
            referenceId: "reference_id",
            plan: "plan",
            stripeCustomerId: "stripe_customer_id",
            stripeSubscriptionId: "stripe_subscription_id",
            status: "status",
            periodStart: "period_start",
            periodEnd: "period_end",
            trialStart: "trial_start",
            trialEnd: "trial_end",
            cancelAtPeriodEnd: "cancel_at_period_end",
            cancelAt: "cancel_at",
            canceledAt: "canceled_at",
            endedAt: "ended_at",
            seats: "seats",
          },
        },
      },
    }),
  ];
}
