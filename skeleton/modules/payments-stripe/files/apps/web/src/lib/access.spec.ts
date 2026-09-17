import { describe, expect, it } from "vitest";
import { requireAccess } from "./access";

const access = (over: Record<string, unknown> = {}) => ({
  access: {
    active: true,
    provider: "stripe",
    status: "active",
    plan: "annual",
    ending: false,
    endsAt: null,
    trialEligible: false,
    ...over,
  },
});

describe("the entitlement a route is behind", () => {
  it("lets an active subscription through", () => {
    expect(() => requireAccess(access())).not.toThrow();
    expect(() => requireAccess(access({ status: "trialing" }))).not.toThrow();
  });

  it("sends everyone else to the paywall", () => {
    expect(() => requireAccess(access({ active: false }))).toThrow();
  });

  // Fail closed: a session that never carried the field is not a subscriber.
  it("sends a session it cannot read to the paywall too", () => {
    expect(() => requireAccess(null)).toThrow();
    expect(() => requireAccess({ user: { id: "1" } })).toThrow();
  });
});
