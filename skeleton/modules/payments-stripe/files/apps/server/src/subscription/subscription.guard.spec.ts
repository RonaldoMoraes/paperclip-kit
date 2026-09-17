import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { SessionNotResolvedError, SubscriptionException, SubscriptionGuard } from "./subscription.guard";

const contextFor = (request: unknown): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as ExecutionContext;

const withAccess = (access: unknown) => contextFor({ session: { user: { id: "7" }, access } });

const ACTIVE = {
  active: true,
  provider: "stripe",
  status: "active",
  plan: "annual",
  ending: false,
  endsAt: null,
  trialEligible: false,
};

describe("the gate on what a subscription pays for", () => {
  it("lets an active subscriber through", () => {
    expect(new SubscriptionGuard().canActivate(withAccess(ACTIVE))).toBe(true);
  });

  it("lets a trial through — a trial is access", () => {
    expect(new SubscriptionGuard().canActivate(withAccess({ ...ACTIVE, status: "trialing" }))).toBe(true);
  });

  it("refuses in the envelope, with this module's own code", () => {
    const failure = (() => {
      try {
        new SubscriptionGuard().canActivate(withAccess({ ...ACTIVE, active: false }));
      } catch (error) {
        return error;
      }
    })();

    expect(failure).toBeInstanceOf(SubscriptionException);
    expect((failure as SubscriptionException).getStatus()).toBe(403);
    expect((failure as SubscriptionException).getResponse()).toMatchObject({ code: "SUBSCRIPTION_REQUIRED" });
  });

  // Silence is not a subscriber: a session that never carried the field reads as no access.
  it("refuses a session carrying no access at all", () => {
    expect(() => new SubscriptionGuard().canActivate(withAccess(undefined))).toThrow(SubscriptionException);
  });

  // A wiring mistake, not a refusal — the person is not the problem.
  it("says so when the session guard never ran", () => {
    expect(() => new SubscriptionGuard().canActivate(contextFor({}))).toThrow(SessionNotResolvedError);
  });
});
