import { describe, expect, it, vi } from "vitest";
import { NotificationError } from "../../../common/ports/notification";
import { type TwilioMessenger, TwilioSmsAdapter } from "./twilio.adapter";

const config = { accountSid: "AC123", authToken: "token", fromNumber: "+15555550100" };

function stubMessenger(rejectWith?: unknown) {
  const create = vi.fn<TwilioMessenger["messages"]["create"]>();
  if (rejectWith === undefined) create.mockResolvedValue({ sid: "SM1" });
  else create.mockRejectedValue(rejectWith);
  return { messages: { create } };
}

describe("TwilioSmsAdapter", () => {
  it("sends from the configured number unless the request names its own", async () => {
    const messenger = stubMessenger();
    const adapter = new TwilioSmsAdapter(config, messenger);

    await adapter.send({ to: "+15555550199", body: "Hello" });
    await adapter.send({ to: "+15555550199", from: "+15555550111", body: "Hello" });

    expect(adapter.provider).toBe("twilio");
    expect(messenger.messages.create).toHaveBeenNthCalledWith(1, {
      to: "+15555550199",
      from: "+15555550100",
      body: "Hello",
    });
    expect(messenger.messages.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ from: "+15555550111" }));
  });

  it("turns the SDK's rejection into the port's provider_error with the cause attached", async () => {
    const raw = new Error("Unreachable");
    const adapter = new TwilioSmsAdapter(config, stubMessenger(raw));

    const failure = adapter.send({ to: "+15555550199", body: "Hello" });

    await expect(failure).rejects.toBeInstanceOf(NotificationError);
    await expect(failure).rejects.toMatchObject({ code: "provider_error", context: { channel: "sms" }, cause: raw });
  });
});
