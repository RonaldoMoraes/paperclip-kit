/**
 * What a failed `/api` call was, and the line a person reads for it. Pure data in, a
 * closed reason out: no zod, no React, no transport — the same classification on every
 * platform.
 *
 * `HttpError` (`http.ts`) carries a status and, when the server sent the envelope, its own
 * code. Neither is something to show, and a screen that branches on a number ends up with
 * a different sentence per feature for the same refusal. So a hook classifies once, here,
 * and takes the copy from beside the classification — the two cannot drift, and analytics
 * reports the reason as a closed enum.
 */
import { HttpError } from "./http";

/**
 * The classes of failure a data call has. Closed because analytics reports it and a
 * PHI-safe event vocabulary admits enums only.
 *
 * `offline` and `throttle` are the two a person answers by waiting; `unauthorized` sends
 * them to sign in; the rest they answer by trying again or by leaving the screen.
 */
export const FAILURE_REASONS = [
  "offline",
  "unauthorized",
  "refused",
  "not-found",
  "conflict",
  "throttle",
  "server",
  "unknown",
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

/**
 * The statuses that mean something specific to a person. Everything else below 500 is a
 * request this client should not have made — a bug rather than a condition — and reads as
 * `unknown`; 500 and up are the server's.
 */
const BY_STATUS: Record<number, FailureReason> = {
  401: "unauthorized",
  403: "refused",
  404: "not-found",
  409: "conflict",
  429: "throttle",
};

/**
 * What a caught failure was. Anything this package did not throw is `unknown`, except the
 * one shape it cannot throw: a `fetch` that never reached the server rejects with a
 * `TypeError` (`Network request failed` on the phone, `Failed to fetch` in a browser), and
 * that is the whole of what "offline" looks like from here — the query client's online
 * manager decides whether to retry, this decides what is said meanwhile.
 */
export function failureReason(error: unknown): FailureReason {
  if (error instanceof HttpError) return BY_STATUS[error.status] ?? (error.status >= 500 ? "server" : "unknown");
  if (error instanceof TypeError) return "offline";
  return "unknown";
}

/**
 * One sentence per reason, generic on purpose: a feature with something better to say
 * carries its own line in `@domain/<feature>/copy` and reaches for this only for the
 * failures it has nothing specific to add to.
 *
 * PLACEHOLDER WORDING — written to be replaced. The product owns these sentences; each is
 * here so no screen invents one of its own in the meantime.
 */
export const FAILURE_COPY: Record<FailureReason, string> = {
  offline: "You're offline. Check your connection and try again.",
  unauthorized: "Your session has ended. Sign in and pick up where you left off.",
  refused: "That isn't available on your plan.",
  "not-found": "That isn't here anymore.",
  conflict: "That's already been done.",
  throttle: "Too many tries. Wait a moment, then try again.",
  server: "Something went wrong on our end. Try again in a moment.",
  unknown: "Something went wrong. Try again.",
};

/** The line to show for a caught failure — the one way a screen gets a failure's copy. */
export function failureCopy(error: unknown): string {
  return FAILURE_COPY[failureReason(error)];
}
