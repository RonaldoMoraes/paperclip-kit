import type { LogLevel, Telemetry } from "../common/ports/telemetry";
import { stderrLine } from "./console-telemetry";
import { describeError } from "./scrub";

/**
 * Fans every call out to a list of sinks, in order. Adding a sink is one entry in the
 * provider's list — nothing that calls the port changes.
 *
 * A sink honours the port contract (never throws), but the composite stays defensive: one
 * broken sink must never starve its siblings or leak an exception into a request. A
 * failure is one line on stderr, written through a reporter that is itself guarded — the
 * end of the line is silence, never a throw.
 */
export class CompositeTelemetry implements Telemetry {
  constructor(
    readonly sinks: readonly Telemetry[],
    private readonly report: (line: string) => void = stderrLine
  ) {}

  captureError(error: unknown, context?: Record<string, unknown>): void {
    this.fanOut("captureError", (sink) => sink.captureError(error, context));
  }

  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    this.fanOut("log", (sink) => sink.log(level, message, fields));
  }

  event(name: string, fields?: Record<string, unknown>): void {
    this.fanOut("event", (sink) => sink.event(name, fields));
  }

  private fanOut(method: keyof Telemetry, emit: (sink: Telemetry) => void): void {
    for (const sink of this.sinks) {
      try {
        emit(sink);
      } catch (error) {
        this.reportFailure(method, sink, error);
      }
    }
  }

  private reportFailure(method: keyof Telemetry, sink: Telemetry, error: unknown): void {
    try {
      this.report(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          msg: "telemetry sink failed",
          method,
          sink: sink.constructor.name,
          error: describeError(error),
        })
      );
    } catch {
      // A reporter that fails has nowhere left to say so.
    }
  }
}
