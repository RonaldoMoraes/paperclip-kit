import { http } from "msw";
import { json } from "../mock-response";
import { SendVerificationOtpResponse } from "./send-verification-otp";

/** Any email is accepted — the code that works is `12345`, checked on the sign-in call. */
export const fixture = SendVerificationOtpResponse.parse({ success: true });

/** The one magic email: it reproduces Better Auth's rate limiter, which answers 429 with no code. */
export const THROTTLED_EMAIL = "throttled@example.com";

// The one envelope with no schema behind it: the rate limiter answers before the
// endpoint runs, so it carries a message and a retry hint but no `code` — which is why
// `otpFailure` classifies this one by status.
export const throttled = { message: "Too many requests. Please try again later." };
const RETRY_AFTER_SECONDS = "10";

export const handlers = [
  http.post("*/api/auth/email-otp/send-verification-otp", async ({ request }) => {
    const body = (await request.json()) as { email?: string };
    if (body?.email === THROTTLED_EMAIL) {
      return json(throttled, { status: 429, headers: { "x-retry-after": RETRY_AFTER_SECONDS } });
    }
    return json(fixture);
  }),
];
