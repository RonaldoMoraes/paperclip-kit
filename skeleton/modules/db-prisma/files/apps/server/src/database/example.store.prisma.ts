import type { Item } from "@contracts/example/item";
import type { ExampleStore } from "../example/example.service";
import type { Db } from "./scope-extension";

/** One row as this store reads it — the columns it maps, not the whole model. */
type ExampleRow = { slug: string; title: string; note: string; done: boolean; updatedAt: Date };

/**
 * The slice of the client this store touches. Structural, so a spec stubs it with three
 * closures and no database, and so the store names exactly the operations it makes —
 * `prismaExampleStore` below is where the real client is checked against it.
 */
export type ExampleDb = {
  exampleItem: {
    findMany(args: { orderBy: { id: "asc" } }): Promise<ExampleRow[]>;
    findUnique(args: { where: { slug: string } }): Promise<ExampleRow | null>;
    update(args: { where: { slug: string }; data: { done: boolean; updatedAt: Date } }): Promise<ExampleRow>;
  };
};

/**
 * The example items, in Postgres.
 *
 * Same `ExampleStore` shape as the memory store, so the controller and the service never
 * learn which one they hold; a feature module swaps the provider (`docs/db-prisma.md`).
 * Rows come back in insertion order — the seed's order, which is the fixture's.
 */
export class PrismaExampleStore implements ExampleStore {
  constructor(private readonly db: ExampleDb) {}

  async list(): Promise<Item[]> {
    const rows = await this.db.exampleItem.findMany({ orderBy: { id: "asc" } });
    return rows.map(toItem);
  }

  async find(id: string): Promise<Item | null> {
    const row = await this.db.exampleItem.findUnique({ where: { slug: id } });
    return row ? toItem(row) : null;
  }

  /**
   * Read, then write: `update` on a slug with no row throws Prisma's P2025, and "no such
   * item" is an answer this store gives (`null`), not an error code it catches.
   */
  async setDone(id: string, done: boolean, at: Date): Promise<Item | null> {
    const held = await this.db.exampleItem.findUnique({ where: { slug: id } });
    if (!held) return null;
    return toItem(await this.db.exampleItem.update({ where: { slug: id }, data: { done, updatedAt: at } }));
  }
}

/**
 * The factory a feature module lists in place of the memory store: `inject: [PRISMA]` and
 * this. Typed on the whole client, so `typecheck` proves the slice above is one it has.
 */
export function prismaExampleStore(db: Db): ExampleStore {
  return new PrismaExampleStore(db);
}

/** The row on the wire: `slug` is the id, the timestamp an ISO string. */
function toItem(row: ExampleRow): Item {
  return { id: row.slug, title: row.title, note: row.note, done: row.done, updatedAt: row.updatedAt.toISOString() };
}
