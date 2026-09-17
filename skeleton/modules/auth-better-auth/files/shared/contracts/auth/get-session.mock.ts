import { http } from "msw";
import { json } from "../mock-response";
import { SIGNED_IN_SESSION, readMockSession, readSessionExtra, signedInSession } from "../mock-session";
import { GetSessionResponse } from "./get-session";

/**
 * The session probe, answered from the request's cookies alone — there is no session
 * state here to write. `mock-session.ts` holds the cookie and the person behind it.
 */
export { MOCK_USER, SIGNED_IN_SESSION } from "../mock-session";

/** The default answer: the mock user, signed in — a mocked run boots that way. */
export const fixture = GetSessionResponse.parse(SIGNED_IN_SESSION);

export const handlers = [
  http.get("*/api/auth/get-session", ({ cookies }) => {
    const user = readMockSession(cookies);
    // Nobody is nobody: extras are read only for a session that exists, so a cookie of
    // them can never make a signed-out run look signed in.
    if (!user) return json(GetSessionResponse.parse(null));
    // The extras another module wrote (`sessionExtraCookie`), then the record itself — the
    // same rule the server's `customSession` merges by, so what a screen reads off the
    // probe is one shape in mock mode and against a real server. Merged after the parse,
    // because `GetSessionResponse` is the narrow slice of Better Auth's payload this
    // package reads and parsing would strip every field it does not name.
    return json({ ...readSessionExtra(cookies), ...GetSessionResponse.parse(signedInSession(user)) });
  }),
];
