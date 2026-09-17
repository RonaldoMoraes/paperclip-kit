import { handlers as getItem } from "./get-item.mock";
import { handlers as listItems } from "./list-items.mock";
import { handlers as setItemDone } from "./set-item-done.mock";

/**
 * Every mock this feature owns. A new endpoint here is a new `<endpoint>.mock.ts` and one
 * line below — the registry in `../mocks.ts` spreads this list and never names an endpoint.
 */
export const handlers = [...listItems, ...getItem, ...setItemDone];
