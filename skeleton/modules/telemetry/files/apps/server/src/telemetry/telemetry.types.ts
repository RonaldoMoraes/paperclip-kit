/**
 * Consumers depend on this token, never on the value the module built:
 * `constructor(@Inject(TELEMETRY_CONFIG) private readonly config: TelemetryConfig) {}`.
 * The logger's own token is `LOGGER`, beside its interface in `logger.ts`.
 */
export const TELEMETRY_CONFIG = Symbol("TELEMETRY_CONFIG");
