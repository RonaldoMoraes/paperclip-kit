import { describe, expect, it } from "vitest";
import { JsonConsoleTelemetry } from "./console-telemetry";

const recording = () => {
  const lines: string[] = [];
  const telemetry = new JsonConsoleTelemetry({
    write: (line) => {
      lines.push(line);
    },
    now: () => new Date("2026-09-09T12:00:00.000Z"),
  });
  return { telemetry, lines, parsed: () => lines.map((line) => JSON.parse(line)) };
};

describe("JsonConsoleTelemetry", () => {
  it("writes one JSON line per call with the timestamp, the level and the message first", () => {
    const { telemetry, parsed } = recording();

    telemetry.log("info", "up", { port: 3000 });
    telemetry.event("boot", { slot: 1 });
    telemetry.captureError(new RangeError("out"), { path: "/api/x" });

    expect(parsed()).toEqual([
      { ts: "2026-09-09T12:00:00.000Z", level: "info", msg: "up", port: 3000 },
      { ts: "2026-09-09T12:00:00.000Z", level: "info", msg: "event", event: "boot", slot: 1 },
      {
        ts: "2026-09-09T12:00:00.000Z",
        level: "error",
        msg: "error captured",
        error: { name: "RangeError", message: "out", stack: expect.stringContaining("RangeError: out") },
        path: "/api/x",
      },
    ]);
  });

  it("blanks a credential-shaped field and keeps the rest — this line stays on the machine", () => {
    const { telemetry, parsed } = recording();

    telemetry.log("warn", "refused", { authorization: "Bearer x", body: { note: "kept here" } });

    expect(parsed()[0]).toMatchObject({ authorization: "[redacted]", body: { note: "kept here" } });
  });

  it("never throws: a value JSON refuses and a stream that is closed are both swallowed", () => {
    const telemetry = new JsonConsoleTelemetry({
      write: () => {
        throw new Error("EPIPE");
      },
    });

    expect(() => telemetry.log("info", "up")).not.toThrow();
    expect(() => new JsonConsoleTelemetry().log("info", "big", { n: BigInt(1) })).not.toThrow();
  });
});
