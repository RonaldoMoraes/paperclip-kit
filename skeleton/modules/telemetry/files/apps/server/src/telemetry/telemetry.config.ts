/** Levels in order: a line below the configured one is dropped. */
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type OtelConfig = {
  /** `service.name` on every span */
  serviceName: string;
  /** an OTLP/HTTP collector's base URL; spans go to `<endpoint>/v1/traces`; null exports nothing */
  endpoint: string | null;
  /** print every span to the console — dev only */
  console: boolean;
};

export type TelemetryConfig = {
  logLevel: LogLevel;
  /** whether `GET /api/health` gets an access line — a load balancer's probe is noise */
  logHealth: boolean;
  otel: OtelConfig;
};

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

/** `true`/`1` and `false`/`0`, case-insensitive; anything else (unset included) is the default. */
function flag(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return fallback;
}

/**
 * The only reader of `process.env` for this domain, called inside the module's factories
 * and by the preload, so a spec that imports anything else reads none.
 *
 * Every key has a safe default: info-level logs, the health probe logged, no exporter.
 * The one thing that throws is a level nobody defined — a typo there would silently drop
 * every line below it or keep every one, and neither is what was asked for.
 */
export function loadTelemetryConfig(env: Record<string, string | undefined>): TelemetryConfig {
  const logLevel = env.LOG_LEVEL?.trim().toLowerCase() || "info";
  if (!isLogLevel(logLevel)) {
    throw new Error(`[telemetry] LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}, got "${logLevel}".`);
  }
  return {
    logLevel,
    logHealth: flag(env.LOG_HEALTH, true),
    otel: {
      serviceName: env.OTEL_SERVICE_NAME?.trim() || "__PRODUCT_SLUG__",
      endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim().replace(/\/+$/, "") || null,
      console: flag(env.OTEL_CONSOLE, false),
    },
  };
}
