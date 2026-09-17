import { handlers as confirmStorePurchase } from "./confirm-store-purchase.mock";

/**
 * Every mock the store half of this feature owns — one endpoint, so far.
 *
 * A barrel of its own rather than a line in `./index.ts`: that file is `payments-stripe`'s,
 * and a module never edits another's. The registry in `../mocks.ts` spreads both through
 * `mocks.gen.ts` and names neither, so two barrels cost nothing. A new endpoint here is a
 * new `<endpoint>.mock.ts` and one line below.
 *
 * As with every feature barrel: this exists for `mocks.ts` and `contracts.handlers`, and
 * an app never imports it — it holds msw, and a screen importing it would pull msw into
 * the bundle.
 */
export const handlers = [...confirmStorePurchase];
