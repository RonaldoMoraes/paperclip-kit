import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccountController } from "./account.controller";

/**
 * Wiring only. `AuthModule` is imported for `SessionGuard` and the `AUTH` token — the
 * shape every feature that protects a route copies.
 */
@Module({
  imports: [AuthModule],
  controllers: [AccountController],
})
export class AccountModule {}
