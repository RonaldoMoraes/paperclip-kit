import type { Provider } from "@nestjs/common";
import { TELEMETRY, type Telemetry } from "../common/ports/telemetry";
import { CompositeTelemetry } from "./composite-telemetry";
import { JsonConsoleTelemetry } from "./console-telemetry";
import { type ObservabilityConfig, loadObservabilityConfig } from "./observability.config";
import { startSentry } from "./sentry";
import { SentryTelemetry } from "./sentry-telemetry";

export type CreateTelemetryOptions = {
  /** where the console sink's lines go; stdout by default */
  write?: (line: string) => void;
};

/**
 * The telemetry a config describes: the console sink always, and the Sentry sink beside
 * it once a DSN is set — in that order, so the machine's own log has the line before
 * anything leaves. Sentry is started here, inside the factory, when the preload did not
 * start it first. Says so once through the port itself, so a boot log always states
 * whether this process ships errors anywhere.
 */
export function createTelemetry(config: ObservabilityConfig, options: CreateTelemetryOptions = {}): CompositeTelemetry {
  const sinks: Telemetry[] = [new JsonConsoleTelemetry({ write: options.write })];
  const names = ["console"];
  if (startSentry(config.sentry)) {
    sinks.push(new SentryTelemetry());
    names.push("sentry");
  }
  const telemetry = new CompositeTelemetry(sinks);
  telemetry.log("info", "[observability] ready", {
    sinks: names,
    environment: config.sentry.environment,
    tracesSampleRate: config.sentry.tracesSampleRate,
  });
  return telemetry;
}

/**
 * The port's provider, bound by the global `PortsModule` from `KIT_PORTS` in place of the
 * console default. Env is read inside the factory, so importing this file reads none, and
 * a malformed sample rate fails at boot — before a request could reach a sink.
 */
export const TelemetryProvider: Provider = {
  provide: TELEMETRY,
  useFactory: (): Telemetry => createTelemetry(loadObservabilityConfig(process.env)),
};
