import { All, Controller, Inject, Req, Res } from "@nestjs/common";
import { toNodeHandler } from "better-auth/node";
import type { Request, Response } from "express";
import { AUTH } from "./auth.types";
import type { Auth } from "./better-auth";

/**
 * Every `/api/auth/*` request, handed to Better Auth whole — request and response — so
 * its own router answers sign-in, the session probe, sign-out and the provider callbacks.
 * The JSON body `main.ts` already parsed is re-serialised by the node handler, which is
 * why these paths need no entry in `KIT_RAW_BODY_PATHS`. `@All`, because the provider
 * callbacks arrive as GET and everything else as POST.
 */
@Controller("api/auth")
export class AuthController {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  @All("*path")
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    return toNodeHandler(this.auth)(req, res);
  }
}
