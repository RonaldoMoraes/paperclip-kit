// Deliberately violates biome/db-seam.grit: the database package imported from a feature
// directory instead of through the seam. Multi-specifier on purpose — that is the clause
// shape a snippet pattern silently lets through.
// Copied into the lint path and linted by scripts/check-lint-guards.mjs; this
// directory is excluded from the normal lint in biome.json.
import { Prisma, PrismaClient } from "@__SCOPE__/db/generated/prisma/client";

export const canary = [Prisma, PrismaClient];
