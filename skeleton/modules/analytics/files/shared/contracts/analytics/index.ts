import { handlers as trackEvents } from "./track-events.mock";

/**
 * Every mock this feature owns. A new endpoint here is a new `<endpoint>.mock.ts` and one
 * line below — the generated registry (`../mocks.gen.ts`) spreads this list and never
 * names an endpoint.
 */
export const handlers = [...trackEvents];
