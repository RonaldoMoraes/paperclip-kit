import { timingSafeEqual } from "node:crypto";
import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import {
  ConfirmStorePurchaseRequest,
  type ConfirmStorePurchaseResponse,
} from "@contracts/subscription/confirm-store-purchase";
import { STORE_BILLING_OFF_MESSAGE } from "@contracts/subscription/store-errors";
import { planOfStoreProduct } from "@contracts/subscription/store-products";
import { Session } from "../../auth/session.decorator";
import { type SessionContext, SessionGuard } from "../../auth/session.guard";
import { ApiException } from "../../common/api-error";
import { TELEMETRY, type Telemetry } from "../../common/ports/telemetry";
import { ZodBody } from "../../common/zod.pipe";
import { PRISMA } from "../../database/database.types";
import type { EventTrailWriter } from "../event-trail";
import type { SubscriptionReader } from "../subscription.service";
import type { CustomerReader } from "./client";
import { confirmStorePurchase } from "./confirm";
import { REVENUECAT, REVENUECAT_CONFIG, type RevenueCatConfig } from "./revenuecat.config";
import { type Ingested, RevenueCatWebhookBody, type StoreSubscriptionIo, ingestRevenueCatEvent } from "./webhook";

/**
 * The secret, compared in constant time.
 *
 * `timingSafeEqual` throws on two different lengths, so the length is checked first — and
 * two lengths are two secrets anyway, which is not something a timing attack has to learn
 * slowly. A missing header is a refusal, never an empty comparison.
 */
export function bearsWebhookSecret(header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const sent = Buffer.from(header);
  const expected = Buffer.from(secret);
  return sent.length === expected.length && timingSafeEqual(sent, expected);
}

/** What the webhook answers when it read the delivery but could not make sense of it. */
export type Unreadable = { outcome: "unreadable" };

/**
 * The store's two doors into this server.
 *
 * `webhook` is RevenueCat's, authenticated by the header the integration was configured
 * with and nothing else — no session, no origin, and no signature over the bytes, which is
 * why this path needs no raw body. Once the header matches it answers **200 for anything it
 * read**, whatever it decided to write: a delivery RevenueCat gets a 200 for is one it will
 * not retry, and a body this server cannot parse will not parse on the fourth attempt
 * either. The trail row is what says what happened to it.
 *
 * `confirm` is the app's, behind the session: the person asks for their own row to be
 * brought up to date with what RevenueCat holds, and gets their access back.
 */
@Controller("api/subscription/revenuecat")
export class RevenueCatController {
  constructor(
    // One client, three narrow views of it: the rows the predicate reads, the rows this
    // feature writes, and the trail `payments-stripe` already deduplicates deliveries in.
    @Inject(PRISMA) private readonly db: SubscriptionReader & StoreSubscriptionIo & EventTrailWriter,
    @Inject(REVENUECAT) private readonly reader: CustomerReader | null,
    @Inject(REVENUECAT_CONFIG) private readonly config: RevenueCatConfig | null,
    @Inject(TELEMETRY) private readonly telemetry: Telemetry
  ) {}

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown
  ): Promise<Ingested | Unreadable> {
    // Store billing is off (no REVENUECAT_SECRET_KEY): there is no integration to be
    // delivering here, and there is no secret to compare against either. An `ApiException`
    // rather than Nest's own, so this deployment's configuration is an answer and not an
    // incident the filter reports through the telemetry port.
    if (!this.config) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "INTERNAL", STORE_BILLING_OFF_MESSAGE);
    }
    if (!bearsWebhookSecret(authorization, this.config.webhookSecret)) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "The webhook secret did not match.");
    }

    const parsed = RevenueCatWebhookBody.safeParse(body);
    if (!parsed.success) {
      // 200, deliberately: the header was ours, so this is our own integration sending
      // something this server does not understand. Retrying it forever would bury the
      // deliveries that do parse.
      this.telemetry.event("subscription.store.webhook-unreadable", { issues: parsed.error.issues.length });
      return { outcome: "unreadable" };
    }

    return ingestRevenueCatEvent({ io: this.db, planOf: planOfStoreProduct, telemetry: this.telemetry }, parsed.data);
  }

  @Post("confirm")
  @UseGuards(SessionGuard)
  async confirm(
    @ZodBody(ConfirmStorePurchaseRequest) body: ConfirmStorePurchaseRequest,
    @Session() session: SessionContext
  ): Promise<ConfirmStorePurchaseResponse> {
    if (!this.reader) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "INTERNAL", STORE_BILLING_OFF_MESSAGE);
    }
    return confirmStorePurchase(
      {
        db: this.db,
        io: this.db,
        reader: this.reader,
        planOf: planOfStoreProduct,
        telemetry: this.telemetry,
      },
      session.user.id,
      body.storeProductId
    );
  }
}
