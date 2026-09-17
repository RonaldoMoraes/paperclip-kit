import { describe, expect, it } from "vitest";
import { loadRevenueCatConfig } from "./revenuecat.config";

describe("loadRevenueCatConfig", () => {
  it("is off with no secret key — which is what mock mode and every gate run as", () => {
    expect(loadRevenueCatConfig({})).toBeNull();
    expect(loadRevenueCatConfig({ REVENUECAT_SECRET_KEY: "  " })).toBeNull();
  });

  it("reads the project and the webhook secret once the key is set, trimmed", () => {
    expect(
      loadRevenueCatConfig({
        REVENUECAT_SECRET_KEY: " sk_live_1 ",
        REVENUECAT_PROJECT_ID: " proj_1 ",
        REVENUECAT_WEBHOOK_SECRET: " shh ",
      })
    ).toEqual({ secretKey: "sk_live_1", projectId: "proj_1", webhookSecret: "shh" });
  });

  // At boot, naming what is missing — not at the first purchase, by somebody paying.
  it("fails the boot naming whichever companion is missing", () => {
    expect(() => loadRevenueCatConfig({ REVENUECAT_SECRET_KEY: "sk_1", REVENUECAT_WEBHOOK_SECRET: "shh" })).toThrow(
      /REVENUECAT_PROJECT_ID/
    );
    expect(() => loadRevenueCatConfig({ REVENUECAT_SECRET_KEY: "sk_1", REVENUECAT_PROJECT_ID: "proj_1" })).toThrow(
      /REVENUECAT_WEBHOOK_SECRET/
    );
  });

  // The Test Store grants every entitlement and charges nobody: the one misconfiguration
  // that looks exactly like a working one.
  it("refuses a Test Store key in production", () => {
    const env = {
      REVENUECAT_SECRET_KEY: "test_abc",
      REVENUECAT_PROJECT_ID: "proj_1",
      REVENUECAT_WEBHOOK_SECRET: "shh",
    };

    expect(() => loadRevenueCatConfig({ ...env, NODE_ENV: "production" })).toThrow(/Test Store/);
    expect(loadRevenueCatConfig({ ...env, NODE_ENV: "development" })?.secretKey).toBe("test_abc");
  });
});
