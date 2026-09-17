import type { Page } from "@playwright/test";
import { expect } from "../fixtures/web";

/** The app's versioned localStorage key — `apps/web/src/data/store.ts` owns it. */
const STORE_KEY = "__PRODUCT_SLUG__-state-v1";

/**
 * Store seeding for specs. The app keeps its client state in localStorage; a spec installs
 * the state it needs on the app's origin BEFORE loading the screen under test, exactly as a
 * returning browser would carry it.
 */
export async function seedStore(page: Page, seed: Record<string, unknown> | null): Promise<void> {
  await page.goto("/settings");
  await page.evaluate(
    ([key, s]) => {
      if (s) localStorage.setItem(key, JSON.stringify(s));
      else localStorage.removeItem(key);
    },
    [STORE_KEY, seed] as const
  );
}

/** Assert which screen believes it is on stage (`window.__appScreen`). */
export async function expectScreenTag(page: Page, tag: string): Promise<void> {
  await expect.poll(() => page.evaluate(() => (window as { __appScreen?: string }).__appScreen)).toBe(tag);
}
