import { describe, expect, it, vi } from "vitest";
import { SOLD_ELSEWHERE_MESSAGE, SUBSCRIPTION_SOLD_ELSEWHERE } from "@contracts/subscription/errors";
import {
  PROVIDER_FIELD,
  WEB_MANAGED_PATHS,
  isWebManagedPath,
  refusesManagement,
  soldHerePlugin,
  stampProvider,
} from "./sold-here";

const adapter = (over: Record<string, unknown> = {}) =>
  ({
    id: "test",
    create: vi.fn().mockResolvedValue({ id: "1" }),
    update: vi.fn().mockResolvedValue({ id: "1" }),
    updateMany: vi.fn().mockResolvedValue(1),
    findOne: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    transaction: vi.fn(),
    ...over,
  }) as never;

describe("who sold it, written down", () => {
  it("stamps this module's own name on every subscription row it opens", async () => {
    const base = adapter();
    await stampProvider(base).create({ model: "subscription", data: { plan: "annual", referenceId: "7" } });

    expect((base as never as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ [PROVIDER_FIELD]: "stripe" }) })
    );
  });

  // The column's database default is a floor for a row written before a second seller
  // existed; a seller that lets itself be defaulted is one that never said who it was.
  it("leaves a provider the caller named alone", async () => {
    const base = adapter();
    await stampProvider(base).create({
      model: "subscription",
      data: { plan: "annual", referenceId: "7", [PROVIDER_FIELD]: "revenuecat" },
    });

    expect((base as never as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ [PROVIDER_FIELD]: "revenuecat" }) })
    );
  });

  it("stamps nothing on any other table", async () => {
    const base = adapter();
    const args = { model: "user", data: { email: "a@b.c" } };
    await stampProvider(base).create(args);

    expect((base as never as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledWith(args);
  });
});

describe("what the web may manage", () => {
  it("refuses a plan every row of which was sold somewhere else", () => {
    expect(refusesManagement([{ provider: "revenuecat" }])).toBe(true);
  });

  // Somebody who subscribed here and later on a phone still owns the web subscription;
  // refusing them the portal would strand a plan Stripe is really billing.
  it("allows it when one row is this app's own", () => {
    expect(refusesManagement([{ provider: "revenuecat" }, { provider: "stripe" }])).toBe(false);
  });

  // Nothing to manage is the route's own answer, and a better one than this guard's.
  it("says nothing when there are no rows at all", () => {
    expect(refusesManagement([])).toBe(false);
  });

  it("treats a row whose seller cannot be read as one it did not sell", () => {
    expect(refusesManagement([{}])).toBe(true);
    expect(refusesManagement([{ provider: 7 }])).toBe(true);
  });
});

describe("the guard, as Better Auth runs it", () => {
  const matcher = () => {
    const before = soldHerePlugin().hooks?.before?.[0];
    if (!before) throw new Error("the plugin declares no before hook");
    return before.matcher;
  };

  it("declares the column, or the adapter would drop it on the way in and out", () => {
    expect(soldHerePlugin().schema?.subscription?.fields?.[PROVIDER_FIELD]).toMatchObject({ type: "string" });
  });

  it("watches the three routes that change a subscription", () => {
    for (const path of WEB_MANAGED_PATHS) {
      expect(matcher()({ path } as never)).toBe(true);
      expect(isWebManagedPath(path)).toBe(true);
    }
  });

  // Buying is how somebody subscribes on the web in the first place; guarding it would
  // lock out the one person the paywall exists for.
  it("leaves buying, listing and the session probe alone", () => {
    for (const path of ["/subscription/upgrade", "/subscription/list", "/get-session"]) {
      expect(matcher()({ path } as never)).toBe(false);
    }
    expect(isWebManagedPath(undefined)).toBe(false);
  });

  it("wraps the adapter it is given, so the stamp reaches every later plugin", () => {
    const base = adapter();
    const wrapped = soldHerePlugin().init?.({ adapter: base } as never);

    expect((wrapped as { context: { adapter: unknown } }).context.adapter).not.toBe(base);
  });

  it("has one line to say, and it says where the plan can be managed instead", () => {
    expect(SOLD_ELSEWHERE_MESSAGE).toMatch(/where you bought it/i);
  });

  // A code spelled out of the message is renamed by every copy edit; this one is a client's
  // to branch on, and the mocked billing portal answers with the same string.
  it("names its own code rather than letting one be derived from the copy", () => {
    expect(SUBSCRIPTION_SOLD_ELSEWHERE).toBe("SUBSCRIPTION_SOLD_ELSEWHERE");
  });
});
