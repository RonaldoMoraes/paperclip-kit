import { http } from "msw";
import { json, notFound } from "../mock-response";
import { itemStateCookie, readMockItemState, withItemState } from "./mock-item-state";
import { MOCK_ITEMS } from "./mock-library";
import { SetItemDoneRequest, SetItemDoneResponse } from "./set-item-done";

/** The default response: the first seed item, marked done. */
export const fixture = SetItemDoneResponse.parse({ ...MOCK_ITEMS[0], done: true });

export const handlers = [
  http.put("*/api/example/items/:id/done", async ({ cookies, params, request }) => {
    const held = MOCK_ITEMS.find((item) => item.id === params.id);
    if (!held) return notFound("There is no item with that id.");
    const { done } = SetItemDoneRequest.parse(await request.json());
    // The ledger is the whole of what a mocked run has written: the next read of the list
    // and of this item both apply it, which is what makes the toggle hold across screens.
    const next = { ...readMockItemState(cookies), [held.id]: { done, updatedAt: new Date().toISOString() } };
    return json(SetItemDoneResponse.parse(withItemState([held], next)[0]), {
      headers: { "set-cookie": itemStateCookie(next) },
    });
  }),
];
