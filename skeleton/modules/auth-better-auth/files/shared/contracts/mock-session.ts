import { z } from "zod";
import { SESSION_COOKIE_NAME } from "./auth/cookies";
import { SessionRecord, type SessionUser } from "./auth/session";
import { type MockCookies, clearedMockStateCookie, mockCookieName, mockStateCookie, readMockState } from "./mock-state";

/**
 * Mock mode's session, as a cookie.
 *
 * The session is the one piece of mock state that is not a plain `mock-state.ts` cookie:
 * it carries Better Auth's own cookie name and attributes. A mocked sign-in answers with a
 * real `Set-Cookie`, and every authenticated mock resolves the user from the request's
 * cookies through `readMockSession` — nothing else decides who is signed in.
 *
 * A mocked run boots signed in: with no cookie at all, `readMockSession` answers
 * `MOCK_USER`, so `yarn dev:mock`, `yarn mobile:mock` and every e2e spec open on the
 * signed-in app without a seed. Signing out writes the signed-out marker rather than
 * clearing the cookie — that is what keeps a sign-out honest across a reload — and a
 * spec that must start signed out seeds that marker (`tests/helpers/session.ts`).
 *
 * Data and pure functions only: no msw here. The msw response builders live in
 * `mock-response.ts`. The cookie name is the product's (`auth/cookies.ts`); the Expo
 * plugin would drop a `Set-Cookie` under any other name.
 */
export const SESSION_COOKIE = SESSION_COOKIE_NAME;
export const SESSION_MAX_AGE = 86_400;

/** The one person mock mode knows. The email is whichever one they signed in with. */
export const MOCK_USER: SessionUser = {
  id: "1",
  email: "user@example.com",
  name: "Mock User",
  emailVerified: true,
};

/**
 * The cookie value is `mock.<encoded email>` — enough to rebuild the user after a reload;
 * the rest is `MOCK_USER`. The prefix is also how a foreign cookie of the same name is
 * told apart from one of ours.
 */
const VALUE_PREFIX = "mock.";

/** The value sign-out leaves behind: a cookie that says "nobody", read as such until a sign-in replaces it. */
export const SIGNED_OUT_VALUE = "signed-out";

/** The cookie's value alone, for a jar that is handed name and value rather than a header. */
export function mockSessionValue(user: SessionUser): string {
  return `${VALUE_PREFIX}${encodeURIComponent(user.email)}`;
}

/** No `Secure`: dev is `http:`, and a `Secure` cookie would never be stored or sent back. */
export function sessionCookie(user: SessionUser): string {
  return `${SESSION_COOKIE}=${mockSessionValue(user)}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; SameSite=Lax`;
}

/**
 * The same cookie, carrying the signed-out marker. Not an expired cookie: a mocked run
 * boots signed in when it holds nothing, so "nothing" cannot also mean "signed out".
 */
export function signedOutCookie(): string {
  return `${SESSION_COOKIE}=${SIGNED_OUT_VALUE}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; SameSite=Lax`;
}

/**
 * The last line of defence: an email that reached us mangled reads as signed out, not as
 * a person. Loose on purpose beyond that — mock mode signs in whatever address was typed,
 * so this rejects a shape that cannot be an address, not an address it dislikes.
 */
const EMAIL = /^[^\s@,;]+@[^\s@,;]+$/;

/** A session cookie's value: the marker (nobody), or the person it names. */
const MockSessionValue = z.union([
  z.literal(SIGNED_OUT_VALUE).transform((): { email: string | null } => ({ email: null })),
  z
    .string()
    .startsWith(VALUE_PREFIX)
    .transform((value) => value.slice(VALUE_PREFIX.length))
    .refine((email) => EMAIL.test(email))
    .transform((email): { email: string | null } => ({ email })),
]);

