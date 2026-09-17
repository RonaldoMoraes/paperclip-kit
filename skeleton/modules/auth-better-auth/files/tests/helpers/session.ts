import type { Page } from "@playwright/test";
import type { SessionUser } from "../../shared/contracts/auth/session";
import { MOCK_USER, SESSION_COOKIE, SIGNED_OUT_VALUE, mockSessionValue } from "../../shared/contracts/mock-session";
import { BASE_URL } from "../config/base-url";

/**
 * The mocked session, seeded the way the mocks read it: as the session cookie on the
 * app's origin, before the screen under test loads. A run seeds nothing to be signed in —
 * mock mode boots as `MOCK_USER` (`shared/contracts/mock-session.ts`) — so these are for
 * the two other states: a named person, and nobody.
 *
 * Relative imports on purpose: this file is loaded by Playwright, which does not know the
 * client's `~` alias. The mock-session module is zod and data, no msw.
 */
async function seedCookie(page: Page, value: string): Promise<void> {
  await page.context().addCookies([{ name: SESSION_COOKIE, value, url: BASE_URL }]);
}

/** Signed in as `user` — `MOCK_USER` by default, or the same person under another address. */
export async function seedSession(page: Page, user: SessionUser = MOCK_USER): Promise<void> {
  await seedCookie(page, mockSessionValue(user));
}

/** Signed out: the marker sign-out leaves, so the gate turns the visitor away. */
export async function seedSignedOut(page: Page): Promise<void> {
  await seedCookie(page, SIGNED_OUT_VALUE);
}
