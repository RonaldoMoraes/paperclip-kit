import { Controller, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import { ConfirmCheckoutRequest, type ConfirmCheckoutResponse } from "@contracts/subscription/confirm-checkout";
import { BILLING_OFF_MESSAGE } from "@contracts/subscription/errors";
import { Session } from "../auth/session.decorator";
import { type SessionContext, SessionGuard } from "../auth/session.guard";
import { ApiException } from "../common/api-error";
import { ZodBody } from "../common/zod.pipe";
import { PRISMA } from "../database/database.types";
import { type CheckoutReader, type SubscriptionWriter, confirmCheckout } from "./subscription.service";
import { STRIPE } from "./subscription.types";

/**
 * The one endpoint this module serves outside Better Auth's own.
 *
 * It exists because the return from Stripe has to be settled without polling, and the
 * plugin's own success route cannot settle a trial — `stripe-plugin.ts` says why. The
 * session is the caller's; the Checkout Session id is all they send, and a session that is
 * not theirs confirms nothing.
 *
 * No origin check of its own, unlike Better Auth's routes: the whole action is idempotent
 * and reads only what Stripe already knows about a checkout the caller owns. A cross-site
 * caller could at most make somebody's own row catch up with Stripe sooner — it writes
 * nothing a webhook would not have written a second later, and returns nothing the session
 * did not already carry.
 */
@Controller("api/subscription")
@UseGuards(SessionGuard)
export class SubscriptionController {
  constructor(
    @Inject(PRISMA) private readonly db: SubscriptionWriter,
    // The one Stripe call this endpoint makes, not the whole SDK.
    @Inject(STRIPE) private readonly stripe: CheckoutReader | null
  ) {}

  @Post("confirm")
  async confirm(
    @ZodBody(ConfirmCheckoutRequest) body: ConfirmCheckoutRequest,
    @Session() session: SessionContext
  ): Promise<ConfirmCheckoutResponse> {
    // Billing is off (no STRIPE_SECRET_KEY): there is no checkout to have returned from, and
    // saying so is better than answering "not confirmed" as though Stripe had spoken. An
    // `ApiException` rather than Nest's own, so this deployment's own configuration is an
    // answer and not an incident the filter reports through the telemetry port.
    if (!this.stripe) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "INTERNAL", BILLING_OFF_MESSAGE);
    }
    return confirmCheckout({ db: this.db, stripe: this.stripe }, body.sessionId, session.user.id);
  }
}
