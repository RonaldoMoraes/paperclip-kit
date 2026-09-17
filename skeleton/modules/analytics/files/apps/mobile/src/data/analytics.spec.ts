import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

/** The module holds the launch's id; each case imports it fresh, the way a launch gets it. */
async function fresh() {
  vi.resetModules();
  return import("./analytics");
}

describe("the device's anonymous id", () => {
  it("hands every batch of a launch one contract-valid id, under the scheme's key", async () => {
    const { anonymousId, ANONYMOUS_ID_KEY } = await fresh();

    const minted = await anonymousId();

    expect(() => z.uuid().parse(minted)).not.toThrow();
    expect(await anonymousId()).toBe(minted);
    expect(ANONYMOUS_ID_KEY).toMatch(/_analytics_anonymous_id$/);
  });
});
