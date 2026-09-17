import { Module } from "@nestjs/common";
import type Stripe from "stripe";
import { AuthModule } from "../auth/auth.module";
import { createStripeClient } from "./stripe-plugin";
import { type StripeConfig, loadStripeConfig } from "./subscription.config";
import { SubscriptionController } from "./subscription.controller";
import { SubscriptionGuard } from "./subscription.guard";
import { STRIPE, STRIPE_CONFIG } from "./subscription.types";

/**
 * The checkout return, and the gate on anything a subscription pays for.
 *
 * Both tokens are nullable and both come from a factory: `STRIPE_SECRET_KEY` is the switch,
 * and with it unset the client is `null`, the confirm endpoint answers 503 and nothing here
 * fails to start. That is what "billing off" means — inert, not broken.
 *
 * The Stripe plugin itself is not built here. It reaches Better Auth through the
 * `auth-extensions` port (`auth-extensions.provider.ts`), which the global `PortsModule`
 * binds; this module and that provider read the same `loadStripeConfig`, so there is one
 * account of what billing is configured as and one boot failure when it is half-set.
 */
@Module({
  // AuthModule for `SessionGuard`, which the controller names in `@UseGuards()`.
  imports: [AuthModule],
  controllers: [SubscriptionController],
  providers: [
    SubscriptionGuard,
    { provide: STRIPE_CONFIG, useFactory: (): StripeConfig | null => loadStripeConfig(process.env) },
    {
      provide: STRIPE,
      inject: [STRIPE_CONFIG],
      useFactory: (config: StripeConfig | null): Stripe | null => createStripeClient(config),
    },
  ],
  // A feature module that puts a route behind a subscription imports this one for the guard.
  exports: [SubscriptionGuard, STRIPE, STRIPE_CONFIG],
})
export class SubscriptionModule {}
