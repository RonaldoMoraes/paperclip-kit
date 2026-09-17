import { z } from "zod";
import { STORE_PROVIDER } from "@contracts/subscription/store-products";
import type { Telemetry } from "../../common/ports/telemetry";
import { type EventTrailWriter, type WebhookEventRecord, recordEvent } from "../event-trail";
import {
  type PlanOf,
  type RevenueCatEvent,
  type StoreSubscriptionUpdate,
  transferOut,
  updateFromRevenueCat,
} from "./events";

/**
 * RevenueCat's webhook, ingested: revenuecat.com/docs/integrations/webhooks.
 *
 * One body per event, `{ api_version, event }`, authenticated by the `Authorization` header
 * the integration was configured with — there is no signature over the bytes, so unlike
 * Stripe's the body is parsed like any other and this path is *not* in `KIT_RAW_BODY_PATHS`.
 * The controller checks the header; this decides what the event writes and leaves the trail.
 */

/** The fields the ingestion reads; everything else RevenueCat sends rides along in `payload`. */
export const RevenueCatWebhookBody = z.object({
  api_version: z.string().optional(),
  event: z.looseObject({
    id: z.string().min(1),
    type: z.string().min(1),
    /** absent on a `TRANSFER`, which names two sets of customers instead */
    app_user_id: z.string().nullish(),
    original_app_user_id: z.string().nullish(),
    aliases: z.array(z.string()).nullish(),
    transferred_from: z.array(z.string()).nullish(),
    transferred_to: z.array(z.string()).nullish(),
    product_id: z.string().nullish(),
    new_product_id: z.string().nullish(),
    period_type: z.string().nullish(),
    store: z.string().nullish(),
    original_transaction_id: z.string().nullish(),
    purchased_at_ms: z.number().nullish(),
    expiration_at_ms: z.number().nullish(),
    event_timestamp_ms: z.number().nullish(),
    grace_period_expiration_at_ms: z.number().nullish(),
    cancel_reason: z.string().nullish(),
    expiration_reason: z.string().nullish(),
  }),
});
export type RevenueCatWebhookBody = z.infer<typeof RevenueCatWebhookBody>;

/**
 * The ids RevenueCat invents for itself: an anonymous customer, and the placeholder it uses
 * where an app never identified anybody. Neither is a person here — the app calls
 * `identify()` when the session resolves and again before the sheet opens, so a purchase
 * under one of these is a bug to see in the trail, not a row to invent.
 */
const REVENUECAT_OWN_ID = /^\$RC/;

const isAppUserId = (id: string): boolean => id.length > 0 && !REVENUECAT_OWN_ID.test(id);

/**
 * The person an event is about, as this server names them: the user id the app logged in
 * with — `app_user_id` on a purchase made signed in, or one of the aliases when RevenueCat
 * has since merged ids.
 */
export function revenueCatUserId(
  event: Pick<RevenueCatWebhookBody["event"], "app_user_id" | "aliases">
): string | null {
  return [event.app_user_id ?? "", ...(event.aliases ?? [])].find(isAppUserId) ?? null;
}

/* ── the row, and how it is written ──────────────────────────────────────────── */

/** The columns the ingestion reads back off a row it is about to write. */
export type StoreSubscriptionRow = { id: number; reference_id: string; stripe_subscription_id: string | null };

/**
 * The slice of Prisma this feature writes through — the `subscription` table
 * `payments-stripe` owns, in its own column names. Structural, so a spec hands it a stub
 * and never a database.
 *
 * There is no store table and no store column: a purchase made on the phone is a
 * `subscription` row like any other, which is what lets `accessFrom` answer for both
 * sellers without being taught that a second one exists.
 */
export type StoreSubscriptionIo = {
  subscription: {
    findFirst(args: {
      where: { reference_id: string };
      orderBy: { created_at: "desc" };
    }): Promise<StoreSubscriptionRow | null>;
    /**
     * `updateMany`, not `update`: the reference id goes in the `where`, so a row can only
     * ever be written by the person it belongs to, and the count says whether it matched.
     */
    updateMany(args: {
      where: { id: number; reference_id: string };
      data: StoreSubscriptionUpdate;
    }): Promise<{ count: number }>;
    /**
     * `reference_id`, `plan` and `provider` are required rather than patched: the first two
     * are `NOT NULL` on the table, and the third has a `stripe` default that a row opened
     * here must never be allowed to fall back to.
     */
    create(args: {
      data: StoreSubscriptionUpdate & { reference_id: string; plan: string; provider: string };
    }): Promise<StoreSubscriptionRow>;
  };
};

/**
 * The plan a first row carries when the product that was bought maps to none.
 *
 * `plan` is `NOT NULL` and Better Auth's Stripe plugin lower-cases every row's before
 * filtering, so the column cannot be left empty and cannot be left null. A product id this
 * app does not sell is a dashboard that has moved on without the code; the row still
 * records the purchase, and `planOfStoreProduct` is where it is taught the id.
 */
export const UNKNOWN_PLAN = "unknown";

export type Applied = "updated" | "created" | "nothing";

