import { describe, expect, it } from "vitest";
import { loadNotificationConfig } from "./notification.config";

const realEnv = {
  NOTIFICATION_MODE: "real",
  SENDGRID_API_KEY: "SG.key",
  NOTIFICATION_FROM_EMAIL: "no-reply@example.com",
  SMS_ACCOUNT_SID: "AC123",
  SMS_AUTH_TOKEN: "auth-token",
  SMS_FROM: "+15555550100",
};

describe("loadNotificationConfig", () => {
  it("is fake when nothing is set, and when the mode is set to fake with keys around", () => {
    expect(loadNotificationConfig({})).toEqual({ mode: "fake" });
    expect(loadNotificationConfig({ NOTIFICATION_MODE: "fake", SENDGRID_API_KEY: "SG.key" })).toEqual({ mode: "fake" });
    expect(loadNotificationConfig({ NOTIFICATION_MODE: "  " })).toEqual({ mode: "fake" });
  });

  it("refuses a mode it does not know rather than guessing", () => {
    expect(() => loadNotificationConfig({ NOTIFICATION_MODE: "live" })).toThrow(
      '[notification] NOTIFICATION_MODE must be "fake" or "real", got "live".'
    );
  });

  it("builds the real config from every key, trimmed, with the Expo token optional", () => {
    expect(loadNotificationConfig({ ...realEnv, SMS_FROM: " +15555550100 " })).toEqual({
      mode: "real",
      email: { apiKey: "SG.key", fromEmail: "no-reply@example.com" },
      sms: { accountSid: "AC123", authToken: "auth-token", fromNumber: "+15555550100" },
      push: { accessToken: undefined },
    });
    expect(loadNotificationConfig({ ...realEnv, EXPO_ACCESS_TOKEN: "expo-token" })).toMatchObject({
      push: { accessToken: "expo-token" },
    });
  });

  it("names every missing key in one throw, so real mode is fixed in one round", () => {
    expect(() => loadNotificationConfig({ NOTIFICATION_MODE: "real" })).toThrow(
      /SENDGRID_API_KEY, NOTIFICATION_FROM_EMAIL, SMS_ACCOUNT_SID, SMS_AUTH_TOKEN, SMS_FROM/
    );
    expect(() => loadNotificationConfig({ ...realEnv, SMS_AUTH_TOKEN: "   " })).toThrow(/missing: SMS_AUTH_TOKEN\./);
  });
});
