import * as Sentry from "@sentry/nestjs";
import type { LogLevel, Telemetry } from "../common/ports/telemetry";
import { stderrLine } from "./console-telemetry";
import { describeError, scrubForSentry } from "./scrub";

/** Sentry indexes a tag up to this many characters; a longer value is cut, not refused. */
const TAG_MAX = 200;

export type SentryContext = { tags: Record<string, string>; extra: Record<string, unknown> };

/**
 * A context as Sentry takes it: the scalars become tags (searchable — a mechanism, a
 * route, a request id), the rest extras. Both pass through `scrubForSentry` first, so a
 * body, a preview or a credential never reaches the SDK under any key, at any depth.
 */
export function toSentryContext(context: Record<string, unknown> | undefined): SentryContext {
  const tags: Record<string, string> = {};
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(scrubForSentry(context))) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      tags[key] = String(value).slice(0, TAG_MAX);
    } else {
      extra[key] = value;
    }
  }
  return { tags, extra };
}

/**
 * The sink that leaves the process, and therefore hears errors only: `captureError`, and
 * a `log` at the `error` level. An event and every other level stay with the console sink —
 * Sentry is where a failure is triaged, not where a count is kept.
 *
 * The SDK is called with the context inline rather than through `withScope`: this sink
 * must work whether or not Sentry's OpenTelemetry context manager is installed (it is not
 * in the errors-only default, see `sentry.ts`), and inline context needs none. Honours the
 * port contract — synchronous, never throws: every SDK call is guarded, and a failing SDK
 * is one line on stderr. Sending is the SDK's own background concern.
 */
export class SentryTelemetry implements Telemetry {
  constructor(private readonly report: (line: string) => void = stderrLine) {}

  captureError(error: unknown, context?: Record<string, unknown>): void {
    this.guard("captureException", () => {
      Sentry.captureException(error, toSentryContext(context));
    });
  }

  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (level !== "error") return;
    this.guard("captureMessage", () => {
      Sentry.captureMessage(message, { level: "error", ...toSentryContext(fields) });
    });
  }

  event(): void {}

  private guard(call: string, send: () => void): void {
    try {
      send();
    } catch (error) {
      try {
        this.report(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: "error",
            msg: "sentry sink failed",
            call,
            error: describeError(error),
          })
        );
      } catch {
        // Nowhere left to say so.
      }
    }
  }
}
