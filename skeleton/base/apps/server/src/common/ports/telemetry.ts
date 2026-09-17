import type { Provider } from "@nestjs/common";

/**
 * The telemetry port: where an error, a log line or an operational event goes. Base binds
 * the console sink; `observability-sentry` and `telemetry` replace it through `KIT_PORTS`.
 * Consumers inject `TELEMETRY`, never a class. Every method is synchronous and never
 * throws — telemetry that can fail a request is worse than none.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Telemetry {
  /** a failure nobody described — the filter's unexpected errors, a background job's rejection */
  captureError(error: unknown, context?: Record<string, unknown>): void;
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void;
  /** something that happened and is worth counting — not an error, not a log line to read */
  event(name: string, fields?: Record<string, unknown>): void;
}

export const TELEMETRY = Symbol("TELEMETRY");

/** What a thrown value looks like on one line, whatever it was. */
function describe(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { name: "NonError", message: String(error) };
}

/** The default: structured console lines. `console.*` is the one call that cannot throw here. */
export class ConsoleTelemetry implements Telemetry {
  captureError(error: unknown, context?: Record<string, unknown>): void {
    console.error("[telemetry] error", { ...describe(error), ...context });
  }

  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    const line = { message, ...fields };
    if (level === "error") console.error("[telemetry]", line);
    else if (level === "warn") console.warn("[telemetry]", line);
    else console.log("[telemetry]", line);
  }

  event(name: string, fields?: Record<string, unknown>): void {
    console.log("[telemetry] event", { name, ...fields });
  }
}

/** Null object for specs that inject the port and assert nothing about it. */
export const noopTelemetry: Telemetry = { captureError() {}, log() {}, event() {} };

export const TelemetryConsoleProvider: Provider = {
  provide: TELEMETRY,
  useFactory: (): Telemetry => new ConsoleTelemetry(),
};
