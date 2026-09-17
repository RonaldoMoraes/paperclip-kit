import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsolePushAdapter } from "./console.adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ConsolePushAdapter", () => {
  it("prints the tokens, the title, the body and the data, and reaches no device", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const adapter = new ConsolePushAdapter();

    await expect(
      adapter.send({ to: ["ExponentPushToken[abc]"], title: "Hi", body: "There", data: { itemId: "one" } })
    ).resolves.toBeUndefined();

    expect(adapter.provider).toBe("console");
    expect(log).toHaveBeenCalledWith("[notification:push:console]", {
      to: ["ExponentPushToken[abc]"],
      title: "Hi",
      body: "There",
      data: { itemId: "one" },
    });
  });
});
