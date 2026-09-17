import { describe, expect, it } from "vitest";
import { DEFAULT_ANALYTICS_DATABASE, loadAnalyticsConfig } from "./analytics.config";

const realEnv = {
  ANALYTICS_MODE: "real",
  ANALYTICS_MONGODB_URL: "mongodb://analytics.example.com:27017",
  ANALYTICS_MONGODB_DB: "acme-analytics-dev",
};

describe("loadAnalyticsConfig", () => {
  it("is fake when nothing is set, and when the mode is fake with a URL around", () => {
    expect(loadAnalyticsConfig({})).toEqual({ mode: "fake", store: { provider: "console" } });
    expect(loadAnalyticsConfig({ ANALYTICS_MODE: "  " })).toEqual({ mode: "fake", store: { provider: "console" } });
    expect(loadAnalyticsConfig({ ANALYTICS_MODE: "fake", ANALYTICS_MONGODB_URL: "mongodb://ignored" })).toEqual({
      mode: "fake",
      store: { provider: "console" },
    });
  });

  it("refuses a mode it does not know rather than guessing", () => {
    expect(() => loadAnalyticsConfig({ ANALYTICS_MODE: "live" })).toThrow(
      '[analytics] ANALYTICS_MODE must be "fake" or "real", got "live".'
    );
  });

  it("builds the mongo store from the URL, trimmed, with the database defaulting to the product's own", () => {
    expect(
      loadAnalyticsConfig({ ...realEnv, ANALYTICS_MONGODB_URL: " mongodb://analytics.example.com:27017 " })
    ).toEqual({
      mode: "real",
      store: { provider: "mongo", url: "mongodb://analytics.example.com:27017", database: "acme-analytics-dev" },
    });
    expect(loadAnalyticsConfig({ ...realEnv, ANALYTICS_MONGODB_DB: "" }).store).toMatchObject({
      database: DEFAULT_ANALYTICS_DATABASE,
    });
    expect(loadAnalyticsConfig({ ...realEnv, ANALYTICS_MONGODB_DB: undefined }).store).toMatchObject({
      database: DEFAULT_ANALYTICS_DATABASE,
    });
  });

  it("names the missing URL in real mode, so real is fixed in one round", () => {
    expect(() => loadAnalyticsConfig({ ANALYTICS_MODE: "real" })).toThrow(/ANALYTICS_MONGODB_URL is missing/);
    expect(() => loadAnalyticsConfig({ ...realEnv, ANALYTICS_MONGODB_URL: "   " })).toThrow(/ANALYTICS_MONGODB_URL/);
  });
});
