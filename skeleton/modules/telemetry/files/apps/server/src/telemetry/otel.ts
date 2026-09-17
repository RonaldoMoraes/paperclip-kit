import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK, tracing } from "@opentelemetry/sdk-node";
import { type OtelConfig, loadTelemetryConfig } from "./telemetry.config";

export type OtelExporter = "otlp" | "console";

export type OtelHandle = {
  /** what spans go to; empty means the SDK was not started and every span is a no-op */
  exporters: readonly OtelExporter[];
  /** flush and stop; idempotent, never rejects */
  shutdown(): Promise<void>;
};

/**
 * The SDK for this configuration: OTLP over HTTP when an endpoint is set, the console
 * when asked, both when both, nothing otherwise — in which case nothing is registered and
 * the OpenTelemetry API stays its zero-cost no-op self. The console exporter goes through
 * a simple processor so a span prints the moment it ends; OTLP batches.
 *
 * On SIGTERM the spans still in flight are flushed. The listener is installed only when
 * nobody else listens for the signal, and after flushing it re-raises the signal only when
 * that is still true — so with Nest's shutdown hooks enabled (`app.enableShutdownHooks()`)
 * Nest owns the exit and `TelemetryModule.beforeApplicationShutdown` does the flushing.
 */
export function createOtel(config: OtelConfig): OtelHandle {
  const exporters: OtelExporter[] = [];
  const spanProcessors: tracing.SpanProcessor[] = [];
  if (config.endpoint !== null) {
    exporters.push("otlp");
    spanProcessors.push(new tracing.BatchSpanProcessor(new OTLPTraceExporter({ url: `${config.endpoint}/v1/traces` })));
  }
  if (config.console) {
    exporters.push("console");
    spanProcessors.push(new tracing.SimpleSpanProcessor(new tracing.ConsoleSpanExporter()));
  }
  if (spanProcessors.length === 0) return { exporters, shutdown: async () => {} };

  const sdk = new NodeSDK({ serviceName: config.serviceName, spanProcessors });
  sdk.start();

  let closing: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    if (closing === undefined) closing = flush();
    return closing;
  };
  async function flush(): Promise<void> {
    process.removeListener("SIGTERM", onSigterm);
    try {
      await sdk.shutdown();
    } catch {
      // An exporter that cannot flush on the way out loses its last batch; the process still stops.
    }
  }
  async function onSigterm(): Promise<void> {
    const othersListening = process.listenerCount("SIGTERM") > 0;
    await shutdown();
    if (!othersListening) process.kill(process.pid, "SIGTERM");
  }
  if (process.listenerCount("SIGTERM") === 0) process.once("SIGTERM", onSigterm);

  return { exporters, shutdown };
}

/**
 * The one SDK of this process, kept in the global symbol registry rather than in module
 * scope: the optional preload (`preload.ts`) is compiled and loaded apart from the
 * bundle, and both copies of this file must agree that it already started.
 */
const HANDLE = Symbol.for("telemetry.otel.handle");
type Registry = { [HANDLE]?: OtelHandle };

/** Start the SDK for `env` once; a second call — the module after the preload — gets the same handle. */
export function startOtel(env: Record<string, string | undefined>): OtelHandle {
  const registry = globalThis as Registry;
  const existing = registry[HANDLE];
  if (existing !== undefined) return existing;
  const handle = createOtel(loadTelemetryConfig(env).otel);
  registry[HANDLE] = handle;
  return handle;
}
