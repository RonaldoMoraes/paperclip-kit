import { describe, expect, it } from "vitest";
import { type ExampleDb, PrismaExampleStore } from "./example.store.prisma";

const ROW = { slug: "one", title: "One", note: "", done: false, updatedAt: new Date("2026-01-01T00:00:00.000Z") };

/** The slice as closures: one row, and a ledger of what was written. */
function stubDb(): { db: ExampleDb; written: Array<{ slug: string; done: boolean; updatedAt: Date }> } {
  const written: Array<{ slug: string; done: boolean; updatedAt: Date }> = [];
  return {
    written,
    db: {
      exampleItem: {
        findMany: async () => [ROW],
        findUnique: async ({ where }) => (where.slug === ROW.slug ? ROW : null),
        update: async ({ where, data }) => {
          written.push({ slug: where.slug, ...data });
          return { ...ROW, ...data };
        },
      },
    },
  };
}

describe("PrismaExampleStore", () => {
  it("answers rows as items: the slug is the id and the timestamp is ISO", async () => {
    const { db } = stubDb();
    await expect(new PrismaExampleStore(db).list()).resolves.toEqual([
      { id: "one", title: "One", note: "", done: false, updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("finds by slug, and answers null for a slug with no row", async () => {
    const store = new PrismaExampleStore(stubDb().db);
    await expect(store.find("one")).resolves.toMatchObject({ id: "one" });
    await expect(store.find("nope")).resolves.toBeNull();
  });

  it("writes the flag and the clock it was handed, and answers the row as written", async () => {
    const { db, written } = stubDb();
    const at = new Date("2026-09-09T12:00:00.000Z");

    await expect(new PrismaExampleStore(db).setDone("one", true, at)).resolves.toEqual({
      id: "one",
      title: "One",
      note: "",
      done: true,
      updatedAt: at.toISOString(),
    });
    expect(written).toEqual([{ slug: "one", done: true, updatedAt: at }]);
  });

  it("answers null for an unknown slug and writes nothing", async () => {
    const { db, written } = stubDb();
    await expect(new PrismaExampleStore(db).setDone("nope", true, new Date())).resolves.toBeNull();
    expect(written).toEqual([]);
  });
});
