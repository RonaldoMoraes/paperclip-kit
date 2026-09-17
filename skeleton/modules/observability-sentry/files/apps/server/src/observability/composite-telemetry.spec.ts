import { describe, expect, it, vi } from "vitest";
import type { Telemetry } from "../common/ports/telemetry";
import { CompositeTelemetry } from "./composite-telemetry";

function recordingSink(): Telemetry {
  return { captureError: vi.fn(), log: vi.fn(), event: vi.fn() };
}

describe("CompositeTelemetry", () => {
  it("fans every call out to every sink with the same arguments, in order", () => {
    const first = recordingSink();
    const second = recordingSink();
    const composite = new CompositeTelemetry([first, second]);
    const boom = new Error("terminal");

    composite.captureError(boom, { path: "/api/x" });
    composite.log("warn", "slow", { ms: 900 });
    composite.event("boot", { port: 3000 });

    for (const sink of [first, second]) {
      expect(sink.captureError).toHaveBeenCalledExactlyOnceWith(boom, { path: "/api/x" });
      expect(sink.log).toHaveBeenCalledExactlyOnceWith("warn", "slow", { ms: 900 });
      expect(sink.event).toHaveBeenCalledExactlyOnceWith("boot", { port: 3000 });
    }
  });

  it("swallows a throwing sink, reports it on one line and still reaches the siblings", () => {
    const reported: string[] = [];
    const broken: Telemetry = {
      captureError: () => {
        throw new Error("sink down");
      },
      log: vi.fn(),
      event: vi.fn(),
    };
    const healthy = recordingSink();
    const composite = new CompositeTelemetry([broken, healthy], (line) => {
      reported.push(line);
    });

    expect(() => composite.captureError(new Error("terminal"))).not.toThrow();
    expect(healthy.captureError).toHaveBeenCalledOnce();
    expect(JSON.parse(reported[0])).toMatchObject({
      level: "error",
      msg: "telemetry sink failed",
      method: "captureError",
      error: { message: "sink down" },
    });
  });

  it("stays silent when the reporter itself fails, and is a no-op with no sinks", () => {
    const broken: Telemetry = {
      captureError: vi.fn(),
      log: () => {
        throw new Error("sink down");
      },
      event: vi.fn(),
    };
    const composite = new CompositeTelemetry([broken], () => {
      throw new Error("stderr closed");
    });

    expect(() => composite.log("info", "up")).not.toThrow();
    expect(() => new CompositeTelemetry([]).event("boot")).not.toThrow();
  });
});
