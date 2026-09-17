import type { Item } from "@contracts/example/item";

/**
 * What the feature asks of storage, and nothing about how it is kept.
 *
 * Structural, so a spec stubs it with three closures and the memory store satisfies it
 * without a database; a Prisma store under the `db-prisma` module satisfies the same
 * shape over a `Db` slice. `null` is "no such item" — the controller decides that is a 404.
 */
export type ExampleStore = {
  list(): Promise<Item[]>;
  find(id: string): Promise<Item | null>;
  setDone(id: string, done: boolean, at: Date): Promise<Item | null>;
};

export type ExampleDeps = {
  store: ExampleStore;
  /** the clock, injected so a spec can pin `updatedAt` */
  now?: () => Date;
};

export async function listItems(deps: ExampleDeps): Promise<Item[]> {
  return deps.store.list();
}

export async function getItem(deps: ExampleDeps, id: string): Promise<Item | null> {
  return deps.store.find(id);
}

/**
 * The one write. `updatedAt` is stamped here, not by the caller, so every store agrees on
 * whose clock the timestamp came from.
 */
export async function setItemDone(deps: ExampleDeps, id: string, done: boolean): Promise<Item | null> {
  return deps.store.setDone(id, done, (deps.now ?? (() => new Date()))());
}
