/**
 * Auth error mapping — shared by every app that talks to this product's Better Auth
 * instance. Pure data in, the error to throw out: no React, no transport, no platform.
 *
 * A refusal carries two things a caller needs — the line a person reads and the closed
 * `reason` analytics reports — and both are decided in one place so they cannot drift.
 *
 * Classification is by `error.code` and HTTP status only. Better Auth's messages are its
 * own to change; its codes are the contract, so matching on message text would turn a
 * copy edit upstream into a wrong error here.
 */
import type { emailOTP } from "better-auth/plugins";
import { FAILURE_COPY } from "../http-errors";

/** The providers a person can come through; email is the other door. */
export const SOCIAL_PROVIDERS = ["apple", "google"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export type BetterAuthError = { code?: string; message?: string; status?: number };

/**
 * The class of a refused sign-in — what was refused, never the message. Closed because
 * analytics reports it, and a PHI-safe event vocabulary admits enums only.
 */
export const AUTH_FAILURE_REASONS = ["throttle", "invalid-code", "expired-code", "provider", "other"] as const;
export type AuthFailureReason = (typeof AUTH_FAILURE_REASONS)[number];

/**
 * What kind of refusal this was, for a caller that must act on it rather than only show
 * it. `throttle` is the one a person answers by waiting; everything else by trying again.
 */
export type AuthErrorKind = "throttle" | "other";

/** Thrown by an app's auth flow once a Better Auth error has been mapped. */
export class AuthFlowError extends Error {
  readonly reason: AuthFailureReason;
  /** Derived from the reason rather than classified a second time. */
  readonly kind: AuthErrorKind;

  constructor(message: string, reason: AuthFailureReason = "other") {
    super(message);
    this.name = "AuthFlowError";
    this.reason = reason;
    this.kind = reason === "throttle" ? "throttle" : "other";
  }
}

/** What a refusal says when nothing more specific is known — the generic line every app shows. */
export const GENERIC_FAILURE = FAILURE_COPY.unknown;

/**
 * The way out that keeps the account, refused. Sign-out is not classified — Better Auth
 * answers it with no code of its own — so there is nothing to map, only the one line both
 * apps say when the server will not let them go. PLACEHOLDER WORDING.
 */
export const SIGN_OUT_FAILED = "Couldn't sign out. Try again.";

/** The reason a caught failure carries. Anything that is not this package's own is `other`. */
export function authFailureReason(error: unknown): AuthFailureReason {
  return error instanceof AuthFlowError ? error.reason : "other";
}

/**
 * The copy a caught failure carries. A failure that never passed through the mapping has
 * a message of its own, and it is not one a person should read: `fetch` says "Failed to
 * fetch", the runtime says "undefined is not a function". The generic line stands in.
 */
export function authFailureMessage(error: unknown): string {
  return error instanceof AuthFlowError ? error.message : GENERIC_FAILURE;
}

/** The kind a caught failure carries; anything that is not this package's own is `other`. */
export function authFailureKind(error: unknown): AuthErrorKind {
  return error instanceof AuthFlowError ? error.kind : "other";
}

/** The email-OTP plugin's own `$ERROR_CODES` keys — an invented code fails to compile. */
type EmailOtpErrorCode = keyof ReturnType<typeof emailOTP>["$ERROR_CODES"];

/** PLACEHOLDER WORDING for the three outcomes a person can act on. */
const OTP_ERRORS: Record<EmailOtpErrorCode, { message: string; reason: AuthFailureReason }> = {
  TOO_MANY_ATTEMPTS: { message: FAILURE_COPY.throttle, reason: "throttle" },
  OTP_EXPIRED: { message: "That code has expired. Send yourself a fresh one.", reason: "expired-code" },
  INVALID_OTP: { message: "That code doesn't match. Check it and try again.", reason: "invalid-code" },
};

const isOtpErrorCode = (code: string): code is EmailOtpErrorCode => code in OTP_ERRORS;

/** The refusal to throw when an OTP call — the send or the verify — answers with an error. */
export function otpFailure(error: BetterAuthError): AuthFlowError {
  // The rate limiter answers before any endpoint runs, so it carries a status and no code.
  if (error.status === 429) {
    return new AuthFlowError(OTP_ERRORS.TOO_MANY_ATTEMPTS.message, OTP_ERRORS.TOO_MANY_ATTEMPTS.reason);
  }
  const code = error.code ?? "";
  if (isOtpErrorCode(code)) return new AuthFlowError(OTP_ERRORS[code].message, OTP_ERRORS[code].reason);
  return new AuthFlowError(error.message?.trim() || GENERIC_FAILURE, "other");
}

/** PLACEHOLDER WORDING: the provider's own line, so the person knows which door failed. */
const PROVIDER_FAILED: Record<SocialProvider, string> = {
  google: "Google sign-in failed. Please try again.",
  apple: "Apple sign-in failed. Please try again.",
};

/**
 * The refusal to throw when a provider round-trip fails — an error on the call, a throw,
 * or a trip that comes back with no session. `null` is that last one: nothing to
 * classify, and the provider is what failed.
 */
export function socialFailure(provider: SocialProvider, error: BetterAuthError | null): AuthFlowError {
  // Better Auth caps /sign-in/* per IP; a retry storm reads as "login failed" unless the
  // throttle is named. The limiter answers with a bare 429, the endpoint with the code.
  if (error?.status === 429 || error?.code === "TOO_MANY_ATTEMPTS") {
    return new AuthFlowError(FAILURE_COPY.throttle, "throttle");
  }
  return new AuthFlowError(PROVIDER_FAILED[provider], "provider");
}
