import { handlers as example } from "./example";
import { handlers as health } from "./health";
import { KIT_HANDLERS } from "./mocks.gen";

/**
 * Every endpoint's mock, in one list — the whole API as the front ends see it with no
 * server running. Platform-free on purpose: the web app feeds this to `setupWorker`, the
 * Expo app to `setupServer`, the Playwright suite runs it as its hermetic defaults, and
 * none of them is named here.
 *
 * One line per feature; the opted-in modules arrive through the generated list. An
 * endpoint belongs to its feature's `index.ts`, so two features being built at once never
 * touch the same line.
 */
export const handlers = [...health, ...example, ...KIT_HANDLERS];
