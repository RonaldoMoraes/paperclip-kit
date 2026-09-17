import { setImmediate as nextTurn } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import type { Telemetry } from "../common/ports/telemetry";
import { currentRequestContext, currentRequestId, runWithRequestContext, withRequestId } from "./request-context";

const inRequest = <T>(requestId: string, fn: () => T): T => runWithRequestContext({ requestId, startedAt: 0 }, fn);

describe("request context", () => {
  it("is empty outside a request — nothing here mints an id", () => {
    expect(currentRequestId()).toBeUndefined();
    expect(currentRequestContext()).toBeUndefined();
  });

  it("follows the request across awaits and turns of the event loop", async () => {
    const seen = await inRequest("req-1", async () => {
      await nextTurn();
      const afterTurn = currentRequestId();
      await Promise.resolve();
      return [afterTurn, currentRequestId(), currentRequestContext()?.startedAt];
    });
    expect(seen).toEqual(["req-1", "req-1", 0]);
  });

  it("keeps two interleaved requests apart", async () => {
    const run = (id: string) =>
      inRequest(id, async () => {
        await nextTurn();
        return currentRequestId();
      });
    await expect(Promise.all([run("a"), run("b")])).resolves.toEqual(["a", "b"]);
  });

  it("is gone once the request's continuation ends", async () => {
    await inRequest("req-2", async () => {
      await nextTurn();
    });
    expect(currentRequestId()).toBeUndefined();
  });
});

describe("withRequestId", () => {
  it("stamps the id on every call inside a request, and touches nothing outside one", () => {
    const sink = { captureError: vi.fn(), log: vi.fn(), event: vi.fn() } satisfies Telemetry;
    const wrapped = withRequestId(sink);

    wrapped.event("boot");
    inRequest("req-9", () => {
      wrapped.captureError(new Error("x"), { path: "/x" });
      wrapped.log("warn", "slow", { ms: 3 });
      wrapped.event("hit");
    });

    expect(sink.event).toHaveBeenNthCalledWith(1, "boot", undefined);
    expect(sink.captureError).toHaveBeenCalledWith(expect.any(Error), { requestId: "req-9", path: "/x" });
    expect(sink.log).toHaveBeenCalledWith("warn", "slow", { requestId: "req-9", ms: 3 });
    expect(sink.event).toHaveBeenNthCalledWith(2, "hit", { requestId: "req-9" });
  });
});
