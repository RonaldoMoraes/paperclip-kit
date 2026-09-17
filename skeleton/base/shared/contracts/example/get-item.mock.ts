import { http } from "msw";
import { json, notFound } from "../mock-response";
import { GetItemResponse } from "./get-item";
import { readMockItemState, withItemState } from "./mock-item-state";
import { MOCK_ITEMS } from "./mock-library";

/** The default response: the first seed item. */
export const fixture = GetItemResponse.parse(MOCK_ITEMS[0]);

export const handlers = [
  http.get("*/api/example/items/:id", ({ cookies, params }) => {
    const item = withItemState(MOCK_ITEMS, readMockItemState(cookies)).find((held) => held.id === params.id);
    if (!item) return notFound("There is no item with that id.");
    return json(GetItemResponse.parse(item));
  }),
];
