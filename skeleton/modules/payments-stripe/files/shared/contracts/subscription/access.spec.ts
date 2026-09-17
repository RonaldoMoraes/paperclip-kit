import { describe, expect, it } from "vitest";
import {
  NO_SUBSCRIPTION,
  STRIPE_PROVIDER,
  SubscriptionAccess,
  UNREADABLE_ACCESS,
  endsAtFrom,
  hasEverTrialed,
  isActiveStatus,
  isEnding,
  managedOnWeb,
  readSubscriptionAccess,
} from "./access";

const NOW = new Date("2030-06-01T00:00:00.000Z");
const LATER = new Date("2030-07-01T00:00:00.000Z");
const EARLIER = new Date("2030-05-01T00:00:00.000Z");

describe("the access predicate", () => {
  it("counts a trial as access and everything Stripe calls unpaid as none", () => {
    expect(isActiveStatus("active")).toBe(true);
    expect(isActiveStatus("trialing")).toBe(true);
    for (const status of ["incomplete", "past_due", "unpaid", "canceled", "paused", null, undefined]) {
      expect(isActiveStatus(status)).toBe(false);
    }
  });
});

describe("the access a session carries", () => {
  it("reads the field the server put there, dates and all", () => {
    const access = readSubscriptionAccess({
      user: { id: "1" },
      access: {
        active: true,
        provider: STRIPE_PROVIDER,
        status: "trialing",
        plan: "annual",
        ending: false,
        endsAt: LATER.toISOString(),
        trialEligible: false,
      },
    });

    expect(access.active).toBe(true);
    expect(access.plan).toBe("annual");
    // the wire carries an ISO string; every reader gets a Date back
    expect(access.endsAt).toEqual(LATER);
  });

  // A session nobody could read must not promise a trial the checkout would then refuse.
  it("falls back to no access and no trial offer for anything it cannot read", () => {
    expect(readSubscriptionAccess(null)).toEqual(UNREADABLE_ACCESS);
    expect(readSubscriptionAccess({ user: { id: "1" } })).toEqual(UNREADABLE_ACCESS);
    expect(readSubscriptionAccess({ access: { active: "yes" } })).toEqual(UNREADABLE_ACCESS);
    expect(UNREADABLE_ACCESS.trialEligible).toBe(false);
    expect(NO_SUBSCRIPTION.trialEligible).toBe(true);
  });

  it("parses its own fixtures — the schema and the constants cannot drift apart", () => {
    expect(SubscriptionAccess.parse(NO_SUBSCRIPTION)).toEqual(NO_SUBSCRIPTION);
    expect(SubscriptionAccess.parse(UNREADABLE_ACCESS)).toEqual(UNREADABLE_ACCESS);
  });
});

describe("where a plan is managed", () => {
  // Cancel, restore and the billing portal exist only where the plan was sold: Stripe
  // cannot cancel an Apple subscription, and the portal would open the wrong account.
  it("is here only for a plan this app sold", () => {
    expect(managedOnWeb({ provider: STRIPE_PROVIDER })).toBe(true);
    expect(managedOnWeb({ provider: "revenuecat" })).toBe(false);
  });

  it("is nowhere when there is no plan at all", () => {
    expect(managedOnWeb(NO_SUBSCRIPTION)).toBe(false);
    expect(managedOnWeb(UNREADABLE_ACCESS)).toBe(false);
  });
});

describe("an ending, in both of Stripe's shapes", () => {
  it("reads our own cancellation off the flag", () => {
    expect(isEnding({ cancelAtPeriodEnd: true, periodEnd: LATER }, NOW)).toBe(true);
  });

  // The billing portal schedules a stop and leaves the flag false; a screen reading the
  // flag alone would offer to cancel a subscription that is already cancelled.
  it("reads the billing portal's cancellation off the scheduled stop", () => {
    expect(isEnding({ cancelAtPeriodEnd: false, cancelAt: LATER }, NOW)).toBe(true);
  });

  it("does not call a stop that has already passed an ending", () => {
    expect(isEnding({ cancelAt: EARLIER, periodEnd: LATER }, NOW)).toBe(false);
  });

  it("dates a subscription by its scheduled stop, or by its renewal when there is none", () => {
    expect(endsAtFrom({ cancelAt: LATER, periodEnd: EARLIER }, NOW)).toEqual(LATER);
    expect(endsAtFrom({ periodEnd: LATER.toISOString() }, NOW)).toEqual(LATER);
    expect(endsAtFrom({ cancelAt: EARLIER, periodEnd: LATER }, NOW)).toEqual(LATER);
    expect(endsAtFrom({}, NOW)).toBeNull();
  });
});

describe("one trial per person, ever", () => {
  it("counts a trial on any row, however it is recorded", () => {
    expect(hasEverTrialed([{ trialStart: EARLIER }])).toBe(true);
    expect(hasEverTrialed([{ trialEnd: EARLIER }])).toBe(true);
    expect(hasEverTrialed([{ status: "trialing" }])).toBe(true);
  });

  it("leaves someone who has only ever paid eligible", () => {
    expect(hasEverTrialed([{ status: "active" }, { status: "canceled" }])).toBe(false);
    expect(hasEverTrialed([])).toBe(false);
  });
});