/**
 * Who is signed in — the only way any mock is allowed to answer that question.
 *
 * No cookie is the mock user (a mocked run boots signed in); the signed-out marker is
 * nobody; `mock.<email>` is that person. The cookie rule is `readMockState`'s, as for
 * every other piece of mock state: the first cookie in the value and nothing after it,
 * decoded, so a doubled header yields the same session as a single one. A foreign value
 * or one that is not an email is nobody rather than a throw.
 */
export function readMockSession(cookies: MockCookies): SessionUser | null {
  const raw = cookies[SESSION_COOKIE];
  if (raw === undefined || raw === "") return MOCK_USER;
  const read = readMockState(cookies, SESSION_COOKIE, MockSessionValue);
  return read?.email ? { ...MOCK_USER, email: read.email } : null;
}

/**
 * Mock mode's session extras, as a cookie — the seam another module extends the mocked
 * session through.
 *
 * The server has `customSession` and the `auth-extensions` port
 * (`apps/server/src/auth/auth.extensions.ts`): a module that computes an entitlement puts
 * it on the session payload there. Mock mode needs the same field on the same probe, and
 * a second handler for `/api/auth/get-session` cannot supply it — two handlers for one path
 * race, and the first to match wins. So the extras ride in a cookie the one handler reads,
 * the way every other piece of mock state does: a mock (or a Playwright seed, or a QA
 * panel) writes `sessionExtraCookie({ … })`, and `get-session` merges what it reads.
 *
 * Merge rule, on both sides of the seam: extras first, `user` and `session` last. An extra
 * adds fields to the answer and can never rewrite who is signed in — and it is only ever
 * read for a session that exists, so an extra cannot conjure one out of the signed-out
 * marker.
 */
export const SESSION_EXTRA_COOKIE = mockCookieName("session-extra");

/** Anything JSON: this module does not know what the module that writes it puts here. */
const SessionExtra = z.record(z.string(), z.unknown());
export type SessionExtra = z.infer<typeof SessionExtra>;

/** The cookie carries the extras as JSON; anything unreadable is no extras, never a throw. */
const SessionExtraValue = z
  .string()
  .transform((raw, ctx): unknown => {
    try {
      return JSON.parse(raw);
    } catch {
      ctx.addIssue({ code: "custom", message: "not JSON" });
      return z.NEVER;
    }
  })
  .pipe(SessionExtra);

/**
 * `readMockState` refuses a value carrying whitespace or `=` — that is how it tells a
 * value of ours from a foreign cookie. `JSON.stringify` puts neither between tokens, but
 * these extras are another module's data and one of its strings may well hold a space
 * ("Pro plan") or an `=`. Both are escaped to the `\uXXXX` JSON already understands, so
 * `JSON.parse` gives the string back character for character and the written value stays
 * one this reader will accept.
 */
const escapeForCookie = (json: string): string =>
  json.replace(/[\s=]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);

export function sessionExtraValue(extra: SessionExtra): string {
  return escapeForCookie(JSON.stringify(SessionExtra.parse(extra)));
}

export function sessionExtraCookie(extra: Record<string, unknown>): string {
  return mockStateCookie(SESSION_EXTRA_COOKIE, sessionExtraValue(extra));
}

/** Back to no extras, for a spec that has to prove the session without them. */
export function clearedSessionExtraCookie(): string {
  return clearedMockStateCookie(SESSION_EXTRA_COOKIE);
}

/** The extras the request carries, or none — the shape `get-session` merges into its answer. */
export function readSessionExtra(cookies: MockCookies): SessionExtra {
  return readMockState(cookies, SESSION_EXTRA_COOKIE, SessionExtraValue) ?? {};
}

/** `get-session`'s signed-in body for this person; parsed so a drifted schema fails at import. */
export function signedInSession(user: SessionUser): SessionRecord {
  return SessionRecord.parse({
    user,
    session: { id: "1", userId: user.id, expiresAt: "2099-01-01T00:00:00.000Z" },
  });
}

/** The signed-in payload the mocks answer by default — the mock user, the far-off expiry. */
export const SIGNED_IN_SESSION = signedInSession(MOCK_USER);
