import { HttpException, HttpStatus } from "@nestjs/common";
import type { ApiError, ApiErrorCode } from "@contracts/errors";
import { ZodValidationError } from "./zod.pipe";

/**
 * A failure this app names itself.
 *
 * An `HttpException`, so Nest's own machinery (guards, pipes, interceptors) carries it the
 * way it carries any other, and the filter recognises the envelope it already holds rather
 * than reconstructing one from a status.
 */
export class ApiException extends HttpException {
  constructor(status: number, code: ApiErrorCode, message: string, issues?: unknown[]) {
    super({ code, message, ...(issues ? { issues } : {}) } satisfies ApiError, status);
  }
}

/** The code a bare status maps to when the exception named none. */
const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
  [HttpStatus.BAD_REQUEST]: "VALIDATION",
  [HttpStatus.UNAUTHORIZED]: "UNAUTHORIZED",
  [HttpStatus.FORBIDDEN]: "FORBIDDEN",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.CONFLICT]: "CONFLICT",
};

/**
 * The code a bare status becomes.
 *
 * A status the union has no name for is `INTERNAL` — the status itself still says what
 * happened, and inventing a code here would give a client something to branch on that the
 * contract never promised.
 */
export function codeForStatus(status: number): ApiErrorCode {
  return CODE_BY_STATUS[status] ?? "INTERNAL";
}

const GENERIC_MESSAGE = "Something went wrong. Try again.";

function messageFrom(response: unknown, fallback: string): string {
  if (typeof response === "string") return response;
  const message = (response as { message?: unknown } | null)?.message;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && typeof message[0] === "string") return message[0];
  return fallback;
}

function isApiError(value: unknown): value is ApiError {
  const candidate = value as { code?: unknown; message?: unknown } | null;
  return typeof candidate?.code === "string" && typeof candidate?.message === "string";
}

/**
 * Whether nothing here described the failure.
 *
 * A failure this app raised on purpose is not an incident: an `ApiException` at any status,
 * a refused body, and any other `HttpException` below 500. An `HttpException` at 500 or
 * above that this app did not name, and anything that is not an exception type this file
 * knows, is a bug nobody wrote down — that is what the telemetry port hears about.
 */
export function isUnexpected(exception: unknown): boolean {
  if (exception instanceof ApiException) return false;
  if (exception instanceof HttpException) return exception.getStatus() >= HttpStatus.INTERNAL_SERVER_ERROR;
  return !(exception instanceof ZodValidationError);
}

/**
 * Every way this server can fail, as the one envelope the apps parse.
 *
 * An exception of no recognised kind is a bug: the status is 500, the message is generic
 * (an internal error's text is not a user's business), and the filter reports the real one.
 */
export function toApiError(exception: unknown): { status: number; body: ApiError } {
  if (exception instanceof ZodValidationError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: { code: "VALIDATION", message: exception.message, issues: exception.issues },
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    if (isApiError(response)) return { status, body: response };
    return { status, body: { code: codeForStatus(status), message: messageFrom(response, exception.message) } };
  }

  return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: { code: "INTERNAL", message: GENERIC_MESSAGE } };
}
