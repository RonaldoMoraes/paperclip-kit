/** Where the client connects when nothing says otherwise: the Postgres `docker-compose.db.yml` starts. */
const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/__DB_NAME__";

export type DatabaseConfig = {
  url: string;
};

/**
 * The only reader of `process.env` for the database.
 *
 * A missing `DATABASE_URL` is not a boot failure: a developer running the server on their
 * own machine has one at the default address, and the deploy always sets the variable. A
 * connection that cannot be made fails on the first query, where the error names the host
 * it tried. The Prisma CLI reads the same key through `db/prisma/database-url.ts`, with the
 * same default.
 */
export function loadDatabaseConfig(env: Record<string, string | undefined>): DatabaseConfig {
  return { url: env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL };
}
