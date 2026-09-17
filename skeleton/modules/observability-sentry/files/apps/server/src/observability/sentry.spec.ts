import * as Sentry from "@sentry/nestjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SentryConfig } from "./observability.config";
import { flushSentry, scrubBreadcrumb, scrubEvent, sentryInitOptions, startSentry } from "./sentry";

vi.mock("@sentry/nestjs", () => ({
  init: vi.fn(),
  isInitialized: vi.fn(() => false),
  close: vi.fn(async () => true),
}));

const config: SentryConfig = {
  dsn: "https://key@o0.ingest.sentry.io/1",
  environment: "staging",
  release: "abc123",
  tracesSampleRate: 0,
};

afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(Sentry.isInitialized).mockReturnValue(false);
});

describe("sentryInitOptions", () => {
  it("turns every collection of personal data off and stays out of OpenTelemetry when errors-only", () => {
    const options = sentryInitOptions(config);

    expect(options).toMatchObject({
      dsn: config.dsn,
      environment: "staging",
      release: "abc123",
      skipOpenTelemetrySetup: true,
      includeLocalVariables: false,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: false, response: false },
        httpBodies: [],
        urlQueryParams: false,
        stackFrameVariables: false,
        databaseQueryData: false,
        genAI: { inputs: false, outputs: false },
      },
    });
    expect(options).not.toHaveProperty("tracesSampleRate");
    expect(options.beforeSend).toBeTypeOf("function");
    expect(options.beforeBreadcrumb).toBeTypeOf("function");
  });

  it("hands Sentry the tracer only when a share of requests is asked for", () => {
    const options = sentryInitOptions({ ...config, tracesSampleRate: 0.2 });
    expect(options).toMatchObject({ tracesSampleRate: 0.2, skipOpenTelemetrySetup: false });
  });
});

describe("scrubEvent / scrubBreadcrumb", () => {
  it("drops the user and keeps of the request only its route and method", () => {
    const event = scrubEvent({
      message: "boom",
      user: { id: "7", email: "someone@example.com" },
      request: {
        url: "https://app.example.com/api/items?token=abc",
        method: "PUT",
        data: { note: "my blood pressure" },
        cookies: { session: "s" },
        headers: { authorization: "Bearer x" },
      },
      extra: { requestBody: "hidden", requestId: "req-1" },
    });

    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ url: "https://app.example.com/api/items", method: "PUT" });
    expect(event.extra).toEqual({ requestId: "req-1" });
    expect(JSON.stringify(event)).not.toMatch(/example\.com"|blood|Bearer|session|token=abc/);
  });

  it("drops a console breadcrumb whole and strips the rest", () => {
    expect(scrubBreadcrumb({ category: "console", message: "patient said: my blood pressure" })).toBeNull();
    expect(
      scrubBreadcrumb({
        category: "http",
        data: { url: "/api/items?id=7", method: "GET", status_code: 500, body: "hidden" },
      })
    ).toEqual({ category: "http", data: { url: "/api/items", method: "GET", status_code: 500 } });
    expect(
      scrubEvent({ breadcrumbs: [{ category: "console", message: "x" }, { category: "navigation" }] }).breadcrumbs
    ).toEqual([{ category: "navigation" }]);
  });
});

describe("startSentry", () => {
  it("initialises nothing without a DSN", () => {
    expect(startSentry({ ...config, dsn: null })).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("initialises once with the DSN, and not again when the preload already did", () => {
    expect(startSentry(config)).toBe(true);
    expect(Sentry.init).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ dsn: config.dsn }));

    vi.mocked(Sentry.isInitialized).mockReturnValue(true);
    expect(startSentry(config)).toBe(true);
    expect(Sentry.init).toHaveBeenCalledOnce();
  });
});

describe("flushSentry", () => {
  it("closes an initialised client, skips an absent one, and never rejects", async () => {
    await flushSentry();
    expect(Sentry.close).not.toHaveBeenCalled();

    vi.mocked(Sentry.isInitialized).mockReturnValue(true);
    await flushSentry(500);
    expect(Sentry.close).toHaveBeenCalledExactlyOnceWith(500);

    vi.mocked(Sentry.close).mockRejectedValueOnce(new Error("transport gone"));
    await expect(flushSentry()).resolves.toBeUndefined();
  });
});
