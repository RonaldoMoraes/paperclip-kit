import { z } from "zod";
import type { Http } from "../http";
import { Item } from "./item";

/**
 * `PUT /api/example/items/:id/done` — the feature's one write.
 *
 * Echoes the item as stored so a client never has to assume the write took, and so the
 * new `updatedAt` reaches the screen without a second read.
 */
export const SetItemDoneRequest = z.object({
  done: z.boolean(),
});
export type SetItemDoneRequest = z.infer<typeof SetItemDoneRequest>;

export const SetItemDoneResponse = Item;
export type SetItemDoneResponse = z.infer<typeof SetItemDoneResponse>;

export function setItemDone(http: Http, id: string, done: boolean): Promise<SetItemDoneResponse> {
  return http.put(`/api/example/items/${encodeURIComponent(id)}/done`, SetItemDoneResponse, { done });
}
