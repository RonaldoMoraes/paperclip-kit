import type { AppState } from "../data/store";

/**
 * Canonical store seeds, shared by the unit specs and the Playwright suite.
 *
 * Relative imports on purpose: this file is loaded by Playwright, which does not know the
 * client's `~` alias. Plain data + type-only imports only — importing a component here
 * would drag React into the e2e runner.
 */

/** A returning browser that opened an item before: the list marks that row. */
export const visitedSeed = (id: string): Partial<AppState> => ({ lastVisitedItemId: id });
