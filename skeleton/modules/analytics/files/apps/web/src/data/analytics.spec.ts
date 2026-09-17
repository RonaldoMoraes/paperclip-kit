import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const KEY = "__PRODUCT_SLUG__-anonymous-id";
const STORE_KEY = "__PRODUCT_SLUG__-state-v1";

/**
 * The id is read once per module: each case that cares about what was on disk seeds
 * localStorage first and imports a fresh module, the way a returning browser would. The
 * id's own rules are the contract's; what this file adds is the key and the browser.
 */
async function fresh() {
  vi.resetModules();
  return import("./analytics");
}

describe("the web anonymous id", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("mints a contract-valid id under its own key, and a returning browser reads it back", async () => {
    const minted = await (await fresh()).anonymousId();

    expect(() => z.uuid().parse(minted)).not.toThrow();
    expect(localStorage.getItem(KEY)).toBe(minted);
    expect(await (await fresh()).anonymousId()).toBe(minted);
  });

  // A reset is the same visitor: the id lives beside the versioned state, not in it.
  it("survives the store's reset", async () => {
    const minted = await (await fresh()).anonymousId();
    const store = await import("./store");

    store.resetAll();

    expect(localStorage.getItem(STORE_KEY)).not.toBeNull();
    expect(localStorage.getItem(KEY)).toBe(minted);
  });
});
