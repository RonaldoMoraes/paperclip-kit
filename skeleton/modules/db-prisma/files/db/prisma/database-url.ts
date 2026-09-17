import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/**
 * The connection string, for the Prisma CLI and the seed alike.
 *
 * The product's `.env` sits at the repo root, one directory up: the CLI runs from `db/`
 * (`yarn --cwd db …`), so a bare `dotenv/config` would look in the wrong place. A value
 * already in the environment wins — `wt run --db` exports the worktree's own database that
 * way — and the default is the local Postgres `docker-compose.db.yml` starts. The server has
 * its own reader (`apps/server/src/database/database.config.ts`); the two defaults name the
 * same database.
 */
export function databaseUrl(): string {
  config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });
  return process.env.DATABASE_URL?.trim() || "postgresql://postgres:postgres@localhost:5432/__DB_NAME__";
}
