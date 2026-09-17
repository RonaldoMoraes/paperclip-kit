import { STRIPE_PROVIDER } from "@contracts/subscription/access";

/** The Stripe event fields the trail keeps; a real `Stripe.Event` satisfies it. */
export type StripeEventFacts = {
  id: string;
  type: string;
  created: number;
  data: { object: unknown };
};

/**
 * What a `Json` column takes. Named here rather than imported from the generated client: the
 * writer below is a structural slice of Prisma, and a slice that imported the client would
 * make every spec of this file need a database.
 */
export type JsonInput = string | number | boolean | JsonInput[] | { [key: string]: JsonInput | null };

/** One row of `webhook_event`, as the table names its columns. */
export type WebhookEventRecord = {
  provider: string;
  provider_event_id: string;
  provider_event_type: string;
  /** the provider's subscription id the event is about, when it names one */
  subscription_id: string | null;
  event_occurred_at: Date;
  /** the whole delivery, as it arrived */
  payload: JsonInput;
};

/** The slice of Prisma the trail writes through, structural so a spec can hand it a stub. */
export type EventTrailWriter = {
  webhook_event: {
    create(args: { data: WebhookEventRecord }): Promise<unknown>;
  };
};

/** Postgres' unique-violation, as Prisma reports it. */
export const UNIQUE_VIOLATION = "P2002";

function isDuplicate(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === UNIQUE_VIOLATION;
}

/** The Stripe subscription id an event is about: the object itself, or the invoice's. */
export function subscriptionIdOf(event: StripeEventFacts): string | null {
  const object = event.data.object as { id?: unknown; subscription?: unknown } | null;
  if (event.type.startsWith("customer.subscription.") && typeof object?.id === "string") return object.id;
  if (typeof object?.subscription === "string") return object.subscription;
  return null;
}

/**
 * The row an event leaves behind. Recorded after the plugin has handled the delivery, so it
 * is the trail of what happened and not a queue to work through; `id` is what makes a
 * redelivery a no-op, through the table's `(provider, provider_event_id)` unique index.
 */
export function eventRecord(event: StripeEventFacts): WebhookEventRecord {
  return {
    provider: STRIPE_PROVIDER,
    provider_event_id: event.id,
    provider_event_type: event.type,
    subscription_id: subscriptionIdOf(event),
    event_occurred_at: new Date(event.created * 1000),
    // The event arrived as JSON and is stored as it arrived. The cast is what a structural
    // JSON type cannot express about an SDK whose `data.object` is a union of interfaces —
    // one narrowing, at the one place the value crosses into the column.
    payload: event as JsonInput,
  };
}

/** What became of one delivery: the first time it is written, a redelivery is not. */
export type TrailOutcome = "recorded" | "duplicate";

/**
 * The event, written once.
 *
 * Stripe redelivers — on its own retry schedule, and again whenever a `stripe listen` is
 * restarted — so the second arrival is expected rather than exceptional. The unique index
 * is what decides it: the insert loses the race and says so, and nothing above has to read
 * the table first and hope the read and the write stay one operation.
 */
export async function recordEvent(db: EventTrailWriter, record: WebhookEventRecord): Promise<TrailOutcome> {
  try {
    await db.webhook_event.create({ data: record });
    return "recorded";
  } catch (error) {
    if (isDuplicate(error)) return "duplicate";
    throw error;
  }
}
