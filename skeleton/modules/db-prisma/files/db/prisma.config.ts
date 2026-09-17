import { defineConfig } from "prisma/config";
import { databaseUrl } from "./prisma/database-url";

/**
 * What the Prisma CLI reads: where the schema is, where migrations go, how to seed, and
 * the connection string. Prisma 7 takes the URL from here and never from the schema, so the
 * datasource block in `prisma/schema/base.prisma` names only the provider.
 *
 * `schema` is a directory: every `*.prisma` in it is part of one schema, which is how a
 * module ships its models as `prisma/schema/<module>.prisma` beside `base.prisma` without
 * editing it. Paths are relative to this file.
 */
export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl(),
  },
});
