import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleEmailAdapter } from "./console.adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConsoleEmailAdapter", () => {
  it("prints the recipient, the subject and the body, so a code is readable in the terminal", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const adapter = new ConsoleEmailAdapter();

    await expect(
      adapter.send({ to: "someone@example.com", subject: "Your code", html: "<p>123456</p>", text: "123456" })
    ).resolves.toBeUndefined();

    expect(adapter.provider).toBe("console");
    expect(log).toHaveBeenCalledWith("[notification:email:console]", {
      to: "someone@example.com",
      subject: "Your code",
      text: "123456",
    });
  });

  it("falls back to the HTML body when the request carries no text", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await new ConsoleEmailAdapter().send({ to: "someone@example.com", subject: "Your code", html: "<p>123456</p>" });

    expect(log).toHaveBeenCalledWith(
      "[notification:email:console]",
      expect.objectContaining({ text: "<p>123456</p>" })
    );
  });
});
