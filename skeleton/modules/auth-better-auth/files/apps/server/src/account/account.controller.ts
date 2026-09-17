import { Controller, Delete, Get, Inject, Req, Res, UseGuards } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, Response } from "express";
import type { DeleteAccountResponse } from "@contracts/account/delete-account";
import type { MeResponse } from "@contracts/account/me";
import { AUTH } from "../auth/auth.types";
import type { Auth } from "../auth/better-auth";
import { Session } from "../auth/session.decorator";
import { type SessionContext, SessionGuard } from "../auth/session.guard";
import { deleteAccount, readMe } from "./account.service";

/**
 * The signed-in user's own account — the reference for a guarded feature: `SessionGuard`
 * on the class, `@Session()` in the handler, nothing here reads a cookie. Both routes are
 * tried from both transports (the browser's jar, the phone's `Cookie` header).
 */
@Controller("api/account")
@UseGuards(SessionGuard)
export class AccountController {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  /** `GET /api/account/me` — who is signed in, as the contract's narrow user. */
  @Get("me")
  me(@Session() session: SessionContext): MeResponse {
    return readMe(session);
  }

  /**
   * `DELETE /api/account` — the user and everything that hangs off them. Better Auth
   * clears the session on its way out; its `Set-Cookie` is forwarded so the browser's
   * jar clears too (the Expo client clears its own store on the sign-out it makes next).
   */
  @Delete()
  async remove(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<DeleteAccountResponse> {
    const { body, setCookie } = await deleteAccount({ auth: this.auth.api }, fromNodeHeaders(req.headers));
    if (setCookie.length > 0) res.setHeader("set-cookie", setCookie);
    return body;
  }
}
