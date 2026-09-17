import { z } from "zod";
import { SESSION_EXTRA_COOKIE, sessionExtraCookie, sessionExtraValue } from "../mock-session";
import { type MockCookies, mockCookieName, mockStateCookie, readMockState } from "../mock-state";
import {
  NO_SUBSCRIPTION,
  STRIPE_PROVIDER,
  type SubscriptionAccess,
  endsAtFrom,
  hasEverTrialed,
  isActiveStatus,
  isEnding,
} from "./access";

/**
 * Mock mode's subscription, as a cookie.
 *
 * A mocked checkout answers with a `Set-Cookie`, and everything that needs to know what
 * was bought reads it back out of the request's cookies. That is what carries paywall →
 * checkout → the app with no server running, and across a reload.
 *
 * Two cookies always travel together, because the real thing has two sides: this ledger,
 * which says what the mocked person bought, and the session-extra cookie auth's
 * `mock-session.ts` exposes, which is how the mocked `/api/auth/get-session` answers with
 * the `access` field a real server's `customSession` puts there. Writing one without the
 * other would leave a purchased plan invisible to every gate.
 *
 * Data and pure functions only; the msw response builders live in `../mock-response.ts`.
 */
export const SUBSCRIPTION_COOKIE = mockCookieName("subscription");

/**
 * The states a mocked person can be in. `none` is the default a run boots into — a mocked
 * run has not paid, so the paywall is what a guarded route sends it to.
 *
 * `canceling` and `ending` are the two shapes Stripe gives a cancellation and a screen must
 * read the same from either: `canceling` sets `cancel_at_period_end`, which is what our own
 * call does; `ending` schedules a `cancel_at` with that flag false, which is what the
 * billing portal does. `lapsed` is the third face of "no access" — a plan on record whose
 * payment failed, which is the one that belongs at the billing portal rather than at a new
 * checkout, and whose free trial was spent long ago.
 */
export const MockSubscriptionState = z.enum(["none", "active", "trialing", "canceling", "ending", "lapsed"]);
export type MockSubscriptionState = z.infer<typeof MockSubscriptionState>;

