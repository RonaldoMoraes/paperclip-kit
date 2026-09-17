import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { type CustomerReader, createRevenueCatClient } from "./client";
import { REVENUECAT, REVENUECAT_CONFIG, type RevenueCatConfig, loadRevenueCatConfig } from "./revenuecat.config";
import { RevenueCatController } from "./revenuecat.controller";

/**
 * The store's half of selling: RevenueCat's webhook, and the confirm the phone calls.
 *
 * Both tokens are nullable and both come from a factory: `REVENUECAT_SECRET_KEY` is the
 * switch, and with it unset the reader is `null`, both routes answer 503 and nothing here
 * fails to start. That is what "store billing off" means — inert, not broken — and it is
 * what every gate run, `yarn dev` and `yarn mobile:mock` run as.
 *
 * Nothing is claimed on the `auth-extensions` port: `payments-stripe` already holds it, and
 * the access it puts on the session is computed from the `subscription` table, which is the
 * table this module writes. A purchase made on the phone reaches every client through the
 * probe it already makes, with no second extension and no second predicate.
 */
@Module({
  // AuthModule for `SessionGuard`, which the controller names in `@UseGuards()`.
  imports: [AuthModule],
  controllers: [RevenueCatController],
  providers: [
    { provide: REVENUECAT_CONFIG, useFactory: (): RevenueCatConfig | null => loadRevenueCatConfig(process.env) },
    {
      provide: REVENUECAT,
      inject: [REVENUECAT_CONFIG],
      useFactory: (config: RevenueCatConfig | null): CustomerReader | null =>
        config ? createRevenueCatClient(config) : null,
    },
  ],
  exports: [REVENUECAT, REVENUECAT_CONFIG],
})
export class RevenueCatModule {}
