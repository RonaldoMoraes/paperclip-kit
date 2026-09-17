import { describe, expect, it } from "vitest";
import { loadAuthConfig } from "./auth.config";

const SECRET = "a".repeat(32);
const complete = { BETTER_AUTH_URL: "https://app.example.com", BETTER_AUTH_SECRET: SECRET };

describe("loadAuthConfig", () => {
  it("fails the boot on a missing or unusable base URL", () => {
    expect(() => loadAuthConfig({ BETTER_AUTH_SECRET: SECRET })).toThrow(/BETTER_AUTH_URL/);
    expect(() => loadAuthConfig({ ...complete, BETTER_AUTH_URL: "app.example.com" })).toThrow(/not a valid URL/);
  });

  it("fails the boot on a secret short enough to guess", () => {
    expect(() => loadAuthConfig({ ...complete, BETTER_AUTH_SECRET: undefined })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => loadAuthConfig({ ...complete, BETTER_AUTH_SECRET: "short" })).toThrow(/at least 32/);
  });

  it("trusts the app's own origin, Apple's and every mobile scheme", () => {
    const config = loadAuthConfig({ ...complete, MOBILE_SCHEME: "acme, acme-dev" });

    expect(config.mobileSchemes).toEqual(["acme", "acme-dev"]);
    expect(config.trustedOrigins).toEqual([
      "https://app.example.com",
      "https://appleid.apple.com",
      "acme://",
      "acme-dev://",
    ]);
  });

  // No deploy sets MOBILE_SCHEME, so the default is what every installed variant is trusted
  // by: a scheme missing here is a build whose `<scheme>://` origin is refused.
  it("defaults to one scheme per installed variant", () => {
    expect(loadAuthConfig(complete).mobileSchemes).toHaveLength(3);
    expect(loadAuthConfig({ ...complete, MOBILE_SCHEME: " , " }).mobileSchemes).toHaveLength(3);
  });

  it("trusts Expo Go's exp:// in development only", () => {
    expect(loadAuthConfig({ ...complete, NODE_ENV: "development" }).trustedOrigins).toContain("exp://");
    expect(loadAuthConfig({ ...complete, NODE_ENV: "production" }).trustedOrigins).not.toContain("exp://");
  });

  it("adds the extra origins, trimmed, and ignores the empty ones", () => {
    const config = loadAuthConfig({ ...complete, AUTH_TRUSTED_ORIGINS: " https://a.test , ,https://b.test" });

    expect(config.trustedOrigins).toContain("https://a.test");
    expect(config.trustedOrigins).toContain("https://b.test");
    expect(config.trustedOrigins).not.toContain("");
  });

  it("configures a social provider only with both halves of its pair", () => {
    expect(loadAuthConfig({ ...complete, GOOGLE_CLIENT_ID: "id" }).google).toBeNull();
    expect(loadAuthConfig({ ...complete, GOOGLE_CLIENT_SECRET: "secret" }).google).toBeNull();
    expect(loadAuthConfig({ ...complete, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }).google).toEqual({
      clientId: "id",
      clientSecret: "secret",
    });
    expect(loadAuthConfig({ ...complete, APPLE_CLIENT_ID: "id", APPLE_CLIENT_SECRET: "secret" }).apple).toEqual({
      clientId: "id",
      clientSecret: "secret",
    });
  });

  it("shares a cookie across subdomains only over https", () => {
    expect(loadAuthConfig({ ...complete, COOKIE_DOMAIN: ".example.com" }).cookieDomain).toBe(".example.com");
    expect(
      loadAuthConfig({ ...complete, BETTER_AUTH_URL: "http://localhost:5173", COOKIE_DOMAIN: ".example.com" })
        .cookieDomain
    ).toBeNull();
    expect(loadAuthConfig(complete).cookieDomain).toBeNull();
  });

  it("takes the sender from the environment, with the scaffolded default behind it", () => {
    expect(loadAuthConfig({ ...complete, AUTH_FROM_EMAIL: " codes@example.com " }).fromEmail).toBe("codes@example.com");
    expect(loadAuthConfig(complete).fromEmail).not.toBe("");
  });

  it("buckets the rate limiter on one header", () => {
    expect(loadAuthConfig(complete).ipAddressHeaders).toEqual(["x-forwarded-for"]);
    expect(loadAuthConfig({ ...complete, CLIENT_IP_HEADER: "x-real-ip" }).ipAddressHeaders).toEqual(["x-real-ip"]);
  });
});
