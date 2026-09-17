import { http } from "msw";
import { json } from "../mock-response";
import { MOCK_USER, sessionCookie } from "../mock-session";
import { SOCIAL_PROVIDERS } from "./errors";
import { AuthErrorResponse } from "./sign-in-email-otp";
import { SignInSocialResponse } from "./sign-in-social";

/** The providers the server registers. A body naming anything else is Better Auth's own 400. */
const PROVIDERS = new Set<string>(SOCIAL_PROVIDERS);

/**
 * Mock mode has no provider to visit, so the round-trip is collapsed into its arrival: the
 * session cookie is set here and the answer sends the client straight to the `callbackURL`
 * it asked for. On web the whole page still leaves and comes back, which is what makes the
 * landing — the gate, the session query — run exactly as it does in real mode.
 *
 * The failure leg needs no mock: a provider that refuses returns the person to
 * `errorCallbackURL?error=…`, so `/account?error=1` in the address bar is that screen.
 */
export const fixture = SignInSocialResponse.parse({ url: "/", redirect: true });

export const invalidProvider = AuthErrorResponse.parse({ code: "INVALID_PROVIDER", message: "Invalid provider" });

export const handlers = [
  http.post("*/api/auth/sign-in/social", async ({ request }) => {
    const body = (await request.json()) as { provider?: string; callbackURL?: string };
    if (!body?.provider || !PROVIDERS.has(body.provider)) return json(invalidProvider, { status: 400 });

    // Signed in as the one person mock mode knows: a provider hands back an identity
    // rather than taking one, so there is no address here to sign in with.
    return json(SignInSocialResponse.parse({ ...fixture, url: body.callbackURL ?? fixture.url }), {
      headers: { "set-cookie": sessionCookie(MOCK_USER) },
    });
  }),
];
