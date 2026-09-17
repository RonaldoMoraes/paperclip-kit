import { describe, expect, it, vi } from "vitest";
import { ANALYTICS_CLIENT } from "../common/ports/analytics";
import { TELEMETRY, noopTelemetry } from "../common/ports/telemetry";
import { AnalyticsProvider, createAnalyticsClient } from "./analytics.provider";

describe("createAnalyticsClient", () => {
  it("binds the console store in fake mode and announces it", () => {
    const log = vi.fn();
    const client = createAnalyticsClient({ mode: "fake", store: { provider: "console" } }, { ...noopTelemetry, log });

    expect(client.mode).toBe("fake");
    expect(client.provider).toBe("console");
    expect(log).toHaveBeenCalledWith("info", "[analytics] ready", { mode: "fake", store: "console" });
  });

  it("binds the mongo store in real mode without touching the network", () => {
    const client = createAnalyticsClient(
      { mode: "real", store: { provider: "mongo", url: "mongodb://analytics.example.com:27017", database: "acme" } },
      noopTelemetry
    );

    expect(client.mode).toBe("real");
    expect(client.provider).toBe("mongo");
  });
});

describe("AnalyticsProvider", () => {
  it("claims the port's token and asks Nest for the telemetry port", () => {
    expect(AnalyticsProvider).toMatchObject({ provide: ANALYTICS_CLIENT, inject: [TELEMETRY] });
  });
});
