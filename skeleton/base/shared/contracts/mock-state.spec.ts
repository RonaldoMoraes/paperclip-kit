import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  MOCK_COOKIE_PREFIX,
  MOCK_STATE_MAX_AGE,
  clearedMockStateCookie,
  mockCookieName,
  mockStateCookie,
  readMockState,
} from "./mock-state";

const KEY = mockCookieName("thing");
const Thing = z.enum(["one", "two"]);

/** What msw hands a resolver for a `Set-Cookie` it has stored: the name and the raw value. */
const asCookies = (setCookie: string) => {
  const [name, ...value] = setCookie.split(";")[0].split("=");
  return { [name]: value.join("=") };
};

describe("mockCookieName", () => {
  it("puts every ledger under the product's prefix", () => {
    expect(KEY).toBe(`${MOCK_COOKIE_PREFIX}.thing`);
  });
});

describe("mockStateCookie", () => {
  it("carries the attributes a dev cookie needs, and no Secure", () => {
    const cookie = mockStateCookie(KEY, "one");
    expect(cookie.startsWith(`${KEY}=one;`)).toBe(true);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${MOCK_STATE_MAX_AGE}`);
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
  });
});

describe("readMockState", () => {
  it("round-trips the value that was written", () => {
    expect(readMockState(asCookies(mockStateCookie(KEY, "two")), KEY, Thing)).toBe("two");
  });

  // Written encoded, so a value carrying a comma or a semicolon is still one cookie and
  // still reads back whole.
  it("round-trips a value that has to be encoded", () => {
    const Free = z.string();
    const value = "a, b; c=d";
    expect(readMockState(asCookies(mockStateCookie(KEY, value)), KEY, Free)).toBe(value);
  });

  it("finds the state among other cookies", () => {
    const cookies = { other: "1", ...asCookies(mockStateCookie(KEY, "one")), another: "2" };
    expect(readMockState(cookies, KEY, Thing)).toBe("one");
  });

  it("is null with no cookies at all, and for another key", () => {
    expect(readMockState({}, KEY, Thing)).toBeNull();
    expect(readMockState(asCookies(mockStateCookie(mockCookieName("other"), "one")), KEY, Thing)).toBeNull();
  });

  it("is null for the cleared cookie", () => {
    expect(readMockState(asCookies(clearedMockStateCookie(KEY)), KEY, Thing)).toBeNull();
  });

  // Percent-encoding is what makes a value ours: neither can survive `encodeURIComponent`,
  // so a value carrying one was written by somebody else or run together by a jar. Read on
  // the raw value, because decoding would turn `%3D` into an `=` we would then accept.
  it("is null for a raw value carrying `=` or whitespace", () => {
    const Free = z.string();
    expect(readMockState({ [KEY]: "one=two" }, KEY, Free)).toBeNull();
    expect(readMockState({ [KEY]: "one two" }, KEY, Free)).toBeNull();
    expect(readMockState({ [KEY]: " " }, KEY, Free)).toBeNull();
  });

  it("is null for a value the schema refuses", () => {
    expect(readMockState({ [KEY]: "three" }, KEY, Thing)).toBeNull();
  });

  it("is null for a malformed value rather than throwing", () => {
    expect(readMockState({ [KEY]: "%E0%A4%A" }, KEY, Thing)).toBeNull();
  });

  it("reads one state out of a doubled cookie", () => {
    // What arrives on native: the request's own `Cookie` header and msw's jar, joined by
    // msw with ", " and parsed as a single cookie whose value runs past the first comma.
    expect(readMockState({ [KEY]: `one, ${KEY}=one` }, KEY, Thing)).toBe("one");
  });

  // msw decodes cookie values before a resolver sees them, so a JSON state arrives with
  // its commas back — the doubled-cookie split must not cut it (JSON.stringify emits no
  // space after a comma; the native join is ", ").
  it("reads a decoded JSON state whole, commas and all, and the same state encoded", () => {
    const State = z
      .string()
      .transform((raw): unknown => JSON.parse(raw))
      .pipe(z.object({ since: z.iso.date(), count: z.int() }));
    const parsed = { since: "2026-08-09", count: 1 };
    const value = JSON.stringify(parsed);
    expect(readMockState({ [KEY]: value }, KEY, State)).toEqual(parsed);
    expect(readMockState(asCookies(mockStateCookie(KEY, value)), KEY, State)).toEqual(parsed);
  });
});

describe("clearedMockStateCookie", () => {
  it("expires the same cookie", () => {
    const cookie = clearedMockStateCookie(KEY);
    expect(cookie).toContain(`${KEY}=;`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  });
});
