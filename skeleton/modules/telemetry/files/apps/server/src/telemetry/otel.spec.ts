import { trace } from "@opentelemetry/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOtel, startOtel } from "./otel";

const nowhere = { serviceName: "spec", endpoint: null, console: false };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createOtel", () => {
  it("starts nothing when there is nowhere to export, and shutting down is a no-op", async () => {
    const listeners = process.listenerCount("SIGTERM");
    const otel = createOtel(nowhere);
    expect(otel.exporters).toEqual([]);
    expect(process.listenerCount("SIGTERM")).toBe(listeners);
    await expect(otel.shutdown()).resolves.toBeUndefined();
  });

  it("names the exporter it started, records spans, flushes on SIGTERM and lets go of the signal on shutdown", async () => {
    const printed = vi.spyOn(console, "dir").mockImplementation(() => {});
    const listeners = process.listenerCount("SIGTERM");

    const otel = createOtel({ ...nowhere, console: true });
    expect(otel.exporters).toEqual(["console"]);
    expect(process.listenerCount("SIGTERM")).toBe(listeners + 1);

    const span = trace.getTracer("spec").startSpan("probe");
    expect(span.isRecording()).toBe(true);
    span.end();
    // The print waits for the resource detectors the SDK runs at start; it is not synchronous with `end()`.
    await vi.waitFor(() => {
      expect(printed).toHaveBeenCalledWith(expect.objectContaining({ name: "probe" }), expect.anything());
    });

    await otel.shutdown();
    await expect(otel.shutdown()).resolves.toBeUndefined();
    expect(process.listenerCount("SIGTERM")).toBe(listeners);
  });
});

describe("startOtel", () => {
  it("starts once per process: the module after the preload gets the handle the preload made", () => {
    const first = startOtel({});
    expect(startOtel({ OTEL_CONSOLE: "true" })).toBe(first);
  });
});
