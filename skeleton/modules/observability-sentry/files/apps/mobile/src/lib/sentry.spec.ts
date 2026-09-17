import * as Sentry from "@sentry/react-native";
import { describe, expect, it, vi } from "vitest";
import { bootSentry, scrubBreadcrumb, scrubEvent, sentryDsn, sentryInitOptions } from "./sentry";

vi.mock("@sentry/react-native", () => ({
  init: vi.fn(),
}));

const DSN = "https://key@o0.ingest.sentry.io/1";
const PHI = "my blood pressure is 180 over 110";

describe("bootSentry", () => {
  it("initialises nothing in a binary without a DSN", () => {
    vi.stubEnv("EXPO_PUBLIC_SENTRY_DSN", "");

    bootSentry();

    expect(sentryDsn()).toBeNull();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("initialises once with the DSN and the environment, errors only", () => {
    vi.stubEnv("EXPO_PUBLIC_SENTRY_DSN", ` ${DSN} `);
    vi.stubEnv("EXPO_PUBLIC_SENTRY_ENVIRONMENT", "preview");

    bootSentry();

    expect(Sentry.init).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        dsn: DSN,
        environment: "preview",
        sendDefaultPii: false,
        enableAutoPerformanceTracing: false,
        enableCaptureFailedRequests: false,
        attachScreenshot: false,
        attachViewHierarchy: false,
      })
    );
    expect(vi.mocked(Sentry.init).mock.calls[0][0]).not.toHaveProperty("tracesSampleRate");
  });

  it("names the environment after the build when none is set, and keeps the app opening on a failed init", () => {
    vi.stubEnv("EXPO_PUBLIC_SENTRY_DSN", DSN);
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(Sentry.init).mockImplementation(() => {
      throw new Error("native module missing");
    });

    expect(() => bootSentry()).not.toThrow();
    expect(warned).toHaveBeenCalledOnce();
    expect(sentryInitOptions({ dsn: DSN, environment: "development" }).environment).toBe("development");
  });
});

describe("scrubEvent / scrubBreadcrumb", () => {
  it("strips the request to its URL and method, drops the user and every body-shaped key", () => {
    const event = scrubEvent({
      message: "boom",
      user: { id: "7", email: "someone@example.com" },
      request: {
        url: "https://api.example.com/items?token=abc",
        method: "PUT",
        data: { note: PHI },
        cookies: { session: "s" },
        headers: { authorization: "Bearer x" },
      },
      extra: { requestBody: PHI, requestId: "req-1", link: { url: "/x?id=1" } },
      breadcrumbs: [
        { category: "console", message: PHI },
        { category: "http", data: { url: "/api/items?id=7", method: "GET", status_code: 500, body: PHI } },
      ],
    });

    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ url: "https://api.example.com/items", method: "PUT" });
    expect(event.extra).toEqual({ requestId: "req-1", link: { url: "/x" } });
    expect(event.breadcrumbs).toEqual([
      { category: "http", data: { url: "/api/items", method: "GET", status_code: 500 } },
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
