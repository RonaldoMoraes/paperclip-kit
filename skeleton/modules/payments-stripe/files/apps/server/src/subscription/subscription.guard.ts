import { type CanActivate, type ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { ApiError } from "@contracts/errors";
import { readSubscriptionAccess } from "@contracts/subscription/access";
import {
  SUBSCRIPTION_REQUIRED,
  SUBSCRIPTION_REQUIRED_MESSAGE,
  type SubscriptionErrorCode,
} from "@contracts/subscription/errors";
import type { SessionRequest } from "../auth/session.guard";

/**
 * A refusal this module names.
 *
 * `ApiException` takes base's closed `ApiErrorCode`, and a module widens the vocabulary in
 * its own contract rather than editing base's union — so this is the same shape by the same
 * route: `api-error.ts` reads the envelope off any `HttpException` whose response carries a
 * `code` and a `message`, and an `HttpException` below 500 is never reported as an incident.
 */
export class SubscriptionException extends HttpException {
  constructor(status: number, code: SubscriptionErrorCode, message: string) {
    super({ code, message } satisfies ApiError, status);
  }
}

/** A route asked for the entitlement without the guard that resolves the session. */
export class SessionNotResolvedError extends Error {
  constructor() {
    super("SubscriptionGuard used on a route without @UseGuards(SessionGuard).");
    this.name = "SessionNotResolvedError";
  }
}

/**
 * The gate on anything only a subscriber may have.
 *
 * It reads the access the session already carries — `subscriptionAccess` computed it once,
 * on the server, and the `auth-extensions` port put it there — rather than deriving the
 * predicate a second time. Two derivations are two answers waiting to disagree, and the
 * person on the wrong side of the disagreement is a paying one.
 *
 * Runs behind `SessionGuard`, which is what puts the session on the request: no session is
 * that guard's 401, and this one only ever answers "signed in, but not subscribed".
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    if (!request.session) throw new SessionNotResolvedError();
    if (!readSubscriptionAccess(request.session).active) {
      throw new SubscriptionException(HttpStatus.FORBIDDEN, SUBSCRIPTION_REQUIRED, SUBSCRIPTION_REQUIRED_MESSAGE);
    }
    return true;
  }
}
