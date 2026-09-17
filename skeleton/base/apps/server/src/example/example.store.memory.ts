import type { Item } from "@contracts/example/item";
import type { ExampleStore } from "./example.service";

/**
 * The items, in process memory.
 *
 * Seeded from the contract's own fixture (`mock-library.ts`), so the server, the mocks and
 * the e2e suite start from one list and a screen built against the mock meets the same
 * data when the real server answers. State lives for the process: a restart resets it,
 * which is what a store with no database should do rather than pretend otherwise.
 */
export class MemoryExampleStore implements ExampleStore {
  private readonly items = new Map<string, Item>();

  constructor(seed: readonly Item[]) {
    for (const item of seed) this.items.set(item.id, { ...item });
  }

  async list(): Promise<Item[]> {
    return [...this.items.values()].map((item) => ({ ...item }));
  }

  async find(id: string): Promise<Item | null> {
    const item = this.items.get(id);
    return item ? { ...item } : null;
  }

  async setDone(id: string, done: boolean, at: Date): Promise<Item | null> {
    const held = this.items.get(id);
    if (!held) return null;
    const next = { ...held, done, updatedAt: at.toISOString() };
    this.items.set(id, next);
    return { ...next };
  }
}
