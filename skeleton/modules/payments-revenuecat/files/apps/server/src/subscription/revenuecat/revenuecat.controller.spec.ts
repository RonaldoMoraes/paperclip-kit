import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { noopTelemetry } from "../../common/ports/telemetry";
import { RevenueCatController, bearsWebhookSecret } from "./revenuecat.controller";

const session = { user: { id: "7" }, session: { id: "s1" } } as never;
const config = { secretKey: "sk_1", projectId: "proj_1", webhookSecret: "shh" };

const db = () =>
  ({
    subscription: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ id: 1, reference_id: "7", stripe_subscription_id: null }),
    },
    webhook_event: { create: vi.fn().mockResolvedValue({}) },
  }) as never;

const reader = () =>
  ({ subscriptions: vi.fn().mockResolvedValue([]), storeProductOf: vi.fn().mockResolvedValue(null) }) as never;

const event = (over: Record<string, unknown> = {}) => ({
  api_version: "1.0",
  event: { id: "evt_1", type: "TEST", app_user_id: "7", event_timestamp_ms: 1_700_000_000_000, ...over },
});

const failure = async (run: Promise<unknown>): Promise<HttpException> =>
  (await run.catch((error: unknown) => error)) as HttpException;

describe("the webhook secret", () => {
  it("matches only the exact header, and refuses a missing one", () => {
    expect(bearsWebhookSecret("shh", "shh")).toBe(true);
    expect(bearsWebhookSecret("shhh", "shh")).toBe(false);
    expect(bearsWebhookSecret("shi", "shh")).toBe(false);
    expect(bearsWebhookSecret(undefined, "shh")).toBe(false);
    expect(bearsWebhookSecret("", "shh")).toBe(false);
  });
});

describe("POST /api/subscription/revenuecat/webhook", () => {
  // Store billing off is this deployment's own configuration, not an incident — and with no
  // key there is no secret to compare against either.
  it("answers 503 in the envelope when store billing is off", async () => {
    const controller = new RevenueCatController(db(), null, null, noopTelemetry);

    const refused = await failure(controller.webhook("shh", event()));

    expect(refused).toBeInstanceOf(HttpException);
    expect(refused.getStatus()).toBe(503);
  });

  it("refuses a delivery whose Authorization header is not ours", async () => {
    const controller = new RevenueCatController(db(), reader(), config, noopTelemetry);

    const refused = await failure(controller.webhook("wrong", event()));

    expect(refused.getStatus()).toBe(401);
    expect(refused.getResponse()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("takes the dashboard's TEST event once the header matches", async () => {
    const store = db();
    const controller = new RevenueCatController(store, reader(), config, noopTelemetry);

    await expect(controller.webhook("shh", event())).resolves.toEqual({ outcome: "test" });
  });

  // A body this server cannot parse will not parse on the fourth attempt either, and a
  // non-2xx would have RevenueCat replaying it over everything that does parse.
  it("answers 200 for an authenticated body it cannot read, rather than asking for a retry", async () => {
    const controller = new RevenueCatController(db(), reader(), config, noopTelemetry);

    await expect(controller.webhook("shh", { nothing: true })).resolves.toEqual({ outcome: "unreadable" });
  });
});

describe("POST /api/subscription/revenuecat/confirm", () => {
  it("settles the caller's own purchase and answers with their access", async () => {
    const controller = new RevenueCatController(db(), reader(), config, noopTelemetry);

    await expect(controller.confirm({ storeProductId: "annual" }, session)).resolves.toEqual({
      confirmed: false,
      access: expect.objectContaining({ active: false }),
    });
  });

  it("answers 503 in the envelope when there is no RevenueCat reader at all", async () => {
    const controller = new RevenueCatController(db(), null, null, noopTelemetry);

    const refused = await failure(controller.confirm({ storeProductId: null }, session));

    expect(refused.getStatus()).toBe(503);
    expect(refused.getResponse()).toMatchObject({ code: "INTERNAL" });
  });
});
