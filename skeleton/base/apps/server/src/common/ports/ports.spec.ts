import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleAnalyticsClient } from "./analytics";
import { ConsoleNotificationClient, NotificationError } from "./notification";
import { ConsoleTelemetry } from "./telemetry";

afterEach(() => {
  vi.restoreAllMocks();
});

const quiet = () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
};

describe("ConsoleNotificationClient", () => {
  it("sends nothing and resolves", async () => {
    quiet();
    const client = new ConsoleNotificationClient();
    await expect(
      client.sendEmail({ to: "someone@example.com", subject: "Hello", html: "<p>Hi</p>" })
    ).resolves.toBeUndefined();
    await expect(client.sendSms({ to: "+15555550100", body: "Hi" })).resolves.toBeUndefined();
    await expect(client.sendPush({ to: ["tok_1"], title: "Hi", body: "There" })).resolves.toBeUndefined();
  });

  it("refuses a malformed request the way a real adapter would, with the port's own error", async () => {
    const client = new ConsoleNotificationClient();
    const failure = client.sendEmail({ to: "not-an-address", subject: "", html: "" });
    await expect(failure).rejects.toBeInstanceOf(NotificationError);
    await expect(failure).rejects.toMatchObject({ code: "invalid_request", context: { channel: "email" } });
  });
});

describe("ConsoleAnalyticsClient", () => {
  it("returns synchronously and has nothing to flush", async () => {
    quiet();
    const client = new ConsoleAnalyticsClient();
    expect(
      client.track({
        anonymousId: "anon",
        userId: null,
        events: [{ event: { type: "source" }, occurredAt: new Date() }],
      })
    ).toBeUndefined();
    expect(client.identify({ anonymousId: "anon", userId: "7" })).toBeUndefined();
    await expect(client.flush()).resolves.toBeUndefined();
  });
});

describe("ConsoleTelemetry", () => {
  it("describes a thrown non-error without throwing itself", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    new ConsoleTelemetry().captureError("boom", { path: "/api/x" });
    expect(logged).toHaveBeenCalledWith(
      "[telemetry] error",
      expect.objectContaining({ message: "boom", path: "/api/x" })
    );
  });

  it("routes each level to the matching console method", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const telemetry = new ConsoleTelemetry();
    telemetry.log("info", "up");
    telemetry.log("warn", "slow");
    telemetry.log("error", "down");
    telemetry.event("boot", { port: 3000 });
    expect(log).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
