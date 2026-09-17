// Deliberate violation for the lint-guard canary: a value laundered past the type checker.
export const laundered = {} as unknown as { id: number };
