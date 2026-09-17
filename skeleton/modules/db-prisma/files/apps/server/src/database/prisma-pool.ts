import { PrismaPg } from "@prisma/adapter-pg";
import { loadDatabaseConfig } from "./database.config";
import { PrismaClient } from "./prisma";
import { type Db, composePrisma } from "./scope-extension";

/**
 * The one pool a process opens. Built only in this directory (`biome/prisma-pool-boundary.grit`):
 * a second pool is a second set of connections the database counts against the same limit,
 * and a client built outside `composePrisma` carries none of the product's scope. Nothing
 * connects here — the first query does, and a wrong URL fails there, naming the host it tried.
 */
export function createPrismaPool(env: Record<string, string | undefined> = process.env): PrismaClient {
  const adapter = new PrismaPg({ connectionString: loadDatabaseConfig(env).url });
  return new PrismaClient({ adapter });
}

/**
 * The composed client for a script outside Nest — a backfill, a REPL, a one-off report — and
 * the close that returns its pool. Always `await close()` in a `finally`: an open pool keeps
 * the process alive after the script is done.
 */
export function openPrisma(env: Record<string, string | undefined> = process.env): {
  prisma: Db;
  close: () => Promise<void>;
} {
  const base = createPrismaPool(env);
  return { prisma: composePrisma(base), close: () => base.$disconnect() };
}
