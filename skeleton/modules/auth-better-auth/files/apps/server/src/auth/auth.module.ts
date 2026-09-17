import { Module } from "@nestjs/common";
import { NOTIFICATION_CLIENT, type NotificationClient } from "../common/ports/notification";
import { TELEMETRY, type Telemetry } from "../common/ports/telemetry";
import { PRISMA } from "../database/database.types";
import type { Db } from "../database/scope-extension";
import { loadAuthConfig } from "./auth.config";
import { AuthController } from "./auth.controller";
import { AUTH_EXTENSIONS, type AuthExtensions } from "./auth.extensions";
import { AUTH } from "./auth.types";
import { type Auth, createAuth } from "./better-auth";
import { OptionalSessionGuard } from "./optional-session.guard";
import { SessionGuard } from "./session.guard";

/**
 * Better Auth, built once from the database, the notification port and the extensions port.
 *
 * Not global: a feature module that protects a route imports this one for `SessionGuard`,
 * the way `AccountModule` does. The config throws here — at bootstrap — rather than at
 * the first sign-in. `PRISMA` and the ports arrive from their global modules, so nothing
 * is imported for them — `AUTH_EXTENSIONS` among them. That last one is this module's own
 * port (`auth.extensions.ts`), bound in `KIT_PORTS` and injected like any other, which is
 * how a module that claims it changes what this factory builds without editing a line here.
 */
@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH,
      inject: [PRISMA, NOTIFICATION_CLIENT, TELEMETRY, AUTH_EXTENSIONS],
      useFactory: (
        prisma: Db,
        notifications: NotificationClient,
        telemetry: Telemetry,
        extensions: AuthExtensions
      ): Auth => createAuth({ prisma, notifications, telemetry, extensions, config: loadAuthConfig(process.env) }),
    },
    SessionGuard,
    OptionalSessionGuard,
  ],
  exports: [AUTH, SessionGuard, OptionalSessionGuard],
})
export class AuthModule {}
