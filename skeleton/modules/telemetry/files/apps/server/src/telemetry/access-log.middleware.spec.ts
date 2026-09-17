import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { AccessLogMiddleware } from "./access-log.middleware";
import type { Logger } from "./logger";
import { runWithRequestContext } from "./request-context";
import type { TelemetryConfig } from "./telemetry.config";

const config = (logHealth: boolean): TelemetryConfig => ({
  logLevel: "info",
  logHealth,
  otel: { serviceName: "spec", endpoint: null, console: false },
});

const capture = () => {
  const lines: Array<{ msg: string; fields?: Record<string, unknown> }> = [];
  const logger: Logger = {
    debug: vi.fn(),
    info: (msg, fields) => {
      lines.push({ msg, fields });
    },
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger,
  };
  return { logger, lines };
};

const answer = () => Object.assign(new EventEmitter(), { statusCode: 200 });

const serve = (logHealth: boolean, method: string, originalUrl: string, requestId = "req-1") => {
  const { logger, lines } = capture();
  const res = answer();
  const next = vi.fn();
  runWithRequestContext({ requestId, startedAt: 0 }, () =>
    new AccessLogMiddleware(logger, config(logHealth)).use({ method, originalUrl }, res, next)
  );
  return { res, next, lines };
};

describe("AccessLogMiddleware", () => {
  it("writes one line when the answer is out: method, path without the query, status, ms, request id", () => {
    const { res, next, lines } = serve(true, "POST", "/api/example/items?token=abc");
    expect(next).toHaveBeenCalledOnce();
    expect(lines).toEqual([]);

    res.statusCode = 201;
    res.emit("finish");
    res.emit("close");

    expect(lines).toEqual([
      {
        msg: "request",
        fields: { method: "POST", path: "/api/example/items", status: 201, ms: expect.any(Number), requestId: "req-1" },
      },
    ]);
  });

  it("marks a request whose socket closed before the answer went out", () => {
    const { res, lines } = serve(true, "GET", "/api/example/items");
    res.emit("close");
    expect(lines[0].fields).toMatchObject({ status: 200, aborted: true });
  });

  it("keeps GET /api/health out of the log when asked, and nothing else", () => {
    const probe = serve(false, "GET", "/api/health");
    probe.res.emit("finish");
    expect(probe.next).toHaveBeenCalledOnce();
    expect(probe.lines).toEqual([]);

    const other = serve(false, "GET", "/api/example/items");
    other.res.emit("finish");
    expect(other.lines).toHaveLength(1);

    const logged = serve(true, "GET", "/api/health");
    logged.res.emit("finish");
    expect(logged.lines[0].fields).toMatchObject({ path: "/api/health" });
  });
});