/**
 * One update, written onto the person's row.
 *
 * A row they already own is updated in place, with whatever the patch names and nothing
 * else — `provider` among the columns it does not name, so a cancellation cannot restamp a
 * row whose seller is already settled. With no row, only something that says what the
 * subscription now *is* opens one: a cancellation or an expiration for somebody with no row
 * is an event about a subscription this server never saw, and inventing a row to end it
 * would be a row with nothing on it.
 *
 * A row opened here is a store row by construction — this module opens one for a purchase
 * and for a customer RevenueCat holds, and for nothing else — so `provider` is stamped on
 * the create even when the patch did not carry it. That is the path a purchase confirmed
 * before its webhook landed takes (`confirm.ts`), and without the stamp the column would
 * fall back to its `stripe` default and the web would offer Stripe's billing portal for a
 * subscription Apple is billing.
 */
export async function applyStoreUpdate(
  io: StoreSubscriptionIo,
  userId: string,
  update: StoreSubscriptionUpdate | null,
  current: StoreSubscriptionRow | null
): Promise<Applied> {
  if (!update) return "nothing";
  if (current) {
    await io.subscription.updateMany({ where: { id: current.id, reference_id: userId }, data: update });
    return "updated";
  }
  if (update.status === undefined) return "nothing";
  await io.subscription.create({
    data: {
      reference_id: userId,
      plan: update.plan ?? UNKNOWN_PLAN,
      ...update,
      provider: update.provider ?? STORE_PROVIDER,
    },
  });
  return "created";
}

/* ── the delivery ────────────────────────────────────────────────────────────── */

/**
 * The delivery, as the `JsonB` column takes it. The one narrowing in this file, at the one
 * place a value crosses into the column: the body arrived as JSON and is stored as it
 * arrived, and a structural JSON type cannot express that about a schema whose loose object
 * carries whatever RevenueCat sent alongside the fields named above.
 */
const asJson = (value: unknown): WebhookEventRecord["payload"] => value as WebhookEventRecord["payload"];

/** The trail row one webhook body leaves — the same table, and the same dedupe, Stripe's uses. */
export function webhookRecord(body: RevenueCatWebhookBody): WebhookEventRecord {
  const { event } = body;
  return {
    provider: STORE_PROVIDER,
    provider_event_id: event.id,
    provider_event_type: event.type,
    subscription_id: event.original_transaction_id ?? null,
    event_occurred_at: new Date(event.event_timestamp_ms ?? Date.now()),
    payload: asJson(body),
  };
}

export type Ingested = { outcome: Applied | "test" | "duplicate" | "no-user" | "transferred" };

export type IngestDeps = {
  io: StoreSubscriptionIo & EventTrailWriter;
  planOf: PlanOf;
  telemetry: Telemetry;
};

/**
 * What one delivery does.
 *
 * The trail row is written **first**, and a duplicate stops everything: RevenueCat retries
 * with the same event id, and a purchase replayed after a cancellation would reopen it. The
 * unique index on `(provider, provider_event_id)` is what decides that — the insert loses
 * the race and says so, so two deliveries arriving at once cannot both be worked. Claiming
 * the delivery before applying it is the deliberate half of that trade: a write that then
 * fails is a row left behind by an event that will not be retried, and the app's own
 * `POST …/confirm` — which reads RevenueCat rather than a stored event — is what brings it
 * back. A queue would be the other answer, and this module does not ship one.
 *
 * A `TEST` event is what the dashboard sends when the integration is created: it proves the
 * route and writes nothing. A `TRANSFER` names customers rather than one, and only the
 * losing side is written here — the receiving account's own `confirm` reads what it now
 * holds. Everything else finds the person, maps the event against the row they have
 * (`updateFromRevenueCat` scopes non-purchase events to the row's own transaction) and
 * writes it.
 */
export async function ingestRevenueCatEvent(deps: IngestDeps, body: RevenueCatWebhookBody): Promise<Ingested> {
  const { io, planOf, telemetry } = deps;
  const { event } = body;

  if ((await recordEvent(io, webhookRecord(body))) === "duplicate") return { outcome: "duplicate" };

  if (event.type === "TEST") return { outcome: "test" };

  if (event.type === "TRANSFER") {
    const at = new Date(event.event_timestamp_ms ?? Date.now());
    for (const from of (event.transferred_from ?? []).filter(isAppUserId)) {
      const lost = await io.subscription.findFirst({ where: { reference_id: from }, orderBy: { created_at: "desc" } });
      if (lost) await applyStoreUpdate(io, from, transferOut(at), lost);
    }
    return { outcome: "transferred" };
  }

  const userId = revenueCatUserId(event);
  if (!userId) {
    telemetry.event("subscription.store.webhook-without-user", {
      eventId: event.id,
      eventType: event.type,
      appUserId: event.app_user_id ?? null,
    });
    return { outcome: "no-user" };
  }

  const row = await io.subscription.findFirst({ where: { reference_id: userId }, orderBy: { created_at: "desc" } });
  const update = updateFromRevenueCat(event as RevenueCatEvent, planOf, {
    stripe_subscription_id: row?.stripe_subscription_id ?? null,
  });
  return { outcome: await applyStoreUpdate(io, userId, update, row) };
}
