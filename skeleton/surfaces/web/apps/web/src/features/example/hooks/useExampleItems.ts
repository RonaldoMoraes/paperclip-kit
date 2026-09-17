import { useSuspenseQuery } from "@tanstack/react-query";
import { getItemQuery } from "@contracts/example/get-item";
import type { Item } from "@contracts/example/item";
import { listItemsQuery } from "@contracts/example/list-items";
import { http } from "~/lib/http";

/**
 * The list's data. Suspense reads on purpose — the route's loader has already warmed the
 * query, so nothing here ever renders a loading branch; what the hook adds is liveness,
 * because flipping a flag invalidates `["example"]` and the counts must move while the
 * screen is mounted.
 */
export function useExampleItems(): { items: Item[] } {
  const { data } = useSuspenseQuery(listItemsQuery(http));
  return { items: data.items };
}

/** One item, off the query the route ensured. */
export function useExampleItem(id: string): { item: Item } {
  const { data } = useSuspenseQuery(getItemQuery(http, id));
  return { item: data };
}
