import { handlers as deleteAccount } from "./delete-account.mock";
import { handlers as me } from "./me.mock";

/**
 * Every mock this feature owns. A new endpoint here is a new `<endpoint>.mock.ts` and one
 * line below — `KIT_HANDLERS` spreads this list and never names an endpoint.
 */
export const handlers = [...me, ...deleteAccount];
