import { FAILURE_COPY, type FailureReason, failureReason } from "../http-errors";

/**
 * The account feature's refusals, classified once for every platform — the same shape as
 * `example/errors.ts`. One condition of its own: a session too old to delete an account
 * on, which a person answers by signing in again rather than by trying again.
 */
export const ACCOUNT_FAILURE_REASONS = ["stale-session", "unauthorized", "offline", "server", "unknown"] as const;
export type AccountFailureReason = (typeof ACCOUNT_FAILURE_REASONS)[number];

/** Thrown by an app's account flow once a failure has been mapped. */
export class AccountFlowError extends Error {
  readonly reason: AccountFailureReason;

  constructor(message: string, reason: AccountFailureReason = "unknown") {
    super(message);
    this.name = "AccountFlowError";
    this.reason = reason;
  }
}

/** PLACEHOLDER WORDING for the feature's own condition; the rest is the generic line. */
export const ACCOUNT_FAILURE_COPY: Record<AccountFailureReason, string> = {
  "stale-session": "Sign in again, then delete your account.",
  unauthorized: FAILURE_COPY.unauthorized,
  offline: FAILURE_COPY.offline,
  server: FAILURE_COPY.server,
  unknown: FAILURE_COPY.unknown,
};

function narrow(reason: FailureReason): AccountFailureReason {
  switch (reason) {
    // The server answers a stale session as FORBIDDEN (`account.service.ts`): nothing else
    // on this feature's two routes is refused with a 403.
    case "refused":
      return "stale-session";
    case "unauthorized":
    case "offline":
    case "server":
      return reason;
    default:
      return "unknown";
  }
}

/** The reason a caught failure carries. Anything not this feature's own is classified generically. */
export function accountFailureReason(error: unknown): AccountFailureReason {
  return error instanceof AccountFlowError ? error.reason : narrow(failureReason(error));
}

/** The error to throw for a caught failure — copy and reason decided together. */
export function accountFailure(error: unknown): AccountFlowError {
  if (error instanceof AccountFlowError) return error;
  const reason = accountFailureReason(error);
  return new AccountFlowError(ACCOUNT_FAILURE_COPY[reason], reason);
}
