import { describe, expect, it } from "vitest";
import type { Item } from "@contracts/example/item";
import { filterCounts, itemsForFilter, orderItems } from "./derive";

const item = (id: string, done: boolean, updatedAt: string): Item => ({ id, title: id, note: "", done, updatedAt });

const ITEMS = [
  item("old-open", false, "2026-01-01T00:00:00.000Z"),
  item("done", true, "2026-01-03T00:00:00.000Z"),
  item("new-open", false, "2026-01-02T00:00:00.000Z"),
];

describe("derive", () => {
  // The count on a pill and the rows under it are one derivation, so the number a user
  // taps on is the number of rows he gets.
  it("counts every filter the way it lists it", () => {
    const counts = filterCounts(ITEMS);
    expect(counts).toEqual({ all: 3, open: 2, done: 1 });
    expect(itemsForFilter(ITEMS, "open").map((i) => i.id)).toEqual(["old-open", "new-open"]);
    expect(itemsForFilter(ITEMS, "done").map((i) => i.id)).toEqual(["done"]);
  });

  it("puts what is left to do on top, newest first, and leaves the input alone", () => {
    expect(orderItems(ITEMS).map((i) => i.id)).toEqual(["new-open", "old-open", "done"]);
    expect(ITEMS.map((i) => i.id)).toEqual(["old-open", "done", "new-open"]);
  });
});
