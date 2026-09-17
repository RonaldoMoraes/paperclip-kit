import { describe, expect, it } from "vitest";
import type { Item } from "@contracts/example/item";
import { filterCounts, itemsForFilter, orderItems } from "./derive";

const item = (id: string, done: boolean, updatedAt: string): Item => ({
  id,
  title: `title ${id}`,
  note: "",
  done,
  updatedAt,
});

const items = [
  item("a", false, "2026-09-01T00:00:00.000Z"),
  item("b", true, "2026-09-03T00:00:00.000Z"),
  item("c", false, "2026-09-02T00:00:00.000Z"),
];

describe("the list's derivations", () => {
  it("open and done partition the rows, and the counts agree with the lists by construction", () => {
    expect(itemsForFilter(items, "open").map((i) => i.id)).toEqual(["a", "c"]);
    expect(itemsForFilter(items, "done").map((i) => i.id)).toEqual(["b"]);
    expect(itemsForFilter(items, "all")).toHaveLength(3);
    expect(filterCounts(items)).toEqual({ all: 3, open: 2, done: 1 });
  });

  it("orders open rows first, most recently updated on top, without touching the input", () => {
    const ordered = orderItems(items);
    expect(ordered.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("counts nothing for an empty list", () => {
    expect(filterCounts([])).toEqual({ all: 0, open: 0, done: 0 });
  });
});
