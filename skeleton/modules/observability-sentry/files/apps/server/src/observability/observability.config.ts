export type SentryConfig = {
  /** the project's DSN; null keeps Sentry off and every error on the console only */
  dsn: string | null;
  /** `environment` on every event */
  environment: string;
  /** `release` on every event; null leaves the SDK its own default */
  release: string | null;
  /** 0 sends errors only; above 0, that share of requests becomes a trace */
  tracesSampleRate: number;
};

export type ObservabilityConfig = {
  sentry: SentryConfig;
};

/** A trimmed value, or null when unset or blank — an empty `SENTRY_DSN=` line is "off", not a DSN. */
function optional(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function sampleRate(value: string | undefined): number {
  const raw = optional(value);
  if (raw === null) return 0;
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error(`[observability] SENTRY_TRACES_SAMPLE_RATE must be a number between 0 and 1, got "${raw}".`);
  }
  return rate;
}

/**
 * The only reader of `process.env` for this domain, called inside the port's factory and
 * by the preload, so a spec that imports anything else reads none.
 *
 * Every key has a safe default: no DSN (Sentry stays off), the environment `NODE_ENV`
 * names, no release pin, errors only. The one thing that throws is a sample rate that is
 * not a share — a typo there would trace everything or nothing, silently.
 */
export function loadObservabilityConfig(env: Record<string, string | undefined>): ObservabilityConfig {
  return {
    sentry: {
      dsn: optional(env.SENTRY_DSN),
      environment: optional(env.SENTRY_ENVIRONMENT) ?? optional(env.NODE_ENV) ?? "development",
      release: optional(env.SENTRY_RELEASE),
      tracesSampleRate: sampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
    },
  };
}
