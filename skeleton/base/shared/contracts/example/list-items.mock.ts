import { http } from "msw";
import { json } from "../mock-response";
import { ListItemsResponse } from "./list-items";
import { readMockItemState, withItemState } from "./mock-item-state";
import { MOCK_ITEMS } from "./mock-library";

/** The default response: the seed, untouched. */
export const fixture = ListItemsResponse.parse({ items: MOCK_ITEMS });

export const handlers = [
  http.get("*/api/example/items", ({ cookies }) =>
    json(ListItemsResponse.parse({ items: withItemState(MOCK_ITEMS, readMockItemState(cookies)) }))
  ),
];
