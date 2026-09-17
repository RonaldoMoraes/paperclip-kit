import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "__PRODUCT_SLUG__-state-v1";

/**
 * The store loads once, at import: each case that cares about what was on disk seeds
 * localStorage first and imports a fresh module, the way a returning browser would.
 */
async function freshStore() {
  vi.resetModules();
  return import("./store");
}

describe("store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts empty on a first visit", async () => {
    const store = await freshStore();
    expect(store.getState()).toEqual({ lastVisitedItemId: null });
  });

  it("remembers the visited item and writes it under the versioned key", async () => {
    const store = await freshStore();
    store.rememberVisitedItem("first-thing");
    expect(store.getState().lastVisitedItemId).toBe("first-thing");
    expect(JSON.parse(localStorage.getItem(KEY) ?? "{}")).toEqual({ lastVisitedItemId: "first-thing" });
  });

  it("reads what a returning browser carries, and defaults a field it has never seen", async () => {
    // an older build wrote only what it knew; a field added since starts at EMPTY's value
    localStorage.setItem(KEY, JSON.stringify({ unknownField: 1 }));
    const store = await freshStore();
    expect(store.getState().lastVisitedItemId).toBeNull();
    // and a field it did write comes back
    localStorage.setItem(KEY, JSON.stringify({ lastVisitedItemId: "second-thing" }));
    const returning = await freshStore();
    expect(returning.getState().lastVisitedItemId).toBe("second-thing");
  });

  it("treats an unreadable value as a first visit rather than throwing", async () => {
    localStorage.setItem(KEY, "{not json");
    const store = await freshStore();
    expect(store.getState()).toEqual({ lastVisitedItemId: null });
  });

  it("resetAll wipes back to a first visit", async () => {
    const store = await freshStore();
    store.rememberVisitedItem("first-thing");
    store.resetAll();
    expect(store.getState().lastVisitedItemId).toBeNull();
    expect(localStorage.getItem(KEY)).toContain('"lastVisitedItemId":null');
  });
});
