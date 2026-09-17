import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleSmsAdapter } from "./console.adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConsoleSmsAdapter", () => {
  it("prints the recipient and the body, so a code is readable in the terminal", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const adapter = new ConsoleSmsAdapter();

    await expect(adapter.send({ to: "+15555550100", body: "Your code is 123456" })).resolves.toBeUndefined();

    expect(adapter.provider).toBe("console");
    expect(log).toHaveBeenCalledWith("[notification:sms:console]", { to: "+15555550100", body: "Your code is 123456" });
  });
});
