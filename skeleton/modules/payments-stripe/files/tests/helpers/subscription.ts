import type { Page } from "@playwright/test";
import type { MockSubscriptionState } from "../../shared/contracts/subscription/mock-subscription";
import { seedSubscribed, seedUnsubscribed } from "../../shared/contracts/subscription/mock-subscription";
import { BASE_URL } from "../config/base-url";

/**
 * The mocked entitlement, seeded the way the mocks write it: the ledger cookie and the
 * session-extra cookie that carries `access`, on the app's origin, before the screen under
 * test loads. Both together, always — a ledger without the session field is a plan no gate
 * can see, which is not a state the real thing can be in.
 *
 * Relative imports on purpose: Playwright does not know the client's `~` alias. The
 * mock-subscription module is zod and data, no msw.
 */
async function seed(page: Page, cookies: { name: string; value: string }[]): Promise<void> {
  await page.context().addCookies(cookies.map((cookie) => ({ ...cookie, url: BASE_URL })));
}

/**
 * Signed in with a plan — `active` unless the spec is about one of the other shapes, and
 * sold here unless it is about one bought somewhere else. The seller rides in the ledger the
 * way the real column does, so a store-sold plan reads as one on every screen at once.
 */
export async function seedSubscription(
  page: Page,
  state: Exclude<MockSubscriptionState, "none"> = "active",
  provider?: string
) {
  await seed(page, seedSubscribed(state, provider));
}

/** Signed in and never subscribed — what a mocked run boots into, written out. */
export async function seedNoSubscription(page: Page): Promise<void> {
  await seed(page, seedUnsubscribed());
}
