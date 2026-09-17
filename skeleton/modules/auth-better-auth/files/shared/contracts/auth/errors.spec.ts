import { describe, expect, it } from "vitest";
import {
  AuthFlowError,
  GENERIC_FAILURE,
  SIGN_OUT_FAILED,
  authFailureKind,
  authFailureMessage,
  authFailureReason,
  otpFailure,
  socialFailure,
} from "./errors";

// Pinned so a refactor cannot silently stop naming the throttle, the expired code or the
// wrong code — the three outcomes a person is meant to be able to act on — and so the
// copy read and the reason reported keep classifying the same refusal the same way.
describe("otpFailure", () => {
  it("names the throttle, by code and by the rate limiter's bare 429", () => {
    expect(otpFailure({ code: "TOO_MANY_ATTEMPTS" })).toMatchObject({
      message: expect.stringMatching(/Too many/),
      reason: "throttle",
    });
    expect(otpFailure({ status: 429 })).toMatchObject({
      message: expect.stringMatching(/Too many/),
      reason: "throttle",
    });
  });

  it("names an expired code and a wrong code", () => {
    expect(otpFailure({ code: "OTP_EXPIRED" })).toMatchObject({
      message: expect.stringMatching(/expired/),
      reason: "expired-code",
    });
    expect(otpFailure({ code: "INVALID_OTP" })).toMatchObject({
      message: expect.stringMatching(/doesn't match/),
      reason: "invalid-code",
    });
  });

  it("ignores the message text — only the code classifies", () => {
    expect(otpFailure({ message: "Invalid OTP" })).toMatchObject({ message: "Invalid OTP", reason: "other" });
    expect(otpFailure({ code: "USER_NOT_FOUND", message: "User not found" })).toMatchObject({
      message: "User not found",
      reason: "other",
    });
  });

  it("falls back to the server message, then to the generic line", () => {
    expect(otpFailure({ message: "Custom failure" }).message).toBe("Custom failure");
    expect(otpFailure({}).message).toBe(GENERIC_FAILURE);
  });
});

describe("socialFailure", () => {
  it("names the throttle before the provider, by status and by code", () => {
    expect(socialFailure("google", { status: 429 })).toMatchObject({ reason: "throttle" });
    expect(socialFailure("google", { code: "TOO_MANY_ATTEMPTS" })).toMatchObject({ reason: "throttle" });
  });

  // A round-trip that comes back with no session is `null`: nothing refused it out loud,
  // and the provider is still what failed.
  it("names the provider on any other refusal, including a trip that came back empty", () => {
    expect(socialFailure("google", { status: 500 })).toMatchObject({
      message: expect.stringMatching(/Google/),
      reason: "provider",
    });
    expect(socialFailure("apple", null)).toMatchObject({ message: expect.stringMatching(/Apple/), reason: "provider" });
  });
});

// The copy tells them what happened; the kind is what a caller acts on. Both apps hold the
// send buttons shut on a throttle and hand them straight back on anything else.
describe("AuthFlowError kind", () => {
  it("is a throttle for the one reason waiting answers, and `other` for the rest", () => {
    expect(otpFailure({ status: 429 }).kind).toBe("throttle");
    expect(otpFailure({ code: "INVALID_OTP" }).kind).toBe("other");
    expect(socialFailure("google", null).kind).toBe("other");
    expect(new AuthFlowError(SIGN_OUT_FAILED).kind).toBe("other");
  });
});

describe("the three readers of a caught failure", () => {
  it("read this package's own error and call anything else `other`, behind the generic line", () => {
    const expired = otpFailure({ code: "OTP_EXPIRED" });
    expect(authFailureReason(expired)).toBe("expired-code");
    expect(authFailureMessage(expired)).toBe(expired.message);
    expect(authFailureKind(otpFailure({ status: 429 }))).toBe("throttle");

    expect(authFailureReason(new Error("socket hang up"))).toBe("other");
    expect(authFailureMessage(new Error("socket hang up"))).toBe(GENERIC_FAILURE);
    expect(authFailureKind(undefined)).toBe("other");
  });
});
