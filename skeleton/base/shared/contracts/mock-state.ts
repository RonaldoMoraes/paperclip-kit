import type { ZodType } from "zod";

/**
 * Mock mode's state, as cookies.
 *
 * There is no state in this directory. A mock that has something to remember answers with
 * a `Set-Cookie`, and every mock that needs to know reads it back off the request's
 * cookies — the jar on web, the `Cookie` header the Expo client sends on native. That is
 * what makes a mocked journey survive a reload and an app restart, and it is why a mocked
 * run exercises the same client code paths as a real one.
 *
 * Data and pure functions only: no msw here, so this module costs nothing but zod to
 * import. The msw response builders live in `mock-response.ts`.
 */

/**
 * The cookies msw hands a resolver: `http.get(path, ({ cookies }) => …)`.
 *
 * Not the raw `cookie` header — `Cookie` is a forbidden header name, so appending it to a
 * `Request` in a browser silently does nothing and a resolver there would always read
 * `null`. msw parses the request header, the document and its own jar into this record
 * before the resolver runs, which is the one source that carries mock state on every
 * platform.
 *
 * A value can arrive doubled. On native both carriers are live — the app sends its own
 * `Cookie` header and msw's jar has stored the same `Set-Cookie` — and React Native's
 * `Headers` has no forbidden-header guard, so msw's jar appends onto the app's header and
 * the two join with `", "`. msw then parses that as one cookie whose value runs on past
 * the first comma. Both carriers are correct and neither is disabled; the readers below
 * are what make the duplication harmless.
 */
export type MockCookies = Record<string, string | undefined>;

/**
 * Every mock-state cookie is named under the product's cookie prefix, so two products on
 * one dev origin never read each other's ledgers and a real cookie can never collide with
 * a mocked one.
 */
export const MOCK_COOKIE_PREFIX = "__COOKIE_PREFIX__.mock";

export function mockCookieName(name: string): string {
  return `${MOCK_COOKIE_PREFIX}.${name}`;
}

export const MOCK_STATE_MAX_AGE = 86_400;

/** No `Secure`: dev is `http:`, and a `Secure` cookie would never be stored or sent back. */
export function mockStateCookie(key: string, value: string): string {
  return `${key}=${encodeURIComponent(value)}; Path=/; Max-Age=${MOCK_STATE_MAX_AGE}; SameSite=Lax`;
}

/**
 * The same cookie, emptied and expired. Both `Max-Age=0` and a past `Expires` are set:
 * msw's jar drops the cookie on either, and a native cookie store may read only `Expires`
 * because it parses `Max-Age` as a number and `0` is not truthy.
 */
export function clearedMockStateCookie(key: string): string {
  return `${key}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

/**
 * The state the request carries under `key`, or null.
 *
 * The value arrives two ways: still encoded, from a jar read directly (`document.cookie`
 * in a QA panel and the Playwright seeds), or already decoded, from msw's own cookie
 * parsing in a resolver. Both read the same here: `decode` is a no-op on a value msw
 * already decoded, because no state value of ours carries a literal `%`.
 *
 * Reads the first cookie in the value and nothing after it, so a doubled header yields
 * the same state as a single one — the native join is `", "`, and no state value carries
 * that sequence (a single token cannot, and `JSON.stringify` emits no space after a
 * comma). `=` or whitespace still says a value is not ours: neither survives
 * `encodeURIComponent`, and no JSON state of this package contains either. Anything the
 * schema then refuses — a cleared cookie, a foreign value, one that does not decode — is
 * absent, never a throw: a mock cannot fail a request over state it could not read.
 */
export function readMockState<T>(cookies: MockCookies, key: string, schema: ZodType<T>): T | null {
  const raw = cookies[key];
  if (!raw) return null;

  const first = raw.split(", ")[0].trim();
  if (first === "" || /[=\s]/.test(first)) return null;

  const decoded = decode(first);
  if (decoded === null) return null;

  const parsed = schema.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
