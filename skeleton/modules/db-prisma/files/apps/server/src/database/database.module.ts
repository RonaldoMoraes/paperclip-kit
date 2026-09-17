import { Global, Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import { PRISMA } from "./database.types";
import type { PrismaClient } from "./prisma";
import { createPrismaPool } from "./prisma-pool";
import { type Db, composePrisma } from "./scope-extension";

/** The pool itself. Private: a consumer holding it would read past the product's scope. */
const PRISMA_BASE = Symbol("PRISMA_BASE");

/**
 * The database, as one connection pool the whole process shares.
 *
 * Global because every feature module needs `PRISMA` and none of them should have to know
 * which module made it. Nothing is built at import: the client is constructed when Nest
 * instantiates the module, so importing a controller or a store in a spec opens no
 * connection and reads no env. `PRISMA` is the base with `scope-extension.ts` applied — the
 * same composition `openPrisma()` gives a script.
 */
@Global()
@Module({
  providers: [
    { provide: PRISMA_BASE, useFactory: (): PrismaClient => createPrismaPool(process.env) },
    { provide: PRISMA, inject: [PRISMA_BASE], useFactory: (base: PrismaClient): Db => composePrisma(base) },
  ],
  exports: [PRISMA],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PRISMA_BASE) private readonly base: PrismaClient) {}

  // The pool the extension wraps, closed once — the composed client is a view of this one.
  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }
}
