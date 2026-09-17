import { z } from "zod";
import { type MockCookies, mockCookieName, mockStateCookie, readMockState } from "../mock-state";
import { type Item, ItemId } from "./item";

/**
 * Mock mode's writes, as a cookie ledger over the fixed seed.
 *
 * The seed never changes; what a mocked run wrote on top of it does, and it lives in one
 * cookie so a toggle survives a reload and both apps read the same answer. Only the two
 * fields a write can change are kept, keyed by id — the rest of an item is always the seed's.
 */
export const ITEM_STATE_COOKIE = mockCookieName("example-items");

export const MockItemState = z.record(ItemId, z.object({ done: z.boolean(), updatedAt: z.iso.datetime() }));
export type MockItemState = z.infer<typeof MockItemState>;

/** The cookie carries the ledger as JSON; anything unreadable is an empty ledger, never a throw. */
const MockItemStateValue = z
  .string()
  .transform((raw, ctx): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      ctx.addIssue({ code: "custom", message: "not JSON" });
      return z.NEVER;
    }
  })
  .pipe(MockItemState);

export function itemStateValue(state: MockItemState): string {
  return JSON.stringify(MockItemState.parse(state));
}

export function itemStateCookie(state: MockItemState): string {
  return mockStateCookie(ITEM_STATE_COOKIE, itemStateValue(state));
}

export function readMockItemState(cookies: MockCookies): MockItemState {
  return readMockState(cookies, ITEM_STATE_COOKIE, MockItemStateValue) ?? {};
}

/** The seed with the ledger's writes applied — what every read answers. */
export function withItemState(items: readonly Item[], state: MockItemState): Item[] {
  return items.map((item) => {
    const written = state[item.id];
    return written ? { ...item, ...written } : { ...item };
  });
}
