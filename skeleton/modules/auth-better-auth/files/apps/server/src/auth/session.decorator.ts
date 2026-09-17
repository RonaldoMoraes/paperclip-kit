import { type ExecutionContext, createParamDecorator } from "@nestjs/common";
import type { SessionContext, SessionRequest } from "./session.guard";

/** A route asked for the session without the guard that resolves it — a wiring bug, not a refusal. */
export class SessionNotResolvedError extends Error {
  constructor() {
    super("@Session() used on a route without @UseGuards(SessionGuard).");
    this.name = "SessionNotResolvedError";
  }
}

/** Reads what `SessionGuard` left on the request, and says so when the guard never ran. */
export function sessionFromRequest(request: SessionRequest): SessionContext {
  if (!request.session) throw new SessionNotResolvedError();
  return request.session;
}

/**
 * The session `SessionGuard` resolved, as a controller parameter. Only meaningful on a
 * route the guard protects — without it there is nothing on the request to read.
 */
export const Session = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionContext =>
    sessionFromRequest(context.switchToHttp().getRequest<SessionRequest>())
);
