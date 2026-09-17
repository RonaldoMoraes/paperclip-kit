import { describe, expect, it } from "vitest";
import { loadObservabilityConfig } from "./observability.config";

describe("loadObservabilityConfig", () => {
  it("has a safe default for every key: Sentry off, NODE_ENV's environment, errors only", () => {
    expect(loadObservabilityConfig({})).toEqual({
      sentry: { dsn: null, environment: "development", release: null, tracesSampleRate: 0 },
    });
    expect(loadObservabilityConfig({ NODE_ENV: "production" }).sentry.environment).toBe("production");
  });

  it("reads a blank DSN as off, and a set one trimmed", () => {
    expect(loadObservabilityConfig({ SENTRY_DSN: "   " }).sentry.dsn).toBeNull();
    expect(loadObservabilityConfig({ SENTRY_DSN: " https://key@o0.ingest.sentry.io/1 " }).sentry.dsn).toBe(
      "https://key@o0.ingest.sentry.io/1"
    );
  });

  it("lets SENTRY_ENVIRONMENT and SENTRY_RELEASE name the event, over NODE_ENV", () => {
    const config = loadObservabilityConfig({
      NODE_ENV: "production",
      SENTRY_ENVIRONMENT: " staging ",
      SENTRY_RELEASE: "abc123",
    });
    expect(config.sentry).toMatchObject({ environment: "staging", release: "abc123" });
  });

  it("reads the traces share as a number in [0, 1] and refuses anything else", () => {
    expect(loadObservabilityConfig({ SENTRY_TRACES_SAMPLE_RATE: "0.25" }).sentry.tracesSampleRate).toBe(0.25);
    expect(loadObservabilityConfig({ SENTRY_TRACES_SAMPLE_RATE: "" }).sentry.tracesSampleRate).toBe(0);
    expect(() => loadObservabilityConfig({ SENTRY_TRACES_SAMPLE_RATE: "2" })).toThrow(
      '[observability] SENTRY_TRACES_SAMPLE_RATE must be a number between 0 and 1, got "2".'
    );
    expect(() => loadObservabilityConfig({ SENTRY_TRACES_SAMPLE_RATE: "lots" })).toThrow(/got "lots"/);
  });
});
