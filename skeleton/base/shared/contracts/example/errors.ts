import { FAILURE_COPY, type FailureReason, failureReason } from "../http-errors";

/**
 * The example feature's refusals, classified once for every platform.
 *
 * A screen catches an `HttpError` and needs two things — the line to show and the closed
 * reason analytics reports — and both are decided here so they cannot drift. A feature
 * with a condition of its own adds a reason and a line; the generic failures fall through
 * to `http-errors.ts`.
 */
export const EXAMPLE_FAILURE_REASONS = ["not-found", "offline", "server", "unknown"] as const;
export type ExampleFailureReason = (typeof EXAMPLE_FAILURE_REASONS)[number];

/** Thrown by an app's example flow once a failure has been mapped. */
export class ExampleFlowError extends Error {
  readonly reason: ExampleFailureReason;

  constructor(message: string, reason: ExampleFailureReason = "unknown") {
    super(message);
    this.name = "ExampleFlowError";
    this.reason = reason;
  }
}

/** PLACEHOLDER WORDING for the feature's own condition; the rest is the generic line. */
export const EXAMPLE_FAILURE_COPY: Record<ExampleFailureReason, string> = {
  "not-found": "That item is gone.",
  offline: FAILURE_COPY.offline,
  server: FAILURE_COPY.server,
  unknown: FAILURE_COPY.unknown,
};

function narrow(reason: FailureReason): ExampleFailureReason {
  switch (reason) {
    case "not-found":
    case "offline":
    case "server":
      return reason;
    default:
      return "unknown";
  }
}

/** The reason a caught failure carries. Anything not this feature's own is classified generically. */
export function exampleFailureReason(error: unknown): ExampleFailureReason {
  return error instanceof ExampleFlowError ? error.reason : narrow(failureReason(error));
}

/** The error to throw for a caught failure — copy and reason decided together. */
export function exampleFailure(error: unknown): ExampleFlowError {
  if (error instanceof ExampleFlowError) return error;
  const reason = exampleFailureReason(error);
  return new ExampleFlowError(EXAMPLE_FAILURE_COPY[reason], reason);
}
