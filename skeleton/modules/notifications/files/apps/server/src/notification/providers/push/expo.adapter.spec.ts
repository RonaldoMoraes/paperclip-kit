import type { ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import { describe, expect, it, vi } from "vitest";
import { NotificationError } from "../../../common/ports/notification";
import { ExpoPushAdapter, type ExpoPushClient } from "./expo.adapter";

const tokenA = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const tokenB = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";

/** Chunks one message per chunk, so a fan-out to N tokens is N calls the spec can count. */
function stubClient(answer: ExpoPushTicket[] | { rejectWith: unknown } = [{ status: "ok", id: "ticket-1" }]) {
  const send = vi.fn<ExpoPushClient["sendPushNotificationsAsync"]>();
  if ("rejectWith" in answer) send.mockRejectedValue(answer.rejectWith);
  else send.mockResolvedValue(answer);
  return {
    chunkPushNotifications: vi.fn((messages: ExpoPushMessage[]) => messages.map((message) => [message])),
    sendPushNotificationsAsync: send,
  };
}

describe("ExpoPushAdapter", () => {
  it("sends one message to every token, chunked the way the service asks, with the data along", async () => {
    const client = stubClient();
    const adapter = new ExpoPushAdapter({}, client);

    await expect(
      adapter.send({ to: [tokenA, tokenB], title: "Hi", body: "There", data: { itemId: "one" } })
    ).resolves.toBeUndefined();

    expect(adapter.provider).toBe("expo");
    expect(client.chunkPushNotifications).toHaveBeenCalledWith([
      { to: [tokenA, tokenB], title: "Hi", body: "There", data: { itemId: "one" } },
    ]);
    expect(client.sendPushNotificationsAsync).toHaveBeenCalledExactlyOnceWith([
      { to: [tokenA, tokenB], title: "Hi", body: "There", data: { itemId: "one" } },
    ]);
  });

  it("refuses a token that is not Expo's before calling the service", async () => {
    const client = stubClient();
    const adapter = new ExpoPushAdapter({}, client);

    const failure = adapter.send({ to: [tokenA, "fcm:not-an-expo-token"], title: "Hi", body: "There" });

    await expect(failure).rejects.toBeInstanceOf(NotificationError);
    await expect(failure).rejects.toMatchObject({ code: "invalid_request", context: { channel: "push" } });
    expect(client.sendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it("treats an error ticket as a failed send, naming the service's reason", async () => {
    const client = stubClient([
      { status: "ok", id: "ticket-1" },
      { status: "error", message: "device gone", details: { error: "DeviceNotRegistered" } },
    ]);
    const adapter = new ExpoPushAdapter({}, client);

    const failure = adapter.send({ to: [tokenA, tokenB], title: "Hi", body: "There" });

    await expect(failure).rejects.toMatchObject({ code: "provider_error", context: { channel: "push" } });
    await expect(failure).rejects.toThrow(/1 of 2 .* device gone/);
  });

  it("turns the SDK's rejection into the port's provider_error with the cause attached", async () => {
    const raw = new Error("429 Too Many Requests");
    const adapter = new ExpoPushAdapter({}, stubClient({ rejectWith: raw }));

    const failure = adapter.send({ to: tokenA, title: "Hi", body: "There" });

    await expect(failure).rejects.toMatchObject({ code: "provider_error", context: { channel: "push" }, cause: raw });
  });
});
