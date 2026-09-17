import { describe, expect, it, vi } from "vitest";
import { NotificationError } from "../../../common/ports/notification";
import { SendgridEmailAdapter, type SendgridMailer } from "./sendgrid.adapter";

const config = { apiKey: "SG.key", fromEmail: "no-reply@example.com" };

function stubMailer(rejectWith?: unknown) {
  const send = vi.fn<SendgridMailer["send"]>();
  if (rejectWith === undefined) send.mockResolvedValue([{ statusCode: 202, body: {}, headers: {} }, {}]);
  else send.mockRejectedValue(rejectWith);
  return { setApiKey: vi.fn(), send };
}

describe("SendgridEmailAdapter", () => {
  it("authenticates its own client with the configured key, once, at construction", () => {
    const mailer = stubMailer();
    new SendgridEmailAdapter(config, mailer);
    expect(mailer.setApiKey).toHaveBeenCalledExactlyOnceWith("SG.key");
  });

  it("sends from the configured sender unless the request names its own, and passes text only when given", async () => {
    const mailer = stubMailer();
    const adapter = new SendgridEmailAdapter(config, mailer);

    await adapter.send({ to: "someone@example.com", subject: "Hello", html: "<p>Hi</p>" });
    await adapter.send({
      to: "someone@example.com",
      from: "me@example.com",
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
    });

    expect(adapter.provider).toBe("sendgrid");
    expect(mailer.send).toHaveBeenNthCalledWith(1, {
      to: "someone@example.com",
      from: "no-reply@example.com",
      subject: "Hello",
      html: "<p>Hi</p>",
    });
    expect(mailer.send).toHaveBeenNthCalledWith(2, expect.objectContaining({ from: "me@example.com", text: "Hi" }));
  });

  it("turns the SDK's rejection into the port's provider_error with the cause attached", async () => {
    const raw = new Error("Forbidden");
    const adapter = new SendgridEmailAdapter(config, stubMailer(raw));

    const failure = adapter.send({ to: "someone@example.com", subject: "Hello", html: "<p>Hi</p>" });

    await expect(failure).rejects.toBeInstanceOf(NotificationError);
    await expect(failure).rejects.toMatchObject({ code: "provider_error", context: { channel: "email" }, cause: raw });
  });
});
