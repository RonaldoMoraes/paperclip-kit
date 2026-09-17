import type { LogLevel, Telemetry } from "../common/ports/telemetry";
import { describeError, redactCredentials } from "./scrub";

/** One line on stdout: the stream a log shipper reads. */
export function stdoutLine(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** One line on stderr: for what went wrong with telemetry itself, so it never hides in the log it failed to write. */
export function stderrLine(line: string): void {
  process.stderr.write(`${line}\n`);
}

export type JsonConsoleTelemetryOptions = {
  /** where a line goes; stdout by default — one stream, one line per event */
  write?: (line: string) => void;
  now?: () => Date;
};

/**
 * The sink every process has: one JSON line per call — `ts`, `level`, `msg`, then the
 * fields — so a shipper parses every line the same way and nothing depends on a DSN. A
 * captured error is described (`JSON.stringify(new Error())` is `{}`); credential-shaped
 * keys are blanked. Everything else stays: this line never leaves the machine's logs, and
 * the in-process record is where a body or a preview is allowed to be. The write never
 * throws — telemetry that can fail a request is worse than none.
 */
export class JsonConsoleTelemetry implements Telemetry {
  private readonly write: (line: string) => void;
  private readonly now: () => Date;

  constructor(options: JsonConsoleTelemetryOptions = {}) {
    this.write = options.write ?? stdoutLine;
    this.now = options.now ?? (() => new Date());
  }

  captureError(error: unknown, context?: Record<string, unknown>): void {
    this.emit("error", "error captured", { error: describeError(error), ...context });
  }

  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    this.emit(level, message, fields);
  }

  event(name: string, fields?: Record<string, unknown>): void {
    this.emit("info", "event", { event: name, ...fields });
  }

  private emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    const line = { ts: this.now().toISOString(), level, msg: message, ...redactCredentials(fields) };
    try {
      this.write(JSON.stringify(line));
    } catch {
      // A line that cannot be written (a closed stream, a value JSON refuses) is lost, not fatal.
    }
  }
}
