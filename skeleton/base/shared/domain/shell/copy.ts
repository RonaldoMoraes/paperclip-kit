import type { TabName } from "./tabs";

/**
 * The shell's copy: what the app says around a feature rather than inside one — the tab
 * labels, the pending state, the way to try again. PLACEHOLDER WORDING; the keys are
 * what web and mobile share.
 */
export const SHELL_COPY = {
  /** one label per destination in `shell/tabs.ts` — a tab added there is a type error here until it has one */
  tabs: { example: "Items", settings: "Settings" } satisfies Record<TabName, string>,
  pending: "Loading…",
  /** a screen that failed to load: what happened, what to do, and the way to retry — web's `RouteError`, mobile's `ScreenFailed` */
  error: {
    title: "Something went wrong.",
    body: "That didn't load. Try again in a moment.",
    retry: "Try again",
  },
};
