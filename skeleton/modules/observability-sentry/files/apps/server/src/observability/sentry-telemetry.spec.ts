import * as Sentry from "@sentry/nestjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SentryTelemetry, toSentryContext } from "./sentry-telemetry";

vi.mock("@sentry/nestjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const PHI = "my blood pressure is 180 over 110";

const everythingSent = () =>
  JSON.stringify([vi.mocked(Sentry.captureException).mock.calls, vi.mocked(Sentry.captureMessage).mock.calls]);

afterEach(() => {
  vi.clearAllMocks();
});

describe("SentryTelemetry", () => {
  it("captures an error with the context's scalars as tags and the rest as extras", () => {
    const boom = new Error("terminal");

    new SentryTelemetry().captureError(boom, {
      mechanism: "api_error_filter",
      method: "GET",
      path: "/api/example/items/nope",
      attempt: 2,
      timing: { ms: 12 },
    });

    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(boom, {
      tags: { mechanism: "api_error_filter", method: "GET", path: "/api/example/items/nope", attempt: "2" },
      extra: { timing: { ms: 12 } },
    });
  });

  it("never sends a preview, a body or a credential — not the value, not the key", () => {
    const telemetry = new SentryTelemetry();

    telemetry.captureError(new Error("terminal"), {
      requestId: "req-1",
      contentPreview: PHI,
      request: { body: { note: PHI }, headers: { cookie: "session=abc" } },
    });
    telemetry.log("error", "structured output failed", { kind: "invalid-json", preview: PHI });

    const sent = everythingSent();
    expect(sent).toContain("req-1");
    expect(sent).toContain("invalid-json");
    expect(sent).not.toContain(PHI);
    expect(sent).not.toContain("session=abc");
    expect(sent).not.toMatch(/contentPreview|"body"|headers|cookie|"preview"/);
  });

  it("turns an error-level log line into a Sentry message and ignores every other level and every event", () => {
    const telemetry = new SentryTelemetry();

    telemetry.log("error", "the writer gave up", { path: "/api/x" });
    telemetry.log("warn", "slow", { ms: 900 });
    telemetry.log("info", "up");
    telemetry.event("boot", { port: 3000 });

    expect(Sentry.captureMessage).toHaveBeenCalledExactlyOnceWith("the writer gave up", {
      level: "error",
      tags: { path: "/api/x" },
      extra: {},
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("swallows a throwing SDK and says so on one line — the port never throws", () => {
    const reported: string[] = [];
    vi.mocked(Sentry.captureException).mockImplementation(() => {
      throw new Error("sdk down");
    });
    const telemetry = new SentryTelemetry((line) => {
      reported.push(line);
    });

    expect(() => telemetry.captureError(new Error("terminal"))).not.toThrow();
    expect(JSON.parse(reported[0])).toMatchObject({ msg: "sentry sink failed", call: "captureException" });
  });
});

describe("toSentryContext", () => {
  it("cuts a tag at 200 characters and keeps a nested object as an extra", () => {
    const { tags, extra } = toSentryContext({ path: "x".repeat(300), shape: { fields: 3 } });
    expect(tags.path).toHaveLength(200);
    expect(extra).toEqual({ shape: { fields: 3 } });
    expect(toSentryContext(undefined)).toEqual({ tags: {}, extra: {} });
  });
});
