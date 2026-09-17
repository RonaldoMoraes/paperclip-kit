import type { Item } from "@contracts/example/item";

/**
 * The list's derivations — every number and list the filters show, computed from the rows
 * and nowhere else. Nothing here hardcodes a size: a count that cannot be derived from
 * what actually exists is a count that lies. The same functions as the web's
 * `features/example/derive.ts`, so the two lists cannot disagree on what "open" means.
 */

export type ExampleFilter = "all" | "open" | "done";

export const EXAMPLE_FILTERS: readonly ExampleFilter[] = ["all", "open", "done"];

export function itemsForFilter(items: Item[], filter: ExampleFilter): Item[] {
  switch (filter) {
    case "open":
      return items.filter((item) => !item.done);
    case "done":
      return items.filter((item) => item.done);
    default:
      return items;
  }
}

/** every filter's count, derived the same way its list is — the two can never disagree */
export function filterCounts(items: Item[]): Record<ExampleFilter, number> {
  return {
    all: items.length,
    open: itemsForFilter(items, "open").length,
    done: itemsForFilter(items, "done").length,
  };
}

/** open rows first, then by most recently updated — what is left to do sits on top */
export function orderItems(items: Item[]): Item[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}
