/**
 * Consumers depend on this token, never on the value the module built:
 * `constructor(@Inject(HEALTH_CONFIG) private readonly config: HealthConfig) {}`.
 */
export const HEALTH_CONFIG = Symbol("HEALTH_CONFIG");
