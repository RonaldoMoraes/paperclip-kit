import { OTP_EXPIRY_MINUTES } from "@contracts/auth/credentials";

/** The two endpoints that hand out or spend a one-time code, and what protects them. */
export const OTP_ENDPOINTS = ["/email-otp/send-verification-otp", "/sign-in/email-otp"] as const;

/** The code's own lifetime — the contract's number, so the screens print what the server enforces. */
export const OTP_EXPIRY_SECONDS = OTP_EXPIRY_MINUTES * 60;
export const OTP_REQUESTS_PER_WINDOW = 5;
/** Wrong codes a person may type before the one they hold is void and a new one has to be sent. */
export const OTP_ALLOWED_ATTEMPTS = 5;

/**
 * Five requests per code lifetime, per IP, on each of the two endpoints.
 *
 * `enabled` is explicit because Better Auth turns its limiter on in production only, and
 * a rule that does not run in development is a rule nobody ever sees fail. That switch is
 * global: Better Auth's own default budget (100 requests per 10s per IP) and its built-in
 * rules are live in every environment too, not only on the two paths below.
 *
 * `/get-session` is exempt because it is a poll, not an attempt: the web app resolves it
 * on every guarded navigation and the Expo app on every foreground, so counting it would
 * spend the global budget on the one call that proves nothing about abuse.
 *
 * Storage is Better Auth's default in-memory counter, so one process counts only its own
 * traffic; a deployment with several instances moves it to `rateLimit.storage: "database"`.
 */
export function otpRateLimit() {
  return {
    enabled: true,
    customRules: {
      ...Object.fromEntries(
        OTP_ENDPOINTS.map((path) => [path, { window: OTP_EXPIRY_SECONDS, max: OTP_REQUESTS_PER_WINDOW }])
      ),
      "/get-session": false as const,
    },
  };
}

/** What most ingresses set; a load balancer that names another one sets `CLIENT_IP_HEADER`. */
const DEFAULT_CLIENT_IP_HEADER = "x-forwarded-for";

/**
 * Which header the limiter reads the client's address from.
 *
 * Better Auth takes the first entry of the chain and buckets per IP, so this one name
 * decides whether a bucket is a person or the whole internet. Env-driven because the
 * trustworthy header is a property of the ingress in front of the process, not of this
 * code. One header, never a list: Better Auth walks a list until a header parses, so a
 * second entry is a second way for a caller to choose its own bucket. A wrong name does
 * not widen a bucket, it removes the limiter — with no parsable address every rule is
 * skipped silently — so the value is worth a look on every ingress change.
 */
export function clientIpHeaders(env: { CLIENT_IP_HEADER?: string }): string[] {
  return [env.CLIENT_IP_HEADER?.trim() || DEFAULT_CLIENT_IP_HEADER];
}
