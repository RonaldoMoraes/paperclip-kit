import { describe, expect, it } from "vitest";
import type { Item } from "@contracts/example/item";
import { type ExampleStore, getItem, listItems, setItemDone } from "./example.service";

const ITEM: Item = { id: "one", title: "One", note: "", done: false, updatedAt: "2026-01-01T00:00:00.000Z" };

/** The seam as three closures: what was written is what the spec reads back. */
function stubStore(): { store: ExampleStore; written: Array<{ id: string; done: boolean; at: Date }> } {
  const written: Array<{ id: string; done: boolean; at: Date }> = [];
  return {
    written,
    store: {
      list: async () => [ITEM],
      find: async (id) => (id === ITEM.id ? ITEM : null),
      setDone: async (id, done, at) => {
        if (id !== ITEM.id) return null;
        written.push({ id, done, at });
        return { ...ITEM, done, updatedAt: at.toISOString() };
      },
    },
  };
}

describe("listItems", () => {
  it("answers what the store holds", async () => {
    await expect(listItems(stubStore())).resolves.toEqual([ITEM]);
  });
});

describe("getItem", () => {
  it("answers the item, or null for an id the store has never seen", async () => {
    const { store } = stubStore();
    await expect(getItem({ store }, "one")).resolves.toEqual(ITEM);
    await expect(getItem({ store }, "nope")).resolves.toBeNull();
  });
});

describe("setItemDone", () => {
  it("stamps the write with the injected clock and answers the item as stored", async () => {
    const { store, written } = stubStore();
    const at = new Date("2026-09-09T12:00:00.000Z");

    await expect(setItemDone({ store, now: () => at }, "one", true)).resolves.toEqual({
      ...ITEM,
      done: true,
      updatedAt: at.toISOString(),
    });
    expect(written).toEqual([{ id: "one", done: true, at }]);
  });

  it("answers null for an unknown id and writes nothing", async () => {
    const { store, written } = stubStore();
    await expect(setItemDone({ store }, "nope", true)).resolves.toBeNull();
    expect(written).toEqual([]);
  });
});
