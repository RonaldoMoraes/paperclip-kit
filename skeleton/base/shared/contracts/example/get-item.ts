import type { z } from "zod";
import type { Http } from "../http";
import { Item } from "./item";

/** `GET /api/example/items/:id` — one item; `404 NOT_FOUND` for an id nothing answers to. */
export const GetItemResponse = Item;
export type GetItemResponse = z.infer<typeof GetItemResponse>;

export function getItem(http: Http, id: string): Promise<GetItemResponse> {
  return http.get(`/api/example/items/${encodeURIComponent(id)}`, GetItemResponse);
}

export function getItemQuery(http: Http, id: string) {
  return {
    queryKey: ["example", "items", id] as const,
    staleTime: 0,
    queryFn: () => getItem(http, id),
  };
}