/** Stripe's own status for each of them. `canceling` and `ending` are active until the period runs out. */
const STATUS: Record<MockSubscriptionState, string | null> = {
  none: null,
  active: "active",
  trialing: "trialing",
  canceling: "active",
  ending: "active",
  lapsed: "past_due",
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * The period runs relative to now rather than to a date written down once: `isEnding` reads
 * a scheduled stop as ending only while it is still in the future, and a fixture with a
 * fixed year in it stops being a cancellation the day it passes.
 */
const periodEnd = (): Date => new Date(Date.now() + 365 * DAY);

/** The subscription row the mocked state stands for, in the shape the predicates read. */
export function mockSubscriptionRow(state: MockSubscriptionState) {
  const end = periodEnd();
  return {
    status: STATUS[state],
    plan: "annual",
    cancelAtPeriodEnd: state === "canceling",
    cancelAt: state === "ending" ? end : null,
    periodEnd: end,
    // `lapsed` carries a spent trial on purpose: the ordinary way to reach `past_due` is to
    // have trialed, converted, and then had the card fail — and it is what makes "one trial
    // per person, ever, across subscriptions since ended" visible in mock mode.
    trialStart:
      state === "trialing"
        ? new Date(Date.now() - 2 * DAY)
        : state === "lapsed"
          ? new Date(Date.now() - 60 * DAY)
          : null,
    trialEnd:
      state === "trialing"
        ? new Date(Date.now() + 5 * DAY)
        : state === "lapsed"
          ? new Date(Date.now() - 53 * DAY)
          : null,
  };
}

/** The access field the mocked session carries — the same predicates the server applies. */
export function mockAccessFor(state: MockSubscriptionState, provider: string = STRIPE_PROVIDER): SubscriptionAccess {
  if (state === "none") return NO_SUBSCRIPTION;
  const row = mockSubscriptionRow(state);
  return {
    active: isActiveStatus(row.status),
    provider,
    status: row.status,
    plan: row.plan,
    ending: isEnding(row),
    endsAt: endsAtFrom(row),
    trialEligible: !hasEverTrialed([row]),
  };
}

/**
 * The ledger's value: the state, or `<provider>.<state>` when the seller is not this
 * module's own.
 *
 * One cookie rather than two, because a mocked answer may set only one: on native the
 * `Set-Cookie` headers of a single response are joined into one string before the jar parses
 * it, and everything after the first cookie is lost.
 */
export function subscriptionCookieValue(state: MockSubscriptionState, provider: string = STRIPE_PROVIDER): string {
  return provider === STRIPE_PROVIDER ? state : `${provider}.${state}`;
}

/** What the ledger holds, read back: the state, and the seller when it names one. */
function readStoredSubscription(cookies: MockCookies): { state: MockSubscriptionState; provider: string } {
  const raw = readMockState(cookies, SUBSCRIPTION_COOKIE, z.string());
  if (!raw) return { state: "none", provider: STRIPE_PROVIDER };
  const dot = raw.indexOf(".");
  const parsed = MockSubscriptionState.safeParse(dot === -1 ? raw : raw.slice(dot + 1));
  if (!parsed.success) return { state: "none", provider: STRIPE_PROVIDER };
  return { state: parsed.data, provider: dot === -1 ? STRIPE_PROVIDER : raw.slice(0, dot) };
}

/** The state the request carries; no cookie at all is `none` — a mocked run has not paid. */
export function readMockSubscriptionState(cookies: MockCookies): MockSubscriptionState {
  return readStoredSubscription(cookies).state;
}

/** Who the mocked jar says sold the plan. Stripe unless the ledger names somebody else. */
export function readMockProvider(cookies: MockCookies): string {
  return readStoredSubscription(cookies).provider;
}

/** The access the request's cookies add up to. */
export function mockSubscriptionAccess(cookies: MockCookies): SubscriptionAccess {
  const { state, provider } = readStoredSubscription(cookies);
  return mockAccessFor(state, provider);
}

/**
 * The `Set-Cookie` headers a mock answers with to leave the person in `state`: the ledger,
 * and the session's `access` field alongside it. Handed to `json({ setCookies })`, which
 * appends them so every runtime's `getSetCookie()` reads both.
 */
export function subscriptionCookies(state: MockSubscriptionState, provider: string = STRIPE_PROVIDER): string[] {
  return [
    mockStateCookie(SUBSCRIPTION_COOKIE, subscriptionCookieValue(state, provider)),
    sessionExtraCookie({ access: mockAccessFor(state, provider) }),
  ];
}

/** A cookie as a jar is handed one — a name and a value, for a Playwright seed. */
export type MockCookieSeed = { name: string; value: string };

/**
 * The same two cookies as jar entries, for a spec that has to start already in a state
 * rather than reach it through the mocked checkout. Encoded the way `mockStateCookie`
 * encodes them, so `readMockState` reads a seeded cookie exactly as it reads a written one.
 */
export function seedSubscribed(
  state: Exclude<MockSubscriptionState, "none"> = "active",
  provider: string = STRIPE_PROVIDER
): MockCookieSeed[] {
  return [
    { name: SUBSCRIPTION_COOKIE, value: encodeURIComponent(subscriptionCookieValue(state, provider)) },
    {
      name: SESSION_EXTRA_COOKIE,
      value: encodeURIComponent(sessionExtraValue({ access: mockAccessFor(state, provider) })),
    },
  ];
}

/** Signed in and never subscribed — the state a mocked run boots into, written out. */
export function seedUnsubscribed(): MockCookieSeed[] {
  return [
    { name: SUBSCRIPTION_COOKIE, value: encodeURIComponent("none") },
    { name: SESSION_EXTRA_COOKIE, value: encodeURIComponent(sessionExtraValue({ access: NO_SUBSCRIPTION })) },
  ];
}
