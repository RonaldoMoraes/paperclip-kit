import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SubscriptionController } from "./subscription.controller";

const session = { user: { id: "7" }, session: { id: "s1" } } as never;

const db = (over: { count?: number } = {}) =>
  ({
    subscription: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: over.count ?? 1 }),
    },
  }) as never;

describe("POST /api/subscription/confirm", () => {
  it("settles the checkout for the signed-in caller and answers with their access", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      metadata: { subscriptionId: "12", referenceId: "7" },
      subscription: { id: "sub_1", status: "active", customer: "cus_1", items: { data: [{}] } },
    });
    const controller = new SubscriptionController(db(), { checkout: { sessions: { retrieve } } });

    await expect(controller.confirm({ sessionId: "cs_1" }, session)).resolves.toEqual({
      confirmed: true,
      access: expect.objectContaining({ active: false }),
    });
    expect(retrieve).toHaveBeenCalledWith("cs_1", { expand: ["subscription"] });
  });

  // Billing off is this deployment's own configuration, not an incident: the envelope says
  // so at 503, and the filter never reports it through the telemetry port.
  it("answers 503 in the envelope when there is no Stripe client at all", async () => {
    const controller = new SubscriptionController(db(), null);

    const failure = await controller.confirm({ sessionId: "cs_1" }, session).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getStatus()).toBe(503);
    expect((failure as HttpException).getResponse()).toMatchObject({ code: "INTERNAL" });
  });
});
