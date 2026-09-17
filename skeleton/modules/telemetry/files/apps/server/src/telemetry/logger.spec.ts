import { describe, expect, it } from "vitest";
import { JsonLogger, REDACTED, redactFields } from "./logger";
import { runWithRequestContext } from "./request-context";
import type { LogLevel } from "./telemetry.config";

const capture = (level: LogLevel = "info") => {
  const lines: Record<string, unknown>[] = [];
  const logger = new JsonLogger({
    level,
    write: (line) => {
      lines.push(JSON.parse(line));
    },
    now: () => new Date("2026-09-09T12:00:00.000Z"),
  });
  return { logger, lines };
};

describe("JsonLogger", () => {
  it("writes one JSON line: ts, level, msg, then the fields", () => {
    const { logger, lines } = capture();
    logger.info("item written", { id: "abc", done: true });
    expect(lines).toEqual([
      { ts: "2026-09-09T12:00:00.000Z", level: "info", msg: "item written", id: "abc", done: true },
    ]);
  });

  it("drops a line below the configured level and keeps the rest", () => {
    const { logger, lines } = capture("warn");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(lines.map((line) => line.level)).toEqual(["warn", "error"]);
  });

  it("attaches the request id inside a request and no key outside one", () => {
    const { logger, lines } = capture();
    logger.info("outside");
    runWithRequestContext({ requestId: "req-1", startedAt: 0 }, () => logger.info("inside"));
    expect(lines[0]).not.toHaveProperty("requestId");
    expect(lines[1]).toMatchObject({ msg: "inside", requestId: "req-1" });
  });

  it("describes an error field on the line instead of the `{}` JSON makes of it", () => {
    const { logger, lines } = capture();
    logger.error("failed", { error: new TypeError("boom") });
    expect(lines[0].error).toEqual({ name: "TypeError", message: "boom", stack: expect.stringContaining("boom") });
  });

  it("a child carries its fields on every line, and the call's own fields win", () => {
    const { logger, lines } = capture();
    const named = logger.child({ service: "example", attempt: 1 });
    named.info("start");
    named.warn("retry", { attempt: 2 });
    expect(lines[0]).toMatchObject({ service: "example", attempt: 1 });
    expect(lines[1]).toMatchObject({ service: "example", attempt: 2 });
  });

  it("never throws over a line it cannot write", () => {
    const logger = new JsonLogger({
      level: "info",
      write: () => {
        throw new Error("stream closed");
      },
    });
    expect(() => logger.info("lost")).not.toThrow();
  });
});

describe("redactFields", () => {
  it("blanks every credential-shaped key at any depth, in any casing, and keeps the key", () => {
    expect(
      redactFields({
        token: "abc",
        user: { Password: "x", name: "n" },
        headers: { Authorization: "Bearer y", cookie: "sid=1", accept: "*/*" },
        attempts: [{ clientSecret: "s", n: 1 }],
        refreshTokenHint: "t",
      })
    ).toEqual({
      token: REDACTED,
      user: { Password: REDACTED, name: "n" },
      headers: { Authorization: REDACTED, cookie: REDACTED, accept: "*/*" },
      attempts: [{ clientSecret: REDACTED, n: 1 }],
      refreshTokenHint: REDACTED,
    });
  });

  it("cuts a cycle rather than looping", () => {
    const loop: Record<string, unknown> = { name: "a" };
    loop.self = loop;
    expect(redactFields({ loop })).toEqual({ loop: { name: "a", self: "[omitted]" } });
  });
});
