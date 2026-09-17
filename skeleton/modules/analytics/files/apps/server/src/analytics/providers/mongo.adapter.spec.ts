import { beforeEach, describe, expect, it, vi } from "vitest";
import { metricKeyOf } from "../metric-key";

/**
 * The driver is the seam. The fake's state lives at file scope; the `vi.mock` factory
 * below only closes over it, and runs when the adapter's import first pulls in "mongodb"
 * — after these are initialised. No network, no cluster.
 */
interface FakeCollection {
  createIndex: ReturnType<typeof vi.fn>;
  findOneAndUpdate: ReturnType<typeof vi.fn>;
  updateOne: ReturnType<typeof vi.fn>;
  insertMany: ReturnType<typeof vi.fn>;
  bulkWrite: ReturnType<typeof vi.fn>;
}
const collections = new Map<string, FakeCollection>();
const dbNames: string[] = [];
const clientUrls: string[] = [];
const collectionFor = (name: string): FakeCollection => {
  let collection = collections.get(name);
  if (!collection) {
    collection = {
      createIndex: vi.fn().mockResolvedValue(name),
      findOneAndUpdate: vi.fn(),
      updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
      insertMany: vi.fn().mockResolvedValue({ insertedCount: 0 }),
      bulkWrite: vi.fn().mockResolvedValue({ ok: 1 }),
    };
    collections.set(name, collection);
  }
  return collection;
};

vi.mock("mongodb", () => {
  class FakeObjectId {
    constructor(readonly value: string = "generated-id") {}
    toString(): string {
      return this.value;
    }
  }
  class FakeMongoClient {
    constructor(url: string) {
      clientUrls.push(url);
    }
    db(name: string) {
      dbNames.push(name);
      return { collection: (collectionName: string) => collectionFor(collectionName) };
    }
  }
  return { MongoClient: FakeMongoClient, ObjectId: FakeObjectId };
});

const { MongoAnalyticsStore } = await import("./mongo.adapter");
const { ObjectId } = await import("mongodb");

const config = { url: "mongodb://analytics.example.com:27017", database: "acme-analytics" };
const ID = "64b000000000000000000001";

const identifierDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: new ObjectId(ID),
  anonymousId: "anon-1",
  userId: null,
  ...overrides,
});

function makeStore() {
  collections.clear();
  dbNames.length = 0;
  clientUrls.length = 0;
  const store = new MongoAnalyticsStore(config);
  const identifiers = collectionFor("identifiers");
  identifiers.findOneAndUpdate.mockResolvedValue(identifierDoc());
  return { store, identifiers, events: collectionFor("events"), metrics: collectionFor("metrics") };
}

