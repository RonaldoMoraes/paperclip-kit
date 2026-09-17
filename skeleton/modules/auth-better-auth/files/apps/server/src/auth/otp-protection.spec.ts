import { describe, expect, it } from "vitest";
import {
  OTP_ENDPOINTS,
  OTP_EXPIRY_SECONDS,
  OTP_REQUESTS_PER_WINDOW,
  clientIpHeaders,
  otpRateLimit,
} from "./otp-protection";

describe("otpRateLimit", () => {
  // Better Auth limits in production only unless told otherwise, which would leave every
  // rule below inert where it is first written.
  it("runs in every environment, not only in production", () => {
    expect(otpRateLimit().enabled).toBe(true);
  });

  it("exempts the session poll from the budget", () => {
    expect(otpRateLimit().customRules["/get-session"]).toBe(false);
  });

  it("limits both OTP endpoints, and neither for longer than the code lives", () => {
    const rules = otpRateLimit().customRules;
    for (const path of OTP_ENDPOINTS) {
      expect(rules[path]).toEqual({ window: OTP_EXPIRY_SECONDS, max: OTP_REQUESTS_PER_WINDOW });
    }
  });
});

describe("clientIpHeaders", () => {
  it("defaults to x-forwarded-for, and ignores a blank override", () => {
    expect(clientIpHeaders({})).toEqual(["x-forwarded-for"]);
    expect(clientIpHeaders({ CLIENT_IP_HEADER: "  " })).toEqual(["x-forwarded-for"]);
  });

  it("follows the ingress when it is configured, as one header", () => {
    expect(clientIpHeaders({ CLIENT_IP_HEADER: "x-real-ip" })).toEqual(["x-real-ip"]);
  });
});
