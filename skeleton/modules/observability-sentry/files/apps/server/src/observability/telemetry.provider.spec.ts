import * as Sentry from "@sentry/nestjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonConsoleTelemetry } from "./console-telemetry";
import type { ObservabilityConfig } from "./observability.config";
import { SentryTelemetry } from "./sentry-telemetry";
import { TelemetryProvider, createTelemetry } from "./telemetry.provider";

vi.mock("@sentry/nestjs", () => ({
  init: vi.fn(),
  isInitialized: vi.fn(() => false),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const off: ObservabilityConfig = {
  sentry: { dsn: null, environment: "development", release: null, tracesSampleRate: 0 },
};
const on: ObservabilityConfig = {
  sentry: { dsn: "https://key@o0.ingest.sentry.io/1", environment: "production", release: null, tracesSampleRate: 0 },
};

const recording = () => {
  const lines: string[] = [];
  return {
    write: (line: string) => {
      lines.push(line);
    },
    lines,
  };
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("createTelemetry", () => {
  it("is the console sink alone without a DSN, and never touches the SDK", () => {
    const { write, lines } = recording();

    const telemetry = createTelemetry(off, { write });
    telemetry.captureError(new Error("terminal"), { path: "/api/x" });

    expect(telemetry.sinks).toHaveLength(1);
    expect(telemetry.sinks[0]).toBeInstanceOf(JsonConsoleTelemetry);
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(JSON.parse(lines[0])).toMatchObject({ msg: "[observability] ready", sinks: ["console"] });
    expect(JSON.parse(lines[1])).toMatchObject({ level: "error", msg: "error captured", path: "/api/x" });
  });

  it("adds the Sentry sink after the console one, and starts the SDK once, with a DSN", () => {
    const { write, lines } = recording();

    const telemetry = createTelemetry(on, { write });
    telemetry.captureError(new Error("terminal"), { path: "/api/x" });

    expect(telemetry.sinks.map((sink) => sink.constructor)).toEqual([JsonConsoleTelemetry, SentryTelemetry]);
    expect(Sentry.init).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ dsn: on.sentry.dsn }));
    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(JSON.parse(lines[0])).toMatchObject({ sinks: ["console", "sentry"], environment: "production" });
  });
});

describe("TelemetryProvider", () => {
  it("binds the base token through a factory that reads env only when called", () => {
    expect(TelemetryProvider).toMatchObject({ provide: expect.any(Symbol), useFactory: expect.any(Function) });
    expect(Sentry.init).not.toHaveBeenCalled();
  });
});
