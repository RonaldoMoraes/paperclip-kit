import * as Sentry from "@sentry/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootSentry, scrubBreadcrumb, scrubEvent, sentryDsn, sentryInitOptions } from "./sentry";

vi.mock("@sentry/react", () => ({
  init: vi.fn(),
}));

const DSN = "https://key@o0.ingest.sentry.io/1";
const PHI = "my blood pressure is 180 over 110";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("bootSentry", () => {
  it("initialises nothing in a build without a DSN", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");

    bootSentry();

    expect(sentryDsn()).toBeNull();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("initialises once with the DSN, the environment and the release, errors only", () => {
    vi.stubEnv("VITE_SENTRY_DSN", ` ${DSN} `);
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", "staging");

    bootSentry();

    expect(Sentry.init).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ dsn: DSN, environment: "staging", release: expect.stringMatching(/@.+$/) })
    );
    const options = vi.mocked(Sentry.init).mock.calls[0][0];
    expect(options).not.toHaveProperty("tracesSampleRate");
    expect(options).not.toHaveProperty("replaysSessionSampleRate");
    expect(options).not.toHaveProperty("integrations");
  });

  it("keeps the app opening when the SDK refuses to start", () => {
    vi.stubEnv("VITE_SENTRY_DSN", DSN);
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(Sentry.init).mockImplementation(() => {
      throw new Error("sdk down");
    });

    expect(() => bootSentry()).not.toThrow();
    expect(warned).toHaveBeenCalledOnce();
  });
});

describe("sentryInitOptions", () => {
  it("collects no personal data and scrubs what it sends", () => {
    const options = sentryInitOptions({ dsn: DSN, environment: "production", release: "app@1.0.0" });

    expect(options.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    });
    expect(options.beforeSend).toBeTypeOf("function");
    expect(options.beforeBreadcrumb).toBeTypeOf("function");
  });
});

describe("scrubEvent / scrubBreadcrumb", () => {
  it("strips the request to its URL and method, drops the user and every body-shaped key", () => {
    const event = scrubEvent({
      message: "boom",
      user: { id: "7", email: "someone@example.com" },
      request: {
        url: "https://app.example.com/items?token=abc",
        method: "PUT",
        data: { note: PHI },
        cookies: { session: "s" },
        headers: { authorization: "Bearer x" },
      },
      extra: { requestBody: PHI, requestId: "req-1", link: { url: "/x?id=1" } },
      breadcrumbs: [
        { category: "console", message: PHI },
        { category: "fetch", data: { url: "/api/items?id=7", method: "GET", status_code: 500, body: PHI } },
      ],
    });

    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ url: "https://app.example.com/items", method: "PUT" });
    expect(event.extra).toEqual({ requestId: "req-1", link: { url: "/x" } });
    expect(event.breadcrumbs).toEqual([
      { category: "fetch", data: { url: "/api/items", method: "GET", status_code: 500 } },
    ]);
    expect(JSON.stringify(event)).not.toMatch(/blood|Bearer|session|token=abc|someone/);
  });

  it("leaves a breadcrumb without data as it is", () => {
    expect(scrubBreadcrumb({ category: "navigation", message: "/example" })).toEqual({
      category: "navigation",
      message: "/example",
    });
  });
});
