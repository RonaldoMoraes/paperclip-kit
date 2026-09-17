import { describe, expect, it, vi } from "vitest";
import { RevenueCatApiError, createRevenueCatClient } from "./client";

const config = { secretKey: "sk_1", projectId: "proj_1", webhookSecret: "shh" };

const answer = (status: number, body: unknown = {}) =>
  vi.fn().mockResolvedValue({ status, ok: status >= 200 && status < 300, json: async () => body });

describe("the RevenueCat reader", () => {
  it("asks for one customer's subscriptions under the project, with the secret key", async () => {
    const fetchFn = answer(200, { items: [{ id: "sub_1" }] });
    const client = createRevenueCatClient(config, fetchFn as never);

    await expect(client.subscriptions("7")).resolves.toEqual([{ id: "sub_1" }]);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.revenuecat.com/v2/projects/proj_1/customers/7/subscriptions?limit=100",
      { headers: { Authorization: "Bearer sk_1", Accept: "application/json" } }
    );
  });

  // A 404 is an answer about a person, not a failure of the call: somebody RevenueCat has
  // never seen has no subscriptions, and a product that was deleted has no store id.
  it("reads a 404 as an answer — no subscriptions, no store id", async () => {
    const client = createRevenueCatClient(config, answer(404) as never);

    await expect(client.subscriptions("7")).resolves.toEqual([]);
    await expect(client.storeProductOf("prod_1")).resolves.toBeNull();
  });

  it("hands back the store's own identifier for a product", async () => {
    const client = createRevenueCatClient(config, answer(200, { store_identifier: "annual" }) as never);

    await expect(client.storeProductOf("prod_1")).resolves.toBe("annual");
  });

  // Everything else that is not a 2xx is thrown, so the caller answers "unconfirmed"
  // rather than writing "no plan" onto a paying customer's row.
  it("throws on any other refusal rather than reporting an empty customer", async () => {
    const client = createRevenueCatClient(config, answer(500) as never);

    await expect(client.subscriptions("7")).rejects.toBeInstanceOf(RevenueCatApiError);
  });

  it("escapes an app user id that would otherwise walk out of its path segment", async () => {
    const fetchFn = answer(200, { items: [] });
    const client = createRevenueCatClient(config, fetchFn as never);

    await client.subscriptions("../products");

    expect(fetchFn.mock.calls[0][0]).toContain("/customers/..%2Fproducts/subscriptions");
  });
});
