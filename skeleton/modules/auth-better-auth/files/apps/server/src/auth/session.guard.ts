import { type CanActivate, type ExecutionContext, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { ApiException } from "../common/api-error";
import { AUTH } from "./auth.types";
import type { Auth } from "./better-auth";

/** What `auth.api.getSession` returns once it has returned something — session + user. */
export type SessionContext = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;

/** A request that has been through `SessionGuard` or `OptionalSessionGuard`. */
export type SessionRequest = Pick<Request, "headers"> & { session?: SessionContext };

/** The one line an anonymous caller reads; the mock's `unauthorized()` says the same. */
export const SIGN_IN_FIRST = "Sign in first.";

/**
 * The one place a protected route resolves its session.
 *
 * Better Auth reads the session from the request headers — the browser's cookie or the
 * Expo app's `Cookie` header, whichever arrived — and the resolved session is stashed on
 * the request so `@Session()` can hand it to the controller without asking twice. No
 * session is the envelope's `UNAUTHORIZED`, never a bare 401.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session?.user) throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", SIGN_IN_FIRST);
    request.session = session;
    return true;
  }
}
