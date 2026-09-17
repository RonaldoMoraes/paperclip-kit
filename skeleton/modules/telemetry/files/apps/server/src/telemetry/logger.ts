import { trace } from "@opentelemetry/api";
import { currentRequestId } from "./request-context";
import { LOG_LEVELS, type LogLevel } from "./telemetry.config";

/** What a feature injects: `constructor(@Inject(LOGGER) private readonly logger: Logger) {}`. */
export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  /** the same logger with `fields` on every line — a service names itself once, not per call */
  child(fields: Record<string, unknown>): Logger;
}

export const LOGGER = Symbol("LOGGER");

/** A key whose value is a credential, whatever the casing: the value is replaced, the key kept. */
export const REDACTED_KEY = /secret|token|password|authorization|cookie/i;
export const REDACTED = "[redacted]";
const MAX_DEPTH = 8;

/** What a thrown value looks like on one line — `JSON.stringify(new Error())` is `{}`. */
function describeError(error: Error): Record<string, unknown> {
  return { name: error.name, message: error.message, stack: error.stack };
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value instanceof Error) return redactValue(describeError(value), depth, seen);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH || seen.has(value)) return "[omitted]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = REDACTED_KEY.test(key) ? REDACTED : redactValue(item, depth + 1, seen);
  }
  return out;
}

/**
 * `fields` with every credential-shaped key blanked, at any depth, errors described and
 * cycles cut. Redaction is by key, not by value: a value that looks harmless under a key
 * called `token` is still a token, and a line is read long after anyone remembers it.
 */
export function redactFields(fields: Record<string, unknown>): Record<string, unknown> {
  return redactValue(fields, 0, new WeakSet()) as Record<string, unknown>;
}

export type JsonLoggerOptions = {
  level: LogLevel;
  /** where a line goes; stdout by default — one stream, one line per event */
  write?: (line: string) => void;
  now?: () => Date;
  /** fields on every line, from `child()` */
  bound?: Record<string, unknown>;
};

/**
 * One JSON line per event: `ts`, `level`, `msg`, the request id when there is one, the
 * trace and span ids when a span is recording, then the caller's fields — so a shipper
 * parses every line the same way and a request's lines are found by one id. Below the
 * configured level a call costs one comparison. The write itself never throws: a logger
 * that can fail a request is worse than none.
 */
export class JsonLogger implements Logger {
  private readonly threshold: number;
  private readonly write: (line: string) => void;
  private readonly now: () => Date;
  private readonly bound: Record<string, unknown>;

  constructor(private readonly options: JsonLoggerOptions) {
    this.threshold = LOG_LEVELS.indexOf(options.level);
    this.write = options.write ?? ((line) => process.stdout.write(`${line}\n`));
    this.now = options.now ?? (() => new Date());
    this.bound = options.bound ?? {};
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.emit("debug", message, fields);
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.emit("info", message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.emit("warn", message, fields);
  }

  error(message: string, fields?: Record<string, unknown>): void {
    this.emit("error", message, fields);
  }

  child(fields: Record<string, unknown>): Logger {
    return new JsonLogger({ ...this.options, bound: { ...this.bound, ...fields } });
  }

  private emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LOG_LEVELS.indexOf(level) < this.threshold) return;
    const span = trace.getActiveSpan();
    const spanContext = span?.isRecording() ? span.spanContext() : undefined;
    const line = {
      ts: this.now().toISOString(),
      level,
      msg: message,
      requestId: currentRequestId(),
      traceId: spanContext?.traceId,
      spanId: spanContext?.spanId,
      ...redactFields({ ...this.bound, ...fields }),
    };
    try {
      this.write(JSON.stringify(line));
    } catch {
      // A line that cannot be written (a closed stream, a value JSON refuses) is lost, not fatal.
    }
  }
}
