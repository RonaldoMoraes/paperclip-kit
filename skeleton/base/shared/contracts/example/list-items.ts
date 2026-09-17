import { z } from "zod";
import type { Http } from "../http";
import { Item } from "./item";

/** `GET /api/example/items` — every item, in the order the store keeps them. */
export const ListItemsResponse = z.object({
  items: z.array(Item),
});
export type ListItemsResponse = z.infer<typeof ListItemsResponse>;

export function listItems(http: Http): Promise<ListItemsResponse> {
  return http.get("/api/example/items", ListItemsResponse);
}

export function listItemsQuery(http: Http) {
  return {
    queryKey: ["example", "items"] as const,
    // A write from the detail screen must show on the list on the way back.
    staleTime: 0,
    queryFn: () => listItems(http),
  };
}
