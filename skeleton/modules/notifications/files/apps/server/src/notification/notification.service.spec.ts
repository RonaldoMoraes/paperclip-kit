import { describe, expect, it, vi } from "vitest";
import { NotificationError, type NotificationErrorCode } from "../common/ports/notification";
import type { Telemetry } from "../common/ports/telemetry";
import { NOTIFICATION_SEND_EVENT, NotificationService, type NotificationServiceDeps } from "./notification.service";

type Rejection = { rejectWith: unknown };

function stubAdapter<Request>(provider: string, rejection?: Rejection) {
  const send = vi.fn<(request: Request) => Promise<void>>();
  if (rejection) send.mockRejectedValue(rejection.rejectWith);
  else send.mockResolvedValue(undefined);
  return { provider, send };
}

function spyTelemetry() {
  return { captureError: vi.fn(), log: vi.fn(), event: vi.fn() } satisfies Telemetry;
}

/** A service over stubs, with a clock that advances 7ms per read and a fixed request id. */
function makeService(overrides: Partial<NotificationServiceDeps> = {}) {
  const adapters = {
    email: stubAdapter("stub-email"),
    sms: stubAdapter("stub-sms"),
    push: stubAdapter("stub-push"),
  };
  const telemetry = spyTelemetry();
  let clock = 1_000;
  const service = new NotificationService({
    mode: "fake",
    adapters,
    telemetry,
    now: () => (clock += 7),
    requestId: () => "req-1",
    ...overrides,
  });
  return { service, adapters, telemetry };
}

const email = { to: "someone@example.com", subject: "Hello", html: "<p>Hi</p>" };
const sms = { to: "+15555550100", body: "Your code is 123456" };
const push = { to: ["ExponentPushToken[abc]"], title: "Hi", body: "There" };

const sentEvent = (telemetry: ReturnType<typeof spyTelemetry>) =>
  telemetry.event.mock.calls.filter(([name]) => name === NOTIFICATION_SEND_EVENT).map(([, fields]) => fields);

describe("NotificationService", () => {
  it("names its mode and the adapter behind each channel", () => {
    const { service } = makeService();
    expect(service.mode).toBe("fake");
    expect(service.providers).toEqual({ email: "stub-email", sms: "stub-sms", push: "stub-push" });
  });

  it("hands each channel's adapter the validated request and counts one success with its timing", async () => {
    const { service, adapters, telemetry } = makeService();

    await service.sendEmail(email);
    await service.sendSms(sms);
    await service.sendPush(push);

    expect(adapters.email.send).toHaveBeenCalledWith(email);
    expect(adapters.sms.send).toHaveBeenCalledWith(sms);
    expect(adapters.push.send).toHaveBeenCalledWith(push);
    expect(sentEvent(telemetry)).toEqual([
      { requestId: "req-1", channel: "email", provider: "stub-email", mode: "fake", status: "success", durationMs: 7 },
      { requestId: "req-1", channel: "sms", provider: "stub-sms", mode: "fake", status: "success", durationMs: 7 },
      { requestId: "req-1", channel: "push", provider: "stub-push", mode: "fake", status: "success", durationMs: 7 },
    ]);
    expect(telemetry.log).not.toHaveBeenCalled();
  });

  it("wraps an adapter's own throw as provider_error with the cause, and reports the failure", async () => {
    const raw = new Error("socket hang up");
    const { service, telemetry } = makeService({
      adapters: {
        email: stubAdapter("stub-email", { rejectWith: raw }),
        sms: stubAdapter("s"),
        push: stubAdapter("p"),
      },
    });

    const failure = service.sendEmail(email);

    await expect(failure).rejects.toBeInstanceOf(NotificationError);
    await expect(failure).rejects.toMatchObject({
      code: "provider_error",
      context: { channel: "email" },
      cause: raw,
    });
    expect(sentEvent(telemetry)).toEqual([
      expect.objectContaining({ channel: "email", status: "failure", durationMs: 7, errorCode: "provider_error" }),
    ]);
    expect(telemetry.log).toHaveBeenCalledWith(
      "error",
      "[notification] email send failed",
      expect.objectContaining({ requestId: "req-1", errorCode: "provider_error", errorMessage: expect.any(String) })
    );
  });

  it("lets an adapter's NotificationError through untouched, whatever its code", async () => {
    const configuration = new NotificationError("configuration", "no sender", { channel: "sms" });
    const { service, telemetry } = makeService({
      adapters: {
        email: stubAdapter("e"),
        sms: stubAdapter("stub-sms", { rejectWith: configuration }),
        push: stubAdapter("p"),
      },
    });

    await expect(service.sendSms(sms)).rejects.toBe(configuration);
    const codes: NotificationErrorCode[] = sentEvent(telemetry).map((event) => event.errorCode);
    expect(codes).toEqual(["configuration"]);
  });

  it("refuses a request the port's schema rejects before any adapter runs", async () => {
    const { service, adapters, telemetry } = makeService();

    const failure = service.sendEmail({ ...email, to: "not-an-address" });

    await expect(failure).rejects.toMatchObject({ code: "invalid_request", context: { channel: "email" } });
    expect(adapters.email.send).not.toHaveBeenCalled();
    expect(sentEvent(telemetry)).toEqual([
      expect.objectContaining({ channel: "email", status: "refused", errorCode: "invalid_request" }),
    ]);
    expect(telemetry.log).toHaveBeenCalledWith(
      "warn",
      "[notification] email request refused",
      expect.objectContaining({ issues: ["to"] })
    );
  });

  it("tells telemetry nothing about the recipient or the content", async () => {
    const { service, telemetry } = makeService();

    await service.sendSms(sms);

    const everything = JSON.stringify([...telemetry.event.mock.calls, ...telemetry.log.mock.calls]);
    expect(everything).not.toContain(sms.to);
    expect(everything).not.toContain(sms.body);
  });
});
