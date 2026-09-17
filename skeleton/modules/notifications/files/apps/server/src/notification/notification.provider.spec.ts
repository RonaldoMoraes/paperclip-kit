import { describe, expect, it, vi } from "vitest";
import { NOTIFICATION_CLIENT } from "../common/ports/notification";
import { TELEMETRY, noopTelemetry } from "../common/ports/telemetry";
import { NotificationProvider, createNotificationClient } from "./notification.provider";

describe("createNotificationClient", () => {
  it("binds the three console sinks in fake mode and announces it", () => {
    const log = vi.fn();
    const client = createNotificationClient({ mode: "fake" }, { ...noopTelemetry, log });

    expect(client.mode).toBe("fake");
    expect(client.providers).toEqual({ email: "console", sms: "console", push: "console" });
    expect(log).toHaveBeenCalledWith("info", "[notification] ready", expect.objectContaining({ mode: "fake" }));
  });

  it("binds the vendors in real mode without touching the network", () => {
    const client = createNotificationClient(
      {
        mode: "real",
        email: { apiKey: "SG.key", fromEmail: "no-reply@example.com" },
        sms: { accountSid: "AC123", authToken: "token", fromNumber: "+15555550100" },
        push: { accessToken: undefined },
      },
      noopTelemetry
    );

    expect(client.mode).toBe("real");
    expect(client.providers).toEqual({ email: "sendgrid", sms: "twilio", push: "expo" });
  });
});

describe("NotificationProvider", () => {
  it("claims the port's token and asks Nest for the telemetry port", () => {
    expect(NotificationProvider).toMatchObject({ provide: NOTIFICATION_CLIENT, inject: [TELEMETRY] });
  });
});
