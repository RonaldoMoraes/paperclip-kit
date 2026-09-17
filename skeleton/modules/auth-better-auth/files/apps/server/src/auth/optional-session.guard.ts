import { type CanActivate, type ExecutionContext, Inject, Injectable, createParamDecorator } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import { AUTH } from "./auth.types";
import type { Auth } from "./better-auth";
import type { SessionContext, SessionRequest } from "./session.guard";

/**
 * `SessionGuard`'s open-door sibling, for a route an anonymous caller may use (an
 * analytics door that takes events before an account exists, a public read that
 * personalises when it can). Same resolution, stashed on the request the same way — but
 * no session is not a 401, it is an anonymous caller passing through. A controller reads
 * the answer with `@MaybeSession()`, which is null for them.
 */
@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (session?.user) request.session = session;
    return true;
  }
}

/**
 * The session `OptionalSessionGuard` resolved, or null for an anonymous caller. Only
 * meaningful on a route the guard runs on.
 */
export const MaybeSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionContext | null =>
    context.switchToHttp().getRequest<SessionRequest>().session ?? null
);