const VIEWED = { type: "screen-viewed", screen: "example-list" } as const;
const DONE = { type: "action", screen: "example-detail", action: "mark-done" } as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MongoAnalyticsStore", () => {
  it("connects to the configured database", async () => {
    const { store } = makeStore();
    await store.getOrCreateIdentifier({ anonymousId: "anon-1", userId: null });
    expect(clientUrls).toEqual([config.url]);
    expect(dbNames).toContain(config.database);
  });

  describe("indexes", () => {
    it("creates the documented indexes once, before the first write", async () => {
      const { store, identifiers, events, metrics } = makeStore();
      await store.getOrCreateIdentifier({ anonymousId: "anon-1", userId: null });
      await store.getOrCreateIdentifier({ anonymousId: "anon-1", userId: null });

      expect(identifiers.createIndex).toHaveBeenCalledTimes(2);
      expect(identifiers.createIndex).toHaveBeenCalledWith(
        { anonymousId: 1 },
        { unique: true, partialFilterExpression: { anonymousId: { $type: "string" } } }
      );
      expect(metrics.createIndex).toHaveBeenCalledExactlyOnceWith({ identifier: 1, key: 1 }, { unique: true });
      expect(events.createIndex).toHaveBeenCalledTimes(2);
    });

    it("retries the index pass after a transient failure", async () => {
      const { store, identifiers } = makeStore();
      identifiers.createIndex.mockRejectedValueOnce(new Error("network blip"));
      await expect(store.getOrCreateIdentifier({ anonymousId: "anon-1", userId: null })).rejects.toThrow(
        "network blip"
      );
      await expect(store.getOrCreateIdentifier({ anonymousId: "anon-1", userId: null })).resolves.toBe(ID);
    });
  });

  describe("getOrCreateIdentifier", () => {
    it("upserts by anonymousId with getOrCreate semantics", async () => {
      const { store, identifiers } = makeStore();
      const id = await store.getOrCreateIdentifier({ anonymousId: "anon-1", userId: null });

      expect(identifiers.findOneAndUpdate).toHaveBeenCalledExactlyOnceWith(
        { anonymousId: "anon-1" },
        { $setOnInsert: { userId: null, createdAt: expect.any(Date) } },
        { upsert: true, returnDocument: "after" }
      );
      expect(id).toBe(ID);
    });

    it("upserts by userId when the identity has no anonymousId", async () => {
      const { store, identifiers } = makeStore();
      await store.getOrCreateIdentifier({ anonymousId: null, userId: "usr_1" });

      expect(identifiers.findOneAndUpdate).toHaveBeenCalledExactlyOnceWith(
        { userId: "usr_1" },
        { $setOnInsert: { anonymousId: null, createdAt: expect.any(Date) } },
        { upsert: true, returnDocument: "after" }
      );
    });

    it("stitches the userId onto an anonymous identifier when both halves are present", async () => {
      const { store, identifiers } = makeStore();
      await store.getOrCreateIdentifier({ anonymousId: "anon-1", userId: "usr_1" });

      expect(identifiers.updateOne).toHaveBeenCalledExactlyOnceWith(
        { _id: identifierDoc()._id, userId: null },
        { $set: { userId: "usr_1", updatedAt: expect.any(Date) } }
      );
    });

    it("never overwrites an already-linked userId (first link wins), and does not stitch an anonymous batch", async () => {
      const { store, identifiers } = makeStore();
      identifiers.findOneAndUpdate.mockResolvedValue(identifierDoc({ userId: "usr_first" }));
      await store.getOrCreateIdentifier({ anonymousId: "anon-1", userId: "usr_second" });
      expect(identifiers.updateOne).not.toHaveBeenCalled();

      identifiers.findOneAndUpdate.mockResolvedValue(identifierDoc());
      await store.getOrCreateIdentifier({ anonymousId: "anon-1", userId: null });
      expect(identifiers.updateOne).not.toHaveBeenCalled();
    });

    it("retries once when the unique index answers a lost upsert race", async () => {
      const { store, identifiers } = makeStore();
      identifiers.findOneAndUpdate.mockRejectedValueOnce({ code: 11000 }).mockResolvedValueOnce(identifierDoc());
      await expect(store.getOrCreateIdentifier({ anonymousId: "anon-1", userId: null })).resolves.toBe(ID);
      expect(identifiers.findOneAndUpdate).toHaveBeenCalledTimes(2);
    });

    it("rejects an identity with neither half", async () => {
      const { store } = makeStore();
      await expect(store.getOrCreateIdentifier({ anonymousId: null, userId: null })).rejects.toThrow(
        "[analytics] an identity needs an anonymousId or a userId"
      );
    });
  });

  describe("appendEvents", () => {
    it("appends the batch in order with both clocks, and writes nothing for an empty one", async () => {
      const { store, events } = makeStore();
      const occurredAt = new Date("2026-09-09T09:00:00Z");
      const receivedAt = new Date("2026-09-09T09:00:02Z");
      await store.appendEvents(ID, [
        { event: VIEWED, occurredAt, receivedAt },
        { event: DONE, occurredAt, receivedAt },
      ]);

      expect(events.insertMany).toHaveBeenCalledExactlyOnceWith(
        [
          { identifier: new ObjectId(ID), event: VIEWED, occurredAt, receivedAt },
          { identifier: new ObjectId(ID), event: DONE, occurredAt, receivedAt },
        ],
        { ordered: true }
      );

      await store.appendEvents(ID, []);
      expect(events.insertMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("incrementMetrics", () => {
    it("bulk-upserts one counted op per distinct payload, unordered", async () => {
      const { store, metrics } = makeStore();
      await store.incrementMetrics(ID, [DONE, VIEWED, DONE]);

      expect(metrics.bulkWrite).toHaveBeenCalledExactlyOnceWith(
        [
          {
            updateOne: {
              filter: { identifier: new ObjectId(ID), key: metricKeyOf(DONE) },
              update: {
                $inc: { count: 2 },
                $set: { lastSeenAt: expect.any(Date) },
                $setOnInsert: { event: DONE, firstSeenAt: expect.any(Date) },
              },
              upsert: true,
            },
          },
          {
            updateOne: {
              filter: { identifier: new ObjectId(ID), key: metricKeyOf(VIEWED) },
              update: {
                $inc: { count: 1 },
                $set: { lastSeenAt: expect.any(Date) },
                $setOnInsert: { event: VIEWED, firstSeenAt: expect.any(Date) },
              },
              upsert: true,
            },
          },
        ],
        { ordered: false }
      );
    });

    it("writes nothing for an empty batch", async () => {
      const { store, metrics } = makeStore();
      await store.incrementMetrics(ID, []);
      expect(metrics.bulkWrite).not.toHaveBeenCalled();
    });
  });
});
