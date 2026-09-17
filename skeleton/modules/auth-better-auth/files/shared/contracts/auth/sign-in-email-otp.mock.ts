import { http } from "msw";
import { json } from "../mock-response";
import { MOCK_USER, sessionCookie } from "../mock-session";
import { AuthErrorResponse, SignInEmailOtpResponse } from "./sign-in-email-otp";

/** The development code, here as on a locally running server (`DEV_OTP` in `better-auth.ts`). */
export const MOCK_OTP = "12345";

/**
 * The code decides the outcome, so `send-verification-otp` stays unconditional for any
 * email and a failure is reproducible by typing one:
 *
 * | Code | Response |
 * | --- | --- |
 * | `12345` | 200 + the session cookie |
 * | `00000` | 400 `OTP_EXPIRED` |
 * | `11111` | 403 `TOO_MANY_ATTEMPTS` |
 * | anything else | 400 `INVALID_OTP` |
 *
 * The rate-limit path is the other magic value, on the email:
 * `throttled@example.com` in `send-verification-otp.mock.ts`.
 */
export const EXPIRED_OTP = "00000";
export const TOO_MANY_ATTEMPTS_OTP = "11111";

export const fixture = SignInEmailOtpResponse.parse({
  token: "mock-session-token",
  user: MOCK_USER,
});

/**
 * Better Auth's own rejection envelopes, with the statuses its email-OTP plugin actually
 * throws: `INVALID_OTP` and `OTP_EXPIRED` are `BAD_REQUEST`, `TOO_MANY_ATTEMPTS` is
 * `FORBIDDEN`. Returning the real shape is the point: it is what exercises `otpFailure`,
 * so a wrong code reads the same in mock mode as against the server.
 */
export const invalidOtp = AuthErrorResponse.parse({ code: "INVALID_OTP", message: "Invalid OTP" });
export const expiredOtp = AuthErrorResponse.parse({ code: "OTP_EXPIRED", message: "OTP expired" });
export const tooManyAttempts = AuthErrorResponse.parse({ code: "TOO_MANY_ATTEMPTS", message: "Too many attempts" });

export const handlers = [
  http.post("*/api/auth/sign-in/email-otp", async ({ request }) => {
    const body = (await request.json()) as { email?: string; otp?: string };
    if (body?.otp === EXPIRED_OTP) return json(expiredOtp, { status: 400 });
    if (body?.otp === TOO_MANY_ATTEMPTS_OTP) return json(tooManyAttempts, { status: 403 });
    if (body?.otp !== MOCK_OTP) return json(invalidOtp, { status: 400 });

    const user = { ...fixture.user, email: body.email ?? fixture.user.email };
    // The session leaves as a real `Set-Cookie`: msw's jar keeps it on web, the Expo
    // plugin's SecureStore on mobile, and every later request carries it back.
    return json(SignInEmailOtpResponse.parse({ ...fixture, user }), {
      headers: { "set-cookie": sessionCookie(user) },
    });
  }),
];
