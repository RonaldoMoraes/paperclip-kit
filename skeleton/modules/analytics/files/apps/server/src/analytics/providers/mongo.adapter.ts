import { type Collection, type Document, MongoClient, ObjectId } from "mongodb";
import type { AnalyticsEvent } from "@contracts/analytics/events";
import type { AnalyticsIdentity } from "../../common/ports/analytics";
import { metricKeyOf } from "../metric-key";
import type { AnalyticsStoreAdapter, StampedAnalyticsEvent } from "./provider.types";

/** MongoDB's duplicate-key error code — the unique index answering a lost upsert race. */
const DUPLICATE_KEY = 11000;

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === DUPLICATE_KEY;
}

/**
 * The MongoDB store, in this product's own database. Only imported inside `providers/`
 * — `biome/analytics-provider-imports.grit` errors on the rest of the tree.
 *
 * Three collections: `identifiers` (one document per identity, atomic getOrCreate),
 * `events` (append-only, ordered — the funnel record) and `metrics` (counted upserts keyed
 * `{ identifier, key }`, with `metric-key.ts` as the canonical key so the upsert key can
 * be unique-indexed). Indexes are created idempotently, once per process, before the
 * first write. The client connects lazily on the first operation.
 */
export class MongoAnalyticsStore implements AnalyticsStoreAdapter {
  readonly provider = "mongo";

  private readonly client: MongoClient;
  private ready: Promise<void> | null = null;

  constructor(private readonly config: { url: string; database: string }) {
    this.client = new MongoClient(config.url);
  }

  private collection(name: string): Collection<Document> {
    return this.client.db(this.config.database).collection(name);
  }

  private async ensureIndexes(): Promise<void> {
    this.ready ??= this.createIndexes();
    try {
      await this.ready;
    } catch (error) {
      this.ready = null; // a transient failure must not poison every later write
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    const identifiers = this.collection("identifiers");
    // Unique + partial: backs the atomic getOrCreate; userId-only documents carry
    // anonymousId: null and are exempt from the uniqueness.
    await identifiers.createIndex(
      { anonymousId: 1 },
      { unique: true, partialFilterExpression: { anonymousId: { $type: "string" } } }
    );
    // Non-unique on purpose: a second device leaves two identifiers on one userId, and
    // queries group by userId.
    await identifiers.createIndex({ userId: 1 });
    await this.collection("metrics").createIndex({ identifier: 1, key: 1 }, { unique: true });
    await this.collection("events").createIndex({ identifier: 1, occurredAt: 1 });
    await this.collection("events").createIndex({ receivedAt: 1 });
  }

  async getOrCreateIdentifier(identity: AnalyticsIdentity): Promise<string> {
    await this.ensureIndexes();
    const { anonymousId, userId } = identity;
    if (anonymousId === null && userId === null) {
      throw new Error("[analytics] an identity needs an anonymousId or a userId");
    }
    try {
      return await this.upsertIdentifier(anonymousId, userId);
    } catch (error) {
      // Two concurrent first batches can race the upsert; the unique index fails one of
      // them, and by then the document exists — one retry finds it.
      if (!isDuplicateKey(error)) throw error;
      return await this.upsertIdentifier(anonymousId, userId);
    }
  }

  private async upsertIdentifier(anonymousId: string | null, userId: string | null): Promise<string> {
    const identifiers = this.collection("identifiers");
    const now = new Date();

    if (anonymousId === null) {
      const document = await identifiers.findOneAndUpdate(
        { userId },
        { $setOnInsert: { anonymousId: null, createdAt: now } },
        { upsert: true, returnDocument: "after" }
      );
      if (!document) throw new Error("[analytics] identifier upsert returned no document");
      return document._id.toString();
    }

    const document = await identifiers.findOneAndUpdate(
      { anonymousId },
      // The insert carries the userId when the first batch is already authenticated.
      { $setOnInsert: { userId, createdAt: now } },
      { upsert: true, returnDocument: "after" }
    );
    if (!document) throw new Error("[analytics] identifier upsert returned no document");

    // The registration stitch: the first authenticated batch still carrying the
    // pre-registration anonymousId writes the userId onto the anonymous document.
    // One-way and first-link-wins — the `userId: null` filter never overwrites.
    if (userId !== null && document.userId === null) {
      await identifiers.updateOne({ _id: document._id, userId: null }, { $set: { userId, updatedAt: now } });
    }
    return document._id.toString();
  }

  async appendEvents(identifierId: string, events: StampedAnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.ensureIndexes();
    const identifier = new ObjectId(identifierId);
    await this.collection("events").insertMany(
      events.map(({ event, occurredAt, receivedAt }) => ({ identifier, event, occurredAt, receivedAt })),
      { ordered: true } // the batch lands in the order the client sent it
    );
  }

  async incrementMetrics(identifierId: string, events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.ensureIndexes();
    const identifier = new ObjectId(identifierId);
    const now = new Date();

    // Batch-local aggregation: two upserts for the same new key inside one unordered
    // bulkWrite would race the unique index, so equal payloads collapse into one op whose
    // $inc carries the occurrence count.
    const byKey = new Map<string, { event: AnalyticsEvent; count: number }>();
    for (const event of events) {
      const key = metricKeyOf(event);
      const entry = byKey.get(key);
      if (entry) entry.count += 1;
      else byKey.set(key, { event, count: 1 });
    }

    await this.collection("metrics").bulkWrite(
      [...byKey.entries()].map(([key, { event, count }]) => ({
        updateOne: {
          filter: { identifier, key },
          update: {
            $inc: { count },
            $set: { lastSeenAt: now },
            $setOnInsert: { event, firstSeenAt: now },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }
}
