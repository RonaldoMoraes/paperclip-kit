/**
 * Consumers depend on this token, never on the instance the module built:
 * `constructor(@Inject(AUTH) private readonly auth: Auth) {}`.
 */
export const AUTH = Symbol("AUTH");
