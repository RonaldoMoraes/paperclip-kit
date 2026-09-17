import { describe, expect, it } from "vitest";
import { SEND_COOLDOWN_SECONDS, secondsUntil, sendCooldownEnd, waitFollowsSend, waitLabel } from "./send-cooldown";

describe("waitFollowsSend", () => {
  it("a send that went out, and one the server refused as too fast, both start the wait", () => {
    expect(waitFollowsSend(null)).toBe(true);
    expect(waitFollowsSend("throttle")).toBe(true);
  });

  // Nothing left the device, so there is no email on its way and nothing to wait for.
  it("a send that failed for anything else costs nothing", () => {
    expect(waitFollowsSend("other")).toBe(false);
  });
});

describe("secondsUntil", () => {
  it("counts the whole wait from its start, rounds a partial second up, and never goes below zero", () => {
    const start = 1_000_000;
    const end = sendCooldownEnd(start);
    expect(secondsUntil(end, start)).toBe(SEND_COOLDOWN_SECONDS);
    expect(secondsUntil(end, end - 1)).toBe(1);
    expect(secondsUntil(1_000, 5_000)).toBe(0);
  });
});

describe("waitLabel", () => {
  it("names the wait while it runs and gives the plain label back after", () => {
    expect(waitLabel("Send a new code", 12)).toBe("Send a new code in 12s");
    expect(waitLabel("Send a new code", 0)).toBe("Send a new code");
  });
});
