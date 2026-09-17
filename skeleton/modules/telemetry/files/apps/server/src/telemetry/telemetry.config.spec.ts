import { describe, expect, it } from "vitest";
import { loadTelemetryConfig } from "./telemetry.config";

describe("loadTelemetryConfig", () => {
  it("has a safe default for every key: info, the probe logged, nothing exported", () => {
    expect(loadTelemetryConfig({})).toEqual({
      logLevel: "info",
      logHealth: true,
      otel: { serviceName: "__PRODUCT_SLUG__", endpoint: null, console: false },
    });
  });

  it("reads the level in any casing and refuses one it does not know", () => {
    expect(loadTelemetryConfig({ LOG_LEVEL: " WARN " }).logLevel).toBe("warn");
    expect(() => loadTelemetryConfig({ LOG_LEVEL: "verbose" })).toThrow(
      '[telemetry] LOG_LEVEL must be one of debug, info, warn, error, got "verbose".'
    );
  });

  it("reads the flags as true/1 and false/0, and keeps the default for anything else", () => {
    expect(loadTelemetryConfig({ LOG_HEALTH: "false" }).logHealth).toBe(false);
    expect(loadTelemetryConfig({ LOG_HEALTH: "0" }).logHealth).toBe(false);
    expect(loadTelemetryConfig({ LOG_HEALTH: "nope" }).logHealth).toBe(true);
    expect(loadTelemetryConfig({ OTEL_CONSOLE: "TRUE" }).otel.console).toBe(true);
    expect(loadTelemetryConfig({ OTEL_CONSOLE: "1" }).otel.console).toBe(true);
    expect(loadTelemetryConfig({ OTEL_CONSOLE: "yes" }).otel.console).toBe(false);
  });

  it("takes the collector's base URL without its trailing slash, and the service name trimmed", () => {
    const config = loadTelemetryConfig({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318/ ",
      OTEL_SERVICE_NAME: " notes-api ",
    });
    expect(config.otel).toEqual({ serviceName: "notes-api", endpoint: "http://collector:4318", console: false });
    expect(loadTelemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "   " }).otel.endpoint).toBeNull();
  });
});
