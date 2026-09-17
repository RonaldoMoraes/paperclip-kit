/**
 * Consumers depend on this token, never on the client the module built:
 * `constructor(@Inject(PRISMA) private readonly db: ExampleDb) {}` — typed as the structural
 * slice the consumer reads (`example.store.prisma.ts` is the reference), not as the whole
 * client, so its spec stubs the slice and needs no database.
 */
export const PRISMA = Symbol("PRISMA");
