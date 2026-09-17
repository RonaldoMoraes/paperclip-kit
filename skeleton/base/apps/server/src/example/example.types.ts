/**
 * Consumers depend on this token, never on the value the module built:
 * `constructor(@Inject(EXAMPLE_STORE) private readonly store: ExampleStore) {}`.
 */
export const EXAMPLE_STORE = Symbol("EXAMPLE_STORE");
