import { describe, expect, it } from "vitest";
import {
  MOCK_USER,
  SESSION_COOKIE,
  SESSION_EXTRA_COOKIE,
  SIGNED_OUT_VALUE,
  clearedSessionExtraCookie,
  mockSessionValue,
  readMockSession,
  readSessionExtra,
  sessionCookie,
  sessionExtraCookie,
  signedInSession,
  signedOutCookie,
} from "./mock-session";
import { MOCK_COOKIE_PREFIX } from "./mock-state";

/** What msw hands a resolver for a `Set-Cookie` it has stored: the name and the decoded value. */
const asCookies = (setCookie: string) => {
  const [name, ...value] = setCookie.split(";")[0].split("=");
  return { [name]: decodeURIComponent(value.join("=")) };
};

describe("readMockSession", () => {
  // The whole point of the marker: a mocked run opens signed in, and only a sign-out says otherwise.
  it("boots signed in as the mock user when the request carries no session cookie", () => {
    expect(readMockSession({})).toEqual(MOCK_USER);
    expect(readMockSession({ other: "1" })).toEqual(MOCK_USER);
  });

  it("reads the signed-out marker as nobody", () => {
    expect(readMockSession(asCookies(signedOutCookie()))).toBeNull();
    expect(readMockSession({ [SESSION_COOKIE]: SIGNED_OUT_VALUE })).toBeNull();
  });

  it("rebuilds the person a mocked sign-in named, by the address they typed", () => {
    const them = { ...MOCK_USER, email: "them@example.com" };
    expect(readMockSession(asCookies(sessionCookie(them)))).toEqual(them);
    // the raw, still-encoded value a jar hands over reads the same
    expect(readMockSession({ [SESSION_COOKIE]: mockSessionValue(them) })).toEqual(them);
  });

  it("reads a foreign or mangled value as nobody rather than as the mock user", () => {
    expect(readMockSession({ [SESSION_COOKIE]: "real-session-token" })).toBeNull();
    expect(readMockSession({ [SESSION_COOKIE]: "mock.not-an-address" })).toBeNull();
  });

  it("reads one session out of a doubled cookie, as the native transport delivers it", () => {
    const value = mockSessionValue(MOCK_USER);
    expect(readMockSession({ [SESSION_COOKIE]: `${value}, ${SESSION_COOKIE}=${value}` })).toEqual(MOCK_USER);
  });
});

describe("the cookies", () => {
  it("carry the product's session cookie name and the attributes a dev cookie needs, and no Secure", () => {
    const cookie = sessionCookie(MOCK_USER);
    expect(cookie.startsWith(`${SESSION_COOKIE}=mock.`)).toBe(true);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    expect(signedOutCookie()).toContain(`${SESSION_COOKIE}=${SIGNED_OUT_VALUE};`);
  });
});

describe("signedInSession", () => {
  it("answers the contract's shape for the person, with the session keyed to them", () => {
    const them = { ...MOCK_USER, id: "9", email: "them@example.com" };
    expect(signedInSession(them)).toMatchObject({ user: them, session: { userId: "9" } });
  });
});

describe("the session extras", () => {
  it("carries no extras until something writes them", () => {
    expect(readSessionExtra({})).toEqual({});
    expect(readSessionExtra({ [SESSION_COOKIE]: mockSessionValue(MOCK_USER) })).toEqual({});
  });

  it("round-trips what another module wrote, through the jar and through msw's parsing", () => {
    const access = { access: { plan: "Pro plan", entitlements: ["notes", "export"], seats: 3 } };
    const raw = sessionExtraCookie(access).split(";")[0].split("=").slice(1).join("=");
    // the still-encoded value a jar hands over, and the decoded one msw hands a resolver
    expect(readSessionExtra({ [SESSION_EXTRA_COOKIE]: raw })).toEqual(access);
    expect(readSessionExtra(asCookies(sessionExtraCookie(access)))).toEqual(access);
  });

  // A value's own space or `=` would otherwise read as a foreign cookie, and the extras
  // are another module's data: neither may reach the wire unescaped.
  it("writes a value the mock-state reader accepts, whatever is in the strings", () => {
    const written = asCookies(sessionExtraCookie({ plan: "Pro plan", token: "a=b" }))[SESSION_EXTRA_COOKIE];
    expect(written).not.toMatch(/[\s=]/);
    expect(readSessionExtra({ [SESSION_EXTRA_COOKIE]: written })).toEqual({ plan: "Pro plan", token: "a=b" });
  });

  it("reads anything unparseable as no extras rather than throwing", () => {
    expect(readSessionExtra({ [SESSION_EXTRA_COOKIE]: "not-json" })).toEqual({});
    expect(readSessionExtra({ [SESSION_EXTRA_COOKIE]: "[1,2]" })).toEqual({});
    expect(readSessionExtra({ [SESSION_EXTRA_COOKIE]: "%E0%A4%A" })).toEqual({});
    expect(readSessionExtra(asCookies(clearedSessionExtraCookie()))).toEqual({});
  });

  it("reads one set of extras out of a doubled cookie, as the native transport delivers it", () => {
    const value = asCookies(sessionExtraCookie({ plan: "pro" }))[SESSION_EXTRA_COOKIE];
    expect(readSessionExtra({ [SESSION_EXTRA_COOKIE]: `${value}, ${SESSION_EXTRA_COOKIE}=${value}` })).toEqual({
      plan: "pro",
    });
  });

  it("is named under the product's mock prefix, and its cookie carries no Secure", () => {
    expect(SESSION_EXTRA_COOKIE).toBe(`${MOCK_COOKIE_PREFIX}.session-extra`);
    expect(sessionExtraCookie({ plan: "pro" })).not.toContain("Secure");
    expect(clearedSessionExtraCookie()).toContain("Max-Age=0");
  });
});
